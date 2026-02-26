export function createTimelineDndHandlers({
  state,
  canvas,
  Drop,
  CONSTANTS,
  Utils,
  draw,
  renderOverview,
  setupTrackAudioPlayers,
  syncTrackAudioMuteVolumes,
  syncTrackAudioPlayersToPlayhead,
  getTimelineMaxTimeSec,
  refreshTimelineViewAfterDurationChange,
  isTrackLocked,
  resolveVisibleSectionHeight,
  resolveAdjustedDropTarget,
}) {
  const clearDropTarget = (drawAfter = true) => {
    if (!state.dropTarget) return;
    state.dropTarget = null;
    if (drawAfter) draw(state);
  };

  const clearDropHint = (drawAfter = true) => {
    if (!state.dropHint) return;
    state.dropHint = null;
    if (drawAfter) draw(state);
  };

  const onDragOver = (event) => {
    if (typeof state.onDropResource !== "function") return;
    const payload = Drop.readResourceDragPayload(event.dataTransfer);
    if (!payload.resourceId) {
      clearDropTarget(false);
      clearDropHint(false);
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const target = Drop.resolveDropTargetFromPoint(state, x, y, payload.resourceKind, {
      isTrackLocked,
      resolveVisibleSectionHeight,
    });
    if (!target) {
      clearDropTarget();
      clearDropHint(false);
      return;
    }
    clearDropHint(false);
    const nextTarget = resolveAdjustedDropTarget(target, payload, {
      allowCreateLane: false,
      pointerCanvasX: x,
    });
    if (!nextTarget) {
      clearDropTarget();
      clearDropHint(false);
      return;
    }
    if (!Drop.sameDropTarget(state.dropTarget, nextTarget)) {
      state.dropTarget = nextTarget;
      draw(state);
    }
  };

  const onDragLeave = (event) => {
    if (!state.dropTarget && !state.dropHint) return;
    const rect = canvas.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) return;
    clearDropTarget();
    clearDropHint(false);
  };

  const onDrop = (event) => {
    if (typeof state.onDropResource !== "function") return;
    const payload = Drop.readResourceDragPayload(event.dataTransfer);
    if (!payload.resourceId) {
      clearDropTarget(false);
      clearDropHint(false);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const directTarget = Drop.resolveDropTargetFromPoint(state, x, y, payload.resourceKind, {
      isTrackLocked,
      resolveVisibleSectionHeight,
    });
    const fallbackTarget = state.dropTarget &&
      String(state.dropTarget?.resourceId || "") === String(payload.resourceId || "") &&
      Drop.isTrackDropCompatible(
        { kind: String(state.dropTarget?.trackKind || "") },
        payload.resourceKind
      ) &&
      !isTrackLocked(state, String(state.dropTarget?.trackName || "").trim())
      ? state.dropTarget
      : null;
    const target = directTarget || fallbackTarget;
    if (!target) {
      clearDropTarget();
      clearDropHint(false);
      return;
    }
    event.preventDefault();
    const finalTarget = resolveAdjustedDropTarget(target, payload, {
      allowCreateLane: true,
      pointerCanvasX: x,
    });
    clearDropTarget(false);
    clearDropHint(false);
    if (!finalTarget) {
      draw(state);
      return;
    }
    const acceptedResult = state.onDropResource({
      resourceId: payload.resourceId,
      resourceKind: finalTarget.resourceKind,
      trackName: finalTarget.trackName,
      trackKind: finalTarget.trackKind,
      timeSec: finalTarget.timeSec,
      insertMode: Boolean(finalTarget.insertMode),
      insertIndex: Number(finalTarget.insertIndex),
      rowIndex: Number(finalTarget.rowIndex),
    });
    const accepted = Boolean(acceptedResult);
    if (accepted) {
      const hintedDuration = Math.max(0, Number(state.studioData?.durationSec || 0));
      const computedDuration = Math.max(
        0,
        Number(getTimelineMaxTimeSec(state, { includePreview: true }) || 0)
      );
      const nextDuration = Math.max(1, hintedDuration, computedDuration);
      if (nextDuration > state.durationSec + 1e-6) {
        state.durationSec = nextDuration;
        refreshTimelineViewAfterDurationChange(state);
      }
      if (typeof state.onResolveAudioUrl === "function") {
        setupTrackAudioPlayers(state, state.onResolveAudioUrl);
        syncTrackAudioMuteVolumes(state);
      }
      if (state.isPlaying) {
        syncTrackAudioPlayersToPlayhead(state, { play: true, forceSeek: true });
      }
    }
    draw(state);
    if (accepted) renderOverview(state);
  };

  return {
    clearDropTarget,
    clearDropHint,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
