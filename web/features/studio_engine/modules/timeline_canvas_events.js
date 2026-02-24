export function createTimelineCanvasHandlers(deps = {}) {
  const {
    state,
    canvas,
    CONSTANTS,
    Utils,
    draw,
    renderOverview,
    hitTest,
    ContextMenu,
    clearDropHint,
    isPointInSectionResizeHandle,
    beginSectionResize,
    beginPanX,
    beginScrub,
    updateScrub,
    beginMutePaint,
    updateMutePaint,
    endMutePaint,
    toggleClipSelectionFromHit,
    isTrackLocked,
    isCuttableTrackKind,
    resolveCutTimeSecForHit,
    resolveTrimKeepSideForHit,
    beginClipEdit,
    handleHit,
    beginBoxSelection,
    updateBoxSelection,
    finalizeBoxSelection,
    updateClipEdit,
    resolveCutPreview,
    updateSectionResize,
    updatePanX,
    finalizeClipEdit,
    endSectionResize,
    endPanX,
    endScrub,
    clearClipSelectionSet,
    collectSelectedClipIdsForTrack,
    resolveVisibleSectionHeight,
    normalizeTrackRowScale,
    getMinPxPerSec,
    clampTimelineOffsetSec,
  } = deps;

  const onContextMenuCtrlSelect = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitTest(state, x, y);
    if (!(event.ctrlKey || event.metaKey) || String(hit?.type || "") !== "clip") return;
    const trackKind = String(hit?.track_kind || "").toLowerCase();
    if (trackKind !== "video" && trackKind !== "image" && trackKind !== "audio") return;
    if (!toggleClipSelectionFromHit(state, hit)) return;
    state.selection = {
      ...(hit || {}),
      type: "clip",
      clip_id: String(hit?.clip_id || ""),
      resource_id: String(hit?.resource_id || ""),
      track_name: String(hit?.track_name || ""),
      t0_sec: Math.max(0, Number(hit?.t0_sec || 0)),
      t1_sec: Math.max(
        Math.max(0, Number(hit?.t0_sec || 0)) + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(hit?.t1_sec || 0)
      ),
    };
    draw(state);
    renderOverview(state);
  };

  const onContextMenuTrack = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitTest(state, x, y);
    const trackContext = ContextMenu.resolveTrackContextFromPoint(state, x, y, hit, {
      hitTest,
      collectSelectedClipIdsForTrack,
      isTrackLocked,
    });
    if (!trackContext) return;
    event.preventDefault();
    ContextMenu.openTrackContextMenu(state, event.clientX, event.clientY, trackContext, {
      isTrackLocked,
      clearClipSelectionSet,
      draw,
      renderOverview,
    });
  };

  const onPointerDown = (event) => {
    ContextMenu.closeTrackContextMenu(state);
    clearDropHint(false);
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const sectionHeight = resolveVisibleSectionHeight(state, canvas.clientHeight);
    const trackAreaTop = CONSTANTS.RULER_HEIGHT + sectionHeight;
    const panBandLimit = CONSTANTS.RULER_HEIGHT + Math.min(sectionHeight, 26);
    if (isPointInSectionResizeHandle(state, canvas.clientWidth, x, y)) {
      beginSectionResize(event);
      return;
    }
    if (x >= CONSTANTS.LEFT_GUTTER && y <= panBandLimit) {
      beginPanX(event);
      return;
    }
    if (x >= CONSTANTS.LEFT_GUTTER && y <= CONSTANTS.RULER_HEIGHT + sectionHeight) {
      beginScrub(event);
      updateScrub(event);
      return;
    }
    const hit = hitTest(state, x, y);
    if ((event.ctrlKey || event.metaKey) && !event.altKey && hit?.type === "clip") {
      if (toggleClipSelectionFromHit(state, hit)) {
        state.selection = {
          ...(hit || {}),
          type: "clip",
        };
        draw(state);
        renderOverview(state);
      }
      return;
    }
    if (
      event.ctrlKey &&
      hit?.type === "clip_join" &&
      typeof state.onClipJoin === "function"
    ) {
      if (isTrackLocked(state, String(hit?.track_name || "").trim())) return;
      const accepted = Boolean(
        state.onClipJoin({
          trackName: String(hit?.track_name || "").trim(),
          trackKind: String(hit?.track_kind || "").trim().toLowerCase(),
          leftClipId: String(hit?.left_clip_id || "").trim(),
          leftResourceId: String(hit?.left_resource_id || "").trim(),
          rightClipId: String(hit?.right_clip_id || "").trim(),
          rightResourceId: String(hit?.right_resource_id || "").trim(),
          joinTimeSec: Math.max(0, Number(hit?.join_time_sec || 0)),
        })
      );
      state.cutPreview = null;
      state.joinPreview = null;
      clearClipSelectionSet(state);
      draw(state);
      if (accepted) renderOverview(state);
      return;
    }
    if (hit?.type === "track_mute") {
      beginMutePaint(event, hit.track_name);
      return;
    }
    if (
      event.altKey &&
      hit?.type === "clip" &&
      isCuttableTrackKind(hit?.track_kind) &&
      (typeof state.onClipCut === "function" || typeof state.onClipTrim === "function")
    ) {
      if (isTrackLocked(state, String(hit?.track_name || "").trim())) return;
      const cutTimeSec = resolveCutTimeSecForHit(state, hit, x);
      if (cutTimeSec != null) {
        const payload = {
          clipId: String(hit?.clip_id || "").trim(),
          resourceId: String(hit?.resource_id || "").trim(),
          trackName: String(hit?.track_name || "").trim(),
          trackKind: String(hit?.track_kind || "").trim().toLowerCase(),
          cutTimeSec,
        };
        const trimRequested = Boolean(event.ctrlKey);
        const keepSide = resolveTrimKeepSideForHit(hit, cutTimeSec);
        const accepted = trimRequested
          ? Boolean(
              typeof state.onClipTrim === "function"
                ? state.onClipTrim({ ...payload, keepSide })
                : state.onClipCut?.(payload)
            )
          : Boolean(state.onClipCut?.(payload));
        state.cutPreview = null;
        draw(state);
        if (accepted) renderOverview(state);
        return;
      }
    }
    if (
      hit?.type === "clip_trim_start" ||
      hit?.type === "clip_trim_end" ||
      hit?.type === "clip_window" ||
      hit?.type === "clip_window_rail" ||
      hit?.type === "clip"
    ) {
      if (beginClipEdit(event, hit, x)) return;
      handleHit(hit);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && x >= CONSTANTS.LEFT_GUTTER && y >= trackAreaTop && !hit) {
      beginBoxSelection(event, x, y, { additive: true });
      return;
    }
    if (x >= CONSTANTS.LEFT_GUTTER && y >= trackAreaTop) {
      state.pendingTrackPointer = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startT0Sec: state.t0Sec,
      };
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch {}
      return;
    }
    handleHit(hit);
  };

  const onPointerMove = (event) => {
    updateMutePaint(event);
    if (state.mutePaintActive) return;
    if (updateBoxSelection(event)) return;
    if (updateClipEdit(event)) return;
    if (
      state.pendingTrackPointer &&
      state.pendingTrackPointer.pointerId === event.pointerId &&
      !state.panningX &&
      !state.scrubbing &&
      !state.resizingSection
    ) {
      const dx = event.clientX - state.pendingTrackPointer.startClientX;
      const dy = event.clientY - state.pendingTrackPointer.startClientY;
      if (Math.hypot(dx, dy) > 3) {
        state.panningX = true;
        state.panPointerId = event.pointerId;
        state.panStartClientX = state.pendingTrackPointer.startClientX;
        state.panStartT0Sec = state.pendingTrackPointer.startT0Sec;
        state.autoFit = false;
        canvas.style.cursor = "grabbing";
        state.pendingTrackPointer = null;
      }
    }
    if (
      !state.panningX &&
      !state.scrubbing &&
      !state.resizingSection &&
      !state.pendingTrackPointer &&
      (event.ctrlKey || event.altKey)
    ) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hover = hitTest(state, x, y);
      const hoverTrackName = String(hover?.track_name || "").trim();
      const hoverTrackLocked = hoverTrackName ? isTrackLocked(state, hoverTrackName) : false;
      const joinModifierDown = Boolean(event.ctrlKey);
      const cutModifierDown = Boolean(event.altKey);
      if (
        !hoverTrackLocked &&
        joinModifierDown &&
        hover?.type === "clip_join" &&
        typeof state.onClipJoin === "function"
      ) {
        const prevJoinKey = state.joinPreview
          ? `${state.joinPreview.left_clip_id}:${state.joinPreview.right_clip_id}:${Number(state.joinPreview.join_time_sec || 0).toFixed(4)}`
          : "";
        const nextJoinKey = `${String(hover?.left_clip_id || "")}:${String(hover?.right_clip_id || "")}:${Number(hover?.join_time_sec || 0).toFixed(4)}`;
        state.joinPreview = hover;
        if (state.cutPreview) state.cutPreview = null;
        canvas.style.cursor = CONSTANTS.JOIN_CURSOR;
        if (prevJoinKey !== nextJoinKey) draw(state);
      } else if (!hoverTrackLocked && cutModifierDown) {
        const previewMode = event.ctrlKey ? "trim" : "cut";
        const preview = resolveCutPreview(state, x, y, previewMode);
        const prevKey = state.cutPreview
          ? `${state.cutPreview.mode || "cut"}:${state.cutPreview.keepSide || "left"}:${state.cutPreview.clipId}:${Number(state.cutPreview.cutTimeSec || 0).toFixed(4)}`
          : "";
        const nextKey = preview
          ? `${preview.mode || "cut"}:${preview.keepSide || "left"}:${preview.clipId}:${Number(preview.cutTimeSec || 0).toFixed(4)}`
          : "";
        state.cutPreview = preview;
        if (state.joinPreview) state.joinPreview = null;
        canvas.style.cursor = preview ? CONSTANTS.SCISSORS_CURSOR : "";
        if (prevKey !== nextKey) draw(state);
      } else {
        if (state.cutPreview || state.joinPreview) {
          state.cutPreview = null;
          state.joinPreview = null;
          draw(state);
        }
      }
    } else if (state.cutPreview || state.joinPreview) {
      state.cutPreview = null;
      state.joinPreview = null;
      if (!state.panningX && !state.scrubbing && !state.resizingSection) {
        canvas.style.cursor = "";
      }
      draw(state);
    }
    if (!state.panningX && !state.scrubbing && !state.resizingSection && !state.pendingTrackPointer) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hover = hitTest(state, x, y);
      const hoverTrackName = String(hover?.track_name || "").trim();
      const hoverTrackLocked = hoverTrackName ? isTrackLocked(state, hoverTrackName) : false;
      if (hoverTrackLocked && hover?.type && hover?.type !== "track_mute" && hover?.type !== "track_channel_toggle") {
        canvas.style.cursor = "not-allowed";
      } else if (event.ctrlKey && hover?.type === "clip_join" && typeof state.onClipJoin === "function") {
        canvas.style.cursor = CONSTANTS.JOIN_CURSOR;
      } else if (event.altKey && hover?.type === "clip" && isCuttableTrackKind(hover?.track_kind)) {
        canvas.style.cursor = CONSTANTS.SCISSORS_CURSOR;
      } else if (
        hover?.type === "clip_trim_start" ||
        hover?.type === "clip_trim_end" ||
        hover?.type === "clip_window" ||
        hover?.type === "clip_window_rail"
      ) {
        canvas.style.cursor = "ew-resize";
      } else if (hover?.type === "clip") {
        canvas.style.cursor = "grab";
      } else {
        canvas.style.cursor = isPointInSectionResizeHandle(state, canvas.clientWidth, x, y) ? "ns-resize" : "";
      }
    }
    updateSectionResize(event);
    updatePanX(event);
    updateScrub(event);
  };

  const onPointerUp = (event) => {
    if (state.mutePaintActive) {
      endMutePaint(event);
      return;
    }
    if (finalizeBoxSelection(event, false)) return;
    if (finalizeClipEdit(event, false)) return;
    if (
      state.pendingTrackPointer &&
      state.pendingTrackPointer.pointerId === event.pointerId &&
      !state.panningX &&
      !state.scrubbing
    ) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = hitTest(state, x, y);
      handleHit(hit);
      state.pendingTrackPointer = null;
      try {
        canvas.releasePointerCapture?.(event.pointerId);
      } catch {}
    }
    endSectionResize(event);
    endPanX(event);
    endScrub(event);
  };

  const onPointerCancel = (event) => {
    if (state.mutePaintActive) {
      endMutePaint(event);
      return;
    }
    if (finalizeBoxSelection(event, true)) return;
    if (finalizeClipEdit(event, true)) return;
    if (state.pendingTrackPointer && state.pendingTrackPointer.pointerId === event.pointerId) {
      state.pendingTrackPointer = null;
    }
    endSectionResize(event);
    endPanX(event);
    endScrub(event);
  };

  const onWheel = (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inTimelineArea = x >= CONSTANTS.LEFT_GUTTER;
    if (event.ctrlKey || event.metaKey) {
      if (!state.compactMode) {
        const prevScale = normalizeTrackRowScale(state.trackRowScale);
        const scaleFactor = Math.exp(-event.deltaY * 0.001);
        const nextScale = Utils.clamp(prevScale * scaleFactor, CONSTANTS.TRACK_ROW_SCALE_MIN, CONSTANTS.TRACK_ROW_SCALE_MAX);
        if (Math.abs(nextScale - prevScale) > 0.0001) {
          const sectionHeight = resolveVisibleSectionHeight(state, canvas.clientHeight);
          const trackAreaTop = CONSTANTS.RULER_HEIGHT + sectionHeight;
          const localTrackY = Math.max(0, y - trackAreaTop);
          const anchorContentY = state.scrollY + localTrackY;
          state.trackRowScale = nextScale;
          localStorage.setItem(CONSTANTS.TRACK_ROW_SCALE_STORAGE_KEY, String(nextScale));
          const ratio = nextScale / Math.max(1e-6, prevScale);
          state.scrollY = Math.max(0, anchorContentY * ratio - localTrackY);
        }
      }
    } else if (inTimelineArea && !event.shiftKey && !event.altKey) {
      const timelineWidth = Math.max(1, canvas.clientWidth - CONSTANTS.LEFT_GUTTER);
      const fallbackAnchorX = CONSTANTS.LEFT_GUTTER + timelineWidth * 0.5;
      const anchorX = x >= CONSTANTS.LEFT_GUTTER && x <= canvas.clientWidth ? x : fallbackAnchorX;
      state.autoFit = false;
      const anchorTime = state.t0Sec + (anchorX - CONSTANTS.LEFT_GUTTER) / state.pxPerSec;
      const scale = Math.exp(-event.deltaY * 0.001);
      const next = Utils.clamp(state.pxPerSec * scale, getMinPxPerSec(state), CONSTANTS.MAX_PX_PER_SEC);
      state.pxPerSec = next;
      const nextT0 = anchorTime - (anchorX - CONSTANTS.LEFT_GUTTER) / next;
      state.t0Sec = clampTimelineOffsetSec(state, nextT0);
    } else if (event.shiftKey) {
      state.autoFit = false;
      state.t0Sec = clampTimelineOffsetSec(state, state.t0Sec + event.deltaY / state.pxPerSec);
    } else {
      state.scrollY += event.deltaY;
    }
    draw(state);
  };

  const onDoubleClick = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!isPointInSectionResizeHandle(state, canvas.clientWidth, x, y)) return;
    state.sectionHeight = CONSTANTS.DEFAULT_SECTION_HEIGHT;
    localStorage.setItem(CONSTANTS.SECTION_HEIGHT_STORAGE_KEY, String(CONSTANTS.DEFAULT_SECTION_HEIGHT));
    draw(state);
  };

  const onPointerLeave = () => {
    if (!state.cutPreview && !state.joinPreview) return;
    if (state.panningX || state.scrubbing || state.resizingSection) return;
    state.cutPreview = null;
    state.joinPreview = null;
    canvas.style.cursor = "";
    draw(state);
  };

  return {
    onContextMenuCtrlSelect,
    onContextMenuTrack,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onWheel,
    onDoubleClick,
    onPointerLeave,
  };
}

