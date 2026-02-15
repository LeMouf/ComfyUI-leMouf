# song2daw — UI View Model

Release line: `0.3.0`

The panel consumes a stable view model derived from SongGraph and artifacts.
The UI must not need direct SongGraph internals to render timeline/studio views.

## File

- `ui_view.json`

## Stability contract

- `song.id` and `song.duration_sec` are required.
- Every visible clip must provide `t0_sec` + `t1_sec`.
- Optional fields are additive and backward compatible.
- Unknown fields must be ignored by UI adapters.

## Minimal structure

```json
{
  "song": { "id": "demo", "duration_sec": 120.0 },
  "timebase": { "sr": 44100, "ppq": 960 },
  "tempo": [
    { "t_sec": 0.0, "bar": 1, "bpm": 120.0, "numerator": 4, "denominator": 4 }
  ],
  "beats": {
    "downbeats_sec": [0.0, 2.0, 4.0],
    "beats_sec": [0.0, 0.5, 1.0]
  },
  "sections": [
    { "label": "intro", "t0_sec": 0.0, "t1_sec": 16.0, "confidence": 0.8 }
  ],
  "tracks": [
    {
      "id": "trk_vocals",
      "name": "Vocals",
      "kind": "audio",
      "color": "#4aa3ff",
      "clips": [
        {
          "id": "clip_voc_1",
          "kind": "audio",
          "t0_sec": 0.0,
          "t1_sec": 32.0,
          "asset": "path/to/vocals.wav"
        }
      ]
    },
    {
      "id": "trk_drums_midi",
      "name": "Drums (MIDI)",
      "kind": "midi",
      "clips": [
        {
          "id": "clip_mid_1",
          "kind": "midi",
          "t0_sec": 0.0,
          "t1_sec": 32.0,
          "notes": [
            { "t0_sec": 1.0, "dur_sec": 0.1, "pitch": 36, "vel": 96, "chan": 10, "label": "kick" }
          ]
        }
      ]
    }
  ]
}
```

## Recommended extensions used in 0.3.0

- `run`
  - summary metadata shown in the studio header/footer.
- `assets`
  - source/mix/stem audio references for preview and scrub selection.
- `diagnostics`
  - build/render hints for debugging panel behavior.

## Notes

- Track mute/unmute state is UI-local and does not mutate persisted `ui_view.json`.
- Clip visual width must be derived from `t0_sec/t1_sec` and shared song duration.
- The same source selection policy should be used for play and scrub paths.
