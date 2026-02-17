from pathlib import Path

import pytest

from features.song2daw.core.graph import validate_songgraph
from features.song2daw.core.pipeline import load_pipeline_step, load_pipeline_steps, run_pipeline
from features.song2daw.core.steps.ingest import make_ingest_handler
from features.song2daw.core.steps.structure import make_structure_handler, run_structure_segmentation_step
from features.song2daw.core.steps.tempo import make_tempo_handler


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_run_structure_segmentation_step_builds_valid_songgraph():
    step = load_pipeline_step(PIPELINES_DIR / "structure_segmentation.yaml")
    base_songgraph = {
        "schema_version": "1.0.0",
        "pipeline_version": "0.1.0",
        "node_versions": {"TempoAnalysis": "0.1.0"},
        "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
        "nodes": [],
        "edges": [],
    }

    result = run_structure_segmentation_step(
        {
            "artifacts.audio_canonical": {"id": "audio:abc", "sha256": "a" * 64},
            "artifacts.beatgrid": {"beats_sec": [0.0, 0.5, 1.0, 1.5, 2.0]},
            "songgraph": base_songgraph,
        },
        step,
        section_span_beats=2,
    )

    assert "artifacts.sections" in result
    assert len(result["artifacts.sections"]["sections"]) == 2
    assert result["songgraph"]["node_versions"]["StructureSegmentation"] == step.version
    assert validate_songgraph(result["songgraph"]) is True


def test_run_structure_segmentation_step_is_deterministic():
    step = load_pipeline_step(PIPELINES_DIR / "structure_segmentation.yaml")
    inputs = {
        "artifacts.audio_canonical": {"id": "audio:abc", "sha256": "b" * 64},
        "artifacts.beatgrid": {"beats_sec": [0.0, 0.5, 1.0, 1.5]},
    }

    first = run_structure_segmentation_step(inputs, step, section_span_beats=2)
    second = run_structure_segmentation_step(inputs, step, section_span_beats=2)

    assert first == second


def test_run_structure_segmentation_step_rejects_invalid_beatgrid():
    step = load_pipeline_step(PIPELINES_DIR / "structure_segmentation.yaml")
    with pytest.raises(ValueError, match="strictly increasing"):
        run_structure_segmentation_step(
            {
                "artifacts.audio_canonical": {"id": "audio:abc", "sha256": "c" * 64},
                "artifacts.beatgrid": {"beats_sec": [0.0, 1.0, 0.9]},
            },
            step,
        )


def test_run_pipeline_ingest_tempo_structure_with_builtin_handlers():
    steps = load_pipeline_steps(
        (
            PIPELINES_DIR / "ingest.yaml",
            PIPELINES_DIR / "tempo_analysis.yaml",
            PIPELINES_DIR / "structure_segmentation.yaml",
        )
    )
    result = run_pipeline(
        steps,
        handlers={
            "Ingest": make_ingest_handler(),
            "TempoAnalysis": make_tempo_handler(default_bpm=120.0, beat_interval_sec=0.5, beats_count=16),
            "StructureSegmentation": make_structure_handler(section_span_beats=4),
        },
        inputs={"audio_path": "song.wav", "stems_dir": "stems"},
    )

    assert "sections" in result["artifacts"]
    assert len(result["artifacts"]["sections"]["sections"]) > 0
    assert result["songgraph"]["node_versions"]["Ingest"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["TempoAnalysis"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["StructureSegmentation"] == "0.1.0"
    assert validate_songgraph(result["songgraph"]) is True
