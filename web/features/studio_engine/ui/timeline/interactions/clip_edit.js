import { resolveClipEditResult } from "../../../domain/services/edit_result.js";

export function createTimelineClipEditHandlers(deps = {}) {
  const {
    state,
    canvas,
    CONSTANTS,
    Utils,
    Drop,
    draw,
    renderOverview,
    isTrackLocked,
    isClipSelectedInSet,
    clearClipSelectionSet,
    collectMultiSelectedMoveMembers,
    collectLinkedClipTargets,
    resolveGroupMoveDeltaBounds,
    resolveSlipOffsetFromRailHit,
    writePreviewClipEdits,
    resolveVisibleSectionHeight,
    canonicalizeTargetTrackForResource,
    getTrackNamesByKind,
    createNextTrackLaneName,
    deriveLinkedAudioTargetTrackFromVideo,
    snapTimeSec,
    isNearTimelineOrigin,
    resolveNonOverlappingTrackName,
    resolveMoveDeltaBoundsForClip,
    collectTrackNeighborBounds,
    getPreviewClipEdit,
    clearPreviewClipEditsForSession,
    replaceClipSelectionTrackKey,
    applyCommittedClipEditToLocalStudio,
    setupTrackAudioPlayers,
    syncTrackAudioPlayersToPlayhead,
    resolveFinalPreviewClipEdit,
  } = deps;
  const beginClipEdit = (event, hit, pointerCanvasX = null) => {
    const clipId = String(hit?.clip_id || hit?.id || "").trim();
    const resourceId = String(hit?.resource_id || "").trim();
    const trackName = String(hit?.track_name || "").trim();
    const linkGroupId = String(hit?.link_group_id || "").trim();
    if (!clipId || !resourceId || !trackName) return false;
    const hitType = String(hit?.type || "");
    const mode = hitType === "clip_trim_start"
      ? "trim_start"
      : (hitType === "clip_trim_end"
        ? "trim_end"
        : ((hitType === "clip_window" || hitType === "clip_window_rail") ? "slip" : "move"));
    const trackKind = String(hit?.track_kind || "").toLowerCase();
    if (trackKind !== "video" && trackKind !== "image" && trackKind !== "audio") return false;
    if (isTrackLocked(state, trackName)) return false;
    const clipAlreadySelected = isClipSelectedInSet(state, trackName, clipId);
    if (mode === "move" && !clipAlreadySelected) clearClipSelectionSet(state);
    const maxDurationSec = state.allowDurationExtend ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
    const start = Utils.clamp(Number(hit?.t0_sec || 0), 0, maxDurationSec);
    const end = Utils.clamp(
      Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(hit?.t1_sec || start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)),
      start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      maxDurationSec
    );
    let groupMembers = [];
    let groupMoveBounds = null;
    if (mode === "move" && hitType === "clip") {
      groupMembers = collectMultiSelectedMoveMembers(state, hit)
        .map((member) => ({
          ...member,
          previewTargets: collectLinkedClipTargets(state, {
            clipId: member.clipId,
            resourceId: member.resourceId,
            linkGroupId: member.linkGroupId,
            fallbackTrackName: member.trackName,
            fallbackTrackKind: member.trackKind,
          }),
        }));
      if (groupMembers.length > 1) {
        const maxTimelineSec = state.allowDurationExtend ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
        groupMoveBounds = resolveGroupMoveDeltaBounds(state, groupMembers, maxTimelineSec);
      } else {
        groupMembers = [];
      }
    }
    state.clipEditSession = {
      pointerId: event.pointerId,
      mode,
      clipId,
      resourceId,
      trackName,
      trackKind,
      start,
      end,
      sourceDurationSec: Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(hit?.source_duration_sec || (end - start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      ),
      startOffsetSec: Math.max(0, Number(hit?.start_offset_sec || 0)),
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      pointerOffsetSec: 0,
      linkGroupId,
      groupMembers,
      groupMoveBounds,
      groupDeltaSec: 0,
      liveStartSec: start,
      liveEndSec: end,
      liveTrackName: trackName,
      liveInsertMode: false,
      liveInsertIndex: null,
      liveInsertTrackName: "",
      liveStartOffsetSec: Math.max(0, Number(hit?.start_offset_sec || 0)),
      previewTargets: collectLinkedClipTargets(state, {
        clipId,
        resourceId,
        linkGroupId,
        fallbackTrackName: trackName,
        fallbackTrackKind: trackKind,
      }),
    };
    {
      const pointerX = Number.isFinite(Number(pointerCanvasX))
        ? Number(pointerCanvasX)
        : (() => {
            const rect = canvas.getBoundingClientRect();
            return event.clientX - rect.left;
          })();
      const clipStartX = CONSTANTS.LEFT_GUTTER + (start - state.t0Sec) * state.pxPerSec;
      const offsetSec = (pointerX - clipStartX) / Math.max(1e-6, state.pxPerSec);
      state.clipEditSession.pointerOffsetSec = Utils.clamp(
        Number.isFinite(offsetSec) ? offsetSec : 0,
        0,
        Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, end - start)
      );
    }
    if (mode === "slip" && hitType === "clip_window_rail") {
      const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, end - start);
      const jumpedOffsetSec = resolveSlipOffsetFromRailHit(
        hit,
        Number(pointerCanvasX),
        Number(state.clipEditSession.sourceDurationSec || clipDurationSec),
        clipDurationSec
      );
      if (jumpedOffsetSec != null) {
        state.clipEditSession.startOffsetSec = Math.max(0, Number(jumpedOffsetSec || 0));
      }
    }
    state.autoFit = false;
    writePreviewClipEdits(state, state.clipEditSession, {
      start,
      end,
      trackName,
      startOffsetSec: Math.max(0, Number(state.clipEditSession.startOffsetSec || 0)),
      sourceDurationSec: Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(state.clipEditSession.sourceDurationSec || (end - start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      ),
    });
    state.selection = {
      ...(hit || {}),
      type: "clip",
      clip_id: clipId,
      resource_id: resourceId,
      track_name: trackName,
      t0_sec: start,
      t1_sec: end,
      name: String(hit?.name || "clip"),
    };
    state.pendingTrackPointer = null;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {}
    canvas.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
    draw(state);
    renderOverview(state);
    return true;
  };

  const updateClipEdit = (event) => {
    const session = state.clipEditSession;
    if (!session) return false;
    if (session.pointerId !== null && event.pointerId !== session.pointerId) return false;
    const deltaSec = (event.clientX - session.pointerStartX) / Math.max(1e-6, state.pxPerSec);
    let nextTrackName = session.trackName;
    let nextStart = session.start;
    let nextEnd = session.end;
    let nextStartOffsetSec = Math.max(0, Number(session.startOffsetSec || 0));
    session.liveInsertMode = false;
    session.liveInsertIndex = null;
    session.liveInsertTrackName = "";
    const sourceDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(session.sourceDurationSec || (session.end - session.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const sessionStartOffsetSec = Math.max(0, Number(session.startOffsetSec || 0));
    if (session.mode === "move") {
      const moveDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const maxStart = state.allowDurationExtend
        ? Math.max(0, CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC - duration)
        : Math.max(0, state.durationSec - duration);
      const rect = canvas.getBoundingClientRect();
      const pointerCanvasX = event.clientX - rect.left;
      const rawStartFromPointer = state.t0Sec + (pointerCanvasX - CONSTANTS.LEFT_GUTTER) / Math.max(1e-6, state.pxPerSec) - Math.max(0, Number(session.pointerOffsetSec || 0));
      const rawStart = Utils.clamp(rawStartFromPointer, 0, maxStart);
      const boundarySnapSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      const x = pointerCanvasX;
      const y = event.clientY - rect.top;
      const groupMembers = Array.isArray(session.groupMembers) ? session.groupMembers : [];
      if (groupMembers.length > 1) {
        let snappedAnchorStart = snapTimeSec(state, rawStart, {
          trackName: session.trackName,
          excludeClipId: session.clipId,
        });
        if (isNearTimelineOrigin(state, rawStart, x)) snappedAnchorStart = 0;
        if (rawStart >= maxStart - boundarySnapSec) snappedAnchorStart = maxStart;
        let delta = snappedAnchorStart - session.start;
        const maxTimelineSec = state.allowDurationExtend ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
        const bounds = session.groupMoveBounds || resolveGroupMoveDeltaBounds(state, groupMembers, maxTimelineSec);
        const minDelta = Number.isFinite(Number(bounds?.minDelta)) ? Number(bounds.minDelta) : 0;
        const maxDelta = Number.isFinite(Number(bounds?.maxDelta)) ? Number(bounds.maxDelta) : 0;
        delta = Utils.clamp(delta, minDelta, maxDelta);
        session.groupDeltaSec = delta;
        const maxTimelineForMembers = state.allowDurationExtend
          ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC
          : Math.max(0, Number(state.durationSec || 0));
        const nearZeroSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
        for (const member of groupMembers) {
          const memberBaseStart = Math.max(0, Number(member?.start || 0));
          const memberDuration = Math.max(
            CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            Number(member?.end || 0) - memberBaseStart
          );
          const maxMemberStart = Math.max(0, maxTimelineForMembers - memberDuration);
          let memberStart = Utils.clamp(memberBaseStart + delta, 0, maxMemberStart);
          if (memberStart <= nearZeroSec) memberStart = 0;
          const memberEnd = memberStart + memberDuration;
          const memberSession = {
            ...session,
            clipId: String(member?.clipId || ""),
            resourceId: String(member?.resourceId || ""),
            trackName: String(member?.trackName || ""),
            trackKind: String(member?.trackKind || ""),
            linkGroupId: String(member?.linkGroupId || ""),
            start: Math.max(0, Number(member?.start || 0)),
            end: Math.max(
              Math.max(0, Number(member?.start || 0)) + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
              Number(member?.end || 0)
            ),
            startOffsetSec: Math.max(0, Number(member?.startOffsetSec || 0)),
            sourceDurationSec: Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(member?.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)),
            previewTargets: Array.isArray(member?.previewTargets) ? member.previewTargets : [],
          };
          writePreviewClipEdits(state, memberSession, {
            start: memberStart,
            end: memberEnd,
            trackName: memberSession.trackName,
            startOffsetSec: memberSession.startOffsetSec,
            sourceDurationSec: memberSession.sourceDurationSec,
          });
        }
        nextTrackName = session.trackName;
        nextStart = Math.max(0, session.start + delta);
        nextEnd = Math.max(nextStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, session.end + delta);
      } else {
        let moveInsertMode = false;
        let moveInsertIndex = null;
        const target = Drop.resolveDropTargetFromPoint(state, x, y, session.trackKind, {
          isTrackLocked,
          resolveVisibleSectionHeight,
        });
        if (target?.trackName) {
          nextTrackName = String(target.trackName || nextTrackName);
          const canonical = canonicalizeTargetTrackForResource(
            nextTrackName,
            String(target?.trackKind || ""),
            session.trackKind
          );
          nextTrackName = canonical.trackName || nextTrackName;
        }
        const rawInsertTrackName = String(target?.trackName || "").trim();
        if (Boolean(target?.insertMode) && Number.isFinite(Number(target?.insertIndex))) {
          moveInsertMode = true;
          moveInsertIndex = Math.max(0, Math.round(Number(target.insertIndex)));
        }
        if (moveInsertMode) {
          // Insert-mode targets can be dropzones. For live move preview, we need
          // a concrete future lane name (not the dropzone row), otherwise linked
          // audio mapping can drift and appear detached during drag.
          const desiredMoveKind = String(session.trackKind || "").trim().toLowerCase();
          const previewTargets = Array.isArray(session.previewTargets) ? session.previewTargets : [];
          const hasLinkedVideoTarget = previewTargets.some((targetRef) => {
            const refKind = String(targetRef?.trackKind || "").trim().toLowerCase();
            const refTrack = String(targetRef?.trackName || "").trim();
            return refKind === "video" || /^video\s*\d+$/i.test(refTrack);
          });
          const insertTrackKind =
            desiredMoveKind === "audio" && hasLinkedVideoTarget
              ? "video"
              : desiredMoveKind;
          if (insertTrackKind === "video" || insertTrackKind === "image" || insertTrackKind === "audio") {
            const knownSameKindTracks = getTrackNamesByKind(state, insertTrackKind);
            const previewInsertTrack = createNextTrackLaneName(insertTrackKind, knownSameKindTracks);
            if (previewInsertTrack) {
              if (desiredMoveKind === "audio" && insertTrackKind === "video") {
                nextTrackName =
                  deriveLinkedAudioTargetTrackFromVideo(previewInsertTrack, session.trackName) ||
                  nextTrackName;
              } else {
                nextTrackName = previewInsertTrack;
              }
            }
          }
        }
        nextStart = snapTimeSec(state, rawStart, {
          trackName: nextTrackName,
          excludeClipId: session.clipId,
        });
        nextStart = Utils.clamp(nextStart, 0, maxStart);
        if (isNearTimelineOrigin(state, rawStart, x)) nextStart = 0;
        if (rawStart >= maxStart - boundarySnapSec) nextStart = maxStart;
        nextEnd = nextStart + duration;
        if (!moveInsertMode) {
          const laneTrackName = resolveNonOverlappingTrackName(state, {
            preferredTrackName: nextTrackName,
            trackKind: session.trackKind,
            startSec: nextStart,
            endSec: nextEnd,
            excludeClipId: session.clipId,
          });
          if (laneTrackName && laneTrackName !== nextTrackName) {
            nextTrackName = laneTrackName;
            const canonicalLane = canonicalizeTargetTrackForResource(
              nextTrackName,
              session.trackKind,
              session.trackKind
            );
            nextTrackName = canonicalLane.trackName || nextTrackName;
            nextStart = snapTimeSec(state, nextStart, {
              trackName: nextTrackName,
              excludeClipId: session.clipId,
            });
            nextStart = Utils.clamp(nextStart, 0, maxStart);
            if (isNearTimelineOrigin(state, rawStart, x)) nextStart = 0;
            if (rawStart >= maxStart - boundarySnapSec) nextStart = maxStart;
            nextEnd = nextStart + duration;
          }
        }
        const maxTimelineSec = state.allowDurationExtend ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
        const moveBounds = resolveMoveDeltaBoundsForClip(state, {
          trackName: nextTrackName,
          clipStartSec: session.start,
          clipEndSec: session.end,
          excludeClipId: session.clipId,
          maxTimelineSec,
        });
        const boundedMinStartRaw = session.start + Number(moveBounds?.minDelta || 0);
        const boundedMaxStart = session.start + Number(moveBounds?.maxDelta || 0);
        const nearZeroSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
        // Avoid microscopic positive minima near timeline origin (precision artifacts),
        // which produce a visible "shrink then restore" effect during move preview.
        const boundedMinStart = boundedMinStartRaw <= nearZeroSec + CONSTANTS.CLIP_EDIT_TIME_EPS_SEC
          ? 0
          : boundedMinStartRaw;
        nextStart = Utils.clamp(nextStart, boundedMinStart, boundedMaxStart);
        // Strong magnetic snap at timeline origin for move operations.
        if (
          isNearTimelineOrigin(state, rawStart, x) &&
          boundedMinStart <= nearZeroSec + CONSTANTS.CLIP_EDIT_TIME_EPS_SEC
        ) {
          nextStart = 0;
        }
        // If pointer reached left timeline edge and there is no real left bound,
        // force exact origin snap to avoid zoom-dependent drift.
        if (
          pointerCanvasX <= CONSTANTS.LEFT_GUTTER + CONSTANTS.CLIP_EDIT_SNAP_PX &&
          boundedMinStart <= nearZeroSec + CONSTANTS.CLIP_EDIT_TIME_EPS_SEC
        ) {
          nextStart = 0;
        }
        if (rawStart <= nearZeroSec && boundedMinStart <= nearZeroSec + CONSTANTS.CLIP_EDIT_TIME_EPS_SEC) {
          nextStart = 0;
        }
        if (Math.abs(nextStart) <= CONSTANTS.CLIP_EDIT_TIME_EPS_SEC) nextStart = 0;
        nextEnd = nextStart + moveDurationSec;
        // Move is a pure translation: never trim duration implicitly.
        session.liveInsertMode = moveInsertMode;
        session.liveInsertIndex = moveInsertMode ? moveInsertIndex : null;
        session.liveInsertTrackName = moveInsertMode ? rawInsertTrackName : "";
      }
    } else if (session.mode === "trim_start") {
      const minStartByOffset = Math.max(0, session.start - sessionStartOffsetSec);
      const rawStart = Utils.clamp(
        session.start + deltaSec,
        minStartByOffset,
        session.end - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC
      );
      const trackBounds = collectTrackNeighborBounds(state, {
        trackName: session.trackName,
        clipStartSec: session.start,
        clipEndSec: session.end,
        excludeClipId: session.clipId,
      });
      const boundedMinStart = Math.max(minStartByOffset, Number(trackBounds?.leftBoundSec || 0));
      const boundarySnapSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      nextStart = snapTimeSec(state, rawStart, {
        trackName: session.trackName,
        excludeClipId: session.clipId,
      });
      if (rawStart <= boundarySnapSec && boundedMinStart <= boundarySnapSec) nextStart = boundedMinStart;
      nextStart = Utils.clamp(nextStart, boundedMinStart, session.end - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC);
      const deltaStartSec = nextStart - session.start;
      nextStartOffsetSec = Math.max(0, sessionStartOffsetSec + deltaStartSec);
      const maxDurationBySource = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, sourceDurationSec - nextStartOffsetSec);
      const nextDuration = session.end - nextStart;
      if (nextDuration > maxDurationBySource) {
        nextStart = session.end - maxDurationBySource;
        nextStart = Utils.clamp(nextStart, boundedMinStart, session.end - CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC);
      }
    } else if (session.mode === "trim_end") {
      const maxEnd = state.allowDurationExtend ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC : state.durationSec;
      const maxEndBySource = session.start + Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, sourceDurationSec - sessionStartOffsetSec);
      const trackBounds = collectTrackNeighborBounds(state, {
        trackName: session.trackName,
        clipStartSec: session.start,
        clipEndSec: session.end,
        excludeClipId: session.clipId,
      });
      const maxTrimEnd = Math.min(maxEnd, maxEndBySource, Number(trackBounds?.rightBoundSec || Number.POSITIVE_INFINITY));
      const rawEnd = Utils.clamp(session.end + deltaSec, session.start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, maxEnd);
      const boundarySnapSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      nextEnd = snapTimeSec(state, rawEnd, {
        trackName: session.trackName,
        excludeClipId: session.clipId,
        maxTimeSec: maxEnd,
      });
      if (!state.allowDurationExtend && rawEnd >= state.durationSec - boundarySnapSec) nextEnd = state.durationSec;
      if (rawEnd >= maxTrimEnd - boundarySnapSec) nextEnd = maxTrimEnd;
      nextEnd = Utils.clamp(nextEnd, session.start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, maxTrimEnd);
    } else if (session.mode === "slip") {
      const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const maxOffsetSec = Math.max(0, sourceDurationSec - clipDurationSec);
      const rawOffsetSec = sessionStartOffsetSec + deltaSec;
      nextStartOffsetSec = Utils.clamp(rawOffsetSec, 0, maxOffsetSec);
      nextStart = session.start;
      nextEnd = session.end;
    }
    if (session.mode === "move") {
      // Hard invariant for move mode: pure translation only.
      const moveDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      nextStart = Math.max(0, Number(nextStart || 0));
      nextEnd = nextStart + moveDurationSec;
      nextStartOffsetSec = sessionStartOffsetSec;
    }
    session.liveStartSec = nextStart;
    session.liveEndSec = nextEnd;
    session.liveTrackName = nextTrackName;
    session.liveStartOffsetSec = nextStartOffsetSec;
    const groupMembers = Array.isArray(session.groupMembers) ? session.groupMembers : [];
    if (session.mode !== "move" || groupMembers.length <= 1) {
      writePreviewClipEdits(state, session, {
        start: nextStart,
        end: nextEnd,
        trackName: nextTrackName,
        startOffsetSec: nextStartOffsetSec,
        sourceDurationSec,
      });
    }
    state.selection = {
      ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
      type: "clip",
      clip_id: session.clipId,
      resource_id: session.resourceId,
      track_name: nextTrackName,
      t0_sec: nextStart,
      t1_sec: nextEnd,
      link_group_id: String(session.linkGroupId || ""),
    };
    draw(state);
    return true;
  };

  const finalizeClipEdit = (event, cancelled = false) => {
    const session = state.clipEditSession;
    if (!session) return false;
    if (session.pointerId !== null && event.pointerId !== session.pointerId) return false;
    state.clipEditSession = null;
    canvas.style.cursor = "";
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
    const groupMembers = Array.isArray(session.groupMembers) ? session.groupMembers : [];
    const isGroupMove = session.mode === "move" && groupMembers.length > 1;
    if (cancelled) {
      if (isGroupMove) {
        for (const member of groupMembers) {
          clearPreviewClipEditsForSession(state, {
            ...session,
            clipId: String(member?.clipId || ""),
            trackName: String(member?.trackName || ""),
            previewTargets: Array.isArray(member?.previewTargets) ? member.previewTargets : [],
          });
        }
      } else {
        clearPreviewClipEditsForSession(state, session);
      }
      draw(state);
      renderOverview(state);
      return true;
    }
    if (isGroupMove) {
      let acceptedAny = false;
      for (const member of groupMembers) {
        const memberClipId = String(member?.clipId || "").trim();
        const memberResourceId = String(member?.resourceId || "").trim();
        const memberTrackName = String(member?.trackName || "").trim();
        if (!memberClipId || !memberResourceId || !memberTrackName) continue;
        const current = getPreviewClipEdit(state, memberClipId, memberTrackName) || {
          start: Math.max(0, Number(member?.start || 0)),
          end: Math.max(
            Math.max(0, Number(member?.start || 0)) + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            Number(member?.end || 0)
          ),
          trackName: memberTrackName,
          startOffsetSec: Math.max(0, Number(member?.startOffsetSec || 0)),
          sourceDurationSec: Math.max(
            CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            Number(member?.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
          ),
        };
        const previewStartSec = Math.max(
          0,
          Number(Utils.toFiniteNumber(current.start, Utils.toFiniteNumber(member?.start, 0)))
        );
        const previewEndSec = Math.max(
          previewStartSec + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
          Number(
            Utils.toFiniteNumber(
              current.end,
              Utils.toFiniteNumber(member?.end, previewStartSec + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
            )
          )
        );
        const payload = {
          clipId: memberClipId,
          resourceId: memberResourceId,
          linkGroupId: String(member?.linkGroupId || ""),
          trackKind: String(member?.trackKind || ""),
          trackName: String(current.trackName || memberTrackName),
          timeSec: previewStartSec,
          durationSec: Math.max(
            CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            previewEndSec - previewStartSec
          ),
          startOffsetSec: Math.max(
            0,
            Number(current.startOffsetSec ?? member?.startOffsetSec ?? 0)
          ),
          mode: "move",
          sourceDurationSec: Math.max(
            CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            Number(current.sourceDurationSec || member?.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
          ),
        };
        const editResult = typeof state.onClipEdit === "function"
          ? state.onClipEdit(payload)
          : false;
        const resolvedEdit = resolveClipEditResult(editResult);
        const accepted = resolvedEdit.accepted;
        const committedTrackName = String(resolvedEdit.trackName || payload.trackName || "").trim() || payload.trackName;
        payload.trackName = committedTrackName;
        clearPreviewClipEditsForSession(state, {
          ...session,
          clipId: memberClipId,
          trackName: memberTrackName,
          previewTargets: Array.isArray(member?.previewTargets) ? member.previewTargets : [],
        });
        if (!accepted) continue;
        acceptedAny = true;
        replaceClipSelectionTrackKey(state, memberClipId, memberTrackName, committedTrackName);
        applyCommittedClipEditToLocalStudio(state, payload);
        if (memberClipId === String(session.clipId || "").trim()) {
          state.selection = {
            ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
            type: "clip",
            clip_id: memberClipId,
            resource_id: memberResourceId,
            track_name: committedTrackName,
            t0_sec: Math.max(0, Number(payload.timeSec || 0)),
            t1_sec: Math.max(
              Math.max(0, Number(payload.timeSec || 0)) + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
              Math.max(0, Number(payload.timeSec || 0)) + Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(payload.durationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC))
            ),
            origin_step_index: Number(state.selection?.origin_step_index || 2),
          };
        }
      }
      if (acceptedAny && typeof state.onResolveAudioUrl === "function") {
        setupTrackAudioPlayers(state, state.onResolveAudioUrl);
        syncTrackAudioPlayersToPlayhead(state, { play: Boolean(state.isPlaying), forceSeek: true });
      }
      draw(state);
      renderOverview(state);
      return true;
    }
    const current = resolveFinalPreviewClipEdit(state, session) || {
      start: session.start,
      end: session.end,
      trackName: session.trackName,
    };
    const liveStartSec = Utils.toFiniteNumber(session.liveStartSec, null);
    const liveEndSec = Utils.toFiniteNumber(session.liveEndSec, null);
    const liveTrackName = String(session.liveTrackName || "").trim();
    const liveStartOffsetSec = Utils.toFiniteNumber(session.liveStartOffsetSec, null);
    let finalStartSec = Math.max(0, Number(liveStartSec ?? current.start ?? session.start));
    let finalDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number((liveEndSec ?? current.end ?? session.end) - finalStartSec)
    );
    let finalTrackName = String(liveTrackName || current.trackName || session.trackName);
    let finalStartOffsetSec = Math.max(
      0,
      Number(liveStartOffsetSec ?? current.startOffsetSec ?? session.startOffsetSec ?? 0)
    );
    if (String(session.mode || "").toLowerCase() === "move") {
      // For move, prefer the latest preview track (what the user saw while dragging).
      const previewTrackName = String(current?.trackName || "").trim();
      if (previewTrackName) finalTrackName = previewTrackName;
      const moveDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, session.end - session.start);
      const nearZeroSec = CONSTANTS.CLIP_EDIT_SNAP_PX / Math.max(1e-6, state.pxPerSec);
      if (finalStartSec <= nearZeroSec + CONSTANTS.CLIP_EDIT_TIME_EPS_SEC) finalStartSec = 0;
      finalDurationSec = moveDurationSec;
      finalStartOffsetSec = Math.max(0, Number(session.startOffsetSec || 0));
    }
    const finalEndSec = finalStartSec + finalDurationSec;
    state.selection = {
      ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
      type: "clip",
      clip_id: session.clipId,
      resource_id: session.resourceId,
      track_name: finalTrackName,
      t0_sec: finalStartSec,
      t1_sec: Math.max(
        finalStartSec + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        finalEndSec
      ),
      origin_step_index: Number(state.selection?.origin_step_index || 2),
    };
    const clipEditPayload = {
      clipId: session.clipId,
      resourceId: session.resourceId,
      linkGroupId: String(session.linkGroupId || ""),
      trackKind: session.trackKind,
      trackName: finalTrackName,
      timeSec: finalStartSec,
      durationSec: finalDurationSec,
      startOffsetSec: finalStartOffsetSec,
      mode: session.mode,
      insertMode: Boolean(session.liveInsertMode),
      insertIndex: Number.isFinite(Number(session.liveInsertIndex))
        ? Math.max(0, Math.round(Number(session.liveInsertIndex)))
        : undefined,
      sourceDurationSec: Math.max(
        CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
        Number(current.sourceDurationSec || session.sourceDurationSec || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
      ),
    };
    const clipEditResult = typeof state.onClipEdit === "function"
      ? state.onClipEdit(clipEditPayload)
      : false;
    const resolvedClipEdit = resolveClipEditResult(clipEditResult);
    const accepted = resolvedClipEdit.accepted;
    const committedTrackName = String(resolvedClipEdit.trackName || finalTrackName || "").trim() || finalTrackName;
    clearPreviewClipEditsForSession(state, session);
    if (accepted) {
      replaceClipSelectionTrackKey(state, session.clipId, session.trackName, committedTrackName);
      applyCommittedClipEditToLocalStudio(state, {
        ...clipEditPayload,
        trackName: committedTrackName,
      });
      if (typeof state.onResolveAudioUrl === "function") {
        setupTrackAudioPlayers(state, state.onResolveAudioUrl);
        syncTrackAudioPlayersToPlayhead(state, { play: Boolean(state.isPlaying), forceSeek: true });
      }
      state.selection = {
        ...(state.selection && typeof state.selection === "object" ? state.selection : {}),
        type: "clip",
        clip_id: session.clipId,
        resource_id: session.resourceId,
        track_name: committedTrackName,
        t0_sec: finalStartSec,
        t1_sec: Math.max(finalStartSec + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, finalStartSec + finalDurationSec),
      };
      draw(state);
      renderOverview(state);
    } else {
      draw(state);
      renderOverview(state);
    }
    return true;
  };

  return {
    beginClipEdit,
    updateClipEdit,
    finalizeClipEdit,
  };
}
