import * as CONSTANTS from "./timeline_constants.js";
import * as Utils from "./timeline_utils.js";

function makeClipSelectionKey(trackName, clipId) {
  const safeTrack = String(trackName || "").trim();
  const safeClip = String(clipId || "").trim();
  if (!safeTrack || !safeClip) return "";
  return `${safeTrack}::${safeClip}`;
}

function isTrackLocked(state, trackName) {
  const name = String(trackName || "").trim();
  if (!name) return false;
  return Boolean(state?.lockedTracks?.has?.(name));
}

function chooseRulerStepSecForSnap(pxPerSec) {
  const targetSec = Math.max(0.001, CONSTANTS.RULER_TARGET_PX / Math.max(1, pxPerSec));
  for (const value of CONSTANTS.RULER_STEP_OPTIONS_SEC) {
    if (value >= targetSec) return value;
  }
  return CONSTANTS.RULER_STEP_OPTIONS_SEC[CONSTANTS.RULER_STEP_OPTIONS_SEC.length - 1];
}

export function collectTrackEventEdgesSec(state, trackName, excludeResourceId = "", excludeClipId = "") {
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
    const t0 = Utils.toFiniteNumber(event?.time, null);
    const dur = Utils.toFiniteNumber(event?.duration, null);
    if (t0 == null) continue;
    const start = Math.max(0, t0);
    const end = Math.max(
      start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      start + Math.max(0, dur ?? CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    edges.push(start, end);
  }
  return edges;
}

export function intervalsOverlapSec(aStart, aEnd, bStart, bEnd) {
  const epsilon = 1e-4;
  return aStart < bEnd - epsilon && aEnd > bStart + epsilon;
}

export function getTrackNamesByKind(state, trackKind) {
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

export function trackNameSupportsKind(state, trackName, trackKind) {
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

export function trackHasOverlap(state, trackName, startSec, endSec, excludeResourceId = "", excludeClipId = "") {
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
      eventStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      eventStart + Math.max(0, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC))
    );
    if (intervalsOverlapSec(start, end, eventStart, eventEnd)) return true;
  }
  return false;
}

