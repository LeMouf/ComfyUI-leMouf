export function createTimelineRuntimeHelpers(deps = {}) {
  const { CONSTANTS, Utils } = deps;

  function getScrubAudioContextCtor() {
    if (typeof window === "undefined") return null;
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function ensureTrackPlaybackAudioContext(state) {
    const ContextCtor = getScrubAudioContextCtor();
    if (!ContextCtor) return null;
    if (!state.trackPlaybackAudioContext) {
      try {
        const ctx = new ContextCtor();
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(1, ctx.currentTime);
        masterGain.connect(ctx.destination);
        state.trackPlaybackAudioContext = ctx;
        state.trackPlaybackMasterGain = masterGain;
      } catch {
        state.trackPlaybackAudioContext = null;
        state.trackPlaybackMasterGain = null;
        return null;
      }
    }
    return state.trackPlaybackAudioContext;
  }

  async function resumeTrackPlaybackAudioContext(state) {
    const ctx = ensureTrackPlaybackAudioContext(state);
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
    return ctx.state !== "closed";
  }

  function closeTrackPlaybackAudioBus(state) {
    if (!state) return;
    try {
      state.trackPlaybackMasterGain?.disconnect?.();
    } catch {}
    state.trackPlaybackMasterGain = null;
    if (state.trackPlaybackAudioContext) {
      try {
        state.trackPlaybackAudioContext.close();
      } catch {}
    }
    state.trackPlaybackAudioContext = null;
  }

  function scheduleGainRamp(gainParam, target, now, rampSec = CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC) {
    if (!gainParam) return;
    const startAt = Number.isFinite(now) ? now : 0;
    const duration = Math.max(0.001, Number(rampSec || CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC));
    try {
      gainParam.cancelScheduledValues(startAt);
      gainParam.setValueAtTime(Number(gainParam.value || 0), startAt);
      gainParam.linearRampToValueAtTime(Number(target || 0), startAt + duration);
    } catch {}
  }

  function pausePlayerWithFade(state, player, rampSec = CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC) {
    const audio = player?.audio;
    if (!audio) return;
    const ctx = state?.trackPlaybackAudioContext || null;
    const now = ctx ? Number(ctx.currentTime || 0) : 0;
    if (player?.clipGain?.gain) {
      scheduleGainRamp(player.clipGain.gain, 0, now, rampSec);
    }
    if (player._pauseTimer) {
      clearTimeout(player._pauseTimer);
      player._pauseTimer = null;
    }
    const delayMs = Math.max(0, Math.round((Number(rampSec || 0) + 0.008) * 1000));
    player._pauseTimer = setTimeout(() => {
      try {
        audio.pause();
      } catch {}
      player._pauseTimer = null;
    }, delayMs);
  }

  function clearPlayerPauseTimer(player) {
    if (!player) return;
    if (player._pauseTimer) {
      clearTimeout(player._pauseTimer);
      player._pauseTimer = null;
    }
  }

  function normalizeSkeletonMode(value) {
    if (value === true || value === 1) return true;
    const text = String(value || "").trim().toLowerCase();
    return text === "1" || text === "true" || text === "on" || text === "yes";
  }

  function resolveSlipOffsetFromRailHit(hit, pointerCanvasX, sourceDurationSec, clipDurationSec) {
    const railX0 = Number(hit?.rail_x0);
    const railX1 = Number(hit?.rail_x1);
    const knobW = Math.max(0, Number(hit?.knob_w || 0));
    if (!Number.isFinite(railX0) || !Number.isFinite(railX1) || railX1 <= railX0) return null;
    const maxOffsetSec = Math.max(0, Number(sourceDurationSec || 0) - Number(clipDurationSec || 0));
    if (maxOffsetSec <= 0.0005) return 0;
    const railW = Math.max(1, railX1 - railX0);
    const travelW = Math.max(0, railW - knobW);
    if (travelW <= 0.0005) return 0;
    const pointerX = Utils.clamp(Number(pointerCanvasX || railX0), railX0, railX1);
    const normalized = Utils.clamp((pointerX - railX0 - knobW * 0.5) / travelW, 0, 1);
    return Utils.clamp(normalized * maxOffsetSec, 0, maxOffsetSec);
  }

  function isTrackMuted(state, trackName) {
    return Boolean(state.mutedTracks && state.mutedTracks.has(String(trackName || "")));
  }

  function isTrackLocked(state, trackName) {
    return Boolean(state?.lockedTracks && state.lockedTracks.has(String(trackName || "")));
  }

  function hasUnmutedMidiTracks(state) {
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    for (const track of tracks) {
      if (String(track?.kind || "").toLowerCase() !== "midi") continue;
      const name = String(track?.name || "");
      if (!name) continue;
      if (!isTrackMuted(state, name)) return true;
    }
    return false;
  }

  function toggleTrackMute(state, trackName) {
    const name = String(trackName || "");
    if (!name) return;
    if (!state.mutedTracks) state.mutedTracks = new Set();
    if (state.mutedTracks.has(name)) state.mutedTracks.delete(name);
    else state.mutedTracks.add(name);
  }

  function setTrackMuted(state, trackName, muted) {
    const name = String(trackName || "");
    if (!name) return false;
    if (!state.mutedTracks) state.mutedTracks = new Set();
    const shouldMute = Boolean(muted);
    const alreadyMuted = state.mutedTracks.has(name);
    if (shouldMute === alreadyMuted) return false;
    if (shouldMute) state.mutedTracks.add(name);
    else state.mutedTracks.delete(name);
    return true;
  }

  function syncTrackAudioMuteVolumes(state) {
    if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return;
    const ctx = state.trackPlaybackAudioContext || null;
    const now = ctx ? Number(ctx.currentTime || 0) : 0;
    for (const [trackName, entry] of state.trackAudioPlayers.entries()) {
      const playersByAssetKey = entry?.playersByAssetKey instanceof Map
        ? entry.playersByAssetKey
        : null;
      if (!playersByAssetKey || !playersByAssetKey.size) continue;
      const muted = isTrackMuted(state, trackName);
      if (entry?.trackGain?.gain) {
        scheduleGainRamp(entry.trackGain.gain, muted ? 0 : 1, now, CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC);
      }
      for (const player of playersByAssetKey.values()) {
        if (!player?.audio) continue;
        try {
          // Keep media elements unmuted for cross-browser MediaElementSource stability.
          // The bus/track gains drive audible output when WebAudio is active.
          player.audio.muted = false;
          player.audio.volume = 1;
        } catch {}
        if (!player.usesWebAudioBus) {
          try {
            player.audio.volume = muted ? 0 : 1;
          } catch {}
        }
      }
    }
  }

  function hitTest(state, x, y) {
    for (let i = state.hitRegions.length - 1; i >= 0; i -= 1) {
      const region = state.hitRegions[i];
      if (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1) return region.payload;
    }
    return null;
  }

  return {
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
    toggleTrackMute,
    setTrackMuted,
    syncTrackAudioMuteVolumes,
    hitTest,
  };
}

