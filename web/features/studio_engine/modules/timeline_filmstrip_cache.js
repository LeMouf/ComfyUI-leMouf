import * as CONSTANTS from "./timeline_constants.js";
import * as Utils from "./timeline_utils.js";
import {
  bucketizeFilmstripFrameCount,
  normalizeFilmstripTargetHeight,
} from "./timeline_track_layout.js";

let FILMSTRIP_QUEUE_ACTIVE = 0;
const FILMSTRIP_QUEUE = [];

export function notifyPreviewCacheUpdated(state, { draw } = {}) {
  if (!state) return;
  if (state.filmstripRenderCache instanceof Map) {
    state.filmstripRenderCache.clear();
  }
  state.filmstripRenderCacheEpoch = Number(state.filmstripRenderCacheEpoch || 0) + 1;
  if (typeof state.onPreviewCacheUpdate === "function") {
    try {
      state.onPreviewCacheUpdate();
    } catch {}
    return;
  }
  if (typeof draw === "function" && state.canvas && state.ctx) {
    try {
      draw(state);
    } catch {}
  }
}

function pruneFilmstripRenderCache(state) {
  const cache = state?.filmstripRenderCache instanceof Map ? state.filmstripRenderCache : null;
  if (!cache || cache.size <= CONSTANTS.FILMSTRIP_RENDER_CACHE_MAX) return;
  const entries = [];
  for (const [key, value] of cache.entries()) {
    entries.push({
      key,
      lastUsedAt: Number(value?.lastUsedAt || 0),
    });
  }
  entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const overflow = Math.max(0, cache.size - CONSTANTS.FILMSTRIP_RENDER_CACHE_MAX);
  for (let i = 0; i < overflow; i += 1) {
    cache.delete(entries[i].key);
  }
}

