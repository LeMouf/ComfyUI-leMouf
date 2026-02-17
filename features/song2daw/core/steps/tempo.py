"""Deterministic TempoAnalysis step for song2daw."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_tempo_handler(
    *,
    default_bpm: float = 120.0,
    beat_interval_sec: float = 0.5,
    beats_count: int = 16,
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_tempo_analysis_step(
        step_inputs,
        step,
        default_bpm=default_bpm,
        beat_interval_sec=beat_interval_sec,
        beats_count=beats_count,
    )


def run_tempo_analysis_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    default_bpm: float = 120.0,
    beat_interval_sec: float = 0.5,
    beats_count: int = 16,
) -> Dict[str, Any]:
    """Build deterministic tempo/beatgrid artifacts and SongGraph updates."""
    if not isinstance(default_bpm, (int, float)) or float(default_bpm) <= 0:
        raise ValueError("default_bpm must be positive")
    if not isinstance(beat_interval_sec, (int, float)) or float(beat_interval_sec) <= 0:
        raise ValueError("beat_interval_sec must be positive")
    if not isinstance(beats_count, int) or beats_count < 2:
        raise ValueError("beats_count must be an integer >= 2")

    audio_ref = step_inputs.get("artifacts.audio_canonical")
    audio_fingerprint = _audio_fingerprint(audio_ref)
    if audio_fingerprint is None:
        raise ValueError("artifacts.audio_canonical must be a string or mapping")

    beatgrid_points = [round(i * float(beat_interval_sec), 6) for i in range(beats_count)]
    downbeats = [point for index, point in enumerate(beatgrid_points) if index % 4 == 0]
    bpm = round(float(default_bpm), 4)

    tempo_artifact = {
        "bpm": bpm,
        "confidence": 1.0,
        "source_audio_fingerprint": audio_fingerprint,
        "method": "deterministic_placeholder_v1",
    }
    beatgrid_artifact = {
        "beats_sec": beatgrid_points,
        "downbeats_sec": downbeats,
        "source_audio_fingerprint": audio_fingerprint,
    }

    songgraph = _merge_songgraph(
        step_inputs.get("songgraph"),
        step_version=step.version,
        tempo_artifact=tempo_artifact,
        beatgrid_artifact=beatgrid_artifact,
        node_id=f"tempo:{audio_fingerprint[:16]}",
    )

    return {
        "artifacts.tempo": tempo_artifact,
        "artifacts.beatgrid": beatgrid_artifact,
        "songgraph": songgraph,
    }


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
    tempo_artifact: Mapping[str, Any],
    beatgrid_artifact: Mapping[str, Any],
    node_id: str,
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
    node_versions["TempoAnalysis"] = step_version
    graph["node_versions"] = node_versions

    artifacts = graph.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    artifacts["tempo_analysis"] = {
        "tempo": dict(tempo_artifact),
        "beatgrid": dict(beatgrid_artifact),
    }
    graph["artifacts"] = artifacts

    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
    tempo_node = {
        "id": node_id,
        "type": "TimeNode",
        "data": {
            "bpm": tempo_artifact["bpm"],
            "confidence": tempo_artifact["confidence"],
            "beat_count": len(beatgrid_artifact["beats_sec"]),
        },
    }
    _upsert_node(nodes, tempo_node)
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

