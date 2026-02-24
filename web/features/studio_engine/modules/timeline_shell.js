export function createTimelineShell(config = {}) {
  const {
    body,
    compactMode = false,
    onOpenRunDir,
    el,
    setButtonIcon,
  } = config;

  const toolbar = el("div", { class: "lemouf-song2daw-studio-toolbar" });
  const controls = el("div", { class: "lemouf-song2daw-studio-toolbar-group" });
  const nav = el("div", { class: "lemouf-song2daw-studio-toolbar-group" });
  const overviewLabel = el("div", { class: "lemouf-song2daw-studio-toolbar-overview", text: "" });
  const statusLabel = el("div", { class: "lemouf-song2daw-studio-toolbar-status", text: "Stopped · 0.00s" });

  const playPauseBtn = el("button", { class: "lemouf-loop-btn icon", type: "button" });
  const stopBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const undoBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const redoBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const clearStudioBtn = el("button", { class: "lemouf-loop-btn debug icon", type: "button" });
  setButtonIcon(playPauseBtn, { icon: "play", title: "Play" });
  setButtonIcon(stopBtn, { icon: "stop", title: "Stop" });
  setButtonIcon(undoBtn, { icon: "undo", title: "Undo (Ctrl+Z)" });
  setButtonIcon(redoBtn, { icon: "redo", title: "Redo (Ctrl+Y)" });
  setButtonIcon(clearStudioBtn, { icon: "clear_resources", title: "Clear studio (empty project)" });
  controls.append(playPauseBtn, stopBtn, undoBtn, redoBtn, clearStudioBtn);

  const fitBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const snapBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  setButtonIcon(fitBtn, { icon: "fit", title: "Fit timeline to viewport" });
  setButtonIcon(snapBtn, { icon: "snap_on", title: "Snap enabled" });
  const sectionVizSelect = el("select", { class: "lemouf-loop-select lemouf-song2daw-viz-select" });
  sectionVizSelect.append(
    el("option", { value: "bands", text: "Viz: Bands" }),
    el("option", { value: "filled", text: "Viz: Filled" }),
    el("option", { value: "peaks", text: "Viz: Peaks" }),
    el("option", { value: "line", text: "Viz: Line" }),
    el("option", { value: "dots", text: "Viz: Dots" })
  );
  const jumpBtn = el("button", { class: "lemouf-loop-btn alt", text: "Step", type: "button" });
  jumpBtn.style.display = "none";
  nav.append(fitBtn, snapBtn, sectionVizSelect, jumpBtn);
  if (typeof onOpenRunDir === "function") {
    const openBtn = el("button", { class: "lemouf-loop-btn alt", text: "Open run_dir", type: "button" });
    openBtn.addEventListener("click", () => onOpenRunDir());
    nav.appendChild(openBtn);
  }
  toolbar.append(controls, nav, overviewLabel, statusLabel);

  const layout = el("div", { class: "lemouf-song2daw-studio-layout" });
  const canvasWrap = el("div", { class: "lemouf-song2daw-arrange-canvas-wrap" });
  const canvas = el("canvas", { class: "lemouf-song2daw-arrange-canvas" });
  canvasWrap.appendChild(canvas);
  layout.append(canvasWrap);
  const footer = el("div", { class: "lemouf-song2daw-studio-footer" });
  const shortcutsGroup = el("div", {
    class: "lemouf-song2daw-studio-footer-group lemouf-song2daw-studio-footer-shortcuts-wrap",
  });
  const shortcutsLabel = el("span", { class: "lemouf-song2daw-studio-footer-shortcuts", text: "" });
  shortcutsGroup.append(shortcutsLabel);
  const footerActions = el("div", { class: "lemouf-song2daw-studio-footer-actions" });
  const zoomGroup = el("div", { class: "lemouf-song2daw-studio-footer-group" });
  const zoomLabel = el("span", { class: "lemouf-song2daw-studio-footer-zoom", text: "zoom n/a" });
  const zoomResetBtn = el("button", { class: "lemouf-loop-btn alt icon", type: "button" });
  const skeletonModeBtn = el("button", { class: "lemouf-loop-btn debug icon", type: "button" });
  setButtonIcon(zoomResetBtn, { icon: "zoom_reset", title: "Reset temporal zoom" });
  setButtonIcon(skeletonModeBtn, { icon: "skeleton_mode", title: "Enable skeleton mode (debug)" });
  zoomGroup.append(zoomLabel, zoomResetBtn, skeletonModeBtn);
  footerActions.append(zoomGroup);
  footer.append(shortcutsGroup, footerActions);
  body.append(toolbar, layout, footer);
  body.classList.toggle("lemouf-song2daw-studio-body-compact", compactMode);

  return {
    toolbar,
    layout,
    canvasWrap,
    canvas,
    footer,
    overviewLabel,
    statusLabel,
    playPauseBtn,
    stopBtn,
    undoBtn,
    redoBtn,
    clearStudioBtn,
    fitBtn,
    snapBtn,
    sectionVizSelect,
    jumpBtn,
    shortcutsLabel,
    zoomLabel,
    zoomResetBtn,
    skeletonModeBtn,
  };
}

