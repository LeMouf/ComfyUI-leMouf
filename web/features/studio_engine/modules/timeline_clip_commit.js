export function applyCommittedClipEditToLocalStudio(state, payload, deps = {}) {
  const {
    CONSTANTS,
    Utils,
    deriveVideoTrackNameFromLinkedAudio,
    inferStudioTrackKindByName,
    inferAudioChannelModeByTrackName,
    deriveLinkedAudioTargetTrackFromVideo,
    resolveInsertIndexForTargetTrack,
    refreshTimelineViewAfterDurationChange,
  } = deps;
  if (!state?.studioData || !payload || typeof payload !== "object") return false;
  const clipId = String(payload.clipId || "").trim();
  const resourceId = String(payload.resourceId || "").trim();
  const linkGroupId = String(payload.linkGroupId || "").trim();
  const trackName = String(payload.trackName || "").trim();
  const trackKind = String(payload.trackKind || "").trim().toLowerCase();
  const canonicalVideoTrackFromAudio =
    trackKind === "audio" ? deriveVideoTrackNameFromLinkedAudio(trackName) : "";
  const insertMode = Boolean(payload?.insertMode);
  const insertIndexRaw = Number(payload?.insertIndex);
  const hasInsertIndex = Number.isFinite(insertIndexRaw);
  if (!clipId || !trackName) return false;
  const eventsByTrack = state.studioData?.eventsByTrack && typeof state.studioData.eventsByTrack === "object"
    ? state.studioData.eventsByTrack
    : null;
  if (!eventsByTrack) return false;
  const studioTracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
  const trackKindByName = new Map(studioTracks.map((track) => [String(track?.name || "").trim(), String(track?.kind || "").toLowerCase()]));
  const matches = [];
  for (const [name, events] of Object.entries(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (!event || typeof event !== "object") continue;
      const eventClipId = String(event.clipId || "").trim();
      const eventResourceId = String(event.resourceId || "").trim();
      const eventLinkGroupId = String(event.linkGroupId || "").trim();
      const samePrimary = resourceId
        ? eventClipId === clipId && eventResourceId === resourceId
        : eventClipId === clipId;
      const sameLink = Boolean(linkGroupId) && eventLinkGroupId === linkGroupId;
      if (!samePrimary && !sameLink) continue;
      matches.push({ trackName: name, index: i, event });
    }
  }
  if (!matches.length) return false;

  const base = matches[0]?.event || {};
  const oldStart = Math.max(0, Number(base.time || 0));
  const nextStart = Math.max(0, Number(Utils.toFiniteNumber(payload.timeSec, oldStart)));
  const mode = String(payload.mode || "move").toLowerCase();
  const isMoveMode = mode === "move";
  const sourceDurationSec = Math.max(
    CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
    Number(base.sourceDurationSec || payload.sourceDurationSec || payload.durationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
  );
  const currentStartOffsetSec = Math.max(0, Number(base.startOffsetSec || 0));
  const explicitStartOffsetSec = Utils.toFiniteNumber(payload.startOffsetSec, null);
  let nextStartOffsetSec = currentStartOffsetSec;
  if (explicitStartOffsetSec != null) {
    nextStartOffsetSec = Math.max(0, explicitStartOffsetSec);
  } else if (mode === "trim_start") {
    nextStartOffsetSec = Math.max(0, currentStartOffsetSec + (nextStart - oldStart));
  }
  nextStartOffsetSec = Math.min(nextStartOffsetSec, Math.max(0, sourceDurationSec - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
  const maxDurationBySource = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, sourceDurationSec - nextStartOffsetSec);
  const nextDuration = Math.max(
    CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
    Math.min(Number(payload.durationSec || base.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC), maxDurationBySource)
  );

  const ensureTrack = (name, kindHint = "", options = {}) => {
    const safe = String(name || "").trim();
    if (!safe) return;
    if (!Array.isArray(eventsByTrack[safe])) eventsByTrack[safe] = [];
    if (!trackKindByName.has(safe)) {
      const inferredKind = kindHint || inferStudioTrackKindByName(safe);
      trackKindByName.set(safe, inferredKind);
      const row = {
        name: safe,
        kind: inferredKind || "audio",
        partition: "step_tracks",
        source: "",
        audioAssetKey: "",
        events: eventsByTrack[safe].length,
      };
      if (String(row.kind || "").toLowerCase() === "audio") {
        const hintedMode = String(options?.channelMode || "").trim().toLowerCase();
        const inferredMode = inferAudioChannelModeByTrackName(safe);
        row.channelMode = hintedMode === "mono" || hintedMode === "stereo"
          ? hintedMode
          : (inferredMode || "stereo");
        row.preserveEventDuration = true;
      }
      if (hasInsertIndex && Number.isFinite(Number(options?.insertIndex))) {
        const maxInsert = Math.max(1, studioTracks.length - 1);
        const insertAt = Utils.clamp(Math.round(Number(options.insertIndex)), 1, maxInsert);
        studioTracks.splice(insertAt, 0, row);
      } else {
        studioTracks.push(row);
      }
    }
  };

  for (const match of matches) {
    const currentTrackName = String(match.trackName || "").trim();
    const currentTrackKind = String(trackKindByName.get(currentTrackName) || inferStudioTrackKindByName(currentTrackName)).toLowerCase();
    const event = match.event;
    const eventSourceDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(event.sourceDurationSec || payload.sourceDurationSec || sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    let eventStartOffsetSec = nextStartOffsetSec;
    let eventDurationSec = nextDuration;
    if (isMoveMode) {
      eventStartOffsetSec = Math.max(0, Number(event.startOffsetSec || 0));
      eventStartOffsetSec = Math.min(
        eventStartOffsetSec,
        Math.max(0, eventSourceDurationSec - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      );
      const eventMaxDurationBySource = Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        eventSourceDurationSec - eventStartOffsetSec
      );
      eventDurationSec = Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Math.min(Number(event.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC), eventMaxDurationBySource)
      );
    }
    event.time = nextStart;
    event.duration = eventDurationSec;
    event.startOffsetSec = eventStartOffsetSec;
    event.sourceDurationSec = eventSourceDurationSec;
    if (linkGroupId) event.linkGroupId = linkGroupId;

    let targetTrackName = currentTrackName;
    if (currentTrackKind === trackKind) {
      targetTrackName = trackName;
    } else if (trackKind === "video" && currentTrackKind === "audio") {
      targetTrackName = deriveLinkedAudioTargetTrackFromVideo(trackName, currentTrackName);
    } else if (trackKind === "audio" && canonicalVideoTrackFromAudio) {
      if (currentTrackKind === "video") {
        targetTrackName = canonicalVideoTrackFromAudio;
      } else if (currentTrackKind === "audio") {
        targetTrackName = deriveLinkedAudioTargetTrackFromVideo(canonicalVideoTrackFromAudio, currentTrackName);
      }
    }
    if (targetTrackName !== currentTrackName) {
      const targetInsertIndex = insertMode
        ? resolveInsertIndexForTargetTrack(
          insertIndexRaw,
          targetTrackName,
          currentTrackKind,
          trackName,
          trackKind
        )
        : undefined;
      ensureTrack(targetTrackName, currentTrackKind, {
        insertIndex: targetInsertIndex,
        channelMode:
          currentTrackKind === "audio"
            ? (String(event?.channelMode || "").trim().toLowerCase() || inferAudioChannelModeByTrackName(targetTrackName))
            : "",
      });
      const sourceList = eventsByTrack[currentTrackName];
      if (Array.isArray(sourceList) && sourceList[match.index] === event) {
        sourceList.splice(match.index, 1);
      } else if (Array.isArray(sourceList)) {
        const idx = sourceList.indexOf(event);
        if (idx >= 0) sourceList.splice(idx, 1);
      }
      eventsByTrack[targetTrackName].push(event);
    }
  }

  for (const [name, events] of Object.entries(eventsByTrack)) {
    if (!Array.isArray(events)) continue;
    events.sort((a, b) => {
      const ta = Number(a?.time || 0);
      const tb = Number(b?.time || 0);
      if (ta !== tb) return ta - tb;
      return String(a?.clipId || "").localeCompare(String(b?.clipId || ""));
    });
    const track = studioTracks.find((row) => String(row?.name || "").trim() === name);
    if (track) track.events = events.length;
  }
  if (Array.isArray(studioTracks)) {
    const namesWithEvents = new Set();
    for (const [name, events] of Object.entries(eventsByTrack)) {
      const safeName = String(name || "").trim();
      if (!safeName || !Array.isArray(events) || events.length <= 0) continue;
      namesWithEvents.add(safeName);
    }
    for (let i = studioTracks.length - 1; i >= 0; i -= 1) {
      const row = studioTracks[i];
      const name = String(row?.name || "").trim();
      const kind = String(row?.kind || "").trim().toLowerCase();
      if (!name || kind === "dropzone") continue;
      if (namesWithEvents.has(name)) continue;
      studioTracks.splice(i, 1);
      if (Object.prototype.hasOwnProperty.call(eventsByTrack, name)) delete eventsByTrack[name];
    }
  }
  const maxEnd = Object.values(eventsByTrack).reduce((max, events) => {
    if (!Array.isArray(events)) return max;
    for (const event of events) {
      const end = Number(event?.time || 0) + Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
      if (end > max) max = end;
    }
    return max;
  }, 0);
  state.durationSec = Math.max(1, maxEnd);
  refreshTimelineViewAfterDurationChange(state);
  if (Array.isArray(state.studioData?.sections) && state.studioData.sections.length) {
    const last = state.studioData.sections[state.studioData.sections.length - 1];
    if (last && typeof last === "object") last.end = Math.max(Number(last.start || 0), state.durationSec);
  }
  return true;
}
