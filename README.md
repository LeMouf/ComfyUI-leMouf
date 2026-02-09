# ComfyUI-leMouf

Custom nodes for ComfyUI by **leMouf**.

This repository is the home of a growing collection of nodes focused on sharing
tools, techniques, and practical building blocks for creators.

## Status

Current version: `0.1.0` (MVP implemented)

Implemented MVP:
- Workflow Loop Orchestrator
- Loop Context (cycle/retry/seed)
- Loop Return (image capture)
- leMouf Loop UI panel (sidebar)

Key features:
- UI workflow capture + compatibility checks before start
- Loop cycles with retry handling (approve / reject / replay)
- Auto-run on approve/reject/replay when a cycle has returned
- Deterministic seed output from Loop Context (cycle+retry or hash)
- Per-cycle manifest with thumbnails + lightbox preview
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
- capture per-cycle images in a manifest

### How to try it

1. Add **Loop Context (leMouf)** + **Loop Return (leMouf)** to the workflow you want to loop.
2. Connect `LoopContext.seed` -> `KSampler.seed` (ensures a new seed per cycle/retry).
3. Connect your final image output into **Loop Return (leMouf)**.
4. In the **leMouf Loop** panel:
   - set **Total cycles**
   - click **Validate & Start**
5. Use **Approve / Reject / Replay** to control each cycle.

Notes:
- Loop Return currently captures **images + info** into a loop manifest.
- Export approved images from the panel (saved to `output/lemouf/{loop_id}/`).

## Example Workflows

Sample workflows live in `workflows/` and can be loaded in ComfyUI as normal JSON files.
Recommended naming:
- `loop_basic_image.json`
- `loop_basic_image_sd15.json`
- `loop_basic_image_sdxl.json`

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.
