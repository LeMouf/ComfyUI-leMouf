from pathlib import Path

import pytest

from song2daw.core.graph import validate_songgraph
from song2daw.core.pipeline import load_pipeline_step, load_pipeline_steps, run_pipeline
from song2daw.core.steps.effect import make_effect_estimation_handler, run_effect_estimation_step
from song2daw.core.steps.event import make_event_extraction_handler
from song2daw.core.steps.ingest import make_ingest_handler
from song2daw.core.steps.projection import make_projection_reaper_handler, run_projection_reaper_step
from song2daw.core.steps.source import make_source_separation_handler
from song2daw.core.steps.structure import make_structure_handler
from song2daw.core.steps.tempo import make_tempo_handler


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_run_effect_estimation_step_builds_valid_songgraph():
    step = load_pipeline_step(PIPELINES_DIR / "effect_estimation.yaml")
    base_songgraph = {
        "schema_version": "1.0.0",
        "pipeline_version": "0.1.0",
        "node_versions": {"EventExtraction": "0.1.0"},
        "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
        "nodes": [],
        "edges": [],
    }

    result = run_effect_estimation_step(
        {
            "artifacts.sources": {"items": [{"id": "src:drums:abc"}, {"id": "src:bass:abc"}]},
            "artifacts.sections": {"sections": [{"id": "section_001"}, {"id": "section_002"}]},
            "songgraph": base_songgraph,
        },
        step,
    )

    assert "artifacts.fx_suggestions" in result
    assert len(result["artifacts.fx_suggestions"]["items"]) == 2
    assert result["songgraph"]["node_versions"]["EffectEstimation"] == step.version
    assert validate_songgraph(result["songgraph"]) is True


def test_run_projection_reaper_step_outputs_expected_artifacts():
    step = load_pipeline_step(PIPELINES_DIR / "projection_reaper.yaml")
    result = run_projection_reaper_step(
        {
            "songgraph": {
                "schema_version": "1.0.0",
                "pipeline_version": "0.1.0",
                "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
                "nodes": [],
                "edges": [],
            },
            "artifacts.stems_generated": {"items": [{"stem_id": "s1"}, {"stem_id": "s2"}]},
            "artifacts.tempo": {"bpm": 120.0},
            "artifacts.sections": {"sections": [{"id": "section_001"}]},
            "artifacts.fx_suggestions": {"items": [{"source_id": "src:drums:abc"}]},
        },
        step,
    )

    assert "artifacts.reaper_rpp" in result
    assert "artifacts.export_manifest" in result
    assert result["artifacts.reaper_rpp"]["track_count"] == 2


def test_run_projection_reaper_step_rejects_invalid_songgraph():
    step = load_pipeline_step(PIPELINES_DIR / "projection_reaper.yaml")
    with pytest.raises(ValueError, match="songgraph must be provided as a mapping"):
        run_projection_reaper_step(
            {
                "songgraph": None,
                "artifacts.stems_generated": {"items": []},
                "artifacts.tempo": {"bpm": 120.0},
                "artifacts.sections": {"sections": []},
                "artifacts.fx_suggestions": {"items": []},
            },
            step,
        )


def test_run_pipeline_full_chain_until_projection_reaper():
    steps = load_pipeline_steps(
        (
            PIPELINES_DIR / "ingest.yaml",
            PIPELINES_DIR / "tempo_analysis.yaml",
            PIPELINES_DIR / "structure_segmentation.yaml",
            PIPELINES_DIR / "source_separation.yaml",
            PIPELINES_DIR / "event_extraction.yaml",
            PIPELINES_DIR / "effect_estimation.yaml",
            PIPELINES_DIR / "projection_reaper.yaml",
        )
    )
    result = run_pipeline(
        steps,
        handlers={
            "Ingest": make_ingest_handler(),
            "TempoAnalysis": make_tempo_handler(beats_count=12),
            "StructureSegmentation": make_structure_handler(section_span_beats=4),
            "SourceSeparation": make_source_separation_handler(),
            "EventExtraction": make_event_extraction_handler(max_events_per_source=6),
            "EffectEstimation": make_effect_estimation_handler(default_mix=0.25),
            "ProjectionReaper": make_projection_reaper_handler(project_name="demo"),
        },
        inputs={"audio_path": "song.wav", "stems_dir": "stems"},
    )

    assert "reaper_rpp" in result["artifacts"]
    assert "export_manifest" in result["artifacts"]
    assert result["songgraph"]["node_versions"]["Ingest"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["TempoAnalysis"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["StructureSegmentation"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["SourceSeparation"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["EventExtraction"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["EffectEstimation"] == "0.1.0"
    assert "ProjectionReaper" not in result["songgraph"]["node_versions"]
    assert validate_songgraph(result["songgraph"]) is True
