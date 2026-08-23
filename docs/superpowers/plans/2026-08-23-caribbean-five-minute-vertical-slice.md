# Caribbean Five-Minute Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality, saveable five-minute loop in which a player starts in Bridgetown, buys provisions, hears one direct rumour, sails to a target, fights and captures it, then returns to repair, refit, sell, or manage the prize.

**Architecture:** Create `src/games/caribbean/` as a production module; keep `src/games/caribbean-poc/` as evidence until the slice gate passes. Pure, deterministic TypeScript owns campaign, economy, sailing, battle, capture, and shipyard rules; React coordinates state and accessible screens; independently disposable Three.js adapters render canonical or transient domain snapshots but never decide outcomes.

**Tech Stack:** TypeScript 5.6, React 18, Vitest, Testing Library, Three.js 0.170, Vite 5, Playwright, Meshopt-compressed GLB, CSS, localStorage, and the existing offline PWA.

**Spec:** [`docs/games/caribbean-career/game-design.md`](../../games/caribbean-career/game-design.md), with execution order and measured budgets from [`docs/games/caribbean-career/production-roadmap.md`](../../games/caribbean-career/production-roadmap.md) and POC evidence from [`docs/games/caribbean-career/poc-review.md`](../../games/caribbean-career/poc-review.md).

## Global Constraints

- The working title and route are `Caribbean Career` and `/caribbean`; both remain changeable before public marketing, but save/content IDs never derive from display copy.
- The production module is `src/games/caribbean/`; do not rename or import runtime code from `src/games/caribbean-poc/`.
- Primary target is an iPad-class tablet in landscape; desktop and phone remain supported.
- Three career lengths are available at game start: Adventure, Voyage, and Legend. Adventure is the default.
- The slice uses the documented/composite 1675 consolidation start and shows that date in setup; historical start selection and chapter transitions remain in Phase K after the loop passes.
- The seven port activities stay in this order: Governor's House, Tavern, Market, Shipyard, Divide Shares, Captain's Log, Set Sail.
- Player-facing logistics stay limited to gold, cargo capacity, crew, morale, and provisions shown primarily as months remaining.
- Cargo has exactly six categories in this slice; cannon uses ship capacity but is managed as a fitting, not market cargo.
- A battle exposes hull, sails, crew, cannon/reload, ammunition, sail state, wind, and objective—no additional combat meters.
- Port and starboard follow the physical ship convention: looking forward, port is left and starboard is right. With production forward `+Z`, port is `+X` and starboard is `-X`.
- Domain modules import no React, DOM, Three.js, audio, storage, or network APIs.
- Canonical state is JSON-serializable and versioned; domain code never calls `Math.random()`, `Date.now()`, or browser APIs.
- Rendering may interpolate but never decides hits, prices, standing, morale, inventory, time, or outcomes.
- Every resolved transition emits one typed semantic event; frame positions and pointer samples never enter the campaign event log.
- Autosave after every resolved event; maintain current and previous snapshots; never overwrite an unreadable save silently.
- No runtime asset downloads. GLB, Meshopt decoder, coastline data, prose, and CSS ship in the PWA.
- Production text is at least 14 CSS pixels; interactive targets are at least 44×44 CSS pixels; state never relies on colour alone.
- Production naval budget is at most 120 draw calls, 100,000 visible triangles, adaptive DPR 1.0–1.75, and sustained 50 FPS on the target iPad.
- The optimized POC sloop is the only authored ship model and `sloop` is the only ship class until the vertical-slice evidence is reviewed.
- People are never cargo, market inventory, economic modifiers, or rewards.
- Dancing, stealth, tactical army combat, relationships, treasure, port ownership, crafting, detailed provisions, and a second ship class are outside this plan.
- Do not polish the final visual language during this slice. Fix clarity, handedness, readability, accessibility, disposal, and performance; schedule the major graphics pass after the loop gate.

## Slice Boundary and Player Journey

The only successful end-to-end journey for this plan is:

1. Start an Adventure campaign or resume a valid save.
2. Arrive at Bridgetown with the sloop *Mistral*, 50 crew, 500 gold, and 3.4 months of provisions.
3. Visit the Tavern and pin the one-sentence Red Jackdaw rumour.
4. Visit the Market and make at least one valid buy or sale.
5. Set sail, understand the easterly trade wind, and identify the target.
6. Pursue and enter one legal naval battle.
7. Win by surrender or boarding-ready condition using round, chain, or grape.
8. Resolve cargo, cannon, willing crew, and keep/abandon decisions.
9. Return to Bridgetown and use the Shipyard to repair, rename, refit, redistribute, make flagship, or sell where legal.
10. Reload the page and resume the same resolved state.

The slice does not need a complete career, chapter transition, commission, romance, treasure, conquest, or divide-shares implementation. The corresponding port entries may explain why they are unavailable in this trial, but must not lead to blank screens or dead controls.

## Locked File and Responsibility Map

| Area | Files | Single responsibility |
| --- | --- | --- |
| Product/content governance | `content/caribbean/source-ledger.csv`, `content/caribbean/representation-log.md`, `docs/games/caribbean-career/ip-boundary.md`, `slice-content-packet.md` | Record origin, license/confidence, transformation, and representation review for slice content |
| Content contracts | `src/games/caribbean/content/types.ts`, `slice.ts`, `content.test.ts` | Stable IDs and immutable definitions for one port, six goods, sloop, six fittings, and one rumour |
| Campaign state | `domain/types.ts`, `createCampaign.ts`, `validateCampaign.ts` and tests | Canonical V1 state, deterministic defaults, and boundary validation |
| Events/replay | `domain/events.ts`, `reduceCampaign.ts`, `replay.ts` and tests | Semantic transitions, event IDs, invariant checks, deterministic reproduction |
| Persistence | `storage/checksum.ts`, `schema.ts`, `persistence.ts` and tests | Versioned current/previous snapshots, checksum, recovery, export |
| App coordination | `state/useCaribbean.ts`, `selectors.ts`, tests | Dispatch domain operations, own transient scene sessions, autosave resolved state |
| Product shell | `index.ts`, `components/CaribbeanPage.tsx`, `setup/CampaignSetup.tsx`, `styles/tokens.css`, `styles/caribbean.css` | Arcade registration, start/resume/recovery, mode routing, shared visual shell |
| Port | `components/port/PortPage.tsx`, `PortMenu.tsx`, `GovernorHouse.tsx`, `styles/port.css` | Stable seven-item activity navigation and harbour context |
| Economy | `domain/economy.ts`, `components/port/Market.tsx` and tests | Quotes, atomic trades, cargo allocation, price cues, provisions/months |
| Leads | `domain/quests.ts`, `components/port/Tavern.tsx`, `components/log/CaptainsLog.tsx` and tests | One direct rumour, one next action, deterministic acceptance and completion |
| Sailing | `domain/navigation.ts`, `clock.ts`, tests | Fixed-step course, polar response, voyage time, provisions, arrival/encounter checkpoints |
| Overworld | `components/overworld/OverworldPage.tsx`, `EncounterCard.tsx`, `three/overworld/OverworldScene.ts`, `FallbackMap.tsx` | Input/render adapter, wind/destination HUD, target reveal and battle handoff |
| Naval domain | `domain/naval/types.ts`, `createBattle.ts`, `stepBattle.ts`, `volley.ts`, `opponent.ts`, `replay.ts` and tests | Deterministic fixed-step battle, broadside legality, volley result, damage, AI, outcome |
| Naval presentation | `components/battle/NavalBattlePage.tsx`, `BattleHud.tsx`, `three/naval/NavalScene.ts`, `three/shared/loadSloop.ts`, `effects.ts`, styles | Lazy Three.js scene, pooled effects, accessible controls, battle result handoff |
| Battle audio | `audio/BattleAudio.ts`, tests | Original procedural cannon, impact, splash, rig, surrender, and sea cues driven only by semantic events |
| Fleet/capture | `domain/fleet.ts`, `components/fleet/CapturePage.tsx`, `Shipyard.tsx`, `FleetManager.tsx` and tests | Prize recommendation, capacity-safe transfer, repair/refit/sell/rename/flagship actions |
| Integrated proof | `src/games/caribbean/caribbean.integration.test.tsx`, `scripts/caribbean-slice-check.mjs`, `docs/games/caribbean-career/vertical-slice-playtest.md` | Automated journey, browser/performance evidence, ten-session protocol and stop/go decision |

## Dependency Order

```text
Task 1 handedness correction
  └─> Task 2 content contracts
       └─> Task 3 campaign state
            └─> Task 4 events/replay
                 └─> Task 5 persistence + registration
                      └─> Task 6 setup + port shell
                           ├─> Task 7 market
                           └─> Task 8 rumour/log
                                └─> Task 9 sailing domain
                                     └─> Task 10 overworld/encounter
                                          └─> Task 11 naval domain
                                               └─> Task 12 naval presentation
                                                    └─> Task 13 capture/shipyard
                                                         └─> Task 14 integrated gate
```

Each task ends with a reviewable commit. Do not begin a dependent task until its producer interfaces and tests pass.

## Branch and Review Packaging

The POC is currently on `codex/caribbean-poc`, ahead of `origin/main`. Do not quietly build the production game on an unreviewed 4,000-line POC branch.

| Package | Tasks | Branch point and integration gate |
| --- | --- | --- |
| POC correction | 1 | Run on `codex/caribbean-poc`; review the handedness screenshot and focused diff, then integrate the POC/docs branch |
| Foundation | 2–5 | Fresh worktree from the main branch containing the accepted POC; merge after state/replay/save review |
| Readable port | 6–8 | Fresh worktree from integrated Foundation; merge only after the under-one-minute port review |
| Sea and encounter | 9–10 | Fresh worktree from integrated Port; merge after deterministic sailing and browser fallback review |
| Battle | 11–12 | Fresh worktree from integrated Sea; merge after rules, handedness, disposal, audio, and target-iPad gates |
| Progression payoff | 13 | Fresh worktree from integrated Battle; merge after three capture/management fixtures pass human review |
| Slice evidence | 14 | Fresh worktree from integrated Progression; merge only with the explicit stop/go review |

