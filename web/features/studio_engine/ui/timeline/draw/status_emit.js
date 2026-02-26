export function drawTimelineStatusAndEmit(state, deps = {}) {
  const {
    renderFooter,
    hasUnmutedMidiTracks,
    hasTrackAudioPlayback,
    isMixTrackMuted,
    collectSelectedClipRefs,
    serializePreviewClipEdits,
    emitTimelineViewState,
  } = deps;

  const hasMidiSynth = Boolean(state.midiTrackNodes && state.midiTrackNodes.size);
  const scrubAudioReady =
    Boolean(state.scrubAudioBuffer) &&
    !Boolean(state.scrubBufferSwapPending) &&
    String(state.scrubActiveSourceUrl || "").trim() === String(state.scrubSourceUrl || "").trim();

  const modeLabel = state.scrubbing
    ? scrubAudioReady
      ? "scrub"
      : "scrub loading"
    : state.audioSource
      ? state.audioErrored
        ? hasMidiSynth
          ? "audio error + midi"
          : "audio error"
        : state.audioReady
          ? hasMidiSynth
            ? "audio + midi"
            : "audio"
          : hasMidiSynth
            ? "audio loading + midi"
            : "audio loading"
      : hasMidiSynth
        ? "midi synth"
        : "no audio";

  if (state.playPauseBtn) {
    if (typeof state.updatePlayPauseButton === "function") state.updatePlayPauseButton();
    state.playPauseBtn.classList.toggle("alt", state.isPlaying);
  }

  if (state.statusLabel) {
    state.statusLabel.textContent = `${state.isPlaying ? "Playing" : "Stopped"} · ${state.playheadSec.toFixed(2)}s · ${modeLabel}`;
  }

  if (typeof renderFooter === "function") {
    renderFooter(state);
  }

  if (typeof state.onPlaybackUpdate === "function") {
    const hasUnmutedMidi = typeof hasUnmutedMidiTracks === "function" ? hasUnmutedMidiTracks(state) : false;
    const hasTrackAudio = typeof hasTrackAudioPlayback === "function"
      ? hasTrackAudioPlayback(state, { unmutedOnly: true })
      : false;
    const hasMixAudio =
      Boolean(state.audioSource) &&
      !state.audioErrored &&
      (typeof isMixTrackMuted === "function" ? !isMixTrackMuted(state) : true);

    const selectedClipRefs = typeof collectSelectedClipRefs === "function"
      ? collectSelectedClipRefs(state)
      : [];

    const primarySelection = state.selection && typeof state.selection === "object"
      ? state.selection
      : null;

    const primaryClipSelection = primarySelection && String(primarySelection.type || "") === "clip"
      ? {
          trackName: String(primarySelection.track_name || "").trim(),
          clipId: String(primarySelection.clip_id || "").trim(),
          resourceId: String(primarySelection.resource_id || "").trim(),
          linkGroupId: String(primarySelection.link_group_id || "").trim(),
        }
      : null;

    try {
      state.onPlaybackUpdate({
        playheadSec: state.playheadSec,
        durationSec: state.durationSec,
        isPlaying: state.isPlaying,
        modeLabel,
        isScrubbing: Boolean(state.scrubbing),
        mutedTracks: Array.from(state.mutedTracks || []),
        hasTrackAudioPlayback: hasTrackAudio,
        hasMixAudioPlayback: hasMixAudio,
        hasUnmutedMidi,
        hasAudibleTimelineAudio: Boolean(hasTrackAudio || hasMixAudio || hasUnmutedMidi),
        transport: {
          clockKind: String(state.transportClockKind || "none"),
          driftSec: Number(state.transportLastDriftSec || 0),
          clockStartSec: Number(state.transportClockStartSec || 0),
          timelineStartSec: Number(state.transportTimelineStartSec || 0),
        },
        selection: {
          type: String(primarySelection?.type || ""),
          selectedClipCount: selectedClipRefs.length,
          selectedClipRefs,
          primaryClip: primaryClipSelection,
        },
        previewClipEdits: typeof serializePreviewClipEdits === "function"
          ? serializePreviewClipEdits(state)
          : [],
      });
    } catch {}
  }

  if (typeof emitTimelineViewState === "function") {
    emitTimelineViewState(state);
  }
}
