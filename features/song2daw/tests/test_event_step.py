from pathlib import Path

import pytest

from features.song2daw.core.graph import validate_songgraph
from features.song2daw.core.pipeline import load_pipeline_step, load_pipeline_steps, run_pipeline
from features.song2daw.core.steps.event import make_event_extraction_handler, run_event_extraction_step
from features.song2daw.core.steps.ingest import make_ingest_handler
from features.song2daw.core.steps.source import make_source_separation_handler
from features.song2daw.core.steps.structure import make_structure_handler
from features.song2daw.core.steps.tempo import make_tempo_handler


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_run_event_extraction_step_builds_valid_songgraph():
    step = load_pipeline_step(PIPELINES_DIR / "event_extraction.yaml")
    base_songgraph = {
        "schema_version": "1.0.0",
        "pipeline_version": "0.1.0",
        "node_versions": {"SourceSeparation": "0.1.0"},
        "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
        "nodes": [],
        "edges": [],
    }

    result = run_event_extraction_step(
        {
            "artifacts.sources": {"items": [{"id": "src:drums:abc"}, {"id": "src:bass:abc"}]},
            "artifacts.beatgrid": {"beats_sec": [0.0, 0.5, 1.0, 1.5]},
            "songgraph": base_songgraph,
        },
        step,
    )

    assert "artifacts.events" in result
    assert "artifacts.midi_optional" in result
    assert len(result["artifacts.events"]["items"]) == 6
    assert result["songgraph"]["node_versions"]["EventExtraction"] == step.version
    assert validate_songgraph(result["songgraph"]) is True


def test_run_event_extraction_step_is_deterministic():
    step = load_pipeline_step(PIPELINES_DIR / "event_extraction.yaml")
    inputs = {
        "artifacts.sources": {"items": [{"id": "src:drums:abc"}]},
        "artifacts.beatgrid": {"beats_sec": [0.0, 0.5, 1.0]},
    }

    first = run_event_extraction_step(inputs, step)
    second = run_event_extraction_step(inputs, step)

    assert first == second


def test_run_event_extraction_step_default_uses_full_beatgrid_span():
    step = load_pipeline_step(PIPELINES_DIR / "event_extraction.yaml")
    beats = [index * 0.5 for index in range(12)]
    result = run_event_extraction_step(
        {
            "artifacts.sources": {"items": [{"id": "src:drums:abc"}]},
            "artifacts.beatgrid": {"beats_sec": beats},
        },
        step,
    )
    events = result["artifacts.events"]["items"]
    assert len(events) == len(beats) - 1
    assert events[-1]["t1_sec"] == beats[-1]


def test_run_event_extraction_step_rejects_invalid_sources():
    step = load_pipeline_step(PIPELINES_DIR / "event_extraction.yaml")
    with pytest.raises(ValueError, match="artifacts.sources must be a non-empty list or mapping with items"):
        run_event_extraction_step(
            {"artifacts.sources": [], "artifacts.beatgrid": {"beats_sec": [0.0, 0.5]}},
            step,
        )


def test_run_pipeline_until_event_extraction_with_builtin_handlers():
    steps = load_pipeline_steps(
        (
            PIPELINES_DIR / "ingest.yaml",
            PIPELINES_DIR / "tempo_analysis.yaml",
            PIPELINES_DIR / "structure_segmentation.yaml",
            PIPELINES_DIR / "source_separation.yaml",
            PIPELINES_DIR / "event_extraction.yaml",
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
        },
        inputs={"audio_path": "song.wav", "stems_dir": "stems"},
    )

    assert "events" in result["artifacts"]
    assert "midi_optional" in result["artifacts"]
    assert result["songgraph"]["node_versions"]["Ingest"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["TempoAnalysis"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["StructureSegmentation"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["SourceSeparation"] == "0.1.0"
    assert result["songgraph"]["node_versions"]["EventExtraction"] == "0.1.0"
    assert validate_songgraph(result["songgraph"]) is True
