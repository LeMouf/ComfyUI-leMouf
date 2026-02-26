export function isTextLikeTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function cloneJsonSafe(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildComfyViewUrl(asset, { preview = false } = {}) {
  if (!asset || typeof asset !== "object") return "";
  const filename = String(asset.filename || "").trim();
  if (!filename) return "";
  const params = new URLSearchParams();
  params.set("filename", filename);
  const type = String(asset.type || "").trim();
  const subfolder = String(asset.subfolder || "").trim();
  if (type) params.set("type", type);
  if (subfolder) params.set("subfolder", subfolder);
  if (preview) params.set("preview", "webp;90");
  return `/view?${params.toString()}`;
}

export async function safeJsonResponse(res) {
  if (!res) return null;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseRateToNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.includes("/")) {
    const [nRaw, dRaw] = text.split("/", 2);
    const n = Number(nRaw);
    const d = Number(dRaw);
    if (Number.isFinite(n) && Number.isFinite(d) && Math.abs(d) > 1e-9) {
      const out = n / d;
      return Number.isFinite(out) ? out : null;
    }
  }
  return toFiniteNumber(text);
}

export function toReadableBytes(value) {
  const bytes = toFiniteNumber(value);
  if (bytes == null || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let num = bytes;
  let idx = 0;
  while (num >= 1024 && idx < units.length - 1) {
    num /= 1024;
    idx += 1;
  }
  const decimals = idx === 0 ? 0 : (num >= 10 ? 1 : 2);
  return `${num.toFixed(decimals)} ${units[idx]}`;
}

export function formatClipDuration(valueSec) {
  const sec = toFiniteNumber(valueSec);
  if (sec == null || sec <= 0) return "";
  if (sec < 10) return `${sec.toFixed(1)}s`;
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec - minutes * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function inferVideoHasAudio(meta = {}) {
  const hasAudioKeys = ["has_audio", "contains_audio", "with_audio"];
  for (const key of hasAudioKeys) {
    if (typeof meta?.[key] === "boolean") return meta[key];
  }
  const numericAudioHints = ["audio_tracks", "audio_streams", "audio_channels", "channels"];
  for (const key of numericAudioHints) {
    const count = toFiniteNumber(meta?.[key]);
    if (count != null && count > 0) return true;
  }
  const codecHints = ["audio_codec", "audio_format"];
  for (const key of codecHints) {
    if (String(meta?.[key] || "").trim()) return true;
  }
  const streams = Array.isArray(meta?.streams) ? meta.streams : [];
  if (streams.some((stream) => String(stream?.codec_type || stream?.type || "").toLowerCase() === "audio")) {
    return true;
  }
  return null;
}

export function collectAssetMeta(asset = {}, fileMeta = null) {
  const fpsParsed =
    parseRateToNumber(asset?.fps) ??
    parseRateToNumber(asset?.frame_rate);
  const durationFromFrames = (() => {
    const frames =
      toFiniteNumber(asset?.frame_count) ??
      toFiniteNumber(asset?.frames) ??
      toFiniteNumber(asset?.num_frames);
    if (frames == null || fpsParsed == null || fpsParsed <= 0) return null;
    return frames / fpsParsed;
  })();
  const durationFromMs = (() => {
    const ms =
      toFiniteNumber(asset?.duration_ms) ??
      toFiniteNumber(asset?.duration_msec) ??
      toFiniteNumber(asset?.duration_milliseconds) ??
      toFiniteNumber(asset?.length_ms);
    if (ms == null) return null;
    return ms / 1000;
  })();
  const meta = {
    filename: String(asset?.filename || fileMeta?.name || "").trim(),
    mime: String(asset?.mime || asset?.content_type || fileMeta?.mime || "").trim(),
    sizeBytes:
      toFiniteNumber(asset?.size) ??
      toFiniteNumber(asset?.file_size) ??
      toFiniteNumber(asset?.filesize) ??
      toFiniteNumber(fileMeta?.size),
    durationSec:
      toFiniteNumber(asset?.duration) ??
      toFiniteNumber(asset?.duration_s) ??
      toFiniteNumber(asset?.duration_sec) ??
      toFiniteNumber(asset?.duration_seconds) ??
      toFiniteNumber(asset?.length_sec) ??
      toFiniteNumber(asset?.media_duration_sec) ??
      durationFromMs ??
      durationFromFrames,
    fps: fpsParsed,
    width: toFiniteNumber(asset?.width),
    height: toFiniteNumber(asset?.height),
    sampleRate:
      toFiniteNumber(asset?.sample_rate) ??
      toFiniteNumber(asset?.samplerate) ??
      toFiniteNumber(asset?.audio_sample_rate),
    channels:
      toFiniteNumber(asset?.channels) ??
      toFiniteNumber(asset?.audio_channels),
    bitrate:
      toFiniteNumber(asset?.bitrate) ??
      toFiniteNumber(asset?.audio_bitrate) ??
      toFiniteNumber(asset?.video_bitrate),
  };
  return meta;
}

export function buildResourceTooltip(resource) {
  const lines = [];
  const kind = String(resource?.kind || "resource").toUpperCase();
  const source = String(resource?.source || "pipeline");
  if (resource?.kind === "video") {
    const state = resource?.videoAudioState || "unknown";
    const audioLabel = state === "with_audio" ? "with audio" : (state === "no_audio" ? "silent" : "audio unknown");
    lines.push(`Type: ${kind} (${audioLabel})`);
  } else {
    lines.push(`Type: ${kind}`);
  }
  lines.push(`Source: ${source}`);
  if (resource?.cycle >= 0) lines.push(`Cycle: ${Number(resource.cycle) + 1}`);
  lines.push(`Retry: r${Number(resource?.retry || 0)}`);
  if (resource?.label) lines.push(`Label: ${resource.label}`);

  const meta = resource?.meta || {};
  if (meta.filename) lines.push(`File: ${meta.filename}`);
  if (meta.mime) lines.push(`MIME: ${meta.mime}`);
  if (meta.width && meta.height) lines.push(`Resolution: ${meta.width}x${meta.height}`);
  if (meta.durationSec != null) lines.push(`Duration: ${meta.durationSec.toFixed(2)} s`);
  if (meta.fps != null) lines.push(`FPS: ${meta.fps}`);
  if (meta.sampleRate != null) lines.push(`Sample rate: ${meta.sampleRate} Hz`);
  if (meta.channels != null) lines.push(`Channels: ${meta.channels}`);
  if (meta.bitrate != null) lines.push(`Bitrate: ${Math.round(meta.bitrate)} bps`);
  const sizeText = toReadableBytes(meta.sizeBytes);
  if (sizeText) lines.push(`Size: ${sizeText}`);
  return lines.join("\n");
}

export function entryIsApproved(entry) {
  const decision = String(entry?.decision || "").toLowerCase();
  const status = String(entry?.status || "").toLowerCase();
  return (
    decision === "approve" ||
    decision === "approved" ||
    status === "approve" ||
    status === "approved"
  );
}

export function extractMediaOutputs(entry) {
  const outputs = entry?.outputs && typeof entry.outputs === "object" ? entry.outputs : {};
  const images = Array.isArray(outputs.images) ? outputs.images : [];
  const audios = Array.isArray(outputs.audio)
    ? outputs.audio
    : (Array.isArray(outputs.audios) ? outputs.audios : []);
  const videos = Array.isArray(outputs.video)
    ? outputs.video
    : (Array.isArray(outputs.videos) ? outputs.videos : []);
  return { images, audios, videos };
}
