export function createAdjustedDropTargetResolver(deps = {}) {
  const {
    state,
    Drop,
    CONSTANTS,
    Utils,
    findResourceDurationHintSec,
    canonicalizeTargetTrackForResource,
    resolveNonOverlappingTrackName,
    snapTimeSec,
    isNearTimelineOrigin,
  } = deps;

  return function resolveAdjustedDropTarget(target, payload, { allowCreateLane = false, pointerCanvasX = null } = {}) {
    if (!target || !payload) return null;
    const resourceId = String(payload.resourceId || "").trim();
    const resourceKind = Drop.normalizeResourceKind(payload.resourceKind || "");
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
      ? Math.max(0, CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC - durationSec)
      : Math.max(0, state.durationSec - durationSec);
    const boundarySnapSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
    timeSec = Utils.clamp(timeSec, 0, maxStart);
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
}
