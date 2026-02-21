import { el } from "../../shared/ui/dom.js";
import { createIcon, setButtonIcon } from "../../shared/ui/icons.js";
import { api } from "/scripts/api.js";
import { clearStudioTimeline, prewarmTimelineVideoBuffers, renderStudioTimeline } from "../studio_engine/timeline.js";
import {
  applyCompositionScopeSnapshot as applyCompositionScopeSnapshotInStore,
  appendManualResources as appendManualResourcesInStore,
  clearManualResources as clearManualResourcesInStore,
  getCompositionScopeSnapshot as getCompositionScopeSnapshotInStore,
  getCompositionLayoutState as getCompositionLayoutStateInStore,
  getManualResources as getManualResourcesInStore,
  getPlacementMap as getPlacementMapInStore,
  getTrackLocks as getTrackLocksInStore,
  getTimelineViewState,
  scopeKeyFromDetail as scopeKeyFromDetailInStore,
  setCompositionLayoutState as setCompositionLayoutStateInStore,
  setTrackLocks as setTrackLocksInStore,
  setTimelineViewState,
} from "./state_store.js";

let manualResourceSeq = 1;
const VIDEO_HOVER_PREVIEW_DELAY_MS = 1000;
const VIDEO_POSTER_SEEK_SEC = 0.04;
const PLACEMENT_SEGMENT_PREFIX = "::seg";
const PLACEMENT_CLIP_PREFIX = "::clip::";
const MEDIA_METADATA_CACHE = new Map();
const MEDIA_METADATA_PROBE_PENDING_BY_SCOPE = new Map();
const COMPOSITION_PREVIEW_CACHE_BY_SCOPE = new Map();
const COMPOSITION_LAYOUT_STATE_BY_SCOPE = new Map();
const VIDEO_POSTER_TARGET_HEIGHT = 192;
const VIDEO_POSTER_MIN_HEIGHT = 112;
const VIDEO_POSTER_MAX_DPR = 1.75;
const PREVIEW_CACHE_RENDER_THROTTLE_MS = 60;
const VIDEO_PREWARM_DEBOUNCE_MS = 90;
const VIDEO_PREWARM_MAX_SOURCES = 24;
const PREVIEW_CACHE_MAX_POSTERS = 120;
const PREVIEW_CACHE_MAX_TIMELINE_ENTRIES = 420;
const IMAGE_VIRTUAL_SOURCE_DURATION_SEC = 21_600;
const COMPOSITION_SPLIT_MIN_PERCENT = 28;
const COMPOSITION_SPLIT_MAX_PERCENT = 72;
const COMPOSITION_ROW_SPLIT_MIN_PERCENT = 24;
const COMPOSITION_ROW_SPLIT_MAX_PERCENT = 76;
const COMPOSITION_HISTORY_LIMIT = 120;
const COMPOSITION_HISTORY_BY_SCOPE = new Map();
const COMPOSITION_DROPZONE_TOP_TRACK = "__dropzone_top__";
const COMPOSITION_DROPZONE_BOTTOM_TRACK = "__dropzone_bottom__";
let ACTIVE_RESOURCE_HOVER_PREVIEW_STOP = null;
let RESOURCE_HOVER_PREVIEW_GUARDS_READY = false;

function stopActiveResourceHoverPreview(exceptStop = null) {
  const activeStop = typeof ACTIVE_RESOURCE_HOVER_PREVIEW_STOP === "function"
    ? ACTIVE_RESOURCE_HOVER_PREVIEW_STOP
    : null;
  if (!activeStop) return;
  if (exceptStop && activeStop === exceptStop) return;
  try {
    activeStop();
  } catch {}
  if (ACTIVE_RESOURCE_HOVER_PREVIEW_STOP === activeStop) {
    ACTIVE_RESOURCE_HOVER_PREVIEW_STOP = null;
  }
}

function setActiveResourceHoverPreviewStop(stopFn) {
  if (typeof stopFn !== "function") {
    if (ACTIVE_RESOURCE_HOVER_PREVIEW_STOP === stopFn) {
      ACTIVE_RESOURCE_HOVER_PREVIEW_STOP = null;
    }
    return;
  }
  stopActiveResourceHoverPreview(stopFn);
  ACTIVE_RESOURCE_HOVER_PREVIEW_STOP = stopFn;
}

function clearActiveResourceHoverPreviewStop(stopFn) {
  if (typeof stopFn !== "function") return;
  if (ACTIVE_RESOURCE_HOVER_PREVIEW_STOP === stopFn) {
    ACTIVE_RESOURCE_HOVER_PREVIEW_STOP = null;
  }
}

function ensureResourceHoverPreviewGuards() {
  if (RESOURCE_HOVER_PREVIEW_GUARDS_READY || typeof document === "undefined") return;
  RESOURCE_HOVER_PREVIEW_GUARDS_READY = true;
  const stopNow = () => stopActiveResourceHoverPreview();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") stopNow();
  });
  window.addEventListener("blur", stopNow);
  window.addEventListener("beforeunload", stopNow);
  document.addEventListener("pointerdown", stopNow, true);
  document.addEventListener("pointerup", stopNow, true);
  document.addEventListener("wheel", stopNow, { passive: true, capture: true });
  document.addEventListener("scroll", stopNow, { passive: true, capture: true });
  document.addEventListener("dragstart", stopNow, true);
  document.addEventListener("drop", stopNow, true);
}

function normalizeCompositionLayoutState(state = {}) {
  const splitPercent = clamp(
    toNumber(state?.splitPercent, 50),
    COMPOSITION_SPLIT_MIN_PERCENT,
    COMPOSITION_SPLIT_MAX_PERCENT
  );
  const rowSplitPercent = clamp(
    toNumber(state?.rowSplitPercent, 50),
    COMPOSITION_ROW_SPLIT_MIN_PERCENT,
    COMPOSITION_ROW_SPLIT_MAX_PERCENT
  );
  const sizeModeRaw = String(state?.sizeMode || "large").toLowerCase();
  const sizeMode = sizeModeRaw === "small" ? "small" : "large";
  const viewModeRaw = String(state?.viewMode || "thumb").toLowerCase();
  const viewMode = viewModeRaw === "list" ? "list" : "thumb";
  return { splitPercent, rowSplitPercent, sizeMode, viewMode };
}

function getCompositionLayoutState(scopeKey) {
  const key = String(scopeKey || "default").trim() || "default";
  if (!COMPOSITION_LAYOUT_STATE_BY_SCOPE.has(key)) {
    const stored = getCompositionLayoutStateInStore(key);
    COMPOSITION_LAYOUT_STATE_BY_SCOPE.set(key, normalizeCompositionLayoutState(stored || {}));
  }
  return COMPOSITION_LAYOUT_STATE_BY_SCOPE.get(key);
}

function persistCompositionLayoutState(scopeKey, state) {
  const normalized = normalizeCompositionLayoutState(state || {});
  setCompositionLayoutStateInStore(scopeKey, normalized);
}

function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function compositionSnapshotSignature(snapshot) {
  try {
    return JSON.stringify(snapshot || null);
  } catch {
    return "";
  }
}

function getCompositionHistoryState(scopeKey) {
  const key = String(scopeKey || "default").trim() || "default";
  if (!COMPOSITION_HISTORY_BY_SCOPE.has(key)) {
    COMPOSITION_HISTORY_BY_SCOPE.set(key, {
      undo: [],
      redo: [],
      applying: false,
    });
  }
  return COMPOSITION_HISTORY_BY_SCOPE.get(key);
}

function createCompositionHistoryEntry(snapshot) {
  const cloned = cloneJsonSafe(snapshot, null);
  return {
    snapshot: cloned,
    signature: compositionSnapshotSignature(cloned),
  };
}

function trimCompositionHistoryEntries(entries) {
  if (!Array.isArray(entries)) return;
  while (entries.length > COMPOSITION_HISTORY_LIMIT) {
    entries.shift();
  }
}

function registerCompositionHistoryMutation(scopeKey, beforeSnapshot, afterSnapshot) {
  const history = getCompositionHistoryState(scopeKey);
  if (history.applying) return false;
  const beforeEntry = createCompositionHistoryEntry(beforeSnapshot);
  const afterEntry = createCompositionHistoryEntry(afterSnapshot);
  if (!beforeEntry.signature || beforeEntry.signature === afterEntry.signature) return false;
  const lastUndo = history.undo.length ? history.undo[history.undo.length - 1] : null;
  if (!lastUndo || lastUndo.signature !== beforeEntry.signature) {
    history.undo.push(beforeEntry);
    trimCompositionHistoryEntries(history.undo);
  }
  history.redo = [];
  return true;
}

function withCompositionHistory(scopeKey, mutate) {
  const beforeSnapshot = getCompositionScopeSnapshotInStore(scopeKey);
  const changed = typeof mutate === "function" ? Boolean(mutate()) : false;
  if (!changed) return false;
  const afterSnapshot = getCompositionScopeSnapshotInStore(scopeKey);
  registerCompositionHistoryMutation(scopeKey, beforeSnapshot, afterSnapshot);
  return true;
}

function undoCompositionHistory(scopeKey) {
  const history = getCompositionHistoryState(scopeKey);
  if (history.applying || !history.undo.length) return false;
  const target = history.undo.pop();
  if (!target || !target.signature) return false;
  const current = createCompositionHistoryEntry(getCompositionScopeSnapshotInStore(scopeKey));
  if (current.signature) {
    history.redo.push(current);
    trimCompositionHistoryEntries(history.redo);
  }
  history.applying = true;
  try {
    applyCompositionScopeSnapshotInStore(scopeKey, target.snapshot);
  } finally {
    history.applying = false;
  }
  return true;
}

