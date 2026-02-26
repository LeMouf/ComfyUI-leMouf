export function getClipId(clip, fallback = "") {
  const id = String(clip?.clipId || clip?.resourceId || fallback || "").trim();
  return id || "";
}

export function makeClipSelectionKey(trackName, clipId) {
  const safeTrack = String(trackName || "").trim();
  const safeClip = String(clipId || "").trim();
  if (!safeTrack || !safeClip) return "";
  return `${safeTrack}::${safeClip}`;
}

export function parseClipSelectionKey(value) {
  const key = String(value || "").trim();
  if (!key) return null;
  const marker = key.indexOf("::");
  if (marker <= 0 || marker >= key.length - 2) return null;
  const trackName = key.slice(0, marker).trim();
  const clipId = key.slice(marker + 2).trim();
  if (!trackName || !clipId) return null;
  return { key: makeClipSelectionKey(trackName, clipId), trackName, clipId };
}

export function collectSelectedClipRefs(state) {
  const out = [];
  const seen = new Set();
  const push = (trackName, clipId) => {
    const parsed = parseClipSelectionKey(makeClipSelectionKey(trackName, clipId));
    if (!parsed || seen.has(parsed.key)) return;
    seen.add(parsed.key);
    out.push({ trackName: parsed.trackName, clipId: parsed.clipId });
  };
  if (state?.selectedClipKeys instanceof Set) {
    for (const value of state.selectedClipKeys.values()) {
      const parsed = parseClipSelectionKey(value);
      if (!parsed || seen.has(parsed.key)) continue;
      seen.add(parsed.key);
      out.push({ trackName: parsed.trackName, clipId: parsed.clipId });
    }
  }
  const primary = state?.selection && typeof state.selection === "object" ? state.selection : null;
  if (primary && String(primary.type || "") === "clip") {
    push(primary.track_name, primary.clip_id);
  }
  return out;
}

export function isClipSelectedInSet(state, trackName, clipId) {
  const key = makeClipSelectionKey(trackName, clipId);
  if (!key) return false;
  return Boolean(state?.selectedClipKeys && state.selectedClipKeys.has(key));
}

export function clearClipSelectionSet(state) {
  if (!state?.selectedClipKeys || !(state.selectedClipKeys instanceof Set)) return false;
  if (!state.selectedClipKeys.size) return false;
  state.selectedClipKeys.clear();
  return true;
}

export function toggleClipSelectionFromHit(state, hit) {
  const trackName = String(hit?.track_name || "").trim();
  const clipId = String(hit?.clip_id || "").trim();
  if (!trackName || !clipId) return false;
  if (!(state.selectedClipKeys instanceof Set)) state.selectedClipKeys = new Set();
  const key = makeClipSelectionKey(trackName, clipId);
  if (!key) return false;
  if (state.selectedClipKeys.has(key)) state.selectedClipKeys.delete(key);
  else state.selectedClipKeys.add(key);
  return true;
}

export function collectSelectedClipIdsForTrack(state, trackName) {
  const safeTrackName = String(trackName || "").trim();
  if (!safeTrackName) return [];
  const out = [];
  if (state?.selectedClipKeys instanceof Set && state.selectedClipKeys.size) {
    const prefix = `${safeTrackName}::`;
    for (const key of state.selectedClipKeys.values()) {
      const value = String(key || "").trim();
      if (!value.startsWith(prefix)) continue;
      const clipId = value.slice(prefix.length).trim();
      if (!clipId) continue;
      out.push(clipId);
    }
  }
  const primary = state?.selection && typeof state.selection === "object" ? state.selection : null;
  if (primary && String(primary.type || "").trim().toLowerCase() === "clip") {
    const primaryTrack = String(primary.track_name || "").trim();
    const primaryClipId = String(primary.clip_id || "").trim();
    if (primaryTrack === safeTrackName && primaryClipId) out.push(primaryClipId);
  }
  return Array.from(new Set(out));
}

export function replaceClipSelectionTrackKey(state, clipId, fromTrackName, toTrackName) {
  const safeClipId = String(clipId || "").trim();
  const fromTrack = String(fromTrackName || "").trim();
  const toTrack = String(toTrackName || "").trim();
  if (!safeClipId || !fromTrack || !toTrack || fromTrack === toTrack) return false;
  if (!(state?.selectedClipKeys instanceof Set) || !state.selectedClipKeys.size) return false;
  const prevKey = makeClipSelectionKey(fromTrack, safeClipId);
  if (!prevKey || !state.selectedClipKeys.has(prevKey)) return false;
  state.selectedClipKeys.delete(prevKey);
  const nextKey = makeClipSelectionKey(toTrack, safeClipId);
  if (nextKey) state.selectedClipKeys.add(nextKey);
  return true;
}

export function resolvePrimaryClipSelectionKey(state) {
  const selection = state?.selection;
  if (!selection || typeof selection !== "object") return "";
  if (String(selection.type || "") !== "clip") return "";
  const trackName = String(selection.track_name || "").trim();
  const clipId = String(selection.clip_id || "").trim();
  return makeClipSelectionKey(trackName, clipId);
}

export function resolveEffectiveSelectedClipCount(state) {
  const setCount = state?.selectedClipKeys instanceof Set ? state.selectedClipKeys.size : 0;
  if (setCount > 0) return setCount;
  return resolvePrimaryClipSelectionKey(state) ? 1 : 0;
}

