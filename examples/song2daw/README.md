# song2daw examples

Release line: `0.3.0`

This folder contains small deterministic fixtures used by Song2DAW tests and workflows.

## Current layout

- `fixtures/midi/`
  - Controlled MIDI fixture sources for predictable run outputs.
- `test_audio/`
  - Tiny WAV/stem fixtures for local smoke/integration checks.
- `ui/`
  - UI model fixtures (panel rendering validation).

## Deterministic fixture workflow

Use:
- `workflows/song2daw/song2daw_fixture_10s_4inst_0-1-0.json`

Input fixture:
- `examples/song2daw/fixtures/midi/song2daw_10s_4inst.mid`

Target behavior:
- 10-second controlled song
- 4 MIDI instruments with distinct patterns
- stable structure + track expectations for UI/pipeline validation