This packaging keeps each review reversible and respects the roadmap's one phase-sized feature per worktree rule. A package may contain multiple commits, but do not parallelize dependent packages against stale interfaces.

---

### Task 1: Correct and Lock Nautical Handedness

**Files:**
- Modify: `src/games/caribbean-poc/domain/battle.ts`
- Modify: `src/games/caribbean-poc/domain/battle.test.ts`
- Modify: `src/games/caribbean-poc/three/BattleScene.ts`
- Create: `docs/screenshots/caribbean-poc/broadside-handedness.png`

**Interfaces:**
- Consumes: the POC convention `heading = 0` means bow toward world `+Z` and the GLB is rotated to the same forward axis.
- Produces: `broadsideVector(heading: number, side: Broadside): Point`, used by collision, projectiles, smoke, and later production code as the handedness oracle.

- [ ] **Step 1: Add the failing physical-side tests**

Replace the current test that calls `+X` starboard with literal physical expectations:

```ts
it('maps physical sides for a ship whose bow points +Z', () => {
  expect(broadsideVector(0, 'port')).toEqual({ x: 1, z: 0 });
  expect(broadsideVector(0, 'starboard')).toEqual({ x: -1, z: 0 });
  expect(bearingSide({ x: 0, z: 0 }, 0, { x: 20, z: 0 })).toBe('port');
  expect(bearingSide({ x: 0, z: 0 }, 0, { x: -20, z: 0 })).toBe('starboard');
});

it('launches each broadside from its named physical side', () => {
  const state = createBattle({ seed: 123 });
  state.ships.player.position = { x: 0, z: 0 };
  state.ships.player.heading = 0;

  const port = fireBroadside(state, 'player', 'port');
  const starboard = fireBroadside(state, 'player', 'starboard');

  expect(port.projectiles.every((shot) => shot.position.x > 0 && shot.velocity.x > 0)).toBe(true);
  expect(starboard.projectiles.every((shot) => shot.position.x < 0 && shot.velocity.x < 0)).toBe(true);
});

it('turns a starboard rudder toward physical starboard', () => {
  const state = createBattle({ seed: 44 });
  state.ships.player.heading = 0;
  const next = stepBattle(state, { player: { rudder: 1 } }, 0.5);
  expect(next.ships.player.heading).toBeLessThan(0);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean-poc/domain/battle.test.ts`

Expected: FAIL because current `bearingSide`, broadside angle, and positive-rudder turn all use the reversed lateral convention.

- [ ] **Step 3: Make one convention the source of truth**

Add and use this helper in `battle.ts`:

```ts
export function broadsideVector(heading: number, side: Broadside): Point {
  const lateral = side === 'port' ? 1 : -1;
  return {
    x: Math.cos(heading) * lateral,
    z: -Math.sin(heading) * lateral,
  };
}
```

Use its dot product in `bearingSide`, use it for projectile origin/velocity in `fireBroadside`, and change movement to `ship.heading -= ship.rudder * turnRate * dt`. In `BattleScene.emitEvent`, import `broadsideVector` and use the returned vector for smoke position and velocity; do not recalculate a side angle in the renderer.

- [ ] **Step 4: Verify rules and the exact visual symptom**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean-poc/domain/battle.test.ts src/games/caribbean-poc/domain/opponent.test.ts`

Expected: PASS.

Run the POC at `http://127.0.0.1:5173/preview-caribbean.html?debug=1`, align the player bow away from the camera, fire Q then E after reload, and save one screenshot showing Q smoke/projectiles on physical port and E on physical starboard. Verify A turns to port and D to starboard.

- [ ] **Step 5: Commit the focused correction**

```bash
git add src/games/caribbean-poc/domain/battle.ts src/games/caribbean-poc/domain/battle.test.ts src/games/caribbean-poc/three/BattleScene.ts docs/screenshots/caribbean-poc/broadside-handedness.png
git commit -m "fix(caribbean): correct port and starboard handedness"
```

### Task 2: Establish Original Slice Content and Stable IDs

**Files:**
- Create: `content/caribbean/source-ledger.csv`
- Create: `content/caribbean/representation-log.md`
- Create: `docs/games/caribbean-career/ip-boundary.md`
- Create: `docs/games/caribbean-career/slice-content-packet.md`
- Create: `src/games/caribbean/content/types.ts`
- Create: `src/games/caribbean/content/slice.ts`
- Create: `src/games/caribbean/content/content.test.ts`

**Interfaces:**
- Consumes: historical/content rules in `historical-framework.md` and the independent-expression boundary in `2004-mechanics-research.md`.
- Produces: `PORTS`, `GOODS`, `SHIP_CLASSES`, `FITTINGS`, and `LEADS`, keyed by stable IDs and containing no mutable campaign state.

- [ ] **Step 1: Write content-contract tests**

```ts
import { FITTINGS, GOODS, LEADS, PORTS, SHIP_CLASSES } from './slice';

it('keeps the slice intentionally narrow and IDs unique', () => {
  expect(Object.keys(PORTS)).toEqual(['bridgetown']);
  expect(Object.keys(GOODS)).toEqual([
    'provisions', 'tools', 'luxuries', 'sugar-molasses', 'tobacco-dyewood', 'powder-arms',
  ]);
  expect(Object.keys(SHIP_CLASSES)).toEqual(['sloop']);
  expect(new Set(Object.keys(FITTINGS)).size).toBe(6);
  expect(Object.keys(LEADS)).toEqual(['red-jackdaw']);
});

it('labels history and never defines people as cargo', () => {
  expect(PORTS.bridgetown.history.kind).toBe('documented');
  expect(Object.values(GOODS).map((good) => good.id)).not.toContain('people');
  expect(Object.values(GOODS).every((good) => good.labourNote.length > 0)).toBe(true);
});
```

- [ ] **Step 2: Run the content test and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/content/content.test.ts`

Expected: FAIL because the production content module does not exist.

- [ ] **Step 3: Define the exact content contracts**

Create `content/types.ts` with these exported types:

```ts
export type PortId = 'bridgetown';
export type CargoId =
  | 'provisions'
  | 'tools'
  | 'luxuries'
  | 'sugar-molasses'
  | 'tobacco-dyewood'
  | 'powder-arms';
export type ShipClassId = 'sloop';
export type FittingId =
  | 'careened-hull'
  | 'fine-canvas'
  | 'expanded-berths'
  | 'reinforced-scantlings'
  | 'improved-gun-carriages'
  | 'ammunition-lockers';
export type LeadId = 'red-jackdaw';
export type HistoryKind = 'documented' | 'disputed' | 'composite' | 'invented';

export interface HistoryNote {
  kind: HistoryKind;
  sourceIds: string[];
  compression: string;
}

export interface PortDefinition {
  id: PortId;
  name: string;
  position: { x: number; z: number };
  controller: 'english';
  prosperity: 'modest';
  defense: 'guarded';
  market: Record<CargoId, { price: number; stock: number }>;
  history: HistoryNote;
}

export interface GoodDefinition {
  id: CargoId;
  name: string;
  baselinePrice: number;
  labourNote: string;
}

export interface ShipClassDefinition {
  id: ShipClassId;
  name: string;
  hold: number;
  crew: { minimum: number; safe: number; maximum: number };
  cannonMaximum: number;
  hullMaximum: number;
  sailMaximum: number;
  topSpeed: number;
  turnResponse: number;
  bestWindAngle: number;
  fittingSlots: number;
}

export interface FittingDefinition {
  id: FittingId;
  name: string;
  price: number;
  effect: string;
}

export interface LeadDefinition {
  id: LeadId;
  sentence: string;
  nextAction: string;
  expiresAfterDays: number;
  searchArea: { x: number; z: number };
  history: HistoryNote;
}
```

In `slice.ts`, define Bridgetown at `{ x: 0, z: 0 }` with market prices/stocks: provisions `4/60`, tools `18/18`, luxuries `32/6`, sugar-molasses `10/24`, tobacco-dyewood `13/20`, and powder-arms `26/10`. Good baseline prices are `5, 15, 36, 10, 12, 22` in the same order. Define the target search area east of port at `{ x: 64, z: -18 }` and the one-sentence rumour: “The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.”

Define the sloop with hold `100`, crew minimum/safe/maximum `12/50/75`, cannon maximum `12`, hull/sail maximum `100/100`, top speed `5.6`, turn response `0.52`, best wind angle `90`, and two fitting slots. Define fitting prices/effects as: Careened Hull `260/+6% maximum speed`; Fine Canvas `300/+8% sail drive, +5% sail repair cost`; Expanded Berths `240/+12 safe/max crew, −6 hold`; Reinforced Scantlings `340/+15 max hull, −4% turn response`; Improved Gun Carriages `360/−8% reload, +2 hold used`; Ammunition Lockers `320/−12% volley dispersion, +2 hold used`. Export each collection with `as const satisfies` so missing or extra IDs fail type checking.

- [ ] **Step 4: Record sources and expression boundaries**

Seed the source ledger with exact columns:

```csv
content_id,source_url,creator_or_institution,license_or_use,access_date,confidence,transformation,reviewer,release_status
port-bridgetown,https://whc.unesco.org/en/list/1376/,UNESCO World Heritage Centre,factual reference,2026-08-23,documented,"Approximate location and port significance; all interface prose and residents independently authored",unassigned,prototype-only
trade-winds,https://oceanservice.noaa.gov/facts/tradewinds.html,NOAA,factual reference,2026-08-23,documented,"Simplified persistent easterly wind; original numbers and map scale",unassigned,prototype-only
```

`ip-boundary.md` must explicitly prohibit the reference game's title, logos, characters, dialogue, map art, UI composition, music, models, animations, numbers, and marketing language. `slice-content-packet.md` must distinguish documented Bridgetown facts from invented Red Jackdaw, Mistral, residents, prices, and encounter details. `representation-log.md` records that no people are cargo and that sugar/molasses and tobacco/dyewood descriptions acknowledge coerced labour without turning suffering into a bonus mechanic.

- [ ] **Step 5: Verify and commit content contracts**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/content/content.test.ts`

