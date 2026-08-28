# Caribbean Production Naval Duel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, accessible, production-module naval duel that is satisfying for two to four minutes and supports both surrender and boarding-ready tactics before the surrounding career loop grows around it.

**Architecture:** Add a new `src/games/caribbean/` production module rather than importing runtime code from the POC. Pure TypeScript owns integer-tick movement, wind, gunnery, damage, opponent decisions, replay, and outcomes; React owns the Battle Lab flow and transient input session; disposable Three.js and Web Audio adapters consume canonical snapshots and semantic events without deciding rules.

**Tech Stack:** TypeScript 5.6, React 18, Vitest, Testing Library, Three.js 0.170, Vite 5, Playwright, Meshopt-compressed GLB, Web Audio, CSS, and the existing offline PWA toolchain.

**Spec:** [`docs/designs/2026-08-23-caribbean-game-branch-design.md`](../designs/2026-08-23-caribbean-game-branch-design.md)

## Global Constraints

- Work only on the isolated local `codex/caribbean-game` branch; do not merge, push, publish, or modify main.
- Before the milestone boundary, fetch `origin/main`, inspect `git cherry`, rebase the unpushed branch, and rerun the full repository gate; create no merge commits.
- Production code lives in `src/games/caribbean/`; do not runtime-import `src/games/caribbean-poc/`.
- Heading `0` means bow toward world `+Z`; physical port is `+X` and physical starboard is `-X`.
- A/left maps to rudder `-1` and turns to port; D/right maps to rudder `1` and turns to starboard; Q fires port and E fires starboard.
- The naval domain uses integer 60 Hz ticks, explicit unsigned 32-bit LCG state, and no `Math.random`, `Date.now`, DOM, React, Three.js, audio, storage, or network imports.
- The only ship class is the sloop and the only active battle is one player ship against one opponent.
- Player-facing battle state is limited to hull, sails, crew, cannon/reload, ammunition, sail state, wind, and objective.
- Boarding ends at `boarding-ready`; do not create fencing or boarding movement.
- The optimized sloop ships with the PWA; no runtime downloads or CDN assets.
- Production text is at least 14 CSS pixels; targets are at least 44×44 CSS pixels; every action has keyboard/touch paths, a stable `data-testid`, visible focus, non-colour state, SVG icons, and reduced-motion behavior.
- The HTML harness is built only with `BUILD_HARNESS=1`, imports `@shared/styles/tokens.css`, and renders inside `.app`.
- Three.js adapters expose `create/sync/render/metrics/dispose`; renderers never decide hits, movement, damage, or outcomes.
- Scene budget is at most 120 draw calls, 100,000 visible triangles, adaptive DPR 1.0–1.75, and sustained 50 FPS on the target iPad before production readiness is claimed.
- Every task follows RED → GREEN → focused verification → independent review → one reviewable commit.

## Locked File and Responsibility Map

| Area | Files | Responsibility |
| --- | --- | --- |
| Content/provenance | `content/caribbean/source-ledger.csv`, `src/games/caribbean/content/naval.ts` | Stable sloop and Battle Lab definitions plus asset origin/transformation record |
| Naval contracts | `domain/naval/types.ts`, `createBattle.ts` | Serialized input, canonical state, deterministic constructor and validation |
| Geometry/movement | `domain/naval/geometry.ts`, `movement.ts` | Physical sides, bearings, wind polar, damage-aware fixed-tick handling |
| Gunnery/outcomes | `domain/naval/rng.ts`, `volley.ts`, `outcomes.ts`, `stepBattle.ts` | Legal broadsides, sampled volley result, reload, damage, boarding/surrender/end states |
| Opponent/replay | `domain/naval/opponent.ts`, `replay.ts` | Explicit opponent modes, deterministic commands, command-log replay and pacing fixtures |
| Battle session/UI | `state/naval/FrameRunner.ts`, `useNavalSession.ts`, `components/battle/*`, `preview.tsx` | Frame-to-tick adapter, controls, Battle Lab briefing/battle/result flow, HTML fallback |
| Three.js | `three/shared/loadSloop.ts`, `three/naval/NavalScene.ts`, `effects.ts`, `quality.ts` | Offline model loading, water/camera/ships, pooled effects, quality tiers, disposal metrics |
| Audio | `audio/BattleAudio.ts` | Lazy semantic-event-driven original procedural cues and teardown |
| Evidence | `scripts/caribbean-naval-check.mjs`, screenshots and review docs | Production-build browser checks, deterministic evidence, device/human gate record |

---

## Execution Preflight

- [ ] Confirm the worktree is `/Users/marioflores/code/arcade/.worktrees/caribbean-game`, branch is `codex/caribbean-game`, and `git status --short` has no unexplained tracked changes.
- [ ] Run `mise exec node@20 -- npm install` because a new Git worktree has no shared `node_modules`; verify `package-lock.json` remains unchanged before proceeding.
- [ ] Run `mise exec node@20 -- npm run check`, `mise exec node@20 -- npx vitest run`, and `mise exec node@20 -- npm run build` separately. Record the baseline file/test counts and any pre-existing warning-only output in the SDD ledger.
- [ ] Record the exact Task 1 BASE commit before dispatching its implementer.

---

### Task 1: Define Production Naval Content and Canonical Battle Contracts

**Files:**
- Create: `content/caribbean/source-ledger.csv`
- Create: `src/games/caribbean/content/types.ts`
- Create: `src/games/caribbean/content/naval.ts`
- Create: `src/games/caribbean/content/content.test.ts`
- Create: `src/games/caribbean/domain/naval/types.ts`
- Create: `src/games/caribbean/domain/naval/createBattle.ts`
- Create: `src/games/caribbean/domain/naval/createBattle.test.ts`
- Create: `src/games/caribbean/domain/naval/testFixtures.ts`

**Interfaces:**
- Consumes: reviewed sloop measurements and seed `1702` from the POC dossier.
- Produces: `SLOOP_CLASS`, `BATTLE_LAB_INPUT`, `NavalBattleInput`, `NavalState`, `NavalCommand`, `NavalEvent`, `NavalOutcome`, `createNavalBattle(input)`, `validateNavalInput(input)`, and test-only `fixture(overrides)`/`command(overrides)` builders.

- [ ] **Step 1: Write failing content and constructor tests**

```ts
import { BATTLE_LAB_INPUT, SLOOP_CLASS } from './naval';
import { createNavalBattle, validateNavalInput } from '../domain/naval/createBattle';

it('locks the one-class naval slice to the measured sloop', () => {
  expect(SLOOP_CLASS).toMatchObject({
    id: 'sloop',
    hold: 100,
    crew: { minimum: 12, safe: 50, maximum: 75 },
    cannonMaximum: 12,
    hullMaximum: 100,
    sailsMaximum: 100,
    topSpeed: 5.6,
    turnResponse: 0.52,
    bestWindAngle: 90,
  });
});

it('constructs the Battle Lab state without retaining mutable input aliases', () => {
  expect(validateNavalInput(BATTLE_LAB_INPUT)).toEqual({ ok: true });
  const state = createNavalBattle(BATTLE_LAB_INPUT);
  expect(state.tick).toBe(0);
  expect(state.seed).toBe(1702);
  expect(state.ships.player.position).toEqual({ x: 0, z: -36 });
  expect(state.ships.opponent.position).toEqual({ x: 0, z: 36 });
  state.ships.player.hull = 1;
  expect(BATTLE_LAB_INPUT.player.hull).toBe(100);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/content/content.test.ts src/games/caribbean/domain/naval/createBattle.test.ts`

