import io
import os

import pytest

from backend.workflows import catalog, profiles


def test_catalog_is_feature_scoped_name():
    assert catalog.is_feature_scoped_workflow_name("song2daw/wf.json")
    assert not catalog.is_feature_scoped_workflow_name("wf.json")
    assert not catalog.is_feature_scoped_workflow_name("../wf.json")


def test_catalog_list_filters_root_json(monkeypatch):
    base = r"E:\repo\workflows"
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
    assert catalog.list_workflow_files(base) == ["song2daw/song2daw_full_run_0-1-0.json"]


def test_catalog_load_accepts_feature_scoped(monkeypatch):
    base = r"E:\repo\workflows"
    expected = os.path.realpath(os.path.join(base, "song2daw", "wf.json"))
    calls = {}

    monkeypatch.setattr(os.path, "isfile", lambda path: os.path.realpath(path) == expected)

    def _fake_open(path, mode="r", encoding=None):
        calls["path"] = os.path.realpath(path)
        return io.StringIO('{"ok": true}')

    monkeypatch.setattr("builtins.open", _fake_open)
    assert catalog.load_workflow_file("song2daw/wf.json", base) == {"ok": True}
    assert calls["path"] == expected


def test_catalog_load_rejects_root_level():
    with pytest.raises(RuntimeError, match="invalid_name"):
        catalog.load_workflow_file("root.json", r"E:\repo\workflows")


def test_profiles_resolve_heuristic_song2daw():
    profile = profiles.resolve_workflow_profile(workflow={"nodes": [{"type": "Song2DawRun"}]}, prompt=None)
    assert profile["profile_id"] == "song2daw"
    assert profile["source"] == "heuristic_song2daw"

