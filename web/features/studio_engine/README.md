# Studio Engine

Shared timeline/arrange tooling used by multiple feature adapters.

Current scope:

- `timeline.js`
  - generic timeline renderer and interaction engine
  - exports generic API:
    - `renderStudioTimeline`
    - `clearStudioTimeline`
- `domain/services/audio_preset_plan.js`
  - DSP preset planning helpers used by timeline audio preview/scrub

Mini map (runtime flow):

```
timeline.js (public API + orchestration)
  -> application/api/public_api.js (render/clear API wiring)
  -> application/runtime/engine.js (runtime assembly/composition root)
    -> application/runtime/engine_audio.js (audio/scrub/midi runtime assembly)
    -> application/runtime/engine_preview.js (preview/waveform/clip-visuals assembly)
    -> application/runtime/engine_transport.js (transport + adapter assembly)
  -> application/boot/bootstrap.js (shell + state + initial view state)
  -> application/runtime/helpers.js (audio/mute/hit low-level helpers)
  -> application/runtime/transport_bridge.js (seek/play/stop/viewport wrappers)
  -> application/runtime/adapters.js (draw + transport adapters)
  -> application/runtime/wiring.js (handlers wiring + mount)
  -> application/boot/cleanup.js (teardown)
```

Treefolder rollout (current):

- `domain/`
  - `policies/constants.js`
  - `shared/utils.js`
  - `services/placement.js`
  - `services/linking.js`
  - `services/edit_ops.js`
  - `services/edit_result.js`
  - `services/drop_target_resolver.js`
- `application/`
  - `api/public_api.js`
  - `boot/{bootstrap,cleanup,mount}.js`
  - `runtime/{engine,engine_audio,engine_preview,engine_transport,wiring,helpers,adapters,clip_bridge,transport,transport_bridge,audio_url,view_state}.js`
- `infrastructure/`
  - `audio/{clock,bootstrap,track_runtime,scrub_runtime,midi_runtime}.js`
  - `media/filmstrip_cache.js`
- `ui/`
  - `shell/{shell,controls,status}.js`
  - `timeline/{viewport,resize,clip_visuals}.js`
  - `timeline/interactions/{core,canvas_events,keyboard,dnd,context_menu,selection,selection_geometry,hits,clip_edit,nudge}.js`
  - `timeline/preview/{runtime,filmstrip_draw,video_preview}.js`
  - `timeline/waveform/runtime.js`
  - `timeline/draw/{frame,core,overlays,tracks,status_emit,ruler}.js`
- Key services:
  - `domain/policies/constants.js` for shared tuning/config keys
  - `domain/services/{placement,linking,edit_ops,edit_result,drop_target_resolver,audio_preset_plan}.js`
  - `infrastructure/audio/*` for clock/track/scrub/midi runtime
  - `infrastructure/media/filmstrip_cache.js` for filmstrip cache/render support

Rules:

- Keep this folder domain-agnostic.
- Feature-specific semantics stay in adapters (`features/song2daw`, `features/composition`).
- Legacy `modules/*` compatibility wrappers were removed after full treefolder recabling.
- Legacy `web/ui/*` wrapper stubs were removed; consumers should import from `web/shared`, `web/app`, and `web/features` paths only.

Validation snapshot (2026-02-26):

- JS syntax sweep: `node --check` on all `web/features/studio_engine/**/*.js` is green.
- Python suite: `python -m pytest -q` is green (`169 passed`).
- Context-menu interaction hardening applied to avoid blocked click paths after heavy pointer-capture interactions.
