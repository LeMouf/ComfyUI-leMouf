import io
import os

import pytest

import nodes


def test_list_workflow_files_is_recursive(monkeypatch):
    base = r"E:\repo\workflows"

    monkeypatch.setattr(nodes, "_workflows_dir", lambda: base)
    monkeypatch.setattr(os.path, "isdir", lambda path: path == base)
    monkeypatch.setattr(
        os,
        "walk",
        lambda _path: [
            (base, ["song2daw"], ["root.json", "ignore.txt"]),
            (base + r"\song2daw", [], ["song2daw_full_run_0-1-0.json"]),
        ],
    )
    monkeypatch.setattr(
        os.path,
        "isfile",
        lambda path: path.endswith("root.json") or path.endswith("song2daw_full_run_0-1-0.json"),
    )

    result = nodes._list_workflow_files()
    assert result == ["root.json", "song2daw/song2daw_full_run_0-1-0.json"]


def test_load_workflow_file_accepts_subpath(monkeypatch):
    base = r"E:\repo\workflows"
    expected_full = os.path.realpath(os.path.join(base, "song2daw", "wf.json"))
    calls = {}

    monkeypatch.setattr(nodes, "_workflows_dir", lambda: base)
    monkeypatch.setattr(os.path, "isfile", lambda path: os.path.realpath(path) == expected_full)

    def _fake_open(path, mode="r", encoding=None):
        calls["path"] = os.path.realpath(path)
        return io.StringIO('{"ok": true}')

    monkeypatch.setattr("builtins.open", _fake_open)

    data = nodes._load_workflow_file("song2daw/wf.json")
    assert data == {"ok": True}
    assert calls["path"] == expected_full


def test_load_workflow_file_rejects_parent_traversal():
    with pytest.raises(RuntimeError, match="invalid_name"):
        nodes._load_workflow_file("../evil.json")


def test_resolve_workflow_profile_from_workflow_node():
    workflow = {
        "nodes": [
            {
                "type": "LeMoufWorkflowProfile",
                "widgets_values": ["song2daw", "", "0.2.0", "1.0.0", "master"],
            }
        ]
    }

    profile = nodes._resolve_workflow_profile(workflow=workflow, prompt=None)

    assert profile["profile_id"] == "song2daw"
    assert profile["profile_version"] == "0.2.0"
    assert profile["ui_contract_version"] == "1.0.0"
    assert profile["workflow_kind"] == "master"
    assert profile["source"] == "workflow_node"


def test_resolve_workflow_profile_from_workflow_node_tool_profile():
    workflow = {
        "nodes": [
            {
                "type": "LeMoufWorkflowProfile",
                "widgets_values": ["tool", "", "0.1.0", "1.0.0", "master"],
            }
        ]
    }

    profile = nodes._resolve_workflow_profile(workflow=workflow, prompt=None)

    assert profile["profile_id"] == "tool"
    assert profile["profile_version"] == "0.1.0"
    assert profile["ui_contract_version"] == "1.0.0"
    assert profile["workflow_kind"] == "master"
    assert profile["source"] == "workflow_node"


def test_resolve_workflow_profile_from_prompt_node():
    prompt = {
        "13": {
            "class_type": "LeMoufWorkflowProfile",
            "inputs": {
                "profile_id": "custom",
                "profile_id_custom": "my_pipeline",
                "profile_version": "3.1.0",
                "ui_contract_version": "1.0.0",
                "workflow_kind": "branch",
            },
        }
    }

    profile = nodes._resolve_workflow_profile(workflow=None, prompt=prompt)

    assert profile["profile_id"] == "my_pipeline"
    assert profile["profile_version"] == "3.1.0"
    assert profile["ui_contract_version"] == "1.0.0"
    assert profile["workflow_kind"] == "branch"
    assert profile["source"] == "prompt_node"


def test_resolve_workflow_profile_heuristic_song2daw():
    workflow = {"nodes": [{"type": "Song2DawRun"}]}

    profile = nodes._resolve_workflow_profile(workflow=workflow, prompt=None)

    assert profile["profile_id"] == "song2daw"
    assert profile["workflow_kind"] == "master"
    assert profile["source"] == "heuristic_song2daw"


def test_resolve_workflow_profile_fallback_generic():
    workflow = {"nodes": [{"type": "LoopReturn"}]}

    profile = nodes._resolve_workflow_profile(workflow=workflow, prompt=None)

    assert profile["profile_id"] == "generic_loop"
    assert profile["workflow_kind"] == "master"
    assert profile["source"] == "fallback_generic"


def test_list_workflow_entries_includes_profile(monkeypatch):
    monkeypatch.setattr(nodes, "_list_workflow_files", lambda: ["a.json", "b.json"])
    monkeypatch.setattr(nodes, "_load_workflow_file", lambda name: {"nodes": [{"type": "Song2DawRun"}]} if name == "a.json" else {"nodes": []})

    entries = nodes._list_workflow_entries()

    assert [entry["name"] for entry in entries] == ["a.json", "b.json"]
    assert entries[0]["workflow_profile"]["profile_id"] == "song2daw"
    assert entries[0]["workflow_profile"]["workflow_kind"] == "master"
    assert entries[1]["workflow_profile"]["profile_id"] == "generic_loop"
