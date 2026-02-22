# Changelog

## Unreleased - 0.3.3-wip

- Release line:
  - `0.3.3-wip`
- Program status:
  - Stream A `closed`
  - Stream B `in progress`
- Quality gate status:
  - **Precommit Gate open**
- Delivered in current iteration:
  - unified insert/drop lane resolution between resource drop and clip move paths
  - hardened audio event-edge picking during heavy seek/scrub
  - backend composition manifest persistence route wired (`POST /lemouf/composition/export_manifest`)
  - backend export profile catalog wired (`backend/composition/export_profiles.py` + `GET /lemouf/composition/export_profiles`)
  - composition monitor codec selector now hydrates from backend profiles with local fallback
  - backend execution endpoint wired (`POST /lemouf/composition/export_execute`) with ffmpeg command planning + optional run mode
  - backend execution upgraded to timeline/layer compositor graph (video overlays + audio mix), with deterministic fallback when sources are missing
  - execution diagnostics enriched (`skipped_visual_events`, `skipped_audio_events`, notes) for export troubleshooting
  - advanced clip compositing support added (per-clip opacity + explicit z-index ordering)
  - export duration mode now resolves timeline length from actual placement span
  - synchronized status wording/template across planning and changelog docs
- Remaining priorities:
  - output/export execution polish (diagnostics + advanced compositing behavior)
  - transform ergonomics/keybind polish (`V/R/S`)
  - phase-6 final closure (gap rendering consistency + crash/reload parity)

## 0.3.1 - 2026-02-16

- Add lightbox cycle jump selector for loop cycle previews.
- Improve lightbox decision flow:
  - stabilize replay/reject pending skeleton behavior
  - keep selection on target retry while generation is pending
  - auto-close lightbox when cycle approval is completed
- Improve runtime resilience after page reload:
  - persist pipeline runtime state by `loop_id`
  - restore pipeline step/run details in Home after `Ctrl+F5`
  - hydrate pipeline state from selected workflow when cache is missing
- Improve workflow/home synchronization behavior for in-progress generic loop runs.

## 0.3.0 - 2026-02-15

- Add `LeMoufWorkflowProfile` node to declare workflow UI profile metadata.
- Add workflow catalog support for `workflow_kind` (`master` / `branch`) and master-only listing in Home.
- Add unified Home action (`Run pipeline`) that adapts execution by workflow profile/context.
- Add Song2DAW Studio bottom panel views:
  - Arrange timeline
  - Tracks summary
  - Spectrum 3D preview
- Add Song2DAW run browser and step inspection APIs in panel flow.
- Add controlled fixture workflow for deterministic Song2DAW validation:
  - `workflows/song2daw/song2daw_fixture_10s_4inst_0-1-0.json`
- Improve Song2DAW studio interaction robustness:
  - workflow switching reset behavior
  - timeline zoom/pan consistency
  - section/track visual alignment
  - mute-aware playback/scrub logic
- Documentation refresh for 0.3.0:
  - root README
  - feature design
  - Song2DAW architecture/API/technical docs
  - workflow and examples guides

## 0.2.0

- Remove Loop Context and Workflow Loop Orchestrator nodes.
- Loop Return is now the only required node for loop workflows.
- Loop Return now accepts a single `payload` input and infers output types.
- Add Loop Map node (payload → input mappings, optional cycle_source).
- Add Loop Payload node (payload array in the workflow timeline).
- Add Loop Pipeline Step node (pipeline workflows with linked ordering).
- UI refactor into screens (home/payload/run) with header back menu.
- Payload preview screen for WF1 (auto-detected types).

## 0.1.0

- Initial public MVP.
- Nodes: Workflow Loop Orchestrator, Loop Context, Loop Return.
- Loop Context seed output (cycle/retry/hash).
- Loop Return image capture + manifest entries.
- Interactive UI panel (resizable right gutter).
- Validate & Start workflow compatibility checks.
- Approve / Reject / Replay with auto-run when returned.
- Thumbnail gallery with lightbox and per-cycle grouping.
- Current image preview + spinners.
- Export approved images to output/lemouf/{loop_id}/.
- Early exit + loop reset.
