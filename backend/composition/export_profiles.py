"""Composition export profile catalog and normalization helpers."""

from __future__ import annotations

from typing import Any, Dict, List

EXPORT_PROFILES_SCHEMA_VERSION = "0.1.0"

_BASE_PROFILES: List[Dict[str, Any]] = [
    {
        "id": "h264_mp4",
        "label": "H264 MP4",
        "container": "mp4",
        "video_codec": "h264",
        "audio_codec": "aac",
        "pixel_format": "yuv420p",
        "file_extension": ".mp4",
        "ffmpeg": {
            "video": ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
            "audio": ["-c:a", "aac", "-b:a", "192k"],
        },
    },
    {
        "id": "vp9_webm",
        "label": "VP9 WebM",
        "container": "webm",
        "video_codec": "vp9",
        "audio_codec": "opus",
        "pixel_format": "yuv420p",
        "file_extension": ".webm",
        "ffmpeg": {
            "video": ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p"],
            "audio": ["-c:a", "libopus", "-b:a", "160k"],
        },
    },
]


def _to_float(value: Any, fallback: float) -> float:
    try:
        numeric = float(value)
    except Exception:
        return float(fallback)
    if numeric != numeric:  # NaN
        return float(fallback)
    if numeric == float("inf") or numeric == float("-inf"):
        return float(fallback)
    return float(numeric)


def _to_int(value: Any, fallback: int) -> int:
    return int(round(_to_float(value, float(fallback))))


def list_export_profiles() -> List[Dict[str, Any]]:
    return [
        {
            "id": str(row["id"]),
            "label": str(row["label"]),
            "container": str(row["container"]),
            "video_codec": str(row["video_codec"]),
            "audio_codec": str(row["audio_codec"]),
            "pixel_format": str(row["pixel_format"]),
            "file_extension": str(row["file_extension"]),
        }
        for row in _BASE_PROFILES
    ]


def resolve_export_profile(codec_id: str) -> Dict[str, Any]:
    key = str(codec_id or "").strip().lower()
    for profile in _BASE_PROFILES:
        if str(profile.get("id") or "").strip().lower() == key:
            return dict(profile)
    return dict(_BASE_PROFILES[0])


def normalize_export_settings(raw_output: Dict[str, Any]) -> Dict[str, Any]:
    output = raw_output if isinstance(raw_output, dict) else {}
    profile = resolve_export_profile(str(output.get("codec") or "h264_mp4"))
    width = max(16, _to_int(output.get("width"), 1920))
    height = max(16, _to_int(output.get("height"), 1080))
    fps = max(1.0, min(240.0, _to_float(output.get("fps"), 30.0)))
    duration_sec = max(0.1, _to_float(output.get("durationSec"), 0.1))
    audio_rate = max(8000, min(192000, _to_int(output.get("audioRate"), 48000)))
    audio_channels = "mono" if str(output.get("audioChannels") or "").strip().lower() == "mono" else "stereo"
    return {
        "width": width,
        "height": height,
        "fps": fps,
        "durationSec": duration_sec,
        "audioRate": audio_rate,
        "audioChannels": audio_channels,
        "codec": str(profile["id"]),
    }


def build_export_plan(raw_output: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_export_settings(raw_output)
    profile = resolve_export_profile(str(normalized["codec"]))
    return {
        "schema_version": EXPORT_PROFILES_SCHEMA_VERSION,
        "output": normalized,
        "profile": {
            "id": str(profile["id"]),
            "label": str(profile["label"]),
            "container": str(profile["container"]),
            "video_codec": str(profile["video_codec"]),
            "audio_codec": str(profile["audio_codec"]),
            "pixel_format": str(profile["pixel_format"]),
            "file_extension": str(profile["file_extension"]),
        },
        "ffmpeg": {
            "video": list(profile.get("ffmpeg", {}).get("video", [])),
            "audio": list(profile.get("ffmpeg", {}).get("audio", [])),
        },
    }
