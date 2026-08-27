# Caribbean Encounter, Battle HUD, and Water Rendering Implementation Plan

> **For agentic workers:** Execute this plan in order with strict RED → GREEN cycles. Preserve every existing deterministic campaign, accessibility, evidence, and publication contract. Do not update tracked screenshots until the implementation and visual review are complete.

**Goal:** Ship the approved map-led encounter screen and action-led naval battle HUD, validate both against real browser captures and an ImageGen critique, then improve the naval water rendering without making ships feel light or increasing the evidence/runtime risk beyond the current WebGL budget.

**Architecture:** Introduce a reusable offline Caribbean map surface backed by the already-installed `world-atlas`, `topojson-client`, and `d3-geo` packages. Keep voyage decisions and naval commands in their existing controller/session boundaries; the redesign changes presentation and accessibility, not game rules. Isolate water optics in a small, testable shader-definition module while retaining the existing deterministic low-amplitude displacement and ship-motion constants.

**Tech Stack:** React 18, TypeScript, SVG, d3-geo, world-atlas, Three.js r170/WebGL, Vitest, Testing Library, Playwright/native evidence harnesses, ImageGen.

**Approved visual targets:**

- `docs/superpowers/specs/2026-08-27-caribbean-encounter-map-concept-v2.png`
- `docs/superpowers/specs/2026-08-27-caribbean-battle-concept-v4.png`
- `docs/games/caribbean-career/visual-references/1732-herman-moll-west-indies.jpg` (geographic/style reference only; not a runtime asset)

## Global constraints

- Bundle every runtime asset; no network fetches in the game.
- Preserve encounter outcome rules, session inputs, QWERTY shortcuts, pause ownership, terminal focus, and campaign persistence behavior.
- Keep all readable UI text at 14px or larger, all controls at least 44px, keyboard operation complete, focus states visible, and reduced-motion behavior intact.
- Show reload state only for the player's port and starboard batteries.
- Keep the full six-command order: A turn port, Q fire port, S change shot, R change sail, E fire starboard, D turn starboard. Change shot cycles ROUND → CHAIN → GRAPE.
- Make the action and icon primary; render the shortcut as a small secondary keycap.
- Keep both Fire controls directional: port points left, starboard points right.
- Keep all six command modules the same height; make Change Shot modestly wider than Change Sail without stealing excessive scene width.
- Keep calm, low-amplitude water displacement and restrained hull heave/pitch/roll. Rendering improvements must add readable scale and optical depth, not larger waves.
- Preserve screenshot/evidence schemas and deterministic capture seams unless a separately reviewed contract change is required.

## Task 1: Lock map geography and interaction behavior

**Files:**

- Create: `src/games/caribbean/components/map/CaribbeanMap.tsx`
- Create: `src/games/caribbean/components/map/CaribbeanMap.test.tsx`
- Create: `src/games/caribbean/components/map/mapView.ts`

1. Add failing tests that require:
   - a labelled Caribbean chart region;
   - real projected land paths from the bundled world atlas;
   - Bridgetown, the player ship, and Red Jackdaw markers;
   - a dashed route from Bridgetown to the contact;
   - labelled Barbados, St Lucia, Martinique, Dominica, Guadeloupe, and Trinidad context;
   - accessible Zoom in, Zoom out, and Reset view buttons;
   - wheel zoom, pointer drag/pan, keyboard reset, bounded scale, and deterministic reset state.
2. Run the focused test and confirm the component is absent or the required behaviors fail.
3. Implement a pure map-state reducer/helper with bounded zoom and pan.
4. Render a responsive SVG using a fixed geographic projection and the bundled Natural Earth/world-atlas land data.
5. Add screen-reader route facts and deterministic test IDs; keep the dense chart drawing decorative.
6. Rerun the focused tests to GREEN.

## Task 2: Recompose the encounter decision screen

**Files:**

- Modify: `src/games/caribbean/components/voyage/EncounterPage.tsx`
- Modify: `src/games/caribbean/components/voyage/EncounterPage.test.tsx`
- Modify: `src/games/caribbean/styles/voyage.css`
- Retire or simplify: `src/games/caribbean/components/voyage/VoyageInstrument.tsx`
- Modify tests as needed: `src/games/caribbean/components/voyage/VoyageInstrument.test.tsx`

1. Replace old prose assertions with failing tests for the approved information hierarchy:
   - map occupies the main region;
   - decision panel is the secondary region;
   - target identity, bearing, distance, wind, and decision requirement are immediately readable;
   - Avoid explicitly states the day/provision cost and that the lead remains active;
   - Pursue explicitly states the naval engagement consequence;
   - existing async single-flight and status-announcement behavior remains exact.
2. Run the focused encounter/map tests and observe the intended failures.
3. Implement the split layout with the shared map and two substantial decision cards.
4. Add responsive behavior that stacks the decision panel below the map without hiding map controls or shrinking text below 14px.
5. Rerun encounter and voyage tests to GREEN.

## Task 3: Build the action-first naval command rail

**Files:**

- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/components/battle/BattleHud.tsx`
- Modify: `src/games/caribbean/components/battle/BattleHud.test.tsx`
- Modify: `src/games/caribbean/components/battle/BattleShortcutLegend.tsx`
- Modify: `src/games/caribbean/components/battle/BattleShortcutLegend.test.tsx`
- Modify: `src/games/caribbean/styles/battle.css`

1. Add failing component tests for:
   - directional rudder, cannon, shot, and sail SVG icons;
   - left-facing Fire Port and right-facing Fire Starboard icon orientation;
   - equal semantic command modules with small shortcut keycaps;
   - Change Shot showing the current shot and the ROUND → CHAIN → GRAPE cycle;
   - player-only battery reload bores/segments and readiness text;
   - no opponent reload timing or battery progress disclosure;
   - unchanged keyboard and pointer behavior.
2. Run the focused battle tests and observe the intended failures.
3. Add small local SVG action-icon components and a segmented player reload indicator.
4. Recompose the HUD rails and six-command dock to match the approved v4 composition.
5. Keep Pause/Options usable but visually subordinate to the core battle actions.
6. Add responsive CSS for 1440×900, 1180×820, 1024×768, and 960×540 without clipping or reducing hit targets.
7. Rerun the focused battle tests to GREEN.

## Task 4: Capture and critique the implemented UI

**Files:**

- Update only after implementation review: the existing Caribbean screenshot/evidence paths selected by repository tooling.
- Store critique artifacts under ignored temp/report paths; do not commit transient debug captures.

1. Run `npm run check`, focused Caribbean tests, and a normal production build.
2. Start the local preview and capture the real encounter and battle screens at desktop and minimum supported sizes.
3. Inspect every capture at original resolution for hierarchy, alignment, readability, clipping, and scene-to-UI balance.
4. Send the real desktop encounter and battle captures to ImageGen with the approved concepts as references and request a preservation-oriented critique/mockup:
   - keep all implemented information and controls;
   - improve only composition, spacing, contrast, and maritime character;
   - keep shortcut keycaps secondary;
   - do not invent commands, enemy reload indicators, or decorative chrome that obscures play.
5. Compare the ImageGen result against real browser constraints. Translate only feasible, behavior-preserving improvements into CSS/component changes.
6. Add or adjust tests for each material refinement, rerun focused tests, and capture again.

## Task 5: Write the ocean-rendering research recommendation

**Files:**

- Create: `docs/games/caribbean-career/naval-water-rendering-research.md`

1. Document the three user-supplied primary references:
   - `squall01337/abyssal-ocean` (WebGL2, FFT/JONSWAP, multi-cascade spectrum, measured optics);
   - `achrefelouafi/OceanThreejs` (modular WebGL2 FFT/Gerstner ocean and physically based shading);
   - `owenyuwono/poseidon` (WebGPU-only Tessendorf FFT with three cascades and measured water optics).
2. Record licenses, browser/GPU requirements, architectural costs, and the techniques safe to borrow conceptually.
3. Recommend an incremental path for this project:
   - now: analytic normal reconstruction, multi-scale deterministic micro-ripples, Fresnel, directional sun glint, sky/horizon color coupling, and subtle absorption/scatter;
   - later: improved wake/foam field if it remains inside budgets;
   - defer: FFT compute cascades, float render targets, WebGPU-only paths, underwater rendering, and large radial grids.
4. Cite the original repositories and distinguish inspiration from copied code. Do not copy source code.

## Task 6: Improve calm-water optics with a testable shader boundary

**Files:**

- Create: `src/games/caribbean/three/naval/waterShader.ts`
- Create: `src/games/caribbean/three/naval/waterShader.test.ts`
- Modify: `src/games/caribbean/three/naval/waterPresentation.ts`
- Modify: `src/games/caribbean/three/naval/waterPresentation.test.ts`
- Modify: `src/games/caribbean/three/naval/NavalScene.ts`
- Modify: `src/games/caribbean/three/naval/NavalScene.test.ts`

1. Add failing tests that require:
   - the existing maximum displacement and ship-motion constants remain unchanged;
   - three deterministic small-scale wave directions/frequencies contribute to normals without materially increasing displacement;
   - Schlick Fresnel, directional sun glint, horizon/sky coupling, depth-toned absorption, and bounded micro-ripple detail are present;
   - no random source, texture/network fetch, FFT/compute dependency, preserved drawing buffer, or additional animation clock is introduced;
   - the scene consumes the exported shader definition and existing time uniform.
2. Run the focused shader/presentation tests and observe intended failures.
3. Implement a compact GLSL shader-definition module derived from analytic sine-wave gradients and deterministic uniforms/constants.
4. Replace the inline water shader in `NavalScene` and increase mesh tessellation only if browser metrics remain inside the existing draw/triangle budgets.
5. Keep water movement visually small relative to both ships; do not alter the battle simulation or camera.
6. Rerun focused rendering tests to GREEN.

## Task 7: Final verification, evidence, and integration

**Files:**

- Modify generated Caribbean evidence only through the approved repository capture commands.
- Update relevant README evidence wording only if the visible contract changed.

1. Run focused map, encounter, battle, and water tests.
2. Run `npm run check` and `npx vitest run` serially.
3. Run forced TypeScript build and normal production build.
4. Run the existing real-browser Caribbean journey, naval provenance, semantic, voyage, battle, and temporary A/B port gates serially; do not run concurrent browser captures.
5. Generate screenshots through the existing hash-aware capture tooling. Verify unchanged images remain byte-identical and only honest visual changes are updated.
6. Inspect changed PNGs at original resolution, including desktop and minimum supported layouts.
7. Request an independent code/visual review, fix all valid findings with RED → GREEN tests, and rerun proportionate gates.
8. Stage only intended source, docs, and generated evidence. Verify `git diff --check`, exact scope, and clean post-commit status.
