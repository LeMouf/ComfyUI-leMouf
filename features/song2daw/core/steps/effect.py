"""Deterministic EffectEstimation step for song2daw."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from typing import Any, Callable, Dict, Mapping, Protocol


class StepLike(Protocol):
    """Minimal step contract used by built-in handlers."""

    name: str
    version: str


def make_effect_estimation_handler(
    *,
    default_mix: float = 0.2,
) -> Callable[[Mapping[str, Any], StepLike], Dict[str, Any]]:
    """Return a two-argument handler compatible with `run_pipeline`."""
    return lambda step_inputs, step: run_effect_estimation_step(
        step_inputs,
        step,
        default_mix=default_mix,
    )


def run_effect_estimation_step(
    step_inputs: Mapping[str, Any],
    step: StepLike,
    *,
    default_mix: float = 0.2,
) -> Dict[str, Any]:
    """Build deterministic FX suggestions from sources + sections."""
    if not isinstance(default_mix, (int, float)) or not (0.0 <= float(default_mix) <= 1.0):
        raise ValueError("default_mix must be in [0.0, 1.0]")

    sources = _extract_sources(step_inputs.get("artifacts.sources"))
    sections = _extract_sections(step_inputs.get("artifacts.sections"))
    suggestions = []

    for source in sources:
        source_id = source["id"]
        profile = []
        for section in sections:
            section_id = section["id"]
            token = f"{source_id}:{section_id}:{step.version}"
            digest = sha256(token.encode("utf-8")).hexdigest()
            reverb = round(float(default_mix) + (int(digest[:2], 16) / 255.0) * 0.4, 4)
            delay = round((int(digest[2:4], 16) / 255.0) * 0.35, 4)
            compression = round(1.5 + (int(digest[4:6], 16) / 255.0) * 3.5, 4)
            profile.append(
                {
                    "section_id": section_id,
                    "reverb_mix": min(reverb, 1.0),
                    "delay_mix": min(delay, 1.0),
                    "compression_ratio": compression,
                }
            )
        suggestions.append(
            {
                "source_id": source_id,
                "profile": profile,
            }
        )

    fx_artifact = {
        "items": suggestions,
        "method": "deterministic_placeholder_v1",
    }

    songgraph = _merge_songgraph(
        step_inputs.get("songgraph"),
        step_version=step.version,
        fx_artifact=fx_artifact,
    )

    return {
        "artifacts.fx_suggestions": fx_artifact,
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


def _extract_sections(sections_ref: Any) -> list[Dict[str, Any]]:
    if isinstance(sections_ref, Mapping):
        items = sections_ref.get("sections")
    else:
        items = sections_ref

    if not isinstance(items, list) or not items:
        raise ValueError("artifacts.sections must be a non-empty list or mapping with sections")

    normalized = []
    for item in items:
        if not isinstance(item, Mapping):
            raise ValueError("artifacts.sections entries must be mappings")
        section_id = item.get("id")
        if not isinstance(section_id, str) or not section_id.strip():
            raise ValueError("artifacts.sections entries must include non-empty id")
        normalized.append({"id": section_id.strip()})
    return normalized


def _merge_songgraph(
    base_graph: Any,
    *,
    step_version: str,
    fx_artifact: Mapping[str, Any],
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
    node_versions["EffectEstimation"] = step_version
    graph["node_versions"] = node_versions

    artifacts = graph.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    artifacts["effect_estimation"] = {"fx_suggestions": deepcopy(fx_artifact)}
    graph["artifacts"] = artifacts

    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
    for item in fx_artifact["items"]:
        source_id = item["source_id"]
        _upsert_node(
            nodes,
            {
                "id": f"fx:{source_id}",
                "type": "EffectNode",
                "data": {
                    "source_id": source_id,
                    "sections_count": len(item["profile"]),
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

