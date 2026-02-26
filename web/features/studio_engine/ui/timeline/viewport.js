export function getTimelineMinPxPerSec(state, deps = {}) {
  const { CONSTANTS, getTimelineMaxTimeSec } = deps;
  const timelineWidth = Math.max(1, Number(state?.canvas?.clientWidth || 0) - CONSTANTS.LEFT_GUTTER);
  const durationSec = Math.max(1e-6, getTimelineMaxTimeSec(state, { includePreview: true }));
  const dynamicMin = (timelineWidth * CONSTANTS.MIN_SONG_WIDTH_RATIO) / durationSec;
  return Math.max(CONSTANTS.MIN_PX_PER_SEC_HARD, dynamicMin);
}

export function clampTimelineViewportOffsetSec(state, valueSec, deps = {}) {
  const { CONSTANTS, Utils, getTimelineMaxTimeSec } = deps;
  const timelineWidth = Math.max(1, state.canvas.clientWidth - CONSTANTS.LEFT_GUTTER);
  const visibleSec = timelineWidth / Math.max(1e-6, state.pxPerSec);
  const maxT0 = Math.max(0, getTimelineMaxTimeSec(state, { includePreview: true }) - visibleSec);
  return Utils.clamp(Number(valueSec || 0), 0, maxT0);
}

export function fitTimelineToViewport(state, options = {}, deps = {}) {
  const { drawAfter = true } = options;
  const { CONSTANTS, Utils, getTimelineMaxTimeSec, getMinPxPerSec, draw } = deps;
  const timelineWidth = Math.max(1, state.canvas.clientWidth - CONSTANTS.LEFT_GUTTER);
  const maxTimeSec = Math.max(1e-6, getTimelineMaxTimeSec(state, { includePreview: true }));
  state.pxPerSec = Utils.clamp(timelineWidth / maxTimeSec, getMinPxPerSec(state), CONSTANTS.MAX_PX_PER_SEC);
  state.t0Sec = 0;
  if (drawAfter) draw(state);
}

export function refreshTimelineViewportAfterDurationChange(state, deps = {}) {
  const { CONSTANTS, Utils, fitToViewport, getMinPxPerSec, clampTimelineOffsetSec } = deps;
  if (!state) return;
  if (state.autoFit) {
    fitToViewport(state, { drawAfter: false });
    return;
  }
  state.pxPerSec = Utils.clamp(Number(state.pxPerSec || 0), getMinPxPerSec(state), CONSTANTS.MAX_PX_PER_SEC);
  state.t0Sec = clampTimelineOffsetSec(state, state.t0Sec);
}
