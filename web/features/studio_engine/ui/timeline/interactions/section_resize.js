export function getSectionResizeHandleRect(state, width, deps = {}) {
  const { CONSTANTS, normalizeSectionHeight } = deps;
  if (state?.compactMode) return null;
  const sectionHeight = normalizeSectionHeight(state.sectionHeight);
  const y0 = CONSTANTS.RULER_HEIGHT + sectionHeight - CONSTANTS.SECTION_RESIZE_HANDLE_HEIGHT;
  return {
    x0: CONSTANTS.LEFT_GUTTER,
    x1: Math.max(CONSTANTS.LEFT_GUTTER + 1, width),
    y0,
    y1: y0 + CONSTANTS.SECTION_RESIZE_HANDLE_HEIGHT,
  };
}

export function isPointInSectionResizeHandle(state, width, x, y, deps = {}) {
  const rect = getSectionResizeHandleRect(state, width, deps);
  if (!rect) return false;
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}
