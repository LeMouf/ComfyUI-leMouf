import { isRectContained, normalizeSelectionRect } from "./selection_geometry.js";

export function createTimelineBoxSelectionHandlers(deps = {}) {
  const {
    state,
    canvas,
    Utils,
    draw,
    renderOverview,
  } = deps;
  const beginBoxSelection = (event, x, y, { additive = false } = {}) => {
    state.boxSelection = {
      pointerId: event.pointerId,
      x0: Number(x),
      y0: Number(y),
      x1: Number(x),
      y1: Number(y),
      additive: Boolean(additive),
    };
    state.pendingTrackPointer = null;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    canvas.style.cursor = "crosshair";
    draw(state);
  };

  const updateBoxSelection = (event) => {
    if (!state.boxSelection) return false;
    const box = state.boxSelection;
    if (box.pointerId != null && event.pointerId !== box.pointerId) return false;
    const rect = canvas.getBoundingClientRect();
    box.x1 = Utils.clamp(event.clientX - rect.left, 0, canvas.clientWidth);
    box.y1 = Utils.clamp(event.clientY - rect.top, 0, canvas.clientHeight);
    draw(state);
    return true;
  };

  const finalizeBoxSelection = (event, cancelled = false) => {
    if (!state.boxSelection) return false;
    const box = state.boxSelection;
    if (box.pointerId != null && event.pointerId !== box.pointerId) return false;
    const normalized = normalizeSelectionRect(box);
    state.boxSelection = null;
    canvas.style.cursor = "";
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    if (!cancelled && normalized) {
      const hitClips = Array.isArray(state.hitRegions)
        ? state.hitRegions.filter((region) => String(region?.payload?.type || "") === "clip")
        : [];
      const selectedKeys = new Set();
      for (const region of hitClips) {
        const regionRect = normalizeSelectionRect(region);
        if (!regionRect || !isRectContained(normalized, regionRect)) continue;
        const key = String(region?.payload?.clip_selection_key || "").trim();
        if (!key) continue;
        selectedKeys.add(key);
      }
      if (!(state.selectedClipKeys instanceof Set)) state.selectedClipKeys = new Set();
      if (!box.additive) state.selectedClipKeys.clear();
      for (const key of selectedKeys) state.selectedClipKeys.add(key);
      if (selectedKeys.size > 0) {
        const firstRegion = hitClips.find((region) => {
          const key = String(region?.payload?.clip_selection_key || "").trim();
          return key && selectedKeys.has(key);
        });
        if (firstRegion?.payload) {
          state.selection = {
            ...(firstRegion.payload || {}),
            type: "clip",
          };
        }
      } else if (!box.additive) {
        state.selection = null;
      }
    }
    draw(state);
    renderOverview(state);
    return true;
  };


  return {
    beginBoxSelection,
    updateBoxSelection,
    finalizeBoxSelection,
  };
}