Expected: PASS.

```bash
git add content/caribbean docs/games/caribbean-career/ip-boundary.md docs/games/caribbean-career/slice-content-packet.md src/games/caribbean/content
git commit -m "docs(caribbean): lock vertical slice content contracts"
```

### Task 3: Create and Validate `CampaignStateV1`

**Files:**
- Create: `src/games/caribbean/domain/types.ts`
- Create: `src/games/caribbean/domain/createCampaign.ts`
- Create: `src/games/caribbean/domain/createCampaign.test.ts`
- Create: `src/games/caribbean/domain/validateCampaign.ts`
- Create: `src/games/caribbean/domain/validateCampaign.test.ts`

**Interfaces:**
- Consumes: stable content IDs from Task 2.
- Produces: `CampaignStateV1`, `CreateCampaignOptions`, `createCampaign(options)`, `validateCampaign(input)`, `emptyCargo()`.

- [ ] **Step 1: Write literal constructor fixtures**

```ts
it.each(['adventure', 'voyage', 'legend'] as const)('creates deterministic %s campaigns', (length) => {
  const options = { seed: 1702, name: 'Morgan', pronouns: 'they/them', talent: 'navigation', length } as const;
  const first = createCampaign(options);
  const second = createCampaign(options);
  expect(first).toEqual(second);
  expect(first.schemaVersion).toBe(1);
  expect(first.mode).toEqual({ kind: 'port', portId: 'bridgetown', activity: 'menu' });
  expect(first.fleet.ships).toHaveLength(1);
  expect(first.fleet.ships[0]).toMatchObject({ classId: 'sloop', name: 'Mistral', crew: 50, cannon: 8 });
  expect(first.fleet.ships[0].cargo.provisions).toBe(34);
});

it('does not share mutable defaults', () => {
  const a = createCampaign(OPTIONS);
  const b = createCampaign(OPTIONS);
  a.fleet.ships[0].cargo.provisions = 0;
  expect(b.fleet.ships[0].cargo.provisions).toBe(34);
});
```

- [ ] **Step 2: Run constructor tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/createCampaign.test.ts`

Expected: FAIL because the campaign types and constructor do not exist.

- [ ] **Step 3: Define the canonical state without UI objects**

Use these exact top-level fields:

```ts
export type CampaignLength = 'adventure' | 'voyage' | 'legend';
export type Talent = 'fencing' | 'gunnery' | 'navigation' | 'charm' | 'medicine';
export type PortActivity = 'menu' | 'governor' | 'tavern' | 'market' | 'shipyard' | 'shares' | 'log';
export type CampaignMode =
  | { kind: 'port'; portId: PortId; activity: PortActivity }
  | { kind: 'sailing'; voyageId: string; checkpoint: SailingCheckpoint }
  | { kind: 'encounter'; encounterId: string }
  | { kind: 'naval'; battleId: string; input: NavalBattleInput }
  | { kind: 'capture'; battleId: string; prize: PrizeSnapshot; voyageId: string; returnCheckpoint: SailingCheckpoint }
  | { kind: 'boarding'; battleId: string }
  | { kind: 'treasure'; leadId: LeadId }
  | { kind: 'shares'; portId: PortId }
  | { kind: 'retired'; score: number };

export interface ShipState {
  id: string;
  classId: ShipClassId;
  name: string;
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
  cargo: Record<CargoId, number>;
  fittings: FittingId[];
}

export interface CampaignStateV1 {
  schemaVersion: 1;
  contentVersion: 'vertical-slice-1';
  campaignId: string;
  settings: {
    length: CampaignLength;
    aimAssist: boolean;
    steeringAssist: boolean;
    reducedMotion: boolean;
    audio: { master: number; effects: number; music: number; muted: boolean };
  };
  clock: { day: number; year: 1675; scale: number };
  mode: CampaignMode;
  captain: { name: string; pronouns: string; talent: Talent; gold: number };
  crew: { morale: 'very-happy' | 'happy' | 'content' | 'unhappy' | 'mutinous' };
  fleet: { flagshipId: string; ships: ShipState[] };
  standings: { english: number; french: number; spanish: number; dutch: number };
  world: {
    ports: Record<PortId, {
      prosperity: 'modest';
      defense: 'guarded';
      marketStock: Record<CargoId, number>;
    }>;
    targetDefeated: boolean;
  };
  leads: LeadState[];
  relationships: Record<string, never>;
  legacy: { capturedShips: number; goldEarned: number };
  rng: { world: number; navigation: number; naval: number };
  lastEventId: number;
}
```

Define these future-task handoff types in `domain/types.ts` now so mode and feature boundaries never depend on undeclared names:

```ts
export interface Point { x: number; z: number }
export interface SailingCheckpoint {
  tick: number;
  position: Point;
  heading: number;
  elapsedDays: number;
  provisionsUsed: number;
}
export interface NavalBattleInput {
  battleId: string;
  voyageId: string;
  seed: number;
  playerShipId: string;
  enemy: 'red-jackdaw';
  windFrom: number;
  windStrength: number;
  coastline: 'bridgetown-east-approach';
  timeOfDay: 'late-afternoon';
  legalStatus: 'hostile';
  returnCheckpoint: SailingCheckpoint;
}
export type NavalOutcome =
  | { kind: 'surrender' | 'sunk' | 'boarding-ready'; victorShipId: string }
  | { kind: 'escaped' | 'separated'; shipId: string };
export interface PrizeSnapshot {
  battleId: string;
  ship: ShipState;
  willingCrew: number;
}
export interface CaptureDecision {
  battleId: string;
  cargo: Partial<Record<CargoId, number>>;
  cannon: number;
  willingCrew: number;
  keepShip: boolean;
  prizeName: string;
}
export type ShipyardAction =
  | { type: 'repair'; shipId: string; hullPoints: number; sailPoints: number }
  | { type: 'rename'; shipId: string; name: string }
  | { type: 'make-flagship'; shipId: string }
  | { type: 'sell'; shipId: string }
  | { type: 'install-fitting'; shipId: string; fittingId: FittingId }
  | { type: 'transfer-crew'; from: string; to: string; amount: number }
  | { type: 'transfer-cannon'; from: string; to: string; amount: number }
  | { type: 'transfer-cargo'; from: string; to: string; cargoId: CargoId; amount: number };
export interface LeadState {
  id: LeadId;
  kind: 'rumour';
  status: 'active' | 'completed' | 'expired';
  acceptedDay: number;
  expiresDay: number | null;
  nextAction: string;
}
```

`createCampaign` uses `campaign-${seed >>> 0}`, length scales `{ adventure: 3, voyage: 1, legend: 0.35 }`, starting gold `500`, 50 crew, 8 cannon, cargo from `emptyCargo({ provisions: 34, tools: 4 })`, and audio defaults `{ master: 0.8, effects: 0.9, music: 0, muted: false }`. Task 7 introduces the `provisions / (totalCrew * 0.2)` months selector and rounds only in presentation.

- [ ] **Step 4: Add boundary validation tests and implementation**

Test unknown content IDs, missing flagship, duplicate ship IDs, negative gold/cargo/market stock, cargo above total hold, crew/cannon above class maxima, duplicated fittings, non-integer event ID, invalid clock, and duplicate lead IDs. Return every issue in one pass:

```ts
export type ValidationResult =
  | { ok: true; value: CampaignStateV1 }
  | { ok: false; issues: Array<{ path: string; message: string }> };

export function validateCampaign(input: unknown): ValidationResult;
```

Use explicit property/type guards; do not cast untrusted input and do not add a runtime schema dependency.

- [ ] **Step 5: Verify deterministic, valid construction and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/createCampaign.test.ts src/games/caribbean/domain/validateCampaign.test.ts`

Expected: PASS.

```bash
git add src/games/caribbean/domain
git commit -m "feat(caribbean): add canonical campaign state"
```

### Task 4: Add Semantic Events, Reducer, and Replay

**Files:**
- Create: `src/games/caribbean/domain/events.ts`
- Create: `src/games/caribbean/domain/reduceCampaign.ts`
- Create: `src/games/caribbean/domain/reduceCampaign.test.ts`
- Create: `src/games/caribbean/domain/replay.ts`
- Create: `src/games/caribbean/domain/replay.test.ts`

**Interfaces:**
- Consumes: validated `CampaignStateV1` from Task 3.
- Produces: `CampaignEvent`, `EventDraft`, `CampaignJournal`, `createJournal`, `appendEvent`, `appendJournal`, `reduceCampaign`, and `replayCampaign`.

- [ ] **Step 1: Write event-order and immutability tests**

```ts
it('assigns the next ID and leaves the input untouched', () => {
  const before = createCampaign(OPTIONS);
  const frozen = structuredClone(before);
  const result = appendEvent(before, {
    type: 'port-activity-selected',
    atDay: 0,
    seed: 1702,
    payload: { activity: 'market' },
  });
  expect(result.event.id).toBe(1);
  expect(result.state.lastEventId).toBe(1);
  expect(result.state.mode).toEqual({ kind: 'port', portId: 'bridgetown', activity: 'market' });
  expect(before).toEqual(frozen);
});

it('rejects skipped, repeated, and out-of-order IDs', () => {
  const initial = createCampaign(OPTIONS);
  const eventWithId = (id: number): CampaignEvent => ({
    id,
    type: 'port-activity-selected',
    atDay: 0,
    seed: 1702,
    payload: { activity: 'market' },
  });
  expect(() => reduceCampaign(initial, eventWithId(2))).toThrow(/expected event 1/i);
  const once = reduceCampaign(initial, eventWithId(1));
  expect(() => reduceCampaign(once, eventWithId(1))).toThrow(/expected event 2/i);
});
```

