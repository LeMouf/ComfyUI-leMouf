# song2daw — Architecture

## High-level overview

`song2daw` is a **feature module** inside `ComfyUI-leMouf`.

- **Source of truth**: `SongGraph` (JSON + graph semantics)
- **Execution**: deterministic, step-based pipelines (leMouf Pipeline)
- **Front-ends**:
  - ComfyUI workflows (node-based pipeline control & artifact inspection)
  - DAW-like UI (read-only v1, later editing)

```
Input Audio/Stems
      |
      v
  Pipeline Steps (deterministic + cached)
      |
      v
   SongGraph (truth)
      |
      +--> Exports: stems (wav), MIDI, Reaper .rpp
      |
      +--> UI Views (timeline/tracks/sections)
```

## Responsibilities

### Python (core / ML / heavy compute)
- audio ingest, resampling, normalization
- feature extraction (tempo/beat grid/segmentation)
- source separation + alignment
- event extraction (onsets/notes)
- FX proxy estimation
- export projection (Reaper .rpp, stems, MIDI)
- cache keys and artifact persistence

### JS/TS (UI)
- visualize SongGraph as timeline / tracks / events
- show confidence, diffs between pipeline runs
- *v1: read-only*

## Determinism & caching

Every pipeline step produces:
- primary outputs
- intermediate artifacts (optional)
- logs + metadata
- an updated SongGraph fragment

Cache key includes:
- input hashes
- config
- pipeline step version
- model versions
- (optional) environment fingerprints
