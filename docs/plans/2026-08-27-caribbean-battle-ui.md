# Caribbean Battle UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved action-first naval battle interface with compact keyboard badges, a one-key shot cycle, player-only battery readiness, a wider Change Shot module, and calmer water that gives both ships convincing mass.

**Architecture:** Keep canonical naval simulation, replay, opponent AI, and outcome logic unchanged. Change only command mapping/presentation and Three.js visual motion. Consolidate ammunition into a single `S` cycle at the session-view boundary, move player reload state into the two fire modules, keep enemy telemetry health-only, and define explicit water/motion presentation constants that can be tested independently from WebGL screenshots.

**Tech Stack:** React 19, TypeScript, Three.js/WebGL, CSS, Vitest + Testing Library, Node native tests, Playwright-backed naval/port evidence harnesses.

**Spec:** `docs/designs/2026-08-26-caribbean-port-battle-ui-design.md`

## Global Constraints

- Preserve deterministic naval state transitions, public tick ownership, replay hashes, and campaign outcomes.
- Primary QWERTY controls are `A`, `Q`, `S`, `R`, `E`, `D`, and `Space`; arrow keys/Escape may remain documented alternates.
- `1`, `2`, and `3` must no longer alter ammunition.
- Show reload readiness only for the player; do not expose opponent reload timing.
- The Change Shot module is approximately 1.16× the horizontal width of Change Sail, adding breathing room without taking meaningful space from sailing.
- Keep 44px targets, 14px text, reduced-motion behavior, and full keyboard/pointer equivalence.
- Do not add `preserveDrawingBuffer`, RAF settling, `gl.finish`, perceptual thresholds, or simulation changes.

---

### Task 1: Lock the action-first QWERTY command contract

**Files:**
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Modify: `src/games/caribbean/components/battle/BattleShortcutLegend.test.tsx`

- [ ] Add failing tests that `S` cycles `round → chain → grape → round`, while `1`, `2`, and `3` leave the selected ammunition unchanged.
- [ ] Update the blocking/overlay shortcut matrices so `S` is blocked with `A/Q/R/E/D/Space/Escape`, and the removed number keys are not treated as tactical mutations.
- [ ] Add a failing visible legend assertion for action-first copy with compact shortcut badges: Turn port/A, Fire port/Q, Change shot/S, Change sail/R, Fire starboard/E, Turn starboard/D, Pause/Space.
- [ ] Run the focused tests and confirm the current number-key behavior and legend fail.

### Task 2: Implement the six-module battle command deck

