import { createTimelineInteractionHandlers } from "../../ui/timeline/interactions/core.js";
import { createTimelineKeyboardHandlers } from "../../ui/timeline/interactions/keyboard.js";
import { createTimelineDndHandlers } from "../../ui/timeline/interactions/dnd.js";
import { createTimelineClipEditHandlers } from "../../ui/timeline/interactions/clip_edit.js";
import { createTimelineBoxSelectionHandlers } from "../../ui/timeline/interactions/selection.js";
import { createTimelineHitHandlers } from "../../ui/timeline/interactions/hits.js";
import { bootstrapTimelineAudio } from "../../infrastructure/audio/bootstrap.js";
import { createTimelineCanvasHandlers } from "../../ui/timeline/interactions/canvas_events.js";
import { createTimelineNudgeHandler } from "../../ui/timeline/interactions/nudge.js";
import { setupTimelineToolbarControls } from "../../ui/shell/controls.js";
import { createTimelineResizeHandler } from "../../ui/timeline/resize.js";
import { mountTimelineInstance } from "../boot/mount.js";
import { createTimelineMuteHandlers } from "./mute.js";
import { createTimelineTrackQueryHelpers } from "./track_queries.js";
import { createAdjustedDropTargetResolver } from "../../domain/services/drop_target_resolver.js";

export function wireTimelineRuntime(config = {}) {
  const {
    body,
    state,
    canvas,
    canvasWrap,
    ctx,
    dpr,
    hasInitialViewState = false,
    buttons = {},
    runtime = {},
    deps = {},
  } = config;
  const {
    playPauseBtn,
    stopBtn,
    undoBtn,
    redoBtn,
    clearStudioBtn,
    fitBtn,
    zoomResetBtn,
    jumpBtn,
    sectionVizSelect,
    snapBtn,
    skeletonModeBtn,
  } = buttons;
  const {
    MIDI_RUNTIME,
    SCRUB_RUNTIME,
    CLIP_OPS_RUNTIME,
    SECTION_WAVE_RUNTIME,
  } = runtime;
  const {
    CONSTANTS,
    Utils,
    Drop,
    ContextMenu,
    draw,
    renderOverview,
    renderFooter,
    fitToViewport,
    clampTimelineOffsetSec,
    getMinPxPerSec,
    seek,
    startPlayback,
    stopPlayback,
    hitTest,
    isTrackMuted,
    isTrackLocked,
    hasUnmutedMidiTracks,
    setTrackMuted,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    resolveTrackStageGroup,
    normalizeSectionHeight,
    resolveEffectiveChannelMode,
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
    resolveFinalPreviewClipEdit,
    onResolveAudioUrl,
    resolveTimelineAudioUrl,
    initialStudioDurationSec,
    refreshTimelineViewAfterDurationChange,
    getPlaybackClockAudio,
    findResourceDurationHintSec,
    getTimelineMaxTimeSec,
    isPointInSectionResizeHandle,
    toggleClipSelectionFromHit,
    clearClipSelectionSet,
    collectSelectedClipIdsForTrack,
    normalizeTrackRowScale,
    resumeTrackPlaybackAudioContext,
    logTransportStressEvent,
    timelineStateMap,
  } = deps;

  const resize = createTimelineResizeHandler({
    state,
    canvas,
    canvasWrap,
    ctx,
    dpr,
    deps: {
      fitToViewport,
      clampTimelineOffsetSec,
      draw,
      renderOverview,
    },
  });

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
    logTransportStressEvent,
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
    isClipSelectedInSet: deps.isClipSelectedInSet,
    clearClipSelectionSet,
    collectMultiSelectedMoveMembers: CLIP_OPS_RUNTIME.collectMultiSelectedMoveMembers,
    collectLinkedClipTargets: deps.collectLinkedClipTargets,
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
  canvas.addEventListener("pointerleave", canvasHandlers.onPointerLeave);

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
      playPauseBtn,
      stopBtn,
      undoBtn,
      redoBtn,
      clearStudioBtn,
      fitBtn,
      zoomResetBtn,
      jumpBtn,
      sectionVizSelect,
      snapBtn,
      skeletonModeBtn,
    },
    deps: {
      CONSTANTS,
      setButtonIcon: deps.setButtonIcon,
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

  mountTimelineInstance({
    body,
    state,
    resize,
    renderOverview,
    fitBtn,
    hasInitialViewState,
    timelineStateMap,
  });
}


