import json
import os
import shutil
import sys
import types
from pathlib import Path

import pytest

import nodes


def test_song2daw_node_is_registered():
    assert "Song2DawRun" in nodes.NODE_CLASS_MAPPINGS
    assert nodes.NODE_CLASS_MAPPINGS["Song2DawRun"] is nodes.Song2DawRun


def test_workflow_profile_node_is_registered():
    assert "LeMoufWorkflowProfile" in nodes.NODE_CLASS_MAPPINGS
    assert nodes.NODE_CLASS_MAPPINGS["LeMoufWorkflowProfile"] is nodes.LeMoufWorkflowProfile


def test_workflow_profile_node_declares_custom_profile():
    node = nodes.LeMoufWorkflowProfile()
    flow, profile_id, profile_version, ui_contract_version, workflow_kind = node.declare(
        profile_id="custom",
        profile_id_custom="my_pipeline",
        profile_version="2.3.4",
        ui_contract_version="1.0.0",
        workflow_kind="branch",
        flow="seed_flow",
    )

    assert flow == "seed_flow"
    assert profile_id == "my_pipeline"
    assert profile_version == "2.3.4"
    assert ui_contract_version == "1.0.0"
    assert workflow_kind == "branch"


def test_workflow_profile_node_supports_tool_profile():
    node = nodes.LeMoufWorkflowProfile()
    input_types = node.INPUT_TYPES()
    profile_options = list(input_types["required"]["profile_id"][0])
    assert "tool" in profile_options

    flow, profile_id, profile_version, ui_contract_version, workflow_kind = node.declare(
        profile_id="tool",
        profile_id_custom="",
        profile_version="0.1.0",
        ui_contract_version="1.0.0",
        workflow_kind="master",
        flow="seed_flow",
    )

    assert flow == "seed_flow"
    assert profile_id == "tool"
    assert profile_version == "0.1.0"
    assert ui_contract_version == "1.0.0"
    assert workflow_kind == "master"


def test_loop_pipeline_step_input_types_include_composition_and_none_workflow(monkeypatch):
    monkeypatch.setattr(nodes, "_list_workflow_files", lambda: ["wf_a.json", "wf_b.json"])

    input_types = nodes.LoopPipelineStep.INPUT_TYPES()
    required = input_types["required"]
    optional = input_types["optional"]
    roles = list(required["role"][0])
    workflows = list(required["workflow"][0])

    assert "composition" in roles
    assert workflows[0] == "(none)"
    assert "wf_a.json" in workflows
    assert "wf_b.json" in workflows
    assert "resources_json" in optional
    assert optional["resources_json"][1]["default"] == "[]"


def test_loop_pipeline_step_input_types_fallback_to_none_workflow(monkeypatch):
    monkeypatch.setattr(nodes, "_list_workflow_files", lambda: [])

    input_types = nodes.LoopPipelineStep.INPUT_TYPES()
    workflows = list(input_types["required"]["workflow"][0])

    assert workflows == ["(none)"]


def test_loop_pipeline_step_noop_accepts_resources_json():
    node = nodes.LoopPipelineStep()
    (flow,) = node.noop(
        role="composition",
        workflow="(none)",
        resources_json='[{"kind":"image","filename":"x.png","type":"output"}]',
        flow="seed_flow",
    )
    assert flow == "seed_flow"


def test_song2daw_node_run_invokes_default_runner(monkeypatch):
    nodes.SONG2DAW_RUNS.clear()
    captured = {}

    def _fake_run_default_song2daw_pipeline(**kwargs):
        captured.update(kwargs)
        return {
            "songgraph": {
                "schema_version": "1.0.0",
                "pipeline_version": "0.1.0",
                "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
                "nodes": [],
                "edges": [],
            },
            "artifacts": {"tempo": {"bpm": 120.0}},
            "steps": [],
        }

    from song2daw.core import runner as runner_module

    monkeypatch.setattr(runner_module, "run_default_song2daw_pipeline", _fake_run_default_song2daw_pipeline)

    node = nodes.Song2DawRun()
    songgraph_json, artifacts_json, run_json, run_dir = node.run(
        "song.wav",
        "stems",
        '{"TempoAnalysis": {"window": 1024}}',
        '{"tempo_model": "1.0.0"}',
    )

    assert captured["audio_path"] == "song.wav"
    assert captured["stems_dir"] == "stems"
    assert captured["step_configs"] == {"TempoAnalysis": {"window": 1024}}
    assert captured["model_versions"] == {"tempo_model": "1.0.0"}
    assert json.loads(songgraph_json)["schema_version"] == "1.0.0"
    assert json.loads(artifacts_json)["tempo"]["bpm"] == 120.0
    assert json.loads(run_json)["artifacts"]["tempo"]["bpm"] == 120.0
    assert run_dir == ""
    runs = nodes.SONG2DAW_RUNS.list()
    assert len(runs) == 1
    assert runs[0].status == "ok"
    assert runs[0].summary["step_count"] == 0


