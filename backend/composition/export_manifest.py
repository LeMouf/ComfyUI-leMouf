"""Repo-local persisted render manifest store for composition exports."""

from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from typing import Any, Dict, Optional


_SAFE_SCOPE_RE = re.compile(r"[^a-z0-9_-]+", re.IGNORECASE)
_SCHEMA_PREFIX = "lemouf.composition.render_manifest."


def _safe_scope(value: str) -> str:
    text = str(value or "").strip().lower()
    text = _SAFE_SCOPE_RE.sub("_", text).strip("_")
    return text or "default"


def _json_clone(value: Any, fallback: Any) -> Any:
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return fallback


def _to_positive_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except Exception:
        return float(fallback)
    if number <= 0:
        return float(fallback)
    if number != number:  # NaN
        return float(fallback)
    if number == float("inf") or number == float("-inf"):
        return float(fallback)
    return float(number)


def _to_positive_int(value: Any, fallback: int) -> int:
    number = int(round(_to_positive_float(value, float(fallback))))
    return max(1, number)


def _normalize_manifest(manifest: Dict[str, Any], scope_key: str) -> Optional[Dict[str, Any]]:
    if not isinstance(manifest, dict):
        return None
    schema = str(manifest.get("schema") or "").strip()
    if not schema.startswith(_SCHEMA_PREFIX):
        return None
    output = manifest.get("output")
    if not isinstance(output, dict):
        return None
    timeline = manifest.get("timeline")
    if timeline is not None and not isinstance(timeline, dict):
        return None

    cloned = _json_clone(manifest, None)
    if not isinstance(cloned, dict):
        return None

    normalized_output = dict(cloned.get("output") or {})
    normalized_output["width"] = _to_positive_int(normalized_output.get("width"), 1920)
    normalized_output["height"] = _to_positive_int(normalized_output.get("height"), 1080)
    normalized_output["fps"] = _to_positive_float(normalized_output.get("fps"), 30.0)
    normalized_output["durationSec"] = _to_positive_float(normalized_output.get("durationSec"), 0.1)
    normalized_output["audioRate"] = _to_positive_int(normalized_output.get("audioRate"), 48000)
    normalized_output["audioChannels"] = (
        "mono" if str(normalized_output.get("audioChannels") or "").strip().lower() == "mono" else "stereo"
    )
    normalized_output["codec"] = (
        "vp9_webm" if str(normalized_output.get("codec") or "").strip().lower() == "vp9_webm" else "h264_mp4"
    )

    cloned["schema"] = schema
    cloned["scopeKey"] = _safe_scope(scope_key)
    cloned["generatedAt"] = str(cloned.get("generatedAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    cloned["output"] = normalized_output
    return cloned


class CompositionRenderManifestStore:
    """Thread-safe local file store for composition render manifests."""

    def __init__(self, path: str, max_files_per_scope: int = 200) -> None:
        self._path = os.path.realpath(path)
        self._max_files_per_scope = max(10, int(max_files_per_scope or 200))
        self._lock = threading.Lock()

    @property
    def path(self) -> str:
        return self._path

    def _scope_dir(self, scope_key: str) -> str:
        return os.path.join(self._path, _safe_scope(scope_key))

    def _prune_scope_locked(self, scope_dir: str) -> None:
        if not os.path.isdir(scope_dir):
            return
        files = []
        for name in os.listdir(scope_dir):
            full = os.path.join(scope_dir, name)
            if not os.path.isfile(full) or not name.lower().endswith(".json"):
                continue
            try:
                mtime = os.path.getmtime(full)
            except Exception:
                mtime = 0.0
            files.append((mtime, name, full))
        if len(files) <= self._max_files_per_scope:
            return
        files.sort(key=lambda row: (row[0], row[1]), reverse=True)
        for _, _, full in files[self._max_files_per_scope :]:
            try:
                os.remove(full)
            except Exception:
                pass

    def save(self, *, scope_key: str, manifest: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        normalized = _normalize_manifest(manifest, scope_key)
        if not isinstance(normalized, dict):
            return None
        safe_scope = _safe_scope(scope_key)
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        nonce = uuid.uuid4().hex[:8]
        file_name = f"render_manifest_{safe_scope}_{stamp}_{nonce}.json"
        scope_dir = self._scope_dir(safe_scope)
        full_path = os.path.join(scope_dir, file_name)
        os.makedirs(scope_dir, exist_ok=True)
        with self._lock:
            try:
                with open(full_path, "w", encoding="utf-8") as fh:
                    json.dump(normalized, fh, ensure_ascii=True, sort_keys=True, indent=2)
            except Exception:
                return None
            self._prune_scope_locked(scope_dir)
        return {
            "scope_key": safe_scope,
            "file_name": file_name,
            "path": full_path,
            "schema": str(normalized.get("schema") or ""),
            "saved_at": time.time(),
        }

    def resolve(self, *, scope_key: str, file_name: str) -> Optional[str]:
        safe_scope = _safe_scope(scope_key)
        safe_name = os.path.basename(str(file_name or "").strip())
        if not safe_name or safe_name != str(file_name or "").strip():
            return None
        if not safe_name.lower().endswith(".json"):
            return None
        full_path = os.path.realpath(os.path.join(self._scope_dir(safe_scope), safe_name))
        if not full_path.startswith(os.path.realpath(self._scope_dir(safe_scope)) + os.sep):
            return None
        if not os.path.isfile(full_path):
            return None
        return full_path
