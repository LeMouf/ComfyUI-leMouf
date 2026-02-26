export function prepareTimelineDraw(state, ctx, studioData, deps) {
  const {
    CONSTANTS,
    Utils,
    normalizeSectionHeight,
    resolveVisibleSectionHeight,
    buildTrackRowsLayout,
    getSectionResizeHandleRect,
    drawTimeRuler,
    drawSectionWaveform,
    buildStageGroups,
    resolveTrackStageGroup,
    isTrackMuted,
  } = deps || {};

  const canvas = state?.canvas;
  const width = Number(canvas?.clientWidth || 0);
  const height = Number(canvas?.clientHeight || 0);
  if (!width || !height) return null;

  const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
  const compactMode = Boolean(state.compactMode);
  state.sectionHeight = normalizeSectionHeight(state.sectionHeight);
  const sectionHeight = resolveVisibleSectionHeight(state, height);
  const trackAreaY = CONSTANTS.RULER_HEIGHT + sectionHeight;
  const timelineWidth = Math.max(1, width - CONSTANTS.LEFT_GUTTER);
  const timelineHeight = Math.max(0, height - trackAreaY);
  let trackLayout = compactMode ? { rows: [], totalHeight: 0 } : buildTrackRowsLayout(state, tracks, trackAreaY);
  const maxScroll = compactMode ? 0 : Math.max(0, Number(trackLayout?.totalHeight || 0) - timelineHeight);
  state.scrollY = compactMode ? 0 : Utils.clamp(state.scrollY, 0, maxScroll);
  if (!compactMode) trackLayout = buildTrackRowsLayout(state, tracks, trackAreaY);
  state.trackRows = Array.isArray(trackLayout?.rows) ? trackLayout.rows : [];

  const toX = (timeSec) => CONSTANTS.LEFT_GUTTER + (timeSec - state.t0Sec) * state.pxPerSec;
  const visibleStartSec = state.t0Sec;
  const visibleEndSec = state.t0Sec + timelineWidth / state.pxPerSec;
  const sectionBandTop = CONSTANTS.RULER_HEIGHT + 2;
  const sectionBandHeight = Math.min(24, Math.max(14, Math.floor(sectionHeight * 0.34)));
  const sectionSignalTop = sectionBandTop + sectionBandHeight + 2;
  const sectionSignalHeight = Math.max(
    8,
    sectionHeight - sectionBandHeight - 5 - (compactMode ? 0 : CONSTANTS.SECTION_RESIZE_HANDLE_HEIGHT)
  );
  const handleRect = compactMode ? null : getSectionResizeHandleRect(state, width);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8efe2";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e8d9c7";
  ctx.fillRect(0, 0, CONSTANTS.LEFT_GUTTER, height);
  ctx.fillStyle = "#f2e5d6";
  ctx.fillRect(CONSTANTS.LEFT_GUTTER, 0, timelineWidth, trackAreaY);
  drawTimeRuler(state, ctx, toX, visibleStartSec, visibleEndSec, width, height);

  state.hitRegions = [];

  ctx.fillStyle = "rgba(242, 229, 214, 0.9)";
  ctx.fillRect(CONSTANTS.LEFT_GUTTER, sectionSignalTop - 1, timelineWidth, sectionSignalHeight + 2);
  drawSectionWaveform(state, ctx, sectionSignalTop, sectionSignalHeight, visibleStartSec);
  if (handleRect) {
    ctx.fillStyle = "rgba(210, 193, 173, 0.74)";
    ctx.fillRect(handleRect.x0, handleRect.y0, handleRect.x1 - handleRect.x0, handleRect.y1 - handleRect.y0);
    ctx.strokeStyle = "rgba(109, 89, 69, 0.72)";
    ctx.beginPath();
    ctx.moveTo(handleRect.x0, handleRect.y0 + 0.5);
    ctx.lineTo(handleRect.x1, handleRect.y0 + 0.5);
    ctx.stroke();
    const gripCenterY = handleRect.y0 + (handleRect.y1 - handleRect.y0) / 2;
    const gripCenterX = CONSTANTS.LEFT_GUTTER + timelineWidth * 0.5;
    ctx.strokeStyle = "rgba(88, 68, 51, 0.75)";
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(gripCenterX - 12, gripCenterY + i * 2.5);
      ctx.lineTo(gripCenterX + 12, gripCenterY + i * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(88, 68, 51, 0.85)";
    ctx.font = "9px monospace";
    ctx.fillText("drag to resize signal", handleRect.x0 + 8, handleRect.y0 + 8);
  }
  const globalBtnW = 38;
  const globalBtnH = 14;
  const globalBtnY = trackAreaY - globalBtnH - 2;
  const muteAllX = 8;
  const unmuteAllX = muteAllX + globalBtnW + 6;
  ctx.fillStyle = "rgba(103, 88, 73, 0.88)";
  ctx.fillRect(muteAllX, globalBtnY, globalBtnW, globalBtnH);
  ctx.fillStyle = "rgba(118, 102, 84, 0.86)";
  ctx.fillRect(unmuteAllX, globalBtnY, globalBtnW, globalBtnH);
  ctx.strokeStyle = "rgba(62, 52, 42, 0.7)";
  ctx.strokeRect(muteAllX + 0.5, globalBtnY + 0.5, globalBtnW - 1, globalBtnH - 1);
  ctx.strokeRect(unmuteAllX + 0.5, globalBtnY + 0.5, globalBtnW - 1, globalBtnH - 1);
  ctx.fillStyle = "#f8efe2";
  ctx.font = "9px monospace";
  ctx.fillText("M all", muteAllX + 7, globalBtnY + 10);
  ctx.fillText("U all", unmuteAllX + 7, globalBtnY + 10);
  state.hitRegions.push({
    x0: muteAllX,
    y0: globalBtnY,
    x1: muteAllX + globalBtnW,
    y1: globalBtnY + globalBtnH,
    payload: { type: "mute_all" },
  });
  state.hitRegions.push({
    x0: unmuteAllX,
    y0: globalBtnY,
    x1: unmuteAllX + globalBtnW,
    y1: globalBtnY + globalBtnH,
    payload: { type: "unmute_all" },
  });

  if (compactMode) {
    const stageGroups = buildStageGroups(tracks);
    const labelPadX = 6;
    const labelH = 13;
    const labelGap = 5;
    const labelX = 7;
    const labelMaxW = Math.max(42, CONSTANTS.LEFT_GUTTER - 14);
    const labelsTop = sectionSignalTop + 4;
    const labelsBottom = globalBtnY - 4;
    const groupsByKey = new Map();
    for (const track of tracks) {
      const trackName = String(track?.name || "").trim();
      if (!trackName) continue;
      const key = resolveTrackStageGroup(track).key;
      if (!groupsByKey.has(key)) groupsByKey.set(key, []);
      groupsByKey.get(key).push(trackName);
    }
    let y = labelsTop;
    for (const group of stageGroups) {
      if (y + labelH > labelsBottom) break;
      const trackNames = groupsByKey.get(group.key) || [];
      const allMuted = trackNames.length > 0 && trackNames.every((name) => isTrackMuted(state, name));
      const allUnmuted = trackNames.length > 0 && trackNames.every((name) => !isTrackMuted(state, name));
      ctx.fillStyle = allMuted
        ? "rgba(124, 66, 60, 0.9)"
        : (allUnmuted ? "rgba(96, 77, 59, 0.86)" : "rgba(116, 96, 77, 0.86)");
      ctx.fillRect(labelX, y, labelMaxW, labelH);
      ctx.strokeStyle = "rgba(63, 48, 35, 0.76)";
      ctx.strokeRect(labelX + 0.5, y + 0.5, Math.max(1, labelMaxW - 1), Math.max(1, labelH - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.font = "9px monospace";
      const prefix = allMuted ? "M " : "";
      ctx.fillText(Utils.compactText(`${prefix}${group.label}`, 22), labelX + labelPadX, y + 9);
      state.hitRegions.push({
        x0: labelX,
        y0: y,
        x1: labelX + labelMaxW,
        y1: y + labelH,
        payload: {
          type: "stage_group_toggle",
          group_key: group.key,
          group_label: group.label,
        },
      });
      y += labelH + labelGap;
    }
  }

  if (Array.isArray(studioData?.sections)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(CONSTANTS.LEFT_GUTTER, sectionBandTop, timelineWidth, sectionBandHeight);
    ctx.clip();
    for (let i = 0; i < studioData.sections.length; i += 1) {
      const section = studioData.sections[i];
      const start = Math.max(0, Number(section?.start || 0));
      let end = Math.max(start + 0.01, Number(section?.end || start + 0.01));
      if (i === studioData.sections.length - 1 && state.durationSec > start) {
        end = Math.max(end, state.durationSec);
      }
      if (end < visibleStartSec || start > visibleEndSec) continue;
      const x0 = toX(start);
      const x1 = toX(end);
      const drawX0 = Utils.clamp(x0, CONSTANTS.LEFT_GUTTER, width);
      const drawX1 = Utils.clamp(x1, CONSTANTS.LEFT_GUTTER, width);
      const isEven = i % 2 === 0;
      ctx.fillStyle = isEven ? "rgba(120, 86, 59, 0.86)" : "rgba(83, 103, 132, 0.82)";
      const blockWidth = Math.max(1, drawX1 - drawX0);
      ctx.fillRect(drawX0, sectionBandTop, blockWidth, sectionBandHeight);
      ctx.strokeStyle = isEven ? "rgba(67, 46, 30, 0.8)" : "rgba(43, 57, 73, 0.85)";
      ctx.strokeRect(drawX0 + 0.5, sectionBandTop + 0.5, Math.max(1, blockWidth - 1), Math.max(1, sectionBandHeight - 1));
      ctx.fillStyle = "#f8efe2";
      ctx.font = "10px monospace";
      ctx.fillText(Utils.compactText(section?.name || `section ${i + 1}`, 18), drawX0 + 4, sectionBandTop + 15);
      state.hitRegions.push({
        x0: drawX0,
        y0: sectionBandTop,
        x1: drawX0 + Math.max(1, drawX1 - drawX0),
        y1: sectionBandTop + sectionBandHeight,
        payload: {
          type: "section",
          id: `section_${i + 1}`,
          name: section?.name || `section ${i + 1}`,
          t0_sec: start,
          t1_sec: end,
          origin_step_index: 2,
        },
      });
    }
    ctx.restore();
  }

  const bpm = Math.max(1, Number(studioData?.tempoBpm || 120));
  const secPerBar = (60 / bpm) * 4;

  return {
    width,
    height,
    tracks,
    compactMode,
    sectionHeight,
    trackAreaY,
    timelineWidth,
    timelineHeight,
    trackLayout,
    maxScroll,
    toX,
    visibleStartSec,
    visibleEndSec,
    sectionBandTop,
    sectionBandHeight,
    sectionSignalTop,
    sectionSignalHeight,
    handleRect,
    secPerBar,
  };
}

