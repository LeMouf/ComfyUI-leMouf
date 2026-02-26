export function normalizeSelectionRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const x0 = Number(rect.x0);
  const y0 = Number(rect.y0);
  const x1 = Number(rect.x1);
  const y1 = Number(rect.y1);
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return null;
  return {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };
}

export function isRectContained(container, inner) {
  if (!container || !inner) return false;
  return (
    inner.x0 >= container.x0 &&
    inner.y0 >= container.y0 &&
    inner.x1 <= container.x1 &&
    inner.y1 <= container.y1
  );
}

