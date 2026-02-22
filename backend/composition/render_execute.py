"""Composition render execution service (codec/container backend path)."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Any, Dict, List, Optional


_SAFE_SCOPE_RE = re.compile(r"[^a-z0-9_-]+", re.IGNORECASE)
RENDER_EXEC_SCHEMA_VERSION = "0.1.0"


def _safe_scope(value: str) -> str:
    text = str(value or "").strip().lower()
    text = _SAFE_SCOPE_RE.sub("_", text).strip("_")
    return text or "default"


def _to_int(value: Any, fallback: int) -> int:
    try:
        out = int(round(float(value)))
    except Exception:
        return int(fallback)
    if out <= 0:
        return int(fallback)
    return int(out)


def _to_float(value: Any, fallback: float) -> float:
    try:
        out = float(value)
    except Exception:
        return float(fallback)
    if out <= 0:
        return float(fallback)
    if out != out:  # NaN
        return float(fallback)
    if out in (float("inf"), float("-inf")):
        return float(fallback)
    return float(out)


def _json_clone(value: Any, fallback: Any) -> Any:
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return fallback


def _build_ffmpeg_command(plan: Dict[str, Any], output_path: str) -> List[str]:
    output = plan.get("output") if isinstance(plan.get("output"), dict) else {}
    ffmpeg = plan.get("ffmpeg") if isinstance(plan.get("ffmpeg"), dict) else {}
    width = max(16, _to_int(output.get("width"), 1920))
    height = max(16, _to_int(output.get("height"), 1080))
    fps = max(1.0, min(240.0, _to_float(output.get("fps"), 30.0)))
    duration_sec = max(0.1, _to_float(output.get("durationSec"), 1.0))
    audio_rate = max(8000, min(192000, _to_int(output.get("audioRate"), 48000)))
    audio_channels = "mono" if str(output.get("audioChannels") or "").strip().lower() == "mono" else "stereo"
    channel_layout = "mono" if audio_channels == "mono" else "stereo"
    video_args = [str(arg) for arg in list(ffmpeg.get("video") or [])]
    audio_args = [str(arg) for arg in list(ffmpeg.get("audio") or [])]
    return [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=black:s={width}x{height}:r={fps}:d={duration_sec:.3f}",
        "-f",
        "lavfi",
        "-i",
        f"anullsrc=r={audio_rate}:cl={channel_layout}",
        "-shortest",
        *video_args,
        *audio_args,
        output_path,
    ]


class CompositionRenderExecutionService:
    """Thread-safe executor for composition render export jobs."""

    def __init__(self, path: str, max_files_per_scope: int = 120) -> None:
        self._path = os.path.realpath(path)
        self._max_files_per_scope = max(10, int(max_files_per_scope or 120))
        self._lock = threading.Lock()

    @property
    def path(self) -> str:
        return self._path

    def _scope_dir(self, scope_key: str) -> str:
        return os.path.join(self._path, _safe_scope(scope_key))

    def _prune_scope_locked(self, scope_dir: str) -> None:
        if not os.path.isdir(scope_dir):
            return
        files: List[tuple[float, str, str]] = []
        for name in os.listdir(scope_dir):
            full = os.path.join(scope_dir, name)
            if not os.path.isfile(full):
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

    def _new_output_path(self, scope_key: str, extension: str) -> str:
        safe_scope = _safe_scope(scope_key)
        ext = str(extension or "").strip().lower()
        if not ext.startswith("."):
            ext = f".{ext}" if ext else ".mp4"
        if len(ext) > 16:
            ext = ".mp4"
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        nonce = uuid.uuid4().hex[:8]
        scope_dir = self._scope_dir(safe_scope)
        os.makedirs(scope_dir, exist_ok=True)
        return os.path.join(scope_dir, f"render_{safe_scope}_{stamp}_{nonce}{ext}")

    def execute(
        self,
        *,
        scope_key: str,
        manifest: Dict[str, Any],
        export_plan: Dict[str, Any],
        execute: bool = False,
        timeout_sec: float = 300.0,
    ) -> Dict[str, Any]:
        safe_scope = _safe_scope(scope_key)
        plan = _json_clone(export_plan, {}) if isinstance(export_plan, dict) else {}
        if not isinstance(plan, dict):
            plan = {}
        profile = plan.get("profile") if isinstance(plan.get("profile"), dict) else {}
        extension = str(profile.get("file_extension") or ".mp4")
        output_path = self._new_output_path(safe_scope, extension)
        command = _build_ffmpeg_command(plan, output_path)
        ffmpeg_path = shutil.which("ffmpeg")
        out: Dict[str, Any] = {
            "schema_version": RENDER_EXEC_SCHEMA_VERSION,
            "scope_key": safe_scope,
            "execute_requested": bool(execute),
            "command": command,
            "output_path": output_path,
            "ffmpeg_found": bool(ffmpeg_path),
            "status": "planned",
            "error": None,
            "duration_sec": None,
        }
        if not execute:
            return out
        if not ffmpeg_path:
            out["status"] = "failed"
            out["error"] = "ffmpeg_not_found"
            return out
        start = time.time()
        try:
            with self._lock:
                proc = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    timeout=max(1.0, float(timeout_sec)),
                    check=False,
                )
            elapsed = max(0.0, time.time() - start)
            out["duration_sec"] = elapsed
            out["returncode"] = int(proc.returncode)
            out["stdout_tail"] = str((proc.stdout or "")[-4000:])
            out["stderr_tail"] = str((proc.stderr or "")[-4000:])
            if proc.returncode != 0:
                out["status"] = "failed"
                out["error"] = "ffmpeg_failed"
                return out
            out["status"] = "ok"
            if os.path.isfile(output_path):
                try:
                    out["size_bytes"] = int(os.path.getsize(output_path))
                except Exception:
                    pass
            self._prune_scope_locked(self._scope_dir(safe_scope))
            return out
        except subprocess.TimeoutExpired:
            out["status"] = "failed"
            out["error"] = "timeout"
            try:
                if os.path.isfile(output_path):
                    os.remove(output_path)
            except Exception:
                pass
            return out

