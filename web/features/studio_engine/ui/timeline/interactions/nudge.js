import { resolveClipEditResult } from "../../../domain/services/edit_result.js";

export function createTimelineNudgeHandler(deps = {}) {
  const {
    state,
    CONSTANTS,
    Utils,
    isTrackLocked,
    snapTimeSec,
    resolveNonOverlappingTrackName,
    applyCommittedClipEditToLocalStudio,
    draw,
    renderOverview,
  } = deps;

  return (direction, { coarse = false } = {}) => {
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
    const currentEnd = Math.max(
      currentStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(selection.t1_sec || currentStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, currentEnd - currentStart);
    const baseStepSec = Math.max(1 / Math.max(1e-6, state.pxPerSec), 1 / 240);
    const stepSec = baseStepSec * (coarse ? 10 : 1);
    const maxStart = state.allowDurationExtend
      ? Math.max(0, CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC - duration)
      : Math.max(0, state.durationSec - duration);
    let nextStart = Utils.clamp(currentStart + direction * stepSec, 0, maxStart);
    nextStart = snapTimeSec(state, nextStart, {
      trackName,
      excludeResourceId: resourceId,
      excludeClipId: clipId,
    });
    nextStart = Utils.clamp(nextStart, 0, maxStart);
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
      nextStart = Utils.clamp(nextStart, 0, maxStart);
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
}