- [ ] **Step 2: Run reducer tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/reduceCampaign.test.ts`

Expected: FAIL because the event contract does not exist.

- [ ] **Step 3: Define the slice event union and pure reducer**

Define the reusable envelope and the one event implemented by this task. Later feature tasks extend the union and reducer in the same commit as their validation logic, so the central reducer never contains speculative or dead branches:

```ts
interface EventEnvelope<TType extends string, TPayload> {
  id: number;
  type: TType;
  atDay: number;
  seed: number;
  payload: TPayload;
}

export type CampaignEvent = EventEnvelope<
  'port-activity-selected',
  { activity: PortActivity }
>;
```

Use these helpers so feature tasks can request their exact draft type:

```ts
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
export type EventDraft = WithoutId<CampaignEvent>;
export type EventOf<T extends CampaignEvent['type']> = Extract<CampaignEvent, { type: T }>;
export type EventDraftFor<T extends CampaignEvent['type']> = WithoutId<EventOf<T>>;
```

`appendEvent(state, draft)` returns `{ state: CampaignStateV1; event: CampaignEvent }`, sets `id = state.lastEventId + 1`, calls `reduceCampaign`, then validates the result. Every reducer branch returns a cloned state; exhaustive `assertNever` makes a newly added event fail compilation until handled.

Keep the replayable history outside canonical domain state to avoid recursive save types:

```ts
export interface CampaignJournal {
  initial: CampaignStateV1;
  events: CampaignEvent[];
  state: CampaignStateV1;
}

export function createJournal(initial: CampaignStateV1): CampaignJournal;
export function appendJournal(journal: CampaignJournal, draft: EventDraft): CampaignJournal;
export function compactJournal(journal: CampaignJournal): CampaignJournal;
```

`appendJournal` calls `appendEvent`, appends the returned event, and publishes the returned state without mutating the prior journal. `initial` means the replay base, not necessarily campaign day zero. After replay verification, `compactJournal` may replace `initial` with the current state and clear `events` while preserving `lastEventId`; the next event still uses `lastEventId + 1`.

- [ ] **Step 4: Prove deterministic replay**

Create a literal stream selecting Tavern, returning to menu, then selecting Market. Assert:

```ts
const first = replayCampaign(initial, events);
const second = replayCampaign(initial, structuredClone(events));
expect(JSON.stringify(first)).toBe(JSON.stringify(second));
expect(first.lastEventId).toBe(events.length);
expect(validateCampaign(first).ok).toBe(true);
```

Also test that malformed payloads and a seed outside unsigned 32-bit range are rejected before state changes.

- [ ] **Step 5: Run domain tests and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain`

Expected: PASS.

```bash
git add src/games/caribbean/domain
git commit -m "feat(caribbean): add deterministic campaign events"
```

### Task 5: Add Rotating Save Snapshots and Arcade Registration

**Files:**
- Create: `src/games/caribbean/storage/checksum.ts`
- Create: `src/games/caribbean/storage/schema.ts`
- Create: `src/games/caribbean/storage/persistence.ts`
- Create: `src/games/caribbean/storage/persistence.test.ts`
- Create: `src/games/caribbean/index.ts`
- Create: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/app/registry.ts`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `CampaignJournal`, `replayCampaign`, and `validateCampaign`.
- Produces: `saveCampaign`, `loadCampaign`, `clearCampaign`, `exportUnreadableSave`, `CaribbeanLoadResult`, and a `GameDescriptor` with Save Station metadata.

- [ ] **Step 1: Write storage failure and rotation tests**

Use an injected storage contract:

```ts
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
```

Test exact behavior:

```ts
it('rotates a verified current save to previous before publishing the next save', () => {
  const storage = memoryStorage();
  saveCampaign(storage, FIRST_JOURNAL, { savedAt: 100, build: 'test' });
  saveCampaign(storage, SECOND_JOURNAL, { savedAt: 200, build: 'test' });
  expect(loadCampaign(storage)).toMatchObject({ kind: 'loaded', journal: SECOND_JOURNAL, recovered: false });
  expect(readEnvelope(storage, 'caribbean-campaign-previous-v1').payload).toEqual(FIRST_JOURNAL);
});

it('recovers the previous snapshot when current is corrupt', () => {
  const storage = memoryStorage();
  saveCampaign(storage, FIRST_JOURNAL, { savedAt: 100, build: 'test' });
  saveCampaign(storage, SECOND_JOURNAL, { savedAt: 200, build: 'test' });
  storage.setItem('caribbean-campaign-current-v1', '{broken');
  expect(loadCampaign(storage)).toMatchObject({ kind: 'loaded', journal: FIRST_JOURNAL, recovered: true });
});

it('preserves unreadable raw data for export and never replaces it during load', () => {
  const storage = memoryStorage({ 'caribbean-campaign-current-v1': 'future-data' });
  expect(loadCampaign(storage)).toEqual({ kind: 'unreadable', currentRaw: 'future-data', previousRaw: null });
  expect(storage.getItem('caribbean-campaign-current-v1')).toBe('future-data');
});
```

At the top of the test file, construct the named journals from real domain operations:

```ts
const FIRST_JOURNAL = createJournal(createCampaign({
  seed: 1702,
  name: 'Morgan',
  pronouns: 'they/them',
  talent: 'navigation',
  length: 'adventure',
}));
const SECOND_JOURNAL = appendJournal(FIRST_JOURNAL, {
  type: 'port-activity-selected',
  atDay: 0,
  seed: 1702,
  payload: { activity: 'market' },
});
```

- [ ] **Step 2: Run persistence tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/storage/persistence.test.ts`

Expected: FAIL because persistence is absent.

- [ ] **Step 3: Implement the versioned envelope and checksum**

```ts
export interface SaveEnvelopeV1 {
  version: 1;
  build: string;
  savedAt: number;
  checksum: string;
  payload: CampaignJournal;
}

export type CaribbeanLoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; journal: CampaignJournal; savedAt: number; recovered: boolean }
  | { kind: 'unreadable'; currentRaw: string | null; previousRaw: string | null };
```

Implement `checksum` as 32-bit FNV-1a over `JSON.stringify(payload)`, formatted as eight lowercase hexadecimal characters. On save: validate `initial` and `state`, replay `events` from `initial`, require the replayed state to equal `state`, then compact once the journal exceeds 256 events or 512 KiB before envelope overhead. Serialize the new envelope, parse and verify that serialization in memory, copy the existing valid current raw string to previous, then write current. If any storage operation throws, return `{ ok: false, reason: 'storage-unavailable' }` without throwing into React. Tests prove compaction preserves state/event numbering and keeps subsequent replay deterministic.

- [ ] **Step 4: Register the production shell and Save Station**

Create a lazy-safe descriptor at `/caribbean` with `players: { min: 1, max: 1 }`, `computer: true`, and a `savedGames()` row only for `kind: 'loaded'`, reading summary fields from `result.journal.state`. The row title is `Caribbean Career — <captain name>` and initial meta is `<length> · <mode>`; Task 7 adds `<months> months provisions` after the selector exists. Add it to `GAMES` after `unicorn` and add an app test that the ticket and resumable row route to `/caribbean`.

`CaribbeanPage` at this task renders one of three explicit states: start new campaign, resume summary, or unreadable-save recovery with Download raw save and Abandon buttons. It must not start or erase a campaign on mount.

- [ ] **Step 5: Verify persistence, registry behavior, and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/storage/persistence.test.ts src/app/App.test.tsx`

Expected: PASS.

```bash
git add src/games/caribbean src/app/registry.ts src/app/App.test.tsx
git commit -m "feat(caribbean): add resilient campaign saves"
```

### Task 6: Build Campaign Setup, State Coordinator, and Seven-Item Port Shell

**Files:**
- Create: `src/games/caribbean/state/useCaribbean.ts`
- Create: `src/games/caribbean/state/useCaribbean.test.tsx`
- Create: `src/games/caribbean/state/selectors.ts`
- Create: `src/games/caribbean/components/setup/CampaignSetup.tsx`
- Create: `src/games/caribbean/components/port/PortPage.tsx`
- Create: `src/games/caribbean/components/port/PortMenu.tsx`
- Create: `src/games/caribbean/components/port/GovernorHouse.tsx`
- Create: `src/games/caribbean/styles/tokens.css`
- Create: `src/games/caribbean/styles/caribbean.css`
- Create: `src/games/caribbean/styles/port.css`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Create: `src/games/caribbean/components/CaribbeanPage.test.tsx`

**Interfaces:**
- Consumes: constructor, reducer/events, persistence, and content definitions.
- Produces: `useCaribbean(): CaribbeanController`, selectors for the HUD, setup form, and the stable port activity router.

- [ ] **Step 1: Write the coordinator and setup tests**

```ts
it('defaults to Adventure while making all lengths an explicit start choice', async () => {
  render(<CaribbeanPage storage={memoryStorage()} />);
  expect(screen.getByRole('radio', { name: /Adventure/i })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Voyage/i })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: /Legend/i })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: /Begin career/i }));
  expect(screen.getByRole('heading', { name: 'Bridgetown' })).toBeVisible();
});

it('autosaves only resolved semantic transitions', async () => {
  const storage = spyingStorage();
  const controller = renderHook(() => useCaribbean({ storage })).result;
  act(() => controller.current.start(OPTIONS));
  expect(loadCampaign(storage).kind).toBe('loaded');
  expect(loadedState(storage).lastEventId).toBe(0);
  act(() => controller.current.selectPortActivity('market'));
  expect(loadedState(storage).lastEventId).toBe(1);
});
```

- [ ] **Step 2: Run the shell tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/state/useCaribbean.test.tsx src/games/caribbean/components/CaribbeanPage.test.tsx`

Expected: FAIL because the coordinator and screens do not exist.