function redoCompositionHistory(scopeKey) {
  const history = getCompositionHistoryState(scopeKey);
  if (history.applying || !history.redo.length) return false;
  const target = history.redo.pop();
  if (!target || !target.signature) return false;
  const current = createCompositionHistoryEntry(getCompositionScopeSnapshotInStore(scopeKey));
  if (current.signature) {
    history.undo.push(current);
    trimCompositionHistoryEntries(history.undo);
  }
  history.applying = true;
  try {
    applyCompositionScopeSnapshotInStore(scopeKey, target.snapshot);
  } finally {
    history.applying = false;
  }
  return true;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildComfyViewUrl(asset, { preview = false } = {}) {
  if (!asset || typeof asset !== "object") return "";
  const filename = String(asset.filename || "").trim();
  if (!filename) return "";
  const params = new URLSearchParams();
  params.set("filename", filename);
  const type = String(asset.type || "").trim();
  const subfolder = String(asset.subfolder || "").trim();
  if (type) params.set("type", type);
  if (subfolder) params.set("subfolder", subfolder);
  if (preview) params.set("preview", "webp;90");
  return `/view?${params.toString()}`;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function safeJsonResponse(res) {
  if (!res) return null;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseRateToNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.includes("/")) {
    const [nRaw, dRaw] = text.split("/", 2);
    const n = Number(nRaw);
    const d = Number(dRaw);
    if (Number.isFinite(n) && Number.isFinite(d) && Math.abs(d) > 1e-9) {
      const out = n / d;
      return Number.isFinite(out) ? out : null;
    }
  }
  return toFiniteNumber(text);
}

function toReadableBytes(value) {
  const bytes = toFiniteNumber(value);
  if (bytes == null || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let num = bytes;
  let idx = 0;
  while (num >= 1024 && idx < units.length - 1) {
    num /= 1024;
    idx += 1;
  }
  const decimals = idx === 0 ? 0 : (num >= 10 ? 1 : 2);
  return `${num.toFixed(decimals)} ${units[idx]}`;
}

function formatClipDuration(valueSec) {
  const sec = toFiniteNumber(valueSec);
  if (sec == null || sec <= 0) return "";
  if (sec < 10) return `${sec.toFixed(1)}s`;
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec - minutes * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function inferVideoHasAudio(meta = {}) {
  const hasAudioKeys = ["has_audio", "contains_audio", "with_audio"];
  for (const key of hasAudioKeys) {
    if (typeof meta?.[key] === "boolean") return meta[key];
  }
  const numericAudioHints = ["audio_tracks", "audio_streams", "audio_channels", "channels"];
  for (const key of numericAudioHints) {
    const count = toFiniteNumber(meta?.[key]);
    if (count != null && count > 0) return true;
  }
  const codecHints = ["audio_codec", "audio_format"];
  for (const key of codecHints) {
    if (String(meta?.[key] || "").trim()) return true;
  }
  const streams = Array.isArray(meta?.streams) ? meta.streams : [];
  if (streams.some((stream) => String(stream?.codec_type || stream?.type || "").toLowerCase() === "audio")) {
    return true;
  }
  return null;
}

function collectAssetMeta(asset = {}, fileMeta = null) {
  const fpsParsed =
    parseRateToNumber(asset?.fps) ??
    parseRateToNumber(asset?.frame_rate);
  const durationFromFrames = (() => {
    const frames =
      toFiniteNumber(asset?.frame_count) ??
      toFiniteNumber(asset?.frames) ??
      toFiniteNumber(asset?.num_frames);
    if (frames == null || fpsParsed == null || fpsParsed <= 0) return null;
    return frames / fpsParsed;
  })();
  const durationFromMs = (() => {
    const ms =
      toFiniteNumber(asset?.duration_ms) ??
      toFiniteNumber(asset?.duration_msec) ??
      toFiniteNumber(asset?.duration_milliseconds) ??
      toFiniteNumber(asset?.length_ms);
    if (ms == null) return null;
    return ms / 1000;
  })();
  const meta = {
    filename: String(asset?.filename || fileMeta?.name || "").trim(),
    mime: String(asset?.mime || asset?.content_type || fileMeta?.mime || "").trim(),
    sizeBytes:
      toFiniteNumber(asset?.size) ??
      toFiniteNumber(asset?.file_size) ??
      toFiniteNumber(asset?.filesize) ??
      toFiniteNumber(fileMeta?.size),
    durationSec:
      toFiniteNumber(asset?.duration) ??
      toFiniteNumber(asset?.duration_s) ??
      toFiniteNumber(asset?.duration_sec) ??
      toFiniteNumber(asset?.duration_seconds) ??
      toFiniteNumber(asset?.length_sec) ??
      toFiniteNumber(asset?.media_duration_sec) ??
      durationFromMs ??
      durationFromFrames,
    fps: fpsParsed,
    width: toFiniteNumber(asset?.width),
    height: toFiniteNumber(asset?.height),
    sampleRate:
      toFiniteNumber(asset?.sample_rate) ??
      toFiniteNumber(asset?.samplerate) ??
      toFiniteNumber(asset?.audio_sample_rate),
    channels:
      toFiniteNumber(asset?.channels) ??
      toFiniteNumber(asset?.audio_channels),
    bitrate:
      toFiniteNumber(asset?.bitrate) ??
      toFiniteNumber(asset?.audio_bitrate) ??
      toFiniteNumber(asset?.video_bitrate),
  };
  return meta;
}

function buildResourceTooltip(resource) {
  const lines = [];
  const kind = String(resource?.kind || "resource").toUpperCase();
  const source = String(resource?.source || "pipeline");
  if (resource?.kind === "video") {
    const state = resource?.videoAudioState || "unknown";
    const audioLabel = state === "with_audio" ? "with audio" : (state === "no_audio" ? "silent" : "audio unknown");
    lines.push(`Type: ${kind} (${audioLabel})`);
  } else {
    lines.push(`Type: ${kind}`);
  }
  lines.push(`Source: ${source}`);
  if (resource?.cycle >= 0) lines.push(`Cycle: ${Number(resource.cycle) + 1}`);
  lines.push(`Retry: r${Number(resource?.retry || 0)}`);
  if (resource?.label) lines.push(`Label: ${resource.label}`);

  const meta = resource?.meta || {};
  if (meta.filename) lines.push(`File: ${meta.filename}`);
  if (meta.mime) lines.push(`MIME: ${meta.mime}`);
  if (meta.width && meta.height) lines.push(`Resolution: ${meta.width}x${meta.height}`);
  if (meta.durationSec != null) lines.push(`Duration: ${meta.durationSec.toFixed(2)} s`);
  if (meta.fps != null) lines.push(`FPS: ${meta.fps}`);
  if (meta.sampleRate != null) lines.push(`Sample rate: ${meta.sampleRate} Hz`);
  if (meta.channels != null) lines.push(`Channels: ${meta.channels}`);
  if (meta.bitrate != null) lines.push(`Bitrate: ${Math.round(meta.bitrate)} bps`);
  const sizeText = toReadableBytes(meta.sizeBytes);
  if (sizeText) lines.push(`Size: ${sizeText}`);
  return lines.join("\n");
}

function entryIsApproved(entry) {
  const decision = String(entry?.decision || "").toLowerCase();
  const status = String(entry?.status || "").toLowerCase();
  return (
    decision === "approve" ||
    decision === "approved" ||
    status === "approve" ||
    status === "approved"
  );
}

function extractMediaOutputs(entry) {
  const outputs = entry?.outputs && typeof entry.outputs === "object" ? entry.outputs : {};
  const images = Array.isArray(outputs.images) ? outputs.images : [];
  const audios = Array.isArray(outputs.audio)
    ? outputs.audio
    : (Array.isArray(outputs.audios) ? outputs.audios : []);
  const videos = Array.isArray(outputs.video)
    ? outputs.video
    : (Array.isArray(outputs.videos) ? outputs.videos : []);
  return { images, audios, videos };
}

function scopeKeyFromDetail(detail) {
  return scopeKeyFromDetailInStore(detail);
}

function hasScopeSnapshotData(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const manualCount = Array.isArray(snapshot.manualResources) ? snapshot.manualResources.length : 0;
  const placementCount = Array.isArray(snapshot.placements) ? snapshot.placements.length : 0;
  return manualCount > 0 || placementCount > 0;
}

function normalizeScopeAlias(value) {
  const alias = String(value || "").trim();
  return alias || "";
}

function collectCompositionScopeAliases(detail, scopeKey) {
  const aliases = new Set();
  const primary = normalizeScopeAlias(scopeKey);
  const pushAlias = (value) => {
    const alias = normalizeScopeAlias(value);
    if (!alias || alias === primary) return;
    aliases.add(alias);
  };
  const explicit = Array.isArray(detail?.composition_scope_aliases)
    ? detail.composition_scope_aliases
    : [];
  for (const alias of explicit) pushAlias(alias);

  const loopCandidates = [
    detail?.loop_id,
    detail?.id,
    detail?.runtime_state?.loopId,
    detail?.runtime_state?.loop_id,
  ];
  for (const candidate of loopCandidates) {
    const text = String(candidate || "").trim();
    if (!text) continue;
    pushAlias(text);
  }

  const workflowCandidates = [
    detail?.workflow,
    detail?.workflow_name,
    detail?.pipeline_workflow,
    detail?.runtime_state?.workflowName,
  ];
  for (const candidate of workflowCandidates) {
    const text = String(candidate || "").trim();
    if (!text) continue;
    pushAlias(`composition:${text}`);
  }
  pushAlias("composition:manual");
  return Array.from(aliases.values());
}

function hydrateScopeFromAliasesIfNeeded(scopeKey, aliases = []) {
  const primary = normalizeScopeAlias(scopeKey);
  if (!primary) return false;
  const current = getCompositionScopeSnapshotInStore(primary);
  if (hasScopeSnapshotData(current)) return false;
  const list = Array.isArray(aliases) ? aliases : [];
  for (const aliasRaw of list) {
    const alias = normalizeScopeAlias(aliasRaw);
    if (!alias || alias === primary) continue;
    const candidate = getCompositionScopeSnapshotInStore(alias);
    if (!hasScopeSnapshotData(candidate)) continue;
    applyCompositionScopeSnapshotInStore(primary, candidate);
    return true;
  }
  return false;
}

function getTrackLocks(scopeKey) {
  return getTrackLocksInStore(scopeKey);
}

function setTrackLocks(scopeKey, values) {
  setTrackLocksInStore(scopeKey, values);
}

function getManualResources(scopeKey) {
  return getManualResourcesInStore(scopeKey);
}

function revokeManualResources(resources) {
  for (const resource of resources || []) {
    const src = String(resource?.src || "");
    if (src.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(src);
      } catch {}
    }
  }
}

function clearManualResources(scopeKey) {
  const rows = getManualResources(scopeKey);
  revokeManualResources(rows);
  clearManualResourcesInStore(scopeKey);
}

function detectKindFromFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const name = String(file?.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const imageExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
  const audioExt = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
  const videoExt = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi"]);
  if (imageExt.has(ext)) return "image";
  if (audioExt.has(ext)) return "audio";
  if (videoExt.has(ext)) return "video";
  return "";
}

function parseCycleRetryFromName(fileName) {
  const text = String(fileName || "");
  const match = text.match(/cycle_(\d+)_r(\d+)/i);
  if (!match) return null;
  const cycle = toFiniteNumber(match[1]);
  const retry = toFiniteNumber(match[2]);
  if (cycle == null || retry == null) return null;
  return {
    cycle: Math.max(0, Math.round(cycle)),
    retry: Math.max(0, Math.round(retry)),
  };
}

function createManualResource(file, kind, options = {}) {
  const safeKind = String(kind || "image").toLowerCase();
  const cachedSrc = String(options?.cachedAsset?.src || "").trim();
  const src = cachedSrc || URL.createObjectURL(file);
  const fileName = String(file?.name || `${safeKind} asset`).trim();
  const id = `manual:${safeKind}:${manualResourceSeq}`;
  const fileMeta = {
    name: fileName,
    size: toFiniteNumber(file?.size),
    mime: String(file?.type || "").trim(),
  };
  const baseMeta = collectAssetMeta(options?.cachedAsset || {}, fileMeta);
  const manualVideoAudioState = safeKind === "video" ? null : (safeKind === "audio" ? "with_audio" : "unknown");
  const cycle = toFiniteNumber(options?.cycle);
  const retry = toFiniteNumber(options?.retry);
  const sectionId = String(options?.sectionId || "manual");
  const sectionOrder = toFiniteNumber(options?.sectionOrder) ?? 1_000_000;
  const sectionLabel = String(options?.sectionLabel || "Manual");
  const baseLabel = String(options?.label || fileName).trim() || fileName;
  manualResourceSeq += 1;
  return {
    id,
    kind: safeKind,
    cycle: cycle == null ? -1 : Math.max(0, Math.round(cycle)),
    retry: retry == null ? 0 : Math.max(0, Math.round(retry)),
    index: manualResourceSeq,
    source: String(options?.source || "manual"),
    sectionId,
    sectionOrder,
    sectionLabel,
    src,
    previewSrc: safeKind === "image" ? String(options?.cachedAsset?.previewSrc || src) : "",
    label: baseLabel,
    meta: baseMeta,
    videoAudioState: manualVideoAudioState,
  };
}

async function cacheManualFileOnBackend(file, { loopId = "", scopeKey = "" } = {}) {
  if (!file || typeof FormData === "undefined") return null;
  const body = new FormData();
  body.append("file", file, String(file?.name || "resource.bin"));
  const idHint = String(loopId || scopeKey || "default").trim();
  if (idHint) body.append("loop_id", idHint);
  try {
    const res = await api.fetchApi("/lemouf/loop/media_cache", { method: "POST", body });
    const payload = await safeJsonResponse(res);
    if (!res?.ok || !payload?.ok || !payload?.asset?.src) return null;
    return payload.asset;
  } catch {
    return null;
  }
}

async function createManualResourceWithBackendCache(file, kind, options = {}) {
  const cachedAsset = await cacheManualFileOnBackend(file, {
    loopId: options?.loopId,
    scopeKey: options?.scopeKey,
  });
  return createManualResource(file, kind, { ...options, cachedAsset });
}

function mediaMetadataCacheKey(resource) {
  const kind = String(resource?.kind || "").toLowerCase();
  const src = String(resource?.src || "").trim();
  if (!src || (kind !== "audio" && kind !== "video")) return "";
  return `${kind}:${normalizeMediaSrcForCompare(src)}`;
}

function shouldProbeMediaMetadata(resource) {
  const kind = String(resource?.kind || "").toLowerCase();
  if ((kind !== "audio" && kind !== "video") || !String(resource?.src || "").trim()) return false;
  const durationSec = toFiniteNumber(resource?.meta?.durationSec);
  if (durationSec == null || durationSec <= 0.05) return true;
  if (kind === "video") {
    const state = String(resource?.videoAudioState || "").toLowerCase();
    if (state !== "with_audio" && state !== "no_audio") return true;
  }
  return false;
}

function applyMediaMetadataToResource(resource, metadata) {
  if (!resource || typeof resource !== "object") return false;
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  if (!resource.meta || typeof resource.meta !== "object") resource.meta = {};
  let changed = false;
  const assignNumeric = (key) => {
    const next = toFiniteNumber(meta?.[key]);
    if (next == null || !(next > 0)) return;
    const prev = toFiniteNumber(resource.meta?.[key]);
    if (prev == null || Math.abs(prev - next) > 1e-6) {
      resource.meta[key] = next;
      changed = true;
    }
  };
  assignNumeric("durationSec");
  assignNumeric("width");
  assignNumeric("height");
  if (String(resource?.kind || "").toLowerCase() === "video") {
    const nextState = String(meta?.videoAudioState || "").toLowerCase();
    if (nextState === "with_audio" || nextState === "no_audio") {
      if (String(resource.videoAudioState || "").toLowerCase() !== nextState) {
        resource.videoAudioState = nextState;
        changed = true;
      }
    }
  }
  return changed;
}

function probeMediaMetadata(resource) {
  if (!shouldProbeMediaMetadata(resource)) return Promise.resolve(false);
  const cacheKey = mediaMetadataCacheKey(resource);
  if (!cacheKey) return Promise.resolve(false);
  const cached = MEDIA_METADATA_CACHE.get(cacheKey);
  if (cached && cached.done) {
    return Promise.resolve(applyMediaMetadataToResource(resource, cached.data));
  }
  if (cached && cached.promise) {
    return cached.promise.then((data) => applyMediaMetadataToResource(resource, data));
  }

  const kind = String(resource?.kind || "").toLowerCase();
  const src = String(resource?.src || "");
  const promise = new Promise((resolve) => {
    const media = document.createElement(kind === "video" ? "video" : "audio");
    media.preload = "metadata";
    media.muted = true;
    media.playsInline = true;
    let done = false;
    const out = {};
    const finish = () => {
      if (done) return;
      done = true;
      try {
        media.removeAttribute("src");
        media.load?.();
      } catch {}
      resolve(out);
    };
    const detectVideoAudioState = async () => {
      if (kind !== "video") return null;
      let hasAudio = null;
      if (typeof media.mozHasAudio === "boolean") {
        hasAudio = media.mozHasAudio ? true : false;
      }
      if (
        hasAudio !== true &&
        media.audioTracks &&
        typeof media.audioTracks.length === "number" &&
        media.audioTracks.length > 0
      ) {
        hasAudio = true;
      }
      if (hasAudio !== true) {
        try {
          const stream =
            typeof media.captureStream === "function"
              ? media.captureStream()
              : (typeof media.mozCaptureStream === "function" ? media.mozCaptureStream() : null);
          if (stream && typeof stream.getAudioTracks === "function" && stream.getAudioTracks().length > 0) {
            hasAudio = true;
          }
        } catch {}
      }
      if (
        hasAudio !== true &&
        typeof media.webkitAudioDecodedByteCount === "number" &&
        media.webkitAudioDecodedByteCount > 0
      ) {
        hasAudio = true;
      }
      if (hasAudio !== true) {
        try {
          const playPromise = media.play?.();
          if (playPromise && typeof playPromise.then === "function") {
            await playPromise;
            await new Promise((r) => setTimeout(r, 140));
          }
        } catch {}
        try {
          media.pause?.();
        } catch {}
        if (
          typeof media.webkitAudioDecodedByteCount === "number" &&
          media.webkitAudioDecodedByteCount > 0
        ) {
          hasAudio = true;
        }
      }
      if (hasAudio === true) return "with_audio";
      if (hasAudio === false) return "no_audio";
      return null;
    };
    media.onloadedmetadata = () => {
      const duration = toFiniteNumber(media.duration);
      if (duration != null && duration > 0) out.durationSec = duration;
      if (kind === "video") {
        const width = toFiniteNumber(media.videoWidth);
        const height = toFiniteNumber(media.videoHeight);
        if (width != null && width > 0) out.width = width;
        if (height != null && height > 0) out.height = height;
        void detectVideoAudioState()
          .then((state) => {
            if (state === "with_audio" || state === "no_audio") {
              out.videoAudioState = state;
            }
          })
          .finally(() => finish());
        return;
      }
      finish();
    };
    media.onerror = finish;
    media.src = src;
  });
  MEDIA_METADATA_CACHE.set(cacheKey, { done: false, promise, data: null });
  return promise.then((data) => {
    MEDIA_METADATA_CACHE.set(cacheKey, { done: true, promise: null, data: data || {} });
    return applyMediaMetadataToResource(resource, data || {});
  }).catch(() => {
    MEDIA_METADATA_CACHE.set(cacheKey, { done: true, promise: null, data: {} });
    return false;
  });
}

function probeManualMediaMetadata(resource) {
  return probeMediaMetadata(resource).then(() => resource);
}

function ensureResourcesMetadata(scopeKey, resources, onDone) {
  const key = String(scopeKey || "default").trim() || "default";
  const rows = Array.isArray(resources) ? resources : [];
  const pending = [];
  for (const resource of rows) {
    if (!shouldProbeMediaMetadata(resource)) continue;
    const cacheKey = mediaMetadataCacheKey(resource);
    if (!cacheKey) continue;
    const cached = MEDIA_METADATA_CACHE.get(cacheKey);
    if (cached?.done) {
      applyMediaMetadataToResource(resource, cached.data);
      continue;
    }
    pending.push(probeMediaMetadata(resource));
  }
  if (!pending.length) return;
  if (MEDIA_METADATA_PROBE_PENDING_BY_SCOPE.has(key)) return;
  const pendingPromise = Promise.all(pending)
    .then((changes) => {
      const hasChanges = Array.isArray(changes) && changes.some(Boolean);
      if (hasChanges && typeof onDone === "function") onDone();
    })
    .finally(() => {
      MEDIA_METADATA_PROBE_PENDING_BY_SCOPE.delete(key);
    });
  MEDIA_METADATA_PROBE_PENDING_BY_SCOPE.set(key, pendingPromise);
}

function appendManualResources(scopeKey, resources) {
  appendManualResourcesInStore(scopeKey, resources);
}

function collectPipelineResources(detail) {
  const manifest = Array.isArray(detail?.manifest) ? detail.manifest.slice() : [];
  manifest.sort((a, b) => {
    const cycleDelta = toNumber(a?.cycle_index) - toNumber(b?.cycle_index);
    if (cycleDelta !== 0) return cycleDelta;
    const retryDelta = toNumber(a?.retry_index) - toNumber(b?.retry_index);
    if (retryDelta !== 0) return retryDelta;
    return toNumber(a?.updated_at) - toNumber(b?.updated_at);
  });

  const resources = [];
  for (const entry of manifest) {
    if (!entryIsApproved(entry)) continue;
    const cycle = toNumber(entry?.cycle_index);
    const retry = toNumber(entry?.retry_index);
    const media = extractMediaOutputs(entry);

    for (let i = 0; i < media.images.length; i += 1) {
      const image = media.images[i];
      const src = buildComfyViewUrl(image, { preview: false });
      const previewSrc = buildComfyViewUrl(image, { preview: true }) || src;
      const baseMeta = collectAssetMeta(image);
      resources.push({
        id: `image:${cycle}:${retry}:${i}`,
        kind: "image",
        cycle,
        retry,
        index: i,
        source: "pipeline",
        sectionId: `cycle:${cycle}`,
        sectionOrder: cycle,
        sectionLabel: `Cycle ${cycle + 1}`,
        src,
        previewSrc,
        label: `cycle ${cycle + 1} · r${retry}`,
        meta: baseMeta,
        videoAudioState: "unknown",
      });
    }
  }
  return resources;
}

function collectInputResources(detail) {
  const inputResources = Array.isArray(detail?.composition_resources) ? detail.composition_resources : [];
  const resources = [];
  for (let i = 0; i < inputResources.length; i += 1) {
    const resource = inputResources[i];
    if (!resource || typeof resource !== "object") continue;
    const kind = String(resource.kind || "").toLowerCase();
    if (kind !== "image" && kind !== "audio" && kind !== "video") continue;
    const src = String(resource.src || resource.uri || "").trim();
    if (!src) continue;
    const meta = resource.meta && typeof resource.meta === "object" ? { ...resource.meta } : {};
    resources.push({
      id: String(resource.id || `input:${kind}:${i + 1}`),
      kind,
      cycle: Number.isFinite(Number(resource.cycle)) ? Number(resource.cycle) : -1,
      retry: Number.isFinite(Number(resource.retry)) ? Number(resource.retry) : 0,
      index: i,
      source: String(resource.source || "pipeline_input"),
      sectionId: String(resource.sectionId || "input_resources"),
      sectionOrder: Number.isFinite(Number(resource.sectionOrder)) ? Number(resource.sectionOrder) : -1000,
      sectionLabel: String(resource.sectionLabel || "Input resources"),
      src,
      previewSrc: kind === "image" ? String(resource.previewSrc || src) : "",
      label: String(resource.label || `${kind} ${i + 1}`),
      meta,
      videoAudioState: kind === "video" ? String(resource.videoAudioState || "unknown") : undefined,
    });
  }
  return resources;
}

function resolveVideoAudioState(resource) {
  if (String(resource?.kind || "") !== "video") return "unknown";
  const explicit = String(resource?.videoAudioState || "").toLowerCase();
  if (explicit === "with_audio" || explicit === "no_audio" || explicit === "unknown") return explicit;
  const inferred = inferVideoHasAudio(resource?.meta || {});
  if (inferred === true) return "with_audio";
  if (inferred === false) return "no_audio";
  return "unknown";
}

function shouldRouteVideoAudio(resource) {
  if (String(resource?.kind || "").toLowerCase() !== "video") return false;
  const state = resolveVideoAudioState(resource);
  // Deterministic fallback: "unknown" is treated as potentially-audio so playback still works
  // when metadata probing is delayed.
  return state !== "no_audio";
}

function collectResources(detail) {
  const scopeKey = scopeKeyFromDetail(detail);
  return collectInputResources(detail)
    .concat(collectPipelineResources(detail))
    .concat(getManualResources(scopeKey))
    .map((resource) => {
      const safe = resource && typeof resource === "object" ? resource : {};
      const next = { ...safe };
      if (!next.meta || typeof next.meta !== "object") next.meta = {};
      if (String(next.kind || "") === "video") {
        next.videoAudioState = resolveVideoAudioState(next);
      }
      const cacheKey = mediaMetadataCacheKey(next);
      if (cacheKey) {
        const cached = MEDIA_METADATA_CACHE.get(cacheKey);
        if (cached?.done) applyMediaMetadataToResource(next, cached.data);
      }
      return next;
    });
}

function defaultClipDurationSec(resource) {
  const hinted = toFiniteNumber(resource?.meta?.durationSec);
  if (hinted != null && hinted > 0.05) return hinted;
  if (String(resource?.kind || "") === "audio") return 4;
  if (String(resource?.kind || "") === "video") return 3;
  return 2;
}

function resolveResourceSourceDurationSec(resource, fallbackDurationSec = null) {
  const kind = String(resource?.kind || "").trim().toLowerCase();
  const hintedDurationSec = toFiniteNumber(resource?.meta?.durationSec);
  const fallback = Math.max(
    0.1,
    toFiniteNumber(fallbackDurationSec) || defaultClipDurationSec(resource)
  );
  if (kind === "image") {
    // Deterministic image source window: images are static and may be stretched across long timelines.
    return Math.max(0.1, hintedDurationSec || IMAGE_VIRTUAL_SOURCE_DURATION_SEC);
  }
  return Math.max(0.1, hintedDurationSec || fallback);
}

function synchronizePlacementDurationsWithResources(scopeKey, resources) {
  const placementMap = getPlacementMap(scopeKey);
  const rows = Array.isArray(resources) ? resources : [];
  let changed = false;
  for (const resource of rows) {
    const resourceId = String(resource?.id || "").trim();
    if (!resourceId) continue;
    const kind = String(resource?.kind || "").toLowerCase();
    if (kind !== "audio" && kind !== "video" && kind !== "image") continue;
    const sourceDurationSec = resolveResourceSourceDurationSec(resource);
    const fallbackDurationSec = defaultClipDurationSec({ kind, meta: {} });
    const placements = collectPlacementsForResource(placementMap, resourceId);
    for (const placement of placements) {
      const prevSourceDurationSec = Math.max(
        0.1,
        toFiniteNumber(placement?.sourceDurationSec) ||
          toFiniteNumber(placement?.durationSec) ||
          sourceDurationSec
      );
      const prevDurationSec = Math.max(0.1, toFiniteNumber(placement?.durationSec) || prevSourceDurationSec);
      const prevStartOffsetSec = Math.max(0, toFiniteNumber(placement?.startOffsetSec) || 0);
      const autoDuration = Boolean(placement?.autoDuration);
      const looksLikePlaceholderSpan =
        prevStartOffsetSec <= 1e-3 &&
        prevSourceDurationSec <= fallbackDurationSec + 0.051 &&
        Math.abs(prevDurationSec - prevSourceDurationSec) <= 0.051;
      const shouldExpandToSource = (kind !== "image" && autoDuration) || (
        sourceDurationSec > prevSourceDurationSec + 0.051 &&
        looksLikePlaceholderSpan
      );
      const normalized = clampPlacementToSourceDuration(
        placementMap,
        resourceId,
        {
          ...placement,
          durationSec: shouldExpandToSource ? sourceDurationSec : prevDurationSec,
          sourceDurationSec,
          autoDuration: shouldExpandToSource ? false : autoDuration,
        },
        sourceDurationSec
      );
      if (
        Math.abs(Number(normalized?.durationSec || 0) - prevDurationSec) > 1e-6 ||
        Math.abs(Number(normalized?.sourceDurationSec || 0) - prevSourceDurationSec) > 1e-6 ||
        Math.abs(Number(normalized?.startOffsetSec || 0) - prevStartOffsetSec) > 1e-6 ||
        Boolean(normalized?.autoDuration) !== autoDuration
      ) {
        changed = true;
      }
    }
  }
  return changed;
}

function deriveVideoAudioTrackNames(videoTrackName) {
  const track = String(videoTrackName || "").trim();
  const match = track.match(/^video\s*(\d+)$/i);
  if (match) {
    const lane = Math.max(1, Number(match[1]) || 1);
    return {
      stereo: `Video Audio ${lane}`,
      mono: `Video Audio M${lane}`,
    };
  }
  return {
    stereo: "Video Audio 1",
    mono: "Video Audio M1",
  };
}

function deriveVideoTrackNameFromLinkedAudio(audioTrackName) {
  const track = String(audioTrackName || "").trim();
  const match = track.match(/^video\s*audio(?:\s*m)?\s*(\d+)$/i);
  if (!match) return "";
  const lane = Math.max(1, Number(match[1]) || 1);
  return `Video ${lane}`;
}

function inferTrackKindFromName(trackName) {
  const name = String(trackName || "").trim().toLowerCase();
  if (!name) return "";
  if (name === COMPOSITION_DROPZONE_TOP_TRACK || name === COMPOSITION_DROPZONE_BOTTOM_TRACK) return "dropzone";
  if (name.startsWith("video audio")) return "audio";
  if (name.startsWith("video")) return "video";
  if (name.startsWith("image")) return "image";
  if (name.startsWith("audio")) return "audio";
  return "";
}

function isCompositionDropzoneTrackName(trackName) {
  const name = String(trackName || "").trim();
  return name === COMPOSITION_DROPZONE_TOP_TRACK || name === COMPOSITION_DROPZONE_BOTTOM_TRACK;
}

function createCompositionDropzoneTrack(name, locked = false, patch = {}) {
  return {
    name: String(name || "").trim(),
    kind: "dropzone",
    partition: "composition_dropzone",
    source: "",
    audioAssetKey: "",
    events: 0,
    locked: Boolean(locked),
    ...patch,
  };
}

function createNextTrackNameByKind(kind, trackNames = []) {
  const normalizedKind = String(kind || "").trim().toLowerCase();
  const values = Array.isArray(trackNames) ? trackNames : [];
  let regex = /^track\s+(\d+)$/i;
  let prefix = "Track ";
  if (normalizedKind === "video") {
    regex = /^video\s+(\d+)$/i;
    prefix = "Video ";
  } else if (normalizedKind === "image") {
    regex = /^image\s+(\d+)$/i;
    prefix = "Image ";
  } else if (normalizedKind === "audio") {
    regex = /^audio\s+s(\d+)$/i;
    prefix = "Audio S";
  }
  let maxLane = 0;
  for (const row of values) {
    const name = String(row || "").trim();
    const match = name.match(regex);
    if (!match) continue;
    const lane = Math.max(1, Number(match[1]) || 1);
    if (lane > maxLane) maxLane = lane;
  }
  return `${prefix}${Math.max(1, maxLane + 1)}`;
}

function createNextTrackNameFromTrack(trackName, trackKind, trackNames = []) {
  const name = String(trackName || "").trim();
  const kind = String(trackKind || "").trim().toLowerCase() || inferTrackKindFromName(name);
  const values = Array.isArray(trackNames) ? trackNames : [];
  const videoAudioMatch = name.match(/^video\s*audio(?:\s*(m))?\s*(\d+)$/i);
  if (videoAudioMatch) {
    const mono = Boolean(videoAudioMatch[1]);
    const regex = mono ? /^video\s*audio\s*m\s*(\d+)$/i : /^video\s*audio\s*(\d+)$/i;
    let maxLane = 0;
    for (const value of values) {
      const match = String(value || "").trim().match(regex);
      if (!match) continue;
      const lane = Math.max(1, Number(match[1]) || 1);
      if (lane > maxLane) maxLane = lane;
    }
    return mono ? `Video Audio M${Math.max(1, maxLane + 1)}` : `Video Audio ${Math.max(1, maxLane + 1)}`;
  }
  return createNextTrackNameByKind(kind, values);
}

function deriveMonoTrackNameFromStereo(stereoTrackName, fallbackIndex = 1) {
  const track = String(stereoTrackName || "").trim();
  const match = track.match(/^audio\s*s(\d+)$/i);
  if (match) {
    const lane = Math.max(1, Number(match[1]) || 1);
    return `Audio M${lane}`;
  }
  return `Audio M${Math.max(1, Number(fallbackIndex) || 1)}`;
}

function inferAudioChannelModeFromTrackName(trackName) {
  const track = String(trackName || "").trim();
  if (!track) return "";
  if (/^audio\s*m\d+$/i.test(track)) return "mono";
  if (/^audio\s*s\d+$/i.test(track)) return "stereo";
  if (/^video\s*audio\s*m\d+$/i.test(track)) return "mono";
  if (/^video\s*audio\s*\d+$/i.test(track)) return "stereo";
  if (/\bmono\b/i.test(track)) return "mono";
  if (/\bstereo\b/i.test(track)) return "stereo";
  return "";
}

function resolveAudioChannelModeFromResource(resource, preferredTrackName = "") {
  const fromTrack = inferAudioChannelModeFromTrackName(preferredTrackName);
  if (fromTrack) return fromTrack;
  const channels =
    toFiniteNumber(resource?.meta?.channels) ??
    toFiniteNumber(resource?.channels) ??
    toFiniteNumber(resource?.audio_channels);
  if (channels != null && channels <= 1) return "mono";
  return "stereo";
}

function coerceAudioTrackNameForChannelMode(trackName, channelMode, fallbackIndex = 1) {
  const mode = channelMode === "mono" ? "mono" : "stereo";
  const track = String(trackName || "").trim();
  if (!track) return mode === "mono" ? `Audio M${Math.max(1, Number(fallbackIndex) || 1)}` : `Audio S${Math.max(1, Number(fallbackIndex) || 1)}`;
  const stereoMatch = track.match(/^audio\s*s(\d+)$/i);
  if (stereoMatch) {
    const lane = Math.max(1, Number(stereoMatch[1] || fallbackIndex) || 1);
    return mode === "mono" ? `Audio M${lane}` : `Audio S${lane}`;
  }
  const monoMatch = track.match(/^audio\s*m(\d+)$/i);
  if (monoMatch) {
    const lane = Math.max(1, Number(monoMatch[1] || fallbackIndex) || 1);
    return mode === "mono" ? `Audio M${lane}` : `Audio S${lane}`;
  }
  return track;
}

function normalizeMediaSrcForCompare(src) {
  const text = String(src || "").trim();
  if (!text) return "";
  try {
    return new URL(text, window.location.href).href;
  } catch {
    return text;
  }
}

function getCompositionPreviewCache(scopeKey) {
  const key = String(scopeKey || "default").trim() || "default";
  if (!COMPOSITION_PREVIEW_CACHE_BY_SCOPE.has(key)) {
    COMPOSITION_PREVIEW_CACHE_BY_SCOPE.set(key, {
      timelineThumbCache: new Map(),
      videoPosterBySrc: new Map(),
      videoPosterPendingBySrc: new Map(),
      activeVideoSources: new Set(),
      prewarmSignature: "",
      prewarmTimer: null,
      renderTimer: null,
      qualityHint: "auto",
      profileSignature: "",
    });
  }
  return COMPOSITION_PREVIEW_CACHE_BY_SCOPE.get(key);
}

function schedulePreviewCacheRender(previewCache, onRender) {
  if (!previewCache || typeof onRender !== "function") return;
  if (previewCache.renderTimer) return;
  previewCache.renderTimer = setTimeout(() => {
    previewCache.renderTimer = null;
    try {
      onRender();
    } catch {}
  }, PREVIEW_CACHE_RENDER_THROTTLE_MS);
}

function parseSourceFromTimelineCacheKey(rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) return "";
  if (!key.startsWith("filmstrip:")) return key;
  const parts = key.split(":");
  if (parts.length < 5) return "";
  return parts.slice(1, -3).join(":");
}

function pruneMapToMaxSize(map, maxSize) {
  if (!(map instanceof Map)) return;
  const limit = Math.max(8, Number(maxSize || 0));
  while (map.size > limit) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}

function syncPreviewCacheWithResources(previewCache, resources) {
  if (!previewCache) return;
  const activeVideoSources = new Set();
  const activeResourceSources = new Set();
  for (const resource of Array.isArray(resources) ? resources : []) {
    const src = normalizeMediaSrcForCompare(resource?.src);
    const previewSrc = normalizeMediaSrcForCompare(resource?.previewSrc);
    if (src) activeResourceSources.add(src);
    if (previewSrc) activeResourceSources.add(previewSrc);
    if (String(resource?.kind || "").toLowerCase() !== "video") continue;
    if (src) activeVideoSources.add(src);
  }
  previewCache.activeVideoSources = activeVideoSources;

  for (const [src] of previewCache.videoPosterBySrc.entries()) {
    if (!activeVideoSources.has(normalizeMediaSrcForCompare(src))) {
      previewCache.videoPosterBySrc.delete(src);
    }
  }
  for (const [src] of previewCache.videoPosterPendingBySrc.entries()) {
    if (!activeVideoSources.has(normalizeMediaSrcForCompare(src))) {
      previewCache.videoPosterPendingBySrc.delete(src);
    }
  }
  if (previewCache.timelineThumbCache instanceof Map) {
    for (const [key] of Array.from(previewCache.timelineThumbCache.entries())) {
      const source = parseSourceFromTimelineCacheKey(key);
      if (!source) continue;
      const normalized = normalizeMediaSrcForCompare(source);
      if (!normalized) continue;
      const isFilmstrip = String(key).startsWith("filmstrip:");
      if (isFilmstrip) {
        if (activeVideoSources.has(normalized)) continue;
      } else if (activeResourceSources.has(normalized)) {
        continue;
      }
      previewCache.timelineThumbCache.delete(key);
    }
  }
  pruneMapToMaxSize(previewCache.videoPosterBySrc, PREVIEW_CACHE_MAX_POSTERS);
  pruneMapToMaxSize(previewCache.timelineThumbCache, PREVIEW_CACHE_MAX_TIMELINE_ENTRIES);
}

function resolveVideoPrewarmProfile({ videoCount = 0, splitPercent = 50, viewportWidth = 0 } = {}) {
  const count = Math.max(0, Math.round(Number(videoCount || 0)));
  const width = Math.max(0, Number(viewportWidth || 0));
  const split = clamp(Number(splitPercent || 50), COMPOSITION_SPLIT_MIN_PERCENT, COMPOSITION_SPLIT_MAX_PERCENT);
  const monitorViewportWeight = split >= 56 ? 0.92 : (split <= 42 ? 0.72 : 0.82);
  const density = count / Math.max(1, Math.floor((Math.max(320, width) * monitorViewportWeight) / 220));
  if (count >= 18 || density >= 2.2) {
    return {
      qualityHint: "low",
      frameCountHint: 4,
      targetHeightHint: 44,
      edgeTargetHeightHint: 40,
      fullEnabled: false,
      maxSources: 12,
    };
  }
  if (count >= 10 || density >= 1.3) {
    return {
      qualityHint: "medium",
      frameCountHint: 6,
      targetHeightHint: 50,
      edgeTargetHeightHint: 44,
      fullEnabled: true,
      maxSources: 18,
    };
  }
  return {
    qualityHint: "high",
    frameCountHint: 10,
    targetHeightHint: 56,
    edgeTargetHeightHint: 48,
    fullEnabled: true,
    maxSources: VIDEO_PREWARM_MAX_SOURCES,
  };
}

function scheduleVideoPrewarm(previewCache, resources, requestRender, options = {}) {
  if (!previewCache) return;
  const splitPercent = toFiniteNumber(options?.splitPercent) ?? 50;
  const viewportWidth = toFiniteNumber(options?.viewportWidth) ?? 0;
  const candidates = [];
  for (const resource of Array.isArray(resources) ? resources : []) {
    if (String(resource?.kind || "").toLowerCase() !== "video") continue;
    const src = String(resource?.src || "").trim();
    if (!src) continue;
    const durationSec = Math.max(0.1, toFiniteNumber(resource?.meta?.durationSec) || 0.1);
    candidates.push({ src, durationSec });
  }
  const uniqueBySrc = new Map();
  for (const item of candidates) {
    const key = normalizeMediaSrcForCompare(item.src);
    if (!key) continue;
    if (!uniqueBySrc.has(key)) uniqueBySrc.set(key, item);
  }
  const profile = resolveVideoPrewarmProfile({
    videoCount: uniqueBySrc.size,
    splitPercent,
    viewportWidth,
  });
  previewCache.qualityHint = profile.qualityHint;
  const list = Array.from(uniqueBySrc.values()).slice(0, Math.max(1, profile.maxSources));
  const signature = list
    .map((item) => `${normalizeMediaSrcForCompare(item.src)}@${Number(item.durationSec || 0).toFixed(3)}`)
    .join("|");
  const profileSignature = `${profile.qualityHint}|${profile.frameCountHint}|${profile.targetHeightHint}|${profile.edgeTargetHeightHint}|${profile.fullEnabled ? 1 : 0}|${signature}`;
  if (profileSignature && profileSignature === previewCache.prewarmSignature) return;
  previewCache.prewarmSignature = profileSignature;
  previewCache.profileSignature = profileSignature;
  if (previewCache.prewarmTimer) {
    clearTimeout(previewCache.prewarmTimer);
    previewCache.prewarmTimer = null;
  }
  if (!list.length) return;
  previewCache.prewarmTimer = setTimeout(() => {
    previewCache.prewarmTimer = null;
    for (const item of list) {
      if (previewCache.videoPosterBySrc.has(item.src)) {
        primeTimelineThumbCacheWithPoster(previewCache, item.src, previewCache.videoPosterBySrc.get(item.src));
        continue;
      }
      void ensureVideoPosterDataUrl(previewCache, item.src).then((posterSrc) => {
        const safePoster = String(posterSrc || "").trim();
        if (!safePoster) return;
        primeTimelineThumbCacheWithPoster(previewCache, item.src, safePoster);
        schedulePreviewCacheRender(previewCache, requestRender);
      });
    }
    prewarmTimelineVideoBuffers({
      clipThumbCache: previewCache.timelineThumbCache,
      sources: list,
      frameCountHint: profile.frameCountHint,
      targetHeightHint: profile.targetHeightHint,
      edgeTargetHeightHint: profile.edgeTargetHeightHint,
      fullEnabled: profile.fullEnabled,
      onUpdate: () => schedulePreviewCacheRender(previewCache, requestRender),
    });
  }, VIDEO_PREWARM_DEBOUNCE_MS);
}

function ensureVideoPosterDataUrl(previewCache, src) {
  const safeSrc = String(src || "").trim();
  if (!previewCache || !safeSrc || typeof document === "undefined") return Promise.resolve("");
  if (previewCache.videoPosterBySrc.has(safeSrc)) {
    return Promise.resolve(String(previewCache.videoPosterBySrc.get(safeSrc) || ""));
  }
  if (previewCache.videoPosterPendingBySrc.has(safeSrc)) {
    return previewCache.videoPosterPendingBySrc.get(safeSrc);
  }
  const pending = new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = safeSrc;
    const finish = (value = "") => {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load?.();
      } catch {}
      previewCache.videoPosterPendingBySrc.delete(safeSrc);
      const safeValue = String(value || "");
      if (safeValue) previewCache.videoPosterBySrc.set(safeSrc, safeValue);
      resolve(safeValue);
    };
    const fail = () => finish("");
    const capturePoster = () => {
      const srcW = Math.max(1, Number(video.videoWidth || 0));
      const srcH = Math.max(1, Number(video.videoHeight || 0));
      if (!(srcW > 0 && srcH > 0)) {
        fail();
        return;
      }
      const dpr = clamp(Number(globalThis?.devicePixelRatio || 1), 1, VIDEO_POSTER_MAX_DPR);
      const targetH = Math.round(VIDEO_POSTER_TARGET_HEIGHT * dpr);
      const h = Math.max(VIDEO_POSTER_MIN_HEIGHT, Math.min(targetH, srcH));
      const w = Math.max(VIDEO_POSTER_MIN_HEIGHT, Math.round((srcW / srcH) * h));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        fail();
        return;
      }
      try {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(video, 0, 0, w, h);
        finish(canvas.toDataURL("image/webp", 0.9));
      } catch {
        fail();
      }
    };
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      const seekTo = Number.isFinite(duration) && duration > VIDEO_POSTER_SEEK_SEC ? VIDEO_POSTER_SEEK_SEC : 0;
      try {
        video.currentTime = seekTo;
      } catch {
        capturePoster();
      }
    };
    video.onseeked = capturePoster;
    video.onerror = fail;
  });
  previewCache.videoPosterPendingBySrc.set(safeSrc, pending);
  return pending;
}

