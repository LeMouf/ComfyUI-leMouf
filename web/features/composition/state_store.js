const manualResourcesByScope = new Map();
const placementByScope = new Map();
const timelineViewByScope = new Map();

function normalizeScopeKey(scopeKey) {
  const key = String(scopeKey || "default").trim();
  return key || "default";
}

export function scopeKeyFromDetail(detail) {
  const key = detail?.loop_id ?? detail?.id ?? "default";
  return normalizeScopeKey(key);
}

export function getManualResources(scopeKey) {
  const rows = manualResourcesByScope.get(normalizeScopeKey(scopeKey));
  return Array.isArray(rows) ? rows.slice() : [];
}

export function appendManualResources(scopeKey, resources) {
  const key = normalizeScopeKey(scopeKey);
  const current = getManualResources(key);
  const additions = Array.isArray(resources) ? resources : [];
  manualResourcesByScope.set(key, current.concat(additions));
}

export function clearManualResources(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  manualResourcesByScope.delete(key);
  placementByScope.delete(key);
}

export function getPlacementMap(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  if (!placementByScope.has(key)) placementByScope.set(key, new Map());
  return placementByScope.get(key);
}

export function getTimelineViewState(scopeKey) {
  return timelineViewByScope.get(normalizeScopeKey(scopeKey)) || null;
}

export function setTimelineViewState(scopeKey, snapshot) {
  const key = normalizeScopeKey(scopeKey);
  if (!snapshot || typeof snapshot !== "object") {
    timelineViewByScope.delete(key);
    return;
  }
  timelineViewByScope.set(key, snapshot);
}
