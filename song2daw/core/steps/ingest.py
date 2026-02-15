"""Deterministic Ingest step for song2daw."""

from __future__ import annotations

from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_ingest_handler(
    *,
    sample_rate: int = 44100,
    ppq: int = 960,
    schema_version: str = "1.0.0",
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_ingest_step(
        step_inputs,
        step,
        sample_rate=sample_rate,
        ppq=ppq,
        schema_version=schema_version,
    )


def run_ingest_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    sample_rate: int = 44100,
    ppq: int = 960,
    schema_version: str = "1.0.0",
) -> Dict[str, Any]:
    """Build canonical ingest artifacts and a seeded SongGraph fragment."""
    if not isinstance(sample_rate, int) or sample_rate < 1:
        raise ValueError("sample_rate must be a positive integer")
    if not isinstance(ppq, int) or ppq < 1:
        raise ValueError("ppq must be a positive integer")
    if not isinstance(schema_version, str) or not schema_version.strip():
        raise ValueError("schema_version must be a non-empty string")

    audio_path = _require_non_empty_str(step_inputs, "audio_path")
    stems_dir = _require_non_empty_str(step_inputs, "stems_dir")

    audio_hash = _stable_text_hash(audio_path)
    stems_hash = _stable_text_hash(stems_dir)

    audio_artifact = {
        "source": _normalize_text_path(audio_path),
        "id": f"audio:{audio_hash[:16]}",
        "sha256": audio_hash,
        "normalization": "none",
    }
    stems_artifact = {
        "source": _normalize_text_path(stems_dir),
        "id": f"stems:{stems_hash[:16]}",
        "sha256": stems_hash,
    }

    songgraph = {
        "schema_version": schema_version,
        "pipeline_version": step.version,
        "node_versions": {"Ingest": step.version},
        "timebase": {"audio": {"sr": sample_rate}, "musical": {"ppq": ppq}},
        "nodes": [],
        "edges": [],
        "artifacts": {
            "ingest": {
                "audio_canonical": audio_artifact,
                "stems_canonical": stems_artifact,
            }
        },
    }

    return {
        "artifacts.audio_canonical": audio_artifact,
        "artifacts.stems_canonical": stems_artifact,
        "songgraph": songgraph,
    }


def _require_non_empty_str(inputs: Mapping[str, Any], key: str) -> str:
    value = inputs.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value


def _normalize_text_path(text: str) -> str:
    return text.strip().replace("\\", "/")


def _stable_text_hash(text: str) -> str:
    return sha256(_normalize_text_path(text).encode("utf-8")).hexdigest()