Expected: FAIL because the production content and naval modules do not exist.

- [ ] **Step 3: Add exact content and type contracts**

Define these public shapes in `domain/naval/types.ts`:

```ts
export const NAVAL_TICK_RATE = 60;
export type NavalShipId = 'player' | 'opponent';
export type Broadside = 'port' | 'starboard';
export type Ammunition = 'round' | 'chain' | 'grape';
export type SailSetting = 'full' | 'reefed';
export type Rudder = -1 | 0 | 1;
export interface Point { x: number; z: number }
export interface Damage { hull: number; sails: number; crew: number; cannon: number }
export interface NavalShipInput {
  id: NavalShipId;
  stableShipId: string;
  name: string;
  classId: 'sloop';
  position: Point;
  heading: number;
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
}
export interface NavalBattleInput {
  battleId: string;
  seed: number;
  windFrom: number;
  windStrength: number;
  arenaRadius: number;
  timeLimitTicks: number;
  objective: 'capture-red-jackdaw';
  player: NavalShipInput;
  opponent: NavalShipInput;
}
export interface NavalCommand {
  rudder: Rudder;
  sail: SailSetting;
  ammunition: Ammunition;
  fire: Broadside | null;
}
export type NavalCommands = Partial<Record<NavalShipId, NavalCommand>>;
export interface ReloadState {
  progress: number;
  required: number;
  loaded: boolean;
}
export interface NavalShipState extends NavalShipInput {
  speed: number;
  rudder: Rudder;
  sail: SailSetting;
  ammunition: Ammunition;
  reload: Record<Broadside, ReloadState>;
}
export interface ShotSample {
  index: number;
  normalizedSpread: number;
  hit: boolean;
}
export interface VolleyResult {
  volleyId: number;
  side: Broadside;
  ammunition: Ammunition;
  fired: number;
  hits: number;
  misses: number;
  damage: Damage;
  seedAfter: number;
  samples: ShotSample[];
}
export type NavalOutcome =
  | { kind: 'surrender' | 'sunk' | 'boarding-ready'; victorShipId: NavalShipId }
  | { kind: 'escaped' | 'separated'; shipId: NavalShipId };
export type NavalEvent =
  | { id: number; kind: 'volley'; atTick: number; shipId: NavalShipId; targetShipId: NavalShipId; result: VolleyResult }
  | { id: number; kind: 'damage'; atTick: number; shipId: NavalShipId; damage: Damage }
  | { id: number; kind: 'reload-ready'; atTick: number; shipId: NavalShipId; side: Broadside }
  | { id: number; kind: 'outcome'; atTick: number; outcome: NavalOutcome };
export interface NavalState {
  input: NavalBattleInput;
  seed: number;
  tick: number;
  nextEventId: number;
  nextVolleyId: number;
  ships: Record<NavalShipId, NavalShipState>;
  events: NavalEvent[];
  outcome: NavalOutcome | null;
}
```

In `content/naval.ts`, export `SLOOP_CLASS` with the tested literal values and `BATTLE_LAB_INPUT` with battle ID `battle-lab-red-jackdaw`, positions `{0,-36}`/`{0,36}`, headings `0`/`Math.PI`, 100 hull/sails, 52/48 crew, 8 cannon, wind from `Math.PI / 3`, strength `1`, arena radius `92`, and `14_400` time-limit ticks.

- [ ] **Step 4: Implement boundary validation and deterministic construction**

`validateNavalInput` returns `{ ok: true }` or `{ ok: false; issues: string[] }`. Reject non-finite coordinates/headings, duplicate stable ship IDs, non-uint32 seeds, non-positive wind strength/radius/time limit, unsupported class IDs, and current values outside the sloop maxima. `createNavalBattle` validates, throws one `Invalid naval input: ...` error on failure, structured-clones the input, normalizes the seed with `>>> 0`, and creates two loaded broadsides.

Record the asset row in `source-ledger.csv` with columns:

```csv
id,path,source_commit,author_tool,transformation,ownership,review_state
caribbean-sloop,src/games/caribbean/assets/caribbean-sloop.glb,d82bb56,Blender 5.2 scripted original,"Meshopt optimization; production copy pending",project-owned,prototype-reviewed
```

`testFixtures.ts` is imported only by tests and exports:

```ts
export interface FixtureOverrides {
  player?: Partial<NavalShipState>;
  opponent?: Partial<NavalShipState>;
  input?: Partial<Pick<NavalBattleInput, 'windFrom' | 'windStrength' | 'arenaRadius' | 'timeLimitTicks'>>;
  tick?: number;
}
export function fixture(overrides: FixtureOverrides = {}): NavalState;
export function command(overrides: Partial<NavalCommand> = {}): NavalCommand;
```

`fixture` starts from `createNavalBattle(BATTLE_LAB_INPUT)`, shallow-applies only the named ship/input scalar overrides, and returns a fresh value. `command` defaults to rudder `0`, full sail, round shot, and no fire.

- [ ] **Step 5: Verify and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/content/content.test.ts src/games/caribbean/domain/naval/createBattle.test.ts`

Expected: PASS.

Run: `mise exec node@20 -- npm run typecheck`

Expected: PASS.

Commit: `feat(caribbean): define production naval contracts`

---

### Task 2: Implement Physical Geometry, Wind, and Fixed-Tick Movement

**Files:**
- Create: `src/games/caribbean/domain/naval/geometry.ts`
- Create: `src/games/caribbean/domain/naval/geometry.test.ts`
- Create: `src/games/caribbean/domain/naval/movement.ts`
- Create: `src/games/caribbean/domain/naval/movement.test.ts`
- Modify: `src/games/caribbean/domain/naval/types.ts`

**Interfaces:**
- Consumes: `Point`, `Broadside`, `NavalState`, ship stats, and `NAVAL_TICK_RATE` from Task 1.
- Produces: `normalizeAngle`, `broadsideVector`, `bearingSide`, `sailingEfficiency`, `moveShipsOneTick(state, commands)` and physical-side regression fixtures used by gunnery, AI, controls, and rendering.

- [ ] **Step 1: Write failing handedness and wind tests**

```ts
it.each([
  [0, { x: 1, z: 0 }, { x: -1, z: 0 }],
  [Math.PI / 2, { x: 0, z: -1 }, { x: 0, z: 1 }],
  [Math.PI, { x: -1, z: 0 }, { x: 1, z: 0 }],
  [-Math.PI / 2, { x: 0, z: 1 }, { x: 0, z: -1 }],
])('maps physical broadsides at heading %d', (heading, port, starboard) => {
  expectPoint(broadsideVector(heading, 'port'), port);
  expectPoint(broadsideVector(heading, 'starboard'), starboard);
});

it('binds heading zero, controls, and physical turn signs together', () => {
  const state = createNavalBattle(BATTLE_LAB_INPUT);
  const afterPort = moveShipsOneTick(state, { player: command({ rudder: -1 }) });
  const afterStarboard = moveShipsOneTick(state, { player: command({ rudder: 1 }) });
  expect(broadsideVector(0, 'port').x).toBe(1);
  expect(broadsideVector(0, 'starboard').x).toBe(-1);
  expect(afterPort.ships.player.heading).toBeGreaterThan(0);
  expect(afterStarboard.ships.player.heading).toBeLessThan(0);
});

