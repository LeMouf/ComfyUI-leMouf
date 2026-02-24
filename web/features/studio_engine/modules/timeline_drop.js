import {
  LEFT_GUTTER,
  RULER_HEIGHT,
  TIMELINE_EDIT_MAX_DURATION_SEC,
} from "./timeline_constants.js";
import { clamp } from "./timeline_utils.js";

export function normalizeResourceKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "audio" || kind === "video" || kind === "image") return kind;
  return "";
}

export function isTrackDropCompatible(track, resourceKind) {
  const kind = normalizeResourceKind(resourceKind);
  const rawTrackKind = String(track?.kind || "").trim().toLowerCase();
  if (rawTrackKind === "dropzone") return true;
  if (!kind) return true;
  const trackKind = normalizeResourceKind(rawTrackKind);
  if (!trackKind) return false;
  if (kind === "audio") return trackKind === "audio";
  return trackKind === kind;
}

export function resolveDropTargetFromPoint(
  state,
  x,
  y,
  resourceKind = "",
  {
    isTrackLocked = () => false,
    resolveVisibleSectionHeight = () => 0,
  } = {}
) {
  const strictTargeting = String(state?.dropTargetMode || "").toLowerCase() === "strict";
  const rows = Array.isArray(state?.trackRows) ? state.trackRows : [];
  const compatibleRows = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (!isTrackDropCompatible(row.track, resourceKind)) continue;
    const trackName = String(row.track?.name || "").trim();
    if (!trackName) continue;
    if (isTrackLocked(state, trackName)) continue;
    compatibleRows.push({
      row,
      trackName,
      trackKind: String(row.track?.kind || "").toLowerCase(),
    });
  }
  if (!compatibleRows.length) return null;

  const usePlayheadTime = Number(x) < LEFT_GUTTER;
  const clampedX = clamp(
    Number(x),
    LEFT_GUTTER,
    Math.max(LEFT_GUTTER + 1, Number(state?.canvas?.clientWidth || LEFT_GUTTER + 1))
  );
  const rawTime = usePlayheadTime
    ? Number(state?.playheadSec || 0)
    : state.t0Sec + (clampedX - LEFT_GUTTER) / Math.max(1e-6, state.pxPerSec);
  const maxTimelineTimeSec = state?.allowDurationExtend
    ? TIMELINE_EDIT_MAX_DURATION_SEC
    : Math.max(0, Number(state?.durationSec || 0));
  const timeSec = clamp(rawTime, 0, maxTimelineTimeSec);

  const hitRow = compatibleRows.find(({ row }) => y >= row.rowTop + 1 && y <= row.rowBottom - 1);
  if (hitRow) {
    const rowIndex = Number(hitRow.row?.index ?? -1);
    const isDropzone = hitRow.trackKind === "dropzone";
    const insertionIndex = isDropzone
      ? (rowIndex <= 0 ? 1 : rowIndex)
      : rowIndex;
    return {
      trackName: hitRow.trackName,
      trackKind: hitRow.trackKind,
      rowTop: hitRow.row.rowTop,
      rowBottom: hitRow.row.rowBottom,
      timeSec,
      rowIndex,
      insertMode: isDropzone,
      insertIndex: insertionIndex,
    };
  }

  if (strictTargeting) {
    const canvasHeight = Number(state?.canvas?.clientHeight || 0);
    const sectionHeight = resolveVisibleSectionHeight(state, canvasHeight);
    const minTop = RULER_HEIGHT + sectionHeight;
    const maxBottom = Math.max(minTop + 1, canvasHeight);
    const verticalPad = 12;
    if (!(Number(y) >= minTop - verticalPad && Number(y) <= maxBottom + verticalPad)) return null;
  }

  let best = compatibleRows[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of compatibleRows) {
    const centerY = (candidate.row.rowTop + candidate.row.rowBottom) * 0.5;
    const dist = Math.abs(Number(y) - centerY);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  const bestCenterY = (best.row.rowTop + best.row.rowBottom) * 0.5;
  const directionAfter = Number(y) >= bestCenterY;
  const rowIndex = Number(best.row?.index ?? 0);
  let insertIndex = rowIndex + (directionAfter ? 1 : 0);
  const rowsLen = Math.max(0, rows.length);
  if (rowsLen > 1) {
    insertIndex = clamp(insertIndex, 1, rowsLen - 1);
  } else {
    insertIndex = Math.max(0, insertIndex);
  }
  return {
    trackName: best.trackName,
    trackKind: best.trackKind,
    rowTop: best.row.rowTop,
    rowBottom: best.row.rowBottom,
    timeSec,
    rowIndex,
    insertMode: true,
    insertIndex,
  };
}

export function isDropzoneInsertHoverMatch(row, insertMode, insertIndex, targetTrackName = "") {
  if (!row || typeof row !== "object") return false;
  if (!Boolean(insertMode)) return false;
  const rowTrack = row.track && typeof row.track === "object" ? row.track : null;
  const rowTrackName = String(rowTrack?.name || "").trim();
  const rowTrackKind = String(rowTrack?.kind || "").trim().toLowerCase();
  if (rowTrackKind !== "dropzone") return false;
  const targetName = String(targetTrackName || "").trim();
  if (targetName && targetName === rowTrackName) return true;
  const idx = Math.round(Number(insertIndex));
  if (!Number.isFinite(idx)) return false;
  const rowIndex = Math.round(Number(row.index ?? -1));
  const position = String(rowTrack?.position || "").trim().toLowerCase();
  if (position === "top") return idx <= Math.max(1, rowIndex + 1);
  if (position === "bottom") return idx >= Math.max(0, rowIndex);
  return idx === rowIndex || idx === rowIndex + 1;
}

export function readResourceDragPayload(dataTransfer) {
  const readGlobalPayload = () => {
    try {
      const payload = globalThis.__lemoufResourceDragPayload;
      if (!payload || typeof payload !== "object") return { resourceId: "", resourceKind: "" };
      return {
        resourceId: String(payload.resourceId || "").trim(),
        resourceKind: normalizeResourceKind(payload.resourceKind || ""),
      };
    } catch {
      return { resourceId: "", resourceKind: "" };
    }
  };
  if (!dataTransfer) return readGlobalPayload();
  const resourceId = String(
    dataTransfer.getData("application/x-lemouf-resource-id") ||
      dataTransfer.getData("text/plain") ||
      ""
  )
    .trim();
  const resourceKind = normalizeResourceKind(
    dataTransfer.getData("application/x-lemouf-resource-kind") || ""
  );
  if (resourceId) return { resourceId, resourceKind };
  return readGlobalPayload();
}

export function sameDropTarget(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (String(a.trackName || "") !== String(b.trackName || "")) return false;
  if (String(a.trackKind || "") !== String(b.trackKind || "")) return false;
  if (String(a.resourceId || "") !== String(b.resourceId || "")) return false;
  if (String(a.resourceKind || "") !== String(b.resourceKind || "")) return false;
  if (Boolean(a.insertMode) !== Boolean(b.insertMode)) return false;
  if (Number(a.insertIndex || -1) !== Number(b.insertIndex || -1)) return false;
  return Math.abs(Number(a.timeSec || 0) - Number(b.timeSec || 0)) < 0.02;
}
