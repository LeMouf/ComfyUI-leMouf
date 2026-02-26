export function createTimelineResizeHandler(config = {}) {
  const {
    state,
    canvas,
    canvasWrap,
    ctx,
    dpr = 1,
    deps = {},
  } = config;
  const {
    fitToViewport,
    clampTimelineOffsetSec,
    draw,
    renderOverview,
  } = deps;

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

  return resize;
}