it.each([[0, 0.08], [30, 0.18], [60, 0.65], [90, 1], [135, 0.88], [180, 0.65]])(
  'returns %f drive at %d degrees off wind',
  (degrees, want) => expect(sailingEfficiency(degrees * Math.PI / 180)).toBeCloseTo(want, 5),
);
```

- [ ] **Step 2: Write failing damage-aware movement tests**

Test these literal consequences:

```ts
it('trades speed for turn authority when reefed', () => {
  const full = moveForTicks(fixture({ player: { heading: Math.PI / 2 } }), command({ rudder: 1, sail: 'full' }), 60);
  const reefed = moveForTicks(fixture({ player: { heading: Math.PI / 2 } }), command({ rudder: 1, sail: 'reefed' }), 60);
  expect(Math.abs(reefed.heading - Math.PI / 2)).toBeGreaterThan(Math.abs(full.heading - Math.PI / 2));
  expect(reefed.distanceTravelled).toBeLessThan(full.distanceTravelled);
});

it('makes sail and crew damage reduce the systems they operate', () => {
  const healthy = moveForTicks(fixture(), command(), 60);
  const damaged = moveForTicks(fixture({ player: { sails: 25, crew: 12 } }), command(), 60);
  expect(damaged.distanceTravelled).toBeLessThan(healthy.distanceTravelled * 0.55);
  expect(damaged.reloadProgress).toBeLessThan(healthy.reloadProgress);
});
```

Define test-local helpers in `movement.test.ts`: `expectPoint(actual, expected)` uses `toBeCloseTo(..., 10)` for x/z; `moveForTicks(state, playerCommand, ticks)` repeatedly calls `moveShipsOneTick`, then returns the player's final heading, Euclidean displacement from its start, and port reload progress.

- [ ] **Step 3: Run geometry and movement tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval/geometry.test.ts src/games/caribbean/domain/naval/movement.test.ts`

Expected: FAIL because geometry and movement modules do not exist.

- [ ] **Step 4: Implement the shared geometry oracle**

```ts
export function broadsideVector(heading: number, side: Broadside): Point {
  const lateral = side === 'port' ? 1 : -1;
  return canonicalPoint({
    x: Math.cos(heading) * lateral,
    z: -Math.sin(heading) * lateral,
  });
}
```

`bearingSide` first rejects targets whose normalized forward dot magnitude is above `0.72`, then classifies with the dot product against the port vector. Canonicalize signed zero only at returned vector boundaries. `normalizeAngle` returns `[-π, π)`.

- [ ] **Step 5: Implement one-tick movement**

Use the POC polar table from the tests. For each ship per tick:

- apply commanded rudder/sail/ammunition;
- `heading -= rudder * turnRate / NAVAL_TICK_RATE`;
- full base turn is `0.52`, reefed base turn is `0.80`;
- sail-health factor is `0.15 + 0.85 * sails/maxSails`;
- hull factor is `0.65 + 0.35 * hull/maxHull`;
- handling/reload crew factor clamps `crew/safeCrew` to `0.35..1`;
- full maximum speed is `5.6`, reefed maximum speed is `3.9`;
- position advances by `{sin(heading), cos(heading)} * speed / 60`; and
- each side reloads by `round(crewFactor * 1000)` integer work units.

Return a structured clone; never mutate the input state. Keep reload as integer work units: healthy reload requires `1_500_000` units (25 seconds × 60 ticks × 1000), a loaded side has `progress === required`, and firing resets progress to zero. This lets low crew slow reloading without fractional countdown ambiguity.

- [ ] **Step 6: Verify and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval/geometry.test.ts src/games/caribbean/domain/naval/movement.test.ts`

Expected: PASS.

Commit: `feat(caribbean): add deterministic naval movement`

---

### Task 3: Implement Volleys, Damage, Reload, and Battle Outcomes

**Files:**
- Create: `src/games/caribbean/domain/naval/rng.ts`
- Create: `src/games/caribbean/domain/naval/volley.ts`
- Create: `src/games/caribbean/domain/naval/volley.test.ts`
- Create: `src/games/caribbean/domain/naval/outcomes.ts`
- Create: `src/games/caribbean/domain/naval/outcomes.test.ts`
- Create: `src/games/caribbean/domain/naval/validation.ts`
- Create: `src/games/caribbean/domain/naval/validation.test.ts`
- Create: `src/games/caribbean/domain/naval/stepBattle.ts`
- Create: `src/games/caribbean/domain/naval/stepBattle.test.ts`
- Modify: `src/games/caribbean/domain/naval/types.ts`

**Interfaces:**
- Consumes: geometry and one-tick movement from Task 2.
- Produces: `nextSeed`, `resolveVolley`, `damageFor`, `evaluateOutcome`, `validateNavalState`, `stepBattle(state, commands)`, typed `volley`, `damage`, `reload-ready`, and `outcome` events plus renderer-safe sampled trajectories.

- [ ] **Step 1: Write the failing literal LCG/volley test**

```ts
it('resolves one volley independently of visual cannonballs', () => {
  expect(resolveVolley({
    seed: 1702,
    volleyId: 7,
    side: 'port',
    ammunition: 'chain',
    cannon: 4,
    accuracy: 0.66,
    damagePerHit: { hull: 1, sails: 9, crew: 1, cannon: 0 },
  })).toEqual({
    volleyId: 7,
    side: 'port',
    ammunition: 'chain',
    fired: 4,
    hits: 2,
    misses: 2,
    damage: { hull: 2, sails: 18, crew: 2, cannon: 0 },
    seedAfter: 2876432698,
    samples: expect.any(Array),
  });
});
```

Each cannon consumes exactly one sample from `seed = imul(1664525, seed) + 1013904223`; a shot hits when its normalized sample is below accuracy. Cosmetic sample data contains normalized lateral spread and hit/miss, not mutable Three.js objects.

- [ ] **Step 2: Write failing legality, ammunition, and outcome tests**

```ts
it('requires a loaded physical side and lateral target arc', () => {
  const state = fixture({ player: { heading: 0 }, opponent: { position: { x: 20, z: 0 } } });
  const fired = stepBattle(state, { player: command({ fire: 'port' }) });
  expect(events(fired, 'volley')).toHaveLength(1);
  expect(fired.ships.player.reload.port.progress).toBe(0);
  expect(events(stepBattle(fired, { player: command({ fire: 'port' }) }), 'volley')).toHaveLength(1);
  expect(events(stepBattle(state, { player: command({ fire: 'starboard' }) }), 'volley')).toHaveLength(0);
});

it.each([
  ['round', 0, { hull: 3, sails: 1, crew: 1, cannon: 1 }],
  ['chain', 0, { hull: 1, sails: 5, crew: 1, cannon: 0 }],
  ['grape', 0, { hull: 0, sails: 0, crew: 4, cannon: 0 }],
  ['round', 1, { hull: 2, sails: 0, crew: 0, cannon: 0 }],
  ['chain', 1, { hull: 0, sails: 2, crew: 0, cannon: 0 }],
  ['grape', 1, { hull: 0, sails: 0, crew: 1, cannon: 0 }],
])('%s has the intended profile at normalized range %d', (ammo, range, want) => {
  expect(damageFor(ammo, range)).toEqual(want);
});