def test_song2daw_node_rejects_invalid_step_configs_json():
    nodes.SONG2DAW_RUNS.clear()
    node = nodes.Song2DawRun()
    with pytest.raises(ValueError, match="step_configs json error"):
        node.run("song.wav", "stems", "{", "{}")
    assert nodes.SONG2DAW_RUNS.list() == []


def test_song2daw_node_writes_outputs_when_output_dir_set(monkeypatch):
    nodes.SONG2DAW_RUNS.clear()
    captured = {}

    def _fake_run_default_song2daw_pipeline(**kwargs):
        return {"songgraph": {}, "artifacts": {}, "steps": []}

    def _fake_save_run_outputs(result, output_dir, run_id=None):
        captured["result"] = result
        captured["output_dir"] = output_dir
        captured["run_id"] = run_id
        return Path(output_dir) / "song2daw_run_test"

    from song2daw.core import runner as runner_module

    monkeypatch.setattr(runner_module, "run_default_song2daw_pipeline", _fake_run_default_song2daw_pipeline)
    monkeypatch.setattr(runner_module, "save_run_outputs", _fake_save_run_outputs)

    node = nodes.Song2DawRun()
    _songgraph_json, _artifacts_json, _run_json, run_dir = node.run(
        "song.wav",
        "stems",
        "{}",
        "{}",
        "out_dir",
    )

    assert captured["output_dir"] == "out_dir"
    assert run_dir.endswith("song2daw_run_test")
    runs = nodes.SONG2DAW_RUNS.list()
    assert len(runs) == 1
    assert runs[0].run_dir.endswith("song2daw_run_test")


def test_song2daw_node_records_error_run(monkeypatch):
    nodes.SONG2DAW_RUNS.clear()

    def _fake_run_default_song2daw_pipeline(**_kwargs):
        raise RuntimeError("boom")

    from song2daw.core import runner as runner_module

    monkeypatch.setattr(runner_module, "run_default_song2daw_pipeline", _fake_run_default_song2daw_pipeline)

    node = nodes.Song2DawRun()
    with pytest.raises(RuntimeError, match="boom"):
        node.run("song.wav", "stems", "{}", "{}")

    runs = nodes.SONG2DAW_RUNS.list()
    assert len(runs) == 1
    assert runs[0].status == "error"
    assert runs[0].error == "boom"


def test_song2daw_build_ui_view_payload():
    run = nodes.Song2DawRunState(
        run_id="run_ui_payload",
        status="ok",
        audio_path="song.wav",
        stems_dir="stems",
        result={
            "songgraph": {
                "schema_version": "1.0.0",
                "pipeline_version": "0.1.0",
                "timebase": {"audio": {"sr": 44100}, "musical": {"ppq": 960}},
                "nodes": [],
                "edges": [],
            },
            "artifacts": {},
            "steps": [],
        },
    )

    payload = nodes._song2daw_build_ui_view_payload(run)

    assert payload["run_id"] == "run_ui_payload"
    assert payload["status"] == "ok"
    assert payload["valid"] is True
    assert payload["ui_view"]["song"]["id"] == "run_ui_payload"


def test_song2daw_collect_audio_assets(monkeypatch):
    run = nodes.Song2DawRunState(
        run_id="run_audio_assets",
        status="ok",
        audio_path="mix.wav",
        stems_dir="stems",
        run_dir="run_dir",
        result={
            "artifacts": {
                "stems_generated": {
                    "items": [
                        {
                            "source_id": "src:vocals",
                            "path_hint": "stem_vocals.wav",
                        }
                    ]
                }
            }
        },
    )
    resolved_paths = {
        "mix.wav": "E:/abs/mix.wav",
        "stem_vocals.wav": "E:/abs/stem_vocals.wav",
    }
    monkeypatch.setattr(
        nodes,
        "_resolve_run_audio_path",
        lambda _run, value: resolved_paths.get(str(value), None),
    )

    assets = nodes._song2daw_collect_audio_assets(run)

    assert assets["mix"] == "E:/abs/mix.wav"
    assert assets["source:src:vocals"] == "E:/abs/stem_vocals.wav"


