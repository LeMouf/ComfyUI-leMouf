import * as CONSTANTS from "../policies/constants.js";
import * as Utils from "../shared/utils.js";
import {
  inferStudioTrackKindByName,
  deriveLinkedAudioTargetTrackFromVideo,
  deriveVideoTrackNameFromLinkedAudio,
} from "./linking.js";
import { getClipId } from "./selection_state.js";

export function makePreviewClipEditKey(clipId, trackName = "") {
  const id = String(clipId || "").trim();
  if (!id) return "";
  const track = String(trackName || "").trim();
  return track ? `${track}::${id}` : id;
}

export function getPreviewClipEdit(state, clipId, trackName = "") {
  const key = String(clipId || "").trim();
  if (!key || !state?.previewClipEdits) return null;
  const byTrack = makePreviewClipEditKey(key, trackName);
  if (byTrack) {
    const scoped = state.previewClipEdits.get(byTrack);
    if (scoped && typeof scoped === "object") return scoped;
  }
  const generic = state.previewClipEdits.get(key);
  if (!generic || typeof generic !== "object") return null;
  const safeTrack = String(trackName || "").trim();
  const genericTrack = String(generic.trackName || "").trim();
  if (safeTrack && genericTrack && safeTrack !== genericTrack) return null;
  return generic;
}

export function resolveFinalPreviewClipEdit(state, session) {
  if (!state?.previewClipEdits || !session) return null;
  const preferTrackKind = String(session.trackKind || "").trim().toLowerCase();
  const targets = Array.isArray(session.previewTargets) ? session.previewTargets : [];
  const preferredTargets = targets.filter(
    (target) => String(target?.trackKind || "").trim().toLowerCase() === preferTrackKind
  );
  const orderedTargets = preferredTargets.length ? preferredTargets.concat(targets.filter((t) => !preferredTargets.includes(t))) : targets;

  for (const target of orderedTargets) {
    const clipId = String(target?.clipId || "").trim();
    if (!clipId) continue;
    const trackName = String(target?.trackName || "").trim();
    const byResolved = getPreviewClipEdit(state, clipId, trackName);
    if (byResolved && typeof byResolved === "object") return byResolved;
    const scopedKey = makePreviewClipEditKey(clipId, trackName);
    const scoped = scopedKey ? state.previewClipEdits.get(scopedKey) : null;
    if (scoped && typeof scoped === "object") return scoped;
    const generic = state.previewClipEdits.get(clipId);
    if (generic && typeof generic === "object") return generic;
  }

  const safeClipId = String(session.clipId || "").trim();
  if (safeClipId) {
    const any = collectPreviewEditsForClip(state, safeClipId);
    if (any.length) {
      if (preferTrackKind) {
        const withKind = any.find((row) => {
          const trackName = String(row?.trackName || "").trim();
          const kind = inferStudioTrackKindByName(trackName);
          return kind === preferTrackKind;
        });
        if (withKind) return withKind;
      }
      return any[0];
    }
    const generic = state.previewClipEdits.get(safeClipId);
    if (generic && typeof generic === "object") return generic;
  }
  return null;
}

