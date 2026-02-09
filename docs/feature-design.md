# Feature Design: Workflow Loop Orchestrator

## Goal

Provide a workflow orchestrator for ComfyUI that can run a workflow in cycles, expose per-cycle results, and let users approve, reject, or replay each cycle while staying workflow-agnostic.

## Current MVP (Implemented)

- Nodes: Workflow Loop Orchestrator, Loop Context, Loop Return.
- UI panel: resizable right sidebar with a reserved gutter (no overlap with the viewer).
- Validate & Start: compatibility checks before starting the loop.
- Loop execution: create loop, inject loop_id, sync workflow, step cycle.
- Decisions: approve to advance, reject or replay to retry the same cycle.
- Seed control: Loop Context outputs a deterministic seed derived from cycle and retry.
- Manifest: per-cycle results grouped by cycle with thumbnails and lightbox.
- Export: approved images copied to output/lemouf/{loop_id}/.
- Exit: early exit resets the loop state; complete exit appears at the end.

## User Flow (Current)

1. Build a workflow with Loop Context and Loop Return.
2. Connect LoopContext.seed to KSampler.seed.
3. Send your final image output into Loop Return.
4. In the panel, set Total cycles and click Validate & Start.
5. Use Approve / Reject / Replay to control each cycle.

## Example Workflows

Example workflows live in `workflows/` and can be loaded in ComfyUI.
Suggested naming:
- `loop_basic_image.json`
- `loop_basic_image_sd15.json`
- `loop_basic_image_sdxl.json`

## UI Panel (Current)

- Pre-start: Total cycles + Validate & Start with compatibility status.
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
- Loop Return saves images to output/lemouf_loop/{loop_id}/cycle_xxxx_rxx...
- Export approved copies images to output/lemouf/{loop_id}/ with unique names:
  cycle_0000_r00_i00_<timestamp>_<counter>.png

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

## Known Constraints

- The graph cannot pause mid-execution. Decisions happen between cycles.
- The workflow must include Loop Context and Loop Return to be fully compatible.

## Roadmap (Next)

- Batch or end-of-loop decision modes.
- Multi-loop dashboard with history and metrics.
- Export manifest as JSON alongside approved images.
