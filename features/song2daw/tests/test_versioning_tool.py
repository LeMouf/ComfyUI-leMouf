from features.tools.versioning import (
    bump_semver,
    ensure_changelog_release,
    replace_init_version,
    replace_readme_version,
)


def test_bump_semver_levels():
    assert bump_semver("0.3.2", "minor") == "0.3.3"
    assert bump_semver("0.3.2", "medium") == "0.4.0"
    assert bump_semver("0.3.2", "major") == "1.0.0"


def test_replace_init_version_updates_single_value():
    src = '__version__ = "0.3.2"\n'
    out = replace_init_version(src, "0.3.3")
    assert out == '__version__ = "0.3.3"\n'


def test_replace_readme_version_updates_status_line():
    src = "Current version: `0.3.2`\n"
    out = replace_readme_version(src, "0.3.3")
    assert out == "Current version: `0.3.3`\n"


def test_ensure_changelog_release_is_idempotent():
    src = "# Changelog\n\n## 0.3.2 - 2026-02-16\n\n- sample\n"
    out = ensure_changelog_release(src, "0.3.3", "2026-02-17")
    assert "## 0.3.3 - 2026-02-17" in out
    out2 = ensure_changelog_release(out, "0.3.3", "2026-02-17")
    assert out2 == out