function primeTimelineThumbCacheWithPoster(previewCache, src, posterSrc) {
  const safeSrc = String(src || "").trim();
  const safePoster = String(posterSrc || "").trim();
  if (!previewCache?.timelineThumbCache || !safeSrc || !safePoster) return;
  if (previewCache.timelineThumbCache.has(safeSrc)) return;
  if (typeof Image !== "function") return;
  const entry = {
    src: safeSrc,
    status: "loading",
    img: null,
  };
  previewCache.timelineThumbCache.set(safeSrc, entry);
  const img = new Image();
  entry.img = img;
  img.onload = () => {
    entry.status = "ready";
  };
  img.onerror = () => {
    entry.status = "error";
  };
  img.src = safePoster;
}

function getPlacementMap(scopeKey) {
  return getPlacementMapInStore(scopeKey);
}

function inferResourceIdFromPlacementKey(placementKey) {
  const key = String(placementKey || "").trim();
  if (!key) return "";
  const clipMarker = key.indexOf(PLACEMENT_CLIP_PREFIX);
  if (clipMarker > 0) return key.slice(0, clipMarker);
  const legacyMarker = key.indexOf(PLACEMENT_SEGMENT_PREFIX);
  if (legacyMarker > 0) return key.slice(0, legacyMarker);
  return key;
}

function placementBelongsToResource(resourceId, placementKey, placementValue = null) {
  const rid = String(resourceId || "").trim();
  const key = String(placementKey || "").trim();
  if (!rid) return false;
  const fromValue = String(placementValue?.resourceId || "").trim();
  if (fromValue) return fromValue === rid;
  if (!key) return false;
  return inferResourceIdFromPlacementKey(key) === rid;
}

function parsePlacementSegmentIndex(resourceId, placementKey, placementValue = null) {
  const rid = String(resourceId || "").trim();
  const key = String(placementKey || "").trim();
  if (!placementBelongsToResource(rid, key, placementValue)) return null;
  const clipPrefix = `${rid}${PLACEMENT_CLIP_PREFIX}`;
  if (key.startsWith(clipPrefix)) {
    const parsed = Number(key.slice(clipPrefix.length));
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }
  if (key === rid) return 0;
  const legacyPrefix = `${rid}${PLACEMENT_SEGMENT_PREFIX}`;
  if (key.startsWith(legacyPrefix)) {
    const parsed = Number(key.slice(legacyPrefix.length));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }
  return null;
}

function buildPlacementKey(resourceId, segmentIndex) {
  const rid = String(resourceId || "").trim();
  const seg = Number(segmentIndex);
  if (!rid) return "";
  const safeSeg = Number.isFinite(seg) ? Math.max(0, Math.round(seg)) : 0;
  return `${rid}${PLACEMENT_CLIP_PREFIX}${safeSeg}`;
}

function normalizePlacementRecord(resourceId, placementKey, placementValue = null, fallback = null) {
  const base = placementValue && typeof placementValue === "object" ? placementValue : {};
  const rid = String(resourceId || base.resourceId || inferResourceIdFromPlacementKey(placementKey) || "").trim();
  const key = String(
    base.clipId ||
    placementKey ||
    (fallback?.clipId || "") ||
    buildPlacementKey(rid, 0)
  ).trim();
  const patch = fallback && typeof fallback === "object" ? fallback : {};
  const source = { ...base, ...patch };
  const linkGroupId = String(source.linkGroupId || "").trim() || key;
  const sourceDurationSec = Math.max(
    0.1,
    toFiniteNumber(source.sourceDurationSec) ||
      toFiniteNumber(source.durationSec) ||
      0.1
  );
  const autoDuration = Boolean(source.autoDuration);
  return {
    placementKey: key,
    clipId: key,
    resourceId: rid,
    trackName: String(source.trackName || "").trim(),
    timeSec: Math.max(0, toFiniteNumber(source.timeSec) || 0),
    durationSec: Math.max(0.1, toFiniteNumber(source.durationSec) || 0.1),
    startOffsetSec: Math.max(0, toFiniteNumber(source.startOffsetSec) || 0),
    sourceDurationSec,
    linkGroupId,
    autoDuration,
  };
}

function clampPlacementToSourceDuration(placementMap, resourceId, placement, sourceDurationSec) {
  const rid = String(resourceId || "").trim();
  const key = String(placement?.clipId || placement?.placementKey || "").trim()
    || buildPlacementKey(rid, 0);
  const normalized = normalizePlacementRecord(rid, key, placement, { clipId: key, resourceId: rid });
  const srcDur = Math.max(
    0.1,
    toFiniteNumber(sourceDurationSec) ||
      toFiniteNumber(normalized.sourceDurationSec) ||
      normalized.durationSec ||
      0.1
  );
  const maxOffset = Math.max(0, srcDur - 0.1);
  const startOffsetSec = clamp(Math.max(0, toFiniteNumber(normalized.startOffsetSec) || 0), 0, maxOffset);
  const maxDuration = Math.max(0.1, srcDur - startOffsetSec);
  const durationSec = clamp(Math.max(0.1, toFiniteNumber(normalized.durationSec) || 0.1), 0.1, maxDuration);
  const timeSec = Math.max(0, toFiniteNumber(normalized.timeSec) || 0);
  const linkGroupId = String(normalized.linkGroupId || normalized.clipId || "").trim() || normalized.clipId;
  const changed =
    Math.abs(Number(normalized.timeSec || 0) - timeSec) > 1e-6 ||
    Math.abs(Number(normalized.durationSec || 0) - durationSec) > 1e-6 ||
    Math.abs(Number(normalized.startOffsetSec || 0) - startOffsetSec) > 1e-6 ||
    Math.abs(Number(normalized.sourceDurationSec || 0) - srcDur) > 1e-6 ||
    String(normalized.linkGroupId || "") !== linkGroupId;
  const next = {
    ...normalized,
    timeSec,
    durationSec,
    startOffsetSec,
    sourceDurationSec: srcDur,
    linkGroupId,
    autoDuration: Boolean(normalized.autoDuration),
  };
  if (changed) setPlacementRecord(placementMap, next);
  return next;
}

function normalizePlacementLinkGroups(placementMap, resourceId, placements) {
  const rid = String(resourceId || "").trim();
  const rows = Array.isArray(placements) ? placements : [];
  const counts = new Map();
  for (const row of rows) {
    const gid = String(row?.linkGroupId || "").trim();
    if (!gid) continue;
    counts.set(gid, (counts.get(gid) || 0) + 1);
  }
  return rows.map((row) => {
    const clipId = String(row?.clipId || row?.placementKey || "").trim() || buildPlacementKey(rid, 0);
    const gid = String(row?.linkGroupId || "").trim();
    const nextLinkGroupId = !gid || (counts.get(gid) || 0) > 1 ? clipId : gid;
    if (nextLinkGroupId !== gid) {
      const normalized = setPlacementRecord(placementMap, {
        ...row,
        clipId,
        placementKey: clipId,
        resourceId: rid,
        linkGroupId: nextLinkGroupId,
      });
      return normalized || {
        ...(row && typeof row === "object" ? row : {}),
        clipId,
        placementKey: clipId,
        resourceId: rid,
        linkGroupId: nextLinkGroupId,
      };
    }
    return row;
  });
}