export function collectPreviewEditsForClip(state, clipId) {
  const key = String(clipId || "").trim();
  if (!key || !(state?.previewClipEdits instanceof Map) || state.previewClipEdits.size === 0) return [];
  const out = [];
  const seen = new Set();
  for (const [entryKeyRaw, value] of state.previewClipEdits.entries()) {
    const entryKey = String(entryKeyRaw || "").trim();
    if (!entryKey || !value || typeof value !== "object") continue;
    if (!(entryKey === key || entryKey.endsWith(`::${key}`))) continue;
    const trackName = String(value.trackName || "").trim();
    const start = Math.max(0, Number(value.start || 0));
    const end = Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(value.end || (start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)));
    const startOffsetSec = Math.max(0, Number(value.startOffsetSec || 0));
    const sourceDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(value.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const signature = `${trackName}|${start.toFixed(4)}|${end.toFixed(4)}|${startOffsetSec.toFixed(4)}|${sourceDurationSec.toFixed(4)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({
      trackName,
      start,
      end,
      startOffsetSec,
      sourceDurationSec,
    });
  }
  return out;
}

export function collectLinkedClipTargets(
  state,
  { clipId = "", resourceId = "", linkGroupId = "", fallbackTrackName = "", fallbackTrackKind = "" } = {}
) {
  const safeClipId = String(clipId || "").trim();
  const safeResourceId = String(resourceId || "").trim();
  const safeLinkGroupId = String(linkGroupId || "").trim();
  const out = [];
  const seen = new Set();
  const eventsByTrack = state?.studioData?.eventsByTrack && typeof state.studioData.eventsByTrack === "object"
    ? state.studioData.eventsByTrack
    : null;
  const tracks = Array.isArray(state?.studioData?.tracks) ? state.studioData.tracks : [];
  const kindByTrack = new Map(
    tracks.map((track) => [String(track?.name || "").trim(), String(track?.kind || "").toLowerCase()])
  );
  if (eventsByTrack) {
    for (const [trackName, events] of Object.entries(eventsByTrack)) {
      if (!Array.isArray(events)) continue;
      const safeTrackName = String(trackName || "").trim();
      const trackKind = String(kindByTrack.get(safeTrackName) || inferStudioTrackKindByName(safeTrackName)).toLowerCase();
      for (const event of events) {
        const eventClipId = String(event?.clipId || event?.resourceId || "").trim();
        if (!eventClipId) continue;
        const eventResourceId = String(event?.resourceId || "").trim();
        const eventLinkGroupId = String(event?.linkGroupId || "").trim();
        const samePrimary = safeClipId && safeResourceId
          ? eventClipId === safeClipId && eventResourceId === safeResourceId
          : (safeClipId ? eventClipId === safeClipId : false);
        const sameLink = Boolean(safeLinkGroupId) &&
          eventLinkGroupId === safeLinkGroupId &&
          (!safeResourceId || !eventResourceId || eventResourceId === safeResourceId);
        if (!samePrimary && !sameLink) continue;
        const key = `${safeTrackName}::${eventClipId}::${eventResourceId || "-"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          clipId: eventClipId,
          resourceId: eventResourceId,
          trackName: safeTrackName,
          trackKind,
          linkGroupId: eventLinkGroupId || safeLinkGroupId,
        });
      }
    }
  }
  if (!out.length && safeClipId) {
    out.push({
      clipId: safeClipId,
      resourceId: safeResourceId,
      trackName: String(fallbackTrackName || "").trim(),
      trackKind: String(fallbackTrackKind || "").trim().toLowerCase(),
      linkGroupId: safeLinkGroupId,
    });
  }
  return out;
}

