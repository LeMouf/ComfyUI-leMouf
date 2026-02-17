# Drop-in notes (ComfyUI)

This document was kept as a migration marker.

Current UI runtime lives under `web/` (not `js/`):

- `WEB_DIRECTORY = "./web"` in `__init__.py`
- main extension entrypoint: `web/lemouf_studio.js`
- feature modules:
  - `web/app/*`
  - `web/shared/*`
  - `web/features/*`

The old `js/song2daw/*` drop-in files were removed as residual legacy.
