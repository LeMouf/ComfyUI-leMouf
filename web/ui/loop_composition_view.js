import { el } from "./dom.js";
import { clearSong2DawTimeline, renderSong2DawTimeline } from "./song2daw/studio_timeline.js";

const manualResourcesByScope = new Map();
let manualResourceSeq = 1;

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
    media.onloadedmetadata = () => {
      const duration = toFiniteNumber(media.duration);
      if (duration != null && duration > 0) resource.meta.durationSec = duration;
      if (kind === "video") {
        const width = toFiniteNumber(media.videoWidth);
        const height = toFiniteNumber(media.videoHeight);
        if (width != null && width > 0) resource.meta.width = width;
        if (height != null && height > 0) resource.meta.height = height;
        let hasAudio = null;
        if (typeof media.mozHasAudio === "boolean") hasAudio = media.mozHasAudio;
        if (hasAudio == null && typeof media.webkitAudioDecodedByteCount === "number") {
          hasAudio = media.webkitAudioDecodedByteCount > 0;
        }
        if (
          hasAudio == null &&
          media.audioTracks &&
          typeof media.audioTracks.length === "number"
        ) {
          hasAudio = media.audioTracks.length > 0;
        }
        if (hasAudio === true) resource.videoAudioState = "with_audio";
        if (hasAudio === false) resource.videoAudioState = "no_audio";
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
  return collectPipelineResources(detail)
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

function buildStudioData(resources) {
  const bySection = new Map();
  for (const resource of resources) {
    const sectionId = String(resource?.sectionId || "default");
    if (!bySection.has(sectionId)) {
      bySection.set(sectionId, {
        id: sectionId,
        order: toNumber(resource?.sectionOrder, 0),
        label: String(resource?.sectionLabel || "Section"),
        entries: [],
      });
    }
    bySection.get(sectionId).entries.push(resource);
  }

  const sectionsOrdered = Array.from(bySection.values()).sort((a, b) => {
    const orderDelta = toNumber(a.order) - toNumber(b.order);
    if (orderDelta !== 0) return orderDelta;
    return String(a.label).localeCompare(String(b.label));
  });

  const sections = [];
  const eventsByTrack = {};
  const videoEvents = [];
  const audioEvents = [];
  const audioAssetByKey = {};
  const clipSec = 2;
  let cursor = 0;

  for (const section of sectionsOrdered) {
    const entries = Array.isArray(section.entries) ? section.entries : [];
    const visuals = entries.filter((entry) => entry.kind === "image" || entry.kind === "video");
    const audios = entries.filter((entry) => entry.kind === "audio" && entry.src);
    const clipCount = Math.max(1, visuals.length, audios.length);
    const sectionDuration = clipCount * clipSec;
    const start = cursor;
    const end = start + sectionDuration;

    sections.push({
      name: section.label,
      start,
      end,
    });

    for (let i = 0; i < visuals.length; i += 1) {
      const resource = visuals[i];
      videoEvents.push({
        time: start + i * clipSec,
        duration: clipSec,
        label: resource.label || "visual",
      });
    }

    for (let i = 0; i < audios.length; i += 1) {
      const resource = audios[i];
      const assetKey = `loop_audio:${resource.id}`;
      if (resource.src) audioAssetByKey[assetKey] = resource.src;
      audioEvents.push({
        time: start + i * clipSec,
        duration: clipSec,
        label: resource.label || "audio",
        assetKey,
      });
    }

    cursor = end;
  }

  if (!sections.length) {
    sections.push({ name: "Cycle 1", start: 0, end: 4 });
    cursor = 4;
  }

  if (videoEvents.length) eventsByTrack.Video = videoEvents;
  if (audioEvents.length) eventsByTrack.Audio = audioEvents;

  const tracks = [];
  if (videoEvents.length) {
    tracks.push({
      name: "Video",
      kind: "project",
      partition: "step_tracks",
      source: "approved/images",
      audioAssetKey: "",
      events: videoEvents.length,
    });
  }
  if (audioEvents.length) {
    const firstAudioAsset = Object.keys(audioAssetByKey)[0] || "";
    tracks.push({
      name: "Audio",
      kind: "audio",
      partition: "step_tracks",
      source: "manual/audio",
      audioAssetKey: firstAudioAsset,
      events: audioEvents.length,
    });
  }
  if (!tracks.length) {
    tracks.push({
      name: "Visual",
      kind: "project",
      partition: "step_tracks",
      source: "approved/images",
      audioAssetKey: "",
      events: 0,
    });
  }

  return {
    durationSec: Math.max(1, cursor),
    tempoBpm: 120,
    sections,
    tracks,
    eventsByTrack,
    audioAssetByKey,
  };
}

function makeResourceCard(resource, onOpenAsset) {
  const tooltip = buildResourceTooltip(resource);
  const card = el("button", {
    class: "lemouf-loop-composition-resource",
    type: "button",
    title: tooltip || resource.label,
  });
  const videoAudioState = String(resource?.videoAudioState || "unknown");
  const kindText = resource.kind === "audio"
    ? "AUD"
    : (resource.kind === "video"
      ? (videoAudioState === "with_audio" ? "VID+AUD" : (videoAudioState === "no_audio" ? "VID" : "VID?"))
      : "IMG");
  card.appendChild(
    el("span", {
      class: `lemouf-loop-composition-resource-kind ${resource.kind} ${
        resource.kind === "video" ? `is-${videoAudioState}` : ""
      }`,
      text: kindText,
      title: tooltip || resource.label,
    })
  );

  if (resource.kind === "image" && resource.previewSrc) {
    const img = el("img", {
      class: "lemouf-loop-composition-resource-thumb",
      src: resource.previewSrc,
      alt: resource.label,
    });
    card.appendChild(img);
  } else {
    card.appendChild(
      el("div", {
        class: "lemouf-loop-composition-resource-fallback",
        text: resource.kind.toUpperCase(),
      })
    );
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
}) {
  if (!panelBody) return;
  clearLoopCompositionStudioView({ panelBody });
  if (!detail || typeof detail !== "object") return;

  const scopeKey = scopeKeyFromDetail(detail);

  const openFilePicker = (kind) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (kind === "image") input.accept = "image/*";
    if (kind === "audio") input.accept = "audio/*";
    if (kind === "video") input.accept = "video/*";
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const additions = files.map((file) => createManualResource(file, kind));
      appendManualResources(scopeKey, additions);
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate });
      Promise.all(additions.map((resource) => probeManualMediaMetadata(resource))).then(() => {
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate });
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
      renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate });
      Promise.all(additions.map((resource) => probeManualMediaMetadata(resource))).then(() => {
        renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate });
      });
    });
    input.click();
  };

  const resources = collectResources(detail);
  const studio = buildStudioData(resources);
  panelBody.innerHTML = "";

  const summary = el("div", { class: "lemouf-song2daw-studio-meta" });
  summary.textContent = `resources ${resources.length}  |  duration ${studio.durationSec.toFixed(1)}s  |  tracks ${studio.tracks.length}`;

  const manualCount = getManualResources(scopeKey).length;
  const gateEnabled = Boolean(compositionGate && compositionGate.enabled);
  const gateStatus = String(compositionGate?.status || "").toLowerCase();
  const resourceHeader = el("div", { class: "lemouf-loop-composition-resources-head" }, [
    el("div", { class: "lemouf-song2daw-step-title", text: "Resources" }),
    el("div", { class: "lemouf-loop-composition-resources-meta", text: `${resources.length} item(s)` }),
  ]);

  const actionButtons = [];
  if (gateEnabled) {
    actionButtons.push(
      el("button", {
        class: "lemouf-loop-btn lemouf-loop-composition-gate-btn",
        type: "button",
        text: gateStatus === "running" ? "Validate composition step" : "Validate composition gate",
      })
    );
  }
  actionButtons.push(
    el("button", { class: "lemouf-loop-btn", type: "button", text: "Load approved export" }),
    el("button", { class: "lemouf-loop-btn alt", type: "button", text: "Add image" }),
    el("button", { class: "lemouf-loop-btn alt", type: "button", text: "Add audio" }),
    el("button", { class: "lemouf-loop-btn alt", type: "button", text: "Add video" }),
    el("button", {
      class: "lemouf-loop-btn ghost",
      type: "button",
      text: `Clear added (${manualCount})`,
      disabled: manualCount <= 0,
    })
  );
  const resourceActions = el("div", { class: "lemouf-loop-composition-resources-actions" }, actionButtons);

  const actionNodes = Array.from(resourceActions.querySelectorAll("button"));
  let actionOffset = 0;
  let validateGateBtn = null;
  if (gateEnabled) {
    validateGateBtn = actionNodes[0] || null;
    actionOffset = 1;
  }
  const loadApprovedBtn = actionNodes[actionOffset] || null;
  const addImageBtn = actionNodes[actionOffset + 1] || null;
  const addAudioBtn = actionNodes[actionOffset + 2] || null;
  const addVideoBtn = actionNodes[actionOffset + 3] || null;
  const clearAddedBtn = actionNodes[actionOffset + 4] || null;
  if (validateGateBtn) {
    validateGateBtn.addEventListener("click", async () => {
      const callback = compositionGate && typeof compositionGate.onComplete === "function"
        ? compositionGate.onComplete
        : null;
      if (!callback) return;
      validateGateBtn.disabled = true;
      try {
        await callback();
      } finally {
        validateGateBtn.disabled = false;
      }
    });
  }
  loadApprovedBtn?.addEventListener("click", openApprovedExportPicker);
  addImageBtn?.addEventListener("click", () => openFilePicker("image"));
  addAudioBtn?.addEventListener("click", () => openFilePicker("audio"));
  addVideoBtn?.addEventListener("click", () => openFilePicker("video"));
  clearAddedBtn?.addEventListener("click", () => {
    clearManualResources(scopeKey);
    renderLoopCompositionStudioView({ detail, panelBody, dockExpanded, onOpenAsset, compositionGate });
  });

  const resourceRail = el("div", { class: "lemouf-loop-composition-resources-rail" });
  if (!resources.length) {
    resourceRail.appendChild(
      el("div", { class: "lemouf-song2daw-step-empty", text: "No approved images yet. Add media manually if needed." })
    );
  } else {
    for (const resource of resources) {
      resourceRail.appendChild(makeResourceCard(resource, onOpenAsset));
    }
  }

  const resourcesPanel = el("div", { class: "lemouf-loop-composition-resources" }, [
    resourceHeader,
    resourceActions,
    resourceRail,
  ]);

  const editorBody = el("div", {
    class: "lemouf-song2daw-studio-body lemouf-loop-composition-editor-body",
  });

  panelBody.append(summary, resourcesPanel, editorBody);

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
    onJumpToStep: null,
    onOpenRunDir: null,
    onResolveAudioUrl: (assetKey) => {
      const key = String(assetKey || "");
      if (!key) return "";
      return String(studio.audioAssetByKey[key] || "");
    },
  });
}
