import { el } from "./dom.js";
import { createIcon, setButtonIcon } from "./icons.js";
import { clearSong2DawTimeline, renderSong2DawTimeline } from "./song2daw/studio_timeline.js";

const manualResourcesByScope = new Map();
const placementByScope = new Map();
let manualResourceSeq = 1;
const VIDEO_HOVER_PREVIEW_DELAY_MS = 500;
const VIDEO_POSTER_SEEK_SEC = 0.04;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildComfyViewUrl(asset, { preview = false } = {}) {
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

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toReadableBytes(value) {
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

function formatClipDuration(valueSec) {
  const sec = toFiniteNumber(valueSec);
  if (sec == null || sec <= 0) return "";
  if (sec < 10) return `${sec.toFixed(1)}s`;
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec - minutes * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function inferVideoHasAudio(meta = {}) {
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

function collectAssetMeta(asset = {}, fileMeta = null) {
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
      toFiniteNumber(asset?.duration_sec),
    fps: toFiniteNumber(asset?.fps) ?? toFiniteNumber(asset?.frame_rate),
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

function buildResourceTooltip(resource) {
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

function entryIsApproved(entry) {
  const decision = String(entry?.decision || "").toLowerCase();
  const status = String(entry?.status || "").toLowerCase();
  return (
    decision === "approve" ||
    decision === "approved" ||
    status === "approve" ||
    status === "approved"
  );
}

function extractMediaOutputs(entry) {
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

function scopeKeyFromDetail(detail) {
  const key = detail?.loop_id ?? detail?.id ?? "default";
  return String(key || "default");
}

function getManualResources(scopeKey) {
  const rows = manualResourcesByScope.get(scopeKey);
  return Array.isArray(rows) ? rows.slice() : [];
}

function revokeManualResources(resources) {
  for (const resource of resources || []) {
    const src = String(resource?.src || "");
    if (src.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(src);
      } catch {}
    }
  }
}

function clearManualResources(scopeKey) {
  const rows = getManualResources(scopeKey);
  revokeManualResources(rows);
  manualResourcesByScope.delete(scopeKey);
  placementByScope.delete(scopeKey);
}

function detectKindFromFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const name = String(file?.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const imageExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
  const audioExt = new Set([".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"]);
  const videoExt = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi"]);
  if (imageExt.has(ext)) return "image";
  if (audioExt.has(ext)) return "audio";
  if (videoExt.has(ext)) return "video";
  return "";
}

function parseCycleRetryFromName(fileName) {
  const text = String(fileName || "");
  const match = text.match(/cycle_(\d+)_r(\d+)/i);
  if (!match) return null;
  const cycle = toFiniteNumber(match[1]);
  const retry = toFiniteNumber(match[2]);
  if (cycle == null || retry == null) return null;
  return {
    cycle: Math.max(0, Math.round(cycle)),
    retry: Math.max(0, Math.round(retry)),
  };
}

function createManualResource(file, kind, options = {}) {
  const safeKind = String(kind || "image").toLowerCase();
  const src = URL.createObjectURL(file);
  const fileName = String(file?.name || `${safeKind} asset`).trim();
  const id = `manual:${safeKind}:${manualResourceSeq}`;
  const fileMeta = {
    name: fileName,
    size: toFiniteNumber(file?.size),
    mime: String(file?.type || "").trim(),
  };
  const baseMeta = collectAssetMeta({}, fileMeta);
  const manualVideoAudioState = safeKind === "video" ? null : (safeKind === "audio" ? "with_audio" : "unknown");
  const cycle = toFiniteNumber(options?.cycle);
  const retry = toFiniteNumber(options?.retry);
  const sectionId = String(options?.sectionId || "manual");
  const sectionOrder = toFiniteNumber(options?.sectionOrder, 1_000_000);
  const sectionLabel = String(options?.sectionLabel || "Manual");
  const baseLabel = String(options?.label || fileName).trim() || fileName;
  manualResourceSeq += 1;
  return {
    id,
    kind: safeKind,
    cycle: cycle == null ? -1 : Math.max(0, Math.round(cycle)),
    retry: retry == null ? 0 : Math.max(0, Math.round(retry)),
    index: manualResourceSeq,
    source: String(options?.source || "manual"),
    sectionId,
    sectionOrder,
    sectionLabel,
    src,
    previewSrc: safeKind === "image" ? src : "",
    label: baseLabel,
    meta: baseMeta,
    videoAudioState: manualVideoAudioState,
  };
}

function probeManualMediaMetadata(resource) {
  const kind = String(resource?.kind || "").toLowerCase();
  if ((kind !== "audio" && kind !== "video") || !String(resource?.src || "").trim()) {
    return Promise.resolve(resource);
  }
  return new Promise((resolve) => {
    const media = document.createElement(kind === "video" ? "video" : "audio");
    media.preload = "metadata";
    media.muted = true;
    media.playsInline = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        media.removeAttribute("src");
        media.load?.();
      } catch {}
      resolve(resource);
    };
    const detectVideoAudioState = async () => {
      if (kind !== "video") return null;
      let hasAudio = null;
      if (typeof media.mozHasAudio === "boolean") {
        hasAudio = media.mozHasAudio ? true : false;
      }
      if (
        hasAudio !== true &&
        media.audioTracks &&
        typeof media.audioTracks.length === "number" &&
        media.audioTracks.length > 0
      ) {
        hasAudio = true;
      }
      if (hasAudio !== true) {
        try {
          const stream =
            typeof media.captureStream === "function"
              ? media.captureStream()
              : (typeof media.mozCaptureStream === "function" ? media.mozCaptureStream() : null);
          if (stream && typeof stream.getAudioTracks === "function" && stream.getAudioTracks().length > 0) {
            hasAudio = true;
          }
        } catch {}
      }
      if (
        hasAudio !== true &&
        typeof media.webkitAudioDecodedByteCount === "number" &&
        media.webkitAudioDecodedByteCount > 0
      ) {
        hasAudio = true;
      }
      if (hasAudio !== true) {
        try {
          const playPromise = media.play?.();
          if (playPromise && typeof playPromise.then === "function") {
            await playPromise;
            await new Promise((r) => setTimeout(r, 140));
          }
        } catch {}
        try {
          media.pause?.();
        } catch {}
        if (
          typeof media.webkitAudioDecodedByteCount === "number" &&
          media.webkitAudioDecodedByteCount > 0
        ) {
          hasAudio = true;
        }
      }
      if (hasAudio === true) return "with_audio";
      if (hasAudio === false) return "no_audio";
      return null;
    };
    media.onloadedmetadata = () => {
      const duration = toFiniteNumber(media.duration);
      if (duration != null && duration > 0) resource.meta.durationSec = duration;
      if (kind === "video") {
        const width = toFiniteNumber(media.videoWidth);
        const height = toFiniteNumber(media.videoHeight);
        if (width != null && width > 0) resource.meta.width = width;
        if (height != null && height > 0) resource.meta.height = height;
        void detectVideoAudioState()
          .then((state) => {
            if (state === "with_audio" || state === "no_audio") {
              resource.videoAudioState = state;
            }
          })
          .finally(() => finish());
        return;
      }
      finish();
    };
    media.onerror = finish;
    media.src = String(resource.src || "");
  });
}

function appendManualResources(scopeKey, resources) {
  const current = getManualResources(scopeKey);
  manualResourcesByScope.set(scopeKey, current.concat(resources));
}

function collectPipelineResources(detail) {
  const manifest = Array.isArray(detail?.manifest) ? detail.manifest.slice() : [];
  manifest.sort((a, b) => {
    const cycleDelta = toNumber(a?.cycle_index) - toNumber(b?.cycle_index);
    if (cycleDelta !== 0) return cycleDelta;
    const retryDelta = toNumber(a?.retry_index) - toNumber(b?.retry_index);
    if (retryDelta !== 0) return retryDelta;
    return toNumber(a?.updated_at) - toNumber(b?.updated_at);
  });

  const resources = [];
  for (const entry of manifest) {
    if (!entryIsApproved(entry)) continue;
    const cycle = toNumber(entry?.cycle_index);
    const retry = toNumber(entry?.retry_index);
    const media = extractMediaOutputs(entry);

    for (let i = 0; i < media.images.length; i += 1) {
      const image = media.images[i];
      const src = buildComfyViewUrl(image, { preview: false });
      const previewSrc = buildComfyViewUrl(image, { preview: true }) || src;
      const baseMeta = collectAssetMeta(image);
      resources.push({
        id: `image:${cycle}:${retry}:${i}`,
        kind: "image",
        cycle,
        retry,
        index: i,
        source: "pipeline",
        sectionId: `cycle:${cycle}`,
        sectionOrder: cycle,
        sectionLabel: `Cycle ${cycle + 1}`,
        src,
        previewSrc,
        label: `cycle ${cycle + 1} · r${retry}`,
        meta: baseMeta,
        videoAudioState: "unknown",
      });
    }
  }
  return resources;
}

function collectInputResources(detail) {
  const inputResources = Array.isArray(detail?.composition_resources) ? detail.composition_resources : [];
  const resources = [];
  for (let i = 0; i < inputResources.length; i += 1) {
    const resource = inputResources[i];
    if (!resource || typeof resource !== "object") continue;
    const kind = String(resource.kind || "").toLowerCase();
    if (kind !== "image" && kind !== "audio" && kind !== "video") continue;
    const src = String(resource.src || resource.uri || "").trim();
    if (!src) continue;
    const meta = resource.meta && typeof resource.meta === "object" ? { ...resource.meta } : {};
    resources.push({
      id: String(resource.id || `input:${kind}:${i + 1}`),
      kind,
      cycle: Number.isFinite(Number(resource.cycle)) ? Number(resource.cycle) : -1,
      retry: Number.isFinite(Number(resource.retry)) ? Number(resource.retry) : 0,
      index: i,
      source: String(resource.source || "pipeline_input"),
      sectionId: String(resource.sectionId || "input_resources"),
      sectionOrder: Number.isFinite(Number(resource.sectionOrder)) ? Number(resource.sectionOrder) : -1000,
      sectionLabel: String(resource.sectionLabel || "Input resources"),
      src,
      previewSrc: kind === "image" ? String(resource.previewSrc || src) : "",
      label: String(resource.label || `${kind} ${i + 1}`),
      meta,
      videoAudioState: kind === "video" ? String(resource.videoAudioState || "unknown") : undefined,
    });
  }
  return resources;
}

function resolveVideoAudioState(resource) {
  if (String(resource?.kind || "") !== "video") return "unknown";
  const explicit = String(resource?.videoAudioState || "").toLowerCase();
  if (explicit === "with_audio" || explicit === "no_audio" || explicit === "unknown") return explicit;
  const inferred = inferVideoHasAudio(resource?.meta || {});
  if (inferred === true) return "with_audio";
  if (inferred === false) return "no_audio";
  return "unknown";
}

function collectResources(detail) {
  const scopeKey = scopeKeyFromDetail(detail);
  return collectInputResources(detail)
    .concat(collectPipelineResources(detail))
    .concat(getManualResources(scopeKey))
    .map((resource) => {
      const safe = resource && typeof resource === "object" ? resource : {};
      const next = { ...safe };
      if (!next.meta || typeof next.meta !== "object") next.meta = {};
      if (String(next.kind || "") === "video") {
        next.videoAudioState = resolveVideoAudioState(next);
      }
      return next;
    });
}

function defaultClipDurationSec(resource) {
  const hinted = toFiniteNumber(resource?.meta?.durationSec);
  if (hinted != null && hinted > 0.05) return Math.min(60, hinted);
  if (String(resource?.kind || "") === "audio") return 4;
  if (String(resource?.kind || "") === "video") return 3;
  return 2;
}

function deriveVideoAudioTrackNames(videoTrackName) {
  const track = String(videoTrackName || "").trim();
  const match = track.match(/^video\s*(\d+)$/i);
  if (match) {
    const lane = Math.max(1, Number(match[1]) || 1);
    return {
      stereo: `Video Audio ${lane}`,
      mono: `Video Audio M${lane}`,
    };
  }
  return {
    stereo: "Video Audio 1",
    mono: "Video Audio M1",
  };
}

function normalizeMediaSrcForCompare(src) {
  const text = String(src || "").trim();
  if (!text) return "";
  try {
    return new URL(text, window.location.href).href;
  } catch {
    return text;
  }
}

function getPlacementMap(scopeKey) {
  const key = String(scopeKey || "default");
  if (!placementByScope.has(key)) placementByScope.set(key, new Map());
  return placementByScope.get(key);
}

function buildStudioData(resources, scopeKey) {
  const placementMap = getPlacementMap(scopeKey);
  const audioAssetByKey = {};
  const tracksByName = new Map();
  const eventsByTrack = {};

  const ensureTrack = (track) => {
    const name = String(track?.name || "").trim();
    if (!name) return;
    if (!tracksByName.has(name)) tracksByName.set(name, { ...track });
    if (!Array.isArray(eventsByTrack[name])) eventsByTrack[name] = [];
  };

  const kindCounter = {
    video: 0,
    image: 0,
    audio: 0,
  };

  let defaultCursor = 0;
  for (const resource of resources) {
    const kind = String(resource?.kind || "").toLowerCase();
    if (kind !== "video" && kind !== "image" && kind !== "audio") continue;
    const clipDuration = defaultClipDurationSec(resource);
    const resourceId = String(resource?.id || `${kind}:${kindCounter[kind] + 1}`);
    const existing = placementMap.get(resourceId) || null;

    let trackName = String(existing?.trackName || "");
    let timeSec = toFiniteNumber(existing?.timeSec, null);
    let durationSec = toFiniteNumber(existing?.durationSec, null);

    if (!trackName) {
      if (kind === "video") {
        kindCounter.video += 1;
        trackName = `Video ${Math.max(1, (kindCounter.video % 2) || 2)}`;
      } else if (kind === "image") {
        kindCounter.image += 1;
        trackName = `Image ${Math.max(1, (kindCounter.image % 2) || 2)}`;
      } else {
        kindCounter.audio += 1;
        trackName = `Audio S${kindCounter.audio}`;
      }
    }

    if (timeSec == null) {
      timeSec = defaultCursor;
      defaultCursor += clipDuration;
    }
    if (durationSec == null) durationSec = clipDuration;

    if (kind === "audio") {
      const keyBase = `audio:${resourceId}`;
      const stereoTrackName = trackName;
      const monoTrackName = `Audio M${kindCounter.audio}`;
      const assetKey = `${keyBase}:stereo`;
      if (resource?.src) audioAssetByKey[assetKey] = String(resource.src);

      ensureTrack({
        name: stereoTrackName,
        kind: "audio",
        channelMode: "stereo",
        partition: "step_tracks",
        source: resource.label || resourceId,
        audioAssetKey: assetKey,
        events: 0,
      });
      ensureTrack({
        name: monoTrackName,
        kind: "audio",
        channelMode: "mono",
        playAudio: false,
        partition: "step_tracks",
        source: resource.label || resourceId,
        audioAssetKey: assetKey,
        events: 0,
      });

      eventsByTrack[stereoTrackName].push({
        time: Math.max(0, timeSec),
        duration: Math.max(0.1, durationSec),
        label: resource.label || "audio",
        assetKey,
        resourceId,
      });
      eventsByTrack[monoTrackName].push({
        time: Math.max(0, timeSec),
        duration: Math.max(0.1, durationSec),
        label: `${resource.label || "audio"} mono`,
        assetKey,
        resourceId,
      });

      placementMap.set(resourceId, {
        trackName: stereoTrackName,
        timeSec: Math.max(0, timeSec),
        durationSec: Math.max(0.1, durationSec),
      });
      continue;
    }

    ensureTrack({
      name: trackName,
      kind,
      partition: "step_tracks",
      source: resource.label || resourceId,
      audioAssetKey: "",
      events: 0,
    });
    eventsByTrack[trackName].push({
      time: Math.max(0, timeSec),
      duration: Math.max(0.1, durationSec),
      label: resource.label || kind,
      resourceId,
      src: String(resource?.src || ""),
      previewSrc: String(resource?.previewSrc || ""),
    });
    if (kind === "video" && String(resource?.videoAudioState || "") === "with_audio" && resource?.src) {
      const linkedTracks = deriveVideoAudioTrackNames(trackName);
      const assetKey = `video_audio:${resourceId}`;
      audioAssetByKey[assetKey] = String(resource.src);
      const linkedTrackName = linkedTracks.stereo;
      ensureTrack({
        name: linkedTrackName,
        kind: "audio",
        channelMode: "stereo",
        partition: "step_tracks",
        source: `${resource.label || resourceId} audio`,
        audioAssetKey: assetKey,
        events: 0,
      });
      const clipTime = Math.max(0, timeSec);
      const clipDuration = Math.max(0.1, durationSec);
      eventsByTrack[linkedTrackName].push({
        time: clipTime,
        duration: clipDuration,
        label: `${resource.label || "video"} audio`,
        assetKey,
        resourceId,
      });
    }
    placementMap.set(resourceId, {
      trackName,
      timeSec: Math.max(0, timeSec),
      durationSec: Math.max(0.1, durationSec),
    });
  }

  for (const [trackName, events] of Object.entries(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    events.sort((a, b) => {
      const t = toNumber(a?.time) - toNumber(b?.time);
      if (t !== 0) return t;
      return String(a?.resourceId || "").localeCompare(String(b?.resourceId || ""));
    });
    const track = tracksByName.get(trackName);
    if (track) track.events = events.length;
  }

  const tracks = Array.from(tracksByName.values());
  if (!tracks.length) {
    tracks.push({
      name: "Video 1",
      kind: "video",
      partition: "step_tracks",
      source: "",
      audioAssetKey: "",
      events: 0,
    });
  }

  const maxEventEnd = Object.values(eventsByTrack).reduce((max, events) => {
    if (!Array.isArray(events)) return max;
    for (const event of events) {
      const end = toNumber(event?.time) + Math.max(0.1, toNumber(event?.duration, 0.1));
      if (end > max) max = end;
    }
    return max;
  }, 0);

  const durationSec = Math.max(6, maxEventEnd);
  const sections = [{ name: "Composition", start: 0, end: durationSec }];

  return {
    durationSec,
    tempoBpm: 120,
    sections,
    tracks,
    eventsByTrack,
    audioAssetByKey,
  };
}

function makeResourceCard(resource, onOpenAsset, options = {}) {
  const tooltip = buildResourceTooltip(resource);
  const displayDuration = formatClipDuration(
    toFiniteNumber(options?.durationSec) ?? toFiniteNumber(resource?.meta?.durationSec)
  );
  const card = el("button", {
    class: "lemouf-loop-composition-resource",
    type: "button",
    title: tooltip || resource.label,
  });
  let stopVideoPreview = null;
  card.draggable = true;
  card.dataset.resourceId = String(resource?.id || "");
  card.addEventListener("dragstart", (event) => {
    if (typeof stopVideoPreview === "function") stopVideoPreview();
    const resourceId = String(resource?.id || "");
    const resourceKind = String(resource?.kind || "").toLowerCase();
    if (!resourceId || !event?.dataTransfer) return;
    event.dataTransfer.setData("application/x-lemouf-resource-id", resourceId);
    if (resourceKind) {
      event.dataTransfer.setData("application/x-lemouf-resource-kind", resourceKind);
    }
    event.dataTransfer.setData("text/plain", resourceId);
    event.dataTransfer.effectAllowed = "copyMove";
  });
  card.addEventListener("dragend", () => {
    if (typeof stopVideoPreview === "function") stopVideoPreview();
  });
  const videoAudioState = String(resource?.videoAudioState || "unknown");
  const kindIconName = resource.kind === "audio"
    ? "media_audio"
    : (resource.kind === "video" ? "media_video" : "media_image");
  const kindTitle = resource.kind === "audio"
    ? "Audio resource"
    : (resource.kind === "video" ? "Video resource" : "Image resource");
  const kindBadge = el("span", {
    class: `lemouf-loop-composition-resource-kind ${resource.kind} ${
      resource.kind === "video" ? `is-${videoAudioState}` : ""
    }`,
    title: kindTitle,
  });
  kindBadge.appendChild(createIcon(kindIconName, {
    className: "lemouf-loop-composition-resource-kind-icon",
    size: 11,
    title: kindTitle,
  }));
  card.appendChild(kindBadge);

  if (resource.kind === "image" && resource.previewSrc) {
    const img = el("img", {
      class: "lemouf-loop-composition-resource-thumb",
      src: resource.previewSrc,
      alt: resource.label,
    });
    card.appendChild(img);
  } else if (resource.kind === "video") {
    const thumbWrap = el("div", { class: "lemouf-loop-composition-resource-thumb-wrap" });
    const previewSrc = String(resource?.previewSrc || "");
    const videoSrc = String(resource?.src || "");
    const hasPoster = Boolean(previewSrc);
    let poster = null;
    card.classList.toggle("is-video-no-poster", !hasPoster);
    if (previewSrc) {
      poster = el("img", {
        class: "lemouf-loop-composition-resource-thumb",
        src: previewSrc,
        alt: resource.label,
      });
      thumbWrap.appendChild(poster);
    } else {
      thumbWrap.appendChild(
        el("div", {
          class: "lemouf-loop-composition-resource-fallback",
          text: "VIDEO",
        })
      );
    }
    const audioFlagIconName =
      videoAudioState === "with_audio"
        ? "audio_on"
        : (videoAudioState === "no_audio" ? "audio_off" : "audio_unknown");
    const audioFlagTitle =
      videoAudioState === "with_audio"
        ? "Video with audio"
        : (videoAudioState === "no_audio" ? "Video without audio" : "Video audio unknown");
    const audioFlagNode = el("span", {
      class: `lemouf-loop-composition-resource-audio-flag is-${videoAudioState}`,
      title: audioFlagTitle,
    });
    audioFlagNode.appendChild(createIcon(audioFlagIconName, {
      className: "lemouf-loop-composition-resource-audio-flag-icon",
      size: 11,
      title: audioFlagTitle,
    }));
    thumbWrap.appendChild(audioFlagNode);
    if (displayDuration) {
      thumbWrap.appendChild(
        el("span", {
          class: "lemouf-loop-composition-resource-duration",
          text: displayDuration,
          title: `Clip duration: ${displayDuration}`,
        })
      );
    }
    if (videoSrc) {
      const video = document.createElement("video");
      video.className = "lemouf-loop-composition-resource-thumb lemouf-loop-composition-resource-thumb-video";
      video.src = videoSrc;
      video.preload = "metadata";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.volume = 0.8;
      video.addEventListener("loadedmetadata", () => {
        if (hasPoster) return;
        const duration = Number(video.duration || 0);
        const seekTo = Number.isFinite(duration) && duration > VIDEO_POSTER_SEEK_SEC
          ? VIDEO_POSTER_SEEK_SEC
          : 0;
        try {
          video.currentTime = seekTo;
        } catch {}
      });
      thumbWrap.appendChild(video);
      let hoverTimer = null;
      let hoverActive = false;
      const startPreview = () => {
        if (hoverActive) return;
        hoverActive = true;
        card.classList.add("is-video-previewing");
        const wantsAudioPreview =
          videoAudioState === "with_audio" &&
          Boolean(globalThis?.navigator?.userActivation?.hasBeenActive);
        video.muted = !wantsAudioPreview;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            if (wantsAudioPreview) {
              // Deterministic fallback: keep hover preview active even if autoplay-with-audio is blocked.
              video.muted = true;
              const mutedPlay = video.play();
              if (mutedPlay && typeof mutedPlay.catch === "function") {
                mutedPlay.catch(() => {
                  hoverActive = false;
                  card.classList.remove("is-video-previewing");
                });
              }
              return;
            }
            hoverActive = false;
            card.classList.remove("is-video-previewing");
          });
        }
      };
      const stopPreview = () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        if (!hoverActive) return;
        hoverActive = false;
        card.classList.remove("is-video-previewing");
        try {
          video.pause();
          video.currentTime = 0;
          video.muted = true;
        } catch {}
      };
      stopVideoPreview = stopPreview;
      card.addEventListener("pointerdown", stopPreview, true);
      card.addEventListener("pointerenter", () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          hoverTimer = null;
          startPreview();
        }, VIDEO_HOVER_PREVIEW_DELAY_MS);
      });
      card.addEventListener("pointerleave", stopPreview);
      card.addEventListener("blur", stopPreview, true);
    }
    card.appendChild(thumbWrap);
  } else {
    card.appendChild(
      el("div", {
        class: "lemouf-loop-composition-resource-fallback",
        text: resource.kind.toUpperCase(),
      })
    );
    if (displayDuration) {
      card.appendChild(
        el("div", {
          class: "lemouf-loop-composition-resource-duration-inline",
          text: displayDuration,
        })
      );
    }
  }

  card.appendChild(
    el("div", {
      class: "lemouf-loop-composition-resource-label",
      text: resource.label,
    })
  );

  card.addEventListener("click", () => {
    if (typeof onOpenAsset !== "function") return;
    const src = String(resource.src || resource.previewSrc || "");
    if (!src) return;
    const cycle = Number(resource?.cycle);
    const retry = Number(resource?.retry);
    const imageIndex = Number(resource?.index);
    const hasCycleContext = Number.isFinite(cycle) && cycle >= 0;
    const isPipelineResource = String(resource?.source || "").toLowerCase() === "pipeline";
    const context = hasCycleContext && isPipelineResource
      ? {
          mode: "cycle",
          cycleIndex: cycle,
          retryIndex: Number.isFinite(retry) ? retry : 0,
          imageIndex: Number.isFinite(imageIndex) ? imageIndex : 0,
        }
      : null;
    onOpenAsset(src, context);
  });
  return card;
}