export function drawClipFilmstripTilesCached(
  state,
  ctx,
  frames,
  x0,
  widthPx,
  y,
  h,
  options = {},
  { drawClipFilmstripTiles } = {}
) {
  const safeState = state && typeof state === "object" ? state : null;
  const cache = safeState?.filmstripRenderCache instanceof Map ? safeState.filmstripRenderCache : null;
  if (!cache || typeof document === "undefined" || typeof drawClipFilmstripTiles !== "function") {
    return typeof drawClipFilmstripTiles === "function"
      ? drawClipFilmstripTiles(ctx, frames, x0, widthPx, y, h, options)
      : false;
  }
  const w = Math.max(2, Math.floor(Number(widthPx || 0)));
  const hh = Math.max(2, Math.floor(Number(h || 0)));
  const src = String(options?.src || "").trim();
  const sourceDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(options?.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
  const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(options?.clipDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
  const clipStartOffsetSec = Math.max(0, Number(options?.clipStartOffsetSec || 0));
  const strategy = String(options?.strategy || "full").trim().toLowerCase();
  const targetHeight = Math.max(24, Number(options?.targetHeight || CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT));
  const frameCount = Math.max(1, Number(options?.frameCount || (Array.isArray(frames) ? frames.length : 1)));
  const epoch = Number(safeState?.filmstripRenderCacheEpoch || 0);
  const cacheKey =
    `${src}|${strategy}|${targetHeight}|${frameCount}|${w}x${hh}|` +
    `${sourceDurationSec.toFixed(4)}|${clipDurationSec.toFixed(4)}|${clipStartOffsetSec.toFixed(4)}|${epoch}`;
  const cached = cache.get(cacheKey);
  if (cached?.canvas) {
    cached.lastUsedAt = Date.now();
    try {
      ctx.drawImage(cached.canvas, Math.floor(x0), Math.floor(y), w, hh);
      return Boolean(cached.drewAny);
    } catch {}
  }

  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = w;
  renderCanvas.height = hh;
  const renderCtx = renderCanvas.getContext("2d");
  if (!renderCtx) {
    return drawClipFilmstripTiles(ctx, frames, x0, widthPx, y, h, options);
  }
  const drewAny = drawClipFilmstripTiles(renderCtx, frames, 0, w, 0, hh, {
    sourceDurationSec,
    clipDurationSec,
    clipStartOffsetSec,
    strategy,
    targetHeight,
    frameCount,
  });
  cache.set(cacheKey, {
    canvas: renderCanvas,
    drewAny: Boolean(drewAny),
    lastUsedAt: Date.now(),
  });
  pruneFilmstripRenderCache(safeState);
  try {
    ctx.drawImage(renderCanvas, Math.floor(x0), Math.floor(y), w, hh);
  } catch {}
  return Boolean(drewAny);
}

function pumpFilmstripQueue() {
  while (FILMSTRIP_QUEUE_ACTIVE < CONSTANTS.VIDEO_FILMSTRIP_MAX_CONCURRENCY && FILMSTRIP_QUEUE.length) {
    const task = FILMSTRIP_QUEUE.shift();
    if (typeof task !== "function") continue;
    FILMSTRIP_QUEUE_ACTIVE += 1;
    Promise.resolve()
      .then(task)
      .catch(() => {})
      .finally(() => {
        FILMSTRIP_QUEUE_ACTIVE = Math.max(0, FILMSTRIP_QUEUE_ACTIVE - 1);
        pumpFilmstripQueue();
      });
  }
}

function enqueueFilmstripTask(task) {
  FILMSTRIP_QUEUE.push(task);
  pumpFilmstripQueue();
}

export function getFilmstripQueuePressure() {
  return FILMSTRIP_QUEUE_ACTIVE + FILMSTRIP_QUEUE.length;
}

export function ensureTimelineThumbnailEntry(state, src, { notifyPreviewCacheUpdatedDeps = {} } = {}) {
  if (!state?.clipThumbCache || !src) return null;
  const key = String(src || "").trim();
  if (!key) return null;
  if (state.clipThumbCache.has(key)) return state.clipThumbCache.get(key);
  const entry = {
    src: key,
    status: "loading",
    img: null,
  };
  state.clipThumbCache.set(key, entry);
  if (typeof Image !== "function") {
    entry.status = "error";
    return entry;
  }
  const img = new Image();
  entry.img = img;
  img.onload = () => {
    entry.status = "ready";
    notifyPreviewCacheUpdated(state, notifyPreviewCacheUpdatedDeps);
  };
  img.onerror = () => {
    entry.status = "error";
    notifyPreviewCacheUpdated(state, notifyPreviewCacheUpdatedDeps);
  };
  img.src = key;
  return entry;
}

export function getTimelineThumbnail(state, src, { notifyPreviewCacheUpdatedDeps = {} } = {}) {
  const entry = ensureTimelineThumbnailEntry(state, src, { notifyPreviewCacheUpdatedDeps });
  if (!entry || entry.status !== "ready" || !entry.img) return null;
  return entry.img;
}

function getFilmstripCandidatesForSource(cache, src, strategy) {
  if (!(cache instanceof Map)) return [];
  const safeSrc = String(src || "").trim();
  const safeStrategy = String(strategy || "full").trim().toLowerCase();
  if (!safeSrc) return [];
  const out = [];
  for (const value of cache.values()) {
    if (!value || typeof value !== "object") continue;
    if (String(value?.src || "") !== safeSrc) continue;
    if (String(value?.strategy || "").trim().toLowerCase() !== safeStrategy) continue;
    const frames = Array.isArray(value?.frames) ? value.frames.filter(Boolean) : [];
    if (!frames.length) continue;
    out.push({
      entry: value,
      status: String(value?.status || "").trim().toLowerCase(),
      frameCount: Math.max(1, Number(value?.frameCount || frames.length || 1)),
      targetHeight: Math.max(24, Number(value?.targetHeight || CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT)),
      frames,
    });
  }
  return out;
}

function pickReusableFilmstripCandidate(candidates, { frameCount = 0, targetHeight = CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT } = {}) {
  const requestedFrameCount = Math.max(0, Number(frameCount || 0));
  const requestedTargetHeight = Math.max(24, Number(targetHeight || CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT));
  let bestReady = null;
  let bestReadyScore = Number.POSITIVE_INFINITY;
  let bestFallback = null;
  let bestFallbackScore = Number.POSITIVE_INFINITY;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const status = String(candidate?.status || "");
    const isReady = status === "ready" || status === "ready_stale";
    const frameCountDelta = requestedFrameCount
      ? Math.abs(Number(candidate?.frameCount || 0) - requestedFrameCount)
      : 0;
    const heightDelta = Math.abs(Number(candidate?.targetHeight || 0) - requestedTargetHeight);
    const score = frameCountDelta * 10 + heightDelta;
    if (isReady && score < bestReadyScore) {
      bestReady = candidate;
      bestReadyScore = score;
      continue;
    }
    if (!isReady && score < bestFallbackScore) {
      bestFallback = candidate;
      bestFallbackScore = score;
    }
  }
  return {
    ready: bestReady,
    fallback: bestFallback || bestReady,
  };
}

export function ensureTimelineVideoFilmstrip(
  state,
  src,
  hintDurationSec = 0,
  options = {},
  { notifyPreviewCacheUpdatedDeps = {} } = {}
) {
  if (!state?.clipThumbCache) return null;
  const key = String(src || "").trim();
  if (!key) return null;
  const strategy = String(options?.strategy || "full").trim().toLowerCase() === "edges" ? "edges" : "full";
  const targetHeight = normalizeFilmstripTargetHeight(options?.targetHeight || CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT);
  const requestedFrameCount = bucketizeFilmstripFrameCount(options?.frameCount || 0);
  const cacheKey = `filmstrip:${key}:${strategy}:${targetHeight}:${requestedFrameCount || "auto"}`;
  if (state.clipThumbCache.has(cacheKey)) {
    const cached = state.clipThumbCache.get(cacheKey);
    if (cached && typeof cached === "object") cached.lastUsedAt = Date.now();
    return cached;
  }
  const candidates = getFilmstripCandidatesForSource(state.clipThumbCache, key, strategy);
  const { ready: reusableReady, fallback: reusableFallback } = pickReusableFilmstripCandidate(candidates, {
    frameCount: requestedFrameCount || (strategy === "edges" ? 2 : 0),
    targetHeight,
  });
  if (reusableReady?.entry) {
    const readyFrames = Array.isArray(reusableReady.frames) ? reusableReady.frames.length : 0;
    const minFrames = strategy === "edges" ? 2 : Math.max(2, (requestedFrameCount || readyFrames) - 2);
    const targetDeltaOk = Math.abs(Number(reusableReady.targetHeight || 0) - targetHeight) <= 12;
    const frameCountOk = readyFrames >= minFrames;
    if (targetDeltaOk && frameCountOk) {
      reusableReady.entry.lastUsedAt = Date.now();
      state.clipThumbCache.set(cacheKey, reusableReady.entry);
      return reusableReady.entry;
    }
  }
  const fallbackFrames = Array.isArray(reusableFallback?.frames) ? reusableFallback.frames.filter(Boolean) : [];
  const entry = {
    src: key,
    strategy,
    status: fallbackFrames.length ? "warming" : "loading",
    frames: fallbackFrames.length ? fallbackFrames.slice() : [],
    durationSec: Math.max(0.01, Number(hintDurationSec || 0)),
    frameCount: requestedFrameCount || (fallbackFrames.length || 0),
    targetHeight,
    error: false,
    lastUsedAt: Date.now(),
  };
  state.clipThumbCache.set(cacheKey, entry);
  if (typeof document === "undefined") {
    entry.status = fallbackFrames.length ? "ready_stale" : "error";
    entry.error = !fallbackFrames.length;
    return entry;
  }
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = key;
  const cleanup = () => {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load?.();
    } catch {}
  };
  const waitForEvent = (node, eventName, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
      let done = false;
      const onDone = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        node.removeEventListener(eventName, onEvent);
        node.removeEventListener("error", onError);
        if (ok) resolve();
        else reject(new Error(`video_${eventName}_error`));
      };
      const onEvent = () => onDone(true);
      const onError = () => onDone(false);
      const timer = setTimeout(() => onDone(false), timeoutMs);
      node.addEventListener(eventName, onEvent, { once: true });
      node.addEventListener("error", onError, { once: true });
    });
  const buildFilmstrip = async () => {
    try {
      if (!(video.readyState >= 1)) {
        await waitForEvent(video, "loadedmetadata", 3500);
      }
      const durationSec = Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(video.duration || 0) > 0.05 ? Number(video.duration || 0) : Number(hintDurationSec || 0.01)
      );
      entry.durationSec = durationSec;
      const frameCount = requestedFrameCount > 0
        ? requestedFrameCount
        : bucketizeFilmstripFrameCount(
            Utils.clamp(Math.round(durationSec * 1.1), CONSTANTS.VIDEO_FILMSTRIP_MIN_FRAMES, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES)
          );
      const aspect = Math.max(0.2, Math.min(5, Number(video.videoWidth || 16) / Math.max(1, Number(video.videoHeight || 9))));
      const h = targetHeight;
      const w = Math.max(40, Math.round(h * aspect));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("filmstrip_no_canvas");
      const times = [];
      if (strategy === "edges") {
        const maxT = Math.max(0, durationSec - 0.04);
        times.push(0, maxT);
      } else if (frameCount <= 1) {
        times.push(0);
      } else {
        const maxT = Math.max(0, durationSec - 0.04);
        for (let i = 0; i < frameCount; i += 1) {
          times.push((maxT * i) / Math.max(1, frameCount - 1));
        }
      }
      const frames = [];
      for (const t of times) {
        const seekTime = Utils.clamp(Number(t || 0), 0, Math.max(0, durationSec - 0.02));
        try {
          if (Math.abs(Number(video.currentTime || 0) - seekTime) > 0.008) {
            video.currentTime = seekTime;
            await waitForEvent(video, "seeked", 1200);
          }
        } catch {}
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(video, 0, 0, w, h);
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = w;
        frameCanvas.height = h;
        const frameCtx = frameCanvas.getContext("2d");
        if (!frameCtx) continue;
        frameCtx.drawImage(canvas, 0, 0);
        frames.push(frameCanvas);
      }
      entry.frames = frames;
      entry.frameCount = frameCount;
      entry.status = frames.length ? "ready" : "error";
      entry.error = !frames.length;
      notifyPreviewCacheUpdated(state, notifyPreviewCacheUpdatedDeps);
    } catch {
      entry.status = fallbackFrames.length ? "ready_stale" : "error";
      entry.error = !fallbackFrames.length;
      notifyPreviewCacheUpdated(state, notifyPreviewCacheUpdatedDeps);
    } finally {
      cleanup();
    }
  };
  enqueueFilmstripTask(buildFilmstrip);
  return entry;
}

