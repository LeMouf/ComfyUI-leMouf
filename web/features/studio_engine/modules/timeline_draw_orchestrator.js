import { prepareTimelineDraw } from "./timeline_draw.js";
import { drawTimelineOverlays } from "./timeline_draw_overlays.js";
import { drawTimelineTracks } from "./timeline_draw_tracks.js";
import { drawTimelineStatusAndEmit } from "./timeline_draw_status.js";

export function drawTimelineFrame(state, deps = {}) {
  const {
    CONSTANTS,
    Utils,
    normalizeSectionHeight,
    resolveVisibleSectionHeight,
    buildTrackRowsLayout,
    getSectionResizeHandleRect,
    drawTimeRuler,
    drawSectionWaveform,
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
    resolveClipHandleSafeInset,
    drawClipSignal,
    drawClipEditOverlay,
    drawClipSourceWindowControl,
    drawClipHandles,
    resolveTrackStepIndex,
    canJoinAdjacentClips,
    renderFooter,
    hasUnmutedMidiTracks,
    hasTrackAudioPlayback,
    isMixTrackMuted,
    collectSelectedClipRefs,
    serializePreviewClipEdits,
    emitTimelineViewState,
  } = deps;

  const { ctx, studioData } = state;
  const prepared = prepareTimelineDraw(state, ctx, studioData, {
    CONSTANTS,
    Utils,
    normalizeSectionHeight,
    resolveVisibleSectionHeight,
    buildTrackRowsLayout,
    getSectionResizeHandleRect,
    drawTimeRuler,
    drawSectionWaveform,
    buildStageGroups,
    resolveTrackStageGroup,
    isTrackMuted,
  });
  if (!prepared) return;

  drawTimelineTracks(state, ctx, studioData, prepared, {
    CONSTANTS,
    Utils,
    Drop,
    resolveTrackPartition,
    isTrackMuted,
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
    resolveClipHandleSafeInset,
    drawClipSignal,
    drawClipEditOverlay,
    drawClipSourceWindowControl,
    drawClipHandles,
    resolveTrackStepIndex,
    canJoinAdjacentClips,
  });

  drawTimelineOverlays(state, ctx, prepared, {
    CONSTANTS,
    Utils,
  });

  drawTimelineStatusAndEmit(state, {
    renderFooter,
    hasUnmutedMidiTracks,
    hasTrackAudioPlayback,
    isMixTrackMuted,
    collectSelectedClipRefs,
    serializePreviewClipEdits,
    emitTimelineViewState,
  });
}
