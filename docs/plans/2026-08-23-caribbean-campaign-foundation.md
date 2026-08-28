# Caribbean Campaign Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Every production change is test-first, every task gets a separate commit, and
> the complete package receives an independent cumulative review before later
> port work begins.

**Goal:** Add the smallest durable campaign core needed to grow the production
naval duel into a five-minute Caribbean career: deterministic start state,
strict boundary validation, a semantic event journal with checkpoint-aware replay,
and non-destructive versioned persistence with previous-snapshot recovery.

**Architecture:** Pure TypeScript owns authored IDs, canonical campaign state,
events, reduction, replay, and validation. A storage adapter owns envelopes,
checksums, rotation, version dispatch, recovery, and conflict detection.
Existing naval domain contracts remain authoritative and untouched. This package deliberately adds
no React, route, port, economy, sailing, audio, or Three.js behavior.

**Tech stack:** TypeScript 5.6, Vitest 2, JSON, `structuredClone`, injected
`StorageLike`, and browser/Node `TextEncoder`. No new dependency is justified.

**Branch:** Continue only on `codex/caribbean-game`, currently based on the
accepted local naval milestone. Keep `main` untouched. Do not merge or push.

**Primary references:**

- [`2026-08-23-caribbean-game-branch-design.md`](../designs/2026-08-23-caribbean-game-branch-design.md)
- [`2026-08-23-caribbean-five-minute-vertical-slice.md`](2026-08-23-caribbean-five-minute-vertical-slice.md)
- [`production-roadmap.md`](../../games/caribbean-career/production-roadmap.md)
- [`game-design.md`](../../games/caribbean-career/game-design.md)

**Execution timing:** First complete the owner-requested Battle Lab full-bleed
layout and render-smoothing revision, because that is direct observed product
signal. Then execute this foundation before Bridgetown UI work.

## Package boundary

This package owns exactly four things:

1. Stable IDs and minimal constants required to construct and validate one
   Bridgetown campaign with one sloop.
2. A deterministic `CampaignStateV1` with optional start choices and safe
   defaults.
3. An ordered semantic `CampaignJournal` with replay verification and safe
   checkpoint-aware replay.
4. A versioned, rotating save envelope with previous-snapshot recovery,
   optimistic conflict detection, and preservation of unreadable bytes.

This package does **not** add arcade registration, campaign setup UI, the port
menu, prices, market stock, rumour prose, sailing, naval handoff, capture,
shipyard actions, morale simulation, relationships, conquest, or a second ship
class. Those features require their own events and tests when they are built.

## Locked product and domain decisions

- The slice is single-player and starts in Bridgetown in 1675.
- Adventure is the default career length; Voyage and Legend are supported
  start choices. All choices are optional because the constructor supplies
  deterministic recommendations.
- Default captain: `Captain`, pronouns `they/them`, Navigation talent.
- Initial flagship: stable ship ID and `flagshipId` `mistral`, display name
  *Mistral*, sloop, 100 hull, 100 sails, 50 crew, 8 cannon, 500 gold, 34
  provisions, and 4 tools/common goods.
- Provisions remain one simple integer resource. The only selector in this
  package is `provisions / (total crew * 0.2)`, so the opening state reports
  exactly 3.4 months. Consumption, warnings, and morale effects are deferred.
- Morale exists because it was part of the 2004 game, but V1 starts at
  `content`; this package does not calculate morale.
- The sloop limits in `content/naval.ts` remain authoritative: hold 100, crew
  12–75, cannon maximum 12, hull/sails maximum 100. Task 1 adds the already-
  approved two fitting slots to that same authoritative contract.
- Existing `domain/naval/*` contracts are never copied or redefined. A later
  handoff package imports `NavalBattleInput`, `NavalOutcome`, and the naval
  validator directly.
- Campaign history records resolved semantic events, never frame positions,
  commands, AI memory, particles, camera state, or the naval presentation event
  window.
- Domain code imports no React, DOM, Three.js, audio, storage, or network API;
  it calls neither `Math.random()` nor `Date.now()`.
- Canonical numbers are finite safe integers unless an exact bounded decimal is
  explicitly named. RNG states and event IDs are unsigned 32-bit integers.
- Validation rejects unknown keys in records that reducers index directly. It
  never normalizes, guesses, or mutates untrusted input.
