from pathlib import Path

import pytest

from song2daw.core.pipeline import (
    PipelineExecutionError,
    load_pipeline_step,
    load_pipeline_steps,
    run_pipeline,
)
from song2daw.core.steps.ingest import make_ingest_handler


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_load_pipeline_step_ingest_manifest():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")

    assert step.name == "Ingest"
    assert step.version == "0.1.0"
    assert step.inputs == ("audio_path", "stems_dir")
    assert step.outputs == ("artifacts.audio_canonical", "artifacts.stems_canonical")
    assert step.updates_songgraph is True


def test_run_pipeline_executes_in_declared_order():
    steps = load_pipeline_steps(
        (
            PIPELINES_DIR / "ingest.yaml",
            PIPELINES_DIR / "tempo_analysis.yaml",
        )
    )
    call_order = []

    def ingest_handler(step_inputs, _step):
        call_order.append("Ingest")
        assert step_inputs["audio_path"] == "song.wav"
        return {
            "artifacts.audio_canonical": "audio_canonical.wav",
            "artifacts.stems_canonical": "stems_canonical",
        }

    def tempo_handler(step_inputs, _step):
        call_order.append("TempoAnalysis")
        assert step_inputs["artifacts.audio_canonical"] == "audio_canonical.wav"
        return {
            "artifacts.tempo": {"bpm": 120},
            "artifacts.beatgrid": [0.0, 0.5, 1.0],
            "songgraph": {"schema_version": "1.0.0"},
        }

    result = run_pipeline(
        steps,
        handlers={"Ingest": ingest_handler, "TempoAnalysis": tempo_handler},
        inputs={"audio_path": "song.wav", "stems_dir": "stems_src"},
    )

    assert call_order == ["Ingest", "TempoAnalysis"]
    assert result["artifacts"]["audio_canonical"] == "audio_canonical.wav"
    assert result["artifacts"]["tempo"] == {"bpm": 120}
    assert [step["name"] for step in result["steps"]] == ["Ingest", "TempoAnalysis"]


def test_run_pipeline_raises_on_missing_required_input():
    step = load_pipeline_step(PIPELINES_DIR / "tempo_analysis.yaml")

    with pytest.raises(PipelineExecutionError, match="missing required input: artifacts.audio_canonical"):
        run_pipeline(
            (step,),
            handlers={"TempoAnalysis": lambda _inputs, _step: {}},
        )


def test_run_pipeline_same_inputs_same_result():
    steps = load_pipeline_steps(
        (
            PIPELINES_DIR / "ingest.yaml",
            PIPELINES_DIR / "tempo_analysis.yaml",
        )
    )

    def ingest_handler(_inputs, _step):
        return {
            "artifacts.audio_canonical": "audio_canonical.wav",
            "artifacts.stems_canonical": "stems_canonical",
        }

    def tempo_handler(_inputs, _step):
        return {
            "artifacts.tempo": {"bpm": 128},
            "artifacts.beatgrid": [0.0, 0.5, 1.0],
        }

    kwargs = {
        "handlers": {"Ingest": ingest_handler, "TempoAnalysis": tempo_handler},
        "inputs": {"audio_path": "song.wav", "stems_dir": "stems_src"},
    }
    first = run_pipeline(steps, **kwargs)
    second = run_pipeline(steps, **kwargs)

    assert first == second


def test_run_pipeline_emits_cache_key_per_step():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")

    result = run_pipeline(
        (step,),
        handlers={
            "Ingest": lambda _inputs, _step: {
                "artifacts.audio_canonical": "audio_canonical.wav",
                "artifacts.stems_canonical": "stems_canonical",
            }
        },
        inputs={"audio_path": "song.wav", "stems_dir": "stems_src"},
        step_configs={"Ingest": {"normalize": True}},
        model_versions={"ingest_model": "0.0.1"},
    )

    step_result = result["steps"][0]
    assert isinstance(step_result["cache_key"], str)
    assert len(step_result["cache_key"]) == 64


def test_run_pipeline_with_builtin_ingest_handler():
    step = load_pipeline_step(PIPELINES_DIR / "ingest.yaml")
    result = run_pipeline(
        (step,),
        handlers={"Ingest": make_ingest_handler()},
        inputs={"audio_path": "song.wav", "stems_dir": "stems"},
    )

    assert "audio_canonical" in result["artifacts"]
    assert isinstance(result["songgraph"], dict)
    assert result["songgraph"]["node_versions"]["Ingest"] == "0.1.0"