export function clearLoopCompositionStudioView({ panelBody }) {
  if (!panelBody) return;
  const editorBodies = panelBody.querySelectorAll(".lemouf-loop-composition-editor-body");
  for (const editorBody of editorBodies) {
    clearSong2DawTimeline(editorBody);
  }
  panelBody.innerHTML = "";
  panelBody.textContent = "Open editor to compose loop resources.";
}

export function renderLoopCompositionStudioView({
  detail,
  panelBody,
  dockExpanded = false,
  onOpenAsset,
  compositionGate = null,
  monitorHost = null,
}) {
  if (!panelBody) return;
  clearLoopCompositionStudioView({ panelBody });
  if (!detail || typeof detail !== "object") return;

  const scopeKey = scopeKeyFromDetail(detail);

  const openMediaPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,audio/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.wav,.mp3,.flac,.ogg,.m4a,.aac,.mp4,.webm,.mov,.mkv,.avi";
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const additions = [];
      for (const file of files) {
        const detected = detectKindFromFile(file);
        if (!detected) continue;
        additions.push(createManualResource(file, detected));
      }
      if (!additions.length) return;
      appendManualResources(scopeKey, additions);
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      Promise.all(additions.map((resource) => probeManualMediaMetadata(resource))).then(() => {
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      });
    });
    input.click();
  };

  const openApprovedExportPicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const additions = [];
      for (const file of files) {
        const kind = detectKindFromFile(file);
        if (!kind) continue;
        const parsed = parseCycleRetryFromName(file?.name || "");
        const cycle = parsed?.cycle ?? null;
        const retry = parsed?.retry ?? 0;
        const sectionLabel = cycle != null ? `Cycle ${cycle + 1}` : "Approved Export";
        const label = cycle != null ? `cycle ${cycle + 1} · r${retry}` : String(file?.name || "export asset");
        additions.push(
          createManualResource(file, kind, {
            source: "approved_export",
            cycle,
            retry,
            sectionId: cycle != null ? `cycle:${cycle}` : "approved_export",
            sectionOrder: cycle != null ? cycle : 900000,
            sectionLabel,
            label,
          })
        );
      }
      if (!additions.length) return;
      appendManualResources(scopeKey, additions);
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      Promise.all(additions.map((resource) => probeManualMediaMetadata(resource))).then(() => {
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      });
    });
    input.click();
  };

  const resources = collectResources(detail);
  const studio = buildStudioData(resources, scopeKey);
  const resourcesById = new Map(resources.map((resource) => [String(resource?.id || ""), resource]));
  panelBody.innerHTML = "";

  const summary = el("div", { class: "lemouf-song2daw-studio-meta" });
  summary.textContent = `resources ${resources.length}  |  duration ${studio.durationSec.toFixed(1)}s  |  tracks ${studio.tracks.length}`;

  const manualCount = getManualResources(scopeKey).length;
  const resourceHeader = el("div", { class: "lemouf-loop-composition-resources-head" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Resources" }),
    el("div", { class: "lemouf-loop-composition-resources-meta", text: `${resources.length} item(s)` }),
  ]);

  const actionButtons = [];
  const loadApprovedBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-action-btn",
    type: "button",
  });
  setButtonIcon(loadApprovedBtn, { icon: "import_approved", title: "Load approved export" });
  const addMediaBtn = el("button", {
    class: "lemouf-loop-btn alt icon lemouf-loop-composition-action-btn",
    type: "button",
  });
  setButtonIcon(addMediaBtn, { icon: "add_resource", title: "Add media resource" });
  const clearAddedBtn = el("button", {
    class: "lemouf-loop-btn ghost icon lemouf-loop-composition-action-btn",
    type: "button",
    disabled: manualCount <= 0,
  });
  setButtonIcon(clearAddedBtn, {
    icon: "clear_resources",
    title: manualCount > 0 ? `Clear added resources (${manualCount})` : "No added resources",
  });
  actionButtons.push(loadApprovedBtn, addMediaBtn, clearAddedBtn);
  const resourceActions = el("div", { class: "lemouf-loop-composition-resources-actions" }, actionButtons);
  loadApprovedBtn?.addEventListener("click", openApprovedExportPicker);
  addMediaBtn?.addEventListener("click", openMediaPicker);
  clearAddedBtn?.addEventListener("click", () => {
    if (manualCount <= 0) return;
    const confirmed = window.confirm(
      `Clear ${manualCount} manually added resource${manualCount > 1 ? "s" : ""}?`
    );
    if (!confirmed) return;
    clearManualResources(scopeKey);
    renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
  });

  const resourceRail = el("div", { class: "lemouf-loop-composition-resources-rail" });
  if (!resources.length) {
    resourceRail.appendChild(
      el("div", { class: "lemouf-song2daw-step-empty", text: "No approved images yet. Add media manually if needed." })
    );
  } else {
    for (const resource of resources) {
      const resourceId = String(resource?.id || "");
      const placement = getPlacementMap(scopeKey).get(resourceId) || null;
      const durationSec = toFiniteNumber(placement?.durationSec) ?? toFiniteNumber(resource?.meta?.durationSec);
      resourceRail.appendChild(
        makeResourceCard(resource, onOpenAsset, { durationSec })
      );
    }
  }

  const resourcesContent = el("div", { class: "lemouf-loop-composition-resources-content" }, [
    resourceRail,
    resourceActions,
  ]);
  const resourcesPanel = el("div", { class: "lemouf-loop-composition-resources" }, [
    resourceHeader,
    resourcesContent,
  ]);

  const videoTrackOrder = new Map();
  (Array.isArray(studio.tracks) ? studio.tracks : []).forEach((track, index) => {
    if (String(track?.kind || "").toLowerCase() !== "video") return;
    const name = String(track?.name || "").trim();
    if (!name) return;
    videoTrackOrder.set(name, index);
  });
  const videoEvents = [];
  for (const [trackName, events] of Object.entries(studio.eventsByTrack || {})) {
    if (!videoTrackOrder.has(trackName)) continue;
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const src = String(event?.src || event?.previewSrc || "").trim();
      if (!src) continue;
      const start = Math.max(0, toNumber(event?.time, 0));
      const duration = Math.max(0.01, toNumber(event?.duration, 0.01));
      const end = start + duration;
      videoEvents.push({
        trackName,
        trackOrder: Number(videoTrackOrder.get(trackName) || 0),
        start,
        end,
        duration,
        src,
        label: String(event?.label || "video"),
        resourceId: String(event?.resourceId || ""),
      });
    }
  }
  videoEvents.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.trackOrder !== b.trackOrder) return b.trackOrder - a.trackOrder;
    return a.trackName.localeCompare(b.trackName);
  });

  const monitorPanel = el("div", { class: "lemouf-loop-composition-monitor" });
  const monitorStatus = el("div", { class: "lemouf-loop-composition-monitor-status", text: "No video clip at playhead." });
  const monitorHead = el("div", { class: "lemouf-loop-composition-monitor-head" }, [
    monitorStatus,
  ]);
  const monitorStage = el("div", { class: "lemouf-loop-composition-monitor-stage" });
  const monitorVideo = document.createElement("video");
  monitorVideo.className = "lemouf-loop-composition-monitor-video";
  monitorVideo.preload = "auto";
  monitorVideo.muted = true;
  monitorVideo.playsInline = true;
  const monitorEmpty = el("div", {
    class: "lemouf-loop-composition-monitor-empty",
    text: "No video clip at current position.",
  });
  monitorStage.append(monitorVideo, monitorEmpty);
  const monitorMeta = el("div", { class: "lemouf-loop-composition-monitor-meta", text: "idle" });
  const monitorActions = el("div", { class: "lemouf-loop-composition-monitor-actions" }, [
    el("button", { class: "lemouf-loop-btn alt", type: "button", text: "Save project (soon)", disabled: true }),
    el("button", { class: "lemouf-loop-btn alt", type: "button", text: "Export render (soon)", disabled: true }),
  ]);
  monitorPanel.append(monitorHead, monitorStage, monitorMeta, monitorActions);

  const editorBody = el("div", {
    class: "lemouf-song2daw-studio-body lemouf-loop-composition-editor-body",
  });

  const resolvedMonitorHost = monitorHost && typeof monitorHost.appendChild === "function"
    ? monitorHost
    : null;
  if (resolvedMonitorHost) {
    resolvedMonitorHost.innerHTML = "";
    resolvedMonitorHost.appendChild(monitorPanel);
    panelBody.append(summary, resourcesPanel, editorBody);
  } else {
    panelBody.append(summary, resourcesPanel, monitorPanel, editorBody);
  }

  let monitorCurrentKey = "";
  let monitorPendingLocalTimeSec = 0;
  let monitorPendingPlay = false;
  const MONITOR_EDGE_EPS_SEC = 1 / 240;
  const pickMonitorEvent = (playheadSec) => {
    const time = Math.max(0, toNumber(playheadSec, 0));
    const active = videoEvents.filter(
      (event) => time >= event.start - MONITOR_EDGE_EPS_SEC && time <= event.end + MONITOR_EDGE_EPS_SEC
    );
    if (active.length) {
      active.sort((a, b) => {
        if (a.trackOrder !== b.trackOrder) return b.trackOrder - a.trackOrder;
        if (a.start !== b.start) return b.start - a.start;
        return a.trackName.localeCompare(b.trackName);
      });
      return active[0] || null;
    }
    if (!videoEvents.length) return null;
    const ranked = videoEvents
      .map((event) => {
        const distance = time < event.start
          ? event.start - time
          : (time > event.end ? time - event.end : 0);
        return { event, distance };
      })
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (a.event.trackOrder !== b.event.trackOrder) return b.event.trackOrder - a.event.trackOrder;
        if (a.event.start !== b.event.start) return a.event.start - b.event.start;
        return a.event.trackName.localeCompare(b.event.trackName);
      });
    return ranked[0]?.event || null;
  };
  const applyMonitorTransport = () => {
    const duration = Number(monitorVideo.duration || 0);
    const maxLocal = Number.isFinite(duration) && duration > 0.05
      ? Math.max(0, duration - 0.02)
      : Number.POSITIVE_INFINITY;
    const targetLocal = Math.max(0, Math.min(maxLocal, Number(monitorPendingLocalTimeSec || 0)));
    try {
      if (Math.abs(Number(monitorVideo.currentTime || 0) - targetLocal) > 0.03) {
        monitorVideo.currentTime = targetLocal;
      }
    } catch {}
    if (monitorPendingPlay) {
      const p = monitorVideo.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      try { monitorVideo.pause(); } catch {}
    }
  };
  monitorVideo.addEventListener("loadedmetadata", applyMonitorTransport);
  monitorVideo.addEventListener("canplay", applyMonitorTransport);
  monitorVideo.addEventListener("error", () => {
    monitorEmpty.style.display = "";
    monitorVideo.style.display = "none";
    monitorStatus.textContent = "Unable to load video source.";
  });
  const syncVideoMonitor = ({ playheadSec = 0, isPlaying = false, modeLabel = "idle" } = {}) => {
    if (!videoEvents.length) {
      monitorEmpty.style.display = "";
      monitorVideo.style.display = "none";
      monitorStatus.textContent = "No video resource loaded.";
      monitorMeta.textContent = `${modeLabel}`;
      return;
    }
    const selected = pickMonitorEvent(playheadSec);
    if (!selected) {
      monitorCurrentKey = "";
      try { monitorVideo.pause(); } catch {}
      monitorEmpty.style.display = "";
      monitorVideo.style.display = "none";
      monitorStatus.textContent = "No video clip at playhead.";
      monitorMeta.textContent = `${modeLabel} · ${Number(playheadSec || 0).toFixed(2)}s`;
      return;
    }
    const eventKey = `${selected.trackName}:${selected.resourceId}:${selected.start.toFixed(4)}`;
    const localTime = Math.max(
      0,
      Math.min(Math.max(0.01, Number(selected.duration || 0.01) - 0.02), Number(playheadSec || 0) - selected.start)
    );
    monitorPendingLocalTimeSec = localTime;
    monitorPendingPlay = Boolean(isPlaying);
    const normalizedSelectedSrc = normalizeMediaSrcForCompare(selected.src);
    const normalizedMonitorSrc = normalizeMediaSrcForCompare(monitorVideo.src);
    if (monitorCurrentKey !== eventKey || normalizedMonitorSrc !== normalizedSelectedSrc) {
      monitorCurrentKey = eventKey;
      monitorVideo.src = selected.src;
      applyMonitorTransport();
    } else {
      applyMonitorTransport();
    }
    monitorEmpty.style.display = "none";
    monitorVideo.style.display = "";
    monitorStatus.textContent = `${selected.trackName} · ${selected.label}`;
    monitorMeta.textContent =
      `${modeLabel} · clip ${selected.start.toFixed(2)}-${selected.end.toFixed(2)}s · local ${localTime.toFixed(2)}s`;
  };

  renderSong2DawTimeline({
    runData: { summary: { steps: [] } },
    studioData: {
      tempoBpm: studio.tempoBpm,
      durationSec: studio.durationSec,
      sections: studio.sections,
      tracks: studio.tracks,
      eventsByTrack: studio.eventsByTrack,
    },
    body: editorBody,
    layoutMode: dockExpanded ? "full" : "compact",
    allowDurationExtend: true,
    onJumpToStep: null,
    onOpenRunDir: null,
    onResolveAudioUrl: (assetKey) => {
      const key = String(assetKey || "");
      if (!key) return "";
      return String(studio.audioAssetByKey[key] || "");
    },
    onDropResource: ({ resourceId, resourceKind, trackName, timeSec }) => {
      const id = String(resourceId || "");
      let track = String(trackName || "").trim();
      if (!id || !track) return false;
      const resource = resourcesById.get(id);
      if (!resource) return false;
      const kind = String(resourceKind || resource?.kind || "").toLowerCase();
      const trackInfo = Array.isArray(studio?.tracks)
        ? studio.tracks.find((item) => String(item?.name || "").trim() === track)
        : null;
      const trackKind = String(trackInfo?.kind || "").toLowerCase();
      if (!trackKind) return false;
      if (kind === "audio" && trackKind !== "audio") return false;
      if ((kind === "image" || kind === "video") && trackKind !== kind) return false;
      if (kind === "audio") {
        const monoMatch = track.match(/^audio\s*m(\d+)$/i);
        if (monoMatch) track = `Audio S${monoMatch[1]}`;
      }
      const scopePlacements = getPlacementMap(scopeKey);
      const previous = scopePlacements.get(id) || {};
      const durationSec = Math.max(0.1, toFiniteNumber(previous.durationSec, defaultClipDurationSec(resource)) || 0.1);
      scopePlacements.set(id, {
        trackName: track,
        timeSec: Math.max(0, toFiniteNumber(timeSec, 0)),
        durationSec,
      });
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onClipEdit: ({ resourceId, trackName, timeSec, durationSec }) => {
      const id = String(resourceId || "").trim();
      const track = String(trackName || "").trim();
      if (!id || !track) return false;
      const resource = resourcesById.get(id);
      if (!resource) return false;
      const scopePlacements = getPlacementMap(scopeKey);
      scopePlacements.set(id, {
        trackName: track,
        timeSec: Math.max(0, toFiniteNumber(timeSec, 0)),
        durationSec: Math.max(0.1, toFiniteNumber(durationSec, defaultClipDurationSec(resource)) || 0.1),
      });
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate, monitorHost });
      return true;
    },
    onPlaybackUpdate: syncVideoMonitor,
  });
  syncVideoMonitor({ playheadSec: 0, isPlaying: false, modeLabel: "stopped" });
}
