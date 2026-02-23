# Feature Changelog

_Auto-generated from git history using Conventional Commit scopes._
_Generated: 2026-02-17 22:58 UTC_
_Process note: quality validation is tracked via the **Precommit Gate** (see `README.md`)._

## Unreleased Snapshot (0.3.3-wip, manual sync)

_Last sync: 2026-02-22_
_Source of truth for execution status: `docs/feature-design.md`._

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
  - monitor workspace stage foundation completed (output frame + pasteboard + work-area/background controls)
  - technical overlays completed (grid/safe/center/diagonals + per-overlay opacity persistence)
  - transform mode controls completed (`move/scale/rotate` + `V/S/R`)
  - backend composition manifest persistence route wired (`POST /lemouf/composition/export_manifest`)
  - backend export profile catalog wired (`backend/composition/export_profiles.py` + `GET /lemouf/composition/export_profiles`)
  - composition monitor codec selector now hydrates from backend profile catalog with resilient local fallback
  - backend execution endpoint wired (`POST /lemouf/composition/export_execute`) with ffmpeg command planning + optional run mode
  - backend execution upgraded to timeline/layer compositor graph (video overlays + audio mix), with deterministic fallback when manifest sources are missing
  - execution diagnostics enriched (`skipped_visual_events`, `skipped_audio_events`, notes) for export troubleshooting
  - advanced clip compositing support added (per-clip opacity + explicit z-index ordering)
  - execution polish completed with optional transitions/effects in backend export:
    - video fade in/out + blur + EQ
    - audio fade in/out + gain
  - execution diagnostics extended with `diagnostics.execution` runtime metadata
  - export duration mode now resolves timeline length from actual placement span
  - synchronized status wording/template across planning and changelog docs
  - runtime restore hardening for composition:
    - runtime payload now restores snapshot/resources across loop + workflow alias scopes
    - persisted runtime state now includes composition scope aliases for deterministic reload hydration
- Remaining priorities:
  - phase-6 reliability soak on mixed edit/playback sessions
  - precommit gate closure (docs/version/worktree hygiene)

### composition (0.3.3-wip)
- Unified insert/drop lane resolution between resource drop and clip move paths.
- Deterministic lane creation on top/bottom dropzones.
- Monitor/workspace controls expanded (toolbar grouping, config scaffold, state persistence fields).
- Workspace stage model completed:
  - output frame + pasteboard,
  - work-area visibility toggle,
  - stage background modes (`neutral`, `dark`, `checker`).
- Technical overlays completed:
  - center/diagonal guides added,
  - per-overlay opacity controls persisted in layout state.
- Transform mode controls completed:
  - mode buttons in monitor config (`move/scale/rotate`),
  - keyboard shortcuts (`V/S/R`) wired to mode switch.
- Export execution polish completed:
  - optional effect hooks in render execution (video/audio fades, blur/EQ, gain),
  - richer diagnostics payload for execution troubleshooting.
- Remaining focus:
  - reliability soak under mixed edit/playback stress,
  - precommit gate closure for release readiness.

### studio_engine (0.3.3-wip)
- Audio timeline robustness pass:
  - playback duration clamped on `max(hint, computed content span)`,
  - active audio event pick hardened for heavy seek/scrub edge drift.
- Insert-mode hover/ghost feedback improved on dropzones.
- Remaining focus:
  - final soak pass on mixed lanes under sustained scrub,
  - full parity static vs drag render path.

### panel (0.3.3-wip)
- Workflow/status docs and progress reporting aligned with current stabilization program.
- Remaining focus:
  - finalize precommit gate closure before version bump.

## composition (0.3.2)
- No scoped commits found yet.

## loop (0.3.2)
- No scoped commits found yet.

## panel (0.3.2)
- No scoped commits found yet.

## song2daw (0.3.2)
- 2026-02-13 `14ed8621` feat(song2daw): init feature

## studio_engine (0.3.2)
- No scoped commits found yet.
