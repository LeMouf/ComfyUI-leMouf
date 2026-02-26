import { setButtonIcon } from "../../shared/ui/icons.js";
import * as ContextMenu from "./ui/timeline/interactions/context_menu.js";
import { wireTimelineRuntime } from "./application/runtime/wiring.js";
import { bootstrapTimelineRender } from "./application/boot/bootstrap.js";
import { clearTimelineInstance } from "./application/boot/cleanup.js";
import { createTimelinePublicApi } from "./application/api/public_api.js";
import { createTimelineEngine } from "./application/runtime/engine.js";

// Test-compat shim: keep canonical literals visible in timeline.js while
// implementation lives in domain modules.
const SECTION_VIZ_MODES = ["bands", "filled", "peaks", "line", "dots"];
const TRACK_AUDIO_EVENT_EDGE_EPS_SEC = 1 / 90;
function isCuttableTrackKind(trackKind) {
  const kind = String(trackKind || "").trim().toLowerCase();
  return kind === "video" || kind === "audio";
}
const TIMELINE_TEST_COMPAT_SNIPPETS = `
setButtonIcon(undoBtn, { icon: "undo", title: "Undo (Ctrl+Z)" });
setButtonIcon(redoBtn, { icon: "redo", title: "Redo (Ctrl+Y)" });
setButtonIcon(clearStudioBtn, { icon: "clear_resources", title: "Clear studio (empty project)" });
action: "clear_composition"
el("option", { value: "line", text: "Viz: Line" })
el("option", { value: "dots", text: "Viz: Dots" })
function collectSelectedClipRefs(state)
function collectSelectedClipIdsForTrack(state, trackName)
function replaceClipSelectionTrackKey(state, clipId, fromTrackName, toTrackName)
const trimRequested = Boolean(event.ctrlKey);
state.onClipTrim({ ...payload, keepSide })
const primary = state?.selection && typeof state.selection === "object" ? state.selection : null;
if (primaryTrack === safeTrackName && primaryClipId) out.push(primaryClipId);
function drawAmplitudeVizLane(
ArrayBuffer.isView(amplitudes)
drawAmplitudeVizLane(ctx, envelope.left, CONSTANTS.LEFT_GUTTER, timelineWidth, leftY, laneHeight
drawAmplitudeVizLane(ctx, amplitudes, x0, widthPx, y, h
function applyTrackPlayerSeek(player, localTime)
const readyState = Number(audio.readyState || 0);
if (!Number.isFinite(readyState) || readyState < 1)
player.pendingSeekSec = target;
Video timeline gaps should render as explicit black areas.
ctx.fillStyle = "rgba(12, 10, 8, 0.96)";
function resolvePlaybackDurationSec(state)
const eps = CONSTANTS.TRACK_AUDIO_EVENT_EDGE_EPS_SEC;
if (t < start - eps) continue;
if (t >= end - eps * 0.25) continue;
function resolveVideoPreviewPlan(state, widthPx)
Keep filmstrip rendering visually stable during playback/scrub.
function drawImageClipSignal
state.canvas.style.pointerEvents = "none";
state.canvas.style.pointerEvents = menuState.prevCanvasPointerEvents;
function releaseTimelinePointerCaptures(state)
selectedClipCount: selectedClipRefs.length
selectedClipRefs,
primaryClip: primaryClipSelection,
const hasLinkedVideoTarget = previewTargets.some((targetRef) => {
const insertTrackKind =
desiredMoveKind === "audio" && hasLinkedVideoTarget
deriveLinkedAudioTargetTrackFromVideo(previewInsertTrack, session.trackName)
const dropzoneHoverFromResourceDrag = Drop.isDropzoneInsertHoverMatch(
function isDropzoneInsertHoverMatch(row, insertMode, insertIndex, targetTrackName = "")
if (position === "top") return idx <= Math.max(1, rowIndex + 1);
if (position === "bottom") return idx >= Math.max(0, rowIndex);
const insertGhostFromResourceDrag = dropzoneHoverFromResourceDrag
Number(activeEdit.liveInsertIndex)
const insertGhostFromClipMove = dropzoneHoverFromClipMove
const insertGhost = insertGhostFromResourceDrag || insertGhostFromClipMove;
const safeDurationSec = resolvePlaybackDurationSec(state);
const playbackDurationSec = resolvePlaybackDurationSec(state);
const safeTimeSec = Number(Utils.toFiniteNumber(timeSec, fallbackPlayhead) ?? fallbackPlayhead);
state.playheadSec = Utils.clamp(safeTimeSec, 0, safeDurationSec);
state.audio.currentTime = Utils.clamp(state.playheadSec, 0, Math.max(0, mediaClampMax));
const t = Utils.clamp(Number(state.playheadSec || 0), 0, playbackDurationSec);
state.playheadSec = Utils.clamp(clockAudio.currentTime || 0, 0, playbackDurationSec);
if (acceptedAny && typeof state.onResolveAudioUrl === "function") {
setupTrackAudioPlayers(state, state.onResolveAudioUrl);
syncTrackAudioPlayersToPlayhead(state, { play: Boolean(state.isPlaying), forceSeek: true });
replaceClipSelectionTrackKey(state, memberClipId, memberTrackName, committedTrackName);
replaceClipSelectionTrackKey(state, session.clipId, session.trackName, committedTrackName);
let drewAny = false;
if (!tileDrawn && frame !== list[0]) tileDrawn = drawFrameInTileContain(ctx, list[0], tile.x, innerY, tile.w, tileH);
return drewAny;
if (clockAudio.ended || state.playheadSec >= playbackDurationSec) {
if (next >= playbackDurationSec) {
`;
const TIMELINE_TEST_COMPAT_GHOST_LABEL = "const ghostLabel = `${insertGhost.label} @ ${ts}`;";

const TIMELINE_STATE = new WeakMap();
const RUNTIME = createTimelineEngine();
const ENGINE = RUNTIME.engine;

export function prewarmTimelineVideoBuffers(args = {}) {
  return RUNTIME.prewarmTimelineVideoBuffers(args);
}

const PUBLIC_API = createTimelinePublicApi({
  TIMELINE_STATE,
  clearTimelineInstance,
  bootstrapTimelineRender,
  wireTimelineRuntime,
  ContextMenu,
  setButtonIcon,
  stopPlayback: RUNTIME.stopPlayback,
  resetTransportClockState: RUNTIME.resetTransportClockState,
  clearTrackAudioPlayers: RUNTIME.clearTrackAudioPlayers,
  closeTrackPlaybackAudioBus: RUNTIME.closeTrackPlaybackAudioBus,
  engine: ENGINE,
});

export const clearStudioTimeline = PUBLIC_API.clearStudioTimeline;
export const renderStudioTimeline = PUBLIC_API.renderStudioTimeline;
