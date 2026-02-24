import { setButtonIcon } from "../../shared/ui/icons.js";
import { buildPresetIntent, inferMidiPreset, midiNoteToFrequency, planDsp } from "./audio_preset_plan.js";
import * as CONSTANTS from "./modules/timeline_constants.js";
import * as Utils from "./modules/timeline_utils.js";
import * as Drop from "./modules/timeline_drop.js";
import * as ContextMenu from "./modules/timeline_context_menu.js";
import { chooseRulerStepSec, drawTimeRuler, formatTimelineTimeLabel } from "./modules/timeline_ruler.js";
import { seekTimeline, startTimelinePlayback, stopTimelinePlayback } from "./modules/timeline_transport.js";
import {
  fitTimelineToViewport,
  getTimelineMinPxPerSec,
  clampTimelineViewportOffsetSec,
  refreshTimelineViewportAfterDurationChange,
} from "./modules/timeline_viewport.js";
import {
  hasTimelineTrackAudioPlayback,
  getTimelinePlaybackClockAudio,
  resetTimelineTransportClockState,
  beginTimelineTransportClock,
  resolveTimelineTransportPlayheadFromClock,
  rebaseTimelineTransportClockAtCurrentPlayhead,
} from "./modules/timeline_clock.js";
import {
  getSectionResizeHandleRect as getSectionResizeHandleRectFromModule,
  isPointInSectionResizeHandle as isPointInSectionResizeHandleFromModule,
} from "./modules/timeline_section_resize.js";
import * as TrackLayout from "./modules/timeline_track_layout.js";
import * as TrackPlacement from "./modules/timeline_track_placement.js";
import * as SelectionState from "./modules/timeline_selection_state.js";
import * as TrackLinking from "./modules/timeline_track_linking.js";
import { applyCommittedClipEditToLocalStudio as applyCommittedClipEditToLocalStudioFromCommit } from "./modules/timeline_clip_commit.js";
import { createTimelineClipOps } from "./modules/timeline_clip_ops.js";
import * as TimelineStatus from "./modules/timeline_status_ui.js";
import * as PreviewEdits from "./modules/timeline_preview_edits.js";
import { isTransportStressDebugEnabled, logTransportStressEvent } from "./modules/timeline_transport_debug.js";
import { createTimelineClipVisuals } from "./modules/timeline_clip_visuals.js";
import { createTimelineSectionWaveformRuntime } from "./modules/timeline_section_waveform.js";
import { createTimelineScrubRuntime } from "./modules/timeline_scrub_runtime.js";
import { createTimelineTrackAudioRuntime } from "./modules/timeline_track_audio_runtime.js";
import { createTimelineMidiRuntime } from "./modules/timeline_midi_runtime.js";
import { createTimelinePreviewRuntime } from "./modules/timeline_preview_runtime.js";
import { drawTimelineFrame } from "./modules/timeline_draw_orchestrator.js";
import { createTimelineTransportBridge } from "./modules/timeline_transport_bridge.js";
import { wireTimelineRuntime } from "./modules/timeline_runtime_wiring.js";
import { bootstrapTimelineRender } from "./modules/timeline_render_bootstrap.js";
import { clearTimelineInstance } from "./modules/timeline_cleanup.js";
import { createTimelineRuntimeHelpers } from "./modules/timeline_runtime_helpers.js";
import { createTimelineRuntimeAdapters } from "./modules/timeline_runtime_adapters.js";
import {
  applyCommittedClipEditToLocalStudioBridge,
  resolveEffectiveChannelMode,
} from "./modules/timeline_runtime_clip_bridge.js";

