export function isTransportStressDebugEnabled(state) {
  const nowMs = Date.now();
  if (
    state &&
    Number.isFinite(Number(state.transportStressDebugLastReadMs || 0)) &&
    nowMs - Number(state.transportStressDebugLastReadMs || 0) < 500
  ) {
    return Boolean(state.transportStressDebugEnabled);
  }
  let enabled = false;
  try {
    const raw = String(localStorage.getItem("lemoufTransportStressDebug") || "").trim().toLowerCase();
    enabled = raw === "1" || raw === "true" || raw === "on";
  } catch {}
  if (state) {
    state.transportStressDebugEnabled = enabled;
    state.transportStressDebugLastReadMs = nowMs;
  }
  return enabled;
}

export function logTransportStressEvent(state, type, payload = {}, { throttleMs = 0, key = "" } = {}) {
  if (!isTransportStressDebugEnabled(state)) return;
  const kind = String(type || "event");
  const throttleKey = String(key || kind);
  const nowMs = Date.now();
  if (!state.transportStressLogTsByKey) state.transportStressLogTsByKey = new Map();
  const lastTs = Number(state.transportStressLogTsByKey.get(throttleKey) || 0);
  if (throttleMs > 0 && nowMs - lastTs < throttleMs) return;
  state.transportStressLogTsByKey.set(throttleKey, nowMs);
  try {
    // eslint-disable-next-line no-console
    console.debug(`[LeMouf Transport] ${kind}`, payload);
  } catch {}
}

