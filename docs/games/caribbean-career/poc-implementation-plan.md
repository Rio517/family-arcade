# Caribbean Naval POCs Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that an authored Blender sloop, deterministic naval rules, and a
purpose-built Three.js battle presentation can deliver a readable, satisfying
browser battle on an iPad-class budget.

**Architecture:** A pure fixed-step TypeScript domain owns ship position,
heading, sail state, reload, projectiles, hits, damage, and outcomes. A Three.js
adapter interpolates that state and adds visual-only sea motion and effects. A
headless Blender script produces a named-part `.blend`, GLB, standardized review
renders, and machine-readable asset report; the existing optimizer preserves
the part hierarchy and Meshopt-compresses the game asset.

**Tech Stack:** TypeScript, Vitest, Three.js 0.170, GLTFLoader, Meshopt decoder,
Vite multipage harness, Blender 4.x Python API, existing GLTF Transform script,
Playwright, and Sharp.

---

## Scope and proof questions

The work is three connected POCs, not three disposable demos:

1. **Battle rules:** does broadside orientation, wind, sail choice, ammunition,
   and ship damage create understandable decisions in 2–4 minutes?
2. **Asset loop:** can one historically plausible stylized sloop be rebuilt,
   reviewed, exported, optimized, and measured without manual mystery steps?
3. **Integrated feel:** does the actual GLB remain readable in combat, and can
   the scene hold its visual hierarchy and frame budget on desktop and tablet?

The POC does not implement the overworld, full economy, port menus, boarding
duel, campaign save, relationships, or conquest. Its HUD may show inherited
career context—months of provisions, crew, morale—to test hierarchy, but those
values are not simulated here.

## Quality gates

- [ ] `mise exec node@20 -- npm test` baseline and final suite pass.
- [ ] Domain tests fail before implementation and cover wind, turning, reload,
  side-of-ship legality, ammunition-specific damage, surrender, and escape.
- [ ] Same seed plus same command sequence produces byte-equivalent snapshots.
- [ ] Sloop reads as one-masted sailing craft in side, bow, stern, top, and
  three-quarter renders at 320 px.
- [ ] GLB retains named Hull, Sail, Rudder, Gun, and Rig nodes.
- [ ] Optimized ship is under 250 KB and under 15,000 rendered triangles unless
  visual review records a justified exception.
- [ ] Integrated browser harness has no failed asset or console requests.
- [ ] Player and enemy remain distinguishable without relying on flag colour.
- [ ] Keyboard and touch controls work; focus is visible; reduced motion works.
- [ ] Two desktop and two tablet/phone screenshots survive visual self-review.
- [ ] POC maintains 50+ FPS in the Playwright desktop sample; a real iPad
  measurement remains a follow-up if no device is connected.

## Task 1: Repository and harness contract

**Files:** modify `vite.config.ts`, `knip.json`; create
`preview-caribbean.html`, `src/games/caribbean-poc/preview.tsx`, and styles.

- [ ] Add the POC as a `BUILD_HARNESS`-only Vite input so it never enters the
  released PWA.
- [ ] Add the entry to knip and load shared design tokens plus POC styles.
- [ ] Mount a semantic page with full-bleed scene, live region, pause, keyboard
  help, and large labelled controls.
- [ ] Verify the empty harness in a real browser before scene work.

## Task 2: Deterministic battle domain (TDD)

**Files:** create `domain/types.ts`, `domain/battle.ts`, and
`domain/battle.test.ts`.

- [ ] RED: hand-derived table tests for wind polar speed, reefed turn authority,
  and zero-drive bow-to-wind boundary.
- [ ] GREEN: implement angle normalization and fixed-step ship movement.
- [ ] RED: tests prove only the correct loaded broadside fires and reload is
  blocked until elapsed.
- [ ] GREEN: create deterministic projectile spread from stored RNG state.
- [ ] RED: tests prove round prioritizes hull, chain sails, grape crew, with
  literal expected values at near and far ranges.
- [ ] GREEN: implement collision/damage events without Three.js types.
- [ ] RED/GREEN: surrender, sinking, escape boundary, pause, and replay
  determinism.
- [ ] Mutation check: invert each damage branch, remove reload change, swap
  broadside normal, and remove wind response; confirm a specific test catches
  each plausible break.

## Task 3: Blender sloop pipeline

**Files:** create `tools/caribbean-sloop/build_sloop.py` and generated assets in
`tools/caribbean-sloop/output/`; game GLB in `assets/`.

