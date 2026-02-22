"""Composition render execution service (codec/container backend path).

This module now supports two deterministic execution modes:

- `timeline_layers`: build a real ffmpeg filter graph from composition manifest
  timeline tracks/events (video overlays + audio mix).
- `fallback`: safe black/silence output when manifest data is unavailable.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple


_SAFE_SCOPE_RE = re.compile(r"[^a-z0-9_-]+", re.IGNORECASE)
RENDER_EXEC_SCHEMA_VERSION = "0.1.0"
_MEDIA_CACHE_URL_PREFIX = "/lemouf/loop/media_cache/"
_RENDER_FILE_URL_PREFIX = "/lemouf/composition/render_file/"
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
_MAX_DIAGNOSTIC_ITEMS = 120


def _safe_scope(value: str) -> str:
    text = str(value or "").strip().lower()
    text = _SAFE_SCOPE_RE.sub("_", text).strip("_")
    return text or "default"


def _clamp(value: float, lo: float, hi: float) -> float:
    if value < lo:
        return float(lo)
    if value > hi:
        return float(hi)
    return float(value)


def _to_int(value: Any, fallback: int) -> int:
    try:
        out = int(round(float(value)))
    except Exception:
        return int(fallback)
    if out <= 0:
        return int(fallback)
    return int(out)


def _to_number(value: Any, fallback: float) -> float:
    try:
        out = float(value)
    except Exception:
        return float(fallback)
    if out != out:  # NaN
        return float(fallback)
    if out in (float("inf"), float("-inf")):
        return float(fallback)
    return float(out)


def _to_float(value: Any, fallback: float) -> float:
    out = _to_number(value, fallback)
    if out <= 0:
        return float(fallback)
    return float(out)


def _json_clone(value: Any, fallback: Any) -> Any:
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return fallback


def _diagnostics_bucket() -> Dict[str, Any]:
    return {
        "skipped_visual_events": [],
        "skipped_audio_events": [],
        "notes": [],
    }


def _diag_push(diag: Dict[str, Any], key: str, payload: Dict[str, Any]) -> None:
    if not isinstance(diag, dict):
        return
    rows = diag.get(key)
    if not isinstance(rows, list):
        rows = []
        diag[key] = rows
    if len(rows) >= _MAX_DIAGNOSTIC_ITEMS:
        return
    rows.append(_json_clone(payload, {}))


def _path_is_image(path: str) -> bool:
    ext = str(os.path.splitext(str(path or ""))[1] or "").strip().lower()
    return ext in _IMAGE_EXTENSIONS


def _safe_real_join(root: str, *parts: str) -> Optional[str]:
    root_real = os.path.realpath(root)
    candidate = os.path.realpath(os.path.join(root_real, *parts))
    if candidate == root_real:
        return candidate
    if candidate.startswith(root_real + os.sep):
        return candidate
    return None


def _get_repo_root() -> str:
    return os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _resolve_source_path(raw_src: Any, repo_root: str, render_root: str) -> Optional[str]:
    src = str(raw_src or "").strip()
    if not src:
        return None
    lowered = src.lower()
    if lowered.startswith(("blob:", "data:", "http://", "https://")):
        return None
    if os.path.isabs(src):
        full = os.path.realpath(src)
        return full if os.path.isfile(full) else None
    media_root = os.path.realpath(os.path.join(repo_root, "backend", "loop", "media_cache"))
    if src.startswith(_MEDIA_CACHE_URL_PREFIX):
        rel = src[len(_MEDIA_CACHE_URL_PREFIX) :].lstrip("/\\")
        full = _safe_real_join(media_root, rel)
        return full if full and os.path.isfile(full) else None
    if src.startswith(_RENDER_FILE_URL_PREFIX):
        rel = src[len(_RENDER_FILE_URL_PREFIX) :].strip("/\\")
        if rel:
            parts = [part for part in rel.split("/") if part]
            if len(parts) >= 2:
                safe_scope = _safe_scope(parts[0])
                safe_name = os.path.basename(parts[1])
                full = _safe_real_join(render_root, safe_scope, safe_name)
                return full if full and os.path.isfile(full) else None
    if src.startswith("/"):
        full = _safe_real_join(repo_root, src.lstrip("/\\"))
        return full if full and os.path.isfile(full) else None
    full = os.path.realpath(os.path.join(repo_root, src))
    return full if os.path.isfile(full) else None


def _collect_manifest_maps(manifest: Dict[str, Any]) -> Dict[str, Any]:
    timeline = manifest.get("timeline") if isinstance(manifest.get("timeline"), dict) else {}
    snapshot = manifest.get("snapshot") if isinstance(manifest.get("snapshot"), dict) else {}
    tracks = list(timeline.get("tracks") or []) if isinstance(timeline.get("tracks"), list) else []
    events_by_track = (
        timeline.get("eventsByTrack")
        if isinstance(timeline.get("eventsByTrack"), dict)
        else {}
    )
    resource_src_by_id: Dict[str, str] = {}
    for row in list(snapshot.get("manualResources") or []):
        if not isinstance(row, dict):
            continue
        rid = str(row.get("id") or "").strip()
        src = str(row.get("src") or "").strip()
        if rid and src:
            resource_src_by_id[rid] = src
    clip_src_by_id: Dict[str, str] = {}
    for _, rows in list(events_by_track.items()):
        if not isinstance(rows, list):
            continue
        for event in rows:
            if not isinstance(event, dict):
                continue
            clip_id = str(event.get("clipId") or "").strip()
            src = str(event.get("src") or "").strip()
            if clip_id and src:
                clip_src_by_id[clip_id] = src
    placement_by_clip: Dict[str, Dict[str, Any]] = {}
    placements = snapshot.get("placements")
    if isinstance(placements, dict):
        for key, value in list(placements.items()):
            if not isinstance(value, dict):
                continue
            clip_id = str(value.get("clipId") or key or "").strip()
            if clip_id:
                placement_by_clip[clip_id] = value
    elif isinstance(placements, list):
        for row in placements:
            item = row
            if isinstance(row, (list, tuple)) and len(row) >= 2 and isinstance(row[1], dict):
                item = row[1]
            if not isinstance(item, dict):
                continue
            clip_id = str(item.get("clipId") or "").strip()
            if clip_id:
                placement_by_clip[clip_id] = item
    return {
        "timeline": timeline,
        "tracks": tracks,
        "events_by_track": events_by_track,
        "resource_src_by_id": resource_src_by_id,
        "clip_src_by_id": clip_src_by_id,
        "placement_by_clip": placement_by_clip,
    }


def _build_fallback_ffmpeg_command(plan: Dict[str, Any], output_path: str) -> List[str]:
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


def _collect_visual_events(
    *,
    manifest_maps: Dict[str, Any],
    output_duration_sec: float,
    output_width: int,
    output_height: int,
    repo_root: str,
    render_root: str,
    diagnostics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    tracks = list(manifest_maps.get("tracks") or [])
    events_by_track = manifest_maps.get("events_by_track") if isinstance(manifest_maps.get("events_by_track"), dict) else {}
    resource_src_by_id = manifest_maps.get("resource_src_by_id") if isinstance(manifest_maps.get("resource_src_by_id"), dict) else {}
    clip_src_by_id = manifest_maps.get("clip_src_by_id") if isinstance(manifest_maps.get("clip_src_by_id"), dict) else {}
    placement_by_clip = manifest_maps.get("placement_by_clip") if isinstance(manifest_maps.get("placement_by_clip"), dict) else {}
    visual_track_rows: List[Tuple[int, str, str]] = []
    for idx, track in enumerate(tracks):
        if not isinstance(track, dict):
            continue
        kind = str(track.get("kind") or "").strip().lower()
        if kind not in {"video", "image"}:
            continue
        name = str(track.get("name") or "").strip()
        if not name:
            continue
        visual_track_rows.append((idx, name, kind))
    out: List[Dict[str, Any]] = []
    for track_index, track_name, track_kind in visual_track_rows:
        rows = events_by_track.get(track_name)
        if not isinstance(rows, list):
            continue
        for event in rows:
            if not isinstance(event, dict):
                continue
            clip_id = str(event.get("clipId") or "").strip()
            resource_id = str(event.get("resourceId") or "").strip()
            raw_src = (
                str(event.get("src") or "").strip()
                or str(resource_src_by_id.get(resource_id) or "").strip()
                or str(clip_src_by_id.get(clip_id) or "").strip()
            )
            src_path = _resolve_source_path(raw_src, repo_root, render_root)
            if not src_path:
                _diag_push(
                    diagnostics,
                    "skipped_visual_events",
                    {
                        "reason": "source_unresolved",
                        "track": track_name,
                        "clip_id": clip_id,
                        "resource_id": resource_id,
                        "src": raw_src,
                    },
                )
                continue
            time_sec = max(0.0, _to_number(event.get("time"), 0.0))
            if time_sec >= output_duration_sec:
                _diag_push(
                    diagnostics,
                    "skipped_visual_events",
                    {
                        "reason": "starts_outside_output_duration",
                        "track": track_name,
                        "clip_id": clip_id,
                        "time_sec": float(time_sec),
                        "output_duration_sec": float(output_duration_sec),
                    },
                )
                continue
            duration_sec = max(0.02, _to_float(event.get("duration"), 0.1))
            duration_sec = min(duration_sec, max(0.02, output_duration_sec - time_sec))
            source_duration_sec = max(0.02, _to_float(event.get("sourceDurationSec"), duration_sec))
            start_offset_sec = max(0.0, _to_number(event.get("startOffsetSec"), 0.0))
            start_offset_sec = _clamp(start_offset_sec, 0.0, max(0.0, source_duration_sec - 0.02))
            duration_sec = _clamp(duration_sec, 0.02, max(0.02, source_duration_sec - start_offset_sec))
            placement = placement_by_clip.get(clip_id) if clip_id else None
            scale_pct = _clamp(
                _to_number((placement or {}).get("transformScalePct"), 100.0),
                1.0,
                1000.0,
            )
            move_x_pct = _clamp(
                _to_number((placement or {}).get("transformXPct"), 0.0),
                -400.0,
                400.0,
            )
            move_y_pct = _clamp(
                _to_number((placement or {}).get("transformYPct"), 0.0),
                -400.0,
                400.0,
            )
            rotate_deg = _clamp(
                _to_number((placement or {}).get("transformRotateDeg"), 0.0),
                -3600.0,
                3600.0,
            )
            opacity_pct = _clamp(
                _to_number((placement or {}).get("transformOpacityPct"), 100.0),
                0.0,
                100.0,
            )
            z_index = _to_number((placement or {}).get("zIndex"), 0.0)
            target_w = max(2, int(round(output_width * (scale_pct / 100.0))))
            target_h = max(2, int(round(output_height * (scale_pct / 100.0))))
            offset_x_px = (move_x_pct / 100.0) * float(output_width)
            offset_y_px = (move_y_pct / 100.0) * float(output_height)
            out.append(
                {
                    "track_index": int(track_index),
                    "track_kind": track_kind,
                    "src_path": src_path,
                    "is_image": bool(track_kind == "image" or _path_is_image(src_path)),
                    "time_sec": float(time_sec),
                    "duration_sec": float(duration_sec),
                    "start_offset_sec": float(start_offset_sec),
                    "target_w": int(target_w),
                    "target_h": int(target_h),
                    "offset_x_px": float(offset_x_px),
                    "offset_y_px": float(offset_y_px),
                    "rotate_deg": float(rotate_deg),
                    "opacity_pct": float(opacity_pct),
                    "z_index": float(z_index),
                    "clip_id": clip_id,
                }
            )
    # Top visual tracks should be composited last (higher priority), so reverse by track index.
    out.sort(
        key=lambda row: (
            float(row.get("z_index") or 0.0),
            -int(row.get("track_index") or 0),
            float(row.get("time_sec") or 0.0),
            str(row.get("clip_id") or ""),
        )
    )
    return out


def _collect_audio_events(
    *,
    manifest_maps: Dict[str, Any],
    output_duration_sec: float,
    repo_root: str,
    render_root: str,
    diagnostics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    tracks = list(manifest_maps.get("tracks") or [])
    events_by_track = manifest_maps.get("events_by_track") if isinstance(manifest_maps.get("events_by_track"), dict) else {}
    resource_src_by_id = manifest_maps.get("resource_src_by_id") if isinstance(manifest_maps.get("resource_src_by_id"), dict) else {}
    clip_src_by_id = manifest_maps.get("clip_src_by_id") if isinstance(manifest_maps.get("clip_src_by_id"), dict) else {}
    out: List[Dict[str, Any]] = []
    for idx, track in enumerate(tracks):
        if not isinstance(track, dict):
            continue
        if str(track.get("kind") or "").strip().lower() != "audio":
            continue
        track_name = str(track.get("name") or "").strip()
        if not track_name:
            continue
        rows = events_by_track.get(track_name)
        if not isinstance(rows, list):
            continue
        for event in rows:
            if not isinstance(event, dict):
                continue
            clip_id = str(event.get("clipId") or "").strip()
            resource_id = str(event.get("resourceId") or "").strip()
            raw_src = (
                str(event.get("src") or "").strip()
                or str(resource_src_by_id.get(resource_id) or "").strip()
                or str(clip_src_by_id.get(clip_id) or "").strip()
            )
            src_path = _resolve_source_path(raw_src, repo_root, render_root)
            if not src_path:
                _diag_push(
                    diagnostics,
                    "skipped_audio_events",
                    {
                        "reason": "source_unresolved",
                        "track": track_name,
                        "clip_id": clip_id,
                        "resource_id": resource_id,
                        "src": raw_src,
                    },
                )
                continue
            time_sec = max(0.0, _to_number(event.get("time"), 0.0))
            if time_sec >= output_duration_sec:
                _diag_push(
                    diagnostics,
                    "skipped_audio_events",
                    {
                        "reason": "starts_outside_output_duration",
                        "track": track_name,
                        "clip_id": clip_id,
                        "time_sec": float(time_sec),
                        "output_duration_sec": float(output_duration_sec),
                    },
                )
                continue
            duration_sec = max(0.02, _to_float(event.get("duration"), 0.1))
            duration_sec = min(duration_sec, max(0.02, output_duration_sec - time_sec))
            source_duration_sec = max(0.02, _to_float(event.get("sourceDurationSec"), duration_sec))
            start_offset_sec = max(0.0, _to_number(event.get("startOffsetSec"), 0.0))
            start_offset_sec = _clamp(start_offset_sec, 0.0, max(0.0, source_duration_sec - 0.02))
            duration_sec = _clamp(duration_sec, 0.02, max(0.02, source_duration_sec - start_offset_sec))
            out.append(
                {
                    "track_index": int(idx),
                    "track_name": track_name,
                    "src_path": src_path,
                    "time_sec": float(time_sec),
                    "duration_sec": float(duration_sec),
                    "start_offset_sec": float(start_offset_sec),
                    "clip_id": clip_id,
                }
            )
    out.sort(
        key=lambda row: (
            float(row.get("time_sec") or 0.0),
            int(row.get("track_index") or 0),
            str(row.get("clip_id") or ""),
        )
    )
    return out


def _build_timeline_layers_ffmpeg_command(
    plan: Dict[str, Any],
    manifest: Dict[str, Any],
    output_path: str,
    render_root: str,
) -> Tuple[List[str], Dict[str, Any]]:
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
    repo_root = _get_repo_root()
    diagnostics = _diagnostics_bucket()
    manifest_maps = _collect_manifest_maps(manifest if isinstance(manifest, dict) else {})
    visual_events = _collect_visual_events(
        manifest_maps=manifest_maps,
        output_duration_sec=duration_sec,
        output_width=width,
        output_height=height,
        repo_root=repo_root,
        render_root=render_root,
        diagnostics=diagnostics,
    )
    audio_events = _collect_audio_events(
        manifest_maps=manifest_maps,
        output_duration_sec=duration_sec,
        repo_root=repo_root,
        render_root=render_root,
        diagnostics=diagnostics,
    )
    if not visual_events and not audio_events:
        _diag_push(
            diagnostics,
            "notes",
            {"reason": "no_usable_timeline_events", "mode": "fallback"},
        )
        return _build_fallback_ffmpeg_command(plan, output_path), {
            "render_mode": "fallback",
            "visual_events_used": 0,
            "audio_events_used": 0,
            "diagnostics": diagnostics,
        }
    inputs: List[str] = [
        "-f",
        "lavfi",
        "-i",
        f"color=c=black:s={width}x{height}:r={fps}:d={duration_sec:.3f}",
        "-f",
        "lavfi",
        "-i",
        f"anullsrc=r={audio_rate}:cl={channel_layout}",
    ]
    filter_parts: List[str] = [f"[0:v]trim=duration={duration_sec:.6f},setpts=PTS-STARTPTS,format=rgba[base0]"]
    base_label = "base0"
    next_input_index = 2
    visual_used = 0
    for event in visual_events:
        source_path = str(event.get("src_path") or "")
        if not source_path:
            continue
        event_duration = max(0.02, _to_float(event.get("duration_sec"), 0.1))
        if bool(event.get("is_image")):
            inputs.extend(["-loop", "1", "-t", f"{event_duration + 0.05:.6f}", "-i", source_path])
        else:
            inputs.extend(["-i", source_path])
        input_idx = next_input_index
        next_input_index += 1
        src_label = f"{input_idx}:v"
        clip_label = f"vclip{visual_used}"
        out_label = f"base{visual_used + 1}"
        start_offset_sec = max(0.0, _to_number(event.get("start_offset_sec"), 0.0))
        time_sec = max(0.0, _to_number(event.get("time_sec"), 0.0))
        end_sec = min(duration_sec, time_sec + event_duration)
        target_w = max(2, _to_int(event.get("target_w"), width))
        target_h = max(2, _to_int(event.get("target_h"), height))
        rotate_deg = _to_number(event.get("rotate_deg"), 0.0)
        rotate_rad = (rotate_deg * math.pi) / 180.0
        opacity = _clamp((_to_number(event.get("opacity_pct"), 100.0) / 100.0), 0.0, 1.0)
        offset_x = _to_number(event.get("offset_x_px"), 0.0)
        offset_y = _to_number(event.get("offset_y_px"), 0.0)
        clip_filters = (
            f"[{src_label}]"
            f"trim=start={start_offset_sec:.6f}:duration={event_duration:.6f},"
            f"setpts=PTS-STARTPTS,"
            f"fps={fps:.6f},"
            f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
            f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:color=black@0,"
            f"format=rgba"
        )
        if abs(rotate_rad) > 1e-9:
            clip_filters += f",rotate={rotate_rad:.9f}:c=none:ow=rotw(iw):oh=roth(ih)"
        if opacity < 0.999:
            clip_filters += f",colorchannelmixer=aa={opacity:.6f}"
        clip_filters += f"[{clip_label}]"
        filter_parts.append(clip_filters)
        filter_parts.append(
            f"[{base_label}][{clip_label}]"
            f"overlay=x='(W-w)/2+({offset_x:.3f})':y='(H-h)/2+({offset_y:.3f})':"
            f"enable='between(t,{time_sec:.6f},{end_sec:.6f})':eof_action=pass"
            f"[{out_label}]"
        )
        base_label = out_label
        visual_used += 1
    filter_parts.append(f"[{base_label}]trim=duration={duration_sec:.6f},setpts=PTS-STARTPTS,format=yuv420p[vout]")
    audio_labels: List[str] = []
    audio_used = 0
    for event in audio_events:
        source_path = str(event.get("src_path") or "")
        if not source_path:
            continue
        inputs.extend(["-i", source_path])
        input_idx = next_input_index
        next_input_index += 1
        label = f"aevt{audio_used}"
        time_sec = max(0.0, _to_number(event.get("time_sec"), 0.0))
        delay_ms = max(0, int(round(time_sec * 1000.0)))
        start_offset_sec = max(0.0, _to_number(event.get("start_offset_sec"), 0.0))
        event_duration = max(0.02, _to_float(event.get("duration_sec"), 0.1))
        filter_parts.append(
            f"[{input_idx}:a]"
            f"atrim=start={start_offset_sec:.6f}:duration={event_duration:.6f},"
            f"asetpts=PTS-STARTPTS,"
            f"adelay={delay_ms}:all=1"
            f"[{label}]"
        )
        audio_labels.append(label)
        audio_used += 1
    if audio_labels:
        chain = "".join([f"[{label}]" for label in audio_labels])
        if len(audio_labels) > 1:
            chain += (
                f"amix=inputs={len(audio_labels)}:duration=longest:normalize=0:dropout_transition=0,"
            )
        chain += (
            f"aformat=sample_rates={audio_rate}:channel_layouts={channel_layout},"
            f"atrim=duration={duration_sec:.6f}"
            f"[aout]"
        )
        filter_parts.append(chain)
    else:
        filter_parts.append(
            f"[1:a]atrim=duration={duration_sec:.6f},"
            f"aformat=sample_rates={audio_rate}:channel_layouts={channel_layout}"
            f"[aout]"
        )
    filter_complex = ";".join(filter_parts)
    command = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        *inputs,
        "-filter_complex",
        filter_complex,
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-shortest",
        *video_args,
        *audio_args,
        output_path,
    ]
    return command, {
        "render_mode": "timeline_layers",
        "visual_events_used": int(visual_used),
        "audio_events_used": int(audio_used),
        "diagnostics": diagnostics,
    }


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
        command, render_meta = _build_timeline_layers_ffmpeg_command(
            plan,
            manifest if isinstance(manifest, dict) else {},
            output_path,
            self._path,
        )
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
            "render_mode": str(render_meta.get("render_mode") or "fallback"),
            "visual_events_used": int(render_meta.get("visual_events_used") or 0),
            "audio_events_used": int(render_meta.get("audio_events_used") or 0),
            "diagnostics": _json_clone(render_meta.get("diagnostics"), _diagnostics_bucket()),
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
