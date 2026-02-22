from backend.composition.render_execute import CompositionRenderExecutionService


def _build_plan(duration_sec: float = 4.0):
    return {
        "output": {
            "width": 1280,
            "height": 720,
            "fps": 30.0,
            "durationSec": duration_sec,
            "audioRate": 48000,
            "audioChannels": "stereo",
        },
        "profile": {"file_extension": ".mp4"},
        "ffmpeg": {
            "video": ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
            "audio": ["-c:a", "aac", "-b:a", "160k"],
        },
    }


def test_render_execute_plans_timeline_layers_when_manifest_has_events(monkeypatch):
    service = CompositionRenderExecutionService(".")
    monkeypatch.setattr(service, "_new_output_path", lambda _scope, _ext: "C:/render/out.mp4")
    monkeypatch.setattr(
        "backend.composition.render_execute._resolve_source_path",
        lambda raw_src, _repo_root, _render_root: f"C:/media/{str(raw_src).split('/')[-1]}",
    )

    manifest = {
        "timeline": {
            "tracks": [
                {"name": "Video 1", "kind": "video"},
                {"name": "Audio S1", "kind": "audio"},
            ],
            "eventsByTrack": {
                "Video 1": [
                    {"clipId": "v1", "resourceId": "res_v1", "src": "clip_a.mp4", "time": 0, "duration": 2.0},
                    {"clipId": "v2", "resourceId": "res_v2", "src": "clip_b.mp4", "time": 2.0, "duration": 2.0},
                ],
                "Audio S1": [
                    {"clipId": "a1", "resourceId": "res_a1", "src": "mix_a.mp3", "time": 0.0, "duration": 2.0},
                    {"clipId": "a2", "resourceId": "res_a2", "src": "mix_b.mp3", "time": 1.5, "duration": 2.0},
                ],
            },
        },
        "snapshot": {
                "placements": {
                    "v1": {"clipId": "v1", "transformScalePct": 100, "transformRotateDeg": 0, "zIndex": 0},
                    "v2": {
                        "clipId": "v2",
                        "transformXPct": 5,
                        "transformYPct": -5,
                        "transformScalePct": 95,
                        "transformRotateDeg": 2,
                        "transformOpacityPct": 72,
                        "zIndex": 10,
                    },
                }
            },
        }

    out = service.execute(
        scope_key="scope-a",
        manifest=manifest,
        export_plan=_build_plan(),
        execute=False,
    )
    assert out["status"] == "planned"
    assert out["render_mode"] == "timeline_layers"
    assert int(out["visual_events_used"]) == 2
    assert int(out["audio_events_used"]) == 2
    command = [str(part) for part in out.get("command", [])]
    joined = " ".join(command)
    assert "-filter_complex" in command
    assert "overlay=" in joined
    assert "amix=inputs=2" in joined
    assert "colorchannelmixer=aa=" in joined
    assert isinstance(out.get("diagnostics"), dict)
    assert isinstance(out["diagnostics"].get("skipped_visual_events"), list)
    assert isinstance(out["diagnostics"].get("skipped_audio_events"), list)


def test_render_execute_falls_back_when_manifest_has_no_usable_sources(monkeypatch):
    service = CompositionRenderExecutionService(".")
    monkeypatch.setattr(service, "_new_output_path", lambda _scope, _ext: "C:/render/out.mp4")
    monkeypatch.setattr(
        "backend.composition.render_execute._resolve_source_path",
        lambda _raw_src, _repo_root, _render_root: None,
    )

    manifest = {
        "timeline": {
            "tracks": [{"name": "Video 1", "kind": "video"}],
            "eventsByTrack": {
                "Video 1": [
                    {"clipId": "v1", "resourceId": "res_v1", "src": "missing.mp4", "time": 0, "duration": 2.0}
                ]
            },
        }
    }

    out = service.execute(
        scope_key="scope-b",
        manifest=manifest,
        export_plan=_build_plan(),
        execute=False,
    )
    assert out["status"] == "planned"
    assert out["render_mode"] == "fallback"
    assert int(out["visual_events_used"]) == 0
    assert int(out["audio_events_used"]) == 0
    command = [str(part) for part in out.get("command", [])]
    assert "color=c=black" in " ".join(command)
    diagnostics = out.get("diagnostics")
    assert isinstance(diagnostics, dict)
    assert any(
        str(item.get("reason") or "") == "source_unresolved"
        for item in diagnostics.get("skipped_visual_events") or []
    )
