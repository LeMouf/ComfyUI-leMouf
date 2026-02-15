"""Deterministic UI view-model adapter for song2daw runs."""

from __future__ import annotations

import json
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover
    Draft202012Validator = None


def build_ui_view(
    run_result: Mapping[str, Any],
    *,
    run_id: str = "",
    audio_path: str = "",
    stems_dir: str = "",
) -> Dict[str, Any]:
    """Build a deterministic UI view-model from a pipeline run result."""
    artifacts = _as_mapping(run_result.get("artifacts"))
    songgraph = _as_mapping(run_result.get("songgraph"))

    sr = _positive_int(_nested(songgraph, ("timebase", "audio", "sr")), fallback=44100)
    ppq = _positive_int(_nested(songgraph, ("timebase", "musical", "ppq")), fallback=960)

    beats = _extract_numeric_list(_nested(artifacts.get("beatgrid"), ("beats_sec",)))
    downbeats = _extract_numeric_list(_nested(artifacts.get("beatgrid"), ("downbeats_sec",)))
    if not downbeats and beats:
        downbeats = [point for index, point in enumerate(beats) if index % 4 == 0]

    bpm = _positive_float(_nested(artifacts.get("tempo"), ("bpm",)), fallback=120.0)
    tempo = [
        {
            "t_sec": 0.0,
            "bar": 1,
            "bpm": round(bpm, 4),
            "numerator": 4,
            "denominator": 4,
        }
    ]

    sections = _extract_sections(artifacts.get("sections"))
    events = _extract_events(artifacts.get("events"))
    events_by_source = _group_events_by_source(events)

    duration_sec = _compute_duration(beats=beats, downbeats=downbeats, sections=sections, events=events)

    sources = _extract_sources(artifacts.get("sources"))
    stems_by_source = _extract_stem_map(artifacts.get("stems_generated"))
    tracks = _build_tracks(
        duration_sec=duration_sec,
        sources=sources,
        stems_by_source=stems_by_source,
        events_by_source=events_by_source,
        artifacts=artifacts,
        audio_path=audio_path,
    )

    song_id = str(run_id).strip() or _stable_song_id(audio_path, stems_dir, songgraph)
    view = {
        "song": {
            "id": song_id,
            "duration_sec": duration_sec,
        },
        "timebase": {
            "sr": sr,
            "ppq": ppq,
        },
        "tempo": tempo,
        "beats": {
            "downbeats_sec": downbeats,
            "beats_sec": beats,
        },
        "sections": sections,
        "tracks": tracks,
        "meta": {
            "run_id": str(run_id or ""),
            "audio_path": _normalize_path(audio_path),
            "stems_dir": _normalize_path(stems_dir),
            "artifact_keys": sorted(str(key) for key in artifacts.keys()),
        },
    }
    return view


def validate_ui_view(view: Mapping[str, Any]) -> bool:
    """Return True when a view-model is valid against schema or fallback checks."""
    if not isinstance(view, Mapping):
        return False

    if Draft202012Validator is None:
        return _validate_ui_view_fallback(view)

    validator = Draft202012Validator(_load_ui_view_schema())
    return not any(validator.iter_errors(dict(view)))


@lru_cache(maxsize=1)
def _load_ui_view_schema() -> Dict[str, Any]:
    schema_path = Path(__file__).resolve().parents[1] / "schemas" / "ui_view.schema.json"
    return json.loads(schema_path.read_text(encoding="utf-8"))


