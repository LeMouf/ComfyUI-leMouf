const manualResourcesByScope = new Map();
const placementByScope = new Map();
const timelineViewByScope = new Map();
const layoutStateByScope = new Map();
const trackLocksByScope = new Map();
const scopeUpdatedAtByScope = new Map();
let stateChangeListener = null;

const PERSIST_VERSION = 1;
const PERSIST_MAX_SCOPES = 32;
const PERSIST_KEY = `lemouf:composition_state:v${PERSIST_VERSION}`;
const PERSIST_WRITE_DEBOUNCE_MS = 120;
let persistTimer = null;
let persistHookBound = false;

function isStorageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function isBlobUrl(value) {
  return String(value || "").trim().toLowerCase().startsWith("blob:");
}

function cloneJsonSafe(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizeManualResource(resource) {
  if (!resource || typeof resource !== "object") return null;
  const kind = String(resource.kind || "").toLowerCase();
  if (kind !== "image" && kind !== "audio" && kind !== "video") return null;
  const src = String(resource.src || "").trim();
  if (!src || isBlobUrl(src)) return null;
  const out = {
    id: String(resource.id || "").trim(),
    kind,
    cycle: Math.round(toFiniteNumber(resource.cycle, -1)),
    retry: Math.max(0, Math.round(toFiniteNumber(resource.retry, 0))),
    index: Math.max(0, Math.round(toFiniteNumber(resource.index, 0))),
    source: String(resource.source || "manual"),
    sectionId: String(resource.sectionId || "manual"),
    sectionOrder: toFiniteNumber(resource.sectionOrder, 0),
    sectionLabel: String(resource.sectionLabel || "Manual"),
    src,
    previewSrc: String(resource.previewSrc || "").trim(),
    label: String(resource.label || `${kind} resource`),
    meta: cloneJsonSafe(resource.meta && typeof resource.meta === "object" ? resource.meta : {}, {}),
  };
  if (!out.id) return null;
  if (kind === "video") {
    const audioState = String(resource.videoAudioState || "unknown").toLowerCase();
    out.videoAudioState =
      audioState === "with_audio" || audioState === "no_audio" || audioState === "unknown"
        ? audioState
        : "unknown";
  }
  return out;
}

function sanitizePlacementRecord(record = {}) {
  const out = {
    resourceId: String(record.resourceId || "").trim(),
    trackName: String(record.trackName || "").trim(),
    timeSec: Math.max(0, toFiniteNumber(record.timeSec, 0)),
    durationSec: Math.max(0.1, toFiniteNumber(record.durationSec, 0.1)),
    startOffsetSec: Math.max(0, toFiniteNumber(record.startOffsetSec, 0)),
    sourceDurationSec: Math.max(0.1, toFiniteNumber(record.sourceDurationSec, 0.1)),
    autoDuration: Boolean(record.autoDuration),
    linkGroupId: String(record.linkGroupId || "").trim(),
    clipId: String(record.clipId || record.placementKey || "").trim(),
  };
  if (!out.resourceId || !out.clipId) return null;
  return out;
}

function sanitizeTimelineViewState(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    autoFit: Boolean(snapshot.autoFit),
    pxPerSec: Math.max(0.0001, toFiniteNumber(snapshot.pxPerSec, 32)),
    t0Sec: Math.max(0, toFiniteNumber(snapshot.t0Sec, 0)),
    scrollY: Math.max(0, toFiniteNumber(snapshot.scrollY, 0)),
    trackRowScale: Math.max(0.6, Math.min(2.6, toFiniteNumber(snapshot.trackRowScale, 1))),
  };
}

function sanitizeLayoutState(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const splitPercent = Math.max(28, Math.min(72, toFiniteNumber(snapshot.splitPercent, 50)));
  const rowSplitPercent = Math.max(24, Math.min(76, toFiniteNumber(snapshot.rowSplitPercent, 50)));
  const sizeMode = String(snapshot.sizeMode || "large").toLowerCase() === "small" ? "small" : "large";
  const viewMode = String(snapshot.viewMode || "thumb").toLowerCase() === "list" ? "list" : "thumb";
  return { splitPercent, rowSplitPercent, sizeMode, viewMode };
}

