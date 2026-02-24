import { createTimelineMuteHandlers } from "./timeline_mute.js";
import { createTimelineTrackQueryHelpers } from "./timeline_track_queries.js";
import { createTimelineInteractionHandlers } from "./timeline_interactions.js";
import { createTimelineClipEditHandlers } from "./timeline_clip_edit.js";
import { createTimelineBoxSelectionHandlers } from "./timeline_selection.js";
import { createTimelineHitHandlers } from "./timeline_hits.js";
import { bootstrapTimelineAudio } from "./timeline_audio_bootstrap.js";
import { createAdjustedDropTargetResolver } from "./timeline_drop_target_resolver.js";
import { createTimelineDndHandlers } from "./timeline_dnd.js";
import { createTimelineCanvasHandlers } from "./timeline_canvas_events.js";
import { createTimelineNudgeHandler } from "./timeline_nudge.js";
import { setupTimelineToolbarControls } from "./timeline_controls.js";
import { createTimelineKeyboardHandlers } from "./timeline_keyboard.js";
import { mountTimelineInstance } from "./timeline_mount.js";

export function wireTimelineRuntime(args = {}) {
  const {
    state,
    body,
    canvas,
    fitBtn,
    hasInitialViewState,
    resize,
    onResolveAudioUrl,
    resolveTimelineAudioUrl,
    initialStudioDurationSec,
    runtime = {},
    deps = {},
  } = args;
  const { CONSTANTS, Utils, Drop, ContextMenu } = runtime;
  const {
    draw,
    renderOverview,
    renderFooter,
    hitTest,
    seek,
    startPlayback,
    stopPlayback,
    isTrackMuted,
    isTrackLocked,
    setTrackMuted,
    resolveTrackStageGroup,
    resolveVisibleSectionHeight,
    normalizeSectionHeight,
    normalizeTrackRowScale,
    isPointInSectionResizeHandle,
    fitToViewport,
    clampTimelineOffsetSec,
    getMinPxPerSec,
    setButtonIcon,
    resumeTrackPlaybackAudioContext,
    setupTrackAudioPlayers,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    getPlaybackClockAudio,
    refreshTimelineViewAfterDurationChange,
    getTimelineMaxTimeSec,
    hasUnmutedMidiTracks,
    applyCommittedClipEditToLocalStudio,
    resolveEffectiveChannelMode,
    resolveSlipOffsetFromRailHit,
    isClipSelectedInSet,
    clearClipSelectionSet,
    toggleClipSelectionFromHit,
    collectSelectedClipIdsForTrack,
    collectLinkedClipTargets,
    writePreviewClipEdits,
    getPreviewClipEdit,
    clearPreviewClipEditsForSession,
    resolveFinalPreviewClipEdit,
    replaceClipSelectionTrackKey,
    canonicalizeTargetTrackForResource,
    getTrackNamesByKind,
    createNextTrackLaneName,
    deriveLinkedAudioTargetTrackFromVideo,
    snapTimeSec,
    isNearTimelineOrigin,
    resolveNonOverlappingTrackName,
    resolveMoveDeltaBoundsForClip,
    collectTrackNeighborBounds,
    findResourceDurationHintSec,
    CLIP_OPS_RUNTIME,
    SCRUB_RUNTIME,
    MIDI_RUNTIME,
    SECTION_WAVE_RUNTIME,
    TIMELINE_STATE,
  } = deps;

  const { applyTrackMuteChange, applyMuteBatch } = createTimelineMuteHandlers({
    state,
    deps: {
      setTrackMuted,
      syncTrackAudioMuteVolumes,
      syncTrackAudioPlayersToPlayhead,
      syncMidiTrackMuteGains: MIDI_RUNTIME.syncMidiTrackMuteGains,
      hasUnmutedMidiTracks,
      startMidiPlayback: MIDI_RUNTIME.startMidiPlayback,
      ensureScrubAudioReady: SCRUB_RUNTIME.ensureScrubAudioReady,
      draw,
      renderOverview,
    },
  });

  const { getAllTrackNames, getGroupTrackNames } = createTimelineTrackQueryHelpers(state, {
    resolveTrackStageGroup,
  });

  const {
    beginMutePaint,
    updateMutePaint,
    endMutePaint,
    beginScrub,
    beginSectionResize,
    beginPanX,
    updateSectionResize,
    updateScrub,
    updatePanX,
    endScrub,
    endSectionResize,
    endPanX,
  } = createTimelineInteractionHandlers({
    state,
    canvas,
    CONSTANTS,
    Utils,
    draw,
    renderOverview,
    hitTest,
    seek,
    startPlayback,
    stopPlayback,
    stopScrubGrains: SCRUB_RUNTIME.stopScrubGrains,
    ensureMidiAudioReady: MIDI_RUNTIME.ensureMidiAudioReady,
    ensureScrubAudioReady: SCRUB_RUNTIME.ensureScrubAudioReady,
    scheduleScrubGrain: SCRUB_RUNTIME.scheduleScrubGrain,
    logTransportStressEvent: deps.logTransportStressEvent,
    normalizeSectionHeight,
    isTrackMuted,
    applyTrackMuteChange,
    clampTimelineOffsetSec,
  });

  const {
    beginClipEdit,
    updateClipEdit,
    finalizeClipEdit,
  } = createTimelineClipEditHandlers({
    state,
    canvas,
    CONSTANTS,
    Utils,
    Drop,
    draw,
    renderOverview,
    isTrackLocked,
    isClipSelectedInSet,
    clearClipSelectionSet,
    collectMultiSelectedMoveMembers: CLIP_OPS_RUNTIME.collectMultiSelectedMoveMembers,
    collectLinkedClipTargets,
    resolveGroupMoveDeltaBounds: CLIP_OPS_RUNTIME.resolveGroupMoveDeltaBounds,
    resolveSlipOffsetFromRailHit,
    writePreviewClipEdits,
    resolveVisibleSectionHeight,
    canonicalizeTargetTrackForResource,
    getTrackNamesByKind,
    createNextTrackLaneName,
    deriveLinkedAudioTargetTrackFromVideo,
    snapTimeSec,
    isNearTimelineOrigin,
    resolveNonOverlappingTrackName,
    resolveMoveDeltaBoundsForClip,
    collectTrackNeighborBounds,
    getPreviewClipEdit,
    clearPreviewClipEditsForSession,
    replaceClipSelectionTrackKey,
    applyCommittedClipEditToLocalStudio,
    setupTrackAudioPlayers,
    syncTrackAudioPlayersToPlayhead,
    resolveFinalPreviewClipEdit,
  });

  const {
    beginBoxSelection,
    updateBoxSelection,
    finalizeBoxSelection,
  } = createTimelineBoxSelectionHandlers({
    state,
    canvas,
    Utils,
    draw,
    renderOverview,
  });

  const { handleHit } = createTimelineHitHandlers({
    state,
    draw,
    renderOverview,
    CONSTANTS,
    isTrackMuted,
    applyTrackMuteChange,
    ensureScrubAudioReady: SCRUB_RUNTIME.ensureScrubAudioReady,
    resolveEffectiveChannelMode,
    applyMuteBatch,
    getAllTrackNames,
    getGroupTrackNames,
    setTrackMuted,
  });

  bootstrapTimelineAudio(state, onResolveAudioUrl, {
    Utils,
    draw,
    renderOverview,
    resolveTimelineAudioUrl,
    initialStudioDurationSec,
    refreshTimelineViewAfterDurationChange,
    getPlaybackClockAudio,
    stopPlayback,
    ensureScrubAudioReady: SCRUB_RUNTIME.ensureScrubAudioReady,
    setupTrackAudioPlayers,
  });

  const resolveAdjustedDropTarget = createAdjustedDropTargetResolver({
    state,
    Drop,
    CONSTANTS,
    Utils,
    findResourceDurationHintSec,
    canonicalizeTargetTrackForResource,
    resolveNonOverlappingTrackName,
    snapTimeSec,
    isNearTimelineOrigin,
  });

  const dndHandlers = createTimelineDndHandlers({
    state,
    canvas,
    Drop,
    CONSTANTS,
    Utils,
    draw,
    renderOverview,
    setupTrackAudioPlayers,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    getTimelineMaxTimeSec,
    refreshTimelineViewAfterDurationChange,
    isTrackLocked,
    resolveVisibleSectionHeight,
    resolveAdjustedDropTarget,
  });
  const { clearDropHint } = dndHandlers;
  canvas.addEventListener("dragover", dndHandlers.onDragOver);
  canvas.addEventListener("dragleave", dndHandlers.onDragLeave);
  canvas.addEventListener("drop", dndHandlers.onDrop);

  const canvasHandlers = createTimelineCanvasHandlers({
    state,
    canvas,
    CONSTANTS,
    Utils,
    draw,
    renderOverview,
    hitTest,
    ContextMenu,
    clearDropHint,
    isPointInSectionResizeHandle,
    beginSectionResize,
    beginPanX,
    beginScrub,
    updateScrub,
    beginMutePaint,
    updateMutePaint,
    endMutePaint,
    toggleClipSelectionFromHit,
    isTrackLocked,
    isCuttableTrackKind: CLIP_OPS_RUNTIME.isCuttableTrackKind,
    resolveCutTimeSecForHit: CLIP_OPS_RUNTIME.resolveCutTimeSecForHit,
    resolveTrimKeepSideForHit: CLIP_OPS_RUNTIME.resolveTrimKeepSideForHit,
    beginClipEdit,
    handleHit,
    beginBoxSelection,
    updateBoxSelection,
    finalizeBoxSelection,
    updateClipEdit,
    resolveCutPreview: CLIP_OPS_RUNTIME.resolveCutPreview,
    updateSectionResize,
    updatePanX,
    finalizeClipEdit,
    endSectionResize,
    endPanX,
    endScrub,
    clearClipSelectionSet,
    collectSelectedClipIdsForTrack,
    resolveVisibleSectionHeight,
    normalizeTrackRowScale,
    getMinPxPerSec,
    clampTimelineOffsetSec,
  });
  canvas.addEventListener("contextmenu", canvasHandlers.onContextMenuCtrlSelect);
  canvas.addEventListener("contextmenu", canvasHandlers.onContextMenuTrack);
  canvas.addEventListener("pointerdown", canvasHandlers.onPointerDown);
  canvas.addEventListener("pointermove", canvasHandlers.onPointerMove);
  canvas.addEventListener("pointerup", canvasHandlers.onPointerUp);
  canvas.addEventListener("pointercancel", canvasHandlers.onPointerCancel);
  canvas.addEventListener("wheel", canvasHandlers.onWheel, { passive: false });
  canvas.addEventListener("dblclick", canvasHandlers.onDoubleClick);

  const nudgeSelectedClip = createTimelineNudgeHandler({
    state,
    CONSTANTS,
    Utils,
    isTrackLocked,
    snapTimeSec,
    resolveNonOverlappingTrackName,
    applyCommittedClipEditToLocalStudio,
    draw,
    renderOverview,
  });

  const toolbarControls = setupTimelineToolbarControls({
    state,
    buttons: {
      playPauseBtn: state.playPauseBtn,
      stopBtn: state.stopBtn,
      undoBtn: state.undoBtn,
      redoBtn: state.redoBtn,
      clearStudioBtn: state.clearStudioBtn,
      fitBtn,
      zoomResetBtn: state.zoomResetBtn,
      jumpBtn: state.jumpBtn,
      sectionVizSelect: state.sectionVizSelect,
      snapBtn: state.snapBtn,
      skeletonModeBtn: state.skeletonModeBtn,
    },
    deps: {
      CONSTANTS,
      setButtonIcon,
      normalizeSectionVizMode: SECTION_WAVE_RUNTIME.normalizeSectionVizMode,
      fitToViewport,
      clearClipSelectionSet,
      startPlayback,
      stopPlayback,
      resumeTrackPlaybackAudioContext,
      draw,
      renderOverview,
    },
  });

  const keyboardHandlers = createTimelineKeyboardHandlers({
    state,
    canvas,
    renderFooter,
    togglePlayPause: toolbarControls.togglePlayPause,
    renderOverview,
    nudgeSelectedClip,
    draw,
  });
  state.keydownHandler = keyboardHandlers.onKeyDown;
  state.keyupHandler = keyboardHandlers.onKeyUp;
  window.addEventListener("keydown", state.keydownHandler);
  window.addEventListener("keyup", state.keyupHandler);

  canvas.addEventListener("pointerleave", canvasHandlers.onPointerLeave);

  mountTimelineInstance({
    body,
    state,
    resize,
    renderOverview,
    fitBtn,
    hasInitialViewState,
    timelineStateMap: TIMELINE_STATE,
  });
}
