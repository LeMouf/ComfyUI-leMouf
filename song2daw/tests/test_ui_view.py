import json
from pathlib import Path

import song2daw.core.ui_view as ui_view_module
from song2daw.core.runner import run_default_song2daw_pipeline
from song2daw.core.ui_view import build_ui_view, validate_ui_view


def test_build_ui_view_from_default_run_is_valid():
    result = run_default_song2daw_pipeline(audio_path="song.wav", stems_dir="stems")

    view = build_ui_view(
        result,
        run_id="run_test",
        audio_path="song.wav",
        stems_dir="stems",
    )

    assert validate_ui_view(view) is True
    assert view["song"]["id"] == "run_test"
    assert view["timebase"]["sr"] == 44100
    assert view["timebase"]["ppq"] == 960
    assert view["tracks"][0]["id"] == "trk_mix"
    assert view["tracks"][0]["track_group"] == "step_tracks"
    midi_tracks = [track for track in view["tracks"] if track.get("kind") == "midi"]
    assert midi_tracks
    assert all(track.get("track_group") == "obtained_midi" for track in midi_tracks)


def test_build_ui_view_is_deterministic():
    result = run_default_song2daw_pipeline(audio_path="song.wav", stems_dir="stems")
    kwargs = {
        "run_id": "run_test",
        "audio_path": "song.wav",
        "stems_dir": "stems",
    }

    first = build_ui_view(result, **kwargs)
    second = build_ui_view(result, **kwargs)

    assert first == second


def test_validate_ui_view_fallback_without_jsonschema(monkeypatch):
    result = run_default_song2daw_pipeline(audio_path="song.wav", stems_dir="stems")
    view = build_ui_view(result, run_id="fallback_run", audio_path="song.wav", stems_dir="stems")

    monkeypatch.setattr(ui_view_module, "Draft202012Validator", None)
    assert ui_view_module.validate_ui_view(view) is True

    invalid = dict(view)
    invalid["tracks"] = [{"id": "bad"}]
    assert ui_view_module.validate_ui_view(invalid) is False


def test_sample_ui_view_fixture_is_valid():
    fixture_path = Path(__file__).resolve().parents[2] / "examples" / "song2daw" / "ui" / "sample_ui_view.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

    assert validate_ui_view(fixture) is True
