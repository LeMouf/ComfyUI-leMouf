# Web Architecture

This folder is split into stable layers:

- `shared/`
  - reusable UI utilities only (no feature state)
- `app/`
  - panel-level composition/orchestration
- `features/`
  - domain-specific modules (`song2daw`, `composition`, ...)
- `features/studio_engine/`
  - shared studio/timeline engine reused by feature adapters

## Rules

1. `shared` must not import from `app` or `features`.
2. `app` may import from `shared` and `features`.
3. `features` may import from `shared`, but not from other features unless explicit bridge module.
4. Keep persistent state in feature-local store modules (for example composition state store) to avoid side effects spread in view files.
5. Reusable studio mechanics should live in `features/studio_engine`; domain features should consume them via adapters.

## Entrypoints

- `web/lemouf_studio.js`