def _validate_ui_view_fallback(view: Mapping[str, Any]) -> bool:
    song = view.get("song")
    timebase = view.get("timebase")
    tracks = view.get("tracks")

    if not isinstance(song, Mapping):
        return False
    if not isinstance(timebase, Mapping):
        return False
    if not isinstance(tracks, list):
        return False

    song_id = song.get("id")
    if not isinstance(song_id, str) or not song_id.strip():
        return False
    if _positive_int(timebase.get("sr"), fallback=0) < 1:
        return False
    if _positive_int(timebase.get("ppq"), fallback=0) < 1:
        return False

    for track in tracks:
        if not isinstance(track, Mapping):
            return False
        if not isinstance(track.get("id"), str) or not str(track.get("id")).strip():
            return False
        if not isinstance(track.get("name"), str):
            return False
        if not isinstance(track.get("kind"), str):
            return False
        clips = track.get("clips")
        if not isinstance(clips, list):
            return False
        for clip in clips:
            if not isinstance(clip, Mapping):
                return False
            if not isinstance(clip.get("id"), str) or not str(clip.get("id")).strip():
                return False
            if not isinstance(clip.get("kind"), str):
                return False
            t0 = _positive_float(clip.get("t0_sec"), fallback=-1.0)
            t1 = _positive_float(clip.get("t1_sec"), fallback=-1.0)
            if t0 < 0 or t1 < 0 or t1 < t0:
                return False
    return True


def _build_tracks(
    *,
    duration_sec: float,
    sources: list[Dict[str, Any]],
    stems_by_source: Mapping[str, str],
    events_by_source: Mapping[str, list[Dict[str, Any]]],
    artifacts: Mapping[str, Any],
    audio_path: str,
) -> list[Dict[str, Any]]:
    tracks: list[Dict[str, Any]] = []

    mix_clip = {
        "id": "clip_mix_main",
        "kind": "audio",
        "t0_sec": 0.0,
        "t1_sec": duration_sec,
        "asset": _normalize_path(audio_path),
        "origin_step_index": 0,
    }
    tracks.append(
        {
            "id": "trk_mix",
            "name": "Mix",
            "kind": "audio",
            "track_group": "step_tracks",
            "color": _stable_color_hex("trk_mix"),
            "clips": [mix_clip],
            "origin_step_index": 0,
        }
    )

    audio_tracks: list[Dict[str, Any]] = []
    midi_tracks: list[Dict[str, Any]] = []
    for source in sources:
        source_id = source["id"]
        source_name = source["name"]
        stem_asset = _normalize_path(stems_by_source.get(source_id, ""))
        source_events = list(events_by_source.get(source_id, []))

        clip_t0, clip_t1 = _events_bounds(source_events, duration_sec=duration_sec)
        audio_tracks.append(
            {
                "id": f"trk_{_safe_id(source_id)}",
                "name": source_name,
                "kind": "audio",
                "track_group": "step_tracks",
                "color": _stable_color_hex(source_id),
                "clips": [
                    {
                        "id": f"clip_{_safe_id(source_id)}_audio",
                        "kind": "audio",
                        "t0_sec": clip_t0,
                        "t1_sec": clip_t1,
                        "asset": stem_asset,
                        "source_id": source_id,
                        "origin_step_index": 3,
                    }
                ],
                "origin_step_index": 3,
            }
        )

        if source_events:
            notes = []
            for event in source_events:
                notes.append(
                    {
                        "t0_sec": event["t0_sec"],
                        "dur_sec": max(0.01, event["t1_sec"] - event["t0_sec"]),
                        "pitch": event["midi_note"],
                        "vel": event["velocity"],
                        "chan": event["midi_channel"],
                        "label": event["kind"],
                    }
                )
            midi_tracks.append(
                {
                    "id": f"trk_{_safe_id(source_id)}_midi",
                    "name": f"{source_name} MIDI",
                    "kind": "midi",
                    "track_group": "obtained_midi",
                    "color": _stable_color_hex(f"{source_id}:midi"),
                    "clips": [
                        {
                            "id": f"clip_{_safe_id(source_id)}_midi",
                            "kind": "midi",
                            "t0_sec": clip_t0,
                            "t1_sec": clip_t1,
                            "notes": notes,
                            "source_id": source_id,
                            "origin_step_index": 4,
                        }
                    ],
                    "origin_step_index": 4,
                }
            )

    extras: list[Dict[str, Any]] = []
    if isinstance(artifacts.get("fx_suggestions"), Mapping):
        extras.append(
            {
                "id": "trk_fx_suggestions",
                "name": "FX Suggestions",
                "kind": "fx",
                "track_group": "step_tracks",
                "color": _stable_color_hex("trk_fx_suggestions"),
                "clips": [
                    {
                        "id": "clip_fx_suggestions",
                        "kind": "fx",
                        "t0_sec": 0.0,
                        "t1_sec": duration_sec,
                        "origin_step_index": 5,
                    }
                ],
                "origin_step_index": 5,
            }
        )
    if isinstance(artifacts.get("reaper_rpp"), Mapping):
        extras.append(
            {
                "id": "trk_reaper_project",
                "name": "Reaper Project",
                "kind": "project",
                "track_group": "step_tracks",
                "color": _stable_color_hex("trk_reaper_project"),
                "clips": [
                    {
                        "id": "clip_reaper_project",
                        "kind": "project",
                        "t0_sec": 0.0,
                        "t1_sec": duration_sec,
                        "origin_step_index": 6,
                    }
                ],
                "origin_step_index": 6,
            }
        )

    def _track_sort_key(track: Mapping[str, Any]) -> tuple[str, str]:
        return (str(track.get("name", "")).lower(), str(track.get("id", "")))

    tracks.extend(sorted(audio_tracks, key=_track_sort_key))
    tracks.extend(sorted(midi_tracks, key=_track_sort_key))
    tracks.extend(sorted(extras, key=_track_sort_key))
    return tracks