- Persistence never silently overwrites or deletes unreadable data.
- Aim/steering assistance, reduced motion, flashes, shake, and audio volume are
  presentation preferences, not campaign facts. They remain outside canonical
  replay state, preserving the already-approved naval sensory-settings boundary.
  A later shell may persist them in a separate preference record.
- Hold use is exact and simple: sum cargo units, plus two hold units per cannon,
  plus fitting hold penalties
  (`expanded-berths` 6, `improved-gun-carriages` 2, `ammunition-lockers` 2;
  other fittings 0). Cannon is managed separately in the UI and is also bounded
  by `cannonMaximum`, but still occupies ship capacity as the governing design
  requires. A sloop accepts at most two unique fittings. The opening sloop uses
  `38 cargo + 16 cannon = 54 / 100` hold.

## File and responsibility map

| Area | Files | Responsibility |
| --- | --- | --- |
| Campaign content | `content/campaign.ts`, `content/campaign.test.ts`; extend `content/types.ts`, `content/naval.ts`, and `content/content.test.ts` | Stable IDs and minimal Bridgetown/sloop validation constants |
| State | `domain/types.ts`, `createCampaign.ts`, `createCampaign.test.ts`, `validateCampaign.ts`, `validateCampaign.test.ts`, `selectors.ts`, `selectors.test.ts` | Canonical V1 shape, constructor, strict validation, provisions-month selector |
| Journal | `domain/events.ts`, `reduceCampaign.ts`, `reduceCampaign.test.ts`, `replay.ts`, `replay.test.ts` | Event IDs, immutable reducer, journal validation, checkpoint-aware replay |
| Persistence | `storage/checksum.ts`, `checksum.test.ts`, `schema.ts`, `schema.test.ts`, `migrations.ts`, `persistence.ts`, `persistence.test.ts` | Canonical JSON, UTF-8 checksum, envelope parsing/version dispatch, rotation, recovery, conflict detection |

## Canonical interfaces

The implementation may split these declarations across the mapped files, but
must preserve their meaning and stable IDs.

```ts
export type PortId = 'bridgetown';
export type CargoId =
  | 'provisions'
  | 'tools'
  | 'luxuries'
  | 'sugar-molasses'
  | 'tobacco-dyewood'
  | 'powder-arms';
export type FactionId = 'english' | 'french' | 'spanish' | 'dutch';
export type ShipClassId = 'sloop';
export type FittingId =
  | 'careened-hull'
  | 'fine-canvas'
  | 'expanded-berths'
  | 'reinforced-scantlings'
  | 'improved-gun-carriages'
  | 'ammunition-lockers';
export type LeadId = 'red-jackdaw';

export type CampaignLength = 'adventure' | 'voyage' | 'legend';
export type Talent = 'fencing' | 'gunnery' | 'navigation' | 'charm' | 'medicine';
export type Morale = 'very-happy' | 'happy' | 'content' | 'unhappy' | 'mutinous';
export type PortActivity =
  | 'menu'
  | 'governor'
  | 'tavern'
  | 'market'
  | 'shipyard'
  | 'shares'
  | 'log';

// `NavalBattleInput` and `Point` are imported from the existing authoritative
// `domain/naval/types` module; campaign code does not redeclare them.
export interface SailingCheckpoint {
  tick: number;
  position: Point;
  heading: number;
  elapsedDays: number;
  provisionsUsed: number;
}

export interface PrizeSnapshot {
  battleId: string;
  ship: ShipState;
  willingCrew: number;
}

export type CampaignMode =
  | { kind: 'port'; portId: PortId }
  | { kind: 'sailing'; voyageId: string; checkpoint: SailingCheckpoint }
  | {
      kind: 'encounter';
      encounterId: string;
      voyageId: string;
      returnCheckpoint: SailingCheckpoint;
    }
  | {
      kind: 'naval';
      battleId: string;
      voyageId: string;
      input: NavalBattleInput;
      returnCheckpoint: SailingCheckpoint;
    }
  | {
      kind: 'capture';
      battleId: string;
      prize: PrizeSnapshot;
      voyageId: string;
      returnCheckpoint: SailingCheckpoint;
    }
  | {
      kind: 'boarding';
      battleId: string;
      voyageId: string;
      returnCheckpoint: SailingCheckpoint;
    }
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

export interface LeadState {
  id: LeadId;
  kind: 'rumour';
  status: 'active' | 'completed' | 'expired';
  acceptedDay: number;
  expiresDay: number | null;
}

export interface CampaignStateV1 {
  schemaVersion: 1;
  contentVersion: 'caribbean-slice-1';
  campaignId: string;
  seed: number;
  career: { length: CampaignLength };
  calendar: { startYear: 1675; elapsedDays: number };
  mode: CampaignMode;
  captain: {
    name: string;
    pronouns: string;
    talent: Talent;
  };
  wealth: { gold: number; earned: number };
  crew: { morale: Morale };
  fleet: { flagshipId: string; ships: ShipState[] };
  standings: Record<FactionId, number>;
  world: {
    ports: Record<PortId, {
      prosperity: 'modest';
      defense: 'guarded';
    }>;
    targetDefeated: boolean;
  };
  leads: LeadState[];
  relationships: Record<string, {
    stage: 'acquainted' | 'friendly' | 'close' | 'devoted';
  }>;
  legacy: { capturedShips: number; goldEarned: number };
  rng: { world: number; navigation: number; naval: number };
  lastEventId: number;
}
```

