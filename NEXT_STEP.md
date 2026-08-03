# NEXT_STEP — Ship Battle visual glow-up (image-asset ships)

Working note so any session (or a local machine) can pick up exactly where we
are. This is a **living plan**, not history — keep it current, delete what's done.

## The goal

Dramatically improve **Ship Battle**'s 3D look. The scene (`src/games/battleship/
components/three/FleetScene.ts`) is a night ocean with a 10×10 targeting grid; the
React wrapper `Fleet3D.tsx` feeds it the fleet + incoming-shot grid, and `Battle.tsx`
offers a 2D/3D toggle. It's read-only + orbit-only; all geometry is procedural today.

## KEY PIVOT (this is the new direction)

The **procedural 3D ship models were not good enough**. We are switching to
**image-based ships**: ship art is authored as **PNG/JPEG assets** by a
specialized image-generation agent, and the scene places those images instead of
procedural geometry.

- **Keep** the rest of the 3D scene we designed (see "Atmosphere & FX" below):
  moonlit water, night sky, bloom, and the impact FX. Only the **ships** become
  image sprites.
- **Offline invariant (must hold):** no runtime downloads. Assets must be
  **bundled** (imported through Vite so they're hashed into `dist/`), never
  fetched from a URL at runtime. Bundled images are fine; remote images are not.

### How image ships should render (decision needed on the local machine)
Leading option: each ship = a **textured quad/sprite** placed over its board cells
on the water — either laid flat on the grid (top-down art) or a billboard that
faces the camera (3/4 art). Recommendation: **top-down (or slight-high-angle) art
laid onto the grid**, sized to `size × 1` cells, oriented by `orientation` (H/V),
so it reads correctly as the camera orbits and matches hit/miss cells. Confirm the
art's viewing angle with the image agent before generating a full set.

### Art the image agent should produce
- **5 ship types**: `carrier, battleship, cruiser, submarine, destroyer`
  (these are the `ShipId`s in `domain/types.ts`; `BOARD_SIZE = 10`).
- **2 eras/themes** (see below): **modern** and **classic (WWII)**.
  → 5 types × 2 eras = **10 base ship images** minimum.
- **State variants** per ship (nice to have): normal, **damaged** (some hits),
  **sunk** (dark/listing/half-submerged). The scene knows per-cell state
  (`CellState = 'unknown' | 'miss' | 'hit' | 'sunk'`) and whether a ship is sunk.
- **Specs to lock with the agent:** transparent background PNG; consistent
  top-down (or fixed 3/4) angle; consistent lighting (night/neutral so our scene
  lighting/tint can apply); horizontal orientation (bow = +x) at a known pixel
  scale so all 5 types share one cells-per-pixel ratio; power-of-two-ish sizes.
- **Where they live:** `src/games/battleship/assets/ships/<era>/<shipId>.png`
  (import via `import url from '...png'`, or a small manifest map). Vite bundles them.

## The two eras (a selectable theme)

- **MODERN** (first): supercarrier, Zumwalt-style stealth "battleship" (the modern
  equivalent — battleships aren't modern), Ticonderoga-style cruiser, Arleigh
  Burke-style destroyer, Virginia-style attack sub. Sleek stealth hulls.
- **CLASSIC / WWII** (second): Iowa battleship, Fletcher destroyer, Essex carrier,
  heavy cruiser, and a **U-boat** submarine (surfaced, conning tower + deck gun).
- **Chosen how:** **per-player fleet skin.** Era folds into the existing fleet-skin
  selection (`FleetSelect.tsx` + `domain/skins.ts`), so two players can even field
  different eras in the same battle. Each player's `skinId` implies `{era, color}`.

## Atmosphere & FX to build into FleetScene (agreed in mockups, NOT yet in code)

These were prototyped and approved via rendered mockups; keep them when we build:
- **Remove the glowing board-rim frame** (the neon rectangle). Keep a faint grid.
- **Night sky**: vertical gradient background + a scatter of stars (seeded Points)
  + a low moon with a soft halo.
- **Water**: satiny moonlit sea — a procedural ripple **normal map** + gentle vertex
  swell; the moonlight glints off the ripples. Do NOT use a glossy mirror/env
  reflection on the big plane (it pools the specular into ugly blobs — learned this
  the hard way; keep `envMapIntensity: 0`, `roughness ≈ 0.5`, `metalness ≈ 0.15`).
- **Bloom**: add `EffectComposer` + `UnrealBloomPass` to the render loop (so fires,
  the moon, and any emissive read as glowing). Tune for iPad perf; wire resize +
  dispose. This is the one piece with real render-loop cost — verify FPS.
- **Impact FX** (replace the current small fire/foam markers):
  - **Hit → fireball explosion**: white-hot core + orange/red fireballs + flung
    sparks + a rising smoke column + a shockwave ring on the water. Bloom makes it
    burn.
  - **Miss → geyser splash**: a glowing water plume + foam crown + 2–3 expanding
    foam rings + spray droplets.
- **No glowing accent waterline stripes** on ships (they read as odd neon — dropped).

## Firing animation (after ships look good)

On the **shooter's own board** (not the receiver's), animate the act of firing when
the player takes a shot: a **muzzle flash** at the firing ship's gun + a **shell /
tracer** arcing away. This is distinct from the impact FX that appear on the
*receiver's* board. Hook into the game's fire event (see `Battle.tsx` / `useBattleship`
/ `domain/session.ts` for where a shot is initiated and where the sync happens).

## Constraints & how to verify (from CLAUDE.md)

- `npx vitest run` and `npm run build` must be clean. Real typecheck is the `tsc -b`
  inside `npm run build`; delete stray `*.tsbuildinfo` before trusting it.
- The racer's/battleship's 3D component must catch scene-construction errors and
  render a fallback (`racer3d-fallback` / battleship equivalent); jsdom has no WebGL,
  so tests assert the fallback. Keep that intact.
- Prove UI in a real browser: headless chromium at
  `/opt/pw-browsers/chromium-*/chrome-linux/chrome`, serve `vite preview`, screenshot.
- three.js is `React.lazy`-loaded and shared by chess + battleship; keep it that way.
- Determinism: seed any generated scenery/randomness (index-hash or an LCG), no
  `Math.random` for anything that affects appearance/tests.
- Git: one feature = one branch off `origin/main`; PRs merge fast; re-fetch before
  each push. Never stack on merged history.

## Anchor files

- `src/games/battleship/components/three/FleetScene.ts` — the scene (ships, water,
  grid, markers, camera). This is where image-ship placement + atmosphere + FX go.
- `src/games/battleship/components/Fleet3D.tsx` — React wrapper; try/catch → fallback.
- `src/games/battleship/components/Battle.tsx` — 2D/3D toggle; fire flow.
- `src/games/battleship/components/FleetSelect.tsx` — skin picker (add era here).
- `src/games/battleship/domain/skins.ts` — skin/color system (add era).
- `src/games/battleship/domain/types.ts` — `BOARD_SIZE=10`, `ShipId`, `Orientation`.
- `src/games/battleship/domain/engine.ts` — `CellState`.
- `SceneShip` (in FleetScene.ts): `{ shipId, row, col, size, orientation, sunk? }`.

## Status

- **Merged to main this session:** Rainbow Racer model + world glow-up
  (`FleetScene`… no — `src/games/racer/three/scene.ts`); party name length-bound;
  earlier: the Party system, recent names, privacy page, audits, iOS icons.
- **Ship Battle:** nothing built yet — only rendered mockups (now superseded by the
  image-asset pivot). Procedural ship mockups are abandoned.
- **Reference mockups (procedural, for atmosphere/FX only, NOT the ships):** the
  night-ocean + explosion/splash look and the moonlit water are the target for the
  scene around the image ships.

## Immediate next steps (on the local machine)

1. Lock the **image spec** with the image agent (angle, scale, transparency,
   per-era set, damaged/sunk variants). Generate the **modern** set first.
2. Add `src/games/battleship/assets/ships/…` and a manifest that maps
   `{era, shipId, state}` → imported asset URL.
3. In `FleetScene.ts`: replace `buildWarship(...)` geometry with a **textured quad**
   per ship (sized/oriented from `SceneShip`), keep everything else. Add the
   atmosphere (sky/stars/moon/water) + bloom + explosion/splash FX; remove the neon
   board frame.
4. Wire **era** through the skin system (`skins.ts` + `FleetSelect.tsx`).
5. Verify (`vitest`, `build`, headless screenshot). PR.
6. Then: the **classic/WWII** set, then the **shooter-side firing animation**.