it('makes a disabled close prize boarding-ready without swordplay', () => {
  const state = fixture({
    player: { position: { x: 0, z: 0 }, speed: 0.8, crew: 52 },
    opponent: { position: { x: 5.5, z: 0 }, speed: 0, sails: 25, crew: 14 },
  });
  expect(evaluateOutcome(state)).toEqual({ kind: 'boarding-ready', victorShipId: 'player' });
});
```

Define `events(state, kind)` in `stepBattle.test.ts` as `state.events.filter((event) => event.kind === kind)`; it reads the canonical event window and does not intercept event creation.

Also test: sunk at zero hull; surrender at hull `≤20` or crew `≤8`; no boarding-ready when distance `>7`, relative speed `>1.5`, target sails `>30`, target crew `>18`, or player crew is not at least 1.25 times target crew; outward escape beyond radius; and separation at `timeLimitTicks`.

Add a canonical-state guard test:

```ts
it('reports drift before an invalid state can become a campaign result', () => {
  const invalid = fixture();
  invalid.ships.player.position.x = Number.NaN;
  invalid.ships.opponent.reload.port.progress = invalid.ships.opponent.reload.port.required + 1;
  expect(validateNavalState(invalid)).toEqual({
    ok: false,
    issues: expect.arrayContaining(['player.position.x:not-finite', 'opponent.reload.port:overflow']),
  });
});
```

- [ ] **Step 3: Run gunnery tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval/volley.test.ts src/games/caribbean/domain/naval/outcomes.test.ts src/games/caribbean/domain/naval/validation.test.ts src/games/caribbean/domain/naval/stepBattle.test.ts`

Expected: FAIL because volley, outcome, and complete tick modules do not exist.

- [ ] **Step 4: Implement pure sampling and damage**

`accuracyFor` starts at `0.78`, subtracts up to `0.36` over normalized range, multiplies by crew factor `0.45..1`, and subtracts `0.08` when sails are below 30 because platform control is poor. Clamp to `0.12..0.88`. `resolveVolley` aggregates damage once; the renderer never performs collision tests.

Use the literal ammunition profiles in the tests. Divide aggregate damage across the target's current maxima only when applying it; clamp hull/sails/crew/cannon to zero.

- [ ] **Step 5: Implement one canonical battle tick and semantic events**

`stepBattle` must:

1. return the same state reference after an outcome;
2. clone state;
3. validate/apply both commands;
4. resolve at most one requested loaded/legal broadside per ship;
5. emit one `volley` and one `damage` event with increasing IDs;
6. move ships one integer tick;
7. advance reload progress and emit `reload-ready` only on the transition to loaded;
8. increment `tick` once;
9. evaluate one outcome in priority order: sunk, surrender, boarding-ready, escape, separated; and
10. emit exactly one `outcome` event.

Trim the in-memory semantic event window to the newest 120 events without reusing IDs.

`validateNavalState` checks all finite geometry/heading/speed values, current/max bounds, reload integer range/loaded consistency, monotonic positive event IDs, tick/seed uint ranges, known ship IDs, and outcome/event agreement. It is pure and returns all issues; it never repairs or mutates state.

- [ ] **Step 6: Verify mutation-sensitive cases and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval`

Expected: PASS. Temporarily invert the broadside vector, skip reload reset, and swap chain/round damage locally; confirm the named physical-side, independent-reload, and ammunition-profile tests fail, then restore the implementation.

Commit: `feat(caribbean): add naval gunnery and outcomes`

---

### Task 4: Build the Legible Opponent, Replay, and Battle-Pacing Proof

**Files:**
- Create: `src/games/caribbean/domain/naval/opponent.ts`
- Create: `src/games/caribbean/domain/naval/opponent.test.ts`
- Create: `src/games/caribbean/domain/naval/replay.ts`
- Create: `src/games/caribbean/domain/naval/replay.test.ts`
- Create: `src/games/caribbean/domain/naval/pacing.test.ts`
- Modify: `src/games/caribbean/domain/naval/testFixtures.ts`
- Create: `src/games/caribbean/state/naval/FrameRunner.ts`
- Create: `src/games/caribbean/state/naval/FrameRunner.test.ts`

**Interfaces:**
- Consumes: complete integer-tick battle state from Task 3.
- Produces: `OpponentMode`, `OpponentMemory`, `initialOpponentMemory()`, `opponentCommand(state, memory)`, `OpponentControllerState`, `initialOpponentController()`, `advanceOpponentController(state, controller)`, `CommandSegment`, `replayBattle(input, segments)`, `FrameRunner`, deterministic two-tactic fixtures, and measured duel-duration assertions.

- [ ] **Step 1: Write failing opponent-state tests**

```ts
it.each([
  ['healthy target sails at medium range', fixture({ opponent: { position: { x: 0, z: 0 } }, player: { position: { x: 26, z: 0 }, sails: 90 } }), 'chain'],
  ['weak crew at close range', fixture({ opponent: { position: { x: 0, z: 0 } }, player: { position: { x: 12, z: 0 }, crew: 18 } }), 'grape'],
  ['ordinary firing solution', fixture({ opponent: { position: { x: 0, z: 0 } }, player: { position: { x: 30, z: 0 }, sails: 30 } }), 'round'],
])('chooses ammunition for %s', (_label, state, ammunition) => {
  expect(opponentCommand(state, initialOpponentMemory()).command.ammunition).toBe(ammunition);
});

it('reduces angular error while seeking a broadside', () => {
  const before = fixture({ opponent: { position: { x: 0, z: 0 }, heading: Math.PI }, player: { position: { x: 0, z: -30 } } });
  const decision = opponentCommand(before, initialOpponentMemory());
  const after = stepBattle(before, { opponent: decision.command });
  expect(angleError(after.ships.opponent.heading, decision.desiredHeading)).toBeLessThan(
    angleError(before.ships.opponent.heading, decision.desiredHeading),
  );
});
```

Test every explicit mode: `close`, `gain-weather-position`, `seek-broadside`, `fire`, `recover`, `disengage`, and `surrender`. A low-hull/crew opponent chooses surrender if eligible; otherwise it disengages outward rather than fighting to automatic destruction.

- [ ] **Step 2: Write failing replay and pacing tests**

```ts
it('replays byte-equal state under different delivered frame chunks', () => {
  const log = disableAndCaptureScript();
  expect(runDeliveredFrames(BATTLE_LAB_INPUT, log, frames60)).toEqual(
    runDeliveredFrames(BATTLE_LAB_INPUT, log, irregularFrames),
  );
});

it.each([
  ['pressure-and-surrender', pressureCaptain],
  ['disable-and-board', captureCaptain],
])('%s is viable in a two-to-four-minute normal duel', (_name, captain) => {
  const result = simulateCaptain(BATTLE_LAB_INPUT, captain);
  expect(result.outcome?.victorShipId).toBe('player');
  expect(result.tick).toBeGreaterThanOrEqual(7_200);
  expect(result.tick).toBeLessThanOrEqual(14_400);
});
```

`runDeliveredFrames` is a test adapter: it maps timestamped command changes to integer ticks using the `FrameRunner` contract defined below. It does not inject damage or outcomes.

Add the actual `FrameRunner` contract here so replay and the later React session share one conversion instead of duplicating it:

```ts
it('converts 60 Hz, 30 Hz, and irregular delivery into the same integer ticks', () => {
  expect(runFrames(sixtyHzFor(10))).toEqual({ ticks: 600, remainderMicros: 0 });
  expect(runFrames(thirtyHzFor(10))).toEqual({ ticks: 600, remainderMicros: 0 });
  expect(runFrames(irregularTenSeconds)).toEqual({ ticks: 600, remainderMicros: 0 });
});

