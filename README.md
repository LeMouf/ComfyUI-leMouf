# ComfyUI-leMouf

![License](https://img.shields.io/github/license/LeMouf/ComfyUI-leMouf)
![Latest Release](https://img.shields.io/github/v/release/LeMouf/ComfyUI-leMouf?include_prereleases)

Custom nodes for ComfyUI by **leMouf**.

This repository is the home of a growing collection of nodes focused on sharing
tools, techniques, and practical building blocks for creators.

## Status

Current version: `0.1.1` (MVP implemented)

Implemented MVP:
- Loop Return (payload capture)
- Loop Map (payload → input mapping)
- Loop Payload (per-cycle payload array)
- Loop Pipeline Step (pipeline orchestration node)
- leMouf Loop UI panel (sidebar)

Key features:
- UI workflow capture + compatibility checks before start
- Loop cycles with retry handling (approve / reject / replay)
- Auto-run on approve/reject/replay when a cycle has returned
- Per-cycle manifest with thumbnails + lightbox preview
- Pipeline payload preview screen (auto-detected types)
- Export approved images to `output/lemouf/{loop_id}/`
- Early exit + reset loop state
- Resizable right gutter panel (no overlay on viewer)

## Install (local)

1. Clone into your ComfyUI `custom_nodes` folder:

   ```bash
   git clone https://github.com/leMouf/ComfyUI-leMouf
   ```

2. Restart ComfyUI.

## MVP: Workflow Loop Orchestrator

This MVP provides an **interactive cycle stepper**:
- validate + start a loop from the current UI workflow
- run cycles one by one with approve / reject / replay
- capture per-cycle payloads (images, text, json, audio, video)

### How to try it

1. Add **Loop Return (leMouf)** to the workflow you want to loop.
2. Connect your final output into **Loop Return (leMouf)**.
3. Add **Loop Map (leMouf)** to define how payload values map into node inputs.
4. (Optional) Add **Loop Payload (leMouf)** with a JSON array of per-cycle payloads.
5. Use **Inject loop_id** from the panel (or set the loop_id on the node).
6. In the **leMouf Loop** panel:
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

Sample workflows live in `workflows/` and can be loaded in ComfyUI as normal JSON files.
Recommended naming:
- `loop_basic_image.json`
- `loop_basic_image_sd15.json`
- `loop_basic_image_sdxl.json`
- `leMouf_Loop-pipeline_0-1-0.json` (pipeline)
- `leMouf_Loop-payload_0-1-0.json` (WF1 payload generator)

The panel can also load pipeline workflows directly from `workflows/`.

Pipeline steps can be linked in the graph (flow output → flow input). If no links exist, the panel falls back to node id ordering.

When working in pipeline mode, cycle controls are hidden and the panel shows a pipeline graph with step validation.
The Start Pipeline button is enabled only when the pipeline and referenced workflows are valid.
After exit, the pipeline graph keeps the last run status and durations for each step.
The home view hides pipeline actions until a pipeline is loaded.
Click the pipeline step cards to load their workflow into the UI. The panel switches to the payload preview screen for generate steps and the run screen for execute steps. Use the header back menu to return to the home screen or exit the loop.

## Panel Toggle

You can show/hide the leMouf Loop panel using:
- ComfyUI menu item: **Show/Hide leMouf Loop panel**
- Keyboard shortcut: `Alt+L`

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
