from features.tools.feature_versioning import bump_features, match_features_for_paths


def _sample_payload():
    return {
        "schema_version": 1,
        "features": {
            "song2daw": {
                "version": "0.3.2",
                "paths": ["features/song2daw/", "web/features/song2daw/"],
            },
            "composition": {
                "version": "0.3.2",
                "paths": ["web/features/composition/"],
            },
        },
    }


def test_match_features_for_paths_matches_prefixes():
    payload = _sample_payload()
    changed = [
        "features/song2daw/core/graph.py",
        "web/features/composition/studio_view.js",
    ]
    matched = match_features_for_paths(payload, changed)
    assert matched == ["composition", "song2daw"]


def test_bump_features_uses_default_and_override_levels():
    payload = _sample_payload()
    updated = bump_features(
        payload,
        features=["song2daw", "composition"],
        levels_by_feature={"song2daw": "medium"},
        default_level="minor",
    )
    assert updated["song2daw"] == "0.4.0"
    assert updated["composition"] == "0.3.3"

