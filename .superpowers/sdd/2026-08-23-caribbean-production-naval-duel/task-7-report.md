# Task 7 — Semantic Battle Feedback

## Delivered

- Added an injected, gesture-gated `BattleAudio` adapter. It owns no context
  until activation, consumes pre-activation history without replaying it,
  deduplicates semantic events per `battleGeneration`, supports retry after a
  rejected activation, and disposes owned nodes/context idempotently.
- Added original procedural Web Audio cues for cannon, splash, impact, rig
  tear, player reload bells, and surrender bell. Audio is immediately quiet
  while muted, paused, terminal, or hidden.
- Centralized the inclusive 42-unit broadside firing gate for combat and the
  pure aim selector. The selector is input-immutable and never affects rules,
  commands, accuracy, or state.
- Added live sensory controls (aim, steering hint, shake, flashes, effects,
  mute), a live `matchMedia` reduced-motion override, one-shot reload-live
  announcements, tactical aim directive/arc, and outcome facts/next actions.
- Scene sensory updates use the existing adapter; settings do not recreate the
  WebGL scene.

## TDD evidence

The initial focused RED run failed as required because Vite could not resolve
the new `BattleAudio` and `aimCue` modules. After implementation, focused
audio/components/domain coverage passed: 14 files, 125 tests.

## Verification

- `npx vitest run`: 84 files, 776 tests passed.
- `npm run check`: passed; lint remains at the pre-existing 67 warnings (no
  Task 7 warnings), with typecheck and knip clean.
- `npm run build`: passed.
- `BUILD_HARNESS=1 npm run build`: passed.
- `npm run shots -- battle`: passed; no screenshot bytes changed.
- `git diff --check`: passed.

The full suite emits pre-existing jsdom WebGL/canvas and React Router stderr
messages in unrelated suites; it exits successfully.
