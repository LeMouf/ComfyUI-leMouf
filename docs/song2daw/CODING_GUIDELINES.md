# Coding Guidelines (song2daw)

## Non-negotiables
- **Deterministic**: no randomness in core steps.
- **Pure steps**: pipeline steps must behave like pure functions over (inputs, config, versions).
- **Version everything**: schema changes, step changes, model changes.
- **Artifacts are first-class**: store outputs, metadata, logs, and cache keys.

## Python
- Type hints required for public APIs.
- Prefer small modules with narrow responsibility.
- Avoid global state; pass explicit configs.
- Provide `__all__` for public surfaces where appropriate.

## JSON contracts
- SongGraph must validate against the JSON Schema (`song2daw/schemas/SongGraph.schema.json`).
- Never delete fields without a migration path.
- Add new fields as optional first; then tighten when stable.

## Tests
- Every new pipeline step gets:
  - a unit test for deterministic output
  - a schema validation test (if it touches SongGraph)
  - a small integration test that runs on a tiny audio fixture (seconds-long)

## Logging
- Log structured metadata as JSON alongside human-readable logs.
- Include durations and model versions in step outputs.

## Security / safety
- Do not include any DRM bypass logic.
- Do not embed copyrighted audio assets in tests/examples.