def test_song2daw_collect_audio_assets_uses_preview_mix_for_midi(monkeypatch):
    run = nodes.Song2DawRunState(
        run_id="run_audio_midi",
        status="ok",
        audio_path="song.mid",
        stems_dir="stems",
        run_dir="run_dir",
        result={"artifacts": {}},
    )
    monkeypatch.setattr(
        nodes,
        "_resolve_run_audio_path",
        lambda _run, value: "E:/abs/song.mid" if str(value) == "song.mid" else None,
    )
    monkeypatch.setattr(
        nodes,
        "_song2daw_ensure_preview_mix_audio",
        lambda _run: "E:/abs/preview_mix.wav",
    )

    assets = nodes._song2daw_collect_audio_assets(run)

    assert assets["mix"] == "E:/abs/preview_mix.wav"
    assert assets["preview_mix"] == "E:/abs/preview_mix.wav"


def test_song2daw_ensure_preview_mix_audio_writes_deterministic_wave():
    temp_root = Path(__file__).resolve().parents[2] / "song2daw" / "tests" / ".tmp_preview_mix_audio"
    shutil.rmtree(temp_root, ignore_errors=True)
    run_dir = temp_root / "song2daw_run_test"
    run_dir.mkdir(parents=True, exist_ok=True)
    try:
        run = nodes.Song2DawRunState(
            run_id="run_preview_wave",
            status="ok",
            audio_path="song.mid",
            stems_dir="stems",
            run_dir=str(run_dir),
            result={
                "artifacts": {
                    "beatgrid": {"beats_sec": [0.0, 0.5, 1.0]},
                    "events": {
                        "items": [
                            {
                                "source_id": "src:bass:test",
                                "t0_sec": 0.0,
                                "t1_sec": 0.5,
                                "velocity": 96,
                                "midi_note": 48,
                            },
                            {
                                "source_id": "src:lead:test",
                                "t0_sec": 0.5,
                                "t1_sec": 1.0,
                                "velocity": 84,
                                "midi_note": 64,
                            },
                        ]
                    },
                }
            },
        )

        path_first = nodes._song2daw_ensure_preview_mix_audio(run)
        assert path_first is not None
        content_first = Path(path_first).read_bytes()
        assert content_first[:4] == b"RIFF"

        path_second = nodes._song2daw_ensure_preview_mix_audio(run)
        assert path_second == path_first
        content_second = Path(path_second).read_bytes()
        assert content_second == content_first
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def test_song2daw_resolve_audio_asset_path_unknown_asset(monkeypatch):
    run = nodes.Song2DawRunState(run_id="run_audio_missing", status="ok", audio_path="", stems_dir="", result={})
    monkeypatch.setattr(
        nodes,
        "_song2daw_collect_audio_assets",
        lambda _run: {"mix": "E:/abs/mix.wav"},
    )

    assert nodes._song2daw_resolve_audio_asset_path(run, "mix") == "E:/abs/mix.wav"
    assert nodes._song2daw_resolve_audio_asset_path(run, "source:unknown") is None


def test_song2daw_resolve_audio_asset_path_source_fallback(monkeypatch):
    run = nodes.Song2DawRunState(
        run_id="run_audio_source_fallback",
        status="ok",
        audio_path="workflow_mix.wav",
        stems_dir="",
        result={},
    )
    monkeypatch.setattr(nodes, "_song2daw_collect_audio_assets", lambda _run: {})
    monkeypatch.setattr(
        nodes,
        "_resolve_run_audio_path",
        lambda _run, value: "E:/abs/workflow_mix.wav" if str(value) == "workflow_mix.wav" else None,
    )

    assert (
        nodes._song2daw_resolve_audio_asset_path(run, "__source_audio")
        == "E:/abs/workflow_mix.wav"
    )
    assert nodes._song2daw_resolve_audio_asset_path(run, "mix") == "E:/abs/workflow_mix.wav"


def test_resolve_run_audio_path_uses_folder_paths_input_directory(monkeypatch):
    input_dir = os.path.realpath("E:/audio_input")
    expected_path = os.path.realpath(os.path.join(input_dir, "fixture.wav"))
    fake_folder_paths = types.SimpleNamespace(
        get_input_directory=lambda: input_dir,
        get_output_directory=lambda: os.path.realpath("E:/audio_output"),
        get_temp_directory=lambda: os.path.realpath("E:/audio_temp"),
    )
    monkeypatch.setitem(sys.modules, "folder_paths", fake_folder_paths)
    monkeypatch.setattr(
        nodes.os.path,
        "isfile",
        lambda path: os.path.realpath(path) == expected_path,
    )

    run = nodes.Song2DawRunState(
        run_id="run_input_dir",
        status="ok",
        audio_path="fixture.wav",
        stems_dir="",
        result={},
    )

    resolved = nodes._resolve_run_audio_path(run, "fixture.wav")
    assert resolved == expected_path
