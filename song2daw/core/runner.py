"""High-level deterministic runner for the default song2daw pipeline."""

from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, Mapping, Sequence

from song2daw.core.pipeline import PipelineHandler, load_pipeline_steps, run_pipeline
from song2daw.core.steps import (
    make_effect_estimation_handler,
    make_event_extraction_handler,
    make_ingest_handler,
    make_projection_reaper_handler,
    make_source_separation_handler,
    make_structure_handler,
    make_tempo_handler,
)


DEFAULT_PIPELINE_MANIFESTS: tuple[str, ...] = (
    "ingest.yaml",
    "tempo_analysis.yaml",
    "structure_segmentation.yaml",
    "source_separation.yaml",
    "event_extraction.yaml",
    "effect_estimation.yaml",
    "projection_reaper.yaml",
)


def get_default_pipeline_paths(pipelines_dir: str | Path | None = None) -> tuple[Path, ...]:
    """Return ordered default pipeline manifest paths."""
    base = Path(pipelines_dir) if pipelines_dir is not None else Path(__file__).resolve().parents[1] / "pipelines"
    return tuple(base / name for name in DEFAULT_PIPELINE_MANIFESTS)


def build_default_handlers() -> Dict[str, PipelineHandler]:
    """Return deterministic built-in handler mapping for the default chain."""
    return {
        "Ingest": make_ingest_handler(),
        "TempoAnalysis": make_tempo_handler(),
        "StructureSegmentation": make_structure_handler(),
        "SourceSeparation": make_source_separation_handler(),
        "EventExtraction": make_event_extraction_handler(),
        "EffectEstimation": make_effect_estimation_handler(),
        "ProjectionReaper": make_projection_reaper_handler(),
    }


def run_default_song2daw_pipeline(
    *,
    audio_path: str,
    stems_dir: str,
    pipelines_dir: str | Path | None = None,
    handlers_override: Mapping[str, PipelineHandler] | None = None,
    step_configs: Mapping[str, Mapping[str, Any]] | None = None,
    model_versions: Mapping[str, str] | None = None,
    initial_artifacts: Mapping[str, Any] | None = None,
    initial_songgraph: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Execute the full default song2daw chain deterministically."""
    paths: Sequence[Path] = get_default_pipeline_paths(pipelines_dir)
    steps = load_pipeline_steps(paths)

    handlers = build_default_handlers()
    if handlers_override:
        handlers.update(dict(handlers_override))

    return run_pipeline(
        steps,
        handlers=handlers,
        inputs={"audio_path": audio_path, "stems_dir": stems_dir},
        initial_artifacts=initial_artifacts,
        songgraph=initial_songgraph,
        step_configs=step_configs,
        model_versions=model_versions,
    )


def save_run_outputs(
    result: Mapping[str, Any],
    output_dir: str | Path,
    *,
    run_id: str | None = None,
) -> Path:
    """Write deterministic run outputs (SongGraph/artifacts/run JSON) to disk."""
    raw_output_dir = str(output_dir).strip()
    if not raw_output_dir:
        raise ValueError("output_dir must be a non-empty path")
    base = Path(raw_output_dir)

    resolved_run_id = run_id.strip() if isinstance(run_id, str) and run_id.strip() else _build_run_id(result)
    run_dir = base / f"song2daw_run_{resolved_run_id}"
    run_dir.mkdir(parents=True, exist_ok=True)

    songgraph_payload = result.get("songgraph", {})
    artifacts_payload = result.get("artifacts", {})
    run_payload = dict(result)

    (run_dir / "SongGraph.json").write_text(
        json.dumps(songgraph_payload, indent=2, sort_keys=True, ensure_ascii=True),
        encoding="utf-8",
    )
    (run_dir / "artifacts.json").write_text(
        json.dumps(artifacts_payload, indent=2, sort_keys=True, ensure_ascii=True),
        encoding="utf-8",
    )
    (run_dir / "run.json").write_text(
        json.dumps(run_payload, indent=2, sort_keys=True, ensure_ascii=True),
        encoding="utf-8",
    )
    return run_dir


def _build_run_id(result: Mapping[str, Any]) -> str:
    payload = json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return sha256(payload.encode("utf-8")).hexdigest()[:16]
