# song2daw - Technical Documentation

## Overview

song2daw is a deterministic analysis pipeline that produces a stable SongGraph and DAW-facing artifacts.

Release line: `0.3.2`

## Runtime architecture

```
Audio input
  -> pipeline steps
  -> SongGraph + artifacts
  -> exports + UI view
```

### Deterministic guarantees

Pipeline behavior is deterministic across:

- input audio
- step configs
- step versions
- model versions

### Cache contract

Cache keys include:

- input hash
- config
- step version
- model versions

## Repository map (current)

```
features/song2daw/
  core/
    graph.py
    pipeline.py
    runner.py
    cache.py
    ui_view.py
    composition_manifest.py
    steps/
  schemas/
    SongGraph.schema.json
    ui_view.schema.json
  tests/
```

UI integration lives in:

- `web/lemouf_studio.js` (entrypoint)
- `web/features/song2daw/*` (song2daw adapters)
- `web/features/studio_engine/*` (shared studio engine)

Backend feature modules:

- `backend/workflows/*` (workflow catalog + profile resolution)

## Workflow profile model

The panel uses `LeMoufWorkflowProfile`:

- `profile_id`
- `profile_version`
- `ui_contract_version`
- `workflow_kind` (`master` or `branch`)

Master workflows are listed in Home by default.

## Workflow repository convention

Workflow JSON files are feature-scoped:

- `workflows/song2daw/*.json`
- `workflows/loop/*.json`
- `workflows/composition/*.json`

Root-level JSON files directly under `workflows/` are not supported.

## SongGraph shape (simplified)

```json
{
  "schema_version": "1.0.0",
  "pipeline_version": "0.1.0",
  "node_versions": {
    "Ingest": "0.1.0",
    "TempoAnalysis": "0.1.0"
  }
}
```

## Studio UI modes

0.3.2 provides 3 analysis views for song2daw runs:

1. Arrange timeline
2. Tracks summary
3. Spectrum 3D

In addition, `0.3.2` introduces a composition-oriented studio workflow family (`profile_id=tool`) through:

- `workflows/composition/composition_studio_master_0-1-0.json`
- deterministic composition resource manifest normalization in `features/song2daw/core/composition_manifest.py`

## Testing

Primary command:

```bash
python -m pytest -q
```

Guidelines:

- add tests for each behavior change
- keep deterministic outputs
- keep workflow/profile compatibility explicit

## Notes for contributors

- avoid random/non-deterministic runtime behavior
- keep schema and step versions explicit
- keep API responses stable for UI consumers
