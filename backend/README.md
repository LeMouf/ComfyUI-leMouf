# Backend Architecture

Backend code is feature-scoped, similar to `workflows/`.

## Layout

- `backend/workflows/`
  - workflow catalog discovery/loading
  - workflow profile resolution
- `backend/loop/`
  - loop orchestration domain
  - local runtime UI persistence (`runtime_state.py`, repo-local JSON store)
  - local persisted media cache for manual composition resources (`media_cache.py`)
- `backend/composition/`
  - composition-specific backend persistence/services
  - local render manifest store (`export_manifest.py`)
  - export profile catalog/normalization (`export_profiles.py`)
  - render execution path and ffmpeg planning/execution (`render_execute.py`)
- `backend/song2daw/`
  - song2daw backend adapters/services (planned extraction target)

## Rules

1. New backend logic should be added under a feature folder in `backend/`.
2. Keep `nodes.py` as runtime integration/composition layer; avoid adding new domain-heavy logic there.
3. Prefer compatibility wrappers in `nodes.py` when extracting logic, so existing UI/tests stay stable.
