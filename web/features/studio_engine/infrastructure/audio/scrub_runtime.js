export function createTimelineScrubRuntime(deps = {}) {
  const {
    CONSTANTS,
    Utils,
    getPlaybackClockAudio,
    isTrackMuted,
    resolveTrackAudioActiveEventAtTime,
    resolveTrackAudioPlayerForEvent,
    hasUnmutedMidiTracks,
    ensureMidiAudioReady,
    inferMidiPreset,
    buildPresetIntent,
    planDsp,
    midiNoteToFrequency,
    getScrubAudioContextCtor,
  } = deps;

  function resolveScrubSourceUrl(state) {
    const clockAudio = getPlaybackClockAudio(state);
    if (clockAudio) {
      const clockUrl = String(clockAudio.currentSrc || clockAudio.src || "").trim();
      if (clockUrl) return clockUrl;
    }
    const activeTrackUrl = resolveActiveTrackAudioUrlAtPlayhead(state);
    if (activeTrackUrl) return activeTrackUrl;
    const unmutedEntries = getUnmutedTrackAudioEntries(state);
    for (const item of unmutedEntries) {
      const audio = item?.audio;
      if (!audio) continue;
      const url = String(audio.currentSrc || audio.src || "").trim();
      if (url) return url;
    }
    if (state.audio && state.audioSource && !state.audioErrored && !isMixTrackMuted(state)) {
      return String(state.audio.currentSrc || state.audio.src || state.audioSource || "").trim();
    }
    return "";
  }

  function resolveActiveTrackAudioUrlAtPlayhead(state) {
    if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return "";
    const playheadSec = Utils.clamp(Number(state.playheadSec || 0), 0, Math.max(0, Number(state.durationSec || 0)));
    for (const [trackName, trackEntry] of state.trackAudioPlayers.entries()) {
      if (isTrackMuted(state, trackName)) continue;
      const active = resolveTrackAudioActiveEventAtTime(state, trackName, playheadSec);
      if (!active?.event) continue;
      const player = resolveTrackAudioPlayerForEvent(trackEntry, active.event);
      const audio = player?.audio;
      if (!audio) continue;
      const url = String(audio.currentSrc || audio.src || "").trim();
      if (url) return url;
    }
    return "";
  }

  function getUnmutedTrackAudioEntries(state) {
    if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return [];
    const entries = [];
    for (const [trackName, trackEntry] of state.trackAudioPlayers.entries()) {
      if (isTrackMuted(state, trackName)) continue;
      const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
        ? trackEntry.playersByAssetKey
        : null;
      if (!playersByAssetKey || !playersByAssetKey.size) continue;
      const preferredKeys = [
        String(trackEntry?.activeAssetKey || "").trim(),
        String(trackEntry?.defaultAssetKey || "").trim(),
      ].filter(Boolean);
      let picked = null;
      for (const key of preferredKeys) {
        const candidate = playersByAssetKey.get(key);
        if (!candidate?.audio) continue;
        picked = candidate;
        break;
      }
      if (!picked) {
        for (const candidate of playersByAssetKey.values()) {
          if (!candidate?.audio) continue;
          picked = candidate;
          break;
        }
      }
      if (!picked?.audio) continue;
      entries.push({
        trackName,
        audio: picked.audio,
        errored: Boolean(picked.errored),
        assetKey: String(picked.assetKey || ""),
        trackEntry,
      });
    }
    return entries;
  }

  function primeTrackAudioPlayersForGesture(state) {
    if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return;
    for (const [trackName, trackEntry] of state.trackAudioPlayers.entries()) {
      if (isTrackMuted(state, trackName)) continue;
      const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
        ? trackEntry.playersByAssetKey
        : null;
      if (!playersByAssetKey || !playersByAssetKey.size) continue;
      for (const player of playersByAssetKey.values()) {
        const audio = player?.audio;
        if (!audio || player?.errored) continue;
        try {
          const prevMuted = Boolean(audio.muted);
          const prevVolume = Number(audio.volume || 1);
          const prevTime = Number(audio.currentTime || 0);
          audio.muted = true;
          const playResult = audio.play();
          if (playResult && typeof playResult.then === "function") {
            playResult
              .then(() => {
                try { audio.pause(); } catch {}
                try { audio.currentTime = prevTime; } catch {}
                audio.volume = prevVolume;
                audio.muted = prevMuted;
              })
              .catch(() => {
                audio.volume = prevVolume;
                audio.muted = prevMuted;
              });
          } else {
            try { audio.pause(); } catch {}
            try { audio.currentTime = prevTime; } catch {}
            audio.volume = prevVolume;
            audio.muted = prevMuted;
          }
        } catch {}
      }
    }
  }

  function isMixTrackMuted(state) {
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    for (const track of tracks) {
      if (String(track?.kind || "").toLowerCase() !== "audio") continue;
      const name = String(track?.name || "");
      const assetKey = String(track?.audioAssetKey || "").trim().toLowerCase();
      if (assetKey === "mix" || name.trim().toLowerCase() === "mix") {
        return isTrackMuted(state, name);
      }
    }
    return false;
  }

  function buildReverseAudioBuffer(ctx, sourceBuffer) {
    if (!ctx || !sourceBuffer) return null;
    const reversed = ctx.createBuffer(
      sourceBuffer.numberOfChannels,
      sourceBuffer.length,
      sourceBuffer.sampleRate
    );
    for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel += 1) {
      const source = sourceBuffer.getChannelData(channel);
      const target = reversed.getChannelData(channel);
      for (let i = 0, j = source.length - 1; i < source.length; i += 1, j -= 1) {
        target[i] = source[j];
      }
    }
    return reversed;
  }

  async function ensureScrubAudioReady(state) {
    const sourceUrl = resolveScrubSourceUrl(state);
    if (!sourceUrl) {
      stopScrubGrains(state);
      state.scrubSourceUrl = "";
      state.scrubBufferSwapPending = false;
      state.scrubDecodeUrl = "";
      state.scrubDecodePromise = null;
      return Boolean(state.scrubAudioBuffer);
    }
    const ContextCtor = getScrubAudioContextCtor();
    if (!ContextCtor) return false;
    if (!state.scrubAudioContext) {
      try {
        state.scrubAudioContext = new ContextCtor();
      } catch {
        return false;
      }
    }
    const ctx = state.scrubAudioContext;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
    if (state.scrubSourceUrl !== sourceUrl) {
      stopScrubGrains(state);
      state.scrubSourceUrl = sourceUrl;
      state.scrubBufferSwapPending = true;
    }
    if (
      state.scrubAudioBuffer &&
      !state.scrubBufferSwapPending &&
      String(state.scrubActiveSourceUrl || "").trim() === sourceUrl
    ) {
      return true;
    }
    if (!state.scrubDecodePromise || state.scrubDecodeUrl !== sourceUrl) {
      const decodeUrl = sourceUrl;
      state.scrubDecodeUrl = decodeUrl;
      state.scrubDecodePromise = (async () => {
        const response = await fetch(decodeUrl);
        if (!response.ok) throw new Error(`scrub audio fetch failed: ${response.status}`);
        const rawBuffer = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));
        if (state.scrubSourceUrl !== decodeUrl) return null;
        state.scrubAudioBuffer = decoded;
        state.scrubAudioBufferReverse = null;
        state.scrubActiveSourceUrl = decodeUrl;
        state.scrubBufferSwapPending = false;
        return decoded;
      })()
        .catch(() => null)
        .finally(() => {
          if (state.scrubDecodeUrl === decodeUrl) {
            state.scrubDecodePromise = null;
            state.scrubDecodeUrl = "";
          }
        });
    }
    const decoded = await state.scrubDecodePromise;
    if (!decoded && state.scrubSourceUrl === sourceUrl) {
      state.scrubBufferSwapPending = false;
    }
    return Boolean(
      state.scrubAudioBuffer &&
      !state.scrubBufferSwapPending &&
      String(state.scrubActiveSourceUrl || "").trim() === sourceUrl
    );
  }

  function stopScrubGrains(state) {
    if (!state.scrubNodes || !state.scrubNodes.size) return;
    for (const entry of state.scrubNodes) {
      try {
        entry.source.onended = null;
        entry.source.stop();
      } catch {}
      try {
        entry.source.disconnect();
      } catch {}
      try {
        entry.gain.disconnect();
      } catch {}
    }
    state.scrubNodes.clear();
  }

  function getScrubBufferForDirection(state, direction) {
    if (!state.scrubAudioBuffer) return null;
    if (direction >= 0) return state.scrubAudioBuffer;
    if (!state.scrubAudioBufferReverse) {
      state.scrubAudioBufferReverse = buildReverseAudioBuffer(state.scrubAudioContext, state.scrubAudioBuffer);
    }
    return state.scrubAudioBufferReverse;
  }

  function pickMidiScrubEvent(state, timeSec) {
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const eventsByTrack = state.studioData?.eventsByTrack || {};
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const track of tracks) {
      const trackName = String(track?.name || "");
      if (!trackName) continue;
      if (String(track?.kind || "").toLowerCase() !== "midi") continue;
      if (isTrackMuted(state, trackName)) continue;
      const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
      for (const event of events) {
        const pitch = Number(event?.pitch);
        const eventTime = Number(event?.time);
        if (!Number.isFinite(pitch) || !Number.isFinite(eventTime)) continue;
        const distance = Math.abs(eventTime - timeSec);
        if (distance > bestDistance) continue;
        bestDistance = distance;
        best = { trackName, event };
      }
    }
    return best;
  }

  function scheduleMidiScrubGrain(state, timeSec, velocitySecPerSec) {
    if (!hasUnmutedMidiTracks(state)) return;
    const ctx = state.midiAudioContext;
    if (!ctx) {
      void ensureMidiAudioReady(state);
      return;
    }
    if (ctx.state !== "running") {
      void ctx.resume().catch(() => {});
      return;
    }
    const picked = pickMidiScrubEvent(state, timeSec);
    if (!picked) return;

    const now = ctx.currentTime;
    if (now < state.scrubNextGrainAt) return;
    const speed = Math.abs(Number(velocitySecPerSec || 0));
    const rate = Utils.clamp(Math.max(speed, CONSTANTS.SCRUB_MIN_RATE), CONSTANTS.SCRUB_MIN_RATE, CONSTANTS.SCRUB_MAX_RATE);
    const grainSec = Utils.clamp(
      CONSTANTS.SCRUB_BASE_GRAIN_SEC / Math.sqrt(Math.max(rate, 0.0001)),
      CONSTANTS.SCRUB_MIN_GRAIN_SEC,
      CONSTANTS.SCRUB_BASE_GRAIN_SEC
    );
    const preset = inferMidiPreset(picked.trackName, [picked.event]);
    const intent = buildPresetIntent(preset);
    const plan = planDsp(intent, picked.event, { mode: "scrub", durationSec: grainSec });
    const voices = Array.isArray(plan?.voices) ? plan.voices : [];
    let source = null;

    for (const voice of voices) {
      if (voice?.kind === "noise") {
        if (!state.midiNoiseBuffer) continue;
        const noise = ctx.createBufferSource();
        noise.buffer = state.midiNoiseBuffer;
        noise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = String(voice.filter_type || "highpass");
        filter.frequency.setValueAtTime(Number(voice.filter_hz || 2000), now);
        filter.Q.setValueAtTime(Number(voice.q || 0.8), now);
        const gain = ctx.createGain();
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        const attack = Math.min(CONSTANTS.SCRUB_FADE_SEC, grainSec * 0.35);
        const releaseStart = now + Math.max(attack, grainSec - CONSTANTS.SCRUB_FADE_SEC);
        const peak = Number(voice.gain || 0.04);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peak, now + attack);
        gain.gain.setValueAtTime(peak, releaseStart);
        gain.gain.linearRampToValueAtTime(0.0001, now + grainSec);
        source = source || noise;
        const entry = { source: noise, gain };
        state.scrubNodes.add(entry);
        noise.onended = () => {
          state.scrubNodes.delete(entry);
          for (const node of [noise, filter, gain]) {
            try {
              node.disconnect();
            } catch {}
          }
        };
        noise.start(now);
        noise.stop(now + grainSec + 0.02);
        continue;
      }
      const osc = ctx.createOscillator();
      osc.type = String(voice?.type || "triangle");
      const freq = Number(voice?.freq_hz || midiNoteToFrequency(Number(picked.event?.pitch || 60)));
      const freqEnd = Number(voice?.freq_end_hz || 0);
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (Number.isFinite(freqEnd) && freqEnd > 0 && freqEnd !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + Math.max(0.01, grainSec * 0.88));
      }
      osc.detune.setValueAtTime(Number(voice?.detune_cents || 0), now);
      const gain = ctx.createGain();
      const filterType = String(voice?.filter_type || "");
      if (filterType) {
        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(Number(voice?.filter_hz || 2800), now);
        filter.Q.setValueAtTime(Number(voice?.q || 0.6), now);
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }
      gain.connect(ctx.destination);
      const attack = Math.min(CONSTANTS.SCRUB_FADE_SEC, grainSec * 0.35);
      const releaseStart = now + Math.max(attack, grainSec - CONSTANTS.SCRUB_FADE_SEC);
      const peak = Number(voice?.gain || 0.04);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + attack);
      gain.gain.setValueAtTime(peak, releaseStart);
      gain.gain.linearRampToValueAtTime(0.0001, now + grainSec);
      source = source || osc;
      const entry = { source: osc, gain };
      state.scrubNodes.add(entry);
      osc.onended = () => {
        state.scrubNodes.delete(entry);
        for (const node of [osc, gain]) {
          try {
            node.disconnect();
          } catch {}
        }
      };
      osc.start(now);
      osc.stop(now + grainSec + 0.02);
    }
    if (!source) return;
    state.scrubNextGrainAt = now + Math.max(CONSTANTS.SCRUB_MIN_INTERVAL_SEC, grainSec * 0.45);
  }

  function scheduleScrubGrain(state, timeSec, velocitySecPerSec) {
    const scrubAudioReady =
      Boolean(state.scrubAudioBuffer) &&
      !Boolean(state.scrubBufferSwapPending) &&
      String(state.scrubActiveSourceUrl || "").trim() === String(state.scrubSourceUrl || "").trim();
    if (!scrubAudioReady) {
      scheduleMidiScrubGrain(state, timeSec, velocitySecPerSec);
      return;
    }
    const ctx = state.scrubAudioContext;
    if (!ctx || ctx.state !== "running") return;

    const speed = Math.abs(Number(velocitySecPerSec || 0));
    if (!Number.isFinite(speed)) return;
    const direction = velocitySecPerSec >= 0 ? 1 : -1;
    const buffer = getScrubBufferForDirection(state, direction);
    if (!buffer) return;

    const now = ctx.currentTime;
    if (now < state.scrubNextGrainAt) return;

    const rate = Utils.clamp(Math.max(speed, CONSTANTS.SCRUB_MIN_RATE), CONSTANTS.SCRUB_MIN_RATE, CONSTANTS.SCRUB_MAX_RATE);
    const grainSec = Utils.clamp(
      CONSTANTS.SCRUB_BASE_GRAIN_SEC / Math.sqrt(Math.max(rate, 0.0001)),
      CONSTANTS.SCRUB_MIN_GRAIN_SEC,
      CONSTANTS.SCRUB_BASE_GRAIN_SEC
    );
    const safeDuration = Math.max(0.05, buffer.duration);
    const maxOffset = Math.max(0.01, safeDuration - 0.02);
    const forwardOffset = Utils.clamp(timeSec, 0, maxOffset);
    const offset = direction >= 0 ? forwardOffset : Utils.clamp(safeDuration - forwardOffset, 0, maxOffset);

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const attack = Math.min(CONSTANTS.SCRUB_FADE_SEC, grainSec * 0.4);
    const releaseStart = now + Math.max(attack, grainSec - CONSTANTS.SCRUB_FADE_SEC);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(CONSTANTS.SCRUB_GAIN, now + attack);
    gain.gain.setValueAtTime(CONSTANTS.SCRUB_GAIN, releaseStart);
    gain.gain.linearRampToValueAtTime(0.0001, now + grainSec);

    source.connect(gain);
    gain.connect(ctx.destination);

    const entry = { source, gain };
    state.scrubNodes.add(entry);
    source.onended = () => {
      state.scrubNodes.delete(entry);
      try {
        source.disconnect();
      } catch {}
      try {
        gain.disconnect();
      } catch {}
    };

    source.start(now, offset, grainSec);
    source.stop(now + grainSec + 0.02);
    state.scrubNextGrainAt = now + Math.max(CONSTANTS.SCRUB_MIN_INTERVAL_SEC, grainSec * 0.45);
  }

  return {
    resolveScrubSourceUrl,
    resolveActiveTrackAudioUrlAtPlayhead,
    getUnmutedTrackAudioEntries,
    primeTrackAudioPlayersForGesture,
    isMixTrackMuted,
    buildReverseAudioBuffer,
    ensureScrubAudioReady,
    stopScrubGrains,
    getScrubBufferForDirection,
    pickMidiScrubEvent,
    scheduleMidiScrubGrain,
    scheduleScrubGrain,
  };
}
