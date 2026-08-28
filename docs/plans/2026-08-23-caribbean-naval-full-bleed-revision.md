# Caribbean Naval Full-Bleed Revision Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Apply `frontend-design`, strict TDD, browser inspection, and independent code
> review. Preserve all deterministic combat and accessibility contracts.

**Goal:** Act on the 2026-08-23 owner playtest by restoring the POC's sea-first,
full-page battle composition, simplifying controls without losing touch or
keyboard access, preserving the production HUD's stronger ship health, and
eliminating visible 20 Hz ship/camera stepping through render-only smoothing.

**Observed user signal:**

- Ships visibly jitter while moving.
- The large port/starboard shooting sidebars take too much space and are not
  needed.
- The earlier `preview-caribbean.html` full-page play area felt better.
- Controls should overlay the sea, stay compact, and show shortcuts on every
  Battle Lab phase.
- The production health presentation is better and should remain.
- The old POC control area was also too large; this is not a request to copy it
  literally.

This is an owner playtest, not one of the three anonymous first-time sessions
and not target-iPad evidence. The milestone remains `revise-battle`.

**Architecture:** Keep the deterministic 60 Hz naval domain and the session's
20 Hz React/HUD publication cadence. `NavalScene.sync` receives canonical target
poses; `render` interpolates disposable ship/camera presentation at RAF cadence.
React lays the tactical viewport full-bleed and places compact, accessible HUD
and command surfaces above it. No POC runtime import is allowed.

**Branch:** Continue on isolated `codex/caribbean-game`; keep `main` untouched.
No merge or push.

## Locked presentation contract

### Battle composition

- The sea/fallback chart fills the battle page from edge to edge beneath UI.
- The compact mission line remains at the top: objective, wind, pause.
- Opponent systems sit at the upper edge; player systems sit near the lower
  edge. Preserve hull, sails, crew, cannon, and both reload states.
- Controls do not reserve left/right layout columns. Remove the giant fire
  paddles and the three-column command deck.
- One translucent single-row command strip overlays the lower scene on tablet
  landscape and desktop.
- Physical port is the strip's left end and physical starboard is its right end,
  but labels—not screen position—remain authoritative.
- Pointer events pass through decorative overlays and are enabled only on
  actual controls. Ships remain visible through the central safe area.
- Respect `env(safe-area-inset-*)`; no document-level horizontal scroll.
- Caribbean Career does not support phones or tablet portrait. Below 960 CSS px
  width or 600 CSS px height, render a blocking, focused status notice explaining
  that the game requires tablet landscape or a larger display. Do not mount or
  run a hidden naval session behind it. The gate updates on resize/orientation.

### Compact controls and shortcuts

The battle command strip contains these existing actions and stable test IDs:

| Group | Visible key | Action |
| --- | --- | --- |
| Left edge | `A` | Hold rudder to port |
| Left edge | `Q` | Fire physical port broadside |
| Centre | `1` | Round shot |
| Centre | `2` | Chain shot |
| Centre | `3` | Grape shot |
| Centre | `R` | Toggle full/reefed sail |
| Right edge | `E` | Fire physical starboard broadside |
| Right edge | `D` | Hold rudder to starboard |
| Mission line | `Space / Esc` | Pause/resume |

- Broadside controls are 52–56 px and never below 44 px.
- Ammo/sail controls are 44 px minimum and show current state with text plus
  `aria-pressed`; no colour-only state.
- `A/D` remain press-and-hold rudder controls. `Q/E` remain one-shot fire.
- All current keyboard, pointer, blur, terminal, focus, audio activation, and
  stale-rudder protections remain unchanged.
- A reusable static `BattleShortcutLegend` appears on decision and briefing
  pages. The live command strip itself is the legend during battle. A screen-
  reader summary names every shortcut once.
- Restart plus aim/steering/shake/flashes/effects/mute move into a compact
  labelled `Options` disclosure. Existing test IDs and 44 px targets remain;
  opening it must not pause or alter canonical state.
- Outcome/drift dialogs and the fallback's Retry/Restart actions remain
  modal, focused, keyboard-contained, and operable.

### Render smoothing

- The cause is locked by evidence: `NavalSession` publishes immutable snapshots
  every 6 canonical ticks (20 Hz); `NavalScene.sync` currently snaps roots and
  camera framing while render runs near 60 Hz.
- Do not lower `HUD_TICK_INTERVAL`, publish React state at 60 Hz, or change any
  movement/combat rule.
