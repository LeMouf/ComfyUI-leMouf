# song2daw ComfyUI workflows

Release line: `0.3.0`

This folder contains Song2DAW **master workflows** for the leMouf Home panel.

## Available master workflows

- `song2daw_full_run_0-1-0.json`
  - Production-like full pipeline entry point.
  - Profile: `song2daw` / `master`.
- `song2daw_fixture_10s_4inst_0-1-0.json`
  - Deterministic fixture workflow for controlled validation.
  - Uses `examples/song2daw/fixtures/midi/song2daw_10s_4inst.mid`.
  - Profile: `song2daw` / `master`.

## Contract notes

- Workflows intended for Home listing must include `LeMoufWorkflowProfile`.
- Use `workflow_kind = master` for user-facing entry workflows.
- Use `workflow_kind = branch` for helper/internal workflows.

## Naming convention

`song2daw_<purpose>_<pipeline-version>.json`

Example:
- `song2daw_full_run_0-1-0.json`
- `song2daw_fixture_10s_4inst_0-1-0.json`
