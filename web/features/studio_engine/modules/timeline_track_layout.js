import * as CONSTANTS from "./timeline_constants.js";
import * as Utils from "./timeline_utils.js";

export function buildTrackClips(events, durationSec, secPerBar) {
  if (!Array.isArray(events) || !events.length) {
    return [{ start: 0, end: durationSec, label: "clip", notesCount: 0 }];
  }
  const sorted = events
    .map((event) => ({
      time: Math.max(0, Number(event?.time || 0)),
      duration: Math.max(0.01, Number(event?.duration || 0.01)),
      label: String(event?.label || "event"),
      pitch: Utils.toFiniteNumber(event?.pitch, null),
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

export function buildExplicitResourceClips(events, durationSec, fallbackLabel) {
  if (!Array.isArray(events) || !events.length) return [];
  const maxDuration = Math.max(0.01, Number(durationSec || 0));
  const clips = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i] || {};
    const time = Utils.clamp(Math.max(0, Number(event?.time || 0)), 0, maxDuration);
    const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
    const end = Utils.clamp(time + duration, time + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, maxDuration);
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
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(event?.sourceDurationSec || duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      ),
      thumbnailSrc: String(event?.previewSrc || event?.src || "").trim(),
      src: String(event?.src || "").trim(),
      previewSrc: String(event?.previewSrc || "").trim(),
    });
  }
  clips.sort((a, b) => a.start - b.start || a.end - b.end || String(a.clipId || "").localeCompare(String(b.clipId || "")));
  return clips;
}

export function inferOriginStepIndexFromTrack(track) {
  const name = String(track?.name || "").toLowerCase();
  const kind = String(track?.kind || "").toLowerCase();
  if (name === "mix") return 0;
  if (kind === "project" || name.includes("reaper")) return 6;
  if (kind === "fx" || name.includes("fx")) return 5;
  if (kind === "midi" || name.includes("midi")) return 4;
  return 3;
}

export function resolveTrackPartition(track) {
  const kind = String(track?.kind || "").toLowerCase();
  const value = String(track?.partition || track?.track_group || "").trim().toLowerCase();
  if (value === "obtained_midi" || value === "step_tracks") return value;
  return kind === "midi" ? "obtained_midi" : "step_tracks";
}

export function trackPartitionLabel(value) {
  return resolveTrackPartition({ partition: value }) === "obtained_midi" ? "Obtained MIDI" : "Step Tracks";
}

export function normalizeSectionHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return CONSTANTS.DEFAULT_SECTION_HEIGHT;
  return Utils.clamp(Math.round(numeric), CONSTANTS.MIN_SECTION_HEIGHT, CONSTANTS.MAX_SECTION_HEIGHT);
}

export function normalizeSnapEnabled(value) {
  if (value == null || value === "") return true;
  const normalized = String(value).trim().toLowerCase();
  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off" ||
    normalized === "no"
  );
}

export function normalizeVideoPreviewMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (CONSTANTS.VIDEO_PREVIEW_MODES.includes(normalized)) return normalized;
  return "auto";
}

export function normalizeVideoPreviewQualityHint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (CONSTANTS.VIDEO_PREVIEW_QUALITY_HINTS.includes(normalized)) return normalized;
  return "auto";
}

export function bucketizeFilmstripFrameCount(value) {
  const numeric = Math.max(0, Math.round(Number(value || 0)));
  if (!numeric) return 0;
  let closest = CONSTANTS.VIDEO_FILMSTRIP_FRAME_BUCKETS[0];
  let bestDelta = Math.abs(numeric - closest);
  for (const bucket of CONSTANTS.VIDEO_FILMSTRIP_FRAME_BUCKETS) {
    const delta = Math.abs(numeric - bucket);
    if (delta < bestDelta) {
      closest = bucket;
      bestDelta = delta;
    }
  }
  return closest;
}

export function normalizeFilmstripTargetHeight(value) {
  const numeric = Utils.clamp(Math.round(Number(value || CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT)), 24, CONSTANTS.VIDEO_FILMSTRIP_TARGET_HEIGHT);
  return Math.max(24, Math.round(numeric / 4) * 4);
}

export function resolveTrackStepIndex(track) {
  const explicit = Utils.toFiniteNumber(track?.originStepIndex, null);
  if (explicit !== null) return Math.max(0, Math.round(explicit));
  return inferOriginStepIndexFromTrack(track);
}

export function resolveTrackStageGroup(track) {
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

export function buildStageGroups(tracks) {
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

export function resolveVisibleSectionHeight(state, canvasHeight = null) {
  const normalized = normalizeSectionHeight(state?.sectionHeight);
  if (!state?.compactMode) return normalized;
  const height = Number(
    canvasHeight ?? state?.canvas?.clientHeight ?? 0
  );
  return Math.max(CONSTANTS.MIN_SECTION_HEIGHT, Math.round(Math.max(0, height) - CONSTANTS.RULER_HEIGHT - 2));
}

export function normalizeTrackRowScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Utils.clamp(numeric, CONSTANTS.TRACK_ROW_SCALE_MIN, CONSTANTS.TRACK_ROW_SCALE_MAX);
}

export function resolveTrackRowHeight(state, trackKind) {
  const scale = normalizeTrackRowScale(state?.trackRowScale);
  const base = String(trackKind || "").toLowerCase() === "video" ? CONSTANTS.VIDEO_ROW_HEIGHT : CONSTANTS.ROW_HEIGHT;
  return Math.max(16, Math.round(base * scale));
}

export function buildTrackRowsLayout(state, tracks, trackAreaY) {
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
      gapBefore = CONSTANTS.TRACK_GROUP_GAP;
    } else if (group.key !== previousGroupKey) {
      gapBefore = CONSTANTS.TRACK_GROUP_GAP;
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

