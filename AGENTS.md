# AGENTS.md (Codex Guidance)

Codex: when implementing changes, please follow this order:
1. Read `docs/song2daw/ARCHITECTURE.md`
2. Keep core pipeline steps deterministic
3. Update schema versions when changing `SongGraph`

## Tests to run
- Python unit tests:
  - `pytest -q`

## Lint (optional, if configured later)
- `python -m ruff check .`
- `python -m ruff format .`
