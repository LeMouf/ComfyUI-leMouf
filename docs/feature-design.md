# Feature Design: Workflow Loop Orchestrator + Composition Studio

Version target: `0.3.3-wip`
Last update: `2026-02-22`

## Goal

Provide a workflow orchestrator for ComfyUI that can run a workflow in cycles, expose per-cycle results, and let users approve, reject, or replay each cycle while staying workflow-agnostic.

## Consolidated Program Status (Single Source of Truth)

This document now tracks two synchronized streams:

- **Stream A (stabilization closure)**: baseline robustness pass on loop + composition internals.
- **Stream B (workspace evolution)**: monitor/workspace/editor UX program for composition tooling.

Current state:

- Stream A: **closed** (phases completed, regression tests green).
- Stream B: **in progress** (rephased below with execution order).

## Cross-doc Status Template

To keep `docs/feature-design.md`, `CHANGELOG.md`, and `FEATURE_CHANGELOG.md`
strictly aligned, status summaries must follow this canonical order:

1. **Release line**
2. **Program status**
3. **Quality gate status**
4. **Delivered in current iteration**
5. **Remaining priorities**

Current canonical snapshot:

- Release line: `0.3.3-wip`
- Program status: Stream A `closed`, Stream B `in progress`
- Quality gate status: **Precommit Gate open**
- Delivered in current iteration:
  - unified insert/drop lane resolution for composition top/bottom dropzones
  - hardened audio event-edge picking for seek/scrub reliability
  - backend export profiles catalog wired (`backend/composition/export_profiles.py` + `GET /lemouf/composition/export_profiles`)
  - backend codec/container execution path wired (`backend/composition/render_execute.py` + `POST /lemouf/composition/export_execute`)
  - backend execution now resolves timeline/layer sources and builds deterministic ffmpeg compositor graph (video overlays + audio mix), with fallback mode when sources are missing
  - execution diagnostics enriched (`skipped_visual_events`, `skipped_audio_events`, notes) for export troubleshooting
  - advanced clip compositing support added (per-clip opacity + explicit z-index layer ordering)
  - composition monitor codec config now hydrates from backend profiles with resilient local fallback
  - documentation/status synchronization pass across planning + changelog docs
- Remaining priorities:
  - execution polish pass (error surfacing + advanced compositing behaviors)
  - render consistency closure (filmstrip edge placeholders + static/drag parity)
  - persistence parity after reload (full composition state recovery)

## Workspace Evolution Program (Aggregated Plan)

Robust 6-phase program (from quick-win UI to full editing workspace):

1. **UI Monitor Cleanup** (quick win, low risk)
2. **Workspace Canvas Foundation**
3. **Technical Overlays / Guides**
4. **Output Format & Export Config Panel**
5. **Layer Transform Controls** (x/y/scale/rotate)
6. **Composition Integration & Reliability**

Execution order agreed for implementation:

1. Phase 1
2. Phase 2 (minimal)
3. Phase 3
4. Phase 5 (MVP transforms)
5. Phase 4
6. Phase 6

### Phase Tracking

- [x] Phase 1 - UI Monitor Cleanup
  - done:
    - monitor action buttons moved to icon-first toolbar primitives
    - monitor action groups finalized (`project`, `preview`, `export`) with separators
    - monitor surface uses available block height more consistently
- [x] Phase 2 - Workspace Canvas Foundation
  - done:
    - composition monitor/timeline coupling improved (playhead/state sync path)
    - monitor frame foundation introduced (output ratio-aware frame host)
    - stronger insert/drop lane resolution between top/bottom dropzones and move paths
    - workspace stage now includes explicit output frame + pasteboard model
    - explicit work-area toggle and stage background modes (neutral/dark/checker)
- [x] Phase 3 - Technical Overlays / Guides
  - done:
    - grid and safe-area overlays wired with monitor toggles
    - center cross and diagonal overlays added
    - per-overlay opacity controls persisted in layout state
- [~] Phase 4 - Output Format & Export Config Panel
  - done/partial:
    - output preset/custom dimensions + fps/audio fields routed in monitor config
    - render manifest export scaffold available
    - backend manifest persistence endpoint wired (`POST /lemouf/composition/export_manifest`)
    - backend export profile catalog wired (`GET /lemouf/composition/export_profiles`)
    - monitor codec selector now hydrates from backend profiles with fallback cache
    - backend execution endpoint wired (`POST /lemouf/composition/export_execute`) with deterministic ffmpeg plan + optional run
    - timeline/custom duration export resolution hardened against stale duration hints
  - remaining:
    - execution polish (detailed diagnostics + optional advanced transitions/effects layer)
- [~] Phase 5 - Layer Transform Controls
  - done/partial:
    - per-clip transform fields persisted (`x/y/scale/rotate`)
    - pointer/wheel interactions on monitor frame wired
    - transform modes wired (`move/scale/rotate`) with keyboard shortcuts (`V/S/R`)
  - remaining:
    - visual gizmo ergonomics pass
    - keybind conflict handling/polish
- [~] Phase 6 - Composition Integration & Reliability
  - done/partial:
    - many DnD/move/snap fixes, linked video+audio coupling hardening
    - scrub source routing and audio-player stabilization improved
    - insert-mode move now reuses timeline-resolved lane when valid (prevents top/bottom dropzone drift)
    - playback clamp now uses max(duration hint, computed timeline content) in seek/sync/tick
    - active audio-event edge pick hardened for heavy seek/scrub scenarios
  - remaining:
    - gap rendering consistency in monitor/timeline composition preview
    - full crash/reload restore parity (layout + resources + studio state)

