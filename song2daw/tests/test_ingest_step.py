from pathlib import Path

import pytest

from song2daw.core.graph import validate_songgraph
from song2daw.core.pipeline import load_pipeline_step
from song2daw.core.steps.ingest import make_ingest_handler, run_ingest_step


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_run_ingest_step_builds_valid_songgraph_and_artifacts():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")

    result = run_ingest_step(
        {"audio_path": "E:\\audio\\song.wav", "stems_dir": "E:\\audio\\stems"},
        step,
    )

    assert "artifacts.audio_canonical" in result
    assert "artifacts.stems_canonical" in result
    assert validate_songgraph(result["songgraph"]) is True
    assert result["songgraph"]["pipeline_version"] == step.version
    assert result["songgraph"]["node_versions"]["Ingest"] == step.version


def test_run_ingest_step_is_deterministic():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")
    inputs = {"audio_path": "C:\\song.wav", "stems_dir": "C:\\stems"}

    first = run_ingest_step(inputs, step)
    second = run_ingest_step(inputs, step)

    assert first == second


def test_make_ingest_handler_uses_custom_timebase():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")
    handler = make_ingest_handler(sample_rate=48000, ppq=1920)

    result = handler({"audio_path": "song.wav", "stems_dir": "stems"}, step)

    assert result["songgraph"]["timebase"]["audio"]["sr"] == 48000
    assert result["songgraph"]["timebase"]["musical"]["ppq"] == 1920


def test_run_ingest_step_rejects_invalid_inputs():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")

    with pytest.raises(ValueError, match="audio_path must be a non-empty string"):
        run_ingest_step({"audio_path": "", "stems_dir": "stems"}, step)
