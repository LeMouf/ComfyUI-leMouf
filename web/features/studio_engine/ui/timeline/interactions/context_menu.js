import { el } from "../../../../../shared/ui/dom.js";
import { clamp, compactText } from "../../../domain/shared/utils.js";

export function resolveTrackContextFromPoint(state, x, y, hit = null, {
  hitTest = null,
  collectSelectedClipIdsForTrack = () => [],
  isTrackLocked = () => false,
} = {}) {
  const payload = hit && typeof hit === "object"
    ? hit
    : (typeof hitTest === "function" ? hitTest(state, x, y) : null);
  const payloadTrackName = String(payload?.track_name || "").trim();
  const payloadTrackKind = String(payload?.track_kind || "").trim().toLowerCase();
  if (payloadTrackName) {
    const selectedClipIds = collectSelectedClipIdsForTrack(state, payloadTrackName);
    const focusClipId = String(payload?.clip_id || "").trim();
    if (focusClipId && !selectedClipIds.includes(focusClipId)) selectedClipIds.push(focusClipId);
    return {
      trackName: payloadTrackName,
      trackKind: payloadTrackKind,
      selectedClipIds,
      selectedClipCount: selectedClipIds.length,
      focusClipId,
      focusResourceId: String(payload?.resource_id || "").trim(),
      focusLinkGroupId: String(payload?.link_group_id || "").trim(),
      locked: isTrackLocked(state, payloadTrackName),
    };
  }
  const rows = Array.isArray(state?.trackRows) ? state.trackRows : [];
  const row = rows.find((entry) => y >= Number(entry?.rowTop || 0) && y <= Number(entry?.rowBottom || 0));
  if (!row || !row.track) return null;
  const rowTrackName = String(row.track?.name || "").trim();
  if (!rowTrackName) return null;
  const selectedClipIds = collectSelectedClipIdsForTrack(state, rowTrackName);
  return {
    trackName: rowTrackName,
    trackKind: String(row.track?.kind || "").trim().toLowerCase(),
    selectedClipIds,
    selectedClipCount: selectedClipIds.length,
    focusClipId: "",
    focusResourceId: "",
    focusLinkGroupId: "",
    locked: isTrackLocked(state, rowTrackName),
  };
}

export function closeTrackContextMenu(state) {
  const menuState = state?.trackContextMenu;
  if (!menuState) return;
  try {
    document.removeEventListener("pointerdown", menuState.onPointerDownCapture, true);
    document.removeEventListener("keydown", menuState.onKeyDownCapture, true);
    window.removeEventListener("blur", menuState.onWindowBlur);
  } catch {}
  try {
    menuState.root?.remove?.();
  } catch {}
  try {
    if (state?.canvas && menuState.prevCanvasPointerEvents != null) {
      state.canvas.style.pointerEvents = menuState.prevCanvasPointerEvents;
    }
  } catch {}
  state.trackContextMenu = null;
}

export function releaseTimelinePointerCaptures(state) {
  const canvas = state?.canvas;
  if (!canvas || typeof canvas.releasePointerCapture !== "function") return;
  const pointerIds = new Set();
  const pushPointerId = (value) => {
    const id = Number(value);
    if (Number.isFinite(id)) pointerIds.add(id);
  };
  pushPointerId(state?.mutePaintPointerId);
  pushPointerId(state?.scrubPointerId);
  pushPointerId(state?.resizeSectionPointerId);
  pushPointerId(state?.panPointerId);
  pushPointerId(state?.clipEditSession?.pointerId);
  pushPointerId(state?.boxSelection?.pointerId);
  pushPointerId(state?.pendingTrackPointer?.pointerId);
  for (const id of pointerIds.values()) {
    try {
      if (typeof canvas.hasPointerCapture === "function" && !canvas.hasPointerCapture(id)) continue;
      canvas.releasePointerCapture(id);
    } catch {}
  }
  // Safety net: release any lingering pointer captures not tracked in state.
  try {
    if (typeof canvas.hasPointerCapture === "function") {
      for (let id = 0; id <= 32; id += 1) {
        if (!canvas.hasPointerCapture(id)) continue;
        try {
          canvas.releasePointerCapture(id);
        } catch {}
      }
    }
  } catch {}
  state.mutePaintPointerId = null;
  state.scrubPointerId = null;
  state.resizeSectionPointerId = null;
  state.panPointerId = null;
  if (state.clipEditSession && typeof state.clipEditSession === "object") {
    state.clipEditSession.pointerId = null;
  }
  if (state.boxSelection && typeof state.boxSelection === "object") {
    state.boxSelection.pointerId = null;
  }
  if (state.pendingTrackPointer && typeof state.pendingTrackPointer === "object") {
    state.pendingTrackPointer.pointerId = null;
  }
}

