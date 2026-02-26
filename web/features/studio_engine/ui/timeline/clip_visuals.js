export function createTimelineClipVisuals({
  CONSTANTS,
  Utils,
  mapTimelineSecToSignalSourceSec,
  normalizeSectionVizMode,
  drawAmplitudeVizLane,
  resolveEffectiveChannelMode,
  drawClipThumbnailCover,
  drawClipThumbnailTiles,
  ensureTimelineVideoFilmstrip,
  drawClipFilmstripTilesCached,
  resolveVideoPreviewPlan,
  getClipId,
} = {}) {
  function normalizedTrackHash(trackName) {
    const text = String(trackName || "track");
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function drawAudioClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h, options = {}) {
    const channelMode = String(options?.channelMode || "").toLowerCase();
    const channelPhase = Utils.toFiniteNumber(options?.channelPhase, 0) || 0;
    const strokeStyle = String(options?.strokeStyle || "rgba(41, 28, 18, 0.58)");
    const bins = Utils.clamp(Math.floor(widthPx / 2.5), 12, 280);
    const clipStart = Number(clip?.start || 0);
    const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
    const amplitudes = new Array(bins).fill(0);
    if (state.scrubAudioBuffer) {
      const samples = state.scrubAudioBuffer.getChannelData(0);
      const sampleRate = Math.max(1, Number(state.scrubAudioBuffer.sampleRate || 44100));
      const sourceDurationSec = samples.length / sampleRate;
      for (let i = 0; i < bins; i += 1) {
        const t0 = clipStart + (i / bins) * (clipEnd - clipStart);
        const t1 = clipStart + ((i + 1) / bins) * (clipEnd - clipStart);
        const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
        const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t1);
        const s0 = Utils.clamp(Math.floor(mt0 * sampleRate), 0, Math.max(0, samples.length - 1));
        const s1 = Utils.clamp(Math.ceil(mt1 * sampleRate), s0 + 1, samples.length);
        const span = Math.max(1, s1 - s0);
        const readStep = Math.max(1, Math.floor(span / 18));
        let peak = 0;
        for (let s = s0; s < s1; s += readStep) {
          const amp = Math.abs(samples[s] || 0);
          if (amp > peak) peak = amp;
        }
        if (channelMode === "stereo" && channelPhase) {
          const wobble = 0.85 + 0.15 * Math.sin((i / Math.max(1, bins - 1)) * Math.PI * 4 + channelPhase);
          peak *= wobble;
        }
        const scaled = peak * 1.18;
        const a = scaled < 0.012 ? 0 : Utils.clamp(scaled, 0, 1);
        amplitudes[i] = a;
      }
    } else {
      // Deterministic fallback when no decoded audio buffer is available.
      const hash = normalizedTrackHash(trackName);
      const phase = hash * Math.PI * 2 + channelPhase;
      for (let i = 0; i < bins; i += 1) {
        const t = i / Math.max(1, bins - 1);
        const base = 0.25 + Math.abs(Math.sin((t * 11.0 + phase) * Math.PI)) * 0.38;
        const wobble = Math.abs(Math.sin((t * 39.0 + phase * 0.7) * Math.PI)) * 0.28;
        amplitudes[i] = Utils.clamp(base + wobble, 0.08, 1);
      }
    }
    const vizMode = normalizeSectionVizMode(state?.sectionVizMode);
    drawAmplitudeVizLane(ctx, amplitudes, x0, widthPx, y, h, {
      mode: vizMode,
      palette: Utils.resolveAudioVizPalette({
        strokeStyle,
        fillStyle: "rgba(63, 43, 27, 0.36)",
        bandLowStyle: "rgba(74, 165, 142, 0.58)",
        bandMidStyle: "rgba(219, 174, 90, 0.56)",
        bandHighStyle: "rgba(198, 104, 147, 0.54)",
        centerLineStyle: "rgba(120, 100, 82, 0.14)",
      }),
    });
  }

  function drawStereoClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h) {
    const laneGap = Math.max(2, Math.floor(h * 0.07));
    const laneHeight = Math.max(4, (h - laneGap) * 0.5);
    drawAudioClipSignal(state, ctx, `${trackName}:L`, clip, x0, widthPx, y, laneHeight, {
      channelMode: "stereo",
      channelPhase: 0,
      strokeStyle: "rgba(33, 24, 18, 0.65)",
    });
    drawAudioClipSignal(state, ctx, `${trackName}:R`, clip, x0, widthPx, y + laneHeight + laneGap, laneHeight, {
      channelMode: "stereo",
      channelPhase: Math.PI * 0.67,
      strokeStyle: "rgba(74, 48, 33, 0.6)",
    });
  }

  function drawImageClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h) {
    const thumbnailSrc = String(clip?.thumbnailSrc || clip?.previewSrc || clip?.src || "").trim();
    const hasThumb = drawClipThumbnailCover(state, ctx, thumbnailSrc, x0, widthPx, y, h);
    if (hasThumb) {
      ctx.fillStyle = "rgba(41, 27, 17, 0.18)";
      ctx.fillRect(x0, y, widthPx, h);
    }
    const hash = normalizedTrackHash(`${trackName}:${clip?.label || "image"}`);
    const bars = Utils.clamp(Math.floor(widthPx / 6), 6, 64);
    const barW = widthPx / bars;
    const baseY = y + h;
    const phase = hash * Math.PI * 2;
    ctx.strokeStyle = "rgba(52, 34, 21, 0.45)";
    for (let row = 1; row <= 2; row += 1) {
      const gy = y + (h * row) / 3;
      ctx.beginPath();
      ctx.moveTo(x0, gy + 0.5);
      ctx.lineTo(x0 + widthPx, gy + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(72, 48, 30, 0.4)";
    for (let i = 0; i < bars; i += 1) {
      const t = i / Math.max(1, bars - 1);
      const envelope = 0.35 + Math.abs(Math.sin((t * 5 + phase) * Math.PI)) * 0.55;
      const barH = Math.max(2, envelope * h * 0.82);
      const bx = x0 + i * barW;
      const by = baseY - barH;
      ctx.fillRect(bx + 1, by, Math.max(1, barW - 2), barH);
    }
  }

  function resolveClipHandleSafeInset(widthPx, extra = 4) {
    const handleW = widthPx < 36 ? 5 : 8;
    return Math.max(6, handleW + Math.max(0, Number(extra || 0)));
  }

  function drawVideoClipSignal(state, ctx, trackName, clip, x0, widthPx, y, h, options = {}) {
    const thumbnailSrc = String(clip?.thumbnailSrc || clip?.previewSrc || clip?.src || "").trim();
    const clipStart = Number(clip?.start || 0);
    const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
    const clipDurationSec = Math.max(0.01, clipEnd - clipStart);
    const sourceDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(clip?.sourceDurationSec || clip?.end - clip?.start || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const clipStartOffsetSec = Math.max(0, Number(clip?.startOffsetSec || 0));
    const hasSourceWindowControl = Math.max(0, sourceDurationSec - clipDurationSec) > 0.0005;
    const safeInsetX = resolveClipHandleSafeInset(widthPx, 2);
    const safeInsetTop = 3;
    const safeInsetBottom = (hasSourceWindowControl ? (CONSTANTS.CLIP_WINDOW_BAR_HEIGHT + CONSTANTS.CLIP_WINDOW_BAR_BOTTOM_MARGIN + 3) : 3);
    const contentTop = y + safeInsetTop;
    const contentBottom = Math.max(contentTop + 4, y + h - safeInsetBottom);
    const contentH = Math.max(4, contentBottom - contentTop);
    let stripeX = Math.floor(x0 + safeInsetX);
    let stripeW = Math.floor(widthPx - safeInsetX * 2);
    if (stripeW < 6) {
      stripeX = Math.floor(x0 + 1);
      stripeW = Math.max(2, Math.floor(widthPx - 2));
    }
    const frameCount = Utils.clamp(Math.floor(stripeW / 42), 3, 18);
    const stripeH = Math.max(4, Math.floor(contentH * 0.74));
    const stripeY = Math.floor(contentTop + Math.max(0, (contentH - stripeH) * 0.5));
    const hasBaseThumb = drawClipThumbnailCover(state, ctx, thumbnailSrc, stripeX, stripeW, stripeY, stripeH);
    const previewPlan = resolveVideoPreviewPlan(state, widthPx);
    const filmstrip = ensureTimelineVideoFilmstrip(state, thumbnailSrc, sourceDurationSec, previewPlan);
    const hasFramePreview = drawClipFilmstripTilesCached(state, ctx, filmstrip?.frames || [], stripeX, stripeW, stripeY, stripeH, {
      src: thumbnailSrc,
      strategy: previewPlan.strategy,
      frameCount: previewPlan.frameCount,
      targetHeight: previewPlan.targetHeight,
      sourceDurationSec,
      clipDurationSec,
      clipStartOffsetSec,
    });
    const hasThumbTiles = !hasFramePreview
      ? drawClipThumbnailTiles(state, ctx, thumbnailSrc, stripeX, stripeW, stripeY, stripeH)
      : false;
    const hasAnyVisual = hasFramePreview || hasThumbTiles || hasBaseThumb;
    const hash = normalizedTrackHash(`${trackName}:${clip?.label || "video"}`);
    if (!hasAnyVisual) {
      ctx.fillStyle = "rgba(34, 26, 18, 0.3)";
      ctx.fillRect(stripeX, stripeY, stripeW, stripeH);
    }
    const keyframes = Utils.clamp(Math.floor(widthPx / 90), 1, 7);
    const frameW = Math.max(6, stripeW / Math.max(1, frameCount));
    for (let i = 0; i <= keyframes; i += 1) {
      const t = i / Math.max(1, keyframes);
      const kx = stripeX + t * stripeW;
      const level = 0.45 + Math.abs(Math.sin((t * 9 + hash) * Math.PI * 2)) * 0.45;
      const kh = Math.max(3, stripeH * level);
      const ky = stripeY + stripeH - kh;
      ctx.fillStyle = "rgba(86, 60, 38, 0.62)";
      ctx.fillRect(kx + 1, ky, Math.max(2, frameW * 0.28), kh);
    }
    const drawCornerBadge = (text, corner, cornerOptions = {}) => {
      const label = String(text || "").trim();
      if (!label) return;
      const padX = Number(cornerOptions?.padX || 4);
      const hBox = Number(cornerOptions?.height || 11);
      const font = String(cornerOptions?.font || "9px monospace");
      ctx.font = font;
      const wBox = Math.ceil(ctx.measureText(label).width) + padX * 2;
      const safeX0 = x0 + safeInsetX;
      const safeX1 = x0 + widthPx - safeInsetX - wBox;
      const topY = contentTop;
      const bottomY = Math.max(contentTop, contentBottom - hBox);
      let boxX = safeX0;
      let boxY = topY;
      if (corner === "top-right") boxX = safeX1;
      else if (corner === "bottom-left") boxY = bottomY;
      else if (corner === "bottom-right") {
        boxX = safeX1;
        boxY = bottomY;
      }
      boxX = Utils.clamp(boxX, safeX0, Math.max(safeX0, safeX1));
      boxY = Utils.clamp(boxY, topY, Math.max(topY, bottomY));
      ctx.fillStyle = "rgba(26, 19, 13, 0.68)";
      ctx.fillRect(boxX, boxY, wBox, hBox);
      ctx.strokeStyle = "rgba(223, 203, 176, 0.72)";
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, Math.max(1, wBox - 1), Math.max(1, hBox - 1));
      ctx.fillStyle = "rgba(243, 232, 217, 0.92)";
      ctx.fillText(label, boxX + padX, boxY + 8.5);
    };
    const nominalFrameStep = clipDurationSec / Math.max(1, frameCount);
    const fpsHint = nominalFrameStep > 0 ? (1 / nominalFrameStep) : 0;
    const labelSafeWidth = Math.max(0, widthPx - safeInsetX * 2);
    if (labelSafeWidth >= 94 && contentH >= 22) {
      drawCornerBadge(Utils.compactText(String(clip?.label || "video"), 26), "top-left");
      drawCornerBadge(`clip ${clipDurationSec.toFixed(2)}s / src ${sourceDurationSec.toFixed(2)}s`, "top-right");
      drawCornerBadge(`off ${clipStartOffsetSec.toFixed(2)}s`, "bottom-left");
      if (fpsHint > 0) {
        drawCornerBadge(`${Math.round(fpsHint)}fps`, "bottom-right");
      }
    }
  }

  function drawClipSignal(state, ctx, track, clip, events, x0, widthPx, rowTop, rowHeight, options = {}) {
    const clipTopInset = Math.max(0, Number(options?.clipTopInset || 5));
    const clipBottomInset = Math.max(0, Number(options?.clipBottomInset || 5));
    const clipBoxY = rowTop + clipTopInset;
    const clipBoxH = Math.max(8, rowHeight - clipTopInset - clipBottomInset);
    const innerY = clipBoxY + 2;
    const innerH = Math.max(6, clipBoxH - 4);
    const clipStart = Number(clip?.start || 0);
    const clipEnd = Math.max(clipStart + 0.01, Number(clip?.end || clipStart + 0.01));
    const kind = String(track?.kind || "").toLowerCase();
    const channelMode = resolveEffectiveChannelMode(state, track);

    if (kind === "midi") {
      const noteEvents = Array.isArray(events)
        ? events.filter((event) => {
            if (!Number.isFinite(event?.pitch)) return false;
            const t0 = Number(event?.time || 0);
            const t1 = t0 + Math.max(0.01, Number(event?.duration || 0.01));
            return t1 > clipStart && t0 < clipEnd;
          })
        : [];
      if (!noteEvents.length) {
        drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
        return;
      }
      const minPitch = noteEvents.reduce((m, e) => Math.min(m, Number(e.pitch || m)), Number.POSITIVE_INFINITY);
      const maxPitch = noteEvents.reduce((m, e) => Math.max(m, Number(e.pitch || m)), Number.NEGATIVE_INFINITY);
      const span = Math.max(1, maxPitch - minPitch);
      ctx.strokeStyle = "rgba(50, 34, 22, 0.2)";
      for (let row = 1; row < 6; row += 1) {
        const py = innerY + (row / 6) * innerH;
        ctx.beginPath();
        ctx.moveTo(x0, py + 0.5);
        ctx.lineTo(x0 + widthPx, py + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(36, 22, 11, 0.72)";
      for (const event of noteEvents) {
        const t0 = Number(event.time || 0);
        const t1 = t0 + Math.max(0.02, Number(event.duration || 0.02));
        const nx0 = x0 + ((t0 - clipStart) / Math.max(0.001, clipEnd - clipStart)) * widthPx;
        const nx1 = x0 + ((t1 - clipStart) / Math.max(0.001, clipEnd - clipStart)) * widthPx;
        const pitch = Number(event.pitch || minPitch);
        const rel = (pitch - minPitch) / span;
        const noteY = innerY + (1 - rel) * (innerH - 4);
        ctx.fillRect(nx0, noteY, Math.max(2, nx1 - nx0), 3);
      }
      return;
    }

    if (kind === "audio") {
      if (channelMode === "stereo") {
        drawStereoClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
      } else {
        drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
      }
      return;
    }
    if (kind === "video") {
      drawVideoClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH, {
        selected: Boolean(options?.selected),
      });
      return;
    }
    if (kind === "image") {
      drawImageClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
      return;
    }
    drawAudioClipSignal(state, ctx, String(track?.name || ""), clip, x0, widthPx, innerY, innerH);
  }

  function drawClipHandles(ctx, x0, rowTop, widthPx, rowHeight, options = {}) {
    const muted = Boolean(options?.muted);
    const selected = Boolean(options?.selected);
    if (widthPx < 10) return null;
    const handleW = widthPx < 36 ? 5 : 8;
    const handleY = rowTop + 8;
    const handleH = Math.max(8, rowHeight - 16);
    const leftX = x0 + 1;
    const rightX = x0 + widthPx - handleW - 1;
    ctx.fillStyle = muted
      ? "rgba(82, 66, 50, 0.52)"
      : (selected ? "rgba(238, 231, 219, 0.96)" : "rgba(233, 226, 213, 0.8)");
    ctx.fillRect(leftX, handleY, handleW, handleH);
    ctx.fillRect(rightX, handleY, handleW, handleH);
    ctx.strokeStyle = muted ? "rgba(56, 40, 27, 0.4)" : "rgba(76, 54, 36, 0.7)";
    ctx.strokeRect(leftX + 0.5, handleY + 0.5, Math.max(1, handleW - 1), Math.max(1, handleH - 1));
    ctx.strokeRect(rightX + 0.5, handleY + 0.5, Math.max(1, handleW - 1), Math.max(1, handleH - 1));
    const ridgeCount = handleW >= 8 ? 3 : 2;
    const ridgeInset = Math.max(1, Math.floor(handleW / 3));
    ctx.strokeStyle = muted ? "rgba(61, 45, 31, 0.45)" : "rgba(94, 69, 49, 0.62)";
    for (let i = 0; i < ridgeCount; i += 1) {
      const offset = ridgeInset + i;
      const lx = leftX + offset + 0.5;
      const rx = rightX + offset + 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, handleY + 2);
      ctx.lineTo(lx, handleY + handleH - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx, handleY + 2);
      ctx.lineTo(rx, handleY + handleH - 2);
      ctx.stroke();
    }
    return {
      leftX,
      rightX,
      y0: handleY,
      y1: handleY + handleH,
      w: handleW,
    };
  }

  function drawClipSourceWindowControl(ctx, clip, x0, rowTop, widthPx, rowHeight, options = {}) {
    const sourceDurationSec = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(clip?.sourceDurationSec || (clip?.end - clip?.start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const clipDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(clip?.end || 0) - Number(clip?.start || 0));
    const maxOffsetSec = Math.max(0, sourceDurationSec - clipDurationSec);
    if (maxOffsetSec <= 0.0005) return null;
    const safeInset = resolveClipHandleSafeInset(widthPx, 7);
    const railX = x0 + safeInset;
    const railW = Math.max(0, widthPx - safeInset * 2);
    if (railW < 24) return null;
    const railH = CONSTANTS.CLIP_WINDOW_BAR_HEIGHT;
    const railY = rowTop + rowHeight - railH - CONSTANTS.CLIP_WINDOW_BAR_BOTTOM_MARGIN;
    const normalized = Utils.clamp(Math.max(0, Number(clip?.startOffsetSec || 0)) / maxOffsetSec, 0, 1);
    const knobMinW = 12;
    const knobW = Utils.clamp(railW * (clipDurationSec / sourceDurationSec), knobMinW, railW);
    const knobX = railX + (railW - knobW) * normalized;
    const knobX0 = knobX - 2;
    const knobX1 = knobX + knobW + 2;
    const railHitX0 = railX - 2;
    const railHitX1 = railX + railW + 2;
    const selected = Boolean(options?.selected);
    const muted = Boolean(options?.muted);

    ctx.fillStyle = muted ? "rgba(70, 56, 43, 0.5)" : "rgba(77, 60, 44, 0.32)";
    ctx.fillRect(railX, railY, railW, railH);
    ctx.strokeStyle = muted ? "rgba(54, 39, 26, 0.6)" : "rgba(79, 56, 36, 0.7)";
    ctx.strokeRect(railX + 0.5, railY + 0.5, Math.max(1, railW - 1), Math.max(1, railH - 1));
    ctx.fillStyle = selected ? "rgba(244, 235, 220, 0.96)" : "rgba(229, 219, 203, 0.88)";
    ctx.fillRect(knobX, railY + 0.5, knobW, Math.max(2, railH - 1));
    ctx.strokeStyle = "rgba(85, 62, 42, 0.78)";
    ctx.strokeRect(knobX + 0.5, railY + 0.5, Math.max(1, knobW - 1), Math.max(1, railH - 1));

    return {
      x0: knobX0,
      y0: railY - 2,
      x1: knobX1,
      y1: railY + railH + 2,
      railX,
      railY,
      railW,
      railH,
      knobX,
      knobW,
      knobX0,
      knobX1,
      railHitX0,
      railHitX1,
    };
  }

  function drawClipEditOverlay(state, ctx, rowTop, rowBottom, clip, x0, widthPx) {
    const session = state?.clipEditSession;
    if (!session) return;
    if (String(session.clipId || "") !== String(getClipId(clip) || "")) return;
    const xStart = x0;
    const xEnd = x0 + widthPx;
    const safeInset = resolveClipHandleSafeInset(widthPx, 5);
    const xStartSafe = xStart + safeInset;
    const xEndSafe = xEnd - safeInset;
    const safeWidth = Math.max(0, xEndSafe - xStartSafe);
    if (safeWidth < 22) return;
    const mode = String(session.mode || "move").toLowerCase();
    const modeLabel = mode === "trim_start"
      ? "TRIM IN"
      : (mode === "trim_end" ? "TRIM OUT" : (mode === "slip" ? "SLIP" : "MOVE"));
    ctx.save();
    ctx.fillStyle = "rgba(102, 80, 59, 0.14)";
    ctx.fillRect(xStart + 1, rowTop + 2, Math.max(1, widthPx - 2), Math.max(6, rowBottom - rowTop - 4));

    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(58, 42, 27, 0.85)";
    ctx.beginPath();
    ctx.moveTo(xStart + 0.5, rowTop + 2);
    ctx.lineTo(xStart + 0.5, rowBottom - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xEnd + 0.5, rowTop + 2);
    ctx.lineTo(xEnd + 0.5, rowBottom - 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(68, 50, 35, 0.92)";
    ctx.font = "9px monospace";
    const modePadX = 6;
    const modeH = 12;
    const modeW = Math.ceil(ctx.measureText(modeLabel).width) + modePadX * 2;
    const modeX = Utils.clamp(xStart + (widthPx - modeW) * 0.5, xStartSafe + 1, Math.max(xStartSafe + 1, xEndSafe - modeW - 1));
    const modeY = rowTop + 2;
    ctx.fillRect(modeX, modeY, modeW, modeH);
    ctx.strokeStyle = "rgba(225, 204, 177, 0.7)";
    ctx.strokeRect(modeX + 0.5, modeY + 0.5, Math.max(1, modeW - 1), Math.max(1, modeH - 1));
    ctx.fillStyle = "#f8efe2";
    ctx.fillText(modeLabel, modeX + modePadX, modeY + 9);

    ctx.fillStyle = "rgba(72, 55, 40, 0.94)";
    ctx.font = "9px monospace";
    const startSec = Number(clip?.start || 0);
    const endSec = Number(clip?.end || 0);
    ctx.beginPath();
    ctx.rect(xStartSafe, rowTop + 2, safeWidth, Math.max(10, rowBottom - rowTop - 4));
    ctx.clip();
    ctx.fillText(`S ${startSec.toFixed(2)}s`, xStartSafe + 2, rowTop + 24);
    const duration = Math.max(0, endSec - startSec);
    const sourceDuration = Math.max(
      CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC,
      Number(clip?.sourceDurationSec || duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC)
    );
    const startOffsetSec = Math.max(0, Number(clip?.startOffsetSec || 0));
    const maxOffsetSec = Math.max(0, sourceDuration - duration);
    const durationText = `D ${duration.toFixed(2)}s / src ${sourceDuration.toFixed(2)}s / off ${startOffsetSec.toFixed(2)}s`;
    const textWidth = Math.ceil(ctx.measureText(durationText).width);
    const textX = Math.max(xStartSafe + 2, xEndSafe - textWidth - 2);
    if (textX + textWidth <= xEndSafe) {
      ctx.fillText(durationText, textX, rowTop + 24);
    }
    const endText = `E ${endSec.toFixed(2)}s`;
    const endTextW = Math.ceil(ctx.measureText(endText).width);
    const endTextX = Math.max(xStartSafe + 2, xEndSafe - endTextW - 2);
    const endTextY = Math.max(rowTop + 34, rowBottom - 6);
    if (endTextX + endTextW <= xEndSafe) {
      ctx.fillText(endText, endTextX, endTextY);
    }

    if (mode === "trim_start" || mode === "trim_end" || mode === "slip") {
      const atMinOffset = startOffsetSec <= 0.001;
      const atMaxOffset = startOffsetSec >= Math.max(0, maxOffsetSec - 0.001);
      if (atMinOffset || atMaxOffset) {
        const hint = atMinOffset ? "at source in" : "at source out";
        const hintW = Math.ceil(ctx.measureText(hint).width) + 8;
        const hintX = Utils.clamp(xStart + 3, xStartSafe + 1, Math.max(xStartSafe + 1, xEndSafe - hintW - 1));
        const hintY = Math.max(rowTop + 14, rowBottom - 18);
        ctx.fillStyle = "rgba(84, 60, 38, 0.88)";
        ctx.fillRect(hintX, hintY, hintW, 11);
        ctx.strokeStyle = "rgba(223, 198, 166, 0.68)";
        ctx.strokeRect(hintX + 0.5, hintY + 0.5, Math.max(1, hintW - 1), 10);
        ctx.fillStyle = "#f8efe2";
        ctx.fillText(hint, hintX + 4, hintY + 8.5);
      }
    }
    ctx.restore();
  }

  return {
    normalizedTrackHash,
    drawAudioClipSignal,
    drawStereoClipSignal,
    drawImageClipSignal,
    resolveClipHandleSafeInset,
    drawVideoClipSignal,
    drawClipSignal,
    drawClipHandles,
    drawClipSourceWindowControl,
    drawClipEditOverlay,
  };
}

