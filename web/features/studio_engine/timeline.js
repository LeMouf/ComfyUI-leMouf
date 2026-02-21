import { el } from "../../shared/ui/dom.js";
import { createIcon, setButtonIcon } from "../../shared/ui/icons.js";
import { buildPresetIntent, inferMidiPreset, midiNoteToFrequency, planDsp } from "./audio_preset_plan.js";

const TIMELINE_STATE = new WeakMap();

const RULER_HEIGHT = 30;
const DEFAULT_SECTION_HEIGHT = 72;
const MIN_SECTION_HEIGHT = 56;
const MAX_SECTION_HEIGHT = 300;
const SECTION_RESIZE_HANDLE_HEIGHT = 10;
const SECTION_HEIGHT_STORAGE_KEY = "lemoufSong2DawSectionHeight";
const ROW_HEIGHT = 44;
const VIDEO_ROW_HEIGHT = 64;
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
const SKELETON_MODE_STORAGE_KEY = "lemoufStudioTimelineSkeletonMode";
const TIMELINE_SNAP_STORAGE_KEY = "lemoufSong2DawTimelineSnapEnabled";
const TRACK_ROW_SCALE_STORAGE_KEY = "lemoufSong2DawTrackRowScale";
const SECTION_VIZ_MODES = ["bands", "filled", "peaks", "line", "dots"];
const RULER_TARGET_PX = 92;
const RULER_STEP_OPTIONS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIDI_MASTER_GAIN = 0.5;
const CLIP_EDIT_MIN_DURATION_SEC = 0.1;
const CLIP_EDIT_SNAP_PX = 10;
const CLIP_EDIT_TIME_EPS_SEC = 1e-6;
const CLIP_WINDOW_BAR_HEIGHT = 5;
const CLIP_WINDOW_BAR_BOTTOM_MARGIN = 3;
const TIMELINE_EDIT_MAX_DURATION_SEC = 21_600;
const VIDEO_FILMSTRIP_MIN_FRAMES = 3;
const VIDEO_FILMSTRIP_MAX_FRAMES = 10;
const VIDEO_FILMSTRIP_TARGET_WIDTH = 128;
const VIDEO_FILMSTRIP_TARGET_HEIGHT = 72;
const VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT = 48;
const VIDEO_FILMSTRIP_TILE_GAP = 3;
const VIDEO_FILMSTRIP_MAX_CONCURRENCY = 2;
const VIDEO_PREVIEW_MODE_STORAGE_KEY = "lemoufStudioVideoPreviewMode";
const VIDEO_PREVIEW_MODES = ["auto", "light", "full"];
const VIDEO_PREVIEW_QUALITY_HINTS = ["auto", "low", "medium", "high"];
const VIDEO_FILMSTRIP_FRAME_BUCKETS = [2, 3, 4, 5, 6, 8, 10, 12];
const TRACK_ROW_SCALE_MIN = 0.6;
const TRACK_ROW_SCALE_MAX = 2.8;
const SCISSORS_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext x='2' y='18' font-size='18'%3E%E2%9C%82%3C/text%3E%3C/svg%3E\") 4 16, crosshair";
const JOIN_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext x='2' y='18' font-size='17'%3E%E2%87%94%3C/text%3E%3C/svg%3E\") 5 12, pointer";
const CLIP_JOIN_TIME_EPS_SEC = 0.035;
let FILMSTRIP_QUEUE_ACTIVE = 0;
const FILMSTRIP_QUEUE = [];
const AUDIO_VIZ_DEFAULT_PALETTE = {
  strokeStyle: "rgba(62, 46, 32, 0.82)",
  fillStyle: "rgba(97, 73, 53, 0.34)",
  bandLowStyle: "rgba(94, 171, 132, 0.72)",
  bandMidStyle: "rgba(219, 174, 90, 0.76)",
  bandHighStyle: "rgba(198, 104, 147, 0.76)",
  centerLineStyle: "rgba(120, 100, 82, 0.16)",
};

function resolveAudioVizPalette(overrides = null) {
  if (!overrides || typeof overrides !== "object") return { ...AUDIO_VIZ_DEFAULT_PALETTE };
  return { ...AUDIO_VIZ_DEFAULT_PALETTE, ...overrides };
}

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

function clipHueByTrackKind(trackKind, trackName) {
  const kind = String(trackKind || "").toLowerCase();
  if (kind === "video") return 104;
  if (kind === "image") return 64;
  if (kind === "audio") return 286;
  if (kind === "midi") return 228;
  const text = String(trackName || "track");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function resolveAlternatingClipFill(trackKind, trackName, clipIndex = 0) {
  const hue = clipHueByTrackKind(trackKind, trackName);
  const alt = Math.abs(Number(clipIndex || 0)) % 2 === 1;
  const saturation = 44;
  const lightness = alt ? 66 : 56;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function resolveAlternatingClipStroke(trackKind, trackName, clipIndex = 0, selected = false) {
  if (selected) return "rgba(36, 26, 18, 0.88)";
  const hue = clipHueByTrackKind(trackKind, trackName);
  const alt = Math.abs(Number(clipIndex || 0)) % 2 === 1;
  const saturation = alt ? 32 : 38;
  const lightness = alt ? 34 : 30;
  return `hsl(${hue} ${saturation}% ${lightness}% / 0.76)`;
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

function buildExplicitResourceClips(events, durationSec, fallbackLabel) {
  if (!Array.isArray(events) || !events.length) return [];
  const maxDuration = Math.max(0.01, Number(durationSec || 0));
  const clips = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i] || {};
    const time = clamp(Math.max(0, Number(event?.time || 0)), 0, maxDuration);
    const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC));
    const end = clamp(time + duration, time + CLIP_EDIT_MIN_DURATION_SEC, maxDuration);
    const resourceId = String(event?.resourceId || "").trim();
    const explicitClipId = String(event?.clipId || "").trim();
    clips.push({
      start: time,
      end,
      label: String(event?.label || fallbackLabel || "clip"),
      notesCount: 0,
      resourceId: resourceId || null,
      clipId: explicitClipId || (resourceId ? `resource:${resourceId}` : `event:${i}:${time.toFixed(4)}`),
      linkGroupId: String(event?.linkGroupId || "").trim(),
      startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
      sourceDurationSec: Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(event?.sourceDurationSec || duration || CLIP_EDIT_MIN_DURATION_SEC)
      ),
      thumbnailSrc: String(event?.previewSrc || event?.src || "").trim(),
      src: String(event?.src || "").trim(),
      previewSrc: String(event?.previewSrc || "").trim(),
    });
  }
  clips.sort((a, b) => a.start - b.start || a.end - b.end || String(a.clipId || "").localeCompare(String(b.clipId || "")));
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

function normalizeSnapEnabled(value) {
  if (value == null || value === "") return true;
  const normalized = String(value).trim().toLowerCase();
  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off" ||
    normalized === "no"
  );
}

function normalizeVideoPreviewMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (VIDEO_PREVIEW_MODES.includes(normalized)) return normalized;
  return "auto";
}

function normalizeVideoPreviewQualityHint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (VIDEO_PREVIEW_QUALITY_HINTS.includes(normalized)) return normalized;
  return "auto";
}

function bucketizeFilmstripFrameCount(value) {
  const numeric = Math.max(0, Math.round(Number(value || 0)));
  if (!numeric) return 0;
  let closest = VIDEO_FILMSTRIP_FRAME_BUCKETS[0];
  let bestDelta = Math.abs(numeric - closest);
  for (const bucket of VIDEO_FILMSTRIP_FRAME_BUCKETS) {
    const delta = Math.abs(numeric - bucket);
    if (delta < bestDelta) {
      closest = bucket;
      bestDelta = delta;
    }
  }
  return closest;
}

function normalizeFilmstripTargetHeight(value) {
  const numeric = clamp(Math.round(Number(value || VIDEO_FILMSTRIP_TARGET_HEIGHT)), 24, VIDEO_FILMSTRIP_TARGET_HEIGHT);
  return Math.max(24, Math.round(numeric / 4) * 4);
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

function normalizeTrackRowScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return clamp(numeric, TRACK_ROW_SCALE_MIN, TRACK_ROW_SCALE_MAX);
}

function resolveTrackRowHeight(state, trackKind) {
  const scale = normalizeTrackRowScale(state?.trackRowScale);
  const base = String(trackKind || "").toLowerCase() === "video" ? VIDEO_ROW_HEIGHT : ROW_HEIGHT;
  return Math.max(16, Math.round(base * scale));
}

function buildTrackRowsLayout(state, tracks, trackAreaY) {
  const rows = [];
  let yCursor = 0;
  let previousGroupKey = "";
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i];
    const trackKind = String(track?.kind || "").toLowerCase();
    const rowHeight = resolveTrackRowHeight(state, trackKind);
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
      rowBottom: rowTop + rowHeight,
      rowHeight,
      gapBefore,
      groupLabel: group.label,
      groupKey: group.key,
    });
    yCursor += rowHeight;
    previousGroupKey = group.key;
  }
  return {
    rows,
    totalHeight: yCursor,
  };
}

function normalizeResourceKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "audio" || kind === "video" || kind === "image") return kind;
  return "";
}

function isTrackDropCompatible(track, resourceKind) {
  const kind = normalizeResourceKind(resourceKind);
  const rawTrackKind = String(track?.kind || "").trim().toLowerCase();
  if (rawTrackKind === "dropzone") return true;
  if (!kind) return true;
  const trackKind = normalizeResourceKind(rawTrackKind);
  if (!trackKind) return false;
  if (kind === "audio") return trackKind === "audio";
  return trackKind === kind;
}

function resolveDropTargetFromPoint(state, x, y, resourceKind = "") {
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

  // If x is in the left lane (labels), use playhead time as drop anchor.
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

  // If dropped between rows, snap to nearest compatible row by center distance.
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

function readResourceDragPayload(dataTransfer) {
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

function sameDropTarget(a, b) {
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

function collectTrackEventEdgesSec(state, trackName, excludeResourceId = "", excludeClipId = "") {
  const name = String(trackName || "").trim();
  if (!name) return [];
  const eventsByTrack = state?.studioData?.eventsByTrack;
  const events = Array.isArray(eventsByTrack?.[name]) ? eventsByTrack[name] : [];
  const exclude = String(excludeResourceId || "").trim();
  const excludeClip = String(excludeClipId || "").trim();
  const edges = [];
  for (const event of events) {
    const resourceId = String(event?.resourceId || "").trim();
    const clipId = String(event?.clipId || "").trim();
    if (exclude && resourceId && resourceId === exclude) continue;
    if (excludeClip && clipId && clipId === excludeClip) continue;
    const t0 = toFiniteNumber(event?.time, null);
    const dur = toFiniteNumber(event?.duration, null);
    if (t0 == null) continue;
    const start = Math.max(0, t0);
    const end = Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, start + Math.max(0, dur ?? CLIP_EDIT_MIN_DURATION_SEC));
    edges.push(start, end);
  }
  return edges;
}

function intervalsOverlapSec(aStart, aEnd, bStart, bEnd) {
  const epsilon = 1e-4;
  return aStart < bEnd - epsilon && aEnd > bStart + epsilon;
}

function getTrackNamesByKind(state, trackKind) {
  const kind = String(trackKind || "").trim().toLowerCase();
  if (!kind) return [];
  const tracks = Array.isArray(state?.studioData?.tracks) ? state.studioData.tracks : [];
  const names = [];
  for (const track of tracks) {
    if (String(track?.kind || "").trim().toLowerCase() !== kind) continue;
    const name = String(track?.name || "").trim();
    if (!name) continue;
    names.push(name);
  }
  return names;
}

function trackNameSupportsKind(state, trackName, trackKind) {
  const name = String(trackName || "").trim();
  const kind = String(trackKind || "").trim().toLowerCase();
  if (!name || !kind) return false;
  const tracks = Array.isArray(state?.studioData?.tracks) ? state.studioData.tracks : [];
  const match = tracks.find((track) => String(track?.name || "").trim() === name);
  if (match) return String(match?.kind || "").trim().toLowerCase() === kind;
  const lower = name.toLowerCase();
  if (kind === "video") return lower.startsWith("video");
  if (kind === "image") return lower.startsWith("image");
  if (kind === "audio") return lower.startsWith("audio");
  return false;
}

function trackHasOverlap(state, trackName, startSec, endSec, excludeResourceId = "", excludeClipId = "") {
  const name = String(trackName || "").trim();
  if (!name) return false;
  const eventsByTrack = state?.studioData?.eventsByTrack;
  const events = Array.isArray(eventsByTrack?.[name]) ? eventsByTrack[name] : [];
  const exclude = String(excludeResourceId || "").trim();
  const excludeClip = String(excludeClipId || "").trim();
  const start = Number(startSec || 0);
  const end = Number(endSec || 0);
  if (!(end > start + 1e-4)) return false;
  for (const event of events) {
    const eventResourceId = String(event?.resourceId || "").trim();
    const eventClipId = String(event?.clipId || "").trim();
    if (exclude && eventResourceId && eventResourceId === exclude) continue;
    if (excludeClip && eventClipId && eventClipId === excludeClip) continue;
    const eventStart = Math.max(0, Number(event?.time || 0));
    const eventEnd = Math.max(
      eventStart + CLIP_EDIT_MIN_DURATION_SEC,
      eventStart + Math.max(0, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC))
    );
    if (intervalsOverlapSec(start, end, eventStart, eventEnd)) return true;
  }
  return false;
}

function collectTrackNeighborBounds(state, {
  trackName = "",
  clipStartSec = 0,
  clipEndSec = 0,
  excludeClipKeys = null,
  excludeResourceId = "",
  excludeClipId = "",
} = {}) {
  const name = String(trackName || "").trim();
  if (!name) {
    return {
      leftBoundSec: 0,
      rightBoundSec: Number.POSITIVE_INFINITY,
    };
  }
  const eventsByTrack = state?.studioData?.eventsByTrack;
  const events = Array.isArray(eventsByTrack?.[name]) ? eventsByTrack[name] : [];
  const clipStart = Math.max(0, Number(clipStartSec || 0));
  const clipEnd = Math.max(clipStart + CLIP_EDIT_MIN_DURATION_SEC, Number(clipEndSec || clipStart + CLIP_EDIT_MIN_DURATION_SEC));
  const excludeRes = String(excludeResourceId || "").trim();
  const excludeCid = String(excludeClipId || "").trim();
  const excluded = excludeClipKeys instanceof Set ? excludeClipKeys : null;
  let leftBoundSec = 0;
  let rightBoundSec = Number.POSITIVE_INFINITY;
  for (const event of events) {
    const eventTrackName = name;
    const eventClipId = String(event?.clipId || event?.resourceId || "").trim();
    const eventResourceId = String(event?.resourceId || "").trim();
    if (excludeRes && eventResourceId && eventResourceId === excludeRes) continue;
    if (excludeCid && eventClipId && eventClipId === excludeCid) continue;
    if (excluded && excluded.has(makeClipSelectionKey(eventTrackName, eventClipId))) continue;
    const eventStart = Math.max(0, Number(event?.time || 0));
    const eventEnd = Math.max(
      eventStart + CLIP_EDIT_MIN_DURATION_SEC,
      eventStart + Math.max(0, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC))
    );
    if (eventEnd <= clipStart + 1e-4) {
      if (eventEnd > leftBoundSec) leftBoundSec = eventEnd;
      continue;
    }
    if (eventStart >= clipEnd - 1e-4) {
      if (eventStart < rightBoundSec) rightBoundSec = eventStart;
    }
  }
  return { leftBoundSec, rightBoundSec };
}

function resolveMoveDeltaBoundsForClip(state, {
  trackName = "",
  clipStartSec = 0,
  clipEndSec = 0,
  excludeClipKeys = null,
  excludeResourceId = "",
  excludeClipId = "",
  maxTimelineSec = 0,
} = {}) {
  const start = Math.max(0, Number(clipStartSec || 0));
  const end = Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(clipEndSec || start + CLIP_EDIT_MIN_DURATION_SEC));
  const maxTime = Math.max(end, Number(maxTimelineSec || 0));
  const { leftBoundSec, rightBoundSec } = collectTrackNeighborBounds(state, {
    trackName,
    clipStartSec: start,
    clipEndSec: end,
    excludeClipKeys,
    excludeResourceId,
    excludeClipId,
  });
  const minDelta = leftBoundSec - start;
  const rightClamp = Number.isFinite(rightBoundSec) ? rightBoundSec : maxTime;
  const maxDelta = rightClamp - end;
  return {
    minDelta: Number.isFinite(minDelta) ? minDelta : -start,
    maxDelta: Number.isFinite(maxDelta) ? maxDelta : (maxTime - end),
  };
}

function trackLaneSortValue(trackName, trackKind) {
  const name = String(trackName || "").trim();
  const kind = String(trackKind || "").trim().toLowerCase();
  const base = kind === "video" ? "video" : (kind === "image" ? "image" : kind);
  const regex = new RegExp(`^${base}\\s*(\\d+)$`, "i");
  const match = name.match(regex);
  if (!match) return Number.POSITIVE_INFINITY;
  const lane = Number(match[1]);
  return Number.isFinite(lane) ? lane : Number.POSITIVE_INFINITY;
}

function createNextTrackLaneName(trackKind, existingTrackNames = []) {
  const kind = String(trackKind || "").trim().toLowerCase();
  const base = kind === "video" ? "Video" : (kind === "image" ? "Image" : "Track");
  let maxLane = 0;
  for (const nameRaw of existingTrackNames) {
    const name = String(nameRaw || "").trim();
    const lane = trackLaneSortValue(name, kind);
    if (Number.isFinite(lane)) maxLane = Math.max(maxLane, lane);
  }
  return `${base} ${Math.max(1, maxLane + 1)}`;
}

function resolveNonOverlappingTrackName(state, options = {}) {
  const trackKind = String(options?.trackKind || "").trim().toLowerCase();
  const preferredTrackName = String(options?.preferredTrackName || "").trim();
  const startSec = Number(options?.startSec || 0);
  const endSec = Number(options?.endSec || 0);
  const excludeResourceId = String(options?.excludeResourceId || "").trim();
  const excludeClipId = String(options?.excludeClipId || "").trim();
  const allowCreateLane = options?.allowCreateLane !== false;
  if (!(trackKind === "video" || trackKind === "image")) return preferredTrackName;

  const knownTracks = getTrackNamesByKind(state, trackKind).sort((a, b) => {
    const laneA = trackLaneSortValue(a, trackKind);
    const laneB = trackLaneSortValue(b, trackKind);
    if (laneA !== laneB) return laneA - laneB;
    return a.localeCompare(b);
  });

  const ordered = [];
  if (preferredTrackName && trackNameSupportsKind(state, preferredTrackName, trackKind)) {
    ordered.push(preferredTrackName);
  }
  for (const name of knownTracks) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  if (!ordered.length && preferredTrackName) return preferredTrackName;

  for (const trackName of ordered) {
    if (isTrackLocked(state, trackName)) continue;
    if (!trackHasOverlap(state, trackName, startSec, endSec, excludeResourceId, excludeClipId)) {
      return trackName;
    }
  }
  if (!allowCreateLane) return preferredTrackName || ordered[0] || "";
  return createNextTrackLaneName(trackKind, ordered);
}

function findResourceDurationHintSec(state, resourceId, fallback = 1) {
  const id = String(resourceId || "").trim();
  if (!id) return Math.max(0.25, Number(fallback || 1));
  const explicitHints = state?.studioData?.resourceDurationById;
  if (explicitHints && typeof explicitHints === "object") {
    const hinted = Number(explicitHints[id] || 0);
    if (Number.isFinite(hinted) && hinted > 0) {
      return Math.max(0.25, hinted);
    }
  }
  const eventsByTrack = state?.studioData?.eventsByTrack;
  if (!eventsByTrack || typeof eventsByTrack !== "object") {
    return Math.max(0.25, Number(fallback || 1));
  }
  const durations = [];
  for (const events of Object.values(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      if (String(event?.resourceId || "").trim() !== id) continue;
      const duration = Number(event?.duration || 0);
      if (Number.isFinite(duration) && duration > 0) durations.push(duration);
    }
  }
  if (!durations.length) return Math.max(0.25, Number(fallback || 1));
  return Math.max(0.25, durations.reduce((a, b) => Math.max(a, b), 0));
}

function snapTimeSec(state, rawTimeSec, options = {}) {
  const maxTimeSec = Number.isFinite(Number(options?.maxTimeSec))
    ? Math.max(0, Number(options.maxTimeSec))
    : getTimelineMaxTimeSec(state, { includePreview: true });
  const time = clamp(Number(rawTimeSec || 0), 0, maxTimeSec);
  if (state?.snapEnabled === false) return time;
  const thresholdSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, Number(state?.pxPerSec || 1));
  const candidates = [];
  candidates.push(0, maxTimeSec);
  candidates.push(Math.max(0, Number(state?.playheadSec || 0)));
  const sections = Array.isArray(state?.studioData?.sections) ? state.studioData.sections : [];
  for (const section of sections) {
    const s0 = toFiniteNumber(section?.start, null);
    const s1 = toFiniteNumber(section?.end, null);
    if (s0 != null) candidates.push(Math.max(0, s0));
    if (s1 != null) candidates.push(Math.max(0, s1));
  }
  const gridMajor = chooseRulerStepSec(Math.max(1e-6, Number(state?.pxPerSec || 1)));
  const gridStep = gridMajor >= 1 ? gridMajor / 4 : gridMajor / 2;
  if (gridStep > 0) {
    const nearestGrid = Math.round(time / gridStep) * gridStep;
    candidates.push(nearestGrid);
  }
  const trackName = String(options?.trackName || "").trim();
  if (trackName) {
    const trackEdges = collectTrackEventEdgesSec(
      state,
      trackName,
      options?.excludeResourceId || "",
      options?.excludeClipId || ""
    );
    for (const edge of trackEdges) candidates.push(edge);
  }

  let best = time;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidateRaw of candidates) {
    const candidate = clamp(Number(candidateRaw || 0), 0, maxTimeSec);
    const delta = Math.abs(candidate - time);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  if (bestDelta <= thresholdSec) return best;
  return time;
}

function isNearTimelineOrigin(state, rawTimeSec, pointerCanvasX = null) {
  const pxPerSec = Math.max(1e-6, Number(state?.pxPerSec || 1));
  const boundarySnapSec = CLIP_EDIT_SNAP_PX / pxPerSec;
  const raw = Math.max(0, Number(rawTimeSec || 0));
  if (raw <= boundarySnapSec) return true;
  if (!Number.isFinite(Number(pointerCanvasX))) return false;
  const canvasWidth = Math.max(0, Number(state?.canvas?.clientWidth || 0));
  const t0Sec = Math.max(0, Number(state?.t0Sec || 0));
  const originX = LEFT_GUTTER + (0 - t0Sec) * pxPerSec;
  if (originX < LEFT_GUTTER - CLIP_EDIT_SNAP_PX || originX > canvasWidth + CLIP_EDIT_SNAP_PX) {
    return false;
  }
  return Math.abs(Number(pointerCanvasX) - originX) <= CLIP_EDIT_SNAP_PX;
}

function getTimelineMaxTimeSec(state, { includePreview = false } = {}) {
  const baseDurationSec = Math.max(0, Number(state?.durationSec || 0));
  if (!state?.allowDurationExtend) return baseDurationSec;
  let maxSec = baseDurationSec;
  const eventsByTrack = state?.studioData?.eventsByTrack;
  if (eventsByTrack && typeof eventsByTrack === "object") {
    for (const events of Object.values(eventsByTrack)) {
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        const t0 = Math.max(0, Number(event?.time || 0));
        const dur = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC));
        maxSec = Math.max(maxSec, t0 + dur);
      }
    }
  }
  if (includePreview && state?.previewClipEdits instanceof Map) {
    for (const edit of state.previewClipEdits.values()) {
      if (!edit || typeof edit !== "object") continue;
      const t0 = Math.max(0, Number(edit?.start || 0));
      const t1 = Math.max(t0 + CLIP_EDIT_MIN_DURATION_SEC, Number(edit?.end || t0 + CLIP_EDIT_MIN_DURATION_SEC));
      maxSec = Math.max(maxSec, t1);
    }
  }
  return clamp(maxSec, 0, TIMELINE_EDIT_MAX_DURATION_SEC);
}

function getClipId(clip, fallback = "") {
  const id = String(clip?.clipId || clip?.resourceId || fallback || "").trim();
  return id || "";
}

function makeClipSelectionKey(trackName, clipId) {
  const safeTrack = String(trackName || "").trim();
  const safeClip = String(clipId || "").trim();
  if (!safeTrack || !safeClip) return "";
  return `${safeTrack}::${safeClip}`;
}

function isClipSelectedInSet(state, trackName, clipId) {
  const key = makeClipSelectionKey(trackName, clipId);
  if (!key) return false;
  return Boolean(state?.selectedClipKeys && state.selectedClipKeys.has(key));
}

function clearClipSelectionSet(state) {
  if (!state?.selectedClipKeys || !(state.selectedClipKeys instanceof Set)) return false;
  if (!state.selectedClipKeys.size) return false;
  state.selectedClipKeys.clear();
  return true;
}

function toggleClipSelectionFromHit(state, hit) {
  const trackName = String(hit?.track_name || "").trim();
  const clipId = String(hit?.clip_id || "").trim();
  if (!trackName || !clipId) return false;
  if (!(state.selectedClipKeys instanceof Set)) state.selectedClipKeys = new Set();
  const key = makeClipSelectionKey(trackName, clipId);
  if (!key) return false;
  if (state.selectedClipKeys.has(key)) state.selectedClipKeys.delete(key);
  else state.selectedClipKeys.add(key);
  return true;
}

function collectSelectedClipIdsForTrack(state, trackName) {
  const safeTrackName = String(trackName || "").trim();
  if (!safeTrackName) return [];
  if (!(state?.selectedClipKeys instanceof Set) || !state.selectedClipKeys.size) return [];
  const prefix = `${safeTrackName}::`;
  const out = [];
  for (const key of state.selectedClipKeys.values()) {
    const value = String(key || "").trim();
    if (!value.startsWith(prefix)) continue;
    const clipId = value.slice(prefix.length).trim();
    if (!clipId) continue;
    out.push(clipId);
  }
  return Array.from(new Set(out));
}

function resolveClipEditResult(result) {
  if (result && typeof result === "object") {
    return {
      accepted: result.accepted !== false,
      trackName: String(result.trackName || "").trim(),
    };
  }
  return {
    accepted: Boolean(result),
    trackName: "",
  };
}

function normalizeSelectionRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const x0 = Number(rect.x0);
  const y0 = Number(rect.y0);
  const x1 = Number(rect.x1);
  const y1 = Number(rect.y1);
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return null;
  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

function isRectContained(container, inner) {
  if (!container || !inner) return false;
  return (
    inner.x0 >= container.x0 &&
    inner.y0 >= container.y0 &&
    inner.x1 <= container.x1 &&
    inner.y1 <= container.y1
  );
}

function resolvePrimaryClipSelectionKey(state) {
  const selection = state?.selection;
  if (!selection || typeof selection !== "object") return "";
  if (String(selection.type || "") !== "clip") return "";
  const trackName = String(selection.track_name || "").trim();
  const clipId = String(selection.clip_id || "").trim();
  return makeClipSelectionKey(trackName, clipId);
}

function resolveEffectiveSelectedClipCount(state) {
  const setCount = state?.selectedClipKeys instanceof Set ? state.selectedClipKeys.size : 0;
  if (setCount > 0) return setCount;
  return resolvePrimaryClipSelectionKey(state) ? 1 : 0;
}

function makePreviewClipEditKey(clipId, trackName = "") {
  const id = String(clipId || "").trim();
  if (!id) return "";
  const track = String(trackName || "").trim();
  return track ? `${track}::${id}` : id;
}

function getPreviewClipEdit(state, clipId, trackName = "") {
  const key = String(clipId || "").trim();
  if (!key || !state?.previewClipEdits) return null;
  const byTrack = makePreviewClipEditKey(key, trackName);
  if (byTrack) {
    const scoped = state.previewClipEdits.get(byTrack);
    if (scoped && typeof scoped === "object") return scoped;
  }
  const generic = state.previewClipEdits.get(key);
  if (!generic || typeof generic !== "object") return null;
  const safeTrack = String(trackName || "").trim();
  const genericTrack = String(generic.trackName || "").trim();
  if (safeTrack && genericTrack && safeTrack !== genericTrack) return null;
  return generic;
}

function resolveFinalPreviewClipEdit(state, session) {
  if (!state?.previewClipEdits || !session) return null;
  const preferTrackKind = String(session.trackKind || "").trim().toLowerCase();
  const targets = Array.isArray(session.previewTargets) ? session.previewTargets : [];
  const preferredTargets = targets.filter(
    (target) => String(target?.trackKind || "").trim().toLowerCase() === preferTrackKind
  );
  const orderedTargets = preferredTargets.length ? preferredTargets.concat(targets.filter((t) => !preferredTargets.includes(t))) : targets;

  for (const target of orderedTargets) {
    const clipId = String(target?.clipId || "").trim();
    if (!clipId) continue;
    const trackName = String(target?.trackName || "").trim();
    const byResolved = getPreviewClipEdit(state, clipId, trackName);
    if (byResolved && typeof byResolved === "object") return byResolved;
    const scopedKey = makePreviewClipEditKey(clipId, trackName);
    const scoped = scopedKey ? state.previewClipEdits.get(scopedKey) : null;
    if (scoped && typeof scoped === "object") return scoped;
    const generic = state.previewClipEdits.get(clipId);
    if (generic && typeof generic === "object") return generic;
  }

  const safeClipId = String(session.clipId || "").trim();
  if (safeClipId) {
    const any = collectPreviewEditsForClip(state, safeClipId);
    if (any.length) {
      if (preferTrackKind) {
        const withKind = any.find((row) => {
          const trackName = String(row?.trackName || "").trim();
          const kind = inferStudioTrackKindByName(trackName);
          return kind === preferTrackKind;
        });
        if (withKind) return withKind;
      }
      return any[0];
    }
    const generic = state.previewClipEdits.get(safeClipId);
    if (generic && typeof generic === "object") return generic;
  }
  return null;
}