- First sync and battle-generation change snap all render poses and camera
  state to canonical targets so loading/restart never slides ships across sea.
- Later sync calls update only target x/z/heading and the desired engagement
  camera fit.
- Each render damps x/z and shortest-path heading toward targets with a stable
  exponential factor derived from clamped animation delta. Use caller-owned
  scratch objects; no per-frame `Vector3`/matrix allocations.
- Wakes, rings, bearing/aim visuals, and event muzzle origins use current render
  poses so effects remain attached to visible ships.
- Camera position and look-at target damp independently toward the latest safe
  fit; they do not hard-snap at 20 Hz.
- Reduced motion and initial/restart sync snap to exact target poses, disable
  bob/recoil/shake as already specified, and remain finite.
- Presentation lag is capped: after a normal 100 ms snapshot interval, a static
  target converges within 0.02 world units and 0.002 radians inside 250 ms.

## File map

**Smoothing:**

- Modify: `src/games/caribbean/three/naval/sceneMath.ts`
- Modify: `src/games/caribbean/three/naval/sceneMath.test.ts`
- Modify: `src/games/caribbean/three/naval/NavalScene.ts`
- Modify: `src/games/caribbean/components/battle/NavalViewport.tsx`
- Modify: `src/games/caribbean/components/battle/NavalViewport.test.tsx`

**Layout/interaction:**

- Create: `src/games/caribbean/components/battle/BattleShortcutLegend.tsx`
- Create: `src/games/caribbean/components/battle/BattleShortcutLegend.test.tsx`
- Modify: `src/games/caribbean/components/CaribbeanLab.tsx`
- Modify: `src/games/caribbean/components/CaribbeanLab.test.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/components/battle/BattleHud.tsx`
- Modify: `src/games/caribbean/styles/battle.css`
- Modify: `src/games/caribbean/styles/battleResponsive.test.tsx`

**Evidence/docs:**

- Modify: `scripts/caribbean-naval-check.mjs` to assert the 960×600 gate and
  capture the warning at phone portrait/landscape; do not weaken any approved
  Task 8 runtime threshold for supported screens.
- Modify: `scripts/lib/caribbean-naval-evidence.mjs` only if evidence shape must
  grow; retain complete fail-closed validation.
- Modify: `docs/games/caribbean-career/naval-battle-playtest.md`
- Modify: `docs/games/caribbean-career/naval-battle-review.md`
- Refresh: `docs/screenshots/caribbean-naval/*.png` and `metrics.json` through
  the existing evidence command; never hand-edit measurements.

## Task 1: Add render-pose and camera smoothing

- [ ] **Step 1: Write pure scene-math RED tests**

  Add allocation-independent tests for:

  - one 1/60-second frame moves part-way, not zero or directly to target;
  - exact exponential partition invariance within tolerance;
  - shortest heading path across `π/-π` in both directions;
  - finite behavior at zero/large/clamped delta;
  - reduced-motion snap;
  - convergence within the locked 250 ms bound;
  - caller-owned output/scratch identity reuse.

- [ ] **Step 2: Capture RED**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/three/naval/sceneMath.test.ts
  ```

- [ ] **Step 3: Implement the smallest pure helpers**

  Export scalar/angle/pose damping helpers with one documented response rate.
  Reuse the existing angle normalization oracle. Do not import Three.js into the
  math test boundary unless the current file already requires it.

- [ ] **Step 4: Write adapter lifecycle RED tests**

  Extend the test adapter to prove initial/generation snap, ordinary target-only
  sync, reduced-motion live snap, no scene recreation, exact disposal, and
  unchanged canonical input bytes. The viewport must pass `battleGeneration`
  into the adapter's presentation sync boundary.

- [ ] **Step 5: Integrate `NavalScene`**

  Store target and render poses per ship. Render roots/wakes/rings/effects from
  render poses; damp desired/current camera position and target; reuse existing
  scratch objects. Preserve frustum fit, draw cap, resource metrics, visibility
  baseline, quality controller, context loss, and event-generation cursors.

- [ ] **Step 6: Verify and commit**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/three/naval \
    src/games/caribbean/components/battle/NavalViewport.test.tsx
  npm run typecheck
  git diff --check
  git commit -m "fix(caribbean): smooth naval presentation"
  ```

## Task 2: Replace side paddles with a full-bleed command overlay

