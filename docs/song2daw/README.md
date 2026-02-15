# song2daw

Deterministic audio-to-DAW analysis pipeline inside ComfyUI-leMouf.

## Release status

- Current release line: `0.3.0`
- SongGraph schema: `1.0.0`
- Pipeline step family: `0.1.0`

## What song2daw does

song2daw ingests an audio source and generates a stable, inspectable project model:

- SongGraph (JSON source of truth)
- pipeline artifacts
- DAW-oriented projections (WAV stems, MIDI, Reaper RPP)
- UI view payload for panel visualization

The system is deterministic by design: same inputs + same configs + same versions => same outputs.

## 0.3.0 user-facing highlights

- Workflow profile routing via `LeMoufWorkflowProfile`
- Master workflow listing in Home panel
- Unified `Run pipeline` action with context-aware behavior
- Song2DAW run browser and step detail view
- Song2DAW Studio bottom dock:
  - Arrange timeline
  - Tracks view
  - Spectrum 3D view
- Deterministic scrub and mute-aware playback behavior

## Core concepts

### SongGraph

Canonical representation of the analyzed song:

- sections and structure
- sources/layers
- extracted events
- timing and tempo
- effect hints

### Pipeline steps

Typical step chain:

1. Ingest
2. TempoAnalysis
3. StructureSegmentation
4. SourceSeparation
5. EventExtraction
6. EffectEstimation
7. ProjectionReaper

Each step is deterministic, cacheable, and independently inspectable.

## Interfaces

### ComfyUI workflows

Used to execute and orchestrate pipelines.

### leMouf panel

Used to:

- select workflow
- run pipeline
- inspect diagnostics
- inspect song2daw runs and step outputs
- open studio visualizations

## Practical output

A successful run can produce:

- `SongGraph.json`
- `artifacts.json`
- `run.json`
- optional `ui_view`
- mix/stem audio assets

## Scope and intent

song2daw is an analysis and reconstruction tool. It is not a DRM bypass or content distribution system.

See also:

- `docs/song2daw/ARCHITECTURE.md`
- `docs/song2daw/README.tech.md`
- `docs/song2daw/API.md`
- `docs/song2daw/UI_VIEW_SPEC.md`
