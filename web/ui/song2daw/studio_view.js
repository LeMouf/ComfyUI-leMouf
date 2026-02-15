import { el } from "../dom.js";
import { clearSong2DawTimeline, renderSong2DawTimeline } from "./studio_timeline.js";
import { clearSong2DawSpectrum3D, renderSong2DawSpectrum3D } from "./studio_spectrum3d.js";

function setTabState({ mode, timelineBtn, tracksBtn, spectrumBtn }) {
  const normalizedMode = mode === "tracks" ? "tracks" : (mode === "spectrum3d" ? "spectrum3d" : "timeline");
  timelineBtn.classList.toggle("is-active", normalizedMode === "timeline");
  tracksBtn.classList.toggle("is-active", normalizedMode === "tracks");
  if (spectrumBtn) spectrumBtn.classList.toggle("is-active", normalizedMode === "spectrum3d");
}

function compactJson(value, maxChars = 240) {
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}...`;
  } catch {
    return String(value ?? "");
  }
}

function compactText(value, maxLength = 72) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizePath(value) {
  const text = String(value || "").trim();
  return text.replaceAll("\\", "/");
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTrackPartition(kind, rawPartition) {
  const normalized = String(rawPartition || "").trim().toLowerCase();
  if (normalized === "obtained_midi" || normalized === "step_tracks") return normalized;
  return String(kind || "").toLowerCase() === "midi" ? "obtained_midi" : "step_tracks";
}

function trackPartitionRank(partition) {
  return partition === "obtained_midi" ? 1 : 0;
}

function sortStudioTracks(a, b) {
  const partitionA = normalizeTrackPartition(a?.kind, a?.partition);
  const partitionB = normalizeTrackPartition(b?.kind, b?.partition);
  if (partitionA !== partitionB) return trackPartitionRank(partitionA) - trackPartitionRank(partitionB);
  const stepA = toFiniteNumber(a?.originStepIndex, Number.POSITIVE_INFINITY);
  const stepB = toFiniteNumber(b?.originStepIndex, Number.POSITIVE_INFINITY);
  if (stepA !== stepB) return stepA - stepB;
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

function pickNumberField(obj, fields, fallback = null) {
  if (!obj || typeof obj !== "object") return fallback;
  for (const field of fields) {
    if (!(field in obj)) continue;
    const numeric = toFiniteNumber(obj[field], null);
    if (numeric !== null) return numeric;
  }
  return fallback;
}

function pickStringField(obj, fields, fallback = "") {
  if (!obj || typeof obj !== "object") return fallback;
  for (const field of fields) {
    if (!(field in obj)) continue;
    const value = String(obj[field] ?? "").trim();
    if (value) return value;
  }
  return fallback;
}

function normalizeSong2DawSections(rawSections) {
  if (!Array.isArray(rawSections)) return [];
  const sections = [];
  for (let i = 0; i < rawSections.length; i += 1) {
    const section = rawSections[i];
    if (!section || typeof section !== "object") continue;
    const start = pickNumberField(section, ["t0_sec", "start_sec", "start", "from", "onset_sec"], null);
    if (start === null) continue;
    const end = pickNumberField(section, ["t1_sec", "end_sec", "end", "to", "offset_sec"], null);
    const name = pickStringField(section, ["name", "label", "section", "type"], `section_${i + 1}`);
    sections.push({ name, start: Math.max(0, start), end: end !== null ? end : null });
  }
  sections.sort((a, b) => a.start - b.start);
  for (let i = 0; i < sections.length; i += 1) {
    const current = sections[i];
    const next = sections[i + 1];
    if (current.end === null || current.end < current.start) {
      if (next && next.start > current.start) current.end = next.start;
      else current.end = current.start + 4;
    }
  }
  return sections;
}

function normalizeSong2DawEventsByTrack(rawEvents) {
  const byTrack = {};
  const values = Array.isArray(rawEvents)
    ? rawEvents
    : Array.isArray(rawEvents?.items)
      ? rawEvents.items
      : [];
  if (!values.length) return byTrack;
  for (const rawEvent of values) {
    if (!rawEvent || typeof rawEvent !== "object") continue;
    const track = pickStringField(
      rawEvent,
      ["track", "stem", "source_id", "source", "instrument"],
      "events"
    );
    const time = pickNumberField(rawEvent, ["t0_sec", "time_sec", "time", "start_sec", "start"], null);
    if (time === null) continue;
    const duration = pickNumberField(rawEvent, ["duration_sec", "duration", "len_sec", "length"], null);
    const end = pickNumberField(rawEvent, ["t1_sec"], null);
    const label = pickStringField(rawEvent, ["kind", "type", "name", "event", "label"], "event");
    const pitch = pickNumberField(rawEvent, ["midi_note", "pitch"], null);
    if (!byTrack[track]) byTrack[track] = [];
    byTrack[track].push({
      time: Math.max(0, time),
      duration: Math.max(0.01, end !== null ? end - time : duration ?? 0.01),
      label,
      pitch,
    });
  }
  for (const values of Object.values(byTrack)) {
    values.sort((a, b) => a.time - b.time);
  }
  return byTrack;
}

function buildSong2DawStudioDataFromUiView(uiView) {
  const sections = normalizeSong2DawSections(Array.isArray(uiView?.sections) ? uiView.sections : []);
  const tempoBpm = pickNumberField(uiView?.tempo?.[0] || {}, ["bpm"], null);
  const durationFromSong = pickNumberField(uiView?.song || {}, ["duration_sec"], null);
  const tracksRaw = Array.isArray(uiView?.tracks) ? uiView.tracks : [];
  const eventsByTrack = {};
  const tracks = [];

  for (const track of tracksRaw) {
    if (!track || typeof track !== "object") continue;
    const name = pickStringField(track, ["name"], pickStringField(track, ["id"], "track"));
    const kind = pickStringField(track, ["kind"], "audio");
    const originStepIndex = pickNumberField(track, ["origin_step_index"], null);
    const trackPartition = normalizeTrackPartition(
      kind,
      pickStringField(track, ["track_partition", "track_group", "partition"], "")
    );
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    const firstClip = clips[0] && typeof clips[0] === "object" ? clips[0] : {};
    const source = normalizePath(firstClip?.asset || firstClip?.path || "");
    const sourceId = pickStringField(track, ["source_id"], pickStringField(firstClip, ["source_id"], ""));
    const audioAssetKey = sourceId ? `source:${sourceId}` : (String(name).toLowerCase() === "mix" ? "mix" : "");
    const values = [];
    let clipStartHintSec = Number.POSITIVE_INFINITY;
    let clipEndHintSec = Number.NEGATIVE_INFINITY;

    for (const clip of clips) {
      if (!clip || typeof clip !== "object") continue;
      const t0 = pickNumberField(clip, ["t0_sec"], null);
      const t1 = pickNumberField(clip, ["t1_sec"], null);
      const clipStart = t0 !== null ? Math.max(0, t0) : 0;
      const clipDuration = t0 !== null && t1 !== null && t1 >= t0 ? t1 - t0 : null;
      if (t0 !== null) clipStartHintSec = Math.min(clipStartHintSec, clipStart);
      if (t1 !== null) clipEndHintSec = Math.max(clipEndHintSec, Math.max(clipStart, t1));
      if (t0 !== null) {
        values.push({
          time: clipStart,
          duration: Math.max(0.01, (t1 ?? t0 + 0.01) - t0),
          label: pickStringField(clip, ["kind", "id"], kind),
        });
      }
      const notes = Array.isArray(clip?.notes) ? clip.notes : [];
      for (const note of notes) {
        if (!note || typeof note !== "object") continue;
        const nStartRaw = pickNumberField(note, ["t0_sec", "start_sec", "start"], null);
        if (nStartRaw === null) continue;
        let nStart = nStartRaw;
        // In many UI views note times are clip-local; convert to absolute when it fits clip span.
        if (clipDuration !== null && clipDuration > 0 && clipStart > 0) {
          const epsilon = 0.02;
          if (nStartRaw >= -epsilon && nStartRaw <= clipDuration + epsilon) {
            nStart = clipStart + nStartRaw;
          }
        }
        const nDur = Math.max(0.01, pickNumberField(note, ["dur_sec", "duration_sec", "duration"], 0.01));
        values.push({
          time: Math.max(0, nStart),
          duration: nDur,
          label: pickStringField(note, ["label"], "note"),
          pitch: pickNumberField(note, ["pitch"], null),
        });
      }
    }

    if (values.length) {
      values.sort((a, b) => a.time - b.time);
      eventsByTrack[name] = values;
    }
    tracks.push({
      name,
      kind,
      partition: trackPartition,
      source,
      audioAssetKey,
      originStepIndex,
      clipStartHintSec: Number.isFinite(clipStartHintSec) ? clipStartHintSec : null,
      clipEndHintSec: Number.isFinite(clipEndHintSec) ? clipEndHintSec : null,
      events: values.length,
    });
  }

  let durationSec = Math.max(1, durationFromSong ?? 0);
  for (const section of sections) durationSec = Math.max(durationSec, section.end || section.start || 0);
  for (const values of Object.values(eventsByTrack)) {
    for (const event of values) durationSec = Math.max(durationSec, event.time + (event.duration || 0));
  }

  tracks.sort(sortStudioTracks);
  return { tempoBpm, durationSec, sections, eventsByTrack, tracks };
}

function buildSong2DawStudioData(runData) {
  const uiView = runData?.ui_view && typeof runData.ui_view === "object" ? runData.ui_view : null;
  if (uiView) return buildSong2DawStudioDataFromUiView(uiView);

  const result = runData?.result && typeof runData.result === "object" ? runData.result : {};
  const artifacts = result?.artifacts && typeof result.artifacts === "object" ? result.artifacts : {};
  const tempo = artifacts?.tempo && typeof artifacts.tempo === "object" ? artifacts.tempo : {};
  const sections = normalizeSong2DawSections(artifacts.sections);
  const eventsByTrack = normalizeSong2DawEventsByTrack(artifacts.events);
  if (
    Object.keys(eventsByTrack).length === 0 &&
    artifacts.events_by_track &&
    typeof artifacts.events_by_track === "object"
  ) {
    for (const [trackName, values] of Object.entries(artifacts.events_by_track)) {
      const parsed = normalizeSong2DawEventsByTrack(Array.isArray(values) ? values : []);
      const trackEvents = parsed.events || parsed[trackName] || [];
      if (trackEvents.length) eventsByTrack[trackName] = trackEvents;
    }
  }
  const tempoBpm = pickNumberField(tempo, ["bpm", "estimated_bpm", "tempo_bpm", "value"], null);

  const beatgrid = Array.isArray(artifacts.beatgrid) ? artifacts.beatgrid : [];
  const beatgridEnd = beatgrid.reduce((max, beat) => {
    if (typeof beat === "number") return Math.max(max, beat);
    if (beat && typeof beat === "object") {
      const sec = pickNumberField(beat, ["time_sec", "time", "t", "sec"], null);
      if (sec !== null) return Math.max(max, sec);
    }
    return max;
  }, 0);

  let sectionsEnd = 0;
  for (const section of sections) sectionsEnd = Math.max(sectionsEnd, section.end || section.start || 0);
  let eventsEnd = 0;
  for (const values of Object.values(eventsByTrack)) {
    for (const event of values) {
      eventsEnd = Math.max(eventsEnd, event.time + (event.duration || 0));
    }
  }
  const durationSec = Math.max(1, sectionsEnd, eventsEnd, beatgridEnd);

  const sourceItems = Array.isArray(artifacts?.sources?.items) ? artifacts.sources.items : [];
  const stemItems = Array.isArray(artifacts?.stems_generated?.items) ? artifacts.stems_generated.items : [];
  const sourceNameById = {};
  const sourceRoleById = {};
  const sourceStemById = {};
  for (const sourceItem of sourceItems) {
    if (!sourceItem || typeof sourceItem !== "object") continue;
    const sourceId = pickStringField(sourceItem, ["id"], "");
    if (!sourceId) continue;
    sourceNameById[sourceId] = pickStringField(sourceItem, ["name"], sourceId);
    sourceRoleById[sourceId] = pickStringField(sourceItem, ["role"], sourceId);
  }
  for (const stemItem of stemItems) {
    if (!stemItem || typeof stemItem !== "object") continue;
    const sourceId = pickStringField(stemItem, ["source_id"], "");
    if (!sourceId) continue;
    sourceStemById[sourceId] = pickStringField(stemItem, ["path_hint", "path"], "");
  }

  const trackNames = new Set();
  trackNames.add("mix");
  for (const sourceId of Object.keys(sourceNameById)) trackNames.add(sourceNameById[sourceId]);
  if (artifacts.midi_optional) trackNames.add("midi_optional");
  if (artifacts.fx_suggestions) trackNames.add("fx_suggestions");
  if (artifacts.reaper_rpp) trackNames.add("reaper_rpp");
  for (const trackName of Object.keys(eventsByTrack)) trackNames.add(trackName);

  const tracks = Array.from(trackNames).map((name) => {
    let source = "";
    let audioAssetKey = "";
    if (name === "mix") source = runData?.audio_path || "";
    else {
      const sourceId = Object.keys(sourceNameById).find((id) => sourceNameById[id] === name || sourceRoleById[id] === name);
      if (sourceId) {
        audioAssetKey = `source:${sourceId}`;
        if (sourceStemById[sourceId]) source = String(sourceStemById[sourceId] || "");
      }
    }
    if (name === "mix") audioAssetKey = "mix";
    if (!source && artifacts[name] !== undefined) {
      source = compactText(compactJson(artifacts[name], 180), 72);
    }
    let kind = "audio";
    if (name.includes("midi")) kind = "midi";
    if (name.includes("fx")) kind = "fx";
    if (name.includes("rpp")) kind = "project";
    return {
      name,
      kind,
      partition: normalizeTrackPartition(kind, ""),
      source,
      audioAssetKey,
      originStepIndex: null,
      clipStartHintSec: null,
      clipEndHintSec: null,
      events: Array.isArray(eventsByTrack[name]) ? eventsByTrack[name].length : 0,
    };
  });
  tracks.sort(sortStudioTracks);

  return {
    tempoBpm,
    durationSec,
    sections,
    eventsByTrack,
    tracks,
  };
}

export function clearSong2DawStudioView({ mode, body, timelineBtn, tracksBtn, spectrumBtn }) {
  clearSong2DawTimeline(body);
  clearSong2DawSpectrum3D(body);
  body.innerHTML = "";
  body.textContent = "Load a run to preview DAW visual data.";
  setTabState({ mode, timelineBtn, tracksBtn, spectrumBtn });
}

export function renderSong2DawStudioView({
  runData,
  mode,
  dockExpanded = false,
  body,
  timelineBtn,
  tracksBtn,
  spectrumBtn,
  onJumpToStep,
  onOpenRunDir,
  onResolveAudioUrl,
}) {
  setTabState({ mode, timelineBtn, tracksBtn, spectrumBtn });
  clearSong2DawTimeline(body);
  clearSong2DawSpectrum3D(body);
  if (!runData || typeof runData !== "object") {
    clearSong2DawStudioView({ mode, body, timelineBtn, tracksBtn, spectrumBtn });
    return;
  }
  const studioData = buildSong2DawStudioData(runData);
  body.innerHTML = "";

  const meta = el("div", { class: "lemouf-song2daw-studio-meta" });
  const tempo = studioData.tempoBpm !== null ? `${studioData.tempoBpm.toFixed(1)} bpm` : "n/a";
  const tracksCount = studioData.tracks.length;
  const sectionsCount = studioData.sections.length;
  meta.textContent = `tempo ${tempo}  |  duration ${studioData.durationSec.toFixed(1)}s  |  sections ${sectionsCount}  |  tracks ${tracksCount}`;
  body.appendChild(meta);

  if (mode === "tracks") {
    const tracksGrid = el("div", { class: "lemouf-song2daw-tracks-grid" });
    if (!studioData.tracks.length) {
      tracksGrid.appendChild(
        el("div", { class: "lemouf-song2daw-step-empty", text: "No track data found in artifacts." })
      );
    } else {
      for (const track of studioData.tracks) {
        const colorDot = el("span", { class: "lemouf-song2daw-track-color-dot" });
        colorDot.style.background = `hsl(${Math.abs(track.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 360} 58% 58%)`;
        tracksGrid.append(
          el("div", { class: "lemouf-song2daw-track-card" }, [
            el("div", { class: "lemouf-song2daw-track-name" }, [colorDot, document.createTextNode(track.name)]),
            el("div", { class: "lemouf-song2daw-track-meta", text: `type ${track.kind} | events ${track.events}` }),
            el("div", { class: "lemouf-song2daw-track-source", text: normalizePath(track.source) || "(no source path)" }),
          ])
        );
      }
    }
    body.appendChild(tracksGrid);
    return;
  }
  if (mode === "spectrum3d") {
    void renderSong2DawSpectrum3D({
      runData,
      studioData,
      body,
      onResolveAudioUrl,
    });
    return;
  }
  renderSong2DawTimeline({
    runData,
    studioData,
    body,
    layoutMode: dockExpanded ? "full" : "compact",
    onJumpToStep,
    onOpenRunDir,
    onResolveAudioUrl,
  });
}
