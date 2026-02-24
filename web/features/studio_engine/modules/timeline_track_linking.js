export function inferStudioTrackKindByName(trackName) {
  const text = String(trackName || "").trim().toLowerCase();
  if (!text) return "";
  if (text.startsWith("video audio")) return "audio";
  if (text.startsWith("video")) return "video";
  if (text.startsWith("image")) return "image";
  if (text.startsWith("audio")) return "audio";
  if (text.startsWith("mix")) return "audio";
  return "";
}

export function inferAudioChannelModeByTrackName(trackName) {
  const text = String(trackName || "").trim();
  if (!text) return "";
  if (/^audio\s*m\d+$/i.test(text)) return "mono";
  if (/^audio\s*s\d+$/i.test(text)) return "stereo";
  if (/^video\s*audio\s*m\d+$/i.test(text)) return "mono";
  if (/^video\s*audio\s*\d+$/i.test(text)) return "stereo";
  if (/\bmono\b/i.test(text)) return "mono";
  if (/\bstereo\b/i.test(text)) return "stereo";
  return "";
}

export function deriveLinkedAudioTrackNameFromVideoTrack(videoTrackName, sourceTrackName) {
  const laneMatch = String(videoTrackName || "").trim().match(/^video\s*(\d+)$/i);
  if (!laneMatch) return String(sourceTrackName || "").trim();
  const lane = Math.max(1, Number(laneMatch[1] || 1));
  const source = String(sourceTrackName || "").trim();
  if (/^video\s*audio\s*m\d+$/i.test(source)) return `Video Audio M${lane}`;
  return `Video Audio ${lane}`;
}

export function deriveVideoTrackNameFromLinkedAudio(audioTrackName) {
  const track = String(audioTrackName || "").trim();
  const match = track.match(/^video\s*audio(?:\s*m)?\s*(\d+)$/i);
  if (!match) return "";
  const lane = Math.max(1, Number(match[1]) || 1);
  return `Video ${lane}`;
}

export function deriveLinkedAudioTargetTrackFromVideo(videoTrackName, currentAudioTrackName = "") {
  const videoTrack = String(videoTrackName || "").trim();
  const laneMatch = videoTrack.match(/^video\s*(\d+)$/i);
  if (!laneMatch) return String(currentAudioTrackName || "").trim();
  const lane = Math.max(1, Number(laneMatch[1] || 1));
  const current = String(currentAudioTrackName || "").trim();
  const shouldUseMono =
    /^video\s*audio\s*m\d+$/i.test(current) ||
    /^audio\s*m\d+$/i.test(current) ||
    /(?:^|\s)mono(?:$|\s)/i.test(current);
  return shouldUseMono ? `Video Audio M${lane}` : `Video Audio ${lane}`;
}

export function canonicalizeTargetTrackForResource(trackName, trackKind, resourceKind) {
  const safeTrackName = String(trackName || "").trim();
  const safeTrackKind = String(trackKind || "").trim().toLowerCase();
  const safeResourceKind = String(resourceKind || "").trim().toLowerCase();
  if (!safeTrackName) return { trackName: safeTrackName, trackKind: safeTrackKind };
  if (safeResourceKind === "video" && safeTrackKind === "audio") {
    const videoTrack = deriveVideoTrackNameFromLinkedAudio(safeTrackName);
    if (videoTrack) return { trackName: videoTrack, trackKind: "video" };
  }
  return { trackName: safeTrackName, trackKind: safeTrackKind };
}

export function resolveInsertIndexForTargetTrack(
  baseInsertIndex,
  targetTrackName,
  targetTrackKind,
  payloadTrackName,
  payloadTrackKind
) {
  if (!Number.isFinite(Number(baseInsertIndex))) return undefined;
  const base = Math.round(Number(baseInsertIndex));
  const safeTargetName = String(targetTrackName || "").trim();
  const safeTargetKind = String(targetTrackKind || "").trim().toLowerCase();
  if (!safeTargetName || !safeTargetKind) return base;

  // Keep deterministic visual ordering for linked video/audio lanes:
  // Video N
  // Video Audio N
  // Video Audio MN
  const payloadLane =
    parseVideoLaneFromTrack(payloadTrackName, payloadTrackKind) ??
    parseVideoLaneFromTrack(payloadTrackName, "video");
  const targetLane = parseVideoLaneFromTrack(safeTargetName, safeTargetKind);

  if (safeTargetKind === "audio" && payloadLane != null && targetLane != null && payloadLane === targetLane) {
    if (/^video\s*audio\s*m\d+$/i.test(safeTargetName)) return base + 2;
    if (/^video\s*audio/i.test(safeTargetName)) return base + 1;
  }
  if (safeTargetKind === "audio" && /^audio\s*m\d+$/i.test(safeTargetName)) return base + 1;
  return base;
}

export function parseVideoLaneFromTrack(trackName, trackKind = "") {
  const name = String(trackName || "").trim();
  const kind = String(trackKind || "").trim().toLowerCase();
  if (!name) return null;
  if (kind === "video") {
    const match = name.match(/^video\s*(\d+)$/i);
    if (!match) return null;
    const lane = Number(match[1]);
    return Number.isFinite(lane) ? Math.max(1, lane) : null;
  }
  if (kind === "audio") {
    const match = name.match(/^video\s*audio(?:\s*m)?\s*(\d+)$/i);
    if (!match) return null;
    const lane = Number(match[1]);
    return Number.isFinite(lane) ? Math.max(1, lane) : null;
  }
  return null;
}

export function areVideoAudioTracksLinked(trackA, trackB) {
  const kindA = String(trackA?.kind || "").trim().toLowerCase();
  const kindB = String(trackB?.kind || "").trim().toLowerCase();
  const laneA = parseVideoLaneFromTrack(trackA?.name, kindA);
  const laneB = parseVideoLaneFromTrack(trackB?.name, kindB);
  if (laneA == null || laneB == null || laneA !== laneB) return false;
  return (
    (kindA === "video" && kindB === "audio") ||
    (kindA === "audio" && kindB === "video")
  );
}

