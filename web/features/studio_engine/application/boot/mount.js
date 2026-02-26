export function mountTimelineInstance(config = {}) {
  const {
    body,
    state,
    resize,
    renderOverview,
    fitBtn,
    hasInitialViewState = false,
    timelineStateMap,
  } = config;

  resize();
  if (!hasInitialViewState) fitBtn?.click();
  renderOverview(state);

  // Guard against first-interaction glitches when the host panel just became visible:
  // re-run size/layout once after mount and once after style settlement.
  requestAnimationFrame(() => {
    if (timelineStateMap?.get(body) !== state) return;
    resize();
    renderOverview(state);
  });
  setTimeout(() => {
    if (timelineStateMap?.get(body) !== state) return;
    resize();
    renderOverview(state);
  }, 90);

  timelineStateMap?.set(body, state);
}

