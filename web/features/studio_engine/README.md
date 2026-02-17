# Studio Engine

Shared timeline/arrange tooling used by multiple feature adapters.

Current scope:

- `timeline.js`
  - generic timeline renderer and interaction engine
  - exports generic API:
    - `renderStudioTimeline`
    - `clearStudioTimeline`
  - exports compatibility aliases for song2daw:
    - `renderSong2DawTimeline`
    - `clearSong2DawTimeline`
- `audio_preset_plan.js`
  - DSP preset planning helpers used by timeline audio preview/scrub

Rules:

- Keep this folder domain-agnostic.
- Feature-specific semantics stay in adapters (`features/song2daw`, `features/composition`).
