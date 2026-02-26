import * as CONSTANTS from "../../domain/policies/constants.js";
import * as Utils from "../../domain/shared/utils.js";
import * as Drop from "../../domain/services/drop.js";
import {
  getSectionResizeHandleRect as getSectionResizeHandleRectFromModule,
  isPointInSectionResizeHandle as isPointInSectionResizeHandleFromModule,
} from "../../ui/timeline/interactions/section_resize.js";
import * as TrackLayout from "../../domain/services/track_layout.js";
import * as TrackPlacement from "../../domain/services/placement.js";
import * as SelectionState from "../../domain/services/selection_state.js";
import * as TrackLinking from "../../domain/services/linking.js";
import { applyCommittedClipEditToLocalStudio as applyCommittedClipEditToLocalStudioFromCommit } from "./clip_commit.js";
import { createTimelineClipOps } from "../../domain/services/edit_ops.js";
import * as TimelineStatus from "../../ui/shell/status.js";
import * as PreviewEdits from "../../domain/services/preview_edits.js";
import { logTransportStressEvent } from "./transport_debug.js";
import {
  applyCommittedClipEditToLocalStudioBridge,
  resolveEffectiveChannelMode,
} from "./clip_bridge.js";
import { createTimelineAudioSubsystem } from "./engine_audio.js";
import { createTimelinePreviewSubsystem } from "./engine_preview.js";
import { createTimelineTransportSubsystem } from "./engine_transport.js";

export function createTimelineEngine() {
  let drawBridgeDelegate = () => {};
  const drawBridge = (state) => drawBridgeDelegate(state);
  let getPlaybackClockAudioBridgeDelegate = () => null;
  const getPlaybackClockAudioBridge = (state) => getPlaybackClockAudioBridgeDelegate(state);
  let rebaseTransportClockBridgeDelegate = () => {};
  const rebaseTransportClockAtCurrentPlayheadBridge = (state, tsMs = null) =>
    rebaseTransportClockBridgeDelegate(state, tsMs);
  let resolveTrackAudioActiveEventBridgeDelegate = () => null;
  const resolveTrackAudioActiveEventAtTimeBridge = (state, trackName, timeSec) =>
    resolveTrackAudioActiveEventBridgeDelegate(state, trackName, timeSec);
  let resolveTrackAudioPlayerBridgeDelegate = () => null;
  const resolveTrackAudioPlayerForEventBridge = (trackEntry, activeEvent) =>
    resolveTrackAudioPlayerBridgeDelegate(trackEntry, activeEvent);

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

  const AUDIO_SUBSYSTEM = createTimelineAudioSubsystem({
    CONSTANTS,
    Utils,
    getTimelineMaxTimeSec,
    rebaseTransportClockAtCurrentPlayhead: rebaseTransportClockAtCurrentPlayheadBridge,
    getPlaybackClockAudio: getPlaybackClockAudioBridge,
    resolveTrackAudioActiveEventAtTime: resolveTrackAudioActiveEventAtTimeBridge,
    resolveTrackAudioPlayerForEvent: resolveTrackAudioPlayerForEventBridge,
  });
  const {
    closeTrackPlaybackAudioBus,
    normalizeSkeletonMode,
    resolveSlipOffsetFromRailHit,
    isTrackMuted,
    isTrackLocked,
    hasUnmutedMidiTracks,
    setTrackMuted,
    syncTrackAudioMuteVolumes,
    hitTest,
    TRACK_AUDIO_RUNTIME,
    MIDI_RUNTIME,
    SCRUB_RUNTIME,
    resumeTrackPlaybackAudioContext,
  } = AUDIO_SUBSYSTEM;

  const PREVIEW_SUBSYSTEM = createTimelinePreviewSubsystem({
    CONSTANTS,
    Utils,
    draw: drawBridge,
    isTrackMuted,
    resolveEffectiveChannelMode,
    deriveLinkedAudioTrackNameFromVideoTrack,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
    getClipId,
  });
  const { PREVIEW_RUNTIME, SECTION_WAVE_RUNTIME, CLIP_VISUALS_RUNTIME } = PREVIEW_SUBSYSTEM;

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
    resolveTrackAudioPlayerForEvent,
    syncTrackAudioPlayersToPlayhead,
    maybeRebasePlayheadFromTrackClock,
    setupTrackAudioPlayers,
  } = TRACK_AUDIO_RUNTIME;

  const { RUNTIME_ADAPTERS } = createTimelineTransportSubsystem({
    CONSTANTS,
    Utils,
    Drop,
    SCRUB_RUNTIME,
    MIDI_RUNTIME,
    TRACK_AUDIO_RUNTIME,
    SECTION_WAVE_RUNTIME,
    CLIP_VISUALS_RUNTIME,
    CLIP_OPS_RUNTIME,
    getTimelineMaxTimeSec,
    resumeTrackPlaybackAudioContext,
    logTransportStressEvent,
    hasUnmutedMidiTracks,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    maybeRebasePlayheadFromTrackClock,
    normalizeSectionHeight,
    resolveVisibleSectionHeight,
    buildTrackRowsLayout,
    getSectionResizeHandleRectFromModule,
    isPointInSectionResizeHandleFromModule,
    buildStageGroups,
    resolveTrackStageGroup,
    isTrackMuted,
    resolveTrackPartition,
    isTrackLocked,
    getPreviewClipEdit,
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
    collectSelectedClipRefs,
    serializePreviewClipEdits,
    emitTimelineViewState,
  });

  const {
    getPlaybackClockAudio,
    resetTransportClockState,
    draw,
    seek,
    startPlayback,
    stopPlayback,
    fitToViewport,
    getMinPxPerSec,
    clampTimelineOffsetSec,
    refreshTimelineViewAfterDurationChange,
  } = RUNTIME_ADAPTERS;

  drawBridgeDelegate = draw;
  getPlaybackClockAudioBridgeDelegate = getPlaybackClockAudio;
  rebaseTransportClockBridgeDelegate = RUNTIME_ADAPTERS.rebaseTransportClockAtCurrentPlayhead;
  resolveTrackAudioActiveEventBridgeDelegate = resolveTrackAudioActiveEventAtTime;
  resolveTrackAudioPlayerBridgeDelegate = resolveTrackAudioPlayerForEvent;

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

  const engine = {
    CONSTANTS,
    Utils,
    Drop,
    MIDI_RUNTIME,
    SCRUB_RUNTIME,
    CLIP_OPS_RUNTIME,
    SECTION_WAVE_RUNTIME,
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
    refreshTimelineViewAfterDurationChange,
    getPlaybackClockAudio,
    findResourceDurationHintSec,
    getTimelineMaxTimeSec,
    isPointInSectionResizeHandle: RUNTIME_ADAPTERS.isPointInSectionResizeHandle,
    toggleClipSelectionFromHit,
    clearClipSelectionSet,
    collectSelectedClipIdsForTrack,
    normalizeTrackRowScale,
    resumeTrackPlaybackAudioContext,
    logTransportStressEvent,
    collectLinkedClipTargets,
    isClipSelectedInSet,
    normalizeSkeletonMode,
    normalizeSnapEnabled,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
  };

  return {
    engine,
    prewarmTimelineVideoBuffers: PREVIEW_RUNTIME.prewarmTimelineVideoBuffers,
    clearTrackAudioPlayers,
    closeTrackPlaybackAudioBus,
    stopPlayback,
    resetTransportClockState,
  };
}

