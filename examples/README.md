# Examples Directory Spec

Examples are feature-scoped.

## Rule

- Do not place example assets directly at `examples/` root.
- Place assets and fixtures in `examples/<feature>/...`
  - `examples/song2daw/...`
  - `examples/<future_feature>/...`

## Why

- keeps ownership clear
- avoids cross-feature coupling in fixtures
- keeps deterministic test fixtures isolated by use case