function sanitizeTrackLocks(snapshot = null) {
  if (!snapshot) return [];
  const out = [];
  const seen = new Set();
  const values = Array.isArray(snapshot)
    ? snapshot
    : (snapshot instanceof Set ? Array.from(snapshot.values()) : Object.keys(snapshot));
  for (const value of values) {
    const name = String(value || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

class PersistedPlacementMap extends Map {
  constructor(scopeKey, entries = []) {
    super(entries);
    this._scopeKey = normalizeScopeKey(scopeKey);
  }

  set(key, value) {
    const out = super.set(key, value);
    markScopeTouched(this._scopeKey);
    schedulePersist();
    return out;
  }

  delete(key) {
    const changed = super.delete(key);
    if (changed) {
      markScopeTouched(this._scopeKey);
      schedulePersist();
    }
    return changed;
  }

  clear() {
    if (!this.size) return;
    super.clear();
    markScopeTouched(this._scopeKey);
    schedulePersist();
  }
}

function normalizeScopeKey(scopeKey) {
  const key = String(scopeKey || "default").trim();
  return key || "default";
}

function markScopeTouched(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  scopeUpdatedAtByScope.set(key, Date.now());
  if (typeof stateChangeListener === "function") {
    try {
      stateChangeListener(key);
    } catch {}
  }
}

function serializeScope(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  const manualResources = (manualResourcesByScope.get(key) || [])
    .map((row) => sanitizeManualResource(row))
    .filter(Boolean);
  const placementMap = placementByScope.get(key);
  const placements = [];
  if (placementMap && typeof placementMap.entries === "function") {
    for (const [placementKey, value] of placementMap.entries()) {
      const normalized = sanitizePlacementRecord(value);
      const safeKey = String(placementKey || "").trim();
      if (!normalized || !safeKey) continue;
      placements.push([safeKey, normalized]);
    }
  }
  const timelineView = sanitizeTimelineViewState(timelineViewByScope.get(key));
  const layoutState = sanitizeLayoutState(layoutStateByScope.get(key));
  const trackLocks = sanitizeTrackLocks(trackLocksByScope.get(key));
  const updatedAt = Math.max(0, toFiniteNumber(scopeUpdatedAtByScope.get(key), Date.now()));
  return {
    manualResources,
    placements,
    timelineView,
    layoutState,
    trackLocks,
    updatedAt,
  };
}

function applyScopeData(scopeKey, rawScopeData, { silent = false } = {}) {
  const key = normalizeScopeKey(scopeKey);
  const scopeData = rawScopeData && typeof rawScopeData === "object" ? rawScopeData : {};
  const manualResources = Array.isArray(scopeData.manualResources)
    ? scopeData.manualResources.map((row) => sanitizeManualResource(row)).filter(Boolean)
    : [];
  if (manualResources.length) {
    manualResourcesByScope.set(key, manualResources);
  } else {
    manualResourcesByScope.delete(key);
  }

  const placementEntries = Array.isArray(scopeData.placements) ? scopeData.placements : [];
  const entries = [];
  for (const row of placementEntries) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const placementKey = String(row[0] || "").trim();
    const normalized = sanitizePlacementRecord(row[1]);
    if (!placementKey || !normalized) continue;
    entries.push([placementKey, normalized]);
  }
  if (entries.length) {
    placementByScope.set(key, new PersistedPlacementMap(key, entries));
  } else {
    placementByScope.delete(key);
  }

  const timelineView = sanitizeTimelineViewState(scopeData.timelineView);
  if (timelineView) timelineViewByScope.set(key, timelineView);
  else timelineViewByScope.delete(key);

  const layoutState = sanitizeLayoutState(scopeData.layoutState);
  if (layoutState) layoutStateByScope.set(key, layoutState);
  else layoutStateByScope.delete(key);

  const trackLocks = sanitizeTrackLocks(scopeData.trackLocks);
  if (trackLocks.length) trackLocksByScope.set(key, trackLocks);
  else trackLocksByScope.delete(key);

  if (silent) {
    scopeUpdatedAtByScope.set(key, Math.max(0, toFiniteNumber(scopeData.updatedAt, Date.now())));
    return;
  }
  markScopeTouched(key);
  schedulePersist();
}

function flushPersist() {
  persistTimer = null;
  if (!isStorageAvailable()) return;
  const scopeKeys = new Set();
  for (const key of manualResourcesByScope.keys()) scopeKeys.add(key);
  for (const key of placementByScope.keys()) scopeKeys.add(key);
  for (const key of timelineViewByScope.keys()) scopeKeys.add(key);
  for (const key of layoutStateByScope.keys()) scopeKeys.add(key);
  for (const key of trackLocksByScope.keys()) scopeKeys.add(key);
  if (!scopeKeys.size) {
    try {
      window.localStorage.removeItem(PERSIST_KEY);
    } catch {}
    return;
  }

  const sortedKeys = Array.from(scopeKeys.values())
    .map((key) => normalizeScopeKey(key))
    .sort((a, b) => {
      const ta = Math.max(0, toFiniteNumber(scopeUpdatedAtByScope.get(a), 0));
      const tb = Math.max(0, toFiniteNumber(scopeUpdatedAtByScope.get(b), 0));
      return tb - ta;
    })
    .slice(0, PERSIST_MAX_SCOPES);

  const scopes = {};
  for (const key of sortedKeys) {
    scopes[key] = serializeScope(key);
  }
  const payload = {
    version: PERSIST_VERSION,
    savedAt: Date.now(),
    scopes,
  };
  try {
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch {}
}

function ensurePersistHooks() {
  if (!isStorageAvailable() || persistHookBound) return;
  persistHookBound = true;
  window.addEventListener(
    "beforeunload",
    () => {
      if (persistTimer != null) {
        try {
          window.clearTimeout(persistTimer);
        } catch {}
        persistTimer = null;
      }
      flushPersist();
    },
    { capture: true }
  );
}

function schedulePersist() {
  if (!isStorageAvailable()) return;
  ensurePersistHooks();
  if (persistTimer != null) return;
  persistTimer = window.setTimeout(flushPersist, PERSIST_WRITE_DEBOUNCE_MS);
}

function hydrateFromStorage() {
  if (!isStorageAvailable()) return;
  let parsed = null;
  try {
    parsed = JSON.parse(window.localStorage.getItem(PERSIST_KEY) || "null");
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") return;
  const scopes = parsed.scopes && typeof parsed.scopes === "object" ? parsed.scopes : {};
  for (const [rawScopeKey, value] of Object.entries(scopes)) {
    applyScopeData(rawScopeKey, value, { silent: true });
  }
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
  manualResourcesByScope.set(
    key,
    current.concat(additions).map((row) => (row && typeof row === "object" ? { ...row } : row))
  );
  markScopeTouched(key);
  schedulePersist();
}

export function clearManualResources(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  manualResourcesByScope.delete(key);
  placementByScope.delete(key);
  timelineViewByScope.delete(key);
  layoutStateByScope.delete(key);
  trackLocksByScope.delete(key);
  markScopeTouched(key);
  schedulePersist();
}

export function getPlacementMap(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  if (!placementByScope.has(key)) placementByScope.set(key, new PersistedPlacementMap(key, []));
  return placementByScope.get(key);
}

export function getTimelineViewState(scopeKey) {
  return timelineViewByScope.get(normalizeScopeKey(scopeKey)) || null;
}

export function setTimelineViewState(scopeKey, snapshot) {
  const key = normalizeScopeKey(scopeKey);
  if (!snapshot || typeof snapshot !== "object") {
    timelineViewByScope.delete(key);
    markScopeTouched(key);
    schedulePersist();
    return;
  }
  timelineViewByScope.set(key, sanitizeTimelineViewState(snapshot));
  markScopeTouched(key);
  schedulePersist();
}

export function getCompositionLayoutState(scopeKey) {
  return layoutStateByScope.get(normalizeScopeKey(scopeKey)) || null;
}

export function setCompositionLayoutState(scopeKey, snapshot) {
  const key = normalizeScopeKey(scopeKey);
  const normalized = sanitizeLayoutState(snapshot);
  if (!normalized) {
    layoutStateByScope.delete(key);
    markScopeTouched(key);
    schedulePersist();
    return;
  }
  layoutStateByScope.set(key, normalized);
  markScopeTouched(key);
  schedulePersist();
}

export function getTrackLocks(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  const rows = trackLocksByScope.get(key);
  return new Set(Array.isArray(rows) ? rows : []);
}

export function setTrackLocks(scopeKey, values) {
  const key = normalizeScopeKey(scopeKey);
  const normalized = sanitizeTrackLocks(values);
  if (!normalized.length) {
    trackLocksByScope.delete(key);
    markScopeTouched(key);
    schedulePersist();
    return;
  }
  trackLocksByScope.set(key, normalized);
  markScopeTouched(key);
  schedulePersist();
}

export function getCompositionScopeSnapshot(scopeKey) {
  const key = normalizeScopeKey(scopeKey);
  return cloneJsonSafe(serializeScope(key), null);
}

export function applyCompositionScopeSnapshot(scopeKey, snapshot, options = {}) {
  const key = normalizeScopeKey(scopeKey);
  applyScopeData(key, snapshot, { silent: Boolean(options?.silent) });
}

export function setCompositionStateChangeListener(listener) {
  stateChangeListener = typeof listener === "function" ? listener : null;
}

hydrateFromStorage();
