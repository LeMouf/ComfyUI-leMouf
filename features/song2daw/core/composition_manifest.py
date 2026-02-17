"""Deterministic composition manifest helpers for composition studio inputs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping

COMPOSITION_MANIFEST_SCHEMA_VERSION = "0.1.0"

_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
_AUDIO_EXT = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"}
_VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv", ".avi"}
_NUMERIC_META_KEYS = ("duration_s", "fps", "sample_rate", "channels", "size_bytes", "width", "height")


def parse_composition_resources_json(resources_json: str) -> List[Any]:
    raw = (resources_json or "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - covered by unit tests
        raise ValueError(f"resources_json error: {exc}") from exc
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict) and isinstance(parsed.get("resources"), list):
        return list(parsed["resources"])
    raise ValueError("resources_json must be a list or an object with a 'resources' list")


def build_composition_manifest(
    resources: Iterable[Any],
    *,
    duration_s: float = 12.0,
    fps: float = 24.0,
) -> Dict[str, Any]:
    normalized_resources = []
    for index, resource in enumerate(list(resources)):
        normalized_resources.append(_normalize_resource(resource, index))
    return {
        "schema_version": COMPOSITION_MANIFEST_SCHEMA_VERSION,
        "duration_s": _to_positive_float(duration_s, 12.0),
        "fps": _to_positive_float(fps, 24.0),
        "resources": normalized_resources,
    }


def _normalize_resource(resource: Any, index: int) -> Dict[str, Any]:
    if isinstance(resource, str):
        text = resource.strip()
        if not text:
            text = f"resource_{index + 1}"
        kind = _infer_kind(path_or_uri=text, mime="")
        return {
            "id": f"res_{index + 1:04d}",
            "kind": kind,
            "label": Path(text).name or text,
            "source": "pipeline_input",
            "uri": text,
            "meta": {},
        }

    mapping = resource if isinstance(resource, Mapping) else {}
    id_value = _to_text(mapping.get("id"), f"res_{index + 1:04d}")
    mime = _to_text(mapping.get("mime") or mapping.get("content_type"), "")
    uri = _to_text(mapping.get("uri") or mapping.get("src") or mapping.get("path"), "")
    filename = _to_text(mapping.get("filename"), "")
    subfolder = _to_text(mapping.get("subfolder"), "")
    storage_type = _to_text(mapping.get("type"), "")
    raw_kind = _to_text(mapping.get("kind") or mapping.get("resource_type"), "")
    kind = _normalize_kind(raw_kind) or _infer_kind(path_or_uri=uri or filename, mime=mime)
    label = _to_text(mapping.get("label") or mapping.get("name"), "") or id_value
    source = _to_text(mapping.get("source"), "pipeline_input")
    meta = _extract_meta(mapping)

    normalized = {
        "id": id_value,
        "kind": kind,
        "label": label,
        "source": source,
        "uri": uri,
        "meta": meta,
    }
    if filename:
        normalized["filename"] = filename
    if subfolder:
        normalized["subfolder"] = subfolder
    if storage_type:
        normalized["type"] = storage_type
    return normalized


def _extract_meta(mapping: Mapping[str, Any]) -> Dict[str, Any]:
    meta = mapping.get("meta")
    out: Dict[str, Any] = {}
    if isinstance(meta, Mapping):
        for key in sorted(meta.keys()):
            if key in _NUMERIC_META_KEYS:
                numeric = _to_number(meta.get(key))
                if numeric is not None:
                    out[key] = numeric
    for key in _NUMERIC_META_KEYS:
        if key in out:
            continue
        numeric = _to_number(mapping.get(key))
        if numeric is not None:
            out[key] = numeric
    channels = out.get("channels")
    if isinstance(channels, (int, float)):
        if channels >= 2:
            out["channel_mode"] = "stereo"
        elif channels == 1:
            out["channel_mode"] = "mono"
    return out


def _normalize_kind(value: str) -> str:
    text = value.strip().lower()
    if text in {"image", "audio", "video"}:
        return text
    return ""


def _infer_kind(*, path_or_uri: str, mime: str) -> str:
    mime_l = mime.strip().lower()
    if mime_l.startswith("image/"):
        return "image"
    if mime_l.startswith("audio/"):
        return "audio"
    if mime_l.startswith("video/"):
        return "video"
    suffix = Path((path_or_uri or "").split("?", 1)[0]).suffix.lower()
    if suffix in _IMAGE_EXT:
        return "image"
    if suffix in _AUDIO_EXT:
        return "audio"
    if suffix in _VIDEO_EXT:
        return "video"
    return "image"


def _to_text(value: Any, fallback: str) -> str:
    text = str(value).strip() if value is not None else ""
    return text or fallback


def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if num != num:  # NaN
        return None
    if num == float("inf") or num == float("-inf"):
        return None
    return num


def _to_positive_float(value: Any, fallback: float) -> float:
    numeric = _to_number(value)
    if numeric is None or numeric <= 0:
        return float(fallback)
    return float(numeric)