Construction starts with one ship, while validation supports the documented
one-to-eight ship fleet, exactly one existing flagship, unique stable IDs, and
the sloop-only slice. `leads` accepts zero or one uniquely keyed Red Jackdaw
lead so the next port package does not change the save shape. `relationships`
is empty at construction and validation requires it to remain empty in this
package; its value type exists only to reserve a stable boundary. All four
standings begin at zero. Bridgetown's English control belongs to authored world
content, not to the captain's legal status.

V1 may grow through backward-compatible validation widening: a new mode
discriminant, a populated already-declared lead, or additional valid sloop
entries does not invalidate or structurally rewrite an old port save. Removing
or renaming a field/ID, changing meaning or units, narrowing accepted values, or
requiring a new field does require `schemaVersion: 2` and an explicit migration.

The type reserves all known vertical-slice mode carriers, but Package 1's
validator accepts only `port`. No legal reducer can enter another mode yet.
Navigation/handoff packages must add their cross-field validators and widen the
accepted discriminants in the same tested commit that adds the transition.
Reserved shapes below are locked interface guidance, not prematurely valid save
states; this prevents loading a naval/capture state before resume code exists.

For every strategic checkpoint, `tick` and `provisionsUsed` are nonnegative
safe integers, position components are finite decimals in `[-10_000, 10_000]`,
heading is finite in `[-π, π)`, and `elapsedDays` is finite in `[0, 365]`.
Voyage/encounter/battle IDs use the stable-ID grammar. A naval wrapper's
`battleId` equals `input.battleId`; the input player's `stableShipId`, name,
class, hull, sails, crew, and cannon equal the current flagship at handoff. A
capture prize's `battleId` equals the wrapper battle ID and its ship ID is not
already in the fleet. Encounter, naval, boarding, and capture modes retain the
voyage ID and return checkpoint needed for avoid/escape/separation/reload.

```ts
export interface CreateCampaignOptions {
  seed: number;
  name?: string;
  pronouns?: string;
  talent?: Talent;
  length?: CampaignLength;
}

export function createCampaign(options: CreateCampaignOptions): CampaignStateV1;
export function provisionsMonths(state: CampaignStateV1): number;
```

`createCampaign` rejects an invalid seed or option rather than coercing it.
It uses `campaign-${seed}` and derives three independent uint32 RNG
states with this exact bijective uint32 mixer:

```ts
const RNG_SALTS = {
  world: 0x9e37_79b9,
  navigation: 0x243f_6a88,
  naval: 0xb7e1_5162,
} as const;
const mixSeed = (seed: number, salt: number) =>
  (Math.imul(1_664_525, (seed ^ salt) >>> 0) + 1_013_904_223) >>> 0;
```

It deep-creates every array and object; no campaign shares mutable defaults
with another. Invalid trusted constructor options throw one stable
`Invalid campaign options: <path:code, ...>` error after collecting all issues.

Validation uses stable machine-readable issues:

```ts
export interface ValidationIssue {
  path: string;
  code:
    | 'missing'
    | 'unknown-key'
    | 'wrong-type'
    | 'non-json'
    | 'not-finite'
    | 'not-integer'
    | 'out-of-range'
    | 'unknown-id'
    | 'duplicate'
    | 'capacity-exceeded'
    | 'invariant'
    | 'replay-mismatch';
}
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export function validateCampaign(input: unknown): ValidationResult<CampaignStateV1>;
```

