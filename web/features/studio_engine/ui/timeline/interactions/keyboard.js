export function isTextLikeTarget(target) {
  if (!target || typeof target !== "object") return false;
  const element = target;
  if (element.isContentEditable) return true;
  const tag = String(element.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function createTimelineKeyboardHandlers({
  state,
  canvas,
  renderFooter,
  togglePlayPause,
  renderOverview,
  nudgeSelectedClip,
  draw,
}) {
  const onKeyDown = (event) => {
    if (!event) return;
    state.keyModifiers.ctrl = Boolean(event.ctrlKey);
    state.keyModifiers.shift = Boolean(event.shiftKey);
    state.keyModifiers.alt = Boolean(event.altKey);
    renderFooter(state);
    if (event.defaultPrevented) return;
    if (isTextLikeTarget(event.target)) return;
    const key = String(event.key || "");
    const isSpace = key === " " || key === "Spacebar" || String(event.code || "") === "Space";
    if (isSpace) {
      if (event.repeat) return;
      event.preventDefault();
      togglePlayPause();
      return;
    }
    const lowerKey = key.toLowerCase();
    const modifierDown = Boolean(event.ctrlKey || event.metaKey);
    if (modifierDown && !event.altKey) {
      const wantsUndo = lowerKey === "z" && !event.shiftKey;
      const wantsRedo = lowerKey === "y" || (lowerKey === "z" && event.shiftKey);
      if (wantsUndo && typeof state.onUndo === "function") {
        event.preventDefault();
        const accepted = Boolean(state.onUndo());
        if (accepted) renderOverview(state);
        return;
      }
      if (wantsRedo && typeof state.onRedo === "function") {
        event.preventDefault();
        const accepted = Boolean(state.onRedo());
        if (accepted) renderOverview(state);
        return;
      }
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      const direction = key === "ArrowRight" ? 1 : -1;
      nudgeSelectedClip(direction, { coarse: event.shiftKey });
    }
  };

  const onKeyUp = (event) => {
    state.keyModifiers.ctrl = Boolean(event?.ctrlKey);
    state.keyModifiers.shift = Boolean(event?.shiftKey);
    state.keyModifiers.alt = Boolean(event?.altKey);
    renderFooter(state);
    const key = String(event?.key || "");
    let changed = false;
    if (key === "Alt" && state.cutPreview) {
      state.cutPreview = null;
      changed = true;
    }
    if (key === "Control" && state.joinPreview) {
      state.joinPreview = null;
      changed = true;
    }
    if (changed) {
      if (!state.panningX && !state.scrubbing && !state.resizingSection) {
        canvas.style.cursor = "";
      }
      draw(state);
    }
  };

  return { onKeyDown, onKeyUp };
}
