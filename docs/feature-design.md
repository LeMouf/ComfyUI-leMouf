# Feature Design: Workflow Loop Orchestrator

Version target: `0.3.2`

## Goal

Provide a workflow orchestrator for ComfyUI that can run a workflow in cycles, expose per-cycle results, and let users approve, reject, or replay each cycle while staying workflow-agnostic.

## Current MVP (Implemented)

- Nodes (classic): Loop Return (required), Loop Map (required), Loop Payload (optional).
- Nodes (pipeline): Loop Pipeline Step (required), Loop Map (required).
- UI panel: resizable right sidebar with a reserved gutter (no overlap with the viewer).
- Validate & Start: compatibility checks before starting the loop.
- Loop execution: create loop, inject loop_id, sync workflow, step cycle.
- Decisions: approve to advance, reject or replay to retry the same cycle.
- Manifest: per-cycle results grouped by cycle with thumbnails and lightbox.
- Payload preview screen for WF1 (auto-detected output types).
- Export: approved images copied to output/lemouf/{loop_id}/.
- Exit: early exit resets the loop state; complete exit appears at the end.

## 0.3.2 Extensions (Implemented)

- Composition Studio master workflow (`profile_id=tool`, `workflow_kind=master`):
  - `workflows/composition/composition_studio_master_0-1-0.json`
  - optional `resources_json` preload support on pipeline step.
- Composition panel UX pass:
  - unified resource actions via icon rail
  - deterministic resource manifest normalization
  - improved timeline drag/drop visibility with stronger ghost clip rendering.
- Robustness pass:
  - loop/composition UI state synchronization hardened across workflow switches and reload scenarios.

## 0.3.1 Extensions (Implemented)

- Lightbox cycle selector to jump directly between cycles in preview detail.
- Lightbox auto-close when a cycle receives a valid approval.
- Replay/reject pending skeleton synchronization hardened (less flicker, target retry retained).
- Pipeline runtime state persistence + restoration after reload (`Ctrl+F5`) using `loop_id`.
- Home view now restores active pipeline step/run diagnostics when loop execution is still in progress.

## 0.3.0 Extensions (Implemented)

- Workflow profile node: `LeMoufWorkflowProfile` (`profile_id`, `profile_version`, `ui_contract_version`, `workflow_kind`).
- Master workflow discovery:
  - `/lemouf/workflows/list` exposes `master_workflows`.
  - Home panel lists master workflows by default.
- Unified launch action:
  - single `Run pipeline` button
  - behavior adapts by workflow profile and context.
- Home panel UX rationalization:
  - clickable workflow list (type badges)
  - `Use current WF` diagnostic path
  - refresh updates catalog without resetting current context.
- song2daw integration:
  - profile-driven UI routing
  - deterministic reset on workflow switch
  - run list / step view / studio dock tooling.

## User Flow (Current)

1. Build a workflow with Loop Return.
2. Send your final output into Loop Return (any payload).
3. Define mappings in Loop Map (payload → workflow inputs).
4. (Optional) Provide a payload array in Loop Payload.
5. Use Inject loop_id from the panel (or set the loop_id on the node).
6. In the panel, set Total cycles and click Validate & Start.
7. Use Approve / Reject / Replay to control each cycle.

## UI Panel (Current)

- Home screen: pipeline loader and graph view. Cycle controls are hidden during pipeline focus.
- Payload screen: shows WF1 payload output (json/text/images/audio/video).
- Run screen: shows progress + preview + actions + results.
- Header back menu: go home or exit loop.
- Pre-start: Run pipeline button enabled only when pipeline + workflows validate.
- Pipeline graph persists after exit and shows last run status + duration per step.
- Home view hides graph/actions until a pipeline is loaded.
- Pre-start: pipeline workflow loader from `workflows/` feature folders.
- Pre-start: pipeline graph view (steps + validation summary).
- Post-start:
  - Progress bar (exec percent if available, otherwise loop completion).
  - Current image preview (full width) with spinner while loading.
  - Actions: Approve, Reject, Replay.
  - Results list grouped by cycle, with hover quick actions on thumbnails.
  - Advanced controls accordion anchored at the bottom.
- Visual feedback:
  - Spinners during image loading and queued entries.
  - Animated inline approve/reject buttons on thumbnails.
  - Status messages for cycle ready and loop complete.

## Decision Behavior

- Approve: advances to the next cycle.
- Reject: retries the same cycle (retry_index++).
- Replay: retries the same cycle (retry_index++).
- Auto-run only triggers when the entry status is returned.

## Data and Storage

- Manifest entry: cycle_index, retry_index, status, decision, timestamps, outputs.
- Loop Return accepts a single payload input and deduces outputs.
- Image payloads are saved to output/lemouf_loop/{loop_id}/cycle_xxxx_rxx...
- Export approved copies images to output/lemouf/{loop_id}/ with unique names:
  cycle_0000_r00_i00_<timestamp>_<counter>.png
- Loop Map uses `cycle_source` (optional; default `$payload[cycle_index]`).

### Loop Map (expressive)

Example:

```json
{
  "schema": "lemouf.loopmap.v1",
  "mappings": [
    { "from": "prompt", "to": { "node": "@loop.prompt", "input": "text" } },
    { "from": "seed", "to": { "node": "@loop.seed", "input": "seed" }, "fallback": "$auto_seed", "on_retry": "$auto_seed" }
  ]
}
```

Node selectors:
- `@loop.seed` → matches node titles containing `@loop.seed`
- `id:12` → exact node id
- `type:KSampler` → class_type match
- `re:/CLIP/i` → regex match on titles (fallback to class_type)

### Pipeline Ordering

Pipeline steps are ordered by links between `Loop Pipeline Step` nodes.
If no links exist, the panel falls back to node id ordering.

## API Endpoints

- GET /lemouf/loop/list
- GET /lemouf/loop/{loop_id}
- POST /lemouf/loop/create
- POST /lemouf/loop/set_workflow
- POST /lemouf/loop/step
- POST /lemouf/loop/decision
- POST /lemouf/loop/overrides
- POST /lemouf/loop/config
- POST /lemouf/loop/reset
- POST /lemouf/loop/export_approved
- GET /lemouf/workflows/list
- POST /lemouf/workflows/load

## Known Constraints

- The graph cannot pause mid-execution. Decisions happen between cycles.
- The workflow must include Loop Return with a payload input to be compatible.

## Roadmap (Next)

- Prompt-per-cycle JSON injection (NodeID.Param overrides).
- Multi-loop dashboard with history and metrics.
- Export manifest as JSON alongside approved images.
- Profile registry and adapter contract versioning for additional workflow families.

## Example Workflows

Example workflows live in feature folders under `workflows/` and can be loaded in ComfyUI.
Suggested naming:
- loop_basic_image.json
- loop_basic_image_sd15.json
- loop_basic_image_sdxl.json
- loop/leMouf_Loop-pipeline_0-1-0.json
- loop/leMouf_Loop-payload_0-1-0.json

Workflow JSON files should always be grouped by feature (`workflows/<feature>/*.json`) and not stored at `workflows/` root.
