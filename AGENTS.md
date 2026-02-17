# AGENTS.md (Codex Guidance)

Codex: when implementing changes, please follow this order:
1. Read `docs/song2daw/ARCHITECTURE.md`
2. Keep core pipeline steps deterministic
3. Update schema versions when changing `SongGraph`
4. Keep the `README.md` "Friendly WIP Disclaimer" section in place unless the user explicitly asks to remove or change it.
5. Keep workflow JSON files feature-scoped under `workflows/<feature>/` (never at `workflows/` root).
6. Keep examples/fixtures feature-scoped under `examples/<feature>/` (never at `examples/` root except `examples/README.md`).
7. Keep feature domain code scoped under `features/<feature>/` (and feature tooling under `features/tools/`), while keeping backend orchestration/API under `backend/<feature>/` and `nodes.py` as integration/composition layer.

## Tests to run
- Python unit tests:
  - `pytest -q`

## Lint (optional, if configured later)
- `python -m ruff check .`
- `python -m ruff format .`
