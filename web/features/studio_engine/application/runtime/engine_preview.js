import { createTimelinePreviewRuntime } from "../../ui/timeline/preview/runtime.js";
import { createTimelineSectionWaveformRuntime } from "../../ui/timeline/waveform/runtime.js";
import { createTimelineClipVisuals } from "../../ui/timeline/clip_visuals.js";

function bucketizeFilmstripFrameCount(value, CONSTANTS) {
  const numeric = Math.max(0, Math.round(Number(value || 0)));
  if (!numeric) return 0;
  const buckets = Array.isArray(CONSTANTS.VIDEO_FILMSTRIP_FRAME_BUCKETS)
    ? CONSTANTS.VIDEO_FILMSTRIP_FRAME_BUCKETS
    : [];
  if (!buckets.length) return numeric;
  let best = Number(buckets[0] || numeric);
  let bestDist = Math.abs(numeric - best);
  for (let i = 1; i < buckets.length; i += 1) {
    const candidate = Number(buckets[i] || best);
    const dist = Math.abs(numeric - candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return Math.max(1, best);
}

export function createTimelinePreviewSubsystem({
  CONSTANTS,
  Utils,
  draw,
  isTrackMuted,
  resolveEffectiveChannelMode,
  deriveLinkedAudioTrackNameFromVideoTrack,
  normalizeVideoPreviewMode,
  normalizeVideoPreviewQualityHint,
  getClipId,
}) {
  const PREVIEW_RUNTIME = createTimelinePreviewRuntime({
    draw,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
    bucketizeFilmstripFrameCount: (value) => bucketizeFilmstripFrameCount(value, CONSTANTS),
  });

  const SECTION_WAVE_RUNTIME = createTimelineSectionWaveformRuntime({
    CONSTANTS,
    Utils,
    isTrackMuted,
    resolveEffectiveChannelMode,
    deriveLinkedAudioTrackNameFromVideoTrack,
    drawClipThumbnailCover: PREVIEW_RUNTIME.drawClipThumbnailCover,
    drawClipThumbnailTiles: PREVIEW_RUNTIME.drawClipThumbnailTiles,
    resolveVideoPreviewPlan: PREVIEW_RUNTIME.resolveVideoPreviewPlan,
    ensureTimelineVideoFilmstrip: PREVIEW_RUNTIME.ensureTimelineVideoFilmstrip,
    drawClipFilmstripTilesCached: PREVIEW_RUNTIME.drawClipFilmstripTilesCached,
  });

  const CLIP_VISUALS_RUNTIME = createTimelineClipVisuals({
    CONSTANTS,
    Utils,
    mapTimelineSecToSignalSourceSec: SECTION_WAVE_RUNTIME.mapTimelineSecToSignalSourceSec,
    normalizeSectionVizMode: SECTION_WAVE_RUNTIME.normalizeSectionVizMode,
    drawAmplitudeVizLane: SECTION_WAVE_RUNTIME.drawAmplitudeVizLane,
    resolveEffectiveChannelMode,
    drawClipThumbnailCover: PREVIEW_RUNTIME.drawClipThumbnailCover,
    drawClipThumbnailTiles: PREVIEW_RUNTIME.drawClipThumbnailTiles,
    ensureTimelineVideoFilmstrip: PREVIEW_RUNTIME.ensureTimelineVideoFilmstrip,
    drawClipFilmstripTilesCached: PREVIEW_RUNTIME.drawClipFilmstripTilesCached,
    resolveVideoPreviewPlan: PREVIEW_RUNTIME.resolveVideoPreviewPlan,
    getClipId,
  });

  return {
    PREVIEW_RUNTIME,
    SECTION_WAVE_RUNTIME,
    CLIP_VISUALS_RUNTIME,
  };
}

