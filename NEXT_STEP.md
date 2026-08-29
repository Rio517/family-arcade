# Next Steps — Session Handoff

> Future-focused. Anything already shipped lives in `git log`.
> Durable rules live in `CLAUDE.md` (and `AGENTS.md` for other agents).

---

## What to pick up next

Sorted by likely value. Nothing here blocks anything else.

### Code

- **One ticket, every game — phases 3–4.** The design and the phase list live
  in `docs/planning/players-and-party.md`. Shipped 2026-08-29: Phase 1 (no
  game asks the signed-in player for a name; the ticket list at the gate,
  behind "Change", and at the booth) and Phase 2 (pass-and-play chairs in
  Chess same-device, Risk and Magic Coins are tickets tapped from the roster,
  remembered per game in `arcade.lineup.v1`; `useIdentity` owns every name
  writer and `src/games/**` cannot import it). Next, in order, each its own
  PR:

  3. **The party is the table.** Shipped 2026-08-29 in two PRs (#131 the
     party layer: `arcade.party.v1` memory, `table`/`knock`, the gold pill;
     then the game seam: `startTable({ role, code, seatedUserId, hostSide? })`
     in `useChess`/`useBattleship`/`useRacerNet`, every session keeping its
     ticket id, the three lobbies branching on the party — host "Play Chess
     with Kai", guest knocks and auto-joins, `closeTable` on leaving).
     `preview-lobbies.html` screenshots the party lobbies.
  4. **Everyone's history.** Shipped 2026-08-29. `recordResultFor(userId, …)`
     (`src/shared/profile/results.ts`) replaced `useProfile().recordResult`;
     every game records for the ticket id it captured at the start — chess
     same-device (a win and a loss), chess online and Ship Battle (the seated
     captain, solo included), racer 2P (the racer on each device), Risk (the
     winning general). Draws, ties, bots and empty chairs record nothing.
     **Left open:** Magic Coins' champions carry `userId` on `PlayerConfig`
     but record nothing — decide whether a coin round is a "result" worth
     arcade points before wiring it.

  The one-ticket plan is complete. Its open findings live in the audit PRs
  (#125, #127, #133 and the Phase 4 audit) — the chess colour agreement on
  the game link and the game links' 20 s dial window are the two worth
  doing first.

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
  `PartyContext.tsx` writes `nameRef` during render (the line flagged
  "Cannot access refs during render"), which is the one shape that can
  actually misbehave under concurrent rendering. Worth a look on its own.
  Scope: an hour to triage, unknown to fix.

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

### Tidewave — what we want it for

Installed 2026-08-10 (`tidewave()` Vite plugin + `.mcp.json`). Setup notes and
the offline-invariant check live in `CLAUDE.md`; this is the work it's *for*.

**The reason it's here.** A pointer-capture bug made every territory in Risk
unclickable — `useMapZoom` captured on `pointerdown`, so the browser fired the
click on the `<svg>` and the territory's handler never ran. Neither test suite
noticed, because both drive the board with `dispatchEvent`, and a synthetic
click bypasses pointer capture entirely. Two green suites and a correct-looking
screenshot, over a game nobody could play. Tidewave's value here is that it
drives the *real* app with *real* input.

- **Audit every drag interaction in the arcade for the same bug class.** This is
  the highest-value use and it follows directly from the above. Nothing in this
  repo has ever been driven by a real pointer: chess piece drag-and-drop, Ship
  Battle's ship-placement drag, Racer's controls, Risk's pan and pinch. All are
  covered only by synthetic events, which is exactly the coverage that missed
  the Risk bug. Assume the same failure is sitting in at least one of them.
- **Re-verify Risk from the player's side** — tap a territory, drag to pan,
  pinch to zoom, on touch emulation as well as mouse. `npm run risk:drag` proves
  it under Playwright; this proves it in the thing the family actually uses.
- **Accessibility on a running page.** The a11y floors in `CLAUDE.md` are
  currently enforced *statically* — jsx-a11y catches JSX shapes, and nothing
  checks a live page for contrast, focus order, or an unreachable control.
  Tidewave Pro's accessibility reports fit that gap exactly.
- **Client-side errors during play.** Nothing watches the console today. A
  thrown error in a game loop is invisible until someone reports the symptom.
- **Point-and-click design review.** The Risk redesign burned several
  screenshot round-trips on "the thing in the top-right corner". Clicking the
  element instead is the single biggest saving for the owner's time, as opposed
  to the agent's.
- **The party / P2P layer, which has no live coverage.** `PartyContext` is
  unit-tested under a mocked link, and `preview-lobbies.html` screenshots
  the in-party states (the pill, and every lobby), but video, voice
  and the real peer connection need live browsers; jsdom can't go near them. Even driving one side of a call would be
  more than exists now.

Limits worth knowing before leaning on it:

- **Half of Tidewave doesn't apply here.** Its runtime intelligence is database,
  server logs and framework introspection; this is a static offline-first PWA
  with no backend. The value is entirely the browser-side features.
- **It runs against `npm run dev`, not the production build.** Service-worker
  and PWA behaviour differ between the two, and that difference has already
  bitten us — the SW served cached models and defeated network throttling while
  capturing the fleet loader. So it *complements* `npm run shots`, which serves
  real `dist/`; it does not replace it.
- **Keep the Playwright scripts.** `npm run shots` and `npm run risk:drag` are
  committed, free, need no account or dev server, and are the reproducible
  record. Tidewave is for exploration and for catching what we didn't think to
  script; the scripts are for making sure it stays caught.

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

### The pivot: ships become real meshes, generated from the art

Procedural ship geometry failed twice — first hand-written, then again via an
`img2threejs` agent that reconstructed a carrier as a flat slab with a lollipop
mast. An LLM sculpting geometry in code cannot recover 3D form from one view.
Stop trying.

The art is authored as **3/4 hero PNGs** (they live in `../assets/battlefleet/`,
5 modern ships, alpha-masked, ~1570×1000) and converted to **GLB meshes** with
an image-to-3D model. Sprites were considered and dropped: the battle camera's
azimuth is unconstrained (`FleetScene.ts` sets only polar limits, 0.15–1.35 rad),
so a flat 3/4 sprite reads correctly from one side and wrong from the other, and
a sprite can never animate a part.

**Offline invariant (must hold):** no runtime downloads. Assets are `import`ed
so Vite hashes them into `dist/`. Never fetch a model or image from a URL.

### Image-to-3D: what's settled and what isn't

**Settled — TRELLIS.2 works and the quality is good.** Run on the free
[HF Space](https://huggingface.co/spaces/microsoft/TRELLIS.2), the modern
destroyer came back as a correct 3D ship — hull, pyramid mast, hangar, helipad,
bow gun — verified by viewing it at an angle the input image never showed.

**Settled — it cannot run on this Mac.** TRELLIS.2 is CUDA-only (12–24 GB VRAM,
verified on A100/H100). The GGML port, `pwilkin/trellis.cpp`, has CUDA, Vulkan,
ROCm and CPU backends but *no Metal* and no macOS builds. The M4 mini is out.
`model_eval`'s local-LLM setup is unrelated and gives nothing here.

**The blocker — free ZeroGPU quota is about 5 minutes a day**, roughly one ship
per day; a full fleet would take a week and a half. Options: HF PRO (~$9/mo,
same UI), or duplicate the Space onto a paid GPU (~$0.40–1.00/hr, whole fleet in
under an hour, then delete it). Duplicating prompts for an HF token — the Space
itself declares no secrets, so a read-scoped token is only for HF's own dialog.

**Not yet measured — a real ship's size after optimisation.** The pipeline below
is proven on a synthetic 97k-triangle mesh, but no actual TRELLIS output has
been through it. Do that before paying for GPU time.

**Known limitation — TRELLIS emits one fused mesh, not named parts.** The
FLEET_REVIEW requirement that the submarine's four torpedo doors be separate,
animation-ready nodes will not come out of the generator; that needs splitting
in Blender afterwards. Judge how hard once a real GLB is in hand.

### The optimisation pipeline (built, tested)

`npm run glb -- <file.glb>` — see `scripts/optimize-glb.mjs`.

TRELLIS won't emit below 100k triangles with a 1024² texture, about 3 MB per
ship, against a whole installed PWA of ~1.5 MB. The pipeline welds, simplifies
to a triangle budget, shrinks the texture to WebP, and meshopt-compresses.

On the synthetic fixture: **3109 KB → 77 KB at 4,000 triangles / 256² texture**
(97.5% smaller), or 52 KB at 2,500 triangles / 192². So a ten-ship fleet lands
around **520–775 KB** — real but affordable. `npm run glb -- --selftest`
re-verifies end to end and prints the numbers.

Two deliberate choices, both load-bearing:

- **Node structure is preserved** — no flatten or join unless you pass
  `--flatten`. Ship parts must stay separate nodes for the torpedo doors.
- **Meshopt, not Draco** — three.js needs a decoder either way, but meshopt's is
  ~30 KB against Draco's ~200 KB of wasm, and on an offline PWA that decoder
  ships to every player. Loading requires
  `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`.

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
- **Format**: transparent-background PNG, one object on empty background — that
  is what the image-to-3D model wants. A consistent elevated 3/4 view across all
  five, neutral lighting so the scene's own lighting and skin tint can apply.
  The existing modern set already meets this.
- **Scale**: the five hulls must share one length ratio so a carrier reads as
  genuinely longer than a destroyer. Scale is re-established in the scene
  anyway (each ship spans `size × 1` cells), but consistent input art keeps
  proportions honest.
- **Location**: source art stays in `../assets/battlefleet/`; optimised
  models land in `src/games/battleship/assets/ships/<era>/<shipId>.glb`, behind
  a manifest mapping `{era, shipId}` → imported URL. Damaged and sunk states are
  scene effects (tint, list, sink) rather than separate assets — a second set of
  meshes would double the bundle for something the lighting can fake.

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

1. **Measure one real ship before spending anything.** When the free ZeroGPU
   quota resets, run the destroyer through the Space, download the GLB, and
   `npm run glb -- destroyer.glb`. If the optimised result is ~80 KB and still
   looks like a destroyer, the whole approach is confirmed. If it's 500 KB or
   the silhouette collapses, stop and rethink before paying for GPU time.
2. Then buy the GPU time (PRO or a duplicated Space) and generate the remaining
   four modern ships in one sitting.
3. Add `src/games/battleship/assets/ships/modern/…` plus the manifest.
4. In `FleetScene.ts`: replace `buildWarship(...)` with a `GLTFLoader` (with
   `setMeshoptDecoder`) that instantiates the ship mesh per `SceneShip`, scaled
   to `size × 1` cells and rotated by `orientation`. Load once, clone per ship.
   Then the atmosphere (sky, stars, moon, water), bloom, and the impact FX;
   remove the neon frame.
5. Wire `era` through `skins.ts` + `FleetSelect.tsx`.
6. Verify: `npm run check`, `npx vitest run`, `npm run build`,
   `npm run shots -- battle`. Watch the bundle size in the build output — that
   is the number this whole approach lives or dies on. Open the PR.
7. Then the **classic/WWII** set, then the shooter-side firing animation, then
   splitting the submarine's torpedo doors into animatable nodes.

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
| `scripts/optimize-glb.mjs` | raw GLB → bundle-sized GLB (`npm run glb`) |
| `../assets/battlefleet/` | source ship art + per-ship ImageGen prompts |

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

- `npm run shots` uses port 4317; `npm run risk:drag` 4318; `npm run dev` 5173.
  `pkill -f "vite preview"` exits 144 — run it on its own or tolerate the code.
- Tidewave's MCP server *is* the dev server, at `localhost:5173/tidewave/mcp`.
  No `npm run dev`, no Tidewave tools. And MCP servers are read at session
  start, so installing one does nothing until Claude Code restarts.
- **A synthetic click is not a click.** `dispatchEvent` bypasses pointer
  capture, focus and event retargeting, so a handler can be completely broken
  while every test that fires events by hand still passes. That is how the Risk
  board shipped unclickable. When a bug is about *input*, reach for
  `npm run risk:drag` or Tidewave, not another unit test.
- `npm run glb -- --selftest` proves the model pipeline without needing a real
  GLB or any GPU quota. Run it if you touch `scripts/optimize-glb.mjs`.
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