- [ ] **Step 3: Implement one coordinator boundary**

```ts
export interface CaribbeanController {
  state: CampaignStateV1 | null;
  journal: CampaignJournal | null;
  load: CaribbeanLoadResult;
  start(options: CreateCampaignOptions): void;
  resume(): void;
  abandon(): void;
  selectPortActivity(activity: PortActivity): void;
  dispatch(draft: EventDraft): void;
}
```

`start` creates a journal from the new campaign. `dispatch` calls `appendJournal`, updates the journal and its derived `state`, then saves the returned journal. Scene animation frames remain in scene/session components and do not call this dispatcher. Any save failure shows a persistent non-modal warning while play continues in memory.

- [ ] **Step 4: Implement the setup and port activity contract**

Setup collects captain name, pronouns, one of five talents, and career length; it displays `Historical start: 1675 — trade and imperial consolidation` as fixed slice context, not a deceptive disabled selector. Accessibility defaults are aim assist on, steering assist off, reduced motion from `matchMedia`. The port menu renders these exact labels and states:

| Activity | Slice behavior |
| --- | --- |
| Governor's House | English standing, current peace/hostility summary, and “No commission offered today” |
| Tavern | Enabled; Task 8 supplies the rumour card |
| Market | Enabled; Task 7 supplies trading |
| Shipyard | Enabled; Task 13 supplies management; before then it shows current ship condition read-only |
| Divide Shares | Disabled with “Available after a profitable voyage” |
| Captain's Log | Enabled; Task 8 supplies leads; initially says “No leads yet” |
| Set Sail | Enabled only while flagship, minimum crew, and positive provisions validate |

Remember the last selected activity while the mode remains at the same port; reset to `menu` after departure/docking. Port CSS uses the approved Caribbean palette and a static/procedural harbour background; it must not import Three.js.

- [ ] **Step 5: Verify keyboard/focus behavior and commit**

Test Tab order follows the seven-item order, Escape returns from an activity to the menu, all active controls are at least 44 px by CSS rule, and the current activity has `aria-current="page"`.

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/state src/games/caribbean/components`

Expected: PASS.

```bash
git add src/games/caribbean
git commit -m "feat(caribbean): add campaign setup and port shell"
```

### Task 7: Implement Six-Good Market and Provisions in Months

**Files:**
- Create: `src/games/caribbean/domain/economy.ts`
- Create: `src/games/caribbean/domain/economy.test.ts`
- Create: `src/games/caribbean/components/port/Market.tsx`
- Create: `src/games/caribbean/components/port/Market.test.tsx`
- Modify: `src/games/caribbean/state/selectors.ts`
- Modify: `src/games/caribbean/index.ts`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/styles/port.css`

**Interfaces:**
- Consumes: campaign fleet/cargo, Bridgetown prices/stock, and `market-traded` event.
- Produces: `quoteTrade`, `tradeEvent`, `monthsRemaining`, `fleetCargoUsed`, the `market-traded` event/reducer branch, and accessible market rows.

- [ ] **Step 1: Write literal economy tables**

```ts
it.each([
  [34, 50, 3.4],
  [10, 50, 1],
  [0, 50, 0],
  [34, 25, 6.8],
] as const)('derives %s provisions for %s crew as %s months', (provisions, crew, months) => {
  expect(monthsRemaining(provisions, crew)).toBeCloseTo(months, 5);
});

it('quotes and applies a trade atomically', () => {
  const state = createCampaign(OPTIONS);
  const quote = quoteTrade(state, PORTS.bridgetown, { shipId: 'ship-mistral', cargoId: 'provisions', delta: 5 });
  expect(quote).toMatchObject({ ok: true, unitPrice: 4, total: 20, goldAfter: 480, quantityAfter: 39 });
  if (!quote.ok) throw new Error('Expected a valid trade quote');
  const next = appendEvent(state, tradeEvent(state, quote)).state;
  expect(next.captain.gold).toBe(480);
  expect(findShip(next, 'ship-mistral').cargo.provisions).toBe(39);
});
```

Test insufficient gold, insufficient stock, sell above owned, exact hold boundary, over-capacity by one, invalid zero delta, multi-ship capacity, and buy/sell round trip.

- [ ] **Step 2: Run economy tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/economy.test.ts`

Expected: FAIL because economy functions do not exist.

- [ ] **Step 3: Implement quote-first atomic trades**

```ts
export type TradeRequest = { shipId: string; cargoId: CargoId; delta: number };
export type TradeQuote =
  | { ok: true; request: TradeRequest; unitPrice: number; total: number; goldAfter: number; quantityAfter: number; cargoUsedAfter: number }
  | { ok: false; reason: 'unknown-ship' | 'invalid-quantity' | 'insufficient-gold' | 'insufficient-stock' | 'insufficient-cargo' | 'insufficient-space' };

export function quoteTrade(state: CampaignStateV1, port: PortDefinition, request: TradeRequest): TradeQuote;
export function tradeEvent(state: CampaignStateV1, quote: Extract<TradeQuote, { ok: true }>): EventDraftFor<'market-traded'>;
```

Extend `CampaignEvent` with `EventEnvelope<'market-traded', { portId: PortId; shipId: string; cargoId: CargoId; delta: number; unitPrice: number }>` and add its exhaustive reducer branch. The branch re-runs the quote against current gold, ship capacity, owned cargo, content price, and canonical `marketStock` before changing gold, ship cargo, and stock atomically. One cargo unit occupies one hold unit in this slice. `priceCue(price, baseline)` returns `cheap` at `≤0.85`, `expensive` at `≥1.15`, otherwise `fair`. Never round the domain's months; selectors expose the raw number and presentation uses one decimal.

- [ ] **Step 4: Build an accessible, compact market**

Each of six rows shows good name, quantity, unit price, Cheap/Fair/Expensive plus an icon/word, and buttons `Sell all`, `−5`, `−1`, `+1`, `+5`, `Max`. Disable impossible actions and show the quote's exact gold/capacity result before dispatch. Place a persistent summary above rows: `Gold`, `Hold used/capacity`, and `Provisions 3.4 months`; the months value updates in the same React commit as quantity.

Update the Save Station meta to `<length> · <mode> · <months to one decimal> months provisions` using the same selector.

- [ ] **Step 5: Verify domain/UI and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/economy.test.ts src/games/caribbean/components/port/Market.test.tsx`

Expected: PASS.

```bash
git add src/games/caribbean
git commit -m "feat(caribbean): add simple market and provisions"
```

### Task 8: Add One Direct Tavern Rumour and Captain's Log

**Files:**
- Create: `src/games/caribbean/domain/quests.ts`
- Create: `src/games/caribbean/domain/quests.test.ts`
- Create: `src/games/caribbean/components/port/Tavern.tsx`
- Create: `src/games/caribbean/components/port/Tavern.test.tsx`
- Create: `src/games/caribbean/components/log/CaptainsLog.tsx`
- Create: `src/games/caribbean/components/log/CaptainsLog.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`

**Interfaces:**
- Consumes: `LEADS['red-jackdaw']`, campaign clock, and `lead-accepted` event.
- Produces: `acceptLeadEvent`, `completeLeadEvent`, `activeLeads`, the lead event/reducer branches, a one-card Tavern, and a one-next-action Log.

- [ ] **Step 1: Write lifecycle tests with exact copy**

```ts
it('accepts the rumour once and exposes one next action', () => {
  const state = createCampaign(OPTIONS);
  const accepted = acceptLeadEvent(state, 'red-jackdaw');
  const next = appendEvent(state, accepted).state;
  expect(next.leads).toEqual([{
    id: 'red-jackdaw',
    kind: 'rumour',
    status: 'active',
    acceptedDay: 0,
    expiresDay: 18,
    nextAction: 'Sail east of Bridgetown and identify the Red Jackdaw.',
  }]);
  expect(() => acceptLeadEvent(next, 'red-jackdaw')).toThrow(/already accepted/i);
});
```

Test active, expired, and completed sorting; the slice always returns zero or one active lead and never a clue tree.

- [ ] **Step 2: Run quest tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/quests.test.ts`

Expected: FAIL because quest operations do not exist.

- [ ] **Step 3: Implement the compact lead contract**

Use the `LeadState` contract established in Task 3. Extend `CampaignEvent` with `lead-accepted` carrying a complete `LeadState` and `lead-completed` carrying `{ leadId: LeadId }`; add both reducer branches. Lead acceptance is deterministic, uses the campaign day, and returns an event draft. Expiration changes only at a named sailing/docking checkpoint, not on render.

- [ ] **Step 4: Build Tavern and Log behavior**

The Tavern shows one speaker card, the exact one-sentence rumour from Task 2, and one `Mark on chart` action. After acceptance it says `Marked in the Captain's Log` and cannot create a duplicate. The Log groups Active and Completed, shows the one next action and `18 days remaining` where applicable, and has no pin priority, nested steps, percentages, or map-within-map.

- [ ] **Step 5: Verify comprehension-oriented UI and commit**

Test that after closing the Tavern, `Red Jackdaw`, `east of Bridgetown`, and the next action remain visible in the Log; verify the live region announces acceptance once.

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/quests.test.ts src/games/caribbean/components/port/Tavern.test.tsx src/games/caribbean/components/log/CaptainsLog.test.tsx`

Expected: PASS.

```bash
git add src/games/caribbean
git commit -m "feat(caribbean): add direct rumour and captain log"
```

### Task 9: Implement Deterministic Strategic Sailing

**Files:**
- Create: `src/games/caribbean/domain/clock.ts`
- Create: `src/games/caribbean/domain/clock.test.ts`
- Create: `src/games/caribbean/domain/navigation.ts`
- Create: `src/games/caribbean/domain/navigation.test.ts`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`
- Modify: `src/games/caribbean/state/useCaribbean.ts`

