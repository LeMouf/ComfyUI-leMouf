from pathlib import Path

import pytest

from song2daw.core.graph import validate_songgraph
from song2daw.core.pipeline import load_pipeline_step
from song2daw.core.steps.source import make_source_separation_handler, run_source_separation_step


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "pipelines"


def test_run_source_separation_step_builds_valid_songgraph():
    step = load_pipeline_step(PIPELINES_DIR / "source_separation.yaml")
    base_songgraph = {
        "schema_version": "1.0.0",
        "pipeline_version": "0.1.0",
        "node_versions": {"StructureSegmentation": "0.1.0"},
        "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
        "nodes": [],
        "edges": [],
    }

    result = run_source_separation_step(
        {
            "artifacts.audio_canonical": {"id": "audio:abc", "sha256": "a" * 64},
            "songgraph": base_songgraph,
        },
        step,
    )

    assert "artifacts.sources" in result
    assert "artifacts.stems_generated" in result
    assert len(result["artifacts.sources"]["items"]) == 4
    assert result["songgraph"]["node_versions"]["SourceSeparation"] == step.version
    assert validate_songgraph(result["songgraph"]) is True


def test_run_source_separation_step_is_deterministic():
    step = load_pipeline_step(PIPELINES_DIR / "source_separation.yaml")
    inputs = {"artifacts.audio_canonical": {"id": "audio:abc", "sha256": "b" * 64}}

    first = run_source_separation_step(inputs, step)
    second = run_source_separation_step(inputs, step)

    assert first == second


def test_make_source_separation_handler_custom_roles():
    step = load_pipeline_step(PIPELINES_DIR / "source_separation.yaml")
    handler = make_source_separation_handler(source_roles=("kick", "snare"))

    result = handler({"artifacts.audio_canonical": {"id": "audio:abc", "sha256": "c" * 64}}, step)
    roles = [item["role"] for item in result["artifacts.sources"]["items"]]
    assert roles == ["kick", "snare"]


def test_run_source_separation_step_rejects_invalid_audio_ref():
    step = load_pipeline_step(PIPELINES_DIR / "source_separation.yaml")
    with pytest.raises(ValueError, match="artifacts.audio_canonical must be a string or mapping"):
        run_source_separation_step({"artifacts.audio_canonical": None}, step)
