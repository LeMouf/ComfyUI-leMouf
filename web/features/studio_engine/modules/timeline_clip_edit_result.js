export function resolveClipEditResult(result) {
  if (result && typeof result === "object") {
    return {
      accepted: result.accepted !== false,
      trackName: String(result.trackName || "").trim(),
    };
  }
  return {
    accepted: Boolean(result),
    trackName: "",
  };
}

