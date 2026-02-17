"""Deterministic EventExtraction step for song2daw."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_event_extraction_handler(
    *,
    midi_channel_start: int = 1,
    max_events_per_source: int | None = None,
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_event_extraction_step(
        step_inputs,
        step,
        midi_channel_start=midi_channel_start,
        max_events_per_source=max_events_per_source,
    )


def run_event_extraction_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    midi_channel_start: int = 1,
    max_events_per_source: int | None = None,
) -> Dict[str, Any]:
    """Build deterministic event and MIDI proxy artifacts from sources + beatgrid."""
    if not isinstance(midi_channel_start, int) or not (1 <= midi_channel_start <= 16):
        raise ValueError("midi_channel_start must be in [1, 16]")
    if max_events_per_source is not None and (
        not isinstance(max_events_per_source, int) or max_events_per_source < 1
    ):
        raise ValueError("max_events_per_source must be a positive integer when provided")

    source_items = _extract_sources(step_inputs.get("artifacts.sources"))
    beat_points = _extract_beat_points(step_inputs.get("artifacts.beatgrid"))
    if len(beat_points) < 2:
        raise ValueError("artifacts.beatgrid must contain at least two beat timestamps")

    if max_events_per_source is None:
        limited_beats = beat_points
    else:
        limited_beats = beat_points[: max_events_per_source + 1]
    events = []
    midi_tracks = []
    for source_index, source in enumerate(source_items):
        source_id = source["id"]
        channel = ((midi_channel_start - 1 + source_index) % 16) + 1
        track_events = []
        for beat_index in range(len(limited_beats) - 1):
            t0 = limited_beats[beat_index]
            t1 = limited_beats[beat_index + 1]
            velocity = _deterministic_velocity(source_id, beat_index)
            event = {
                "id": f"evt:{source_id}:{beat_index:03}",
                "source_id": source_id,
                "kind": "onset",
                "t0_sec": t0,
                "t1_sec": t1,
                "velocity": velocity,
                "midi_note": 60 + (source_index % 12),
                "midi_channel": channel,
            }
            events.append(event)
            track_events.append(event["id"])

        midi_tracks.append(
            {
                "source_id": source_id,
                "channel": channel,
                "event_ids": track_events,
            }
        )

    source_fingerprint = _sources_fingerprint(source_items)
    events_artifact = {
        "items": events,
        "source_fingerprint": source_fingerprint,
        "method": "deterministic_placeholder_v1",
    }
    midi_artifact = {
        "tracks": midi_tracks,
        "format": "midi_proxy",
        "source_fingerprint": source_fingerprint,
    }

    songgraph = _merge_songgraph(
        step_inputs.get("songgraph"),
        step_version=step.version,
        events_artifact=events_artifact,
        midi_artifact=midi_artifact,
    )

    return {
        "artifacts.events": events_artifact,
        "artifacts.midi_optional": midi_artifact,
        "songgraph": songgraph,
    }


def _extract_sources(sources_ref: Any) -> list[Dict[str, Any]]:
    if isinstance(sources_ref, Mapping):
        items = sources_ref.get("items")
    else:
        items = sources_ref

    if not isinstance(items, list) or not items:
        raise ValueError("artifacts.sources must be a non-empty list or mapping with items")

    normalized = []
    for item in items:
        if not isinstance(item, Mapping):
            raise ValueError("artifacts.sources entries must be mappings")
        source_id = item.get("id")
        if not isinstance(source_id, str) or not source_id.strip():
            raise ValueError("artifacts.sources entries must include non-empty id")
        normalized.append({"id": source_id.strip()})
    return normalized


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


def _deterministic_velocity(source_id: str, beat_index: int) -> int:
    digest = sha256(f"{source_id}:{beat_index}".encode("utf-8")).hexdigest()
    return 40 + (int(digest[:2], 16) % 88)


def _sources_fingerprint(source_items: list[Dict[str, Any]]) -> str:
    joined = "|".join(item["id"] for item in source_items)
    return sha256(joined.encode("utf-8")).hexdigest()


def _merge_songgraph(
    base_graph: Any,
    *,
    step_version: str,
    events_artifact: Mapping[str, Any],
    midi_artifact: Mapping[str, Any],
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
    node_versions["EventExtraction"] = step_version
    graph["node_versions"] = node_versions

    artifacts = graph.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    artifacts["event_extraction"] = {
        "events": deepcopy(events_artifact),
        "midi_optional": deepcopy(midi_artifact),
    }
    graph["artifacts"] = artifacts

    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
    for event in events_artifact["items"]:
        _upsert_node(
            nodes,
            {
                "id": event["id"],
                "type": "EventNode",
                "data": {
                    "kind": event["kind"],
                    "source_id": event["source_id"],
                    "velocity": event["velocity"],
                    "midi_note": event["midi_note"],
                    "midi_channel": event["midi_channel"],
                },
                "t": {
                    "t0_sec": event["t0_sec"],
                    "t1_sec": event["t1_sec"],
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