function collectPreviewEditsForClip(state, clipId) {
  const key = String(clipId || "").trim();
  if (!key || !(state?.previewClipEdits instanceof Map) || state.previewClipEdits.size === 0) return [];
  const out = [];
  const seen = new Set();
  for (const [entryKeyRaw, value] of state.previewClipEdits.entries()) {
    const entryKey = String(entryKeyRaw || "").trim();
    if (!entryKey || !value || typeof value !== "object") continue;
    if (!(entryKey === key || entryKey.endsWith(`::${key}`))) continue;
    const trackName = String(value.trackName || "").trim();
    const start = Math.max(0, Number(value.start || 0));
    const end = Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(value.end || (start + CLIP_EDIT_MIN_DURATION_SEC)));
    const startOffsetSec = Math.max(0, Number(value.startOffsetSec || 0));
    const sourceDurationSec = Math.max(
      CLIP_EDIT_MIN_DURATION_SEC,
      Number(value.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)
    );
    const signature = `${trackName}|${start.toFixed(4)}|${end.toFixed(4)}|${startOffsetSec.toFixed(4)}|${sourceDurationSec.toFixed(4)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({
      trackName,
      start,
      end,
      startOffsetSec,
      sourceDurationSec,
    });
  }
  return out;
}

function collectLinkedClipTargets(state, {
  clipId = "",
  resourceId = "",
  linkGroupId = "",
  fallbackTrackName = "",
  fallbackTrackKind = "",
} = {}) {
  const safeClipId = String(clipId || "").trim();
  const safeResourceId = String(resourceId || "").trim();
  const safeLinkGroupId = String(linkGroupId || "").trim();
  const out = [];
  const seen = new Set();
  const eventsByTrack = state?.studioData?.eventsByTrack && typeof state.studioData.eventsByTrack === "object"
    ? state.studioData.eventsByTrack
    : null;
  const tracks = Array.isArray(state?.studioData?.tracks) ? state.studioData.tracks : [];
  const kindByTrack = new Map(
    tracks.map((track) => [String(track?.name || "").trim(), String(track?.kind || "").toLowerCase()])
  );
  if (eventsByTrack) {
    for (const [trackName, events] of Object.entries(eventsByTrack)) {
      if (!Array.isArray(events)) continue;
      const safeTrackName = String(trackName || "").trim();
      const trackKind = String(kindByTrack.get(safeTrackName) || inferStudioTrackKindByName(safeTrackName)).toLowerCase();
      for (const event of events) {
        const eventClipId = String(event?.clipId || event?.resourceId || "").trim();
        if (!eventClipId) continue;
        const eventResourceId = String(event?.resourceId || "").trim();
        const eventLinkGroupId = String(event?.linkGroupId || "").trim();
        const samePrimary = safeClipId && safeResourceId
          ? eventClipId === safeClipId && eventResourceId === safeResourceId
          : (safeClipId ? eventClipId === safeClipId : false);
        const sameLink = Boolean(safeLinkGroupId) &&
          eventLinkGroupId === safeLinkGroupId &&
          (!safeResourceId || !eventResourceId || eventResourceId === safeResourceId);
        if (!samePrimary && !sameLink) continue;
        const key = `${safeTrackName}::${eventClipId}::${eventResourceId || "-"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          clipId: eventClipId,
          resourceId: eventResourceId,
          trackName: safeTrackName,
          trackKind,
          linkGroupId: eventLinkGroupId || safeLinkGroupId,
        });
      }
    }
  }
  if (!out.length && safeClipId) {
    out.push({
      clipId: safeClipId,
      resourceId: safeResourceId,
      trackName: String(fallbackTrackName || "").trim(),
      trackKind: String(fallbackTrackKind || "").trim().toLowerCase(),
      linkGroupId: safeLinkGroupId,
    });
  }
  return out;
}

function writePreviewClipEdits(state, session, next) {
  if (!state?.previewClipEdits || !session) return;
  const targets = Array.isArray(session.previewTargets) && session.previewTargets.length
    ? session.previewTargets
    : [{
        clipId: String(session.clipId || ""),
        resourceId: String(session.resourceId || ""),
        trackName: String(session.trackName || ""),
        trackKind: String(session.trackKind || ""),
        linkGroupId: String(session.linkGroupId || ""),
      }];
  // Keep preview map deterministic while dragging across lanes:
  // remove stale scoped entries for the same clip ids before writing the new geometry.
  // Otherwise finalization can accidentally read an outdated scoped key and commit
  // back to the previous track.
  const targetClipIds = new Set(
    targets
      .map((target) => String(target?.clipId || "").trim())
      .filter(Boolean)
  );
  const primaryClipId = String(session.clipId || "").trim();
  if (primaryClipId) targetClipIds.add(primaryClipId);
  if (targetClipIds.size) {
    for (const key of Array.from(state.previewClipEdits.keys())) {
      const textKey = String(key || "").trim();
      if (!textKey) continue;
      for (const clipId of targetClipIds.values()) {
        if (!clipId) continue;
        if (textKey === clipId || textKey.endsWith(`::${clipId}`)) {
          state.previewClipEdits.delete(key);
          break;
        }
      }
    }
  }
  const nextStart = Math.max(
    0,
    Number(toFiniteNumber(next?.start, toFiniteNumber(session.start, 0)))
  );
  const nextEnd = Math.max(
    nextStart + CLIP_EDIT_MIN_DURATION_SEC,
    Number(
      toFiniteNumber(
        next?.end,
        toFiniteNumber(session.end, nextStart + CLIP_EDIT_MIN_DURATION_SEC)
      )
    )
  );
  const nextTrackName = String(next?.trackName || session.trackName || "");
  const nextStartOffsetSec = Math.max(0, Number(next?.startOffsetSec ?? session.startOffsetSec ?? 0));
  const nextSourceDurationSec = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Number(next?.sourceDurationSec || session.sourceDurationSec || (nextEnd - nextStart) || CLIP_EDIT_MIN_DURATION_SEC)
  );
  const canonicalVideoTrackFromAudio = session.trackKind === "audio"
    ? deriveVideoTrackNameFromLinkedAudio(nextTrackName)
    : "";
  let primaryPreview = null;
  const primaryTarget = targets.find(
    (target) => String(target?.trackKind || "").toLowerCase() === String(session.trackKind || "").toLowerCase()
  ) || targets[0] || null;
  for (const target of targets) {
    const targetClipId = String(target?.clipId || "").trim();
    if (!targetClipId) continue;
    const targetTrackKind = String(target?.trackKind || "").toLowerCase();
    let targetTrackName = String(target?.trackName || nextTrackName || "").trim();
    if (session.mode === "move") {
      if (targetTrackKind === session.trackKind) {
        targetTrackName = nextTrackName;
      } else if (
        session.trackKind === "video" &&
        targetTrackKind === "audio"
      ) {
        // Keep linked audio coupled to the moved video lane, regardless of
        // current audio lane naming (legacy/custom names can exist).
        targetTrackName = deriveLinkedAudioTargetTrackFromVideo(nextTrackName, targetTrackName);
      } else if (session.trackKind === "audio" && canonicalVideoTrackFromAudio) {
        if (targetTrackKind === "video") {
          targetTrackName = canonicalVideoTrackFromAudio;
        } else if (targetTrackKind === "audio") {
          targetTrackName = deriveLinkedAudioTargetTrackFromVideo(canonicalVideoTrackFromAudio, targetTrackName);
        }
      }
    }
    const preview = {
      start: nextStart,
      end: nextEnd,
      trackName: targetTrackName,
      startOffsetSec: nextStartOffsetSec,
      sourceDurationSec: nextSourceDurationSec,
    };
    const scopedKey = makePreviewClipEditKey(targetClipId, targetTrackName);
    if (scopedKey) state.previewClipEdits.set(scopedKey, preview);
    if (
      !primaryPreview &&
      primaryTarget &&
      String(primaryTarget.clipId || "").trim() === targetClipId &&
      String(primaryTarget.trackKind || "").toLowerCase() === String(target.trackKind || "").toLowerCase()
    ) {
      primaryPreview = preview;
    }
  }
  if (String(session.clipId || "").trim()) {
    const fallbackPreview = primaryPreview || {
      start: nextStart,
      end: nextEnd,
      trackName: nextTrackName,
      startOffsetSec: nextStartOffsetSec,
      sourceDurationSec: nextSourceDurationSec,
    };
    state.previewClipEdits.set(String(session.clipId || "").trim(), fallbackPreview);
  }
}

function clearPreviewClipEditsForSession(state, session) {
  if (!state?.previewClipEdits || !session) return;
  const targets = Array.isArray(session.previewTargets) && session.previewTargets.length
    ? session.previewTargets
    : [{ clipId: String(session.clipId || "") }];
  for (const target of targets) {
    const clipId = String(target?.clipId || "").trim();
    const trackName = String(target?.trackName || "").trim();
    const scopedKey = makePreviewClipEditKey(clipId, trackName);
    if (scopedKey) state.previewClipEdits.delete(scopedKey);
  }
  const primaryKey = String(session.clipId || "").trim();
  if (primaryKey) state.previewClipEdits.delete(primaryKey);
  const clipIds = new Set(
    targets
      .map((target) => String(target?.clipId || "").trim())
      .filter(Boolean)
      .concat(primaryKey ? [primaryKey] : [])
  );
  if (clipIds.size) {
    for (const key of Array.from(state.previewClipEdits.keys())) {
      const textKey = String(key || "");
      for (const clipId of clipIds) {
        if (!clipId) continue;
        if (textKey === clipId || textKey.endsWith(`::${clipId}`)) {
          state.previewClipEdits.delete(key);
          break;
        }
      }
    }
  }
}

function applyPreviewClipGeometry(state, clip, trackName) {
  const clipId = getClipId(clip);
  const edit = getPreviewClipEdit(state, clipId, trackName);
  if (!edit) return clip;
  const editTrackName = String(edit.trackName || "").trim();
  if (editTrackName && editTrackName !== String(trackName || "").trim()) return null;
  const maxDurationSec = state?.allowDurationExtend
    ? TIMELINE_EDIT_MAX_DURATION_SEC
    : Math.max(0, Number(state?.durationSec || 0));
  const start = clamp(Number(edit.start || 0), 0, maxDurationSec);
  const end = clamp(
    Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(edit.end || start + CLIP_EDIT_MIN_DURATION_SEC)),
    start + CLIP_EDIT_MIN_DURATION_SEC,
    Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, maxDurationSec)
  );
  return {
    ...clip,
    start,
    end,
    startOffsetSec: Math.max(0, Number(edit.startOffsetSec ?? clip?.startOffsetSec ?? 0)),
    sourceDurationSec: Math.max(
      CLIP_EDIT_MIN_DURATION_SEC,
      Number(edit.sourceDurationSec ?? clip?.sourceDurationSec ?? CLIP_EDIT_MIN_DURATION_SEC)
    ),
  };
}