## Active Bugfix Backlog (Rephased)

Open items grouped to finish Stream B safely:

1. **Linked clip move/drop invariants**
   - [x] no split behavior between video/audio members during move preview and drop
   - [x] dropzones must create correct lane type regardless of top/bottom insertion
2. **Playback/scrub reliability**
   - [x] stable audio when playback starts from non-zero playhead
   - [x] no forced jump/reset to `t=0` during timeline click/scrub
   - [x] soak check with mixed lanes (video+audio + audio-only + images) under heavy seek
3. **Render consistency**
   - [~] filmstrip parity between static state and drag state
   - [ ] no placeholder/brown-frame regressions at segment boundaries
4. **Persistence parity after reload**
   - [~] restore studio visibility/layout mode and loaded manual resources
   - [ ] restore working composition project state (not only run metadata)
5. **Editing UX completion**
   - [~] context menu actions always actionable (no blocked layers)
   - [~] stable multiselect + marquee + group move feedback

### First-4 Execution Pass (one-pass batch)

Completed in one pass:

1. **Drop final top/bottom + cleanup lane**
   - unified insert-index resolution for resource drop and clip move paths
   - deterministic lane creation when dropping on top/bottom dropzones
   - non-drop lane cleanup path kept deterministic after commit
2. **Soak test mix lanes**
   - mixed-lane seek/play stress pass executed (`video+audio`, `audio-only`, `image`)
   - playback clamp remains based on `max(duration hint, computed content span)`
3. **Audio timeline edge-case polish**
   - active audio-event pick tolerance hardened at clip edges
   - start/end edge handling now resists floating-point drift during heavy seek
4. **Doc coherence cleanup**
   - backlog checkbox state aligned with this batch pass
   - execution notes consolidated under this section

## Next Sprint (Prioritized)

1. [x] **Render consistency closure**
   - filmstrip draw path now uses per-tile fallback to frame 0 and only reports success when at least one frame is actually drawn
   - drag/static preview parity aligned (no dragged-clip-only preview mode branch)
2. [x] **Persistence parity closure**
   - composition state-change runtime persistence now accepts active composition scope aliases (loop id + workflow alias + explicit alias list)
3. [x] **Editing UX closure**
   - track-context selected clip collection now includes primary clip fallback
   - clip selection-set remap added on track change commit (single + group move)
4. [ ] **Workspace evolution continuation**
   - complete Phase 4/5 remaining points before Phase 6 full closure

## Precommit Gate (Must Pass Before Commit)

- [ ] **Worktree hygiene**
  - remove debug/temp artifacts (`.tmp/`, test tmp dirs) from tracked changes
  - ensure no orphan legacy paths remain after refactors
- [ ] **Functional validation**
  - [x] `python -m pytest -q` green
  - [x] targeted JS syntax checks on touched studio modules
- [ ] **Docs/version coherence**
  - align release line across:
    - `README.md`
    - `docs/song2daw/*.md` release references
    - `feature_versions.json`
    - `CHANGELOG.md` / `FEATURE_CHANGELOG.md`
  - keep workflow/examples feature-scoped structure rules documented and respected
- [ ] **Release prep (when requested)**
  - bump version with project policy (minor/medium/major request flow)
  - generate/stage feature changelog
  - commit with Conventional Commit + scope

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

## Stabilization Closure Pass (Step-by-step)

This pass closes previously opened implementation tracks on the composition studio side.

- [x] Phase 1 - Timeline/placement invariants hardening
  - deterministic placement normalization on load/render
  - source-window clamp (`startOffsetSec + durationSec <= sourceDurationSec`)
  - non-overlap normalization per track lane (left-to-right deterministic ordering)
- [x] Phase 2 - Multi-source audio per track
  - audio playback now resolves per active clip event (`assetKey`) on the same audio lane
  - no longer assumes one static `audioAssetKey` per track
- [x] Phase 3 - Monitor/scrub stability
  - scrub source selection prefers active clip-at-playhead audio source before fallback
  - reduced decode/load overhead for track players (`preload=metadata`)
- [x] Phase 4 - Clip visual robustness
  - clip rendering relies on normalized source-window metadata and deterministic bounds
  - safer clip metadata overlays inside clip-safe drawing area
- [x] Phase 5 - Composition UX completion (context actions)
  - track context menu supports:
    - delete selected clips
    - duplicate selected clips
    - duplicate lane
    - lock/unlock lane
    - clear composition
- [x] Phase 6 - Performance/cache tightening
  - reduced unnecessary heavy media preloads for track audio players
  - keeps scrub selection deterministic with minimal source switching
- [x] Phase 7 - QA + docs closure
  - `python -m pytest -q` green
  - this design doc updated with closure checklist

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
- Manual composition resources are now persisted through a backend media cache:
  - uploaded files are materialized to repo-local cache paths (stable URL, no `blob:` dependency),
  - persisted runtime snapshots can restore manual resources after `Ctrl+F5` / crash recovery,
  - fallback to in-memory blob URL remains available if backend upload fails.

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
- POST /lemouf/loop/media_cache
- GET /lemouf/loop/media_cache/{loop_id}/{file_id}
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
