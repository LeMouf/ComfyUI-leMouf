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

### Backend layering
- `nodes.py` remains the ComfyUI integration entrypoint.
- Feature/domain logic is progressively extracted to `backend/<feature>/` modules.
- Current extraction:
  - `backend/workflows/catalog.py` (workflow catalog discovery/loading)
  - `backend/workflows/profiles.py` (workflow profile resolution)
- Compatibility wrappers in `nodes.py` preserve existing API/tests while reducing coupling.

### Web UI
- workflow selection and diagnostics
- profile-driven UI routing (`generic_loop`, `song2daw`, ...)
- run list + step inspection
- Song2DAW Studio views:
  - Arrange
  - Tracks
  - Spectrum 3D

## Web module layering (UI refactor)

The web client is now structured by concerns to avoid feature coupling:

- `web/shared/ui/*`
  - small UI primitives reused by all panels/features (`dom`, `icons`, `styles`)
- `web/app/panel/*`
  - panel screens and orchestration views (home/run/graph/payload)
- `web/features/song2daw/*`
  - song2daw-specific studio/timeline/spectrum logic
- `web/features/composition/*`
  - composition-studio logic and state store
- `web/features/studio_engine/*`
  - reusable studio engine primitives (timeline/interactions) consumed by adapters

Legacy wrapper modules in `web/ui/*` are deprecated and should not be used by new code.

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

## Workflow profile routing (0.3.2)

`LeMoufWorkflowProfile` defines UI behavior:
- `profile_id`
- `profile_version`
- `ui_contract_version`
- `workflow_kind` (`master` / `branch`)

Master workflows are listed by default in the Home panel.
Branch workflows are used as internal/support workflows.
Tooling workflows (for example composition studio) are routed via dedicated profile adapters.
Workflow JSON files are feature-scoped under `workflows/<feature>/` and not supported at `workflows/` root.

## Runtime API surfaces (UI)

Main routes used by the panel:
- `GET /lemouf/workflows/list`
- `POST /lemouf/workflows/load`
- `GET /lemouf/song2daw/runs`
- `GET /lemouf/song2daw/runs/{run_id}`
- `GET /lemouf/song2daw/runs/{run_id}/ui_view`
- `GET /lemouf/song2daw/runs/{run_id}/audio`
