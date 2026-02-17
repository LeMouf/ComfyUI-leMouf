import { el } from "../../shared/ui/dom.js";
import { setButtonIcon } from "../../shared/ui/icons.js";
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
const TIMELINE_SNAP_STORAGE_KEY = "lemoufSong2DawTimelineSnapEnabled";
const TRACK_ROW_SCALE_STORAGE_KEY = "lemoufSong2DawTrackRowScale";
const SECTION_VIZ_MODES = ["bands", "filled", "peaks"];
const RULER_TARGET_PX = 92;
const RULER_STEP_OPTIONS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const MIDI_MASTER_GAIN = 0.5;
const CLIP_EDIT_MIN_DURATION_SEC = 0.1;
const CLIP_EDIT_SNAP_PX = 10;
const TIMELINE_EDIT_MAX_DURATION_SEC = 21_600;
const TRACK_ROW_SCALE_MIN = 0.6;
const TRACK_ROW_SCALE_MAX = 2.8;
const SCISSORS_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ctext x='2' y='18' font-size='18'%3E%E2%9C%82%3C/text%3E%3C/svg%3E\") 4 16, crosshair";

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
      startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
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
  if (!kind) return true;
  const trackKind = normalizeResourceKind(track?.kind);
  if (!trackKind) return false;
  if (kind === "audio") return trackKind === "audio";
  return trackKind === kind;
}

function resolveDropTargetFromPoint(state, x, y, resourceKind = "") {
  const rows = Array.isArray(state?.trackRows) ? state.trackRows : [];
  const compatibleRows = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (!isTrackDropCompatible(row.track, resourceKind)) continue;
    const trackName = String(row.track?.name || "").trim();
    if (!trackName) continue;
    compatibleRows.push({
      row,
      trackName,
      trackKind: String(row.track?.kind || "").toLowerCase(),
    });
  }
  if (!compatibleRows.length) return null;

  // Accept drops on the label side too; use current playhead there.
  const usePlayheadTime = x < LEFT_GUTTER;
  const clampedX = clamp(
    Number(x),
    LEFT_GUTTER,
    Math.max(LEFT_GUTTER + 1, Number(state?.canvas?.clientWidth || LEFT_GUTTER + 1))
  );
  const rawTime = usePlayheadTime
    ? Number(state?.playheadSec || 0)
    : state.t0Sec + (clampedX - LEFT_GUTTER) / Math.max(1e-6, state.pxPerSec);
  const timeSec = clamp(rawTime, 0, Math.max(0, Number(state.durationSec || 0)));

  const hitRow = compatibleRows.find(({ row }) => y >= row.rowTop + 1 && y <= row.rowBottom - 1);
  if (hitRow) {
    return {
      trackName: hitRow.trackName,
      trackKind: hitRow.trackKind,
      rowTop: hitRow.row.rowTop,
      rowBottom: hitRow.row.rowBottom,
      timeSec,
    };
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
  return {
    trackName: best.trackName,
    trackKind: best.trackKind,
    rowTop: best.row.rowTop,
    rowBottom: best.row.rowBottom,
    timeSec,
  };
}

function readResourceDragPayload(dataTransfer) {
  if (!dataTransfer) return { resourceId: "", resourceKind: "" };
  const resourceId = String(
    dataTransfer.getData("application/x-lemouf-resource-id") ||
      dataTransfer.getData("text/plain") ||
      ""
  )
    .trim();
  const resourceKind = normalizeResourceKind(
    dataTransfer.getData("application/x-lemouf-resource-kind") || ""
  );
  return { resourceId, resourceKind };
}

function sameDropTarget(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (String(a.trackName || "") !== String(b.trackName || "")) return false;
  if (String(a.resourceId || "") !== String(b.resourceId || "")) return false;
  return Math.abs(Number(a.timeSec || 0) - Number(b.timeSec || 0)) < 0.02;
}