**Interfaces:**
- Consumes: campaign length scale, flagship/fleet state, provisions, Bridgetown/target positions, `departed-port` and `sailing-checkpoint` events.
- Produces: `SailingSession`, `NavigationCommand`, `createSailingSession`, `stepNavigation`, `resolveSailingCheckpoint`, and clock/provision selectors.

- [ ] **Step 1: Write wind, time, provisions, and pause tests**

```ts
it('makes westbound progress easier under an easterly trade wind', () => {
  const west = createSailingSession({ ...BASE, heading: -Math.PI / 2 });
  const east = createSailingSession({ ...BASE, heading: Math.PI / 2 });
  const westAfter = stepNavigation(west, { rudder: 0, courseHold: false }, 10);
  const eastAfter = stepNavigation(east, { rudder: 0, courseHold: false }, 10);
  expect(distanceTravelled(west, westAfter)).toBeGreaterThan(distanceTravelled(east, eastAfter));
});

it('turns starboard toward physical starboard with forward +Z', () => {
  const state = createSailingSession({ ...BASE, heading: 0 });
  expect(stepNavigation(state, { rudder: 1, courseHold: false }, 1).heading).toBeLessThan(0);
});

it('freezes position, calendar, and provisions while paused or backgrounded', () => {
  const paused = { ...SESSION, paused: true };
  expect(stepNavigation(paused, { rudder: 1, courseHold: false }, 30)).toEqual(paused);
  const hidden = { ...SESSION, backgrounded: true };
  expect(stepNavigation(hidden, { rudder: 1, courseHold: false }, 30)).toEqual(hidden);
});
```

Also test tacking makes eastward progress, coast collision slides rather than traps, exact arrival radius, target encounter radius, Adventure/Voyage/Legend calendar scale, zero provisions, and fixed-step equality under `60×1/60`, `30×1/30`, and irregular frame delivery.

- [ ] **Step 2: Run navigation tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/clock.test.ts src/games/caribbean/domain/navigation.test.ts`

Expected: FAIL because sailing domain does not exist.

- [ ] **Step 3: Implement a transient fixed-step session**

```ts
export interface SailingSession {
  voyageId: string;
  tick: number;
  accumulator: number;
  position: Point;
  heading: number;
  rudder: number;
  speed: number;
  windFrom: number;
  windStrength: number;
  elapsedDays: number;
  provisionsUsed: number;
  destination: Point;
  paused: boolean;
  backgrounded: boolean;
  outcome: null | { kind: 'arrived'; portId: PortId } | { kind: 'encounter'; encounterId: string } | { kind: 'out-of-provisions' };
}

export interface NavigationCommand { rudder: -1 | 0 | 1; courseHold: boolean }
export const NAVIGATION_STEP = 1 / 30;
export function stepNavigation(state: SailingSession, command: NavigationCommand, deliveredSeconds: number): SailingSession;
```

Accumulate delivered time and advance only whole fixed steps. Use a polar table with a small but nonzero close-hauled value, starboard-positive rudder subtracting heading, fleet burden from total cargo/slowest retained vessel, and length scale only when converting simulated travel to campaign days. Do not emit a campaign event per step.

- [ ] **Step 4: Resolve only semantic checkpoints**

Extend the union/reducer with `departed-port` carrying `{ portId, voyageId, checkpoint }`, `sailing-checkpoint` carrying `{ voyageId, checkpoint }`, and `docked` carrying `{ portId, elapsedDays }`. On departure, persist the zero-tick `SailingCheckpoint`, then derive the transient session from it. Dispatch one `sailing-checkpoint` when an encounter/arrival/out-of-provisions outcome resolves or the page backgrounds. Its reducer replaces the canonical checkpoint, advances calendar by the delta, and deducts provisions by the delta atomically—flagship first, then remaining ships by stable ship ID. If provisions reach zero, change to a recoverable return-to-port consequence instead of game over.

- [ ] **Step 5: Verify deterministic checkpoints and commit**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain src/games/caribbean/state/useCaribbean.test.tsx`

Expected: PASS, including byte-equal session snapshots for identical commands under different render frame delivery.

```bash
git add src/games/caribbean
git commit -m "feat(caribbean): add deterministic strategic sailing"
```

### Task 10: Build the Graybox Overworld and Encounter Handoff

**Files:**
- Create: `src/games/caribbean/domain/encounters.ts`
- Create: `src/games/caribbean/domain/encounters.test.ts`
- Create: `src/games/caribbean/components/overworld/OverworldPage.tsx`
- Create: `src/games/caribbean/components/overworld/OverworldPage.test.tsx`
- Create: `src/games/caribbean/components/overworld/EncounterCard.tsx`
- Create: `src/games/caribbean/components/overworld/FallbackMap.tsx`
- Create: `src/games/caribbean/three/overworld/OverworldScene.ts`
- Create: `src/games/caribbean/three/shared/loadSloop.ts`
- Create: `src/games/caribbean/assets/ships/sloop.glb`
- Create: `src/games/caribbean/styles/overworld.css`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`

**Interfaces:**
- Consumes: `SailingSession`, optimized POC sloop bytes as a copied production asset, direct rumour target, and campaign dispatcher.
- Produces: disposable `OverworldScene`, `EncounterSummary`, reveal/legal-status rules, the `encounter-started` event/reducer branch, and exact `NavalBattleInput` handoff.

- [ ] **Step 1: Write encounter reveal and legality tests**

```ts
it.each([
  [80, { role: 'unknown sail', exact: null, canAttack: false }],
  [35, { role: 'armed sloop', exact: null, canAttack: false }],
  [14, { role: 'armed sloop', exact: 'Red Jackdaw', canAttack: true }],
] as const)('reveals only information earned at range %s', (range, expected) => {
  expect(describeEncounter(ENCOUNTER, range, CAMPAIGN)).toMatchObject(expected);
});

it('serializes the strategic context required by battle', () => {
  expect(toNavalBattleInput(CAMPAIGN, SESSION, ENCOUNTER)).toEqual({
    battleId: 'battle-red-jackdaw',
    voyageId: SESSION.voyageId,
    seed: CAMPAIGN.rng.naval,
    playerShipId: 'ship-mistral',
    enemy: 'red-jackdaw',
    windFrom: SESSION.windFrom,
    windStrength: SESSION.windStrength,
    coastline: 'bridgetown-east-approach',
    timeOfDay: 'late-afternoon',
    legalStatus: 'hostile',
    returnCheckpoint: SESSION_CHECKPOINT,
  });
});
```

- [ ] **Step 2: Run encounter/UI tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/encounters.test.ts src/games/caribbean/components/overworld/OverworldPage.test.tsx`

Expected: FAIL because encounter and overworld modules do not exist.

- [ ] **Step 3: Build the renderer as a strict adapter**

`OverworldScene` owns renderer/camera/scene/RAF resources and exposes only:

```ts
export interface OverworldRenderSnapshot {
  player: { position: Point; heading: number; speed: number };
  traffic: Array<{ id: string; position: Point; heading: number; revealed: boolean }>;
  windFrom: number;
  windStrength: number;
  daylight: number;
}

export interface OverworldMetrics { fps: number; drawCalls: number; triangles: number; dpr: number }

export class OverworldScene {
  static create(container: HTMLElement, options: { reducedMotion: boolean }): Promise<OverworldScene>;
  sync(snapshot: OverworldRenderSnapshot): void;
  render(dt: number): void;
  metrics(): OverworldMetrics;
  dispose(): void;
}
```

Copy the optimized GLB into the production asset folder; do not import the POC URL. Load and cache source bytes once, return resource-independent clones, adapt DPR between 1.0 and 1.75, and dispose observers, RAF, geometries, materials, textures, and canvas. Use simplified original coastline primitives for the Bridgetown approach; no copied map art and no second authored model.

- [ ] **Step 4: Build sailing HUD, controls, fallback, and encounter card**

HUD shows destination bearing, wind, speed, months remaining, and target lead. A/D and large Port/Starboard rudder controls use the handedness contract; course hold is independently toggled. When WebGL creation rejects, `FallbackMap` preserves all controls and encounter logic with an HTML/SVG chart. The Encounter Card offers `Pursue`, `Avoid`, `Hail`, or `Attack` only when valid and always states `Hostile target — attack permitted` before entering battle.

`Attack` dispatches `encounter-started` with `{ encounterId, leadId, input: NavalBattleInput }`; its reducer switches canonical mode to `naval` and stores that exact input so reload reconstructs the battle from the last semantic sailing checkpoint. Avoid and Hail remain transient encounter choices in this one-target slice and return to sailing without inventing campaign rewards.

- [ ] **Step 5: Verify browser behavior and commit**

Run component/domain tests, then browser-check desktop, tablet landscape, tablet portrait, phone, WebGL failure, reduced motion, background/resume, and keyboard/touch. Confirm no failed requests or console errors and production route lazy-loads Three.js only after sailing begins.

```bash
git add src/games/caribbean
git commit -m "feat(caribbean): add strategic overworld encounter"
```

### Task 11: Migrate and Harden the Naval Domain

**Files:**
- Create: `src/games/caribbean/domain/naval/types.ts`
- Create: `src/games/caribbean/domain/naval/geometry.ts`
- Create: `src/games/caribbean/domain/naval/createBattle.ts`
- Create: `src/games/caribbean/domain/naval/volley.ts`
- Create: `src/games/caribbean/domain/naval/stepBattle.ts`
- Create: `src/games/caribbean/domain/naval/opponent.ts`
- Create: `src/games/caribbean/domain/naval/replay.ts`
- Create: corresponding `*.test.ts` files in the same folder

**Interfaces:**
- Consumes: `NavalBattleInput`, sloop class/instances, and the corrected physical-side convention from Task 1 as a concept, not a POC runtime import.
- Produces: `NavalBattleState`, `NavalCommand`, `NavalEvent`, `createNavalBattle`, `stepNavalBattle`, `resolveVolley`, `opponentCommand`, `replayNavalBattle`.

- [ ] **Step 1: Port the proof tests before production logic**