it('caps work per delivered frame without discarding backlog', () => {
  const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });
  expect(runner.deliverMicros(500_000)).toBe(6);
  expect(runner.backlogTicks).toBe(24);
  expect(runner.deliverMicros(0)).toBe(6);
});
```

- [ ] **Step 3: Run opponent/replay tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval/opponent.test.ts src/games/caribbean/domain/naval/replay.test.ts src/games/caribbean/domain/naval/pacing.test.ts src/games/caribbean/state/naval/FrameRunner.test.ts`

Expected: FAIL because opponent, replay, and scripted fixtures do not exist.

- [ ] **Step 4: Implement the explicit decision table**

`OpponentMode` is `'close' | 'gain-weather-position' | 'seek-broadside' | 'fire' | 'recover' | 'disengage' | 'surrender'`. `OpponentMemory` contains `{ mode, desiredHeading, untilTick }`, while `OpponentDecision` contains `{ memory, command }`. Use normalized heading error and the corrected negative rudder convention. Fire only when `bearingSide` is legal, range is at most 42, and that side is loaded. Use chain when target sails exceed 55 and range is 16–36; use grape when range is below 16 and target crew exceeds 18; use round otherwise. Reef while seeking/firing inside 24; use full sail when closing or disengaging.

The opponent enters `recover` while its useful side reloads and maintains range rather than oscillating rudder every tick. Add a 30-tick decision hold to transient `OpponentControllerState`, outside canonical battle state, so mode changes are legible and deterministic. `advanceOpponentController(state, controller)` is the shared pure per-tick boundary: steering, sail, and ammunition remain held, while a non-null `fire` request is returned for exactly one tick and cleared from the next controller state. A canonically disarmed opponent whose cannon count is not a positive integer immediately overrides any held firing decision and disengages outward under full sail, unless the surrender threshold already applies.

- [ ] **Step 5: Implement replay and tune only documented constants**

`CommandSegment` is `{ fromTick: number; untilTick: number; player: NavalCommand }`; segments are sorted, non-overlapping, and cover tick zero. `replayBattle` creates state from input, carries `OpponentControllerState` locally, selects the segment for each tick, advances the shared controller helper, and stops at outcome. Opponent memory and its held command are deterministic controller concerns rather than canonical battle/campaign state; replay recomputes them from input and ticks.

`FrameRunner` accepts integer microseconds only. It converts them to integer tick work using a rational numerator/remainder, caps execution to `maxTicksPerFrame`, retains backlog, and exposes `reset()` for pause/restart. Browser code performs the one rounding boundary from `performance.now()` milliseconds to microseconds before calling it.

Build pressure and capture captains from position/heading/reload observations, not tick-specific damage injection. Tune initial distance, reload work, accuracy falloff, and surrender/boarding gates through explicit, tested balance constants. If two-to-four minutes cannot support both tactics, record the failed fixture and revise the design rather than adding hidden damage bonuses.

**Task 4 balance revision (2026-08-23):** The first real-rule simulation exposed a structural mismatch: the former six-second reload plus former round/chain/grape profiles resolved normal duels in 11–18 seconds (one round volley removed 50 hull and all eight cannon; one grape volley removed 36 crew). The explicit profiles above replace the former close→far endpoints (`round` hull `12→9`, chain sails `14→6`, grape crew `12→2`) with `round` hull `3→2`, chain sails `5→2`, and grape crew `4→1`; healthy reload changes from `360_000`/6 seconds to `1_500_000`/25 seconds. Outcome thresholds remain unchanged. The ordinary opponent tacks inward at 78% of arena radius unless intentionally disengaging, and hull disengagement begins at 21 rather than 32 so it remains a legible last-chance escape without pre-empting the surrender gate at 20. With unchanged `7_200..14_400` acceptance bounds and no damage/outcome injection, pressure-and-surrender resolves at tick `12_183` (203.05 seconds) and disable-and-board at tick `13_125` (218.75 seconds).

Extend `testFixtures.ts` with test-only `pressureCaptain(state)`, `captureCaptain(state)`, and `simulateCaptain(input, captain)`. Both captains use only public canonical state and geometry: they steer toward the nearest legal broadside heading, reef inside 24, and fire a loaded legal side. Pressure always selects round. Capture selects chain while opponent sails exceed 30, grape while opponent crew exceeds 18, then reefs and closes below range 7 while reducing relative speed. `simulateCaptain` runs both that player command and the real opponent controller until outcome/time limit; it never edits damage, seed, tick, or outcome directly.

- [ ] **Step 6: Verify and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval src/games/caribbean/state/naval/FrameRunner.test.ts`

Expected: PASS, including byte-equal replay and both duration gates.

Run: `mise exec node@20 -- npm run typecheck`

Expected: PASS.

Commit: `feat(caribbean): add naval opponent and replay`

---

### Task 5: Create the Production Battle Lab, Frame Runner, and Accessible Controls

**Files:**
- Create: `preview-caribbean-game.html`
- Create: `src/games/caribbean/preview.tsx`
- Create: `src/games/caribbean/components/CaribbeanLab.tsx`
- Create: `src/games/caribbean/components/CaribbeanLab.test.tsx`
- Create: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Create: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Create: `src/games/caribbean/components/battle/BattleHud.tsx`
- Create: `src/games/caribbean/components/battle/HtmlTacticalChart.tsx`
- Create: `src/games/caribbean/state/naval/NavalSession.ts`
- Create: `src/games/caribbean/state/naval/NavalSession.test.ts`
- Create: `src/games/caribbean/state/naval/testSession.ts`
- Create: `src/games/caribbean/state/naval/useNavalSession.ts`
- Create: `src/games/caribbean/styles/caribbean.css`
- Create: `src/games/caribbean/styles/battle.css`
- Modify: `vite.config.ts`
- Modify: `knip.json`

**Interfaces:**
- Consumes: `BATTLE_LAB_INPUT`, `stepBattle`, `initialOpponentController`, `advanceOpponentController`, `FrameRunner`, and semantic events from Tasks 1–4.
- Produces: `NavalSession`, `NavalSessionView`, `useNavalSession`, production Battle Lab briefing/battle/result flow, physical keyboard/touch command mapping, pause/restart, debug snapshot hooks, and an HTML tactical chart that remains usable when WebGL is absent.

- [ ] **Step 1: Write the failing transient-session tests**

```ts
it('advances only canonical ticks and clears one-shot fire after the first tick', () => {
  const session = new NavalSession(BATTLE_LAB_INPUT);
  session.requestFire('port');
  session.deliverFrameMicros(33_333);
  expect(session.state.tick).toBe(1);
  expect(session.currentCommand.fire).toBeNull();
});

it('pause freezes ticks/backlog and restart recreates the serialized input', () => {
  const session = new NavalSession(BATTLE_LAB_INPUT);
  session.togglePause();
  session.deliverFrameMicros(500_000);
  expect(session.state.tick).toBe(0);
  session.togglePause();
  session.deliverFrameMicros(16_667);
  session.restart();
  expect(session.state).toEqual(createNavalBattle(BATTLE_LAB_INPUT));
});
```

- [ ] **Step 2: Write failing Battle Lab and control tests**

```tsx
it('offers one clear production Battle Lab decision before starting', async () => {
  render(<CaribbeanLab sceneFactory={null} />);
  expect(screen.getByRole('heading', { name: 'Caribbean Career' })).toBeVisible();
  expect(screen.getByTestId('lab-start-naval')).toHaveTextContent('Enter Battle Lab');
  expect(screen.getByText(/port decisions are the next slice/i)).toBeVisible();
});

