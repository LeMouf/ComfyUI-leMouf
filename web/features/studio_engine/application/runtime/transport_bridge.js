export function createTimelineTransportBridge(deps = {}) {
  const {
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
    startMidiPlayback,
    clearMidiPlayback,
    hasUnmutedMidiTracks,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    maybeRebasePlayheadFromTrackClock,
    resolvePlaybackDurationSec,
  } = deps;

  function hasTrackAudioPlayback(state, options = {}) {
    return hasTimelineTrackAudioPlayback(state, {
      ...options,
      getUnmutedTrackAudioEntries: SCRUB_RUNTIME.getUnmutedTrackAudioEntries,
    });
  }

  function getPlaybackClockAudio(state) {
    return getTimelinePlaybackClockAudio(state, {
      hasTrackAudioPlayback,
      isMixTrackMuted: SCRUB_RUNTIME.isMixTrackMuted,
    });
  }

  const resetTransportClockState = resetTimelineTransportClockState;
  const beginTransportClock = beginTimelineTransportClock;
  const resolveTransportPlayheadFromClock = (state, tsMs, playbackDurationSec) =>
    resolveTimelineTransportPlayheadFromClock(state, tsMs, playbackDurationSec, { Utils });
  const rebaseTransportClockAtCurrentPlayhead = (state, tsMs = null) =>
    rebaseTimelineTransportClockAtCurrentPlayhead(state, tsMs, { resetTransportClockState });

  function seek(state, timeSec, draw) {
    seekTimeline(state, timeSec, {
      CONSTANTS,
      Utils,
      resolvePlaybackDurationSec,
      syncTrackAudioPlayersToPlayhead,
      rebaseTransportClockAtCurrentPlayhead,
      logTransportStressEvent,
      draw,
    });
  }

  function startPlayback(state, draw) {
    startTimelinePlayback(state, {
      CONSTANTS,
      Utils,
      stopScrubGrains: SCRUB_RUNTIME.stopScrubGrains,
      resumeTrackPlaybackAudioContext,
      beginTransportClock,
      logTransportStressEvent,
      startMidiPlayback,
      hasTrackAudioPlayback,
      syncTrackAudioMuteVolumes,
      syncTrackAudioPlayersToPlayhead,
      isMixTrackMuted: SCRUB_RUNTIME.isMixTrackMuted,
      draw,
      getPlaybackClockAudio,
      resolvePlaybackDurationSec,
      resolveTransportPlayheadFromClock,
      rebaseTransportClockAtCurrentPlayhead,
      maybeRebasePlayheadFromTrackClock,
    });
  }

  function stopPlayback(state, resetPlayhead = false, draw) {
    stopTimelinePlayback(state, resetPlayhead, {
      logTransportStressEvent,
      resetTransportClockState,
      clearMidiPlayback,
      syncTrackAudioPlayersToPlayhead,
      draw,
    });
  }

  function getMinPxPerSec(state) {
    return getTimelineMinPxPerSec(state, {
      CONSTANTS,
      getTimelineMaxTimeSec,
    });
  }

  function clampTimelineOffsetSec(state, valueSec) {
    return clampTimelineViewportOffsetSec(state, valueSec, {
      CONSTANTS,
      Utils,
      getTimelineMaxTimeSec,
    });
  }

  function fitToViewport(state, draw, { drawAfter = true } = {}) {
    fitTimelineToViewport(state, { drawAfter }, {
      CONSTANTS,
      Utils,
      getTimelineMaxTimeSec,
      getMinPxPerSec,
      draw,
    });
  }

  function refreshTimelineViewAfterDurationChange(state, draw) {
    refreshTimelineViewportAfterDurationChange(state, {
      CONSTANTS,
      Utils,
      fitToViewport: (targetState, options = {}) => fitToViewport(targetState, draw, options),
      getMinPxPerSec,
      clampTimelineOffsetSec,
    });
  }

  return {
    hasTrackAudioPlayback,
    getPlaybackClockAudio,
    resetTransportClockState,
    beginTransportClock,
    resolveTransportPlayheadFromClock,
    rebaseTransportClockAtCurrentPlayhead,
    seek,
    startPlayback,
    stopPlayback,
    getMinPxPerSec,
    clampTimelineOffsetSec,
    fitToViewport,
    refreshTimelineViewAfterDurationChange,
  };
}
