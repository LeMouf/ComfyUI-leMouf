import {
  notifyPreviewCacheUpdated as notifyPreviewCacheUpdatedFromCache,
  drawClipFilmstripTilesCached as drawClipFilmstripTilesCachedFromCache,
  getFilmstripQueuePressure as getFilmstripQueuePressureFromCache,
  ensureTimelineThumbnailEntry as ensureTimelineThumbnailEntryFromCache,
  getTimelineThumbnail as getTimelineThumbnailFromCache,
  ensureTimelineVideoFilmstrip as ensureTimelineVideoFilmstripFromCache,
  prewarmTimelineVideoBuffers as prewarmTimelineVideoBuffersFromCache,
} from "../../../infrastructure/media/filmstrip_cache.js";
import {
  drawClipThumbnailCover as drawClipThumbnailCoverFromPreview,
  drawClipThumbnailTiles as drawClipThumbnailTilesFromPreview,
  resolveVideoPreviewPlan as resolveVideoPreviewPlanFromPreview,
} from "./video_preview.js";
import {
  buildUniformTileLayout,
  drawClipFilmstripTiles,
} from "./filmstrip_draw.js";

export function createTimelinePreviewRuntime(deps = {}) {
  const {
    draw,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
    bucketizeFilmstripFrameCount,
  } = deps;

  function notifyPreviewCacheUpdated(state) {
    return notifyPreviewCacheUpdatedFromCache(state, { draw });
  }

  function drawClipFilmstripTilesCached(state, ctx, frames, x0, widthPx, y, h, options = {}) {
    return drawClipFilmstripTilesCachedFromCache(
      state,
      ctx,
      frames,
      x0,
      widthPx,
      y,
      h,
      options,
      { drawClipFilmstripTiles }
    );
  }

  function getFilmstripQueuePressure() {
    return getFilmstripQueuePressureFromCache();
  }

  function ensureTimelineThumbnailEntry(state, src) {
    return ensureTimelineThumbnailEntryFromCache(state, src, {
      notifyPreviewCacheUpdatedDeps: { draw },
    });
  }

  function getTimelineThumbnail(state, src) {
    return getTimelineThumbnailFromCache(state, src, {
      notifyPreviewCacheUpdatedDeps: { draw },
    });
  }

  function ensureTimelineVideoFilmstrip(state, src, hintDurationSec = 0, options = {}) {
    return ensureTimelineVideoFilmstripFromCache(state, src, hintDurationSec, options, {
      notifyPreviewCacheUpdatedDeps: { draw },
    });
  }

  function prewarmTimelineVideoBuffers(args = {}) {
    return prewarmTimelineVideoBuffersFromCache(args);
  }

  function drawClipThumbnailCover(state, ctx, src, x0, widthPx, y, h) {
    return drawClipThumbnailCoverFromPreview(state, ctx, src, x0, widthPx, y, h, {
      getTimelineThumbnail,
    });
  }

  function drawClipThumbnailTiles(state, ctx, src, x0, widthPx, y, h) {
    return drawClipThumbnailTilesFromPreview(state, ctx, src, x0, widthPx, y, h, {
      getTimelineThumbnail,
      buildUniformTileLayout,
    });
  }

  function resolveVideoPreviewPlan(state, widthPx) {
    return resolveVideoPreviewPlanFromPreview(state, widthPx, {
      normalizeVideoPreviewMode,
      normalizeVideoPreviewQualityHint,
      getFilmstripQueuePressure,
      bucketizeFilmstripFrameCount,
    });
  }

  return {
    notifyPreviewCacheUpdated,
    drawClipFilmstripTilesCached,
    getFilmstripQueuePressure,
    ensureTimelineThumbnailEntry,
    getTimelineThumbnail,
    ensureTimelineVideoFilmstrip,
    prewarmTimelineVideoBuffers,
    drawClipThumbnailCover,
    drawClipThumbnailTiles,
    resolveVideoPreviewPlan,
  };
}