function collectTrackEventEdgesSec(state, trackName, excludeResourceId = "") {
  const name = String(trackName || "").trim();
  if (!name) return [];
  const eventsByTrack = state?.studioData?.eventsByTrack;
  const events = Array.isArray(eventsByTrack?.[name]) ? eventsByTrack[name] : [];
  const exclude = String(excludeResourceId || "").trim();
  const edges = [];
  for (const event of events) {
    const resourceId = String(event?.resourceId || "").trim();
    if (exclude && resourceId && resourceId === exclude) continue;
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

function trackHasOverlap(state, trackName, startSec, endSec, excludeResourceId = "") {
  const name = String(trackName || "").trim();
  if (!name) return false;
  const eventsByTrack = state?.studioData?.eventsByTrack;
  const events = Array.isArray(eventsByTrack?.[name]) ? eventsByTrack[name] : [];
  const exclude = String(excludeResourceId || "").trim();
  const start = Number(startSec || 0);
  const end = Number(endSec || 0);
  if (!(end > start + 1e-4)) return false;
  for (const event of events) {
    const eventResourceId = String(event?.resourceId || "").trim();
    if (exclude && eventResourceId && eventResourceId === exclude) continue;
    const eventStart = Math.max(0, Number(event?.time || 0));
    const eventEnd = Math.max(
      eventStart + CLIP_EDIT_MIN_DURATION_SEC,
      eventStart + Math.max(0, Number(event?.duration || CLIP_EDIT_MIN_DURATION_SEC))
    );
    if (intervalsOverlapSec(start, end, eventStart, eventEnd)) return true;
  }
  return false;
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
    if (!trackHasOverlap(state, trackName, startSec, endSec, excludeResourceId)) {
      return trackName;
    }
  }
  if (!allowCreateLane) return preferredTrackName || ordered[0] || "";
  return createNextTrackLaneName(trackKind, ordered);
}

function findResourceDurationHintSec(state, resourceId, fallback = 1) {
  const id = String(resourceId || "").trim();
  if (!id) return Math.max(0.25, Number(fallback || 1));
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
    : Math.max(0, Number(state?.durationSec || 0));
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
    const trackEdges = collectTrackEventEdgesSec(state, trackName, options?.excludeResourceId || "");
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

function getClipId(clip, fallback = "") {
  const id = String(clip?.clipId || clip?.resourceId || fallback || "").trim();
  return id || "";
}

function getPreviewClipEdit(state, clipId) {
  const key = String(clipId || "").trim();
  if (!key || !state?.previewClipEdits) return null;
  return state.previewClipEdits.get(key) || null;
}

function applyPreviewClipGeometry(state, clip, trackName) {
  const clipId = getClipId(clip);
  const edit = getPreviewClipEdit(state, clipId);
  if (!edit) return clip;
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
  };
}

function resolveCutTimeSecForHit(state, hit, pointerX) {
  if (!hit || String(hit?.type || "") !== "clip") return null;
  if (String(hit?.track_kind || "").toLowerCase() !== "video") return null;
  const clipStart = Math.max(0, Number(hit?.t0_sec || 0));
  const clipEnd = Math.max(clipStart + CLIP_EDIT_MIN_DURATION_SEC, Number(hit?.t1_sec || clipStart + CLIP_EDIT_MIN_DURATION_SEC));
  if (!(clipEnd > clipStart + CLIP_EDIT_MIN_DURATION_SEC * 2)) return null;
  const x = Number(pointerX);
  const xToTime = state.t0Sec + (clamp(Number.isFinite(x) ? x : LEFT_GUTTER, LEFT_GUTTER, Number(state.canvas?.clientWidth || LEFT_GUTTER)) - LEFT_GUTTER) / Math.max(1e-6, state.pxPerSec);
  const rawCut = clamp(xToTime, clipStart + CLIP_EDIT_MIN_DURATION_SEC, clipEnd - CLIP_EDIT_MIN_DURATION_SEC);
  const snappedCut = snapTimeSec(state, rawCut, {
    trackName: String(hit?.track_name || "").trim(),
    excludeResourceId: String(hit?.resource_id || "").trim(),
    maxTimeSec: state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec,
  });
  return clamp(snappedCut, clipStart + CLIP_EDIT_MIN_DURATION_SEC, clipEnd - CLIP_EDIT_MIN_DURATION_SEC);
}

function resolveCutPreview(state, x, y) {
  const hit = hitTest(state, x, y);
  if (!hit || String(hit?.type || "") !== "clip") return null;
  if (String(hit?.track_kind || "").toLowerCase() !== "video") return null;
  const cutTimeSec = resolveCutTimeSecForHit(state, hit, x);
  if (cutTimeSec == null) return null;
  return {
    clipId: String(hit?.clip_id || "").trim(),
    resourceId: String(hit?.resource_id || "").trim(),
    trackName: String(hit?.track_name || "").trim(),
    trackKind: "video",
    t0Sec: Number(hit?.t0_sec || 0),
    t1Sec: Number(hit?.t1_sec || 0),
    rowTop: Number(hit?.row_top || 0),
    rowBottom: Number(hit?.row_bottom || 0),
    cutTimeSec,
  };
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
    draw(state);
  };
  img.onerror = () => {
    entry.status = "error";
    draw(state);
  };
  img.src = key;
  return entry;
}

function getTimelineThumbnail(state, src) {
  const entry = ensureTimelineThumbnailEntry(state, src);
  if (!entry || entry.status !== "ready" || !entry.img) return null;
  return entry.img;
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
  const trackScale = normalizeTrackRowScale(state.trackRowScale);
  state.zoomLabel.textContent = `zoom ${state.pxPerSec.toFixed(1)} px/s | window ${visibleSec.toFixed(2)}s | y ${trackScale.toFixed(2)}x`;
}

function snapshotTimelineViewState(state) {
  return {
    autoFit: Boolean(state?.autoFit),
    pxPerSec: Math.max(0.0001, Number(state?.pxPerSec || 0)),
    t0Sec: Math.max(0, Number(state?.t0Sec || 0)),
    scrollY: Math.max(0, Number(state?.scrollY || 0)),
    trackRowScale: normalizeTrackRowScale(state?.trackRowScale),
  };
}

