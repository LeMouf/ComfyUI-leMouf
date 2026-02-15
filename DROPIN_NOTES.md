# Drop-in notes (ComfyUI)

This package adds a ComfyUI **bottom panel tab** called `song2daw` using the official Bottom Panel Tabs API.

Docs:
- Bottom Panel Tabs API (ComfyUI): https://docs.comfy.org/custom-nodes/js/javascript_bottom_panel_tabs
- JS Extension overview: https://docs.comfy.org/custom-nodes/js/javascript_overview

## Where to drop these files
Copy/merge into your existing custom node repo root (e.g. `ComfyUI/custom_nodes/ComfyUI-leMouf/`).

It expects the repo already serves a `js/` directory via:
```py
WEB_DIRECTORY = "./js"
```
If your repo already exports `WEB_DIRECTORY`, nothing to do.
If not, add it to the package `__init__.py`.

## Files added
- `js/song2daw/arrangement_tab.js`  (registers the bottom panel tab)
- `js/song2daw/assets/song2daw.css` (minimal styling)
- `docs/song2daw/UI_VIEW_SPEC.md`   (feature & render spec for Codex)
- `docs/song2daw/UI_VIEW_MODEL.md`  (data contract guidance)
- `song2daw/schemas/ui_view.schema.json`
- `examples/song2daw/ui/sample_ui_view.json`

## IMPORTANT
The URL used by the JS to load assets includes the custom node folder name:
`extensions/ComfyUI-leMouf/...`

If your folder name differs, update it in:
- `js/song2daw/arrangement_tab.js` (CSS href + fixture URL)

## How to verify
1) Restart ComfyUI
2) Open the bottom panel and find the **song2daw** tab
3) Click **Load fixture**
