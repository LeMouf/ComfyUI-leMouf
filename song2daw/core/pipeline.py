"""Deterministic pipeline manifest loader and executor for song2daw."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, Sequence, Tuple

import yaml

from song2daw.core.cache import build_step_cache_key


class PipelineValidationError(ValueError):
    """Raised when a pipeline manifest is invalid."""


class PipelineExecutionError(RuntimeError):
    """Raised when deterministic pipeline execution fails."""


@dataclass(frozen=True)
class PipelineStep:
    """Normalized immutable pipeline step manifest."""

    name: str
    version: str
    description: str
    inputs: Tuple[str, ...]
    outputs: Tuple[str, ...]
    updates_songgraph: bool
    source_path: str


PipelineHandler = Callable[[Mapping[str, Any], PipelineStep], Mapping[str, Any]]


def load_pipeline_step(path: str | Path) -> PipelineStep:
    """Load and validate a single YAML pipeline step manifest."""
    manifest_path = Path(path)
    if not manifest_path.exists():
        raise PipelineValidationError(f"manifest not found: {manifest_path}")

    raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise PipelineValidationError(f"manifest must be a mapping: {manifest_path}")

    name = _require_string(raw, "name", manifest_path)
    version = _require_string(raw, "version", manifest_path)
    description = _require_string(raw, "description", manifest_path)
    inputs = _require_string_list(raw, "inputs", manifest_path)
    outputs = _require_string_list(raw, "outputs", manifest_path)
    updates_songgraph = _require_bool(raw, "updates_songgraph", manifest_path)

    return PipelineStep(
        name=name,
        version=version,
        description=description,
        inputs=inputs,
        outputs=outputs,
        updates_songgraph=updates_songgraph,
        source_path=str(manifest_path),
    )


def load_pipeline_steps(paths: Sequence[str | Path]) -> Tuple[PipelineStep, ...]:
    """Load multiple manifests, preserving deterministic input order."""
    return tuple(load_pipeline_step(path) for path in paths)


def run_pipeline(
    steps: Sequence[PipelineStep],
    handlers: Mapping[str, PipelineHandler],
    *,
    inputs: Mapping[str, Any] | None = None,
    initial_artifacts: Mapping[str, Any] | None = None,
    songgraph: Dict[str, Any] | None = None,
    step_configs: Mapping[str, Mapping[str, Any]] | None = None,
    model_versions: Mapping[str, str] | None = None,
) -> Dict[str, Any]:
    """Execute deterministic step handlers using validated manifests."""
    context: Dict[str, Any] = dict(inputs or {})
    artifacts: Dict[str, Any] = dict(initial_artifacts or {})
    current_songgraph = songgraph
    step_results = []

    for index, step in enumerate(steps):
        handler = handlers.get(step.name)
        if handler is None:
            raise PipelineExecutionError(f"missing handler for step: {step.name}")

        step_inputs = _resolve_inputs(
            step=step,
            context=context,
            artifacts=artifacts,
            songgraph=current_songgraph,
        )
        step_config = dict((step_configs or {}).get(step.name) or {})
        try:
            cache_key = build_step_cache_key(
                step_name=step.name,
                step_version=step.version,
                inputs=step_inputs,
                config=step_config,
                model_versions=model_versions,
            )
        except ValueError as exc:
            raise PipelineExecutionError(f"step {step.name} cache key error: {exc}") from exc

        produced = handler(step_inputs, step)
        if not isinstance(produced, Mapping):
            raise PipelineExecutionError(f"step {step.name} returned non-mapping output")

        step_output = {}
        for output_name in step.outputs:
            if output_name not in produced:
                raise PipelineExecutionError(
                    f"step {step.name} missing declared output: {output_name}"
                )
            value = produced[output_name]
            step_output[output_name] = value
            context[output_name] = value
            if output_name.startswith("artifacts."):
                artifact_key = output_name.split(".", 1)[1]
                artifacts[artifact_key] = value

        if step.updates_songgraph and "songgraph" in produced:
            next_songgraph = produced["songgraph"]
            if not isinstance(next_songgraph, dict):
                raise PipelineExecutionError(f"step {step.name} produced invalid songgraph")
            current_songgraph = next_songgraph

        step_results.append(
            {
                "index": index,
                "name": step.name,
                "version": step.version,
                "cache_key": cache_key,
                "outputs": step_output,
            }
        )

    return {
        "artifacts": artifacts,
        "songgraph": current_songgraph,
        "steps": step_results,
    }


def _resolve_inputs(
    *,
    step: PipelineStep,
    context: Mapping[str, Any],
    artifacts: Mapping[str, Any],
    songgraph: Dict[str, Any] | None,
) -> Dict[str, Any]:
    resolved: Dict[str, Any] = {}
    for input_name in step.inputs:
        if input_name == "songgraph":
            if songgraph is None:
                raise PipelineExecutionError(f"step {step.name} missing required input: songgraph")
            resolved[input_name] = songgraph
            continue

        if input_name.startswith("artifacts."):
            artifact_key = input_name.split(".", 1)[1]
            if artifact_key not in artifacts:
                raise PipelineExecutionError(
                    f"step {step.name} missing required input: {input_name}"
                )
            resolved[input_name] = artifacts[artifact_key]
            continue

        if input_name not in context:
            raise PipelineExecutionError(
                f"step {step.name} missing required input: {input_name}"
            )
        resolved[input_name] = context[input_name]

    # Provide the current SongGraph snapshot to handlers as read-only context,
    # even when not explicitly listed in manifest inputs.
    if songgraph is not None and "songgraph" not in resolved:
        resolved["songgraph"] = songgraph

    return resolved


def _require_string(raw: Mapping[str, Any], key: str, path: Path) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise PipelineValidationError(f"{path}: field '{key}' must be a non-empty string")
    return value


def _require_string_list(raw: Mapping[str, Any], key: str, path: Path) -> Tuple[str, ...]:
    value = raw.get(key)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise PipelineValidationError(f"{path}: field '{key}' must be a list of strings")
    return tuple(value)


def _require_bool(raw: Mapping[str, Any], key: str, path: Path) -> bool:
    value = raw.get(key)
    if not isinstance(value, bool):
        raise PipelineValidationError(f"{path}: field '{key}' must be a boolean")
    return value