const TIMELINE_STATE = new WeakMap();
const {
  buildTrackClips,
  buildExplicitResourceClips,
  resolveTrackPartition,
  normalizeSectionHeight,
  normalizeSnapEnabled,
  normalizeVideoPreviewMode,
  normalizeVideoPreviewQualityHint,
  resolveTrackStepIndex,
  resolveTrackStageGroup,
  buildStageGroups,
  resolveVisibleSectionHeight,
  normalizeTrackRowScale,
  buildTrackRowsLayout,
} = TrackLayout;
const {
  getTrackNamesByKind,
  collectTrackNeighborBounds,
  resolveMoveDeltaBoundsForClip,
  createNextTrackLaneName,
  resolveNonOverlappingTrackName,
  findResourceDurationHintSec,
  snapTimeSec,
  isNearTimelineOrigin,
  getTimelineMaxTimeSec,
} = TrackPlacement;
const {
  getClipId,
  makeClipSelectionKey,
  collectSelectedClipRefs,
  isClipSelectedInSet,
  clearClipSelectionSet,
  toggleClipSelectionFromHit,
  collectSelectedClipIdsForTrack,
  replaceClipSelectionTrackKey,
  resolvePrimaryClipSelectionKey,
  resolveEffectiveSelectedClipCount,
} = SelectionState;
const {
  inferStudioTrackKindByName,
  inferAudioChannelModeByTrackName,
  deriveLinkedAudioTrackNameFromVideoTrack,
  deriveVideoTrackNameFromLinkedAudio,
  deriveLinkedAudioTargetTrackFromVideo,
  canonicalizeTargetTrackForResource,
  resolveInsertIndexForTargetTrack,
  areVideoAudioTracksLinked,
} = TrackLinking;
const { renderOverview, renderFooter, emitTimelineViewState } = TimelineStatus;
const {
  getPreviewClipEdit,
  resolveFinalPreviewClipEdit,
  collectLinkedClipTargets,
  writePreviewClipEdits,
  clearPreviewClipEditsForSession,
  applyPreviewClipGeometry,
  collectPreviewInjectedClipsForTrack,
  serializePreviewClipEdits,
} = PreviewEdits;
const {
  getScrubAudioContextCtor,
  ensureTrackPlaybackAudioContext,
  resumeTrackPlaybackAudioContext,
  closeTrackPlaybackAudioBus,
  scheduleGainRamp,
  pausePlayerWithFade,
  clearPlayerPauseTimer,
  normalizeSkeletonMode,
  resolveSlipOffsetFromRailHit,
  isTrackMuted,
  isTrackLocked,
  hasUnmutedMidiTracks,
  setTrackMuted,
  syncTrackAudioMuteVolumes,
  hitTest,
} = createTimelineRuntimeHelpers({ CONSTANTS, Utils });
const TRACK_AUDIO_RUNTIME = createTimelineTrackAudioRuntime({
  CONSTANTS,
  Utils,
  isTrackMuted,
  getTimelineMaxTimeSec,
  ensureTrackPlaybackAudioContext,
  resumeTrackPlaybackAudioContext,
  scheduleGainRamp,
  pausePlayerWithFade,
  clearPlayerPauseTimer,
  rebaseTransportClockAtCurrentPlayhead,
  logTransportStressEvent,
  syncTrackAudioMuteVolumes,
});
const PREVIEW_RUNTIME = createTimelinePreviewRuntime({
  draw,
  normalizeVideoPreviewMode,
  normalizeVideoPreviewQualityHint,
  bucketizeFilmstripFrameCount,
});
const SECTION_WAVE_RUNTIME = createTimelineSectionWaveformRuntime({
  CONSTANTS,
  Utils,
  isTrackMuted,
  resolveEffectiveChannelMode,
  deriveLinkedAudioTrackNameFromVideoTrack,
  drawClipThumbnailCover: PREVIEW_RUNTIME.drawClipThumbnailCover,
  drawClipThumbnailTiles: PREVIEW_RUNTIME.drawClipThumbnailTiles,
  resolveVideoPreviewPlan: PREVIEW_RUNTIME.resolveVideoPreviewPlan,
  ensureTimelineVideoFilmstrip: PREVIEW_RUNTIME.ensureTimelineVideoFilmstrip,
  drawClipFilmstripTilesCached: PREVIEW_RUNTIME.drawClipFilmstripTilesCached,
});
const MIDI_RUNTIME = createTimelineMidiRuntime({
  CONSTANTS,
  Utils,
  isTrackMuted,
  getScrubAudioContextCtor,
  inferMidiPreset,
  buildPresetIntent,
  planDsp,
  midiNoteToFrequency,
});
const SCRUB_RUNTIME = createTimelineScrubRuntime({
  CONSTANTS,
  Utils,
  getPlaybackClockAudio,
  isTrackMuted,
  resolveTrackAudioActiveEventAtTime,
  resolveTrackAudioPlayerForEvent,
  hasUnmutedMidiTracks,
  ensureMidiAudioReady: MIDI_RUNTIME.ensureMidiAudioReady,
  inferMidiPreset,
  buildPresetIntent,
  planDsp,
  midiNoteToFrequency,
  getScrubAudioContextCtor,
});
const CLIP_VISUALS_RUNTIME = createTimelineClipVisuals({
  CONSTANTS,
  Utils,
  mapTimelineSecToSignalSourceSec: SECTION_WAVE_RUNTIME.mapTimelineSecToSignalSourceSec,
  normalizeSectionVizMode: SECTION_WAVE_RUNTIME.normalizeSectionVizMode,
  drawAmplitudeVizLane: SECTION_WAVE_RUNTIME.drawAmplitudeVizLane,
  resolveEffectiveChannelMode,
  drawClipThumbnailCover: PREVIEW_RUNTIME.drawClipThumbnailCover,
  drawClipThumbnailTiles: PREVIEW_RUNTIME.drawClipThumbnailTiles,
  ensureTimelineVideoFilmstrip: PREVIEW_RUNTIME.ensureTimelineVideoFilmstrip,
  drawClipFilmstripTilesCached: PREVIEW_RUNTIME.drawClipFilmstripTilesCached,
  resolveVideoPreviewPlan: PREVIEW_RUNTIME.resolveVideoPreviewPlan,
  getClipId,
});
const CLIP_OPS_RUNTIME = createTimelineClipOps({
  CONSTANTS,
  Utils,
  hitTest,
  snapTimeSec,
  resolveMoveDeltaBoundsForClip,
  makeClipSelectionKey,
});
const {
  clearTrackAudioPlayers,
  resolveTrackAudioActiveEventAtTime,
  resolveTrackAudioEventByClipId,
  resolveTrackAudioLocalTime,
  resolveClipBoundaryGain,
  resolveTrackAudioPlayerForEvent,
  pauseAllTrackAudioPlayers,
  applyTrackPlayerSeek,
  applyTrackPlayerSeekWithWindow,
  resolvePlaybackDurationSec,
  resolveTrackPlaybackClockTimeSec,
  syncTrackAudioPlayersToPlayhead,
  maybeRebasePlayheadFromTrackClock,
  setupTrackAudioPlayers,
} = TRACK_AUDIO_RUNTIME;
const TRANSPORT_BRIDGE = createTimelineTransportBridge({
  CONSTANTS,
  Utils,
  SCRUB_RUNTIME,
  hasTimelineTrackAudioPlayback,
  getTimelinePlaybackClockAudio,
  resetTimelineTransportClockState,
  beginTimelineTransportClock,
  resolveTimelineTransportPlayheadFromClock,
  rebaseTimelineTransportClockAtCurrentPlayhead,
  seekTimeline,
  startTimelinePlayback,
  stopTimelinePlayback,
  fitTimelineToViewport,
  getTimelineMinPxPerSec,
  clampTimelineViewportOffsetSec,
  refreshTimelineViewportAfterDurationChange,
  getTimelineMaxTimeSec,
  resumeTrackPlaybackAudioContext,
  logTransportStressEvent,
  startMidiPlayback: MIDI_RUNTIME.startMidiPlayback,
  clearMidiPlayback: MIDI_RUNTIME.clearMidiPlayback,
  hasUnmutedMidiTracks,
  syncTrackAudioMuteVolumes,
  syncTrackAudioPlayersToPlayhead,
  maybeRebasePlayheadFromTrackClock,
  resolvePlaybackDurationSec,
});
const RUNTIME_ADAPTERS = createTimelineRuntimeAdapters({
  TRANSPORT_BRIDGE,
  SCRUB_RUNTIME,
  SECTION_WAVE_RUNTIME,
  CLIP_VISUALS_RUNTIME,
  CLIP_OPS_RUNTIME,
  CONSTANTS,
  Utils,
  normalizeSectionHeight,
  resolveVisibleSectionHeight,
  buildTrackRowsLayout,
  getSectionResizeHandleRectFromModule,
  isPointInSectionResizeHandleFromModule,
  drawTimeRuler,
  buildStageGroups,
  resolveTrackStageGroup,
  isTrackMuted,
  Drop,
  resolveTrackPartition,
  isTrackLocked,
  getPreviewClipEdit,
  formatTimelineTimeLabel,
  chooseRulerStepSec,
  resolveEffectiveChannelMode,
  buildExplicitResourceClips,
  buildTrackClips,
  getClipId,
  applyPreviewClipGeometry,
  collectPreviewInjectedClipsForTrack,
  makeClipSelectionKey,
  resolvePrimaryClipSelectionKey,
  resolveEffectiveSelectedClipCount,
  areVideoAudioTracksLinked,
  resolveTrackStepIndex,
  renderFooter,
  hasUnmutedMidiTracks,
  collectSelectedClipRefs,
  serializePreviewClipEdits,
  emitTimelineViewState,
  drawTimelineFrame,
});
const {
  hasTrackAudioPlayback,
  getPlaybackClockAudio,
  resetTransportClockState,
  rebaseTransportClockAtCurrentPlayhead,
  getSectionResizeHandleRect,
  isPointInSectionResizeHandle,
  draw,
  seek,
  startPlayback,
  stopPlayback,
  fitToViewport,
  getMinPxPerSec,
  clampTimelineOffsetSec,
  refreshTimelineViewAfterDurationChange,
} = RUNTIME_ADAPTERS;


