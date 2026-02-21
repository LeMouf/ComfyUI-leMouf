"""Repo-local media cache for loop/composition manual resources."""

from __future__ import annotations

import os
import re
import shutil
import threading
from hashlib import sha256
from typing import Any, Dict, Optional


_SAFE_TOKEN_RE = re.compile(r"[^a-zA-Z0-9._:-]+")
_SAFE_FILE_RE = re.compile(r"[^a-zA-Z0-9._-]+")
_SAFE_FILE_ID_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def _sanitize_loop_token(value: Any, fallback: str = "default") -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    cleaned = _SAFE_TOKEN_RE.sub("_", text).strip("._-")
    if not cleaned:
        return fallback
    return cleaned[:96]


def _sanitize_file_name(value: Any, fallback: str = "resource.bin") -> str:
    raw = str(value or "").strip()
    name = os.path.basename(raw)
    if not name:
        name = fallback
    cleaned = _SAFE_FILE_RE.sub("_", name).strip("._-")
    if not cleaned:
        cleaned = fallback
    if "." not in cleaned:
        cleaned = f"{cleaned}.bin"
    return cleaned[:140]


def _sanitize_file_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    cleaned = _SAFE_FILE_ID_RE.sub("_", text).strip("._-")
    return cleaned[:180]


class LoopMediaCacheStore:
    """Thread-safe file cache keyed by loop_id + deterministic file_id."""

    def __init__(self, path: str, max_files_per_loop: int = 512, max_file_bytes: int = 512 * 1024 * 1024) -> None:
        self._path = os.path.realpath(path)
        self._max_files_per_loop = max(1, int(max_files_per_loop or 1))
        self._max_file_bytes = max(1, int(max_file_bytes or 1))
        self._lock = threading.Lock()

    @property
    def max_file_bytes(self) -> int:
        return self._max_file_bytes

    def _loop_dir(self, loop_id: Any) -> str:
        loop_token = _sanitize_loop_token(loop_id)
        return os.path.join(self._path, loop_token)

    def _clear_marker_path(self, loop_dir: str) -> str:
        return os.path.join(loop_dir, ".cleared")

    def _persist_file_atomic(self, path: str, data: bytes) -> None:
        # Keep write path simple and ACL-resilient on Windows custom-node workspaces.
        # This cache is ephemeral and can tolerate non-atomic writes.
        with open(path, "wb") as fh:
            fh.write(data)

    def _prune_loop_locked(self, loop_dir: str) -> None:
        try:
            entries = []
            for name in os.listdir(loop_dir):
                file_path = os.path.join(loop_dir, name)
                if not os.path.isfile(file_path):
                    continue
                try:
                    st = os.stat(file_path)
                except Exception:
                    continue
                entries.append((float(st.st_mtime), str(name)))
            if len(entries) <= self._max_files_per_loop:
                return
            entries.sort(reverse=True)
            for _, name in entries[self._max_files_per_loop :]:
                try:
                    os.remove(os.path.join(loop_dir, name))
                except Exception:
                    pass
        except Exception:
            return

    def store(self, loop_id: Any, filename: Any, content_type: Any, data: bytes) -> Optional[Dict[str, Any]]:
        if not isinstance(data, (bytes, bytearray)):
            return None
        payload = bytes(data)
        if not payload or len(payload) > self._max_file_bytes:
            return None
        safe_loop_id = _sanitize_loop_token(loop_id)
        safe_name = _sanitize_file_name(filename)
        mime = str(content_type or "").strip()
        digest = sha256(payload).hexdigest()
        file_id = f"{digest[:16]}_{safe_name}"
        loop_dir = self._loop_dir(safe_loop_id)
        marker_path = self._clear_marker_path(loop_dir)
        path = os.path.join(loop_dir, file_id)
        with self._lock:
            os.makedirs(loop_dir, exist_ok=True)
            if os.path.isfile(marker_path):
                try:
                    os.remove(marker_path)
                except Exception:
                    pass
            if not os.path.isfile(path):
                self._persist_file_atomic(path, payload)
            self._prune_loop_locked(loop_dir)
        return {
            "loop_id": safe_loop_id,
            "file_id": file_id,
            "filename": safe_name,
            "size": len(payload),
            "mime": mime,
            "sha256": digest,
        }

    def resolve(self, loop_id: Any, file_id: Any) -> Optional[str]:
        safe_loop_id = _sanitize_loop_token(loop_id)
        safe_file_id = _sanitize_file_id(file_id)
        if not safe_file_id:
            return None
        loop_dir = self._loop_dir(safe_loop_id)
        if os.path.isfile(self._clear_marker_path(loop_dir)):
            return None
        candidate = os.path.realpath(os.path.join(loop_dir, safe_file_id))
        loop_root = os.path.realpath(loop_dir)
        if not candidate.startswith(loop_root):
            return None
        if not os.path.isfile(candidate):
            return None
        return candidate

    def clear_loop(self, loop_id: Any) -> bool:
        loop_dir = self._loop_dir(loop_id)
        with self._lock:
            if not os.path.isdir(loop_dir):
                return False
            def _on_rm_error(func, path, _exc):
                try:
                    os.chmod(path, 0o666)
                    func(path)
                except Exception:
                    pass
            try:
                shutil.rmtree(loop_dir, ignore_errors=False, onerror=_on_rm_error)
            except Exception:
                try:
                    shutil.rmtree(loop_dir, ignore_errors=True, onerror=_on_rm_error)
                except Exception:
                    pass
            if not os.path.isdir(loop_dir):
                return True
            marker = self._clear_marker_path(loop_dir)
            try:
                with open(marker, "w", encoding="utf-8") as fh:
                    fh.write("cleared\n")
                return True
            except Exception:
                return False