export function collectTrackNeighborBounds(
  state,
  { trackName = "", clipStartSec = 0, clipEndSec = 0, excludeClipKeys = null, excludeResourceId = "", excludeClipId = "" } = {}
) {
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
  const clipEnd = Math.max(
    clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
    Number(clipEndSec || clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
  );
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
      eventStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      eventStart + Math.max(0, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC))
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

export function resolveMoveDeltaBoundsForClip(
  state,
  { trackName = "", clipStartSec = 0, clipEndSec = 0, excludeClipKeys = null, excludeResourceId = "", excludeClipId = "", maxTimelineSec = 0 } = {}
) {
  const start = Math.max(0, Number(clipStartSec || 0));
  const end = Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(clipEndSec || start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
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
    maxDelta: Number.isFinite(maxDelta) ? maxDelta : maxTime - end,
  };
}

export function trackLaneSortValue(trackName, trackKind) {
  const name = String(trackName || "").trim();
  const kind = String(trackKind || "").trim().toLowerCase();
  const base = kind === "video" ? "video" : kind === "image" ? "image" : kind;
  const regex = new RegExp(`^${base}\\s*(\\d+)$`, "i");
  const match = name.match(regex);
  if (!match) return Number.POSITIVE_INFINITY;
  const lane = Number(match[1]);
  return Number.isFinite(lane) ? lane : Number.POSITIVE_INFINITY;
}

export function createNextTrackLaneName(trackKind, existingTrackNames = []) {
  const kind = String(trackKind || "").trim().toLowerCase();
  const base = kind === "video" ? "Video" : kind === "image" ? "Image" : "Track";
  let maxLane = 0;
  for (const nameRaw of existingTrackNames) {
    const name = String(nameRaw || "").trim();
    const lane = trackLaneSortValue(name, kind);
    if (Number.isFinite(lane)) maxLane = Math.max(maxLane, lane);
  }
  return `${base} ${Math.max(1, maxLane + 1)}`;
}

export function resolveNonOverlappingTrackName(state, options = {}) {
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

export function findResourceDurationHintSec(state, resourceId, fallback = 1) {
  const id = String(resourceId || "").trim();
  if (!id) return Math.max(0.25, Number(fallback || 1));
  const explicitHints = state?.studioData?.resourceDurationById;
  if (explicitHints && typeof explicitHints === "object") {
    const hinted = Number(explicitHints[id] || 0);
    if (Number.isFinite(hinted) && hinted > 0) return Math.max(0.25, hinted);
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

export function getTimelineMaxTimeSec(state, { includePreview = false } = {}) {
  const baseDurationSec = Math.max(0, Number(state?.durationSec || 0));
  if (!state?.allowDurationExtend) return baseDurationSec;
  let maxSec = baseDurationSec;
  const eventsByTrack = state?.studioData?.eventsByTrack;
  if (eventsByTrack && typeof eventsByTrack === "object") {
    for (const events of Object.values(eventsByTrack)) {
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        const t0 = Math.max(0, Number(event?.time || 0));
        const dur = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
        maxSec = Math.max(maxSec, t0 + dur);
      }
    }
  }
  if (includePreview && state?.previewClipEdits instanceof Map) {
    for (const edit of state.previewClipEdits.values()) {
      if (!edit || typeof edit !== "object") continue;
      const t0 = Math.max(0, Number(edit?.start || 0));
      const t1 = Math.max(t0 + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(edit?.end || t0 + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
      maxSec = Math.max(maxSec, t1);
    }
  }
  return Utils.clamp(maxSec, 0, CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC);
}

export function snapTimeSec(state, rawTimeSec, options = {}) {
  const maxTimeSec = Number.isFinite(Number(options?.maxTimeSec))
    ? Math.max(0, Number(options.maxTimeSec))
    : getTimelineMaxTimeSec(state, { includePreview: true });
  const time = Utils.clamp(Number(rawTimeSec || 0), 0, maxTimeSec);
  if (state?.snapEnabled === false) return time;
  const thresholdSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, Number(state?.pxPerSec || 1));
  const candidates = [0, maxTimeSec, Math.max(0, Number(state?.playheadSec || 0))];

  const sections = Array.isArray(state?.studioData?.sections) ? state.studioData.sections : [];
  for (const section of sections) {
    const s0 = Utils.toFiniteNumber(section?.start, null);
    const s1 = Utils.toFiniteNumber(section?.end, null);
    if (s0 != null) candidates.push(Math.max(0, s0));
    if (s1 != null) candidates.push(Math.max(0, s1));
  }
  const gridMajor = chooseRulerStepSecForSnap(Math.max(1e-6, Number(state?.pxPerSec || 1)));
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
    const candidate = Utils.clamp(Number(candidateRaw || 0), 0, maxTimeSec);
    const delta = Math.abs(candidate - time);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return bestDelta <= thresholdSec ? best : time;
}

export function isNearTimelineOrigin(state, rawTimeSec, pointerCanvasX = null) {
  const pxPerSec = Math.max(1e-6, Number(state?.pxPerSec || 1));
  const boundarySnapSec = CONSTANTS.CLIP_EDIT_SNAP_PX / pxPerSec;
  const raw = Math.max(0, Number(rawTimeSec || 0));
  if (raw <= boundarySnapSec) return true;
  if (!Number.isFinite(Number(pointerCanvasX))) return false;
  const canvasWidth = Math.max(0, Number(state?.canvas?.clientWidth || 0));
  const t0Sec = Math.max(0, Number(state?.t0Sec || 0));
  const originX = CONSTANTS.LEFT_GUTTER + (0 - t0Sec) * pxPerSec;
  if (originX < CONSTANTS.LEFT_GUTTER - CONSTANTS.CLIP_EDIT_SNAP_PX || originX > canvasWidth + CONSTANTS.CLIP_EDIT_SNAP_PX) {
    return false;
  }
  return Math.abs(Number(pointerCanvasX) - originX) <= CONSTANTS.CLIP_EDIT_SNAP_PX;
}

