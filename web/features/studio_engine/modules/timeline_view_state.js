export function applyTimelineInitialViewState(state, initialViewState, deps = {}) {
  const {
    normalizeSkeletonMode = (v) => v,
    normalizeTrackRowScale = (v) => v,
  } = deps;

  const hasInitialViewState =
    initialViewState &&
    typeof initialViewState === "object" &&
    Number.isFinite(Number(initialViewState.pxPerSec)) &&
    Number(initialViewState.pxPerSec) > 0;

  if (!hasInitialViewState) return false;

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
  return true;
}

