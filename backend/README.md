# Backend Architecture

Backend code is feature-scoped, similar to `workflows/`.

## Layout

- `backend/workflows/`
  - workflow catalog discovery/loading
  - workflow profile resolution
- `backend/loop/`
  - loop orchestration domain (planned extraction target)
- `backend/song2daw/`
  - song2daw backend adapters/services (planned extraction target)

## Rules

1. New backend logic should be added under a feature folder in `backend/`.
2. Keep `nodes.py` as runtime integration/composition layer; avoid adding new domain-heavy logic there.
3. Prefer compatibility wrappers in `nodes.py` when extracting logic, so existing UI/tests stay stable.