it('maps keyboard controls to physical nautical commands', async () => {
  const session = manualNavalSession();
  render(<NavalBattlePage session={session} sceneFactory={null} />);
  await user.keyboard('qe{a>}{/a}{d>}{/d}');
  expect(session.commandHistory()).toEqual(expect.arrayContaining([
    expect.objectContaining({ fire: 'port' }),
    expect.objectContaining({ fire: 'starboard' }),
    expect.objectContaining({ rudder: -1 }),
    expect.objectContaining({ rudder: 1 }),
  ]));
});

it('shows one result and never emits the same resolution twice', () => {
  const session = manualNavalSession({ outcome: BOARDING_READY });
  const onResolved = vi.fn();
  const { rerender } = render(<NavalBattlePage session={session} sceneFactory={null} onResolved={onResolved} />);
  expect(screen.getByRole('heading', { name: /ready to board/i })).toBeVisible();
  rerender(<NavalBattlePage session={session} sceneFactory={null} onResolved={onResolved} />);
  expect(onResolved).toHaveBeenCalledTimes(1);
});

it('pauses and offers deterministic restart when canonical validation detects drift', () => {
  const onResolved = vi.fn();
  const session = manualNavalSession({ validator: () => ({ ok: false, issues: ['player.position.x:not-finite'] }) });
  render(<NavalBattlePage session={session} sceneFactory={null} onResolved={onResolved} />);
  session.deliverFrame(1 / 60);
  expect(screen.getByRole('alert')).toHaveTextContent(/battle state drift/i);
  expect(screen.getByTestId('naval-restart-input')).toBeEnabled();
  expect(onResolved).not.toHaveBeenCalled();
});
```

Also assert 44×44 control class contract, stable test IDs, visible text labels independent of colour, Escape pause/resume dismissal through `useDismissOnEscape`, and the HTML chart when `sceneFactory` is null or rejects.

- [ ] **Step 3: Run session/UI tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/state/naval/NavalSession.test.ts src/games/caribbean/components/CaribbeanLab.test.tsx src/games/caribbean/components/battle/NavalBattlePage.test.tsx`

Expected: FAIL because the frame runner and production Battle Lab do not exist.

- [ ] **Step 4: Implement the transient session boundary**

`NavalSession` owns mutable canonical `NavalState`, a `FrameRunner`, current player command, transient `OpponentControllerState`, last-consumed event ID, subscribers, and a throttled immutable HUD snapshot. `useNavalSession(input)` creates/disposes one session and subscribes React through `useSyncExternalStore`. The session exposes:

```ts
export interface NavalSessionView {
  state: NavalState;
  opponentMemory: OpponentMemory;
  setRudder(value: Rudder): void;
  setSail(value: SailSetting): void;
  setAmmunition(value: Ammunition): void;
  requestFire(side: Broadside): void;
  togglePause(): void;
  restart(): void;
  subscribe(listener: () => void): () => void;
  consumeNewEvents(afterId: number): NavalEvent[];
  diagnostic: { issues: string[] } | null;
}
```

`testSession.ts` exports `manualNavalSession(options)` implementing this same interface with explicit frame delivery and command history controls for component tests; it is imported only by tests. `NavalBattlePage` receives `onResolved(outcome)` as a prop and guards it by outcome identity so rerenders dispatch exactly once.

The RAF callback asks `FrameRunner` for integer ticks, calls `advanceOpponentController` and then `stepBattle` once per tick, clears the player's one-shot `fire` after the first tick, and never stores RAF timestamps in domain state. The shared opponent helper consumes its own one-shot `fire` while preserving the 30-tick steering/mode hold. Pause freezes both canonical ticks and frame backlog. In the Battle Lab/debug harness, validate after each delivered frame; on any issue, pause, expose the diagnostic, emit no resolution, and offer restart from the original serialized input. Restart recreates from that input and clears the diagnostic.

- [ ] **Step 5: Implement the HTML decision, briefing, battle, and result flow**

`CaribbeanLab` starts on a modern, spacious decision page with restrained brass and turquoise nautical accents, one active `Enter Battle Lab` card, and a labelled `Port Decisions — next slice` preview. Avoid a parchment-heavy historical imitation. The battle briefing states objective, trade wind, full/reefed sail, Q/E, A/D, and ammunition consequences in fewer than 90 words.

`BattleHud` shows only player/opponent hull/sails/crew/cannon, port/starboard reload, ammo, sail, wind, objective, and pause. `HtmlTacticalChart` renders both ships as labelled, rotated CSS/SVG silhouettes on an x/z chart and reports `3D sea unavailable—battle rules continue`; it is a functional fallback rather than an error dead-end.

Use SVG icons from the shared icon style, no emoji. Every control has `data-testid`, focus-visible styling, touch-safe pointer release/cancel handling, and keyboard listeners that ignore repeated fire/pause commands.

- [ ] **Step 6: Gate the harness and verify**

Add `preview-caribbean-game` to `vite.config.ts` only inside the existing `BUILD_HARNESS` input map, and add `src/games/caribbean/preview.tsx` to `knip.json` entries. `preview.tsx` imports shared tokens and renders `<div className="app caribbean-app">`.

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/state/naval src/games/caribbean/components`

Expected: PASS.

Run: `BUILD_HARNESS=1 mise exec node@20 -- npm run build`

Expected: PASS with `dist/preview-caribbean-game.html` present. Run the normal build separately and assert that file is absent.

Run after the normal build: `find dist -maxdepth 1 -name 'preview-caribbean-game.html' -print`

Expected: no output.

- [ ] **Step 7: Commit**

Commit: `feat(caribbean): add production battle lab`

---

### Task 6: Promote the Sloop and Build the Disposable Three.js Naval Scene

**Files:**
- Create: `src/games/caribbean/assets/caribbean-sloop.glb`
- Create: `src/games/caribbean/three/shared/loadSloop.ts`
- Create: `src/games/caribbean/three/naval/quality.ts`
- Create: `src/games/caribbean/three/naval/quality.test.ts`
- Create: `src/games/caribbean/three/naval/effects.ts`
- Create: `src/games/caribbean/three/naval/NavalScene.ts`
- Create: `src/games/caribbean/components/battle/NavalViewport.tsx`
- Create: `src/games/caribbean/components/battle/NavalViewport.test.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/styles/battle.css`
- Modify: `content/caribbean/source-ledger.csv`

**Interfaces:**
- Consumes: canonical `NavalState`, `NavalEvent`, shared geometry oracle, reduced-motion setting, and the reviewed optimized sloop source.
- Produces: `NavalScene.create(container, options)`, `sync(state, events)`, `render(frameSeconds)`, `metrics()`, `dispose()`, `QualityController`, bounded `EffectPool`, and a React viewport that catches WebGL failure.

- [ ] **Step 1: Write failing quality-tier and viewport lifecycle tests**

```ts
it('drops after five slow seconds and raises only after twenty fast seconds', () => {
  const quality = new QualityController('high');
  repeat(5, () => quality.sample(47, 1));
  expect(quality.tier).toBe('medium');
  repeat(19, () => quality.sample(59, 1));
  expect(quality.tier).toBe('medium');
  quality.sample(59, 1);
  expect(quality.tier).toBe('high');
});

