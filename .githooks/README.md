# Git Hooks

This repository ships a lightweight versioning hook.

## Enable

```bash
git config core.hooksPath .githooks
```

## Behavior

- Default: each commit bumps the **minor slot** (`x.y.z` -> `x.y.(z+1)`).
- Feature versions in `feature_versions.json` are auto-bumped for touched features (`minor` by default).
- Requested bump: create a one-shot request before commit:
  - medium: `python features/tools/versioning.py request --level medium`
  - major: `python features/tools/versioning.py request --level major`
- Feature-level request:
  - `python features/tools/versioning.py feature-request --feature song2daw --level medium`
  - `python features/tools/versioning.py feature-request-all --level major`

The request is consumed on the next commit, then reset.

Generate per-feature history (from Conventional Commit scopes):

- `python features/tools/versioning.py feature-changelog --stage`

## Commit message policy

The `commit-msg` hook enforces a strict Conventional Commits header:

```text
type(scope): subject
```

- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Optional: `!` for breaking changes (`type(scope)!: subject`)
- Subject must not end with `.`.
- Practical exceptions allowed: merge commits, revert commits, and `fixup!/squash!`.
