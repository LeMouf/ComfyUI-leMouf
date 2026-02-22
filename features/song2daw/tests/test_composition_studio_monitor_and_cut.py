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


def test_monitor_transform_controls_are_wired():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    styles = (_repo_root() / "web" / "shared" / "ui" / "styles.js").read_text(encoding="utf-8")
    assert "lemouf-loop-composition-monitor-transform-summary" in studio_view
    assert "monitorTransformXInput.addEventListener(\"change\"" in studio_view
    assert "commitMonitorTransformPatch({" in studio_view
    assert "applySelectedPlacementTransformFromStore();" in studio_view
    assert "findMonitorEventByRef(materializedEvents, selectionPayload.primaryClip)" in studio_view
    assert "selectedClipCount > 1 ? ` · group ${selectedClipCount}` : \"\"" in studio_view
    assert "monitorPanel.classList.toggle(\"is-selection-group\", selectedClipCount > 1);" in studio_view
    assert ".lemouf-loop-composition-monitor.is-selection-group .lemouf-loop-composition-monitor-frame" in styles


def test_monitor_direct_interactions_are_wired():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    styles = (_repo_root() / "web" / "shared" / "ui" / "styles.js").read_text(encoding="utf-8")
    assert "const deltaXPct = (deltaX / dragState.frameWidth) * 100;" in studio_view
    assert "monitorFrame.addEventListener(\"pointerdown\", onMonitorTransformPointerDown);" in studio_view
    assert "monitorFrame.addEventListener(\"wheel\", onMonitorTransformWheel, { passive: false });" in studio_view
    assert "monitorWheelCommitTimer = window.setTimeout(() => {" in studio_view
    assert "node.__lemoufMonitorInteractionDispose?.();" in studio_view
    assert ".lemouf-loop-composition-monitor-frame.is-transform-enabled" in styles


def test_monitor_selection_resolution_and_playback_priority_are_robust():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "const linkGroupId = String(ref.linkGroupId || \"\").trim();" in studio_view
    assert "return pick({ strictTrack: true }) || pick({ strictTrack: false });" in studio_view
    assert "const selectionOverrideAllowed =" in studio_view
    assert "!Boolean(isPlaying)" in studio_view
    assert "monitorWheelCommitTimer == null;" in studio_view
    assert "const selected = selectionOverrideAllowed" in studio_view
    assert "const end = Math.max(start + MONITOR_EDGE_EPS_SEC * 0.25, toNumber(event.end, start));" in studio_view
    assert "return time >= start - eps && time < end;" in studio_view


def test_monitor_project_actions_save_load_reset_are_wired():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "schema: \"lemouf.composition.scope.v1\"" in studio_view
    assert "const fileName = `lemouf_composition_${safeScope}_${stamp}.json`;" in studio_view
    assert "monitorSaveBtn.addEventListener(\"click\", saveProjectSnapshot);" in studio_view
    assert "monitorLoadBtn.addEventListener(\"click\", () => {" in studio_view
    assert "monitorLoadInput.addEventListener(\"change\", () => {" in studio_view
    assert "monitorResetBtn.addEventListener(\"click\", () => {" in studio_view
    assert "applyCompositionScopeSnapshotInStore(scopeKey, snapshot || null);" in studio_view
    assert "resetCompositionHistory(scopeKey);" in studio_view


def test_monitor_export_manifest_action_is_wired():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    nodes_py = (_repo_root() / "nodes.py").read_text(encoding="utf-8")
    assert "schema: \"lemouf.composition.render_manifest.v1\"" in studio_view
    assert "setButtonIcon(monitorExportBtn, { icon: \"export_render\", title: \"Export render manifest (.json)\" });" in studio_view
    assert "const fileName = `lemouf_render_manifest_${safeScope}_${stamp}.json`;" in studio_view
    assert "await api.fetchApi(\"/lemouf/composition/export_manifest\"" in studio_view
    assert "monitorExportBtn.addEventListener(\"click\", exportRenderManifest);" in studio_view
    assert "\"POST\", \"/lemouf/composition/export_manifest\", composition_export_manifest_post" in nodes_py


def test_placement_transform_is_persisted_in_state_store():
    state_store = (_repo_root() / "web" / "features" / "composition" / "state_store.js").read_text(encoding="utf-8")
    assert "transformXPct = Math.max(-200, Math.min(200, toFiniteNumber(record.transformXPct, 0)))" in state_store
    assert "transformScalePct = Math.max(10, Math.min(600, toFiniteNumber(record.transformScalePct, 100)))" in state_store
    assert "transformRotateDeg = Math.max(-180, Math.min(180, toFiniteNumber(record.transformRotateDeg, 0)))" in state_store


