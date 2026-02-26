export function seekTimeline(state, timeSec, deps = {}) {
  const {
    CONSTANTS,
    Utils,
    resolvePlaybackDurationSec,
    syncTrackAudioPlayersToPlayhead,
    rebaseTransportClockAtCurrentPlayhead,
    logTransportStressEvent,
    draw,
  } = deps;

  const safeDurationSec = resolvePlaybackDurationSec(state);
  const fallbackPlayhead = Math.max(0, Number(Utils.toFiniteNumber(state?.playheadSec, 0) || 0));
  const safeTimeSec = Number(Utils.toFiniteNumber(timeSec, fallbackPlayhead) ?? fallbackPlayhead);
  state.playheadSec = Utils.clamp(safeTimeSec, 0, safeDurationSec);
  state.trackClockRebaseBlockedUntilMs = performance.now() + CONSTANTS.TRACK_AUDIO_REBASE_SEEK_GRACE_MS;
  if (state.audio && state.audioSource) {
    try {
      const mediaDuration = Number(state.audio.duration || 0);
      const mediaClampMax =
        Number.isFinite(mediaDuration) && mediaDuration > 0.05
          ? Math.max(0, mediaDuration - 0.001)
          : safeDurationSec;
      state.audio.currentTime = Utils.clamp(state.playheadSec, 0, Math.max(0, mediaClampMax));
    } catch {}
  }
  syncTrackAudioPlayersToPlayhead(state, { play: false, forceSeek: true });
  rebaseTransportClockAtCurrentPlayhead(state);
  logTransportStressEvent(
    state,
    "seek",
    {
      requestedSec: Number(timeSec || 0),
      resolvedSec: Number(state.playheadSec || 0),
      durationSec: Number(safeDurationSec || 0),
    },
    { throttleMs: 60, key: "seek" }
  );
  draw(state);
}

export function startTimelinePlayback(state, deps = {}) {
  const {
    CONSTANTS,
    Utils,
    stopScrubGrains,
    resumeTrackPlaybackAudioContext,
    beginTransportClock,
    logTransportStressEvent,
    startMidiPlayback,
    hasTrackAudioPlayback,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    isMixTrackMuted,
    draw,
    getPlaybackClockAudio,
    resolvePlaybackDurationSec,
    resolveTransportPlayheadFromClock,
    rebaseTransportClockAtCurrentPlayhead,
    maybeRebasePlayheadFromTrackClock,
  } = deps;

  if (state.isPlaying) return;
  stopScrubGrains(state);
  state.isPlaying = true;
  state.lastFrameTs = null;
  state.trackClockRebaseBlockedUntilMs = performance.now() + CONSTANTS.TRACK_AUDIO_REBASE_STARTUP_GRACE_MS;
  void resumeTrackPlaybackAudioContext(state);
  beginTransportClock(state);
  logTransportStressEvent(state, "play_start", {
    playheadSec: Number(state.playheadSec || 0),
    clockKind: String(state.transportClockKind || "none"),
  });

  void startMidiPlayback(state);
  if (hasTrackAudioPlayback(state, { unmutedOnly: true })) {
    syncTrackAudioMuteVolumes(state);
    syncTrackAudioPlayersToPlayhead(state, { play: true, forceSeek: true });
    setTimeout(() => {
      if (!state.isPlaying) return;
      syncTrackAudioPlayersToPlayhead(state, { play: true, forceSeek: true });
    }, 90);
    if (state.audio && state.audioSource) {
      try {
        state.audio.pause();
      } catch {}
    }
  } else if (state.audio && state.audioSource && !isMixTrackMuted(state)) {
    try {
      state.audio.currentTime = state.playheadSec;
      const result = state.audio.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {
          state.audioErrored = true;
          draw(state);
        });
      }
    } catch {
      state.audioErrored = true;
    }
  }

  const tick = (ts) => {
    if (!state.isPlaying) return;
    const playbackDurationSec = resolvePlaybackDurationSec(state);
    const prevPlayheadSec = Math.max(0, Number(state.playheadSec || 0));
    {
      const clockAudio = getPlaybackClockAudio(state);
      const hasAudioClock = clockAudio && !clockAudio.paused;
      if (hasAudioClock) {
        const clockPlayheadSec = Utils.clamp(clockAudio.currentTime || 0, 0, playbackDurationSec);
        // Avoid tiny backward jitter at resume/clip boundaries while still allowing
        // explicit rebase when drift becomes meaningful.
        if (
          clockPlayheadSec < prevPlayheadSec &&
          (prevPlayheadSec - clockPlayheadSec) <= CONSTANTS.TRACK_AUDIO_EVENT_EDGE_EPS_SEC
        ) {
          state.playheadSec = prevPlayheadSec;
        } else {
          state.playheadSec = clockPlayheadSec;
        }
        if (clockAudio.ended || state.playheadSec >= playbackDurationSec) {
          state.playheadSec = playbackDurationSec;
          state.isPlaying = false;
        }
      } else {
        const next = resolveTransportPlayheadFromClock(state, ts, playbackDurationSec);
        if (next >= playbackDurationSec) {
          state.playheadSec = playbackDurationSec;
          state.isPlaying = false;
        } else {
          state.playheadSec = next;
        }
        if (Math.abs(Number(state.transportLastDriftSec || 0)) > CONSTANTS.TRANSPORT_CLOCK_REBASE_DRIFT_SEC) {
          logTransportStressEvent(
            state,
            "transport_drift",
            {
              driftSec: Number(state.transportLastDriftSec || 0),
              clockKind: String(state.transportClockKind || "none"),
              playheadSec: Number(state.playheadSec || 0),
            },
            { throttleMs: 250, key: "transport_drift" }
          );
          rebaseTransportClockAtCurrentPlayhead(state, ts);
        }
      }
      if (state.playheadSec >= playbackDurationSec) {
        state.playheadSec = playbackDurationSec;
        state.isPlaying = false;
      }
    }
    state.lastFrameTs = ts;
    if (hasTrackAudioPlayback(state)) {
      syncTrackAudioPlayersToPlayhead(state, { play: state.isPlaying, forceSeek: false });
      maybeRebasePlayheadFromTrackClock(state, playbackDurationSec, ts);
    }
    draw(state);
    if (state.isPlaying) state.rafId = requestAnimationFrame(tick);
  };

  state.rafId = requestAnimationFrame(tick);
  draw(state);
}

export function stopTimelinePlayback(state, resetPlayhead = false, deps = {}) {
  const {
    logTransportStressEvent,
    resetTransportClockState,
    clearMidiPlayback,
    syncTrackAudioPlayersToPlayhead,
    draw,
  } = deps;

  if (state.isPlaying) {
    logTransportStressEvent(state, "play_stop", {
      playheadSec: Number(state.playheadSec || 0),
      resetPlayhead: Boolean(resetPlayhead),
      clockKind: String(state.transportClockKind || "none"),
    });
  }
  state.isPlaying = false;
  resetTransportClockState(state);
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  clearMidiPlayback(state);
  if (state.audio && state.audioSource) {
    try {
      state.audio.pause();
    } catch {}
  }
  syncTrackAudioPlayersToPlayhead(state, { play: false, forceSeek: false });
  if (resetPlayhead) state.playheadSec = 0;
  if (resetPlayhead && state.audio && state.audioSource) {
    try {
      state.audio.currentTime = 0;
    } catch {}
  }
  if (resetPlayhead) syncTrackAudioPlayersToPlayhead(state, { play: false, forceSeek: true });
  draw(state);
}
