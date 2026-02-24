export function createTimelineMuteHandlers(config = {}) {
  const {
    state,
    deps = {},
  } = config;
  const {
    setTrackMuted,
    syncTrackAudioMuteVolumes,
    syncTrackAudioPlayersToPlayhead,
    syncMidiTrackMuteGains,
    hasUnmutedMidiTracks,
    startMidiPlayback,
    ensureScrubAudioReady,
    draw,
    renderOverview,
  } = deps;

  const applyTrackMuteChange = (trackName, muted) => {
    const changed = setTrackMuted(state, trackName, muted);
    if (!changed) return false;
    syncTrackAudioMuteVolumes(state);
    syncTrackAudioPlayersToPlayhead(state, { play: state.isPlaying, forceSeek: false });
    syncMidiTrackMuteGains(state);
    if (state.isPlaying && hasUnmutedMidiTracks(state)) {
      void startMidiPlayback(state).then(() => {
        draw(state);
        renderOverview(state);
      });
    }
    draw(state);
    renderOverview(state);
    return true;
  };

  const applyMuteBatch = (mutator) => {
    const changed = Boolean(typeof mutator === "function" ? mutator() : false);
    syncTrackAudioMuteVolumes(state);
    syncTrackAudioPlayersToPlayhead(state, { play: state.isPlaying, forceSeek: false });
    syncMidiTrackMuteGains(state);
    if (state.isPlaying && hasUnmutedMidiTracks(state)) {
      void startMidiPlayback(state).then(() => {
        draw(state);
        renderOverview(state);
      });
    }
    if (!changed) {
      draw(state);
      renderOverview(state);
      return;
    }
    void ensureScrubAudioReady(state).finally(() => {
      draw(state);
      renderOverview(state);
    });
  };

  return {
    applyTrackMuteChange,
    applyMuteBatch,
  };
}

