# Next Steps — Session Handoff

> Future-focused. Anything already shipped lives in `git log`.
> Durable rules live in `CLAUDE.md` (and `AGENTS.md` for other agents).

---

## What to pick up next

Sorted by likely value. Nothing here blocks anything else.

### Code

- **Ship Battle visual glow-up — image-asset ships.** The whole plan is in
  "The Ship Battle glow-up" below. This is the active piece of work; assets are
  being generated now.

- **Wire `era` through the fleet-skin system.** `domain/skins.ts` and
  `components/FleetSelect.tsx`. Each `skinId` should imply `{era, color}` so two
  players can field different eras in the same battle. Small and independent of
  the art — can land before any asset exists.

- **Decide on the 62 react-hooks warnings.** `npm run check` passes with them
  as warnings (rationale in `eslint.config.js`). Most are the deliberate
  game-loop pattern — a ref holding per-frame state the HUD reads — but
  `PartyContext.tsx:72` writes a ref during render, which is the one shape
  that can actually misbehave under concurrent rendering. Worth a look on its
  own. Scope: an hour to triage, unknown to fix.

- **Add game screens to the screenshot set.** `SHOTS` in
  `scripts/screenshots.mjs` covers the landing page (tablet + phone), privacy,
  and the battle harness. Chess, Risk, Racer, and Magic Coins have no shot, so
  a regression in them is invisible to `npm run shots`. Each needs either a
  route that lands somewhere interesting or a small harness page like
  `preview-b.html`.

- **The 3D scenes have no automated visual coverage.** jsdom can't do WebGL, so
  the tests only assert the fallback renders. The screenshot script *can* drive
  real WebGL (ANGLE flags are already set). A shot of the Ship Battle 3D view
  and the Racer world would turn "the scene still builds" into something CI
  could see.

### Operations

- Nothing pending. Branch `claude/starter-kit-alignment` is the current PR;
  see it for what landed.

---

## The Ship Battle glow-up

Dramatically improve Ship Battle's 3D look. The scene is
`src/games/battleship/components/three/FleetScene.ts` — a night ocean with a
10×10 targeting grid. `Fleet3D.tsx` feeds it the fleet plus the incoming-shot
grid; `Battle.tsx` offers the 2D/3D toggle. It's read-only and orbit-only, and
all geometry is procedural today.

### The pivot: ships become image assets

The procedural ship models weren't good enough. Ship art is authored as
**PNG assets** by an image-generation agent, and the scene places those instead
of procedural geometry. Everything else in the scene stays procedural.

**Offline invariant (must hold):** no runtime downloads. Assets are `import`ed
so Vite hashes them into `dist/`. Never fetch an image from a URL.

### How image ships render

Each ship is a **textured quad laid flat on the grid**, sized `size × 1` cells
and oriented by `orientation` (H/V), so it stays correct as the camera orbits
and lines up with the hit/miss cells. That means the art wants a **top-down or
slight-high-angle** view. Confirm the angle with the image agent against one
test ship before generating a full set — a 3/4-view sprite would need a
billboard instead, which reads wrong against a flat grid.

### Art spec to lock with the image agent

- **5 ship types**: `carrier, battleship, cruiser, submarine, destroyer` (the
  `ShipId`s in `domain/types.ts`; `BOARD_SIZE = 10`).