Issue order is deterministic: parent shape before child shape, then canonical
field order, then array index. Validate all independent fields in one pass.
Records must be plain objects with no symbol keys; cyclic values, sparse arrays,
`undefined`, `bigint`, functions, `Date`, `Map`, and non-finite numbers are
`non-json`. Trimmed captain/ship names are 1–40 Unicode code points, pronouns
1–24, stable IDs match `[a-z0-9][a-z0-9-]{0,47}`, and
`calendar.elapsedDays` is a nonnegative safe integer counting elapsed days from
the fixed 1675 start. UI derives a display date; state never carries a drifting
redundant year/day pair. Authored lead next-action text is validated in Task 1
content (1–160 Unicode code points); it is resolved by `LeadId` and never stored
inside campaign state.

## Journal and replay contract

Package 1 implements one real event—accepting the Red Jackdaw lead—to prove the
full contract without journaling UI navigation or inventing economy/voyage
behavior. Which port panel is open remains transient controller state.

```ts
export type CampaignEvent = {
  id: number;
  type: 'lead-accepted';
  atDay: number;
  payload: { leadId: 'red-jackdaw' };
};

export type CampaignEventDraft = Omit<CampaignEvent, 'id' | 'atDay'>;

export interface CampaignJournal {
  initial: CampaignStateV1;
  events: CampaignEvent[];
  state: CampaignStateV1;
}

export function reduceCampaign(
  state: CampaignStateV1,
  event: CampaignEvent,
): CampaignStateV1;
export function createJournal(initial: CampaignStateV1): CampaignJournal;
export function appendJournal(
  journal: CampaignJournal,
  draft: CampaignEventDraft,
): CampaignJournal;
export function replayCampaign(
  initial: CampaignStateV1,
  events: readonly CampaignEvent[],
): CampaignStateV1;
export function validateJournal(input: unknown): ValidationResult<CampaignJournal>;
```

Rules:

- `appendJournal` derives `id = state.lastEventId + 1` and
  `atDay = state.calendar.elapsedDays`. Callers cannot supply either.
- Event IDs are positive uint32 values, contiguous from
  `initial.lastEventId + 1`, and strictly ordered.
- `reduceCampaign` first validates the prior state and event, returns a cloned
  state, appends the one deterministic active lead with `acceptedDay = atDay`
  and `expiresDay = atDay + 18`, updates `lastEventId`, then validates the
  result. Re-accepting the same lead is rejected.
- `reduceCampaign`, replay, and append never mutate their inputs.
- `validateJournal` validates `initial`, every event, and `state`; replays the
  events; and requires `canonicalJson(replayed) === canonicalJson(state)`.
- An event's `atDay` must equal the predecessor state's day. Future time events
  advance the calendar in their own reducer branch; later events then use the
  new day.
- Events store resolved facts. There is no misleading generic event seed. A
  future random event records its explicit RNG stream transition or resolved
  result in its own payload.
- `initial` may be a validated checkpoint with nonzero `lastEventId`; append
  continues at that ID + 1. This package does not create checkpoints because a
  valid foundation journal can contain at most one accept-once event. The next
  package adds `compactJournal` plus the documented `>256 events or >512 KiB
  UTF-8` storage trigger in the same commit as repeatable trade events, allowing
  continuity to be exercised with a legal stream rather than fabricated data.

## Persistence contract

