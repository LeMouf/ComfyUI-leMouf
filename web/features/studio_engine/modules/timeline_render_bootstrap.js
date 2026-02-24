import { el } from "../../../shared/ui/dom.js";
import { setButtonIcon } from "../../../shared/ui/icons.js";
import { createTimelineShell } from "./timeline_shell.js";
import { applyTimelineInitialViewState } from "./timeline_view_state.js";
import { resolveTimelineAudioUrl as resolveTimelineAudioUrlFromStudio } from "./timeline_audio_url.js";
import { createTimelineState } from "./timeline_state_factory.js";

export function bootstrapTimelineRender(config = {}) {
  const {
    runData,
    studioData,
    body,
    layoutMode = "full",
    allowDurationExtend = false,
    dropTargetMode = "relaxed",
    previewQualityHint = "auto",
    externalClipThumbCache = null,
    initialViewState = null,
    onViewStateChange = null,
    onJumpToStep,
    onOpenRunDir,
    onResolveAudioUrl,
    onDropResource,
    onClipEdit,
    onClipCut,
    onClipTrim,
    onClipJoin,
    onTrackContextAction,
    onUndo,
    onRedo,
    onPlaybackUpdate,
    CONSTANTS,
    normalizeSectionHeight,
    normalizeSectionVizMode,
    normalizeSkeletonMode,
    normalizeSnapEnabled,
    normalizeTrackRowScale,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
  } = config;

  const compactMode = layoutMode !== "full";
  const shell = createTimelineShell({
    body,
    compactMode,
    onOpenRunDir,
    el,
    setButtonIcon,
  });

  const dpr = window.devicePixelRatio || 1;
  const ctx = shell.canvas.getContext("2d");
  const resolveTimelineAudioUrl = () =>
    resolveTimelineAudioUrlFromStudio(studioData, onResolveAudioUrl);

  const { state, initialStudioDurationSec } = createTimelineState({
    runData,
    studioData,
    canvas: shell.canvas,
    ctx,
    overviewLabel: shell.overviewLabel,
    playPauseBtn: shell.playPauseBtn,
    jumpBtn: shell.jumpBtn,
    snapBtn: shell.snapBtn,
    statusLabel: shell.statusLabel,
    zoomLabel: shell.zoomLabel,
    shortcutsLabel: shell.shortcutsLabel,
    zoomResetBtn: shell.zoomResetBtn,
    skeletonModeBtn: shell.skeletonModeBtn,
    compactMode,
    allowDurationExtend,
    dropTargetMode,
    previewQualityHint,
    externalClipThumbCache,
    onJumpToStep,
    onOpenRunDir,
    onDropResource,
    onClipEdit,
    onClipCut,
    onClipTrim,
    onClipJoin,
    onTrackContextAction,
    onUndo,
    onRedo,
    onResolveAudioUrl,
    onPlaybackUpdate,
    onViewStateChange,
    CONSTANTS,
    normalizeSectionHeight,
    normalizeSectionVizMode,
    normalizeSkeletonMode,
    normalizeSnapEnabled,
    normalizeTrackRowScale,
    normalizeVideoPreviewMode,
    normalizeVideoPreviewQualityHint,
  });

  const hasInitialViewState = applyTimelineInitialViewState(state, initialViewState, {
    normalizeSkeletonMode,
    normalizeTrackRowScale,
  });

  return {
    ...shell,
    compactMode,
    dpr,
    ctx,
    resolveTimelineAudioUrl,
    state,
    initialStudioDurationSec,
    hasInitialViewState,
  };
}