- **2 eras**: **modern** first, **classic/WWII** second → 10 base images.
  - *Modern*: supercarrier, Zumwalt-style stealth "battleship" (battleships
    aren't modern), Ticonderoga-style cruiser, Arleigh Burke-style destroyer,
    Virginia-class attack sub. Sleek stealth hulls.
  - *Classic*: Iowa battleship, Essex carrier, heavy cruiser, Fletcher
    destroyer, surfaced U-boat with conning tower and deck gun.
- **State variants** (nice to have): normal, **damaged**, **sunk** (dark,
  listing, half-submerged). The scene knows per-cell `CellState` —
  `'unknown' | 'miss' | 'hit' | 'sunk'` — and whether a ship is sunk.
- **Format**: transparent-background PNG; one consistent viewing angle across
  all five; neutral/night lighting so the scene's own lighting and skin tint
  can apply; bow pointing **+x** (horizontal) so `orientation` is a rotation;
  one shared cells-per-pixel ratio across all five so a carrier reads as
  genuinely longer than a destroyer; power-of-two-ish dimensions.
- **Location**: `src/games/battleship/assets/ships/<era>/<shipId>.png`, behind
  a manifest mapping `{era, shipId, state}` → imported URL.

### Atmosphere and FX (approved in mockups, not yet in code)

- **Remove the glowing board-rim frame** (the neon rectangle). Keep a faint grid.
- **Night sky**: vertical gradient background, a seeded scatter of stars
  (Points), a low moon with a soft halo.
- **Water**: satiny moonlit sea — procedural ripple normal map plus gentle
  vertex swell, moonlight glinting off the ripples. Do **not** put a glossy
  mirror/env reflection on the big plane; it pools the specular into ugly blobs
  (learned the hard way). Keep `envMapIntensity: 0`, `roughness ≈ 0.5`,
  `metalness ≈ 0.15`.
- **Bloom**: `EffectComposer` + `UnrealBloomPass`, so fires, the moon, and
  emissives read as glowing. This is the one piece with real render-loop cost —
  tune for iPad, wire resize and dispose, and check FPS.
- **Impact FX**, replacing the current small fire/foam markers:
  - *Hit* → fireball: white-hot core, orange/red fireballs, flung sparks, a
    rising smoke column, a shockwave ring on the water.
  - *Miss* → geyser: glowing water plume, foam crown, 2–3 expanding foam rings,
    spray droplets.
- **No glowing accent waterline stripes** on ships — they read as odd neon.

### Firing animation (after the ships look right)

On the **shooter's own board** (not the receiver's), animate taking a shot: a
muzzle flash at the firing ship's gun and a shell/tracer arcing away. Distinct
from the impact FX on the *receiver's* board. See `Battle.tsx`,
`state/useBattleship.ts`, and `domain/session.ts` for where a shot starts and
where the sync happens.

### Order of work

1. Lock the art spec above with the image agent; generate the **modern** set.
2. Add `assets/ships/…` plus the manifest.
3. In `FleetScene.ts`: replace `buildWarship(...)` with a textured quad per
   ship, sized and oriented from `SceneShip`. Then the atmosphere (sky, stars,
   moon, water), bloom, and the impact FX; remove the neon frame.
4. Wire `era` through `skins.ts` + `FleetSelect.tsx`.
5. Verify: `npm run check`, `npx vitest run`, `npm run build`,
   `npm run shots -- battle`. Open the PR.
6. Then the **classic/WWII** set, then the shooter-side firing animation.

### Anchor files

| File | What it owns |
| --- | --- |
| `components/three/FleetScene.ts` | the scene — ships, water, grid, markers, camera |
| `components/Fleet3D.tsx` | React wrapper; try/catch → `*-fallback` |
| `components/Battle.tsx` | 2D/3D toggle, fire flow |
| `components/FleetSelect.tsx` | skin picker (era goes here) |
| `domain/skins.ts` | skin/colour system (era goes here) |
| `domain/types.ts` | `BOARD_SIZE`, `ShipId`, `Orientation` |
| `domain/engine.ts` | `CellState` |
| `preview-b.html` + `preview-b.tsx` | mid-battle harness the screenshot run uses |

`SceneShip` (in `FleetScene.ts`) is `{ shipId, row, col, size, orientation, sunk? }`.

---

## Ground rules

1. **One feature = one branch cut fresh from `origin/main`.** The owner
   rebase-merges within minutes, mid-session. Before every push:
   `git fetch origin main`, then `git cherry origin/main <commits>` — a `-`
   prefix means it already landed, so re-cut a branch and cherry-pick. Never
   stack on merged history; never make a merge commit on a PR branch.
2. **One logical operation per Bash call** — no `&&`, `||`, `;`. A PreToolUse
   hook enforces it.
3. **All three gates green before a PR**: `npm run check`, `npx vitest run`,
   `npm run build`.
4. **UI changes need a screenshot** from `npm run shots`, committed with the
   change.
5. **Big visual changes are pitched as mockups first** — roughly three labelled
   options; the family picks; then you build.
6. **Never break the offline invariant.** No runtime downloads, ever.
7. Remote branch deletion is the owner's job via the GitHub Branches page —
   `git push --delete` returns 403 in the sandbox. Don't route around it.

---

## Tooling reminders

- `npm run shots` uses port 4317; `npm run dev` uses 5173. `pkill -f "vite
  preview"` exits 144 — run it on its own or tolerate the code.
- Playwright browsers install per-machine: `npx playwright install chromium`.
  In the sandbox, set `PW_CHROMIUM` instead.
- Delete stray `*.tsbuildinfo` before trusting a build — `tsc -b`'s incremental
  cache has hidden real type errors.
- jsdom has no WebGL, no layout, and sometimes no `matchMedia`. 3D components
  must catch construction errors and render a `*-fallback`; tests assert that.
  Drag/geometry tests stub per-element rects keyed off `data-row`/`data-col`.
- If the owner says "I don't see the change" after a merge: the deploy is
  probably fine — the service worker serves the old build until the app is
  fully closed and reopened. Check the deploy run, then explain that.
