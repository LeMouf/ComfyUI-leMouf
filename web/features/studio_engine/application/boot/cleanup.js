export function clearTimelineInstance(config = {}) {
  const {
    body,
    state,
    timelineStateMap,
    ContextMenu,
    stopPlayback,
    resetTransportClockState,
    stopScrubGrains,
    clearTrackAudioPlayers,
    closeTrackPlaybackAudioBus,
  } = config;

  if (!state) return;
  ContextMenu?.closeTrackContextMenu?.(state);
  body?.classList?.remove?.("lemouf-studio-body-compact");
  if (state.canvas) state.canvas.style.cursor = "";
  stopPlayback?.(state);
  resetTransportClockState?.(state);
  stopScrubGrains?.(state);
  clearTrackAudioPlayers?.(state);
  closeTrackPlaybackAudioBus?.(state);
  state.mutePaintActive = false;
  state.mutePaintPointerId = null;
  state.mutePaintVisited = new Set();
  state.clipEditSession = null;
  state.cutPreview = null;
  state.joinPreview = null;
  state.boxSelection = null;
  if (state.selectedClipKeys instanceof Set) state.selectedClipKeys.clear();
  if (state.previewClipEdits) state.previewClipEdits.clear();
  if (state.filmstripRenderCache instanceof Map) state.filmstripRenderCache.clear();
  if (state.clipThumbCache && state.ownsClipThumbCache) state.clipThumbCache.clear();
  if (state.keydownHandler) {
    window.removeEventListener("keydown", state.keydownHandler);
  }
  if (state.keyupHandler) {
    window.removeEventListener("keyup", state.keyupHandler);
  }
  if (state.audio && state.audioHandlers) {
    const handlers = state.audioHandlers;
    try {
      state.audio.removeEventListener("loadedmetadata", handlers.onLoadedMetadata);
      state.audio.removeEventListener("timeupdate", handlers.onTimeUpdate);
      state.audio.removeEventListener("ended", handlers.onEnded);
      state.audio.removeEventListener("error", handlers.onError);
    } catch {}
    try {
      state.audio.pause();
      state.audio.src = "";
      state.audio.load();
    } catch {}
  }
  if (state.resizeObserver) {
    try {
      state.resizeObserver.disconnect();
    } catch {}
  }
  state.scrubSourceUrl = "";
  state.scrubActiveSourceUrl = "";
  state.scrubBufferSwapPending = false;
  state.scrubDecodeUrl = "";
  state.scrubDecodePromise = null;
  state.scrubAudioBuffer = null;
  state.scrubAudioBufferReverse = null;
  if (state.scrubAudioContext) {
    try {
      state.scrubAudioContext.close();
    } catch {}
  }
  if (state.midiAudioContext) {
    try {
      state.midiAudioContext.close();
    } catch {}
  }
  timelineStateMap?.delete?.(body);
}