- [ ] Script scene reset, materials, units, transforms, collection hierarchy,
  camera, lighting, world, and deterministic render settings.
- [ ] Build a curved ring-based hull mesh with readable sheer, keel, deck,
  stern, bowsprit, one mast, boom/gaff, mainsail, jib, rudder/tiller, six small
  guns, rail, anchors, and restrained rigging.
- [ ] Name movable/semantic nodes: `Hull`, `Rudder`, `Sail_Main`, `Sail_Jib`,
  `Gun_Port_*`, `Gun_Starboard_*`, `Rig_*`.
- [ ] Use bevelled/faceted geometry and a small material palette; no texture is
  required for the first gate.
- [ ] Render side, bow, stern, top, and port/starboard three-quarter stills plus
  one contact sheet.
- [ ] Export `.blend` and raw GLB, then run the existing GLB optimizer.
- [ ] Generate a JSON report with Blender version, object/node names, material
  names, triangles, vertices, dimensions, raw/optimized bytes, and render paths.
- [ ] Review at full size and 320 px; fix silhouette before adding detail.

## Task 4: Three.js battle renderer

**Files:** create `three/BattleScene.ts`, `three/loadSloop.ts`,
`components/BattlePoc.tsx`; import optimized GLB.

- [ ] Load Meshopt-compressed GLB once and clone it for two teams.
- [ ] Preserve sail/hull material identity; combine material colour with flag,
  sail mark, and silhouette-facing UI for redundant identification.
- [ ] Build low-cost ocean shader/geometry, horizon haze, island silhouette,
  directional sun, sky gradient, wind streamlines, and shadow budget.
- [ ] Interpolate domain positions; add visual-only bob, pitch, roll, heel,
  rudder angle, sail response, recoil, wake, and camera damping.
- [ ] Pool cannonballs, smoke, muzzle flash, splashes, and damage debris.
- [ ] Use a readable trailing/overhead hybrid camera and prevent the HUD from
  covering either broadside.
- [ ] Dispose renderer, geometry, materials, textures, observers, and animation
  frame on teardown.

## Task 5: Playable encounter and opponent

**Files:** modify `BattlePoc.tsx`; create `domain/opponent.ts` and tests if AI
branches exceed trivial steering.

- [ ] Bind keyboard, pointer, touch, pause, and reduced-motion input.
- [ ] Implement a deterministic opponent with states Close, Seek Broadside,
  Fire, Recover, and Flee; its choice reads wind and damage.
- [ ] Provide Restart, two scenario presets, and an optional debug overlay for
  collision radii, broadside arcs, wind vector, fixed-step count, FPS, draw
  calls, and triangles.
- [ ] End with a clear result and concise tactical recap.

## Task 6: Browser review loop

**Artifacts:** write versioned PNGs to `docs/screenshots/caribbean-poc/` and a
review record to `poc-review.md`.

- [ ] Capture desktop 1440×900, tablet landscape 1180×820, tablet portrait
  820×1180, and phone 390×844 with reduced motion off and on.
- [ ] Record console errors, failed requests, WebGL renderer, average/min FPS,
  draw calls, triangles, GLB load time, and screenshot state/seed.
- [ ] Review pass 1: composition, silhouette, target clarity, HUD hierarchy,
  colour contrast, touch reach, motion, and accidental generic visual language.
- [ ] Apply focused fixes and capture pass 2 under identical seeds/cameras.
- [ ] Compare 320 px ship crops to Blender contact sheet and document any
  engine-lighting or camera mismatch.

## Task 7: Verification and production recommendation

**Files:** create `poc-review.md` and `production-roadmap.md`.

- [ ] Run clean `npm run check`, full `npx vitest run`, GLB optimizer self-test,
  clean `npm run build`, harness build, and `git diff --check` under Node 20.
- [ ] List what the POC proves, what it rejects, known gaps, measured budgets,
  and the next most valuable vertical slice.
- [ ] Write the structured production roadmap with phases, task dependencies,
  exact files/modules, tests, acceptance criteria, art pipeline, content and
  history gates, telemetry, release path, and explicit deferrals.
- [ ] Commit docs, source, generated game asset, selected renders/screenshots,
  and reports on the isolated branch. Exclude redundant raw intermediates if
  they do not improve reproducibility.

## Stop conditions

Do not produce a second ship class until the sloop passes the integrated gate.
Do not expand the battle into campaign systems to make the demo look larger.
If the scene fails the frame budget, reduce water/particle/shadow cost before
reducing the hero ship silhouette. If battle choices are unclear, change
feedback and timing before adding another mechanic.
