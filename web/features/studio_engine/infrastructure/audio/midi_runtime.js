export function createTimelineMidiRuntime(deps) {
  const {
    CONSTANTS,
    Utils,
    isTrackMuted,
    getScrubAudioContextCtor,
    inferMidiPreset,
    buildPresetIntent,
    planDsp,
    midiNoteToFrequency,
  } = deps;

  function buildDeterministicNoiseBuffer(ctx) {
    const length = Math.max(1, Math.floor(ctx.sampleRate));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x5f3759df >>> 0;
    for (let i = 0; i < data.length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = ((seed / 4294967295) * 2 - 1) * 0.9;
    }
    return buffer;
  }

  async function ensureMidiAudioReady(state) {
    const ContextCtor = getScrubAudioContextCtor();
    if (!ContextCtor) return null;
    if (!state.midiAudioContext) {
      try {
        state.midiAudioContext = new ContextCtor();
      } catch {
        return null;
      }
    }
    const ctx = state.midiAudioContext;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
    }
    if (!state.midiNoiseBuffer) {
      state.midiNoiseBuffer = buildDeterministicNoiseBuffer(ctx);
    }
    return ctx;
  }

  function clearMidiPlayback(state) {
    if (state.midiVoices && state.midiVoices.size) {
      for (const voice of state.midiVoices) {
        if (!voice) continue;
        try {
          voice.primary.onended = null;
        } catch {}
        try {
          voice.primary.stop();
        } catch {}
        if (Array.isArray(voice.nodes)) {
          for (const node of voice.nodes) {
            try {
              node.disconnect();
            } catch {}
          }
        }
      }
      state.midiVoices.clear();
    }
    if (state.midiTrackNodes && state.midiTrackNodes.size) {
      for (const entry of state.midiTrackNodes.values()) {
        try {
          entry.gain.disconnect();
        } catch {}
      }
      state.midiTrackNodes.clear();
    }
  }

  function registerMidiVoice(state, trackName, primaryNode, nodes) {
    const voice = { trackName, primary: primaryNode, nodes };
    state.midiVoices.add(voice);
    primaryNode.onended = () => {
      state.midiVoices.delete(voice);
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {}
      }
    };
  }

  function scheduleOscVoice(state, ctx, trackName, output, options) {
    const {
      startAt,
      durationSec,
      frequency,
      frequencyEnd = 0,
      type = "sine",
      gainValue = 0.06,
      attackSec = 0.004,
      releaseSec = 0.03,
      detuneCents = 0,
      filterType = "",
      filterFreq = 12000,
      qValue = 0.7,
    } = options;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const nodes = [osc, amp];
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), startAt);
    if (Number.isFinite(frequencyEnd) && frequencyEnd > 0 && frequencyEnd !== frequency) {
      const rampAt = startAt + Math.max(0.01, durationSec * 0.86);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequencyEnd), rampAt);
    }
    osc.detune.setValueAtTime(detuneCents, startAt);
    if (filterType) {
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, startAt);
      filter.Q.setValueAtTime(qValue, startAt);
      osc.connect(filter);
      filter.connect(amp);
      nodes.push(filter);
    } else {
      osc.connect(amp);
    }
    amp.connect(output);
    const endAt = startAt + durationSec;
    const relStart = Math.max(startAt + attackSec, endAt - releaseSec);
    amp.gain.setValueAtTime(0.0001, startAt);
    amp.gain.linearRampToValueAtTime(gainValue, startAt + attackSec);
    amp.gain.setValueAtTime(gainValue, relStart);
    amp.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
    registerMidiVoice(state, trackName, osc, nodes);
  }

  function scheduleNoiseVoice(state, ctx, trackName, output, options) {
    const {
      startAt,
      durationSec,
      gainValue = 0.04,
      attackSec = 0.002,
      releaseSec = 0.04,
      filterType = "highpass",
      filterFreq = 1800,
      qValue = 0.8,
    } = options;
    if (!state.midiNoiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = state.midiNoiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startAt);
    filter.Q.setValueAtTime(qValue, startAt);
    const amp = ctx.createGain();
    source.connect(filter);
    filter.connect(amp);
    amp.connect(output);
    const endAt = startAt + durationSec;
    const relStart = Math.max(startAt + attackSec, endAt - releaseSec);
    amp.gain.setValueAtTime(0.0001, startAt);
    amp.gain.linearRampToValueAtTime(gainValue, startAt + attackSec);
    amp.gain.setValueAtTime(gainValue, relStart);
    amp.gain.exponentialRampToValueAtTime(0.0001, endAt);
    source.start(startAt, 0);
    source.stop(endAt + 0.02);
    registerMidiVoice(state, trackName, source, [source, filter, amp]);
  }

  function scheduleMidiNote(state, ctx, trackName, preset, output, event, playbackStartSec, ctxStartSec) {
    const eventStart = Number(event?.time || 0);
    const eventDur = Utils.clamp(Number(event?.duration || 0.12), 0.03, 4);
    const eventEnd = eventStart + eventDur;
    if (eventEnd <= playbackStartSec) return;
    const clippedStart = Math.max(eventStart, playbackStartSec);
    const clippedDur = Utils.clamp(eventEnd - clippedStart, 0.03, 4);
    const startAt = ctxStartSec + Math.max(0, clippedStart - playbackStartSec);
    const noteFreq = midiNoteToFrequency(Number(event?.pitch || 60));
    const intent = buildPresetIntent(preset);
    const plan = planDsp(intent, event, { mode: "playback", durationSec: clippedDur });
    const voices = Array.isArray(plan?.voices) ? plan.voices : [];
    for (const voice of voices) {
      if (voice?.kind === "noise") {
        scheduleNoiseVoice(state, ctx, trackName, output, {
          startAt,
          durationSec: clippedDur,
          gainValue: Number(voice.gain || 0.04),
          attackSec: Number(voice.attack_sec || 0.002),
          releaseSec: Number(voice.release_sec || 0.04),
          filterType: String(voice.filter_type || "highpass"),
          filterFreq: Number(voice.filter_hz || 1800),
          qValue: Number(voice.q || 0.8),
        });
        continue;
      }
      const freqStart = Number(voice?.freq_hz || noteFreq);
      const freqEnd = Number(voice?.freq_end_hz || 0);
      scheduleOscVoice(state, ctx, trackName, output, {
        startAt,
        durationSec: clippedDur,
        frequency: Number.isFinite(freqStart) && freqStart > 0 ? freqStart : noteFreq,
        frequencyEnd: Number.isFinite(freqEnd) && freqEnd > 0 ? freqEnd : 0,
        type: String(voice?.type || "triangle"),
        gainValue: Number(voice?.gain || 0.038),
        attackSec: Number(voice?.attack_sec || 0.004),
        releaseSec: Number(voice?.release_sec || 0.05),
        filterType: String(voice?.filter_type || "lowpass"),
        filterFreq: Number(voice?.filter_hz || 2800),
        qValue: Number(voice?.q || 0.6),
        detuneCents: Number(voice?.detune_cents || 0),
      });
    }
  }

  function syncMidiTrackMuteGains(state) {
    if (!state.midiAudioContext || !state.midiTrackNodes || !state.midiTrackNodes.size) return;
    const now = state.midiAudioContext.currentTime;
    for (const [trackName, entry] of state.midiTrackNodes.entries()) {
      if (!entry?.gain) continue;
      const target = isTrackMuted(state, trackName) ? 0 : CONSTANTS.MIDI_MASTER_GAIN;
      try {
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setTargetAtTime(target, now, 0.01);
      } catch {}
    }
  }

  async function startMidiPlayback(state) {
    const ctx = await ensureMidiAudioReady(state);
    if (!ctx) return false;
    clearMidiPlayback(state);
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const eventsByTrack = state.studioData?.eventsByTrack || {};
    const playbackStartSec = state.playheadSec;
    const ctxStartSec = ctx.currentTime + 0.01;

    for (const track of tracks) {
      const trackName = String(track?.name || "");
      if (!trackName) continue;
      if (String(track?.kind || "").toLowerCase() !== "midi") continue;
      const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
      const midiEvents = events.filter((event) => Number.isFinite(event?.pitch));
      if (!midiEvents.length) continue;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(isTrackMuted(state, trackName) ? 0 : CONSTANTS.MIDI_MASTER_GAIN, ctxStartSec);
      gain.connect(ctx.destination);
      const preset = inferMidiPreset(trackName, midiEvents);
      state.midiTrackNodes.set(trackName, { gain, preset });
      for (const event of midiEvents) {
        scheduleMidiNote(state, ctx, trackName, preset, gain, event, playbackStartSec, ctxStartSec);
      }
    }
    syncMidiTrackMuteGains(state);
    return state.midiTrackNodes.size > 0;
  }

  return {
    ensureMidiAudioReady,
    clearMidiPlayback,
    syncMidiTrackMuteGains,
    startMidiPlayback,
  };
}