```ts
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveEnvelopeV1 {
  version: 1;
  build: string;
  savedAt: number;
  checksum: string;
  payload: CampaignJournal;
}

export interface UnreadableSlot {
  slot: 'current' | 'previous';
  raw: string;
  code: UnreadableCode;
}

export type UnreadableCode =
  | 'malformed-json'
  | 'invalid-envelope'
  | 'unsupported-version'
  | 'checksum-mismatch'
  | 'invalid-journal'
  | 'replay-mismatch';

export interface ActiveSaveRevision {
  currentRaw: string | null;
  previousRaw: string | null;
}

export type StorageOperation =
  | 'read-current'
  | 'read-previous'
  | 'write-previous'
  | 'write-current';

export type LoadResult =
  | { kind: 'empty'; revision: ActiveSaveRevision }
  | {
      kind: 'loaded';
      journal: CampaignJournal;
      savedAt: number;
      build: string;
      recovered: boolean;
      unreadableSlots: UnreadableSlot[];
      revision: ActiveSaveRevision;
    }
  | {
      kind: 'unreadable';
      unreadableSlots: UnreadableSlot[];
      revision: ActiveSaveRevision;
    }
  | { kind: 'storage-unavailable'; operation: StorageOperation };

export type SaveResult =
  | {
      ok: true;
      journal: CampaignJournal;
      checksum: string;
      revision: ActiveSaveRevision;
    }
  | { ok: false; reason: 'invalid-journal'; issues: ValidationIssue[] }
  | {
      ok: false;
      reason: 'unreadable-active-save';
      unreadableSlots: UnreadableSlot[];
      revision: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'save-conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'storage-unavailable';
      operation: StorageOperation;
    };

export function loadCampaign(storage: StorageLike): LoadResult;
export function saveCampaign(
  storage: StorageLike,
  journal: CampaignJournal,
  options: {
    build: string;
    savedAt: number;
    expectedRevision: ActiveSaveRevision;
  },
): SaveResult;
export function parseSaveEnvelope(raw: string):
  | { ok: true; envelope: SaveEnvelopeV1 }
  | { ok: false; code: UnreadableCode };
```

Keys are exact:

```text
caribbean:campaign:current
caribbean:campaign:previous
```

Rules:

- `canonicalJson` recursively sorts plain-object keys, preserves array order,
  and rejects non-JSON values/cycles. `checksumPayload` is 32-bit FNV-1a over
  its UTF-8 bytes, formatted as eight lowercase hex characters.
  This detects accidental corruption; it is not authentication.
- `savedAt` and `build` are injected at the storage boundary. `savedAt` is a
  nonnegative safe integer and `build` is 1–128 printable characters. No
  production function calls the clock or randomness directly.
- Envelope parsing rejects malformed JSON, unknown keys, non-integer or
  negative `savedAt`, an empty/oversized build string, invalid checksum format,
  checksum mismatch, an unsupported version, invalid journal state, replay
  failure, or stored/replayed canonical inequality.
- Active keys are stable and envelope versions carry schema evolution, so a V2
  loader can discover V1 without scanning version-suffixed keys. The migration
  dispatcher is explicit and exhaustive. V1 is currently the only readable
  version; unknown past/future versions are unreadable and never guessed. Add
  the first transform only when a real V2 shape exists—do not invent a fake V0.
- `saveCampaign` validates and replays first, creates and
  verifies the new serialized envelope in memory, then rereads both active raw
  strings. They must exactly match `expectedRevision`; otherwise return
  `save-conflict` without writing. This optimistic revision guard prevents a
  stale tab/controller from knowingly overwriting newer progress.
- After the revision check, verify the existing current envelope, copy only a
  valid current raw string to previous, then publish the new current string.
- Before writing, `saveCampaign` inspects both occupied active slots. If either
  is unreadable it returns `unreadable-active-save` with those exact raw slots;
  it does not overwrite them. The future shell must offer export/quarantine and
  let the in-memory campaign continue with a persistent save warning.
- If copying previous fails, current remains untouched. If publishing current
  fails after previous was copied, current remains the older valid snapshot and
  previous contains the same valid older snapshot. A later load is recoverable.
- `loadCampaign` tries current, then previous. A corrupt current plus valid
  previous returns the previous journal with `recovered: true`, includes the
  corrupt current in `unreadableSlots`, and does not rewrite either slot. A
  valid current plus corrupt previous still loads current but also reports the
  degraded backup in `unreadableSlots`. Both invalid returns all untouched raw
  strings and exact slot reasons.
- This foundation has no destructive storage function. The next visible shell
  package implements export, quarantine, explicit **Abandon campaign**, and
  reset together with their actual confirmation/recovery UI. Those operations
  must consume `revision`, compare exact raw bytes immediately before mutation,
  quarantine unreadable bytes before deletion, and report partial cleanup.
  Deferring the destructive half avoids shipping a callerless unsafe API while
  preserving every byte and reason needed to implement it correctly.
- The future controller serializes same-page saves and permits only one active
  writer per campaign. Cross-tab writes use the optimistic exact-raw revision
  check, which detects already-observed staleness but is not an atomic compare-
  and-swap: another tab can write after comparison. The visible shell must use
  a supported browser lock or a single-writer ownership lease before enabling
  autosave; it must never claim this foundation alone prevents every race.