function emitTimelineViewState(state) {
  if (!state || typeof state.onViewStateChange !== "function") return;
  const snapshot = snapshotTimelineViewState(state);
  const key =
    `${snapshot.autoFit ? "1" : "0"}|${snapshot.pxPerSec.toFixed(4)}|` +
    `${snapshot.t0Sec.toFixed(4)}|${snapshot.scrollY.toFixed(2)}|${snapshot.trackRowScale.toFixed(4)}`;
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

function drawAudioClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h, options = {}) {
  const channelMode = String(options?.channelMode || "").toLowerCase();
  const channelPhase = toFiniteNumber(options?.channelPhase, 0) || 0;
  const strokeStyle = String(options?.strokeStyle || "rgba(41, 28, 18, 0.58)");
  const bins = clamp(Math.floor(widthPx / 2.5), 12, 280);
  const stepX = widthPx / bins;
  const midY = y + h * 0.5;
  const ampPx = Math.max(2, h * 0.46);
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
  if (vizMode === "filled") {
    ctx.save();
    ctx.fillStyle = "rgba(63, 43, 27, 0.36)";
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = amplitudes[i];
      const yTop = midY - a * ampPx;
      if (i === 0) ctx.moveTo(x, yTop);
      else ctx.lineTo(x, yTop);
    }
    for (let i = bins - 1; i >= 0; i -= 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = amplitudes[i];
      const yBottom = midY + a * ampPx;
      ctx.lineTo(x, yBottom);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = amplitudes[i];
      const yTop = midY - a * ampPx;
      if (i === 0) ctx.moveTo(x, yTop);
      else ctx.lineTo(x, yTop);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (vizMode === "bands") {
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = amplitudes[i];
      if (a <= 0.001) continue;
      const yTop = midY - a * ampPx;
      const yBottom = midY + a * ampPx;
      ctx.strokeStyle = "rgba(74, 165, 142, 0.58)";
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, yTop);
      ctx.stroke();
      ctx.strokeStyle = "rgba(219, 174, 90, 0.56)";
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, midY - (midY - yTop) * 0.66);
      ctx.stroke();
      ctx.strokeStyle = "rgba(198, 104, 147, 0.54)";
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x, yBottom);
      ctx.stroke();
    }
    return;
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < bins; i += 1) {
    const x = x0 + i * stepX + stepX * 0.5;
    const a = amplitudes[i];
    ctx.moveTo(x, midY - a * ampPx);
    ctx.lineTo(x, midY + a * ampPx);
  }
  ctx.stroke();
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

function drawClipThumbnailTiles(state, ctx, src, x0, widthPx, y, h) {
  const img = getTimelineThumbnail(state, src);
  if (!img) return false;
  const imgW = Math.max(1, Number(img.naturalWidth || img.width || 1));
  const imgH = Math.max(1, Number(img.naturalHeight || img.height || 1));
  const tileW = clamp(h * 0.72, 26, 84);
  const tileH = Math.max(10, h - 2);
  const scale = Math.max(tileW / imgW, tileH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const innerY = y + (h - tileH) * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, widthPx, h);
  ctx.clip();
  for (let x = x0 + 1; x < x0 + widthPx - 1; x += tileW + 3) {
    const drawX = x + (tileW - drawW) * 0.5;
    const drawY = innerY + (tileH - drawH) * 0.5;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.strokeStyle = "rgba(72, 56, 42, 0.45)";
    ctx.strokeRect(x + 0.5, innerY + 0.5, Math.max(1, tileW - 1), Math.max(1, tileH - 1));
  }
  ctx.restore();
  return true;
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

function drawVideoClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h) {
  const thumbnailSrc = String(clip?.thumbnailSrc || clip?.previewSrc || clip?.src || "").trim();
  const hasThumb = drawClipThumbnailTiles(state, ctx, thumbnailSrc, x0, widthPx, y, h);
  const hash = normalizedTrackHash(`${trackName}:${clip?.label || "video"}`);
  const clipStart = Number(clip?.start || 0);
  const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
  const clipDurationSec = Math.max(0.01, clipEnd - clipStart);
  const frameCount = clamp(Math.floor(widthPx / 10), 6, 80);
  const frameW = widthPx / frameCount;
  const stripeY = y + Math.max(1, Math.floor(h * 0.18));
  const stripeH = Math.max(4, Math.floor(h * 0.64));
  ctx.fillStyle = hasThumb ? "rgba(34, 26, 18, 0.2)" : "rgba(34, 26, 18, 0.3)";
  ctx.fillRect(x0, stripeY, widthPx, stripeH);
  ctx.strokeStyle = "rgba(65, 45, 27, 0.42)";
  for (let i = 1; i < frameCount; i += 1) {
    const fx = x0 + i * frameW + 0.5;
    ctx.beginPath();
    ctx.moveTo(fx, stripeY);
    ctx.lineTo(fx, stripeY + stripeH);
    ctx.stroke();
  }
  const keyframes = clamp(Math.floor(widthPx / 90), 1, 7);
  for (let i = 0; i <= keyframes; i += 1) {
    const t = i / Math.max(1, keyframes);
    const kx = x0 + t * widthPx;
    const level = 0.45 + Math.abs(Math.sin((t * 9 + hash) * Math.PI * 2)) * 0.45;
    const kh = Math.max(3, stripeH * level);
    const ky = stripeY + stripeH - kh;
    ctx.fillStyle = "rgba(86, 60, 38, 0.62)";
    ctx.fillRect(kx + 1, ky, Math.max(2, frameW * 0.28), kh);
  }
  const nominalFrameStep = clipDurationSec / Math.max(1, frameCount);
  const fpsHint = nominalFrameStep > 0 ? (1 / nominalFrameStep) : 0;
  if (fpsHint > 0) {
    const label = `${Math.round(fpsHint)}fps`;
    ctx.fillStyle = "rgba(26, 19, 13, 0.62)";
    ctx.font = "9px monospace";
    const labelW = Math.ceil(ctx.measureText(label).width) + 8;
    const boxX = Math.max(x0 + 2, x0 + widthPx - labelW - 2);
    const boxY = y + 2;
    ctx.fillRect(boxX, boxY, labelW, 11);
    ctx.fillStyle = "rgba(243, 232, 217, 0.9)";
    ctx.fillText(label, boxX + 4, boxY + 9);
  }
}

function drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight) {
  const innerY = rowTop + 7;
  const innerH = Math.max(8, rowHeight - 14);
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
    drawVideoClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
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

function drawClipEditOverlay(state, ctx, rowTop, rowBottom, clip, x0, widthPx) {
  const session = state?.clipEditSession;
  if (!session) return;
  if (String(session.clipId || "") !== String(getClipId(clip) || "")) return;
  const xStart = x0;
  const xEnd = x0 + widthPx;
  ctx.save();
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
  ctx.fillStyle = "rgba(72, 55, 40, 0.9)";
  ctx.font = "9px monospace";
  const startSec = Number(clip?.start || 0);
  const endSec = Number(clip?.end || 0);
  ctx.fillText(`S ${startSec.toFixed(2)}s`, xStart + 4, rowTop + 11);
  const duration = Math.max(0, endSec - startSec);
  const durationText = `D ${duration.toFixed(2)}s`;
  const textWidth = Math.ceil(ctx.measureText(durationText).width);
  const textX = Math.max(LEFT_GUTTER + 2, xEnd - textWidth - 6);
  ctx.fillText(durationText, textX, rowTop + 11);
  ctx.restore();
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
    const playAudio = track?.playAudio !== false;
    if (!trackName || kind !== "audio") continue;
    if (!playAudio) continue;
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
    const rowTop = row.rowTop;
    const rowBottom = row.rowBottom;
    const rowHeight = Math.max(8, Number(row.rowHeight || (rowBottom - rowTop) || ROW_HEIGHT));
    const activeEdit = state.clipEditSession;
    const activePreview = activeEdit ? state.previewClipEdits.get(activeEdit.clipId) : null;
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
    ctx.fillStyle = i % 2 === 0 ? "#e8d9c7" : "#e3d3c1";
    ctx.fillRect(0, rowTop, LEFT_GUTTER, rowHeight - 1);
    if (state.dropTarget && String(state.dropTarget.trackName || "") === trackName) {
      const dropX = clamp(toX(Number(state.dropTarget.timeSec || 0)), LEFT_GUTTER, width);
      const ghostDuration = Math.max(0.25, Number(state.dropTarget.durationSec || 1));
      const ghostWidth = clamp(ghostDuration * state.pxPerSec, 16, Math.max(16, timelineWidth * 0.6));
      const ghostX = clamp(dropX, LEFT_GUTTER, Math.max(LEFT_GUTTER, width - ghostWidth));
      const ghostTop = rowTop + 6;
      const ghostHeight = Math.max(12, rowHeight - 12);
      const ghostLabel = `drop ${ghostDuration.toFixed(2)}s`;

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

    ctx.fillStyle = muted ? "rgba(63, 51, 40, 0.54)" : "#3f3328";
    ctx.font = "10px monospace";
    ctx.fillText(compactText(trackName, 18), 8, rowTop + 14);
    ctx.fillStyle = muted ? "rgba(109, 90, 72, 0.55)" : "#6d5a48";
    const channelMode = resolveEffectiveChannelMode(state, track);
    const modeText = channelMode === "stereo" ? "stereo L/R" : (channelMode === "mono" ? "mono" : "");
    const infoText = modeText
      ? `${track?.kind || "track"} ${modeText} · ${track?.events || 0}`
      : `${track?.kind || "track"} · ${track?.events || 0}`;
    ctx.fillText(infoText, 8, rowTop + 28);

    const events = Array.isArray(studioData?.eventsByTrack?.[track?.name]) ? studioData.eventsByTrack[track.name] : [];
    const explicitResourceClips =
      (trackKind === "video" || trackKind === "image") &&
      events.some((event) => {
        const resourceId = String(event?.resourceId || "").trim();
        const src = String(event?.previewSrc || event?.src || "").trim();
        return Boolean(resourceId || src);
      });
    let clips = explicitResourceClips
      ? buildExplicitResourceClips(events, state.durationSec, trackKind)
      : buildTrackClips(events, state.durationSec, secPerBar);
    const hasSource = String(track?.source || "").trim().length > 0;
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
    clips = clips
      .map((clip, clipIndex) => {
        const clippedStart = clamp(Number(clip?.start || 0), 0, state.durationSec);
        const rawEnd = Math.max(clippedStart + CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || clippedStart + CLIP_EDIT_MIN_DURATION_SEC));
        const clippedEnd = clamp(rawEnd, clippedStart + CLIP_EDIT_MIN_DURATION_SEC, state.durationSec);
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
      .filter((clip) => clip && clip.end > clip.start + 0.0005)
      .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
    ctx.save();
    ctx.beginPath();
    ctx.rect(LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    ctx.clip();
    for (const clip of clips) {
      if (clip.end < visibleStartSec || clip.start > visibleEndSec) continue;
      const x0 = toX(clip.start);
      const x1 = toX(clip.end);
      const widthPx = Math.max(2, x1 - x0);
      const clipId = getClipId(clip, `${trackName}_${clip.start.toFixed(4)}`);
      const selectedClip = String(state.selection?.clip_id || "") === clipId;
      const selectedTrack = String(state.selection?.track_name || "") === trackName;
      const isSelected = selectedClip && selectedTrack;
      ctx.fillStyle = stableTrackColor(trackName || String(i));
      ctx.globalAlpha = muted ? 0.2 : (isSelected ? 0.82 : 0.72);
      ctx.fillRect(x0, rowTop + 5, widthPx, rowHeight - 10);
      ctx.globalAlpha = muted ? 0.55 : 1;
      ctx.strokeStyle = isSelected ? "rgba(36, 26, 18, 0.88)" : "rgba(48, 36, 26, 0.6)";
      ctx.strokeRect(x0 + 0.5, rowTop + 5.5, Math.max(1, widthPx - 1), rowHeight - 11);
      if (!muted) drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight);
      drawClipEditOverlay(state, ctx, rowTop, rowBottom, clip, x0, widthPx);
      ctx.fillStyle = muted ? "rgba(32, 22, 14, 0.54)" : "#20160e";
      ctx.font = "9px monospace";
      ctx.fillText(compactText(clip.label, 24), x0 + 4, rowTop + 18);
      const supportsClipEdit = Boolean(
        clip.resourceId && (trackKind === "video" || trackKind === "image")
      );
      const handleRect = supportsClipEdit
        ? drawClipHandles(ctx, x0, rowTop, widthPx, rowHeight, {
            muted,
            selected: isSelected,
          })
        : null;
      state.hitRegions.push({
        x0: Math.max(LEFT_GUTTER, x0),
        y0: rowTop + 5,
        x1: Math.min(width, x0 + widthPx),
        y1: rowBottom - 5,
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
          notes_count: clip.notesCount || 0,
          origin_step_index: resolveTrackStepIndex(track),
          asset: String(track?.source || ""),
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
          },
        });
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    }
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
      const label = `cut ${Number(state.cutPreview.cutTimeSec || 0).toFixed(2)}s`;
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
    if (typeof state.updatePlayPauseButton === "function") state.updatePlayPauseButton();
    state.playPauseBtn.classList.toggle("alt", state.isPlaying);
  }
  state.statusLabel.textContent = `${state.isPlaying ? "Playing" : "Stopped"} · ${state.playheadSec.toFixed(2)}s · ${modeLabel}`;
  renderFooter(state);
  if (typeof state.onPlaybackUpdate === "function") {
    try {
      state.onPlaybackUpdate({
        playheadSec: state.playheadSec,
        durationSec: state.durationSec,
        isPlaying: state.isPlaying,
        modeLabel,
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
  state.clipEditSession = null;
  state.cutPreview = null;
  if (state.previewClipEdits) state.previewClipEdits.clear();
  if (state.clipThumbCache) state.clipThumbCache.clear();
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
  initialViewState = null,
  onViewStateChange = null,
  onJumpToStep,
  onOpenRunDir,
  onResolveAudioUrl,
  onDropResource,
  onClipEdit,
  onClipCut,
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
  setButtonIcon(playPauseBtn, { icon: "play", title: "Play" });
  setButtonIcon(stopBtn, { icon: "stop", title: "Stop" });
  controls.append(playPauseBtn, stopBtn);

  const fitBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const snapBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  setButtonIcon(fitBtn, { icon: "fit", title: "Fit timeline to viewport" });
  setButtonIcon(snapBtn, { icon: "snap_on", title: "Snap enabled" });
  const sectionVizSelect = el("select", { class: "lemouf-loop-select lemouf-song2daw-viz-select" });
  sectionVizSelect.append(
    el("option", { value: "bands", text: "Viz: Bands" }),
    el("option", { value: "filled", text: "Viz: Filled" }),
    el("option", { value: "peaks", text: "Viz: Peaks" })
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
  const footerActions = el("div", { class: "lemouf-song2daw-studio-footer-actions" });
  const zoomGroup = el("div", { class: "lemouf-song2daw-studio-footer-group" });
  const zoomLabel = el("span", { class: "lemouf-song2daw-studio-footer-zoom", text: "zoom n/a" });
  const zoomResetBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  setButtonIcon(zoomResetBtn, { icon: "zoom_reset", title: "Reset temporal zoom" });
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
    snapBtn,
    statusLabel,
    zoomLabel,
    zoomResetBtn,
    onJumpToStep,
    onOpenRunDir,
    onDropResource,
    onClipEdit,
    onClipCut,
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
    resizeObserver: null,
    autoFit: true,
    sectionHeight: normalizeSectionHeight(localStorage.getItem(SECTION_HEIGHT_STORAGE_KEY)),
    compactMode,
    allowDurationExtend: Boolean(allowDurationExtend),
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
    trackChannelModeOverrides: new Map(),
    mutePaintActive: false,
    mutePaintPointerId: null,
    mutePaintTargetMuted: false,
    mutePaintVisited: new Set(),
    sectionVizMode: normalizeSectionVizMode(localStorage.getItem(SECTION_VIZ_STORAGE_KEY)),
    snapEnabled: normalizeSnapEnabled(localStorage.getItem(TIMELINE_SNAP_STORAGE_KEY)),
    trackRowScale: normalizeTrackRowScale(localStorage.getItem(TRACK_ROW_SCALE_STORAGE_KEY)),
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
    previewClipEdits: new Map(),
    clipEditSession: null,
    clipThumbCache: new Map(),
    cutPreview: null,
    keyupHandler: null,
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

  const beginClipEdit = (event, hit) => {
    const clipId = String(hit?.clip_id || hit?.id || "").trim();
    const resourceId = String(hit?.resource_id || "").trim();
    const trackName = String(hit?.track_name || "").trim();
    if (!clipId || !resourceId || !trackName) return false;
    const mode = String(hit?.type || "") === "clip_trim_start"
      ? "trim_start"
      : (String(hit?.type || "") === "clip_trim_end" ? "trim_end" : "move");
    const trackKind = String(hit?.track_kind || "").toLowerCase();
    if (trackKind !== "video" && trackKind !== "image") return false;
    const maxDurationSec = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
    const start = clamp(Number(hit?.t0_sec || 0), 0, maxDurationSec);
    const end = clamp(
      Math.max(start + CLIP_EDIT_MIN_DURATION_SEC, Number(hit?.t1_sec || start + CLIP_EDIT_MIN_DURATION_SEC)),
      start + CLIP_EDIT_MIN_DURATION_SEC,
      maxDurationSec
    );
    state.clipEditSession = {
      pointerId: event.pointerId,
      mode,
      clipId,
      resourceId,
      trackName,
      trackKind,
      start,
      end,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
    };
    state.previewClipEdits.set(clipId, { start, end, trackName });
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
    if (session.mode === "move") {
      const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const maxStart = state.allowDurationExtend
        ? Math.max(0, TIMELINE_EDIT_MAX_DURATION_SEC - duration)
        : Math.max(0, state.durationSec - duration);
      const rawStart = clamp(session.start + deltaSec, 0, maxStart);
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const target = resolveDropTargetFromPoint(state, x, y, session.trackKind);
      if (target?.trackName) nextTrackName = String(target.trackName || nextTrackName);
      nextStart = snapTimeSec(state, rawStart, {
        trackName: nextTrackName,
        excludeResourceId: session.resourceId,
      });
      nextStart = clamp(nextStart, 0, maxStart);
      nextEnd = nextStart + duration;
      const laneTrackName = resolveNonOverlappingTrackName(state, {
        preferredTrackName: nextTrackName,
        trackKind: session.trackKind,
        startSec: nextStart,
        endSec: nextEnd,
        excludeResourceId: session.resourceId,
      });
      if (laneTrackName && laneTrackName !== nextTrackName) {
        nextTrackName = laneTrackName;
        nextStart = snapTimeSec(state, nextStart, {
          trackName: nextTrackName,
          excludeResourceId: session.resourceId,
        });
        nextStart = clamp(nextStart, 0, maxStart);
        nextEnd = nextStart + duration;
      }
    } else if (session.mode === "trim_start") {
      const rawStart = clamp(session.start + deltaSec, 0, session.end - CLIP_EDIT_MIN_DURATION_SEC);
      const boundarySnapSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      nextStart = snapTimeSec(state, rawStart, {
        trackName: session.trackName,
        excludeResourceId: session.resourceId,
      });
      if (rawStart <= boundarySnapSec) nextStart = 0;
      nextStart = clamp(nextStart, 0, session.end - CLIP_EDIT_MIN_DURATION_SEC);
    } else if (session.mode === "trim_end") {
      const maxEnd = state.allowDurationExtend ? TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
      const rawEnd = clamp(session.end + deltaSec, session.start + CLIP_EDIT_MIN_DURATION_SEC, maxEnd);
      const boundarySnapSec = CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      nextEnd = snapTimeSec(state, rawEnd, {
        trackName: session.trackName,
        excludeResourceId: session.resourceId,
        maxTimeSec: maxEnd,
      });
      if (!state.allowDurationExtend && rawEnd >= state.durationSec - boundarySnapSec) nextEnd = state.durationSec;
      nextEnd = clamp(nextEnd, session.start + CLIP_EDIT_MIN_DURATION_SEC, maxEnd);
    }
    state.previewClipEdits.set(session.clipId, {
      start: nextStart,
      end: nextEnd,
      trackName: nextTrackName,
    });
    draw(state);
    return true;
  };

  const finalizeClipEdit = (event, cancelled = false) => {
    const session = state.clipEditSession;
    if (!session) return false;
    if (session.pointerId !== null && event.pointerId !== session.pointerId) return false;
    const current = state.previewClipEdits.get(session.clipId) || {
      start: session.start,
      end: session.end,
      trackName: session.trackName,
    };
    state.clipEditSession = null;
    state.previewClipEdits.delete(session.clipId);
    canvas.style.cursor = "";
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    if (cancelled) {
      draw(state);
      renderOverview(state);
      return true;
    }
    state.selection = {
      ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
      type: "clip",
      clip_id: session.clipId,
      resource_id: session.resourceId,
      track_name: String(current.trackName || session.trackName),
      t0_sec: Math.max(0, Number(current.start || session.start)),
      t1_sec: Math.max(
        Math.max(0, Number(current.start || session.start)) + CLIP_EDIT_MIN_DURATION_SEC,
        Number(current.end || session.end)
      ),
      origin_step_index: Number(state.selection?.origin_step_index || 2),
    };
    let accepted = false;
    if (typeof state.onClipEdit === "function") {
      accepted = Boolean(
        state.onClipEdit({
          clipId: session.clipId,
          resourceId: session.resourceId,
          trackKind: session.trackKind,
          trackName: String(current.trackName || session.trackName),
          timeSec: Math.max(0, Number(current.start || session.start)),
          durationSec: Math.max(CLIP_EDIT_MIN_DURATION_SEC, Number(current.end || session.end) - Number(current.start || session.start)),
          mode: session.mode,
        })
      );
    }
    if (accepted) {
      renderOverview(state);
    } else {
      draw(state);
      renderOverview(state);
    }
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

  const clearDropTarget = (drawAfter = true) => {
    if (!state.dropTarget) return;
    state.dropTarget = null;
    if (drawAfter) draw(state);
  };

  const resolveAdjustedDropTarget = (target, payload, { allowCreateLane = false } = {}) => {
    if (!target || !payload) return null;
    const resourceId = String(payload.resourceId || "").trim();
    const resourceKind = normalizeResourceKind(payload.resourceKind || target.trackKind || "");
    const durationSec = findResourceDurationHintSec(
      state,
      resourceId,
      Math.max(0.25, Number(state.dropTarget?.durationSec || 1))
    );
    let trackName = String(target.trackName || "").trim();
    let timeSec = Math.max(0, Number(target.timeSec || 0));
    if (resourceKind === "video" || resourceKind === "image") {
      trackName = resolveNonOverlappingTrackName(state, {
        preferredTrackName: trackName,
        trackKind: resourceKind,
        startSec: timeSec,
        endSec: timeSec + durationSec,
        excludeResourceId: resourceId,
        allowCreateLane,
      }) || trackName;
    }
    timeSec = snapTimeSec(state, timeSec, {
      trackName,
      excludeResourceId: resourceId,
    });
    const maxStart = state.allowDurationExtend
      ? Math.max(0, TIMELINE_EDIT_MAX_DURATION_SEC - durationSec)
      : Math.max(0, state.durationSec - durationSec);
    timeSec = clamp(timeSec, 0, maxStart);
    return {
      ...target,
      trackName,
      trackKind: String(target.trackKind || resourceKind || "").toLowerCase(),
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
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const target = resolveDropTargetFromPoint(state, x, y, payload.resourceKind);
    if (!target) {
      clearDropTarget();
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const nextTarget = resolveAdjustedDropTarget(target, payload, { allowCreateLane: false });
    if (!nextTarget) {
      clearDropTarget();
      return;
    }
    if (!sameDropTarget(state.dropTarget, nextTarget)) {
      state.dropTarget = nextTarget;
      draw(state);
    }
  });

  canvas.addEventListener("dragleave", (event) => {
    if (!state.dropTarget) return;
    const rect = canvas.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) return;
    clearDropTarget();
  });

  canvas.addEventListener("drop", (event) => {
    if (typeof state.onDropResource !== "function") return;
    const payload = readResourceDragPayload(event.dataTransfer);
    if (!payload.resourceId) {
      clearDropTarget(false);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const target = resolveDropTargetFromPoint(state, x, y, payload.resourceKind);
    if (!target) {
      clearDropTarget();
      return;
    }
    event.preventDefault();
    const finalTarget = resolveAdjustedDropTarget(target, payload, { allowCreateLane: true });
    clearDropTarget(false);
    if (!finalTarget) {
      draw(state);
      return;
    }
    const accepted = Boolean(
      state.onDropResource({
        resourceId: payload.resourceId,
        resourceKind: finalTarget.resourceKind,
        trackName: finalTarget.trackName,
        trackKind: finalTarget.trackKind,
        timeSec: finalTarget.timeSec,
      })
    );
    if (!accepted) draw(state);
  });

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
    const hit = hitTest(state, x, y);
    if (hit?.type === "track_mute") {
      beginMutePaint(event, hit.track_name);
      return;
    }
    if (
      event.ctrlKey &&
      hit?.type === "clip" &&
      String(hit?.track_kind || "").toLowerCase() === "video" &&
      typeof state.onClipCut === "function"
    ) {
      const cutTimeSec = resolveCutTimeSecForHit(state, hit, x);
      if (cutTimeSec != null) {
        const accepted = Boolean(
          state.onClipCut({
            clipId: String(hit?.clip_id || "").trim(),
            resourceId: String(hit?.resource_id || "").trim(),
            trackName: String(hit?.track_name || "").trim(),
            trackKind: String(hit?.track_kind || "").trim().toLowerCase(),
            cutTimeSec,
          })
        );
        state.cutPreview = null;
        if (!accepted) draw(state);
        return;
      }
    }
    if (
      hit?.type === "clip_trim_start" ||
      hit?.type === "clip_trim_end" ||
      hit?.type === "clip"
    ) {
      if (beginClipEdit(event, hit)) return;
      handleHit(hit);
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
    if (!state.panningX && !state.scrubbing && !state.resizingSection && !state.pendingTrackPointer && event.ctrlKey) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const preview = resolveCutPreview(state, x, y);
      const prevKey = state.cutPreview
        ? `${state.cutPreview.clipId}:${Number(state.cutPreview.cutTimeSec || 0).toFixed(4)}`
        : "";
      const nextKey = preview ? `${preview.clipId}:${Number(preview.cutTimeSec || 0).toFixed(4)}` : "";
      state.cutPreview = preview;
      canvas.style.cursor = preview ? SCISSORS_CURSOR : "";
      if (prevKey !== nextKey) draw(state);
    } else if (state.cutPreview) {
      state.cutPreview = null;
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
      if (event.ctrlKey && hover?.type === "clip" && String(hover?.track_kind || "").toLowerCase() === "video") {
        canvas.style.cursor = SCISSORS_CURSOR;
      } else if (hover?.type === "clip_trim_start" || hover?.type === "clip_trim_end") {
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
    const trackName = String(selection.track_name || "").trim();
    const trackKind = String(selection.track_kind || "").trim().toLowerCase();
    if (!resourceId || !trackName || (trackKind !== "video" && trackKind !== "image")) return false;
    const currentStart = Math.max(0, Number(selection.t0_sec || 0));
    const currentEnd = Math.max(currentStart + CLIP_EDIT_MIN_DURATION_SEC, Number(selection.t1_sec || currentStart + CLIP_EDIT_MIN_DURATION_SEC));
    const duration = Math.max(CLIP_EDIT_MIN_DURATION_SEC, currentEnd - currentStart);
    const baseStepSec = Math.max(1 / Math.max(1e-6, state.pxPerSec), 1 / 240);
    const stepSec = baseStepSec * (coarse ? 10 : 1);
    let nextStart = clamp(currentStart + direction * stepSec, 0, Math.max(0, state.durationSec - duration));
    nextStart = snapTimeSec(state, nextStart, {
      trackName,
      excludeResourceId: resourceId,
    });
    nextStart = clamp(nextStart, 0, Math.max(0, state.durationSec - duration));
    let nextTrackName = resolveNonOverlappingTrackName(state, {
      preferredTrackName: trackName,
      trackKind,
      startSec: nextStart,
      endSec: nextStart + duration,
      excludeResourceId: resourceId,
    });
    if (nextTrackName && nextTrackName !== trackName) {
      nextStart = snapTimeSec(state, nextStart, {
        trackName: nextTrackName,
        excludeResourceId: resourceId,
      });
      nextStart = clamp(nextStart, 0, Math.max(0, state.durationSec - duration));
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
    const accepted = typeof state.onClipEdit === "function"
      ? Boolean(
          state.onClipEdit({
            clipId: String(selection.clip_id || ""),
            resourceId,
            trackKind,
            trackName: nextTrackName,
            timeSec: nextStart,
            durationSec: duration,
            mode: "move",
          })
        )
      : false;
    if (!accepted) {
      draw(state);
      renderOverview(state);
    }
    return true;
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
  snapBtn.addEventListener("click", () => {
    state.snapEnabled = !state.snapEnabled;
    localStorage.setItem(TIMELINE_SNAP_STORAGE_KEY, state.snapEnabled ? "1" : "0");
    updateSnapButton();
    draw(state);
  });
  updateSnapButton();

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
    if (isTextLikeTarget(event.target)) return;
    const key = String(event.key || "");
    const isSpace = key === " " || key === "Spacebar" || String(event.code || "") === "Space";
    if (isSpace) {
      if (event.repeat) return;
      event.preventDefault();
      togglePlayPause();
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      const direction = key === "ArrowRight" ? 1 : -1;
      nudgeSelectedClip(direction, { coarse: event.shiftKey });
    }
  };
  state.keyupHandler = (event) => {
    const key = String(event?.key || "");
    if (key !== "Control") return;
    if (!state.cutPreview) return;
    state.cutPreview = null;
    if (!state.panningX && !state.scrubbing && !state.resizingSection) {
      canvas.style.cursor = "";
    }
    draw(state);
  };
  window.addEventListener("keydown", state.keydownHandler);
  window.addEventListener("keyup", state.keyupHandler);

  canvas.addEventListener("pointerleave", () => {
    if (!state.cutPreview) return;
    if (state.panningX || state.scrubbing || state.resizingSection) return;
    state.cutPreview = null;
    canvas.style.cursor = "";
    draw(state);
  });

  resize();
  if (!hasInitialViewState) fitBtn.click();
  renderOverview(state);
  TIMELINE_STATE.set(body, state);
}

export {
  clearSong2DawTimeline as clearStudioTimeline,
  renderSong2DawTimeline as renderStudioTimeline,
};
