import { normalizeSelectionRect } from "./timeline_selection_geometry.js";

export function drawTimelineOverlays(state, ctx, prepared, deps) {
  const {
    width,
    height,
    timelineWidth,
    toX,
  } = prepared || {};
  if (!width || !height) return;

  const {
    CONSTANTS,
    Utils,
  } = deps || {};

  if (state.dropTarget && Boolean(state.dropTarget.insertMode)) {
    const rows = Array.isArray(state.trackRows) ? state.trackRows : [];
    const rawInsertIndex = Number(state.dropTarget.insertIndex);
    const hasRows = rows.length >= 2;
    if (hasRows && Number.isFinite(rawInsertIndex)) {
      const insertIndex = Utils.clamp(Math.round(rawInsertIndex), 1, rows.length - 1);
      const upper = rows[insertIndex - 1];
      const lower = rows[insertIndex];
      if (upper && lower) {
        const markerY = Math.round((Number(upper.rowBottom || 0) + Number(lower.rowTop || 0)) * 0.5);
        ctx.save();
        ctx.setLineDash([8, 4]);
        ctx.strokeStyle = "rgba(90, 65, 41, 0.96)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(CONSTANTS.LEFT_GUTTER + 2, markerY + 0.5);
        ctx.lineTo(width - 2, markerY + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(79, 58, 39, 0.96)";
        const markerLabel = "insert new track";
        ctx.font = "9px monospace";
        const padX = 5;
        const markerW = Math.ceil(ctx.measureText(markerLabel).width) + padX * 2;
        const markerX = Utils.clamp(CONSTANTS.LEFT_GUTTER + 6, CONSTANTS.LEFT_GUTTER + 2, Math.max(CONSTANTS.LEFT_GUTTER + 2, width - markerW - 2));
        const markerTop = Utils.clamp(markerY - 16, CONSTANTS.RULER_HEIGHT + 2, Math.max(CONSTANTS.RULER_HEIGHT + 2, markerY - 12));
        ctx.fillRect(markerX, markerTop, markerW, 12);
        ctx.strokeStyle = "rgba(226, 205, 176, 0.76)";
        ctx.lineWidth = 1;
        ctx.strokeRect(markerX + 0.5, markerTop + 0.5, Math.max(1, markerW - 1), 11);
        ctx.fillStyle = "#f8efe2";
        ctx.fillText(markerLabel, markerX + padX, markerTop + 9);
        ctx.restore();
      }
    }
  }

  const selectionRect = normalizeSelectionRect(state.boxSelection);
  if (selectionRect) {
    ctx.save();
    ctx.fillStyle = "rgba(76, 99, 138, 0.12)";
    ctx.fillRect(
      selectionRect.x0,
      selectionRect.y0,
      Math.max(1, selectionRect.x1 - selectionRect.x0),
      Math.max(1, selectionRect.y1 - selectionRect.y0)
    );
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(56, 84, 136, 0.92)";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(
      selectionRect.x0 + 0.5,
      selectionRect.y0 + 0.5,
      Math.max(1, selectionRect.x1 - selectionRect.x0 - 1),
      Math.max(1, selectionRect.y1 - selectionRect.y0 - 1)
    );
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (state.cutPreview && state.cutPreview.trackName) {
    const cutX = toX(Number(state.cutPreview.cutTimeSec || 0));
    const cutTop = Number.isFinite(Number(state.cutPreview.rowTop))
      ? Math.max(CONSTANTS.RULER_HEIGHT, Number(state.cutPreview.rowTop))
      : CONSTANTS.RULER_HEIGHT;
    const cutBottom = Number.isFinite(Number(state.cutPreview.rowBottom))
      ? Math.max(cutTop + 8, Number(state.cutPreview.rowBottom))
      : height;
    if (cutX >= CONSTANTS.LEFT_GUTTER - 2 && cutX <= width + 2) {
      ctx.save();
      ctx.strokeStyle = "rgba(142, 72, 58, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(cutX + 0.5, cutTop + 2);
      ctx.lineTo(cutX + 0.5, cutBottom - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(84, 52, 44, 0.94)";
      ctx.font = "9px monospace";
      const isTrimPreview = String(state.cutPreview.mode || "").trim().toLowerCase() === "trim";
      const trimSide = String(state.cutPreview.keepSide || "").trim().toLowerCase() === "right" ? "R" : "L";
      const label = isTrimPreview
        ? `trim ${trimSide} ${Number(state.cutPreview.cutTimeSec || 0).toFixed(2)}s`
        : `cut ${Number(state.cutPreview.cutTimeSec || 0).toFixed(2)}s`;
      const padX = 5;
      const labelW = Math.ceil(ctx.measureText(label).width) + padX * 2;
      const labelX = Utils.clamp(cutX - labelW / 2, CONSTANTS.LEFT_GUTTER + 2, Math.max(CONSTANTS.LEFT_GUTTER + 2, width - labelW - 2));
      const labelY = Utils.clamp(cutTop + 4, CONSTANTS.RULER_HEIGHT + 2, Math.max(CONSTANTS.RULER_HEIGHT + 2, cutBottom - 16));
      ctx.fillRect(labelX, labelY, labelW, 12);
      ctx.strokeStyle = "rgba(224, 196, 172, 0.76)";
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, Math.max(1, labelW - 1), 11);
      ctx.fillStyle = "#f8efe2";
      ctx.fillText(label, labelX + padX, labelY + 9);
      ctx.restore();
    }
  }

  const playheadX = toX(state.playheadSec);
  if (playheadX >= CONSTANTS.LEFT_GUTTER - 2 && playheadX <= width + 2) {
    ctx.strokeStyle = "rgba(26, 21, 16, 0.88)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }
}