function setPlacementRecord(placementMap, record) {
  if (!record || typeof record !== "object") return null;
  const key = String(record.clipId || record.placementKey || "").trim();
  const resourceId = String(record.resourceId || "").trim();
  if (!key || !resourceId) return null;
  const normalized = normalizePlacementRecord(resourceId, key, record);
  placementMap.set(normalized.clipId, {
    resourceId: normalized.resourceId,
    clipId: normalized.clipId,
    trackName: normalized.trackName,
    timeSec: normalized.timeSec,
    durationSec: normalized.durationSec,
    startOffsetSec: normalized.startOffsetSec,
    sourceDurationSec: normalized.sourceDurationSec,
    linkGroupId: normalized.linkGroupId,
    autoDuration: Boolean(normalized.autoDuration),
  });
  return normalized;
}

function nextPlacementSegmentIndex(placementMap, resourceId) {
  let maxSeg = -1;
  for (const [key, value] of placementMap.entries()) {
    const seg = parsePlacementSegmentIndex(resourceId, key, value);
    if (seg != null && seg > maxSeg) maxSeg = seg;
  }
  return maxSeg + 1;
}

function collectPlacementsForResource(placementMap, resourceId) {
  const rid = String(resourceId || "").trim();
  if (!rid) return [];
  const rows = [];
  for (const [key, value] of placementMap.entries()) {
    if (!placementBelongsToResource(rid, key, value)) continue;
    rows.push(normalizePlacementRecord(rid, key, value));
  }
  rows.sort((a, b) => {
    const delta = Number(a.timeSec || 0) - Number(b.timeSec || 0);
    if (delta !== 0) return delta;
    return String(a.clipId || "").localeCompare(String(b.clipId || ""));
  });
  return rows;
}

function setPlacementsForResource(placementMap, resourceId, placements) {
  const rid = String(resourceId || "").trim();
  if (!rid) return [];
  for (const [key, value] of Array.from(placementMap.entries())) {
    if (placementBelongsToResource(rid, key, value)) placementMap.delete(key);
  }
  const rows = Array.isArray(placements) ? placements : [];
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] && typeof rows[i] === "object" ? rows[i] : {};
    const key = String(row.placementKey || row.clipId || "").trim() || buildPlacementKey(rid, i);
    const normalized = setPlacementRecord(
      placementMap,
      normalizePlacementRecord(rid, key, row, { clipId: key, resourceId: rid })
    );
    if (normalized) out.push(normalized);
  }
  return out;
}

function getPrimaryPlacementForResource(placementMap, resourceId) {
  const rows = collectPlacementsForResource(placementMap, resourceId);
  return rows[0] || null;
}

function getPlacementByClipId(placementMap, clipId, resourceId = "") {
  const key = String(clipId || "").trim();
  if (!key) return null;
  const value = placementMap.get(key);
  if (!value || typeof value !== "object") return null;
  const normalized = normalizePlacementRecord(resourceId, key, value);
  if (!normalized.resourceId) return null;
  if (resourceId && String(normalized.resourceId || "").trim() !== String(resourceId || "").trim()) return null;
  return normalized;
}

function getPlacementByLinkGroupId(placementMap, linkGroupId, resourceId = "") {
  const key = String(linkGroupId || "").trim();
  if (!key) return null;
  for (const [placementKey, value] of placementMap.entries()) {
    const normalized = normalizePlacementRecord(resourceId, placementKey, value);
    if (!normalized.resourceId) continue;
    if (resourceId && String(normalized.resourceId || "").trim() !== String(resourceId || "").trim()) continue;
    if (String(normalized.linkGroupId || "").trim() !== key) continue;
    return normalized;
  }
  return null;
}

function appendPlacementForResource(placementMap, resourceId, patch = {}) {
  const rid = String(resourceId || "").trim();
  if (!rid) return null;
  const nextIndex = nextPlacementSegmentIndex(placementMap, rid);
  const key = buildPlacementKey(rid, nextIndex);
  const normalized = normalizePlacementRecord(rid, key, patch, {
    clipId: key,
    resourceId: rid,
    linkGroupId: String(patch?.linkGroupId || "").trim() || key,
  });
  return setPlacementRecord(placementMap, normalized);
}

function upsertPlacementForResource(placementMap, resourceId, placementKey, patch) {
  const rid = String(resourceId || "").trim();
  if (!rid) return null;
  const key = String(placementKey || "").trim();
  const base = key && placementBelongsToResource(rid, key, placementMap.get(key))
    ? (getPlacementByClipId(placementMap, key, rid) || {})
    : (getPrimaryPlacementForResource(placementMap, rid) || {});
  const nextKey = key && placementBelongsToResource(rid, key, placementMap.get(key))
    ? key
    : (String(base?.clipId || "").trim() || buildPlacementKey(rid, nextPlacementSegmentIndex(placementMap, rid)));
  const normalized = normalizePlacementRecord(
    rid,
    nextKey,
    base,
    { ...(patch && typeof patch === "object" ? patch : {}), clipId: nextKey, resourceId: rid }
  );
  return setPlacementRecord(placementMap, normalized);
}

function splitPlacementForResource(placementMap, resourceId, placementKey, cutTimeSec, minDurationSec = 0.1) {
  const rid = String(resourceId || "").trim();
  const key = String(placementKey || "").trim();
  if (!rid || !key || !placementBelongsToResource(rid, key, placementMap.get(key))) return null;
  const current = getPlacementByClipId(placementMap, key, rid);
  if (!current) return null;
  const start = current.timeSec;
  const end = start + current.durationSec;
  const cut = Math.max(start + minDurationSec, Math.min(end - minDurationSec, Number(cutTimeSec || start)));
  if (!(cut > start + 1e-6 && cut < end - 1e-6)) return null;

  const leftDuration = Math.max(minDurationSec, cut - start);
  const rightDuration = Math.max(minDurationSec, end - cut);
  const rightOffset = current.startOffsetSec + leftDuration;
  const nextSeg = nextPlacementSegmentIndex(placementMap, rid);
  const rightKey = buildPlacementKey(rid, nextSeg);
  const leftLinkGroupId = key;
  const rightLinkGroupId = rightKey;

  setPlacementRecord(placementMap, {
    ...current,
    clipId: key,
    placementKey: key,
    resourceId: rid,
    durationSec: leftDuration,
    startOffsetSec: current.startOffsetSec,
    linkGroupId: leftLinkGroupId,
    autoDuration: false,
  });
  setPlacementRecord(placementMap, {
    ...current,
    clipId: rightKey,
    placementKey: rightKey,
    resourceId: rid,
    timeSec: cut,
    durationSec: rightDuration,
    startOffsetSec: rightOffset,
    linkGroupId: rightLinkGroupId,
    autoDuration: false,
  });
  return {
    leftKey: key,
    rightKey,
    cutTimeSec: cut,
  };
}

function trimPlacementForResource(
  placementMap,
  resourceId,
  placementKey,
  cutTimeSec,
  keepSide = "left",
  minDurationSec = 0.1
) {
  const split = splitPlacementForResource(
    placementMap,
    resourceId,
    placementKey,
    cutTimeSec,
    minDurationSec
  );
  if (!split) return null;
  const normalizedKeepSide = String(keepSide || "").trim().toLowerCase() === "right" ? "right" : "left";
  const keepKey = normalizedKeepSide === "right" ? split.rightKey : split.leftKey;
  const removeKey = normalizedKeepSide === "right" ? split.leftKey : split.rightKey;
  if (removeKey && placementMap.has(removeKey)) placementMap.delete(removeKey);
  return {
    keepKey,
    removeKey,
    keepSide: normalizedKeepSide,
    cutTimeSec: split.cutTimeSec,
  };
}

function joinPlacementsForResource(placementMap, resourceId, leftPlacementKey, rightPlacementKey, minDurationSec = 0.1) {
  const rid = String(resourceId || "").trim();
  const leftKeyRaw = String(leftPlacementKey || "").trim();
  const rightKeyRaw = String(rightPlacementKey || "").trim();
  if (!rid || !leftKeyRaw || !rightKeyRaw || leftKeyRaw === rightKeyRaw) return null;
  const left = getPlacementByClipId(placementMap, leftKeyRaw, rid);
  const right = getPlacementByClipId(placementMap, rightKeyRaw, rid);
  if (!left || !right) return null;
  const ordered = [left, right].sort((a, b) => Number(a.timeSec || 0) - Number(b.timeSec || 0));
  const first = ordered[0];
  const second = ordered[1];
  if (String(first.trackName || "").trim() !== String(second.trackName || "").trim()) return null;
  const firstStart = Math.max(0, Number(first.timeSec || 0));
  const firstDuration = Math.max(minDurationSec, Number(first.durationSec || minDurationSec));
  const firstEnd = firstStart + firstDuration;
  const secondStart = Math.max(0, Number(second.timeSec || 0));
  const secondDuration = Math.max(minDurationSec, Number(second.durationSec || minDurationSec));
  const secondEnd = secondStart + secondDuration;
  if (Math.abs(firstEnd - secondStart) > 0.08) return null;
  const firstOffset = Math.max(0, Number(first.startOffsetSec || 0));
  const secondOffset = Math.max(0, Number(second.startOffsetSec || 0));
  if (Math.abs((firstOffset + firstDuration) - secondOffset) > 0.08) return null;
  const sourceDurationSec = Math.max(
    minDurationSec,
    toFiniteNumber(first.sourceDurationSec) ||
      toFiniteNumber(second.sourceDurationSec) ||
      Math.max(firstDuration, secondDuration)
  );
  const mergedDuration = Math.max(minDurationSec, secondEnd - firstStart);
  const boundedDuration = Math.min(mergedDuration, Math.max(minDurationSec, sourceDurationSec - firstOffset));
  setPlacementRecord(placementMap, {
    ...first,
    clipId: String(first.clipId || first.placementKey || leftKeyRaw),
    placementKey: String(first.clipId || first.placementKey || leftKeyRaw),
    resourceId: rid,
    trackName: String(first.trackName || second.trackName || "").trim(),
    timeSec: firstStart,
    durationSec: boundedDuration,
    startOffsetSec: firstOffset,
    sourceDurationSec,
    linkGroupId: String(first.linkGroupId || first.clipId || first.placementKey || leftKeyRaw).trim(),
    autoDuration: false,
  });
  const removeKey = String(second.clipId || second.placementKey || rightKeyRaw).trim();
  if (removeKey) placementMap.delete(removeKey);
  return {
    keepKey: String(first.clipId || first.placementKey || leftKeyRaw).trim(),
    removedKey: removeKey,
  };
}

