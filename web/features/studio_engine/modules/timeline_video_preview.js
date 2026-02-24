import * as CONSTANTS from "./timeline_constants.js";
import * as Utils from "./timeline_utils.js";

export function drawClipThumbnailCover(
  state,
  ctx,
  src,
  x0,
  widthPx,
  y,
  h,
  { getTimelineThumbnail } = {}
) {
  const img = typeof getTimelineThumbnail === "function" ? getTimelineThumbnail(state, src) : null;
  if (!img) return false;
  const imgW = Math.max(1, Number(img.naturalWidth || img.width || 1));
  const imgH = Math.max(1, Number(img.naturalHeight || img.height || 1));
  const scale = Math.max(widthPx / imgW, h / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = x0 + (widthPx - drawW) * 0.5;
  const drawY = y + (h - drawH) * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
  return true;
}

export function drawClipThumbnailTiles(
  state,
  ctx,
  src,
  x0,
  widthPx,
  y,
  h,
  { getTimelineThumbnail, buildUniformTileLayout } = {}
) {
  const img = typeof getTimelineThumbnail === "function" ? getTimelineThumbnail(state, src) : null;
  if (!img || typeof buildUniformTileLayout !== "function") return false;
  const imgW = Math.max(1, Number(img.naturalWidth || img.width || 1));
  const imgH = Math.max(1, Number(img.naturalHeight || img.height || 1));
  const tileH = Math.max(10, Math.floor(h - 2));
  const aspect = imgW / Math.max(1, imgH);
  const desiredTileW = Utils.clamp(tileH * aspect, 24, Math.max(26, Math.min(188, widthPx - 2)));
  const layout = buildUniformTileLayout(x0, widthPx, desiredTileW, CONSTANTS.VIDEO_FILMSTRIP_TILE_GAP, 8);
  const innerY = Math.floor(y + (h - tileH) * 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  // Seed full strip with source thumbnail so async/missing per-tile work never exposes placeholder regions.
  const coverScale = Math.max(widthPx / imgW, tileH / imgH);
  const coverW = Math.max(1, Math.floor(imgW * coverScale));
  const coverH = Math.max(1, Math.floor(imgH * coverScale));
  const coverX = x0 + (widthPx - coverW) * 0.5;
  const coverY = innerY + (tileH - coverH) * 0.5;
  ctx.drawImage(img, coverX, coverY, coverW, coverH);
  for (const tile of layout.tiles) {
    const drawScale = Math.min(tile.w / imgW, tileH / imgH);
    const drawW = Math.max(1, Math.floor(imgW * drawScale));
    const drawH = Math.max(1, Math.floor(imgH * drawScale));
    const drawX = tile.x + (tile.w - drawW) * 0.5;
    const drawY = innerY + (tileH - drawH) * 0.5;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.strokeStyle = "rgba(72, 56, 42, 0.45)";
    ctx.strokeRect(tile.x + 0.5, innerY + 0.5, Math.max(1, tile.w - 1), Math.max(1, tileH - 1));
  }
  ctx.restore();
  return true;
}

export function resolveVideoPreviewPlan(
  state,
  widthPx,
  {
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
    getFilmstripQueuePressure,
    bucketizeFilmstripFrameCount,
  } = {}
) {
  const mode = typeof normalizeVideoPreviewMode === "function"
    ? normalizeVideoPreviewMode(state?.videoPreviewMode)
    : "auto";
  const qualityHint = typeof normalizeVideoPreviewQualityHint === "function"
    ? normalizeVideoPreviewQualityHint(state?.previewQualityHint)
    : "auto";
  const queuePressure = typeof getFilmstripQueuePressure === "function" ? getFilmstripQueuePressure() : 0;
  // Keep filmstrip rendering visually stable during playback/scrub.
  // We only switch to "interactive" preview when the user is actively editing
  // clip geometry (drag/trim/pan/resize), not when transport is running.
  const interactive = Boolean(state?.clipEditSession || state?.panningX || state?.resizingSection);
  const pressureHigh = queuePressure >= 6;
  const pressureMedium = queuePressure >= 2;
  if (mode === "light") {
    return {
      strategy: "full",
      frameCount: 2,
      targetHeight: CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT,
    };
  }
  if (mode === "full") {
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(
        Utils.clamp(Math.round(widthPx / 120), CONSTANTS.VIDEO_FILMSTRIP_MIN_FRAMES, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES + 2)
      ),
      targetHeight: CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT,
    };
  }
  if (qualityHint === "low") {
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(3),
      targetHeight: 44,
    };
  }
  if (qualityHint === "medium") {
    if (interactive || pressureHigh) {
      return {
        strategy: "full",
        frameCount: bucketizeFilmstripFrameCount(3),
        targetHeight: 46,
      };
    }
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(Utils.clamp(Math.round(widthPx / 190), 3, 6)),
      targetHeight: 48,
    };
  }
  if (qualityHint === "high" && !interactive && !pressureHigh) {
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(Utils.clamp(Math.round(widthPx / 120), 4, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES + 2)),
      targetHeight: CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT,
    };
  }
  // auto
  if (interactive || widthPx < 260 || pressureHigh) {
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(3),
      targetHeight: 46,
    };
  }
  return {
    strategy: "full",
    frameCount: bucketizeFilmstripFrameCount(
      Utils.clamp(
        Math.round(widthPx / (pressureMedium ? 170 : 140)),
        CONSTANTS.VIDEO_FILMSTRIP_MIN_FRAMES,
        pressureMedium
          ? Math.max(CONSTANTS.VIDEO_FILMSTRIP_MIN_FRAMES + 1, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES - 4)
          : Math.max(CONSTANTS.VIDEO_FILMSTRIP_MIN_FRAMES + 2, CONSTANTS.VIDEO_FILMSTRIP_MAX_FRAMES - 1)
      )
    ),
    targetHeight: pressureMedium ? 50 : 56,
  };
}

