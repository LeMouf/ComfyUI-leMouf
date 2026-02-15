from pathlib import Path

import pytest

from song2daw.core.graph import validate_songgraph
from song2daw.core.pipeline import load_pipeline_step, load_pipeline_steps, run_pipeline
from song2daw.core.steps.ingest import make_ingest_handler
from song2daw.core.steps.tempo import make_tempo_handler, run_tempo_analysis_step


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_run_tempo_analysis_step_builds_valid_songgraph():
    step = load_pipeline_step(PIPELINES_DIR / "tempo_analysis.yaml")
    base_songgraph = {
        "schema_version": "1.0.0",
        "pipeline_version": "0.1.0",
        "node_versions": {"Ingest": "0.1.0"},
        "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
        "nodes": [],
        "edges": [],
    }

    result = run_tempo_analysis_step(
        {
            "artifacts.audio_canonical": {"id": "audio:abc", "sha256": "a" * 64},
            "songgraph": base_songgraph,
        },
        step,
    )

    assert "artifacts.tempo" in result
    assert "artifacts.beatgrid" in result
    assert result["songgraph"]["node_versions"]["TempoAnalysis"] == step.version
    assert validate_songgraph(result["songgraph"]) is True


def test_run_tempo_analysis_step_is_deterministic():
    step = load_pipeline_step(PIPELINES_DIR / "tempo_analysis.yaml")
    inputs = {"artifacts.audio_canonical": {"id": "audio:abc", "sha256": "b" * 64}}

    first = run_tempo_analysis_step(inputs, step)
    second = run_tempo_analysis_step(inputs, step)

    assert first == second


def test_run_tempo_analysis_step_rejects_invalid_audio_ref():
    step = load_pipeline_step(PIPELINES_DIR / "tempo_analysis.yaml")
    with pytest.raises(ValueError, match="artifacts.audio_canonical must be a string or mapping"):
        run_tempo_analysis_step({"artifacts.audio_canonical": 123}, step)


def test_run_pipeline_ingest_then_tempo_with_builtin_handlers():
    steps = load_pipeline_steps(
        (
            PIPELINES_DIR / "ingest.yaml",
            PIPELINES_DIR / "tempo_analysis.yaml",
        )
    )
    result = run_pipeline(
        steps,
        handlers={
            "Ingest": make_ingest_handler(),
            "TempoAnalysis": make_tempo_handler(default_bpm=128.0, beat_interval_sec=0.5),
        },
        inputs={"audio_path": "song.wav", "stems_dir": "stems"},
    )

    assert "tempo" in result["artifacts"]
    assert "beatgrid" in result["artifacts"]
    assert result["songgraph"]["node_versions"]["Ingest"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["TempoAnalysis"] == "0.1.0"
    assert validate_songgraph(result["songgraph"]) is True