def test_timeline_playback_update_exports_clip_selection_payload():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function collectSelectedClipRefs(state)" in timeline
    assert "selectedClipCount: selectedClipRefs.length" in timeline
    assert "selectedClipRefs," in timeline
    assert "primaryClip: primaryClipSelection," in timeline


def test_track_audio_seek_waits_for_ready_state_before_committing_seek():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function applyTrackPlayerSeek(player, localTime)" in timeline
    assert "const readyState = Number(audio.readyState || 0);" in timeline
    assert "if (!Number.isFinite(readyState) || readyState < 1)" in timeline
    assert "player.pendingSeekSec = target;" in timeline


def test_composition_preview_renders_visual_gaps_as_black_band():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "Video timeline gaps should render as explicit black areas." in timeline
    assert "ctx.fillStyle = \"rgba(12, 10, 8, 0.96)\";" in timeline


def test_insert_mode_preview_resolves_real_lane_for_linked_audio_moves():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "const hasLinkedVideoTarget = previewTargets.some((targetRef) => {" in timeline
    assert "const insertTrackKind =" in timeline
    assert "desiredMoveKind === \"audio\" && hasLinkedVideoTarget" in timeline
    assert "deriveLinkedAudioTargetTrackFromVideo(previewInsertTrack, session.trackName)" in timeline


