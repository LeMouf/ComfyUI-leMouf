import { el } from "../dom.js";
import { buildPresetIntent, inferMidiPreset, midiNoteToFrequency, planDsp } from "./audio_preset_plan.js";

const TIMELINE_STATE = new WeakMap();

const RULER_HEIGHT = 30;
const DEFAULT_SECTION_HEIGHT = 72;
const MIN_SECTION_HEIGHT = 56;
const MAX_SECTION_HEIGHT = 300;
const SECTION_RESIZE_HANDLE_HEIGHT = 10;
const SECTION_HEIGHT_STORAGE_KEY = "lemoufSong2DawSectionHeight";
const ROW_HEIGHT = 44;
const LEFT_GUTTER = 138;
const TRACK_GROUP_GAP = 14;
const MIN_PX_PER_SEC_HARD = 0.5;
const MIN_SONG_WIDTH_RATIO = 0.1;
const MAX_PX_PER_SEC = 11000;
const SCRUB_MIN_RATE = 0.2;
const SCRUB_MAX_RATE = 4.8;
const SCRUB_BASE_GRAIN_SEC = 0.085;
const SCRUB_MIN_GRAIN_SEC = 0.028;
const SCRUB_MIN_INTERVAL_SEC = 0.016;
const SCRUB_FADE_SEC = 0.008;
const SCRUB_GAIN = 0.8;
const SECTION_WAVE_ALPHA = 0.78;
const SECTION_WAVE_DETAIL = 32;
const SECTION_VIZ_STORAGE_KEY = "lemoufSong2DawSectionVizMode";
const SECTION_VIZ_MODES = ["bands", "filled", "peaks"];
const RULER_TARGET_PX = 92;
const RULER_STEP_OPTIONS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIDI_MASTER_GAIN = 0.5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compactText(value, maxLength = 44) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stableTrackColor(trackName) {
  const text = String(trackName || "track");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue} 58% 58%)`;
}

function buildTrackClips(events, durationSec, secPerBar) {
  if (!Array.isArray(events) || !events.length) {
    return [{ start: 0, end: durationSec, label: "clip", notesCount: 0 }];
  }
  const sorted = events
    .map((event) => ({
      time: Math.max(0, Number(event?.time || 0)),
      duration: Math.max(0.01, Number(event?.duration || 0.01)),
      label: String(event?.label || "event"),
      pitch: toFiniteNumber(event?.pitch, null),
    }))
    .sort((a, b) => a.time - b.time);

  const clips = [];
  const mergeGapSec = Math.max(0.12, secPerBar / 3);
  let start = sorted[0].time;
  let end = Math.max(sorted[0].time + sorted[0].duration, sorted[0].time + 0.01);
  let count = 1;
  let notesCount = sorted[0].pitch !== null ? 1 : 0;
  let firstLabel = sorted[0].label;

  for (let i = 1; i < sorted.length; i += 1) {
    const event = sorted[i];
    const eventStart = event.time;
    const eventEnd = Math.max(event.time + event.duration, event.time + 0.01);
    if (eventStart - end <= mergeGapSec) {
      end = Math.max(end, eventEnd);
      count += 1;
      if (event.pitch !== null) notesCount += 1;
    } else {
      clips.push({ start, end, label: count > 1 ? `${firstLabel} x${count}` : firstLabel, notesCount });
      start = eventStart;
      end = eventEnd;
      count = 1;
      notesCount = event.pitch !== null ? 1 : 0;
      firstLabel = event.label;
    }
  }
  clips.push({ start, end, label: count > 1 ? `${firstLabel} x${count}` : firstLabel, notesCount });
  return clips;
}

function inferOriginStepIndexFromTrack(track) {
  const name = String(track?.name || "").toLowerCase();
  const kind = String(track?.kind || "").toLowerCase();
  if (name === "mix") return 0;
  if (kind === "project" || name.includes("reaper")) return 6;
  if (kind === "fx" || name.includes("fx")) return 5;
  if (kind === "midi" || name.includes("midi")) return 4;
  return 3;
}

function resolveTrackPartition(track) {
  const kind = String(track?.kind || "").toLowerCase();
  const value = String(track?.partition || track?.track_group || "").trim().toLowerCase();
  if (value === "obtained_midi" || value === "step_tracks") return value;
  return kind === "midi" ? "obtained_midi" : "step_tracks";
}

function trackPartitionLabel(value) {
  return resolveTrackPartition({ partition: value }) === "obtained_midi" ? "Obtained MIDI" : "Step Tracks";
}

function normalizeSectionHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SECTION_HEIGHT;
  return clamp(Math.round(numeric), MIN_SECTION_HEIGHT, MAX_SECTION_HEIGHT);
}

function resolveTrackStepIndex(track) {
  const explicit = toFiniteNumber(track?.originStepIndex, null);
  if (explicit !== null) return Math.max(0, Math.round(explicit));
  return inferOriginStepIndexFromTrack(track);
}

function resolveTrackStageGroup(track) {
  const partition = resolveTrackPartition(track);
  if (partition === "obtained_midi") {
    return {
      key: "ingredients_reconstructed",
      label: "Ingredients Reconstructed",
    };
  }
  const stepIndex = resolveTrackStepIndex(track);
  return {
    key: `step_${stepIndex}`,
    label: `Step ${stepIndex + 1}`,
  };
}

function buildStageGroups(tracks) {
  const values = Array.isArray(tracks) ? tracks : [];
  const groups = [];
  const seen = new Set();
  for (const track of values) {
    const group = resolveTrackStageGroup(track);
    const key = String(group?.key || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    groups.push({
      key,
      label: String(group?.label || key),
    });
  }
  return groups;
}

function resolveVisibleSectionHeight(state, canvasHeight = null) {
  const normalized = normalizeSectionHeight(state?.sectionHeight);
  if (!state?.compactMode) return normalized;
  const height = Number(
    canvasHeight ?? state?.canvas?.clientHeight ?? 0
  );
  return Math.max(MIN_SECTION_HEIGHT, Math.round(Math.max(0, height) - RULER_HEIGHT - 2));
}

function buildTrackRowsLayout(state, tracks, trackAreaY) {
  const rows = [];
  let yCursor = 0;
  let previousGroupKey = "";
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    const group = resolveTrackStageGroup(track);
    let gapBefore = 0;
    if (i === 0) {
      gapBefore = TRACK_GROUP_GAP;
    } else if (group.key !== previousGroupKey) {
      gapBefore = TRACK_GROUP_GAP;
    }
    yCursor += gapBefore;
    const rowTop = trackAreaY + yCursor - state.scrollY;
    rows.push({
      index: i,
      track,
      rowTop,
      rowBottom: rowTop + ROW_HEIGHT,
      gapBefore,
      groupLabel: group.label,
      groupKey: group.key,
    });
    yCursor += ROW_HEIGHT;
    previousGroupKey = group.key;
  }
  return {
    rows,
    totalHeight: yCursor,
  };
}

function compactRunId(runId) {
  const value = String(runId || "").trim();
  if (!value) return "n/a";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatSelectionSummary(selection) {
  if (!selection || typeof selection !== "object") return "";
  const type = String(selection.type || "item");
  const name = compactText(selection.name || selection.id || "", 24);
  const t0 = Number(selection.t0_sec);
  const t1 = Number(selection.t1_sec);
  if (Number.isFinite(t0) && Number.isFinite(t1)) {
    return ` | sel ${type} ${name} ${t0.toFixed(2)}-${t1.toFixed(2)}s`;
  }
  if (Number.isFinite(t0)) {
    return ` | sel ${type} ${name} @${t0.toFixed(2)}s`;
  }
  return ` | sel ${type} ${name}`;
}

function renderOverview(state) {
  const tempo = Number(state.studioData?.tempoBpm || 0);
  const runText = compactRunId(state.runData?.run_id);
  const tempoText = tempo > 0 ? `${tempo.toFixed(1)} bpm` : "n/a";
  const tracksCount = Number(state.studioData?.tracks?.length || 0);
  const mutedCount = state.mutedTracks?.size || 0;
  const selectionText = formatSelectionSummary(state.selection);
  state.overviewLabel.textContent =
    `run ${runText} | tempo ${tempoText} | duration ${state.durationSec.toFixed(2)}s | tracks ${tracksCount} | muted ${mutedCount}${selectionText}`;

  if (state.jumpBtn) {
    const hasStep =
      Number.isFinite(state.selection?.origin_step_index) && typeof state.onJumpToStep === "function";
    state.jumpBtn.style.display = hasStep ? "" : "none";
    if (hasStep) {
      state.jumpBtn.textContent = `Step ${state.selection.origin_step_index + 1}`;
    }
  }
}

function renderFooter(state) {
  if (!state.zoomLabel || !state.canvas) return;
  const timelineWidth = Math.max(1, state.canvas.clientWidth - LEFT_GUTTER);
  const visibleSec = timelineWidth / Math.max(1e-6, state.pxPerSec);
  state.zoomLabel.textContent = `zoom ${state.pxPerSec.toFixed(1)} px/s | window ${visibleSec.toFixed(2)}s`;
}

function getScrubAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function resolveScrubSourceUrl(state) {
  const clockAudio = getPlaybackClockAudio(state);
  if (clockAudio) {
    const clockUrl = String(clockAudio.currentSrc || clockAudio.src || "").trim();
    if (clockUrl) return clockUrl;
  }
  const unmutedEntries = getUnmutedTrackAudioEntries(state);
  for (const entry of unmutedEntries) {
    const audio = entry?.audio;
    if (!audio || entry?.errored) continue;
    const url = String(audio.currentSrc || audio.src || "").trim();
    if (url) return url;
  }
  if (state.audio && state.audioSource && !state.audioErrored && !isMixTrackMuted(state)) {
    return String(state.audio.currentSrc || state.audio.src || state.audioSource || "").trim();
  }
  return "";
}

function getUnmutedTrackAudioEntries(state) {
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return [];
  const entries = [];
  for (const [trackName, entry] of state.trackAudioPlayers.entries()) {
    const audio = entry?.audio;
    if (!audio || entry?.errored) continue;
    if (isTrackMuted(state, trackName)) continue;
    entries.push(entry);
  }
  return entries;
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
    state.scrubDecodeUrl = "";
    state.scrubDecodePromise = null;
    state.scrubAudioBuffer = null;
    state.scrubAudioBufferReverse = null;
    return false;
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
    state.scrubAudioBuffer = null;
    state.scrubAudioBufferReverse = null;
  }
  if (state.scrubAudioBuffer) return true;
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
  return Boolean(decoded && state.scrubSourceUrl === sourceUrl);
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
  const rate = clamp(Math.max(speed, SCRUB_MIN_RATE), SCRUB_MIN_RATE, SCRUB_MAX_RATE);
  const grainSec = clamp(
    SCRUB_BASE_GRAIN_SEC / Math.sqrt(Math.max(rate, 0.0001)),
    SCRUB_MIN_GRAIN_SEC,
    SCRUB_BASE_GRAIN_SEC
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
      const attack = Math.min(SCRUB_FADE_SEC, grainSec * 0.35);
      const releaseStart = now + Math.max(attack, grainSec - SCRUB_FADE_SEC);
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
    let chainOut = gain;
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
    chainOut.connect(ctx.destination);
    const attack = Math.min(SCRUB_FADE_SEC, grainSec * 0.35);
    const releaseStart = now + Math.max(attack, grainSec - SCRUB_FADE_SEC);
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
  state.scrubNextGrainAt = now + Math.max(SCRUB_MIN_INTERVAL_SEC, grainSec * 0.45);
}

function scheduleScrubGrain(state, timeSec, velocitySecPerSec) {
  if (!state.scrubAudioBuffer) {
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

  const rate = clamp(Math.max(speed, SCRUB_MIN_RATE), SCRUB_MIN_RATE, SCRUB_MAX_RATE);
  const grainSec = clamp(
    SCRUB_BASE_GRAIN_SEC / Math.sqrt(Math.max(rate, 0.0001)),
    SCRUB_MIN_GRAIN_SEC,
    SCRUB_BASE_GRAIN_SEC
  );
  const safeDuration = Math.max(0.05, buffer.duration);
  const maxOffset = Math.max(0.01, safeDuration - 0.02);
  const forwardOffset = clamp(timeSec, 0, maxOffset);
  const offset = direction >= 0 ? forwardOffset : clamp(safeDuration - forwardOffset, 0, maxOffset);

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  const attack = Math.min(SCRUB_FADE_SEC, grainSec * 0.4);
  const releaseStart = now + Math.max(attack, grainSec - SCRUB_FADE_SEC);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(SCRUB_GAIN, now + attack);
  gain.gain.setValueAtTime(SCRUB_GAIN, releaseStart);
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
  state.scrubNextGrainAt = now + Math.max(SCRUB_MIN_INTERVAL_SEC, grainSec * 0.45);
}

function normalizeSectionVizMode(value) {
  const mode = String(value || "").toLowerCase();
  return SECTION_VIZ_MODES.includes(mode) ? mode : "bands";
}

function mapTimelineSecToSignalSourceSec(state, sourceDurationSec, timelineSec) {
  const srcDur = Math.max(0.001, Number(sourceDurationSec || 0));
  const songDur = Math.max(0.001, Number(state?.durationSec || 0));
  let mappedSec = Number(timelineSec || 0);
  if (srcDur < songDur * 0.995) {
    mappedSec *= srcDur / songDur;
  }
  return clamp(mappedSec, 0, Math.max(0, srcDur - 1e-6));
}

function drawSectionPeaks(state, ctx, y, height, visibleStartSec, samples, sampleRate) {
  const width = state.canvas.clientWidth;
  const startX = LEFT_GUTTER;
  const endX = width;
  const laneMidY = y + height / 2;
  const laneAmp = Math.max(2, (height - 6) * 0.48);
  const sourceDurationSec = samples.length / Math.max(1, sampleRate);

  ctx.strokeStyle = `rgba(62, 46, 32, ${SECTION_WAVE_ALPHA})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x < endX; x += 1) {
    const xOffset = x - startX;
    const t0 = visibleStartSec + xOffset / state.pxPerSec;
    const t1 = visibleStartSec + (xOffset + 1) / state.pxPerSec;
    if (t0 >= state.durationSec) break;
    const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
    const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, Math.min(t1, state.durationSec));
    let s0 = Math.floor(mt0 * sampleRate);
    let s1 = Math.ceil(mt1 * sampleRate);
    if (!Number.isFinite(s0)) s0 = 0;
    if (!Number.isFinite(s1)) s1 = s0 + 1;
    s0 = clamp(s0, 0, samples.length - 1);
    s1 = clamp(s1, s0 + 1, samples.length);
    const span = s1 - s0;
    const step = Math.max(1, Math.floor(span / SECTION_WAVE_DETAIL));
    let peak = 0;
    for (let i = s0; i < s1; i += step) {
      const amp = Math.abs(samples[i] || 0);
      if (amp > peak) peak = amp;
    }
    const a = clamp(peak, 0, 1);
    const y0 = laneMidY - a * laneAmp;
    const y1 = laneMidY + a * laneAmp;
    ctx.moveTo(x + 0.5, y0);
    ctx.lineTo(x + 0.5, y1);
  }
  ctx.stroke();
}

