import * as CONSTANTS from "./timeline_constants.js";
import * as Utils from "./timeline_utils.js";

export function buildUniformTileLayout(x0, widthPx, desiredTileW, gap, maxTiles = 8) {
  const startX = Math.floor(Number(x0 || 0)) + 1;
  const usableWidth = Math.max(1, Math.floor(Number(widthPx || 0)) - 2);
  const targetW = Math.max(8, Number(desiredTileW || 8));
  const safeGap = Math.max(0, Math.round(Number(gap || 0)));
  const maxTilesByWidth = Math.max(1, Math.floor((usableWidth + safeGap) / (targetW + safeGap)));
  const tileCount = Utils.clamp(maxTilesByWidth, 1, Math.max(1, Math.floor(Number(maxTiles || 8))));
  const totalGap = safeGap * Math.max(0, tileCount - 1);
  const tilePixels = Math.max(tileCount, usableWidth - totalGap);
  const baseTileW = Math.max(1, Math.floor(tilePixels / tileCount));
  let remainder = Math.max(0, tilePixels - baseTileW * tileCount);
  const tiles = [];
  let cursor = startX;
  for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const width = baseTileW + extra;
    tiles.push({
      x: cursor,
      w: width,
      index: tileIndex,
    });
    cursor += width + safeGap;
  }
  return {
    tiles,
    tileCount,
    startX,
    endX: Math.max(startX, cursor - safeGap),
  };
}

export function drawFrameInTileContain(ctx, frame, tileX, tileY, tileW, tileH, options = {}) {
  if (!frame) return false;
  const srcW = Math.max(1, Number(frame.width || 1));
  const srcH = Math.max(1, Number(frame.height || 1));
  const scale = Math.max(tileW / srcW, tileH / srcH);
  const drawW = Math.max(1, srcW * scale);
  const drawH = Math.max(1, srcH * scale);
  const drawX = tileX + (tileW - drawW) * 0.5;
  const drawY = tileY + (tileH - drawH) * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tileX, tileY, tileW, tileH);
  ctx.clip();
  const fallbackFill = String(options?.fallbackFill || "").trim();
  if (fallbackFill) {
    ctx.fillStyle = fallbackFill;
    ctx.fillRect(tileX, tileY, tileW, tileH);
  }
  try {
    ctx.drawImage(frame, drawX, drawY, drawW, drawH);
  } catch {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

export function drawClipFilmstripTiles(ctx, frames, x0, widthPx, y, h, options = {}) {
  const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (!list.length) return false;
  const sourceDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(options?.sourceDurationSec || 0.01));
  const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(options?.clipDurationSec || sourceDurationSec));
  const clipStartOffsetSec = Math.max(0, Number(options?.clipStartOffsetSec || 0));
  const tileH = Math.max(10, Math.floor(h - 2));
  const reference = list[0];
  const refW = Math.max(1, Number(reference?.width || 1));
  const refH = Math.max(1, Number(reference?.height || 1));
  const aspect = refW / Math.max(1, refH);
  const desiredTileW = Utils.clamp(tileH * aspect, 24, Math.max(28, Math.min(220, widthPx * 0.52)));
  const layout = buildUniformTileLayout(x0, widthPx, desiredTileW, CONSTANTS.VIDEO_FILMSTRIP_TILE_GAP, 26);
  const tileCount = layout.tileCount;
  const innerY = Math.floor(y + (h - tileH) * 0.5);
  let drewAny = false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  if (drawFrameInTileContain(ctx, list[0], x0, innerY, widthPx, tileH)) drewAny = true;
  for (const tile of layout.tiles) {
    const ratio = tileCount <= 1 ? 0 : (tile.index / Math.max(1, tileCount - 1));
    const localTimeSec = clipStartOffsetSec + clipDurationSec * ratio;
    const frameRatio = Math.max(0, Math.min(1, localTimeSec / sourceDurationSec));
    let frameIndex = Math.max(0, Math.min(list.length - 1, Math.round(frameRatio * (list.length - 1))));
    const frame = list[frameIndex] || list[0];
    let tileDrawn = false;
    if (frame) tileDrawn = drawFrameInTileContain(ctx, frame, tile.x, innerY, tile.w, tileH);
    if (!tileDrawn && frame !== list[0]) tileDrawn = drawFrameInTileContain(ctx, list[0], tile.x, innerY, tile.w, tileH);
    if (tileDrawn) drewAny = true;
    ctx.strokeStyle = "rgba(72, 56, 42, 0.45)";
    ctx.strokeRect(tile.x + 0.5, innerY + 0.5, Math.max(1, tile.w - 1), Math.max(1, tileH - 1));
  }
  ctx.restore();
  return drewAny;
}

export function drawClipEdgeFrames(ctx, frames, x0, widthPx, y, h) {
  const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (!list.length) return false;
  const first = list[0];
  const last = list.length > 1 ? list[list.length - 1] : list[0];
  const tileH = Math.max(10, h - 2);
  const refW = Math.max(1, Number(first?.width || 1));
  const refH = Math.max(1, Number(first?.height || 1));
  const aspect = refW / Math.max(1, refH);
  const tileW = Utils.clamp(tileH * aspect, 24, Math.max(28, Math.min(180, widthPx * 0.44)));
  const innerY = y + (h - tileH) * 0.5;
  const drawFrame = (frame, slotX) => {
    drawFrameInTileContain(ctx, frame, slotX, innerY, tileW, tileH);
    ctx.strokeStyle = "rgba(72, 56, 42, 0.45)";
    ctx.strokeRect(slotX + 0.5, innerY + 0.5, Math.max(1, tileW - 1), Math.max(1, tileH - 1));
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  const leftX = x0 + 1;
  const rightX = Math.max(leftX, x0 + widthPx - tileW - 1);
  drawFrame(first, leftX);
  if (rightX > leftX + 2) drawFrame(last, rightX);
  const midX0 = leftX + tileW + 2;
  const midX1 = rightX - 2;
  if (midX1 > midX0) {
    const midGrad = ctx.createLinearGradient(midX0, 0, midX1, 0);
    midGrad.addColorStop(0, "rgba(35, 25, 16, 0.30)");
    midGrad.addColorStop(0.5, "rgba(35, 25, 16, 0.14)");
    midGrad.addColorStop(1, "rgba(35, 25, 16, 0.30)");
    ctx.fillStyle = midGrad;
    ctx.fillRect(midX0, innerY, midX1 - midX0, tileH);
  }
  ctx.restore();
  return true;
}

