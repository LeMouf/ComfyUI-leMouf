export function applyCommittedClipEditToLocalStudioBridge(state, payload, deps = {}) {
  const { applyCommittedClipEditToLocalStudioFromCommit, CONSTANTS, Utils } = deps;
  return applyCommittedClipEditToLocalStudioFromCommit(state, payload, {
    CONSTANTS,
    Utils,
    deriveVideoTrackNameFromLinkedAudio: deps.deriveVideoTrackNameFromLinkedAudio,
    inferStudioTrackKindByName: deps.inferStudioTrackKindByName,
    inferAudioChannelModeByTrackName: deps.inferAudioChannelModeByTrackName,
    deriveLinkedAudioTargetTrackFromVideo: deps.deriveLinkedAudioTargetTrackFromVideo,
    resolveInsertIndexForTargetTrack: deps.resolveInsertIndexForTargetTrack,
    refreshTimelineViewAfterDurationChange: deps.refreshTimelineViewAfterDurationChange,
  });
}

export function resolveEffectiveChannelMode(state, track) {
  const trackName = String(track?.name || "").trim();
  const base = String(track?.channelMode || "").toLowerCase();
  const override = trackName && state?.trackChannelModeOverrides
    ? String(state.trackChannelModeOverrides.get(trackName) || "").toLowerCase()
    : "";
  const value = override || base;
  if (value === "mono" || value === "stereo") return value;
  return base === "mono" ? "mono" : "stereo";
}

