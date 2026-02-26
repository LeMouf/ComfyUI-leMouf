export function createTimelineTrackAudioRuntime({
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
} = {}) {
  function clearTrackAudioPlayers(state) {
    if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return;
    for (const entry of state.trackAudioPlayers.values()) {
      const playersByAssetKey = entry?.playersByAssetKey instanceof Map
        ? entry.playersByAssetKey
        : null;
      if (!playersByAssetKey || !playersByAssetKey.size) continue;
      for (const player of playersByAssetKey.values()) {
        const audio = player?.audio;
        if (!audio) continue;
        if (player._pauseTimer) {
          clearTimeout(player._pauseTimer);
          player._pauseTimer = null;
        }
        if (player.handlers) {
          try {
            if (player.handlers.onError) audio.removeEventListener("error", player.handlers.onError);
            if (player.handlers.onReady) {
              audio.removeEventListener("loadedmetadata", player.handlers.onReady);
              audio.removeEventListener("canplay", player.handlers.onReady);
            }
          } catch {}
        }
        try {
          audio.pause();
          audio.src = "";
          audio.load();
        } catch {}
        try { player.clipGain?.disconnect?.(); } catch {}
        try { player.mediaNode?.disconnect?.(); } catch {}
      }
      try { entry.trackGain?.disconnect?.(); } catch {}
      playersByAssetKey.clear();
    }
    state.trackAudioPlayers.clear();
  }

  function resolveTrackAudioActiveEventAtTime(state, trackName, timeSec) {
    const name = String(trackName || "").trim();
    if (!name) return null;
    const events = Array.isArray(state?.studioData?.eventsByTrack?.[name])
      ? state.studioData.eventsByTrack[name]
      : [];
    if (!events.length) return null;
    const t = Math.max(0, Number(timeSec || 0));
    // Keep event pick resilient around seek/scrub floating-point drift while
    // preserving an exclusive end-edge to avoid overlap between adjacent clips.
    const eps = CONSTANTS.TRACK_AUDIO_EVENT_EDGE_EPS_SEC;
    let selected = null;
    for (const event of events) {
      if (!event || typeof event !== "object") continue;
      const start = Math.max(0, Number(event?.time || 0));
      const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
      const end = start + duration;
      if (t < start - eps) continue;
      if (t >= end - eps * 0.25) continue;
      if (!selected) {
        selected = { event, start, end, duration, boundaryRecovery: false };
        continue;
      }
      if (start > selected.start + eps) {
        selected = { event, start, end, duration, boundaryRecovery: false };
        continue;
      }
      if (Math.abs(start - selected.start) <= eps && end > selected.end + eps) {
        selected = { event, start, end, duration, boundaryRecovery: false };
      }
    }
    if (!selected) {
      const recoveryEps = Math.max(eps, CONSTANTS.TRACK_AUDIO_BOUNDARY_RECOVERY_EPS_SEC);
      let boundaryCandidate = null;
      let boundaryScore = Number.NEGATIVE_INFINITY;
      for (const event of events) {
        if (!event || typeof event !== "object") continue;
        const start = Math.max(0, Number(event?.time || 0));
        const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
        const end = start + duration;
        const distToStart = Math.abs(t - start);
        const distToEnd = Math.abs(t - end);
        const nearStart = distToStart <= recoveryEps;
        const nearEnd = distToEnd <= recoveryEps;
        if (!nearStart && !nearEnd) continue;
        const continuityBias = nearStart ? 2 : 0;
        const endBias = nearEnd ? 1 : 0;
        const score = continuityBias + endBias + (start * 1e-6);
        if (score > boundaryScore) {
          boundaryScore = score;
          boundaryCandidate = { event, start, end, duration, boundaryRecovery: true };
        }
      }
      if (boundaryCandidate) return boundaryCandidate;
    }
    return selected;
  }

  function resolveTrackAudioEventByClipId(state, trackName, clipId) {
    const name = String(trackName || "").trim();
    const targetClipId = String(clipId || "").trim();
    if (!name || !targetClipId) return null;
    const events = Array.isArray(state?.studioData?.eventsByTrack?.[name])
      ? state.studioData.eventsByTrack[name]
      : [];
    if (!events.length) return null;
    for (const event of events) {
      if (!event || typeof event !== "object") continue;
      if (String(event?.clipId || "").trim() !== targetClipId) continue;
      const start = Math.max(0, Number(event?.time || 0));
      const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
      return {
        event,
        start,
        duration,
        end: start + duration,
      };
    }
    return null;
  }

  function resolveTrackAudioLocalTime(active, playheadSec, player = null) {
    if (!active || !active.event) return 0;
    const start = Math.max(0, Number(active.start || 0));
    const sourceDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(active.event?.sourceDurationSec || active.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const mediaDurationSec = Number(player?.audio?.duration || 0);
    const effectiveSourceDurationSec =
      Number.isFinite(mediaDurationSec) && mediaDurationSec > 0.05
        ? Math.min(sourceDurationSec, mediaDurationSec)
        : sourceDurationSec;
    const startOffsetSec = Math.max(0, Number(active.event?.startOffsetSec || 0));
    const maxLocal = Math.max(0, effectiveSourceDurationSec - 0.01);
    const local = startOffsetSec + Math.max(0, Number(playheadSec || 0) - start);
    return Utils.clamp(local, 0, maxLocal);
  }

  function resolveClipBoundaryGain(active, playheadSec) {
    if (!active || !active.event) return 1;
    const start = Math.max(0, Number(active.start || 0));
    const end = Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(active.end || (start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)));
    const t = Math.max(0, Number(playheadSec || 0));
    const windowSec = Math.max(0.002, Number(CONSTANTS.TRACK_AUDIO_BOUNDARY_FADE_SEC || 0.012));
    const toStart = Math.max(0, t - start);
    const toEnd = Math.max(0, end - t);
    const startFactor = Utils.clamp(toStart / windowSec, 0, 1);
    const endFactor = Utils.clamp(toEnd / windowSec, 0, 1);
    return Utils.clamp(Math.min(startFactor, endFactor), 0, 1);
  }

  function resolveTrackAudioPlayerForEvent(trackEntry, activeEvent) {
    const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
      ? trackEntry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) return null;
    const eventAssetKey = String(activeEvent?.assetKey || "").trim();
    if (eventAssetKey && playersByAssetKey.has(eventAssetKey)) {
      return playersByAssetKey.get(eventAssetKey);
    }
    const defaultAssetKey = String(trackEntry?.defaultAssetKey || "").trim();
    if (defaultAssetKey && playersByAssetKey.has(defaultAssetKey)) {
      return playersByAssetKey.get(defaultAssetKey);
    }
    for (const candidate of playersByAssetKey.values()) {
      if (candidate?.audio && !candidate?.errored) return candidate;
    }
    for (const candidate of playersByAssetKey.values()) {
      if (candidate?.audio) return candidate;
    }
    return null;
  }

  function pauseAllTrackAudioPlayers(trackEntry, { exceptAssetKey = "" } = {}) {
    const keepAssetKey = String(exceptAssetKey || "").trim();
    const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
      ? trackEntry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) return;
    for (const player of playersByAssetKey.values()) {
      const assetKey = String(player?.assetKey || "").trim();
      if (keepAssetKey && assetKey === keepAssetKey) continue;
      const audio = player?.audio;
      if (!audio) continue;
      if (!audio.paused) {
        try { audio.pause(); } catch {}
      }
    }
  }

  function applyTrackPlayerSeek(player, localTime) {
    const audio = player?.audio;
    if (!audio) return false;
    let target = Math.max(0, Number(localTime || 0));
    const readyState = Number(audio.readyState || 0);
    if (!Number.isFinite(readyState) || readyState < 1) {
      player.pendingSeekSec = target;
      return false;
    }
    const mediaDuration = Number(audio.duration || 0);
    if (Number.isFinite(mediaDuration) && mediaDuration > 0.05) {
      target = Utils.clamp(target, 0, Math.max(0, mediaDuration - 0.001));
    }
    try {
      audio.currentTime = target;
      player.pendingSeekSec = null;
      return true;
    } catch {
      player.pendingSeekSec = target;
      return false;
    }
  }

  function applyTrackPlayerSeekWithWindow(state, player, localTime, { playing = false } = {}) {
    const shouldWindow = Boolean(playing && player?.clipGain?.gain && state?.trackPlaybackAudioContext);
    const ctx = state?.trackPlaybackAudioContext || null;
    const gainParam = player?.clipGain?.gain || null;
    const now = ctx ? Number(ctx.currentTime || 0) : 0;
    if (shouldWindow) {
      try {
        gainParam.cancelScheduledValues(now);
        gainParam.setValueAtTime(Number(gainParam.value || 1), now);
        gainParam.linearRampToValueAtTime(0, now + CONSTANTS.TRACK_AUDIO_SEEK_FADE_OUT_SEC);
      } catch {}
    }
    const ok = applyTrackPlayerSeek(player, localTime);
    if (shouldWindow) {
      const fadeInStart = now + (ok ? CONSTANTS.TRACK_AUDIO_SEEK_FADE_OUT_SEC : 0);
      try {
        gainParam.cancelScheduledValues(fadeInStart);
        gainParam.setValueAtTime(0, fadeInStart);
        gainParam.linearRampToValueAtTime(1, fadeInStart + CONSTANTS.TRACK_AUDIO_SEEK_FADE_IN_SEC);
      } catch {}
    }
    return ok;
  }

  function resolvePlaybackDurationSec(state) {
    const hintedDurationSec = Math.max(0, Number(Utils.toFiniteNumber(state?.durationSec, 0) || 0));
    const computedDurationSec = Math.max(
      0,
      Number(Utils.toFiniteNumber(getTimelineMaxTimeSec(state, { includePreview: true }), 0) || 0)
    );
    return Math.max(hintedDurationSec, computedDurationSec);
  }

  function resolveTrackPlaybackClockTimeSec(state, playbackDurationSec) {
    if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return null;
    const maxDuration = Math.max(0, Number(playbackDurationSec || resolvePlaybackDurationSec(state) || 0));
    for (const [trackName, entry] of state.trackAudioPlayers.entries()) {
      if (isTrackMuted(state, trackName)) continue;
      const activeClipId = String(entry?.activeClipId || "").trim();
      const activeAssetKey = String(entry?.activeAssetKey || "").trim();
      if (!activeClipId || !activeAssetKey) continue;
      const playersByAssetKey = entry?.playersByAssetKey instanceof Map
        ? entry.playersByAssetKey
        : null;
      if (!playersByAssetKey || !playersByAssetKey.size) continue;
      const player = playersByAssetKey.get(activeAssetKey);
      const audio = player?.audio;
      if (!audio || player?.errored || audio.paused) continue;
      const active = resolveTrackAudioEventByClipId(state, trackName, activeClipId);
      if (!active?.event) continue;
      const local = Number(audio.currentTime || 0);
      const offsetSec = Math.max(0, Number(active.event?.startOffsetSec || 0));
      const timelineSec = active.start + Math.max(0, local - offsetSec);
      if (!Number.isFinite(timelineSec)) continue;
      return Utils.clamp(timelineSec, 0, maxDuration);
    }
    return null;
  }

  function syncTrackAudioPlayersToPlayhead(state, { play = false, forceSeek = false } = {}) {
    if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return;
    const shouldPlay = Boolean(play);
    if (shouldPlay) {
      // Best effort: keep WebAudio bus resumed while transport is running.
      void resumeTrackPlaybackAudioContext(state);
    }
    const playbackDurationSec = resolvePlaybackDurationSec(state);
    const t = Utils.clamp(Number(state.playheadSec || 0), 0, playbackDurationSec);
    for (const [trackName, entry] of state.trackAudioPlayers.entries()) {
      const playersByAssetKey = entry?.playersByAssetKey instanceof Map
        ? entry.playersByAssetKey
        : null;
      if (!playersByAssetKey || !playersByAssetKey.size) continue;
      const muted = isTrackMuted(state, trackName);
      let active = resolveTrackAudioActiveEventAtTime(state, trackName, t);
      const previousClipId = String(entry.activeClipId || "").trim();
      if (previousClipId && (!shouldPlay || forceSeek)) {
        const previousActive = resolveTrackAudioEventByClipId(state, trackName, previousClipId);
        if (previousActive?.event) {
          const previousNearBoundary = (
            t >= previousActive.start - CONSTANTS.TRACK_AUDIO_SWITCH_HYSTERESIS_SEC &&
            t <= previousActive.end + CONSTANTS.TRACK_AUDIO_SWITCH_HYSTERESIS_SEC
          );
          if (previousNearBoundary) {
            if (!active) {
              active = previousActive;
            } else {
              const currentClipId = String(active?.event?.clipId || "").trim();
              if (currentClipId && currentClipId !== previousClipId) {
                const nearClipBoundary = Math.abs(t - previousActive.end) <= CONSTANTS.TRACK_AUDIO_SWITCH_HYSTERESIS_SEC;
                if (nearClipBoundary) active = previousActive;
              }
            }
          }
        }
      }
      const activeClipId = String(active?.event?.clipId || "").trim();
      const shouldClipPlay = Boolean(shouldPlay && !muted && active);
      const previousAssetKey = String(entry.activeAssetKey || "").trim();
      const previousClipIdForLog = String(entry.activeClipId || "").trim();

      if (!active) {
        entry.activeClipId = "";
        entry.activeAssetKey = "";
        const playersByAssetKey = entry?.playersByAssetKey instanceof Map
          ? entry.playersByAssetKey
          : null;
        if (playersByAssetKey && playersByAssetKey.size) {
          for (const player of playersByAssetKey.values()) {
            clearPlayerPauseTimer(player);
            pausePlayerWithFade(state, player, CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC);
          }
        } else {
          pauseAllTrackAudioPlayers(entry);
        }
        continue;
      }
      if (active.boundaryRecovery) {
        logTransportStressEvent(
          state,
          "boundary_recovery",
          {
            track: trackName,
            clipId: String(active?.event?.clipId || ""),
            t: Number(t || 0),
            start: Number(active.start || 0),
            end: Number(active.end || 0),
          },
          { throttleMs: 120, key: `br:${trackName}` }
        );
      }

      const selectedPlayer = resolveTrackAudioPlayerForEvent(entry, active.event);
      const audio = selectedPlayer?.audio;
      if (!audio || selectedPlayer?.errored) {
        entry.activeClipId = activeClipId;
        entry.activeAssetKey = String(selectedPlayer?.assetKey || "");
        pauseAllTrackAudioPlayers(entry, { exceptAssetKey: entry.activeAssetKey });
        continue;
      }
      const selectedAssetKey = String(selectedPlayer?.assetKey || "").trim();
      clearPlayerPauseTimer(selectedPlayer);
      try {
        audio.muted = false;
        if (!selectedPlayer.usesWebAudioBus) {
          audio.volume = muted ? 0 : 1;
        } else {
          audio.volume = 1;
        }
      } catch {}
      const localTime = resolveTrackAudioLocalTime(active, t, selectedPlayer);
      const currentLocal = Number(audio.currentTime || 0);
      const drift = Math.abs(currentLocal - localTime);
      const clipChanged =
        String(entry.activeClipId || "") !== activeClipId ||
        String(entry.activeAssetKey || "") !== selectedAssetKey;
      const mustPrimePaused = Boolean(shouldClipPlay && audio.paused);
      const shouldSeekForRunningDrift = (
        shouldClipPlay &&
        !forceSeek &&
        !clipChanged &&
        !mustPrimePaused &&
        drift > CONSTANTS.TRACK_AUDIO_RUNNING_DRIFT_SEC
      );

      if (forceSeek || clipChanged || mustPrimePaused || shouldSeekForRunningDrift) {
        applyTrackPlayerSeekWithWindow(state, selectedPlayer, localTime, { playing: shouldClipPlay });
      }
      entry.activeClipId = activeClipId;
      entry.activeAssetKey = selectedAssetKey;
      if (shouldClipPlay && clipChanged) {
        logTransportStressEvent(
          state,
          "clip_transition",
          {
            track: trackName,
            fromClipId: previousClipIdForLog,
            toClipId: activeClipId,
            assetKey: selectedAssetKey,
            playheadSec: Number(t || 0),
            forceSeek: Boolean(forceSeek),
          },
          { throttleMs: 40, key: `tr:${trackName}` }
        );
      }
      const pauseOtherPlayers = () => {
        if (playersByAssetKey && playersByAssetKey.size) {
          for (const [assetKey, player] of playersByAssetKey.entries()) {
            if (String(assetKey || "") === selectedAssetKey) continue;
            clearPlayerPauseTimer(player);
            pausePlayerWithFade(state, player, CONSTANTS.TRACK_AUDIO_SWITCH_CROSSFADE_SEC);
          }
        } else {
          pauseAllTrackAudioPlayers(entry, { exceptAssetKey: selectedAssetKey });
        }
      };

      if (!shouldClipPlay) {
        selectedPlayer.pendingPlay = false;
        pauseOtherPlayers();
        pausePlayerWithFade(state, selectedPlayer, CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC);
        continue;
      }

      if (selectedPlayer.pendingSeekSec != null) {
        // Robustness: when playback starts away from t=0, a first seek can fail before media is ready.
        // Re-try pending seek on each sync pass so audio can recover deterministically once ready.
        const pendingTarget = Number(selectedPlayer.pendingSeekSec || 0);
        const applied = applyTrackPlayerSeekWithWindow(state, selectedPlayer, pendingTarget, { playing: shouldClipPlay });
        if (!applied) {
          selectedPlayer.pendingPlay = shouldClipPlay;
          continue;
        }
      }

      selectedPlayer.pendingPlay = false;
      const ctx = state.trackPlaybackAudioContext || null;
      const now = ctx ? Number(ctx.currentTime || 0) : 0;
      if (selectedPlayer?.clipGain?.gain) {
        const boundaryGain = shouldClipPlay ? resolveClipBoundaryGain(active, t) : 0;
        const shouldCrossfade = Boolean(
          previousAssetKey &&
          previousAssetKey !== selectedAssetKey &&
          !audio.paused
        );
        scheduleGainRamp(
          selectedPlayer.clipGain.gain,
          boundaryGain,
          now,
          shouldCrossfade ? CONSTANTS.TRACK_AUDIO_SWITCH_CROSSFADE_SEC : CONSTANTS.TRACK_AUDIO_GAIN_RAMP_SEC
        );
      }
      if (audio.paused) {
        try {
          clearPlayerPauseTimer(selectedPlayer);
          if (selectedPlayer?.clipGain?.gain) {
            try {
              selectedPlayer.clipGain.gain.cancelScheduledValues(now);
              selectedPlayer.clipGain.gain.setValueAtTime(0, now);
            } catch {}
          }
          const result = audio.play();
          if (result && typeof result.catch === "function") {
            result.catch(() => {
              selectedPlayer.lastPlayBlockedAt = Date.now();
            });
          }
        } catch {
          selectedPlayer.lastPlayBlockedAt = Date.now();
        }
      }
      pauseOtherPlayers();
    }
  }

  function maybeRebasePlayheadFromTrackClock(state, playbackDurationSec, tsMs = null) {
    const nowMs = Number(tsMs || performance.now() || 0);
    const blockedUntilMs = Number(state?.trackClockRebaseBlockedUntilMs || 0);
    if (Number.isFinite(blockedUntilMs) && nowMs < blockedUntilMs) return false;
    const trackClockSec = resolveTrackPlaybackClockTimeSec(state, playbackDurationSec);
    if (trackClockSec == null) return false;
    const currentPlayhead = Utils.clamp(Number(state.playheadSec || 0), 0, playbackDurationSec);
    const delta = Number(trackClockSec || 0) - Number(currentPlayhead || 0);
    const drift = Math.abs(delta);
    if (!(drift > CONSTANTS.TRACK_AUDIO_CLOCK_REBASE_DRIFT_SEC)) return false;
    if (state.isPlaying && delta < 0) return false;
    logTransportStressEvent(
      state,
      "clock_rebase",
      {
        fromPlayheadSec: Number(currentPlayhead || 0),
        toPlayheadSec: Number(trackClockSec || 0),
        driftSec: Number(drift || 0),
        durationSec: Number(playbackDurationSec || 0),
        tsMs: nowMs,
      },
      { throttleMs: 80, key: "clock_rebase" }
    );
    state.playheadSec = Utils.clamp(trackClockSec, 0, playbackDurationSec);
    rebaseTransportClockAtCurrentPlayhead(state, nowMs);
    return true;
  }

  function setupTrackAudioPlayers(state, onResolveAudioUrl) {
    clearTrackAudioPlayers(state);
    if (typeof Audio !== "function") return;
    if (typeof onResolveAudioUrl !== "function") return;
    const playbackCtx = ensureTrackPlaybackAudioContext(state);
    const masterGain = state.trackPlaybackMasterGain || null;
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const eventsByTrack = state.studioData?.eventsByTrack || {};
    for (const track of tracks) {
      const trackName = String(track?.name || "");
      const kind = String(track?.kind || "").toLowerCase();
      const defaultAssetKey = String(track?.audioAssetKey || "").trim();
      const playAudio = track?.playAudio !== false;
      if (!trackName || kind !== "audio") continue;
      if (!playAudio) continue;
      const trackEvents = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
      const assetKeyCandidates = new Set();
      if (defaultAssetKey && defaultAssetKey !== "mix") assetKeyCandidates.add(defaultAssetKey);
      for (const event of trackEvents) {
        const eventAssetKey = String(event?.assetKey || "").trim();
        if (!eventAssetKey || eventAssetKey === "mix") continue;
        assetKeyCandidates.add(eventAssetKey);
      }
      if (!assetKeyCandidates.size) continue;
      let trackGain = null;
      if (playbackCtx && masterGain) {
        try {
          trackGain = playbackCtx.createGain();
          trackGain.gain.setValueAtTime(isTrackMuted(state, trackName) ? 0 : 1, playbackCtx.currentTime);
          trackGain.connect(masterGain);
        } catch {
          trackGain = null;
        }
      }
      const playersByAssetKey = new Map();
      for (const assetKey of assetKeyCandidates.values()) {
        const url = String(onResolveAudioUrl(assetKey) || "").trim();
        if (!url) continue;
        const audio = new Audio();
        const player = {
          assetKey,
          audio,
          errored: false,
          handlers: null,
          pendingSeekSec: null,
          pendingPlay: false,
          clipGain: null,
          mediaNode: null,
          _pauseTimer: null,
          usesWebAudioBus: false,
        };
        if (playbackCtx && trackGain) {
          try {
            const mediaNode = playbackCtx.createMediaElementSource(audio);
            const clipGain = playbackCtx.createGain();
            clipGain.gain.setValueAtTime(0, playbackCtx.currentTime);
            mediaNode.connect(clipGain);
            clipGain.connect(trackGain);
            player.mediaNode = mediaNode;
            player.clipGain = clipGain;
            player.usesWebAudioBus = true;
          } catch {
            player.mediaNode = null;
            player.clipGain = null;
            player.usesWebAudioBus = false;
          }
        }
        const onError = () => {
          player.errored = true;
        };
        const onReady = () => {
          if (player.errored) return;
          if (player.pendingSeekSec != null) {
            const applied = applyTrackPlayerSeek(player, player.pendingSeekSec);
            if (!applied) return;
          }
          if (player.pendingPlay && audio.paused) {
            try {
              const result = audio.play();
              if (result && typeof result.catch === "function") {
                result.catch(() => {
                  player.lastPlayBlockedAt = Date.now();
                });
              }
            } catch {
              player.lastPlayBlockedAt = Date.now();
            }
          }
        };
        player.handlers = { onError, onReady };
        audio.preload = "metadata";
        // Keep HTML element unmuted; bus/gain routing handles level policy.
        // This avoids silent playback on some WebAudio implementations.
        audio.muted = false;
        audio.volume = 1;
        audio.addEventListener("error", onError);
        audio.addEventListener("loadedmetadata", onReady);
        audio.addEventListener("canplay", onReady);
        audio.src = url;
        try {
          audio.load();
        } catch {}
        playersByAssetKey.set(assetKey, player);
      }
      if (!playersByAssetKey.size) continue;
      const entry = {
        playersByAssetKey,
        trackGain,
        defaultAssetKey:
          (defaultAssetKey && playersByAssetKey.has(defaultAssetKey))
            ? defaultAssetKey
            : String(playersByAssetKey.keys().next().value || ""),
        activeClipId: "",
        activeAssetKey: "",
      };
      state.trackAudioPlayers.set(trackName, entry);
    }
    syncTrackAudioMuteVolumes(state);
  }

  return {
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
  };
}