it('disposes one scene instance and renders the HTML chart after construction failure', async () => {
  const scene = fakeSceneFactory();
  const { unmount } = render(<NavalViewport state={STATE} events={[]} sceneFactory={scene.factory} />);
  await waitFor(() => expect(scene.created).toBe(1));
  unmount();
  expect(scene.disposed).toBe(1);
  scene.rejectNext(new Error('no WebGL'));
  render(<NavalViewport state={STATE} events={[]} sceneFactory={scene.factory} />);
  expect(await screen.findByTestId('naval-html-chart')).toBeVisible();
});
```

- [ ] **Step 2: Run scene-adapter tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/three/naval/quality.test.ts src/games/caribbean/components/battle/NavalViewport.test.tsx`

Expected: FAIL because the production scene and viewport do not exist.

- [ ] **Step 3: Promote the asset with reproducible provenance**

Copy the exact optimized GLB bytes from `src/games/caribbean-poc/assets/caribbean-sloop.glb` to the production asset path. Update the ledger row's path, new source commit SHA, byte size, Meshopt state, and review state `production-promoted`. Confirm SHA-256 equality between POC and production bytes; no Blender rebuild is required for this milestone.

`loadSloop.ts` uses `GLTFLoader` plus `MeshoptDecoder`, caches only the immutable source promise, clones resources for each scene, batches runtime geometry by material like the measured POC path, applies team colour to the named signal material, and returns resource-independent groups so disposing one battle cannot poison a restart.

- [ ] **Step 4: Implement quality tiers and bounded effects**

Use exact tiers:

| Tier | DPR | Shadows | Effect capacity |
| --- | ---: | --- | ---: |
| low | 1.0 | off | 32 |
| medium | min(device, 1.4) | one 512 map | 64 |
| high | min(device, 1.75) | one 1024 map | 96 |

Drop one tier after five consecutive seconds below 48 FPS. Raise one tier only after twenty seconds above 58 FPS and at most once per battle. `EffectPool` preallocates flash/smoke/splash/debris sprites or low-poly meshes by capacity, reuses the oldest inactive entry when full, and reports active/capacity/resource counts.

- [ ] **Step 5: Implement the authoritative-snapshot scene**

Promote these measured POC concepts without importing POC code:

- warm gradient sky and haze;
- one simple shader water plane;
- two sloop clones with team pennants, wakes, selection clarity, and damage tint;
- instanced wind streamlines and distant island silhouettes;
- engagement-centred responsive camera for tablet, desktop, portrait, and phone;
- interpolated visual y/pitch/roll/heel/recoil only; and
- semantic flash/smoke/splash/rig/debris effects keyed by event ID.

`sync` sets ship x/z/yaw from canonical state and never calculates hits. `metrics` returns `{ fps, dpr, tier, drawCalls, triangles, textures, geometries, materials, activeEffects, effectCapacity }`. `dispose` disconnects resize observation, removes listeners, disposes cloned scene resources/effect pools/renderer, and loses no cached source used by a future scene.

- [ ] **Step 6: Integrate the lazy viewport and verify resource behavior**

`NavalViewport` dynamically imports `NavalScene`, passes reduced-motion and quality settings, catches construction/render errors, and swaps to `HtmlTacticalChart` with retry and restart actions. In jsdom it must not log an unhandled Three.js stack.

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/three/naval/quality.test.ts src/games/caribbean/components/battle/NavalViewport.test.tsx src/games/caribbean/components/battle/NavalBattlePage.test.tsx`

Expected: PASS.

Run: `BUILD_HARNESS=1 mise exec node@20 -- npm run build`

Expected: PASS; inspect output to confirm the sloop is a hashed bundled asset and no remote URL is introduced.

- [ ] **Step 7: Commit**

Commit: `feat(caribbean): add production naval scene`

---

### Task 7: Add Semantic Battle Audio, Aim Assistance, and Decisive Feedback

**Files:**
- Create: `src/games/caribbean/audio/BattleAudio.ts`
- Create: `src/games/caribbean/audio/BattleAudio.test.ts`
- Create: `src/games/caribbean/components/battle/aimCue.ts`
- Create: `src/games/caribbean/components/battle/aimCue.test.ts`
- Modify: `src/games/caribbean/components/battle/BattleHud.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/three/naval/NavalScene.ts`
- Modify: `src/games/caribbean/styles/battle.css`

**Interfaces:**
- Consumes: semantic event IDs, canonical geometry/reload/range, and user sensory settings.
- Produces: `BattleAudio`, `selectAimCue(state, shipId)`, one cue per new semantic event, optional aim arc/timing feedback, reload-ready side feedback, result explanation, and independently controlled motion/flash/audio assists.

- [ ] **Step 1: Write failing audio lifecycle tests**

```ts
it('creates audio only after user activation and plays one cue per new event ID', async () => {
  const factory = fakeAudioFactory();
  const audio = new BattleAudio(factory);
  audio.handle(VOLLEY_EVENT);
  expect(factory.contexts).toBe(0);
  await audio.activate();
  audio.handle(VOLLEY_EVENT);
  audio.handle(VOLLEY_EVENT);
  expect(factory.cues('cannon')).toHaveLength(1);
});

it('stays silent when muted and tears down every owned node', async () => {
  const factory = fakeAudioFactory();
  const audio = new BattleAudio(factory);
  await audio.activate();
  audio.syncSettings({ master: 0.8, effects: 0.9, muted: true });
  audio.handle(HIT_EVENT);
  expect(factory.startedNodes).toHaveLength(0);
  audio.dispose();
  expect(factory.openNodes).toHaveLength(0);
});
```

- [ ] **Step 2: Write failing aim/reload/result feedback tests**

```ts
it('explains a legal port firing window without changing accuracy', () => {
  expect(selectAimCue(fixture({
    player: { position: { x: 0, z: 0 }, heading: 0 },
    opponent: { position: { x: 24, z: 0 } },
  }), 'player')).toEqual({
    side: 'port',
    quality: 'good',
    message: 'Port broadside — good range',
  });
});

it('names the facts that produced boarding-ready', () => {
  render(<BattleHud state={BOARDING_READY_STATE} aimAssist />);
  expect(screen.getByText(/Red Jackdaw: sails 25%, crew 14, range 5.5/i)).toBeVisible();
  expect(screen.getByText(/ready to board/i)).toBeVisible();
});
```

Aim assistance is a pure selector. It must not modify command, accuracy, target position, or state.

- [ ] **Step 3: Run audio/feedback tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/audio/BattleAudio.test.ts src/games/caribbean/components/battle/aimCue.test.ts src/games/caribbean/components/battle/NavalBattlePage.test.tsx`

Expected: FAIL because audio and aim selectors do not exist.

- [ ] **Step 4: Implement six original procedural cues**

Inject an `AudioFactory` boundary in tests. Lazily create one `AudioContext` after a pointer/key activation. Map new semantic events to cannon discharge, hull impact, water splash, rig tear, reload-ready block/bell, and surrender bell, plus a low optional sea bed. Build them from oscillators, filtered noise buffers, and gain ramps; do not add downloaded audio.

Track the newest handled event ID and never replay cues on rerender. `syncSettings` updates master/effects/mute immediately. `dispose` stops sources, disconnects nodes, clears handled IDs, and closes or releases only the context it owns.

- [ ] **Step 5: Implement sensory assists and result explanations**

Add independent settings: aim assist, steering hint, reduced motion, camera shake, reduced flashes, effects volume, and mute. Defaults: aim on, steering hint on, reduced motion from media query, shake on unless reduced motion, reduced flashes off, effects `0.9`, mute false.

The HUD spatially separates Q/port and E/starboard but relies on labels and muzzle feedback, never screen side. A loaded transition briefly announces `Port battery ready` or `Starboard battery ready`. Outcome text includes the decisive values and a next action: rematch for the lab, capture summary for boarding-ready/surrender, or restart for loss/separation.

