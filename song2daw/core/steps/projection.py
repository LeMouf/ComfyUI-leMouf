"""Deterministic ProjectionReaper step for song2daw."""

from __future__ import annotations

from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_projection_reaper_handler(
    *,
    project_name: str = "song2daw_project",
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_projection_reaper_step(
        step_inputs,
        step,
        project_name=project_name,
    )


def run_projection_reaper_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    project_name: str = "song2daw_project",
) -> Dict[str, Any]:
    """Build deterministic Reaper projection artifacts."""
    if not isinstance(project_name, str) or not project_name.strip():
        raise ValueError("project_name must be a non-empty string")

    songgraph = step_inputs.get("songgraph")
    if not isinstance(songgraph, Mapping):
        raise ValueError("songgraph must be provided as a mapping")

    stems = _extract_items(step_inputs.get("artifacts.stems_generated"), "artifacts.stems_generated")
    sections = _extract_items(step_inputs.get("artifacts.sections"), "artifacts.sections", nested_key="sections")
    fx_items = _extract_items(step_inputs.get("artifacts.fx_suggestions"), "artifacts.fx_suggestions")
    tempo = step_inputs.get("artifacts.tempo")
    if not isinstance(tempo, Mapping):
        raise ValueError("artifacts.tempo must be a mapping")

    bpm = tempo.get("bpm")
    if not isinstance(bpm, (int, float)) or float(bpm) <= 0:
        raise ValueError("artifacts.tempo.bpm must be positive")

    signature_seed = {
        "project_name": project_name.strip(),
        "step_version": step.version,
        "stems_count": len(stems),
        "sections_count": len(sections),
        "fx_count": len(fx_items),
        "bpm": round(float(bpm), 6),
    }
    project_hash = sha256(str(signature_seed).encode("utf-8")).hexdigest()
    project_id = f"rpp:{project_hash[:16]}"

    reaper_rpp = {
        "project_id": project_id,
        "name": project_name.strip(),
        "format": "reaper_rpp_placeholder_v1",
        "tempo_bpm": round(float(bpm), 4),
        "track_count": len(stems),
        "section_count": len(sections),
    }
    export_manifest = {
        "project_id": project_id,
        "pipeline_step": step.name,
        "pipeline_version": step.version,
        "exports": {
            "reaper_rpp": f"exports/{project_id}.rpp",
            "stems_count": len(stems),
            "midi_tracks_count": len(fx_items),
        },
    }

    return {
        "artifacts.reaper_rpp": reaper_rpp,
        "artifacts.export_manifest": export_manifest,
    }


def _extract_items(value: Any, label: str, *, nested_key: str = "items") -> list[Dict[str, Any]]:
    if isinstance(value, Mapping):
        items = value.get(nested_key)
    else:
        items = value
    if not isinstance(items, list):
        raise ValueError(f"{label} must be a list or mapping with {nested_key}")
    normalized = []
    for item in items:
        if not isinstance(item, Mapping):
            raise ValueError(f"{label} entries must be mappings")
        normalized.append(dict(item))
    return normalized

