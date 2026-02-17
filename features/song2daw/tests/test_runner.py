import pytest
from pathlib import Path

from features.song2daw.core.graph import validate_songgraph
from features.song2daw.core.runner import (
    DEFAULT_PIPELINE_MANIFESTS,
    build_default_handlers,
    get_default_pipeline_paths,
    run_default_song2daw_pipeline,
    save_run_outputs,
)


def test_get_default_pipeline_paths_matches_manifest_order():
    paths = get_default_pipeline_paths()
    names = tuple(path.name for path in paths)
    assert names == DEFAULT_PIPELINE_MANIFESTS


def test_build_default_handlers_covers_default_steps():
    handlers = build_default_handlers()
    assert set(handlers.keys()) == {
        "Ingest",
        "TempoAnalysis",
        "StructureSegmentation",
        "SourceSeparation",
        "EventExtraction",
        "EffectEstimation",
        "ProjectionReaper",
    }


def test_run_default_song2daw_pipeline_smoke():
    result = run_default_song2daw_pipeline(audio_path="song.wav", stems_dir="stems")

    assert "reaper_rpp" in result["artifacts"]
    assert "export_manifest" in result["artifacts"]
    assert validate_songgraph(result["songgraph"]) is True
    assert [step["name"] for step in result["steps"]] == [
        "Ingest",
        "TempoAnalysis",
        "StructureSegmentation",
        "SourceSeparation",
        "EventExtraction",
        "EffectEstimation",
        "ProjectionReaper",
    ]


def test_run_default_song2daw_pipeline_is_deterministic():
    kwargs = {
        "audio_path": "song.wav",
        "stems_dir": "stems",
        "model_versions": {"tempo_model": "1.0.0"},
        "step_configs": {"TempoAnalysis": {"window": 1024}},
    }
    first = run_default_song2daw_pipeline(**kwargs)
    second = run_default_song2daw_pipeline(**kwargs)

    assert first == second


def test_save_run_outputs_writes_expected_files_deterministically(monkeypatch):
    result = {
        "songgraph": {
            "schema_version": "1.0.0",
            "pipeline_version": "0.1.0",
            "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
            "nodes": [],
            "edges": [],
        },
        "artifacts": {"tempo": {"bpm": 120.0}},
        "steps": [{"name": "TempoAnalysis", "cache_key": "abc"}],
    }

    mkdir_calls = []
    writes = {}

    def _fake_mkdir(self, parents=False, exist_ok=False):
        mkdir_calls.append((str(self), parents, exist_ok))

    def _fake_write_text(self, text, encoding="utf-8"):
        writes[str(self)] = {"text": text, "encoding": encoding}
        return len(text)

    monkeypatch.setattr(Path, "mkdir", _fake_mkdir)
    monkeypatch.setattr(Path, "write_text", _fake_write_text)

    first_dir = save_run_outputs(result, "out_dir")
    second_dir = save_run_outputs(result, "out_dir")

    assert first_dir == second_dir
    assert len(mkdir_calls) == 2
    assert str(first_dir / "SongGraph.json") in writes
    assert str(first_dir / "artifacts.json") in writes
    assert str(first_dir / "run.json") in writes
    assert writes[str(first_dir / "run.json")]["text"] == writes[str(second_dir / "run.json")]["text"]


def test_save_run_outputs_rejects_empty_output_dir():
    with pytest.raises(ValueError, match="output_dir must be a non-empty path"):
        save_run_outputs({"songgraph": {}, "artifacts": {}, "steps": []}, "")
