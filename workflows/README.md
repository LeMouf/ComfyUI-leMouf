# Workflows Directory Spec

All workflow JSON files must be feature-scoped.

## Rule

- Never place `.json` workflow files directly at `workflows/` root.
- Always place workflow files under a feature folder:
  - `workflows/song2daw/*.json`
  - `workflows/loop/*.json`
  - `workflows/composition/*.json`

## Why

- keeps discovery and ownership clear by feature
- avoids ambiguous root-level workflow naming
- scales better when new workflow families are added

## Enforcement

- Workflow listing only returns feature-scoped JSON paths.
- Workflow loading rejects root-level JSON names.