- Storage errors never throw into a future React controller. The in-memory
  campaign can continue and surface a durable warning later.

## Task 1: Add minimal campaign content contracts

**Files:**

- Modify: `src/games/caribbean/content/types.ts`
- Modify: `src/games/caribbean/content/naval.ts`
- Modify: `src/games/caribbean/content/content.test.ts`
- Create: `src/games/caribbean/content/campaign.ts`
- Create: `src/games/caribbean/content/campaign.test.ts`

**Produces:** stable content ID unions, ordered ID arrays, `BRIDGETOWN`, cargo
keys, six fitting keys/hold penalties, the Red Jackdaw lead's 18-day expiry and
next action, and the existing `SLOOP_CLASS` extended with two fitting slots.

- [ ] **Step 1: Write the failing content tests**

  Assert the exact one-port, six-cargo, one-class, four-faction, six-fitting,
  and one-lead ID order; uniqueness; frozen authored definitions; Bridgetown's
  English control; exact fitting hold penalties; exact lead expiry/next action;
  and exact equality between campaign sloop validation limits and
  `SLOOP_CLASS`.

- [ ] **Step 2: Capture RED**

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/content/campaign.test.ts
  ```

  Expected: missing-module failure. Record the command and failure in the task
  report before production edits.

- [ ] **Step 3: Implement only used content**

  Add stable unions/guards and ordered readonly ID arrays. Do not add market
  price, stock, fitting effects, target coordinates, or rumour copy.

- [ ] **Step 4: Prove existing naval contracts did not drift**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/content/campaign.test.ts \
    src/games/caribbean/content/content.test.ts \
    src/games/caribbean/domain/naval/createBattle.test.ts
  ```

- [ ] **Step 5: Self-review and commit**

  Inspect `git diff --check` and the exact Task 1 diff. Commit only these files:

  ```bash
  git commit -m "feat(caribbean): define campaign content contracts"
  ```

## Task 2: Construct and validate canonical campaign state

**Files:**

- Create: `src/games/caribbean/domain/types.ts`
- Create: `src/games/caribbean/domain/createCampaign.ts`
- Create: `src/games/caribbean/domain/createCampaign.test.ts`
- Create: `src/games/caribbean/domain/validateCampaign.ts`
- Create: `src/games/caribbean/domain/validateCampaign.test.ts`
- Create: `src/games/caribbean/domain/selectors.ts`
- Create: `src/games/caribbean/domain/selectors.test.ts`

**Consumes:** Task 1 stable IDs and the existing `SLOOP_CLASS`.

**Produces:** `CampaignStateV1`, `CreateCampaignOptions`, `createCampaign`,
`validateCampaign`, and `provisionsMonths`.

- [ ] **Step 1: Write constructor and selector tests**

  Cover same-seed byte equality, all three lengths, all five talents,
  recommended defaults, exact `mistral` ship/flagship IDs, exact opening state,
  3.4 months, a zero-crew defensive selector result of `null`, and no shared
  mutable defaults.

- [ ] **Step 2: Capture constructor RED**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/domain/createCampaign.test.ts \
    src/games/caribbean/domain/selectors.test.ts
  ```

  Expected: missing production modules.

- [ ] **Step 3: Add aggregate boundary tests before implementation**

  One deeply malformed object must return multiple ordered issues. Add focused
  cases for non-JSON/plain-record values, cycles, non-finite/fractional integers,
  unknown/extra keys, invalid union members, unsigned seed/RNG/event boundaries,
  invalid name and pronoun lengths, calendar bounds, every reserved non-port
  mode rejected until its transition package, missing/duplicate flagship,
  fleet sizes 0/9,
  ship ID uniqueness, class/fitting/cargo IDs, duplicate/three fittings, ship
  maxima, a named `34 + 4 + (8 × 2) = 54 / 100` opening capacity assertion,
  exact/overflow hold use including fitting penalties, negative wealth/legacy,
  standings outside `-100..100`, duplicate/unknown leads, and nonempty V1
  relationships.

- [ ] **Step 4: Capture validator RED, then implement minimum GREEN**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/domain/createCampaign.test.ts \
    src/games/caribbean/domain/validateCampaign.test.ts \
    src/games/caribbean/domain/selectors.test.ts
  ```

  Build explicit type/record guards; do not cast unknown input into the state
  shape. Validate constructor output before returning it. Change the selector
  signature to `number | null`: `provisionsMonths` returns `null` for zero total
  crew and never rounds presentation values.