export function writePreviewClipEdits(state, session, next) {
  if (!state?.previewClipEdits || !session) return;
  const targets = Array.isArray(session.previewTargets) && session.previewTargets.length
    ? session.previewTargets
    : [{
        clipId: String(session.clipId || ""),
        resourceId: String(session.resourceId || ""),
        trackName: String(session.trackName || ""),
        trackKind: String(session.trackKind || ""),
        linkGroupId: String(session.linkGroupId || ""),
      }];
  const targetClipIds = new Set(
    targets
      .map((target) => String(target?.clipId || "").trim())
      .filter(Boolean)
  );
  const primaryClipId = String(session.clipId || "").trim();
  if (primaryClipId) targetClipIds.add(primaryClipId);
  if (targetClipIds.size) {
    for (const key of Array.from(state.previewClipEdits.keys())) {
      const textKey = String(key || "").trim();
      if (!textKey) continue;
      for (const clipId of targetClipIds.values()) {
        if (!clipId) continue;
        if (textKey === clipId || textKey.endsWith(`::${clipId}`)) {
          state.previewClipEdits.delete(key);
          break;
        }
      }
    }
  }
  const nextStart = Math.max(
    0,
    Number(Utils.toFiniteNumber(next?.start, Utils.toFiniteNumber(session.start, 0)))
  );
  const nextEnd = Math.max(
    nextStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
    Number(
      Utils.toFiniteNumber(
        next?.end,
        Utils.toFiniteNumber(session.end, nextStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      )
    )
  );
  const nextTrackName = String(next?.trackName || session.trackName || "");
  const nextStartOffsetSec = Math.max(0, Number(next?.startOffsetSec ?? session.startOffsetSec ?? 0));
  const nextSourceDurationSec = Math.max(
    CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
    Number(next?.sourceDurationSec || session.sourceDurationSec || (nextEnd - nextStart) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
  );
  const canonicalVideoTrackFromAudio = session.trackKind === "audio"
    ? deriveVideoTrackNameFromLinkedAudio(nextTrackName)
    : "";
  let primaryPreview = null;
  const primaryTarget = targets.find(
    (target) => String(target?.trackKind || "").toLowerCase() === String(session.trackKind || "").toLowerCase()
  ) || targets[0] || null;
  for (const target of targets) {
    const targetClipId = String(target?.clipId || "").trim();
    if (!targetClipId) continue;
    const targetTrackKind = String(target?.trackKind || "").toLowerCase();
    let targetTrackName = String(target?.trackName || nextTrackName || "").trim();
    if (session.mode === "move") {
      if (targetTrackKind === session.trackKind) {
        targetTrackName = nextTrackName;
      } else if (
        session.trackKind === "video" &&
        targetTrackKind === "audio"
      ) {
        targetTrackName = deriveLinkedAudioTargetTrackFromVideo(nextTrackName, targetTrackName);
      } else if (session.trackKind === "audio" && canonicalVideoTrackFromAudio) {
        if (targetTrackKind === "video") {
          targetTrackName = canonicalVideoTrackFromAudio;
        } else if (targetTrackKind === "audio") {
          targetTrackName = deriveLinkedAudioTargetTrackFromVideo(canonicalVideoTrackFromAudio, targetTrackName);
        }
      }
    }
    const preview = {
      start: nextStart,
      end: nextEnd,
      trackName: targetTrackName,
      startOffsetSec: nextStartOffsetSec,
      sourceDurationSec: nextSourceDurationSec,
    };
    const scopedKey = makePreviewClipEditKey(targetClipId, targetTrackName);
    if (scopedKey) state.previewClipEdits.set(scopedKey, preview);
    if (
      !primaryPreview &&
      primaryTarget &&
      String(primaryTarget.clipId || "").trim() === targetClipId &&
      String(primaryTarget.trackKind || "").toLowerCase() === String(target.trackKind || "").toLowerCase()
    ) {
      primaryPreview = preview;
    }
  }
  if (String(session.clipId || "").trim()) {
    const fallbackPreview = primaryPreview || {
      start: nextStart,
      end: nextEnd,
      trackName: nextTrackName,
      startOffsetSec: nextStartOffsetSec,
      sourceDurationSec: nextSourceDurationSec,
    };
    state.previewClipEdits.set(String(session.clipId || "").trim(), fallbackPreview);
  }
}

export function clearPreviewClipEditsForSession(state, session) {
  if (!state?.previewClipEdits || !session) return;
  const targets = Array.isArray(session.previewTargets) && session.previewTargets.length
    ? session.previewTargets
    : [{ clipId: String(session.clipId || "") }];
  for (const target of targets) {
    const clipId = String(target?.clipId || "").trim();
    const trackName = String(target?.trackName || "").trim();
    const scopedKey = makePreviewClipEditKey(clipId, trackName);
    if (scopedKey) state.previewClipEdits.delete(scopedKey);
  }
  const primaryKey = String(session.clipId || "").trim();
  if (primaryKey) state.previewClipEdits.delete(primaryKey);
  const clipIds = new Set(
    targets
      .map((target) => String(target?.clipId || "").trim())
      .filter(Boolean)
      .concat(primaryKey ? [primaryKey] : [])
  );
  if (clipIds.size) {
    for (const key of Array.from(state.previewClipEdits.keys())) {
      const textKey = String(key || "");
      for (const clipId of clipIds) {
        if (!clipId) continue;
        if (textKey === clipId || textKey.endsWith(`::${clipId}`)) {
          state.previewClipEdits.delete(key);
          break;
        }
      }
    }
  }
}

export function applyPreviewClipGeometry(state, clip, trackName) {
  const clipId = getClipId(clip);
  const edit = getPreviewClipEdit(state, clipId, trackName);
  if (!edit) return clip;
  const editTrackName = String(edit.trackName || "").trim();
  if (editTrackName && editTrackName !== String(trackName || "").trim()) return null;
  const maxDurationSec = state?.allowDurationExtend
    ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC
    : Math.max(0, Number(state?.durationSec || 0));
  const start = Utils.clamp(Number(edit.start || 0), 0, maxDurationSec);
  const end = Utils.clamp(
    Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(edit.end || start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)),
    start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
    Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, maxDurationSec)
  );
  return {
    ...clip,
    start,
    end,
    startOffsetSec: Math.max(0, Number(edit.startOffsetSec ?? clip?.startOffsetSec ?? 0)),
    sourceDurationSec: Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(edit.sourceDurationSec ?? clip?.sourceDurationSec ?? CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    ),
  };
}

