"""Deterministic SourceSeparation step for song2daw."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_source_separation_handler(
    *,
    source_roles: tuple[str, ...] = ("drums", "bass", "harmonic", "vocals"),
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_source_separation_step(
        step_inputs,
        step,
        source_roles=source_roles,
    )


def run_source_separation_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    source_roles: tuple[str, ...] = ("drums", "bass", "harmonic", "vocals"),
) -> Dict[str, Any]:
    """Build deterministic source layer artifacts and SongGraph updates."""
    if not isinstance(source_roles, tuple) or not source_roles:
        raise ValueError("source_roles must be a non-empty tuple")
    if not all(isinstance(role, str) and role.strip() for role in source_roles):
        raise ValueError("source_roles must contain non-empty strings")

    audio_ref = step_inputs.get("artifacts.audio_canonical")
    audio_fingerprint = _audio_fingerprint(audio_ref)
    if audio_fingerprint is None:
        raise ValueError("artifacts.audio_canonical must be a string or mapping")

    sources = []
    stems = []
    for role in source_roles:
        source_id = f"src:{role}:{audio_fingerprint[:10]}"
        stem_id = f"stem:{role}:{audio_fingerprint[:10]}"
        source_entry = {
            "id": source_id,
            "role": role,
            "name": role.title(),
            "source_audio_fingerprint": audio_fingerprint,
        }
        sources.append(source_entry)
        stems.append(
            {
                "source_id": source_id,
                "stem_id": stem_id,
                "path_hint": f"stems/{stem_id}.wav",
                "format": "wav",
            }
        )

    sources_artifact = {
        "items": sources,
        "source_audio_fingerprint": audio_fingerprint,
        "method": "deterministic_placeholder_v1",
    }
    stems_artifact = {
        "items": stems,
        "source_audio_fingerprint": audio_fingerprint,
        "method": "deterministic_placeholder_v1",
    }

    songgraph = _merge_songgraph(
        step_inputs.get("songgraph"),
        step_version=step.version,
        sources_artifact=sources_artifact,
        stems_artifact=stems_artifact,
        audio_fingerprint=audio_fingerprint,
    )

    return {
        "artifacts.sources": sources_artifact,
        "artifacts.stems_generated": stems_artifact,
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
    sources_artifact: Mapping[str, Any],
    stems_artifact: Mapping[str, Any],
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
    node_versions["SourceSeparation"] = step_version
    graph["node_versions"] = node_versions

    artifacts = graph.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    artifacts["source_separation"] = {
        "sources": deepcopy(sources_artifact),
        "stems_generated": deepcopy(stems_artifact),
    }
    graph["artifacts"] = artifacts

    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
    for source in sources_artifact["items"]:
        node_id = f"source:{audio_fingerprint[:12]}:{source['role']}"
        _upsert_node(
            nodes,
            {
                "id": node_id,
                "type": "SourceNode",
                "data": {
                    "source_id": source["id"],
                    "role": source["role"],
                    "name": source["name"],
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

