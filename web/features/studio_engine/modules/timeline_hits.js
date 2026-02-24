export function createTimelineHitHandlers(deps = {}) {
  const {
    state,
    draw,
    renderOverview,
    CONSTANTS,
    isTrackMuted,
    applyTrackMuteChange,
    ensureScrubAudioReady,
    resolveEffectiveChannelMode,
    applyMuteBatch,
    getAllTrackNames,
    getGroupTrackNames,
    setTrackMuted,
  } = deps;
  const handleHit = (hit) => {
    if (hit?.type === "track_mute") {
      applyTrackMuteChange(hit.track_name, !isTrackMuted(state, hit.track_name));
      void ensureScrubAudioReady(state).finally(() => {
        draw(state);
        renderOverview(state);
      });
      return;
    }
    if (hit?.type === "track_channel_toggle") {
      const trackName = String(hit?.track_name || "").trim();
      if (!trackName) return;
      const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
      const track = tracks.find((item) => String(item?.name || "").trim() === trackName) || null;
      if (!track || String(track?.kind || "").toLowerCase() !== "audio") return;
      const currentMode = resolveEffectiveChannelMode(state, track);
      const nextMode = currentMode === "mono" ? "stereo" : "mono";
      state.trackChannelModeOverrides.set(trackName, nextMode);
      draw(state);
      renderOverview(state);
      return;
    }
    if (hit?.type === "mute_all") {
      applyMuteBatch(() => {
        let changed = false;
        for (const name of getAllTrackNames()) {
          changed = setTrackMuted(state, name, true) || changed;
        }
        return changed;
      });
      return;
    }
    if (hit?.type === "unmute_all") {
      applyMuteBatch(() => {
        let changed = false;
        for (const name of getAllTrackNames()) {
          changed = setTrackMuted(state, name, false) || changed;
        }
        return changed;
      });
      return;
    }
    if (hit?.type === "stage_group_toggle") {
      const groupTracks = getGroupTrackNames(hit.group_key);
      if (!groupTracks.length) {
        draw(state);
        renderOverview(state);
        return;
      }
      applyMuteBatch(() => {
        const allTrackNames = getAllTrackNames();
        const groupSet = new Set(groupTracks);
        const otherTracks = allTrackNames.filter((name) => !groupSet.has(name));
        const allChildrenMuted = groupTracks.every((name) => isTrackMuted(state, name));
        const allChildrenUnmuted = groupTracks.every((name) => !isTrackMuted(state, name));
        const allOthersUnmuted = otherTracks.every((name) => !isTrackMuted(state, name));
        let changed = false;
        if (allChildrenMuted || !allChildrenUnmuted || allOthersUnmuted) {
          for (const name of allTrackNames) {
            const shouldMute = !groupSet.has(name);
            changed = setTrackMuted(state, name, shouldMute) || changed;
          }
          return changed;
        }
        for (const name of allTrackNames) {
          changed = setTrackMuted(state, name, false) || changed;
        }
        for (const name of groupTracks) {
          changed = setTrackMuted(state, name, true) || changed;
        }
        return changed;
      });
      return;
    }
    state.selection = hit;
    draw(state);
    renderOverview(state);
  };


  return {
    handleHit,
  };
}