function collectPreviewInjectedClipsForTrack(state, trackName, trackKind, clipClampMaxSec) {
  const safeTrackName = String(trackName || "").trim();
  if (!safeTrackName) return [];
  if (!(state?.previewClipEdits instanceof Map) || state.previewClipEdits.size === 0) return [];
  const eventsByTrack = state?.studioData?.eventsByTrack;
  if (!eventsByTrack || typeof eventsByTrack !== "object") return [];
  const normalizedTrackKind = String(trackKind || "").trim().toLowerCase();
  const out = [];
  const seen = new Set();
  for (const [sourceTrackNameRaw, events] of Object.entries(eventsByTrack)) {
    const sourceTrackName = String(sourceTrackNameRaw || "").trim();
    if (!sourceTrackName || sourceTrackName === safeTrackName || !Array.isArray(events)) continue;
    for (const event of events) {
      const clipId = String(event?.clipId || event?.resourceId || "").trim();
      if (!clipId) continue;
      const editCandidates = collectPreviewEditsForClip(state, clipId);
      if (!editCandidates.length) continue;
      const edit = editCandidates.find((row) => String(row?.trackName || "").trim() === safeTrackName) || null;
      if (!edit) continue;
      const targetTrackName = String(edit.trackName || sourceTrackName).trim();
      if (targetTrackName !== safeTrackName) continue;
      const inferredTargetKind = inferStudioTrackKindByName(targetTrackName);
      if (normalizedTrackKind && inferredTargetKind && inferredTargetKind !== normalizedTrackKind) continue;
      const resourceId = String(event?.resourceId || "").trim();
      const key = `${clipId}::${resourceId || "-"}::${sourceTrackName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = clamp(Math.max(0, Number(edit.start || event?.time || 0)), 0, clipClampMaxSec);
      const end = clamp(
        Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(edit.end || (Number(event?.time || 0) + Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC)))),
        start + CLIP_EDIT_MIN_DURATION_SEC,
        clipClampMaxSec
      );
      if (!(end > start + 1e-6)) continue;
      out.push({
        start,
        end,
        label: String(event?.label || "clip"),
        notesCount: 0,
        clipId,
        resourceId: resourceId || null,
        linkGroupId: String(event?.linkGroupId || "").trim(),
        startOffsetSec: Math.max(0, Number(edit.startOffsetSec ?? event?.startOffsetSec ?? 0)),
        sourceDurationSec: Math.max(
          CLIP_EDIT_MIN_DURATION_SEC,
          Number(edit.sourceDurationSec ?? event?.sourceDurationSec ?? (end - start) ?? CLIP_EDIT_MIN_DURATION_SEC)
        ),
        thumbnailSrc: String(event?.previewSrc || event?.src || "").trim(),
        src: String(event?.src || "").trim(),
        previewSrc: String(event?.previewSrc || "").trim(),
        trackName: safeTrackName,
        trackKind: normalizedTrackKind || inferredTargetKind || "",
      });
    }
  }
  return out;
}

function inferStudioTrackKindByName(trackName) {
  const text = String(trackName || "").trim().toLowerCase();
  if (!text) return "";
  if (text.startsWith("video audio")) return "audio";
  if (text.startsWith("video")) return "video";
  if (text.startsWith("image")) return "image";
  if (text.startsWith("audio")) return "audio";
  if (text.startsWith("mix")) return "audio";
  return "";
}

function inferAudioChannelModeByTrackName(trackName) {
  const text = String(trackName || "").trim();
  if (!text) return "";
  if (/^audio\s*m\d+$/i.test(text)) return "mono";
  if (/^audio\s*s\d+$/i.test(text)) return "stereo";
  if (/^video\s*audio\s*m\d+$/i.test(text)) return "mono";
  if (/^video\s*audio\s*\d+$/i.test(text)) return "stereo";
  if (/\bmono\b/i.test(text)) return "mono";
  if (/\bstereo\b/i.test(text)) return "stereo";
  return "";
}

function deriveLinkedAudioTrackNameFromVideoTrack(videoTrackName, sourceTrackName) {
  const laneMatch = String(videoTrackName || "").trim().match(/^video\s*(\d+)$/i);
  if (!laneMatch) return String(sourceTrackName || "").trim();
  const lane = Math.max(1, Number(laneMatch[1] || 1));
  const source = String(sourceTrackName || "").trim();
  if (/^video\s*audio\s*m\d+$/i.test(source)) return `Video Audio M${lane}`;
  return `Video Audio ${lane}`;
}

function deriveVideoTrackNameFromLinkedAudio(audioTrackName) {
  const track = String(audioTrackName || "").trim();
  const match = track.match(/^video\s*audio(?:\s*m)?\s*(\d+)$/i);
  if (!match) return "";
  const lane = Math.max(1, Number(match[1]) || 1);
  return `Video ${lane}`;
}

function deriveLinkedAudioTargetTrackFromVideo(videoTrackName, currentAudioTrackName = "") {
  const videoTrack = String(videoTrackName || "").trim();
  const laneMatch = videoTrack.match(/^video\s*(\d+)$/i);
  if (!laneMatch) return String(currentAudioTrackName || "").trim();
  const lane = Math.max(1, Number(laneMatch[1] || 1));
  const current = String(currentAudioTrackName || "").trim();
  const shouldUseMono =
    /^video\s*audio\s*m\d+$/i.test(current) ||
    /^audio\s*m\d+$/i.test(current) ||
    /(?:^|\s)mono(?:$|\s)/i.test(current);
  return shouldUseMono ? `Video Audio M${lane}` : `Video Audio ${lane}`;
}

function canonicalizeTargetTrackForResource(trackName, trackKind, resourceKind) {
  const safeTrackName = String(trackName || "").trim();
  const safeTrackKind = String(trackKind || "").trim().toLowerCase();
  const safeResourceKind = String(resourceKind || "").trim().toLowerCase();
  if (!safeTrackName) return { trackName: safeTrackName, trackKind: safeTrackKind };
  if (safeResourceKind === "video" && safeTrackKind === "audio") {
    const videoTrack = deriveVideoTrackNameFromLinkedAudio(safeTrackName);
    if (videoTrack) return { trackName: videoTrack, trackKind: "video" };
  }
  return { trackName: safeTrackName, trackKind: safeTrackKind };
}

function resolveInsertIndexForTargetTrack(baseInsertIndex, targetTrackName, targetTrackKind, payloadTrackName, payloadTrackKind) {
  if (!Number.isFinite(Number(baseInsertIndex))) return undefined;
  const base = Math.round(Number(baseInsertIndex));
  const safeTargetName = String(targetTrackName || "").trim();
  const safeTargetKind = String(targetTrackKind || "").trim().toLowerCase();
  if (!safeTargetName || !safeTargetKind) return base;

  // Keep deterministic visual ordering for linked video/audio lanes:
  // Video N
  // Video Audio N
  // Video Audio MN
  const payloadLane =
    parseVideoLaneFromTrack(payloadTrackName, payloadTrackKind) ??
    parseVideoLaneFromTrack(payloadTrackName, "video");
  const targetLane = parseVideoLaneFromTrack(safeTargetName, safeTargetKind);

  if (safeTargetKind === "audio" && payloadLane != null && targetLane != null && payloadLane === targetLane) {
    if (/^video\s*audio\s*m\d+$/i.test(safeTargetName)) return base + 2;
    if (/^video\s*audio/i.test(safeTargetName)) return base + 1;
  }
  if (safeTargetKind === "audio" && /^audio\s*m\d+$/i.test(safeTargetName)) return base + 1;
  return base;
}

function parseVideoLaneFromTrack(trackName, trackKind = "") {
  const name = String(trackName || "").trim();
  const kind = String(trackKind || "").trim().toLowerCase();
  if (!name) return null;
  if (kind === "video") {
    const match = name.match(/^video\s*(\d+)$/i);
    if (!match) return null;
    const lane = Number(match[1]);
    return Number.isFinite(lane) ? Math.max(1, lane) : null;
  }
  if (kind === "audio") {
    const match = name.match(/^video\s*audio(?:\s*m)?\s*(\d+)$/i);
    if (!match) return null;
    const lane = Number(match[1]);
    return Number.isFinite(lane) ? Math.max(1, lane) : null;
  }
  return null;
}

function areVideoAudioTracksLinked(trackA, trackB) {
  const kindA = String(trackA?.kind || "").trim().toLowerCase();
  const kindB = String(trackB?.kind || "").trim().toLowerCase();
  const laneA = parseVideoLaneFromTrack(trackA?.name, kindA);
  const laneB = parseVideoLaneFromTrack(trackB?.name, kindB);
  if (laneA == null || laneB == null || laneA !== laneB) return false;
  return (
    (kindA === "video" && kindB === "audio") ||
    (kindA === "audio" && kindB === "video")
  );
}

function applyCommittedClipEditToLocalStudio(state, payload) {
  if (!state?.studioData || !payload || typeof payload !== "object") return false;
  const clipId = String(payload.clipId || "").trim();
  const resourceId = String(payload.resourceId || "").trim();
  const linkGroupId = String(payload.linkGroupId || "").trim();
  const trackName = String(payload.trackName || "").trim();
  const trackKind = String(payload.trackKind || "").trim().toLowerCase();
  const canonicalVideoTrackFromAudio =
    trackKind === "audio" ? deriveVideoTrackNameFromLinkedAudio(trackName) : "";
  const insertMode = Boolean(payload?.insertMode);
  const insertIndexRaw = Number(payload?.insertIndex);
  const hasInsertIndex = Number.isFinite(insertIndexRaw);
  if (!clipId || !trackName) return false;
  const eventsByTrack = state.studioData?.eventsByTrack && typeof state.studioData.eventsByTrack === "object"
    ? state.studioData.eventsByTrack
    : null;
  if (!eventsByTrack) return false;
  const studioTracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
  const trackKindByName = new Map(studioTracks.map((track) => [String(track?.name || "").trim(), String(track?.kind || "").toLowerCase()]));
  const matches = [];
  for (const [name, events] of Object.entries(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (!event || typeof event !== "object") continue;
      const eventClipId = String(event.clipId || "").trim();
      const eventResourceId = String(event.resourceId || "").trim();
      const eventLinkGroupId = String(event.linkGroupId || "").trim();
      const samePrimary = resourceId
        ? eventClipId === clipId && eventResourceId === resourceId
        : eventClipId === clipId;
      const sameLink = Boolean(linkGroupId) && eventLinkGroupId === linkGroupId;
      if (!samePrimary && !sameLink) continue;
      matches.push({ trackName: name, index: i, event });
    }
  }
  if (!matches.length) return false;

  const base = matches[0]?.event || {};
  const oldStart = Math.max(0, Number(base.time || 0));
  const nextStart = Math.max(0, Number(toFiniteNumber(payload.timeSec, oldStart)));
  const mode = String(payload.mode || "move").toLowerCase();
  const isMoveMode = mode === "move";
  const sourceDurationSec = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Number(base.sourceDurationSec || payload.sourceDurationSec || payload.durationSec || CLIP_EDIT_MIN_DURATION_SEC)
  );
  const currentStartOffsetSec = Math.max(0, Number(base.startOffsetSec || 0));
  const explicitStartOffsetSec = toFiniteNumber(payload.startOffsetSec, null);
  let nextStartOffsetSec = currentStartOffsetSec;
  if (explicitStartOffsetSec != null) {
    nextStartOffsetSec = Math.max(0, explicitStartOffsetSec);
  } else if (mode === "trim_start") {
    nextStartOffsetSec = Math.max(0, currentStartOffsetSec + (nextStart - oldStart));
  }
  nextStartOffsetSec = Math.min(nextStartOffsetSec, Math.max(0, sourceDurationSec - CLIP_EDIT_MIN_DURATION_SEC));
  const maxDurationBySource = Math.max(CLIP_EDIT_MIN_DURATION_SEC, sourceDurationSec - nextStartOffsetSec);
  const nextDuration = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Math.min(Number(payload.durationSec || base.duration || CLIP_EDIT_MIN_DURATION_SEC), maxDurationBySource)
  );

  const ensureTrack = (name, kindHint = "", options = {}) => {
    const safe = String(name || "").trim();
    if (!safe) return;
    if (!Array.isArray(eventsByTrack[safe])) eventsByTrack[safe] = [];
    if (!trackKindByName.has(safe)) {
      const inferredKind = kindHint || inferStudioTrackKindByName(safe);
      trackKindByName.set(safe, inferredKind);
      const row = {
        name: safe,
        kind: inferredKind || "audio",
        partition: "step_tracks",
        source: "",
        audioAssetKey: "",
        events: eventsByTrack[safe].length,
      };
      if (String(row.kind || "").toLowerCase() === "audio") {
        const hintedMode = String(options?.channelMode || "").trim().toLowerCase();
        const inferredMode = inferAudioChannelModeByTrackName(safe);
        row.channelMode = hintedMode === "mono" || hintedMode === "stereo"
          ? hintedMode
          : (inferredMode || "stereo");
        row.preserveEventDuration = true;
      }
      if (hasInsertIndex && Number.isFinite(Number(options?.insertIndex))) {
        const maxInsert = Math.max(1, studioTracks.length - 1);
        const insertAt = clamp(Math.round(Number(options.insertIndex)), 1, maxInsert);
        studioTracks.splice(insertAt, 0, row);
      } else {
        studioTracks.push(row);
      }
    }
  };

  for (const match of matches) {
    const currentTrackName = String(match.trackName || "").trim();
    const currentTrackKind = String(trackKindByName.get(currentTrackName) || inferStudioTrackKindByName(currentTrackName)).toLowerCase();
    const event = match.event;
    const eventSourceDurationSec = Math.max(
      CLIP_EDIT_MIN_DURATION_SEC,
      Number(event.sourceDurationSec || payload.sourceDurationSec || sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)
    );
    let eventStartOffsetSec = nextStartOffsetSec;
    let eventDurationSec = nextDuration;
    if (isMoveMode) {
      // Move must be a pure translation: keep each linked event window as-is.
      eventStartOffsetSec = Math.max(0, Number(event.startOffsetSec || 0));
      eventStartOffsetSec = Math.min(
        eventStartOffsetSec,
        Math.max(0, eventSourceDurationSec - CLIP_EDIT_MIN_DURATION_SEC)
      );
      const eventMaxDurationBySource = Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        eventSourceDurationSec - eventStartOffsetSec
      );
      eventDurationSec = Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        Math.min(
          Number(event.duration || CLIP_EDIT_MIN_DURATION_SEC),
          eventMaxDurationBySource
        )
      );
    }
    event.time = nextStart;
    event.duration = eventDurationSec;
    event.startOffsetSec = eventStartOffsetSec;
    event.sourceDurationSec = eventSourceDurationSec;
    if (linkGroupId) event.linkGroupId = linkGroupId;

    let targetTrackName = currentTrackName;
    if (currentTrackKind === trackKind) {
      targetTrackName = trackName;
    } else if (trackKind === "video" && currentTrackKind === "audio") {
      // Strong coupling: when moving the video member, always relocate linked
      // audio members to the corresponding audio lane for the target video lane.
      targetTrackName = deriveLinkedAudioTargetTrackFromVideo(trackName, currentTrackName);
    } else if (trackKind === "audio" && canonicalVideoTrackFromAudio) {
      if (currentTrackKind === "video") {
        targetTrackName = canonicalVideoTrackFromAudio;
      } else if (currentTrackKind === "audio") {
        targetTrackName = deriveLinkedAudioTargetTrackFromVideo(canonicalVideoTrackFromAudio, currentTrackName);
      }
    }
    if (targetTrackName !== currentTrackName) {
      const targetInsertIndex = insertMode
        ? resolveInsertIndexForTargetTrack(
            insertIndexRaw,
            targetTrackName,
            currentTrackKind,
            trackName,
            trackKind
          )
        : undefined;
      ensureTrack(targetTrackName, currentTrackKind, {
        insertIndex: targetInsertIndex,
        channelMode:
          currentTrackKind === "audio"
            ? (String(event?.channelMode || "").trim().toLowerCase() || inferAudioChannelModeByTrackName(targetTrackName))
            : "",
      });
      const sourceList = eventsByTrack[currentTrackName];
      if (Array.isArray(sourceList) && sourceList[match.index] === event) {
        sourceList.splice(match.index, 1);
      } else if (Array.isArray(sourceList)) {
        const idx = sourceList.indexOf(event);
        if (idx >= 0) sourceList.splice(idx, 1);
      }
      eventsByTrack[targetTrackName].push(event);
    }
  }

  for (const [name, events] of Object.entries(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    events.sort((a, b) => {
      const ta = Number(a?.time || 0);
      const tb = Number(b?.time || 0);
      if (ta !== tb) return ta - tb;
      return String(a?.clipId || "").localeCompare(String(b?.clipId || ""));
    });
    const track = studioTracks.find((row) => String(row?.name || "").trim() === name);
    if (track) track.events = events.length;
  }
  // Keep local track list coherent after move/insert commits:
  // remove empty non-dropzone tracks immediately (same behavior user gets after full panel relayout).
  if (Array.isArray(studioTracks)) {
    const namesWithEvents = new Set();
    for (const [name, events] of Object.entries(eventsByTrack)) {
      const safeName = String(name || "").trim();
      if (!safeName || !Array.isArray(events) || events.length <= 0) continue;
      namesWithEvents.add(safeName);
    }
    for (let i = studioTracks.length - 1; i >= 0; i -= 1) {
      const row = studioTracks[i];
      const name = String(row?.name || "").trim();
      const kind = String(row?.kind || "").trim().toLowerCase();
      if (!name || kind === "dropzone") continue;
      if (namesWithEvents.has(name)) continue;
      studioTracks.splice(i, 1);
      if (Object.prototype.hasOwnProperty.call(eventsByTrack, name)) {
        delete eventsByTrack[name];
      }
    }
  }
  const maxEnd = Object.values(eventsByTrack).reduce((max, events) => {
    if (!Array.isArray(events)) return max;
    for (const event of events) {
      const end = Number(event?.time || 0) + Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC));
      if (end > max) max = end;
    }
    return max;
  }, 0);
  state.durationSec = Math.max(1, maxEnd);
  refreshTimelineViewAfterDurationChange(state);
  if (Array.isArray(state.studioData?.sections) && state.studioData.sections.length) {
    const last = state.studioData.sections[state.studioData.sections.length - 1];
    if (last && typeof last === "object") last.end = Math.max(Number(last.start || 0), state.durationSec);
  }
  return true;
}

function serializePreviewClipEdits(state) {
  const map = state?.previewClipEdits;
  if (!(map instanceof Map) || map.size === 0) return null;
  const out = {};
  for (const [key, value] of map.entries()) {
    const id = String(key || "").trim();
    if (!id || !value || typeof value !== "object") continue;
    out[id] = {
      start: Math.max(0, Number(value.start || 0)),
      end: Math.max(0, Number(value.end || 0)),
      trackName: String(value.trackName || "").trim(),
      startOffsetSec: Math.max(0, Number(value.startOffsetSec || 0)),
      sourceDurationSec: Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(value.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)),
    };
  }
  return Object.keys(out).length ? out : null;
}

function isCuttableTrackKind(trackKind) {
  const kind = String(trackKind || "").trim().toLowerCase();
  return kind === "video" || kind === "audio";
}

function resolveCutTimeSecForHit(state, hit, pointerX) {
  if (!hit || String(hit?.type || "") !== "clip") return null;
  if (!isCuttableTrackKind(hit?.track_kind)) return null;
  const clipStart = Math.max(0, Number(hit?.t0_sec || 0));
  const clipEnd = Math.max(clipStart + CLIP_EDIT_MIN_DURATION_SEC, Number(hit?.t1_sec || clipStart + CLIP_EDIT_MIN_DURATION_SEC));
  if (!(clipEnd > clipStart + CLIP_EDIT_MIN_DURATION_SEC * 2)) return null;
  const x = Number(pointerX);
  const xToTime = state.t0Sec + (clamp(Number.isFinite(x) ? x : LEFT_GUTTER, LEFT_GUTTER, Number(state.canvas?.clientWidth || LEFT_GUTTER)) - LEFT_GUTTER) / Math.max(1e-6, state.pxPerSec);
  const rawCut = clamp(xToTime, clipStart + CLIP_EDIT_MIN_DURATION_SEC, clipEnd - CLIP_EDIT_MIN_DURATION_SEC);
  const snappedCut = snapTimeSec(state, rawCut, {
    trackName: String(hit?.track_name || "").trim(),
    excludeResourceId: String(hit?.resource_id || "").trim(),
    excludeClipId: String(hit?.clip_id || "").trim(),
    maxTimeSec: state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec,
  });
  return clamp(snappedCut, clipStart + CLIP_EDIT_MIN_DURATION_SEC, clipEnd - CLIP_EDIT_MIN_DURATION_SEC);
}

function resolveTrimKeepSideForHit(hit, cutTimeSec) {
  const clipStart = Math.max(0, Number(hit?.t0_sec || 0));
  const clipEnd = Math.max(clipStart + CLIP_EDIT_MIN_DURATION_SEC, Number(hit?.t1_sec || clipStart + CLIP_EDIT_MIN_DURATION_SEC));
  const mid = clipStart + (clipEnd - clipStart) * 0.5;
  return Number(cutTimeSec) >= mid ? "right" : "left";
}

function resolveCutPreview(state, x, y, mode = "cut") {
  const hit = hitTest(state, x, y);
  if (!hit || String(hit?.type || "") !== "clip") return null;
  if (!isCuttableTrackKind(hit?.track_kind)) return null;
  const cutTimeSec = resolveCutTimeSecForHit(state, hit, x);
  if (cutTimeSec == null) return null;
  const normalizedMode = String(mode || "").trim().toLowerCase() === "trim" ? "trim" : "cut";
  const keepSide = normalizedMode === "trim" ? resolveTrimKeepSideForHit(hit, cutTimeSec) : "left";
  return {
    mode: normalizedMode,
    keepSide,
    clipId: String(hit?.clip_id || "").trim(),
    resourceId: String(hit?.resource_id || "").trim(),
    trackName: String(hit?.track_name || "").trim(),
    trackKind: String(hit?.track_kind || "").trim().toLowerCase(),
    t0Sec: Number(hit?.t0_sec || 0),
    t1Sec: Number(hit?.t1_sec || 0),
    rowTop: Number(hit?.row_top || 0),
    rowBottom: Number(hit?.row_bottom || 0),
    cutTimeSec,
  };
}

function canJoinAdjacentClips(leftClip, rightClip) {
  if (!leftClip || !rightClip) return false;
  const leftResource = String(leftClip?.resourceId || "").trim();
  const rightResource = String(rightClip?.resourceId || "").trim();
  if (!leftResource || leftResource !== rightResource) return false;
  const leftTrack = String(leftClip?.trackName || "").trim();
  const rightTrack = String(rightClip?.trackName || "").trim();
  if (!leftTrack || leftTrack !== rightTrack) return false;
  const leftEnd = Math.max(0, Number(leftClip?.end || 0));
  const rightStart = Math.max(0, Number(rightClip?.start || 0));
  if (Math.abs(leftEnd - rightStart) > CLIP_JOIN_TIME_EPS_SEC) return false;
  const leftOffset = Math.max(0, Number(leftClip?.startOffsetSec || 0));
  const leftDuration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, leftEnd - Math.max(0, Number(leftClip?.start || 0)));
  const rightOffset = Math.max(0, Number(rightClip?.startOffsetSec || 0));
  return Math.abs((leftOffset + leftDuration) - rightOffset) <= 0.08;
}

function collectMultiSelectedMoveMembers(state, anchorHit) {
  const out = [];
  if (!(state?.selectedClipKeys instanceof Set) || !state.selectedClipKeys.size) return out;
  const anchorClipId = String(anchorHit?.clip_id || "").trim();
  const anchorTrackName = String(anchorHit?.track_name || "").trim();
  if (!anchorClipId || !anchorTrackName) return out;
  const anchorKey = makeClipSelectionKey(anchorTrackName, anchorClipId);
  if (!anchorKey || !state.selectedClipKeys.has(anchorKey)) return out;
  const seen = new Set();
  const hits = Array.isArray(state.hitRegions) ? state.hitRegions : [];
  for (const region of hits) {
    const payload = region?.payload;
    if (!payload || String(payload.type || "") !== "clip") continue;
    const trackKind = String(payload.track_kind || "").toLowerCase();
    if (trackKind !== "video" && trackKind !== "image" && trackKind !== "audio") continue;
    const clipId = String(payload.clip_id || "").trim();
    const trackName = String(payload.track_name || "").trim();
    const resourceId = String(payload.resource_id || "").trim();
    if (!clipId || !trackName || !resourceId) continue;
    const key = makeClipSelectionKey(trackName, clipId);
    if (!key || !state.selectedClipKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      clipId,
      trackName,
      trackKind,
      resourceId,
      linkGroupId: String(payload.link_group_id || "").trim(),
      start: Math.max(0, Number(payload.t0_sec || 0)),
      end: Math.max(
        Math.max(0, Number(payload.t0_sec || 0)) + CLIP_EDIT_MIN_DURATION_SEC,
        Number(payload.t1_sec || (Number(payload.t0_sec || 0) + CLIP_EDIT_MIN_DURATION_SEC))
      ),
      startOffsetSec: Math.max(0, Number(payload.start_offset_sec || 0)),
      sourceDurationSec: Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(payload.source_duration_sec || (Number(payload.t1_sec || 0) - Number(payload.t0_sec || 0) || CLIP_EDIT_MIN_DURATION_SEC))
      ),
    });
  }
  return out;
}

function resolveGroupMoveDeltaBounds(state, members, maxTimelineSec) {
  const rows = Array.isArray(members) ? members : [];
  if (!rows.length) return { minDelta: 0, maxDelta: 0 };
  const excludedKeys = new Set(rows.map((row) => String(row?.key || "").trim()).filter(Boolean));
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;
  const maxTime = Math.max(0, Number(maxTimelineSec || 0));
  for (const row of rows) {
    const start = Math.max(0, Number(row?.start || 0));
    const end = Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(row?.end || start + CLIP_EDIT_MIN_DURATION_SEC));
    const bounds = resolveMoveDeltaBoundsForClip(state, {
      trackName: String(row?.trackName || ""),
      clipStartSec: start,
      clipEndSec: end,
      excludeClipKeys: excludedKeys,
      maxTimelineSec: maxTime,
    });
    minDelta = Math.max(minDelta, Number(bounds?.minDelta || 0));
    maxDelta = Math.min(maxDelta, Number(bounds?.maxDelta || 0));
  }
  if (!Number.isFinite(minDelta)) minDelta = 0;
  if (!Number.isFinite(maxDelta)) maxDelta = 0;
  if (minDelta > maxDelta) {
    const locked = (minDelta + maxDelta) * 0.5;
    return { minDelta: locked, maxDelta: locked };
  }
  return { minDelta, maxDelta };
}

function resolveEffectiveChannelMode(state, track) {
  const trackName = String(track?.name || "").trim();
  const base = String(track?.channelMode || "").toLowerCase();
  const override = trackName && state?.trackChannelModeOverrides
    ? String(state.trackChannelModeOverrides.get(trackName) || "").toLowerCase()
    : "";
  const value = override || base;
  if (value === "mono" || value === "stereo") return value;
  return base === "mono" ? "mono" : "stereo";
}

function notifyPreviewCacheUpdated(state) {
  if (!state) return;
  if (typeof state.onPreviewCacheUpdate === "function") {
    try {
      state.onPreviewCacheUpdate();
    } catch {}
    return;
  }
  if (state.canvas && state.ctx) {
    try {
      draw(state);
    } catch {}
  }
}

function pumpFilmstripQueue() {
  while (FILMSTRIP_QUEUE_ACTIVE < VIDEO_FILMSTRIP_MAX_CONCURRENCY && FILMSTRIP_QUEUE.length) {
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

function getFilmstripQueuePressure() {
  return FILMSTRIP_QUEUE_ACTIVE + FILMSTRIP_QUEUE.length;
}

function ensureTimelineThumbnailEntry(state, src) {
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
    notifyPreviewCacheUpdated(state);
  };
  img.onerror = () => {
    entry.status = "error";
    notifyPreviewCacheUpdated(state);
  };
  img.src = key;
  return entry;
}

function getTimelineThumbnail(state, src) {
  const entry = ensureTimelineThumbnailEntry(state, src);
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
      targetHeight: Math.max(24, Number(value?.targetHeight || VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT)),
      frames,
    });
  }
  return out;
}

function pickReusableFilmstripCandidate(candidates, { frameCount = 0, targetHeight = VIDEO_FILMSTRIP_TARGET_HEIGHT } = {}) {
  const requestedFrameCount = Math.max(0, Number(frameCount || 0));
  const requestedTargetHeight = Math.max(24, Number(targetHeight || VIDEO_FILMSTRIP_TARGET_HEIGHT));
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

function ensureTimelineVideoFilmstrip(state, src, hintDurationSec = 0, options = {}) {
  if (!state?.clipThumbCache) return null;
  const key = String(src || "").trim();
  if (!key) return null;
  const strategy = String(options?.strategy || "full").trim().toLowerCase() === "edges" ? "edges" : "full";
  const targetHeight = normalizeFilmstripTargetHeight(options?.targetHeight || VIDEO_FILMSTRIP_TARGET_HEIGHT);
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
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(video.duration || 0) > 0.05 ? Number(video.duration || 0) : Number(hintDurationSec || 0.01)
      );
      entry.durationSec = durationSec;
      const frameCount = requestedFrameCount > 0
        ? requestedFrameCount
        : bucketizeFilmstripFrameCount(
            clamp(Math.round(durationSec * 1.1), VIDEO_FILMSTRIP_MIN_FRAMES, VIDEO_FILMSTRIP_MAX_FRAMES)
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
        const seekTime = clamp(Number(t || 0), 0, Math.max(0, durationSec - 0.02));
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
      notifyPreviewCacheUpdated(state);
    } catch {
      entry.status = fallbackFrames.length ? "ready_stale" : "error";
      entry.error = !fallbackFrames.length;
      notifyPreviewCacheUpdated(state);
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
  return bucketizeFilmstripFrameCount(clamp(numeric, VIDEO_FILMSTRIP_MIN_FRAMES, VIDEO_FILMSTRIP_MAX_FRAMES + 8));
}

function normalizeTargetHeightHint(value, fallback) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return normalizeFilmstripTargetHeight(numeric);
}

export function prewarmTimelineVideoBuffers({
  clipThumbCache,
  sources = [],
  frameCountHint = VIDEO_FILMSTRIP_MAX_FRAMES,
  targetHeightHint = VIDEO_FILMSTRIP_TARGET_HEIGHT,
  edgeTargetHeightHint = VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT,
  fullEnabled = true,
  onUpdate = null,
}) {
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
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(row?.durationSec || row?.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)
      ),
    });
  }
  if (!unique.length) return 0;
  const warmState = {
    clipThumbCache,
    onPreviewCacheUpdate: typeof onUpdate === "function" ? onUpdate : null,
  };
  const fullFrames = normalizeFrameCountHint(frameCountHint, VIDEO_FILMSTRIP_MAX_FRAMES);
  const fullHeight = normalizeTargetHeightHint(targetHeightHint, VIDEO_FILMSTRIP_TARGET_HEIGHT);
  const edgeHeight = normalizeTargetHeightHint(edgeTargetHeightHint, VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT);
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

function compactRunId(runId) {
  const value = String(runId || "").trim();
  if (!value) return "n/a";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatSelectionSummary(state) {
  const selection = state?.selection;
  if (!selection || typeof selection !== "object") return "";
  const type = String(selection.type || "item");
  const name = compactText(selection.name || selection.id || "", 24);
  const t0 = Number(selection.t0_sec);
  const t1 = Number(selection.t1_sec);
  const selectedCount = resolveEffectiveSelectedClipCount(state);
  const selectedSuffix = selectedCount > 1 ? ` | group ${selectedCount}` : "";
  if (Number.isFinite(t0) && Number.isFinite(t1)) {
    return ` | sel ${type} ${name} ${t0.toFixed(2)}-${t1.toFixed(2)}s${selectedSuffix}`;
  }
  if (Number.isFinite(t0)) {
    return ` | sel ${type} ${name} @${t0.toFixed(2)}s${selectedSuffix}`;
  }
  return ` | sel ${type} ${name}${selectedSuffix}`;
}

function renderOverview(state) {
  const tempo = Number(state.studioData?.tempoBpm || 0);
  const runText = compactRunId(state.runData?.run_id);
  const tempoText = tempo > 0 ? `${tempo.toFixed(1)} bpm` : "n/a";
  const tracksCount = Number(state.studioData?.tracks?.length || 0);
  const mutedCount = state.mutedTracks?.size || 0;
  const selectionText = formatSelectionSummary(state);
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
  const trackScale = normalizeTrackRowScale(state.trackRowScale);
  state.zoomLabel.textContent = `zoom ${state.pxPerSec.toFixed(1)} px/s | window ${visibleSec.toFixed(2)}s | y ${trackScale.toFixed(2)}x${state.skeletonMode ? " | skeleton on" : ""}`;
  if (state.shortcutsLabel) {
    const hints = [];
    const ctrlDown = Boolean(state.keyModifiers?.ctrl);
    const shiftDown = Boolean(state.keyModifiers?.shift);
    const altDown = Boolean(state.keyModifiers?.alt);
    const selectedClipCount = resolveEffectiveSelectedClipCount(state);
    const hasClipSelection = selectedClipCount > 0;
    const hasGroupSelection = selectedClipCount > 1;
    const editMode = String(state.clipEditSession?.mode || "").trim().toLowerCase();
    if (altDown && ctrlDown) {
      hints.push({ icon: "cut", text: "Ctrl+Alt active" });
      hints.push({ icon: "cut", text: "Click clip: trim keep side" });
    } else if (altDown) {
      hints.push({ icon: "cut", text: "Alt active" });
      hints.push({ icon: "cut", text: "Click clip: cut" });
    } else if (ctrlDown) {
      hints.push({ icon: "key_ctrl", text: "Ctrl active" });
      hints.push({ icon: "mouse_wheel", text: "Wheel: row height" });
    } else if (shiftDown) {
      hints.push({ icon: "key_shift", text: "Shift active" });
      hints.push({ icon: "mouse_wheel", text: "Wheel: pan time" });
    } else {
      hints.push({ icon: "play", text: "Space: play/pause" });
      hints.push({ icon: "mouse_wheel", text: "Wheel: zoom time" });
      hints.push({ icon: "key_shift", text: "+ wheel: pan" });
      hints.push({ icon: "key_ctrl", text: "+ wheel: row height" });
    }
    if (hasClipSelection) {
      if (hasGroupSelection) {
        hints.push({ icon: "drag", text: `Group selected (${selectedClipCount})` });
        hints.push({ icon: "arrows_lr", text: "Drag selected: move group" });
      } else {
        hints.push({ icon: "drag", text: "Solo selected: move/trim" });
      }
      if (!ctrlDown) {
        hints.push({ icon: "key_ctrl", text: "Ctrl+click: multi-select" });
      }
      hints.push({ icon: "arrows_lr", text: "Arrows: nudge" });
    } else if (!ctrlDown && !shiftDown && !altDown) {
      hints.push({ icon: "drag", text: "Click clip: select" });
    }
    if (editMode === "move") {
      hints.push({ icon: "drag", text: "Mode: move" });
    } else if (editMode === "trim_start" || editMode === "trim_end") {
      hints.push({ icon: "arrows_lr", text: "Mode: trim" });
    } else if (editMode === "slip") {
      hints.push({ icon: "arrows_lr", text: "Mode: slip window" });
    }
    if (state.skeletonMode) {
      hints.push({ icon: "skeleton_mode", text: "Skeleton mode" });
    }
    const signature = hints.map((item) => `${item.icon}:${item.text}`).join("|");
    if (signature !== state.shortcutsSignature) {
      state.shortcutsSignature = signature;
      state.shortcutsLabel.textContent = "";
      for (const item of hints) {
        const chip = el("span", { class: "lemouf-song2daw-shortcut-chip" });
        chip.append(
          createIcon(item.icon, {
            className: "lemouf-song2daw-shortcut-icon",
            size: 12,
            title: item.text,
          }),
          el("span", { class: "lemouf-song2daw-shortcut-text", text: item.text })
        );
        state.shortcutsLabel.append(chip);
      }
    }
  }
}

function snapshotTimelineViewState(state) {
  return {
    autoFit: Boolean(state?.autoFit),
    pxPerSec: Math.max(0.0001, Number(state?.pxPerSec || 0)),
    t0Sec: Math.max(0, Number(state?.t0Sec || 0)),
    scrollY: Math.max(0, Number(state?.scrollY || 0)),
    trackRowScale: normalizeTrackRowScale(state?.trackRowScale),
    skeletonMode: Boolean(state?.skeletonMode),
  };
}

function emitTimelineViewState(state) {
  if (!state || typeof state.onViewStateChange !== "function") return;
  const snapshot = snapshotTimelineViewState(state);
  const key =
    `${snapshot.autoFit ? "1" : "0"}|${snapshot.pxPerSec.toFixed(4)}|` +
    `${snapshot.t0Sec.toFixed(4)}|${snapshot.scrollY.toFixed(2)}|${snapshot.trackRowScale.toFixed(4)}|${snapshot.skeletonMode ? "1" : "0"}`;
  if (key === state.lastViewStateKey) return;
  state.lastViewStateKey = key;
  try {
    state.onViewStateChange(snapshot);
  } catch {}
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
  const activeTrackUrl = resolveActiveTrackAudioUrlAtPlayhead(state);
  if (activeTrackUrl) return activeTrackUrl;
  const unmutedEntries = getUnmutedTrackAudioEntries(state);
  for (const item of unmutedEntries) {
    const audio = item?.audio;
    if (!audio) continue;
    const url = String(audio.currentSrc || audio.src || "").trim();
    if (url) return url;
  }
  if (state.audio && state.audioSource && !state.audioErrored && !isMixTrackMuted(state)) {
    return String(state.audio.currentSrc || state.audio.src || state.audioSource || "").trim();
  }
  return "";
}

function resolveActiveTrackAudioUrlAtPlayhead(state) {
  if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return "";
  const playheadSec = clamp(Number(state.playheadSec || 0), 0, Math.max(0, Number(state.durationSec || 0)));
  for (const [trackName, trackEntry] of state.trackAudioPlayers.entries()) {
    if (isTrackMuted(state, trackName)) continue;
    const active = resolveTrackAudioActiveEventAtTime(state, trackName, playheadSec);
    if (!active?.event) continue;
    const player = resolveTrackAudioPlayerForEvent(trackEntry, active.event);
    const audio = player?.audio;
    if (!audio) continue;
    const url = String(audio.currentSrc || audio.src || "").trim();
    if (url) return url;
  }
  return "";
}

function getUnmutedTrackAudioEntries(state) {
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return [];
  const entries = [];
  for (const [trackName, trackEntry] of state.trackAudioPlayers.entries()) {
    if (isTrackMuted(state, trackName)) continue;
    const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
      ? trackEntry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) continue;
    const preferredKeys = [
      String(trackEntry?.activeAssetKey || "").trim(),
      String(trackEntry?.defaultAssetKey || "").trim(),
    ].filter(Boolean);
    let picked = null;
    for (const key of preferredKeys) {
      const candidate = playersByAssetKey.get(key);
      if (!candidate?.audio) continue;
      picked = candidate;
      break;
    }
    if (!picked) {
      for (const candidate of playersByAssetKey.values()) {
        if (!candidate?.audio) continue;
        picked = candidate;
        break;
      }
    }
    if (!picked?.audio) continue;
    entries.push({
      trackName,
      audio: picked.audio,
      errored: Boolean(picked.errored),
      assetKey: String(picked.assetKey || ""),
      trackEntry,
    });
  }
  return entries;
}

function primeTrackAudioPlayersForGesture(state) {
  if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return;
  for (const [trackName, trackEntry] of state.trackAudioPlayers.entries()) {
    if (isTrackMuted(state, trackName)) continue;
    const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
      ? trackEntry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) continue;
    for (const player of playersByAssetKey.values()) {
      const audio = player?.audio;
      if (!audio || player?.errored) continue;
      try {
        const prevMuted = Boolean(audio.muted);
        const prevVolume = Number(audio.volume || 1);
        const prevTime = Number(audio.currentTime || 0);
        audio.muted = true;
        const playResult = audio.play();
        if (playResult && typeof playResult.then === "function") {
          playResult
            .then(() => {
              try { audio.pause(); } catch {}
              try { audio.currentTime = prevTime; } catch {}
              audio.volume = prevVolume;
              audio.muted = prevMuted;
            })
            .catch(() => {
              audio.volume = prevVolume;
              audio.muted = prevMuted;
            });
        } else {
          try { audio.pause(); } catch {}
          try { audio.currentTime = prevTime; } catch {}
          audio.volume = prevVolume;
          audio.muted = prevMuted;
        }
      } catch {}
    }
  }
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
    state.scrubBufferSwapPending = false;
    state.scrubDecodeUrl = "";
    state.scrubDecodePromise = null;
    // Keep the last decoded scrub buffer as a visual fallback during short source transitions.
    // Playback readiness still stays false because active source won't match empty scrubSourceUrl.
    return Boolean(state.scrubAudioBuffer);
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
    state.scrubBufferSwapPending = true;
  }
  if (
    state.scrubAudioBuffer &&
    !state.scrubBufferSwapPending &&
    String(state.scrubActiveSourceUrl || "").trim() === sourceUrl
  ) {
    return true;
  }
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
      state.scrubActiveSourceUrl = decodeUrl;
      state.scrubBufferSwapPending = false;
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
  if (!decoded && state.scrubSourceUrl === sourceUrl) {
    state.scrubBufferSwapPending = false;
  }
  return Boolean(
    state.scrubAudioBuffer &&
    !state.scrubBufferSwapPending &&
    String(state.scrubActiveSourceUrl || "").trim() === sourceUrl
  );
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
  const scrubAudioReady =
    Boolean(state.scrubAudioBuffer) &&
    !Boolean(state.scrubBufferSwapPending) &&
    String(state.scrubActiveSourceUrl || "").trim() === String(state.scrubSourceUrl || "").trim();
  if (!scrubAudioReady) {
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

function normalizeSkeletonMode(value) {
  if (value === true || value === 1) return true;
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "on" || text === "yes";
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

function drawAmplitudeVizLane(ctx, amplitudes, x0, widthPx, y, h, options = {}) {
  const values = Array.isArray(amplitudes) ? amplitudes : [];
  if (!values.length || widthPx <= 0 || h <= 0) return;
  const mode = normalizeSectionVizMode(options.mode);
  const palette = resolveAudioVizPalette(options.palette);
  const bins = Math.max(1, values.length);
  const stepX = widthPx / bins;
  const midY = y + h * 0.5;
  const ampPx = Math.max(1, h * 0.46);
  if (palette.centerLineStyle) {
    ctx.strokeStyle = palette.centerLineStyle;
    ctx.beginPath();
    ctx.moveTo(x0, midY + 0.5);
    ctx.lineTo(x0 + widthPx, midY + 0.5);
    ctx.stroke();
  }
  if (mode === "filled") {
    ctx.save();
    ctx.fillStyle = palette.fillStyle;
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = clamp(Number(values[i] || 0), 0, 1);
      const yTop = midY - a * ampPx;
      if (i === 0) ctx.moveTo(x, yTop);
      else ctx.lineTo(x, yTop);
    }
    for (let i = bins - 1; i >= 0; i -= 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = clamp(Number(values[i] || 0), 0, 1);
      const yBottom = midY + a * ampPx;
      ctx.lineTo(x, yBottom);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = palette.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = clamp(Number(values[i] || 0), 0, 1);
      const yTop = midY - a * ampPx;
      if (i === 0) ctx.moveTo(x, yTop);
      else ctx.lineTo(x, yTop);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (mode === "bands") {
    for (let i = 0; i < bins; i += 1) {
      const a = clamp(Number(values[i] || 0), 0, 1);
      if (a <= 0.001) continue;
      const x = x0 + i * stepX + stepX * 0.5;
      const yTop = midY - a * ampPx;
      const yBottom = midY + a * ampPx;
      ctx.strokeStyle = palette.bandLowStyle;
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, yBottom);
      ctx.stroke();
      ctx.strokeStyle = palette.bandMidStyle;
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, midY - (midY - yTop) * 0.66);
      ctx.stroke();
      ctx.strokeStyle = palette.bandHighStyle;
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, yTop);
      ctx.stroke();
    }
    return;
  }
  if (mode === "line") {
    ctx.strokeStyle = palette.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = clamp(Number(values[i] || 0), 0, 1);
      const yTop = midY - a * ampPx;
      if (i === 0) ctx.moveTo(x, yTop);
      else ctx.lineTo(x, yTop);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = clamp(Number(values[i] || 0), 0, 1);
      const yBottom = midY + a * ampPx;
      if (i === 0) ctx.moveTo(x, yBottom);
      else ctx.lineTo(x, yBottom);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (mode === "dots") {
    const radius = clamp(Math.floor(stepX * 0.28), 1, 3);
    ctx.fillStyle = palette.strokeStyle;
    for (let i = 0; i < bins; i += 1) {
      const a = clamp(Number(values[i] || 0), 0, 1);
      if (a <= 0.001) continue;
      const x = x0 + i * stepX + stepX * 0.5;
      const yTop = midY - a * ampPx;
      const yBottom = midY + a * ampPx;
      ctx.beginPath();
      ctx.arc(x, yTop, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, yBottom, Math.max(1, radius - 1), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.strokeStyle = palette.strokeStyle;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < bins; i += 1) {
    const x = x0 + i * stepX + stepX * 0.5;
    const a = clamp(Number(values[i] || 0), 0, 1);
    ctx.moveTo(x, midY - a * ampPx);
    ctx.lineTo(x, midY + a * ampPx);
  }
  ctx.stroke();
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

function buildSectionAudioEnvelopeFromBuffer(state, samples, sampleRate, visibleStartSec, bins) {
  const width = Math.max(1, Number(state?.canvas?.clientWidth || 0) - LEFT_GUTTER);
  const safeBins = Math.max(1, Math.floor(bins));
  const sourceDurationSec = samples.length / Math.max(1, sampleRate);
  const values = new Array(safeBins).fill(0);
  for (let i = 0; i < safeBins; i += 1) {
    const t0 = visibleStartSec + (i / safeBins) * (width / Math.max(1e-6, state.pxPerSec));
    const t1 = visibleStartSec + ((i + 1) / safeBins) * (width / Math.max(1e-6, state.pxPerSec));
    const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
    const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t1);
    let s0 = Math.floor(mt0 * sampleRate);
    let s1 = Math.ceil(mt1 * sampleRate);
    if (!Number.isFinite(s0)) s0 = 0;
    if (!Number.isFinite(s1)) s1 = s0 + 1;
    s0 = clamp(s0, 0, Math.max(0, samples.length - 1));
    s1 = clamp(s1, s0 + 1, samples.length);
    const span = Math.max(1, s1 - s0);
    const readStep = Math.max(1, Math.floor(span / SECTION_WAVE_DETAIL));
    let peak = 0;
    for (let s = s0; s < s1; s += readStep) {
      const amp = Math.abs(samples[s] || 0);
      if (amp > peak) peak = amp;
    }
    values[i] = clamp(peak, 0, 1);
  }
  return values;
}

function drawSectionWaveform(state, ctx, y, height, visibleStartSec) {
  const width = state.canvas.clientWidth;
  if (width <= LEFT_GUTTER + 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(LEFT_GUTTER, y, width - LEFT_GUTTER, height);
  ctx.clip();

  if (drawSectionCompositionPreview(state, ctx, y, height)) {
    ctx.restore();
    return;
  }

  const buffer = state.scrubAudioBuffer;
  const samples = buffer ? buffer.getChannelData(0) : null;
  if (samples && samples.length >= 2) {
    const sampleRate = Math.max(1, Number(buffer.sampleRate || 44100));
    const mode = normalizeSectionVizMode(state.sectionVizMode);
    if (mode === "line" || mode === "dots") {
      const timelineWidth = Math.max(1, width - LEFT_GUTTER);
      const bins = clamp(Math.floor(timelineWidth / 2.5), 24, 540);
      const envelope = buildSectionAudioEnvelopeFromBuffer(state, samples, sampleRate, visibleStartSec, bins);
      drawAmplitudeVizLane(ctx, envelope, LEFT_GUTTER, timelineWidth, y, height, {
        mode,
        palette: resolveAudioVizPalette({
          strokeStyle: "rgba(62, 46, 32, 0.82)",
          fillStyle: "rgba(63, 43, 27, 0.30)",
          bandLowStyle: "rgba(74, 165, 142, 0.58)",
          bandMidStyle: "rgba(219, 174, 90, 0.56)",
          bandHighStyle: "rgba(198, 104, 147, 0.54)",
          centerLineStyle: "rgba(120, 100, 82, 0.16)",
        }),
      });
    } else if (mode === "filled") {
      drawSectionFilled(state, ctx, y, height, visibleStartSec, samples, sampleRate);
    } else if (mode === "peaks") {
      drawSectionPeaks(state, ctx, y, height, visibleStartSec, samples, sampleRate);
    } else {
      drawSectionBands(state, ctx, y, height, visibleStartSec, samples, sampleRate);
    }
  } else {
    drawSectionMidiFallback(state, ctx, y, height, visibleStartSec);
  }
  ctx.restore();
}

function collectSectionVisualClips(state) {
  const studioData = state?.studioData;
  const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
  const eventsByTrack = studioData?.eventsByTrack && typeof studioData.eventsByTrack === "object"
    ? studioData.eventsByTrack
    : {};
  const orderByName = new Map();
  tracks.forEach((track, idx) => {
    const name = String(track?.name || "").trim();
    if (!name) return;
    orderByName.set(name, idx);
  });
  const clips = [];
  for (const track of tracks) {
    const trackName = String(track?.name || "").trim();
    if (!trackName) continue;
    const kind = String(track?.kind || "").toLowerCase();
    if (kind !== "video" && kind !== "image") continue;
    const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
    for (const event of events) {
      const src = String(event?.previewSrc || event?.src || "").trim();
      if (!src) continue;
      const start = Math.max(0, Number(event?.time || 0));
      const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC));
      const end = start + duration;
      clips.push({
        kind,
        src,
        start,
        end,
        duration,
        startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
        sourceDurationSec: Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || duration)),
        order: Number(orderByName.get(trackName) || 0),
      });
    }
  }
  clips.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.order !== b.order) return b.order - a.order;
    return a.src.localeCompare(b.src);
  });
  return clips;
}

function collectSectionAudioVisualEvents(state, visibleStartSec, visibleEndSec) {
  const studioData = state?.studioData;
  const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
  const eventsByTrack = studioData?.eventsByTrack && typeof studioData.eventsByTrack === "object"
    ? studioData.eventsByTrack
    : {};
  const out = [];
  for (const track of tracks) {
    const kind = String(track?.kind || "").toLowerCase();
    if (kind !== "audio") continue;
    const trackName = String(track?.name || "").trim();
    if (!trackName) continue;
    if (isTrackMuted(state, trackName)) continue;
    const channelMode = resolveEffectiveChannelMode(state, track);
    const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
    for (const event of events) {
      const start = Math.max(0, Number(event?.time || 0));
      const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC));
      const end = start + duration;
      if (end <= visibleStartSec || start >= visibleEndSec) continue;
      out.push({
        trackName,
        clipId: String(event?.clipId || "").trim(),
        start,
        end,
        duration,
        startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
        sourceDurationSec: Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || duration)),
        channelMode,
      });
    }
  }
  return out;
}

function buildSectionCompositionAudioEnvelope(state, audioEvents, visibleStartSec, visibleEndSec, bins) {
  const count = Math.max(1, Math.floor(bins));
  const left = new Float32Array(count);
  const right = new Float32Array(count);
  const spanSec = Math.max(1e-6, visibleEndSec - visibleStartSec);
  for (const event of audioEvents) {
    const start = Math.max(0, Number(event?.start || 0));
    const end = Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(event?.end || start + CLIP_EDIT_MIN_DURATION_SEC));
    if (end <= visibleStartSec || start >= visibleEndSec) continue;
    const sourceDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || (end - start) || CLIP_EDIT_MIN_DURATION_SEC));
    const startOffsetSec = Math.max(0, Number(event?.startOffsetSec || 0));
    const i0 = clamp(Math.floor(((Math.max(start, visibleStartSec) - visibleStartSec) / spanSec) * count), 0, count - 1);
    const i1 = clamp(Math.ceil(((Math.min(end, visibleEndSec) - visibleStartSec) / spanSec) * count), 0, count - 1);
    const hash = normalizedTrackHash(`${event.trackName}:${event.clipId || "clip"}`);
    for (let i = i0; i <= i1; i += 1) {
      const t0 = visibleStartSec + (i / count) * spanSec;
      const t1 = visibleStartSec + ((i + 1) / count) * spanSec;
      const overlapStart = Math.max(start, t0);
      const overlapEnd = Math.min(end, t1);
      if (overlapEnd <= overlapStart) continue;
      const localSec = startOffsetSec + ((overlapStart + overlapEnd) * 0.5 - start);
      const localRatio = clamp(localSec / Math.max(1e-6, sourceDurationSec), 0, 1);
      const body = 0.28 + 0.48 * Math.abs(Math.sin((localRatio * 10 + hash) * Math.PI));
      const trans = 0.12 + 0.2 * Math.abs(Math.sin((localRatio * 34 + hash * 0.7) * Math.PI));
      const amp = clamp(body + trans, 0, 1);
      if (String(event?.channelMode || "").toLowerCase() === "mono") {
        left[i] = Math.max(left[i], amp);
        right[i] = Math.max(right[i], amp);
      } else {
        const l = clamp(amp * (0.84 + 0.16 * Math.sin((localRatio * 8 + hash) * Math.PI * 2)), 0, 1);
        const r = clamp(amp * (0.84 + 0.16 * Math.cos((localRatio * 7 + hash * 1.3) * Math.PI * 2)), 0, 1);
        left[i] = Math.max(left[i], l);
        right[i] = Math.max(right[i], r);
      }
    }
  }
  return { left, right };
}

function getCachedSectionCompositionAudioEnvelope(state, audioEvents, visibleStartSec, visibleEndSec, bins) {
  const signature = audioEvents
    .map(
      (event) =>
        `${event.trackName}:${event.clipId}:${event.start.toFixed(4)}:${event.end.toFixed(4)}:` +
        `${event.startOffsetSec.toFixed(4)}:${String(event.channelMode || "stereo").toLowerCase()}`
    )
    .join("|");
  const key = `${visibleStartSec.toFixed(4)}:${visibleEndSec.toFixed(4)}:${bins}:${signature}`;
  const cached = state._sectionCompositionAudioEnvelopeCache;
  if (cached && cached.key === key && cached.value) return cached.value;
  const value = buildSectionCompositionAudioEnvelope(state, audioEvents, visibleStartSec, visibleEndSec, bins);
  state._sectionCompositionAudioEnvelopeCache = { key, value };
  return value;
}

function drawSectionCompositionAudioOverlay(state, ctx, y, height, visibleStartSec, visibleEndSec) {
  if (height < 8) return false;
  const width = Number(state?.canvas?.clientWidth || 0);
  if (width <= LEFT_GUTTER + 1) return false;
  const timelineWidth = width - LEFT_GUTTER;
  const bins = clamp(Math.floor(timelineWidth / 2.5), 32, 540);
  const events = collectSectionAudioVisualEvents(state, visibleStartSec, visibleEndSec);
  ctx.fillStyle = "rgba(235, 224, 209, 0.98)";
  ctx.fillRect(LEFT_GUTTER, y, timelineWidth, height);
  if (!events.length) {
    ctx.strokeStyle = "rgba(120, 100, 82, 0.22)";
    ctx.beginPath();
    ctx.moveTo(LEFT_GUTTER, y + height * 0.5 + 0.5);
    ctx.lineTo(width, y + height * 0.5 + 0.5);
    ctx.stroke();
    return true;
  }

  const envelope = getCachedSectionCompositionAudioEnvelope(state, events, visibleStartSec, visibleEndSec, bins);
  const laneGap = Math.max(1, Math.floor(height * 0.08));
  const laneHeight = Math.max(3, Math.floor((height - laneGap) * 0.5));
  const leftY = y;
  const rightY = y + laneHeight + laneGap;
  const vizMode = normalizeSectionVizMode(state?.sectionVizMode);

  const stepX = timelineWidth / bins;
  let runStart = -1;
  for (let i = 0; i < bins; i += 1) {
    const silent = envelope.left[i] <= 0.005 && envelope.right[i] <= 0.005;
    if (silent && runStart < 0) runStart = i;
    if ((!silent || i === bins - 1) && runStart >= 0) {
      const endIdx = silent && i === bins - 1 ? i + 1 : i;
      const x0 = LEFT_GUTTER + runStart * stepX;
      const x1 = LEFT_GUTTER + endIdx * stepX;
      if (x1 > x0 + 0.5) {
        ctx.fillStyle = "rgba(208, 190, 170, 0.28)";
        ctx.fillRect(x0, y, x1 - x0, height);
      }
      runStart = -1;
    }
  }

  drawAmplitudeVizLane(ctx, envelope.left, LEFT_GUTTER, timelineWidth, leftY, laneHeight, {
    mode: vizMode,
    palette: resolveAudioVizPalette({
      strokeStyle: "rgba(33, 24, 18, 0.65)",
      fillStyle: "rgba(63, 43, 27, 0.36)",
      bandLowStyle: "rgba(74, 165, 142, 0.58)",
      bandMidStyle: "rgba(219, 174, 90, 0.56)",
      bandHighStyle: "rgba(198, 104, 147, 0.54)",
      centerLineStyle: "rgba(120, 100, 82, 0.14)",
    }),
  });
  drawAmplitudeVizLane(ctx, envelope.right, LEFT_GUTTER, timelineWidth, rightY, laneHeight, {
    mode: vizMode,
    palette: resolveAudioVizPalette({
      strokeStyle: "rgba(74, 48, 33, 0.6)",
      fillStyle: "rgba(63, 43, 27, 0.36)",
      bandLowStyle: "rgba(74, 165, 142, 0.58)",
      bandMidStyle: "rgba(219, 174, 90, 0.56)",
      bandHighStyle: "rgba(198, 104, 147, 0.54)",
      centerLineStyle: "rgba(120, 100, 82, 0.14)",
    }),
  });

  ctx.fillStyle = "rgba(77, 61, 47, 0.72)";
  ctx.font = "8px monospace";
  ctx.fillText("L", LEFT_GUTTER + 3, leftY + 8);
  ctx.fillText("R", LEFT_GUTTER + 3, rightY + 8);
  return true;
}

function drawSectionCompositionPreview(state, ctx, y, height) {
  const width = Number(state?.canvas?.clientWidth || 0);
  if (width <= LEFT_GUTTER + 2) return false;
  const clips = collectSectionVisualClips(state);
  if (!clips.length) return false;
  const toX = (timeSec) => LEFT_GUTTER + (timeSec - state.t0Sec) * state.pxPerSec;
  const timelineWidth = width - LEFT_GUTTER;
  const visibleStartSec = Math.max(0, Number(state?.t0Sec || 0));
  const visibleEndSec = visibleStartSec + timelineWidth / Math.max(1e-6, Number(state?.pxPerSec || 1));
  const splitHeight = Math.max(6, Math.floor((Math.max(2, height) - 1) * 0.5));
  const previewBandHeight = splitHeight;
  const audioBandHeight = Math.max(0, height - previewBandHeight - 1);
  const previewY = y;
  const previewH = previewBandHeight;
  const audioY = y + previewBandHeight + 1;
  const audioH = Math.max(0, height - previewBandHeight - 1);
  ctx.fillStyle = "rgba(231, 219, 203, 0.98)";
  ctx.fillRect(LEFT_GUTTER, y, timelineWidth, height);
  ctx.fillStyle = "rgba(224, 211, 194, 0.76)";
  ctx.fillRect(LEFT_GUTTER, previewY, timelineWidth, previewH);
  for (const clip of clips) {
    const x0 = toX(clip.start);
    const x1 = toX(clip.end);
    const left = clamp(x0, LEFT_GUTTER, width);
    const right = clamp(x1, LEFT_GUTTER, width);
    const clipWidth = Math.max(0, right - left);
    if (clipWidth < 1) continue;
    if (clip.kind === "video") {
      const hasBaseThumb = drawClipThumbnailCover(state, ctx, clip.src, left, clipWidth, previewY, previewH);
      const previewPlan = resolveVideoPreviewPlan(state, clipWidth, previewH);
      const filmstrip = ensureTimelineVideoFilmstrip(state, clip.src, clip.sourceDurationSec, previewPlan);
      const hasFrames = drawClipFilmstripTiles(ctx, filmstrip?.frames || [], left, clipWidth, previewY, previewH, {
        sourceDurationSec: clip.sourceDurationSec,
        clipDurationSec: clip.duration,
        clipStartOffsetSec: clip.startOffsetSec,
      });
      if (!hasFrames) {
        drawClipThumbnailTiles(state, ctx, clip.src, left, clipWidth, previewY, previewH);
      }
    } else {
      drawClipThumbnailCover(state, ctx, clip.src, left, clipWidth, previewY, previewH);
    }
    ctx.strokeStyle = "rgba(95, 72, 53, 0.45)";
    ctx.strokeRect(left + 0.5, previewY + 0.5, Math.max(1, clipWidth - 1), Math.max(1, previewH - 1));
  }
  if (audioH > 0) {
    drawSectionCompositionAudioOverlay(state, ctx, audioY, audioH, visibleStartSec, visibleEndSec);
  }
  return true;
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

  ctx.strokeStyle = "rgba(96, 74, 55, 0.14)";
  for (let t = firstMinor; t <= visibleEndSec + minorStepSec; t += minorStepSec) {
    const x = toX(t);
    if (x < LEFT_GUTTER || x > width) continue;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_HEIGHT - 9);
    ctx.lineTo(x + 0.5, RULER_HEIGHT - 1);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(78, 58, 41, 0.26)";
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

function drawAudioClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h, options = {}) {
  const channelMode = String(options?.channelMode || "").toLowerCase();
  const channelPhase = toFiniteNumber(options?.channelPhase, 0) || 0;
  const strokeStyle = String(options?.strokeStyle || "rgba(41, 28, 18, 0.58)");
  const bins = clamp(Math.floor(widthPx / 2.5), 12, 280);
  const clipStart = Number(clip?.start || 0);
  const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
  const amplitudes = new Array(bins).fill(0);
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
      if (channelMode === "stereo" && channelPhase) {
        const wobble = 0.85 + 0.15 * Math.sin((i / Math.max(1, bins - 1)) * Math.PI * 4 + channelPhase);
        peak *= wobble;
      }
      const scaled = peak * 1.18;
      const a = scaled < 0.012 ? 0 : clamp(scaled, 0, 1);
      amplitudes[i] = a;
    }
  } else {
    // Deterministic fallback when no decoded audio buffer is available.
    const hash = normalizedTrackHash(trackName);
    const phase = hash * Math.PI * 2 + channelPhase;
    for (let i = 0; i < bins; i += 1) {
      const t = i / Math.max(1, bins - 1);
      const base = 0.25 + Math.abs(Math.sin((t * 11.0 + phase) * Math.PI)) * 0.38;
      const wobble = Math.abs(Math.sin((t * 39.0 + phase * 0.7) * Math.PI)) * 0.28;
      amplitudes[i] = clamp(base + wobble, 0.08, 1);
    }
  }
  const vizMode = normalizeSectionVizMode(state?.sectionVizMode);
  drawAmplitudeVizLane(ctx, amplitudes, x0, widthPx, y, h, {
    mode: vizMode,
    palette: resolveAudioVizPalette({
      strokeStyle,
      fillStyle: "rgba(63, 43, 27, 0.36)",
      bandLowStyle: "rgba(74, 165, 142, 0.58)",
      bandMidStyle: "rgba(219, 174, 90, 0.56)",
      bandHighStyle: "rgba(198, 104, 147, 0.54)",
      centerLineStyle: "rgba(120, 100, 82, 0.14)",
    }),
  });
}

function drawStereoClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h) {
  const laneGap = Math.max(2, Math.floor(h * 0.07));
  const laneHeight = Math.max(4, (h - laneGap) * 0.5);
  drawAudioClipSignal(state, ctx, `${trackName}:L`, clip, x0, widthPx, y, laneHeight, {
    channelMode: "stereo",
    channelPhase: 0,
    strokeStyle: "rgba(33, 24, 18, 0.65)",
  });
  drawAudioClipSignal(state, ctx, `${trackName}:R`, clip, x0, widthPx, y + laneHeight + laneGap, laneHeight, {
    channelMode: "stereo",
    channelPhase: Math.PI * 0.67,
    strokeStyle: "rgba(74, 48, 33, 0.6)",
  });
}

function drawClipThumbnailCover(state, ctx, src, x0, widthPx, y, h) {
  const img = getTimelineThumbnail(state, src);
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

function buildUniformTileLayout(x0, widthPx, desiredTileW, gap, maxTiles = 8) {
  const startX = Math.floor(Number(x0 || 0)) + 1;
  const usableWidth = Math.max(1, Math.floor(Number(widthPx || 0)) - 2);
  const targetW = Math.max(8, Number(desiredTileW || 8));
  const safeGap = Math.max(0, Math.round(Number(gap || 0)));
  const maxTilesByWidth = Math.max(1, Math.floor((usableWidth + safeGap) / (targetW + safeGap)));
  const tileCount = clamp(maxTilesByWidth, 1, Math.max(1, Math.floor(Number(maxTiles || 8))));
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

function drawClipThumbnailTiles(state, ctx, src, x0, widthPx, y, h) {
  const img = getTimelineThumbnail(state, src);
  if (!img) return false;
  const imgW = Math.max(1, Number(img.naturalWidth || img.width || 1));
  const imgH = Math.max(1, Number(img.naturalHeight || img.height || 1));
  const tileH = Math.max(10, Math.floor(h - 2));
  const aspect = imgW / Math.max(1, imgH);
  const desiredTileW = clamp(tileH * aspect, 24, Math.max(26, Math.min(188, widthPx - 2)));
  const layout = buildUniformTileLayout(x0, widthPx, desiredTileW, VIDEO_FILMSTRIP_TILE_GAP, 8);
  const innerY = Math.floor(y + (h - tileH) * 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  // Seed full strip with source thumbnail so async/missing per-tile work never
  // exposes placeholder regions.
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

function drawFrameInTileContain(ctx, frame, tileX, tileY, tileW, tileH) {
  if (!frame) return;
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
  ctx.fillStyle = "rgba(47, 35, 24, 0.72)";
  ctx.fillRect(tileX, tileY, tileW, tileH);
  ctx.drawImage(frame, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function drawClipFilmstripTiles(ctx, frames, x0, widthPx, y, h, options = {}) {
  const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (!list.length) return false;
  const sourceDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(options?.sourceDurationSec || 0.01));
  const clipDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(options?.clipDurationSec || sourceDurationSec));
  const clipStartOffsetSec = Math.max(0, Number(options?.clipStartOffsetSec || 0));
  const tileH = Math.max(10, Math.floor(h - 2));
  const reference = list[0];
  const refW = Math.max(1, Number(reference?.width || 1));
  const refH = Math.max(1, Number(reference?.height || 1));
  const aspect = refW / Math.max(1, refH);
  const desiredTileW = clamp(tileH * aspect, 24, Math.max(28, Math.min(220, widthPx * 0.52)));
  const layout = buildUniformTileLayout(x0, widthPx, desiredTileW, VIDEO_FILMSTRIP_TILE_GAP, 26);
  const tileCount = layout.tileCount;
  const innerY = Math.floor(y + (h - tileH) * 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  drawFrameInTileContain(ctx, list[0], x0, innerY, widthPx, tileH);
  for (const tile of layout.tiles) {
    const ratio = tileCount <= 1 ? 0 : (tile.index / Math.max(1, tileCount - 1));
    const localTimeSec = clipStartOffsetSec + clipDurationSec * ratio;
    const frameRatio = Math.max(0, Math.min(1, localTimeSec / sourceDurationSec));
    let frameIndex = Math.max(0, Math.min(list.length - 1, Math.round(frameRatio * (list.length - 1))));
    const frame = list[frameIndex] || list[0];
    if (frame) {
      drawFrameInTileContain(ctx, frame, tile.x, innerY, tile.w, tileH);
    } else {
      ctx.fillStyle = "rgba(47, 35, 24, 0.72)";
      ctx.fillRect(tile.x, innerY, tile.w, tileH);
    }
    ctx.strokeStyle = "rgba(72, 56, 42, 0.45)";
    ctx.strokeRect(tile.x + 0.5, innerY + 0.5, Math.max(1, tile.w - 1), Math.max(1, tileH - 1));
  }
  ctx.restore();
  return true;
}

function drawClipEdgeFrames(ctx, frames, x0, widthPx, y, h) {
  const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (!list.length) return false;
  const first = list[0];
  const last = list.length > 1 ? list[list.length - 1] : list[0];
  const tileH = Math.max(10, h - 2);
  const refW = Math.max(1, Number(first?.width || 1));
  const refH = Math.max(1, Number(first?.height || 1));
  const aspect = refW / Math.max(1, refH);
  const tileW = clamp(tileH * aspect, 24, Math.max(28, Math.min(180, widthPx * 0.44)));
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

function resolveVideoPreviewPlan(state, widthPx, options = {}) {
  const mode = normalizeVideoPreviewMode(state?.videoPreviewMode);
  const qualityHint = normalizeVideoPreviewQualityHint(state?.previewQualityHint);
  const queuePressure = getFilmstripQueuePressure();
  const clipInteractive = Boolean(options?.clipInteractive);
  const interactive = Boolean(
    (state?.clipEditSession && clipInteractive) ||
    state?.panningX ||
    state?.scrubbing ||
    state?.resizingSection ||
    state?.isPlaying
  );
  const pressureHigh = queuePressure >= 6;
  const pressureMedium = queuePressure >= 2;
  if (mode === "light") {
    return {
      strategy: "full",
      frameCount: 2,
      targetHeight: VIDEO_FILMSTRIP_TARGET_HEIGHT_LIGHT,
    };
  }
  if (mode === "full") {
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(
        clamp(Math.round(widthPx / 120), VIDEO_FILMSTRIP_MIN_FRAMES, VIDEO_FILMSTRIP_MAX_FRAMES + 2)
      ),
      targetHeight: VIDEO_FILMSTRIP_TARGET_HEIGHT,
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
      frameCount: bucketizeFilmstripFrameCount(clamp(Math.round(widthPx / 190), 3, 6)),
      targetHeight: 48,
    };
  }
  if (qualityHint === "high" && !interactive && !pressureHigh) {
    return {
      strategy: "full",
      frameCount: bucketizeFilmstripFrameCount(clamp(Math.round(widthPx / 120), 4, VIDEO_FILMSTRIP_MAX_FRAMES + 2)),
      targetHeight: VIDEO_FILMSTRIP_TARGET_HEIGHT,
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
      clamp(
        Math.round(widthPx / (pressureMedium ? 170 : 140)),
        VIDEO_FILMSTRIP_MIN_FRAMES,
        pressureMedium
          ? Math.max(VIDEO_FILMSTRIP_MIN_FRAMES + 1, VIDEO_FILMSTRIP_MAX_FRAMES - 4)
          : Math.max(VIDEO_FILMSTRIP_MIN_FRAMES + 2, VIDEO_FILMSTRIP_MAX_FRAMES - 1)
      )
    ),
    targetHeight: pressureMedium ? 50 : 56,
  };
}

function drawImageClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h) {
  const thumbnailSrc = String(clip?.thumbnailSrc || clip?.previewSrc || clip?.src || "").trim();
  const hasThumb = drawClipThumbnailCover(state, ctx, thumbnailSrc, x0, widthPx, y, h);
  if (hasThumb) {
    ctx.fillStyle = "rgba(41, 27, 17, 0.18)";
    ctx.fillRect(x0, y, widthPx, h);
  }
  const hash = normalizedTrackHash(`${trackName}:${clip?.label || "image"}`);
  const bars = clamp(Math.floor(widthPx / 6), 6, 64);
  const barW = widthPx / bars;
  const baseY = y + h;
  const phase = hash * Math.PI * 2;
  ctx.strokeStyle = "rgba(52, 34, 21, 0.45)";
  for (let row = 1; row <= 2; row += 1) {
    const gy = y + (h * row) / 3;
    ctx.beginPath();
    ctx.moveTo(x0, gy + 0.5);
    ctx.lineTo(x0 + widthPx, gy + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(72, 48, 30, 0.4)";
  for (let i = 0; i < bars; i += 1) {
    const t = i / Math.max(1, bars - 1);
    const envelope = 0.35 + Math.abs(Math.sin((t * 5 + phase) * Math.PI)) * 0.55;
    const barH = Math.max(2, envelope * h * 0.82);
    const bx = x0 + i * barW;
    const by = baseY - barH;
    ctx.fillRect(bx + 1, by, Math.max(1, barW - 2), barH);
  }
}

function drawVideoClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h, options = {}) {
  const thumbnailSrc = String(clip?.thumbnailSrc || clip?.previewSrc || clip?.src || "").trim();
  const clipStart = Number(clip?.start || 0);
  const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
  const clipDurationSec = Math.max(0.01, clipEnd - clipStart);
  const sourceDurationSec = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Number(clip?.sourceDurationSec || clip?.end - clip?.start || CLIP_EDIT_MIN_DURATION_SEC)
  );
  const clipStartOffsetSec = Math.max(0, Number(clip?.startOffsetSec || 0));
  const hasSourceWindowControl = Math.max(0, sourceDurationSec - clipDurationSec) > 0.0005;
  const safeInsetX = resolveClipHandleSafeInset(widthPx, 2);
  const safeInsetTop = 3;
  const safeInsetBottom = (hasSourceWindowControl ? (CLIP_WINDOW_BAR_HEIGHT + CLIP_WINDOW_BAR_BOTTOM_MARGIN + 3) : 3);
  const contentTop = y + safeInsetTop;
  const contentBottom = Math.max(contentTop + 4, y + h - safeInsetBottom);
  const contentH = Math.max(4, contentBottom - contentTop);
  let stripeX = Math.floor(x0 + safeInsetX);
  let stripeW = Math.floor(widthPx - safeInsetX * 2);
  if (stripeW < 6) {
    stripeX = Math.floor(x0 + 1);
    stripeW = Math.max(2, Math.floor(widthPx - 2));
  }
  const frameCount = clamp(Math.floor(stripeW / 42), 3, 18);
  const stripeH = Math.max(4, Math.floor(contentH * 0.74));
  const stripeY = Math.floor(contentTop + Math.max(0, (contentH - stripeH) * 0.5));
  const hasBaseThumb = drawClipThumbnailCover(state, ctx, thumbnailSrc, stripeX, stripeW, stripeY, stripeH);
  const activeSession = state?.clipEditSession;
  const sessionMode = String(activeSession?.mode || "").trim().toLowerCase();
  const sessionClipId = String(activeSession?.clipId || "").trim();
  const clipId = String(getClipId(clip) || "").trim();
  const isActiveSessionClip = Boolean(sessionClipId && clipId && sessionClipId === clipId);
  const isMoveSession = Boolean(activeSession && sessionMode === "move");
  const isGroupMoveMember = isMoveSession && Array.isArray(activeSession?.groupMembers)
    ? activeSession.groupMembers.some((member) => String(member?.clipId || "").trim() === clipId)
    : false;
  // Drag-render mode must only affect the actual moved clip(s), not every selected clip.
  const isDraggedClip = Boolean(isMoveSession && (isActiveSessionClip || isGroupMoveMember));
  const previewPlan = resolveVideoPreviewPlan(state, widthPx, {
    clipInteractive: isDraggedClip,
  });
  const filmstrip = ensureTimelineVideoFilmstrip(state, thumbnailSrc, sourceDurationSec, previewPlan);
  const hasFramePreview = drawClipFilmstripTiles(ctx, filmstrip?.frames || [], stripeX, stripeW, stripeY, stripeH, {
    sourceDurationSec,
    clipDurationSec,
    clipStartOffsetSec,
  });
  const hasThumbTiles = !hasFramePreview
    ? drawClipThumbnailTiles(state, ctx, thumbnailSrc, stripeX, stripeW, stripeY, stripeH)
    : false;
  const hasAnyVisual = hasFramePreview || hasThumbTiles || hasBaseThumb;
  const hash = normalizedTrackHash(`${trackName}:${clip?.label || "video"}`);
  if (!hasAnyVisual) {
    ctx.fillStyle = "rgba(34, 26, 18, 0.3)";
    ctx.fillRect(stripeX, stripeY, stripeW, stripeH);
  }
  const keyframes = clamp(Math.floor(widthPx / 90), 1, 7);
  const frameW = Math.max(6, stripeW / Math.max(1, frameCount));
  for (let i = 0; i <= keyframes; i += 1) {
    const t = i / Math.max(1, keyframes);
    const kx = stripeX + t * stripeW;
    const level = 0.45 + Math.abs(Math.sin((t * 9 + hash) * Math.PI * 2)) * 0.45;
    const kh = Math.max(3, stripeH * level);
    const ky = stripeY + stripeH - kh;
    ctx.fillStyle = "rgba(86, 60, 38, 0.62)";
    ctx.fillRect(kx + 1, ky, Math.max(2, frameW * 0.28), kh);
  }
  const drawCornerBadge = (text, corner, options = {}) => {
    const label = String(text || "").trim();
    if (!label) return;
    const padX = Number(options?.padX || 4);
    const hBox = Number(options?.height || 11);
    const font = String(options?.font || "9px monospace");
    ctx.font = font;
    const wBox = Math.ceil(ctx.measureText(label).width) + padX * 2;
    const safeX0 = x0 + safeInsetX;
    const safeX1 = x0 + widthPx - safeInsetX - wBox;
    const topY = contentTop;
    const bottomY = Math.max(contentTop, contentBottom - hBox);
    let boxX = safeX0;
    let boxY = topY;
    if (corner === "top-right") boxX = safeX1;
    else if (corner === "bottom-left") boxY = bottomY;
    else if (corner === "bottom-right") {
      boxX = safeX1;
      boxY = bottomY;
    }
    boxX = clamp(boxX, safeX0, Math.max(safeX0, safeX1));
    boxY = clamp(boxY, topY, Math.max(topY, bottomY));
    ctx.fillStyle = "rgba(26, 19, 13, 0.68)";
    ctx.fillRect(boxX, boxY, wBox, hBox);
    ctx.strokeStyle = "rgba(223, 203, 176, 0.72)";
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, Math.max(1, wBox - 1), Math.max(1, hBox - 1));
    ctx.fillStyle = "rgba(243, 232, 217, 0.92)";
    ctx.fillText(label, boxX + padX, boxY + 8.5);
  };
  const nominalFrameStep = clipDurationSec / Math.max(1, frameCount);
  const fpsHint = nominalFrameStep > 0 ? (1 / nominalFrameStep) : 0;
  const labelSafeWidth = Math.max(0, widthPx - safeInsetX * 2);
  if (labelSafeWidth >= 94 && contentH >= 22) {
    drawCornerBadge(compactText(String(clip?.label || "video"), 26), "top-left");
    drawCornerBadge(`clip ${clipDurationSec.toFixed(2)}s / src ${sourceDurationSec.toFixed(2)}s`, "top-right");
    drawCornerBadge(`off ${clipStartOffsetSec.toFixed(2)}s`, "bottom-left");
    if (fpsHint > 0) {
      drawCornerBadge(`${Math.round(fpsHint)}fps`, "bottom-right");
    }
  }
}

function drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight, options = {}) {
  const clipTopInset = Math.max(0, Number(options?.clipTopInset || 5));
  const clipBottomInset = Math.max(0, Number(options?.clipBottomInset || 5));
  const clipBoxY = rowTop + clipTopInset;
  const clipBoxH = Math.max(8, rowHeight - clipTopInset - clipBottomInset);
  const innerY = clipBoxY + 2;
  const innerH = Math.max(6, clipBoxH - 4);
  const clipStart = Number(clip?.start || 0);
  const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
  const kind = String(track?.kind || "").toLowerCase();
  const channelMode = resolveEffectiveChannelMode(state, track);

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

  if (kind === "audio") {
    if (channelMode === "stereo") {
      drawStereoClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
    } else {
      drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
    }
    return;
  }
  if (kind === "video") {
    drawVideoClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH, {
      selected: Boolean(options?.selected),
    });
    return;
  }
  if (kind === "image") {
    drawImageClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
    return;
  }
  drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
}

function drawClipHandles(ctx, x0, rowTop, widthPx, rowHeight, options = {}) {
  const muted = Boolean(options?.muted);
  const selected = Boolean(options?.selected);
  if (widthPx < 10) return null;
  const handleW = widthPx < 36 ? 5 : 8;
  const handleY = rowTop + 8;
  const handleH = Math.max(8, rowHeight - 16);
  const leftX = x0 + 1;
  const rightX = x0 + widthPx - handleW - 1;
  ctx.fillStyle = muted
    ? "rgba(82, 66, 50, 0.52)"
    : (selected ? "rgba(238, 231, 219, 0.96)" : "rgba(233, 226, 213, 0.8)");
  ctx.fillRect(leftX, handleY, handleW, handleH);
  ctx.fillRect(rightX, handleY, handleW, handleH);
  ctx.strokeStyle = muted ? "rgba(56, 40, 27, 0.4)" : "rgba(76, 54, 36, 0.7)";
  ctx.strokeRect(leftX + 0.5, handleY + 0.5, Math.max(1, handleW - 1), Math.max(1, handleH - 1));
  ctx.strokeRect(rightX + 0.5, handleY + 0.5, Math.max(1, handleW - 1), Math.max(1, handleH - 1));
  const ridgeCount = handleW >= 8 ? 3 : 2;
  const ridgeInset = Math.max(1, Math.floor(handleW / 3));
  ctx.strokeStyle = muted ? "rgba(61, 45, 31, 0.45)" : "rgba(94, 69, 49, 0.62)";
  for (let i = 0; i < ridgeCount; i += 1) {
    const offset = ridgeInset + i;
    const lx = leftX + offset + 0.5;
    const rx = rightX + offset + 0.5;
    ctx.beginPath();
    ctx.moveTo(lx, handleY + 2);
    ctx.lineTo(lx, handleY + handleH - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx, handleY + 2);
    ctx.lineTo(rx, handleY + handleH - 2);
    ctx.stroke();
  }
  return {
    leftX,
    rightX,
    y0: handleY,
    y1: handleY + handleH,
    w: handleW,
  };
}

function drawClipSourceWindowControl(ctx, clip, x0, rowTop, widthPx, rowHeight, options = {}) {
  const sourceDurationSec = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Number(clip?.sourceDurationSec || (clip?.end - clip?.start) || CLIP_EDIT_MIN_DURATION_SEC)
  );
  const clipDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || 0) - Number(clip?.start || 0));
  const maxOffsetSec = Math.max(0, sourceDurationSec - clipDurationSec);
  if (maxOffsetSec <= 0.0005) return null;
  const safeInset = resolveClipHandleSafeInset(widthPx, 7);
  const railX = x0 + safeInset;
  const railW = Math.max(0, widthPx - safeInset * 2);
  if (railW < 24) return null;
  const railH = CLIP_WINDOW_BAR_HEIGHT;
  const railY = rowTop + rowHeight - railH - CLIP_WINDOW_BAR_BOTTOM_MARGIN;
  const normalized = clamp(Math.max(0, Number(clip?.startOffsetSec || 0)) / maxOffsetSec, 0, 1);
  const knobMinW = 12;
  const knobW = clamp(railW * (clipDurationSec / sourceDurationSec), knobMinW, railW);
  const knobX = railX + (railW - knobW) * normalized;
  const knobX0 = knobX - 2;
  const knobX1 = knobX + knobW + 2;
  const railHitX0 = railX - 2;
  const railHitX1 = railX + railW + 2;
  const selected = Boolean(options?.selected);
  const muted = Boolean(options?.muted);

  ctx.fillStyle = muted ? "rgba(70, 56, 43, 0.5)" : "rgba(77, 60, 44, 0.32)";
  ctx.fillRect(railX, railY, railW, railH);
  ctx.strokeStyle = muted ? "rgba(54, 39, 26, 0.6)" : "rgba(79, 56, 36, 0.7)";
  ctx.strokeRect(railX + 0.5, railY + 0.5, Math.max(1, railW - 1), Math.max(1, railH - 1));
  ctx.fillStyle = selected ? "rgba(244, 235, 220, 0.96)" : "rgba(229, 219, 203, 0.88)";
  ctx.fillRect(knobX, railY + 0.5, knobW, Math.max(2, railH - 1));
  ctx.strokeStyle = "rgba(85, 62, 42, 0.78)";
  ctx.strokeRect(knobX + 0.5, railY + 0.5, Math.max(1, knobW - 1), Math.max(1, railH - 1));

  return {
    x0: knobX0,
    y0: railY - 2,
    x1: knobX1,
    y1: railY + railH + 2,
    railX,
    railY,
    railW,
    railH,
    knobX,
    knobW,
    knobX0,
    knobX1,
    railHitX0,
    railHitX1,
  };
}

function resolveSlipOffsetFromRailHit(hit, pointerCanvasX, sourceDurationSec, clipDurationSec) {
  const railX0 = Number(hit?.rail_x0);
  const railX1 = Number(hit?.rail_x1);
  const knobW = Math.max(0, Number(hit?.knob_w || 0));
  if (!Number.isFinite(railX0) || !Number.isFinite(railX1) || railX1 <= railX0) return null;
  const maxOffsetSec = Math.max(0, Number(sourceDurationSec || 0) - Number(clipDurationSec || 0));
  if (maxOffsetSec <= 0.0005) return 0;
  const railW = Math.max(1, railX1 - railX0);
  const travelW = Math.max(0, railW - knobW);
  if (travelW <= 0.0005) return 0;
  const pointerX = clamp(Number(pointerCanvasX || railX0), railX0, railX1);
  const normalized = clamp((pointerX - railX0 - knobW * 0.5) / travelW, 0, 1);
  return clamp(normalized * maxOffsetSec, 0, maxOffsetSec);
}

function resolveClipHandleSafeInset(widthPx, extra = 4) {
  const handleW = widthPx < 36 ? 5 : 8;
  return Math.max(6, handleW + Math.max(0, Number(extra || 0)));
}

function drawClipEditOverlay(state, ctx, rowTop, rowBottom, clip, x0, widthPx) {
  const session = state?.clipEditSession;
  if (!session) return;
  if (String(session.clipId || "") !== String(getClipId(clip) || "")) return;
  const xStart = x0;
  const xEnd = x0 + widthPx;
  const safeInset = resolveClipHandleSafeInset(widthPx, 5);
  const xStartSafe = xStart + safeInset;
  const xEndSafe = xEnd - safeInset;
  const safeWidth = Math.max(0, xEndSafe - xStartSafe);
  if (safeWidth < 22) return;
  const mode = String(session.mode || "move").toLowerCase();
  const modeLabel = mode === "trim_start"
    ? "TRIM IN"
    : (mode === "trim_end" ? "TRIM OUT" : (mode === "slip" ? "SLIP" : "MOVE"));
  ctx.save();
  ctx.fillStyle = "rgba(102, 80, 59, 0.14)";
  ctx.fillRect(xStart + 1, rowTop + 2, Math.max(1, widthPx - 2), Math.max(6, rowBottom - rowTop - 4));

  // Ghost edge guides for active edit.
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "rgba(58, 42, 27, 0.85)";
  ctx.beginPath();
  ctx.moveTo(xStart + 0.5, rowTop + 2);
  ctx.lineTo(xStart + 0.5, rowBottom - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(xEnd + 0.5, rowTop + 2);
  ctx.lineTo(xEnd + 0.5, rowBottom - 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Active mode badge centered near top.
  ctx.fillStyle = "rgba(68, 50, 35, 0.92)";
  ctx.font = "9px monospace";
  const modePadX = 6;
  const modeH = 12;
  const modeW = Math.ceil(ctx.measureText(modeLabel).width) + modePadX * 2;
  const modeX = clamp(xStart + (widthPx - modeW) * 0.5, xStartSafe + 1, Math.max(xStartSafe + 1, xEndSafe - modeW - 1));
  const modeY = rowTop + 2;
  ctx.fillRect(modeX, modeY, modeW, modeH);
  ctx.strokeStyle = "rgba(225, 204, 177, 0.7)";
  ctx.strokeRect(modeX + 0.5, modeY + 0.5, Math.max(1, modeW - 1), Math.max(1, modeH - 1));
  ctx.fillStyle = "#f8efe2";
  ctx.fillText(modeLabel, modeX + modePadX, modeY + 9);

  ctx.fillStyle = "rgba(72, 55, 40, 0.94)";
  ctx.font = "9px monospace";
  const startSec = Number(clip?.start || 0);
  const endSec = Number(clip?.end || 0);
  ctx.beginPath();
  ctx.rect(xStartSafe, rowTop + 2, safeWidth, Math.max(10, rowBottom - rowTop - 4));
  ctx.clip();
  ctx.fillText(`S ${startSec.toFixed(2)}s`, xStartSafe + 2, rowTop + 24);
  const duration = Math.max(0, endSec - startSec);
  const sourceDuration = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Number(clip?.sourceDurationSec || duration || CLIP_EDIT_MIN_DURATION_SEC)
  );
  const startOffsetSec = Math.max(0, Number(clip?.startOffsetSec || 0));
  const maxOffsetSec = Math.max(0, sourceDuration - duration);
  const durationText = `D ${duration.toFixed(2)}s / src ${sourceDuration.toFixed(2)}s / off ${startOffsetSec.toFixed(2)}s`;
  const textWidth = Math.ceil(ctx.measureText(durationText).width);
  const textX = Math.max(xStartSafe + 2, xEndSafe - textWidth - 2);
  if (textX + textWidth <= xEndSafe) {
    ctx.fillText(durationText, textX, rowTop + 24);
  }
  const endText = `E ${endSec.toFixed(2)}s`;
  const endTextW = Math.ceil(ctx.measureText(endText).width);
  const endTextX = Math.max(xStartSafe + 2, xEndSafe - endTextW - 2);
  const endTextY = Math.max(rowTop + 34, rowBottom - 6);
  if (endTextX + endTextW <= xEndSafe) {
    ctx.fillText(endText, endTextX, endTextY);
  }

  // Boundary hints (source/window limits) during trim/slip.
  if (mode === "trim_start" || mode === "trim_end" || mode === "slip") {
    const atMinOffset = startOffsetSec <= 0.001;
    const atMaxOffset = startOffsetSec >= Math.max(0, maxOffsetSec - 0.001);
    if (atMinOffset || atMaxOffset) {
      const hint = atMinOffset ? "at source in" : "at source out";
      const hintW = Math.ceil(ctx.measureText(hint).width) + 8;
      const hintX = clamp(xStart + 3, xStartSafe + 1, Math.max(xStartSafe + 1, xEndSafe - hintW - 1));
      const hintY = Math.max(rowTop + 14, rowBottom - 18);
      ctx.fillStyle = "rgba(84, 60, 38, 0.88)";
      ctx.fillRect(hintX, hintY, hintW, 11);
      ctx.strokeStyle = "rgba(223, 198, 166, 0.68)";
      ctx.strokeRect(hintX + 0.5, hintY + 0.5, Math.max(1, hintW - 1), 10);
      ctx.fillStyle = "#f8efe2";
      ctx.fillText(hint, hintX + 4, hintY + 8.5);
    }
  }
  ctx.restore();
}

function isTrackMuted(state, trackName) {
  return Boolean(state.mutedTracks && state.mutedTracks.has(String(trackName || "")));
}

function isTrackLocked(state, trackName) {
  return Boolean(state?.lockedTracks && state.lockedTracks.has(String(trackName || "")));
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
    const playersByAssetKey = entry?.playersByAssetKey instanceof Map
      ? entry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) continue;
    const muted = isTrackMuted(state, trackName);
    for (const player of playersByAssetKey.values()) {
      if (!player?.audio) continue;
      try {
        player.audio.volume = muted ? 0 : 1;
      } catch {}
    }
  }
}

function hasTrackAudioPlayback(state, options = {}) {
  const { unmutedOnly = false } = options;
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return false;
  if (!unmutedOnly) return true;
  return getUnmutedTrackAudioEntries(state).length > 0;
}

function getPlaybackClockAudio(state) {
  // Track clip playback is event-driven (per clip/time window), so it cannot be used as a linear global clock.
  // Keep the deterministic clock source on the dedicated mix track only.
  if (hasTrackAudioPlayback(state, { unmutedOnly: true })) return null;
  if (state.audio && state.audioSource && !state.audioErrored && !isMixTrackMuted(state)) return state.audio;
  return null;
}

function clearTrackAudioPlayers(state) {
  if (!state.trackAudioPlayers || !state.trackAudioPlayers.size) return;
  for (const entry of state.trackAudioPlayers.values()) {
    const playersByAssetKey = entry?.playersByAssetKey instanceof Map
      ? entry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) continue;
    for (const player of playersByAssetKey.values()) {
      const audio = player?.audio;
      if (!audio) continue;
      if (player.handlers) {
        try {
          if (player.handlers.onError) audio.removeEventListener("error", player.handlers.onError);
          if (player.handlers.onReady) {
            audio.removeEventListener("loadedmetadata", player.handlers.onReady);
            audio.removeEventListener("canplay", player.handlers.onReady);
          }
        } catch {}
      }
      try {
        audio.pause();
        audio.src = "";
        audio.load();
      } catch {}
    }
    playersByAssetKey.clear();
  }
  state.trackAudioPlayers.clear();
}

function resolveTrackAudioActiveEventAtTime(state, trackName, timeSec) {
  const name = String(trackName || "").trim();
  if (!name) return null;
  const events = Array.isArray(state?.studioData?.eventsByTrack?.[name])
    ? state.studioData.eventsByTrack[name]
    : [];
  if (!events.length) return null;
  const t = Math.max(0, Number(timeSec || 0));
  const eps = 1 / 120;
  let selected = null;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const start = Math.max(0, Number(event?.time || 0));
    const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC));
    const end = start + duration;
    if (t + eps < start) continue;
    if (t > end - eps) continue;
    if (!selected) {
      selected = { event, start, end, duration };
      continue;
    }
    if (start > selected.start + eps) {
      selected = { event, start, end, duration };
      continue;
    }
    if (Math.abs(start - selected.start) <= eps && end > selected.end + eps) {
      selected = { event, start, end, duration };
    }
  }
  return selected;
}

function resolveTrackAudioLocalTime(active, playheadSec, player = null) {
  if (!active || !active.event) return 0;
  const start = Math.max(0, Number(active.start || 0));
  const sourceDurationSec = Math.max(
    CLIP_EDIT_MIN_DURATION_SEC,
    Number(active.event?.sourceDurationSec || active.duration || CLIP_EDIT_MIN_DURATION_SEC)
  );
  const mediaDurationSec = Number(player?.audio?.duration || 0);
  const effectiveSourceDurationSec =
    Number.isFinite(mediaDurationSec) && mediaDurationSec > 0.05
      ? Math.max(sourceDurationSec, mediaDurationSec)
      : sourceDurationSec;
  const startOffsetSec = Math.max(0, Number(active.event?.startOffsetSec || 0));
  const maxLocal = Math.max(0, effectiveSourceDurationSec - 0.01);
  const local = startOffsetSec + Math.max(0, Number(playheadSec || 0) - start);
  return clamp(local, 0, maxLocal);
}

function resolveTrackAudioPlayerForEvent(trackEntry, activeEvent) {
  const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
    ? trackEntry.playersByAssetKey
    : null;
  if (!playersByAssetKey || !playersByAssetKey.size) return null;
  const eventAssetKey = String(activeEvent?.assetKey || "").trim();
  if (eventAssetKey && playersByAssetKey.has(eventAssetKey)) {
    return playersByAssetKey.get(eventAssetKey);
  }
  const defaultAssetKey = String(trackEntry?.defaultAssetKey || "").trim();
  if (defaultAssetKey && playersByAssetKey.has(defaultAssetKey)) {
    return playersByAssetKey.get(defaultAssetKey);
  }
  for (const candidate of playersByAssetKey.values()) {
    if (candidate?.audio && !candidate?.errored) return candidate;
  }
  for (const candidate of playersByAssetKey.values()) {
    if (candidate?.audio) return candidate;
  }
  return null;
}

function pauseAllTrackAudioPlayers(trackEntry, { exceptAssetKey = "" } = {}) {
  const keepAssetKey = String(exceptAssetKey || "").trim();
  const playersByAssetKey = trackEntry?.playersByAssetKey instanceof Map
    ? trackEntry.playersByAssetKey
    : null;
  if (!playersByAssetKey || !playersByAssetKey.size) return;
  for (const player of playersByAssetKey.values()) {
    const assetKey = String(player?.assetKey || "").trim();
    if (keepAssetKey && assetKey === keepAssetKey) continue;
    const audio = player?.audio;
    if (!audio) continue;
    if (!audio.paused) {
      try { audio.pause(); } catch {}
    }
  }
}

function applyTrackPlayerSeek(player, localTime) {
  const audio = player?.audio;
  if (!audio) return false;
  const target = Math.max(0, Number(localTime || 0));
  try {
    audio.currentTime = target;
    player.pendingSeekSec = null;
    return true;
  } catch {
    player.pendingSeekSec = target;
    return false;
  }
}

function syncTrackAudioPlayersToPlayhead(state, { play = false, forceSeek = false } = {}) {
  if (!state?.trackAudioPlayers || !state.trackAudioPlayers.size) return;
  const shouldPlay = Boolean(play);
  const t = clamp(Number(state.playheadSec || 0), 0, Math.max(0, Number(state.durationSec || 0)));
  for (const [trackName, entry] of state.trackAudioPlayers.entries()) {
    const playersByAssetKey = entry?.playersByAssetKey instanceof Map
      ? entry.playersByAssetKey
      : null;
    if (!playersByAssetKey || !playersByAssetKey.size) continue;
    const muted = isTrackMuted(state, trackName);
    const active = resolveTrackAudioActiveEventAtTime(state, trackName, t);
    const activeClipId = String(active?.event?.clipId || "").trim();
    const shouldClipPlay = Boolean(shouldPlay && !muted && active);

    if (!active) {
      entry.activeClipId = "";
      entry.activeAssetKey = "";
      pauseAllTrackAudioPlayers(entry);
      continue;
    }

    const selectedPlayer = resolveTrackAudioPlayerForEvent(entry, active.event);
    const audio = selectedPlayer?.audio;
    if (!audio || selectedPlayer?.errored) {
      entry.activeClipId = activeClipId;
      entry.activeAssetKey = String(selectedPlayer?.assetKey || "");
      pauseAllTrackAudioPlayers(entry, { exceptAssetKey: entry.activeAssetKey });
      continue;
    }
    const selectedAssetKey = String(selectedPlayer?.assetKey || "").trim();
    const localTime = resolveTrackAudioLocalTime(active, t, selectedPlayer);
    const currentLocal = Number(audio.currentTime || 0);
    const drift = Math.abs(currentLocal - localTime);
    const clipChanged =
      String(entry.activeClipId || "") !== activeClipId ||
      String(entry.activeAssetKey || "") !== selectedAssetKey;
    const seekThreshold = forceSeek ? 0.005 : (clipChanged ? 0.012 : 0.065);

    if (forceSeek || clipChanged || drift > seekThreshold) {
      applyTrackPlayerSeek(selectedPlayer, localTime);
    }
    entry.activeClipId = activeClipId;
    entry.activeAssetKey = selectedAssetKey;
    pauseAllTrackAudioPlayers(entry, { exceptAssetKey: selectedAssetKey });

    if (!shouldClipPlay) {
      selectedPlayer.pendingPlay = false;
      if (!audio.paused) {
        try { audio.pause(); } catch {}
      }
      continue;
    }

    if (selectedPlayer.pendingSeekSec != null) {
      // Robustness: when playback starts away from t=0, a first seek can fail before media is ready.
      // Re-try pending seek on each sync pass so audio can recover deterministically once ready.
      const pendingTarget = Number(selectedPlayer.pendingSeekSec || 0);
      const applied = applyTrackPlayerSeek(selectedPlayer, pendingTarget);
      if (!applied) {
        selectedPlayer.pendingPlay = shouldClipPlay;
        continue;
      }
    }

    selectedPlayer.pendingPlay = false;
    if (audio.paused) {
      try {
        const result = audio.play();
        if (result && typeof result.catch === "function") {
          result.catch(() => {
            selectedPlayer.lastPlayBlockedAt = Date.now();
          });
        }
      } catch {
        selectedPlayer.lastPlayBlockedAt = Date.now();
      }
    }
  }
}

function setupTrackAudioPlayers(state, onResolveAudioUrl) {
  clearTrackAudioPlayers(state);
  if (typeof Audio !== "function") return;
  if (typeof onResolveAudioUrl !== "function") return;
  const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
  const eventsByTrack = state.studioData?.eventsByTrack || {};
  for (const track of tracks) {
    const trackName = String(track?.name || "");
    const kind = String(track?.kind || "").toLowerCase();
    const defaultAssetKey = String(track?.audioAssetKey || "").trim();
    const playAudio = track?.playAudio !== false;
    if (!trackName || kind !== "audio") continue;
    if (!playAudio) continue;
    const trackEvents = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
    const assetKeyCandidates = new Set();
    if (defaultAssetKey && defaultAssetKey !== "mix") assetKeyCandidates.add(defaultAssetKey);
    for (const event of trackEvents) {
      const eventAssetKey = String(event?.assetKey || "").trim();
      if (!eventAssetKey || eventAssetKey === "mix") continue;
      assetKeyCandidates.add(eventAssetKey);
    }
    if (!assetKeyCandidates.size) continue;
    const playersByAssetKey = new Map();
    for (const assetKey of assetKeyCandidates.values()) {
      const url = String(onResolveAudioUrl(assetKey) || "").trim();
      if (!url) continue;
      const audio = new Audio();
      const player = {
        assetKey,
        audio,
        errored: false,
        handlers: null,
        pendingSeekSec: null,
        pendingPlay: false,
      };
      const onError = () => {
        player.errored = true;
      };
      const onReady = () => {
        if (player.errored) return;
        if (player.pendingSeekSec != null) {
          const applied = applyTrackPlayerSeek(player, player.pendingSeekSec);
          if (!applied) return;
        }
        if (player.pendingPlay && audio.paused) {
          try {
            const result = audio.play();
            if (result && typeof result.catch === "function") {
              result.catch(() => {
                player.lastPlayBlockedAt = Date.now();
              });
            }
          } catch {
            player.lastPlayBlockedAt = Date.now();
          }
        }
      };
      player.handlers = { onError, onReady };
      audio.preload = "metadata";
      audio.addEventListener("error", onError);
      audio.addEventListener("loadedmetadata", onReady);
      audio.addEventListener("canplay", onReady);
      audio.src = url;
      try {
        audio.load();
      } catch {}
      playersByAssetKey.set(assetKey, player);
    }
    if (!playersByAssetKey.size) continue;
    const entry = {
      playersByAssetKey,
      defaultAssetKey:
        (defaultAssetKey && playersByAssetKey.has(defaultAssetKey))
          ? defaultAssetKey
          : String(playersByAssetKey.keys().next().value || ""),
      activeClipId: "",
      activeAssetKey: "",
    };
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
  state.trackRows = Array.isArray(trackLayout.rows) ? trackLayout.rows : [];

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
    const locked = isTrackLocked(state, trackName);
    const rowTop = row.rowTop;
    const rowBottom = row.rowBottom;
    const rowHeight = Math.max(8, Number(row.rowHeight || (rowBottom - rowTop) || ROW_HEIGHT));
    const activeEdit = state.clipEditSession;
    const activePreview = activeEdit
      ? getPreviewClipEdit(state, activeEdit.clipId, activeEdit.trackName)
      : null;
    const activeEditTrack = String(activePreview?.trackName || activeEdit?.trackName || "").trim();
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
    ctx.fillRect(LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    if (activeEditTrack && activeEditTrack === trackName) {
      ctx.fillStyle = "rgba(118, 150, 198, 0.12)";
      ctx.fillRect(LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    }
    const dropzoneHoverFromResourceDrag = Boolean(
      trackKind === "dropzone" &&
      state.dropTarget &&
      Boolean(state.dropTarget.insertMode) &&
      String(state.dropTarget.trackName || "").trim() === trackName
    );
    const dropzoneHoverFromClipMove = Boolean(
      trackKind === "dropzone" &&
      activeEdit &&
      String(activeEdit.mode || "").trim().toLowerCase() === "move" &&
      Boolean(activeEdit.liveInsertMode) &&
      String(activeEdit.liveInsertTrackName || "").trim() === trackName
    );
    if (dropzoneHoverFromResourceDrag || dropzoneHoverFromClipMove) {
      const laneX = LEFT_GUTTER + 8;
      const laneY = rowTop + 4;
      const laneW = Math.max(10, timelineWidth - 16);
      const laneH = Math.max(10, rowHeight - 8);
      const grad = ctx.createLinearGradient(laneX, laneY, laneX, laneY + laneH);
      grad.addColorStop(0, "rgba(132, 102, 72, 0.16)");
      grad.addColorStop(1, "rgba(108, 84, 60, 0.10)");
      ctx.fillStyle = grad;
      ctx.fillRect(laneX, laneY, laneW, laneH);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(104, 76, 49, 0.88)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(laneX + 0.5, laneY + 0.5, Math.max(1, laneW - 1), Math.max(1, laneH - 1));
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (locked) {
      ctx.fillStyle = "rgba(96, 117, 148, 0.12)";
      ctx.fillRect(LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    }
    ctx.fillStyle = i % 2 === 0 ? "#e8d9c7" : "#e3d3c1";
    ctx.fillRect(0, rowTop, LEFT_GUTTER, rowHeight - 1);
    if (
      state.dropTarget &&
      !Boolean(state.dropTarget.insertMode) &&
      String(state.dropTarget.trackName || "") === trackName
    ) {
      const dropX = clamp(toX(Number(state.dropTarget.timeSec || 0)), LEFT_GUTTER, width);
      const ghostDuration = Math.max(0.25, Number(state.dropTarget.durationSec || 1));
      const ghostWidth = clamp(ghostDuration * state.pxPerSec, 16, Math.max(16, timelineWidth * 0.6));
      const ghostX = clamp(dropX, LEFT_GUTTER, Math.max(LEFT_GUTTER, width - ghostWidth));
      const ghostTop = rowTop + 6;
      const ghostHeight = Math.max(12, rowHeight - 12);
      const ghostLabel = `${compactText(trackName, 14)} @ ${formatTimelineTimeLabel(Number(state.dropTarget.timeSec || 0), chooseRulerStepSec(state.pxPerSec))}`;

      ctx.fillStyle = "rgba(121, 97, 70, 0.2)";
      ctx.fillRect(LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);

      const ghostGrad = ctx.createLinearGradient(ghostX, ghostTop, ghostX, ghostTop + ghostHeight);
      ghostGrad.addColorStop(0, "rgba(198, 168, 131, 0.42)");
      ghostGrad.addColorStop(1, "rgba(141, 109, 76, 0.26)");
      ctx.save();
      ctx.shadowColor = "rgba(57, 40, 25, 0.38)";
      ctx.shadowBlur = 7;
      ctx.fillStyle = ghostGrad;
      ctx.fillRect(ghostX + 1, ghostTop + 1, Math.max(1, ghostWidth - 2), Math.max(1, ghostHeight - 2));
      ctx.restore();

      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(90, 65, 41, 0.95)";
      ctx.strokeRect(ghostX + 0.75, ghostTop + 0.75, Math.max(1, ghostWidth - 1.5), Math.max(1, ghostHeight - 1.5));
      ctx.setLineDash([]);

      const labelPadX = 5;
      const labelHeight = 12;
      ctx.font = "9px monospace";
      const labelWidth = Math.ceil(ctx.measureText(ghostLabel).width) + labelPadX * 2;
      const labelX = clamp(ghostX + 3, LEFT_GUTTER + 1, Math.max(LEFT_GUTTER + 1, width - labelWidth - 1));
      const labelY = clamp(ghostTop + 2, rowTop + 1, Math.max(rowTop + 1, rowBottom - labelHeight - 2));
      ctx.fillStyle = "rgba(79, 58, 39, 0.95)";
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = "rgba(226, 205, 176, 0.72)";
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, Math.max(1, labelWidth - 1), Math.max(1, labelHeight - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.fillText(ghostLabel, labelX + labelPadX, labelY + 9);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(69, 52, 37, 0.95)";
      ctx.beginPath();
      ctx.moveTo(dropX + 0.5, rowTop + 2);
      ctx.lineTo(dropX + 0.5, rowBottom - 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    const events = Array.isArray(studioData?.eventsByTrack?.[track?.name]) ? studioData.eventsByTrack[track.name] : [];
    const explicitResourceClips = events.some((event) => {
      const resourceId = String(event?.resourceId || "").trim();
      const clipId = String(event?.clipId || "").trim();
      const src = String(event?.previewSrc || event?.src || "").trim();
      if (trackKind === "video" || trackKind === "image") {
        return Boolean(resourceId || src);
      }
      // Composition studio can project audio events from resource instances (linked video audio, etc.).
      // Treat those as explicit clips too so clip-id based live preview/edit sync applies deterministically.
      if (trackKind === "audio") {
        return Boolean(resourceId || clipId);
      }
      return false;
    });
    const hasSource = String(track?.source || "").trim().length > 0;
    const isCompositionEmptyLane =
      !explicitResourceClips &&
      events.length === 0 &&
      !hasSource &&
      (trackKind === "video" || trackKind === "image" || trackKind === "audio" || trackKind === "dropzone");

    const muteBtnW = 16;
    const muteBtnH = 14;
    const muteBtnX = LEFT_GUTTER - muteBtnW - 6;
    const muteBtnY = rowTop + 5;
    if (!isCompositionEmptyLane) {
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
      if (trackKind === "audio") {
        const channelMode = resolveEffectiveChannelMode(state, track);
        const chanBtnW = 16;
        const chanBtnH = 14;
        const chanBtnX = muteBtnX;
        const chanBtnY = muteBtnY + muteBtnH + 3;
        ctx.fillStyle = channelMode === "mono" ? "rgba(76, 108, 150, 0.88)" : "rgba(91, 118, 86, 0.88)";
        ctx.fillRect(chanBtnX, chanBtnY, chanBtnW, chanBtnH);
        ctx.strokeStyle = "rgba(53, 43, 34, 0.72)";
        ctx.strokeRect(chanBtnX + 0.5, chanBtnY + 0.5, chanBtnW - 1, chanBtnH - 1);
        ctx.fillStyle = "#f8efe2";
        ctx.font = "9px monospace";
        ctx.fillText(channelMode === "mono" ? "1" : "2", chanBtnX + 5, chanBtnY + 10);
        state.hitRegions.push({
          x0: chanBtnX,
          y0: chanBtnY,
          x1: chanBtnX + chanBtnW,
          y1: chanBtnY + chanBtnH,
          payload: { type: "track_channel_toggle", track_name: trackName },
        });
      }
    }

    if (!isCompositionEmptyLane) {
      ctx.fillStyle = muted ? "rgba(63, 51, 40, 0.54)" : "#3f3328";
      ctx.font = "10px monospace";
      ctx.fillText(compactText(trackName, 18), 8, rowTop + 14);
      ctx.fillStyle = muted ? "rgba(109, 90, 72, 0.55)" : "#6d5a48";
      const channelMode = resolveEffectiveChannelMode(state, track);
      const modeText = channelMode === "stereo" ? "stereo L/R" : (channelMode === "mono" ? "mono" : "");
      const infoTextBase = modeText
        ? `${track?.kind || "track"} ${modeText} · ${track?.events || 0}`
        : `${track?.kind || "track"} · ${track?.events || 0}`;
      const infoText = locked ? `${infoTextBase} · LOCK` : infoTextBase;
      ctx.fillText(infoText, 8, rowTop + 28);
    }

    const clipClampMaxSec = state.allowDurationExtend
      ? TIMELINE_EDIT_MAX_DURATION_SEC
      : state.durationSec;
    let clips = explicitResourceClips
      ? buildExplicitResourceClips(events, clipClampMaxSec, trackKind)
      : buildTrackClips(events, state.durationSec, secPerBar);
    if (isCompositionEmptyLane) clips = [];
    // Stems/mix are full-length assets; when events are sparse, keep clip geometry aligned to full timeline.
    const preserveEventDuration = Boolean(track?.preserveEventDuration);
    if (
      !explicitResourceClips &&
      trackKind === "audio" &&
      !preserveEventDuration &&
      hasSource &&
      Number.isFinite(state.durationSec) &&
      state.durationSec > 0.05
    ) {
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
    if (!explicitResourceClips && (trackKind === "fx" || trackKind === "project") && Number.isFinite(state.durationSec) && state.durationSec > 0.05) {
      // FX/project are projections of the full arrangement; keep visual span aligned with song duration.
      clips = [{ start: 0, end: state.durationSec, label: trackKind, notesCount: 0 }];
    }
    if (!explicitResourceClips && trackKind === "midi") {
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
    const projectedClips = clips
      .map((clip, clipIndex) => {
        const clippedStart = clamp(Number(clip?.start || 0), 0, clipClampMaxSec);
        const rawEnd = Math.max(clippedStart + CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || clippedStart + CLIP_EDIT_MIN_DURATION_SEC));
        const clippedEnd = clamp(rawEnd, clippedStart + CLIP_EDIT_MIN_DURATION_SEC, clipClampMaxSec);
        const clipId = getClipId(clip, `${trackName}_${clipIndex}_${clippedStart.toFixed(4)}`);
        const resourceId = String(clip?.resourceId || "").trim();
        return {
          ...clip,
          clipId,
          resourceId: resourceId || null,
          trackName,
          trackKind: trackKind || "",
          start: clippedStart,
          end: clippedEnd,
        };
      })
      .map((clip) => applyPreviewClipGeometry(state, clip, trackName))
      .filter((clip) => clip && clip.end > clip.start + 0.0005);
    const injectedPreviewClips = collectPreviewInjectedClipsForTrack(state, trackName, trackKind, clipClampMaxSec)
      .filter((clip) => clip && clip.end > clip.start + 0.0005);
    clips = projectedClips
      .concat(injectedPreviewClips)
      .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    ctx.clip();
    if (isCompositionEmptyLane && clips.length === 0) {
      const padX = 10;
      const laneX = LEFT_GUTTER + padX;
      const laneY = rowTop + 6;
      const laneW = Math.max(18, timelineWidth - padX * 2);
      const laneH = Math.max(18, rowHeight - 12);
      ctx.strokeStyle = muted ? "rgba(107, 92, 74, 0.22)" : "rgba(107, 92, 74, 0.38)";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(laneX + 0.5, laneY + 0.5, laneW - 1, laneH - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = muted ? "rgba(86, 71, 56, 0.42)" : "rgba(86, 71, 56, 0.72)";
      ctx.font = "11px monospace";
      const laneLabel = "Drop ressource here";
      const labelWidth = Math.ceil(ctx.measureText(laneLabel).width);
      const labelX = laneX + Math.max(8, Math.round((laneW - labelWidth) * 0.5));
      const labelY = laneY + Math.round(laneH * 0.5) + 4;
      ctx.fillText(laneLabel, labelX, labelY);
    }
    const primarySelectionKey = resolvePrimaryClipSelectionKey(state);
    const selectedClipCount = resolveEffectiveSelectedClipCount(state);
    const hasSelectionFocus = selectedClipCount > 0;
    const selectedClipKeySet = state.selectedClipKeys instanceof Set ? state.selectedClipKeys : null;
    let previousTrackClip = null;
    let clipPaintIndex = 0;
    for (const clip of clips) {
      if (clip.end < visibleStartSec || clip.start > visibleEndSec) continue;
      const x0 = toX(clip.start);
      const x1 = toX(clip.end);
      const widthPx = Math.max(2, x1 - x0);
      const previousTrack = i > 0 ? trackLayout.rows[i - 1]?.track : null;
      const nextTrack = i + 1 < trackLayout.rows.length ? trackLayout.rows[i + 1]?.track : null;
      const linkedWithPrev = areVideoAudioTracksLinked(track, previousTrack);
      const linkedWithNext = areVideoAudioTracksLinked(track, nextTrack);
      const clipTopInset = linkedWithPrev ? 0 : 5;
      const clipBottomInset = linkedWithNext ? 0 : 5;
      const clipBoxY = rowTop + clipTopInset;
      const clipBoxH = Math.max(4, rowHeight - clipTopInset - clipBottomInset);
      const clipBoxBottom = clipBoxY + clipBoxH;
      const clipId = getClipId(clip, `${trackName}_${clip.start.toFixed(4)}`);
      const clipSelectionKey = makeClipSelectionKey(trackName, clipId);
      const isInSelectedSet = Boolean(clipSelectionKey && selectedClipKeySet?.has(clipSelectionKey));
      const isPrimarySelected = Boolean(primarySelectionKey && clipSelectionKey === primarySelectionKey);
      const isSelected = isPrimarySelected || isInSelectedSet;
      const isGroupedSelected = isSelected && selectedClipCount > 1;
      const skeletonMode = Boolean(state.skeletonMode);
      if (skeletonMode) {
        const shade = clipPaintIndex % 2 === 0 ? "rgba(138, 151, 168, 0.22)" : "rgba(120, 136, 154, 0.2)";
        const shadeSelected = isPrimarySelected ? "rgba(100, 128, 160, 0.36)" : "rgba(112, 140, 172, 0.3)";
        ctx.fillStyle = isSelected ? shadeSelected : shade;
        ctx.globalAlpha = muted ? 0.24 : 1;
        ctx.fillRect(x0, clipBoxY, widthPx, clipBoxH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isSelected
          ? (isPrimarySelected ? "rgba(55, 78, 106, 0.96)" : "rgba(70, 92, 120, 0.88)")
          : "rgba(86, 96, 108, 0.86)";
        ctx.lineWidth = isSelected ? 1.6 : 1.1;
        ctx.strokeRect(x0 + 0.5, clipBoxY + 0.5, Math.max(1, widthPx - 1), Math.max(1, clipBoxH - 1));
        if (widthPx >= 18 && clipBoxH >= 12) {
          ctx.save();
          ctx.strokeStyle = "rgba(88, 101, 116, 0.42)";
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 3]);
          const centerY = clipBoxY + Math.floor(clipBoxH * 0.5) + 0.5;
          ctx.beginPath();
          ctx.moveTo(x0 + 3, centerY);
          ctx.lineTo(x0 + widthPx - 3, centerY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        const labelSafeInset = resolveClipHandleSafeInset(widthPx, 4);
        const textW = Math.max(0, widthPx - labelSafeInset * 2 - 2);
        if (textW >= 16) {
          const clipDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || 0) - Number(clip?.start || 0));
          const sourceDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.sourceDurationSec || clipDurationSec));
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 + labelSafeInset, clipBoxY + 1, textW, Math.max(8, clipBoxH - 2));
          ctx.clip();
          ctx.fillStyle = muted ? "rgba(68, 62, 58, 0.58)" : "rgba(56, 50, 47, 0.86)";
          ctx.font = "9px monospace";
          const titleChars = Math.max(4, Math.floor(textW / 5.6));
          ctx.fillText(compactText(clip.label, titleChars), x0 + labelSafeInset, clipBoxY + 12);
          if (clipBoxH >= 26) {
            const info = `${clipDurationSec.toFixed(2)}s / src ${sourceDurationSec.toFixed(2)}s`;
            const infoChars = Math.max(6, Math.floor(textW / 5.2));
            ctx.globalAlpha = muted ? 0.6 : 0.9;
            ctx.fillText(compactText(info, infoChars), x0 + labelSafeInset, clipBoxY + 23);
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = resolveAlternatingClipFill(trackKind, trackName || String(i), clipPaintIndex);
        // Keep non-selected clips visually stable while dragging/selecting.
        // Only selected/grabbed clips should change style.
        const baseAlpha = muted ? 0.2 : (isSelected ? 0.86 : 0.72);
        ctx.globalAlpha = baseAlpha;
        ctx.fillRect(x0, clipBoxY, widthPx, clipBoxH);
        ctx.globalAlpha = muted ? 0.55 : 1;
        ctx.strokeStyle = resolveAlternatingClipStroke(trackKind, trackName || String(i), clipPaintIndex, isSelected);
        ctx.strokeRect(x0 + 0.5, clipBoxY + 0.5, Math.max(1, widthPx - 1), Math.max(1, clipBoxH - 1));
      }
      if (isSelected && !muted) {
        const accent = isGroupedSelected ? "rgba(96, 130, 192, 0.94)" : "rgba(54, 98, 176, 0.98)";
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = isPrimarySelected ? 2.2 : 1.6;
        if (isGroupedSelected && !isPrimarySelected) {
          ctx.setLineDash([4, 3]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.strokeRect(x0 + 1, clipBoxY + 1, Math.max(1, widthPx - 2), Math.max(1, clipBoxH - 2));
        ctx.setLineDash([]);
        if (widthPx >= 72 && clipBoxH >= 20) {
          const badgeText = isGroupedSelected
            ? (isPrimarySelected ? `FOCUS ${selectedClipCount}` : `GROUP ${selectedClipCount}`)
            : "SOLO";
          ctx.font = "8px monospace";
          const badgePadX = 4;
          const badgePadY = 2;
          const badgeW = Math.ceil(ctx.measureText(badgeText).width) + badgePadX * 2;
          const badgeH = 11;
          const badgeX = Math.max(x0 + 2, x0 + widthPx - badgeW - 3);
          const badgeY = clipBoxY + 3;
          ctx.fillStyle = isGroupedSelected ? "rgba(214, 223, 244, 0.94)" : "rgba(198, 216, 246, 0.96)";
          ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
          ctx.strokeStyle = "rgba(56, 84, 136, 0.72)";
          ctx.lineWidth = 1;
          ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1);
          ctx.fillStyle = "rgba(44, 58, 88, 0.96)";
          ctx.fillText(badgeText, badgeX + badgePadX, badgeY + badgeH - badgePadY - 1);
        }
        ctx.restore();
      }
      if (!muted && !skeletonMode) {
        drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight, {
          clipTopInset,
          clipBottomInset,
          selected: isSelected,
        });
      }
      if (!skeletonMode) {
        drawClipEditOverlay(state, ctx, clipBoxY, clipBoxBottom, clip, x0, widthPx);
        ctx.fillStyle = muted ? "rgba(32, 22, 14, 0.54)" : "#20160e";
        ctx.font = "9px monospace";
        const labelSafeInset = resolveClipHandleSafeInset(widthPx, 4);
        const labelWidthPx = Math.max(0, widthPx - labelSafeInset * 2 - 2);
        if (labelWidthPx > 8) {
          const clipDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || 0) - Number(clip?.start || 0));
          const clipSourceDurationSec = Math.max(
            CLIP_EDIT_MIN_DURATION_SEC,
            Number(clip?.sourceDurationSec || clipDurationSec)
          );
          const approxChars = Math.max(4, Math.floor(labelWidthPx / 5.6));
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 + labelSafeInset, clipBoxY + 1, labelWidthPx, Math.max(8, clipBoxH - 2));
          ctx.clip();
          ctx.fillText(compactText(clip.label, approxChars), x0 + labelSafeInset, clipBoxY + 13);
          if (trackKind === "video" && clipBoxH >= 34 && labelWidthPx >= 52) {
            const durationText = `${clipDurationSec.toFixed(2)}s / src ${clipSourceDurationSec.toFixed(2)}s`;
            const detailsChars = Math.max(6, Math.floor(labelWidthPx / 5.2));
            ctx.globalAlpha = muted ? 0.55 : 0.92;
            ctx.fillText(compactText(durationText, detailsChars), x0 + labelSafeInset, clipBoxY + 25);
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
      }
      const supportsClipEdit = Boolean(
        clip.resourceId && (trackKind === "video" || trackKind === "image")
      );
      const windowRect = supportsClipEdit && trackKind === "video"
        ? drawClipSourceWindowControl(ctx, clip, x0, clipBoxY, widthPx, clipBoxH, {
            muted,
            selected: isSelected,
          })
        : null;
      const handleRect = supportsClipEdit
        ? drawClipHandles(ctx, x0, clipBoxY, widthPx, clipBoxH, {
            muted,
            selected: isSelected,
          })
        : null;
      state.hitRegions.push({
        x0: Math.max(LEFT_GUTTER, x0),
        y0: clipBoxY,
        x1: Math.min(width, x0 + widthPx),
        y1: clipBoxBottom,
        payload: {
          type: "clip",
          id: clipId,
          clip_id: clipId,
          resource_id: clip.resourceId || "",
          track_name: trackName,
          track_kind: trackKind,
          name: clip.label,
          t0_sec: clip.start,
          t1_sec: clip.end,
          row_top: rowTop,
          row_bottom: rowBottom,
          duration_sec: Math.max(CLIP_EDIT_MIN_DURATION_SEC, clip.end - clip.start),
          link_group_id: String(clip?.linkGroupId || ""),
          start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
          source_duration_sec: Math.max(
            CLIP_EDIT_MIN_DURATION_SEC,
            Number(clip?.sourceDurationSec || (clip.end - clip.start) || CLIP_EDIT_MIN_DURATION_SEC)
          ),
          notes_count: clip.notesCount || 0,
          origin_step_index: resolveTrackStepIndex(track),
          asset: String(track?.source || ""),
          clip_selection_key: clipSelectionKey,
        },
      });
      if (handleRect && supportsClipEdit) {
        state.hitRegions.push({
          x0: Math.max(LEFT_GUTTER, handleRect.leftX),
          y0: handleRect.y0,
          x1: Math.min(width, handleRect.leftX + handleRect.w),
          y1: handleRect.y1,
          payload: {
            type: "clip_trim_start",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
          },
        });
        state.hitRegions.push({
          x0: Math.max(LEFT_GUTTER, handleRect.rightX),
          y0: handleRect.y0,
          x1: Math.min(width, handleRect.rightX + handleRect.w),
          y1: handleRect.y1,
          payload: {
            type: "clip_trim_end",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
          },
        });
      }
      if (windowRect && supportsClipEdit) {
        state.hitRegions.push({
          x0: Math.max(LEFT_GUTTER, windowRect.railHitX0),
          y0: windowRect.y0,
          x1: Math.min(width, windowRect.railHitX1),
          y1: windowRect.y1,
          payload: {
            type: "clip_window_rail",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
            rail_x0: Number(windowRect.railX),
            rail_x1: Number(windowRect.railX + windowRect.railW),
            knob_w: Number(windowRect.knobW),
          },
        });
        state.hitRegions.push({
          x0: Math.max(LEFT_GUTTER, windowRect.knobX0),
          y0: windowRect.y0,
          x1: Math.min(width, windowRect.knobX1),
          y1: windowRect.y1,
          payload: {
            type: "clip_window",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
          },
        });
      }

      if (
        trackKind === "video" &&
        previousTrackClip &&
        canJoinAdjacentClips(previousTrackClip, {
          ...clip,
          clipId,
          trackName,
          trackKind,
        })
      ) {
        const joinTimeSec = (Number(previousTrackClip.end || 0) + Number(clip.start || 0)) * 0.5;
        const joinX = toX(joinTimeSec);
        const joinPad = 7;
        const y0 = clipBoxY + 6;
        const y1 = clipBoxBottom - 6;
        if (joinX >= LEFT_GUTTER - joinPad && joinX <= width + joinPad && y1 > y0 + 2) {
          state.hitRegions.push({
            x0: Math.max(LEFT_GUTTER, joinX - joinPad),
            y0,
            x1: Math.min(width, joinX + joinPad),
            y1,
            payload: {
              type: "clip_join",
              track_name: trackName,
              track_kind: trackKind,
              left_clip_id: String(previousTrackClip.clipId || ""),
              left_resource_id: String(previousTrackClip.resourceId || ""),
              left_t0_sec: Number(previousTrackClip.start || 0),
              left_t1_sec: Number(previousTrackClip.end || 0),
              left_start_offset_sec: Math.max(0, Number(previousTrackClip.startOffsetSec || 0)),
              left_source_duration_sec: Math.max(
                CLIP_EDIT_MIN_DURATION_SEC,
                Number(previousTrackClip.sourceDurationSec || (previousTrackClip.end - previousTrackClip.start) || CLIP_EDIT_MIN_DURATION_SEC)
              ),
              right_clip_id: String(clipId || ""),
              right_resource_id: String(clip.resourceId || ""),
              right_t0_sec: Number(clip.start || 0),
              right_t1_sec: Number(clip.end || 0),
              right_start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
              right_source_duration_sec: Math.max(
                CLIP_EDIT_MIN_DURATION_SEC,
                Number(clip?.sourceDurationSec || (clip.end - clip.start) || CLIP_EDIT_MIN_DURATION_SEC)
              ),
              join_time_sec: joinTimeSec,
            },
          });
        }
      }
      previousTrackClip = {
        ...clip,
        clipId,
        trackName,
        trackKind,
      };
      clipPaintIndex += 1;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    }
  }

  if (state.dropTarget && Boolean(state.dropTarget.insertMode)) {
    const rows = Array.isArray(state.trackRows) ? state.trackRows : [];
    const rawInsertIndex = Number(state.dropTarget.insertIndex);
    const hasRows = rows.length >= 2;
    if (hasRows && Number.isFinite(rawInsertIndex)) {
      const insertIndex = clamp(Math.round(rawInsertIndex), 1, rows.length - 1);
      const upper = rows[insertIndex - 1];
      const lower = rows[insertIndex];
      if (upper && lower) {
        const markerY = Math.round((Number(upper.rowBottom || 0) + Number(lower.rowTop || 0)) * 0.5);
        ctx.save();
        ctx.setLineDash([8, 4]);
        ctx.strokeStyle = "rgba(90, 65, 41, 0.96)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(LEFT_GUTTER + 2, markerY + 0.5);
        ctx.lineTo(width - 2, markerY + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(79, 58, 39, 0.96)";
        const markerLabel = "insert new track";
        ctx.font = "9px monospace";
        const padX = 5;
        const markerW = Math.ceil(ctx.measureText(markerLabel).width) + padX * 2;
        const markerX = clamp(LEFT_GUTTER + 6, LEFT_GUTTER + 2, Math.max(LEFT_GUTTER + 2, width - markerW - 2));
        const markerTop = clamp(markerY - 16, RULER_HEIGHT + 2, Math.max(RULER_HEIGHT + 2, markerY - 12));
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
      ? Math.max(RULER_HEIGHT, Number(state.cutPreview.rowTop))
      : RULER_HEIGHT;
    const cutBottom = Number.isFinite(Number(state.cutPreview.rowBottom))
      ? Math.max(cutTop + 8, Number(state.cutPreview.rowBottom))
      : height;
    if (cutX >= LEFT_GUTTER - 2 && cutX <= width + 2) {
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
      const labelX = clamp(cutX - labelW / 2, LEFT_GUTTER + 2, Math.max(LEFT_GUTTER + 2, width - labelW - 2));
      const labelY = clamp(cutTop + 4, RULER_HEIGHT + 2, Math.max(RULER_HEIGHT + 2, cutBottom - 16));
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
  if (playheadX >= LEFT_GUTTER - 2 && playheadX <= width + 2) {
    ctx.strokeStyle = "rgba(26, 21, 16, 0.88)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }

  const hasMidiSynth = Boolean(state.midiTrackNodes && state.midiTrackNodes.size);
  const scrubAudioReady =
    Boolean(state.scrubAudioBuffer) &&
    !Boolean(state.scrubBufferSwapPending) &&
    String(state.scrubActiveSourceUrl || "").trim() === String(state.scrubSourceUrl || "").trim();
  const modeLabel = state.scrubbing
    ? scrubAudioReady
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
    if (typeof state.updatePlayPauseButton === "function") state.updatePlayPauseButton();
    state.playPauseBtn.classList.toggle("alt", state.isPlaying);
  }
  state.statusLabel.textContent = `${state.isPlaying ? "Playing" : "Stopped"} · ${state.playheadSec.toFixed(2)}s · ${modeLabel}`;
  renderFooter(state);
  if (typeof state.onPlaybackUpdate === "function") {
    const hasUnmutedMidi = hasUnmutedMidiTracks(state);
    const hasTrackAudio = hasTrackAudioPlayback(state, { unmutedOnly: true });
    const hasMixAudio =
      Boolean(state.audioSource) &&
      !state.audioErrored &&
      !isMixTrackMuted(state);
    try {
      state.onPlaybackUpdate({
        playheadSec: state.playheadSec,
        durationSec: state.durationSec,
        isPlaying: state.isPlaying,
        modeLabel,
        isScrubbing: Boolean(state.scrubbing),
        mutedTracks: Array.from(state.mutedTracks || []),
        hasTrackAudioPlayback: hasTrackAudio,
        hasMixAudioPlayback: hasMixAudio,
        hasUnmutedMidi,
        hasAudibleTimelineAudio: Boolean(hasTrackAudio || hasMixAudio || hasUnmutedMidi),
        previewClipEdits: serializePreviewClipEdits(state),
      });
    } catch {}
  }
  emitTimelineViewState(state);
}

function seek(state, timeSec) {
  state.playheadSec = clamp(timeSec, 0, state.durationSec);
  if (state.audio && state.audioSource) {
    try {
      state.audio.currentTime = state.playheadSec;
    } catch {}
  }
  syncTrackAudioPlayersToPlayhead(state, { play: false, forceSeek: true });
  draw(state);
}

function startPlayback(state) {
  if (state.isPlaying) return;
  stopScrubGrains(state);
  state.isPlaying = true;
  state.lastFrameTs = null;
  void startMidiPlayback(state);
  if (hasTrackAudioPlayback(state, { unmutedOnly: true })) {
    // Do not prime here: async prime play/pause can race with active playback
    // and cause silent windows when starting from middle timeline positions.
    syncTrackAudioMuteVolumes(state);
    syncTrackAudioPlayersToPlayhead(state, { play: true, forceSeek: true });
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
    if (hasTrackAudioPlayback(state)) {
      syncTrackAudioPlayersToPlayhead(state, { play: state.isPlaying, forceSeek: false });
    }
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
  syncTrackAudioPlayersToPlayhead(state, { play: false, forceSeek: false });
  if (resetPlayhead) state.playheadSec = 0;
  if (resetPlayhead && state.audio && state.audioSource) {
    try {
      state.audio.currentTime = 0;
    } catch {}
  }
  if (resetPlayhead) syncTrackAudioPlayersToPlayhead(state, { play: false, forceSeek: true });
  draw(state);
}

function hitTest(state, x, y) {
  for (let i = state.hitRegions.length - 1; i >= 0; i -= 1) {
    const region = state.hitRegions[i];
    if (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1) return region.payload;
  }
  return null;
}

function resolveTrackContextFromPoint(state, x, y, hit = null) {
  const payload = hit && typeof hit === "object" ? hit : hitTest(state, x, y);
  const payloadTrackName = String(payload?.track_name || "").trim();
  const payloadTrackKind = String(payload?.track_kind || "").trim().toLowerCase();
  if (payloadTrackName) {
    const selectedClipIds = collectSelectedClipIdsForTrack(state, payloadTrackName);
    const focusClipId = String(payload?.clip_id || "").trim();
    if (focusClipId && !selectedClipIds.includes(focusClipId)) selectedClipIds.push(focusClipId);
    return {
      trackName: payloadTrackName,
      trackKind: payloadTrackKind,
      selectedClipIds,
      selectedClipCount: selectedClipIds.length,
      focusClipId,
      focusResourceId: String(payload?.resource_id || "").trim(),
      focusLinkGroupId: String(payload?.link_group_id || "").trim(),
      locked: isTrackLocked(state, payloadTrackName),
    };
  }
  const rows = Array.isArray(state?.trackRows) ? state.trackRows : [];
  const row = rows.find((entry) => y >= Number(entry?.rowTop || 0) && y <= Number(entry?.rowBottom || 0));
  if (!row || !row.track) return null;
  const rowTrackName = String(row.track?.name || "").trim();
  if (!rowTrackName) return null;
  const selectedClipIds = collectSelectedClipIdsForTrack(state, rowTrackName);
  return {
    trackName: rowTrackName,
    trackKind: String(row.track?.kind || "").trim().toLowerCase(),
    selectedClipIds,
    selectedClipCount: selectedClipIds.length,
    focusClipId: "",
    focusResourceId: "",
    focusLinkGroupId: "",
    locked: isTrackLocked(state, rowTrackName),
  };
}

function closeTrackContextMenu(state) {
  const menuState = state?.trackContextMenu;
  if (!menuState) return;
  try {
    document.removeEventListener("pointerdown", menuState.onPointerDownCapture, true);
    document.removeEventListener("keydown", menuState.onKeyDownCapture, true);
    window.removeEventListener("blur", menuState.onWindowBlur);
  } catch {}
  try {
    menuState.root?.remove?.();
  } catch {}
  state.trackContextMenu = null;
}

function openTrackContextMenu(state, clientX, clientY, context) {
  closeTrackContextMenu(state);
  const trackName = String(context?.trackName || "").trim();
  if (!trackName) return;
  const trackKind = String(context?.trackKind || "").trim().toLowerCase();
  const selectedClipIds = Array.isArray(context?.selectedClipIds) ? context.selectedClipIds : [];
  const selectedClipCount = Math.max(0, Number(context?.selectedClipCount || selectedClipIds.length || 0));
  const focusClipId = String(context?.focusClipId || "").trim();
  const focusResourceId = String(context?.focusResourceId || "").trim();
  const focusLinkGroupId = String(context?.focusLinkGroupId || "").trim();
  const locked = Boolean(context?.locked);
  const selectableClipCount = selectedClipCount > 0 ? selectedClipCount : (focusClipId ? 1 : 0);
  const root = el("div", {
    class: "lemouf-song2daw-track-context-menu",
    role: "menu",
    "aria-label": "Track context menu",
  });
  root.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  root.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  root.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const title = el("div", {
    class: "lemouf-song2daw-track-context-menu-title",
    text: compactText(trackName, 30),
  });
  const createMenuItem = ({ action, text, disabled = false, disabledReason = "" }) => {
    const button = el("button", {
      class: "lemouf-song2daw-track-context-menu-item",
      type: "button",
      text,
      role: "menuitem",
      disabled: Boolean(disabled),
      title: disabled && disabledReason ? String(disabledReason) : "",
    });
    if (disabled) button.classList.add("is-disabled");
    button.addEventListener("click", () => {
      if (disabled) return;
      closeTrackContextMenu(state);
      const accepted = typeof state.onTrackContextAction === "function"
        ? Boolean(
          state.onTrackContextAction({
            action,
            trackName,
            trackKind,
            selectedClipIds: selectedClipIds.length
              ? selectedClipIds
              : (focusClipId ? [focusClipId] : []),
            focusClipId,
            focusResourceId,
            focusLinkGroupId,
            locked: isTrackLocked(state, trackName),
          })
        )
        : false;
      if (accepted && action === "toggle_lock_lane") {
        if (!state.lockedTracks) state.lockedTracks = new Set();
        if (state.lockedTracks.has(trackName)) state.lockedTracks.delete(trackName);
        else state.lockedTracks.add(trackName);
      }
      if (accepted && action === "delete_selected_clips") {
        clearClipSelectionSet(state);
      }
      if (accepted && action === "duplicate_selected_clips") {
        clearClipSelectionSet(state);
      }
      if (accepted && action === "clear_composition") {
        clearClipSelectionSet(state);
      }
      draw(state);
      if (accepted) renderOverview(state);
    });
    return button;
  };
  const deleteLabel = selectableClipCount > 0
    ? `Delete selected clips (${selectableClipCount})`
    : "Delete selected clips";
  const deleteBtn = createMenuItem({
    action: "delete_selected_clips",
    text: deleteLabel,
    disabled: locked || selectableClipCount <= 0,
    disabledReason: locked
      ? "Lane is locked"
      : "Select a clip (or right click directly on a clip) to enable this action",
  });
  const duplicateSelectedLabel = selectableClipCount > 0
    ? `Duplicate selected clips (${selectableClipCount})`
    : "Duplicate selected clips";
  const duplicateSelectedBtn = createMenuItem({
    action: "duplicate_selected_clips",
    text: duplicateSelectedLabel,
    disabled: locked || selectableClipCount <= 0,
    disabledReason: locked
      ? "Lane is locked"
      : "Select a clip (or right click directly on a clip) to enable this action",
  });
  const duplicateBtn = createMenuItem({
    action: "duplicate_lane",
    text: "Duplicate lane",
  });
  const lockBtn = createMenuItem({
    action: "toggle_lock_lane",
    text: locked ? "Unlock lane" : "Lock lane",
  });
  const clearBtn = createMenuItem({
    action: "clear_composition",
    text: "Clear composition",
  });
  root.append(title, deleteBtn, duplicateSelectedBtn, duplicateBtn, lockBtn, clearBtn);
  document.body.appendChild(root);

  const padding = 8;
  const menuW = Math.max(1, root.offsetWidth || 220);
  const menuH = Math.max(1, root.offsetHeight || 74);
  const maxX = Math.max(padding, window.innerWidth - menuW - padding);
  const maxY = Math.max(padding, window.innerHeight - menuH - padding);
  const left = clamp(Number(clientX || 0), padding, maxX);
  const top = clamp(Number(clientY || 0), padding, maxY);
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;

  const onPointerDownCapture = (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    if (Array.isArray(path) && path.includes(root)) return;
    if (root.contains(event.target)) return;
    closeTrackContextMenu(state);
  };
  const onKeyDownCapture = (event) => {
    if (String(event?.key || "") === "Escape") {
      event.preventDefault();
      closeTrackContextMenu(state);
    }
  };
  const onWindowBlur = () => {
    closeTrackContextMenu(state);
  };
  document.addEventListener("pointerdown", onPointerDownCapture, true);
  document.addEventListener("keydown", onKeyDownCapture, true);
  window.addEventListener("blur", onWindowBlur);
  state.trackContextMenu = {
    root,
    onPointerDownCapture,
    onKeyDownCapture,
    onWindowBlur,
  };
}

function fitToViewport(state, { drawAfter = true } = {}) {
  const timelineWidth = Math.max(1, state.canvas.clientWidth - LEFT_GUTTER);
  const maxTimeSec = Math.max(1e-6, getTimelineMaxTimeSec(state, { includePreview: true }));
  state.pxPerSec = clamp(timelineWidth / maxTimeSec, getMinPxPerSec(state), MAX_PX_PER_SEC);
  state.t0Sec = 0;
  if (drawAfter) draw(state);
}

function getMinPxPerSec(state) {
  const timelineWidth = Math.max(1, Number(state?.canvas?.clientWidth || 0) - LEFT_GUTTER);
  const durationSec = Math.max(1e-6, getTimelineMaxTimeSec(state, { includePreview: true }));
  const dynamicMin = (timelineWidth * MIN_SONG_WIDTH_RATIO) / durationSec;
  return Math.max(MIN_PX_PER_SEC_HARD, dynamicMin);
}

function clampTimelineOffsetSec(state, valueSec) {
  const timelineWidth = Math.max(1, state.canvas.clientWidth - LEFT_GUTTER);
  const visibleSec = timelineWidth / Math.max(1e-6, state.pxPerSec);
  const maxT0 = Math.max(0, getTimelineMaxTimeSec(state, { includePreview: true }) - visibleSec);
  return clamp(Number(valueSec || 0), 0, maxT0);
}

function refreshTimelineViewAfterDurationChange(state) {
  if (!state) return;
  if (state.autoFit) {
    fitToViewport(state, { drawAfter: false });
    return;
  }
  state.pxPerSec = clamp(Number(state.pxPerSec || 0), getMinPxPerSec(state), MAX_PX_PER_SEC);
  state.t0Sec = clampTimelineOffsetSec(state, state.t0Sec);
}

export function clearSong2DawTimeline(body) {
  const state = TIMELINE_STATE.get(body);
  if (!state) return;
  closeTrackContextMenu(state);
  body.classList.remove("lemouf-song2daw-studio-body-compact");
  if (state.canvas) state.canvas.style.cursor = "";
  stopPlayback(state);
  stopScrubGrains(state);
  clearTrackAudioPlayers(state);
  state.mutePaintActive = false;
  state.mutePaintPointerId = null;
  state.mutePaintVisited = new Set();
  state.clipEditSession = null;
  state.cutPreview = null;
  state.joinPreview = null;
  state.boxSelection = null;
  if (state.selectedClipKeys instanceof Set) state.selectedClipKeys.clear();
  if (state.previewClipEdits) state.previewClipEdits.clear();
  if (state.clipThumbCache && state.ownsClipThumbCache) state.clipThumbCache.clear();
  if (state.keydownHandler) {
    window.removeEventListener("keydown", state.keydownHandler);
  }
  if (state.keyupHandler) {
    window.removeEventListener("keyup", state.keyupHandler);
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
  state.scrubActiveSourceUrl = "";
  state.scrubBufferSwapPending = false;
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
  allowDurationExtend = false,
  dropTargetMode = "relaxed",
  previewQualityHint = "auto",
  externalClipThumbCache = null,
  initialViewState = null,
  onViewStateChange = null,
  onJumpToStep,
  onOpenRunDir,
  onResolveAudioUrl,
  onDropResource,
  onClipEdit,
  onClipCut,
  onClipTrim,
  onClipJoin,
  onTrackContextAction,
  onUndo,
  onRedo,
  onPlaybackUpdate,
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

  const playPauseBtn = el("button", { class: "lemouf-loop-btn icon", type: "button" });
  const stopBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const undoBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const redoBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const clearStudioBtn = el("button", { class: "lemouf-loop-btn debug icon", type: "button" });
  setButtonIcon(playPauseBtn, { icon: "play", title: "Play" });
  setButtonIcon(stopBtn, { icon: "stop", title: "Stop" });
  setButtonIcon(undoBtn, { icon: "undo", title: "Undo (Ctrl+Z)" });
  setButtonIcon(redoBtn, { icon: "redo", title: "Redo (Ctrl+Y)" });
  setButtonIcon(clearStudioBtn, { icon: "clear_resources", title: "Clear studio (empty project)" });
  controls.append(playPauseBtn, stopBtn, undoBtn, redoBtn, clearStudioBtn);

  const fitBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const snapBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  setButtonIcon(fitBtn, { icon: "fit", title: "Fit timeline to viewport" });
  setButtonIcon(snapBtn, { icon: "snap_on", title: "Snap enabled" });
  const sectionVizSelect = el("select", { class: "lemouf-loop-select lemouf-song2daw-viz-select" });
  sectionVizSelect.append(
    el("option", { value: "bands", text: "Viz: Bands" }),
    el("option", { value: "filled", text: "Viz: Filled" }),
    el("option", { value: "peaks", text: "Viz: Peaks" }),
    el("option", { value: "line", text: "Viz: Line" }),
    el("option", { value: "dots", text: "Viz: Dots" })
  );
  const jumpBtn = el("button", { class: "lemouf-loop-btn alt", text: "Step", type: "button" });
  jumpBtn.style.display = "none";
  nav.append(fitBtn, snapBtn, sectionVizSelect, jumpBtn);
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
  const shortcutsGroup = el("div", { class: "lemouf-song2daw-studio-footer-group lemouf-song2daw-studio-footer-shortcuts-wrap" });
  const shortcutsLabel = el("span", { class: "lemouf-song2daw-studio-footer-shortcuts", text: "" });
  shortcutsGroup.append(shortcutsLabel);
  const footerActions = el("div", { class: "lemouf-song2daw-studio-footer-actions" });
  const zoomGroup = el("div", { class: "lemouf-song2daw-studio-footer-group" });
  const zoomLabel = el("span", { class: "lemouf-song2daw-studio-footer-zoom", text: "zoom n/a" });
  const zoomResetBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const skeletonModeBtn = el("button", { class: "lemouf-loop-btn debug icon", type: "button" });
  setButtonIcon(zoomResetBtn, { icon: "zoom_reset", title: "Reset temporal zoom" });
  setButtonIcon(skeletonModeBtn, { icon: "skeleton_mode", title: "Enable skeleton mode (debug)" });
  zoomGroup.append(zoomLabel, zoomResetBtn, skeletonModeBtn);
  footerActions.append(zoomGroup);
  footer.append(shortcutsGroup, footerActions);
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
  const initialLockedTracks = new Set(
    (Array.isArray(studioData?.tracks) ? studioData.tracks : [])
      .filter((track) => Boolean(track?.locked))
      .map((track) => String(track?.name || "").trim())
      .filter(Boolean)
  );
  const state = {
    runData,
    studioData,
    canvas,
    ctx,
    overviewLabel,
    playPauseBtn,
    jumpBtn,
    snapBtn,
    statusLabel,
    zoomLabel,
    shortcutsLabel,
    shortcutsSignature: "",
    zoomResetBtn,
    skeletonModeBtn,
    onJumpToStep,
    onOpenRunDir,
    onDropResource,
    onClipEdit,
    onClipCut,
    onClipTrim,
    onClipJoin,
    onTrackContextAction,
    onUndo,
    onRedo,
    onResolveAudioUrl: typeof onResolveAudioUrl === "function" ? onResolveAudioUrl : null,
    onPlaybackUpdate,
    onViewStateChange: typeof onViewStateChange === "function" ? onViewStateChange : null,
    lastViewStateKey: "",
    updatePlayPauseButton: null,
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
    selectedClipKeys: new Set(),
    resizeObserver: null,
    autoFit: true,
    sectionHeight: normalizeSectionHeight(localStorage.getItem(SECTION_HEIGHT_STORAGE_KEY)),
    compactMode,
    allowDurationExtend: Boolean(allowDurationExtend),
    dropTargetMode: String(dropTargetMode || "relaxed").trim().toLowerCase() === "strict" ? "strict" : "relaxed",
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
    scrubActiveSourceUrl: "",
    scrubBufferSwapPending: false,
    scrubDecodePromise: null,
    scrubDecodeUrl: "",
    pendingTrackPointer: null,
    mutedTracks: new Set(),
    lockedTracks: initialLockedTracks,
    trackChannelModeOverrides: new Map(),
    mutePaintActive: false,
    mutePaintPointerId: null,
    mutePaintTargetMuted: false,
    mutePaintVisited: new Set(),
    sectionVizMode: normalizeSectionVizMode(localStorage.getItem(SECTION_VIZ_STORAGE_KEY)),
    skeletonMode: normalizeSkeletonMode(localStorage.getItem(SKELETON_MODE_STORAGE_KEY)),
    snapEnabled: normalizeSnapEnabled(localStorage.getItem(TIMELINE_SNAP_STORAGE_KEY)),
    trackRowScale: normalizeTrackRowScale(localStorage.getItem(TRACK_ROW_SCALE_STORAGE_KEY)),
    videoPreviewMode: normalizeVideoPreviewMode(localStorage.getItem(VIDEO_PREVIEW_MODE_STORAGE_KEY)),
    previewQualityHint: normalizeVideoPreviewQualityHint(previewQualityHint),
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
    trackRows: [],
    dropTarget: null,
    dropHint: null,
    previewClipEdits: new Map(),
    clipEditSession: null,
    boxSelection: null,
    joinPreview: null,
    clipThumbCache: externalClipThumbCache instanceof Map ? externalClipThumbCache : new Map(),
    ownsClipThumbCache: !(externalClipThumbCache instanceof Map),
    cutPreview: null,
    keyupHandler: null,
    keyModifiers: { ctrl: false, shift: false, alt: false },
    trackContextMenu: null,
  };

  const hasInitialViewState =
    initialViewState &&
    typeof initialViewState === "object" &&
    Number.isFinite(Number(initialViewState.pxPerSec)) &&
    Number(initialViewState.pxPerSec) > 0;
  if (hasInitialViewState) {
    state.autoFit = Boolean(initialViewState.autoFit);
    state.pxPerSec = Math.max(0.0001, Number(initialViewState.pxPerSec));
    state.t0Sec = Math.max(0, Number(initialViewState.t0Sec || 0));
    state.scrollY = Math.max(0, Number(initialViewState.scrollY || 0));
    if (typeof initialViewState.skeletonMode !== "undefined") {
      state.skeletonMode = normalizeSkeletonMode(initialViewState.skeletonMode);
    }
    if (Number.isFinite(Number(initialViewState.trackRowScale))) {
      state.trackRowScale = normalizeTrackRowScale(Number(initialViewState.trackRowScale));
    }
  }

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
    syncTrackAudioPlayersToPlayhead(state, { play: state.isPlaying, forceSeek: false });
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
    syncTrackAudioPlayersToPlayhead(state, { play: state.isPlaying, forceSeek: false });
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

  const beginClipEdit = (event, hit, pointerCanvasX = null) => {
    const clipId = String(hit?.clip_id || hit?.id || "").trim();
    const resourceId = String(hit?.resource_id || "").trim();
    const trackName = String(hit?.track_name || "").trim();
    const linkGroupId = String(hit?.link_group_id || "").trim();
    if (!clipId || !resourceId || !trackName) return false;
    const hitType = String(hit?.type || "");
    const mode = hitType === "clip_trim_start"
      ? "trim_start"
      : (hitType === "clip_trim_end"
        ? "trim_end"
        : ((hitType === "clip_window" || hitType === "clip_window_rail") ? "slip" : "move"));
    const trackKind = String(hit?.track_kind || "").toLowerCase();
    if (trackKind !== "video" && trackKind !== "image" && trackKind !== "audio") return false;
    if (isTrackLocked(state, trackName)) return false;
    const clipAlreadySelected = isClipSelectedInSet(state, trackName, clipId);
    if (mode === "move" && !clipAlreadySelected) clearClipSelectionSet(state);
    const maxDurationSec = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
    const start = clamp(Number(hit?.t0_sec || 0), 0, maxDurationSec);
    const end = clamp(
      Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(hit?.t1_sec || start + CLIP_EDIT_MIN_DURATION_SEC)),
      start + CLIP_EDIT_MIN_DURATION_SEC,
      maxDurationSec
    );
    let groupMembers = [];
    let groupMoveBounds = null;
    if (mode === "move" && hitType === "clip") {
      groupMembers = collectMultiSelectedMoveMembers(state, hit)
        .map((member) => ({
          ...member,
          previewTargets: collectLinkedClipTargets(state, {
            clipId: member.clipId,
            resourceId: member.resourceId,
            linkGroupId: member.linkGroupId,
            fallbackTrackName: member.trackName,
            fallbackTrackKind: member.trackKind,
          }),
        }));
      if (groupMembers.length > 1) {
        const maxTimelineSec = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
        groupMoveBounds = resolveGroupMoveDeltaBounds(state, groupMembers, maxTimelineSec);
      } else {
        groupMembers = [];
      }
    }
    state.clipEditSession = {
      pointerId: event.pointerId,
      mode,
      clipId,
      resourceId,
      trackName,
      trackKind,
      start,
      end,
      sourceDurationSec: Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(hit?.source_duration_sec || (end - start) || CLIP_EDIT_MIN_DURATION_SEC)
      ),
      startOffsetSec: Math.max(0, Number(hit?.start_offset_sec || 0)),
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      pointerOffsetSec: 0,
      linkGroupId,
      groupMembers,
      groupMoveBounds,
      groupDeltaSec: 0,
      liveStartSec: start,
      liveEndSec: end,
      liveTrackName: trackName,
      liveInsertMode: false,
      liveInsertIndex: null,
      liveInsertTrackName: "",
      liveStartOffsetSec: Math.max(0, Number(hit?.start_offset_sec || 0)),
      previewTargets: collectLinkedClipTargets(state, {
        clipId,
        resourceId,
        linkGroupId,
        fallbackTrackName: trackName,
        fallbackTrackKind: trackKind,
      }),
    };
    {
      const pointerX = Number.isFinite(Number(pointerCanvasX))
        ? Number(pointerCanvasX)
        : (() => {
            const rect = canvas.getBoundingClientRect();
            return event.clientX - rect.left;
          })();
      const clipStartX = LEFT_GUTTER + (start - state.t0Sec) * state.pxPerSec;
      const offsetSec = (pointerX - clipStartX) / Math.max(1e-6, state.pxPerSec);
      state.clipEditSession.pointerOffsetSec = clamp(
        Number.isFinite(offsetSec) ? offsetSec : 0,
        0,
        Math.max(CLIP_EDIT_MIN_DURATION_SEC, end - start)
      );
    }
    if (mode === "slip" && hitType === "clip_window_rail") {
      const clipDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, end - start);
      const jumpedOffsetSec = resolveSlipOffsetFromRailHit(
        hit,
        Number(pointerCanvasX),
        Number(state.clipEditSession.sourceDurationSec || clipDurationSec),
        clipDurationSec
      );
      if (jumpedOffsetSec != null) {
        state.clipEditSession.startOffsetSec = Math.max(0, Number(jumpedOffsetSec || 0));
      }
    }
    state.autoFit = false;
    writePreviewClipEdits(state, state.clipEditSession, {
      start,
      end,
      trackName,
      startOffsetSec: Math.max(0, Number(state.clipEditSession.startOffsetSec || 0)),
      sourceDurationSec: Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(state.clipEditSession.sourceDurationSec || (end - start) || CLIP_EDIT_MIN_DURATION_SEC)
      ),
    });
    state.selection = {
      ...(hit || {}),
      type: "clip",
      clip_id: clipId,
      resource_id: resourceId,
      track_name: trackName,
      t0_sec: start,
      t1_sec: end,
      name: String(hit?.name || "clip"),
    };
    state.pendingTrackPointer = null;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    canvas.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
    draw(state);
    renderOverview(state);
    return true;
  };

  const updateClipEdit = (event) => {
    const session = state.clipEditSession;
    if (!session) return false;
    if (session.pointerId !== null && event.pointerId !== session.pointerId) return false;
    const deltaSec = (event.clientX - session.pointerStartX) / Math.max(1e-6, state.pxPerSec);
    let nextTrackName = session.trackName;
    let nextStart = session.start;
    let nextEnd = session.end;
    let nextStartOffsetSec = Math.max(0, Number(session.startOffsetSec || 0));
    session.liveInsertMode = false;
    session.liveInsertIndex = null;
    session.liveInsertTrackName = "";
    const sourceDurationSec = Math.max(
      CLIP_EDIT_MIN_DURATION_SEC,
      Number(session.sourceDurationSec || (session.end - session.start) || CLIP_EDIT_MIN_DURATION_SEC)
    );
    const sessionStartOffsetSec = Math.max(0, Number(session.startOffsetSec || 0));
    if (session.mode === "move") {
      const moveDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const maxStart = state.allowDurationExtend
        ? Math.max(0, TIMELINE_EDIT_MAX_DURATION_SEC - duration)
        : Math.max(0, state.durationSec - duration);
      const rect = canvas.getBoundingClientRect();
      const pointerCanvasX = event.clientX - rect.left;
      const rawStartFromPointer = state.t0Sec + (pointerCanvasX - LEFT_GUTTER) / Math.max(1e-6, state.pxPerSec) - Math.max(0, Number(session.pointerOffsetSec || 0));
      const rawStart = clamp(rawStartFromPointer, 0, maxStart);
      const boundarySnapSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      const x = pointerCanvasX;
      const y = event.clientY - rect.top;
      const groupMembers = Array.isArray(session.groupMembers) ? session.groupMembers : [];
      if (groupMembers.length > 1) {
        let snappedAnchorStart = snapTimeSec(state, rawStart, {
          trackName: session.trackName,
          excludeClipId: session.clipId,
        });
        if (isNearTimelineOrigin(state, rawStart, x)) snappedAnchorStart = 0;
        if (rawStart >= maxStart - boundarySnapSec) snappedAnchorStart = maxStart;
        let delta = snappedAnchorStart - session.start;
        const maxTimelineSec = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
        const bounds = session.groupMoveBounds || resolveGroupMoveDeltaBounds(state, groupMembers, maxTimelineSec);
        const minDelta = Number.isFinite(Number(bounds?.minDelta)) ? Number(bounds.minDelta) : 0;
        const maxDelta = Number.isFinite(Number(bounds?.maxDelta)) ? Number(bounds.maxDelta) : 0;
        delta = clamp(delta, minDelta, maxDelta);
        session.groupDeltaSec = delta;
        const maxTimelineForMembers = state.allowDurationExtend
          ? TIMELINE_EDIT_MAX_DURATION_SEC
          : Math.max(0, Number(state.durationSec || 0));
        const nearZeroSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
        for (const member of groupMembers) {
          const memberBaseStart = Math.max(0, Number(member?.start || 0));
          const memberDuration = Math.max(
            CLIP_EDIT_MIN_DURATION_SEC,
            Number(member?.end || 0) - memberBaseStart
          );
          const maxMemberStart = Math.max(0, maxTimelineForMembers - memberDuration);
          let memberStart = clamp(memberBaseStart + delta, 0, maxMemberStart);
          if (memberStart <= nearZeroSec) memberStart = 0;
          const memberEnd = memberStart + memberDuration;
          const memberSession = {
            ...session,
            clipId: String(member?.clipId || ""),
            resourceId: String(member?.resourceId || ""),
            trackName: String(member?.trackName || ""),
            trackKind: String(member?.trackKind || ""),
            linkGroupId: String(member?.linkGroupId || ""),
            start: Math.max(0, Number(member?.start || 0)),
            end: Math.max(
              Math.max(0, Number(member?.start || 0)) + CLIP_EDIT_MIN_DURATION_SEC,
              Number(member?.end || 0)
            ),
            startOffsetSec: Math.max(0, Number(member?.startOffsetSec || 0)),
            sourceDurationSec: Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(member?.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)),
            previewTargets: Array.isArray(member?.previewTargets) ? member.previewTargets : [],
          };
          writePreviewClipEdits(state, memberSession, {
            start: memberStart,
            end: memberEnd,
            trackName: memberSession.trackName,
            startOffsetSec: memberSession.startOffsetSec,
            sourceDurationSec: memberSession.sourceDurationSec,
          });
        }
        nextTrackName = session.trackName;
        nextStart = Math.max(0, session.start + delta);
        nextEnd = Math.max(nextStart + CLIP_EDIT_MIN_DURATION_SEC, session.end + delta);
      } else {
        let moveInsertMode = false;
        let moveInsertIndex = null;
        const target = resolveDropTargetFromPoint(state, x, y, session.trackKind);
        if (target?.trackName) {
          nextTrackName = String(target.trackName || nextTrackName);
          const canonical = canonicalizeTargetTrackForResource(
            nextTrackName,
            String(target?.trackKind || ""),
            session.trackKind
          );
          nextTrackName = canonical.trackName || nextTrackName;
        }
        const rawInsertTrackName = String(target?.trackName || "").trim();
        if (Boolean(target?.insertMode) && Number.isFinite(Number(target?.insertIndex))) {
          moveInsertMode = true;
          moveInsertIndex = Math.max(0, Math.round(Number(target.insertIndex)));
        }
        if (moveInsertMode) {
          // Insert-mode targets can be dropzones. For live move preview, we need
          // a concrete future lane name (not the dropzone row), otherwise linked
          // audio mapping can drift and appear detached during drag.
          const desiredMoveKind = String(session.trackKind || "").trim().toLowerCase();
          if (desiredMoveKind === "video" || desiredMoveKind === "image") {
            const knownSameKindTracks = getTrackNamesByKind(state, desiredMoveKind);
            const previewInsertTrack = createNextTrackLaneName(desiredMoveKind, knownSameKindTracks);
            if (previewInsertTrack) {
              nextTrackName = previewInsertTrack;
            }
          }
        }
        nextStart = snapTimeSec(state, rawStart, {
          trackName: nextTrackName,
          excludeClipId: session.clipId,
        });
        nextStart = clamp(nextStart, 0, maxStart);
        if (isNearTimelineOrigin(state, rawStart, x)) nextStart = 0;
        if (rawStart >= maxStart - boundarySnapSec) nextStart = maxStart;
        nextEnd = nextStart + duration;
        if (!moveInsertMode) {
          const laneTrackName = resolveNonOverlappingTrackName(state, {
            preferredTrackName: nextTrackName,
            trackKind: session.trackKind,
            startSec: nextStart,
            endSec: nextEnd,
            excludeClipId: session.clipId,
          });
          if (laneTrackName && laneTrackName !== nextTrackName) {
            nextTrackName = laneTrackName;
            const canonicalLane = canonicalizeTargetTrackForResource(
              nextTrackName,
              session.trackKind,
              session.trackKind
            );
            nextTrackName = canonicalLane.trackName || nextTrackName;
            nextStart = snapTimeSec(state, nextStart, {
              trackName: nextTrackName,
              excludeClipId: session.clipId,
            });
            nextStart = clamp(nextStart, 0, maxStart);
            if (isNearTimelineOrigin(state, rawStart, x)) nextStart = 0;
            if (rawStart >= maxStart - boundarySnapSec) nextStart = maxStart;
            nextEnd = nextStart + duration;
          }
        }
        const maxTimelineSec = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
        const moveBounds = resolveMoveDeltaBoundsForClip(state, {
          trackName: nextTrackName,
          clipStartSec: session.start,
          clipEndSec: session.end,
          excludeClipId: session.clipId,
          maxTimelineSec,
        });
        const boundedMinStartRaw = session.start + Number(moveBounds?.minDelta || 0);
        const boundedMaxStart = session.start + Number(moveBounds?.maxDelta || 0);
        const nearZeroSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
        // Avoid microscopic positive minima near timeline origin (precision artifacts),
        // which produce a visible "shrink then restore" effect during move preview.
        const boundedMinStart = boundedMinStartRaw <= nearZeroSec + CLIP_EDIT_TIME_EPS_SEC
          ? 0
          : boundedMinStartRaw;
        nextStart = clamp(nextStart, boundedMinStart, boundedMaxStart);
        // Strong magnetic snap at timeline origin for move operations.
        if (
          isNearTimelineOrigin(state, rawStart, x) &&
          boundedMinStart <= nearZeroSec + CLIP_EDIT_TIME_EPS_SEC
        ) {
          nextStart = 0;
        }
        // If pointer reached left timeline edge and there is no real left bound,
        // force exact origin snap to avoid zoom-dependent drift.
        if (
          pointerCanvasX <= LEFT_GUTTER + CLIP_EDIT_SNAP_PX &&
          boundedMinStart <= nearZeroSec + CLIP_EDIT_TIME_EPS_SEC
        ) {
          nextStart = 0;
        }
        if (rawStart <= nearZeroSec && boundedMinStart <= nearZeroSec + CLIP_EDIT_TIME_EPS_SEC) {
          nextStart = 0;
        }
        if (Math.abs(nextStart) <= CLIP_EDIT_TIME_EPS_SEC) nextStart = 0;
        nextEnd = nextStart + moveDurationSec;
        // Move is a pure translation: never trim duration implicitly.
        session.liveInsertMode = moveInsertMode;
        session.liveInsertIndex = moveInsertMode ? moveInsertIndex : null;
        session.liveInsertTrackName = moveInsertMode ? rawInsertTrackName : "";
      }
    } else if (session.mode === "trim_start") {
      const minStartByOffset = Math.max(0, session.start - sessionStartOffsetSec);
      const rawStart = clamp(
        session.start + deltaSec,
        minStartByOffset,
        session.end - CLIP_EDIT_MIN_DURATION_SEC
      );
      const trackBounds = collectTrackNeighborBounds(state, {
        trackName: session.trackName,
        clipStartSec: session.start,
        clipEndSec: session.end,
        excludeClipId: session.clipId,
      });
      const boundedMinStart = Math.max(minStartByOffset, Number(trackBounds?.leftBoundSec || 0));
      const boundarySnapSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      nextStart = snapTimeSec(state, rawStart, {
        trackName: session.trackName,
        excludeClipId: session.clipId,
      });
      if (rawStart <= boundarySnapSec && boundedMinStart <= boundarySnapSec) nextStart = boundedMinStart;
      nextStart = clamp(nextStart, boundedMinStart, session.end - CLIP_EDIT_MIN_DURATION_SEC);
      const deltaStartSec = nextStart - session.start;
      nextStartOffsetSec = Math.max(0, sessionStartOffsetSec + deltaStartSec);
      const maxDurationBySource = Math.max(CLIP_EDIT_MIN_DURATION_SEC, sourceDurationSec - nextStartOffsetSec);
      const nextDuration = session.end - nextStart;
      if (nextDuration > maxDurationBySource) {
        nextStart = session.end - maxDurationBySource;
        nextStart = clamp(nextStart, boundedMinStart, session.end - CLIP_EDIT_MIN_DURATION_SEC);
      }
    } else if (session.mode === "trim_end") {
      const maxEnd = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
      const maxEndBySource = session.start + Math.max(CLIP_EDIT_MIN_DURATION_SEC, sourceDurationSec - sessionStartOffsetSec);
      const trackBounds = collectTrackNeighborBounds(state, {
        trackName: session.trackName,
        clipStartSec: session.start,
        clipEndSec: session.end,
        excludeClipId: session.clipId,
      });
      const maxTrimEnd = Math.min(maxEnd, maxEndBySource, Number(trackBounds?.rightBoundSec || Number.POSITIVE_INFINITY));
      const rawEnd = clamp(session.end + deltaSec, session.start + CLIP_EDIT_MIN_DURATION_SEC, maxEnd);
      const boundarySnapSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      nextEnd = snapTimeSec(state, rawEnd, {
        trackName: session.trackName,
        excludeClipId: session.clipId,
        maxTimeSec: maxEnd,
      });
      if (!state.allowDurationExtend && rawEnd >= state.durationSec - boundarySnapSec) nextEnd = state.durationSec;
      if (rawEnd >= maxTrimEnd - boundarySnapSec) nextEnd = maxTrimEnd;
      nextEnd = clamp(nextEnd, session.start + CLIP_EDIT_MIN_DURATION_SEC, maxTrimEnd);
    } else if (session.mode === "slip") {
      const clipDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const maxOffsetSec = Math.max(0, sourceDurationSec - clipDurationSec);
      const rawOffsetSec = sessionStartOffsetSec + deltaSec;
      nextStartOffsetSec = clamp(rawOffsetSec, 0, maxOffsetSec);
      nextStart = session.start;
      nextEnd = session.end;
    }
    if (session.mode === "move") {
      // Hard invariant for move mode: pure translation only.
      const moveDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      nextStart = Math.max(0, Number(nextStart || 0));
      nextEnd = nextStart + moveDurationSec;
      nextStartOffsetSec = sessionStartOffsetSec;
    }
    session.liveStartSec = nextStart;
    session.liveEndSec = nextEnd;
    session.liveTrackName = nextTrackName;
    session.liveStartOffsetSec = nextStartOffsetSec;
    const groupMembers = Array.isArray(session.groupMembers) ? session.groupMembers : [];
    if (session.mode !== "move" || groupMembers.length <= 1) {
      writePreviewClipEdits(state, session, {
        start: nextStart,
        end: nextEnd,
        trackName: nextTrackName,
        startOffsetSec: nextStartOffsetSec,
        sourceDurationSec,
      });
    }
    state.selection = {
      ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
      type: "clip",
      clip_id: session.clipId,
      resource_id: session.resourceId,
      track_name: nextTrackName,
      t0_sec: nextStart,
      t1_sec: nextEnd,
      link_group_id: String(session.linkGroupId || ""),
    };
    draw(state);
    return true;
  };

  const finalizeClipEdit = (event, cancelled = false) => {
    const session = state.clipEditSession;
    if (!session) return false;
    if (session.pointerId !== null && event.pointerId !== session.pointerId) return false;
    state.clipEditSession = null;
    canvas.style.cursor = "";
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    const groupMembers = Array.isArray(session.groupMembers) ? session.groupMembers : [];
    const isGroupMove = session.mode === "move" && groupMembers.length > 1;
    if (cancelled) {
      if (isGroupMove) {
        for (const member of groupMembers) {
          clearPreviewClipEditsForSession(state, {
            ...session,
            clipId: String(member?.clipId || ""),
            trackName: String(member?.trackName || ""),
            previewTargets: Array.isArray(member?.previewTargets) ? member.previewTargets : [],
          });
        }
      } else {
        clearPreviewClipEditsForSession(state, session);
      }
      draw(state);
      renderOverview(state);
      return true;
    }
    if (isGroupMove) {
      for (const member of groupMembers) {
        const memberClipId = String(member?.clipId || "").trim();
        const memberResourceId = String(member?.resourceId || "").trim();
        const memberTrackName = String(member?.trackName || "").trim();
        if (!memberClipId || !memberResourceId || !memberTrackName) continue;
        const current = getPreviewClipEdit(state, memberClipId, memberTrackName) || {
          start: Math.max(0, Number(member?.start || 0)),
          end: Math.max(
            Math.max(0, Number(member?.start || 0)) + CLIP_EDIT_MIN_DURATION_SEC,
            Number(member?.end || 0)
          ),
          trackName: memberTrackName,
          startOffsetSec: Math.max(0, Number(member?.startOffsetSec || 0)),
          sourceDurationSec: Math.max(
            CLIP_EDIT_MIN_DURATION_SEC,
            Number(member?.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)
          ),
        };
        const previewStartSec = Math.max(
          0,
          Number(toFiniteNumber(current.start, toFiniteNumber(member?.start, 0)))
        );
        const previewEndSec = Math.max(
          previewStartSec + CLIP_EDIT_MIN_DURATION_SEC,
          Number(
            toFiniteNumber(
              current.end,
              toFiniteNumber(member?.end, previewStartSec + CLIP_EDIT_MIN_DURATION_SEC)
            )
          )
        );
        const payload = {
          clipId: memberClipId,
          resourceId: memberResourceId,
          linkGroupId: String(member?.linkGroupId || ""),
          trackKind: String(member?.trackKind || ""),
          trackName: String(current.trackName || memberTrackName),
          timeSec: previewStartSec,
          durationSec: Math.max(
            CLIP_EDIT_MIN_DURATION_SEC,
            previewEndSec - previewStartSec
          ),
          startOffsetSec: Math.max(
            0,
            Number(current.startOffsetSec ?? member?.startOffsetSec ?? 0)
          ),
          mode: "move",
          sourceDurationSec: Math.max(
            CLIP_EDIT_MIN_DURATION_SEC,
            Number(current.sourceDurationSec || member?.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)
          ),
        };
        const editResult = typeof state.onClipEdit === "function"
          ? state.onClipEdit(payload)
          : false;
        const resolvedEdit = resolveClipEditResult(editResult);
        const accepted = resolvedEdit.accepted;
        const committedTrackName = String(resolvedEdit.trackName || payload.trackName || "").trim() || payload.trackName;
        payload.trackName = committedTrackName;
        clearPreviewClipEditsForSession(state, {
          ...session,
          clipId: memberClipId,
          trackName: memberTrackName,
          previewTargets: Array.isArray(member?.previewTargets) ? member.previewTargets : [],
        });
        if (!accepted) continue;
        applyCommittedClipEditToLocalStudio(state, payload);
        if (memberClipId === String(session.clipId || "").trim()) {
          state.selection = {
            ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
            type: "clip",
            clip_id: memberClipId,
            resource_id: memberResourceId,
            track_name: committedTrackName,
            t0_sec: Math.max(0, Number(payload.timeSec || 0)),
            t1_sec: Math.max(
              Math.max(0, Number(payload.timeSec || 0)) + CLIP_EDIT_MIN_DURATION_SEC,
              Math.max(0, Number(payload.timeSec || 0)) + Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(payload.durationSec || CLIP_EDIT_MIN_DURATION_SEC))
            ),
            origin_step_index: Number(state.selection?.origin_step_index || 2),
          };
        }
      }
      draw(state);
      renderOverview(state);
      return true;
    }
    const current = resolveFinalPreviewClipEdit(state, session) || {
      start: session.start,
      end: session.end,
      trackName: session.trackName,
    };
    const liveStartSec = toFiniteNumber(session.liveStartSec, null);
    const liveEndSec = toFiniteNumber(session.liveEndSec, null);
    const liveTrackName = String(session.liveTrackName || "").trim();
    const liveStartOffsetSec = toFiniteNumber(session.liveStartOffsetSec, null);
    let finalStartSec = Math.max(0, Number(liveStartSec ?? current.start ?? session.start));
    let finalDurationSec = Math.max(
      CLIP_EDIT_MIN_DURATION_SEC,
      Number((liveEndSec ?? current.end ?? session.end) - finalStartSec)
    );
    let finalTrackName = String(liveTrackName || current.trackName || session.trackName);
    let finalStartOffsetSec = Math.max(
      0,
      Number(liveStartOffsetSec ?? current.startOffsetSec ?? session.startOffsetSec ?? 0)
    );
    if (String(session.mode || "").toLowerCase() === "move") {
      // For move, prefer the latest preview track (what the user saw while dragging).
      const previewTrackName = String(current?.trackName || "").trim();
      if (previewTrackName) finalTrackName = previewTrackName;
      const moveDurationSec = Math.max(CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const nearZeroSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      if (finalStartSec <= nearZeroSec + CLIP_EDIT_TIME_EPS_SEC) finalStartSec = 0;
      finalDurationSec = moveDurationSec;
      finalStartOffsetSec = Math.max(0, Number(session.startOffsetSec || 0));
    }
    const finalEndSec = finalStartSec + finalDurationSec;
    state.selection = {
      ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
      type: "clip",
      clip_id: session.clipId,
      resource_id: session.resourceId,
      track_name: finalTrackName,
      t0_sec: finalStartSec,
      t1_sec: Math.max(
        finalStartSec + CLIP_EDIT_MIN_DURATION_SEC,
        finalEndSec
      ),
      origin_step_index: Number(state.selection?.origin_step_index || 2),
    };
    const clipEditPayload = {
      clipId: session.clipId,
      resourceId: session.resourceId,
      linkGroupId: String(session.linkGroupId || ""),
      trackKind: session.trackKind,
      trackName: finalTrackName,
      timeSec: finalStartSec,
      durationSec: finalDurationSec,
      startOffsetSec: finalStartOffsetSec,
      mode: session.mode,
      insertMode: Boolean(session.liveInsertMode),
      insertIndex: Number.isFinite(Number(session.liveInsertIndex))
        ? Math.max(0, Math.round(Number(session.liveInsertIndex)))
        : undefined,
      sourceDurationSec: Math.max(
        CLIP_EDIT_MIN_DURATION_SEC,
        Number(current.sourceDurationSec || session.sourceDurationSec || CLIP_EDIT_MIN_DURATION_SEC)
      ),
    };
    const clipEditResult = typeof state.onClipEdit === "function"
      ? state.onClipEdit(clipEditPayload)
      : false;
    const resolvedClipEdit = resolveClipEditResult(clipEditResult);
    const accepted = resolvedClipEdit.accepted;
    const committedTrackName = String(resolvedClipEdit.trackName || finalTrackName || "").trim() || finalTrackName;
    clearPreviewClipEditsForSession(state, session);
    if (accepted) {
      applyCommittedClipEditToLocalStudio(state, {
        ...clipEditPayload,
        trackName: committedTrackName,
      });
      state.selection = {
        ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
        type: "clip",
        clip_id: session.clipId,
        resource_id: session.resourceId,
        track_name: committedTrackName,
        t0_sec: finalStartSec,
        t1_sec: Math.max(finalStartSec + CLIP_EDIT_MIN_DURATION_SEC, finalStartSec + finalDurationSec),
      };
      draw(state);
      renderOverview(state);
    } else {
      draw(state);
      renderOverview(state);
    }
    return true;
  };

  const beginBoxSelection = (event, x, y, { additive = false } = {}) => {
    state.boxSelection = {
      pointerId: event.pointerId,
      x0: Number(x),
      y0: Number(y),
      x1: Number(x),
      y1: Number(y),
      additive: Boolean(additive),
    };
    state.pendingTrackPointer = null;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    canvas.style.cursor = "crosshair";
    draw(state);
  };

  const updateBoxSelection = (event) => {
    if (!state.boxSelection) return false;
    const box = state.boxSelection;
    if (box.pointerId != null && event.pointerId !== box.pointerId) return false;
    const rect = canvas.getBoundingClientRect();
    box.x1 = clamp(event.clientX - rect.left, 0, canvas.clientWidth);
    box.y1 = clamp(event.clientY - rect.top, 0, canvas.clientHeight);
    draw(state);
    return true;
  };

  const finalizeBoxSelection = (event, cancelled = false) => {
    if (!state.boxSelection) return false;
    const box = state.boxSelection;
    if (box.pointerId != null && event.pointerId !== box.pointerId) return false;
    const normalized = normalizeSelectionRect(box);
    state.boxSelection = null;
    canvas.style.cursor = "";
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    if (!cancelled && normalized) {
      const hitClips = Array.isArray(state.hitRegions)
        ? state.hitRegions.filter((region) => String(region?.payload?.type || "") === "clip")
        : [];
      const selectedKeys = new Set();
      for (const region of hitClips) {
        const regionRect = normalizeSelectionRect(region);
        if (!regionRect || !isRectContained(normalized, regionRect)) continue;
        const key = String(region?.payload?.clip_selection_key || "").trim();
        if (!key) continue;
        selectedKeys.add(key);
      }
      if (!(state.selectedClipKeys instanceof Set)) state.selectedClipKeys = new Set();
      if (!box.additive) state.selectedClipKeys.clear();
      for (const key of selectedKeys) state.selectedClipKeys.add(key);
      if (selectedKeys.size > 0) {
        const firstRegion = hitClips.find((region) => {
          const key = String(region?.payload?.clip_selection_key || "").trim();
          return key && selectedKeys.has(key);
        });
        if (firstRegion?.payload) {
          state.selection = {
            ...(firstRegion.payload || {}),
            type: "clip",
          };
        }
      } else if (!box.additive) {
        state.selection = null;
      }
    }
    draw(state);
    renderOverview(state);
    return true;
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
    if (hit?.type === "track_channel_toggle") {
      const trackName = String(hit?.track_name || "").trim();
      if (!trackName) return;
      const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
      const track = tracks.find((item) => String(item?.name || "").trim() === trackName) || null;
      if (!track || String(track?.kind || "").toLowerCase() !== "audio") return;
      const currentMode = resolveEffectiveChannelMode(state, track);
      const nextMode = currentMode === "mono" ? "stereo" : "mono";
      state.trackChannelModeOverrides.set(trackName, nextMode);
      draw(state);
      renderOverview(state);
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
            refreshTimelineViewAfterDurationChange(state);
          }
        }
        state.audioReady = true;
        state.audioErrored = false;
        draw(state);
      };
      const onTimeUpdate = () => {
        if (!state.isPlaying) return;
        if (getPlaybackClockAudio(state) !== state.audio) return;
        state.playheadSec = clamp(Number(state.audio?.currentTime || 0), 0, state.durationSec);
        draw(state);
      };
      const onEnded = () => {
        if (getPlaybackClockAudio(state) !== state.audio) return;
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

  const clearDropTarget = (drawAfter = true) => {
    if (!state.dropTarget) return;
    state.dropTarget = null;
    if (drawAfter) draw(state);
  };
  const clearDropHint = (drawAfter = true) => {
    if (!state.dropHint) return;
    state.dropHint = null;
    if (drawAfter) draw(state);
  };

  const resolveAdjustedDropTarget = (target, payload, { allowCreateLane = false, pointerCanvasX = null } = {}) => {
    if (!target || !payload) return null;
    const resourceId = String(payload.resourceId || "").trim();
    const resourceKind = normalizeResourceKind(payload.resourceKind || "");
    const durationSec = findResourceDurationHintSec(
      state,
      resourceId,
      Math.max(0.25, Number(state.dropTarget?.durationSec || 1))
    );
    let trackName = String(target.trackName || "").trim();
    let targetTrackKind = String(target.trackKind || resourceKind || "").toLowerCase();
    {
      const canonical = canonicalizeTargetTrackForResource(trackName, targetTrackKind, resourceKind);
      trackName = canonical.trackName || trackName;
      targetTrackKind = canonical.trackKind || targetTrackKind;
    }
    let timeSec = Math.max(0, Number(target.timeSec || 0));
    if (resourceKind === "video" || resourceKind === "image") {
      trackName = resolveNonOverlappingTrackName(state, {
        preferredTrackName: trackName,
        trackKind: resourceKind,
        startSec: timeSec,
        endSec: timeSec + durationSec,
        allowCreateLane,
      }) || trackName;
    }
    timeSec = snapTimeSec(state, timeSec, {
      trackName,
    });
    const maxStart = state.allowDurationExtend
      ? Math.max(0, TIMELINE_EDIT_MAX_DURATION_SEC - durationSec)
      : Math.max(0, state.durationSec - durationSec);
    const boundarySnapSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
    timeSec = clamp(timeSec, 0, maxStart);
    if (isNearTimelineOrigin(state, timeSec, pointerCanvasX)) timeSec = 0;
    if (timeSec >= maxStart - boundarySnapSec) timeSec = maxStart;
    return {
      ...target,
      trackName,
      trackKind: targetTrackKind,
      timeSec,
      durationSec,
      resourceId,
      resourceKind,
    };
  };

  canvas.addEventListener("dragover", (event) => {
    if (typeof state.onDropResource !== "function") return;
    const payload = readResourceDragPayload(event.dataTransfer);
    if (!payload.resourceId) {
      clearDropTarget(false);
      clearDropHint(false);
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const target = resolveDropTargetFromPoint(state, x, y, payload.resourceKind);
    if (!target) {
      clearDropTarget();
      clearDropHint(false);
      return;
    }
    clearDropHint(false);
    const nextTarget = resolveAdjustedDropTarget(target, payload, {
      allowCreateLane: false,
      pointerCanvasX: x,
    });
    if (!nextTarget) {
      clearDropTarget();
      clearDropHint(false);
      return;
    }
    if (!sameDropTarget(state.dropTarget, nextTarget)) {
      state.dropTarget = nextTarget;
      draw(state);
    }
  });

  canvas.addEventListener("dragleave", (event) => {
    if (!state.dropTarget && !state.dropHint) return;
    const rect = canvas.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) return;
    clearDropTarget();
    clearDropHint(false);
  });

  canvas.addEventListener("drop", (event) => {
    if (typeof state.onDropResource !== "function") return;
    const payload = readResourceDragPayload(event.dataTransfer);
    if (!payload.resourceId) {
      clearDropTarget(false);
      clearDropHint(false);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const directTarget = resolveDropTargetFromPoint(state, x, y, payload.resourceKind);
    const fallbackTarget = state.dropTarget &&
      String(state.dropTarget?.resourceId || "") === String(payload.resourceId || "") &&
      isTrackDropCompatible(
        { kind: String(state.dropTarget?.trackKind || "") },
        payload.resourceKind
      ) &&
      !isTrackLocked(state, String(state.dropTarget?.trackName || "").trim())
      ? state.dropTarget
      : null;
    const target = directTarget || fallbackTarget;
    if (!target) {
      clearDropTarget();
      clearDropHint(false);
      return;
    }
    event.preventDefault();
    const finalTarget = resolveAdjustedDropTarget(target, payload, {
      allowCreateLane: true,
      pointerCanvasX: x,
    });
    clearDropTarget(false);
    clearDropHint(false);
    if (!finalTarget) {
      draw(state);
      return;
    }
    const acceptedResult = state.onDropResource({
        resourceId: payload.resourceId,
        resourceKind: finalTarget.resourceKind,
        trackName: finalTarget.trackName,
        trackKind: finalTarget.trackKind,
        timeSec: finalTarget.timeSec,
        insertMode: Boolean(finalTarget.insertMode),
        insertIndex: Number(finalTarget.insertIndex),
        rowIndex: Number(finalTarget.rowIndex),
      });
    const accepted = Boolean(acceptedResult);
    if (accepted) {
      const hintedDuration = Math.max(0, Number(state.studioData?.durationSec || 0));
      const computedDuration = Math.max(
        0,
        Number(getTimelineMaxTimeSec(state, { includePreview: true }) || 0)
      );
      const nextDuration = Math.max(1, hintedDuration, computedDuration);
      if (nextDuration > state.durationSec + 1e-6) {
        state.durationSec = nextDuration;
        refreshTimelineViewAfterDurationChange(state);
      }
      if (typeof state.onResolveAudioUrl === "function") {
        setupTrackAudioPlayers(state, state.onResolveAudioUrl);
        syncTrackAudioMuteVolumes(state);
      }
      if (state.isPlaying) {
        syncTrackAudioPlayersToPlayhead(state, { play: true, forceSeek: true });
      }
    }
    draw(state);
    if (accepted) renderOverview(state);
  });

  canvas.addEventListener("contextmenu", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitTest(state, x, y);
    if (!(event.ctrlKey || event.metaKey) || String(hit?.type || "") !== "clip") return;
    const trackKind = String(hit?.track_kind || "").toLowerCase();
    if (trackKind !== "video" && trackKind !== "image" && trackKind !== "audio") return;
    if (!toggleClipSelectionFromHit(state, hit)) return;
    state.selection = {
      ...(hit || {}),
      type: "clip",
      clip_id: String(hit?.clip_id || ""),
      resource_id: String(hit?.resource_id || ""),
      track_name: String(hit?.track_name || ""),
      t0_sec: Math.max(0, Number(hit?.t0_sec || 0)),
      t1_sec: Math.max(
        Math.max(0, Number(hit?.t0_sec || 0)) + CLIP_EDIT_MIN_DURATION_SEC,
        Number(hit?.t1_sec || 0)
      ),
    };
    draw(state);
    renderOverview(state);
  });
  canvas.addEventListener("contextmenu", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitTest(state, x, y);
    const trackContext = resolveTrackContextFromPoint(state, x, y, hit);
    if (!trackContext) return;
    event.preventDefault();
    openTrackContextMenu(state, event.clientX, event.clientY, trackContext);
  });

  canvas.addEventListener("pointerdown", (event) => {
    closeTrackContextMenu(state);
    clearDropHint(false);
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
    const hit = hitTest(state, x, y);
    if ((event.ctrlKey || event.metaKey) && !event.altKey && hit?.type === "clip") {
      if (toggleClipSelectionFromHit(state, hit)) {
        state.selection = {
          ...(hit || {}),
          type: "clip",
        };
        draw(state);
        renderOverview(state);
      }
      return;
    }
    if (
      event.ctrlKey &&
      hit?.type === "clip_join" &&
      typeof state.onClipJoin === "function"
    ) {
      if (isTrackLocked(state, String(hit?.track_name || "").trim())) return;
      const accepted = Boolean(
        state.onClipJoin({
          trackName: String(hit?.track_name || "").trim(),
          trackKind: String(hit?.track_kind || "").trim().toLowerCase(),
          leftClipId: String(hit?.left_clip_id || "").trim(),
          leftResourceId: String(hit?.left_resource_id || "").trim(),
          rightClipId: String(hit?.right_clip_id || "").trim(),
          rightResourceId: String(hit?.right_resource_id || "").trim(),
          joinTimeSec: Math.max(0, Number(hit?.join_time_sec || 0)),
        })
      );
      state.cutPreview = null;
      state.joinPreview = null;
      clearClipSelectionSet(state);
      draw(state);
      if (accepted) renderOverview(state);
      return;
    }
    if (hit?.type === "track_mute") {
      beginMutePaint(event, hit.track_name);
      return;
    }
    if (
      event.altKey &&
      hit?.type === "clip" &&
      isCuttableTrackKind(hit?.track_kind) &&
      (typeof state.onClipCut === "function" || typeof state.onClipTrim === "function")
    ) {
      if (isTrackLocked(state, String(hit?.track_name || "").trim())) return;
      const cutTimeSec = resolveCutTimeSecForHit(state, hit, x);
      if (cutTimeSec != null) {
        const payload = {
          clipId: String(hit?.clip_id || "").trim(),
          resourceId: String(hit?.resource_id || "").trim(),
          trackName: String(hit?.track_name || "").trim(),
          trackKind: String(hit?.track_kind || "").trim().toLowerCase(),
          cutTimeSec,
        };
        const trimRequested = Boolean(event.ctrlKey);
        const keepSide = resolveTrimKeepSideForHit(hit, cutTimeSec);
        const accepted = trimRequested
          ? Boolean(
              typeof state.onClipTrim === "function"
                ? state.onClipTrim({ ...payload, keepSide })
                : state.onClipCut?.(payload)
            )
          : Boolean(state.onClipCut?.(payload));
        state.cutPreview = null;
        draw(state);
        if (accepted) renderOverview(state);
        return;
      }
    }
    if (
      hit?.type === "clip_trim_start" ||
      hit?.type === "clip_trim_end" ||
      hit?.type === "clip_window" ||
      hit?.type === "clip_window_rail" ||
      hit?.type === "clip"
    ) {
      if (beginClipEdit(event, hit, x)) return;
      handleHit(hit);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && x >= LEFT_GUTTER && y >= trackAreaTop && !hit) {
      beginBoxSelection(event, x, y, { additive: true });
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
    handleHit(hit);
  });

  canvas.addEventListener("pointermove", (event) => {
    updateMutePaint(event);
    if (state.mutePaintActive) return;
    if (updateBoxSelection(event)) return;
    if (updateClipEdit(event)) return;
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
    if (
      !state.panningX &&
      !state.scrubbing &&
      !state.resizingSection &&
      !state.pendingTrackPointer &&
      (event.ctrlKey || event.altKey)
    ) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hover = hitTest(state, x, y);
      const hoverTrackName = String(hover?.track_name || "").trim();
      const hoverTrackLocked = hoverTrackName ? isTrackLocked(state, hoverTrackName) : false;
      const joinModifierDown = Boolean(event.ctrlKey);
      const cutModifierDown = Boolean(event.altKey);
      if (
        !hoverTrackLocked &&
        joinModifierDown &&
        hover?.type === "clip_join" &&
        typeof state.onClipJoin === "function"
      ) {
        const prevJoinKey = state.joinPreview
          ? `${state.joinPreview.left_clip_id}:${state.joinPreview.right_clip_id}:${Number(state.joinPreview.join_time_sec || 0).toFixed(4)}`
          : "";
        const nextJoinKey = `${String(hover?.left_clip_id || "")}:${String(hover?.right_clip_id || "")}:${Number(hover?.join_time_sec || 0).toFixed(4)}`;
        state.joinPreview = hover;
        if (state.cutPreview) state.cutPreview = null;
        canvas.style.cursor = JOIN_CURSOR;
        if (prevJoinKey !== nextJoinKey) draw(state);
      } else if (!hoverTrackLocked && cutModifierDown) {
        const previewMode = event.ctrlKey ? "trim" : "cut";
        const preview = resolveCutPreview(state, x, y, previewMode);
        const prevKey = state.cutPreview
          ? `${state.cutPreview.mode || "cut"}:${state.cutPreview.keepSide || "left"}:${state.cutPreview.clipId}:${Number(state.cutPreview.cutTimeSec || 0).toFixed(4)}`
          : "";
        const nextKey = preview
          ? `${preview.mode || "cut"}:${preview.keepSide || "left"}:${preview.clipId}:${Number(preview.cutTimeSec || 0).toFixed(4)}`
          : "";
        state.cutPreview = preview;
        if (state.joinPreview) state.joinPreview = null;
        canvas.style.cursor = preview ? SCISSORS_CURSOR : "";
        if (prevKey !== nextKey) draw(state);
      } else {
        if (state.cutPreview || state.joinPreview) {
          state.cutPreview = null;
          state.joinPreview = null;
          draw(state);
        }
      }
    } else if (state.cutPreview || state.joinPreview) {
      state.cutPreview = null;
      state.joinPreview = null;
      if (!state.panningX && !state.scrubbing && !state.resizingSection) {
        canvas.style.cursor = "";
      }
      draw(state);
    }
    if (!state.panningX && !state.scrubbing && !state.resizingSection && !state.pendingTrackPointer) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hover = hitTest(state, x, y);
      const hoverTrackName = String(hover?.track_name || "").trim();
      const hoverTrackLocked = hoverTrackName ? isTrackLocked(state, hoverTrackName) : false;
      if (hoverTrackLocked && hover?.type && hover?.type !== "track_mute" && hover?.type !== "track_channel_toggle") {
        canvas.style.cursor = "not-allowed";
      } else if (event.ctrlKey && hover?.type === "clip_join" && typeof state.onClipJoin === "function") {
        canvas.style.cursor = JOIN_CURSOR;
      } else if (event.altKey && hover?.type === "clip" && isCuttableTrackKind(hover?.track_kind)) {
        canvas.style.cursor = SCISSORS_CURSOR;
      } else if (
        hover?.type === "clip_trim_start" ||
        hover?.type === "clip_trim_end" ||
        hover?.type === "clip_window" ||
        hover?.type === "clip_window_rail"
      ) {
        canvas.style.cursor = "ew-resize";
      } else if (hover?.type === "clip") {
        canvas.style.cursor = "grab";
      } else {
        canvas.style.cursor = isPointInSectionResizeHandle(state, canvas.clientWidth, x, y) ? "ns-resize" : "";
      }
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
    if (finalizeBoxSelection(event, false)) return;
    if (finalizeClipEdit(event, false)) return;
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
    if (finalizeBoxSelection(event, true)) return;
    if (finalizeClipEdit(event, true)) return;
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
    const y = event.clientY - rect.top;
    const inTimelineArea = x >= LEFT_GUTTER;
    if (event.ctrlKey || event.metaKey) {
      if (!state.compactMode) {
        const prevScale = normalizeTrackRowScale(state.trackRowScale);
        const scaleFactor = Math.exp(-event.deltaY * 0.001);
        const nextScale = clamp(prevScale * scaleFactor, TRACK_ROW_SCALE_MIN, TRACK_ROW_SCALE_MAX);
        if (Math.abs(nextScale - prevScale) > 0.0001) {
          const sectionHeight = resolveVisibleSectionHeight(state, canvas.clientHeight);
          const trackAreaTop = RULER_HEIGHT + sectionHeight;
          const localTrackY = Math.max(0, y - trackAreaTop);
          const anchorContentY = state.scrollY + localTrackY;
          state.trackRowScale = nextScale;
          localStorage.setItem(TRACK_ROW_SCALE_STORAGE_KEY, String(nextScale));
          const ratio = nextScale / Math.max(1e-6, prevScale);
          state.scrollY = Math.max(0, anchorContentY * ratio - localTrackY);
        }
      }
    } else if (inTimelineArea && !event.shiftKey && !event.altKey) {
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
  const updateSnapButton = () => {
    if (!snapBtn) return;
    snapBtn.classList.toggle("is-active", state.snapEnabled);
    snapBtn.classList.toggle("alt", !state.snapEnabled);
    setButtonIcon(snapBtn, {
      icon: state.snapEnabled ? "snap_on" : "snap_off",
      title: state.snapEnabled ? "Snap enabled" : "Snap disabled",
    });
  };
  const updateSkeletonModeButton = () => {
    if (!skeletonModeBtn) return;
    const isOn = Boolean(state.skeletonMode);
    skeletonModeBtn.classList.toggle("is-active", isOn);
    skeletonModeBtn.setAttribute("aria-pressed", isOn ? "true" : "false");
    setButtonIcon(skeletonModeBtn, {
      icon: "skeleton_mode",
      title: isOn ? "Disable skeleton mode" : "Enable skeleton mode (debug)",
    });
  };
  const updatePlayPauseButton = () => {
    setButtonIcon(playPauseBtn, {
      icon: state.isPlaying ? "pause" : "play",
      title: state.isPlaying ? "Pause" : "Play",
    });
  };
  state.updatePlayPauseButton = updatePlayPauseButton;
  const resetTemporalZoom = () => {
    state.autoFit = true;
    fitToViewport(state, { drawAfter: false });
    draw(state);
  };
  const nudgeSelectedClip = (direction, { coarse = false } = {}) => {
    if (!(direction === -1 || direction === 1)) return false;
    if (state.clipEditSession) return false;
    const selection = state.selection && typeof state.selection === "object" ? state.selection : null;
    if (!selection || String(selection.type || "") !== "clip") return false;
    const resourceId = String(selection.resource_id || "").trim();
    const clipId = String(selection.clip_id || "").trim();
    const trackName = String(selection.track_name || "").trim();
    const trackKind = String(selection.track_kind || "").trim().toLowerCase();
    if (isTrackLocked(state, trackName)) return false;
    if (!resourceId || !trackName || (trackKind !== "video" && trackKind !== "image" && trackKind !== "audio")) return false;
    const currentStart = Math.max(0, Number(selection.t0_sec || 0));
    const currentEnd = Math.max(currentStart + CLIP_EDIT_MIN_DURATION_SEC, Number(selection.t1_sec || currentStart + CLIP_EDIT_MIN_DURATION_SEC));
    const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, currentEnd - currentStart);
    const baseStepSec = Math.max(1 / Math.max(1e-6, state.pxPerSec), 1 / 240);
    const stepSec = baseStepSec * (coarse ? 10 : 1);
    const maxStart = state.allowDurationExtend
      ? Math.max(0, TIMELINE_EDIT_MAX_DURATION_SEC - duration)
      : Math.max(0, state.durationSec - duration);
    let nextStart = clamp(currentStart + direction * stepSec, 0, maxStart);
    nextStart = snapTimeSec(state, nextStart, {
      trackName,
      excludeResourceId: resourceId,
      excludeClipId: clipId,
    });
    nextStart = clamp(nextStart, 0, maxStart);
    let nextTrackName = resolveNonOverlappingTrackName(state, {
      preferredTrackName: trackName,
      trackKind,
      startSec: nextStart,
      endSec: nextStart + duration,
      excludeResourceId: resourceId,
      excludeClipId: clipId,
    });
    if (nextTrackName && nextTrackName !== trackName) {
      nextStart = snapTimeSec(state, nextStart, {
        trackName: nextTrackName,
        excludeResourceId: resourceId,
        excludeClipId: clipId,
      });
      nextStart = clamp(nextStart, 0, maxStart);
    } else {
      nextTrackName = trackName;
    }
    const nextEnd = nextStart + duration;
    state.selection = {
      ...selection,
      track_name: nextTrackName,
      t0_sec: nextStart,
      t1_sec: nextEnd,
    };
    const nudgePayload = {
      clipId: String(selection.clip_id || ""),
      resourceId,
      linkGroupId: String(selection.link_group_id || ""),
      trackKind,
      trackName: nextTrackName,
      timeSec: nextStart,
      durationSec: duration,
      mode: "move",
    };
    const editResult = typeof state.onClipEdit === "function"
      ? state.onClipEdit(nudgePayload)
      : false;
    const resolvedEdit = resolveClipEditResult(editResult);
    const accepted = resolvedEdit.accepted;
    const committedTrackName = String(resolvedEdit.trackName || nextTrackName || "").trim() || nextTrackName;
    if (accepted) {
      applyCommittedClipEditToLocalStudio(state, {
        ...nudgePayload,
        trackName: committedTrackName,
      });
      state.selection = {
        ...selection,
        track_name: committedTrackName,
        t0_sec: nextStart,
        t1_sec: nextEnd,
      };
      draw(state);
      renderOverview(state);
    } else {
      draw(state);
      renderOverview(state);
    }
    return true;
  };
  playPauseBtn.addEventListener("click", () => togglePlayPause());
  stopBtn.addEventListener("click", () => stopPlayback(state, true));
  undoBtn.disabled = typeof state.onUndo !== "function";
  redoBtn.disabled = typeof state.onRedo !== "function";
  clearStudioBtn.disabled = typeof state.onTrackContextAction !== "function";
  undoBtn.addEventListener("click", () => {
    if (typeof state.onUndo !== "function") return;
    const accepted = Boolean(state.onUndo());
    if (accepted) renderOverview(state);
  });
  redoBtn.addEventListener("click", () => {
    if (typeof state.onRedo !== "function") return;
    const accepted = Boolean(state.onRedo());
    if (accepted) renderOverview(state);
  });
  clearStudioBtn.addEventListener("click", () => {
    if (typeof state.onTrackContextAction !== "function") return;
    const accepted = Boolean(
      state.onTrackContextAction({
        action: "clear_composition",
        trackName: "",
        trackKind: "",
        selectedClipIds: [],
        focusClipId: "",
        focusResourceId: "",
        focusLinkGroupId: "",
        locked: false,
      })
    );
    if (accepted) {
      clearClipSelectionSet(state);
      draw(state);
      renderOverview(state);
    }
  });
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
  snapBtn.addEventListener("click", () => {
    state.snapEnabled = !state.snapEnabled;
    localStorage.setItem(TIMELINE_SNAP_STORAGE_KEY, state.snapEnabled ? "1" : "0");
    updateSnapButton();
    draw(state);
  });
  skeletonModeBtn.addEventListener("click", () => {
    state.skeletonMode = !state.skeletonMode;
    localStorage.setItem(SKELETON_MODE_STORAGE_KEY, state.skeletonMode ? "1" : "0");
    updateSkeletonModeButton();
    draw(state);
  });
  updateSnapButton();
  updateSkeletonModeButton();

  const isTextLikeTarget = (target) => {
    if (!target || typeof target !== "object") return false;
    const element = target;
    if (element.isContentEditable) return true;
    const tag = String(element.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };
  state.keydownHandler = (event) => {
    if (!event) return;
    state.keyModifiers.ctrl = Boolean(event.ctrlKey);
    state.keyModifiers.shift = Boolean(event.shiftKey);
    state.keyModifiers.alt = Boolean(event.altKey);
    renderFooter(state);
    if (event.defaultPrevented) return;
    if (isTextLikeTarget(event.target)) return;
    const key = String(event.key || "");
    const isSpace = key === " " || key === "Spacebar" || String(event.code || "") === "Space";
    if (isSpace) {
      if (event.repeat) return;
      event.preventDefault();
      togglePlayPause();
      return;
    }
    const lowerKey = key.toLowerCase();
    const modifierDown = Boolean(event.ctrlKey || event.metaKey);
    if (modifierDown && !event.altKey) {
      const wantsUndo = lowerKey === "z" && !event.shiftKey;
      const wantsRedo = lowerKey === "y" || (lowerKey === "z" && event.shiftKey);
      if (wantsUndo && typeof state.onUndo === "function") {
        event.preventDefault();
        const accepted = Boolean(state.onUndo());
        if (accepted) renderOverview(state);
        return;
      }
      if (wantsRedo && typeof state.onRedo === "function") {
        event.preventDefault();
        const accepted = Boolean(state.onRedo());
        if (accepted) renderOverview(state);
        return;
      }
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      const direction = key === "ArrowRight" ? 1 : -1;
      nudgeSelectedClip(direction, { coarse: event.shiftKey });
    }
  };
  state.keyupHandler = (event) => {
    state.keyModifiers.ctrl = Boolean(event?.ctrlKey);
    state.keyModifiers.shift = Boolean(event?.shiftKey);
    state.keyModifiers.alt = Boolean(event?.altKey);
    renderFooter(state);
    const key = String(event?.key || "");
    let changed = false;
    if (key === "Alt" && state.cutPreview) {
      state.cutPreview = null;
      changed = true;
    }
    if (key === "Control" && state.joinPreview) {
      state.joinPreview = null;
      changed = true;
    }
    if (changed) {
      if (!state.panningX && !state.scrubbing && !state.resizingSection) {
        canvas.style.cursor = "";
      }
      draw(state);
    }
  };
  window.addEventListener("keydown", state.keydownHandler);
  window.addEventListener("keyup", state.keyupHandler);

  canvas.addEventListener("pointerleave", () => {
    if (!state.cutPreview && !state.joinPreview) return;
    if (state.panningX || state.scrubbing || state.resizingSection) return;
    state.cutPreview = null;
    state.joinPreview = null;
    canvas.style.cursor = "";
    draw(state);
  });

  resize();
  if (!hasInitialViewState) fitBtn.click();
  renderOverview(state);
  // Guard against first-interaction glitches when the host panel just became visible:
  // re-run size/layout once after mount and once after style settlement.
  requestAnimationFrame(() => {
    if (TIMELINE_STATE.get(body) !== state) return;
    resize();
    renderOverview(state);
  });
  setTimeout(() => {
    if (TIMELINE_STATE.get(body) !== state) return;
    resize();
    renderOverview(state);
  }, 90);
  TIMELINE_STATE.set(body, state);
}

export {
  clearSong2DawTimeline as clearStudioTimeline,
  renderSong2DawTimeline as renderStudioTimeline,
};
