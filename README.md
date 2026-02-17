# ComfyUI-leMouf

![License](https://img.shields.io/github/license/LeMouf/ComfyUI-leMouf)
![Latest Release](https://img.shields.io/github/v/release/LeMouf/ComfyUI-leMouf?include_prereleases)

Custom nodes for ComfyUI by **leMouf**.

This repository is the home of a growing collection of nodes focused on sharing
tools, techniques, and practical building blocks for creators.

## Status

Current version: `0.3.1`

## Versioning Workflow

Versioning follows a Commitizen-like policy with 3 levels:

- `major` = breaking release
- `medium` = feature release
- `minor` = commit-level iteration

Rules:

- `minor` is bumped automatically on every commit.
- `medium` and `major` are bumped only on explicit request.
- Feature versions are tracked separately in `feature_versions.json`.
- Touched features are auto-bumped (`minor` by default) on each commit.

Setup once:

```bash
git config core.hooksPath .githooks
```

Request next commit bump level:

```bash
python features/tools/versioning.py request --level medium
# or
python features/tools/versioning.py request --level major
```

Request next feature bump level:

```bash
python features/tools/versioning.py feature-request --feature song2daw --level medium
# or for all features:
python features/tools/versioning.py feature-request-all --level major
```

Manual commands:

```bash
python features/tools/versioning.py show
python features/tools/versioning.py bump --level minor
python features/tools/versioning.py bump --level medium
python features/tools/versioning.py bump --level major
python features/tools/versioning.py feature-show
python features/tools/versioning.py feature-auto
python features/tools/versioning.py feature-changelog --stage
```

Commit messages are validated with Conventional Commits:

```text
type(scope): subject
```

Examples:

- `feat(song2daw): add deterministic ui hydration`
- `fix(composition): keep linked audio/video trim in sync`

## Friendly WIP Disclaimer

This project is a personal playground and an active experiment.

- Things can change fast (UI, workflows, nodes, APIs).
- Breaking changes can happen between updates.
- Please treat it as beta/testing material, not a stable production dependency.

If you use it, use it with a builder mindset: try, test, iterate, have fun.

### 0.3.1 highlights

- Loop lightbox cycle jump via inline cycle selector.
- Loop lightbox closes automatically when current cycle gets an approved result.
- Pipeline runtime state now persists by `loop_id` and is restored after reload (`Ctrl+F5`), including Home pipeline step details.
- Generic loop composition access is available from pipeline composition step navigation.

### 0.3.0 highlights

- Workflow profile system (`LeMoufWorkflowProfile`) with deterministic UI routing.
- Master/branch workflow discovery and filtering in `workflows/`.
- Unified Home action: `Run pipeline` adapts to workflow profile/context.
- Song2DAW Studio UI in bottom dock:
  - Arrange view (timeline, sections, per-track clips, mute/isolate)
  - Tracks view
  - Spectrum 3D view
- Deterministic scrub/playback behavior with audio-first and MIDI fallback.
- Song2DAW run browser + step views + source preview + `run_dir` open.
- Improved workflow switching/reset behavior and safer list refresh behavior.

## Install (local)

1. Clone into your ComfyUI `custom_nodes` folder:

   ```bash
   git clone https://github.com/leMouf/ComfyUI-leMouf
   ```

2. Restart ComfyUI.

## Core Features

### Loop Orchestrator

- Loop Return / Loop Map / Loop Payload nodes
- Loop Pipeline Step orchestration
- Cycle decisions (approve/reject/replay)
- Manifest inspection + payload preview
- Approved export pipeline

### Song2DAW

- Deterministic song analysis pipeline (Python core)
- JSON SongGraph + artifacts + run metadata
- Workflow-based execution from the leMouf panel
- Studio visualization in ComfyUI bottom dock

### How to try it

1. Add **Loop Return (leMouf)** to the workflow you want to loop.
2. Connect your final output into **Loop Return (leMouf)**.
3. Add **Loop Map (leMouf)** to define how payload values map into node inputs.
4. (Optional) Add **Loop Payload (leMouf)** with a JSON array of per-cycle payloads.
5. Use **Inject loop_id** from the panel (or set the loop_id on the node).
6. In the **leMouf Studio** panel:
   - set **Total cycles**
   - click **Validate & Start**
7. Use **Approve / Reject / Replay** to control each cycle.

Notes:
- Loop Return accepts a single `payload` input and stores outputs in the manifest.
- Image payloads are saved to `output/lemouf_loop/{loop_id}/...` and referenced in the manifest.
- Export approved images from the panel (saved to `output/lemouf/{loop_id}/`).
- Loop Payload accepts a JSON array; the panel uses `payload[cycle_index]`.

Loop Map example (expressive):
```json
{
  "schema": "lemouf.loopmap.v1",
  "mappings": [
    { "from": "prompt", "to": { "node": "@loop.prompt", "input": "text" } },
    { "from": "seed", "to": { "node": "@loop.seed", "input": "seed" }, "fallback": "$auto_seed", "on_retry": "$auto_seed" }
  ]
}
```

## Example Workflows

Sample workflows live in feature folders under `workflows/` and can be loaded in ComfyUI as normal JSON files.
Recommended naming:
- `loop_basic_image.json`
- `loop_basic_image_sd15.json`
- `loop_basic_image_sdxl.json`
- `loop/leMouf_Loop-pipeline_0-1-0.json` (pipeline)
- `loop/leMouf_Loop-payload_0-1-0.json` (WF1 payload generator)

Workflow JSON files are feature-scoped (`workflows/<feature>/*.json`) and should never be placed at `workflows/` root.
The panel can load pipeline workflows directly from `workflows/`.

Pipeline steps can be linked in the graph (flow output → flow input). If no links exist, the panel falls back to node id ordering.

When working in pipeline mode, cycle controls are hidden and the panel shows a pipeline graph with step validation.
The `Run pipeline` action uses the appropriate execution mode by profile.
After exit, the pipeline graph keeps the last run status and durations for each step.
The home view hides pipeline actions until a pipeline is loaded.
Click the pipeline step cards to load their workflow into the UI. The panel switches to the payload preview screen for generate steps and the run screen for execute steps. Use the header back menu to return to the home screen or exit the loop.

## Panel Toggle

You can show/hide the leMouf Studio panel using:
- ComfyUI menu item: **Show/Hide leMouf Studio panel**
- Keyboard shortcut: `Alt+L`

UI entrypoint naming:
- `web/lemouf_studio.js`

## Documentation

- `docs/feature-design.md`
- `docs/song2daw/README.md`
- `docs/song2daw/README.tech.md`
- `docs/song2daw/ARCHITECTURE.md`
- `docs/song2daw/UI_VIEW_SPEC.md`
- `CHANGELOG.md`

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
