import { el } from "../dom.js";
import { setButtonIcon } from "../icons.js";

const SPECTRUM_STATE = new WeakMap();
const FREQ_BINS = 64;
const MAX_HISTORY_ROWS = 180;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compactRunId(runId) {
  const value = String(runId || "").trim();
  if (!value) return "n/a";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function ampColor(amp, ageNorm) {
  const a = clamp(Number(amp || 0), 0, 1);
  const age = clamp(Number(ageNorm || 0), 0, 1);
  const hue = Math.round(232 - a * 186);
  const sat = 72;
  const light = Math.round(26 + a * 42 - age * 8);
  const alpha = 0.22 + a * 0.42;
  return `hsla(${hue}, ${sat}%, ${clamp(light, 18, 74)}%, ${clamp(alpha, 0.12, 0.9)})`;
}

function rowStrokeColor(rowIndex, totalRows) {
  const age = totalRows > 1 ? rowIndex / (totalRows - 1) : 1;
  const hue = Math.round(230 - age * 170);
  return `hsla(${hue}, 80%, ${44 + age * 14}%, 0.82)`;
}

function pitchToBin(pitch, bins) {
  const numeric = Number(pitch);
  if (!Number.isFinite(numeric)) return Math.floor(bins * 0.35);
  return clamp(Math.round((clamp(numeric, 0, 127) / 127) * (bins - 1)), 0, bins - 1);
}

function velocityToAmp(velocity) {
  const numeric = Number(velocity);
  if (!Number.isFinite(numeric)) return 0.74;
  return 0.25 + clamp(numeric, 1, 127) / 127 * 0.75;
}

function projectPoint(state, rowIndex, freqIndex, amp, width, height, rowsCount, binsCount) {
  const padX = 22;
  const padY = 20;
  const plotW = Math.max(80, width - padX * 2);
  const plotH = Math.max(80, height - padY * 2);
  const tx = rowsCount > 1 ? rowIndex / (rowsCount - 1) : 0;
  const fy = binsCount > 1 ? freqIndex / (binsCount - 1) : 0;
  const a = clamp(amp, 0, 1);
  if (state.cameraMode === "top") {
    const x = padX + tx * plotW;
    const y = height - padY - fy * plotH - a * 8;
    return { x, y };
  }
  const isoX = padX + plotW * 0.52 + (tx - (fy - 0.5)) * plotW * 0.56;
  const isoYBase = height - padY - (tx * 0.46 + fy * 0.72) * plotH;
  const isoY = isoYBase - a * plotH * 0.46;
  return { x: isoX, y: isoY };
}

function clearHistory(state) {
  state.historyRows = [];
}

function pushHistoryRow(state, bins, timeSec) {
  const row = {
    tSec: clamp(Number(timeSec || 0), 0, Math.max(0, Number(state.durationSec || 1))),
    bins: bins.map((value) => clamp(Number(value || 0), 0, 1)),
  };
  state.historyRows.push(row);
  if (state.historyRows.length > MAX_HISTORY_ROWS) {
    state.historyRows.splice(0, state.historyRows.length - MAX_HISTORY_ROWS);
  }
}

function mergeToSpectrumBins(sourceBins, targetBins) {
  const sourceLength = sourceBins.length;
  const targetLength = targetBins.length;
  if (!sourceLength || !targetLength) return targetBins;
  const out = new Array(targetLength).fill(0);
  for (let i = 0; i < targetLength; i += 1) {
    const s0 = Math.floor((i / targetLength) * sourceLength);
    const s1 = Math.max(s0 + 1, Math.floor(((i + 1) / targetLength) * sourceLength));
    let sum = 0;
    let count = 0;
    for (let s = s0; s < s1 && s < sourceLength; s += 1) {
      sum += sourceBins[s];
      count += 1;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function buildRowFromSelectedEvents(state, timeSec) {
  const bins = new Array(FREQ_BINS).fill(0);
  const eventMap = state.studioData?.eventsByTrack || {};
  const selected = String(state.focusTrack || "__all");
  const trackEntries = Object.entries(eventMap).filter(([trackName]) =>
    selected === "__all" ? true : trackName === selected
  );
  if (!trackEntries.length) return bins;
  for (const [, events] of trackEntries) {
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const t0 = Number(event?.time || 0);
      const duration = Math.max(0.01, Number(event?.duration || 0.01));
      const t1 = t0 + duration;
      if (timeSec + 0.08 < t0 || timeSec - 0.08 > t1) continue;
      const center = pitchToBin(event?.pitch, FREQ_BINS);
      const amp = velocityToAmp(event?.velocity);
      for (let offset = -3; offset <= 3; offset += 1) {
        const idx = center + offset;
        if (idx < 0 || idx >= FREQ_BINS) continue;
        const falloff = 1 - Math.abs(offset) / 3.5;
        bins[idx] = Math.max(bins[idx], amp * falloff);
      }
    }
  }
  return bins;
}

function drawGridAndAxes(state, ctx, width, height) {
  ctx.fillStyle = "#f8efe2";
  ctx.fillRect(0, 0, width, height);
  const padX = 22;
  const padY = 20;
  const plotW = Math.max(80, width - padX * 2);
  const plotH = Math.max(80, height - padY * 2);

  ctx.fillStyle = "#eee3d2";
  ctx.fillRect(padX, padY, plotW, plotH);

  ctx.strokeStyle = "rgba(92, 70, 52, 0.24)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const x = padX + (i / 10) * plotW + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, padY);
    ctx.lineTo(x, padY + plotH);
    ctx.stroke();
  }
  for (let i = 0; i <= 8; i += 1) {
    const y = padY + (i / 8) * plotH + 0.5;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + plotW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#5f4a39";
  ctx.font = "10px monospace";
  ctx.fillText("Time", padX + 4, height - 6);
  ctx.fillText("Freq", 4, padY + 12);
  ctx.fillText(state.cameraMode === "top" ? "Top" : "Iso", width - 40, padY + 12);
}

function drawSpectrum(state) {
  const canvas = state.canvas;
  const ctx = state.ctx;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  drawGridAndAxes(state, ctx, width, height);

  const rows = state.historyRows;
  if (!rows.length) {
    ctx.fillStyle = "#6b5a4a";
    ctx.font = "11px monospace";
    ctx.fillText("Press Play to generate 3D spectrum.", 28, height - 12);
    return;
  }
  const rowsCount = rows.length;
  const binsCount = rows[0].bins.length || FREQ_BINS;
  const rowStep = rowsCount > 120 ? 2 : 1;
  const freqStep = 2;

  for (let r = rowStep; r < rowsCount; r += rowStep) {
    const prev = rows[r - rowStep].bins;
    const cur = rows[r].bins;
    for (let f = freqStep; f < binsCount; f += freqStep) {
      const p00 = projectPoint(state, r - rowStep, f - freqStep, prev[f - freqStep], width, height, rowsCount, binsCount);
      const p01 = projectPoint(state, r - rowStep, f, prev[f], width, height, rowsCount, binsCount);
      const p10 = projectPoint(state, r, f - freqStep, cur[f - freqStep], width, height, rowsCount, binsCount);
      const p11 = projectPoint(state, r, f, cur[f], width, height, rowsCount, binsCount);
      const amp = (prev[f - freqStep] + prev[f] + cur[f - freqStep] + cur[f]) * 0.25;
      const age = r / Math.max(1, rowsCount - 1);
      ctx.fillStyle = ampColor(amp, age);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  for (let r = 0; r < rowsCount; r += rowStep) {
    const row = rows[r].bins;
    ctx.strokeStyle = rowStrokeColor(r, rowsCount);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let first = true;
    for (let f = 0; f < binsCount; f += 1) {
      const p = projectPoint(state, r, f, row[f], width, height, rowsCount, binsCount);
      if (first) {
        ctx.moveTo(p.x, p.y);
        first = false;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }

  for (let f = 0; f < binsCount; f += 6) {
    ctx.strokeStyle = "rgba(62, 46, 32, 0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r < rowsCount; r += rowStep) {
      const p = projectPoint(state, r, f, rows[r].bins[f], width, height, rowsCount, binsCount);
      if (r === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  const playRow = Math.round(
    clamp(state.playheadSec / Math.max(0.001, state.durationSec), 0, 1) * Math.max(0, rowsCount - 1)
  );
  if (rows[playRow]) {
    const highlight = rows[playRow].bins;
    ctx.strokeStyle = "rgba(18, 14, 10, 0.92)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let f = 0; f < binsCount; f += 1) {
      const p = projectPoint(state, playRow, f, highlight[f], width, height, rowsCount, binsCount);
      if (f === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function updateStatus(state) {
  const runText = compactRunId(state.runData?.run_id);
  const modeText = state.cameraMode === "top" ? "top view" : "isometric view";
  const focusText = state.focusTrack === "__all" ? "all tracks" : compactRunId(state.focusTrack);
  const playText = state.isPlaying ? "playing" : "paused";
  state.statusLabel.textContent = `${playText} · ${state.playheadSec.toFixed(2)}s · ${modeText} · ${focusText} · run ${runText}`;
}

function updatePlayButton(state) {
  setButtonIcon(state.playPauseBtn, {
    icon: state.isPlaying ? "pause" : "play",
    title: state.isPlaying ? "Pause" : "Play",
  });
}

function stopAnimation(state) {
  state.isPlaying = false;
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  if (state.audio) {
    try {
      state.audio.pause();
    } catch {}
  }
  updatePlayButton(state);
  updateStatus(state);
  drawSpectrum(state);
}

function teardownAudio(state) {
  if (state.audioSourceNode) {
    try {
      state.audioSourceNode.disconnect();
    } catch {}
    state.audioSourceNode = null;
  }
  if (state.analyserNode) {
    try {
      state.analyserNode.disconnect();
    } catch {}
    state.analyserNode = null;
  }
  if (state.audio) {
    try {
      state.audio.pause();
    } catch {}
    try {
      state.audio.src = "";
      state.audio.load();
    } catch {}
    state.audio = null;
  }
  if (state.audioContext) {
    try {
      state.audioContext.close();
    } catch {}
    state.audioContext = null;
  }
  state.analyserData = null;
}

async function setupAudio(state, onResolveAudioUrl) {
  if (typeof Audio !== "function") return false;
  const urlCandidates = [
    onResolveAudioUrl?.("mix"),
    onResolveAudioUrl?.("__source_audio"),
    onResolveAudioUrl?.("source_audio"),
  ];
  const resolvedUrl = urlCandidates.map((value) => String(value || "").trim()).find(Boolean) || "";
  if (!resolvedUrl) return false;

  const AudioContextCtor =
    typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AudioContextCtor) return false;

  const audio = new Audio();
  audio.preload = "auto";
  audio.src = resolvedUrl;
  audio.crossOrigin = "anonymous";

  const ctx = new AudioContextCtor();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.62;
  const sourceNode = ctx.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(ctx.destination);

  state.audio = audio;
  state.audioContext = ctx;
  state.audioSourceNode = sourceNode;
  state.analyserNode = analyser;
  state.analyserData = new Uint8Array(analyser.frequencyBinCount);
  state.audioReady = false;
  audio.addEventListener("loadedmetadata", () => {
    const duration = Number(audio.duration || 0);
    if (Number.isFinite(duration) && duration > 0) {
      state.durationSec = duration;
    }
    state.audioReady = true;
    updateStatus(state);
  });
  audio.addEventListener("ended", () => {
    stopAnimation(state);
    state.playheadSec = 0;
    updateStatus(state);
    drawSpectrum(state);
  });
  try {
    audio.load();
  } catch {}
  return true;
}

function readAnalyserRow(state) {
  if (!state.analyserNode || !state.analyserData) return null;
  state.analyserNode.getByteFrequencyData(state.analyserData);
  const normalized = new Array(state.analyserData.length);
  for (let i = 0; i < state.analyserData.length; i += 1) {
    normalized[i] = state.analyserData[i] / 255;
  }
  return mergeToSpectrumBins(normalized, new Array(FREQ_BINS).fill(0));
}

function nextFallbackRow(state) {
  return buildRowFromSelectedEvents(state, state.playheadSec);
}

function animate(state, tsMs) {
  if (!state.isPlaying) return;
  const now = Number(tsMs || nowMs());
  if (state.lastTickMs == null) state.lastTickMs = now;
  const deltaSec = Math.max(0, (now - state.lastTickMs) / 1000);
  state.lastTickMs = now;

  if (state.audio) {
    state.playheadSec = clamp(Number(state.audio.currentTime || 0), 0, state.durationSec);
  } else {
    state.playheadSec = clamp(state.playheadSec + deltaSec, 0, state.durationSec);
    if (state.playheadSec >= state.durationSec) {
      stopAnimation(state);
      updateStatus(state);
      drawSpectrum(state);
      return;
    }
  }

  const row = readAnalyserRow(state) || nextFallbackRow(state);
  pushHistoryRow(state, row, state.playheadSec);
  updateStatus(state);
  drawSpectrum(state);
  state.rafId = requestAnimationFrame((next) => animate(state, next));
}

async function togglePlayPause(state) {
  if (state.isPlaying) {
    stopAnimation(state);
    return;
  }
  state.isPlaying = true;
  state.lastTickMs = null;
  if (state.audio && state.audioContext) {
    if (state.audioContext.state === "suspended") {
      try {
        await state.audioContext.resume();
      } catch {}
    }
    try {
      state.audio.currentTime = clamp(state.playheadSec, 0, state.durationSec);
    } catch {}
    try {
      const result = state.audio.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {}
  }
  updatePlayButton(state);
  updateStatus(state);
  state.rafId = requestAnimationFrame((next) => animate(state, next));
}

function resetPlayback(state) {
  stopAnimation(state);
  state.playheadSec = 0;
  clearHistory(state);
  if (state.audio) {
    try {
      state.audio.currentTime = 0;
    } catch {}
  }
  updateStatus(state);
  drawSpectrum(state);
}

export function clearSong2DawSpectrum3D(body) {
  const state = SPECTRUM_STATE.get(body);
  if (!state) return;
  stopAnimation(state);
  if (state.resizeObserver) {
    try {
      state.resizeObserver.disconnect();
    } catch {}
  }
  teardownAudio(state);
  SPECTRUM_STATE.delete(body);
}

export async function renderSong2DawSpectrum3D({
  runData,
  studioData,
  body,
  onResolveAudioUrl,
}) {
  clearSong2DawSpectrum3D(body);
  body.innerHTML = "";

  const toolbar = el("div", { class: "lemouf-song2daw-studio-toolbar" });
  const controls = el("div", { class: "lemouf-song2daw-studio-toolbar-group" });
  const camera = el("div", { class: "lemouf-song2daw-studio-toolbar-group" });
  const playPauseBtn = el("button", { class: "lemouf-loop-btn icon", type: "button" });
  const stopBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  setButtonIcon(playPauseBtn, { icon: "play", title: "Play" });
  setButtonIcon(stopBtn, { icon: "stop", title: "Stop" });
  controls.append(playPauseBtn, stopBtn);

  const cameraSelect = el("select", { class: "lemouf-loop-select lemouf-song2daw-viz-select" });
  cameraSelect.append(
    el("option", { value: "iso", text: "Camera: Iso" }),
    el("option", { value: "top", text: "Camera: Top" })
  );
  const focusTrackSelect = el("select", { class: "lemouf-loop-select lemouf-song2daw-viz-select" });
  focusTrackSelect.append(el("option", { value: "__all", text: "Focus: All tracks" }));
  const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
  for (const track of tracks) {
    const name = String(track?.name || "").trim();
    if (!name) continue;
    focusTrackSelect.append(el("option", { value: name, text: `Focus: ${name}` }));
  }
  camera.append(cameraSelect, focusTrackSelect);
  const statusLabel = el("div", { class: "lemouf-song2daw-studio-toolbar-status", text: "paused" });
  toolbar.append(controls, camera, statusLabel);

  const layout = el("div", { class: "lemouf-song2daw-studio-layout" });
  const canvasWrap = el("div", { class: "lemouf-song2daw-spectrum-canvas-wrap" });
  const canvas = el("canvas", { class: "lemouf-song2daw-spectrum-canvas" });
  canvasWrap.appendChild(canvas);
  layout.appendChild(canvasWrap);
  body.append(toolbar, layout);

  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  const state = {
    runData,
    studioData,
    canvas,
    ctx,
    statusLabel,
    playPauseBtn,
    durationSec: Math.max(1, Number(studioData?.durationSec || 1)),
    playheadSec: 0,
    isPlaying: false,
    rafId: 0,
    lastTickMs: null,
    historyRows: [],
    cameraMode: "iso",
    focusTrack: "__all",
    audio: null,
    audioReady: false,
    audioContext: null,
    audioSourceNode: null,
    analyserNode: null,
    analyserData: null,
    resizeObserver: null,
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSpectrum(state);
  };
  if (typeof ResizeObserver === "function") {
    state.resizeObserver = new ResizeObserver(() => resize());
    state.resizeObserver.observe(canvasWrap);
  }

  playPauseBtn.addEventListener("click", () => {
    void togglePlayPause(state);
  });
  stopBtn.addEventListener("click", () => {
    resetPlayback(state);
  });
  cameraSelect.addEventListener("change", () => {
    state.cameraMode = String(cameraSelect.value || "iso") === "top" ? "top" : "iso";
    drawSpectrum(state);
    updateStatus(state);
  });
  focusTrackSelect.addEventListener("change", () => {
    state.focusTrack = String(focusTrackSelect.value || "__all");
    if (!state.audio) {
      clearHistory(state);
      drawSpectrum(state);
    }
    updateStatus(state);
  });

  await setupAudio(state, onResolveAudioUrl);
  updatePlayButton(state);
  updateStatus(state);
  resize();
  SPECTRUM_STATE.set(body, state);
}
