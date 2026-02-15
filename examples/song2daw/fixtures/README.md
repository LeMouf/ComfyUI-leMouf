# song2daw controlled fixtures

Deterministic validation fixtures for pipeline and UI checks.

Current fixture:
- `midi/song2daw_10s_4inst.mid`
- `expected/song2daw_10s_4inst.expected.json`

Generation:
- `python examples/song2daw/fixtures/generate_song2daw_10s_4inst.py`

The fixture contains:
- duration: 10.0 seconds
- tempo: 120 BPM
- PPQ: 480
- 4 MIDI instrument tracks with distinct patterns:
  - Drums
  - Bass
  - Chords
  - Lead
