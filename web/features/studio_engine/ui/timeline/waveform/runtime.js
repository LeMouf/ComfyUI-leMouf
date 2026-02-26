export function createTimelineSectionWaveformRuntime(deps = {}) {
  const {
    CONSTANTS,
    Utils,
    isTrackMuted,
    resolveEffectiveChannelMode,
    deriveLinkedAudioTrackNameFromVideoTrack,
    drawClipThumbnailCover,
    drawClipThumbnailTiles,
    resolveVideoPreviewPlan,
    ensureTimelineVideoFilmstrip,
    drawClipFilmstripTilesCached,
  } = deps;

  function normalizeSectionVizMode(value) {
    const mode = String(value || "").toLowerCase();
    return CONSTANTS.SECTION_VIZ_MODES.includes(mode) ? mode : "bands";
  }

  function mapTimelineSecToSignalSourceSec(state, sourceDurationSec, timelineSec) {
    const srcDur = Math.max(0.001, Number(sourceDurationSec || 0));
    const songDur = Math.max(0.001, Number(state?.durationSec || 0));
    let mappedSec = Number(timelineSec || 0);
    if (srcDur < songDur * 0.995) mappedSec *= srcDur / songDur;
    return Utils.clamp(mappedSec, 0, Math.max(0, srcDur - 1e-6));
  }

  function drawAmplitudeVizLane(ctx, amplitudes, x0, widthPx, y, h, options = {}) {
    const values = Array.isArray(amplitudes)
      ? amplitudes
      : (ArrayBuffer.isView(amplitudes) ? amplitudes : []);
    if (!values.length || widthPx <= 0 || h <= 0) return;
    const mode = normalizeSectionVizMode(options.mode);
    const palette = Utils.resolveAudioVizPalette(options.palette);
    const bins = Math.max(1, values.length);
    const stepX = widthPx / bins;
    const midY = y + h * 0.5;
    const ampPx = Math.max(1, h * 0.46);
    if (palette.centerLineStyle) {
      ctx.strokeStyle = palette.centerLineStyle;
      ctx.beginPath();
      ctx.moveTo(x0, midY + 0.5);
      ctx.lineTo(x0 + widthPx, midY + 0.5);
      ctx.stroke();
    }
    if (mode === "filled") {
      ctx.save();
      ctx.fillStyle = palette.fillStyle;
      ctx.beginPath();
      for (let i = 0; i < bins; i += 1) {
        const x = x0 + i * stepX + stepX * 0.5;
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        const yTop = midY - a * ampPx;
        if (i === 0) ctx.moveTo(x, yTop);
        else ctx.lineTo(x, yTop);
      }
      for (let i = bins - 1; i >= 0; i -= 1) {
        const x = x0 + i * stepX + stepX * 0.5;
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        const yBottom = midY + a * ampPx;
        ctx.lineTo(x, yBottom);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = palette.strokeStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < bins; i += 1) {
        const x = x0 + i * stepX + stepX * 0.5;
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        const yTop = midY - a * ampPx;
        if (i === 0) ctx.moveTo(x, yTop);
        else ctx.lineTo(x, yTop);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (mode === "bands") {
      for (let i = 0; i < bins; i += 1) {
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        if (a <= 0.001) continue;
        const x = x0 + i * stepX + stepX * 0.5;
        const yTop = midY - a * ampPx;
        const yBottom = midY + a * ampPx;
        ctx.strokeStyle = palette.bandLowStyle;
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x, yBottom);
        ctx.stroke();
        ctx.strokeStyle = palette.bandMidStyle;
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x, midY - (midY - yTop) * 0.66);
        ctx.stroke();
        ctx.strokeStyle = palette.bandHighStyle;
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x, yTop);
        ctx.stroke();
      }
      return;
    }
    if (mode === "line") {
      ctx.strokeStyle = palette.strokeStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < bins; i += 1) {
        const x = x0 + i * stepX + stepX * 0.5;
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        const yTop = midY - a * ampPx;
        if (i === 0) ctx.moveTo(x, yTop);
        else ctx.lineTo(x, yTop);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      for (let i = 0; i < bins; i += 1) {
        const x = x0 + i * stepX + stepX * 0.5;
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        const yBottom = midY + a * ampPx;
        if (i === 0) ctx.moveTo(x, yBottom);
        else ctx.lineTo(x, yBottom);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    if (mode === "dots") {
      const radius = Utils.clamp(Math.floor(stepX * 0.28), 1, 3);
      ctx.fillStyle = palette.strokeStyle;
      for (let i = 0; i < bins; i += 1) {
        const a = Utils.clamp(Number(values[i] || 0), 0, 1);
        if (a <= 0.001) continue;
        const x = x0 + i * stepX + stepX * 0.5;
        const yTop = midY - a * ampPx;
        const yBottom = midY + a * ampPx;
        ctx.beginPath();
        ctx.arc(x, yTop, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, yBottom, Math.max(1, radius - 1), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    ctx.strokeStyle = palette.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const x = x0 + i * stepX + stepX * 0.5;
      const a = Utils.clamp(Number(values[i] || 0), 0, 1);
      ctx.moveTo(x, midY - a * ampPx);
      ctx.lineTo(x, midY + a * ampPx);
    }
    ctx.stroke();
  }

  function drawSectionPeaks(state, ctx, y, height, visibleStartSec, samples, sampleRate) {
    const width = state.canvas.clientWidth;
    const startX = CONSTANTS.LEFT_GUTTER;
    const endX = width;
    const laneMidY = y + height / 2;
    const laneAmp = Math.max(2, (height - 6) * 0.48);
    const sourceDurationSec = samples.length / Math.max(1, sampleRate);

    ctx.strokeStyle = `rgba(62, 46, 32, ${CONSTANTS.SECTION_WAVE_ALPHA})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < endX; x += 1) {
      const xOffset = x - startX;
      const t0 = visibleStartSec + xOffset / state.pxPerSec;
      const t1 = visibleStartSec + (xOffset + 1) / state.pxPerSec;
      if (t0 >= state.durationSec) break;
      const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
      const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, Math.min(t1, state.durationSec));
      let s0 = Math.floor(mt0 * sampleRate);
      let s1 = Math.ceil(mt1 * sampleRate);
      if (!Number.isFinite(s0)) s0 = 0;
      if (!Number.isFinite(s1)) s1 = s0 + 1;
      s0 = Utils.clamp(s0, 0, samples.length - 1);
      s1 = Utils.clamp(s1, s0 + 1, samples.length);
      const span = s1 - s0;
      const step = Math.max(1, Math.floor(span / CONSTANTS.SECTION_WAVE_DETAIL));
      let peak = 0;
      for (let i = s0; i < s1; i += step) {
        const amp = Math.abs(samples[i] || 0);
        if (amp > peak) peak = amp;
      }
      const a = Utils.clamp(peak, 0, 1);
      const y0 = laneMidY - a * laneAmp;
      const y1 = laneMidY + a * laneAmp;
      ctx.moveTo(x + 0.5, y0);
      ctx.lineTo(x + 0.5, y1);
    }
    ctx.stroke();
  }

  function drawSectionFilled(state, ctx, y, height, visibleStartSec, samples, sampleRate) {
    const width = state.canvas.clientWidth;
    const startX = CONSTANTS.LEFT_GUTTER;
    const endX = width;
    const laneMidY = y + height / 2;
    const laneAmp = Math.max(2, (height - 8) * 0.48);
    const points = [];
    const sourceDurationSec = samples.length / Math.max(1, sampleRate);

    for (let x = startX; x < endX; x += 1) {
      const xOffset = x - startX;
      const t0 = visibleStartSec + xOffset / state.pxPerSec;
      const t1 = visibleStartSec + (xOffset + 1) / state.pxPerSec;
      if (t0 >= state.durationSec) break;
      const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
      const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, Math.min(t1, state.durationSec));
      let s0 = Math.floor(mt0 * sampleRate);
      let s1 = Math.ceil(mt1 * sampleRate);
      if (!Number.isFinite(s0)) s0 = 0;
      if (!Number.isFinite(s1)) s1 = s0 + 1;
      s0 = Utils.clamp(s0, 0, samples.length - 1);
      s1 = Utils.clamp(s1, s0 + 1, samples.length);
      const span = s1 - s0;
      const step = Math.max(1, Math.floor(span / CONSTANTS.SECTION_WAVE_DETAIL));
      let peakPos = 0;
      let peakNeg = 0;
      for (let i = s0; i < s1; i += step) {
        const v = samples[i] || 0;
        if (v > peakPos) peakPos = v;
        if (v < peakNeg) peakNeg = v;
      }
      points.push({
        x: x + 0.5,
        yTop: laneMidY - Utils.clamp(peakPos, 0, 1) * laneAmp,
        yBot: laneMidY - Utils.clamp(peakNeg, -1, 0) * laneAmp,
      });
    }
    if (!points.length) return;

    ctx.fillStyle = "rgba(97, 73, 53, 0.38)";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].yTop);
    for (const point of points) ctx.lineTo(point.x, point.yTop);
    for (let i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i].x, points[i].yBot);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(78, 57, 40, 0.82)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].yTop);
    for (const point of points) ctx.lineTo(point.x, point.yTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].yBot);
    for (const point of points) ctx.lineTo(point.x, point.yBot);
    ctx.stroke();
  }

  function drawSectionBands(state, ctx, y, height, visibleStartSec, samples, sampleRate) {
    const width = state.canvas.clientWidth;
    const startX = CONSTANTS.LEFT_GUTTER;
    const endX = width;
    const h = Math.max(3, height - 2);
    const sourceDurationSec = samples.length / Math.max(1, sampleRate);
    for (let x = startX; x < endX; x += 1) {
      const xOffset = x - startX;
      const t0 = visibleStartSec + xOffset / state.pxPerSec;
      const t1 = visibleStartSec + (xOffset + 1) / state.pxPerSec;
      if (t0 >= state.durationSec) break;
      const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
      const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, Math.min(t1, state.durationSec));
      let s0 = Math.floor(mt0 * sampleRate);
      let s1 = Math.ceil(mt1 * sampleRate);
      if (!Number.isFinite(s0)) s0 = 0;
      if (!Number.isFinite(s1)) s1 = s0 + 1;
      s0 = Utils.clamp(s0, 0, samples.length - 1);
      s1 = Utils.clamp(s1, s0 + 1, samples.length);
      const span = s1 - s0;
      const step = Math.max(1, Math.floor(span / CONSTANTS.SECTION_WAVE_DETAIL));
      let absSum = 0;
      let diffSum = 0;
      let accelSum = 0;
      let count = 0;
      let p1 = 0;
      let p2 = 0;
      for (let i = s0; i < s1; i += step) {
        const value = samples[i] || 0;
        absSum += Math.abs(value);
        if (count > 0) diffSum += Math.abs(value - p1);
        if (count > 1) accelSum += Math.abs(value - 2 * p1 + p2);
        p2 = p1;
        p1 = value;
        count += 1;
      }
      const low = Math.tanh((absSum / Math.max(1, count)) * 2.9);
      const mid = Math.tanh((diffSum / Math.max(1, count - 1)) * 3.2);
      const high = Math.tanh((accelSum / Math.max(1, count - 2)) * 2.5);
      const lowH = h * low;
      const midH = h * mid;
      const highH = h * high;

      ctx.strokeStyle = "rgba(94, 171, 132, 0.72)";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + h);
      ctx.lineTo(x + 0.5, y + h - lowH);
      ctx.stroke();

      ctx.strokeStyle = "rgba(219, 174, 90, 0.76)";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + h);
      ctx.lineTo(x + 0.5, y + h - midH);
      ctx.stroke();

      ctx.strokeStyle = "rgba(198, 104, 147, 0.76)";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + h);
      ctx.lineTo(x + 0.5, y + h - highH);
      ctx.stroke();
    }
  }

  function buildSectionMidiEnvelope(state, visibleStartSec, visibleEndSec, bins) {
    const tracks = Array.isArray(state.studioData?.tracks) ? state.studioData.tracks : [];
    const eventsByTrack = state.studioData?.eventsByTrack || {};
    const spanSec = Math.max(0.001, visibleEndSec - visibleStartSec);
    const values = new Array(Math.max(1, bins)).fill(0);
    let hasMidi = false;
    for (const track of tracks) {
      if (String(track?.kind || "").toLowerCase() !== "midi") continue;
      if (isTrackMuted(state, String(track?.name || ""))) continue;
      const events = Array.isArray(eventsByTrack?.[track?.name]) ? eventsByTrack[track.name] : [];
      for (const event of events) {
        const startSec = Math.max(0, Number(event?.time || 0));
        const durationSec = Math.max(0.01, Number(event?.duration || 0.01));
        const endSec = startSec + durationSec;
        if (endSec < visibleStartSec || startSec > visibleEndSec) continue;
        hasMidi = true;
        const note = Number(event?.pitch);
        const velocity = Number(event?.velocity);
        const noteFactor = Number.isFinite(note) ? Utils.clamp(note / 127, 0, 1) : 0.5;
        const velFactor = Number.isFinite(velocity) ? Utils.clamp(velocity / 127, 0, 1) : 0.72;
        const weight = 0.35 + noteFactor * 0.45 + velFactor * 0.2;
        const localStart = (Math.max(startSec, visibleStartSec) - visibleStartSec) / spanSec;
        const localEnd = (Math.min(endSec, visibleEndSec) - visibleStartSec) / spanSec;
        const i0 = Utils.clamp(Math.floor(localStart * values.length), 0, values.length - 1);
        const i1 = Utils.clamp(Math.ceil(localEnd * values.length), 0, values.length - 1);
        for (let i = i0; i <= Math.max(i0, i1); i += 1) values[i] += weight;
      }
    }
    if (!hasMidi) return null;
    const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
    if (maxValue <= 0) return null;
    return values.map((value) => Utils.clamp(value / maxValue, 0, 1));
  }

  function drawSectionMidiFallback(state, ctx, y, height, visibleStartSec) {
    const width = state.canvas.clientWidth;
    if (width <= CONSTANTS.LEFT_GUTTER + 1) return false;
    const timelineWidth = width - CONSTANTS.LEFT_GUTTER;
    const visibleEndSec = Math.min(
      state.durationSec,
      visibleStartSec + timelineWidth / Math.max(1e-6, state.pxPerSec)
    );
    const visibleSpanSec = Math.max(0, visibleEndSec - visibleStartSec);
    if (visibleSpanSec <= 0.0001) return false;
    const drawWidth = Math.min(timelineWidth, visibleSpanSec * state.pxPerSec);
    if (drawWidth <= 0.5) return false;
    const bins = Utils.clamp(Math.floor(timelineWidth / 2), 24, 360);
    const envelope = buildSectionMidiEnvelope(state, visibleStartSec, visibleEndSec, bins);
    if (!envelope || !envelope.length) return false;
    const h = Math.max(3, height - 2);
    const xStep = drawWidth / envelope.length;
    const mode = normalizeSectionVizMode(state.sectionVizMode);
    const baseY = y + h;
    const centerY = y + h * 0.5;
    for (let i = 0; i < envelope.length; i += 1) {
      const amp = envelope[i];
      if (amp <= 0.01) continue;
      const x = CONSTANTS.LEFT_GUTTER + i * xStep + xStep * 0.5;
      if (mode === "filled") {
        const top = centerY - amp * h * 0.46;
        const bot = centerY + amp * h * 0.46;
        ctx.strokeStyle = "rgba(90, 163, 126, 0.7)";
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bot);
        ctx.stroke();
        continue;
      }
      if (mode === "peaks") {
        ctx.strokeStyle = "rgba(78, 57, 40, 0.84)";
        ctx.beginPath();
        ctx.moveTo(x, centerY - amp * h * 0.5);
        ctx.lineTo(x, centerY + amp * h * 0.5);
        ctx.stroke();
        continue;
      }
      const low = amp;
      const mid = Math.pow(amp, 0.85) * 0.82;
      const high = Math.pow(amp, 1.6) * 0.66;
      ctx.strokeStyle = "rgba(94, 171, 132, 0.72)";
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - h * low);
      ctx.stroke();
      ctx.strokeStyle = "rgba(219, 174, 90, 0.76)";
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - h * mid);
      ctx.stroke();
      ctx.strokeStyle = "rgba(198, 104, 147, 0.76)";
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - h * high);
      ctx.stroke();
    }
    return true;
  }

  function buildSectionAudioEnvelopeFromBuffer(state, samples, sampleRate, visibleStartSec, bins) {
    const width = Math.max(1, Number(state?.canvas?.clientWidth || 0) - CONSTANTS.LEFT_GUTTER);
    const safeBins = Math.max(1, Math.floor(bins));
    const sourceDurationSec = samples.length / Math.max(1, sampleRate);
    const values = new Array(safeBins).fill(0);
    for (let i = 0; i < safeBins; i += 1) {
      const t0 = visibleStartSec + (i / safeBins) * (width / Math.max(1e-6, state.pxPerSec));
      const t1 = visibleStartSec + ((i + 1) / safeBins) * (width / Math.max(1e-6, state.pxPerSec));
      const mt0 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t0);
      const mt1 = mapTimelineSecToSignalSourceSec(state, sourceDurationSec, t1);
      let s0 = Math.floor(mt0 * sampleRate);
      let s1 = Math.ceil(mt1 * sampleRate);
      if (!Number.isFinite(s0)) s0 = 0;
      if (!Number.isFinite(s1)) s1 = s0 + 1;
      s0 = Utils.clamp(s0, 0, Math.max(0, samples.length - 1));
      s1 = Utils.clamp(s1, s0 + 1, samples.length);
      const span = Math.max(1, s1 - s0);
      const readStep = Math.max(1, Math.floor(span / CONSTANTS.SECTION_WAVE_DETAIL));
      let peak = 0;
      for (let s = s0; s < s1; s += readStep) {
        const amp = Math.abs(samples[s] || 0);
        if (amp > peak) peak = amp;
      }
      values[i] = Utils.clamp(peak, 0, 1);
    }
    return values;
  }

  function deriveVideoAudioTrackNames(videoTrackName) {
    const laneMatch = String(videoTrackName || "").trim().match(/^video\s*(\d+)$/i);
    if (!laneMatch) return { stereo: "", mono: "" };
    const lane = Math.max(1, Number(laneMatch[1] || 1));
    const stereoFallback = `Video Audio ${lane}`;
    const monoFallback = `Video Audio M${lane}`;
    return {
      stereo: deriveLinkedAudioTrackNameFromVideoTrack
        ? String(deriveLinkedAudioTrackNameFromVideoTrack(videoTrackName, stereoFallback) || stereoFallback)
        : stereoFallback,
      mono: deriveLinkedAudioTrackNameFromVideoTrack
        ? String(deriveLinkedAudioTrackNameFromVideoTrack(videoTrackName, monoFallback) || monoFallback)
        : monoFallback,
    };
  }

  function collectSectionVisualClips(state) {
    const studioData = state?.studioData;
    const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
    const eventsByTrack = studioData?.eventsByTrack && typeof studioData.eventsByTrack === "object"
      ? studioData.eventsByTrack
      : {};
    const orderByName = new Map();
    tracks.forEach((track, idx) => {
      const name = String(track?.name || "").trim();
      if (!name) return;
      orderByName.set(name, idx);
    });
    const clips = [];
    for (const track of tracks) {
      const trackName = String(track?.name || "").trim();
      if (!trackName) continue;
      const kind = String(track?.kind || "").toLowerCase();
      if (kind !== "video" && kind !== "image") continue;
      const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
      for (const event of events) {
        const src = String(event?.previewSrc || event?.src || "").trim();
        if (!src) continue;
        const start = Math.max(0, Number(event?.time || 0));
        const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
        const end = start + duration;
        clips.push({
          kind,
          src,
          start,
          end,
          duration,
          startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
          sourceDurationSec: Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || duration)),
          order: Number(orderByName.get(trackName) || 0),
        });
      }
    }
    clips.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.order !== b.order) return b.order - a.order;
      return a.src.localeCompare(b.src);
    });
    return clips;
  }

  function collectSectionAudioVisualEvents(state, visibleStartSec, visibleEndSec) {
    const studioData = state?.studioData;
    const tracks = Array.isArray(studioData?.tracks) ? studioData.tracks : [];
    const eventsByTrack = studioData?.eventsByTrack && typeof studioData.eventsByTrack === "object"
      ? studioData.eventsByTrack
      : {};
    const unmuted = [];
    const muted = [];
    for (const track of tracks) {
      const kind = String(track?.kind || "").toLowerCase();
      if (kind !== "audio") continue;
      const trackName = String(track?.name || "").trim();
      if (!trackName) continue;
      const trackMuted = isTrackMuted(state, trackName);
      const channelMode = resolveEffectiveChannelMode(state, track);
      const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
      for (const event of events) {
        const start = Math.max(0, Number(event?.time || 0));
        const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
        const end = start + duration;
        if (end <= visibleStartSec || start >= visibleEndSec) continue;
        const target = trackMuted ? muted : unmuted;
        target.push({
          trackName,
          clipId: String(event?.clipId || "").trim(),
          start,
          end,
          duration,
          startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
          sourceDurationSec: Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || duration)),
          channelMode,
        });
      }
    }
    if (unmuted.length || muted.length) return unmuted.length ? unmuted : muted;
    for (const track of tracks) {
      const kind = String(track?.kind || "").toLowerCase();
      if (kind !== "video") continue;
      const trackName = String(track?.name || "").trim();
      if (!trackName) continue;
      const linkedTracks = deriveVideoAudioTrackNames(trackName);
      const linkedNames = [linkedTracks.stereo, linkedTracks.mono].filter((name) => {
        return Array.isArray(eventsByTrack[name]) && eventsByTrack[name].length > 0;
      });
      const linkedMuted = linkedNames.length
        ? linkedNames.every((name) => isTrackMuted(state, name))
        : isTrackMuted(state, trackName);
      const events = Array.isArray(eventsByTrack[trackName]) ? eventsByTrack[trackName] : [];
      for (const event of events) {
        const hasAudio =
          Boolean(event?.hasAudio) ||
          Boolean(String(event?.assetKey || "").trim()) ||
          linkedNames.length > 0;
        if (!hasAudio) continue;
        const start = Math.max(0, Number(event?.time || 0));
        const duration = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.duration || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
        const end = start + duration;
        if (end <= visibleStartSec || start >= visibleEndSec) continue;
        const channelMode = linkedTracks.mono && linkedNames.includes(linkedTracks.mono) && !linkedNames.includes(linkedTracks.stereo)
          ? "mono"
          : "stereo";
        const target = linkedMuted ? muted : unmuted;
        target.push({
          trackName,
          clipId: String(event?.clipId || "").trim(),
          start,
          end,
          duration,
          startOffsetSec: Math.max(0, Number(event?.startOffsetSec || 0)),
          sourceDurationSec: Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || duration)),
          channelMode,
        });
      }
    }
    return unmuted.length ? unmuted : muted;
  }

  function normalizedTrackHash(trackName) {
    const text = String(trackName || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return (Math.abs(hash) % 1000) / 1000;
  }

  function buildSectionCompositionAudioEnvelope(state, audioEvents, visibleStartSec, visibleEndSec, bins) {
    const count = Math.max(1, Math.floor(bins));
    const left = new Float32Array(count);
    const right = new Float32Array(count);
    const spanSec = Math.max(1e-6, visibleEndSec - visibleStartSec);
    for (const event of audioEvents) {
      const start = Math.max(0, Number(event?.start || 0));
      const end = Math.max(start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.end || start + CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
      if (end <= visibleStartSec || start >= visibleEndSec) continue;
      const sourceDurationSec = Math.max(CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC, Number(event?.sourceDurationSec || (end - start) || CONSTANTS.CLIP_EDIT_MIN_DURATION_SEC));
      const startOffsetSec = Math.max(0, Number(event?.startOffsetSec || 0));
      const i0 = Utils.clamp(Math.floor(((Math.max(start, visibleStartSec) - visibleStartSec) / spanSec) * count), 0, count - 1);
      const i1 = Utils.clamp(Math.ceil(((Math.min(end, visibleEndSec) - visibleStartSec) / spanSec) * count), 0, count - 1);
      const hash = normalizedTrackHash(`${event.trackName}:${event.clipId || "clip"}`);
      for (let i = i0; i <= i1; i += 1) {
        const t0 = visibleStartSec + (i / count) * spanSec;
        const t1 = visibleStartSec + ((i + 1) / count) * spanSec;
        const overlapStart = Math.max(start, t0);
        const overlapEnd = Math.min(end, t1);
        if (overlapEnd <= overlapStart) continue;
        const localSec = startOffsetSec + ((overlapStart + overlapEnd) * 0.5 - start);
        const localRatio = Utils.clamp(localSec / Math.max(1e-6, sourceDurationSec), 0, 1);
        const body = 0.28 + 0.48 * Math.abs(Math.sin((localRatio * 10 + hash) * Math.PI));
        const trans = 0.12 + 0.2 * Math.abs(Math.sin((localRatio * 34 + hash * 0.7) * Math.PI));
        const amp = Utils.clamp(body + trans, 0, 1);
        if (String(event?.channelMode || "").toLowerCase() === "mono") {
          left[i] = Math.max(left[i], amp);
          right[i] = Math.max(right[i], amp);
        } else {
          const l = Utils.clamp(amp * (0.84 + 0.16 * Math.sin((localRatio * 8 + hash) * Math.PI * 2)), 0, 1);
          const r = Utils.clamp(amp * (0.84 + 0.16 * Math.cos((localRatio * 7 + hash * 1.3) * Math.PI * 2)), 0, 1);
          left[i] = Math.max(left[i], l);
          right[i] = Math.max(right[i], r);
        }
      }
    }
    return { left, right };
  }

  function getCachedSectionCompositionAudioEnvelope(state, audioEvents, visibleStartSec, visibleEndSec, bins) {
    const signature = audioEvents
      .map(
        (event) =>
          `${event.trackName}:${event.clipId}:${event.start.toFixed(4)}:${event.end.toFixed(4)}:` +
          `${event.startOffsetSec.toFixed(4)}:${String(event.channelMode || "stereo").toLowerCase()}`
      )
      .join("|");
    const key = `${visibleStartSec.toFixed(4)}:${visibleEndSec.toFixed(4)}:${bins}:${signature}`;
    const cached = state._sectionCompositionAudioEnvelopeCache;
    if (cached && cached.key === key && cached.value) return cached.value;
    const value = buildSectionCompositionAudioEnvelope(state, audioEvents, visibleStartSec, visibleEndSec, bins);
    state._sectionCompositionAudioEnvelopeCache = { key, value };
    return value;
  }

  function drawSectionCompositionAudioOverlay(state, ctx, y, height, visibleStartSec, visibleEndSec) {
    if (height < 8) return false;
    const width = Number(state?.canvas?.clientWidth || 0);
    if (width <= CONSTANTS.LEFT_GUTTER + 1) return false;
    const timelineWidth = width - CONSTANTS.LEFT_GUTTER;
    const bins = Utils.clamp(Math.floor(timelineWidth / 2.5), 32, 540);
    const events = collectSectionAudioVisualEvents(state, visibleStartSec, visibleEndSec);
    ctx.fillStyle = "rgba(235, 224, 209, 0.98)";
    ctx.fillRect(CONSTANTS.LEFT_GUTTER, y, timelineWidth, height);
    if (!events.length) {
      ctx.strokeStyle = "rgba(120, 100, 82, 0.22)";
      ctx.beginPath();
      ctx.moveTo(CONSTANTS.LEFT_GUTTER, y + height * 0.5 + 0.5);
      ctx.lineTo(width, y + height * 0.5 + 0.5);
      ctx.stroke();
      return true;
    }

    const envelope = getCachedSectionCompositionAudioEnvelope(state, events, visibleStartSec, visibleEndSec, bins);
    const laneGap = Math.max(1, Math.floor(height * 0.08));
    const laneHeight = Math.max(3, Math.floor((height - laneGap) * 0.5));
    const leftY = y;
    const rightY = y + laneHeight + laneGap;
    const vizMode = normalizeSectionVizMode(state?.sectionVizMode);

    const stepX = timelineWidth / bins;
    let runStart = -1;
    for (let i = 0; i < bins; i += 1) {
      const silent = envelope.left[i] <= 0.005 && envelope.right[i] <= 0.005;
      if (silent && runStart < 0) runStart = i;
      if ((!silent || i === bins - 1) && runStart >= 0) {
        const endIdx = silent && i === bins - 1 ? i + 1 : i;
        const x0 = CONSTANTS.LEFT_GUTTER + runStart * stepX;
        const x1 = CONSTANTS.LEFT_GUTTER + endIdx * stepX;
        if (x1 > x0 + 0.5) {
          ctx.fillStyle = "rgba(208, 190, 170, 0.28)";
          ctx.fillRect(x0, y, x1 - x0, height);
        }
        runStart = -1;
      }
    }

    drawAmplitudeVizLane(ctx, envelope.left, CONSTANTS.LEFT_GUTTER, timelineWidth, leftY, laneHeight, {
      mode: vizMode,
      palette: Utils.resolveAudioVizPalette({
        strokeStyle: "rgba(33, 24, 18, 0.65)",
        fillStyle: "rgba(63, 43, 27, 0.36)",
        bandLowStyle: "rgba(74, 165, 142, 0.58)",
        bandMidStyle: "rgba(219, 174, 90, 0.56)",
        bandHighStyle: "rgba(198, 104, 147, 0.54)",
        centerLineStyle: "rgba(120, 100, 82, 0.14)",
      }),
    });
    drawAmplitudeVizLane(ctx, envelope.right, CONSTANTS.LEFT_GUTTER, timelineWidth, rightY, laneHeight, {
      mode: vizMode,
      palette: Utils.resolveAudioVizPalette({
        strokeStyle: "rgba(74, 48, 33, 0.6)",
        fillStyle: "rgba(63, 43, 27, 0.36)",
        bandLowStyle: "rgba(74, 165, 142, 0.58)",
        bandMidStyle: "rgba(219, 174, 90, 0.56)",
        bandHighStyle: "rgba(198, 104, 147, 0.54)",
        centerLineStyle: "rgba(120, 100, 82, 0.14)",
      }),
    });

    ctx.fillStyle = "rgba(77, 61, 47, 0.72)";
    ctx.font = "8px monospace";
    ctx.fillText("L", CONSTANTS.LEFT_GUTTER + 3, leftY + 8);
    ctx.fillText("R", CONSTANTS.LEFT_GUTTER + 3, rightY + 8);
    return true;
  }

  function drawSectionCompositionPreview(state, ctx, y, height) {
    // Video timeline gaps should render as explicit black areas.
    const width = Number(state?.canvas?.clientWidth || 0);
    if (width <= CONSTANTS.LEFT_GUTTER + 2) return false;
    const clips = collectSectionVisualClips(state);
    if (!clips.length) return false;
    const toX = (timeSec) => CONSTANTS.LEFT_GUTTER + (timeSec - state.t0Sec) * state.pxPerSec;
    const timelineWidth = width - CONSTANTS.LEFT_GUTTER;
    const visibleStartSec = Math.max(0, Number(state?.t0Sec || 0));
    const visibleEndSec = visibleStartSec + timelineWidth / Math.max(1e-6, Number(state?.pxPerSec || 1));
    const splitHeight = Math.max(6, Math.floor((Math.max(2, height) - 1) * 0.5));
    const previewBandHeight = splitHeight;
    const previewY = y;
    const previewH = previewBandHeight;
    const audioY = y + previewBandHeight + 1;
    const audioH = Math.max(0, height - previewBandHeight - 1);
    ctx.fillStyle = "rgba(231, 219, 203, 0.98)";
    ctx.fillRect(CONSTANTS.LEFT_GUTTER, y, timelineWidth, height);
    ctx.fillStyle = "rgba(12, 10, 8, 0.96)";
    ctx.fillRect(CONSTANTS.LEFT_GUTTER, previewY, timelineWidth, previewH);
    for (const clip of clips) {
      const x0 = toX(clip.start);
      const x1 = toX(clip.end);
      const left = Utils.clamp(x0, CONSTANTS.LEFT_GUTTER, width);
      const right = Utils.clamp(x1, CONSTANTS.LEFT_GUTTER, width);
      const clipWidth = Math.max(0, right - left);
      if (clipWidth < 1) continue;
      if (clip.kind === "video") {
        drawClipThumbnailCover(state, ctx, clip.src, left, clipWidth, previewY, previewH);
        const previewPlan = resolveVideoPreviewPlan(state, clipWidth);
        const filmstrip = ensureTimelineVideoFilmstrip(state, clip.src, clip.sourceDurationSec, previewPlan);
        const hasFrames = drawClipFilmstripTilesCached(state, ctx, filmstrip?.frames || [], left, clipWidth, previewY, previewH, {
          src: clip.src,
          strategy: previewPlan.strategy,
          frameCount: previewPlan.frameCount,
          targetHeight: previewPlan.targetHeight,
          sourceDurationSec: clip.sourceDurationSec,
          clipDurationSec: clip.duration,
          clipStartOffsetSec: clip.startOffsetSec,
        });
        if (!hasFrames) drawClipThumbnailTiles(state, ctx, clip.src, left, clipWidth, previewY, previewH);
      } else {
        drawClipThumbnailCover(state, ctx, clip.src, left, clipWidth, previewY, previewH);
      }
      ctx.strokeStyle = "rgba(95, 72, 53, 0.45)";
      ctx.strokeRect(left + 0.5, previewY + 0.5, Math.max(1, clipWidth - 1), Math.max(1, previewH - 1));
    }
    if (audioH > 0) drawSectionCompositionAudioOverlay(state, ctx, audioY, audioH, visibleStartSec, visibleEndSec);
    return true;
  }

  function drawSectionWaveform(state, ctx, y, height, visibleStartSec) {
    const width = state.canvas.clientWidth;
    if (width <= CONSTANTS.LEFT_GUTTER + 1) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(CONSTANTS.LEFT_GUTTER, y, width - CONSTANTS.LEFT_GUTTER, height);
    ctx.clip();
    if (drawSectionCompositionPreview(state, ctx, y, height)) {
      ctx.restore();
      return;
    }

    const buffer = state.scrubAudioBuffer;
    const samples = buffer ? buffer.getChannelData(0) : null;
    if (samples && samples.length >= 2) {
      const sampleRate = Math.max(1, Number(buffer.sampleRate || 44100));
      const mode = normalizeSectionVizMode(state.sectionVizMode);
      if (mode === "line" || mode === "dots") {
        const timelineWidth = Math.max(1, width - CONSTANTS.LEFT_GUTTER);
        const bins = Utils.clamp(Math.floor(timelineWidth / 2.5), 24, 540);
        const envelope = buildSectionAudioEnvelopeFromBuffer(state, samples, sampleRate, visibleStartSec, bins);
        drawAmplitudeVizLane(ctx, envelope, CONSTANTS.LEFT_GUTTER, timelineWidth, y, height, {
          mode,
          palette: Utils.resolveAudioVizPalette({
            strokeStyle: "rgba(62, 46, 32, 0.82)",
            fillStyle: "rgba(63, 43, 27, 0.30)",
            bandLowStyle: "rgba(74, 165, 142, 0.58)",
            bandMidStyle: "rgba(219, 174, 90, 0.56)",
            bandHighStyle: "rgba(198, 104, 147, 0.54)",
            centerLineStyle: "rgba(120, 100, 82, 0.16)",
          }),
        });
      } else if (mode === "filled") {
        drawSectionFilled(state, ctx, y, height, visibleStartSec, samples, sampleRate);
      } else if (mode === "peaks") {
        drawSectionPeaks(state, ctx, y, height, visibleStartSec, samples, sampleRate);
      } else {
        drawSectionBands(state, ctx, y, height, visibleStartSec, samples, sampleRate);
      }
    } else {
      drawSectionMidiFallback(state, ctx, y, height, visibleStartSec);
    }
    ctx.restore();
  }

  return {
    normalizeSectionVizMode,
    mapTimelineSecToSignalSourceSec,
    drawAmplitudeVizLane,
    drawSectionWaveform,
    drawSectionCompositionPreview,
  };
}
