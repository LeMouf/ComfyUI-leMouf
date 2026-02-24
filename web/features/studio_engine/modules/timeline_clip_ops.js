export function createTimelineClipOps(deps = {}) {
  const {
    CONSTANTS,
    Utils,
    hitTest,
    snapTimeSec,
    resolveMoveDeltaBoundsForClip,
    makeClipSelectionKey,
  } = deps;

  function isCuttableTrackKind(trackKind) {
    const kind = String(trackKind || "").trim().toLowerCase();
    return kind === "video" || kind === "audio";
  }

  const resolveCutTimeSecForHit = (state, hit, pointerX) => {
    if (!hit || String(hit?.type || "") !== "clip") return null;
    if (!isCuttableTrackKind(hit?.track_kind)) return null;
    const clipStart = Math.max(0, Number(hit?.t0_sec || 0));
    const clipEnd = Math.max(
      clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(hit?.t1_sec || clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    if (!(clipEnd > clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC * 2)) return null;
    const x = Number(pointerX);
    const xToTime = state.t0Sec + (
      Utils.clamp(
        Number.isFinite(x) ? x : CONSTANTS.LEFT_GUTTER,
        CONSTANTS.LEFT_GUTTER,
        Number(state.canvas?.clientWidth || CONSTANTS.LEFT_GUTTER)
      ) - CONSTANTS.LEFT_GUTTER
    ) / Math.max(1e-6, state.pxPerSec);
    const rawCut = Utils.clamp(
      xToTime,
      clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      clipEnd - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC
    );
    const snappedCut = snapTimeSec(state, rawCut, {
      trackName: String(hit?.track_name || "").trim(),
      excludeResourceId: String(hit?.resource_id || "").trim(),
      excludeClipId: String(hit?.clip_id || "").trim(),
      maxTimeSec: state.allowDurationExtend ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec,
    });
    return Utils.clamp(
      snappedCut,
      clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      clipEnd - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC
    );
  };

  const resolveTrimKeepSideForHit = (hit, cutTimeSec) => {
    const clipStart = Math.max(0, Number(hit?.t0_sec || 0));
    const clipEnd = Math.max(
      clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(hit?.t1_sec || clipStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const mid = clipStart + (clipEnd - clipStart) * 0.5;
    return Number(cutTimeSec) >= mid ? "right" : "left";
  };

  const resolveCutPreview = (state, x, y, mode = "cut") => {
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
  };

  const canJoinAdjacentClips = (leftClip, rightClip) => {
    if (!leftClip || !rightClip) return false;
    const leftResource = String(leftClip?.resourceId || "").trim();
    const rightResource = String(rightClip?.resourceId || "").trim();
    if (!leftResource || leftResource !== rightResource) return false;
    const leftTrack = String(leftClip?.trackName || "").trim();
    const rightTrack = String(rightClip?.trackName || "").trim();
    if (!leftTrack || leftTrack !== rightTrack) return false;
    const leftEnd = Math.max(0, Number(leftClip?.end || 0));
    const rightStart = Math.max(0, Number(rightClip?.start || 0));
    if (Math.abs(leftEnd - rightStart) > CONSTANTS.CLIP_JOIN_TIME_EPS_SEC) return false;
    const leftOffset = Math.max(0, Number(leftClip?.startOffsetSec || 0));
    const leftDuration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, leftEnd - Math.max(0, Number(leftClip?.start || 0)));
    const rightOffset = Math.max(0, Number(rightClip?.startOffsetSec || 0));
    return Math.abs((leftOffset + leftDuration) - rightOffset) <= 0.08;
  };

  const collectMultiSelectedMoveMembers = (state, anchorHit) => {
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
          Math.max(0, Number(payload.t0_sec || 0)) + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
          Number(payload.t1_sec || (Number(payload.t0_sec || 0) + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC))
        ),
        startOffsetSec: Math.max(0, Number(payload.start_offset_sec || 0)),
        sourceDurationSec: Math.max(
          CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
          Number(payload.source_duration_sec || (Number(payload.t1_sec || 0) - Number(payload.t0_sec || 0) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC))
        ),
      });
    }
    return out;
  };

  const resolveGroupMoveDeltaBounds = (state, members, maxTimelineSec) => {
    const rows = Array.isArray(members) ? members : [];
    if (!rows.length) return { minDelta: 0, maxDelta: 0 };
    const excludedKeys = new Set(rows.map((row) => String(row?.key || "").trim()).filter(Boolean));
    let minDelta = Number.NEGATIVE_INFINITY;
    let maxDelta = Number.POSITIVE_INFINITY;
    const maxTime = Math.max(0, Number(maxTimelineSec || 0));
    for (const row of rows) {
      const start = Math.max(0, Number(row?.start || 0));
      const end = Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(row?.end || start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
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
  };

  return {
    isCuttableTrackKind,
    resolveCutTimeSecForHit,
    resolveTrimKeepSideForHit,
    resolveCutPreview,
    canJoinAdjacentClips,
    collectMultiSelectedMoveMembers,
    resolveGroupMoveDeltaBounds,
  };
}