- [ ] **Step 5: One targeted mutation probe**

  Temporarily skip the combined cargo/fitting hold-capacity check, verify the
  exact-capacity test fails, then restore it. Durable table cases cover unknown
  IDs, fractional values, default isolation, and RNG stream separation without
  repeated source mutations.

- [ ] **Step 6: Verify and commit**

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/content src/games/caribbean/domain
  npm run typecheck
  git diff --check
  git commit -m "feat(caribbean): add canonical campaign state"
  ```

## Task 3: Add immutable semantic journal and replay

**Files:**

- Create: `src/games/caribbean/domain/events.ts`
- Create: `src/games/caribbean/domain/reduceCampaign.ts`
- Create: `src/games/caribbean/domain/reduceCampaign.test.ts`
- Create: `src/games/caribbean/domain/replay.ts`
- Create: `src/games/caribbean/domain/replay.test.ts`

**Consumes:** Task 2 valid state.

**Produces:** `CampaignEvent`, `CampaignEventDraft`, `CampaignJournal`, reducer,
append/replay/validation functions.

- [ ] **Step 1: Write event/reducer RED tests**

  Cover derived ID/day, exact Red Jackdaw lead state, prior-state immutability,
  duplicate acceptance, unknown lead, skipped/repeated/out-of-order IDs, at-day
  mismatch, uint32 exhaustion, malformed prior state, and exhaustive event
  handling.

- [ ] **Step 2: Capture RED**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/domain/reduceCampaign.test.ts
  ```

- [ ] **Step 3: Implement reducer and append path**

  `appendJournal` validates the journal first, derives the envelope fields,
  reduces once, and returns a fresh event array/state. `reduceCampaign` rejects
  an event when the predecessor state or event is invalid; it never partially
  returns a transition.

- [ ] **Step 4: Write replay/journal/checkpoint RED tests**

  Cover canonical-byte-equal replay, structured-cloned input equivalence,
  validated initial checkpoint with nonzero `lastEventId`, state mismatch,
  invalid initial/state, malformed event payload, noncontiguous IDs, at-day
  mismatch, no mutation, and next event continuing at the checkpoint ID + 1.

- [ ] **Step 5: Implement replay and validate every boundary**

  Return typed validation results for untrusted journals. Internal reducer
  errors may throw stable domain errors, but storage catches and reports them.

- [ ] **Step 6: Two targeted mutation probes**

  Kill and restore only assigning the current ID instead of `lastEventId + 1`
  and skipping final canonical replay equality. Durable tests cover day order,
  checkpoint continuity, replay base, and immutability.

- [ ] **Step 7: Verify and commit**

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain
  npm run typecheck
  git diff --check
  git commit -m "feat(caribbean): add deterministic campaign journal"
  ```

## Task 4: Add versioned resilient persistence

**Files:**

- Create: `src/games/caribbean/storage/checksum.ts`
- Create: `src/games/caribbean/storage/checksum.test.ts`
- Create: `src/games/caribbean/storage/schema.ts`
- Create: `src/games/caribbean/storage/schema.test.ts`
- Create: `src/games/caribbean/storage/migrations.ts`
- Create: `src/games/caribbean/storage/persistence.ts`
- Create: `src/games/caribbean/storage/persistence.test.ts`

**Consumes:** Task 3 valid journals.

**Produces:** canonical serializer/checksum/parser/version contracts plus
conflict-aware `saveCampaign` and non-mutating `loadCampaign`.

- [ ] **Step 1: Write checksum and schema RED tests**

  Lock ASCII and Unicode UTF-8 FNV-1a vectors, exact eight-character lowercase
  output, payload-byte sensitivity, envelope key strictness, version/build/time/
  checksum validation, checksum mismatch, migration identity, and unsupported
  past/future versions.

- [ ] **Step 2: Capture RED, then implement checksum/schema GREEN**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/storage/checksum.test.ts \
    src/games/caribbean/storage/schema.test.ts
  ```

  Parser order is JSON → envelope shape/version → checksum → migration →
  journal validation/replay. Never deserialize a future version into V1 by cast.

