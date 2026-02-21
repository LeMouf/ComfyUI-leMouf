from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_composition_monitor_supports_image_stage():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "lemouf-loop-composition-monitor-image" in studio_view
    assert 'setMonitorStageState(selected.mediaKind === "image" ? "image" : "video")' in studio_view


def test_image_source_duration_uses_virtual_cap_for_resizing():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "IMAGE_VIRTUAL_SOURCE_DURATION_SEC = 21_600" in studio_view
    assert "function resolveResourceSourceDurationSec(resource" in studio_view
    assert "kind === \"image\"" in studio_view


def test_composition_cut_accepts_audio_resources():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "(resourceKind === \"audio\" && normalizedTrackKind === \"audio\")" in studio_view
    assert "(resourceKind === \"video\" && (normalizedTrackKind === \"video\" || normalizedTrackKind === \"audio\"))" in studio_view


def test_timeline_cut_gate_allows_audio_track_kind():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function isCuttableTrackKind(trackKind)" in timeline
    assert "return kind === \"video\" || kind === \"audio\";" in timeline


def test_timeline_trim_shortcut_and_callback_are_wired():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "onClipTrim" in timeline
    assert "const trimRequested = Boolean(event.ctrlKey);" in timeline
    assert "state.onClipTrim({ ...payload, keepSide })" in timeline


def test_composition_trim_handler_uses_split_plus_keep_side():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "function trimPlacementForResource(" in studio_view
    assert "onClipTrim: ({ clipId, resourceId, trackKind, cutTimeSec, keepSide }) => {" in studio_view
    assert "keepSide = \"left\"" in studio_view


def test_timeline_toolbar_exposes_undo_redo_and_clear_studio_buttons():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "setButtonIcon(undoBtn, { icon: \"undo\", title: \"Undo (Ctrl+Z)\" });" in timeline
    assert "setButtonIcon(redoBtn, { icon: \"redo\", title: \"Redo (Ctrl+Y)\" });" in timeline
    assert "setButtonIcon(clearStudioBtn, { icon: \"clear_resources\", title: \"Clear studio (empty project)\" });" in timeline
    assert "action: \"clear_composition\"" in timeline


def test_timeline_audio_viz_modes_include_line_and_dots():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "const SECTION_VIZ_MODES = [\"bands\", \"filled\", \"peaks\", \"line\", \"dots\"];" in timeline
    assert "el(\"option\", { value: \"line\", text: \"Viz: Line\" })" in timeline
    assert "el(\"option\", { value: \"dots\", text: \"Viz: Dots\" })" in timeline


def test_timeline_reuses_shared_audio_viz_renderer_for_overlay_and_clips():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function drawAmplitudeVizLane(" in timeline
    assert "drawAmplitudeVizLane(ctx, envelope.left, LEFT_GUTTER, timelineWidth, leftY, laneHeight" in timeline
    assert "drawAmplitudeVizLane(ctx, amplitudes, x0, widthPx, y, h" in timeline


def test_composition_layout_has_vertical_row_splitter_with_persistence():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    state_store = (_repo_root() / "web" / "features" / "composition" / "state_store.js").read_text(encoding="utf-8")
    assert "COMPOSITION_ROW_SPLIT_MIN_PERCENT" in studio_view
    assert "class: \"lemouf-loop-composition-row-splitter\"" in studio_view
    assert "layoutState.rowSplitPercent" in studio_view
    assert "rowSplitPercent = Math.max(24, Math.min(76, toFiniteNumber(snapshot.rowSplitPercent, 50)))" in state_store
