export function drawTimelineTracks(state, ctx, studioData, prepared, deps) {
  if (!prepared) return;
  const {
    width,
    height,
    compactMode,
    trackAreaY,
    timelineWidth,
    trackLayout,
    toX,
    visibleStartSec,
    visibleEndSec,
    secPerBar,
  } = prepared;
  const {
    CONSTANTS,
    Utils,
    Drop,
    resolveTrackPartition,
    isTrackMuted,
    isTrackLocked,
    getPreviewClipEdit,
    formatTimelineTimeLabel,
    chooseRulerStepSec,
    resolveEffectiveChannelMode,
    buildExplicitResourceClips,
    buildTrackClips,
    getClipId,
    applyPreviewClipGeometry,
    collectPreviewInjectedClipsForTrack,
    makeClipSelectionKey,
    resolvePrimaryClipSelectionKey,
    resolveEffectiveSelectedClipCount,
    areVideoAudioTracksLinked,
    resolveClipHandleSafeInset,
    drawClipSignal,
    drawClipEditOverlay,
    drawClipSourceWindowControl,
    drawClipHandles,
    resolveTrackStepIndex,
    canJoinAdjacentClips,
  } = deps || {};

  if (!compactMode) {
    for (const row of trackLayout.rows) {
    if (row.rowBottom < trackAreaY || row.rowTop > height) continue;
    const i = row.index;
    const track = row.track;
    const trackName = String(track?.name || `track_${i + 1}`);
    const trackKind = String(track?.kind || "").toLowerCase();
    const partition = resolveTrackPartition(track);
    const muted = isTrackMuted(state, trackName);
    const locked = isTrackLocked(state, trackName);
    const rowTop = row.rowTop;
    const rowBottom = row.rowBottom;
    const rowHeight = Math.max(8, Number(row.rowHeight || (rowBottom - rowTop) || CONSTANTS.ROW_HEIGHT));
    const activeEdit = state.clipEditSession;
    const activePreview = activeEdit
      ? getPreviewClipEdit(state, activeEdit.clipId, activeEdit.trackName)
      : null;
    const activeEditTrack = String(activePreview?.trackName || activeEdit?.trackName || "").trim();
    if (row.gapBefore > 0) {
      const gapTop = rowTop - row.gapBefore;
      const separatorY = gapTop + row.gapBefore / 2;
      ctx.fillStyle = "rgba(236, 223, 207, 0.92)";
      ctx.fillRect(0, gapTop, width, row.gapBefore);
      ctx.strokeStyle = "rgba(103, 83, 63, 0.55)";
      ctx.beginPath();
      ctx.moveTo(CONSTANTS.LEFT_GUTTER, separatorY + 0.5);
      ctx.lineTo(width, separatorY + 0.5);
      ctx.stroke();
      const labelText = Utils.compactText(row.groupLabel, 36);
      ctx.font = "9px monospace";
      const labelPadX = 5;
      const labelH = 11;
      const labelX = CONSTANTS.LEFT_GUTTER + 8;
      const labelY = gapTop + Math.max(1, (row.gapBefore - labelH) / 2);
      const measured = Math.ceil(ctx.measureText(labelText).width);
      const labelW = measured + labelPadX * 2;
      ctx.fillStyle = "rgba(93, 74, 56, 0.82)";
      ctx.fillRect(labelX, labelY, labelW, labelH);
      ctx.strokeStyle = "rgba(63, 48, 35, 0.76)";
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, Math.max(1, labelW - 1), Math.max(1, labelH - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.fillText(labelText, labelX + labelPadX, labelY + 8.5);
      state.hitRegions.push({
        x0: labelX,
        y0: labelY,
        x1: labelX + labelW,
        y1: labelY + labelH,
        payload: {
          type: "stage_group_toggle",
          group_key: row.groupKey,
          group_label: row.groupLabel,
        },
      });
    }
    ctx.fillStyle = i % 2 === 0 ? "#fffaf3" : "#f7ecdf";
    ctx.fillRect(CONSTANTS.LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    if (activeEditTrack && activeEditTrack === trackName) {
      ctx.fillStyle = "rgba(118, 150, 198, 0.12)";
      ctx.fillRect(CONSTANTS.LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    }
    const dropzoneHoverFromResourceDrag = Drop.isDropzoneInsertHoverMatch(
      row,
      Boolean(state?.dropTarget?.insertMode),
      Number(state?.dropTarget?.insertIndex),
      String(state?.dropTarget?.trackName || "")
    );
    const dropzoneHoverFromClipMove = Boolean(
      activeEdit &&
      String(activeEdit.mode || "").trim().toLowerCase() === "move" &&
      Drop.isDropzoneInsertHoverMatch(
        row,
        Boolean(activeEdit.liveInsertMode),
        Number(activeEdit.liveInsertIndex),
        String(activeEdit.liveInsertTrackName || "")
      )
    );
    const insertGhostFromResourceDrag = dropzoneHoverFromResourceDrag
      ? {
          timeSec: Math.max(0, Number(state?.dropTarget?.timeSec || 0)),
          durationSec: Math.max(0.25, Number(state?.dropTarget?.durationSec || 1)),
          label: "INSERT",
        }
      : null;
    const insertGhostFromClipMove = dropzoneHoverFromClipMove
      ? {
          timeSec: Math.max(0, Number(activeEdit?.liveStartSec ?? activeEdit?.start ?? 0)),
          durationSec: Math.max(
            0.25,
            Number(activeEdit?.end || 0) - Number(activeEdit?.start || 0)
          ),
          label: "MOVE INSERT",
        }
      : null;
    const insertGhost = insertGhostFromResourceDrag || insertGhostFromClipMove;
    if (dropzoneHoverFromResourceDrag || dropzoneHoverFromClipMove) {
      const laneX = CONSTANTS.LEFT_GUTTER + 8;
      const laneY = rowTop + 4;
      const laneW = Math.max(10, timelineWidth - 16);
      const laneH = Math.max(10, rowHeight - 8);
      const grad = ctx.createLinearGradient(laneX, laneY, laneX, laneY + laneH);
      grad.addColorStop(0, "rgba(132, 102, 72, 0.16)");
      grad.addColorStop(1, "rgba(108, 84, 60, 0.10)");
      ctx.fillStyle = grad;
      ctx.fillRect(laneX, laneY, laneW, laneH);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(104, 76, 49, 0.88)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(laneX + 0.5, laneY + 0.5, Math.max(1, laneW - 1), Math.max(1, laneH - 1));
      ctx.setLineDash([]);
      ctx.restore();
      if (insertGhost) {
        const dropX = Utils.clamp(toX(Number(insertGhost.timeSec || 0)), CONSTANTS.LEFT_GUTTER, width);
        const ghostDuration = Math.max(0.25, Number(insertGhost.durationSec || 1));
        const ghostWidth = Utils.clamp(ghostDuration * state.pxPerSec, 18, Math.max(18, timelineWidth * 0.66));
        const ghostX = Utils.clamp(dropX, CONSTANTS.LEFT_GUTTER, Math.max(CONSTANTS.LEFT_GUTTER, width - ghostWidth));
        const ghostH = Math.max(12, Math.min(30, rowHeight - 8));
        const ghostTop = rowTop + Math.max(4, Math.floor((rowHeight - ghostH) * 0.5));
        const ghostGrad = ctx.createLinearGradient(ghostX, ghostTop, ghostX, ghostTop + ghostH);
        ghostGrad.addColorStop(0, "rgba(212, 188, 156, 0.55)");
        ghostGrad.addColorStop(1, "rgba(141, 109, 76, 0.28)");
        ctx.save();
        ctx.shadowColor = "rgba(57, 40, 25, 0.32)";
        ctx.shadowBlur = 5;
        ctx.fillStyle = ghostGrad;
        ctx.fillRect(ghostX + 1, ghostTop + 1, Math.max(1, ghostWidth - 2), Math.max(1, ghostH - 2));
        ctx.restore();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "rgba(89, 64, 41, 0.95)";
        ctx.lineWidth = 1.25;
        ctx.strokeRect(ghostX + 0.75, ghostTop + 0.75, Math.max(1, ghostWidth - 1.5), Math.max(1, ghostH - 1.5));
        ctx.setLineDash([]);
        ctx.font = "9px monospace";
        const ts = formatTimelineTimeLabel(Number(insertGhost.timeSec || 0), chooseRulerStepSec(state.pxPerSec));
        const ghostLabel = `${insertGhost.label} @ ${ts}`;
        const labelPadX = 5;
        const labelH = 12;
        const labelW = Math.ceil(ctx.measureText(ghostLabel).width) + labelPadX * 2;
        const labelX = Utils.clamp(ghostX + 3, CONSTANTS.LEFT_GUTTER + 1, Math.max(CONSTANTS.LEFT_GUTTER + 1, width - labelW - 1));
        const labelY = Utils.clamp(ghostTop + 2, rowTop + 1, Math.max(rowTop + 1, rowBottom - labelH - 2));
        ctx.fillStyle = "rgba(79, 58, 39, 0.95)";
        ctx.fillRect(labelX, labelY, labelW, labelH);
        ctx.strokeStyle = "rgba(226, 205, 176, 0.72)";
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX + 0.5, labelY + 0.5, Math.max(1, labelW - 1), Math.max(1, labelH - 1));
        ctx.fillStyle = "#f8efe2";
        ctx.fillText(ghostLabel, labelX + labelPadX, labelY + 9);
      }
    }
    if (locked) {
      ctx.fillStyle = "rgba(96, 117, 148, 0.12)";
      ctx.fillRect(CONSTANTS.LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    }
    ctx.fillStyle = i % 2 === 0 ? "#e8d9c7" : "#e3d3c1";
    ctx.fillRect(0, rowTop, CONSTANTS.LEFT_GUTTER, rowHeight - 1);
    if (
      state.dropTarget &&
      !Boolean(state.dropTarget.insertMode) &&
      String(state.dropTarget.trackName || "") === trackName
    ) {
      const dropX = Utils.clamp(toX(Number(state.dropTarget.timeSec || 0)), CONSTANTS.LEFT_GUTTER, width);
      const ghostDuration = Math.max(0.25, Number(state.dropTarget.durationSec || 1));
      const ghostWidth = Utils.clamp(ghostDuration * state.pxPerSec, 16, Math.max(16, timelineWidth * 0.6));
      const ghostX = Utils.clamp(dropX, CONSTANTS.LEFT_GUTTER, Math.max(CONSTANTS.LEFT_GUTTER, width - ghostWidth));
      const ghostTop = rowTop + 6;
      const ghostHeight = Math.max(12, rowHeight - 12);
      const ghostLabel = `${Utils.compactText(trackName, 14)} @ ${formatTimelineTimeLabel(Number(state.dropTarget.timeSec || 0), chooseRulerStepSec(state.pxPerSec))}`;

      ctx.fillStyle = "rgba(121, 97, 70, 0.2)";
      ctx.fillRect(CONSTANTS.LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);

      const ghostGrad = ctx.createLinearGradient(ghostX, ghostTop, ghostX, ghostTop + ghostHeight);
      ghostGrad.addColorStop(0, "rgba(198, 168, 131, 0.42)");
      ghostGrad.addColorStop(1, "rgba(141, 109, 76, 0.26)");
      ctx.save();
      ctx.shadowColor = "rgba(57, 40, 25, 0.38)";
      ctx.shadowBlur = 7;
      ctx.fillStyle = ghostGrad;
      ctx.fillRect(ghostX + 1, ghostTop + 1, Math.max(1, ghostWidth - 2), Math.max(1, ghostHeight - 2));
      ctx.restore();

      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(90, 65, 41, 0.95)";
      ctx.strokeRect(ghostX + 0.75, ghostTop + 0.75, Math.max(1, ghostWidth - 1.5), Math.max(1, ghostHeight - 1.5));
      ctx.setLineDash([]);

      const labelPadX = 5;
      const labelHeight = 12;
      ctx.font = "9px monospace";
      const labelWidth = Math.ceil(ctx.measureText(ghostLabel).width) + labelPadX * 2;
      const labelX = Utils.clamp(ghostX + 3, CONSTANTS.LEFT_GUTTER + 1, Math.max(CONSTANTS.LEFT_GUTTER + 1, width - labelWidth - 1));
      const labelY = Utils.clamp(ghostTop + 2, rowTop + 1, Math.max(rowTop + 1, rowBottom - labelHeight - 2));
      ctx.fillStyle = "rgba(79, 58, 39, 0.95)";
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
      ctx.strokeStyle = "rgba(226, 205, 176, 0.72)";
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, Math.max(1, labelWidth - 1), Math.max(1, labelHeight - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.fillText(ghostLabel, labelX + labelPadX, labelY + 9);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(69, 52, 37, 0.95)";
      ctx.beginPath();
      ctx.moveTo(dropX + 0.5, rowTop + 2);
      ctx.lineTo(dropX + 0.5, rowBottom - 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    const events = Array.isArray(studioData?.eventsByTrack?.[track?.name]) ? studioData.eventsByTrack[track.name] : [];
    const explicitResourceClips = events.some((event) => {
      const resourceId = String(event?.resourceId || "").trim();
      const clipId = String(event?.clipId || "").trim();
      const src = String(event?.previewSrc || event?.src || "").trim();
      if (trackKind === "video" || trackKind === "image") {
        return Boolean(resourceId || src);
      }
      // Composition studio can project audio events from resource instances (linked video audio, etc.).
      // Treat those as explicit clips too so clip-id based live preview/edit sync applies deterministically.
      if (trackKind === "audio") {
        return Boolean(resourceId || clipId);
      }
      return false;
    });
    const hasSource = String(track?.source || "").trim().length > 0;
    const isCompositionEmptyLane =
      !explicitResourceClips &&
      events.length === 0 &&
      !hasSource &&
      (trackKind === "video" || trackKind === "image" || trackKind === "audio" || trackKind === "dropzone");

    const muteBtnW = 16;
    const muteBtnH = 14;
    const muteBtnX = CONSTANTS.LEFT_GUTTER - muteBtnW - 6;
    const muteBtnY = rowTop + 5;
    if (!isCompositionEmptyLane) {
      ctx.fillStyle = muted ? "rgba(154, 69, 63, 0.9)" : "rgba(103, 88, 73, 0.85)";
      ctx.fillRect(muteBtnX, muteBtnY, muteBtnW, muteBtnH);
      ctx.strokeStyle = muted ? "rgba(82, 34, 30, 0.9)" : "rgba(62, 52, 42, 0.7)";
      ctx.strokeRect(muteBtnX + 0.5, muteBtnY + 0.5, muteBtnW - 1, muteBtnH - 1);
      ctx.fillStyle = "#f8efe2";
      ctx.font = "9px monospace";
      ctx.fillText("M", muteBtnX + 5, muteBtnY + 10);
      state.hitRegions.push({
        x0: muteBtnX,
        y0: muteBtnY,
        x1: muteBtnX + muteBtnW,
        y1: muteBtnY + muteBtnH,
        payload: { type: "track_mute", track_name: trackName },
      });
      if (trackKind === "audio") {
        const channelMode = resolveEffectiveChannelMode(state, track);
        const chanBtnW = 16;
        const chanBtnH = 14;
        const chanBtnX = muteBtnX;
        const chanBtnY = muteBtnY + muteBtnH + 3;
        ctx.fillStyle = channelMode === "mono" ? "rgba(76, 108, 150, 0.88)" : "rgba(91, 118, 86, 0.88)";
        ctx.fillRect(chanBtnX, chanBtnY, chanBtnW, chanBtnH);
        ctx.strokeStyle = "rgba(53, 43, 34, 0.72)";
        ctx.strokeRect(chanBtnX + 0.5, chanBtnY + 0.5, chanBtnW - 1, chanBtnH - 1);
        ctx.fillStyle = "#f8efe2";
        ctx.font = "9px monospace";
        ctx.fillText(channelMode === "mono" ? "1" : "2", chanBtnX + 5, chanBtnY + 10);
        state.hitRegions.push({
          x0: chanBtnX,
          y0: chanBtnY,
          x1: chanBtnX + chanBtnW,
          y1: chanBtnY + chanBtnH,
          payload: { type: "track_channel_toggle", track_name: trackName },
        });
      }
    }

    if (!isCompositionEmptyLane) {
      ctx.fillStyle = muted ? "rgba(63, 51, 40, 0.54)" : "#3f3328";
      ctx.font = "10px monospace";
      ctx.fillText(Utils.compactText(trackName, 18), 8, rowTop + 14);
      ctx.fillStyle = muted ? "rgba(109, 90, 72, 0.55)" : "#6d5a48";
      const channelMode = resolveEffectiveChannelMode(state, track);
      const modeText = channelMode === "stereo" ? "stereo L/R" : (channelMode === "mono" ? "mono" : "");
      const infoTextBase = modeText
        ? `${track?.kind || "track"} ${modeText} · ${track?.events || 0}`
        : `${track?.kind || "track"} · ${track?.events || 0}`;
      const infoText = locked ? `${infoTextBase} · LOCK` : infoTextBase;
      ctx.fillText(infoText, 8, rowTop + 28);
    }

    const clipClampMaxSec = state.allowDurationExtend
      ? CONSTANTS.TIMELINE_EDIT_MAX_DURATION_SEC
      : state.durationSec;
    let clips = explicitResourceClips
      ? buildExplicitResourceClips(events, clipClampMaxSec, trackKind)
      : buildTrackClips(events, state.durationSec, secPerBar);
    if (isCompositionEmptyLane) clips = [];
    // Stems/mix are full-length assets; when events are sparse, keep clip geometry aligned to full timeline.
    const preserveEventDuration = Boolean(track?.preserveEventDuration);
    if (
      !explicitResourceClips &&
      trackKind === "audio" &&
      !preserveEventDuration &&
      hasSource &&
      Number.isFinite(state.durationSec) &&
      state.durationSec > 0.05
    ) {
      const coverStart = clips.reduce((min, clip) => Math.min(min, Number(clip?.start || 0)), Number.POSITIVE_INFINITY);
      const coverEnd = clips.reduce((max, clip) => Math.max(max, Number(clip?.end || 0)), 0);
      const coverage = Math.max(0, coverEnd - coverStart);
      const tailGap = Math.max(0, state.durationSec - coverEnd);
      const headGap = Number.isFinite(coverStart) ? Math.max(0, coverStart) : 0;
      const snapThresholdSec = Math.max(0.08, secPerBar * 0.25);
      if (!Number.isFinite(coverStart) || coverage < state.durationSec * 0.7 || tailGap <= snapThresholdSec) {
        const snappedStart = headGap <= snapThresholdSec ? 0 : headGap;
        clips = [{ start: snappedStart, end: state.durationSec, label: "audio", notesCount: 0 }];
      }
    }
    if (!explicitResourceClips && (trackKind === "fx" || trackKind === "project") && Number.isFinite(state.durationSec) && state.durationSec > 0.05) {
      // FX/project are projections of the full arrangement; keep visual span aligned with song duration.
      clips = [{ start: 0, end: state.durationSec, label: trackKind, notesCount: 0 }];
    }
    if (!explicitResourceClips && trackKind === "midi") {
      const noteEvents = Array.isArray(events) ? events.filter((event) => Number.isFinite(event?.pitch)) : [];
      const noteStart = noteEvents.length
        ? noteEvents.reduce((min, event) => Math.min(min, Number(event?.time || 0)), Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
      const noteEnd = noteEvents.length
        ? noteEvents.reduce(
            (max, event) => Math.max(max, Number(event?.time || 0) + Math.max(0.01, Number(event?.duration || 0.01))),
            0
          )
        : 0;
      const hintStart = Number(track?.clipStartHintSec);
      const hintEnd = Number(track?.clipEndHintSec);
      const strictStart = Number.isFinite(hintStart) ? Math.max(0, hintStart) : (Number.isFinite(noteStart) ? Math.max(0, noteStart) : 0);
      let strictEnd = Math.max(strictStart + 0.01, Number.isFinite(noteEnd) ? noteEnd : strictStart + 0.01);
      if (Number.isFinite(hintEnd)) strictEnd = Math.max(strictEnd, hintEnd);

      let targetEnd = strictEnd;
      // Fallback mode: if no explicit clip end hint and detected MIDI content is much shorter than song duration,
      // extend to song duration to avoid misleading "section 1 only" visual truncation.
      if (!Number.isFinite(hintEnd) && state.durationSec > 0 && strictEnd < state.durationSec * 0.45) {
        targetEnd = state.durationSec;
      }

      const coverStart = clips.reduce((min, clip) => Math.min(min, Number(clip?.start || 0)), Number.POSITIVE_INFINITY);
      const coverEnd = clips.reduce((max, clip) => Math.max(max, Number(clip?.end || 0)), 0);
      const hasBadCoverage =
        !Number.isFinite(coverStart) || coverStart > strictStart + 0.05 || coverEnd < targetEnd - 0.05;
      if (hasBadCoverage && targetEnd > strictStart + 0.01) {
        clips = [{ start: strictStart, end: targetEnd, label: "midi", notesCount: noteEvents.length }];
      }
      if (partition === "obtained_midi" && Number.isFinite(state.durationSec) && state.durationSec > 0.05) {
        const snapThresholdSec = Math.max(0.08, secPerBar * 0.25);
        const alignedStart = strictStart <= snapThresholdSec ? 0 : strictStart;
        clips = [{ start: alignedStart, end: state.durationSec, label: "midi", notesCount: noteEvents.length }];
      }
    }
    const projectedClips = clips
      .map((clip, clipIndex) => {
        const clippedStart = Utils.clamp(Number(clip?.start || 0), 0, clipClampMaxSec);
        const rawEnd = Math.max(clippedStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || clippedStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
        const clippedEnd = Utils.clamp(rawEnd, clippedStart + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, clipClampMaxSec);
        const clipId = getClipId(clip, `${trackName}_${clipIndex}_${clippedStart.toFixed(4)}`);
        const resourceId = String(clip?.resourceId || "").trim();
        return {
          ...clip,
          clipId,
          resourceId: resourceId || null,
          trackName,
          trackKind: trackKind || "",
          start: clippedStart,
          end: clippedEnd,
        };
      })
      .map((clip) => applyPreviewClipGeometry(state, clip, trackName))
      .filter((clip) => clip && clip.end > clip.start + 0.0005);
    const injectedPreviewClips = collectPreviewInjectedClipsForTrack(state, trackName, trackKind, clipClampMaxSec)
      .filter((clip) => clip && clip.end > clip.start + 0.0005);
    clips = projectedClips
      .concat(injectedPreviewClips)
      .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
    ctx.save();
    ctx.beginPath();
    ctx.rect(CONSTANTS.LEFT_GUTTER, rowTop, timelineWidth, rowHeight - 1);
    ctx.clip();
    if (isCompositionEmptyLane && clips.length === 0) {
      const padX = 10;
      const laneX = CONSTANTS.LEFT_GUTTER + padX;
      const laneY = rowTop + 6;
      const laneW = Math.max(18, timelineWidth - padX * 2);
      const laneH = Math.max(18, rowHeight - 12);
      ctx.strokeStyle = muted ? "rgba(107, 92, 74, 0.22)" : "rgba(107, 92, 74, 0.38)";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(laneX + 0.5, laneY + 0.5, laneW - 1, laneH - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = muted ? "rgba(86, 71, 56, 0.42)" : "rgba(86, 71, 56, 0.72)";
      ctx.font = "11px monospace";
      const laneLabel = "Drop ressource here";
      const labelWidth = Math.ceil(ctx.measureText(laneLabel).width);
      const labelX = laneX + Math.max(8, Math.round((laneW - labelWidth) * 0.5));
      const labelY = laneY + Math.round(laneH * 0.5) + 4;
      ctx.fillText(laneLabel, labelX, labelY);
    }
    const primarySelectionKey = resolvePrimaryClipSelectionKey(state);
    const selectedClipCount = resolveEffectiveSelectedClipCount(state);
    const hasSelectionFocus = selectedClipCount > 0;
    const selectedClipKeySet = state.selectedClipKeys instanceof Set ? state.selectedClipKeys : null;
    let previousTrackClip = null;
    let clipPaintIndex = 0;
    for (const clip of clips) {
      if (clip.end < visibleStartSec || clip.start > visibleEndSec) continue;
      const x0 = toX(clip.start);
      const x1 = toX(clip.end);
      const widthPx = Math.max(2, x1 - x0);
      const previousTrack = i > 0 ? trackLayout.rows[i - 1]?.track : null;
      const nextTrack = i + 1 < trackLayout.rows.length ? trackLayout.rows[i + 1]?.track : null;
      const linkedWithPrev = areVideoAudioTracksLinked(track, previousTrack);
      const linkedWithNext = areVideoAudioTracksLinked(track, nextTrack);
      const clipTopInset = linkedWithPrev ? 0 : 5;
      const clipBottomInset = linkedWithNext ? 0 : 5;
      const clipBoxY = rowTop + clipTopInset;
      const clipBoxH = Math.max(4, rowHeight - clipTopInset - clipBottomInset);
      const clipBoxBottom = clipBoxY + clipBoxH;
      const clipId = getClipId(clip, `${trackName}_${clip.start.toFixed(4)}`);
      const clipSelectionKey = makeClipSelectionKey(trackName, clipId);
      const isInSelectedSet = Boolean(clipSelectionKey && selectedClipKeySet?.has(clipSelectionKey));
      const isPrimarySelected = Boolean(primarySelectionKey && clipSelectionKey === primarySelectionKey);
      const isSelected = isPrimarySelected || isInSelectedSet;
      const isGroupedSelected = isSelected && selectedClipCount > 1;
      const skeletonMode = Boolean(state.skeletonMode);
      if (skeletonMode) {
        const shade = clipPaintIndex % 2 === 0 ? "rgba(138, 151, 168, 0.22)" : "rgba(120, 136, 154, 0.2)";
        const shadeSelected = isPrimarySelected ? "rgba(100, 128, 160, 0.36)" : "rgba(112, 140, 172, 0.3)";
        ctx.fillStyle = isSelected ? shadeSelected : shade;
        ctx.globalAlpha = muted ? 0.24 : 1;
        ctx.fillRect(x0, clipBoxY, widthPx, clipBoxH);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isSelected
          ? (isPrimarySelected ? "rgba(55, 78, 106, 0.96)" : "rgba(70, 92, 120, 0.88)")
          : "rgba(86, 96, 108, 0.86)";
        ctx.lineWidth = isSelected ? 1.6 : 1.1;
        ctx.strokeRect(x0 + 0.5, clipBoxY + 0.5, Math.max(1, widthPx - 1), Math.max(1, clipBoxH - 1));
        if (widthPx >= 18 && clipBoxH >= 12) {
          ctx.save();
          ctx.strokeStyle = "rgba(88, 101, 116, 0.42)";
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 3]);
          const centerY = clipBoxY + Math.floor(clipBoxH * 0.5) + 0.5;
          ctx.beginPath();
          ctx.moveTo(x0 + 3, centerY);
          ctx.lineTo(x0 + widthPx - 3, centerY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
        const labelSafeInset = resolveClipHandleSafeInset(widthPx, 4);
        const textW = Math.max(0, widthPx - labelSafeInset * 2 - 2);
        if (textW >= 16) {
          const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || 0) - Number(clip?.start || 0));
          const sourceDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.sourceDurationSec || clipDurationSec));
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 + labelSafeInset, clipBoxY + 1, textW, Math.max(8, clipBoxH - 2));
          ctx.clip();
          ctx.fillStyle = muted ? "rgba(68, 62, 58, 0.58)" : "rgba(56, 50, 47, 0.86)";
          ctx.font = "9px monospace";
          const titleChars = Math.max(4, Math.floor(textW / 5.6));
          ctx.fillText(Utils.compactText(clip.label, titleChars), x0 + labelSafeInset, clipBoxY + 12);
          if (clipBoxH >= 26) {
            const info = `${clipDurationSec.toFixed(2)}s / src ${sourceDurationSec.toFixed(2)}s`;
            const infoChars = Math.max(6, Math.floor(textW / 5.2));
            ctx.globalAlpha = muted ? 0.6 : 0.9;
            ctx.fillText(Utils.compactText(info, infoChars), x0 + labelSafeInset, clipBoxY + 23);
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = Utils.resolveAlternatingClipFill(trackKind, trackName || String(i), clipPaintIndex);
        // Keep non-selected clips visually stable while dragging/selecting.
        // Only selected/grabbed clips should change style.
        const baseAlpha = muted ? 0.2 : (isSelected ? 0.86 : 0.72);
        ctx.globalAlpha = baseAlpha;
        ctx.fillRect(x0, clipBoxY, widthPx, clipBoxH);
        ctx.globalAlpha = muted ? 0.55 : 1;
        ctx.strokeStyle = Utils.resolveAlternatingClipStroke(trackKind, trackName || String(i), clipPaintIndex, isSelected);
        ctx.strokeRect(x0 + 0.5, clipBoxY + 0.5, Math.max(1, widthPx - 1), Math.max(1, clipBoxH - 1));
      }
      if (isSelected && !muted) {
        const accent = isGroupedSelected ? "rgba(96, 130, 192, 0.94)" : "rgba(54, 98, 176, 0.98)";
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = isPrimarySelected ? 2.2 : 1.6;
        if (isGroupedSelected && !isPrimarySelected) {
          ctx.setLineDash([4, 3]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.strokeRect(x0 + 1, clipBoxY + 1, Math.max(1, widthPx - 2), Math.max(1, clipBoxH - 2));
        ctx.setLineDash([]);
        if (widthPx >= 72 && clipBoxH >= 20) {
          const badgeText = isGroupedSelected
            ? (isPrimarySelected ? `FOCUS ${selectedClipCount}` : `GROUP ${selectedClipCount}`)
            : "SOLO";
          ctx.font = "8px monospace";
          const badgePadX = 4;
          const badgePadY = 2;
          const badgeW = Math.ceil(ctx.measureText(badgeText).width) + badgePadX * 2;
          const badgeH = 11;
          const badgeX = Math.max(x0 + 2, x0 + widthPx - badgeW - 3);
          const badgeY = clipBoxY + 3;
          ctx.fillStyle = isGroupedSelected ? "rgba(214, 223, 244, 0.94)" : "rgba(198, 216, 246, 0.96)";
          ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
          ctx.strokeStyle = "rgba(56, 84, 136, 0.72)";
          ctx.lineWidth = 1;
          ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1);
          ctx.fillStyle = "rgba(44, 58, 88, 0.96)";
          ctx.fillText(badgeText, badgeX + badgePadX, badgeY + badgeH - badgePadY - 1);
        }
        ctx.restore();
      }
      if (!muted && !skeletonMode) {
        drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight, {
          clipTopInset,
          clipBottomInset,
          selected: isSelected,
        });
      }
      if (!skeletonMode) {
        drawClipEditOverlay(state, ctx, clipBoxY, clipBoxBottom, clip, x0, widthPx);
        ctx.fillStyle = muted ? "rgba(32, 22, 14, 0.54)" : "#20160e";
        ctx.font = "9px monospace";
        const labelSafeInset = resolveClipHandleSafeInset(widthPx, 4);
        const labelWidthPx = Math.max(0, widthPx - labelSafeInset * 2 - 2);
        if (labelWidthPx > 8) {
          const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || 0) - Number(clip?.start || 0));
          const clipSourceDurationSec = Math.max(
            CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            Number(clip?.sourceDurationSec || clipDurationSec)
          );
          const approxChars = Math.max(4, Math.floor(labelWidthPx / 5.6));
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 + labelSafeInset, clipBoxY + 1, labelWidthPx, Math.max(8, clipBoxH - 2));
          ctx.clip();
          ctx.fillText(Utils.compactText(clip.label, approxChars), x0 + labelSafeInset, clipBoxY + 13);
          if (trackKind === "video" && clipBoxH >= 34 && labelWidthPx >= 52) {
            const durationText = `${clipDurationSec.toFixed(2)}s / src ${clipSourceDurationSec.toFixed(2)}s`;
            const detailsChars = Math.max(6, Math.floor(labelWidthPx / 5.2));
            ctx.globalAlpha = muted ? 0.55 : 0.92;
            ctx.fillText(Utils.compactText(durationText, detailsChars), x0 + labelSafeInset, clipBoxY + 25);
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
      }
      const supportsClipEdit = Boolean(
        clip.resourceId && (trackKind === "video" || trackKind === "image")
      );
      const windowRect = supportsClipEdit && trackKind === "video"
        ? drawClipSourceWindowControl(ctx, clip, x0, clipBoxY, widthPx, clipBoxH, {
            muted,
            selected: isSelected,
          })
        : null;
      const handleRect = supportsClipEdit
        ? drawClipHandles(ctx, x0, clipBoxY, widthPx, clipBoxH, {
            muted,
            selected: isSelected,
          })
        : null;
      state.hitRegions.push({
        x0: Math.max(CONSTANTS.LEFT_GUTTER, x0),
        y0: clipBoxY,
        x1: Math.min(width, x0 + widthPx),
        y1: clipBoxBottom,
        payload: {
          type: "clip",
          id: clipId,
          clip_id: clipId,
          resource_id: clip.resourceId || "",
          track_name: trackName,
          track_kind: trackKind,
          name: clip.label,
          t0_sec: clip.start,
          t1_sec: clip.end,
          row_top: rowTop,
          row_bottom: rowBottom,
          duration_sec: Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, clip.end - clip.start),
          link_group_id: String(clip?.linkGroupId || ""),
          start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
          source_duration_sec: Math.max(
            CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
            Number(clip?.sourceDurationSec || (clip.end - clip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
          ),
          notes_count: clip.notesCount || 0,
          origin_step_index: resolveTrackStepIndex(track),
          asset: String(track?.source || ""),
          clip_selection_key: clipSelectionKey,
        },
      });
      if (handleRect && supportsClipEdit) {
        state.hitRegions.push({
          x0: Math.max(CONSTANTS.LEFT_GUTTER, handleRect.leftX),
          y0: handleRect.y0,
          x1: Math.min(width, handleRect.leftX + handleRect.w),
          y1: handleRect.y1,
          payload: {
            type: "clip_trim_start",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
          },
        });
        state.hitRegions.push({
          x0: Math.max(CONSTANTS.LEFT_GUTTER, handleRect.rightX),
          y0: handleRect.y0,
          x1: Math.min(width, handleRect.rightX + handleRect.w),
          y1: handleRect.y1,
          payload: {
            type: "clip_trim_end",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
          },
        });
      }
      if (windowRect && supportsClipEdit) {
        state.hitRegions.push({
          x0: Math.max(CONSTANTS.LEFT_GUTTER, windowRect.railHitX0),
          y0: windowRect.y0,
          x1: Math.min(width, windowRect.railHitX1),
          y1: windowRect.y1,
          payload: {
            type: "clip_window_rail",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
            rail_x0: Number(windowRect.railX),
            rail_x1: Number(windowRect.railX + windowRect.railW),
            knob_w: Number(windowRect.knobW),
          },
        });
        state.hitRegions.push({
          x0: Math.max(CONSTANTS.LEFT_GUTTER, windowRect.knobX0),
          y0: windowRect.y0,
          x1: Math.min(width, windowRect.knobX1),
          y1: windowRect.y1,
          payload: {
            type: "clip_window",
            clip_id: clipId,
            resource_id: clip.resourceId,
            track_name: trackName,
            track_kind: trackKind,
            t0_sec: clip.start,
            t1_sec: clip.end,
            start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
            source_duration_sec: Math.max(
              CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
              Number(clip?.sourceDurationSec || (clip.end - clip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
            ),
            link_group_id: String(clip?.linkGroupId || ""),
          },
        });
      }

      if (
        trackKind === "video" &&
        previousTrackClip &&
        canJoinAdjacentClips(previousTrackClip, {
          ...clip,
          clipId,
          trackName,
          trackKind,
        })
      ) {
        const joinTimeSec = (Number(previousTrackClip.end || 0) + Number(clip.start || 0)) * 0.5;
        const joinX = toX(joinTimeSec);
        const joinPad = 7;
        const y0 = clipBoxY + 6;
        const y1 = clipBoxBottom - 6;
        if (joinX >= CONSTANTS.LEFT_GUTTER - joinPad && joinX <= width + joinPad && y1 > y0 + 2) {
          state.hitRegions.push({
            x0: Math.max(CONSTANTS.LEFT_GUTTER, joinX - joinPad),
            y0,
            x1: Math.min(width, joinX + joinPad),
            y1,
            payload: {
              type: "clip_join",
              track_name: trackName,
              track_kind: trackKind,
              left_clip_id: String(previousTrackClip.clipId || ""),
              left_resource_id: String(previousTrackClip.resourceId || ""),
              left_t0_sec: Number(previousTrackClip.start || 0),
              left_t1_sec: Number(previousTrackClip.end || 0),
              left_start_offset_sec: Math.max(0, Number(previousTrackClip.startOffsetSec || 0)),
              left_source_duration_sec: Math.max(
                CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
                Number(previousTrackClip.sourceDurationSec || (previousTrackClip.end - previousTrackClip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
              ),
              right_clip_id: String(clipId || ""),
              right_resource_id: String(clip.resourceId || ""),
              right_t0_sec: Number(clip.start || 0),
              right_t1_sec: Number(clip.end || 0),
              right_start_offset_sec: Math.max(0, Number(clip?.startOffsetSec || 0)),
              right_source_duration_sec: Math.max(
                CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
                Number(clip?.sourceDurationSec || (clip.end - clip.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
              ),
              join_time_sec: joinTimeSec,
            },
          });
        }
      }
      previousTrackClip = {
        ...clip,
        clipId,
        trackName,
        trackKind,
      };
      clipPaintIndex += 1;
    }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}