function drawSectionFilled(state, ctx, y, height, visibleStartSec, samples, sampleRate) {
  const width = state.canvas.clientWidth;
  const startX = LEFT_GUTTER;
  const endX = width;
  const laneMidY = y + height / 2;
  const laneAmp = Math.max(2, (height - 8) * 0.48);
  const points = [];
  const sourceDurationSec = samples.length / Math.max(1, sampleRate);

  for (let x = startX; x < endX; x += 1) {
    const xOffset = x - startX;
    const t0 = visibleStartSec + xOffset / state.pxPerSec;
    const t1 = visibleStartSec + (xOffset + 1) / state.pxPerSec;
    if (t0 >= state.durationSec) break;
    const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
    const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, Math.min(t1, state.durationSec));
    let s0 = Math.floor(mt0 * sampleRate);
    let s1 = Math.ceil(mt1 * sampleRate);
    if (!Number.isFinite(s0)) s0 = 0;
    if (!Number.isFinite(s1)) s1 = s0 + 1;
    s0 = clamp(s0, 0, samples.length - 1);
    s1 = clamp(s1, s0 + 1, samples.length);
    const span = s1 - s0;
    const step = Math.max(1, Math.floor(span / SECTION_WAVE_DETAIL));
    let peakPos = 0;
    let peakNeg = 0;
    for (let i = s0; i < s1; i += step) {
      const v = samples[i] || 0;
      if (v > peakPos) peakPos = v;
      if (v < peakNeg) peakNeg = v;
    }
    points.push({
      x: x + 0.5,
      yTop: laneMidY - clamp(peakPos, 0, 1) * laneAmp,
      yBot: laneMidY - clamp(peakNeg, -1, 0) * laneAmp,
    });
  }
  if (!points.length) return;

  ctx.fillStyle = "rgba(97, 73, 53, 0.38)";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].yTop);
  for (const point of points) ctx.lineTo(point.x, point.yTop);
  for (let i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i].x, points[i].yBot);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(78, 57, 40, 0.82)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].yTop);
  for (const point of points) ctx.lineTo(point.x, point.yTop);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].yBot);
  for (const point of points) ctx.lineTo(point.x, point.yBot);
  ctx.stroke();
}

function drawSectionBands(state, ctx, y, height, visibleStartSec, samples, sampleRate) {
  const width = state.canvas.clientWidth;
  const startX = LEFT_GUTTER;
  const endX = width;
  const h = Math.max(3, height - 2);
  const sourceDurationSec = samples.length / Math.max(1, sampleRate);
  for (let x = startX; x < endX; x += 1) {
    const xOffset = x - startX;
    const t0 = visibleStartSec + xOffset / state.pxPerSec;
    const t1 = visibleStartSec + (xOffset + 1) / state.pxPerSec;
    if (t0 >= state.durationSec) break;
    const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
    const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, Math.min(t1, state.durationSec));
    let s0 = Math.floor(mt0 * sampleRate);
    let s1 = Math.ceil(mt1 * sampleRate);
    if (!Number.isFinite(s0)) s0 = 0;
    if (!Number.isFinite(s1)) s1 = s0 + 1;
    s0 = clamp(s0, 0, samples.length - 1);
    s1 = clamp(s1, s0 + 1, samples.length);
    const span = s1 - s0;
    const step = Math.max(1, Math.floor(span / SECTION_WAVE_DETAIL));
    let absSum = 0;
    let diffSum = 0;
    let accelSum = 0;
    let count = 0;
    let p1 = 0;
    let p2 = 0;
    for (let i = s0; i < s1; i += step) {
      const value = samples[i] || 0;
      absSum += Math.abs(value);
      if (count > 0) diffSum += Math.abs(value - p1);
      if (count > 1) accelSum += Math.abs(value - 2 * p1 + p2);
      p2 = p1;
      p1 = value;
      count += 1;
    }
    const low = Math.tanh((absSum / Math.max(1, count)) * 2.9);
    const mid = Math.tanh((diffSum / Math.max(1, count - 1)) * 3.2);
    const high = Math.tanh((accelSum / Math.max(1, count - 2)) * 2.5);
    const lowH = h * low;
    const midH = h * mid;
    const highH = h * high;

    ctx.strokeStyle = "rgba(94, 171, 132, 0.72)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h);
    ctx.lineTo(x + 0.5, y + h - lowH);
    ctx.stroke();

    ctx.strokeStyle = "rgba(219, 174, 90, 0.76)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h);
    ctx.lineTo(x + 0.5, y + h - midH);
    ctx.stroke();

    ctx.strokeStyle = "rgba(198, 104, 147, 0.76)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h);
    ctx.lineTo(x + 0.5, y + h - highH);
    ctx.stroke();
  }
}

function buildSectionMidiEnvelope(state, visibleStartSec, visibleEndSec, bins) {
  const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
  const eventsByTrack = state.studioData?.eventsByTrack || {};
  const spanSec = Math.max(0.001, visibleEndSec - visibleStartSec);
  const values = new Array(Math.max(1, bins)).fill(0);
  let hasMidi = false;

  for (const track of tracks) {
    if (String(track?.kind || "").toLowerCase() !== "midi") continue;
    if (isTrackMuted(state, String(track?.name || ""))) continue;
    const events = Array.isArray(eventsByTrack?.[track?.name]) ? eventsByTrack[track.name] : [];
    for (const event of events) {
      const startSec = Math.max(0, Number(event?.time || 0));
      const durationSec = Math.max(0.01, Number(event?.duration || 0.01));
      const endSec = startSec + durationSec;
      if (endSec < visibleStartSec || startSec > visibleEndSec) continue;
      hasMidi = true;
      const note = Number(event?.pitch);
      const velocity = Number(event?.velocity);
      const noteFactor = Number.isFinite(note) ? clamp(note / 127, 0, 1) : 0.5;
      const velFactor = Number.isFinite(velocity) ? clamp(velocity / 127, 0, 1) : 0.72;
      const weight = 0.35 + noteFactor * 0.45 + velFactor * 0.2;
      const localStart = (Math.max(startSec, visibleStartSec) - visibleStartSec) / spanSec;
      const localEnd = (Math.min(endSec, visibleEndSec) - visibleStartSec) / spanSec;
      const i0 = clamp(Math.floor(localStart * values.length), 0, values.length - 1);
      const i1 = clamp(Math.ceil(localEnd * values.length), 0, values.length - 1);
      for (let i = i0; i <= Math.max(i0, i1); i += 1) {
        values[i] += weight;
      }
    }
  }

  if (!hasMidi) return null;
  const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
  if (maxValue <= 0) return null;
  return values.map((value) => clamp(value / maxValue, 0, 1));
}

