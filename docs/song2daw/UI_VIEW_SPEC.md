# song2daw — Studio View (ComfyUI Bottom Panel) — Spec

Release line: `0.3.1`

## Goal
A DAW-like Studio View inside the ComfyUI bottom panel to inspect `song2daw` results:
- Tracks / layers
- Tempo + beat grid + downbeats
- Sections/markers (intro/verse/chorus…)
- Audio clips (waveform LOD)
- MIDI clips (notes visible)
- Scrub/play preview consistent with active mute state

No timeline editing in 0.3.1. The view is focused on validation/debug and deterministic inspection.

## Layout
Bottom panel tab: **song2daw**

1) Header / Toolbar
- Project name, graph/pipeline versions
- Zoom controls: Zoom In/Out, Fit
- Toggles: Tempo lane, Beat grid, Sections

2) Ruler
- Bars/beats marks (density changes with zoom)

3) Lanes (top of canvas)
- Tempo lane (steps or line)
- Downbeats / beat grid (vertical lines)
- Sections lane (colored blocks + labels)

4) Track list (left)
- Track name + kind icon (audio/midi/abstract)
- Mute/Solo UI (read-only)
- Confidence display (optional)

5) Arrangement canvas (center)
- Vertical tracks, horizontal timeline
- Clips aligned to ruler/grid
- Audio clips: rectangle + waveform (LOD)
- MIDI clips: rectangle + mini piano roll notes

6) Inspector (right)
- Selected entity (track/clip/note/section)
- IDs, time span (sec + bar/beat)
- Linked artifacts (wav/midi/json)
- FX suggestions (if present)

## Interaction
- Scroll: wheel = vertical, shift+wheel = horizontal
- Zoom: Ctrl/Cmd + wheel = horizontal zoom around cursor
- Click: select clip/note/section; empty area clears selection
- Hover: tooltip for notes/markers

## Performance requirements
- Virtualize track rendering (only draw visible tracks)
- Waveform LOD:
  - far zoom: envelope min/max per chunk
  - near zoom: more detailed peaks
- Avoid reflow-heavy DOM; use **Canvas2D** for main drawing.

## Inputs
The UI reads a **UI View Model** JSON (preferred) produced by pipeline export.
A fixture is provided in:
- `examples/song2daw/ui/sample_ui_view.json`

## Out of scope (0.3.1)
- Editing clips/notes
- Automation lanes
- Mixer/routing

## Scrub Audio and Mute Semantics (current)
- Scrub must reflect the current audible composition, not a hidden fallback mix.
- If an audio source is available and not muted, scrub uses decoded audio buffer grains.
- If `mix` is muted, `mix` is not used for scrub source selection.
- If no audible audio buffer exists but MIDI tracks are unmuted, scrub remains audible via deterministic MIDI scrub grains.
- MIDI scrub timbre follows preset inference (`drums`, `bass`, `lead`, `pad`, `keys`) with lightweight synthesis:
  - `drums`: kick-like pitch drop or filtered noise for snare/hat-like events
  - `bass`: saw-like tone with low-pass character
  - `lead`: square-like tone with brighter low-pass
  - `pad/keys`: softer triangle-like tone with gentler filtering
- Mute state is the source of truth for playback clock, scrub audibility, and section signal fallback behavior.

## Preset DSP Abstraction (design exercise)
To generalize filters/processing for any preset, use a two-layer contract:

1) **Preset intent layer (semantic)**
- A preset declares musical intent, not low-level nodes:
  - `tone_family`: `drum | bass | lead | pad | keys | custom`
  - `brightness`: `0..1`
  - `body`: `0..1`
  - `noise_amount`: `0..1`
  - `attack_ms`, `release_ms`
  - `modulation_depth`: `0..1`

2) **Renderer layer (DSP mapping)**
- A deterministic mapper converts intent to concrete WebAudio graph:
  - oscillator choices
  - filter stack (low-pass/band-pass/high-pass/notch)
  - envelope shaping
  - optional noise branch
- The mapper is pure: same preset intent + event context => same node graph parameters.

Suggested interface:

```ts
type PresetIntent = {
  id: string;
  version: string;
  tone_family: "drum" | "bass" | "lead" | "pad" | "keys" | "custom";
  brightness: number;      // 0..1
  body: number;            // 0..1
  noise_amount: number;    // 0..1
  attack_ms: number;
  release_ms: number;
  modulation_depth: number; // 0..1
};

type EventContext = {
  pitch: number;
  velocity: number; // 0..127
  label: string;
  grain_sec: number;
};

type DspPlan = {
  oscillators: Array<{ shape: string; detune_cents: number; gain: number }>;
  filters: Array<{ type: string; freq_hz: number; q: number }>;
  noise: { enabled: boolean; filter_type: string; filter_hz: number; gain: number };
  envelope: { attack_sec: number; release_sec: number; peak_gain: number };
};

function planDsp(intent: PresetIntent, ctx: EventContext): DspPlan;
```

Why this scales:
- New presets are data-first (`PresetIntent`) instead of hard-coded branches.
- `planDsp` centralizes deterministic conversion and makes testing easy.
- Playback and scrub can share the same `DspPlan` pipeline with different duration/quality policies.
