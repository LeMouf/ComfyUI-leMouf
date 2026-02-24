import { AUDIO_VIZ_DEFAULT_PALETTE } from "./timeline_constants.js";

export function resolveAudioVizPalette(overrides = null) {
  if (!overrides || typeof overrides !== "object") return { ...AUDIO_VIZ_DEFAULT_PALETTE };
  return { ...AUDIO_VIZ_DEFAULT_PALETTE, ...overrides };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function compactText(value, maxLength = 44) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function stableTrackColor(trackName) {
  const text = String(trackName || "track");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue} 58% 58%)`;
}

export function clipHueByTrackKind(trackKind, trackName) {
  const kind = String(trackKind || "").toLowerCase();
  if (kind === "video") return 104;
  if (kind === "image") return 64;
  if (kind === "audio") return 286;
  if (kind === "midi") return 228;
  const text = String(trackName || "track");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

export function resolveAlternatingClipFill(trackKind, trackName, clipIndex = 0) {
  const hue = clipHueByTrackKind(trackKind, trackName);
  const alt = Math.abs(Number(clipIndex || 0)) % 2 === 1;
  const saturation = 44;
  const lightness = alt ? 66 : 56;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function resolveAlternatingClipStroke(trackKind, trackName, clipIndex = 0, selected = false) {
  if (selected) return "rgba(36, 26, 18, 0.88)";
  const hue = clipHueByTrackKind(trackKind, trackName);
  const alt = Math.abs(Number(clipIndex || 0)) % 2 === 1;
  const saturation = alt ? 32 : 38;
  const lightness = alt ? 34 : 30;
  return `hsl(${hue} ${saturation}% ${lightness}% / 0.76)`;
}
