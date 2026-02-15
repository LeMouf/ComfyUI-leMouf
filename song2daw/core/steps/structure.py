"""Deterministic StructureSegmentation step for song2daw."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_structure_handler(
    *,
    section_span_beats: int = 8,
    confidence: float = 1.0,
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_structure_segmentation_step(
        step_inputs,
        step,
        section_span_beats=section_span_beats,
        confidence=confidence,
    )


def run_structure_segmentation_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    section_span_beats: int = 8,
    confidence: float = 1.0,
) -> Dict[str, Any]:
    """Build deterministic structure sections and SongGraph updates."""
    if not isinstance(section_span_beats, int) or section_span_beats < 1:
        raise ValueError("section_span_beats must be a positive integer")
    if not isinstance(confidence, (int, float)) or not (0.0 <= float(confidence) <= 1.0):
        raise ValueError("confidence must be in [0.0, 1.0]")

    audio_ref = step_inputs.get("artifacts.audio_canonical")
    audio_fingerprint = _audio_fingerprint(audio_ref)
    if audio_fingerprint is None:
        raise ValueError("artifacts.audio_canonical must be a string or mapping")

    beat_points = _extract_beat_points(step_inputs.get("artifacts.beatgrid"))
    if len(beat_points) < 2:
        raise ValueError("artifacts.beatgrid must contain at least two beat timestamps")

    sections = _build_sections(
        beat_points=beat_points,
        section_span_beats=section_span_beats,
        confidence=float(confidence),
    )
    sections_artifact = {
        "sections": sections,
        "source_audio_fingerprint": audio_fingerprint,
        "method": "deterministic_placeholder_v1",
    }

    songgraph = _merge_songgraph(
        step_inputs.get("songgraph"),
        step_version=step.version,
        sections_artifact=sections_artifact,
        audio_fingerprint=audio_fingerprint,
    )

    return {
        "artifacts.sections": sections_artifact,
        "songgraph": songgraph,
    }


def _extract_beat_points(beatgrid_ref: Any) -> list[float]:
    if isinstance(beatgrid_ref, Mapping):
        beats = beatgrid_ref.get("beats_sec")
    else:
        beats = beatgrid_ref

    if not isinstance(beats, list):
        raise ValueError("artifacts.beatgrid must be a list or mapping with beats_sec")
    if not all(isinstance(value, (int, float)) for value in beats):
        raise ValueError("artifacts.beatgrid beats must be numeric")

    normalized = [round(float(value), 6) for value in beats]
    for current, next_value in zip(normalized, normalized[1:]):
        if next_value <= current:
            raise ValueError("artifacts.beatgrid beats must be strictly increasing")
    return normalized


def _build_sections(
    *,
    beat_points: list[float],
    section_span_beats: int,
    confidence: float,
) -> list[Dict[str, Any]]:
    sections = []
    section_index = 0
    start = 0
    while start < len(beat_points) - 1:
        end = min(start + section_span_beats, len(beat_points) - 1)
        if end <= start:
            break
        section_index += 1
        sections.append(
            {
                "id": f"section_{section_index:03}",
                "label": f"Section {section_index}",
                "t0_sec": beat_points[start],
                "t1_sec": beat_points[end],
                "start_beat_index": start,
                "end_beat_index": end,
                "confidence": confidence,
            }
        )
        start = end
    return sections


def _audio_fingerprint(audio_ref: Any) -> str | None:
    if isinstance(audio_ref, str):
        normalized = audio_ref.strip().replace("\\", "/")
        if not normalized:
            return None
        return sha256(normalized.encode("utf-8")).hexdigest()
    if isinstance(audio_ref, Mapping):
        sha = audio_ref.get("sha256")
        if isinstance(sha, str) and sha.strip():
            return sha
        raw_id = audio_ref.get("id")
        if isinstance(raw_id, str) and raw_id.strip():
            return sha256(raw_id.strip().encode("utf-8")).hexdigest()
    return None


def _merge_songgraph(
    base_graph: Any,
    *,
    step_version: str,
    sections_artifact: Mapping[str, Any],
    audio_fingerprint: str,
) -> Dict[str, Any]:
    if isinstance(base_graph, Mapping):
        graph = deepcopy(dict(base_graph))
    else:
        graph = {
            "schema_version": "1.0.0",
            "pipeline_version": step_version,
            "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
            "nodes": [],
            "edges": [],
        }

    graph["pipeline_version"] = step_version
    node_versions = graph.get("node_versions")
    if not isinstance(node_versions, dict):
        node_versions = {}
    node_versions["StructureSegmentation"] = step_version
    graph["node_versions"] = node_versions

    artifacts = graph.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    artifacts["structure_segmentation"] = {"sections": deepcopy(sections_artifact)}
    graph["artifacts"] = artifacts

    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
    for section in sections_artifact["sections"]:
        node_id = f"struct:{audio_fingerprint[:12]}:{section['id']}"
        _upsert_node(
            nodes,
            {
                "id": node_id,
                "type": "StructureNode",
                "data": {
                    "label": section["label"],
                    "confidence": section["confidence"],
                    "section_id": section["id"],
                },
                "t": {
                    "t0_sec": section["t0_sec"],
                    "t1_sec": section["t1_sec"],
                },
            },
        )
    graph["nodes"] = nodes

    edges = graph.get("edges")
    if not isinstance(edges, list):
        edges = []
    graph["edges"] = edges
    return graph


def _upsert_node(nodes: list[Any], node: Mapping[str, Any]) -> None:
    node_id = node.get("id")
    for index, existing in enumerate(nodes):
        if isinstance(existing, Mapping) and existing.get("id") == node_id:
            nodes[index] = dict(node)
            return
    nodes.append(dict(node))

