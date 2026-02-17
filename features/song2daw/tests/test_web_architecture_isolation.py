from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_workflows_root_has_no_json_files():
    root = _repo_root() / "workflows"
    root_json = sorted(path.name for path in root.glob("*.json"))
    assert root_json == []


def test_examples_root_only_allows_readme():
    root = _repo_root() / "examples"
    files = sorted(path.name for path in root.glob("*") if path.is_file())
    assert files in ([], ["README.md"])


def test_composition_uses_studio_engine_timeline():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert '../studio_engine/timeline.js' in studio_view
    assert "../song2daw/studio_timeline.js" not in studio_view


def test_song2daw_timeline_is_adapter_to_engine():
    adapter = (_repo_root() / "web" / "features" / "song2daw" / "studio_timeline.js").read_text(encoding="utf-8")
    assert "../studio_engine/timeline.js" in adapter


def test_web_entrypoint_is_studio_only():
    studio_entry = _repo_root() / "web" / "lemouf_studio.js"
    legacy_entry = _repo_root() / "web" / "lemouf_loop.js"
    assert studio_entry.exists()
    assert legacy_entry.exists()
    studio_text = studio_entry.read_text(encoding="utf-8")
    legacy_text = legacy_entry.read_text(encoding="utf-8")
    assert 'import "./lemouf_loop.js"' not in studio_text
    assert "registerExtension" in studio_text
    assert "registerExtension" not in legacy_text
