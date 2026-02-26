import { buildPresetIntent, inferMidiPreset, midiNoteToFrequency, planDsp } from "../../domain/services/audio_preset_plan.js";
import { createTimelineRuntimeHelpers } from "./helpers.js";
import { createTimelineTrackAudioRuntime } from "../../infrastructure/audio/track_runtime.js";
import { createTimelineMidiRuntime } from "../../infrastructure/audio/midi_runtime.js";
import { createTimelineScrubRuntime } from "../../infrastructure/audio/scrub_runtime.js";
import { logTransportStressEvent } from "./transport_debug.js";

export function createTimelineAudioSubsystem({
  CONSTANTS,
  Utils,
  getTimelineMaxTimeSec,
  rebaseTransportClockAtCurrentPlayhead,
  getPlaybackClockAudio,
  resolveTrackAudioActiveEventAtTime,
  resolveTrackAudioPlayerForEvent,
}) {
  const {
    getScrubAudioContextCtor,
    ensureTrackPlaybackAudioContext,
    resumeTrackPlaybackAudioContext,
    closeTrackPlaybackAudioBus,
    scheduleGainRamp,
    pausePlayerWithFade,
    clearPlayerPauseTimer,
    normalizeSkeletonMode,
    resolveSlipOffsetFromRailHit,
    isTrackMuted,
    isTrackLocked,
    hasUnmutedMidiTracks,
    setTrackMuted,
    syncTrackAudioMuteVolumes,
    hitTest,
  } = createTimelineRuntimeHelpers({ CONSTANTS, Utils });

  const TRACK_AUDIO_RUNTIME = createTimelineTrackAudioRuntime({
    CONSTANTS,
    Utils,
    isTrackMuted,
    getTimelineMaxTimeSec,
    ensureTrackPlaybackAudioContext,
    resumeTrackPlaybackAudioContext,
    scheduleGainRamp,
    pausePlayerWithFade,
    clearPlayerPauseTimer,
    rebaseTransportClockAtCurrentPlayhead,
    logTransportStressEvent,
    syncTrackAudioMuteVolumes,
  });

  const MIDI_RUNTIME = createTimelineMidiRuntime({
    CONSTANTS,
    Utils,
    isTrackMuted,
    getScrubAudioContextCtor,
    inferMidiPreset,
    buildPresetIntent,
    planDsp,
    midiNoteToFrequency,
  });

  const SCRUB_RUNTIME = createTimelineScrubRuntime({
    CONSTANTS,
    Utils,
    getPlaybackClockAudio,
    isTrackMuted,
    resolveTrackAudioActiveEventAtTime,
    resolveTrackAudioPlayerForEvent,
    hasUnmutedMidiTracks,
    ensureMidiAudioReady: MIDI_RUNTIME.ensureMidiAudioReady,
    inferMidiPreset,
    buildPresetIntent,
    planDsp,
    midiNoteToFrequency,
    getScrubAudioContextCtor,
  });

  return {
    getScrubAudioContextCtor,
    ensureTrackPlaybackAudioContext,
    resumeTrackPlaybackAudioContext,
    closeTrackPlaybackAudioBus,
    normalizeSkeletonMode,
    resolveSlipOffsetFromRailHit,
    isTrackMuted,
    isTrackLocked,
    hasUnmutedMidiTracks,
    setTrackMuted,
    syncTrackAudioMuteVolumes,
    hitTest,
    TRACK_AUDIO_RUNTIME,
    MIDI_RUNTIME,
    SCRUB_RUNTIME,
  };
}