- [ ] **Step 1: Write component RED tests**

  Prove decision and briefing expose the complete shortcut legend; battle shows
  each key/action; two and only two broadside buttons retain physical side/test
  IDs; ammo/sail/rudder/pause/restart/settings behaviors still reach the exact
  session methods; Options disclosure preserves all feedback controls; health,
  reload, wind, objective, outcome, diagnostic, fallback, focus, and inert
  contracts remain.

- [ ] **Step 2: Write structural/responsive CSS RED tests**

  Assert a full-stage absolute viewport, overlay HUD/command layers, no reserved
  side-fire columns, minimum 44 px controls, safe-area padding, single-row
  supported-screen fit, semantic wind visible, and no rule hiding shortcut key
  text. At 959×600, 960×599, 430×932, and 844×390 assert the blocking notice is
  visible and no `NavalBattlePage`/session is mounted; at 960×600 it is allowed.

- [ ] **Step 3: Capture RED**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/components/CaribbeanLab.test.tsx \
    src/games/caribbean/components/battle/NavalBattlePage.test.tsx \
    src/games/caribbean/components/battle/BattleShortcutLegend.test.tsx \
    src/games/caribbean/styles/battleResponsive.test.tsx
  ```

- [ ] **Step 4: Implement the compact composition**

  Keep the modern teal/brass visual language. Refactor DOM only as needed; do
  not change session or domain semantics. Use restrained translucency/blur and
  solid high-contrast fallbacks. Keep central sea clear and controls visually
  secondary until interacted with.

- [ ] **Step 5: Mutation checks**

  Kill and restore: swapped Q/E labels; missing one briefing shortcut; a desktop
  side-column reservation; and an off-by-one 959 px screen gate.

- [ ] **Step 6: Verify and commit**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/components \
    src/games/caribbean/styles \
    src/games/caribbean/three/naval
  npm run check
  git diff --check
  git commit -m "feat(caribbean): restore full-bleed naval controls"
  ```

## Task 3: Refresh browser evidence and owner-feedback record

- [ ] Add a dated owner-playtest subsection recording the feedback at the top
  of this plan. Mark it experienced-owner evidence and do not increment the
  anonymous first-time session count.
- [ ] Build normally and prove the harness/GLB remain excluded.
- [ ] Build the harness and run `npm run caribbean:naval-check`; keep the active
  unpaused 20-second FX/resource/FPS plateau and all fail-closed checks.
- [ ] Inspect playable captures at 1440×900, 1180×820, and 1024×768. Inspect
  430×932 and 844×390 captures as warning-only unsupported-screen evidence.
- [ ] At each supported viewport verify: materially larger uninterrupted sea,
  both ships visible, no overlay covers the engagement centre, health/reloads
  readable, shortcuts legible, no overlap/outer scroll, port/starboard physical
  labels, fallback operable, and zero failures. At unsupported viewports verify
  only the clear notice, no hidden battle/session, and clean resize recovery.
- [ ] Record scene metrics and confirm calls ≤120, triangles ≤100,000, sustained
  active-window FPS ≥50, no resource growth, and effects within capacity.
- [ ] Update `naval-battle-review.md`; the decision remains `revise-battle`
  unless the still-missing anonymous and real-iPad evidence is actually run.
- [ ] Run the full gate:

  ```bash
  npm run check
  npx vitest run
  npm run build
  npm run caribbean:naval-check
  git diff --check
  ```

- [ ] Commit refreshed evidence separately:

  ```bash
  git commit -m "test(caribbean): verify full-bleed naval battle"
  ```

## Independent review and exit criteria

Assign a fresh cumulative reviewer after all three commits. Approval requires:

1. No deterministic state, replay, combat, opponent, handedness, audio, focus,
   fallback, reduced-motion, or disposal regression.
2. Visual poses and camera no longer step at the 20 Hz snapshot cadence, and
   restart/generation snaps do not glide.
3. The sea is the dominant canvas at desktop and tablet landscape; no giant
   side fire columns remain. Phone/tablet portrait shows the blocking minimum-
   screen notice and runs no hidden battle.
4. Production ship health/reload clarity is retained.
5. Every shortcut is visible before and during battle, with 44 px touch paths
   and unchanged physical controls.
6. Active browser metrics and resource/error evidence retain Task 8 thresholds.
7. Owner feedback is documented honestly; anonymous/iPad rows are not filled.
8. Independent review reports no BLOCKER, MAJOR, or MINOR; worktree is clean;
   no merge or push occurred.
