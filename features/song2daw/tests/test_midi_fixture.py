from __future__ import annotations

import json
from pathlib import Path


def _read_u16(data: bytes, offset: int) -> tuple[int, int]:
    return int.from_bytes(data[offset : offset + 2], "big"), offset + 2


def _read_u32(data: bytes, offset: int) -> tuple[int, int]:
    return int.from_bytes(data[offset : offset + 4], "big"), offset + 4


def _read_vlq(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    while True:
        byte = data[offset]
        offset += 1
        value = (value << 7) | (byte & 0x7F)
        if (byte & 0x80) == 0:
            break
    return value, offset


def _parse_midi(path: Path) -> dict:
    raw = path.read_bytes()
    if raw[:4] != b"MThd":
        raise AssertionError("invalid midi header chunk")
    header_len = int.from_bytes(raw[4:8], "big")
    if header_len != 6:
        raise AssertionError("unsupported header length")
    offset = 8
    fmt, offset = _read_u16(raw, offset)
    tracks_count, offset = _read_u16(raw, offset)
    ppq, offset = _read_u16(raw, offset)

    tracks: list[dict] = []
    max_tick = 0
    for _ in range(tracks_count):
        if raw[offset : offset + 4] != b"MTrk":
            raise AssertionError("invalid track chunk")
        offset += 4
        track_len, offset = _read_u32(raw, offset)
        track_data = raw[offset : offset + track_len]
        offset += track_len

        tick = 0
        cursor = 0
        running_status = 0
        track_name = ""
        note_on_count = 0
        while cursor < len(track_data):
            delta, cursor = _read_vlq(track_data, cursor)
            tick += delta
            max_tick = max(max_tick, tick)
            status = track_data[cursor]
            if status < 0x80:
                if running_status == 0:
                    raise AssertionError("running status without prior status")
                status = running_status
            else:
                cursor += 1
                running_status = status

            if status == 0xFF:
                meta_type = track_data[cursor]
                cursor += 1
                meta_len, cursor = _read_vlq(track_data, cursor)
                meta_data = track_data[cursor : cursor + meta_len]
                cursor += meta_len
                if meta_type == 0x03:
                    track_name = meta_data.decode("latin-1", errors="replace")
                if meta_type == 0x2F:
                    break
                continue

            if status in (0xF0, 0xF7):
                sys_len, cursor = _read_vlq(track_data, cursor)
                cursor += sys_len
                continue

            kind = status & 0xF0
            if kind in (0xC0, 0xD0):
                cursor += 1
            else:
                data1 = track_data[cursor]
                data2 = track_data[cursor + 1]
                cursor += 2
                if kind == 0x90 and data2 > 0:
                    note_on_count += 1
                _ = data1

        tracks.append({"name": track_name, "note_on_count": note_on_count})

    return {
        "format": fmt,
        "tracks_count": tracks_count,
        "ppq": ppq,
        "max_tick": max_tick,
        "tracks": tracks,
    }


def test_controlled_midi_fixture_matches_expected_manifest():
    repo_root = Path(__file__).resolve().parents[3]
    expected_path = repo_root / "examples" / "song2daw" / "fixtures" / "expected" / "song2daw_10s_4inst.expected.json"
    expected = json.loads(expected_path.read_text(encoding="utf-8"))

    midi_path = repo_root / expected["midi_relative_path"]
    parsed = _parse_midi(midi_path)

    assert parsed["format"] == 1
    assert parsed["ppq"] == expected["ppq"]
    assert parsed["tracks_count"] == expected["tracks_total"]
    assert parsed["max_tick"] == expected["ticks_total"]

    by_name = {track["name"]: track["note_on_count"] for track in parsed["tracks"]}
    for track in expected["tracks"]:
        assert by_name.get(track["name"]) == track["notes_expected"]

    assert sum(by_name.values()) == expected["note_on_total"]