function removePlacementRecordsByClipIds(placementMap, clipIds = []) {
  const uniqueIds = Array.from(
    new Set((Array.isArray(clipIds) ? clipIds : []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  let removed = 0;
  for (const clipId of uniqueIds) {
    if (!placementMap.has(clipId)) continue;
    placementMap.delete(clipId);
    removed += 1;
  }
  return removed;
}

function collectPlacementClipIdsByLinkGroupId(placementMap, linkGroupId) {
  const gid = String(linkGroupId || "").trim();
  if (!gid) return [];
  const out = [];
  for (const [placementKey, value] of placementMap.entries()) {
    const normalized = normalizePlacementRecord("", placementKey, value);
    if (!normalized?.resourceId) continue;
    if (String(normalized.linkGroupId || "").trim() !== gid) continue;
    const clipId = String(normalized.clipId || normalized.placementKey || placementKey || "").trim();
    if (clipId) out.push(clipId);
  }
  return Array.from(new Set(out));
}

function duplicatePlacementRecordsByClipIds(placementMap, clipIds = [], options = {}) {
  const spacingSec = Math.max(0.02, toFiniteNumber(options?.spacingSec) || 0.06);
  const uniqueIds = Array.from(
    new Set((Array.isArray(clipIds) ? clipIds : []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!uniqueIds.length) return 0;
  const rowsByTrack = new Map();
  for (const clipId of uniqueIds) {
    const placement = getPlacementByClipId(placementMap, clipId);
    if (!placement) continue;
    const trackName = String(placement?.trackName || "").trim();
    if (!trackName) continue;
    if (!rowsByTrack.has(trackName)) rowsByTrack.set(trackName, []);
    rowsByTrack.get(trackName).push(placement);
  }
  let created = 0;
  for (const [trackName, placements] of rowsByTrack.entries()) {
    if (!Array.isArray(placements) || !placements.length) continue;
    placements.sort((a, b) => {
      const delta = Number(a?.timeSec || 0) - Number(b?.timeSec || 0);
      if (delta !== 0) return delta;
      return String(a?.clipId || "").localeCompare(String(b?.clipId || ""));
    });
    let trackCursorEnd = 0;
    for (const [key, value] of placementMap.entries()) {
      const normalized = normalizePlacementRecord("", key, value);
      if (String(normalized?.trackName || "").trim() !== trackName) continue;
      const end = Math.max(0, Number(normalized?.timeSec || 0)) + Math.max(0.1, Number(normalized?.durationSec || 0.1));
      if (end > trackCursorEnd) trackCursorEnd = end;
    }
    for (const placement of placements) {
      const resourceId = String(placement?.resourceId || "").trim();
      if (!resourceId) continue;
      const sourceDurationSec = Math.max(0.1, toFiniteNumber(placement?.sourceDurationSec) || 0.1);
      const startOffsetSec = Math.max(0, toFiniteNumber(placement?.startOffsetSec) || 0);
      const maxDurationBySource = Math.max(0.1, sourceDurationSec - startOffsetSec);
      const durationSec = Math.min(
        Math.max(0.1, toFiniteNumber(placement?.durationSec) || 0.1),
        maxDurationBySource
      );
      const next = appendPlacementForResource(placementMap, resourceId, {
        trackName,
        timeSec: Math.max(0, trackCursorEnd),
        durationSec,
        startOffsetSec,
        sourceDurationSec,
        autoDuration: false,
        linkGroupId: "",
      });
      if (!next) continue;
      trackCursorEnd = Math.max(trackCursorEnd, Number(next.timeSec || 0) + Math.max(0.1, Number(next.durationSec || 0.1)) + spacingSec);
      created += 1;
    }
  }
  return created;
}

function duplicateTrackPlacements(placementMap, studio, trackName, trackKind) {
  const safeTrackName = String(trackName || "").trim();
  const safeTrackKind = String(trackKind || "").trim().toLowerCase() || inferTrackKindFromName(safeTrackName);
  if (!safeTrackName || !safeTrackKind) return null;
  const eventsByTrack = studio?.eventsByTrack && typeof studio.eventsByTrack === "object"
    ? studio.eventsByTrack
    : null;
  if (!eventsByTrack) return null;
  const events = Array.isArray(eventsByTrack[safeTrackName]) ? eventsByTrack[safeTrackName] : [];
  if (!events.length) return null;
  const trackNames = new Set();
  const studioTracks = Array.isArray(studio?.tracks) ? studio.tracks : [];
  for (const track of studioTracks) {
    const name = String(track?.name || "").trim();
    if (name) trackNames.add(name);
  }
  for (const name of Object.keys(eventsByTrack)) {
    const safeName = String(name || "").trim();
    if (safeName) trackNames.add(safeName);
  }
  const duplicatedTrackName = createNextTrackNameFromTrack(safeTrackName, safeTrackKind, Array.from(trackNames.values()));
  if (!duplicatedTrackName) return null;
  let created = 0;
  for (const event of events) {
    const resourceId = String(event?.resourceId || "").trim();
    const clipId = String(event?.clipId || "").trim();
    if (!resourceId || !clipId) continue;
    const placement =
      getPlacementByClipId(placementMap, clipId, resourceId) ||
      getPrimaryPlacementForResource(placementMap, resourceId);
    if (!placement) continue;
    const next = appendPlacementForResource(placementMap, resourceId, {
      trackName: duplicatedTrackName,
      timeSec: Math.max(0, toFiniteNumber(placement?.timeSec) || 0),
      durationSec: Math.max(0.1, toFiniteNumber(placement?.durationSec) || 0.1),
      startOffsetSec: Math.max(0, toFiniteNumber(placement?.startOffsetSec) || 0),
      sourceDurationSec: Math.max(0.1, toFiniteNumber(placement?.sourceDurationSec) || 0.1),
      autoDuration: false,
      linkGroupId: "",
    });
    if (next) created += 1;
  }
  if (!created) return null;
  return {
    trackName: duplicatedTrackName,
    created,
  };
}

function normalizeCompositionPlacementInvariants(placementMap) {
  if (!placementMap || typeof placementMap.entries !== "function") return 0;
  const normalizedRows = [];
  let changed = 0;
  for (const [key, value] of Array.from(placementMap.entries())) {
    if (!value || typeof value !== "object") continue;
    const resourceId = String(value?.resourceId || inferResourceIdFromPlacementKey(key) || "").trim();
    if (!resourceId) continue;
    const normalized = normalizePlacementRecord(resourceId, key, value, { clipId: String(value?.clipId || key || "").trim() });
    const current = normalizePlacementRecord(resourceId, key, value);
    const hasDiff =
      String(current.trackName || "") !== String(normalized.trackName || "") ||
      Math.abs(Number(current.timeSec || 0) - Number(normalized.timeSec || 0)) > 1e-6 ||
      Math.abs(Number(current.durationSec || 0) - Number(normalized.durationSec || 0)) > 1e-6 ||
      Math.abs(Number(current.startOffsetSec || 0) - Number(normalized.startOffsetSec || 0)) > 1e-6 ||
      Math.abs(Number(current.sourceDurationSec || 0) - Number(normalized.sourceDurationSec || 0)) > 1e-6 ||
      String(current.linkGroupId || "") !== String(normalized.linkGroupId || "");
    if (hasDiff) {
      setPlacementRecord(placementMap, normalized);
      changed += 1;
    }
    normalizedRows.push(normalized);
  }
  const byTrack = new Map();
  for (const row of normalizedRows) {
    const trackName = String(row?.trackName || "").trim();
    if (!trackName) continue;
    if (!byTrack.has(trackName)) byTrack.set(trackName, []);
    byTrack.get(trackName).push(row);
  }
  for (const rows of byTrack.values()) {
    rows.sort((a, b) => {
      const delta = Number(a?.timeSec || 0) - Number(b?.timeSec || 0);
      if (delta !== 0) return delta;
      return String(a?.clipId || "").localeCompare(String(b?.clipId || ""));
    });
    let cursorSec = 0;
    for (const row of rows) {
      const sourceDurationSec = Math.max(0.1, toFiniteNumber(row?.sourceDurationSec) || 0.1);
      const maxOffsetSec = Math.max(0, sourceDurationSec - 0.1);
      const startOffsetSec = clamp(Math.max(0, toFiniteNumber(row?.startOffsetSec) || 0), 0, maxOffsetSec);
      const maxDurationSec = Math.max(0.1, sourceDurationSec - startOffsetSec);
      const durationSec = clamp(Math.max(0.1, toFiniteNumber(row?.durationSec) || 0.1), 0.1, maxDurationSec);
      let timeSec = Math.max(0, toFiniteNumber(row?.timeSec) || 0);
      if (timeSec < cursorSec - 1e-6) timeSec = cursorSec;
      const requiresUpdate =
        Math.abs(Number(row?.timeSec || 0) - timeSec) > 1e-6 ||
        Math.abs(Number(row?.durationSec || 0) - durationSec) > 1e-6 ||
        Math.abs(Number(row?.startOffsetSec || 0) - startOffsetSec) > 1e-6;
      if (requiresUpdate) {
        setPlacementRecord(placementMap, {
          ...row,
          timeSec,
          durationSec,
          startOffsetSec,
          sourceDurationSec,
        });
        changed += 1;
      }
      cursorSec = timeSec + durationSec;
    }
  }
  return changed;
}

function buildStudioData(resources, scopeKey) {
  const placementMap = getPlacementMap(scopeKey);
  normalizeCompositionPlacementInvariants(placementMap);
  const lockedTracks = getTrackLocks(scopeKey);
  const audioAssetByKey = {};
  const resourceDurationById = {};
  const tracksByName = new Map();
  const eventsByTrack = {};

  const ensureTrack = (track) => {
    const name = String(track?.name || "").trim();
    if (!name) return;
    if (!tracksByName.has(name)) tracksByName.set(name, { ...track, locked: lockedTracks.has(name) });
    if (!Array.isArray(eventsByTrack[name])) eventsByTrack[name] = [];
  };

  const kindCounter = {
    video: 0,
    image: 0,
    audio: 0,
  };

  for (const resource of resources) {
    const kind = String(resource?.kind || "").toLowerCase();
    if (kind !== "video" && kind !== "image" && kind !== "audio") continue;
    kindCounter[kind] = Math.max(0, Number(kindCounter[kind] || 0)) + 1;
    const clipDuration = defaultClipDurationSec(resource);
    const resourceId = String(resource?.id || `${kind}:${kindCounter[kind]}`);
    const resourceSourceDurationSec = resolveResourceSourceDurationSec(resource, clipDuration);
    resourceDurationById[resourceId] = resourceSourceDurationSec;
    let placements = collectPlacementsForResource(placementMap, resourceId);
    if (!placements.length) continue;
    placements = normalizePlacementLinkGroups(placementMap, resourceId, placements)
      .map((placement) => clampPlacementToSourceDuration(
        placementMap,
        resourceId,
        placement,
        resourceSourceDurationSec
      ));

    if (kind === "audio") {
      for (const placement of placements) {
        const placementKey = String(placement?.clipId || placement?.placementKey || buildPlacementKey(resourceId, 0));
        const preferredTrackName = String(placement?.trackName || "").trim();
        const channelMode = resolveAudioChannelModeFromResource(resource, preferredTrackName);
        const trackName = coerceAudioTrackNameForChannelMode(
          preferredTrackName || (channelMode === "mono" ? "Audio M1" : "Audio S1"),
          channelMode,
          kindCounter.audio
        );
        const timeSec = Math.max(0, toFiniteNumber(placement?.timeSec) || 0);
        const durationSec = Math.max(0.1, toFiniteNumber(placement?.durationSec) || clipDuration);
        const placementSourceDurationSec = Math.max(
          0.1,
          toFiniteNumber(placement?.sourceDurationSec) || resourceSourceDurationSec
        );
        const linkGroupId = String(placement?.linkGroupId || placementKey).trim() || placementKey;
        const assetKey = `audio:${resourceId}:${placementKey}`;
        if (resource?.src) audioAssetByKey[assetKey] = String(resource.src);

        ensureTrack({
          name: trackName,
          kind: "audio",
          channelMode,
          preserveEventDuration: true,
          partition: "step_tracks",
          source: resource.label || resourceId,
          audioAssetKey: assetKey,
          events: 0,
        });

        eventsByTrack[trackName].push({
          time: timeSec,
          duration: durationSec,
          label: resource.label || "audio",
          assetKey,
          resourceId,
          clipId: placementKey,
          startOffsetSec: Math.max(0, toFiniteNumber(placement?.startOffsetSec) || 0),
          sourceDurationSec: placementSourceDurationSec,
          linkGroupId,
          channelMode,
        });
      }
      continue;
    }

    for (const placement of placements) {
      const placementKey = String(placement?.clipId || placement?.placementKey || buildPlacementKey(resourceId, 0));
      const trackName = String(placement?.trackName || "").trim() || (kind === "video" ? "Video 1" : "Image 1");
      const timeSec = Math.max(0, toFiniteNumber(placement?.timeSec) || 0);
      const durationSec = Math.max(0.1, toFiniteNumber(placement?.durationSec) || clipDuration);
      const startOffsetSec = Math.max(0, toFiniteNumber(placement?.startOffsetSec) || 0);
      const placementSourceDurationSec = Math.max(
        0.1,
        toFiniteNumber(placement?.sourceDurationSec) || resourceSourceDurationSec
      );
      const linkGroupId = String(placement?.linkGroupId || placementKey).trim() || placementKey;
      ensureTrack({
        name: trackName,
        kind,
        partition: "step_tracks",
        source: resource.label || resourceId,
        audioAssetKey: "",
        events: 0,
      });
      eventsByTrack[trackName].push({
        time: timeSec,
        duration: durationSec,
        label: resource.label || kind,
        resourceId,
        clipId: placementKey,
        startOffsetSec,
        sourceDurationSec: placementSourceDurationSec,
        linkGroupId,
        hasAudio: kind === "video" && shouldRouteVideoAudio(resource),
        src: String(resource?.src || ""),
        previewSrc: String(resource?.previewSrc || ""),
      });
      if (kind === "video" && shouldRouteVideoAudio(resource) && resource?.src) {
        const linkedTracks = deriveVideoAudioTrackNames(trackName);
        const assetKey = `video_audio:${resourceId}:${placementKey}`;
        audioAssetByKey[assetKey] = String(resource.src);
        const linkedTrackName = linkedTracks.stereo;
        ensureTrack({
          name: linkedTrackName,
          kind: "audio",
          channelMode: "stereo",
          preserveEventDuration: true,
          partition: "step_tracks",
          source: `${resource.label || resourceId} audio`,
          audioAssetKey: assetKey,
          events: 0,
        });
        eventsByTrack[linkedTrackName].push({
          time: timeSec,
          duration: durationSec,
          label: `${resource.label || "video"} audio`,
          assetKey,
          resourceId,
          clipId: placementKey,
          startOffsetSec,
          sourceDurationSec: placementSourceDurationSec,
          linkGroupId,
        });
      }
    }
  }

  for (const [trackName, events] of Object.entries(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    events.sort((a, b) => {
      const t = toNumber(a?.time) - toNumber(b?.time);
      if (t !== 0) return t;
      return String(a?.clipId || "").localeCompare(String(b?.clipId || ""));
    });
    const track = tracksByName.get(trackName);
    if (track) track.events = events.length;
  }

  const nonDropzoneTracks = Array.from(tracksByName.values()).filter((track) => {
    const name = String(track?.name || "").trim();
    const kind = String(track?.kind || "").trim().toLowerCase();
    return Boolean(name) && kind !== "dropzone" && !isCompositionDropzoneTrackName(name);
  });
  const tracks = [
    createCompositionDropzoneTrack(COMPOSITION_DROPZONE_TOP_TRACK, lockedTracks.has(COMPOSITION_DROPZONE_TOP_TRACK), {
      events: 0,
      position: "top",
    }),
    ...nonDropzoneTracks,
    createCompositionDropzoneTrack(COMPOSITION_DROPZONE_BOTTOM_TRACK, lockedTracks.has(COMPOSITION_DROPZONE_BOTTOM_TRACK), {
      events: 0,
      position: "bottom",
    }),
  ];
  eventsByTrack[COMPOSITION_DROPZONE_TOP_TRACK] = [];
  eventsByTrack[COMPOSITION_DROPZONE_BOTTOM_TRACK] = [];
  const keepTrackNames = new Set(
    tracks.map((track) => String(track?.name || "").trim()).filter(Boolean)
  );
  for (const key of Object.keys(eventsByTrack)) {
    if (keepTrackNames.has(String(key || "").trim())) continue;
    delete eventsByTrack[key];
  }

  const maxEventEnd = Object.values(eventsByTrack).reduce((max, events) => {
    if (!Array.isArray(events)) return max;
    for (const event of events) {
      const end = toNumber(event?.time) + Math.max(0.1, toNumber(event?.duration, 0.1));
      if (end > max) max = end;
    }
    return max;
  }, 0);

  const durationSec = Math.max(6, maxEventEnd);
  const sections = [{ name: "Composition", start: 0, end: durationSec }];

  return {
    durationSec,
    tempoBpm: 120,
    sections,
    tracks,
    eventsByTrack,
    audioAssetByKey,
    resourceDurationById,
  };
}

const MOVE_ZERO_SNAP_SEC = 0.06;

function makeResourceCard(resource, onOpenAsset, options = {}) {
  ensureResourceHoverPreviewGuards();
  const tooltip = buildResourceTooltip(resource);
  const displayDuration = formatClipDuration(
    toFiniteNumber(options?.durationSec) ?? toFiniteNumber(resource?.meta?.durationSec)
  );
  const card = el("button", {
    class: "lemouf-loop-composition-resource",
    type: "button",
    title: tooltip || resource.label,
  });
  let stopVideoPreview = null;
  card.draggable = true;
  card.dataset.resourceId = String(resource?.id || "");
  card.addEventListener("dragstart", (event) => {
    if (typeof stopVideoPreview === "function") stopVideoPreview();
    const resourceId = String(resource?.id || "");
    const resourceKind = String(resource?.kind || "").toLowerCase();
    if (!resourceId || !event?.dataTransfer) return;
    try {
      event.dataTransfer.clearData();
    } catch {}
    event.dataTransfer.setData("application/x-lemouf-resource-id", resourceId);
    if (resourceKind) {
      event.dataTransfer.setData("application/x-lemouf-resource-kind", resourceKind);
    }
    event.dataTransfer.effectAllowed = "copyMove";
    try {
      globalThis.__lemoufResourceDragPayload = {
        resourceId,
        resourceKind,
      };
    } catch {}
  });
  card.addEventListener("dragend", () => {
    if (typeof stopVideoPreview === "function") stopVideoPreview();
    try {
      const payload = globalThis.__lemoufResourceDragPayload;
      if (payload && String(payload.resourceId || "") === String(resource?.id || "")) {
        globalThis.__lemoufResourceDragPayload = null;
      }
    } catch {}
  });
  const videoAudioState = String(resource?.videoAudioState || "unknown");
  const kindIconName = resource.kind === "audio"
    ? "media_audio"
    : (resource.kind === "video" ? "media_video" : "media_image");
  const kindTitle = resource.kind === "audio"
    ? "Audio resource"
    : (resource.kind === "video" ? "Video resource" : "Image resource");
  const kindBadge = el("span", {
    class: `lemouf-loop-composition-resource-kind ${resource.kind} ${
      resource.kind === "video" ? `is-${videoAudioState}` : ""
    }`,
    title: kindTitle,
  });
  kindBadge.appendChild(createIcon(kindIconName, {
    className: "lemouf-loop-composition-resource-kind-icon",
    size: 11,
    title: kindTitle,
  }));
  card.appendChild(kindBadge);

  if (resource.kind === "image" && (resource.previewSrc || resource.src)) {
    const imageCardSrc = String(resource?.src || resource?.previewSrc || "");
    const img = el("img", {
      class: "lemouf-loop-composition-resource-thumb",
      src: imageCardSrc,
      alt: resource.label,
    });
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    card.appendChild(img);
  } else if (resource.kind === "video") {
    const thumbWrap = el("div", { class: "lemouf-loop-composition-resource-thumb-wrap" });
    const previewCache = options?.previewCache && typeof options.previewCache === "object" ? options.previewCache : null;
    const previewSrc = String(resource?.previewSrc || "");
    const videoSrc = String(resource?.src || "");
    const cachedPosterSrc = !previewSrc && previewCache ? String(previewCache.videoPosterBySrc.get(videoSrc) || "") : "";
    const effectivePosterSrc = previewSrc || cachedPosterSrc;
    const hasPoster = Boolean(effectivePosterSrc);
    let poster = null;
    let fallbackNode = null;
    card.classList.toggle("is-video-no-poster", !hasPoster);
    if (effectivePosterSrc) {
      poster = el("img", {
        class: "lemouf-loop-composition-resource-thumb",
        src: effectivePosterSrc,
        alt: resource.label,
      });
      poster.draggable = false;
      thumbWrap.appendChild(poster);
      if (!previewSrc && cachedPosterSrc) {
        primeTimelineThumbCacheWithPoster(previewCache, videoSrc, cachedPosterSrc);
      }
    } else {
      fallbackNode = el("div", {
        class: "lemouf-loop-composition-resource-fallback",
        text: "VIDEO",
      });
      thumbWrap.appendChild(fallbackNode);
    }
    const audioFlagIconName =
      videoAudioState === "with_audio"
        ? "audio_on"
        : (videoAudioState === "no_audio" ? "audio_off" : "audio_unknown");
    const audioFlagTitle =
      videoAudioState === "with_audio"
        ? "Video with audio"
        : (videoAudioState === "no_audio" ? "Video without audio" : "Video audio unknown");
    const audioFlagNode = el("span", {
      class: `lemouf-loop-composition-resource-audio-flag is-${videoAudioState}`,
      title: audioFlagTitle,
    });
    audioFlagNode.appendChild(createIcon(audioFlagIconName, {
      className: "lemouf-loop-composition-resource-audio-flag-icon",
      size: 11,
      title: audioFlagTitle,
    }));
    thumbWrap.appendChild(audioFlagNode);
    if (displayDuration) {
      thumbWrap.appendChild(
        el("span", {
          class: "lemouf-loop-composition-resource-duration",
          text: displayDuration,
          title: `Clip duration: ${displayDuration}`,
        })
      );
    }
    if (videoSrc) {
      const video = document.createElement("video");
      video.className = "lemouf-loop-composition-resource-thumb lemouf-loop-composition-resource-thumb-video";
      video.src = videoSrc;
      video.draggable = false;
      video.preload = "metadata";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.volume = 0.8;
      video.addEventListener("loadedmetadata", () => {
        if (hasPoster) return;
        const duration = Number(video.duration || 0);
        const seekTo = Number.isFinite(duration) && duration > VIDEO_POSTER_SEEK_SEC
          ? VIDEO_POSTER_SEEK_SEC
          : 0;
        try {
          video.currentTime = seekTo;
        } catch {}
      });
      thumbWrap.appendChild(video);
      let hoverTimer = null;
      let hoverActive = false;
      let hoverIntent = false;
      let hoverSession = 0;
      const startPreview = () => {
        if (hoverActive || !hoverIntent || !card.isConnected) return;
        hoverActive = true;
        hoverSession += 1;
        const sessionId = hoverSession;
        setActiveResourceHoverPreviewStop(stopPreview);
        card.classList.add("is-video-previewing");
        const wantsAudioPreview =
          videoAudioState === "with_audio" &&
          Boolean(globalThis?.navigator?.userActivation?.hasBeenActive);
        video.muted = !wantsAudioPreview;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            if (!hoverActive || sessionId !== hoverSession || !hoverIntent) return;
            if (wantsAudioPreview) {
              // Deterministic fallback: keep hover preview active even if autoplay-with-audio is blocked.
              video.muted = true;
              const mutedPlay = video.play();
              if (mutedPlay && typeof mutedPlay.catch === "function") {
                mutedPlay.catch(() => {
                  if (sessionId !== hoverSession) return;
                  hoverActive = false;
                  card.classList.remove("is-video-previewing");
                  clearActiveResourceHoverPreviewStop(stopPreview);
                });
              }
              return;
            }
            if (sessionId !== hoverSession) return;
            hoverActive = false;
            card.classList.remove("is-video-previewing");
            clearActiveResourceHoverPreviewStop(stopPreview);
          });
        }
      };
      const stopPreview = () => {
        hoverIntent = false;
        hoverSession += 1;
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        if (hoverActive) {
          hoverActive = false;
          card.classList.remove("is-video-previewing");
        }
        try {
          video.pause();
          video.currentTime = 0;
          video.muted = true;
        } catch {}
        clearActiveResourceHoverPreviewStop(stopPreview);
      };
      stopVideoPreview = stopPreview;
      card.addEventListener("pointerdown", stopPreview, true);
      card.addEventListener("pointercancel", stopPreview, true);
      card.addEventListener("dragstart", stopPreview, true);
      card.addEventListener("dragend", stopPreview, true);
      card.addEventListener("pointerenter", () => {
        hoverIntent = true;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          if (!hoverIntent || !card.matches(":hover")) return;
          startPreview();
        }, VIDEO_HOVER_PREVIEW_DELAY_MS);
      });
      card.addEventListener("pointerleave", stopPreview);
      card.addEventListener("blur", stopPreview, true);
    }

    if (!hasPoster && videoSrc && previewCache) {
      void ensureVideoPosterDataUrl(previewCache, videoSrc).then((posterSrc) => {
        const safePosterSrc = String(posterSrc || "").trim();
        if (!safePosterSrc || !card.isConnected) return;
        primeTimelineThumbCacheWithPoster(previewCache, videoSrc, safePosterSrc);
        if (poster && poster.src === safePosterSrc) return;
        if (!poster) {
          poster = el("img", {
            class: "lemouf-loop-composition-resource-thumb",
            src: safePosterSrc,
            alt: resource.label,
          });
          if (fallbackNode && fallbackNode.parentNode === thumbWrap) {
            thumbWrap.removeChild(fallbackNode);
            fallbackNode = null;
          }
          thumbWrap.insertBefore(poster, thumbWrap.firstChild || null);
        } else {
          poster.src = safePosterSrc;
        }
        card.classList.remove("is-video-no-poster");
      });
    }
    card.appendChild(thumbWrap);
  } else {
    card.appendChild(
      el("div", {
        class: "lemouf-loop-composition-resource-fallback",
        text: resource.kind.toUpperCase(),
      })
    );
    if (displayDuration) {
      card.appendChild(
        el("div", {
          class: "lemouf-loop-composition-resource-duration-inline",
          text: displayDuration,
        })
      );
    }
  }

  card.appendChild(
    el("div", {
      class: "lemouf-loop-composition-resource-label",
      text: resource.label,
    })
  );

  card.addEventListener("click", () => {
    if (typeof stopVideoPreview === "function") stopVideoPreview();
    if (typeof onOpenAsset !== "function") return;
    const src = String(resource.src || resource.previewSrc || "");
    if (!src) return;
    const cycle = Number(resource?.cycle);
    const retry = Number(resource?.retry);
    const imageIndex = Number(resource?.index);
    const hasCycleContext = Number.isFinite(cycle) && cycle >= 0;
    const isPipelineResource = String(resource?.source || "").toLowerCase() === "pipeline";
    const context = hasCycleContext && isPipelineResource
      ? {
          mode: "cycle",
          cycleIndex: cycle,
          retryIndex: Number.isFinite(retry) ? retry : 0,
          imageIndex: Number.isFinite(imageIndex) ? imageIndex : 0,
        }
      : null;
    onOpenAsset(src, context);
  });
  return card;
}

export function clearLoopCompositionStudioView({ panelBody }) {
  if (!panelBody) return;
  stopActiveResourceHoverPreview();
  const leakingPreviews = panelBody.querySelectorAll?.(".lemouf-loop-composition-resource-thumb-video");
  if (leakingPreviews && leakingPreviews.length) {
    for (const video of leakingPreviews) {
      try {
        video.pause();
        video.currentTime = 0;
        video.muted = true;
      } catch {}
    }
  }
  const editorBodies = panelBody.querySelectorAll(".lemouf-loop-composition-editor-body");
  for (const editorBody of editorBodies) {
    clearStudioTimeline(editorBody);
  }
  panelBody.innerHTML = "";
  panelBody.textContent = "Open editor to compose loop resources.";
}

export function renderLoopCompositionStudioView({
  detail,
  panelBody,
  dockExpanded = false,
  onOpenAsset,
  compositionGate = null,
  monitorHost = null,
}) {
  if (!panelBody) return;
  clearLoopCompositionStudioView({ panelBody });
  if (!detail || typeof detail !== "object") return;
  const previousExternalDropGuard = panelBody.__lemoufExternalFileDropGuard;
  if (previousExternalDropGuard) {
    try {
      panelBody.removeEventListener("dragover", previousExternalDropGuard.dragover, true);
      panelBody.removeEventListener("drop", previousExternalDropGuard.drop, true);
    } catch {}
    panelBody.__lemoufExternalFileDropGuard = null;
  }

  const scopeKey = scopeKeyFromDetail(detail);
  const scopeAliases = collectCompositionScopeAliases(detail, scopeKey);
  hydrateScopeFromAliasesIfNeeded(scopeKey, scopeAliases);
  const previewCache = getCompositionPreviewCache(scopeKey);
  const layoutState = getCompositionLayoutState(scopeKey);
  const requestRender = () => {
    renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
  };

  const applyResourceAdditions = (additions) => {
    if (!Array.isArray(additions) || !additions.length) return false;
    appendManualResources(scopeKey, additions);
    requestRender();
    Promise.all(additions.map((resource) => probeManualMediaMetadata(resource))).then(() => {
      requestRender();
    });
    return true;
  };

  const addExternalFilesAsResources = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return false;
    const additions = [];
    for (const file of list) {
      const detected = detectKindFromFile(file);
      if (!detected) continue;
      const created = await createManualResourceWithBackendCache(file, detected, {
        scopeKey,
        loopId: detail?.loop_id,
      });
      additions.push(created);
    }
    return applyResourceAdditions(additions);
  };
  const isInternalResourceTransfer = (event) => {
    const dataTransfer = event?.dataTransfer;
    if (!dataTransfer) return false;
    try {
      const types = Array.from(dataTransfer.types || []);
      if (types.includes("application/x-lemouf-resource-id")) return true;
    } catch {}
    try {
      const payload = globalThis.__lemoufResourceDragPayload;
      if (payload && String(payload.resourceId || "").trim()) return true;
    } catch {}
    return false;
  };
  const isInResourcesZone = (event) => {
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    return Boolean(target.closest(".lemouf-loop-composition-resources"));
  };
  const isElementActuallyVisible = (node) => {
    if (!node || !(node instanceof Element)) return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return false;
    if (!node.isConnected) return false;
    return node.getClientRects().length > 0;
  };
  const isCompositionStudioVisible = () => {
    const compositionPanel = panelBody.closest(".lemouf-loop-composition-panel");
    const dock = panelBody.closest(".lemouf-song2daw-dock");
    if (!isElementActuallyVisible(panelBody)) return false;
    if (compositionPanel && !isElementActuallyVisible(compositionPanel)) return false;
    if (dock && !isElementActuallyVisible(dock)) return false;
    return true;
  };
  const isInTimelineZone = (event) => {
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;
    return Boolean(
      target.closest(".lemouf-song2daw-arrange-canvas-wrap") ||
      target.closest(".lemouf-song2daw-arrange-canvas")
    );
  };
  const handleExternalFileDragOver = (event) => {
    if (!isCompositionStudioVisible()) return;
    if (isInternalResourceTransfer(event)) {
      if (!isInTimelineZone(event)) {
        event.preventDefault();
        event.stopPropagation();
        try {
          event.dataTransfer.dropEffect = "none";
        } catch {}
      }
      return;
    }
    const files = event?.dataTransfer?.files;
    if (!files || !files.length) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.dataTransfer.dropEffect = isInResourcesZone(event) ? "copy" : "none";
    } catch {}
  };
  const handleExternalFileDrop = (event) => {
    if (!isCompositionStudioVisible()) return;
    if (isInternalResourceTransfer(event)) {
      if (!isInTimelineZone(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const files = event?.dataTransfer?.files;
    if (!files || !files.length) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isInResourcesZone(event)) return;
    void addExternalFilesAsResources(files);
  };
  panelBody.addEventListener("dragover", handleExternalFileDragOver, true);
  panelBody.addEventListener("drop", handleExternalFileDrop, true);
  panelBody.__lemoufExternalFileDropGuard = {
    dragover: handleExternalFileDragOver,
    drop: handleExternalFileDrop,
  };

  const openMediaPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,audio/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.wav,.mp3,.flac,.ogg,.m4a,.aac,.mp4,.webm,.mov,.mkv,.avi";
    input.addEventListener("change", () => {
      void addExternalFilesAsResources(input.files || []);
    });
    input.click();
  };

  const openApprovedExportPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const additions = [];
      for (const file of files) {
        const kind = detectKindFromFile(file);
        if (!kind) continue;
        const parsed = parseCycleRetryFromName(file?.name || "");
        const cycle = parsed?.cycle ?? null;
        const retry = parsed?.retry ?? 0;
        const sectionLabel = cycle != null ? `Cycle ${cycle + 1}` : "Approved Export";
        const label = cycle != null ? `cycle ${cycle + 1} · r${retry}` : String(file?.name || "export asset");
        additions.push(
          await createManualResourceWithBackendCache(file, kind, {
            source: "approved_export",
            cycle,
            retry,
            sectionId: cycle != null ? `cycle:${cycle}` : "approved_export",
            sectionOrder: cycle != null ? cycle : 900000,
            sectionLabel,
            label,
            scopeKey,
            loopId: detail?.loop_id,
          })
        );
      }
      if (!additions.length) return;
      applyResourceAdditions(additions);
    });
    input.click();
  };

  const resources = collectResources(detail);
  syncPreviewCacheWithResources(previewCache, resources);
  scheduleVideoPrewarm(previewCache, resources, requestRender, {
    splitPercent: layoutState?.splitPercent,
    viewportWidth: panelBody?.clientWidth,
  });
  ensureResourcesMetadata(scopeKey, resources, () => {
    requestRender();
  });
  synchronizePlacementDurationsWithResources(scopeKey, resources);
  const studio = buildStudioData(resources, scopeKey);
  const trackLockSet = getTrackLocks(scopeKey);
  const availableTrackNames = new Set(
    (Array.isArray(studio?.tracks) ? studio.tracks : [])
      .map((track) => String(track?.name || "").trim())
      .filter(Boolean)
  );
  const normalizedTrackLocks = new Set(
    Array.from(trackLockSet.values()).filter((name) => availableTrackNames.has(String(name || "").trim()))
  );
  if (normalizedTrackLocks.size !== trackLockSet.size) {
    setTrackLocks(scopeKey, normalizedTrackLocks);
  }
  for (const track of Array.isArray(studio?.tracks) ? studio.tracks : []) {
    const name = String(track?.name || "").trim();
    if (!name) continue;
    track.locked = normalizedTrackLocks.has(name);
  }
  const initialTimelineViewState = getTimelineViewState(scopeKey);
  const resourcesById = new Map(resources.map((resource) => [String(resource?.id || ""), resource]));
  panelBody.innerHTML = "";

  const summary = el("div", { class: "lemouf-song2daw-studio-meta" });
  summary.textContent = `resources ${resources.length}  |  duration ${studio.durationSec.toFixed(1)}s  |  tracks ${studio.tracks.length}`;

  const manualCount = getManualResources(scopeKey).length;
  const resourceHeader = el("div", { class: "lemouf-loop-composition-resources-head" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Resources" }),
    el("div", { class: "lemouf-loop-composition-resources-meta", text: `${resources.length} item(s)` }),
  ]);

  const actionButtons = [];
  const refreshResourceModeButtons = () => {
    setButtonIcon(sizeModeBtn, {
      icon: layoutState.sizeMode === "large" ? "panel_max" : "panel_restore",
      title: layoutState.sizeMode === "large"
        ? "Card size: large (switch to small)"
        : "Card size: small (switch to large)",
    });
    setButtonIcon(viewModeBtn, {
      icon: layoutState.viewMode === "thumb" ? "view_grid" : "view_list",
      title: layoutState.viewMode === "thumb"
        ? "View mode: thumbnails (switch to list)"
        : "View mode: list (switch to thumbnails)",
    });
  };
  const loadApprovedBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-action-btn",
    type: "button",
  });
  setButtonIcon(loadApprovedBtn, { icon: "import_approved", title: "Load approved export" });
  const addMediaBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-action-btn",
    type: "button",
  });
  setButtonIcon(addMediaBtn, { icon: "add_resource", title: "Add media resource" });
  const clearAddedBtn = el("button", {
    class: "lemouf-loop-btn ghost icon lemouf-loop-composition-action-btn",
    type: "button",
    disabled: manualCount <= 0,
  });
  setButtonIcon(clearAddedBtn, {
    icon: "clear_resources",
    title: manualCount > 0 ? `Clear added resources (${manualCount})` : "No added resources",
  });
  const sizeModeBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-action-btn",
    type: "button",
  });
  const viewModeBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-action-btn",
    type: "button",
  });
  refreshResourceModeButtons();
  actionButtons.push(loadApprovedBtn, addMediaBtn, clearAddedBtn);
  const resourceActionsTop = el("div", { class: "lemouf-loop-composition-resources-actions-top" }, actionButtons);
  const resourceActionsBottom = el("div", { class: "lemouf-loop-composition-resources-actions-bottom" }, [
    sizeModeBtn,
    viewModeBtn,
  ]);
  const resourceActions = el("div", { class: "lemouf-loop-composition-resources-actions" }, [
    resourceActionsTop,
    resourceActionsBottom,
  ]);
  loadApprovedBtn?.addEventListener("click", openApprovedExportPicker);
  addMediaBtn?.addEventListener("click", openMediaPicker);
  clearAddedBtn?.addEventListener("click", () => {
    if (manualCount <= 0) return;
    const confirmed = window.confirm(
      `Clear ${manualCount} manually added resource${manualCount > 1 ? "s" : ""}?`
    );
    if (!confirmed) return;
    clearManualResources(scopeKey);
    renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
  });
  sizeModeBtn?.addEventListener("click", () => {
    layoutState.sizeMode = layoutState.sizeMode === "large" ? "small" : "large";
    persistCompositionLayoutState(scopeKey, layoutState);
    requestRender();
  });
  viewModeBtn?.addEventListener("click", () => {
    layoutState.viewMode = layoutState.viewMode === "thumb" ? "list" : "thumb";
    persistCompositionLayoutState(scopeKey, layoutState);
    requestRender();
  });

  const resourceRail = el("div", { class: "lemouf-loop-composition-resources-rail" });
  if (!resources.length) {
    resourceRail.appendChild(
      el("div", { class: "lemouf-song2daw-step-empty", text: "No approved images yet. Add media manually if needed." })
    );
  } else {
    for (const resource of resources) {
      const durationSec = toFiniteNumber(resource?.meta?.durationSec);
      resourceRail.appendChild(
        makeResourceCard(resource, onOpenAsset, { durationSec, previewCache })
      );
    }
  }

  const resourcesContent = el("div", { class: "lemouf-loop-composition-resources-content" }, [
    resourceRail,
    resourceActions,
  ]);
  const resourcesPanel = el("div", { class: "lemouf-loop-composition-resources" }, [
    resourceHeader,
    resourcesContent,
  ]);
  resourcesPanel.dataset.sizeMode = layoutState.sizeMode;
  resourcesPanel.dataset.viewMode = layoutState.viewMode;
  resourcesPanel.dataset.resourceCount = String(resources.length);

  let trackKindByName = new Map();
  let visualTrackOrder = new Map();
  let audioTrackNamesByLinkKey = new Map();
  let visualEvents = [];
  let monitorDataDirty = true;
  const markMonitorDataDirty = () => {
    monitorDataDirty = true;
  };
  const rebuildMonitorData = () => {
    trackKindByName = new Map();
    visualTrackOrder = new Map();
    audioTrackNamesByLinkKey = new Map();
    visualEvents = [];
    (Array.isArray(studio.tracks) ? studio.tracks : []).forEach((track, index) => {
      const name = String(track?.name || "").trim();
      if (!name) return;
      const kind = String(track?.kind || "").toLowerCase();
      trackKindByName.set(name, kind);
      if (kind !== "video" && kind !== "image") return;
      visualTrackOrder.set(name, index);
    });
    const pushAudioTrackLink = (key, trackName) => {
      const normalizedKey = String(key || "").trim();
      const normalizedTrack = String(trackName || "").trim();
      if (!normalizedKey || !normalizedTrack) return;
      if (!audioTrackNamesByLinkKey.has(normalizedKey)) {
        audioTrackNamesByLinkKey.set(normalizedKey, new Set());
      }
      audioTrackNamesByLinkKey.get(normalizedKey).add(normalizedTrack);
    };
    for (const [trackName, events] of Object.entries(studio.eventsByTrack || {})) {
      if (String(trackKindByName.get(trackName) || "").toLowerCase() !== "audio") continue;
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        const clipId = String(event?.clipId || "").trim();
        const resourceId = String(event?.resourceId || "").trim();
        const linkGroupId = String(event?.linkGroupId || "").trim();
        if (linkGroupId) pushAudioTrackLink(`link:${linkGroupId}`, trackName);
        if (clipId || resourceId) pushAudioTrackLink(`clip:${resourceId}:${clipId}`, trackName);
      }
    }
    for (const [trackName, events] of Object.entries(studio.eventsByTrack || {})) {
      if (!visualTrackOrder.has(trackName)) continue;
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        const src = String(event?.src || event?.previewSrc || "").trim();
        if (!src) continue;
        const mediaKind = String(trackKindByName.get(trackName) || "video").toLowerCase();
        const start = Math.max(0, toNumber(event?.time, 0));
        const duration = Math.max(0.01, toNumber(event?.duration, 0.01));
        const end = start + duration;
        visualEvents.push({
          trackName,
          trackOrder: Number(visualTrackOrder.get(trackName) || 0),
          mediaKind: mediaKind === "image" ? "image" : "video",
          start,
          end,
          duration,
          src,
          label: String(event?.label || mediaKind),
          resourceId: String(event?.resourceId || ""),
          clipId: String(event?.clipId || ""),
          linkGroupId: String(event?.linkGroupId || ""),
          hasAudio: Boolean(event?.hasAudio),
          startOffsetSec: Math.max(0, toNumber(event?.startOffsetSec, 0)),
          sourceDurationSec: Math.max(0.01, toNumber(event?.sourceDurationSec, duration)),
        });
      }
    }
    visualEvents.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.trackOrder !== b.trackOrder) return b.trackOrder - a.trackOrder;
      return a.trackName.localeCompare(b.trackName);
    });
    monitorDataDirty = false;
  };
  rebuildMonitorData();
  const getLinkedAudioTrackNames = (event) => {
    const names = new Set();
    const linkGroupId = String(event?.linkGroupId || "").trim();
    const clipId = String(event?.clipId || "").trim();
    const resourceId = String(event?.resourceId || "").trim();
    const linkKeys = [];
    if (linkGroupId) linkKeys.push(`link:${linkGroupId}`);
    if (clipId || resourceId) linkKeys.push(`clip:${resourceId}:${clipId}`);
    for (const key of linkKeys) {
      const bucket = audioTrackNamesByLinkKey.get(key);
      if (!bucket) continue;
      for (const name of bucket) names.add(name);
    }
    return Array.from(names.values());
  };

  const reconcileLocalTracks = () => {
    if (!studio.eventsByTrack || typeof studio.eventsByTrack !== "object") {
      studio.eventsByTrack = {};
    }
    const lockSet = getTrackLocks(scopeKey);
    const tracks = Array.isArray(studio.tracks) ? studio.tracks : [];
    const nonDropTracks = [];
    const nonDropTrackNames = new Set();
    for (const track of tracks) {
      if (!track || typeof track !== "object") continue;
      const name = String(track?.name || "").trim();
      if (!name || isCompositionDropzoneTrackName(name)) continue;
      const kind = String(track?.kind || inferTrackKindFromName(name) || "").trim().toLowerCase();
      if (!kind || kind === "dropzone") continue;
      const rows = Array.isArray(studio.eventsByTrack[name]) ? studio.eventsByTrack[name] : [];
      if (!rows.length) {
        delete studio.eventsByTrack[name];
        continue;
      }
      track.kind = kind;
      track.events = rows.length;
      track.locked = lockSet.has(name);
      nonDropTracks.push(track);
      nonDropTrackNames.add(name);
    }
    for (const [trackName, rows] of Object.entries(studio.eventsByTrack)) {
      const name = String(trackName || "").trim();
      if (!name || isCompositionDropzoneTrackName(name) || nonDropTrackNames.has(name)) continue;
      if (!Array.isArray(rows) || !rows.length) {
        delete studio.eventsByTrack[name];
        continue;
      }
      const kind = String(inferTrackKindFromName(name) || "").trim().toLowerCase();
      if (!kind || kind === "dropzone") continue;
      nonDropTracks.push({
        name,
        kind,
        partition: "step_tracks",
        source: "",
        audioAssetKey: "",
        events: rows.length,
        locked: lockSet.has(name),
      });
      nonDropTrackNames.add(name);
    }
    studio.eventsByTrack[COMPOSITION_DROPZONE_TOP_TRACK] = [];
    studio.eventsByTrack[COMPOSITION_DROPZONE_BOTTOM_TRACK] = [];
    const keepNames = new Set([
      COMPOSITION_DROPZONE_TOP_TRACK,
      COMPOSITION_DROPZONE_BOTTOM_TRACK,
      ...Array.from(nonDropTrackNames),
    ]);
    for (const key of Object.keys(studio.eventsByTrack)) {
      if (keepNames.has(String(key || "").trim())) continue;
      delete studio.eventsByTrack[key];
    }
    studio.tracks = [
      createCompositionDropzoneTrack(COMPOSITION_DROPZONE_TOP_TRACK, lockSet.has(COMPOSITION_DROPZONE_TOP_TRACK), {
        position: "top",
      }),
      ...nonDropTracks,
      createCompositionDropzoneTrack(COMPOSITION_DROPZONE_BOTTOM_TRACK, lockSet.has(COMPOSITION_DROPZONE_BOTTOM_TRACK), {
        position: "bottom",
      }),
    ];
  };

  const ensureLocalTrack = (trackName, kind, patch = {}) => {
    const name = String(trackName || "").trim();
    const normalizedKind = String(kind || inferTrackKindFromName(name) || "").toLowerCase();
    if (!name || !normalizedKind) return null;
    if (!studio.eventsByTrack || typeof studio.eventsByTrack !== "object") {
      studio.eventsByTrack = {};
    }
    if (!Array.isArray(studio.eventsByTrack[name])) {
      studio.eventsByTrack[name] = [];
    }
    const tracks = Array.isArray(studio.tracks) ? studio.tracks : [];
    const patchObj = patch && typeof patch === "object" ? patch : {};
    const rawInsertIndex = Number(patchObj.insertIndex);
    const hasInsertIndex = Number.isFinite(rawInsertIndex);
    const { insertIndex: _dropInsertIndex, ...safePatch } = patchObj;
    let row = tracks.find((item) => String(item?.name || "").trim() === name) || null;
    const resolveInsertIndex = () => {
      const fallbackBottomIndex = tracks.findIndex(
        (item) => String(item?.name || "").trim() === COMPOSITION_DROPZONE_BOTTOM_TRACK
      );
      const fallback = fallbackBottomIndex >= 0 ? fallbackBottomIndex : tracks.length;
      if (!hasInsertIndex) return fallback;
      return clamp(Math.round(rawInsertIndex), 1, Math.max(1, tracks.length - 1));
    };
    if (!row) {
      row = {
        name,
        kind: normalizedKind,
        partition: "step_tracks",
        source: "",
        audioAssetKey: "",
        events: 0,
        ...safePatch,
      };
      const nextInsertIndex = resolveInsertIndex();
      tracks.splice(nextInsertIndex, 0, row);
      studio.tracks = tracks;
    } else {
      Object.assign(row, safePatch);
      if (!String(row.kind || "").trim()) row.kind = normalizedKind;
      if (hasInsertIndex) {
        const fromIndex = tracks.indexOf(row);
        let toIndex = resolveInsertIndex();
        if (fromIndex >= 0) {
          tracks.splice(fromIndex, 1);
          if (toIndex > fromIndex) toIndex -= 1;
          toIndex = clamp(toIndex, 1, Math.max(1, tracks.length));
          tracks.splice(toIndex, 0, row);
        }
      }
    }
    return row;
  };

  const sortLocalTrackEvents = (trackName) => {
    const name = String(trackName || "").trim();
    const rows = Array.isArray(studio.eventsByTrack?.[name]) ? studio.eventsByTrack[name] : null;
    if (!rows) return;
    rows.sort((a, b) => {
      const ta = Number(a?.time || 0);
      const tb = Number(b?.time || 0);
      if (ta !== tb) return ta - tb;
      return String(a?.clipId || "").localeCompare(String(b?.clipId || ""));
    });
    const row = Array.isArray(studio.tracks)
      ? studio.tracks.find((item) => String(item?.name || "").trim() === name)
      : null;
    if (row) row.events = rows.length;
  };

  const refreshLocalStudioDuration = () => {
    reconcileLocalTracks();
    const maxEnd = Object.values(studio.eventsByTrack || {}).reduce((max, events) => {
      if (!Array.isArray(events)) return max;
      for (const event of events) {
        const end = Number(event?.time || 0) + Math.max(0.01, Number(event?.duration || 0.01));
        if (end > max) max = end;
      }
      return max;
    }, 0);
    // Composition duration must reflect actual placed media span.
    studio.durationSec = Math.max(6, maxEnd);
    const sections = Array.isArray(studio.sections) ? studio.sections : [];
    if (sections.length) {
      const last = sections[sections.length - 1];
      if (last && typeof last === "object") {
        last.end = Math.max(Number(last.start || 0), studio.durationSec);
      }
    }
    markMonitorDataDirty();
  };

  const monitorPanel = el("div", { class: "lemouf-loop-composition-monitor" });
  const monitorStatus = el("div", { class: "lemouf-loop-composition-monitor-status", text: "No visual clip at playhead." });
  const monitorInfo = el("div", { class: "lemouf-loop-composition-monitor-info", text: "No audio" });
  const monitorHead = el("div", { class: "lemouf-loop-composition-monitor-head" }, [
    monitorStatus,
    monitorInfo,
  ]);
  const monitorStage = el("div", { class: "lemouf-loop-composition-monitor-stage" });
  const monitorVideo = document.createElement("video");
  monitorVideo.className = "lemouf-loop-composition-monitor-video";
  monitorVideo.preload = "auto";
  monitorVideo.muted = true;
  monitorVideo.playsInline = true;
  const monitorImage = document.createElement("img");
  monitorImage.className = "lemouf-loop-composition-monitor-image";
  monitorImage.alt = "Composition preview image";
  const monitorEmpty = el("div", {
    class: "lemouf-loop-composition-monitor-empty",
    text: "No visual clip at current position.",
  });
  const setMonitorStageState = (mode = "empty", { isGap = false, emptyText = null } = {}) => {
    const showVideo = mode === "video";
    const showImage = mode === "image";
    monitorVideo.classList.toggle("is-visible", showVideo);
    monitorImage.classList.toggle("is-visible", showImage);
    monitorStage.classList.toggle("is-gap", Boolean(isGap));
    if (typeof emptyText === "string") monitorEmpty.textContent = emptyText;
    monitorEmpty.hidden = showVideo || showImage;
  };
  setMonitorStageState("empty", { isGap: false });
  monitorStage.append(monitorVideo, monitorImage, monitorEmpty);
  const monitorSaveBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-monitor-action-btn",
    type: "button",
    disabled: true,
  });
  setButtonIcon(monitorSaveBtn, { icon: "save_project", title: "Save project (soon)" });
  const monitorExportBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-monitor-action-btn",
    type: "button",
    disabled: true,
  });
  setButtonIcon(monitorExportBtn, { icon: "export_render", title: "Export render (soon)" });
  const monitorActions = el("div", { class: "lemouf-loop-composition-monitor-actions" }, [
    el("div", { class: "lemouf-loop-composition-monitor-actions-group" }, [monitorSaveBtn]),
    el("div", { class: "lemouf-loop-composition-monitor-actions-separator", "aria-hidden": "true" }),
    el("div", { class: "lemouf-loop-composition-monitor-actions-group" }, [monitorExportBtn]),
  ]);
  monitorPanel.append(monitorHead, monitorStage, monitorActions);

  const editorBody = el("div", {
    class: "lemouf-song2daw-studio-body lemouf-loop-composition-editor-body",
  });

  const resolvedMonitorHost = monitorHost && typeof monitorHost.appendChild === "function"
    ? monitorHost
    : null;
  let topContent = null;
  if (resolvedMonitorHost) {
    resourcesPanel.classList.add("is-monitor-detached");
    monitorPanel.classList.add("is-embedded-host");
    resolvedMonitorHost.innerHTML = "";
    resolvedMonitorHost.appendChild(monitorPanel);
    topContent = resourcesPanel;
  } else {
    const topDeck = el("div", { class: "lemouf-loop-composition-top-deck" }, [
      resourcesPanel,
      el("div", {
        class: "lemouf-loop-composition-splitter",
        role: "separator",
        tabindex: "0",
        "aria-orientation": "vertical",
        "aria-label": "Resize resources and video monitor",
        title: "Drag to resize resources and monitor. Double-click to reset 50/50.",
      }),
      monitorPanel,
    ]);
    const splitter = topDeck.querySelector(".lemouf-loop-composition-splitter");
    let splitPercent = clamp(
      toNumber(layoutState.splitPercent, 50),
      COMPOSITION_SPLIT_MIN_PERCENT,
      COMPOSITION_SPLIT_MAX_PERCENT
    );
    const applySplit = () => {
      topDeck.style.setProperty("--lemouf-composition-split", `${splitPercent}%`);
      if (splitter) splitter.setAttribute("aria-valuenow", `${Math.round(splitPercent)}`);
    };
    applySplit();
    if (splitter) {
      splitter.setAttribute("aria-valuemin", `${COMPOSITION_SPLIT_MIN_PERCENT}`);
      splitter.setAttribute("aria-valuemax", `${COMPOSITION_SPLIT_MAX_PERCENT}`);
      let dragState = null;
      const stopDrag = () => {
        if (!dragState) return;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stopDrag);
        window.removeEventListener("pointercancel", stopDrag);
        if (dragState.pointerId != null) {
          try {
            splitter.releasePointerCapture?.(dragState.pointerId);
          } catch {}
        }
        dragState = null;
        topDeck.classList.remove("is-resizing");
        layoutState.splitPercent = splitPercent;
        persistCompositionLayoutState(scopeKey, layoutState);
      };
      const onPointerMove = (event) => {
        if (!dragState) return;
        const width = Math.max(1, dragState.bounds.width);
        const raw = ((event.clientX - dragState.bounds.left) / width) * 100;
        splitPercent = clamp(raw, COMPOSITION_SPLIT_MIN_PERCENT, COMPOSITION_SPLIT_MAX_PERCENT);
        applySplit();
      };
      splitter.addEventListener("pointerdown", (event) => {
        if (window.matchMedia?.("(max-width: 1180px)").matches) return;
        event.preventDefault();
        dragState = {
          pointerId: event.pointerId,
          bounds: topDeck.getBoundingClientRect(),
        };
        topDeck.classList.add("is-resizing");
        try {
          splitter.setPointerCapture?.(event.pointerId);
        } catch {}
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", stopDrag);
        window.addEventListener("pointercancel", stopDrag);
      });
      splitter.addEventListener("dblclick", () => {
        splitPercent = 50;
        layoutState.splitPercent = splitPercent;
        persistCompositionLayoutState(scopeKey, layoutState);
        applySplit();
      });
      splitter.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
        event.preventDefault();
        if (event.key === "Home") {
          splitPercent = 50;
        } else {
          const step = event.shiftKey ? 6 : 3;
          splitPercent += event.key === "ArrowLeft" ? -step : step;
        }
        splitPercent = clamp(splitPercent, COMPOSITION_SPLIT_MIN_PERCENT, COMPOSITION_SPLIT_MAX_PERCENT);
        layoutState.splitPercent = splitPercent;
        persistCompositionLayoutState(scopeKey, layoutState);
        applySplit();
      });
    }
    topContent = topDeck;
  }

  const rowSplitter = el("div", {
    class: "lemouf-loop-composition-row-splitter",
    role: "separator",
    tabindex: "0",
    "aria-orientation": "horizontal",
    "aria-label": "Resize top deck and composition timeline",
    title: "Drag to resize top deck and composition timeline. Double-click to reset 50/50.",
  });
  const mainSplit = el("div", { class: "lemouf-loop-composition-main-split" }, [
    topContent || resourcesPanel,
    rowSplitter,
    editorBody,
  ]);
  let rowSplitPercent = clamp(
    toNumber(layoutState.rowSplitPercent, 50),
    COMPOSITION_ROW_SPLIT_MIN_PERCENT,
    COMPOSITION_ROW_SPLIT_MAX_PERCENT
  );
  const applyRowSplit = () => {
    mainSplit.style.setProperty("--lemouf-composition-row-split", `${rowSplitPercent}%`);
    rowSplitter.setAttribute("aria-valuenow", `${Math.round(rowSplitPercent)}`);
  };
  applyRowSplit();
  rowSplitter.setAttribute("aria-valuemin", `${COMPOSITION_ROW_SPLIT_MIN_PERCENT}`);
  rowSplitter.setAttribute("aria-valuemax", `${COMPOSITION_ROW_SPLIT_MAX_PERCENT}`);
  let rowDragState = null;
  const stopRowDrag = () => {
    if (!rowDragState) return;
    window.removeEventListener("pointermove", onRowPointerMove);
    window.removeEventListener("pointerup", stopRowDrag);
    window.removeEventListener("pointercancel", stopRowDrag);
    if (rowDragState.pointerId != null) {
      try {
        rowSplitter.releasePointerCapture?.(rowDragState.pointerId);
      } catch {}
    }
    rowDragState = null;
    mainSplit.classList.remove("is-row-resizing");
    layoutState.rowSplitPercent = rowSplitPercent;
    persistCompositionLayoutState(scopeKey, layoutState);
  };
  const onRowPointerMove = (event) => {
    if (!rowDragState) return;
    const height = Math.max(1, rowDragState.bounds.height);
    const raw = ((event.clientY - rowDragState.bounds.top) / height) * 100;
    rowSplitPercent = clamp(raw, COMPOSITION_ROW_SPLIT_MIN_PERCENT, COMPOSITION_ROW_SPLIT_MAX_PERCENT);
    applyRowSplit();
  };
  rowSplitter.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    rowDragState = {
      pointerId: event.pointerId,
      bounds: mainSplit.getBoundingClientRect(),
    };
    mainSplit.classList.add("is-row-resizing");
    try {
      rowSplitter.setPointerCapture?.(event.pointerId);
    } catch {}
    window.addEventListener("pointermove", onRowPointerMove);
    window.addEventListener("pointerup", stopRowDrag);
    window.addEventListener("pointercancel", stopRowDrag);
  });
  rowSplitter.addEventListener("dblclick", () => {
    rowSplitPercent = 50;
    layoutState.rowSplitPercent = rowSplitPercent;
    persistCompositionLayoutState(scopeKey, layoutState);
    applyRowSplit();
  });
  rowSplitter.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home") return;
    event.preventDefault();
    if (event.key === "Home") {
      rowSplitPercent = 50;
    } else {
      const step = event.shiftKey ? 6 : 3;
      rowSplitPercent += event.key === "ArrowUp" ? -step : step;
    }
    rowSplitPercent = clamp(rowSplitPercent, COMPOSITION_ROW_SPLIT_MIN_PERCENT, COMPOSITION_ROW_SPLIT_MAX_PERCENT);
    layoutState.rowSplitPercent = rowSplitPercent;
    persistCompositionLayoutState(scopeKey, layoutState);
    applyRowSplit();
  });
  panelBody.append(summary, mainSplit);

  let monitorCurrentKey = "";
  let monitorCurrentMediaKind = "";
  let monitorSelectedTrackName = "";
  let monitorSelectedClipId = "";
  let monitorPendingLocalTimeSec = 0;
  let monitorPendingPlay = false;
  let monitorPendingScrub = false;
  let monitorAllowAudio = false;
  const MONITOR_EDGE_EPS_SEC = 1 / 90;
  const pickMonitorEvent = (events, playheadSec, { isPlaying = false, isScrubbing = false } = {}) => {
    const rows = Array.isArray(events) ? events : [];
    const time = Math.max(0, toNumber(playheadSec, 0));
    const eps = isPlaying || isScrubbing ? Math.max(MONITOR_EDGE_EPS_SEC, 1 / 30) : MONITOR_EDGE_EPS_SEC;
    const active = rows.filter(
      (event) => time >= event.start - eps && time <= event.end + eps
    );
    if (active.length) {
      active.sort((a, b) => {
        if (a.trackOrder !== b.trackOrder) return b.trackOrder - a.trackOrder;
        if (a.start !== b.start) return b.start - a.start;
        return a.trackName.localeCompare(b.trackName);
      });
      return active[0] || null;
    }
    return null;
  };
  const applyMonitorTransport = () => {
    const duration = Number(monitorVideo.duration || 0);
    const maxLocal = Number.isFinite(duration) && duration > 0.05
      ? Math.max(0, duration - 0.02)
      : Number.POSITIVE_INFINITY;
    const targetLocal = Math.max(0, Math.min(maxLocal, Number(monitorPendingLocalTimeSec || 0)));
    monitorVideo.muted = !monitorAllowAudio;
    const currentLocal = Number(monitorVideo.currentTime || 0);
    const drift = Math.abs(currentLocal - targetLocal);
    const seekThreshold = monitorPendingScrub ? 0.008 : (monitorPendingPlay ? 0.18 : 0.03);
    try {
      if (drift > seekThreshold) {
        if (monitorPendingScrub && typeof monitorVideo.fastSeek === "function") {
          monitorVideo.fastSeek(targetLocal);
        } else {
          monitorVideo.currentTime = targetLocal;
        }
      }
    } catch {}
    if (monitorPendingPlay) {
      const p = monitorVideo.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Deterministic fallback: if autoplay-with-audio is blocked, keep monitor video playing muted.
          if (monitorAllowAudio) {
            monitorVideo.muted = true;
            const retry = monitorVideo.play();
            if (retry && typeof retry.catch === "function") retry.catch(() => {});
          }
        });
      }
    } else {
      try { monitorVideo.pause(); } catch {}
    }
  };
  monitorVideo.addEventListener("loadedmetadata", applyMonitorTransport);
  monitorVideo.addEventListener("canplay", applyMonitorTransport);
  monitorVideo.addEventListener("error", () => {
    monitorAllowAudio = false;
    setMonitorStageState("empty", { isGap: false, emptyText: "No visual clip at current position." });
    monitorStatus.textContent = "Unable to load video source.";
  });
  const clearMonitorVideoSource = () => {
    try { monitorVideo.pause(); } catch {}
    try {
      monitorVideo.removeAttribute("src");
      monitorVideo.load();
    } catch {}
  };
  const clearMonitorImageSource = () => {
    try {
      monitorImage.removeAttribute("src");
    } catch {}
  };
  const syncVideoMonitor = ({
    playheadSec = 0,
    isPlaying = false,
    modeLabel = "idle",
    isScrubbing = false,
    mutedTracks = [],
    hasAudibleTimelineAudio = false,
    previewClipEdits = null,
  } = {}) => {
    if (monitorDataDirty) rebuildMonitorData();
    const previewMap = previewClipEdits && typeof previewClipEdits === "object" ? previewClipEdits : {};
    const previewFor = (event) => {
      const key = String(event?.clipId || "").trim();
      if (!key) return null;
      const scopedKey = `${String(event?.trackName || "").trim()}::${key}`;
      const scoped = previewMap[scopedKey];
      if (scoped && typeof scoped === "object") return scoped;
      const preview = previewMap[key];
      return preview && typeof preview === "object" ? preview : null;
    };
    const materializedEvents = visualEvents.map((event) => {
      const preview = previewFor(event);
      if (!preview) return event;
      const start = Math.max(0, toNumber(preview.start, event.start));
      const end = Math.max(start + 0.01, toNumber(preview.end, event.end));
      return {
        ...event,
        trackName: String(preview.trackName || event.trackName),
        start,
        end,
        duration: end - start,
        startOffsetSec: Math.max(0, toNumber(preview.startOffsetSec, event.startOffsetSec)),
        sourceDurationSec: Math.max(0.01, toNumber(preview.sourceDurationSec, event.sourceDurationSec)),
      };
    });
    const mutedTrackSet = new Set((Array.isArray(mutedTracks) ? mutedTracks : []).map((name) => String(name || "").trim()));
    if (!materializedEvents.length) {
      monitorAllowAudio = false;
      monitorPendingScrub = false;
      monitorPendingPlay = false;
      monitorCurrentKey = "";
      monitorCurrentMediaKind = "";
      monitorSelectedTrackName = "";
      monitorSelectedClipId = "";
      clearMonitorVideoSource();
      clearMonitorImageSource();
      setMonitorStageState("empty", { isGap: false, emptyText: "No visual clip at current position." });
      monitorStatus.textContent = "No visual resource loaded.";
      monitorInfo.textContent = "No audio";
      return;
    }
    const selected = pickMonitorEvent(materializedEvents, playheadSec, {
      isPlaying: Boolean(isPlaying),
      isScrubbing: Boolean(isScrubbing),
    });
    if (!selected) {
      monitorCurrentKey = "";
      monitorCurrentMediaKind = "";
      monitorSelectedTrackName = "";
      monitorSelectedClipId = "";
      monitorAllowAudio = false;
      monitorPendingPlay = false;
      monitorPendingScrub = false;
      try { monitorVideo.pause(); } catch {}
      clearMonitorImageSource();
      setMonitorStageState("empty", { isGap: true, emptyText: "" });
      monitorStatus.textContent = "No visual clip at playhead.";
      monitorInfo.textContent = `${modeLabel} · ${Number(playheadSec || 0).toFixed(2)}s`;
      return;
    }
    const eventKey = `${selected.trackName}:${selected.clipId || selected.resourceId}:${selected.start.toFixed(4)}`;
    const clipOffset = Math.max(0, Number(selected.startOffsetSec || 0));
    const clipLocalTime = Math.max(0, Number(playheadSec || 0) - selected.start);
    const sourceDurationSec = Math.max(0.01, Number(selected.sourceDurationSec || selected.duration || 0.01));
    const localTime = Math.max(
      0,
      Math.min(Math.max(0.01, sourceDurationSec - 0.02), clipOffset + clipLocalTime)
    );
    const linkedAudioTracks = getLinkedAudioTrackNames(selected);
    const hasLinkedAudioTrack = linkedAudioTracks.length > 0;
    const hasAudibleLinkedAudioTrack = linkedAudioTracks.some((trackName) => !mutedTrackSet.has(trackName));
    const monitorIsVideo = String(selected.mediaKind || "video") === "video";
    monitorAllowAudio =
      monitorIsVideo &&
      Boolean(isPlaying) &&
      !Boolean(isScrubbing) &&
      Boolean(selected.hasAudio) &&
      !hasLinkedAudioTrack &&
      !Boolean(hasAudibleLinkedAudioTrack) &&
      !Boolean(hasAudibleTimelineAudio);
    monitorPendingLocalTimeSec = localTime;
    monitorPendingPlay = Boolean(isPlaying);
    monitorPendingScrub = Boolean(isScrubbing);
    const normalizedSelectedSrc = normalizeMediaSrcForCompare(selected.src);
    const normalizedMonitorSrc = monitorIsVideo
      ? normalizeMediaSrcForCompare(monitorVideo.src)
      : normalizeMediaSrcForCompare(monitorImage.src);
    const mediaKindChanged = monitorCurrentMediaKind !== String(selected.mediaKind || "video");
    const sourceChanged = normalizedMonitorSrc !== normalizedSelectedSrc;
    monitorCurrentKey = eventKey;
    monitorCurrentMediaKind = String(selected.mediaKind || "video");
    monitorSelectedTrackName = String(selected.trackName || "");
    monitorSelectedClipId = String(selected.clipId || "");
    if (monitorIsVideo) {
      clearMonitorImageSource();
      if (mediaKindChanged || sourceChanged) {
        monitorVideo.src = selected.src;
        try { monitorVideo.load(); } catch {}
        applyMonitorTransport();
      } else {
        applyMonitorTransport();
      }
    } else {
      try { monitorVideo.pause(); } catch {}
      if (mediaKindChanged) clearMonitorVideoSource();
      if (mediaKindChanged || sourceChanged) {
        monitorImage.src = selected.src;
      }
      monitorPendingPlay = false;
      monitorPendingScrub = false;
      monitorAllowAudio = false;
      applyMonitorTransport();
    }
    setMonitorStageState(selected.mediaKind === "image" ? "image" : "video");
    monitorStatus.textContent = `${selected.trackName} · ${selected.label}`;
    monitorInfo.textContent =
      `${modeLabel} · clip ${selected.start.toFixed(2)}-${selected.end.toFixed(2)}s · local ${localTime.toFixed(2)}s${
        monitorAllowAudio ? " · monitor audio" : ""
      }`;
  };

  renderStudioTimeline({
    runData: { summary: { steps: [] } },
    studioData: {
      tempoBpm: studio.tempoBpm,
      durationSec: studio.durationSec,
      sections: studio.sections,
      tracks: studio.tracks,
      eventsByTrack: studio.eventsByTrack,
      resourceDurationById: studio.resourceDurationById,
    },
    body: editorBody,
    layoutMode: dockExpanded ? "full" : "compact",
    allowDurationExtend: true,
    dropTargetMode: "strict",
    previewQualityHint: String(previewCache?.qualityHint || "auto"),
    externalClipThumbCache: previewCache.timelineThumbCache,
    initialViewState: initialTimelineViewState,
    onViewStateChange: (snapshot) => {
      setTimelineViewState(scopeKey, snapshot);
    },
    onJumpToStep: null,
    onOpenRunDir: null,
    onResolveAudioUrl: (assetKey) => {
      const key = String(assetKey || "");
      if (!key) return "";
      return String(studio.audioAssetByKey[key] || "");
    },
    onDropResource: ({ resourceId, resourceKind, trackName, timeSec, insertMode = false, insertIndex = null }) =>
      withCompositionHistory(scopeKey, () => {
      const id = String(resourceId || "");
      let track = String(trackName || "").trim();
      if (!id) return false;
      const resource = resourcesById.get(id);
      if (!resource) return false;
      reconcileLocalTracks();
      const kind = String(resourceKind || resource?.kind || "").toLowerCase();
      const requestedInsertMode = Boolean(insertMode);
      const requestedInsertIndexRaw = Number(insertIndex);
      const hasRequestedInsertIndex = Number.isFinite(requestedInsertIndexRaw);
      const existingTracks = (Array.isArray(studio?.tracks) ? studio.tracks : []).filter((item) => {
        const name = String(item?.name || "").trim();
        const trackKind = String(item?.kind || "").trim().toLowerCase();
        return Boolean(name) && trackKind !== "dropzone" && !isCompositionDropzoneTrackName(name);
      });
      let trackInfo = track
        ? (Array.isArray(studio?.tracks) ? studio.tracks : []).find((item) => String(item?.name || "").trim() === track)
        : null;
      const dropzoneTarget = isCompositionDropzoneTrackName(track) || String(trackInfo?.kind || "").trim().toLowerCase() === "dropzone";
      if (dropzoneTarget) {
        track = "";
        trackInfo = null;
      }
      let resolvedInsertIndex = null;
      if (hasRequestedInsertIndex) {
        const totalTracks = Array.isArray(studio?.tracks) ? studio.tracks.length : 0;
        resolvedInsertIndex = clamp(Math.round(requestedInsertIndexRaw), 1, Math.max(1, totalTracks - 1));
      } else if (dropzoneTarget) {
        const allTracks = Array.isArray(studio?.tracks) ? studio.tracks : [];
        if (String(trackName || "").trim() === COMPOSITION_DROPZONE_TOP_TRACK) {
          resolvedInsertIndex = 1;
        } else {
          const bottomIndex = allTracks.findIndex(
            (item) => String(item?.name || "").trim() === COMPOSITION_DROPZONE_BOTTOM_TRACK
          );
          resolvedInsertIndex = bottomIndex >= 0 ? bottomIndex : Math.max(1, allTracks.length - 1);
        }
      }
      const forceCreateLane = requestedInsertMode || dropzoneTarget;
      const desiredKind = kind === "audio" ? "audio" : (kind === "video" ? "video" : "image");
      if (forceCreateLane) {
        track = createNextTrackNameByKind(
          desiredKind,
          existingTracks.map((item) => String(item?.name || "").trim()).filter(Boolean)
        );
        trackInfo = null;
      }
      if (!track) {
        const candidate = existingTracks.find(
          (item) => String(item?.kind || "").toLowerCase() === desiredKind
        );
        track = String(candidate?.name || "").trim() || createNextTrackNameByKind(
          desiredKind,
          existingTracks.map((item) => String(item?.name || "").trim()).filter(Boolean)
        );
      }
      if (!track) return false;
      trackInfo = (Array.isArray(studio?.tracks) ? studio.tracks : []).find((item) => String(item?.name || "").trim() === track) || null;
      const trackKind = String(trackInfo?.kind || inferTrackKindFromName(track)).toLowerCase();
      if (!trackKind || trackKind === "dropzone") return false;
      if (kind === "audio" && trackKind !== "audio") return false;
      if ((kind === "image" || kind === "video") && trackKind !== kind) return false;
      const scopePlacements = getPlacementMap(scopeKey);
      const hintedDuration = Math.max(0.1, toFiniteNumber(resource?.meta?.durationSec) || defaultClipDurationSec(resource));
      const hintedSourceDurationSec = resolveResourceSourceDurationSec(resource, hintedDuration);
      const autoDuration = kind !== "image" && toFiniteNumber(resource?.meta?.durationSec) == null;
      const placement = appendPlacementForResource(scopePlacements, id, {
        trackName: track,
        timeSec: Math.max(0, toFiniteNumber(timeSec) || 0),
        durationSec: hintedDuration,
        startOffsetSec: 0,
        sourceDurationSec: hintedSourceDurationSec,
        autoDuration,
      });
      if (!placement) return false;
      const placementKey = String(placement.clipId || placement.placementKey || "").trim();
      if (!placementKey) return false;
      const sourceDurationSec = Math.max(
        0.1,
        toFiniteNumber(placement.sourceDurationSec) ||
          resolveResourceSourceDurationSec(resource, hintedDuration) ||
          hintedDuration
      );
      const duration = Math.max(0.1, toFiniteNumber(placement.durationSec) || hintedDuration);
      const start = Math.max(0, toFiniteNumber(placement.timeSec) || 0);
      const startOffsetSec = Math.max(0, toFiniteNumber(placement.startOffsetSec) || 0);
      studio.resourceDurationById[id] = sourceDurationSec;

      if (kind === "audio") {
        const existingTrackMode = String(trackInfo?.channelMode || "").trim().toLowerCase();
        const sourceChannelMode = resolveAudioChannelModeFromResource(resource, track);
        const channelMode = existingTrackMode === "mono" || existingTrackMode === "stereo"
          ? existingTrackMode
          : sourceChannelMode;
        const audioTrackName = coerceAudioTrackNameForChannelMode(
          String(track || "").trim() || (channelMode === "mono" ? "Audio M1" : "Audio S1"),
          channelMode,
          1
        );
        if (audioTrackName !== String(placement?.trackName || "").trim()) {
          setPlacementRecord(scopePlacements, {
            ...placement,
            trackName: audioTrackName,
          });
        }
        const linkGroupId = String(placement.linkGroupId || placementKey).trim() || placementKey;
        const assetKey = `audio:${id}:${placementKey}`;
        studio.audioAssetByKey[assetKey] = String(resource?.src || "");
        ensureLocalTrack(audioTrackName, "audio", {
          insertIndex: resolvedInsertIndex,
          channelMode,
          preserveEventDuration: true,
          source: resource?.label || id,
          audioAssetKey: assetKey,
        });
        studio.eventsByTrack[audioTrackName].push({
          time: start,
          duration,
          label: resource?.label || "audio",
          assetKey,
          resourceId: id,
          clipId: placementKey,
          startOffsetSec,
          sourceDurationSec,
          linkGroupId,
          channelMode,
        });
        sortLocalTrackEvents(audioTrackName);
      } else {
        const normalizedTrackName = String(track || "").trim() || (kind === "video" ? "Video 1" : "Image 1");
        const linkGroupId = String(placement.linkGroupId || placementKey).trim() || placementKey;
        ensureLocalTrack(normalizedTrackName, kind, {
          insertIndex: resolvedInsertIndex,
          source: resource?.label || id,
        });
        studio.eventsByTrack[normalizedTrackName].push({
          time: start,
          duration,
          label: resource?.label || kind,
          resourceId: id,
          clipId: placementKey,
          startOffsetSec,
          sourceDurationSec,
          linkGroupId,
          hasAudio: kind === "video" && shouldRouteVideoAudio(resource),
          src: String(resource?.src || ""),
          previewSrc: String(resource?.previewSrc || ""),
        });
        sortLocalTrackEvents(normalizedTrackName);
        if (kind === "video" && shouldRouteVideoAudio(resource) && resource?.src) {
          const linkedTracks = deriveVideoAudioTrackNames(normalizedTrackName);
          const linkedTrackName = linkedTracks.stereo;
          const assetKey = `video_audio:${id}:${placementKey}`;
          studio.audioAssetByKey[assetKey] = String(resource.src);
          ensureLocalTrack(linkedTrackName, "audio", {
            insertIndex: Number.isFinite(Number(resolvedInsertIndex)) ? Number(resolvedInsertIndex) + 1 : undefined,
            channelMode: "stereo",
            preserveEventDuration: true,
            source: `${resource?.label || id} audio`,
            audioAssetKey: assetKey,
          });
          studio.eventsByTrack[linkedTrackName].push({
            time: start,
            duration,
            label: `${resource?.label || "video"} audio`,
            assetKey,
            resourceId: id,
            clipId: placementKey,
            startOffsetSec,
            sourceDurationSec,
            linkGroupId,
          });
          sortLocalTrackEvents(linkedTrackName);
        }
      }
      reconcileLocalTracks();
      refreshLocalStudioDuration();
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    }),
    onClipEdit: ({
      clipId,
      resourceId,
      linkGroupId,
      trackName,
      trackKind,
      timeSec,
      durationSec,
      mode,
      startOffsetSec,
      insertMode = false,
      insertIndex = null,
      sourceDurationSec: incomingSourceDurationSec,
    }) =>
      withCompositionHistory(scopeKey, () => {
      const id = String(resourceId || "").trim();
      const track = String(trackName || "").trim();
      if (!id || !track) return false;
      const resource = resourcesById.get(id);
      if (!resource) return false;
      const resourceKind = String(resource?.kind || "").toLowerCase();
      const editedTrackKind = String(trackKind || "").toLowerCase();
      const requestedInsertMode = Boolean(insertMode);
      const requestedInsertIndexRaw = Number(insertIndex);
      const hasRequestedInsertIndex = Number.isFinite(requestedInsertIndexRaw);
      const scopePlacements = getPlacementMap(scopeKey);
      let canonicalTrackName = track;
      let responseTrackName = track;
      if (resourceKind === "video" && editedTrackKind === "audio") {
        // Strong coupling: editing linked audio keeps the canonical placement on video lane.
        const resolvedVideoTrack = deriveVideoTrackNameFromLinkedAudio(track);
        if (resolvedVideoTrack) canonicalTrackName = resolvedVideoTrack;
        // But timeline local commit for the audio member must keep the requested audio lane.
        responseTrackName = track;
      }
      const placementId = String(clipId || "").trim();
      const safeLinkGroupId = String(linkGroupId || "").trim();
      let current = null;
      if (placementId) {
        current = getPlacementByClipId(scopePlacements, placementId, id)
          || getPlacementByLinkGroupId(scopePlacements, safeLinkGroupId, id);
      } else if (safeLinkGroupId) {
        current = getPlacementByLinkGroupId(scopePlacements, safeLinkGroupId, id);
      } else {
        current = getPrimaryPlacementForResource(scopePlacements, id);
      }
      if (!current) return false;
      const sourceDurationSec = Math.max(
        0.1,
        toFiniteNumber(incomingSourceDurationSec) ||
          toFiniteNumber(current.sourceDurationSec) ||
          resolveResourceSourceDurationSec(resource, toFiniteNumber(current.durationSec) || 0.1) ||
          current.durationSec
      );
      let nextTimeSec = Math.max(0, toFiniteNumber(timeSec) || 0);
      let nextDurationSec = Math.max(0.1, toFiniteNumber(durationSec) || current.durationSec);
      let nextStartOffsetSec = Math.max(0, toFiniteNumber(current.startOffsetSec) || 0);
      const normalizedMode = String(mode || "").trim().toLowerCase();
      if (normalizedMode === "move" && requestedInsertMode) {
        reconcileLocalTracks();
        const existingTracks = (Array.isArray(studio?.tracks) ? studio.tracks : []).filter((item) => {
          const name = String(item?.name || "").trim();
          const kind = String(item?.kind || "").trim().toLowerCase();
          return Boolean(name) && kind !== "dropzone" && !isCompositionDropzoneTrackName(name);
        });
        const desiredKind = resourceKind === "audio"
          ? "audio"
          : (resourceKind === "video" ? "video" : (resourceKind === "image" ? "image" : editedTrackKind || "video"));
        let generatedTrackName = createNextTrackNameByKind(
          desiredKind,
          existingTracks.map((item) => String(item?.name || "").trim()).filter(Boolean)
        );
        let generatedAudioChannelMode = "";
        if (desiredKind === "audio") {
          generatedAudioChannelMode = resolveAudioChannelModeFromResource(resource, track);
          generatedTrackName = coerceAudioTrackNameForChannelMode(
            generatedTrackName,
            generatedAudioChannelMode,
            1
          );
        }
        let resolvedInsertIndex = null;
        if (hasRequestedInsertIndex) {
          const totalTracks = Array.isArray(studio?.tracks) ? studio.tracks.length : 0;
          resolvedInsertIndex = clamp(Math.round(requestedInsertIndexRaw), 1, Math.max(1, totalTracks - 1));
        }
        const audioPatch = desiredKind === "audio" && generatedAudioChannelMode
          ? { channelMode: generatedAudioChannelMode, preserveEventDuration: true }
          : {};
        ensureLocalTrack(generatedTrackName, desiredKind, {
          insertIndex: resolvedInsertIndex == null ? undefined : resolvedInsertIndex,
          source: resource?.label || id,
          ...audioPatch,
        });
        canonicalTrackName = generatedTrackName;
        // Keep timeline local commit aligned with canonical placement immediately.
        // For video edited from linked audio lane, response must stay on linked audio lane
        // so local commit can move both video + linked audio members coherently.
        if (resourceKind === "video" && editedTrackKind === "audio") {
          responseTrackName = deriveVideoAudioTrackNames(generatedTrackName).stereo;
        } else {
          responseTrackName = generatedTrackName;
        }
      }
      const explicitStartOffsetSec = toFiniteNumber(startOffsetSec);
      if (explicitStartOffsetSec != null) {
        nextStartOffsetSec = Math.max(0, explicitStartOffsetSec);
      } else if (normalizedMode === "trim_start") {
        const delta = nextTimeSec - Math.max(0, toFiniteNumber(current.timeSec) || 0);
        nextStartOffsetSec = Math.max(0, nextStartOffsetSec + delta);
      }
      if (normalizedMode === "move") {
        // Move must keep the source window stable; only timeline position/track can change.
        nextDurationSec = Math.max(0.1, toFiniteNumber(current.durationSec) || nextDurationSec);
        nextStartOffsetSec = Math.max(0, toFiniteNumber(current.startOffsetSec) || 0);
        if (nextTimeSec <= MOVE_ZERO_SNAP_SEC) nextTimeSec = 0;
      }
      if (normalizedMode === "slip") {
        // Slip edit only shifts source window; timeline geometry stays unchanged.
        nextTimeSec = Math.max(0, toFiniteNumber(current.timeSec) || 0);
        nextDurationSec = Math.max(0.1, toFiniteNumber(current.durationSec) || nextDurationSec);
      }
      if (sourceDurationSec > 0.05) {
        const maxOffset = Math.max(0, sourceDurationSec - 0.1);
        nextStartOffsetSec = Math.min(nextStartOffsetSec, maxOffset);
        if (normalizedMode !== "move") {
          const maxDuration = Math.max(0.1, sourceDurationSec - nextStartOffsetSec);
          nextDurationSec = Math.min(nextDurationSec, maxDuration);
        }
      }
      upsertPlacementForResource(scopePlacements, id, placementId, {
        trackName: canonicalTrackName,
        timeSec: nextTimeSec,
        durationSec: nextDurationSec,
        startOffsetSec: nextStartOffsetSec,
        sourceDurationSec,
        linkGroupId: safeLinkGroupId || String(current.linkGroupId || placementId || "").trim(),
        autoDuration: false,
      });
      markMonitorDataDirty();
      return {
        accepted: true,
        trackName: responseTrackName,
      };
    }),
    onClipCut: ({ clipId, resourceId, trackKind, cutTimeSec }) => {
      const id = String(resourceId || "").trim();
      if (!id) return false;
      const resource = resourcesById.get(id);
      if (!resource) return false;
      const resourceKind = String(resource?.kind || "").toLowerCase();
      const normalizedTrackKind = String(trackKind || "").toLowerCase();
      const canCut =
        (resourceKind === "audio" && normalizedTrackKind === "audio") ||
        (resourceKind === "video" && (normalizedTrackKind === "video" || normalizedTrackKind === "audio"));
      if (!canCut) return false;
      const scopePlacements = getPlacementMap(scopeKey);
      const changed = withCompositionHistory(scopeKey, () => {
        const split = splitPlacementForResource(
          scopePlacements,
          id,
          String(clipId || "").trim(),
          Math.max(0, toFiniteNumber(cutTimeSec) || 0),
          0.1
        );
        return Boolean(split);
      });
      if (!changed) return false;
      markMonitorDataDirty();
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onClipTrim: ({ clipId, resourceId, trackKind, cutTimeSec, keepSide }) => {
      const id = String(resourceId || "").trim();
      if (!id) return false;
      const resource = resourcesById.get(id);
      if (!resource) return false;
      const resourceKind = String(resource?.kind || "").toLowerCase();
      const normalizedTrackKind = String(trackKind || "").toLowerCase();
      const canTrim =
        (resourceKind === "audio" && normalizedTrackKind === "audio") ||
        (resourceKind === "video" && (normalizedTrackKind === "video" || normalizedTrackKind === "audio"));
      if (!canTrim) return false;
      const scopePlacements = getPlacementMap(scopeKey);
      const normalizedKeepSide = String(keepSide || "").trim().toLowerCase() === "right" ? "right" : "left";
      const changed = withCompositionHistory(scopeKey, () => {
        const trimmed = trimPlacementForResource(
          scopePlacements,
          id,
          String(clipId || "").trim(),
          Math.max(0, toFiniteNumber(cutTimeSec) || 0),
          normalizedKeepSide,
          0.1
        );
        return Boolean(trimmed);
      });
      if (!changed) return false;
      markMonitorDataDirty();
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onClipJoin: ({ trackKind, leftClipId, leftResourceId, rightClipId, rightResourceId }) => {
      const kind = String(trackKind || "").toLowerCase();
      const leftId = String(leftResourceId || "").trim();
      const rightId = String(rightResourceId || "").trim();
      const leftClip = String(leftClipId || "").trim();
      const rightClip = String(rightClipId || "").trim();
      if (kind !== "video") return false;
      if (!leftId || !rightId || leftId !== rightId) return false;
      if (!leftClip || !rightClip) return false;
      const resource = resourcesById.get(leftId);
      if (!resource || String(resource?.kind || "").toLowerCase() !== "video") return false;
      const scopePlacements = getPlacementMap(scopeKey);
      const changed = withCompositionHistory(scopeKey, () => {
        const joined = joinPlacementsForResource(scopePlacements, leftId, leftClip, rightClip, 0.1);
        return Boolean(joined);
      });
      if (!changed) return false;
      markMonitorDataDirty();
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onTrackContextAction: ({ action, trackName, trackKind, selectedClipIds, focusClipId, focusLinkGroupId }) => {
      const normalizedAction = String(action || "").trim().toLowerCase();
      if (!normalizedAction) return false;
      const scopePlacements = getPlacementMap(scopeKey);
      if (normalizedAction === "clear_composition") {
        if (!window.confirm("Clear timeline composition?")) return false;
        const changed = withCompositionHistory(scopeKey, () => {
          scopePlacements.clear();
          const eventsByTrack = studio.eventsByTrack || {};
          for (const name of Object.keys(eventsByTrack)) {
            eventsByTrack[name] = [];
          }
          if (Array.isArray(studio.tracks)) {
            for (const track of studio.tracks) {
              if (!track || typeof track !== "object") continue;
              track.events = 0;
            }
          }
          return true;
        });
        if (!changed) return false;
        markMonitorDataDirty();
        return true;
      }
      if (normalizedAction === "delete_selected_clips") {
        const changed = withCompositionHistory(scopeKey, () => {
          const ids = new Set();
          const linkGroupIds = new Set();
          for (const value of Array.isArray(selectedClipIds) ? selectedClipIds : []) {
            const clipId = String(value || "").trim();
            if (clipId) ids.add(clipId);
          }
          if (!ids.size) {
            const fallbackId = String(focusClipId || "").trim();
            if (fallbackId) ids.add(fallbackId);
          }
          const focusGroupId = String(focusLinkGroupId || "").trim();
          if (focusGroupId) linkGroupIds.add(focusGroupId);
          for (const clipId of ids.values()) {
            const placement = getPlacementByClipId(scopePlacements, clipId);
            const gid = String(placement?.linkGroupId || "").trim();
            if (gid) linkGroupIds.add(gid);
          }
          for (const gid of linkGroupIds.values()) {
            const linkedClipIds = collectPlacementClipIdsByLinkGroupId(scopePlacements, gid);
            for (const clipId of linkedClipIds) ids.add(clipId);
          }
          const removed = removePlacementRecordsByClipIds(scopePlacements, Array.from(ids));
          return removed > 0;
        });
        if (!changed) return false;
        markMonitorDataDirty();
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
        return true;
      }
      if (normalizedAction === "duplicate_selected_clips") {
        const changed = withCompositionHistory(scopeKey, () => {
          const ids = [];
          for (const value of Array.isArray(selectedClipIds) ? selectedClipIds : []) {
            const clipId = String(value || "").trim();
            if (clipId) ids.push(clipId);
          }
          if (!ids.length) {
            const fallbackId = String(focusClipId || "").trim();
            if (fallbackId) ids.push(fallbackId);
          }
          const created = duplicatePlacementRecordsByClipIds(scopePlacements, ids, { spacingSec: 0.06 });
          return created > 0;
        });
        if (!changed) return false;
        markMonitorDataDirty();
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
        return true;
      }
      if (normalizedAction === "duplicate_lane") {
        const changed = withCompositionHistory(scopeKey, () => {
          const duplicated = duplicateTrackPlacements(
            scopePlacements,
            studio,
            String(trackName || "").trim(),
            String(trackKind || "").trim().toLowerCase()
          );
          return Boolean(duplicated);
        });
        if (!changed) return false;
        markMonitorDataDirty();
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
        return true;
      }
      if (normalizedAction === "toggle_lock_lane") {
        const safeTrackName = String(trackName || "").trim();
        if (!safeTrackName) return false;
        const changed = withCompositionHistory(scopeKey, () => {
          const current = getTrackLocks(scopeKey);
          if (current.has(safeTrackName)) current.delete(safeTrackName);
          else current.add(safeTrackName);
          setTrackLocks(scopeKey, current);
          return true;
        });
        if (!changed) return false;
        const current = getTrackLocks(scopeKey);
        if (Array.isArray(studio?.tracks)) {
          for (const track of studio.tracks) {
            if (!track || typeof track !== "object") continue;
            const name = String(track?.name || "").trim();
            if (!name) continue;
            track.locked = current.has(name);
          }
        }
        return true;
      }
      return false;
    },
    onUndo: () => {
      const changed = undoCompositionHistory(scopeKey);
      if (!changed) return false;
      markMonitorDataDirty();
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onRedo: () => {
      const changed = redoCompositionHistory(scopeKey);
      if (!changed) return false;
      markMonitorDataDirty();
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onPlaybackUpdate: syncVideoMonitor,
  });
}
