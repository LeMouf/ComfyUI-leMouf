import pytest

from features.song2daw.core.composition_manifest import (
    COMPOSITION_MANIFEST_SCHEMA_VERSION,
    build_composition_manifest,
    parse_composition_resources_json,
)


def test_parse_composition_resources_json_accepts_list_and_object():
    parsed_list = parse_composition_resources_json('[{"kind":"image","uri":"a.png"}]')
    parsed_obj = parse_composition_resources_json('{"resources":[{"kind":"audio","uri":"b.wav"}]}')

    assert isinstance(parsed_list, list)
    assert isinstance(parsed_obj, list)
    assert parsed_list[0]["uri"] == "a.png"
    assert parsed_obj[0]["uri"] == "b.wav"


def test_parse_composition_resources_json_rejects_invalid_shape():
    with pytest.raises(ValueError, match="resources_json must be a list"):
        parse_composition_resources_json('{"invalid": 1}')


def test_build_composition_manifest_is_deterministic_and_normalized():
    resources = [
        "assets/video/clip.mp4",
        {
            "id": "song_audio",
            "kind": "audio",
            "uri": "assets/audio/mix.wav",
            "channels": 2,
            "sample_rate": 48000,
            "unknown_field": "ignored",
            "meta": {"duration_s": 7.5, "bad": "ignored"},
        },
        {
            "filename": "image_01.png",
            "type": "output",
            "subfolder": "tests/composition",
            "label": "hero frame",
        },
    ]

    manifest_a = build_composition_manifest(resources, duration_s=10, fps=30)
    manifest_b = build_composition_manifest(resources, duration_s=10, fps=30)

    assert manifest_a == manifest_b
    assert manifest_a["schema_version"] == COMPOSITION_MANIFEST_SCHEMA_VERSION
    assert manifest_a["duration_s"] == 10.0
    assert manifest_a["fps"] == 30.0
    assert len(manifest_a["resources"]) == 3

    first = manifest_a["resources"][0]
    second = manifest_a["resources"][1]
    third = manifest_a["resources"][2]

    assert first["kind"] == "video"
    assert first["uri"] == "assets/video/clip.mp4"

    assert second["id"] == "song_audio"
    assert second["kind"] == "audio"
    assert second["meta"]["channels"] == 2.0
    assert second["meta"]["channel_mode"] == "stereo"
    assert second["meta"]["sample_rate"] == 48000.0
    assert second["meta"]["duration_s"] == 7.5
    assert "unknown_field" not in second

    assert third["kind"] == "image"
    assert third["filename"] == "image_01.png"
    assert third["type"] == "output"
    assert third["subfolder"] == "tests/composition"
    assert third["label"] == "hero frame"