def test_dropzone_hover_matches_insert_target_by_index_not_only_name():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function isDropzoneInsertHoverMatch(row, insertMode, insertIndex, targetTrackName = \"\")" in timeline
    assert "if (position === \"top\") return idx <= Math.max(1, rowIndex + 1);" in timeline
    assert "if (position === \"bottom\") return idx >= Math.max(0, rowIndex);" in timeline
    assert "const dropzoneHoverFromResourceDrag = isDropzoneInsertHoverMatch(" in timeline
    assert "isDropzoneInsertHoverMatch(" in timeline
    assert "Number(activeEdit.liveInsertIndex)" in timeline


def test_dropzone_insert_mode_draws_ghost_preview_for_drag_and_move():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "const insertGhostFromResourceDrag = dropzoneHoverFromResourceDrag" in timeline
    assert "const insertGhostFromClipMove = dropzoneHoverFromClipMove" in timeline
    assert "const insertGhost = insertGhostFromResourceDrag || insertGhostFromClipMove;" in timeline
    assert "const ghostLabel = `${insertGhost.label} @ ${ts}`;" in timeline


def test_seek_sanitizes_time_and_duration_before_clamp():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function resolvePlaybackDurationSec(state)" in timeline
    assert "const safeDurationSec = resolvePlaybackDurationSec(state);" in timeline
    assert "const safeTimeSec = Number(toFiniteNumber(timeSec, fallbackPlayhead) ?? fallbackPlayhead);" in timeline
    assert "state.playheadSec = clamp(safeTimeSec, 0, safeDurationSec);" in timeline
    assert "state.audio.currentTime = clamp(state.playheadSec, 0, Math.max(0, mediaClampMax));" in timeline


def test_track_audio_sync_uses_resolved_playback_duration():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "const playbackDurationSec = resolvePlaybackDurationSec(state);" in timeline
    assert "const t = clamp(Number(state.playheadSec || 0), 0, playbackDurationSec);" in timeline


def test_playback_tick_uses_resolved_duration_for_clock_and_fallback_paths():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "state.playheadSec = clamp(clockAudio.currentTime || 0, 0, playbackDurationSec);" in timeline
    assert "if (clockAudio.ended || state.playheadSec >= playbackDurationSec) {" in timeline
    assert "if (next >= playbackDurationSec) {" in timeline


def test_clip_edit_commit_refreshes_track_audio_players():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "if (acceptedAny && typeof state.onResolveAudioUrl === \"function\") {" in timeline
    assert "setupTrackAudioPlayers(state, state.onResolveAudioUrl);" in timeline
    assert "syncTrackAudioPlayersToPlayhead(state, { play: Boolean(state.isPlaying), forceSeek: true });" in timeline


def test_insert_mode_clip_edit_reuses_provided_lane_before_creating_new_one():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "const providedInsertTrackName = String(canonicalTrackName || \"\").trim();" in studio_view
    assert "const canReuseProvidedInsertTrack =" in studio_view
    assert "providedInsertTrackKind === desiredKind" in studio_view
    assert "let generatedTrackName = canReuseProvidedInsertTrack" in studio_view


def test_drop_and_move_share_unified_insert_index_resolution():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    assert "function resolveCompositionInsertIndex(studioTracks," in studio_view
    assert "const resolvedInsertIndex = resolveCompositionInsertIndex(studioTracks, {" in studio_view
    assert "targetTrackName: String(trackName || \"\").trim()," in studio_view
    assert "function listNonDropTracks(tracks = [])" in studio_view
    assert "function listNonDropTrackNames(tracks = [])" in studio_view


def test_track_audio_active_event_pick_is_hardened_for_seek_edges():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "const TRACK_AUDIO_EVENT_EDGE_EPS_SEC = 1 / 90;" in timeline
    assert "const eps = TRACK_AUDIO_EVENT_EDGE_EPS_SEC;" in timeline
    assert "if (t < start - eps) continue;" in timeline
    assert "if (t >= end - eps * 0.25) continue;" in timeline


def test_track_context_selection_count_includes_primary_clip_fallback():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function collectSelectedClipIdsForTrack(state, trackName)" in timeline
    assert "const primary = state?.selection && typeof state.selection === \"object\" ? state.selection : null;" in timeline
    assert "if (primaryTrack === safeTrackName && primaryClipId) out.push(primaryClipId);" in timeline


def test_move_commit_remaps_selected_clip_keys_when_track_changes():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "function replaceClipSelectionTrackKey(state, clipId, fromTrackName, toTrackName)" in timeline
    assert "replaceClipSelectionTrackKey(state, memberClipId, memberTrackName, committedTrackName);" in timeline
    assert "replaceClipSelectionTrackKey(state, session.clipId, session.trackName, committedTrackName);" in timeline


def test_filmstrip_draw_reports_real_frame_coverage_and_fallbacks_per_tile():
    timeline = (_repo_root() / "web" / "features" / "studio_engine" / "timeline.js").read_text(encoding="utf-8")
    assert "let drewAny = false;" in timeline
    assert "if (!tileDrawn && frame !== list[0]) tileDrawn = drawFrameInTileContain(ctx, list[0], tile.x, innerY, tile.w, tileH);" in timeline
    assert "return drewAny;" in timeline


def test_runtime_persist_listener_accepts_active_composition_scope_aliases():
    studio = (_repo_root() / "web" / "lemouf_studio.js").read_text(encoding="utf-8")
    assert "const collectActiveCompositionScopeKeys = () => {" in studio
    assert "if (selectedWorkflow) push(`composition:${selectedWorkflow}`);" in studio
    assert "const activeScopeKeys = collectActiveCompositionScopeKeys();" in studio
    assert "if (!activeScopeKeys.has(key)) return;" in studio


def test_monitor_layout_state_persists_overlay_toggles_and_opacities():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    state_store = (_repo_root() / "web" / "features" / "composition" / "state_store.js").read_text(encoding="utf-8")
    assert "const monitorCenter = Boolean(state?.monitorCenter);" in studio_view
    assert "const monitorDiagonal = Boolean(state?.monitorDiagonal);" in studio_view
    assert "const monitorWorkArea = state?.monitorWorkArea !== false;" in studio_view
    assert "const monitorBackgroundRaw = String(state?.monitorBackground || \"neutral\").trim().toLowerCase();" in studio_view
    assert "const monitorGridOpacity = clampOverlayOpacity(state?.monitorGridOpacity, 1);" in studio_view
    assert "const monitorDiagonalOpacity = clampOverlayOpacity(state?.monitorDiagonalOpacity, 0.85);" in studio_view
    assert "const monitorWorkArea = snapshot.monitorWorkArea !== false;" in state_store
    assert "const monitorBackgroundRaw = String(snapshot.monitorBackground || \"neutral\").toLowerCase();" in state_store
    assert "const monitorCenter = Boolean(snapshot.monitorCenter);" in state_store
    assert "const monitorDiagonal = Boolean(snapshot.monitorDiagonal);" in state_store
    assert "const monitorGridOpacity = Math.max(0.1, Math.min(1, toFiniteNumber(snapshot.monitorGridOpacity, 1)));" in state_store
    assert "const monitorDiagonalOpacity = Math.max(0.1, Math.min(1, toFiniteNumber(snapshot.monitorDiagonalOpacity, 0.85)));" in state_store


def test_monitor_preview_controls_include_center_diagonal_and_opacity_inputs():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    styles = (_repo_root() / "web" / "shared" / "ui" / "styles.js").read_text(encoding="utf-8")
    assert "lemouf-loop-composition-monitor-guide-center" in studio_view
    assert "lemouf-loop-composition-monitor-guide-diagonal" in studio_view
    assert "const monitorCenterBtn = el(\"button\"" in studio_view
    assert "const monitorDiagonalBtn = el(\"button\"" in studio_view
    assert "monitorStage.classList.toggle(\"is-center-on\", centerOn);" in studio_view
    assert "monitorStage.classList.toggle(\"is-diagonal-on\", diagonalOn);" in studio_view
    assert "monitorStage.classList.toggle(\"is-workarea-on\", workAreaOn);" in studio_view
    assert "monitorStage.setAttribute(\"data-bg\", background);" in studio_view
    assert "const monitorGridOpacityInput = el(\"input\", {" in studio_view
    assert "const monitorDiagonalOpacityInput = el(\"input\", {" in studio_view
    assert "const monitorBackgroundSelect = el(\"select\", {" in studio_view
    assert "const monitorWorkAreaBtn = el(\"button\", {" in studio_view
    assert "monitorBackgroundSelect.addEventListener(\"change\", () => {" in studio_view
    assert "monitorWorkAreaBtn.addEventListener(\"click\", () => {" in studio_view
    assert "monitorGridOpacityInput.addEventListener(\"input\", () => {" in studio_view
    assert "monitorDiagonalOpacityInput.addEventListener(\"input\", () => {" in studio_view
    assert "createMonitorActionGroup(\"preview\", [" in studio_view
    assert "monitorCenterBtn," in studio_view
    assert "monitorDiagonalBtn," in studio_view
    assert "monitorWorkAreaBtn," in studio_view
    assert "const monitorPasteboard = el(\"div\", {" in studio_view
    assert "monitorStage.append(monitorPasteboard, monitorFrame);" in studio_view
    assert ".lemouf-loop-composition-monitor-stage.is-center-on .lemouf-loop-composition-monitor-guide-center" in styles
    assert ".lemouf-loop-composition-monitor-stage.is-diagonal-on .lemouf-loop-composition-monitor-guide-diagonal" in styles
    assert ".lemouf-loop-composition-monitor-pasteboard" in styles
    assert ".lemouf-loop-composition-monitor-stage[data-bg=\"checker\"]" in styles
    assert ".lemouf-loop-composition-monitor-workspace-row" in styles
    assert ".lemouf-loop-composition-monitor-overlay-row" in styles


def test_monitor_transform_mode_keybinds_and_buttons_are_wired():
    studio_view = (_repo_root() / "web" / "features" / "composition" / "studio_view.js").read_text(encoding="utf-8")
    state_store = (_repo_root() / "web" / "features" / "composition" / "state_store.js").read_text(encoding="utf-8")
    styles = (_repo_root() / "web" / "shared" / "ui" / "styles.js").read_text(encoding="utf-8")
    assert "const MONITOR_TRANSFORM_MODE_VALUES = [\"move\", \"scale\", \"rotate\"];" in studio_view
    assert "function normalizeMonitorTransformMode(value, fallback = \"move\")" in studio_view
    assert "let monitorTransformMode = normalizeMonitorTransformMode(layoutState.monitorTransformMode, \"move\");" in studio_view
    assert "const monitorTransformModeBtnMove = el(\"button\", {" in studio_view
    assert "monitorTransformModeBtnScale.addEventListener(\"click\", () => applyMonitorTransformMode(\"scale\", { persist: true }));" in studio_view
    assert "document.addEventListener(\"keydown\", onMonitorTransformModeKeydown, true);" in studio_view
    assert "if (key === \"v\") {" in studio_view
    assert "if (key === \"s\") {" in studio_view
    assert "if (key === \"r\") {" in studio_view
    assert "const monitorTransformModeRaw = String(snapshot.monitorTransformMode || \"move\").toLowerCase();" in state_store
    assert ".lemouf-loop-composition-monitor-mode-row" in styles
    assert ".lemouf-loop-composition-monitor-frame.is-transform-enabled.is-transform-mode-scale" in styles
