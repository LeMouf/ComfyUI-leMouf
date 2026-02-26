export function createTimelineInteractionHandlers({
  state,
  canvas,
  CONSTANTS,
  Utils,
  draw,
  renderOverview,
  hitTest,
  seek,
  startPlayback,
  stopPlayback,
  stopScrubGrains,
  ensureMidiAudioReady,
  ensureScrubAudioReady,
  scheduleScrubGrain,
  logTransportStressEvent,
  normalizeSectionHeight,
  isTrackMuted,
  applyTrackMuteChange,
  clampTimelineOffsetSec,
}) {
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
    const clampedX = Utils.clamp(x, CONSTANTS.LEFT_GUTTER, canvas.clientWidth);
    const safePxPerSec = Math.max(1e-6, Number(Utils.toFiniteNumber(state.pxPerSec, 1) || 1));
    const safeT0Sec = Math.max(0, Number(Utils.toFiniteNumber(state.t0Sec, 0) || 0));
    const time = safeT0Sec + (clampedX - CONSTANTS.LEFT_GUTTER) / safePxPerSec;
    const nowMs = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const prevTs = Number(state.scrubLastMoveTsMs || nowMs);
    const deltaSec = Math.max(0.001, (nowMs - prevTs) / 1000);
    const safePrevScrubSec = Number(Utils.toFiniteNumber(state.scrubLastTimeSec, time) ?? time);
    const velocitySecPerSec = (time - safePrevScrubSec) / deltaSec;
    state.scrubLastMoveTsMs = nowMs;
    state.scrubLastTimeSec = time;
    seek(state, time);
    scheduleScrubGrain(state, time, velocitySecPerSec);
    logTransportStressEvent(
      state,
      "scrub_move",
      {
        t: Number(time || 0),
        velocitySecPerSec: Number(velocitySecPerSec || 0),
      },
      { throttleMs: 120, key: "scrub_move" }
    );
    renderOverview(state);
  };

  const updatePanX = (event) => {
    if (!state.panningX) return;
    if (state.panPointerId !== null && event.pointerId !== state.panPointerId) return;
    const deltaPx = event.clientX - state.panStartClientX;
    const nextT0 = state.panStartT0Sec - deltaPx / Math.max(1e-6, state.pxPerSec);
    state.t0Sec = typeof clampTimelineOffsetSec === "function"
      ? clampTimelineOffsetSec(state, nextT0)
      : Math.max(0, nextT0);
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
    state.resizeSectionStartHeight = CONSTANTS.DEFAULT_SECTION_HEIGHT;
    canvas.style.cursor = "";
    localStorage.setItem(CONSTANTS.SECTION_HEIGHT_STORAGE_KEY, String(normalizeSectionHeight(state.sectionHeight)));
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

  return {
    beginMutePaint,
    updateMutePaint,
    endMutePaint,
    beginScrub,
    beginSectionResize,
    beginPanX,
    updateSectionResize,
    updateScrub,
    updatePanX,
    endScrub,
    endSectionResize,
    endPanX,
  };
}