Recreate—not import—the literal tests for polar sailing, reefed turning, pause, side classification, reload, ammunition damage, surrender, sinking, escape, and deterministic replay. Add production failures for:

```ts
it('keeps port and starboard physically correct at four cardinal headings', () => {
  expectPoint(broadsideVector(0, 'starboard'), { x: -1, z: 0 });
  expectPoint(broadsideVector(Math.PI / 2, 'starboard'), { x: 0, z: 1 });
  expectPoint(broadsideVector(Math.PI, 'starboard'), { x: 1, z: 0 });
  expectPoint(broadsideVector(-Math.PI / 2, 'starboard'), { x: 0, z: -1 });
});

it('resolves one deterministic volley independently of visual balls', () => {
  const result = resolveVolley({
    seed: 1702,
    volleyId: 7,
    side: 'port',
    ammunition: 'chain',
    cannon: 4,
    accuracy: 0.66,
    damagePerHit: { hull: 1, sails: 9, crew: 1, cannon: 0 },
  });
  expect(result).toEqual({
    volleyId: 7,
    side: 'port',
    ammunition: 'chain',
    fired: 4,
    hits: 2,
    misses: 2,
    damage: { hull: 2, sails: 18, crew: 2, cannon: 0 },
    seedAfter: 2876432698,
  });
});
```

Use the unsigned 32-bit LCG `seed = imul(1664525, seed) + 1013904223`; each cannon consumes exactly one sample and hits when `sample < accuracy`. The four samples for seed 1702 produce two hits and the literal seed above. Accuracy and damage-per-hit are computed from ship/ammunition/range inputs before calling this pure sampling core.

- [ ] **Step 2: Run naval tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval`

Expected: FAIL because the production naval domain is absent.

- [ ] **Step 3: Implement fixed-step state and volley results**

```ts
export type Broadside = 'port' | 'starboard';
export type Ammunition = 'round' | 'chain' | 'grape';
export type SailSetting = 'full' | 'reefed';

export interface NavalCommand {
  rudder: -1 | 0 | 1;
  sail: SailSetting;
  ammunition: Ammunition;
  fire: Broadside | null;
}

export type NavalEvent =
  | { id: number; kind: 'volley'; atTick: number; shipId: string; result: VolleyResult }
  | { id: number; kind: 'damage'; atTick: number; shipId: string; damage: Damage }
  | { id: number; kind: 'outcome'; atTick: number; outcome: NavalOutcome };
```

The domain owns horizontal position/yaw, reload, damage, collision, surrender willingness, boarding-ready range, escape, and result. `resolveVolley` decides hit count and aggregate damage once. It emits enough sampled trajectories for visuals—origin, destination, hit/miss—but the renderer may show fewer or more cosmetic cannonballs without changing the result.

- [ ] **Step 4: Implement a legible deterministic opponent**

Use explicit states `close`, `gain-weather-position`, `seek-broadside`, `fire`, `recover`, `disengage`, and `surrender`. The decision table chooses chain while target sails exceed 55% and range is close/medium, grape only under the documented close-range gate, otherwise round. It never reads render frames or wall time. Test each branch with literal state fixtures and assert that a crippled opponent disengages or surrenders rather than fighting to destruction.

- [ ] **Step 5: Prove replay under frame variation and commit**

Feed the same time-stamped command segments through 60 Hz, 30 Hz, and irregular delivered frame chunks. Assert byte-equal canonical battle state and semantic events. Mutation-check swapped sides, omitted reload, inverted ammo branch, and removed surrender gate; name the specific test that fails for each change.

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval`

Expected: PASS.

```bash
git add src/games/caribbean/domain/naval
git commit -m "feat(caribbean): add production naval simulation"
```

### Task 12: Build the Production Naval Scene and Controls

**Files:**
- Create: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Create: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Create: `src/games/caribbean/components/battle/BattleHud.tsx`
- Create: `src/games/caribbean/three/naval/NavalScene.ts`
- Create: `src/games/caribbean/three/naval/effects.ts`
- Create: `src/games/caribbean/audio/BattleAudio.ts`
- Create: `src/games/caribbean/audio/BattleAudio.test.ts`
- Create: `src/games/caribbean/styles/battle.css`
- Create: selected PNGs under `docs/screenshots/caribbean-slice/`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/state/useCaribbean.ts`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`

**Interfaces:**
- Consumes: production naval snapshots/events, sloop loader, campaign assists, and `naval-resolved` event.
- Produces: playable 2–4 minute battle, pooled visual effects, battle metrics, the `naval-resolved` event/reducer branch, result summary, and one resolved campaign transition.

- [ ] **Step 1: Write control and handoff tests**

```ts
it('maps controls to physical nautical sides', async () => {
  const session = navalHarness({ heading: 0 });
  render(<NavalBattlePage session={session} />);
  await user.keyboard('q');
  expect(session.lastCommand()).toMatchObject({ fire: 'port' });
  await user.keyboard('e');
  expect(session.lastCommand()).toMatchObject({ fire: 'starboard' });
  await user.keyboard('a');
  expect(session.lastCommand()).toMatchObject({ rudder: -1 });
  await user.keyboard('d');
  expect(session.lastCommand()).toMatchObject({ rudder: 1 });
});

it('dispatches naval-resolved exactly once', () => {
  const session = navalHarness({ outcome: SURRENDER });
  render(<NavalBattlePage session={session} />);
  expect(session.campaignEvents('naval-resolved')).toHaveLength(1);
  rerender(<NavalBattlePage session={session} />);
  expect(session.campaignEvents('naval-resolved')).toHaveLength(1);
});
```

- [ ] **Step 2: Run presentation tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/components/battle/NavalBattlePage.test.tsx`

Expected: FAIL because the production battle page is absent.

- [ ] **Step 3: Promote the renderer with explicit quality tiers**

`NavalScene` follows the same create/sync/render/metrics/dispose boundary as the overworld. Promote sea, haze, camera, island silhouette, wakes, and streamlines from POC concepts without importing POC code. Pool smoke, flash, ball, splash, wake, and debris resources; after a 20-second warm-up, object/material/geometry counts must plateau. Animate y/pitch/roll, recoil, rudder, sail damage, and wake visually; domain x/z/yaw remains authoritative.

Quality tiers:

| Tier | DPR | Shadows | Effect pool | Target |
| --- | --- | --- | --- | --- |
| low | 1.0 | off | 32 | phone/fallback iPad |
| medium | up to 1.4 | one 512 map | 64 | default tablet |
| high | up to 1.75 | one 1024 map | 96 | desktop |

Drop a tier after five consecutive seconds below 48 FPS; raise only after 20 seconds above 58 FPS and never more than once per battle.

- [ ] **Step 4: Build the minimal battle HUD and sensory assists**

Keep Q/E port/starboard controls spatially separated but do not claim screen-left equals physical-left; labels and muzzle feedback are authoritative. Show hull, sails, crew, reload by side, selected ammo, sail state, wind, and objective. Add aim arc/timing only when aim assist is enabled, course steering assist independently, pause, reduced motion, shake toggle, flash reduction, effects volume/mute, and an HTML fallback message that offers return to the pre-battle autosave if WebGL fails.

`BattleAudio` lazily creates one `AudioContext` after user interaction, pools gain/noise/oscillator nodes, and maps semantic events to six original procedural cues: cannon discharge, hull impact, water splash, rig tear, surrender bell, and a low looping sea bed. It exposes `syncSettings(settings.audio)`, `handle(event)`, and `dispose()`; it never reads or alters battle state. Tests use an injected audio-factory fake to prove muted/zero-volume silence, one cue per new event ID, no replay on rerender, and node teardown.

Extend `CampaignEvent` with `naval-resolved` carrying `{ battleId, outcome, prize }`. Its reducer records the outcome exactly once and changes mode to `capture` with the prize, `input.voyageId`, and `input.returnCheckpoint` on a player victory. A victory without a surviving prize returns to sailing and completes the target lead; escape, separation, or player loss restores `input.returnCheckpoint` as sailing mode.

- [ ] **Step 5: Browser/performance review and commit**

Capture one broadside-handedness screenshot plus desktop, tablet landscape, tablet portrait, and phone battle screens. Confirm Q smoke/projectiles originate on physical port and E on physical starboard. Record draw calls, triangles, FPS, DPR, allocations after warm-up, console errors, failed requests, renderer, and seed. Run at least one real target-iPad session; if the device is unavailable, label the gate incomplete rather than substituting desktop results.

```bash
git add src/games/caribbean docs/screenshots/caribbean-slice
git commit -m "feat(caribbean): add production naval battle scene"
```

### Task 13: Implement Capture, Fleet Management, and Sloop Shipyard

**Files:**
- Create: `src/games/caribbean/domain/fleet.ts`
- Create: `src/games/caribbean/domain/fleet.test.ts`
- Create: `src/games/caribbean/components/fleet/CapturePage.tsx`
- Create: `src/games/caribbean/components/fleet/CapturePage.test.tsx`
- Create: `src/games/caribbean/components/fleet/Shipyard.tsx`
- Create: `src/games/caribbean/components/fleet/Shipyard.test.tsx`
- Create: `src/games/caribbean/components/fleet/FleetManager.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/styles/port.css`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`

**Interfaces:**
- Consumes: `PrizeSnapshot`, ship/cargo/fitting content, fleet state, `capture-resolved` and `shipyard-action` events.
- Produces: `recommendCapture`, `previewCapture`, `applyCapture`, `quoteShipyardAction`, `applyShipyardAction`, and accessible comparison/transfer screens.

- [ ] **Step 1: Write recommendation and guard tests**

