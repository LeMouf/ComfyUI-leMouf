export function setupTimelineToolbarControls(config = {}) {
  const {
    state,
    buttons = {},
    deps = {},
  } = config;
  const {
    playPauseBtn,
    stopBtn,
    undoBtn,
    redoBtn,
    clearStudioBtn,
    fitBtn,
    zoomResetBtn,
    jumpBtn,
    sectionVizSelect,
    snapBtn,
    skeletonModeBtn,
  } = buttons;
  const {
    CONSTANTS,
    setButtonIcon,
    normalizeSectionVizMode,
    fitToViewport,
    clearClipSelectionSet,
    startPlayback,
    stopPlayback,
    resumeTrackPlaybackAudioContext,
    draw,
    renderOverview,
  } = deps;

  const togglePlayPause = () => {
    if (state.isPlaying) {
      stopPlayback(state, false);
      return;
    }
    // Do not run asynchronous warmup here: it can race with active playback
    // and rewind/pause currently playing clip players.
    void resumeTrackPlaybackAudioContext(state);
    startPlayback(state);
  };

  const resetTemporalZoom = () => {
    state.autoFit = true;
    fitToViewport(state, { drawAfter: false });
    draw(state);
  };

  const updateSnapButton = () => {
    if (!snapBtn) return;
    snapBtn.classList.toggle("is-active", state.snapEnabled);
    snapBtn.classList.toggle("alt", !state.snapEnabled);
    setButtonIcon(snapBtn, {
      icon: state.snapEnabled ? "snap_on" : "snap_off",
      title: state.snapEnabled ? "Snap enabled" : "Snap disabled",
    });
  };

  const updateSkeletonModeButton = () => {
    if (!skeletonModeBtn) return;
    const isOn = Boolean(state.skeletonMode);
    skeletonModeBtn.classList.toggle("is-active", isOn);
    skeletonModeBtn.setAttribute("aria-pressed", isOn ? "true" : "false");
    setButtonIcon(skeletonModeBtn, {
      icon: "skeleton_mode",
      title: isOn ? "Disable skeleton mode" : "Enable skeleton mode (debug)",
    });
  };

  const updatePlayPauseButton = () => {
    if (!playPauseBtn) return;
    setButtonIcon(playPauseBtn, {
      icon: state.isPlaying ? "pause" : "play",
      title: state.isPlaying ? "Pause" : "Play",
    });
  };
  state.updatePlayPauseButton = updatePlayPauseButton;

  playPauseBtn?.addEventListener("click", () => togglePlayPause());
  stopBtn?.addEventListener("click", () => stopPlayback(state, true));
  if (undoBtn) undoBtn.disabled = typeof state.onUndo !== "function";
  if (redoBtn) redoBtn.disabled = typeof state.onRedo !== "function";
  if (clearStudioBtn) clearStudioBtn.disabled = typeof state.onTrackContextAction !== "function";

  undoBtn?.addEventListener("click", () => {
    if (typeof state.onUndo !== "function") return;
    const accepted = Boolean(state.onUndo());
    if (accepted) renderOverview(state);
  });
  redoBtn?.addEventListener("click", () => {
    if (typeof state.onRedo !== "function") return;
    const accepted = Boolean(state.onRedo());
    if (accepted) renderOverview(state);
  });
  clearStudioBtn?.addEventListener("click", () => {
    if (typeof state.onTrackContextAction !== "function") return;
    const accepted = Boolean(
      state.onTrackContextAction({
        action: "clear_composition",
        trackName: "",
        trackKind: "",
        selectedClipIds: [],
        focusClipId: "",
        focusResourceId: "",
        focusLinkGroupId: "",
        locked: false,
      })
    );
    if (!accepted) return;
    clearClipSelectionSet(state);
    draw(state);
    renderOverview(state);
  });

  fitBtn?.addEventListener("click", () => {
    resetTemporalZoom();
    state.scrollY = 0;
  });
  zoomResetBtn?.addEventListener("click", () => resetTemporalZoom());
  jumpBtn?.addEventListener("click", () => {
    const stepIndex = Number(state.selection?.origin_step_index);
    if (!Number.isFinite(stepIndex) || typeof state.onJumpToStep !== "function") return;
    state.onJumpToStep(stepIndex);
  });
  if (sectionVizSelect) sectionVizSelect.value = state.sectionVizMode;
  sectionVizSelect?.addEventListener("change", () => {
    state.sectionVizMode = normalizeSectionVizMode(sectionVizSelect.value);
    localStorage.setItem(CONSTANTS.SECTION_VIZ_STORAGE_KEY, state.sectionVizMode);
    draw(state);
  });
  snapBtn?.addEventListener("click", () => {
    state.snapEnabled = !state.snapEnabled;
    localStorage.setItem(CONSTANTS.TIMELINE_SNAP_STORAGE_KEY, state.snapEnabled ? "1" : "0");
    updateSnapButton();
    draw(state);
  });
  skeletonModeBtn?.addEventListener("click", () => {
    state.skeletonMode = !state.skeletonMode;
    localStorage.setItem(CONSTANTS.SKELETON_MODE_STORAGE_KEY, state.skeletonMode ? "1" : "0");
    updateSkeletonModeButton();
    draw(state);
  });

  updateSnapButton();
  updateSkeletonModeButton();

  return {
    togglePlayPause,
    updatePlayPauseButton,
    resetTemporalZoom,
  };
}