function drawSectionMidiFallback(state, ctx, y, height, visibleStartSec) {
  const width = state.canvas.clientWidth;
  if (width <= LEFT_GUTTER + 1) return false;
  const timelineWidth = width - LEFT_GUTTER;
  const visibleEndSec = Math.min(
    state.durationSec,
    visibleStartSec + timelineWidth / Math.max(1e-6, state.pxPerSec)
  );
  const visibleSpanSec = Math.max(0, visibleEndSec - visibleStartSec);
  if (visibleSpanSec <= 0.0001) return false;
  const drawWidth = Math.min(timelineWidth, visibleSpanSec * state.pxPerSec);
  if (drawWidth <= 0.5) return false;
  const bins = clamp(Math.floor(timelineWidth / 2), 24, 360);
  const envelope = buildSectionMidiEnvelope(state, visibleStartSec, visibleEndSec, bins);
  if (!envelope || !envelope.length) return false;

  const h = Math.max(3, height - 2);
  const xStep = drawWidth / envelope.length;
  const mode = normalizeSectionVizMode(state.sectionVizMode);
  const baseY = y + h;
  const centerY = y + h * 0.5;

  for (let i = 0; i < envelope.length; i += 1) {
    const amp = envelope[i];
    if (amp <= 0.01) continue;
    const x = LEFT_GUTTER + i * xStep + xStep * 0.5;
    if (mode === "filled") {
      const top = centerY - amp * h * 0.46;
      const bot = centerY + amp * h * 0.46;
      ctx.strokeStyle = "rgba(90, 163, 126, 0.7)";
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
      continue;
    }
    if (mode === "peaks") {
      ctx.strokeStyle = "rgba(78, 57, 40, 0.84)";
      ctx.beginPath();
      ctx.moveTo(x, centerY - amp * h * 0.5);
      ctx.lineTo(x, centerY + amp * h * 0.5);
      ctx.stroke();
      continue;
    }
    const low = amp;
    const mid = Math.pow(amp, 0.85) * 0.82;
    const high = Math.pow(amp, 1.6) * 0.66;
    ctx.strokeStyle = "rgba(94, 171, 132, 0.72)";
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - h * low);
    ctx.stroke();
    ctx.strokeStyle = "rgba(219, 174, 90, 0.76)";
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - h * mid);
    ctx.stroke();
    ctx.strokeStyle = "rgba(198, 104, 147, 0.76)";
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - h * high);
    ctx.stroke();
  }
  return true;
}

function drawSectionWaveform(state, ctx, y, height, visibleStartSec) {
  const width = state.canvas.clientWidth;
  if (width <= LEFT_GUTTER + 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(LEFT_GUTTER, y, width - LEFT_GUTTER, height);
  ctx.clip();

  const buffer = state.scrubAudioBuffer;
  const samples = buffer ? buffer.getChannelData(0) : null;
  if (samples && samples.length >= 2) {
    const sampleRate = Math.max(1, Number(buffer.sampleRate || 44100));
    const mode = normalizeSectionVizMode(state.sectionVizMode);
    if (mode === "filled") drawSectionFilled(state, ctx, y, height, visibleStartSec, samples, sampleRate);
    else if (mode === "peaks") drawSectionPeaks(state, ctx, y, height, visibleStartSec, samples, sampleRate);
    else drawSectionBands(state, ctx, y, height, visibleStartSec, samples, sampleRate);
  } else {
    drawSectionMidiFallback(state, ctx, y, height, visibleStartSec);
  }
  ctx.restore();
}

function chooseRulerStepSec(pxPerSec) {
  const targetSec = Math.max(0.001, RULER_TARGET_PX / Math.max(1, pxPerSec));
  for (const value of RULER_STEP_OPTIONS_SEC) {
    if (value >= targetSec) return value;
  }
  return RULER_STEP_OPTIONS_SEC[RULER_STEP_OPTIONS_SEC.length - 1];
}

function formatTimelineTimeLabel(timeSec, stepSec) {
  const safe = Math.max(0, Number(timeSec || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  const decimals = stepSec < 0.2 ? 2 : stepSec < 1 ? 1 : 0;
  const secText = decimals > 0 ? seconds.toFixed(decimals).padStart(decimals + 3, "0") : String(Math.floor(seconds)).padStart(2, "0");
  return `${minutes}:${secText}`;
}

function drawTimeRuler(state, ctx, toX, visibleStartSec, visibleEndSec, width, height) {
  const stepSec = chooseRulerStepSec(state.pxPerSec);
  const minorStepSec = stepSec >= 10 ? stepSec / 5 : stepSec >= 2 ? stepSec / 4 : stepSec / 5;
  const firstMinor = Math.floor(visibleStartSec / minorStepSec) * minorStepSec;
  const firstMajor = Math.floor(visibleStartSec / stepSec) * stepSec;

  ctx.fillStyle = "#eee1d0";
  ctx.fillRect(LEFT_GUTTER, 0, Math.max(0, width - LEFT_GUTTER), RULER_HEIGHT);
  ctx.fillStyle = "#e2d2bf";
  ctx.fillRect(0, 0, LEFT_GUTTER, RULER_HEIGHT);

  ctx.strokeStyle = "rgba(96, 74, 55, 0.18)";
  for (let t = firstMinor; t <= visibleEndSec + minorStepSec; t += minorStepSec) {
    const x = toX(t);
    if (x < LEFT_GUTTER || x > width) continue;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_HEIGHT - 9);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(78, 58, 41, 0.42)";
  ctx.fillStyle = "#4b392b";
  ctx.font = "10px monospace";
  for (let t = firstMajor; t <= visibleEndSec + stepSec; t += stepSec) {
    const x = toX(t);
    if (x < LEFT_GUTTER || x > width) continue;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_HEIGHT - 15);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
    const label = formatTimelineTimeLabel(t, stepSec);
    ctx.fillText(label, x + 3, 11);
  }

  ctx.strokeStyle = "rgba(92, 70, 52, 0.5)";
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT - 0.5);
  ctx.lineTo(width, RULER_HEIGHT - 0.5);
  ctx.stroke();

  ctx.fillStyle = "#5f4a39";
  ctx.font = "9px monospace";
  ctx.fillText(`tick ${stepSec >= 1 ? `${stepSec.toFixed(0)}s` : `${stepSec.toFixed(2)}s`}`, 8, 11);
}

function normalizedTrackHash(trackName) {
  const text = String(trackName || "track");
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function drawAudioClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h) {
  const bins = clamp(Math.floor(widthPx / 2.5), 12, 280);
  const stepX = widthPx / bins;
  const midY = y + h * 0.5;
  const ampPx = Math.max(2, h * 0.46);
  const clipStart = Number(clip?.start || 0);
  const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));

  ctx.strokeStyle = "rgba(41, 28, 18, 0.58)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (state.scrubAudioBuffer) {
    const samples = state.scrubAudioBuffer.getChannelData(0);
    const sampleRate = Math.max(1, Number(state.scrubAudioBuffer.sampleRate || 44100));
    const sourceDurationSec = samples.length / sampleRate;
    for (let i = 0; i < bins; i += 1) {
      const t0 = clipStart + (i / bins) * (clipEnd - clipStart);
      const t1 = clipStart + ((i + 1) / bins) * (clipEnd - clipStart);
      const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
      const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t1);
      const s0 = clamp(Math.floor(mt0 * sampleRate), 0, Math.max(0, samples.length - 1));
      const s1 = clamp(Math.ceil(mt1 * sampleRate), s0 + 1, samples.length);
      const span = Math.max(1, s1 - s0);
      const readStep = Math.max(1, Math.floor(span / 18));
      let peak = 0;
      for (let s = s0; s < s1; s += readStep) {
        const amp = Math.abs(samples[s] || 0);
        if (amp > peak) peak = amp;
      }
      const scaled = peak * 1.18;
      const a = scaled < 0.012 ? 0 : clamp(scaled, 0, 1);
      const x = x0 + i * stepX + stepX * 0.5;
      ctx.moveTo(x, midY - a * ampPx);
      ctx.lineTo(x, midY + a * ampPx);
    }
  } else {
    // Deterministic fallback when no decoded audio buffer is available.
    const hash = normalizedTrackHash(trackName);
    const phase = hash * Math.PI * 2;
    for (let i = 0; i < bins; i += 1) {
      const t = i / Math.max(1, bins - 1);
      const base = 0.25 + Math.abs(Math.sin((t * 11.0 + phase) * Math.PI)) * 0.38;
      const wobble = Math.abs(Math.sin((t * 39.0 + phase * 0.7) * Math.PI)) * 0.28;
      const a = clamp(base + wobble, 0.08, 1);
      const x = x0 + i * stepX + stepX * 0.5;
      ctx.moveTo(x, midY - a * ampPx);
      ctx.lineTo(x, midY + a * ampPx);
    }
  }
  ctx.stroke();
}

function drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight) {
  const innerY = rowTop + 7;
  const innerH = Math.max(8, rowHeight - 14);
  const clipStart = Number(clip?.start || 0);
  const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
  const kind = String(track?.kind || "").toLowerCase();

  if (kind === "midi") {
    const noteEvents = Array.isArray(events)
      ? events.filter((event) => {
          if (!Number.isFinite(event?.pitch)) return false;
          const t0 = Number(event?.time || 0);
          const t1 = t0 + Math.max(0.01, Number(event?.duration || 0.01));
          return t1 > clipStart && t0 < clipEnd;
        })
      : [];
    if (!noteEvents.length) {
      drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
      return;
    }
    const minPitch = noteEvents.reduce((m, e) => Math.min(m, Number(e.pitch || m)), Number.POSITIVE_INFINITY);
    const maxPitch = noteEvents.reduce((m, e) => Math.max(m, Number(e.pitch || m)), Number.NEGATIVE_INFINITY);
    const span = Math.max(1, maxPitch - minPitch);
    ctx.strokeStyle = "rgba(50, 34, 22, 0.2)";
    for (let row = 1; row < 6; row += 1) {
      const y = innerY + (row / 6) * innerH;
      ctx.beginPath();
      ctx.moveTo(x0, y + 0.5);
      ctx.lineTo(x0 + widthPx, y + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(36, 22, 11, 0.72)";
    for (const event of noteEvents) {
      const t0 = Number(event.time || 0);
      const t1 = t0 + Math.max(0.02, Number(event.duration || 0.02));
      const nx0 = x0 + ((t0 - clipStart) / Math.max(0.001, clipEnd - clipStart)) * widthPx;
      const nx1 = x0 + ((t1 - clipStart) / Math.max(0.001, clipEnd - clipStart)) * widthPx;
      const pitch = Number(event.pitch || minPitch);
      const rel = (pitch - minPitch) / span;
      const noteY = innerY + (1 - rel) * (innerH - 4);
      ctx.fillRect(nx0, noteY, Math.max(2, nx1 - nx0), 3);
    }
    return;
  }

  drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
}

function isTrackMuted(state, trackName) {
  return Boolean(state.mutedTracks && state.mutedTracks.has(String(trackName || "")));
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
  for (const [trackName, entry] of state.trackAudioPlayers.entries()) {
    if (!entry?.audio) continue;
    try {
      entry.audio.volume = isTrackMuted(state, trackName) ? 0 : 1;
    } catch {}
  }
}

function hasTrackAudioPlayback(state, options = {}) {
  const { unmutedOnly = false } = options;
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return false;
  if (!unmutedOnly) return true;
  return getUnmutedTrackAudioEntries(state).length > 0;
}

function getPlaybackClockAudio(state) {
  const unmutedEntries = getUnmutedTrackAudioEntries(state);
  if (unmutedEntries.length) {
    for (const entry of unmutedEntries) {
      const audio = entry?.audio;
      if (!audio) continue;
      if (!audio.paused) return audio;
    }
    for (const entry of unmutedEntries) {
      const audio = entry?.audio;
      if (!audio) continue;
      return audio;
    }
  }
  if (state.audio && state.audioSource && !state.audioErrored && !isMixTrackMuted(state)) return state.audio;
  return null;
}

function clearTrackAudioPlayers(state) {
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return;
  for (const entry of state.trackAudioPlayers.values()) {
    const audio = entry?.audio;
    if (!audio) continue;
    if (entry.handlers) {
      try {
        if (entry.handlers.onError) audio.removeEventListener("error", entry.handlers.onError);
      } catch {}
    }
    try {
      audio.pause();
      audio.src = "";
      audio.load();
    } catch {}
  }
  state.trackAudioPlayers.clear();
}

function setupTrackAudioPlayers(state, onResolveAudioUrl) {
  clearTrackAudioPlayers(state);
  if (typeof Audio !== "function") return;
  if (typeof onResolveAudioUrl !== "function") return;
  const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
  for (const track of tracks) {
    const trackName = String(track?.name || "");
    const kind = String(track?.kind || "").toLowerCase();
    const assetKey = String(track?.audioAssetKey || "").trim();
    if (!trackName || kind !== "audio") continue;
    if (!assetKey || assetKey === "mix") continue;
    const url = String(onResolveAudioUrl(assetKey) || "").trim();
    if (!url) continue;
    const audio = new Audio();
    const entry = { audio, errored: false, handlers: null };
    const onError = () => {
      entry.errored = true;
    };
    entry.handlers = { onError };
    audio.preload = "auto";
    audio.addEventListener("error", onError);
    audio.src = url;
    try {
      audio.load();
    } catch {}
    state.trackAudioPlayers.set(trackName, entry);
  }
  syncTrackAudioMuteVolumes(state);
}

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
  const eventDur = clamp(Number(event?.duration || 0.12), 0.03, 4);
  const eventEnd = eventStart + eventDur;
  if (eventEnd <= playbackStartSec) return;
  const clippedStart = Math.max(eventStart, playbackStartSec);
  const clippedDur = clamp(eventEnd - clippedStart, 0.03, 4);
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
    const target = isTrackMuted(state, trackName) ? 0 : MIDI_MASTER_GAIN;
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
    gain.gain.setValueAtTime(isTrackMuted(state, trackName) ? 0 : MIDI_MASTER_GAIN, ctxStartSec);
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

function getSectionResizeHandleRect(state, width) {
  if (state?.compactMode) return null;
  const sectionHeight = normalizeSectionHeight(state.sectionHeight);
  const y0 = RULER_HEIGHT + sectionHeight - SECTION_RESIZE_HANDLE_HEIGHT;
  return {
    x0: LEFT_GUTTER,
    x1: Math.max(LEFT_GUTTER + 1, width),
    y0,
    y1: y0 + SECTION_RESIZE_HANDLE_HEIGHT,
  };
}

function isPointInSectionResizeHandle(state, width, x, y) {
  const rect = getSectionResizeHandleRect(state, width);
  if (!rect) return false;
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function draw(state) {
  const { canvas, ctx, studioData } = state;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
  const compactMode = Boolean(state.compactMode);
  state.sectionHeight = normalizeSectionHeight(state.sectionHeight);
  const sectionHeight = resolveVisibleSectionHeight(state, height);
  const trackAreaY = RULER_HEIGHT + sectionHeight;
  const timelineWidth = Math.max(1, width - LEFT_GUTTER);
  const timelineHeight = Math.max(0, height - trackAreaY);
  let trackLayout = compactMode ? { rows: [], totalHeight: 0 } : buildTrackRowsLayout(state, tracks, trackAreaY);
  const maxScroll = compactMode ? 0 : Math.max(0, trackLayout.totalHeight - timelineHeight);
  state.scrollY = compactMode ? 0 : clamp(state.scrollY, 0, maxScroll);
  if (!compactMode) trackLayout = buildTrackRowsLayout(state, tracks, trackAreaY);

  const toX = (timeSec) => LEFT_GUTTER + (timeSec - state.t0Sec) * state.pxPerSec;
  const visibleStartSec = state.t0Sec;
  const visibleEndSec = state.t0Sec + timelineWidth / state.pxPerSec;
  const sectionBandTop = RULER_HEIGHT + 2;
  const sectionBandHeight = Math.min(24, Math.max(14, Math.floor(sectionHeight * 0.34)));
  const sectionSignalTop = sectionBandTop + sectionBandHeight + 2;
  const sectionSignalHeight = Math.max(
    8,
    sectionHeight - sectionBandHeight - 5 - (compactMode ? 0 : SECTION_RESIZE_HANDLE_HEIGHT)
  );
  const handleRect = compactMode ? null : getSectionResizeHandleRect(state, width);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8efe2";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e8d9c7";
  ctx.fillRect(0, 0, LEFT_GUTTER, height);
  ctx.fillStyle = "#f2e5d6";
  ctx.fillRect(LEFT_GUTTER, 0, timelineWidth, trackAreaY);
  drawTimeRuler(state, ctx, toX, visibleStartSec, visibleEndSec, width, height);

  state.hitRegions = [];

  ctx.fillStyle = "rgba(242, 229, 214, 0.9)";
  ctx.fillRect(LEFT_GUTTER, sectionSignalTop - 1, timelineWidth, sectionSignalHeight + 2);
  drawSectionWaveform(state, ctx, sectionSignalTop, sectionSignalHeight, visibleStartSec);
  if (handleRect) {
    ctx.fillStyle = "rgba(210, 193, 173, 0.74)";
    ctx.fillRect(handleRect.x0, handleRect.y0, handleRect.x1 - handleRect.x0, handleRect.y1 - handleRect.y0);
    ctx.strokeStyle = "rgba(109, 89, 69, 0.72)";
    ctx.beginPath();
    ctx.moveTo(handleRect.x0, handleRect.y0 + 0.5);
    ctx.lineTo(handleRect.x1, handleRect.y0 + 0.5);
    ctx.stroke();
    const gripCenterY = handleRect.y0 + (handleRect.y1 - handleRect.y0) / 2;
    const gripCenterX = LEFT_GUTTER + timelineWidth * 0.5;
    ctx.strokeStyle = "rgba(88, 68, 51, 0.75)";
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(gripCenterX - 12, gripCenterY + i * 2.5);
      ctx.lineTo(gripCenterX + 12, gripCenterY + i * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(88, 68, 51, 0.85)";
    ctx.font = "9px monospace";
    ctx.fillText("drag to resize signal", handleRect.x0 + 8, handleRect.y0 + 8);
  }
  const globalBtnW = 38;
  const globalBtnH = 14;
  const globalBtnY = trackAreaY - globalBtnH - 2;
  const muteAllX = 8;
  const unmuteAllX = muteAllX + globalBtnW + 6;
  ctx.fillStyle = "rgba(103, 88, 73, 0.88)";
  ctx.fillRect(muteAllX, globalBtnY, globalBtnW, globalBtnH);
  ctx.fillStyle = "rgba(118, 102, 84, 0.86)";
  ctx.fillRect(unmuteAllX, globalBtnY, globalBtnW, globalBtnH);
  ctx.strokeStyle = "rgba(62, 52, 42, 0.7)";
  ctx.strokeRect(muteAllX + 0.5, globalBtnY + 0.5, globalBtnW - 1, globalBtnH - 1);
  ctx.strokeRect(unmuteAllX + 0.5, globalBtnY + 0.5, globalBtnW - 1, globalBtnH - 1);
  ctx.fillStyle = "#f8efe2";
  ctx.font = "9px monospace";
  ctx.fillText("M all", muteAllX + 7, globalBtnY + 10);
  ctx.fillText("U all", unmuteAllX + 7, globalBtnY + 10);
  state.hitRegions.push({
    x0: muteAllX,
    y0: globalBtnY,
    x1: muteAllX + globalBtnW,
    y1: globalBtnY + globalBtnH,
    payload: { type: "mute_all" },
  });
  state.hitRegions.push({
    x0: unmuteAllX,
    y0: globalBtnY,
    x1: unmuteAllX + globalBtnW,
    y1: globalBtnY + globalBtnH,
    payload: { type: "unmute_all" },
  });
  if (compactMode) {
    const stageGroups = buildStageGroups(tracks);
    const labelPadX = 6;
    const labelH = 13;
    const labelGap = 5;
    const labelX = 7;
    const labelMaxW = Math.max(42, LEFT_GUTTER - 14);
    const labelsTop = sectionSignalTop + 4;
    const labelsBottom = globalBtnY - 4;
    const groupsByKey = new Map();
    for (const track of tracks) {
      const trackName = String(track?.name || "").trim();
      if (!trackName) continue;
      const key = resolveTrackStageGroup(track).key;
      if (!groupsByKey.has(key)) groupsByKey.set(key, []);
      groupsByKey.get(key).push(trackName);
    }
    let y = labelsTop;
    for (const group of stageGroups) {
      if (y + labelH > labelsBottom) break;
      const trackNames = groupsByKey.get(group.key) || [];
      const allMuted = trackNames.length > 0 && trackNames.every((name) => isTrackMuted(state, name));
      const allUnmuted = trackNames.length > 0 && trackNames.every((name) => !isTrackMuted(state, name));
      ctx.fillStyle = allMuted
        ? "rgba(124, 66, 60, 0.9)"
        : (allUnmuted ? "rgba(96, 77, 59, 0.86)" : "rgba(116, 96, 77, 0.86)");
      ctx.fillRect(labelX, y, labelMaxW, labelH);
      ctx.strokeStyle = "rgba(63, 48, 35, 0.76)";
      ctx.strokeRect(labelX + 0.5, y + 0.5, Math.max(1, labelMaxW - 1), Math.max(1, labelH - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.font = "9px monospace";
      const prefix = allMuted ? "M " : "";
      ctx.fillText(compactText(`${prefix}${group.label}`, 22), labelX + labelPadX, y + 9);
      state.hitRegions.push({
        x0: labelX,
        y0: y,
        x1: labelX + labelMaxW,
        y1: y + labelH,
        payload: {
          type: "stage_group_toggle",
          group_key: group.key,
          group_label: group.label,
        },
      });
      y += labelH + labelGap;
    }
  }
  if (Array.isArray(studioData?.sections)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT_GUTTER, sectionBandTop, timelineWidth, sectionBandHeight);
    ctx.clip();
    for (let i = 0; i < studioData.sections.length; i += 1) {
      const section = studioData.sections[i];
      const start = Math.max(0, Number(section?.start || 0));
      let end = Math.max(start + 0.01, Number(section?.end || start + 0.01));
      // Keep the final section aligned with the effective song duration.
      if (i === studioData.sections.length - 1 && state.durationSec > start) {
        end = Math.max(end, state.durationSec);
      }
      if (end < visibleStartSec || start > visibleEndSec) continue;
      const x0 = toX(start);
      const x1 = toX(end);
      const drawX0 = clamp(x0, LEFT_GUTTER, width);
      const drawX1 = clamp(x1, LEFT_GUTTER, width);
      const isEven = i % 2 === 0;
      ctx.fillStyle = isEven ? "rgba(120, 86, 59, 0.86)" : "rgba(83, 103, 132, 0.82)";
      const blockWidth = Math.max(1, drawX1 - drawX0);
      ctx.fillRect(drawX0, sectionBandTop, blockWidth, sectionBandHeight);
      ctx.strokeStyle = isEven ? "rgba(67, 46, 30, 0.8)" : "rgba(43, 57, 73, 0.85)";
      ctx.strokeRect(drawX0 + 0.5, sectionBandTop + 0.5, Math.max(1, blockWidth - 1), Math.max(1, sectionBandHeight - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.font = "10px monospace";
      ctx.fillText(compactText(section?.name || `section ${i + 1}`, 18), drawX0 + 4, sectionBandTop + 15);
      state.hitRegions.push({
        x0: drawX0,
        y0: sectionBandTop,
        x1: drawX0 + Math.max(1, drawX1 - drawX0),
        y1: sectionBandTop + sectionBandHeight,
        payload: {
          type: "section",
          id: `section_${i + 1}`,
          name: section?.name || `section ${i + 1}`,
          t0_sec: start,
          t1_sec: end,
          origin_step_index: 2,
        },
      });
    }
    ctx.restore();
  }

  const bpm = Math.max(1, Number(studioData?.tempoBpm || 120));
  const secPerBar = (60 / bpm) * 4;

  if (!compactMode) {
    for (const row of trackLayout.rows) {
    if (row.rowBottom < trackAreaY || row.rowTop > height) continue;
    const i = row.index;
    const track = row.track;
    const trackName = String(track?.name || `track_${i + 1}`);
    const trackKind = String(track?.kind || "").toLowerCase();
    const partition = resolveTrackPartition(track);
    const muted = isTrackMuted(state, trackName);
    const rowTop = row.rowTop;
    const rowBottom = row.rowBottom;
    if (row.gapBefore > 0) {
      const gapTop = rowTop - row.gapBefore;
      const separatorY = gapTop + row.gapBefore / 2;
      ctx.fillStyle = "rgba(236, 223, 207, 0.92)";
      ctx.fillRect(0, gapTop, width, row.gapBefore);
      ctx.strokeStyle = "rgba(103, 83, 63, 0.55)";
      ctx.beginPath();
      ctx.moveTo(LEFT_GUTTER, separatorY + 0.5);
      ctx.lineTo(width, separatorY + 0.5);
      ctx.stroke();
      const labelText = compactText(row.groupLabel, 36);
      ctx.font = "9px monospace";
      const labelPadX = 5;
      const labelH = 11;
      const labelX = LEFT_GUTTER + 8;
      const labelY = gapTop + Math.max(1, (row.gapBefore - labelH) / 2);
      const measured = Math.ceil(ctx.measureText(labelText).width);
      const labelW = measured + labelPadX * 2;
      ctx.fillStyle = "rgba(93, 74, 56, 0.82)";
      ctx.fillRect(labelX, labelY, labelW, labelH);
      ctx.strokeStyle = "rgba(63, 48, 35, 0.76)";
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, Math.max(1, labelW - 1), Math.max(1, labelH - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.fillText(labelText, labelX + labelPadX, labelY + 8.5);
      state.hitRegions.push({
        x0: labelX,
        y0: labelY,
        x1: labelX + labelW,
        y1: labelY + labelH,
        payload: {
          type: "stage_group_toggle",
          group_key: row.groupKey,
          group_label: row.groupLabel,
        },
      });
    }
    ctx.fillStyle = i % 2 === 0 ? "#fffaf3" : "#f7ecdf";
    ctx.fillRect(LEFT_GUTTER, rowTop, timelineWidth, ROW_HEIGHT - 1);
    ctx.fillStyle = i % 2 === 0 ? "#e8d9c7" : "#e3d3c1";
    ctx.fillRect(0, rowTop, LEFT_GUTTER, ROW_HEIGHT - 1);
    const muteBtnW = 16;
    const muteBtnH = 14;
    const muteBtnX = LEFT_GUTTER - muteBtnW - 6;
    const muteBtnY = rowTop + 5;
    ctx.fillStyle = muted ? "rgba(154, 69, 63, 0.9)" : "rgba(103, 88, 73, 0.85)";
    ctx.fillRect(muteBtnX, muteBtnY, muteBtnW, muteBtnH);
    ctx.strokeStyle = muted ? "rgba(82, 34, 30, 0.9)" : "rgba(62, 52, 42, 0.7)";
    ctx.strokeRect(muteBtnX + 0.5, muteBtnY + 0.5, muteBtnW - 1, muteBtnH - 1);
    ctx.fillStyle = "#f8efe2";
    ctx.font = "9px monospace";
    ctx.fillText("M", muteBtnX + 5, muteBtnY + 10);
    state.hitRegions.push({
      x0: muteBtnX,
      y0: muteBtnY,
      x1: muteBtnX + muteBtnW,
      y1: muteBtnY + muteBtnH,
      payload: { type: "track_mute", track_name: trackName },
    });

    ctx.fillStyle = muted ? "rgba(63, 51, 40, 0.54)" : "#3f3328";
    ctx.font = "10px monospace";
    ctx.fillText(compactText(trackName, 18), 8, rowTop + 14);
    ctx.fillStyle = muted ? "rgba(109, 90, 72, 0.55)" : "#6d5a48";
    ctx.fillText(`${track?.kind || "track"} · ${track?.events || 0}`, 8, rowTop + 28);

    const events = Array.isArray(studioData?.eventsByTrack?.[track?.name]) ? studioData.eventsByTrack[track.name] : [];
    let clips = buildTrackClips(events, state.durationSec, secPerBar);
    const hasSource = String(track?.source || "").trim().length > 0;
    // Stems/mix are full-length assets; when events are sparse, keep clip geometry aligned to full timeline.
    if (trackKind === "audio" && hasSource && Number.isFinite(state.durationSec) && state.durationSec > 0.05) {
      const coverStart = clips.reduce((min, clip) => Math.min(min, Number(clip?.start || 0)), Number.POSITIVE_INFINITY);
      const coverEnd = clips.reduce((max, clip) => Math.max(max, Number(clip?.end || 0)), 0);
      const coverage = Math.max(0, coverEnd - coverStart);
      const tailGap = Math.max(0, state.durationSec - coverEnd);
      const headGap = Number.isFinite(coverStart) ? Math.max(0, coverStart) : 0;
      const snapThresholdSec = Math.max(0.08, secPerBar * 0.25);
      if (!Number.isFinite(coverStart) || coverage < state.durationSec * 0.7 || tailGap <= snapThresholdSec) {
        const snappedStart = headGap <= snapThresholdSec ? 0 : headGap;
        clips = [{ start: snappedStart, end: state.durationSec, label: "audio", notesCount: 0 }];
      }
    }
    if ((trackKind === "fx" || trackKind === "project") && Number.isFinite(state.durationSec) && state.durationSec > 0.05) {
      // FX/project are projections of the full arrangement; keep visual span aligned with song duration.
      clips = [{ start: 0, end: state.durationSec, label: trackKind, notesCount: 0 }];
    }
    if (trackKind === "midi") {
      const noteEvents = Array.isArray(events) ? events.filter((event) => Number.isFinite(event?.pitch)) : [];
      const noteStart = noteEvents.length
        ? noteEvents.reduce((min, event) => Math.min(min, Number(event?.time || 0)), Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const noteEnd = noteEvents.length
        ? noteEvents.reduce(
            (max, event) => Math.max(max, Number(event?.time || 0) + Math.max(0.01, Number(event?.duration || 0.01))),
            0
          )
        : 0;
      const hintStart = Number(track?.clipStartHintSec);
      const hintEnd = Number(track?.clipEndHintSec);
      const strictStart = Number.isFinite(hintStart) ? Math.max(0, hintStart) : (Number.isFinite(noteStart) ? Math.max(0, noteStart) : 0);
      let strictEnd = Math.max(strictStart + 0.01, Number.isFinite(noteEnd) ? noteEnd : strictStart + 0.01);
      if (Number.isFinite(hintEnd)) strictEnd = Math.max(strictEnd, hintEnd);

      let targetEnd = strictEnd;
      // Fallback mode: if no explicit clip end hint and detected MIDI content is much shorter than song duration,
      // extend to song duration to avoid misleading "section 1 only" visual truncation.
      if (!Number.isFinite(hintEnd) && state.durationSec > 0 && strictEnd < state.durationSec * 0.45) {
        targetEnd = state.durationSec;
      }

      const coverStart = clips.reduce((min, clip) => Math.min(min, Number(clip?.start || 0)), Number.POSITIVE_INFINITY);
      const coverEnd = clips.reduce((max, clip) => Math.max(max, Number(clip?.end || 0)), 0);
      const hasBadCoverage =
        !Number.isFinite(coverStart) || coverStart > strictStart + 0.05 || coverEnd < targetEnd - 0.05;
      if (hasBadCoverage && targetEnd > strictStart + 0.01) {
        clips = [{ start: strictStart, end: targetEnd, label: "midi", notesCount: noteEvents.length }];
      }
      if (partition === "obtained_midi" && Number.isFinite(state.durationSec) && state.durationSec > 0.05) {
        const snapThresholdSec = Math.max(0.08, secPerBar * 0.25);
        const alignedStart = strictStart <= snapThresholdSec ? 0 : strictStart;
        clips = [{ start: alignedStart, end: state.durationSec, label: "midi", notesCount: noteEvents.length }];
      }
    }
    clips = clips
      .map((clip) => {
        const clippedStart = clamp(Number(clip?.start || 0), 0, state.durationSec);
        const rawEnd = Math.max(clippedStart + 0.01, Number(clip?.end || clippedStart + 0.01));
        const clippedEnd = clamp(rawEnd, clippedStart + 0.01, state.durationSec);
        return {
          ...clip,
          start: clippedStart,
          end: clippedEnd,
        };
      })
      .filter((clip) => clip.end > clip.start + 0.0005);
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT_GUTTER, rowTop, timelineWidth, ROW_HEIGHT - 1);
    ctx.clip();
    for (const clip of clips) {
      if (clip.end < visibleStartSec || clip.start > visibleEndSec) continue;
      const x0 = toX(clip.start);
      const x1 = toX(clip.end);
      const widthPx = Math.max(2, x1 - x0);
      ctx.fillStyle = stableTrackColor(trackName || String(i));
      ctx.globalAlpha = muted ? 0.2 : 0.72;
      ctx.fillRect(x0, rowTop + 5, widthPx, ROW_HEIGHT - 10);
      ctx.globalAlpha = muted ? 0.55 : 1;
      ctx.strokeStyle = "rgba(48, 36, 26, 0.6)";
      ctx.strokeRect(x0 + 0.5, rowTop + 5.5, Math.max(1, widthPx - 1), ROW_HEIGHT - 11);
      if (!muted) drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, ROW_HEIGHT);
      ctx.fillStyle = muted ? "rgba(32, 22, 14, 0.54)" : "#20160e";
      ctx.font = "9px monospace";
      ctx.fillText(compactText(clip.label, 24), x0 + 4, rowTop + 18);
      state.hitRegions.push({
        x0: Math.max(LEFT_GUTTER, x0),
        y0: rowTop + 5,
        x1: Math.min(width, x0 + widthPx),
        y1: rowBottom - 5,
        payload: {
          type: "clip",
          id: `${track?.name || "track"}_${clip.start.toFixed(3)}`,
          name: clip.label,
          t0_sec: clip.start,
          t1_sec: clip.end,
          notes_count: clip.notesCount || 0,
          origin_step_index: resolveTrackStepIndex(track),
          asset: String(track?.source || ""),
        },
      });
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    }
  }

  const playheadX = toX(state.playheadSec);
  if (playheadX >= LEFT_GUTTER - 2 && playheadX <= width + 2) {
    ctx.strokeStyle = "rgba(26, 21, 16, 0.88)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }

  const hasMidiSynth = Boolean(state.midiTrackNodes && state.midiTrackNodes.size);
  const modeLabel = state.scrubbing
    ? state.scrubAudioBuffer
      ? "scrub"
      : "scrub loading"
    : state.audioSource
      ? state.audioErrored
        ? hasMidiSynth
          ? "audio error + midi"
          : "audio error"
        : state.audioReady
          ? hasMidiSynth
            ? "audio + midi"
            : "audio"
          : hasMidiSynth
            ? "audio loading + midi"
            : "audio loading"
      : hasMidiSynth
        ? "midi synth"
        : "no audio";
  if (state.playPauseBtn) {
    state.playPauseBtn.textContent = state.isPlaying ? "Pause" : "Play";
    state.playPauseBtn.classList.toggle("alt", state.isPlaying);
  }
  state.statusLabel.textContent = `${state.isPlaying ? "Playing" : "Stopped"} · ${state.playheadSec.toFixed(2)}s · ${modeLabel}`;
  renderFooter(state);
}

function seek(state, timeSec) {
  state.playheadSec = clamp(timeSec, 0, state.durationSec);
  if (state.audio && state.audioSource) {
    try {
      state.audio.currentTime = state.playheadSec;
    } catch {}
  }
  if (state.trackAudioPlayers && state.trackAudioPlayers.size) {
    for (const entry of state.trackAudioPlayers.values()) {
      const audio = entry?.audio;
      if (!audio) continue;
      try {
        audio.currentTime = state.playheadSec;
      } catch {}
    }
  }
  draw(state);
}

function startPlayback(state) {
  if (state.isPlaying) return;
  stopScrubGrains(state);
  state.isPlaying = true;
  state.lastFrameTs = null;
  void startMidiPlayback(state);
  if (hasTrackAudioPlayback(state, { unmutedOnly: true })) {
    syncTrackAudioMuteVolumes(state);
    for (const entry of state.trackAudioPlayers.values()) {
      const audio = entry?.audio;
      if (!audio || entry?.errored) continue;
      try {
        audio.currentTime = state.playheadSec;
        const result = audio.play();
        if (result && typeof result.catch === "function") {
          result.catch(() => {
            entry.errored = true;
          });
        }
      } catch {
        entry.errored = true;
      }
    }
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
    const clockAudio = getPlaybackClockAudio(state);
    const hasAudioClock = clockAudio && !clockAudio.paused;
    if (hasAudioClock) {
      state.playheadSec = clamp(clockAudio.currentTime || 0, 0, state.durationSec);
      if (clockAudio.ended || state.playheadSec >= state.durationSec) {
        state.playheadSec = state.durationSec;
        state.isPlaying = false;
      }
    } else if (state.lastFrameTs != null) {
      const delta = Math.max(0, (ts - state.lastFrameTs) / 1000);
      const next = state.playheadSec + delta;
      if (next >= state.durationSec) {
        state.playheadSec = state.durationSec;
        state.isPlaying = false;
      } else {
        state.playheadSec = next;
      }
    }
    state.lastFrameTs = ts;
    draw(state);
    if (state.isPlaying) state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
  draw(state);
}

function stopPlayback(state, resetPlayhead = false) {
  state.isPlaying = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  clearMidiPlayback(state);
  if (state.audio && state.audioSource) {
    try {
      state.audio.pause();
    } catch {}
  }
  if (state.trackAudioPlayers && state.trackAudioPlayers.size) {
    for (const entry of state.trackAudioPlayers.values()) {
      const audio = entry?.audio;
      if (!audio) continue;
      try {
        audio.pause();
      } catch {}
    }
  }
  if (resetPlayhead) state.playheadSec = 0;
  if (resetPlayhead && state.audio && state.audioSource) {
    try {
      state.audio.currentTime = 0;
    } catch {}
  }
  if (resetPlayhead && state.trackAudioPlayers && state.trackAudioPlayers.size) {
    for (const entry of state.trackAudioPlayers.values()) {
      const audio = entry?.audio;
      if (!audio) continue;
      try {
        audio.currentTime = 0;
      } catch {}
    }
  }
  draw(state);
}

function hitTest(state, x, y) {
  for (let i = state.hitRegions.length - 1; i >= 0; i -= 1) {
    const region = state.hitRegions[i];
    if (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1) return region.payload;
  }
  return null;
}

function fitToViewport(state, { drawAfter = true } = {}) {
  const timelineWidth = Math.max(1, state.canvas.clientWidth - LEFT_GUTTER);
  state.pxPerSec = clamp(timelineWidth / state.durationSec, getMinPxPerSec(state), MAX_PX_PER_SEC);
  state.t0Sec = 0;
  if (drawAfter) draw(state);
}

function getMinPxPerSec(state) {
  const timelineWidth = Math.max(1, Number(state?.canvas?.clientWidth || 0) - LEFT_GUTTER);
  const durationSec = Math.max(1e-6, Number(state?.durationSec || 0));
  const dynamicMin = (timelineWidth * MIN_SONG_WIDTH_RATIO) / durationSec;
  return Math.max(MIN_PX_PER_SEC_HARD, dynamicMin);
}

function clampTimelineOffsetSec(state, valueSec) {
  const timelineWidth = Math.max(1, state.canvas.clientWidth - LEFT_GUTTER);
  const visibleSec = timelineWidth / Math.max(1e-6, state.pxPerSec);
  const maxT0 = Math.max(0, state.durationSec - visibleSec);
  return clamp(Number(valueSec || 0), 0, maxT0);
}

export function clearSong2DawTimeline(body) {
  const state = TIMELINE_STATE.get(body);
  if (!state) return;
  body.classList.remove("lemouf-song2daw-studio-body-compact");
  if (state.canvas) state.canvas.style.cursor = "";
  stopPlayback(state);
  stopScrubGrains(state);
  clearTrackAudioPlayers(state);
  state.mutePaintActive = false;
  state.mutePaintPointerId = null;
  state.mutePaintVisited = new Set();
  if (state.keydownHandler) {
    window.removeEventListener("keydown", state.keydownHandler);
  }
  if (state.audio && state.audioHandlers) {
    const handlers = state.audioHandlers;
    try {
      state.audio.removeEventListener("loadedmetadata", handlers.onLoadedMetadata);
      state.audio.removeEventListener("timeupdate", handlers.onTimeUpdate);
      state.audio.removeEventListener("ended", handlers.onEnded);
      state.audio.removeEventListener("error", handlers.onError);
    } catch {}
    try {
      state.audio.pause();
      state.audio.src = "";
      state.audio.load();
    } catch {}
  }
  if (state.resizeObserver) {
    try {
      state.resizeObserver.disconnect();
    } catch {}
  }
  state.scrubSourceUrl = "";
  state.scrubDecodeUrl = "";
  state.scrubDecodePromise = null;
  state.scrubAudioBuffer = null;
  state.scrubAudioBufferReverse = null;
  if (state.scrubAudioContext) {
    try {
      state.scrubAudioContext.close();
    } catch {}
  }
  if (state.midiAudioContext) {
    try {
      state.midiAudioContext.close();
    } catch {}
  }
  TIMELINE_STATE.delete(body);
}

export function renderSong2DawTimeline({
  runData,
  studioData,
  body,
  layoutMode = "full",
  onJumpToStep,
  onOpenRunDir,
  onResolveAudioUrl,
}) {
  clearSong2DawTimeline(body);
  body.innerHTML = "";
  const compactMode = layoutMode !== "full";
  body.classList.toggle("lemouf-song2daw-studio-body-compact", compactMode);

  const toolbar = el("div", { class: "lemouf-song2daw-studio-toolbar" });
  const controls = el("div", { class: "lemouf-song2daw-studio-toolbar-group" });
  const nav = el("div", { class: "lemouf-song2daw-studio-toolbar-group" });
  const overviewLabel = el("div", { class: "lemouf-song2daw-studio-toolbar-overview", text: "" });
  const statusLabel = el("div", { class: "lemouf-song2daw-studio-toolbar-status", text: "Stopped · 0.00s" });

  const playPauseBtn = el("button", { class: "lemouf-loop-btn", text: "Play", type: "button" });
  const stopBtn = el("button", { class: "lemouf-loop-btn alt", text: "Stop", type: "button" });
  controls.append(playPauseBtn, stopBtn);

  const fitBtn = el("button", { class: "lemouf-loop-btn alt", text: "Fit", type: "button" });
  const sectionVizSelect = el("select", { class: "lemouf-loop-select lemouf-song2daw-viz-select" });
  sectionVizSelect.append(
    el("option", { value: "bands", text: "Viz: Bands" }),
    el("option", { value: "filled", text: "Viz: Filled" }),
    el("option", { value: "peaks", text: "Viz: Peaks" })
  );
  const jumpBtn = el("button", { class: "lemouf-loop-btn alt", text: "Step", type: "button" });
  jumpBtn.style.display = "none";
  nav.append(fitBtn, sectionVizSelect, jumpBtn);
  if (typeof onOpenRunDir === "function") {
    const openBtn = el("button", { class: "lemouf-loop-btn alt", text: "Open run_dir", type: "button" });
    openBtn.addEventListener("click", () => onOpenRunDir());
    nav.appendChild(openBtn);
  }
  toolbar.append(controls, nav, overviewLabel, statusLabel);

  const layout = el("div", { class: "lemouf-song2daw-studio-layout" });
  const canvasWrap = el("div", { class: "lemouf-song2daw-arrange-canvas-wrap" });
  const canvas = el("canvas", { class: "lemouf-song2daw-arrange-canvas" });
  canvasWrap.appendChild(canvas);
  layout.append(canvasWrap);
  const footer = el("div", { class: "lemouf-song2daw-studio-footer" });
  const footerActions = el("div", { class: "lemouf-song2daw-studio-footer-actions" });
  const zoomGroup = el("div", { class: "lemouf-song2daw-studio-footer-group" });
  const zoomLabel = el("span", { class: "lemouf-song2daw-studio-footer-zoom", text: "zoom n/a" });
  const zoomResetBtn = el("button", { class: "lemouf-loop-btn alt", text: "Zoom default", type: "button" });
  zoomGroup.append(zoomLabel, zoomResetBtn);
  footerActions.append(zoomGroup);
  footer.append(footerActions);
  body.append(toolbar, layout, footer);

  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  const resolveTimelineAudioUrl = () => {
    if (typeof onResolveAudioUrl !== "function") return "";
    const candidates = ["mix", "__source_audio", "source_audio"];
    const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
    for (const track of tracks) {
      if (String(track?.kind || "").toLowerCase() !== "audio") continue;
      const key = String(track?.audioAssetKey || "").trim();
      if (key) candidates.push(key);
    }
    const seen = new Set();
    for (const asset of candidates) {
      if (seen.has(asset)) continue;
      seen.add(asset);
      const url = String(onResolveAudioUrl(asset) || "").trim();
      if (url) return url;
    }
    return "";
  };
  const initialStudioDurationSec = Math.max(0, Number(studioData?.durationSec || 0));
  const state = {
    runData,
    studioData,
    canvas,
    ctx,
    overviewLabel,
    playPauseBtn,
    jumpBtn,
    statusLabel,
    zoomLabel,
    zoomResetBtn,
    onJumpToStep,
    onOpenRunDir,
    durationSec: Math.max(1, Number(studioData?.durationSec || 1)),
    t0Sec: 0,
    pxPerSec: 84,
    scrollY: 0,
    playheadSec: 0,
    isPlaying: false,
    rafId: 0,
    lastFrameTs: null,
    hitRegions: [],
    selection: null,
    resizeObserver: null,
    autoFit: true,
    sectionHeight: normalizeSectionHeight(localStorage.getItem(SECTION_HEIGHT_STORAGE_KEY)),
    compactMode,
    resizingSection: false,
    resizeSectionPointerId: null,
    resizeSectionStartClientY: 0,
    resizeSectionStartHeight: DEFAULT_SECTION_HEIGHT,
    panningX: false,
    panPointerId: null,
    panStartClientX: 0,
    panStartT0Sec: 0,
    scrubbing: false,
    scrubPointerId: null,
    scrubResumeOnRelease: false,
    scrubLastTimeSec: 0,
    scrubLastMoveTsMs: null,
    scrubNextGrainAt: 0,
    scrubNodes: new Set(),
    scrubAudioContext: null,
    scrubAudioBuffer: null,
    scrubAudioBufferReverse: null,
    scrubSourceUrl: "",
    scrubDecodePromise: null,
    scrubDecodeUrl: "",
    pendingTrackPointer: null,
    mutedTracks: new Set(),
    mutePaintActive: false,
    mutePaintPointerId: null,
    mutePaintTargetMuted: false,
    mutePaintVisited: new Set(),
    sectionVizMode: normalizeSectionVizMode(localStorage.getItem(SECTION_VIZ_STORAGE_KEY)),
    audio: typeof Audio === "function" ? new Audio() : null,
    audioSource: "",
    audioReady: false,
    audioErrored: false,
    audioHandlers: null,
    trackAudioPlayers: new Map(),
    midiAudioContext: null,
    midiNoiseBuffer: null,
    midiTrackNodes: new Map(),
    midiVoices: new Set(),
    keydownHandler: null,
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.autoFit) fitToViewport(state, { drawAfter: false });
    else state.t0Sec = clampTimelineOffsetSec(state, state.t0Sec);
    draw(state);
    renderOverview(state);
  };
  if (typeof ResizeObserver === "function") {
    state.resizeObserver = new ResizeObserver(() => resize());
    state.resizeObserver.observe(canvasWrap);
  }

  const applyTrackMuteChange = (trackName, muted) => {
    const changed = setTrackMuted(state, trackName, muted);
    if (!changed) return false;
    syncTrackAudioMuteVolumes(state);
    syncMidiTrackMuteGains(state);
    if (state.isPlaying && hasUnmutedMidiTracks(state)) {
      void startMidiPlayback(state).then(() => {
        draw(state);
        renderOverview(state);
      });
    }
    draw(state);
    renderOverview(state);
    return true;
  };

  const applyMuteBatch = (mutator) => {
    const changed = Boolean(typeof mutator === "function" ? mutator() : false);
    syncTrackAudioMuteVolumes(state);
    syncMidiTrackMuteGains(state);
    if (state.isPlaying && hasUnmutedMidiTracks(state)) {
      void startMidiPlayback(state).then(() => {
        draw(state);
        renderOverview(state);
      });
    }
    if (!changed) {
      draw(state);
      renderOverview(state);
      return;
    }
    void ensureScrubAudioReady(state).finally(() => {
      draw(state);
      renderOverview(state);
    });
  };

  const getAllTrackNames = () => {
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const names = [];
    for (const track of tracks) {
      const name = String(track?.name || "").trim();
      if (!name) continue;
      names.push(name);
    }
    return names;
  };

  const getGroupTrackNames = (groupKey) => {
    const key = String(groupKey || "");
    if (!key) return [];
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const names = [];
    for (const track of tracks) {
      const name = String(track?.name || "").trim();
      if (!name) continue;
      if (resolveTrackStageGroup(track).key !== key) continue;
      names.push(name);
    }
    return names;
  };

  const beginMutePaint = (event, trackName) => {
    const name = String(trackName || "");
    if (!name) return;
    state.mutePaintActive = true;
    state.mutePaintPointerId = event.pointerId;
    state.mutePaintTargetMuted = !isTrackMuted(state, name);
    state.mutePaintVisited = new Set();
    state.pendingTrackPointer = null;
    applyTrackMuteChange(name, state.mutePaintTargetMuted);
    state.mutePaintVisited.add(name);
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const updateMutePaint = (event) => {
    if (!state.mutePaintActive) return;
    if (state.mutePaintPointerId !== null && event.pointerId !== state.mutePaintPointerId) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitTest(state, x, y);
    if (hit?.type !== "track_mute") return;
    const trackName = String(hit.track_name || "");
    if (!trackName || state.mutePaintVisited.has(trackName)) return;
    applyTrackMuteChange(trackName, state.mutePaintTargetMuted);
    state.mutePaintVisited.add(trackName);
  };

  const endMutePaint = (event) => {
    if (!state.mutePaintActive) return;
    if (state.mutePaintPointerId !== null && event.pointerId !== state.mutePaintPointerId) return;
    state.mutePaintActive = false;
    state.mutePaintPointerId = null;
    state.mutePaintVisited = new Set();
    void ensureScrubAudioReady(state).finally(() => {
      draw(state);
      renderOverview(state);
    });
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
  };

  const beginScrub = (event) => {
    state.scrubbing = true;
    state.scrubPointerId = event.pointerId;
    state.scrubResumeOnRelease = state.isPlaying;
    stopPlayback(state, false);
    state.scrubLastTimeSec = state.playheadSec;
    state.scrubLastMoveTsMs = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    state.scrubNextGrainAt = 0;
    void ensureMidiAudioReady(state);
    void ensureScrubAudioReady(state).then((ready) => {
      if (!ready) return;
      draw(state);
      renderOverview(state);
    });
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const beginSectionResize = (event) => {
    state.resizingSection = true;
    state.resizeSectionPointerId = event.pointerId;
    state.resizeSectionStartClientY = event.clientY;
    state.resizeSectionStartHeight = normalizeSectionHeight(state.sectionHeight);
    canvas.style.cursor = "ns-resize";
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const beginPanX = (event) => {
    state.panningX = true;
    state.panPointerId = event.pointerId;
    state.panStartClientX = event.clientX;
    state.panStartT0Sec = state.t0Sec;
    state.autoFit = false;
    canvas.style.cursor = "grabbing";
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const updateSectionResize = (event) => {
    if (!state.resizingSection) return;
    if (state.resizeSectionPointerId !== null && event.pointerId !== state.resizeSectionPointerId) return;
    const deltaY = event.clientY - state.resizeSectionStartClientY;
    state.sectionHeight = normalizeSectionHeight(state.resizeSectionStartHeight + deltaY);
    draw(state);
  };

  const updateScrub = (event) => {
    if (!state.scrubbing) return;
    if (state.scrubPointerId !== null && event.pointerId !== state.scrubPointerId) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clampedX = clamp(x, LEFT_GUTTER, canvas.clientWidth);
    const time = state.t0Sec + (clampedX - LEFT_GUTTER) / state.pxPerSec;
    const nowMs = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const prevTs = Number(state.scrubLastMoveTsMs || nowMs);
    const deltaSec = Math.max(0.001, (nowMs - prevTs) / 1000);
    const velocitySecPerSec = (time - state.scrubLastTimeSec) / deltaSec;
    state.scrubLastMoveTsMs = nowMs;
    state.scrubLastTimeSec = time;
    seek(state, time);
    scheduleScrubGrain(state, time, velocitySecPerSec);
    renderOverview(state);
  };

  const updatePanX = (event) => {
    if (!state.panningX) return;
    if (state.panPointerId !== null && event.pointerId !== state.panPointerId) return;
    const deltaPx = event.clientX - state.panStartClientX;
    const nextT0 = state.panStartT0Sec - deltaPx / Math.max(1e-6, state.pxPerSec);
    state.t0Sec = clampTimelineOffsetSec(state, nextT0);
    draw(state);
  };

  const endScrub = (event) => {
    if (!state.scrubbing) return;
    if (state.scrubPointerId !== null && event.pointerId !== state.scrubPointerId) return;
    state.scrubbing = false;
    state.scrubPointerId = null;
    stopScrubGrains(state);
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    const resume = state.scrubResumeOnRelease;
    state.scrubResumeOnRelease = false;
    if (resume) startPlayback(state);
  };

  const endSectionResize = (event) => {
    if (!state.resizingSection) return;
    if (state.resizeSectionPointerId !== null && event.pointerId !== state.resizeSectionPointerId) return;
    state.resizingSection = false;
    state.resizeSectionPointerId = null;
    state.resizeSectionStartClientY = 0;
    state.resizeSectionStartHeight = DEFAULT_SECTION_HEIGHT;
    canvas.style.cursor = "";
    localStorage.setItem(SECTION_HEIGHT_STORAGE_KEY, String(normalizeSectionHeight(state.sectionHeight)));
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    draw(state);
  };

  const endPanX = (event) => {
    if (!state.panningX) return;
    if (state.panPointerId !== null && event.pointerId !== state.panPointerId) return;
    state.panningX = false;
    state.panPointerId = null;
    canvas.style.cursor = "";
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
  };

  const handleHit = (hit) => {
    if (hit?.type === "track_mute") {
      applyTrackMuteChange(hit.track_name, !isTrackMuted(state, hit.track_name));
      void ensureScrubAudioReady(state).finally(() => {
        draw(state);
        renderOverview(state);
      });
      return;
    }
    if (hit?.type === "mute_all") {
      applyMuteBatch(() => {
        let changed = false;
        for (const name of getAllTrackNames()) {
          changed = setTrackMuted(state, name, true) || changed;
        }
        return changed;
      });
      return;
    }
    if (hit?.type === "unmute_all") {
      applyMuteBatch(() => {
        let changed = false;
        for (const name of getAllTrackNames()) {
          changed = setTrackMuted(state, name, false) || changed;
        }
        return changed;
      });
      return;
    }
    if (hit?.type === "stage_group_toggle") {
      const groupTracks = getGroupTrackNames(hit.group_key);
      if (!groupTracks.length) {
        draw(state);
        renderOverview(state);
        return;
      }
      applyMuteBatch(() => {
        const allTrackNames = getAllTrackNames();
        const groupSet = new Set(groupTracks);
        const otherTracks = allTrackNames.filter((name) => !groupSet.has(name));
        const allChildrenMuted = groupTracks.every((name) => isTrackMuted(state, name));
        const allChildrenUnmuted = groupTracks.every((name) => !isTrackMuted(state, name));
        const allOthersUnmuted = otherTracks.every((name) => !isTrackMuted(state, name));
        let changed = false;
        if (allChildrenMuted || !allChildrenUnmuted || allOthersUnmuted) {
          for (const name of allTrackNames) {
            const shouldMute = !groupSet.has(name);
            changed = setTrackMuted(state, name, shouldMute) || changed;
          }
          return changed;
        }
        for (const name of allTrackNames) {
          changed = setTrackMuted(state, name, false) || changed;
        }
        for (const name of groupTracks) {
          changed = setTrackMuted(state, name, true) || changed;
        }
        return changed;
      });
      return;
    }
    state.selection = hit;
    draw(state);
    renderOverview(state);
  };

  if (state.audio && typeof onResolveAudioUrl === "function") {
    const url = resolveTimelineAudioUrl();
    if (url) {
      state.audioSource = url;
      state.audio.preload = "auto";
      const onLoadedMetadata = () => {
        const mediaDuration = Number(state.audio?.duration || 0);
        if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
          // Keep visual timeline aligned with the Song2DAW arrangement duration when provided.
          // Media files can include extra tail silence and should not stretch clip geometry.
          if (initialStudioDurationSec <= 0.05) {
            state.durationSec = mediaDuration;
            if (state.autoFit) fitToViewport(state, { drawAfter: false });
          }
        }
        state.audioReady = true;
        state.audioErrored = false;
        draw(state);
      };
      const onTimeUpdate = () => {
        if (!state.isPlaying) return;
        state.playheadSec = clamp(Number(state.audio?.currentTime || 0), 0, state.durationSec);
        draw(state);
      };
      const onEnded = () => {
        stopPlayback(state, true);
      };
      const onError = () => {
        state.audioReady = false;
        state.audioErrored = true;
        draw(state);
      };
      state.audioHandlers = { onLoadedMetadata, onTimeUpdate, onEnded, onError };
      state.audio.addEventListener("loadedmetadata", onLoadedMetadata);
      state.audio.addEventListener("timeupdate", onTimeUpdate);
      state.audio.addEventListener("ended", onEnded);
      state.audio.addEventListener("error", onError);
      state.audio.src = url;
      state.audio.load();
      void ensureScrubAudioReady(state).then((ready) => {
        if (!ready) return;
        draw(state);
        renderOverview(state);
      });
    }
  }
  setupTrackAudioPlayers(state, onResolveAudioUrl);

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const sectionHeight = resolveVisibleSectionHeight(state, canvas.clientHeight);
    const trackAreaTop = RULER_HEIGHT + sectionHeight;
    const panBandLimit = RULER_HEIGHT + Math.min(sectionHeight, 26);
    if (isPointInSectionResizeHandle(state, canvas.clientWidth, x, y)) {
      beginSectionResize(event);
      return;
    }
    if (x >= LEFT_GUTTER && y <= panBandLimit) {
      beginPanX(event);
      return;
    }
    if (x >= LEFT_GUTTER && y <= RULER_HEIGHT + sectionHeight) {
      beginScrub(event);
      updateScrub(event);
      return;
    }
    if (x >= LEFT_GUTTER && y >= trackAreaTop) {
      state.pendingTrackPointer = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startT0Sec: state.t0Sec,
      };
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch {}
      return;
    }
    const hit = hitTest(state, x, y);
    if (hit?.type === "track_mute") {
      beginMutePaint(event, hit.track_name);
      return;
    }
    handleHit(hit);
  });

  canvas.addEventListener("pointermove", (event) => {
    updateMutePaint(event);
    if (state.mutePaintActive) return;
    if (
      state.pendingTrackPointer &&
      state.pendingTrackPointer.pointerId === event.pointerId &&
      !state.panningX &&
      !state.scrubbing &&
      !state.resizingSection
    ) {
      const dx = event.clientX - state.pendingTrackPointer.startClientX;
      const dy = event.clientY - state.pendingTrackPointer.startClientY;
      if (Math.hypot(dx, dy) > 3) {
        state.panningX = true;
        state.panPointerId = event.pointerId;
        state.panStartClientX = state.pendingTrackPointer.startClientX;
        state.panStartT0Sec = state.pendingTrackPointer.startT0Sec;
        state.autoFit = false;
        canvas.style.cursor = "grabbing";
        state.pendingTrackPointer = null;
      }
    }
    if (!state.panningX && !state.scrubbing && !state.resizingSection && !state.pendingTrackPointer) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      canvas.style.cursor = isPointInSectionResizeHandle(state, canvas.clientWidth, x, y) ? "ns-resize" : "";
    }
    updateSectionResize(event);
    updatePanX(event);
    updateScrub(event);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (state.mutePaintActive) {
      endMutePaint(event);
      return;
    }
    if (
      state.pendingTrackPointer &&
      state.pendingTrackPointer.pointerId === event.pointerId &&
      !state.panningX &&
      !state.scrubbing
    ) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTest(state, x, y);
      handleHit(hit);
      state.pendingTrackPointer = null;
      try {
        canvas.releasePointerCapture?.(event.pointerId);
      } catch {}
    }
    endSectionResize(event);
    endPanX(event);
    endScrub(event);
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (state.mutePaintActive) {
      endMutePaint(event);
      return;
    }
    if (state.pendingTrackPointer && state.pendingTrackPointer.pointerId === event.pointerId) {
      state.pendingTrackPointer = null;
    }
    endSectionResize(event);
    endPanX(event);
    endScrub(event);
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const inTimelineArea = x >= LEFT_GUTTER;
    if (event.ctrlKey || event.metaKey || (inTimelineArea && !event.shiftKey && !event.altKey)) {
      const timelineWidth = Math.max(1, canvas.clientWidth - LEFT_GUTTER);
      const fallbackAnchorX = LEFT_GUTTER + timelineWidth * 0.5;
      const anchorX = x >= LEFT_GUTTER && x <= canvas.clientWidth ? x : fallbackAnchorX;
      state.autoFit = false;
      const anchorTime = state.t0Sec + (anchorX - LEFT_GUTTER) / state.pxPerSec;
      const scale = Math.exp(-event.deltaY * 0.001);
      const next = clamp(state.pxPerSec * scale, getMinPxPerSec(state), MAX_PX_PER_SEC);
      state.pxPerSec = next;
      const nextT0 = anchorTime - (anchorX - LEFT_GUTTER) / next;
      state.t0Sec = clampTimelineOffsetSec(state, nextT0);
    } else if (event.shiftKey) {
      state.autoFit = false;
      state.t0Sec = clampTimelineOffsetSec(state, state.t0Sec + event.deltaY / state.pxPerSec);
    } else {
      state.scrollY += event.deltaY;
    }
    draw(state);
  }, { passive: false });
  canvas.addEventListener("dblclick", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!isPointInSectionResizeHandle(state, canvas.clientWidth, x, y)) return;
    state.sectionHeight = DEFAULT_SECTION_HEIGHT;
    localStorage.setItem(SECTION_HEIGHT_STORAGE_KEY, String(DEFAULT_SECTION_HEIGHT));
    draw(state);
  });

  const togglePlayPause = () => {
    if (state.isPlaying) stopPlayback(state, false);
    else startPlayback(state);
  };
  const resetTemporalZoom = () => {
    state.autoFit = true;
    fitToViewport(state, { drawAfter: false });
    draw(state);
  };
  playPauseBtn.addEventListener("click", () => togglePlayPause());
  stopBtn.addEventListener("click", () => stopPlayback(state, true));
  fitBtn.addEventListener("click", () => {
    resetTemporalZoom();
    state.scrollY = 0;
  });
  zoomResetBtn.addEventListener("click", () => resetTemporalZoom());
  jumpBtn.addEventListener("click", () => {
    const stepIndex = Number(state.selection?.origin_step_index);
    if (!Number.isFinite(stepIndex) || typeof state.onJumpToStep !== "function") return;
    state.onJumpToStep(stepIndex);
  });
  sectionVizSelect.value = state.sectionVizMode;
  sectionVizSelect.addEventListener("change", () => {
    state.sectionVizMode = normalizeSectionVizMode(sectionVizSelect.value);
    localStorage.setItem(SECTION_VIZ_STORAGE_KEY, state.sectionVizMode);
    draw(state);
  });

  const isTextLikeTarget = (target) => {
    if (!target || typeof target !== "object") return false;
    const element = target;
    if (element.isContentEditable) return true;
    const tag = String(element.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };
  state.keydownHandler = (event) => {
    if (!event) return;
    if (event.defaultPrevented) return;
    if (event.repeat) return;
    if (event.key !== " " && event.code !== "Space" && event.key !== "Spacebar") return;
    if (isTextLikeTarget(event.target)) return;
    event.preventDefault();
    togglePlayPause();
  };
  window.addEventListener("keydown", state.keydownHandler);

  resize();
  fitBtn.click();
  renderOverview(state);
  TIMELINE_STATE.set(body, state);
}