function applyCommittedClipEditToLocalStudio(state, payload) {
  return applyCommittedClipEditToLocalStudioBridge(state, payload, {
    applyCommittedClipEditToLocalStudioFromCommit,
    CONSTANTS,
    Utils,
    deriveVideoTrackNameFromLinkedAudio,
    inferStudioTrackKindByName,
    inferAudioChannelModeByTrackName,
    deriveLinkedAudioTargetTrackFromVideo,
    resolveInsertIndexForTargetTrack,
    refreshTimelineViewAfterDurationChange,
  });
}

export function prewarmTimelineVideoBuffers(args = {}) {
  return PREVIEW_RUNTIME.prewarmTimelineVideoBuffers(args);
}

export function clearSong2DawTimeline(body) {
  const state = TIMELINE_STATE.get(body);
  if (!state) return;
  clearTimelineInstance({
    body,
    state,
    timelineStateMap: TIMELINE_STATE,
    ContextMenu,
    stopPlayback,
    resetTransportClockState,
    stopScrubGrains: SCRUB_RUNTIME.stopScrubGrains,
    clearTrackAudioPlayers,
    closeTrackPlaybackAudioBus,
  });
}

export function renderSong2DawTimeline({
  runData,
  studioData,
  body,
  layoutMode = "full",
  allowDurationExtend = false,
  dropTargetMode = "relaxed",
  previewQualityHint = "auto",
  externalClipThumbCache = null,
  initialViewState = null,
  onViewStateChange = null,
  onJumpToStep,
  onOpenRunDir,
  onResolveAudioUrl,
  onDropResource,
  onClipEdit,
  onClipCut,
  onClipTrim,
  onClipJoin,
  onTrackContextAction,
  onUndo,
  onRedo,
  onPlaybackUpdate,
}) {
  clearSong2DawTimeline(body);
  body.innerHTML = "";
  const {
    compactMode,
    canvasWrap,
    canvas,
    overviewLabel,
    statusLabel,
    playPauseBtn,
    stopBtn,
    undoBtn,
    redoBtn,
    clearStudioBtn,
    fitBtn,
    snapBtn,
    sectionVizSelect,
    jumpBtn,
    shortcutsLabel,
    zoomLabel,
    zoomResetBtn,
    skeletonModeBtn,
    dpr,
    ctx,
    resolveTimelineAudioUrl,
    state,
    initialStudioDurationSec,
    hasInitialViewState,
  } = bootstrapTimelineRender({
    runData,
    studioData,
    body,
    layoutMode,
    allowDurationExtend,
    dropTargetMode,
    previewQualityHint,
    externalClipThumbCache,
    initialViewState,
    onViewStateChange,
    onJumpToStep,
    onOpenRunDir,
    onDropResource,
    onClipEdit,
    onClipCut,
    onClipTrim,
    onClipJoin,
    onTrackContextAction,
    onUndo,
    onRedo,
    onResolveAudioUrl,
    onPlaybackUpdate,
    CONSTANTS,
    normalizeSectionHeight,
    normalizeSectionVizMode: SECTION_WAVE_RUNTIME.normalizeSectionVizMode,
    normalizeSkeletonMode,
    normalizeSnapEnabled,
    normalizeTrackRowScale,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
  });
  wireTimelineRuntime({
    body,
    state,
    canvas,
    canvasWrap,
    ctx,
    dpr,
    hasInitialViewState,
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
    runtime: {
      MIDI_RUNTIME,
      SCRUB_RUNTIME,
      CLIP_OPS_RUNTIME,
      SECTION_WAVE_RUNTIME,
    },
    deps: {
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
      timelineStateMap: TIMELINE_STATE,
      collectLinkedClipTargets,
      isClipSelectedInSet,
      setButtonIcon,
    },
  });
}

export {
  clearSong2DawTimeline as clearStudioTimeline,
  renderSong2DawTimeline as renderStudioTimeline,
};