```ts
it('recommends critical provisions and a useful prize without silent loss', () => {
  const preview = recommendCapture(CAMPAIGN_WITH_LOW_PROVISIONS, RED_JACKDAW_PRIZE);
  expect(preview.keepShip).toBe(true);
  expect(preview.cargo.provisions).toBe(18);
  expect(preview.warnings).not.toContainEqual(expect.stringMatching(/discard.*provisions/i));
});

it('never abandons a unique item or the last ship without explicit resolution', () => {
  expect(previewCapture(CAMPAIGN, UNIQUE_ITEM_PRIZE, ABANDON_ALL)).toMatchObject({ ok: false, reason: 'unique-item-unresolved' });
  expect(quoteShipyardAction(SINGLE_SHIP_CAMPAIGN, { type: 'sell', shipId: 'ship-mistral' })).toEqual({ ok: false, reason: 'last-ship' });
});
```

Test eight-ship cap, exact hold capacity, insufficient sailing crew, crew/cannon maxima, damaged prize, duplicate names allowed but stable IDs distinct, rename length/blank guard, repair at zero/partial/full damage, sell price, make flagship, cargo/crew/cannon transfers, and fitting duplicate/slot/price guards.

- [ ] **Step 2: Run fleet tests and verify RED**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/domain/fleet.test.ts`

Expected: FAIL because fleet operations do not exist.

- [ ] **Step 3: Implement preview-before-commit fleet operations**

Use the `CaptureDecision` and `ShipyardAction` contracts established in Task 3. Every operation has a pure quote/preview returning exact gold, capacity, minimum crew, strategic speed, and warnings before one event commits it. Keep the fleet maximum at eight even though only two are reachable here.

Extend `CampaignEvent` with `capture-resolved` carrying `CaptureDecision` and `shipyard-action` carrying a validated action plus its exact quoted gold delta. Their reducer branches apply only facts already validated by `previewCapture`/`quoteShipyardAction`, then run full campaign validation before publishing state. Capture resolution marks the Red Jackdaw lead completed, sets `world.targetDefeated`, increments legacy capture count only when the prize is kept, and restores sailing mode from the capture mode's voyage/checkpoint so the player can return to Bridgetown.

- [ ] **Step 4: Build capture and shipyard screens around ship comparison**

Capture uses one screen with four numbered sections: cargo, cannon, crew, keep/abandon. `Take recommended` applies the documented priority: critical provisions, unique item/specialist/map, materially better ship, then value per capacity. Always show flagship and prize side-by-side with crew, cannon, cargo, hull, sails, speed, turn, best wind angle, and fittings.

Shipyard supports repair, rename, make flagship, sell, install all six approved fittings, and exact crew/cannon/cargo redistribution. Every fitting shows plain before/after numbers and exact price; use no rarity colours. Initial fitting effects are:

| Fitting | Effect |
| --- | --- |
| Careened Hull | +6% strategic and tactical maximum speed |
| Fine Canvas | +8% sail drive; sail repair costs +5% |
| Expanded Berths | +12 safe/max crew; −6 hold capacity |
| Reinforced Scantlings | +15 maximum hull; −4% turn response |
| Improved Gun Carriages | −8% reload time; +2 hold capacity used |
| Ammunition Lockers | −12% volley dispersion; +2 hold capacity used |

- [ ] **Step 5: Verify management clarity and commit**

Run domain and UI tests. Manually complete three capture fixtures: keep a superior prize, abandon a burden, and keep both then redistribute. Confirm each result can be explained from the preview and reloads identically.

```bash
git add src/games/caribbean
git commit -m "feat(caribbean): add capture and ship management"
```

### Task 14: Prove the Complete Slice and Make the Stop/Go Decision

**Files:**
- Create: `src/games/caribbean/caribbean.integration.test.tsx`
- Create: `scripts/caribbean-slice-check.mjs`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `docs/games/caribbean-career/vertical-slice-playtest.md`
- Create: `docs/games/caribbean-career/vertical-slice-review.md`
- Create: selected PNGs under `docs/screenshots/caribbean-slice/`
- Modify: `docs/games/caribbean-career/README.md`

**Interfaces:**
- Consumes: every production slice module and gate above.
- Produces: repeatable browser journey, device/performance record, ten-session protocol/results, and an explicit `proceed`, `revise-loop`, or `stop` recommendation.

- [ ] **Step 1: Write the failing integrated journey**

The Testing Library integration test uses deterministic seed `1702` and performs these assertions without mocking domain logic:

```ts
it('completes port → sea → battle → capture → shipyard → resume', async () => {
  const storage = memoryStorage();
  render(<CaribbeanPage storage={storage} />);
  await startAdventure(user, { name: 'Morgan', talent: 'navigation' });
  await acceptRedJackdawRumour(user);
  await buyCargo(user, 'provisions', 5);
  await setSail(user);
  await reachAndAttackTarget(user);
  await winScriptedBattle(user, { tactic: 'disable-and-surrender' });
  await takeRecommendedCapture(user);
  await returnToBridgetown(user);
  await repairPrize(user);

  unmount();
  render(<CaribbeanPage storage={storage} />);
  await user.click(screen.getByRole('button', { name: /Resume/i }));
  expect(screen.getByRole('heading', { name: 'Bridgetown' })).toBeVisible();
  expect(screen.getByText('Red Jackdaw')).toBeVisible();
  expect(screen.getByText(/2 ships/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it and verify RED before adding test seams**

Run: `mise exec node@20 -- npx vitest run src/games/caribbean/caribbean.integration.test.tsx`

Expected: FAIL at the first missing/broken integration boundary. Add only deterministic time/input adapters required to drive existing production logic; do not add test-only victory switches to player builds.

- [ ] **Step 3: Add the real-browser quality script**

Add `npm run caribbean:check` invoking `scripts/caribbean-slice-check.mjs`. It starts/uses the Vite harness, drives the same seeded loop with Playwright, fails on console error, page error, failed request, missing asset, duplicate campaign event, save mismatch, or WebGL resource growth after warm-up, and saves:

- `port-desktop.png` at 1440×900;
- `battle-tablet-landscape.png` at 1180×820;
- `capture-tablet-landscape.png` at 1180×820;
- `shipyard-tablet-portrait.png` at 820×1180;
- `overworld-phone.png` at 390×844;
- `fallback-map-phone.png` with WebGL creation forced to fail; and
- `broadside-handedness.png` with labelled debug vectors and visible muzzle origins.

Write `metrics.json` beside the images with build hash, seed, browser, viewport, DPR, load time, draw calls, triangles, FPS samples, JS heap where available, event count, and final save checksum.

- [ ] **Step 4: Run the complete engineering gate**

Run under the repository's Node 20 toolchain:

```bash
mise exec node@20 -- npm run check
mise exec node@20 -- npm test
mise exec node@20 -- npm run build
BUILD_HARNESS=1 mise exec node@20 -- npm run build
mise exec node@20 -- npm run caribbean:check
git diff --check
```

Then perform target-iPad landscape: cold load, warm load, ten-minute thermal run, rotate/background/resume, airplane-mode reload, reduced motion, VoiceOver focus order, touch steering, physical port/starboard firing, and capture/shipyard. Required technical results: 50 FPS sustained, ≤120 draw calls, ≤100k visible triangles, no unbounded resource growth, no console/asset failures, no silent save loss.

- [ ] **Step 5: Run ten observed sessions and write the decision**

`vertical-slice-playtest.md` contains a script and one row per participant with no personal data: device, experience level, time to sea, completed without help, useful first broadside, capture explanation, port-return time, would-play-next-voyage response, confusion notes, and assists used. Required evidence:

- median time to sea under 90 seconds;
- at least 8/10 complete without instruction;
- at least 7/10 correctly explain why they kept or abandoned the prize;
- at least 8/10 fire a useful broadside after feedback;
- zero crashes or resolved-state save loss; and
- a credible majority says they would play the next voyage.

`vertical-slice-review.md` selects exactly one:

- `proceed`: all hard technical gates and player-understanding thresholds pass;
- `revise-loop`: technical gates pass but one or more comprehension/enjoyment thresholds miss; fix the observed loop before content; or
- `stop`: the core loop remains unconvincing after one focused revision cycle.

Do not authorize a graphics overhaul, second ship, second port, or deferred system in this document. Those require the slice decision and a fresh design review.

- [ ] **Step 6: Commit the verified slice evidence**

```bash
git add package.json vite.config.ts scripts/caribbean-slice-check.mjs src/games/caribbean docs/games/caribbean-career docs/screenshots/caribbean-slice
git commit -m "test(caribbean): verify five-minute vertical slice"
```

## Execution Checkpoints

| Checkpoint | Tasks | Review question | Stop condition |
| --- | --- | --- | --- |
| Rules foundation | 1–4 | Are nautical sides, content IDs, state, and replay unambiguous? | Any renderer-dependent rule or invalid state can enter a save |
| Reliable shell | 5–8 | Can a new player start/resume, use the original-style port menu, trade, and repeat the rumour? | Save recovery is lossy or port visit becomes administrative |
| Sea-to-battle | 9–12 | Does wind explain the route and does the target become a readable 2–4 minute battle? | Handedness is ambiguous, battle outcome depends on rendering, or target iPad misses hard budget |
| Progression payoff | 13 | Can players understand and enjoy taking/managing a ship? | Recommended capture discards something important or shipyard hides trade-offs |
| Product gate | 14 | Does the complete loop merit continued investment? | Play evidence says “more content” would only make an unclear loop larger |

## Explicit Non-Goals for This Plan

- Final art direction, water shader, cinematic cameras, high-detail ports, authored music, recorded Foley, or final audio mix.
- A second ship mesh or stat-only ship variant.
- Morale simulation beyond preserving the canonical field and showing the starting state.
- Divide shares, retirement, aging, chapter transitions, world traffic simulation, commissions, ranks, politics, boarding duel, conquest, relationships, rivals beyond the single target, treasure, or land exploration.
- Network multiplayer, accounts, cloud saves, analytics upload, monetization, or live-service infrastructure.

## Definition of Done

This plan is complete only when Task 14 records a stop/go decision backed by automated tests, browser captures, target-iPad evidence, save recovery checks, and ten observed sessions. “The screens exist” and “the POC looked good” are not completion criteria.
