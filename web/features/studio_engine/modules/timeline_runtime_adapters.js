export function createTimelineRuntimeAdapters(deps = {}) {
  const {
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
  } = deps;

  function hasTrackAudioPlayback(state, options = {}) {
    return TRANSPORT_BRIDGE.hasTrackAudioPlayback(state, options);
  }

  function getPlaybackClockAudio(state) {
    return TRANSPORT_BRIDGE.getPlaybackClockAudio(state);
  }

  function resetTransportClockState(state) {
    return TRANSPORT_BRIDGE.resetTransportClockState(state);
  }

  function rebaseTransportClockAtCurrentPlayhead(state, tsMs = null) {
    return TRANSPORT_BRIDGE.rebaseTransportClockAtCurrentPlayhead(state, tsMs);
  }

  const getSectionResizeHandleRect = (state, width) =>
    getSectionResizeHandleRectFromModule(state, width, {
      CONSTANTS,
      normalizeSectionHeight,
    });
  const isPointInSectionResizeHandle = (state, width, x, y) =>
    isPointInSectionResizeHandleFromModule(state, width, x, y, {
      CONSTANTS,
      normalizeSectionHeight,
    });

  function draw(state) {
    drawTimelineFrame(state, {
      CONSTANTS,
      Utils,
      normalizeSectionHeight,
      resolveVisibleSectionHeight,
      buildTrackRowsLayout,
      getSectionResizeHandleRect,
      drawTimeRuler,
      drawSectionWaveform: SECTION_WAVE_RUNTIME.drawSectionWaveform,
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
      resolveClipHandleSafeInset: CLIP_VISUALS_RUNTIME.resolveClipHandleSafeInset,
      drawClipSignal: CLIP_VISUALS_RUNTIME.drawClipSignal,
      drawClipEditOverlay: CLIP_VISUALS_RUNTIME.drawClipEditOverlay,
      drawClipSourceWindowControl: CLIP_VISUALS_RUNTIME.drawClipSourceWindowControl,
      drawClipHandles: CLIP_VISUALS_RUNTIME.drawClipHandles,
      resolveTrackStepIndex,
      canJoinAdjacentClips: CLIP_OPS_RUNTIME.canJoinAdjacentClips,
      renderFooter,
      hasUnmutedMidiTracks,
      hasTrackAudioPlayback,
      isMixTrackMuted: SCRUB_RUNTIME.isMixTrackMuted,
      collectSelectedClipRefs,
      serializePreviewClipEdits,
      emitTimelineViewState,
    });
  }

  function seek(state, timeSec) {
    TRANSPORT_BRIDGE.seek(state, timeSec, draw);
  }

  function startPlayback(state) {
    TRANSPORT_BRIDGE.startPlayback(state, draw);
  }

  function stopPlayback(state, resetPlayhead = false) {
    TRANSPORT_BRIDGE.stopPlayback(state, resetPlayhead, draw);
  }

  function fitToViewport(state, { drawAfter = true } = {}) {
    TRANSPORT_BRIDGE.fitToViewport(state, draw, { drawAfter });
  }

  function getMinPxPerSec(state) {
    return TRANSPORT_BRIDGE.getMinPxPerSec(state);
  }

  function clampTimelineOffsetSec(state, valueSec) {
    return TRANSPORT_BRIDGE.clampTimelineOffsetSec(state, valueSec);
  }

  function refreshTimelineViewAfterDurationChange(state) {
    TRANSPORT_BRIDGE.refreshTimelineViewAfterDurationChange(state, draw);
  }

  return {
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
  };
}

