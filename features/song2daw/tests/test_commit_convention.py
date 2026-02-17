from features.tools.commit_convention import validate_header, validate_message


def test_validate_header_accepts_conventional_format():
    assert validate_header("feat(song2daw): add run inspector") == []
    assert validate_header("fix(loop)!: reset stale composition state") == []


def test_validate_header_rejects_invalid_format():
    errors = validate_header("update stuff")
    assert errors


def test_validate_header_rejects_trailing_period():
    errors = validate_header("chore: bump version.")
    assert "subject must not end with a period" in errors


def test_validate_message_allows_merge_revert_fixup():
    assert validate_message('Merge branch "main"') == []
    assert validate_message('Revert "feat: add ui"') == []
    assert validate_message("fixup! feat(loop): improve retry flow") == []

