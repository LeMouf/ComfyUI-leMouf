# Changelog

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
