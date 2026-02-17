function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function midiNoteToFrequency(note) {
  const n = Number(note);
  if (!Number.isFinite(n)) return 440;
  return 440 * Math.pow(2, (n - 69) / 12);
}

export function inferMidiPreset(trackName, events) {
  const name = String(trackName || "").toLowerCase();
  if (name.includes("drum") || name.includes("perc") || name.includes("kick") || name.includes("snare")) return "drums";
  if (name.includes("bass")) return "bass";
  if (name.includes("pad") || name.includes("string") || name.includes("choir")) return "pad";
  if (name.includes("lead") || name.includes("melody") || name.includes("pluck")) return "lead";
  if (name.includes("piano") || name.includes("keys") || name.includes("organ") || name.includes("chord")) return "keys";
  const labels = Array.isArray(events) ? events.map((event) => String(event?.label || "").toLowerCase()) : [];
  if (labels.some((label) => label.includes("kick") || label.includes("snare") || label.includes("hat"))) return "drums";
  return "keys";
}

export function buildPresetIntent(presetId) {
  const preset = String(presetId || "keys").toLowerCase();
  if (preset === "drums") {
    return {
      id: "drums",
      version: "0.1.0",
      tone_family: "drum",
      brightness: 0.66,
      body: 0.74,
      noise_amount: 0.78,
      attack_ms: 2,
      release_ms: 80,
      modulation_depth: 0.22,
    };
  }
  if (preset === "bass") {
    return {
      id: "bass",
      version: "0.1.0",
      tone_family: "bass",
      brightness: 0.22,
      body: 0.9,
      noise_amount: 0.0,
      attack_ms: 4,
      release_ms: 60,
      modulation_depth: 0.12,
    };
  }
  if (preset === "lead") {
    return {
      id: "lead",
      version: "0.1.0",
      tone_family: "lead",
      brightness: 0.72,
      body: 0.45,
      noise_amount: 0.04,
      attack_ms: 3,
      release_ms: 50,
      modulation_depth: 0.15,
    };
  }
  if (preset === "pad") {
    return {
      id: "pad",
      version: "0.1.0",
      tone_family: "pad",
      brightness: 0.38,
      body: 0.68,
      noise_amount: 0.0,
      attack_ms: 20,
      release_ms: 120,
      modulation_depth: 0.08,
    };
  }
  return {
    id: "keys",
    version: "0.1.0",
    tone_family: "keys",
    brightness: 0.54,
    body: 0.55,
    noise_amount: 0.0,
    attack_ms: 4,
    release_ms: 50,
    modulation_depth: 0.06,
  };
}

function normalizeEventContext(event, durationSec) {
  const pitch = Number(event?.pitch);
  const velocity = Number(event?.velocity);
  const label = String(event?.label || "").toLowerCase();
  const normalizedPitch = Number.isFinite(pitch) ? pitch : 60;
  const normalizedVelocity = Number.isFinite(velocity) ? clamp(velocity / 127, 0, 1) : 0.75;
  return {
    pitch: normalizedPitch,
    velocity: normalizedVelocity,
    label,
    frequency_hz: midiNoteToFrequency(normalizedPitch),
    duration_sec: clamp(Number(durationSec || event?.duration || 0.12), 0.02, 4.0),
  };
}

function selectDrumVoice(context) {
  const label = context.label;
  if (label.includes("kick") || context.frequency_hz < 80) {
    return {
      kind: "osc",
      type: "sine",
      freq_hz: 96,
      freq_end_hz: 42,
      gain: 0.11,
      attack_sec: 0.002,
      release_sec: 0.08,
      filter_type: "",
      filter_hz: 0,
      q: 0.7,
      detune_cents: 0,
    };
  }
  if (label.includes("hat")) {
    return {
      kind: "noise",
      gain: 0.04,
      attack_sec: 0.002,
      release_sec: 0.06,
      filter_type: "highpass",
      filter_hz: 6000,
      q: 0.9,
    };
  }
  return {
    kind: "noise",
    gain: 0.055,
    attack_sec: 0.002,
    release_sec: 0.08,
    filter_type: "bandpass",
    filter_hz: 2000,
    q: 0.7,
  };
}

export function planDsp(intent, event, options = {}) {
  const normalizedIntent = intent || buildPresetIntent("keys");
  const mode = String(options.mode || "playback");
  const context = normalizeEventContext(event, options.durationSec);
  const velocity = context.velocity;
  const scrubGainScale = mode === "scrub" ? 0.82 : 1.0;

  if (normalizedIntent.tone_family === "drum") {
    const voice = selectDrumVoice(context);
    return {
      preset: normalizedIntent.id,
      tone_family: normalizedIntent.tone_family,
      voices: [{ ...voice, gain: voice.gain * (0.5 + velocity * 0.6) * scrubGainScale }],
    };
  }

  if (normalizedIntent.tone_family === "bass") {
    return {
      preset: normalizedIntent.id,
      tone_family: normalizedIntent.tone_family,
      voices: [
        {
          kind: "osc",
          type: "sawtooth",
          freq_hz: context.frequency_hz * 0.5,
          freq_end_hz: 0,
          gain: 0.06 * (0.6 + velocity * 0.55) * scrubGainScale,
          attack_sec: 0.004,
          release_sec: 0.06,
          filter_type: "lowpass",
          filter_hz: 320,
          q: 0.9,
          detune_cents: 0,
        },
      ],
    };
  }

  if (normalizedIntent.tone_family === "pad") {
    return {
      preset: normalizedIntent.id,
      tone_family: normalizedIntent.tone_family,
      voices: [
        {
          kind: "osc",
          type: "triangle",
          freq_hz: context.frequency_hz,
          freq_end_hz: 0,
          gain: 0.034 * (0.5 + velocity * 0.52) * scrubGainScale,
          attack_sec: 0.02,
          release_sec: 0.12,
          filter_type: "lowpass",
          filter_hz: 1800,
          q: 0.6,
          detune_cents: -4,
        },
        {
          kind: "osc",
          type: "sine",
          freq_hz: context.frequency_hz,
          freq_end_hz: 0,
          gain: 0.022 * (0.5 + velocity * 0.46) * scrubGainScale,
          attack_sec: 0.02,
          release_sec: 0.12,
          filter_type: "",
          filter_hz: 0,
          q: 0.7,
          detune_cents: 4,
        },
      ],
    };
  }

  if (normalizedIntent.tone_family === "lead") {
    return {
      preset: normalizedIntent.id,
      tone_family: normalizedIntent.tone_family,
      voices: [
        {
          kind: "osc",
          type: "square",
          freq_hz: context.frequency_hz,
          freq_end_hz: 0,
          gain: 0.042 * (0.55 + velocity * 0.58) * scrubGainScale,
          attack_sec: 0.003,
          release_sec: 0.05,
          filter_type: "lowpass",
          filter_hz: 2400,
          q: 0.7,
          detune_cents: 0,
        },
      ],
    };
  }

  return {
    preset: normalizedIntent.id,
    tone_family: normalizedIntent.tone_family,
    voices: [
      {
        kind: "osc",
        type: "triangle",
        freq_hz: context.frequency_hz,
        freq_end_hz: 0,
        gain: 0.038 * (0.55 + velocity * 0.52) * scrubGainScale,
        attack_sec: 0.004,
        release_sec: 0.05,
        filter_type: "lowpass",
        filter_hz: 2800,
        q: 0.6,
        detune_cents: 0,
      },
    ],
  };
}
