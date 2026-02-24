import { el } from "../../../shared/ui/dom.js";
import { createIcon } from "../../../shared/ui/icons.js";
import * as Utils from "./timeline_utils.js";
import { normalizeTrackRowScale } from "./timeline_track_layout.js";
import { resolveEffectiveSelectedClipCount } from "./timeline_selection_state.js";

export function compactRunId(runId) {
  const value = String(runId || "").trim();
  if (!value) return "n/a";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function formatSelectionSummary(state) {
  const selection = state?.selection;
  if (!selection || typeof selection !== "object") return "";
  const type = String(selection.type || "item");
  const name = Utils.compactText(selection.name || selection.id || "", 24);
  const t0 = Number(selection.t0_sec);
  const t1 = Number(selection.t1_sec);
  const selectedCount = Number(resolveEffectiveSelectedClipCount(state) || 0);
  const selectedSuffix = selectedCount > 1 ? ` | group ${selectedCount}` : "";
  if (Number.isFinite(t0) && Number.isFinite(t1)) {
    return ` | sel ${type} ${name} ${t0.toFixed(2)}-${t1.toFixed(2)}s${selectedSuffix}`;
  }
  if (Number.isFinite(t0)) {
    return ` | sel ${type} ${name} @${t0.toFixed(2)}s${selectedSuffix}`;
  }
  return ` | sel ${type} ${name}${selectedSuffix}`;
}

export function renderOverview(state) {
  const tempo = Number(state.studioData?.tempoBpm || 0);
  const runText = compactRunId(state.runData?.run_id);
  const tempoText = tempo > 0 ? `${tempo.toFixed(1)} bpm` : "n/a";
  const tracksCount = Number(state.studioData?.tracks?.length || 0);
  const mutedCount = state.mutedTracks?.size || 0;
  const selectionText = formatSelectionSummary(state);
  state.overviewLabel.textContent =
    `run ${runText} | tempo ${tempoText} | duration ${state.durationSec.toFixed(2)}s | tracks ${tracksCount} | muted ${mutedCount}${selectionText}`;

  if (state.jumpBtn) {
    const hasStep =
      Number.isFinite(state.selection?.origin_step_index) && typeof state.onJumpToStep === "function";
    state.jumpBtn.style.display = hasStep ? "" : "none";
    if (hasStep) {
      state.jumpBtn.textContent = `Step ${state.selection.origin_step_index + 1}`;
    }
  }
}

export function renderFooter(state, { leftGutter = 160 } = {}) {
  if (!state.zoomLabel || !state.canvas) return;
  const timelineWidth = Math.max(1, state.canvas.clientWidth - Math.max(0, Number(leftGutter || 0)));
  const visibleSec = timelineWidth / Math.max(1e-6, state.pxPerSec);
  const trackScale = normalizeTrackRowScale(state.trackRowScale);
  state.zoomLabel.textContent = `zoom ${state.pxPerSec.toFixed(1)} px/s | window ${visibleSec.toFixed(2)}s | y ${trackScale.toFixed(2)}x${state.skeletonMode ? " | skeleton on" : ""}`;
  if (state.shortcutsLabel) {
    const hints = [];
    const ctrlDown = Boolean(state.keyModifiers?.ctrl);
    const shiftDown = Boolean(state.keyModifiers?.shift);
    const altDown = Boolean(state.keyModifiers?.alt);
    const selectedClipCount = Number(resolveEffectiveSelectedClipCount(state) || 0);
    const hasClipSelection = selectedClipCount > 0;
    const hasGroupSelection = selectedClipCount > 1;
    const editMode = String(state.clipEditSession?.mode || "").trim().toLowerCase();
    if (altDown && ctrlDown) {
      hints.push({ icon: "cut", text: "Ctrl+Alt active" });
      hints.push({ icon: "cut", text: "Click clip: trim keep side" });
    } else if (altDown) {
      hints.push({ icon: "cut", text: "Alt active" });
      hints.push({ icon: "cut", text: "Click clip: cut" });
    } else if (ctrlDown) {
      hints.push({ icon: "key_ctrl", text: "Ctrl active" });
      hints.push({ icon: "mouse_wheel", text: "Wheel: row height" });
    } else if (shiftDown) {
      hints.push({ icon: "key_shift", text: "Shift active" });
      hints.push({ icon: "mouse_wheel", text: "Wheel: pan time" });
    } else {
      hints.push({ icon: "play", text: "Space: play/pause" });
      hints.push({ icon: "mouse_wheel", text: "Wheel: zoom time" });
      hints.push({ icon: "key_shift", text: "+ wheel: pan" });
      hints.push({ icon: "key_ctrl", text: "+ wheel: row height" });
    }
    if (hasClipSelection) {
      if (hasGroupSelection) {
        hints.push({ icon: "drag", text: `Group selected (${selectedClipCount})` });
        hints.push({ icon: "arrows_lr", text: "Drag selected: move group" });
      } else {
        hints.push({ icon: "drag", text: "Solo selected: move/trim" });
      }
      if (!ctrlDown) {
        hints.push({ icon: "key_ctrl", text: "Ctrl+click: multi-select" });
      }
      hints.push({ icon: "arrows_lr", text: "Arrows: nudge" });
    } else if (!ctrlDown && !shiftDown && !altDown) {
      hints.push({ icon: "drag", text: "Click clip: select" });
    }
    if (editMode === "move") {
      hints.push({ icon: "drag", text: "Mode: move" });
    } else if (editMode === "trim_start" || editMode === "trim_end") {
      hints.push({ icon: "arrows_lr", text: "Mode: trim" });
    } else if (editMode === "slip") {
      hints.push({ icon: "arrows_lr", text: "Mode: slip window" });
    }
    if (state.skeletonMode) {
      hints.push({ icon: "skeleton_mode", text: "Skeleton mode" });
    }
    const signature = hints.map((item) => `${item.icon}:${item.text}`).join("|");
    if (signature !== state.shortcutsSignature) {
      state.shortcutsSignature = signature;
      state.shortcutsLabel.textContent = "";
      for (const item of hints) {
        const chip = el("span", { class: "lemouf-song2daw-shortcut-chip" });
        chip.append(
          createIcon(item.icon, {
            className: "lemouf-song2daw-shortcut-icon",
            size: 12,
            title: item.text,
          }),
          el("span", { class: "lemouf-song2daw-shortcut-text", text: item.text })
        );
        state.shortcutsLabel.append(chip);
      }
    }
  }
}

export function snapshotTimelineViewState(state) {
  return {
    autoFit: Boolean(state?.autoFit),
    pxPerSec: Math.max(0.0001, Number(state?.pxPerSec || 0)),
    t0Sec: Math.max(0, Number(state?.t0Sec || 0)),
    scrollY: Math.max(0, Number(state?.scrollY || 0)),
    trackRowScale: normalizeTrackRowScale(state?.trackRowScale),
    skeletonMode: Boolean(state?.skeletonMode),
  };
}

export function emitTimelineViewState(state) {
  if (!state || typeof state.onViewStateChange !== "function") return;
  const snapshot = snapshotTimelineViewState(state);
  const key =
    `${snapshot.autoFit ? "1" : "0"}|${snapshot.pxPerSec.toFixed(4)}|` +
    `${snapshot.t0Sec.toFixed(4)}|${snapshot.scrollY.toFixed(2)}|${snapshot.trackRowScale.toFixed(4)}|${snapshot.skeletonMode ? "1" : "0"}`;
  if (key === state.lastViewStateKey) return;
  state.lastViewStateKey = key;
  try {
    state.onViewStateChange(snapshot);
  } catch {}
}