- [ ] **Step 3: Write rotating-save and recovery RED tests**

  Use a configurable in-memory `StorageLike` that can throw on exact operations.
  Cover empty load, first save, second-save rotation, valid current preference,
  corrupt-current/valid-previous recovery with exposed bad raw, valid-current/
  corrupt-previous degraded-backup warning, both corrupt, malformed JSON, bad
  checksum, replay divergence, unsupported version, read failure, refusal to
  autosave over either invalid occupied slot, previous-copy failure, current-
  publish failure, unchanged input journals, same-page sequential revisions,
  and stale current/previous revisions returning `save-conflict` without a
  write. Do not fabricate duplicate lead events to fake a 257-event save.

- [ ] **Step 4: Implement save/load with failure-stage guarantees**

  Reparse the proposed raw envelope before writing. Rotate only a fully verified
  old current. Preserve current when previous cannot be written. Return typed
  failures; never catch and pretend a write succeeded.

- [ ] **Step 5: Prove non-destructive failure behavior**

  Assert every load leaves both raw strings byte-identical, including recovery
  and unreadable results. Assert every failed save preserves current and does
  not replace an unreadable previous. Return exact closed result codes rather
  than a generic caught error. Destructive export/quarantine/discard/reset tests
  belong to the next shell package where their confirmation UI is implemented.

- [ ] **Step 6: Targeted mutation probes**

  Kill and restore only the three highest-risk mutations: skipped checksum
  comparison, skipped replay equivalence, and skipped exact revision conflict.
  The durable table tests cover all other malformed boundaries without manual
  source churn.

- [ ] **Step 7: Verify and commit**

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/content \
    src/games/caribbean/domain \
    src/games/caribbean/storage
  npm run typecheck
  git diff --check
  git commit -m "feat(caribbean): add resilient campaign persistence"
  ```

## Package verification and independent review

- [ ] Run the focused package suite on Node 20.

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/content \
    src/games/caribbean/domain \
    src/games/caribbean/storage
  ```

- [ ] Run the full repository gate from a clean tracked worktree.

  ```bash
  npm run check
  npx vitest run
  npm run build
  git diff --check
  git status --short
  ```

- [ ] Confirm the normal build still excludes
  `preview-caribbean-game.html` and the Caribbean GLB.
- [ ] Confirm no production campaign/domain file contains `Math.random`,
  `Date.now`, React, DOM, Three.js, storage, audio, or network imports.
- [ ] Confirm no runtime import points at `src/games/caribbean-poc/`.
- [ ] Write a package report under
  `.superpowers/sdd/2026-08-23-caribbean-campaign-foundation/` with RED/GREEN,
  mutation, command, output, diff, and commit evidence.
- [ ] Assign a fresh independent reviewer the cumulative package diff. The
  reviewer must inspect validation totality, replay equivalence, mutation
  resistance, storage failure ordering, unreadable-byte preservation, and
  dependency boundaries. Any BLOCKER, MAJOR, or MINOR finding returns to the
  implementer with a new RED test and a separate fix commit.
- [ ] Mark this package complete only after the independent reviewer reports no
  findings and the worktree is clean. Do not merge or push.

## Package exit criteria

The campaign foundation is complete only when all statements are true:

1. Every supported start choice and default creates a deterministic, valid,
   byte-stable state with no shared mutable objects.
2. Every malformed boundary fixture returns stable issues without throwing or
   changing input.
3. Semantic event IDs and days are derived, contiguous, replayable, and remain
   monotonic from a nonzero validated checkpoint.
4. A journal cannot be accepted or saved unless replay reproduces its stored
   state byte-for-byte.
5. Valid current/previous rotation survives every simulated storage failure
   without losing the last known-good snapshot.
6. Unreadable bytes remain present and exposed with exact reasons; no foundation
   API can delete or overwrite them. The next visible shell owns export,
   quarantine, explicit discard, and reset with confirmation UI.
7. No UI, route, economy, sailing, naval, or rendering behavior changed.
8. Focused tests, full tests, typecheck/lint/knip, normal build, diff check, and
   independent review are green.

## Next package after approval

Build the modern Bridgetown shell around this foundation: optional start setup,
resume/recovery UI, seven stable port activities, one simple six-good market
with provisions shown as months remaining, one direct Tavern rumour, and a
Captain's Log next-action view. It consumes the foundation's `lead-accepted`
event, adds real trade/navigation events beside it, implements the deferred
destructive recovery flow with its actual confirmation UI, and integrates Save
Station registration without expanding persistence contracts ad hoc.