function normalizeFrameCountHint(value, fallback) {
  const numeric = Math.round(Number(value || fallback));
  if (!Number.isFinite(numeric)) return fallback;
  return bucketizeFilmstripFrameCount(Utils.clamp(numeric, CONSTANTS.VIDEO_FILMSTRIP_MIN_FRAMES, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES + 8));
}

function normalizeTargetHeightHint(value, fallback) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return normalizeFilmstripTargetHeight(numeric);
}

export function prewarmTimelineVideoBuffers({
  clipThumbCache,
  sources = [],
  frameCountHint = CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES,
  targetHeightHint = CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT,
  edgeTargetHeightHint = CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT,
  fullEnabled = true,
  onUpdate = null,
} = {}) {
  if (!(clipThumbCache instanceof Map)) return 0;
  const unique = [];
  const seen = new Set();
  for (const row of Array.isArray(sources) ? sources : []) {
    const src = String(row?.src || row || "").trim();
    if (!src || seen.has(src)) continue;
    seen.add(src);
    unique.push({
      src,
      durationSec: Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(row?.durationSec || row?.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      ),
    });
  }
  if (!unique.length) return 0;
  const warmState = {
    clipThumbCache,
    onPreviewCacheUpdate: typeof onUpdate === "function" ? onUpdate : null,
  };
  const fullFrames = normalizeFrameCountHint(frameCountHint, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES);
  const fullHeight = normalizeTargetHeightHint(targetHeightHint, CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT);
  const edgeHeight = normalizeTargetHeightHint(edgeTargetHeightHint, CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT);
  const useFull = Boolean(fullEnabled);
  for (const item of unique) {
    ensureTimelineVideoFilmstrip(warmState, item.src, item.durationSec, {
      strategy: "edges",
      frameCount: 2,
      targetHeight: edgeHeight,
    });
    if (useFull) {
      ensureTimelineVideoFilmstrip(warmState, item.src, item.durationSec, {
        strategy: "full",
        frameCount: fullFrames,
        targetHeight: fullHeight,
      });
    }
  }
  return unique.length;
}

