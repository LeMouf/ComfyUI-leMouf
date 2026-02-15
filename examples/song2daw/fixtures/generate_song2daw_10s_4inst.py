from __future__ import annotations

import json
import struct
from pathlib import Path


PPQ = 480
BPM = 120
MICROSECONDS_PER_QUARTER = 500_000
DURATION_TICKS = 9_600  # 10.0s at 120 BPM with PPQ=480


def vlq(value: int) -> bytes:
    if value < 0:
        raise ValueError("vlq expects non-negative integers")
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.reverse()
    return bytes(out)


def meta_event(tick: int, meta_type: int, payload: bytes, order: int = 0) -> dict:
    return {"tick": int(tick), "order": int(order), "data": bytes([0xFF, meta_type]) + vlq(len(payload)) + payload}


def midi_event(tick: int, status: int, data1: int, data2: int, order: int = 10) -> dict:
    return {"tick": int(tick), "order": int(order), "data": bytes([status, data1 & 0x7F, data2 & 0x7F])}


def program_change(tick: int, channel: int, program: int) -> dict:
    return {"tick": int(tick), "order": 5, "data": bytes([0xC0 | (channel & 0x0F), program & 0x7F])}


def note_pair(events: list[dict], tick: int, duration: int, channel: int, note: int, velocity: int, order: int = 20) -> None:
    events.append(midi_event(tick, 0x90 | (channel & 0x0F), note, velocity, order=order))
    events.append(midi_event(tick + duration, 0x80 | (channel & 0x0F), note, 0, order=order + 1))


def encode_track(events: list[dict]) -> bytes:
    ordered = sorted(events, key=lambda item: (item["tick"], item["order"]))
    out = bytearray()
    last_tick = 0
    for event in ordered:
        tick = int(event["tick"])
        out.extend(vlq(max(0, tick - last_tick)))
        out.extend(event["data"])
        last_tick = tick
    if not ordered or ordered[-1]["tick"] != DURATION_TICKS:
        out.extend(vlq(max(0, DURATION_TICKS - last_tick)))
        out.extend(b"\xFF\x2F\x00")
    elif not ordered[-1]["data"].startswith(b"\xFF\x2F"):
        out.extend(vlq(0))
        out.extend(b"\xFF\x2F\x00")
    return b"MTrk" + struct.pack(">I", len(out)) + bytes(out)


def build_conductor_track() -> bytes:
    events = [
        meta_event(0, 0x03, b"Conductor"),
        meta_event(0, 0x51, MICROSECONDS_PER_QUARTER.to_bytes(3, "big")),
        meta_event(0, 0x58, bytes([4, 2, 24, 8])),
        meta_event(DURATION_TICKS, 0x2F, b"", order=99),
    ]
    return encode_track(events)


def build_drums_track() -> tuple[bytes, int]:
    events: list[dict] = [
        meta_event(0, 0x03, b"Drums MIDI"),
    ]
    note_count = 0
    for tick in range(0, DURATION_TICKS, 240):  # hi-hat eighths
        note_pair(events, tick, 70, channel=9, note=42, velocity=78, order=20)
        note_count += 1
    for tick in range(0, DURATION_TICKS, 480):  # kick quarters
        note_pair(events, tick, 90, channel=9, note=36, velocity=104, order=30)
        note_count += 1
    for tick in range(480, DURATION_TICKS, 960):  # snare beats 2 and 4
        note_pair(events, tick, 90, channel=9, note=38, velocity=96, order=40)
        note_count += 1
        tick_4 = tick + 480
        if tick_4 < DURATION_TICKS:
            note_pair(events, tick_4, 90, channel=9, note=38, velocity=96, order=41)
            note_count += 1
    events.append(meta_event(DURATION_TICKS, 0x2F, b"", order=99))
    return encode_track(events), note_count


def build_bass_track() -> tuple[bytes, int]:
    events: list[dict] = [
        meta_event(0, 0x03, b"Bass MIDI"),
        program_change(0, channel=0, program=33),  # Fingered Bass
    ]
    pattern = [36, 36, 38, 36, 43, 43, 41, 43]
    note_count = 0
    step = 480
    for i, tick in enumerate(range(0, DURATION_TICKS, step)):
        note = pattern[i % len(pattern)]
        note_pair(events, tick, 360, channel=0, note=note, velocity=90, order=20)
        note_count += 1
    events.append(meta_event(DURATION_TICKS, 0x2F, b"", order=99))
    return encode_track(events), note_count


