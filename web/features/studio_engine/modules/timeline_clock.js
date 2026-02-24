export function hasTimelineTrackAudioPlayback(state, options = {}) {
  const { unmutedOnly = false } = options;
  const { getUnmutedTrackAudioEntries } = options;
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return false;
  if (!unmutedOnly) return true;
  if (typeof getUnmutedTrackAudioEntries !== "function") return false;
  return getUnmutedTrackAudioEntries(state).length > 0;
}

export function getTimelinePlaybackClockAudio(state, deps = {}) {
  const { hasTrackAudioPlayback, isMixTrackMuted } = deps;
  if (hasTrackAudioPlayback(state, { unmutedOnly: true })) return null;
  if (state.audio && state.audioSource && !state.audioErrored && !isMixTrackMuted(state)) return state.audio;
  return null;
}

export function resetTimelineTransportClockState(state) {
  state.transportClockKind = "none";
  state.transportClockStartSec = 0;
  state.transportTimelineStartSec = Math.max(0, Number(state.playheadSec || 0));
  state.transportLastDriftSec = 0;
}

export function beginTimelineTransportClock(state) {
  const ctx = state.trackPlaybackAudioContext || null;
  if (ctx && ctx.state !== "closed") {
    state.transportClockKind = "webaudio";
    state.transportClockStartSec = Number(ctx.currentTime || 0);
    state.transportTimelineStartSec = Math.max(0, Number(state.playheadSec || 0));
    state.transportLastDriftSec = 0;
    return;
  }
  state.transportClockKind = "raf";
  state.transportClockStartSec = Number(state.lastFrameTs || 0) / 1000;
  state.transportTimelineStartSec = Math.max(0, Number(state.playheadSec || 0));
  state.transportLastDriftSec = 0;
}

export function resolveTimelineTransportPlayheadFromClock(state, tsMs, playbackDurationSec, deps = {}) {
  const { Utils } = deps;
  const durationSec = Math.max(0, Number(playbackDurationSec || 0));
  if (state.transportClockKind === "webaudio") {
    const ctx = state.trackPlaybackAudioContext || null;
    if (ctx && ctx.state !== "closed") {
      const elapsed = Math.max(0, Number(ctx.currentTime || 0) - Number(state.transportClockStartSec || 0));
      const next = Utils.clamp(Number(state.transportTimelineStartSec || 0) + elapsed, 0, durationSec);
      state.transportLastDriftSec = next - Number(state.playheadSec || 0);
      return next;
    }
    state.transportClockKind = "raf";
    state.transportClockStartSec = Number(tsMs || 0) / 1000;
    state.transportTimelineStartSec = Math.max(0, Number(state.playheadSec || 0));
  }
  if (state.transportClockKind === "raf") {
    const nowSec = Number(tsMs || 0) / 1000;
    const elapsed = Math.max(0, nowSec - Number(state.transportClockStartSec || nowSec));
    const next = Utils.clamp(Number(state.transportTimelineStartSec || 0) + elapsed, 0, durationSec);
    state.transportLastDriftSec = next - Number(state.playheadSec || 0);
    return next;
  }
  state.transportLastDriftSec = 0;
  return Utils.clamp(Number(state.playheadSec || 0), 0, durationSec);
}

export function rebaseTimelineTransportClockAtCurrentPlayhead(state, tsMs = null, deps = {}) {
  const { resetTransportClockState } = deps;
  const clockKind = String(state.transportClockKind || "none");
  if (clockKind === "webaudio") {
    const ctx = state.trackPlaybackAudioContext || null;
    if (ctx && ctx.state !== "closed") {
      state.transportClockStartSec = Number(ctx.currentTime || 0);
      state.transportTimelineStartSec = Math.max(0, Number(state.playheadSec || 0));
      state.transportLastDriftSec = 0;
      return;
    }
  }
  if (clockKind === "raf") {
    const nowSec = Number(tsMs || performance.now()) / 1000;
    state.transportClockStartSec = nowSec;
    state.transportTimelineStartSec = Math.max(0, Number(state.playheadSec || 0));
    state.transportLastDriftSec = 0;
    return;
  }
  if (typeof resetTransportClockState === "function") {
    resetTransportClockState(state);
  }
}