def _extract_sections(raw_sections: Any) -> list[Dict[str, Any]]:
    entries = _extract_list(raw_sections, "sections")
    sections: list[Dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        t0 = _positive_float(entry.get("t0_sec"), fallback=None)
        t1 = _positive_float(entry.get("t1_sec"), fallback=None)
        if t0 is None:
            t0 = _positive_float(entry.get("start_sec"), fallback=None)
        if t1 is None:
            t1 = _positive_float(entry.get("end_sec"), fallback=None)
        if t0 is None or t1 is None or t1 < t0:
            continue
        label = str(entry.get("label") or entry.get("name") or entry.get("id") or "section").strip()
        confidence = _positive_float(entry.get("confidence"), fallback=None)
        section = {
            "label": label or "section",
            "t0_sec": round(float(t0), 6),
            "t1_sec": round(float(t1), 6),
            "origin_step_index": 2,
        }
        if confidence is not None:
            section["confidence"] = round(confidence, 6)
        sections.append(section)
    sections.sort(key=lambda value: (value["t0_sec"], value["t1_sec"], value["label"]))
    return sections


def _extract_sources(raw_sources: Any) -> list[Dict[str, Any]]:
    entries = _extract_list(raw_sources, "items")
    sources: list[Dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        source_id = str(entry.get("id") or "").strip()
        if not source_id:
            continue
        name = str(entry.get("name") or entry.get("role") or source_id).strip()
        role = str(entry.get("role") or "").strip()
        sources.append({"id": source_id, "name": name or source_id, "role": role})
    sources.sort(key=lambda value: (value["name"].lower(), value["id"]))
    return sources


def _extract_stem_map(raw_stems: Any) -> Dict[str, str]:
    entries = _extract_list(raw_stems, "items")
    stems: Dict[str, str] = {}
    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        source_id = str(entry.get("source_id") or "").strip()
        if not source_id:
            continue
        path_hint = _normalize_path(entry.get("path_hint"))
        if not path_hint:
            path_hint = _normalize_path(entry.get("path"))
        stems[source_id] = path_hint
    return stems


def _extract_events(raw_events: Any) -> list[Dict[str, Any]]:
    entries = _extract_list(raw_events, "items")
    events: list[Dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        source_id = str(entry.get("source_id") or "").strip()
        if not source_id:
            continue
        t0 = _positive_float(entry.get("t0_sec"), fallback=None)
        t1 = _positive_float(entry.get("t1_sec"), fallback=None)
        if t0 is None or t1 is None or t1 < t0:
            continue
        event_id = str(entry.get("id") or f"evt_{len(events) + 1:03}").strip()
        events.append(
            {
                "id": event_id,
                "source_id": source_id,
                "kind": str(entry.get("kind") or "event"),
                "t0_sec": round(t0, 6),
                "t1_sec": round(t1, 6),
                "velocity": _bounded_int(entry.get("velocity"), fallback=96, low=1, high=127),
                "midi_note": _bounded_int(entry.get("midi_note"), fallback=60, low=0, high=127),
                "midi_channel": _bounded_int(entry.get("midi_channel"), fallback=1, low=1, high=16),
            }
        )
    events.sort(key=lambda value: (value["source_id"], value["t0_sec"], value["t1_sec"], value["id"]))
    return events


def _group_events_by_source(events: Iterable[Dict[str, Any]]) -> Dict[str, list[Dict[str, Any]]]:
    grouped: Dict[str, list[Dict[str, Any]]] = {}
    for event in events:
        grouped.setdefault(event["source_id"], []).append(event)
    for source_id in list(grouped.keys()):
        grouped[source_id] = sorted(
            grouped[source_id],
            key=lambda value: (value["t0_sec"], value["t1_sec"], value["id"]),
        )
    return grouped


def _compute_duration(
    *,
    beats: list[float],
    downbeats: list[float],
    sections: list[Mapping[str, Any]],
    events: list[Mapping[str, Any]],
) -> float:
    candidates: list[float] = [1.0]
    candidates.extend(beats)
    candidates.extend(downbeats)
    for section in sections:
        candidates.append(float(section.get("t1_sec", 0.0)))
    for event in events:
        candidates.append(float(event.get("t1_sec", 0.0)))
    return round(max(candidates), 6)


def _events_bounds(events: list[Dict[str, Any]], *, duration_sec: float) -> tuple[float, float]:
    if not events:
        return 0.0, duration_sec
    t0 = min(event["t0_sec"] for event in events)
    t1 = max(event["t1_sec"] for event in events)
    if t1 <= t0:
        t1 = min(duration_sec, t0 + 0.01)
    return round(t0, 6), round(max(t1, t0 + 0.01), 6)


def _extract_numeric_list(raw: Any) -> list[float]:
    if not isinstance(raw, list):
        return []
    values = []
    for value in raw:
        number = _positive_float(value, fallback=None)
        if number is None:
            continue
        values.append(round(number, 6))
    unique_sorted = sorted(set(values))
    return unique_sorted


def _extract_list(raw: Any, key: str) -> list[Any]:
    if isinstance(raw, Mapping):
        value = raw.get(key)
    else:
        value = raw
    return list(value) if isinstance(value, list) else []


def _nested(raw: Any, path: tuple[str, ...]) -> Any:
    current = raw
    for part in path:
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _as_mapping(raw: Any) -> Dict[str, Any]:
    return dict(raw) if isinstance(raw, Mapping) else {}


def _positive_int(raw: Any, *, fallback: int) -> int:
    try:
        value = int(raw)
    except Exception:
        return fallback
    return value if value > 0 else fallback


def _positive_float(raw: Any, *, fallback: float | None) -> float | None:
    try:
        value = float(raw)
    except Exception:
        return fallback
    if value < 0:
        return fallback
    return value


def _bounded_int(raw: Any, *, fallback: int, low: int, high: int) -> int:
    try:
        value = int(raw)
    except Exception:
        return fallback
    if value < low:
        return low
    if value > high:
        return high
    return value


def _safe_id(value: str) -> str:
    cleaned = []
    for char in str(value):
        if char.isalnum() or char in ("_", "-"):
            cleaned.append(char)
        else:
            cleaned.append("_")
    text = "".join(cleaned).strip("_")
    return text or "item"


def _stable_song_id(audio_path: str, stems_dir: str, songgraph: Mapping[str, Any]) -> str:
    payload = {
        "audio_path": _normalize_path(audio_path),
        "stems_dir": _normalize_path(stems_dir),
        "schema_version": songgraph.get("schema_version", ""),
        "pipeline_version": songgraph.get("pipeline_version", ""),
    }
    digest = sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()
    return f"song_{digest[:12]}"


def _stable_color_hex(seed: str) -> str:
    digest = sha256(seed.encode("utf-8")).hexdigest()
    return f"#{digest[:6]}"


def _normalize_path(raw: Any) -> str:
    text = str(raw or "").strip()
    return text.replace("\\", "/")
