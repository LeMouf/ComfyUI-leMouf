export function bootstrapTimelineAudio(state, onResolveAudioUrl, deps = {}) {
  const {
    Utils,
    draw,
    renderOverview,
    resolveTimelineAudioUrl,
    initialStudioDurationSec,
    refreshTimelineViewAfterDurationChange,
    getPlaybackClockAudio,
    stopPlayback,
    ensureScrubAudioReady,
    setupTrackAudioPlayers,
  } = deps;

  if (state.audio && typeof onResolveAudioUrl === "function") {
    const url = resolveTimelineAudioUrl();
    if (url) {
      state.audioSource = url;
      state.audio.preload = "auto";
      const onLoadedMetadata = () => {
        const mediaDuration = Number(state.audio?.duration || 0);
        if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
          if (initialStudioDurationSec <= 0.05) {
            state.durationSec = mediaDuration;
            refreshTimelineViewAfterDurationChange(state);
          }
        }
        state.audioReady = true;
        state.audioErrored = false;
        draw(state);
      };
      const onTimeUpdate = () => {
        if (!state.isPlaying) return;
        if (getPlaybackClockAudio(state) !== state.audio) return;
        state.playheadSec = Utils.clamp(Number(state.audio?.currentTime || 0), 0, state.durationSec);
        draw(state);
      };
      const onEnded = () => {
        if (getPlaybackClockAudio(state) !== state.audio) return;
        stopPlayback(state, true);
      };
      const onError = () => {
        state.audioReady = false;
        state.audioErrored = true;
        draw(state);
      };
      state.audioHandlers = { onLoadedMetadata, onTimeUpdate, onEnded, onError };
      state.audio.addEventListener("loadedmetadata", onLoadedMetadata);
      state.audio.addEventListener("timeupdate", onTimeUpdate);
      state.audio.addEventListener("ended", onEnded);
      state.audio.addEventListener("error", onError);
      state.audio.src = url;
      state.audio.load();
      void ensureScrubAudioReady(state).then((ready) => {
        if (!ready) return;
        draw(state);
        renderOverview(state);
      });
    }
  }

  setupTrackAudioPlayers(state, onResolveAudioUrl);
}
