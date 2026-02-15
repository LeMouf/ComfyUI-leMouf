# song2daw — Architecture

## High-level overview

`song2daw` is a feature module in `ComfyUI-leMouf`.

- Source of truth: `SongGraph` (schema `1.0.0`)
- Execution model: deterministic step pipeline (`0.1.0` step family)
- Runtime outputs: graph + artifacts + UI view + exported files
- UI integration: workflow-profile-routed leMouf panel

```
Input Audio / Stems
        |
        v
Deterministic Pipeline Steps
        |
        v
SongGraph + Artifacts
        |
        +--> Exports (WAV stems, MIDI, Reaper RPP)
        +--> UI view payload
        +--> Run state (summary, status, run_dir)
```

## Responsibilities

### Python core
- audio ingest and normalization
- tempo and beat analysis
- section/structure segmentation
- source separation
- event extraction
- effect estimation
- projection/export steps
- deterministic cache and run persistence

### Web UI
- workflow selection and diagnostics
- profile-driven UI routing (`generic_loop`, `song2daw`, ...)
- run list + step inspection
- Song2DAW Studio views:
  - Arrange
  - Tracks
  - Spectrum 3D

## Determinism and caching

Each step is deterministic and keyed from:
- input hashes
- config payload
- step version
- model versions

Each step contributes:
- output artifacts
- metadata and logs
- SongGraph updates

## Workflow profile routing (0.3.0)

`LeMoufWorkflowProfile` defines UI behavior:
- `profile_id`
- `profile_version`
- `ui_contract_version`
- `workflow_kind` (`master` / `branch`)

Master workflows are listed by default in the Home panel.
Branch workflows are used as internal/support workflows.

## Runtime API surfaces (UI)

Main routes used by the panel:
- `GET /lemouf/workflows/list`
- `POST /lemouf/workflows/load`
- `GET /lemouf/song2daw/runs`
- `GET /lemouf/song2daw/runs/{run_id}`
- `GET /lemouf/song2daw/runs/{run_id}/ui_view`
- `GET /lemouf/song2daw/runs/{run_id}/audio`