- [ ] **Step 6: Verify and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/audio src/games/caribbean/components/battle src/games/caribbean/domain/naval`

Expected: PASS.

Run: `mise exec node@20 -- npm run check`

Expected: PASS aside from already-documented repository warnings.

Commit: `feat(caribbean): add naval battle feedback`

---

### Task 8: Build the Production Browser Gate and Record the Naval Milestone Decision

**Files:**
- Create: `scripts/lib/caribbean-naval-evidence.mjs`
- Create: `scripts/lib/caribbean-naval-evidence.test.mjs`
- Create: `scripts/caribbean-naval-check.mjs`
- Create: `docs/games/caribbean-career/naval-battle-playtest.md`
- Create: `docs/games/caribbean-career/naval-battle-review.md`
- Create: selected files under `docs/screenshots/caribbean-naval/`
- Modify: `package.json`
- Modify: `docs/games/caribbean-career/README.md`

**Interfaces:**
- Consumes: production Battle Lab, debug metrics/state hooks, deterministic scenario inputs, and repository build tooling.
- Produces: `npm run caribbean:naval-check`, production-build browser captures/metrics, automated technical verdict, explicit human/device evidence rows, and one `proceed`, `revise-battle`, or `stop` recommendation.

- [ ] **Step 1: Write the failing browser-gate contract**

Add an executable script contract test or exported pure helpers so Vitest can assert:

```ts
it('fails technical evidence on console, asset, allocation, or handedness errors', () => {
  expect(evaluateNavalEvidence(healthyMetrics())).toEqual({ ok: true, issues: [] });
  expect(evaluateNavalEvidence(healthyMetrics({ consoleErrors: 1 })).ok).toBe(false);
  expect(evaluateNavalEvidence(healthyMetrics({ drawCalls: 121 })).ok).toBe(false);
  expect(evaluateNavalEvidence(healthyMetrics({ resourceGrowthAfterWarmup: 1 })).ok).toBe(false);
  expect(evaluateNavalEvidence(healthyMetrics({ portVectorX: -1 })).ok).toBe(false);
});
```

Keep `evaluateNavalEvidence` in `scripts/lib/caribbean-naval-evidence.mjs`; importing the main executable must never start a server during tests.

- [ ] **Step 2: Run the gate-unit test and verify RED**

Run: `mise exec node@20 -- npx vitest run scripts/lib/caribbean-naval-evidence.test.mjs`

Expected: FAIL because the evidence evaluator does not exist.

- [ ] **Step 3: Implement the production-build Playwright journey**

`npm run caribbean:naval-check` must:

1. build with `BUILD_HARNESS=1`;
2. serve `dist` on an unused strict port and wait for a real HTTP 200;
3. launch Chromium with the existing ANGLE arguments;
4. fail on console error, page error, failed request, missing GLB, or unhandled rejection;
5. enter the Battle Lab through real buttons;
6. press/hold A then D and assert heading changes in physical directions through the debug snapshot;
7. align at heading zero, fire Q and E after reload, and assert event muzzle origins are physical port `+X` and starboard `-X`;
8. run 20 seconds after warm-up and assert geometry/material/effect counts plateau;
9. force WebGL construction failure and assert the HTML chart retains battle/restart controls; and
10. write deterministic metrics JSON plus changed screenshots only.

Use a harness-only serialized scenario input to reach a boarding-ready result through real `stepBattle` rules in under 15 browser seconds. The scenario may start with a damaged target; it may not inject an outcome or bypass domain legality.

- [ ] **Step 4: Capture the required evidence**

Write:

- `briefing-tablet.png` at 1180×820;
- `battle-tablet-landscape.png` at 1180×820;
- `battle-desktop.png` at 1440×900;
- `battle-phone.png` at 430×932;
- `boarding-ready-result.png` at 1180×820;
- `fallback-phone.png` at 430×932;
- `broadside-handedness.png` with debug vectors/muzzle origins; and
- `metrics.json` with commit, seed, browser, viewport, DPR, tier, FPS samples, draw calls, triangles, textures, geometry/material counts, effect pool counts, console/request failures, and outcome.

- [ ] **Step 5: Write the honest play/device gate**

`naval-battle-playtest.md` contains three anonymous rows with device, prior sailing-game experience, useful-broadside time, completed-battle duration, outcome explanation, immediate-rematch answer, confusion, and assists used. Pass requires at least 2/3 useful broadsides within 60 seconds without instruction, 3/3 correct decisive-fact explanations, median duration 2–4 minutes, and 2/3 immediate rematches.

Add a separate target-iPad row for cold/warm load, ten-minute thermal session, rotation/background/resume, touch Q/E/A/D, reduced motion, airplane-mode reload, sustained FPS, maximum draw calls/triangles, and Safari/WebGL errors. If Mario/device sessions are unavailable, mark each row `not yet observed`; do not copy desktop automation into them.

`naval-battle-review.md` chooses exactly one:

- `proceed`: engineering, target-iPad, and human thresholds pass;
- `revise-battle`: engineering passes but an observed quality/comprehension gate misses or evidence is incomplete; or
- `stop`: the duel remains unconvincing after one focused revision cycle.

Incomplete external evidence does not prevent continued isolated implementation of port/career code, but it prevents a production-ready or merge claim.

- [ ] **Step 6: Run the complete engineering gate**

Run each command separately:

```text
mise exec node@20 -- npm run check
mise exec node@20 -- npx vitest run
mise exec node@20 -- npm run build
BUILD_HARNESS=1 mise exec node@20 -- npm run build
mise exec node@20 -- npm run caribbean:naval-check
git diff --check
```

Delete stray `*.tsbuildinfo` before the trusted clean-room build using a non-destructive explicit target identified by `find`; do not recursively delete broad directories.

- [ ] **Step 7: External review, milestone rebase, re-verification, and commit**

Run Claude CLI in strictly read-only mode against the cumulative milestone diff and verify each finding before changing code. Then fetch `origin/main`, inspect `git cherry origin/main`, rebase the unpushed branch, and rerun Step 6. Stop rather than merge if conflicts reveal incompatible upstream architecture.

Commit: `test(caribbean): verify production naval duel`

---

## Follow-On Plans After the Naval Milestone

This plan intentionally ends at the first independently testable subsystem. Continue autonomously with the already documented five-minute slice requirements in this order, writing or updating one focused plan before each package:

1. stable campaign state, event journal, validation, and persistence;
2. the HTML Bridgetown port shell, simple market/months, Tavern rumour, and Captain's Log;
3. deterministic strategic sailing, fallback map, Three.js overworld, and encounter handoff;
4. battle-to-capture handoff, recommended capture, fleet comparison, and shipyard;
5. arcade registration, complete port → sea → battle → capture → shipyard → resume journey, browser evidence, and ten-session stop/go review.

Reuse the production naval contracts from this plan; do not recreate them under different names in the older vertical-slice plan.

## Plan Self-Review Checklist

- [ ] Every Milestone 1 requirement in the design spec maps to a task above.
- [ ] No task runtime-imports POC code.
- [ ] All public types consumed by later tasks are produced by earlier tasks.
- [ ] Every test step names an exact command and expected failure/pass.
- [ ] Every UI task includes accessibility, fallback, browser evidence, and disposal requirements.
- [ ] Human and target-device evidence are never substituted with headless automation.
- [ ] The full repository gate runs after the milestone rebase and before any completion claim.