export function openTrackContextMenu(state, clientX, clientY, context, {
  isTrackLocked = () => false,
  clearClipSelectionSet = () => {},
  draw = () => {},
  renderOverview = () => {},
} = {}) {
  closeTrackContextMenu(state);
  releaseTimelinePointerCaptures(state);
  const trackName = String(context?.trackName || "").trim();
  if (!trackName) return;
  const trackKind = String(context?.trackKind || "").trim().toLowerCase();
  const selectedClipIds = Array.isArray(context?.selectedClipIds) ? context.selectedClipIds : [];
  const selectedClipCount = Math.max(0, Number(context?.selectedClipCount || selectedClipIds.length || 0));
  const focusClipId = String(context?.focusClipId || "").trim();
  const focusResourceId = String(context?.focusResourceId || "").trim();
  const focusLinkGroupId = String(context?.focusLinkGroupId || "").trim();
  const locked = Boolean(context?.locked);
  const selectableClipCount = selectedClipCount > 0 ? selectedClipCount : (focusClipId ? 1 : 0);
  const root = el("div", {
    class: "lemouf-studio-track-context-menu",
    role: "menu",
    "aria-label": "Track context menu",
  });
  root.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  root.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  root.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const title = el("div", {
    class: "lemouf-studio-track-context-menu-title",
    text: compactText(trackName, 30),
  });
  const createMenuItem = ({ action, text, disabled = false, disabledReason = "" }) => {
    const button = el("button", {
      class: "lemouf-studio-track-context-menu-item",
      type: "button",
      text,
      role: "menuitem",
      disabled: Boolean(disabled),
      title: disabled && disabledReason ? String(disabledReason) : "",
    });
    if (disabled) button.classList.add("is-disabled");
    let actionDone = false;
    const runAction = () => {
      if (actionDone) return;
      actionDone = true;
      if (disabled) return;
      closeTrackContextMenu(state);
      const accepted = typeof state.onTrackContextAction === "function"
        ? Boolean(
          state.onTrackContextAction({
            action,
            trackName,
            trackKind,
            selectedClipIds: selectedClipIds.length
              ? selectedClipIds
              : (focusClipId ? [focusClipId] : []),
            focusClipId,
            focusResourceId,
            focusLinkGroupId,
            locked: isTrackLocked(state, trackName),
          })
        )
        : false;
      if (accepted && action === "toggle_lock_lane") {
        if (!state.lockedTracks) state.lockedTracks = new Set();
        if (state.lockedTracks.has(trackName)) state.lockedTracks.delete(trackName);
        else state.lockedTracks.add(trackName);
      }
      if (accepted && action === "delete_selected_clips") {
        clearClipSelectionSet(state);
      }
      if (accepted && action === "duplicate_selected_clips") {
        clearClipSelectionSet(state);
      }
      if (accepted && action === "clear_composition") {
        clearClipSelectionSet(state);
      }
      draw(state);
      if (accepted) renderOverview(state);
    };
    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("pointerup", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      runAction();
    });
    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      runAction();
    });
    button.addEventListener("mouseup", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      runAction();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runAction();
    });
    button.addEventListener("keydown", (event) => {
      const key = String(event?.key || "");
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      runAction();
    });
    return button;
  };
  const deleteLabel = selectableClipCount > 0
    ? `Delete selected clips (${selectableClipCount})`
    : "Delete selected clips";
  const deleteBtn = createMenuItem({
    action: "delete_selected_clips",
    text: deleteLabel,
    disabled: locked || selectableClipCount <= 0,
    disabledReason: locked
      ? "Lane is locked"
      : "Select a clip (or right click directly on a clip) to enable this action",
  });
  const duplicateSelectedLabel = selectableClipCount > 0
    ? `Duplicate selected clips (${selectableClipCount})`
    : "Duplicate selected clips";
  const duplicateSelectedBtn = createMenuItem({
    action: "duplicate_selected_clips",
    text: duplicateSelectedLabel,
    disabled: locked || selectableClipCount <= 0,
    disabledReason: locked
      ? "Lane is locked"
      : "Select a clip (or right click directly on a clip) to enable this action",
  });
  const duplicateBtn = createMenuItem({
    action: "duplicate_lane",
    text: "Duplicate lane",
  });
  const lockBtn = createMenuItem({
    action: "toggle_lock_lane",
    text: locked ? "Unlock lane" : "Lock lane",
  });
  const clearBtn = createMenuItem({
    action: "clear_composition",
    text: "Clear composition",
  });
  root.append(title, deleteBtn, duplicateSelectedBtn, duplicateBtn, lockBtn, clearBtn);
  document.body.appendChild(root);

  const padding = 8;
  const menuW = Math.max(1, root.offsetWidth || 220);
  const menuH = Math.max(1, root.offsetHeight || 74);
  const maxX = Math.max(padding, window.innerWidth - menuW - padding);
  const maxY = Math.max(padding, window.innerHeight - menuH - padding);
  const left = clamp(Number(clientX || 0), padding, maxX);
  const top = clamp(Number(clientY || 0), padding, maxY);
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;

  const onPointerDownCapture = (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    if (Array.isArray(path) && path.includes(root)) return;
    if (root.contains(event.target)) return;
    closeTrackContextMenu(state);
  };
  const onKeyDownCapture = (event) => {
    if (String(event?.key || "") === "Escape") {
      event.preventDefault();
      closeTrackContextMenu(state);
    }
  };
  const onWindowBlur = () => {
    closeTrackContextMenu(state);
  };
  document.addEventListener("pointerdown", onPointerDownCapture, true);
  document.addEventListener("keydown", onKeyDownCapture, true);
  window.addEventListener("blur", onWindowBlur);
  let prevCanvasPointerEvents = "";
  try {
    if (state?.canvas) {
      prevCanvasPointerEvents = String(state.canvas.style.pointerEvents || "");
      state.canvas.style.pointerEvents = "none";
    }
  } catch {}
  state.trackContextMenu = {
    root,
    onPointerDownCapture,
    onKeyDownCapture,
    onWindowBlur,
    prevCanvasPointerEvents,
  };
}