def build_chords_track() -> tuple[bytes, int]:
    events: list[dict] = [
        meta_event(0, 0x03, b"Chords MIDI"),
        program_change(0, channel=1, program=48),  # Strings Ensemble
    ]
    triads = [
        [48, 52, 55],  # C
        [45, 48, 52],  # Am
        [41, 45, 48],  # F
        [43, 47, 50],  # G
    ]
    note_count = 0
    step = 960
    for i, tick in enumerate(range(0, DURATION_TICKS, step)):
        triad = triads[i % len(triads)]
        for note in triad:
            note_pair(events, tick, 900, channel=1, note=note, velocity=72, order=20)
            note_count += 1
    events.append(meta_event(DURATION_TICKS, 0x2F, b"", order=99))
    return encode_track(events), note_count


def build_lead_track() -> tuple[bytes, int]:
    events: list[dict] = [
        meta_event(0, 0x03, b"Lead MIDI"),
        program_change(0, channel=2, program=81),  # Lead 2 (saw)
    ]
    pattern = [60, 64, 67, 72, 67, 64, 62, 65]
    note_count = 0
    step = 240
    for i, tick in enumerate(range(0, DURATION_TICKS, step)):
        note = pattern[i % len(pattern)]
        note_pair(events, tick, 180, channel=2, note=note, velocity=84, order=20)
        note_count += 1
    events.append(meta_event(DURATION_TICKS, 0x2F, b"", order=99))
    return encode_track(events), note_count


def build_midi_file() -> tuple[bytes, dict]:
    tracks = [build_conductor_track()]
    drums_track, drums_notes = build_drums_track()
    bass_track, bass_notes = build_bass_track()
    chords_track, chords_notes = build_chords_track()
    lead_track, lead_notes = build_lead_track()
    tracks.extend([drums_track, bass_track, chords_track, lead_track])

    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), PPQ)
    midi_bytes = header + b"".join(tracks)

    expected = {
        "fixture_id": "song2daw_10s_4inst",
        "midi_relative_path": "examples/song2daw/fixtures/midi/song2daw_10s_4inst.mid",
        "duration_sec": 10.0,
        "tempo_bpm": BPM,
        "ppq": PPQ,
        "ticks_total": DURATION_TICKS,
        "tracks_total": 5,
        "instrument_tracks": 4,
        "note_on_total": drums_notes + bass_notes + chords_notes + lead_notes,
        "tracks": [
            {
                "name": "Drums MIDI",
                "kind": "midi",
                "channel": 10,
                "pattern": "kick/snare/hihat",
                "notes_expected": drums_notes,
                "pitch_min": 36,
                "pitch_max": 42,
            },
            {
                "name": "Bass MIDI",
                "kind": "midi",
                "channel": 1,
                "pattern": "quarter groove",
                "notes_expected": bass_notes,
                "pitch_min": 36,
                "pitch_max": 43,
            },
            {
                "name": "Chords MIDI",
                "kind": "midi",
                "channel": 2,
                "pattern": "half-note triads",
                "notes_expected": chords_notes,
                "pitch_min": 41,
                "pitch_max": 55,
            },
            {
                "name": "Lead MIDI",
                "kind": "midi",
                "channel": 3,
                "pattern": "eighth-note arpeggio",
                "notes_expected": lead_notes,
                "pitch_min": 60,
                "pitch_max": 72,
            },
        ],
        "expected_sections": [
            {"name": "section_1", "t0_sec": 0.0, "t1_sec": 5.0},
            {"name": "section_2", "t0_sec": 5.0, "t1_sec": 10.0},
        ],
    }
    return midi_bytes, expected


def main() -> None:
    root = Path(__file__).resolve().parent
    midi_dir = root / "midi"
    expected_dir = root / "expected"
    midi_dir.mkdir(parents=True, exist_ok=True)
    expected_dir.mkdir(parents=True, exist_ok=True)

    midi_bytes, expected = build_midi_file()
    midi_path = midi_dir / "song2daw_10s_4inst.mid"
    expected_path = expected_dir / "song2daw_10s_4inst.expected.json"

    midi_path.write_bytes(midi_bytes)
    expected_path.write_text(json.dumps(expected, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
