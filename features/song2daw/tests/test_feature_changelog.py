from features.tools.feature_changelog import (
    group_entries_by_feature,
    parse_conventional_header,
    render_feature_changelog,
    resolve_feature_from_scope,
    trim_entries,
)


def _payload():
    return {
        "schema_version": 1,
        "features": {
            "song2daw": {"version": "0.3.2", "paths": ["features/song2daw/"], "scopes": ["s2d"]},
            "composition": {"version": "0.3.2", "paths": ["web/features/composition/"]},
        },
    }


def test_parse_conventional_header_ok():
    parsed = parse_conventional_header("feat(song2daw): add run hydration")
    assert parsed is not None
    assert parsed["type"] == "feat"
    assert parsed["scope"] == "song2daw"


def test_resolve_feature_from_scope_alias():
    aliases = {"song2daw": "song2daw", "s2d": "song2daw"}
    assert resolve_feature_from_scope("s2d", aliases) == "song2daw"


def test_group_entries_by_feature_uses_scope():
    commits = [
        {"hash": "aaaa1111", "date": "2026-02-17", "subject": "feat(song2daw): add graph"},
        {"hash": "bbbb2222", "date": "2026-02-17", "subject": "fix(composition): align clip"},
        {"hash": "cccc3333", "date": "2026-02-17", "subject": "update stuff"},
    ]
    grouped = group_entries_by_feature(commits, _payload())
    assert len(grouped["song2daw"]) == 1
    assert len(grouped["composition"]) == 1


def test_trim_entries_limits_output():
    grouped = {
        "song2daw": [{"hash": "1"}, {"hash": "2"}, {"hash": "3"}],
        "composition": [],
    }
    trimmed = trim_entries(grouped, max_entries=2)
    assert len(trimmed["song2daw"]) == 2


def test_render_feature_changelog_contains_sections():
    grouped = {
        "song2daw": [{"hash": "aaaa1111", "date": "2026-02-17", "raw": "feat(song2daw): add graph"}],
        "composition": [],
    }
    text = render_feature_changelog(_payload(), grouped)
    assert "## song2daw (0.3.2)" in text
    assert "feat(song2daw): add graph" in text
    assert "## composition (0.3.2)" in text

