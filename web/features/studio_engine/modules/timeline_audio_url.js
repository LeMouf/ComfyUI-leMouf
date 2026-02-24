export function resolveTimelineAudioUrl(studioData, onResolveAudioUrl) {
  if (typeof onResolveAudioUrl !== "function") return "";
  const candidates = ["mix", "__source_audio", "source_audio"];
  const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
  for (const track of tracks) {
    if (String(track?.kind || "").toLowerCase() !== "audio") continue;
    const key = String(track?.audioAssetKey || "").trim();
    if (key) candidates.push(key);
  }
  const seen = new Set();
  for (const asset of candidates) {
    if (seen.has(asset)) continue;
    seen.add(asset);
    const url = String(onResolveAudioUrl(asset) || "").trim();
    if (url) return url;
  }
  return "";
}

