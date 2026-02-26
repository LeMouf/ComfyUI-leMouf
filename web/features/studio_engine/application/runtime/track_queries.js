export function createTimelineTrackQueryHelpers(state, deps = {}) {
  const {
    resolveTrackStageGroup,
  } = deps;

  const getAllTrackNames = () => {
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const names = [];
    for (const track of tracks) {
      const name = String(track?.name || "").trim();
      if (!name) continue;
      names.push(name);
    }
    return names;
  };

  const getGroupTrackNames = (groupKey) => {
    const key = String(groupKey || "");
    if (!key) return [];
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const names = [];
    for (const track of tracks) {
      const name = String(track?.name || "").trim();
      if (!name) continue;
      if (resolveTrackStageGroup(track).key !== key) continue;
      names.push(name);
    }
    return names;
  };

  return {
    getAllTrackNames,
    getGroupTrackNames,
  };
}