**Files:**
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/components/battle/BattleShortcutLegend.tsx`
- Modify: `src/games/caribbean/styles/battle.css`
- Modify: `src/games/caribbean/styles/battleResponsive.test.tsx`

- [ ] Replace the three ammunition buttons with one `Change Shot` action showing the current shot icon/name and a small `S` badge.
- [ ] Wire `S` and pointer activation through one pure `nextAmmunition` helper; retain direct `session.setAmmunition` ownership and no simulation mutation.
- [ ] Render the command deck in the exact six-module order: turn port, fire port, change shot, change sail, fire starboard, turn starboard. Keep Options outside the primary deck.
- [ ] Use action label/icon as the visual star and render each shortcut in a smaller subordinate `kbd` badge.
- [ ] Add CSS/grid contract tests that Change Shot consumes 1.16 fractions while Change Sail consumes 1 fraction, with the two steering modules narrow and the sailing view still dominant.
- [ ] Run the focused tests and mutation-check restoring three ammo buttons or changing the shot/sail ratio to equal widths.

### Task 3: Integrate player battery readiness and remove enemy reload telemetry

**Files:**
- Modify: `src/games/caribbean/components/battle/BattleHud.tsx`
- Modify: `src/games/caribbean/components/battle/BattleHud.test.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/styles/battle.css`

- [ ] Add failing tests that opponent systems contain no reload text/meter and player fire modules expose exact port/starboard Ready or integer-percent Reloading state.
- [ ] Add accessible fire-label tests such as `Fire port — ready` and `Fire starboard — reloading 50 percent`; visually pair the battery status/meter with the corresponding fire action.
- [ ] Run focused tests and observe current enemy reload and missing fire-status failures.
- [ ] Remove the enemy `naval-reload-grid`; move the player's reload presentation into each `FireControl` using canonical `state.ships.player.reload[side]`.
- [ ] Preserve the reload live-region announcement and domain fire guard; the control may visibly disable while not loaded but must retain status text.
- [ ] Rerun tests and mutation-check reintroducing enemy reload or swapping port/starboard readiness.

### Task 4: Calm the water and ship presentation

**Files:**
- Create: `src/games/caribbean/three/naval/waterPresentation.ts`
- Create: `src/games/caribbean/three/naval/waterPresentation.test.ts`
- Modify: `src/games/caribbean/three/naval/NavalScene.ts`
- Create: `src/games/caribbean/three/naval/NavalScene.test.ts`

- [ ] Add failing tests for immutable presentation limits: summed wave peak `0.12`, band speed at most half the old value, heave `0.06`, pitch `0.01`, ambient roll `0.006`, and no diagonal wind-line layer in the scene.
- [ ] Run focused Three.js tests and observe missing constants/old amplitudes.
- [ ] Implement explicit `NAVAL_WATER_PRESENTATION` constants and consume them in the shader and ship render transform.
- [ ] Reduce shader waves from `.24 + .16` to `.07 + .05`, halve temporal frequencies, reduce ship heave/pitch/ambient roll, and remove wind-line rendering while retaining the textual wind bearing and deterministic simulation wind.
- [ ] Keep wake, bearing line, aim arc, recoil, damage, camera fit, and reduced-motion behavior intact.
- [ ] Rerun focused tests and mutation-check old wave or motion amplitudes and wind-line scene insertion.

### Task 5: Verify the complete battle interface

**Files:**
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-campaign-victory-browser.node-test.mjs`
- Modify: `scripts/caribbean-naval-check.mjs`
- Modify: `scripts/lib/caribbean-naval-check.test.mjs`
- Modify only through evidence gates if bytes change: `docs/screenshots/caribbean-port/campaign-battle-desktop.png`
- Modify only through evidence gates if bytes change: `docs/screenshots/caribbean-port/campaign-result-desktop.png`
- Modify only through evidence gates if bytes change: `docs/screenshots/caribbean-port/campaign-battle-fallback.png`
- Modify only through evidence gates if bytes change: `docs/screenshots/caribbean-naval/*.png`
- Modify only through evidence gates: `docs/screenshots/caribbean-port/metrics.json`
- Modify only through evidence gates: `docs/screenshots/caribbean-naval/metrics.json`

- [ ] Add failing browser/static assertions for exact six-module order, `S` cycle, absent number-key mutation, player-only reload UI, shot/sail 1.16 ratio, 14px/44px/no-overflow, and absent rendered wind-line layer.
- [ ] Run focused component/native suites and confirm the assertions own the intended presentation boundaries.
- [ ] Run `npm run check`, `npx vitest run`, `npx tsc -b --force`, and `npm run build`.
- [ ] Run the real one-journey battle gate, naval verification harness, semantic probe, and the relevant port/naval capture gates serially.
- [ ] Inspect changed battle screenshots at original resolution: controls remain readable but compact, Change Shot has side breathing room, both player batteries communicate readiness, the enemy reveals no reload timing, ships read as heavy, and the calmer sea does not imply flight.
- [ ] Confirm hash-aware evidence publication leaves identical PNGs untouched and only genuinely changed bytes enter status.
- [ ] Stage only battle source/tests/evidence owned by this plan and commit with `feat(caribbean): build action-first naval battle UI`.
