# song2daw - Technical Documentation

## Overview

song2daw is a deterministic analysis pipeline that produces a stable SongGraph and DAW-facing artifacts.

Release line: `0.3.0`

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
song2daw/
  core/
    graph.py
    pipeline.py
    runner.py
    cache.py
    ui_view.py
    steps/
  schemas/
    SongGraph.schema.json
    ui_view.schema.json
  tests/
```

UI integration lives in:

- `web/lemouf_loop.js`
- `web/ui/song2daw/*`

## Workflow profile model

The panel uses `LeMoufWorkflowProfile`:

- `profile_id`
- `profile_version`
- `ui_contract_version`
- `workflow_kind` (`master` or `branch`)

Master workflows are listed in Home by default.

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

0.3.0 provides 3 read-only analysis views:

1. Arrange timeline
2. Tracks summary
3. Spectrum 3D

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