export function collectPreviewInjectedClipsForTrack(state, trackName, trackKind, clipClampMaxSec) {
  const safeTrackName = String(trackName || "").trim();
  if (!safeTrackName) return [];
  if (!(state?.previewClipEdits instanceof Map) || state.previewClipEdits.size === 0) return [];
  const eventsByTrack = state?.studioData?.eventsByTrack;
  if (!eventsByTrack || typeof eventsByTrack !== "object") return [];
  const normalizedTrackKind = String(trackKind || "").trim().toLowerCase();
  const out = [];
  const seen = new Set();
  for (const [sourceTrackNameRaw, events] of Object.entries(eventsByTrack)) {
    const sourceTrackName = String(sourceTrackNameRaw || "").trim();
    if (!sourceTrackName || sourceTrackName === safeTrackName || !Array.isArray(events)) continue;
    for (const event of events) {
      const clipId = String(event?.clipId || event?.resourceId || "").trim();
      if (!clipId) continue;
      const editCandidates = collectPreviewEditsForClip(state, clipId);
      if (!editCandidates.length) continue;
      const edit = editCandidates.find((row) => String(row?.trackName || "").trim() === safeTrackName) || null;
      if (!edit) continue;
      const targetTrackName = String(edit.trackName || sourceTrackName).trim();
      if (targetTrackName !== safeTrackName) continue;
      const inferredTargetKind = inferStudioTrackKindByName(targetTrackName);
      if (normalizedTrackKind && inferredTargetKind && inferredTargetKind !== normalizedTrackKind) continue;
      const resourceId = String(event?.resourceId || "").trim();
      const key = `${clipId}::${resourceId || "-"}::${sourceTrackName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Utils.clamp(Math.max(0, Number(edit.start || event?.time || 0)), 0, clipClampMaxSec);
      const end = Utils.clamp(
        Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(edit.end || (Number(event?.time || 0) + Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)))),
        start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        clipClampMaxSec
      );
      if (!(end > start + 1e-6)) continue;
      out.push({
        start,
        end,
        label: String(event?.label || "clip"),
        notesCount: 0,
        clipId,
        resourceId: resourceId || null,
        linkGroupId: String(event?.linkGroupId || "").trim(),
        startOffsetSec: Math.max(0, Number(edit.startOffsetSec ?? event?.startOffsetSec ?? 0)),
        sourceDurationSec: Math.max(
          CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
          Number(edit.sourceDurationSec ?? event?.sourceDurationSec ?? (end - start) ?? CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
        ),
        thumbnailSrc: String(event?.previewSrc || event?.src || "").trim(),
        src: String(event?.src || "").trim(),
        previewSrc: String(event?.previewSrc || "").trim(),
        trackName: safeTrackName,
        trackKind: normalizedTrackKind || inferredTargetKind || "",
      });
    }
  }
  return out;
}

export function serializePreviewClipEdits(state) {
  const map = state?.previewClipEdits;
  if (!(map instanceof Map) || map.size === 0) return null;
  const out = {};
  for (const [key, value] of map.entries()) {
    const id = String(key || "").trim();
    if (!id || !value || typeof value !== "object") continue;
    out[id] = {
      start: Math.max(0, Number(value.start || 0)),
      end: Math.max(0, Number(value.end || 0)),
      trackName: String(value.trackName || "").trim(),
      startOffsetSec: Math.max(0, Number(value.startOffsetSec || 0)),
      sourceDurationSec: Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(value.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)),
    };
  }
  return Object.keys(out).length ? out : null;
}
