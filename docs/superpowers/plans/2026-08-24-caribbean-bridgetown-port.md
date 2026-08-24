# Caribbean Bridgetown Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Every production change is test-first,
> every task receives an independent review and a separate commit, and the
> complete package receives a fresh cumulative review.

**Goal:** Ship a production-routed, saveable Bridgetown visit where a player can
optionally configure a 1675 career, resume or safely recover it, understand the
seven original-style port choices, make one simple six-good trade, mark one
direct rumour, and see its single next action in the Captain's Log.

**Architecture:** Extend the approved canonical campaign journal with one
repeatable resolved event, `market-traded`, and compact that legal event stream
at the persistence boundary. A Web Locks-backed writer serializes all save and
recovery mutations across same-origin tabs; React owns only transient port-panel
selection and coordinates pure domain transitions. The production route is an
HTML/CSS desktop shell and must not import the Battle Lab, Three.js, naval
presentation, or the sloop GLB.

**Tech Stack:** TypeScript 5.6, React 18, Vitest 2, Testing Library, React Router
6, Web Locks, localStorage through the existing `StorageLike`, Vite 5,
Playwright, CSS, and the existing canonical JSON/FNV-1a persistence code. No new
runtime dependency is justified.

**Spec:**
[`docs/superpowers/specs/2026-08-23-caribbean-game-branch-design.md`](../specs/2026-08-23-caribbean-game-branch-design.md),
with product rules from
[`docs/games/caribbean-career/game-design.md`](../../games/caribbean-career/game-design.md),
execution gates from
[`docs/games/caribbean-career/production-roadmap.md`](../../games/caribbean-career/production-roadmap.md),
and the approved foundation contract in
[`docs/superpowers/plans/2026-08-23-caribbean-campaign-foundation.md`](2026-08-23-caribbean-campaign-foundation.md).

## Global Constraints

- Work only in `/Users/marioflores/code/arcade/.worktrees/caribbean-game` on
  `codex/caribbean-game`, whose approved campaign foundation is commit
  `3ddf1ab35a7948ed7c5267923392098b6ee2b02e`. Do not merge, push, rebase, or
  touch `main`.
- Preserve the current save keys exactly:
  `caribbean:campaign:current` and `caribbean:campaign:previous`.
- Preserve existing `saveCampaign(storage, journal, { build, savedAt,
  expectedRevision })`, `loadCampaign`, `ActiveSaveRevision`, `LoadResult`, and
  `SaveResult`; extend them only where this plan explicitly says so.
- `CampaignStateV1` remains schema version 1. The market has fixed authored
  prices and unlimited port supply, so this package adds no `marketStock` field
  and requires no migration or content-version change.
- State uses `state.wealth.gold`, ship ID `mistral`, and the existing
  `provisionsMonths(state): number | null`. Do not reintroduce stale names such
  as `captain.gold`, `ship-mistral`, or `monthsRemaining`.
- The existing `lead-accepted` draft is exactly
  `{ type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } }`; the reducer
  derives accepted day and expiry, and UI resolves rumour/next-action prose from
  content. Do not store prose in campaign state.
- `PortActivity` is transient presentation state. Selecting Governor's House,
  Tavern, Market, Shipyard, Divide Shares, or Captain's Log never creates a
  campaign event and never autosaves.
- Set Sail is the seventh ordered port action, but is not a `PortActivity` and
  is visibly unavailable in this package. Do not add sailing, navigation,
  encounters, naval handoff, capture, docking, or time/provision consumption.
- The exact ordered port labels are: Governor's House, Tavern, Market,
  Shipyard, Divide Shares, Captain's Log, Set Sail.
- The exact goods/order and Bridgetown price/baseline pairs are: provisions
  `4/5`, tools `18/15`, luxuries `32/36`, sugar-molasses `10/10`,
  tobacco-dyewood `13/12`, powder-arms `26/22`.
- The exact rumour sentence is: “The Red Jackdaw was sighted east of
  Bridgetown, running west with the trade wind.” The exact next action remains:
  “Sail east of Bridgetown and identify the Red Jackdaw.”
- Provisions remain one integer cargo resource and are presented primarily as
  months remaining, rounded to one decimal only in React. Do not add food types,
  consumption, morale effects, stock simulation, warehouses, loans, or trade
  route simulation.
- Production supports landscape CSS playfields at least `960 × 600` **and**
  requires `innerWidth >= innerHeight`. At `959 × 600`, `960 × 599`,
  `1024 × 1366`, phones, and every portrait viewport, render a focused blocking
  notice and do not mount the campaign controller beneath it. Exact `960 × 600`
  landscape remains supported.
- Product text is at least 14 CSS px, active targets are at least `44 × 44` CSS
  px, all interactive controls have `data-testid`, focus is visible, unavailable
  choices have adjacent plain-language reasons, and dialogs use
  `useDismissOnEscape`.
- The visual direction is modern, clean, full-page, and spacious: Deep Sound,
  Trade Wind, Sunlit Sail, Signal Vermilion, and restrained brass. Do not create
  a parchment imitation or a large permanent sidebar.
- The production `/caribbean` import graph must not include `CaribbeanLab`,
  `battle.css`, `components/battle`, `state/naval`, `three`, Three.js, or
  `assets/caribbean-sloop.glb`. The existing `preview-caribbean-game.html`
  remains harness-only under `BUILD_HARNESS=1`.
- Domain code imports no React, DOM, storage, network, audio, Three.js, or
  browser clocks/randomness. Every resolved trade emits one semantic event.
- `canonicalJson` has exactly one authoritative implementation at
  `src/games/caribbean/canonicalJson.ts`; replay and checksum continue sharing
  that function.
- Web Locks is the supported origin-wide writer primitive (Safari 15.4+ and
  baseline browsers). If locks are absent or denied, no start/resume/event is
  published to memory until the player explicitly chooses Continue without
  saving. That consent lasts only for the mounted session and keeps a persistent
  warning. No autosave/recovery mutation runs through an unsafe pseudo-lock.
- Never silently overwrite or delete unreadable bytes. Recovery and abandonment
  compare exact active raw revisions, write and verify quarantine bytes first,
  then report any partial cleanup precisely.

---

## Package Boundary and Player Proof

The package proves this bounded journey:

1. Open `/caribbean` on a supported desktop and see setup, resume, or recovery
   based on the existing save slots; mount nothing playable unless the viewport
   is landscape with width at least 960 and height at least 600.
2. Start with recommended optional values or choose captain name, pronouns,
   talent, and Adventure/Voyage/Legend; arrive in Bridgetown in 1675.
3. Read all seven port choices in the locked order without a help screen.
4. Open Market, buy or sell one quantity, see gold/hold/months update together,
   and reload to the same resolved state.
5. Open Tavern, mark the single Red Jackdaw rumour, then open Captain's Log and
   read its one next action.
6. Navigate among port panels without increasing `lastEventId`; only trade and
   lead acceptance create events and autosaves.
7. Corrupt a current save, recover the valid previous snapshot through a
   confirmed quarantine flow, and resume without losing or overwriting the raw
   corrupt bytes.

This package explicitly does not make Set Sail functional, advance the calendar,
consume provisions, complete/expire the lead, repair/refit a ship, divide shares,
load a 3D harbour, or enter the already-built naval duel.

## Current Foundation Interfaces That Remain Authoritative

```ts
export function provisionsMonths(state: CampaignStateV1): number | null;

export function createJournal(initial: CampaignStateV1): CampaignJournal;
export function appendJournal(
  journal: CampaignJournal,
  draft: CampaignEventDraft,
): CampaignJournal;
export function validateJournal(input: unknown): ValidationResult<CampaignJournal>;

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
```

`saveCampaign` already validates replay, checks exact raw revisions, refuses
unreadable occupied slots, rotates a verified current save, and returns the
canonical saved journal/revision. Tasks below consume those guarantees instead
of duplicating them.

## File and Responsibility Map

| Area | Files | One responsibility |
| --- | --- | --- |
| Market content | create `content/market.ts`, `market.test.ts`; modify `content/types.ts`, `campaign.ts`, `campaign.test.ts` | Frozen labels, fixed prices/baselines, direct rumour prose |
| Economy/event | create `domain/economy.ts`, `economy.test.ts`; modify `domain/events.ts`, `reduceCampaign.ts` and tests | Quote/apply one atomic unlimited-supply port trade |
| Checkpoints | create `domain/compactJournal.ts`, `compactJournal.test.ts`, `storage/compactionPolicy.ts`, `compactionPolicy.test.ts`; modify persistence tests | Pure checkpoint creation; storage-owned UTF-8 threshold policy |
| Safe mutation | create `storage/writer.ts`, `writer.test.ts`, `storage/recovery.ts`, `recovery.test.ts` | Origin-wide exclusive writes, export, quarantine, recover, abandon |
| Controller/setup | create `index.ts`, runtime/controller/selectors and tests, setup/recovery components, production/theme CSS; modify registry/Menu/App tests and split harness CSS | Route/Save Station, supported-screen gate, coherent persisted/memory/conflict/recovery phases |
| Port | create port components/tests and `styles/port.css` | Modern seven-choice Bridgetown shell and transient activity routing |
| Market UI | create `components/port/Market.tsx`, `Market.test.tsx` | Compact six-row quote-first trading |
| Lead UI | create `domain/leadSelectors.ts`, tests, `components/port/Tavern.tsx`, `components/log/CaptainsLog.tsx`, tests | One direct rumour and one next action |
| Integrated proof | create `caribbean.integration.test.tsx`, `scripts/caribbean-port-check.mjs`, screenshots; modify `package.json` and career README | Browser recovery journey, evidence, bundle isolation |

## Dependency Order

```text
Task 1 economy/event/checkpoint
  -> Task 2 writer/recovery
       -> Task 3 registration/controller/setup/resume
            -> Task 4 seven-item Bridgetown shell
                 -> Task 5 market UI
                 -> Task 6 Tavern and Captain's Log
                      -> Task 7 integrated browser/package gate
```

Do not parallelize dependent tasks against stale event, persistence, or
controller interfaces. A reviewer may reject any task independently.

### Task 1: Add Fixed-Price Economy, `market-traded`, and Legal Journal Compaction

**Files:**

- Modify: `src/games/caribbean/content/types.ts`
- Modify: `src/games/caribbean/content/campaign.ts`
- Modify: `src/games/caribbean/content/campaign.test.ts`
- Create: `src/games/caribbean/content/market.ts`
- Create: `src/games/caribbean/content/market.test.ts`
- Create: `src/games/caribbean/domain/economy.ts`
- Create: `src/games/caribbean/domain/economy.test.ts`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.test.ts`
- Modify: `src/games/caribbean/domain/replay.test.ts`
- Create: `src/games/caribbean/domain/compactJournal.ts`
- Create: `src/games/caribbean/domain/compactJournal.test.ts`
- Create: `src/games/caribbean/storage/compactionPolicy.ts`
- Create: `src/games/caribbean/storage/compactionPolicy.test.ts`
- Modify: `src/games/caribbean/storage/persistence.ts`
- Modify: `src/games/caribbean/storage/persistence.test.ts`

**Interfaces:**

- Consumes: `CampaignStateV1`, `CampaignJournal`, `appendJournal`,
  `validateJournal`, `canonicalJson`, `SLOOP_CLASS`, `FITTINGS`, and the current
  exact hold formula enforced by `validateCampaign`.
- Produces:

```ts
export interface CargoDefinition {
  id: CargoId;
  name: string;
  baselinePrice: number;
}

export interface PortMarketDefinition {
  portId: PortId;
  unitPrices: Readonly<Record<CargoId, number>>;
}

export const GOODS: Readonly<Record<CargoId, Readonly<CargoDefinition>>>;
export const BRIDGETOWN_MARKET: Readonly<PortMarketDefinition>;

export type TradeRequest = {
  portId: PortId;
  shipId: string;
  cargoId: CargoId;
  delta: number; // positive buys, negative sells
};

export type TradeFailureReason =
  | 'not-in-port' | 'wrong-port' | 'unknown-ship' | 'invalid-quantity'
  | 'insufficient-gold' | 'insufficient-cargo' | 'insufficient-space'
  | 'gold-overflow';

export type TradeQuote =
  | {
      ok: true;
      request: TradeRequest;
      unitPrice: number;
      goldDelta: number;
      goldAfter: number;
      quantityAfter: number;
      holdUsedAfter: number;
      holdCapacity: number;
    }
  | { ok: false; reason: TradeFailureReason };

export function shipHoldUsed(ship: ShipState): number;
export function quoteTrade(state: CampaignStateV1, request: TradeRequest): TradeQuote;
export function marketTradeDraft(
  quote: Extract<TradeQuote, { ok: true }>,
): CampaignEventDraftFor<'market-traded'>;
export function priceCue(
  price: number,
  baseline: number,
): 'cheap' | 'fair' | 'expensive';

export function compactJournal(journal: CampaignJournal): CampaignJournal;

// storage/compactionPolicy.ts — TextEncoder is allowed here, never in domain.
export const JOURNAL_EVENT_LIMIT = 256;
export const JOURNAL_UTF8_LIMIT = 512 * 1024;
export function journalUtf8Bytes(journal: CampaignJournal): number;
export function crossesCompactionThreshold(eventCount: number, utf8Bytes: number): boolean;
export function shouldCompactJournal(journal: CampaignJournal): boolean;
```

Extend the event union distributively so later callers retain exact draft
payloads:

```ts
export type CampaignEvent =
  | {
      id: number;
      type: 'lead-accepted';
      atDay: number;
      payload: { leadId: 'red-jackdaw' };
    }
  | {
      id: number;
      type: 'market-traded';
      atDay: number;
      payload: {
        portId: 'bridgetown';
        shipId: string;
        cargoId: CargoId;
        delta: number;
        unitPrice: number;
      };
    };

type DraftOf<Event> = Event extends CampaignEvent
  ? Omit<Event, 'id' | 'atDay'>
  : never;
export type CampaignEventDraft = DraftOf<CampaignEvent>;
export type CampaignEventDraftFor<Type extends CampaignEvent['type']> =
  Extract<CampaignEventDraft, { type: Type }>;
```

- [ ] **Step 1: Write frozen content and literal price tests**

  Add tests that assert exact ID order, display names, price/baseline pairs,
  deep immutability, unlimited-supply absence, and exact lead sentence:

  ```ts
  expect(CARGO_IDS.map((id) => [
    id,
    GOODS[id].name,
    BRIDGETOWN_MARKET.unitPrices[id],
    GOODS[id].baselinePrice,
  ])).toEqual([
    ['provisions', 'Provisions', 4, 5],
    ['tools', 'Tools & common goods', 18, 15],
    ['luxuries', 'Luxuries', 32, 36],
    ['sugar-molasses', 'Sugar & molasses', 10, 10],
    ['tobacco-dyewood', 'Tobacco & dyewood', 13, 12],
    ['powder-arms', 'Powder & arms', 26, 22],
  ]);
  expect('stock' in BRIDGETOWN_MARKET).toBe(false);
  expect(LEADS['red-jackdaw'].sentence).toBe(
    'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.',
  );
  ```

- [ ] **Step 2: Capture content RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/content/market.test.ts src/games/caribbean/content/campaign.test.ts
  ```

  Expected: FAIL because `market.ts`, `GOODS`, and the lead sentence do not
  exist. Record the exact failing output before production edits.

- [ ] **Step 3: Implement only immutable authored market content**

  Add `sentence` to `LeadDefinition`; build `GOODS`, each nested definition,
  `BRIDGETOWN_MARKET.unitPrices`, and its price record with `Object.freeze`.
  Do not add stock, quantities, dynamic prices, labour simulation, coordinates,
  or copied prose to state.

- [ ] **Step 4: Write quote-first economy RED tests**

  Cover literal opening hold `54 / 100`, buy provisions `+5`, sell tools `-4`,
  all failure reasons, safe-integer overflow, exact-capacity success,
  over-capacity-by-one, fitting penalties, cannon capacity, non-port rejection,
  and the exact price thresholds:

  ```ts
  const state = createCampaign({ seed: 1702 });
  expect(shipHoldUsed(state.fleet.ships[0])).toBe(54);
  expect(quoteTrade(state, {
    portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
  })).toMatchObject({
    ok: true,
    unitPrice: 4,
    goldDelta: -20,
    goldAfter: 480,
    quantityAfter: 39,
    holdUsedAfter: 59,
    holdCapacity: 100,
  });
  expect(priceCue(4, 5)).toBe('cheap');
  expect(priceCue(18, 15)).toBe('expensive');
  expect(priceCue(10, 10)).toBe('fair');
  ```

  Buying and selling at the same fixed unit price is allowed. A transaction
  changes only `wealth.gold` and the selected ship's cargo; `wealth.earned` and
  `legacy.goldEarned` remain unchanged until voyage-profit rules are defined.

- [ ] **Step 5: Capture economy RED, then implement minimum GREEN**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/economy.test.ts
  ```

  Expected: FAIL because `economy.ts` does not exist.

  Implement explicit safe-integer guards. `shipHoldUsed` must calculate
  `sum(cargo) + cannon * 2 + sum(FITTINGS[id].holdPenalty)` and the capacity is
  `SLOOP_CLASS.hold`; do not copy numeric limits. `priceCue` uses `price /
  baseline <= 0.85` for cheap and `>= 1.15` for expensive.

- [ ] **Step 6: Write event validation/reducer/replay RED tests**

  Add tables for exact payload keys/types, descriptor/proxy safety, zero or
  fractional delta, invalid ship IDs, invalid `CargoId`, wrong price, wrong
  port/mode, stale quote after a prior trade, contiguous IDs, immutability, and
  canonical replay. Preserve all existing lead cases.

  ```ts
  const journal = createJournal(createCampaign({ seed: 1702 }));
  const quote = quoteTrade(journal.state, {
    portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
  });
  if (!quote.ok) throw new Error('fixture must quote');
  const traded = appendJournal(journal, marketTradeDraft(quote));
  expect(traded.state.wealth.gold).toBe(480);
  expect(traded.state.fleet.ships[0].cargo.provisions).toBe(39);
  expect(traded.state.lastEventId).toBe(1);
  expect(replayCampaign(traded.initial, traded.events)).toEqual(traded.state);
  ```

- [ ] **Step 7: Implement exhaustive event parsing and atomic reduction**

  Refactor `validateCampaignEvent` around the `type` discriminant without
  weakening its descriptor-safe snapshot or deterministic issue order. In the
  reducer's `market-traded` branch, re-run `quoteTrade` against the predecessor
  state, require the canonical unit price to equal `payload.unitPrice`, then
  apply gold and cargo to the clone and validate the result. Do not trust a UI
  quote or introduce a generic event payload.

- [ ] **Step 8: Write compaction threshold and continuity RED tests**

  Build 257 legal events by alternating provision buys and sells; do not
  fabricate duplicate lead events. Lock strict `>` boundaries:

  ```ts
  expect(crossesCompactionThreshold(256, 512 * 1024)).toBe(false);
  expect(crossesCompactionThreshold(257, 1)).toBe(true);
  expect(crossesCompactionThreshold(1, 512 * 1024 + 1)).toBe(true);

  const compacted = compactJournal(journalWith257LegalTrades);
  expect(compacted.events).toEqual([]);
  expect(compacted.initial).toEqual(journalWith257LegalTrades.state);
  expect(compacted.state).toEqual(journalWith257LegalTrades.state);
  const continued = appendJournal(compacted, NEXT_VALID_TRADE);
  expect(continued.events[0].id).toBe(compacted.state.lastEventId + 1);
  ```

  `compactJournal.ts` remains pure domain code and imports no browser/storage
  API. `storage/compactionPolicy.ts` owns `TextEncoder`, canonical UTF-8 byte
  length, and both persistence thresholds. Byte length is over
  `canonicalJson(journal)`, not JavaScript string length or envelope size. The
  byte threshold is independently boundary-tested because current bounded
  events normally hit 257 events first. Extend the domain dependency scan to
  reject `TextEncoder`, storage, or DOM references in `compactJournal.ts`.

- [ ] **Step 9: Compact only at the existing save boundary**

  `compactJournal` first calls `validateJournal`, then returns independent
  structured clones with the validated current state as both `initial` and
  `state`, preserving its nonzero `lastEventId`. In `saveCampaign`, compact the
  validated journal when `shouldCompactJournal` crosses either strict threshold
  before calculating the
  checksum/envelope. Return the parsed compacted payload in
  `SaveResult.journal`; callers must adopt that returned journal.

- [ ] **Step 10: Run mutations, focused gates, review, and commit**

  Kill and restore these exact mutations: treat `delta = 0` as valid; omit
  cannon from hold; trust event `unitPrice`; use `>=` at compaction thresholds;
  reset checkpoint `lastEventId` to zero. Name the durable failing test for each.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/content src/games/caribbean/domain src/games/caribbean/storage
  npm run typecheck
  git diff --check
  ```

  Expected: all focused tests PASS, typecheck PASS, diff check silent. Assign a
  fresh reviewer the Task 1 diff and fix every BLOCKER/MAJOR/MINOR with a new
  RED test. Then commit only Task 1 files:

  ```bash
  git add src/games/caribbean/content src/games/caribbean/domain src/games/caribbean/storage
  git commit -m "feat(caribbean): add simple port economy"
  ```

### Task 2: Add Origin-Wide Writer Ownership and Non-Destructive Recovery

**Files:**

- Create: `src/games/caribbean/storage/writer.ts`
- Create: `src/games/caribbean/storage/writer.test.ts`
- Create: `src/games/caribbean/storage/recovery.ts`
- Create: `src/games/caribbean/storage/recovery.test.ts`
- Modify: `src/games/caribbean/storage/persistence.ts`

**Interfaces:**

- Consumes: current `StorageLike`, `LoadResult`, `ActiveSaveRevision`,
  `UnreadableSlot`, `saveCampaign`, exact current/previous keys, and Task 1
  compacted save return.
- Produces:

```ts
export const CAMPAIGN_WRITER_LOCK = 'caribbean:campaign:writer';

export interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: (lock: unknown) => T | PromiseLike<T>,
  ): Promise<T>;
}

export type WriterRunResult<T> =
  | { kind: 'operation-result'; result: T }
  | { kind: 'operation-threw'; error: unknown }
  | { kind: 'acquisition-failed'; reason: 'unavailable' | 'denied'; error?: unknown }
  | { kind: 'writer-protocol-failure'; error: unknown };

export interface CampaignWriter {
  readonly capability: 'available' | 'unavailable';
  run<T>(operation: () => T | PromiseLike<T>): Promise<WriterRunResult<T>>;
}

export function createCampaignWriter(
  locks: LockManagerLike | null,
): CampaignWriter;

export const QUARANTINE_KEY_PREFIX = 'caribbean:campaign:quarantine:';

export interface RecoveryExportV1 {
  version: 1;
  game: 'caribbean';
  revision: ActiveSaveRevision;
  unreadableSlots: UnreadableSlot[];
}

export function serializeRecoveryExport(
  revision: ActiveSaveRevision,
  unreadableSlots: readonly UnreadableSlot[],
): string;

export type RecoveryStorageOperation =
  | 'read-current' | 'read-previous' | 'read-quarantine'
  | 'write-quarantine' | 'verify-quarantine'
  | 'remove-current' | 'remove-previous';

export type RecoveryStage =
  | 'quarantine-verified'
  | 'cleanup'
  | 'republish';

export type OperationReachableRevision =
  | { kind: 'known'; revision: ActiveSaveRevision }
  | {
      kind: 'remove-outcome-unknown';
      failedOperation: 'remove-current' | 'remove-previous';
      /** Exact before/after revisions reachable solely from that remove call. */
      acceptableRevisions: readonly ActiveSaveRevision[];
    };

export interface RecoveryContinuation {
  action: 'recover' | 'abandon';
  stage: RecoveryStage;
  quarantineKey: string;
  quarantineRaw: string;
  sourceRevision: ActiveSaveRevision;
  remaining: OperationReachableRevision;
  republish: null | {
    journal: CampaignJournal;
    build: string;
    savedAt: number;
  };
}

export type RecoveryResult =
  | {
      ok: true;
      kind: 'recovered';
      quarantineKey: string;
      revision: ActiveSaveRevision;
      journal: CampaignJournal;
    }
  | {
      ok: true;
      kind: 'abandoned';
      quarantineKey: string;
      revision: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'active-revision-conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'quarantine-collision';
      quarantineKey: string;
      expectedRaw: string;
      actualRaw: string;
    }
  | {
      ok: false;
      reason: 'storage-unavailable';
      stage: 'before-quarantine';
      operation: RecoveryStorageOperation;
    }
  | ({
      ok: false;
      reason: 'continuation-required';
      quarantineKey: string;
      continuation: RecoveryContinuation;
    } & (
      | {
          cause: 'storage-unavailable';
          failedOperation: RecoveryStorageOperation;
        }
      | {
          cause: 'partial-cleanup';
          failedOperation: 'remove-current' | 'remove-previous';
        }
      | {
          cause: 'republish-failed';
          saveFailure: Exclude<SaveResult, { ok: true }>;
        }
    ))
  | {
      ok: false;
      reason: 'external-revision-conflict';
      cause: 'active-revision-conflict';
      quarantineKey: string;
      quarantineRaw: string;
      stage: RecoveryStage;
      sourceRevision: ActiveSaveRevision;
      actualRevision: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'quarantine-invalidated';
      cause: 'quarantine-missing' | 'quarantine-changed';
      quarantineKey: string;
      expectedRaw: string;
      actualRaw: string | null;
      stage: RecoveryStage;
      sourceRevision: ActiveSaveRevision;
    }
  | { ok: false; reason: 'invalid-recovery-source' };

export function recoverCampaign(
  storage: StorageLike,
  loaded: Extract<LoadResult, { kind: 'loaded' }>,
  options: {
    build: string;
    savedAt: number;
    quarantinedAt: number;
    quarantineId: string;
  },
): RecoveryResult;

export function abandonCampaign(
  storage: StorageLike,
  load: Exclude<LoadResult, { kind: 'storage-unavailable' | 'empty' }>,
  options: {
    quarantinedAt: number;
    quarantineId: string;
  },
): RecoveryResult;

export function continueRecovery(
  storage: StorageLike,
  continuation: RecoveryContinuation,
  decision: 'continue' | 'abandon',
): RecoveryResult;
```

Both mutating functions are synchronous storage operations and must be called
only inside `CampaignWriter.run`. The storage functions cannot prove that by
themselves; controller tests prove every caller holds the writer boundary.

- [ ] **Step 1: Write exclusive-writer RED tests**

  Use an injected lock fake to prove the exact name/mode, one callback at a
  time, FIFO same-page calls, and zero callback calls when locks are absent:

  ```ts
  const writer = createCampaignWriter(null);
  const operation = vi.fn();
  await expect(writer.run(operation)).resolves.toEqual({
    kind: 'acquisition-failed', reason: 'unavailable',
  });
  expect(operation).not.toHaveBeenCalled();
  ```

  Add distinct cases for request rejection before callback (`denied`), operation
  returning both a typed success and typed failure (`operation-result`
  unchanged), synchronous throw, async rejection (`operation-threw`), a
  pathological rejection after callback start (`writer-protocol-failure`), and
  exact-once callback execution. For **each** possible A result, make A deferred,
  invoke `run(B)` without awaiting A, and assert B has not requested a lock,
  acquired one, or executed before A's public `WriterRunResult` settles. Then
  settle A, observe B run exactly once, and queue C successfully. Include at
  least these A rows: operation success, typed operation failure, sync throw,
  async rejection, acquisition unavailable, deferred acquisition denial, and
  writer-protocol failure. For the immediately unavailable adapter, assert the
  two public promises settle in invocation order and neither callback runs;
  every outcome that can be held uses a deferred. This proves exact FIFO and a
  fulfilled recovered tail after every public union member rather than relying
  on the browser lock implementation to serialize a broken local queue.

- [ ] **Step 2: Capture writer RED, then implement fail-safe GREEN**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/storage/writer.test.ts
  ```

  Expected: missing-module failure. Implement a private promise tail for
  same-page ordering. Inside the Web Lock callback set a one-shot guard and
  catch operation throw/rejection into an internal tagged value; only a request
  rejection before the guard is `acquisition-failed`. Advance the private tail
  **synchronously, before the caller can enqueue B**, using this exact shape:

  ```ts
  const previous = tail;
  const runPromise = previous.then(runUnderWebLock);
  tail = runPromise.then(() => undefined, () => undefined);
  return runPromise;
  ```

  Do not assign `tail` in an async `finally`: that lets A and B capture the same
  fulfilled predecessor. `runUnderWebLock` converts every platform/operation
  path to exactly one `WriterRunResult`, so `runPromise` normally fulfills; the
  two-argument tail recovery is still mandatory protection against an internal
  protocol defect and prevents an unhandled rejection from poisoning later
  work. Do not add a localStorage lease fallback.

- [ ] **Step 3: Write export/quarantine/recovery RED tests**

  Cover exact raw export (including Unicode and malformed JSON), different-byte
  quarantine collision, identical-byte idempotent continuation, exact revision
  conflict before any write,
  quarantine write/verification before any remove, corrupt-current +
  valid-previous recovery, valid-current + corrupt-previous repair, both-invalid
  refusal to recover, and valid/unreadable explicit abandonment.

  The quarantine raw is canonical JSON with these exact fields and stores raw
  strings without reparsing or normalization:

  ```ts
  interface QuarantineEnvelopeV1 {
    version: 1;
    game: 'caribbean';
    quarantinedAt: number;
    sourceRevision: ActiveSaveRevision;
    unreadableSlots: UnreadableSlot[];
  }
  ```

  Tests spy on operation order:

  ```ts
  expect(operations).toEqual([
    'get:current', 'get:previous', 'get:quarantine',
    'set:quarantine', 'get:quarantine',
    'get:current', 'get:previous',
    'remove:current',
    // saveCampaign then republishes the recovered previous as current
  ]);
  expect(storage.getItem(quarantineKey)).toContain(corruptCurrentRaw);
  ```

- [ ] **Step 4: Capture recovery RED, then implement the safe sequence**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/storage/recovery.test.ts
  ```

  Expected: missing-module failure.

  The mutation sequence is exact:

  1. Validate `quarantineId` against `[a-z0-9][a-z0-9-]{0,47}` and injected
     timestamps as nonnegative safe integers.
  2. Read current/previous and require byte equality with `load.revision`.
  3. Compute the exact intended quarantine raw. If its key is empty, write and
     verify it. If the key already contains byte-identical raw, treat it as the
     same verified operation and continue without writing. Different bytes are
     `quarantine-collision` and are never overwritten.
  4. Create the continuation at `quarantine-verified` before any active removal.
  5. Reread current/previous immediately before deletion and recheck exact
     equality. A conflict leaves active bytes untouched and the new quarantine
     as an extra preserved copy. Once quarantine is verified, an active revision
     is acceptable only if it is the source revision or one of the exact
     before/after revisions reachable solely from a remove this operation
     attempted. A newly observed external revision is never added to that set.
  6. Remove only unreadable slots for recovery; remove previous before current
     for full abandonment so the latest current survives the first failure.
  7. After recovery cleanup, call existing `saveCampaign` with the post-cleanup
     exact revision to publish `loaded.journal`. Adopt its returned compacted
     journal/revision. If it reports `save-conflict` or an active revision not
     in the operation-reachable set, classify that as
     `external-revision-conflict`, not as a resumable republish failure; never
     copy its `actual` revision into the old continuation.
  8. After verification, a resumable operation failure returns
     `continuation-required` carrying the quarantine key/raw, exact stage,
     source revision, cause, failed operation/save failure, republish data, and
     only operation-reachable remaining revisions. If a remove may have mutated
     and then thrown and the reread also fails, calculate the finite exact
     before/after list from that one attempted remove; never add observed bytes
     from another actor or a guessed state.
  9. Every `continueRecovery` invocation first rereads `quarantineKey` and
     compares the returned string byte-for-byte with `quarantineRaw`. Before
     **each** subsequent `removeItem` or `saveCampaign` republish, use the exact
     order “reread/validate active revision; reread/byte-validate quarantine;
     mutate,” with no await or unrelated callback between the final quarantine
     read and mutation. A throwing quarantine read returns
     `continuation-required` with `cause: 'storage-unavailable'` and the same
     executable continuation; it mutates no active slot. A missing/different
     value returns `quarantine-invalidated` with the expected and actual raw,
     no executable continuation, and mutates no active slot. Never recreate or
     overwrite a continuation's quarantine.
  10. Only after the quarantine check may `continueRecovery` reload active
      slots, and it accepts only the token's known revision or one exact
      operation-reachable before/after revision. `continue` resumes the
      original action; `abandon` may widen cleanup only for those same covered
      bytes. Any different active revision returns
      `external-revision-conflict`, preserves its `cause`, stage, source, and
      quarantine diagnostics, and leaves both active slots byte-identical.
      The old continuation is non-executable from then on: the UI may reload
      the newly observed save or begin a fresh export/quarantine decision using
      a newly loaded `LoadResult` and new quarantine ID, but may never accept the
      external revision into the old continuation or clean/republish over it.

- [ ] **Step 5: Prove failure-stage guarantees**

  Add throwing-storage cases for every named read/write/remove, including a
  remove that mutates then throws and reread failure after that attempt.
  Simulate republish failure at `write-previous` and `write-current`, then use
  the same continuation to finish or abandon safely. For every continuation
  stage (`quarantine-verified`, `cleanup`, and `republish`), separately replace,
  remove, and make reads throw for the quarantine key immediately before the
  next remove/republish; assert no active `setItem`/`removeItem` call occurs and
  the exact typed result retains the key, raw, stage, source, and cause.

  Add the adversarial external-writer case: quarantine corrupt `C0` plus valid
  `P0`, then have another actor install valid `V1/P0` after verification. Both
  old-token Continue and Abandon must return `external-revision-conflict`, must
  leave `V1/P0` byte-identical, and must not expose that actual revision as an
  acceptable continuation. Reloading `V1/P0` is non-destructive; if its newly
  loaded state itself needs recovery, prove a fresh operation writes and
  verifies a distinct quarantine before any mutation. Required invariants also
  include: quarantine write/verification failure removes nothing; a
  different-byte collision never writes; recovered canonical bytes equal the
  valid source; load/export never calls `removeItem`; and every genuinely
  resumable continuation is exact-revision idempotent.

- [ ] **Step 6: Run mutations, focused gates, review, and commit**

  Kill and restore: conflated acquisition/operation error; tail assignment
  deferred until A settles; rejected FIFO tail; callback twice; skipped initial
  or per-mutation continuation quarantine reread; accepting missing/different
  quarantine; accepting a collision; skipped second revision check; adding an
  external actual revision to the old continuation; deleting external bytes on
  Continue or Abandon; lost cause/key/stage after verified conflict; success
  after remove throws; continuation accepting an unlisted revision. Each must
  fail a named test.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/storage
  npm run typecheck
  git diff --check
  ```

  Expected: all PASS. Obtain a fresh independent review focused on race windows,
  exact raw preservation, partial cleanup, and existing rotation guarantees.
  Fix every finding test-first, then commit:

  ```bash
  git add src/games/caribbean/storage
  git commit -m "feat(caribbean): add safe campaign recovery"
  ```

### Task 3: Register the Production Route and Build Setup, Resume, and Recovery Coordination

**Files:**

- Create: `src/games/caribbean/index.ts`
- Create: `src/games/caribbean/state/runtime.ts`
- Create: `src/games/caribbean/state/runtime.test.ts`
- Create: `src/games/caribbean/state/useCaribbean.ts`
- Create: `src/games/caribbean/state/useCaribbean.test.tsx`
- Create: `src/games/caribbean/state/selectors.ts`
- Create: `src/games/caribbean/state/selectors.test.ts`
- Create: `src/games/caribbean/components/MinimumScreenGate.tsx`
- Create: `src/games/caribbean/components/MinimumScreenGate.test.tsx`
- Create: `src/games/caribbean/components/CaribbeanPage.tsx`
- Create: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Create: `src/games/caribbean/components/setup/CampaignSetup.tsx`
- Create: `src/games/caribbean/components/setup/CampaignSetup.test.tsx`
- Create: `src/games/caribbean/components/recovery/RecoveryPanel.tsx`
- Create: `src/games/caribbean/components/recovery/RecoveryPanel.test.tsx`
- Create: `src/games/caribbean/components/recovery/useModalFocus.ts`
- Create: `src/games/caribbean/components/recovery/useModalFocus.test.tsx`
- Create: `src/games/caribbean/styles/theme.css`
- Create: `src/games/caribbean/styles/production.css`
- Modify: `src/games/caribbean/styles/caribbean.css` (move shared base only)
- Modify: `src/app/registry.ts`
- Modify: `src/app/Menu.test.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**

- Consumes: Tasks 1–2 journal/storage operations, `createCampaign`,
  `createJournal`, `appendJournal`, `provisionsMonths`, `ShipIcon`, and the
  existing registry contracts.
- Produces:

```ts
export interface CaribbeanRuntime {
  storage: StorageLike;
  storageCapability:
    | { kind: 'available' }
    | { kind: 'unavailable'; error: unknown };
  writer: CampaignWriter;
  build: string;
  now(): number;
  makeSeed(): number;
  makeQuarantineId(): string;
}

export type SaveCapabilityFailure =
  | { kind: 'writer-unavailable' }
  | { kind: 'writer-denied'; error?: unknown }
  | {
      kind: 'storage-unavailable';
      detail:
        | { kind: 'runtime-access'; error: unknown }
        | {
            kind: 'operation';
            result:
              | Extract<SaveResult, { ok: false; reason: 'storage-unavailable' }>
              | Extract<LoadResult, { kind: 'storage-unavailable' }>;
          };
    }
  | {
      kind: 'operation-uncertain';
      writer: Extract<WriterRunResult<unknown>, {
        kind: 'operation-threw' | 'writer-protocol-failure';
      }>;
    };

export type MemoryOnlyReason = SaveCapabilityFailure['kind'] | 'save-conflict';

export type ContinuationRequiredRecoveryResult = Extract<RecoveryResult, {
  ok: false;
  reason: 'continuation-required';
}>;

export type CaribbeanPersistencePhase =
  | { kind: 'persisted' }
  | {
      kind: 'consent-required';
      failure: SaveCapabilityFailure;
      intent: 'start' | 'resume' | 'event';
    }
  | {
      kind: 'memory-only';
      reason: MemoryOnlyReason;
      canRetrySaving: boolean;
    }
  | {
      kind: 'save-conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | { kind: 'reconciling' }
  | { kind: 'recovery-required' }
  | {
      kind: 'recovery-continuation';
      result: ContinuationRequiredRecoveryResult;
    }
  | {
      kind: 'recovery-blocked';
      result: Exclude<Extract<RecoveryResult, { ok: false }>, {
        reason: 'continuation-required';
      }>;
    };

export interface CaribbeanController {
  load: LoadResult;
  journal: CampaignJournal | null;
  activity: PortActivity;
  busy: boolean;
  persistence: CaribbeanPersistencePhase;
  start(options: Omit<CreateCampaignOptions, 'seed'>): Promise<void>;
  resume(): Promise<void>;
  continueWithoutSaving(): void;
  dispatch(draft: CampaignEventDraft): Promise<void>;
  retrySaving(): Promise<void>;
  reloadExternalSave(): Promise<void>;
  exportInMemoryJournal(): string | null;
  recover(): Promise<void>;
  continueRecovery(decision: 'continue' | 'abandon'): Promise<void>;
  abandon(): Promise<void>;
  selectActivity(activity: PortActivity): void;
  closeActivity(): void;
}

export function useCaribbean(runtime: CaribbeanRuntime): CaribbeanController;
export function getBrowserCaribbeanRuntime(): CaribbeanRuntime;

export function formatCaribbeanSaveSummary(state: CampaignStateV1): {
  title: string;
  meta: string;
};

export function MinimumScreenGate(props: {
  children: React.ReactNode;
}): JSX.Element;

export function useModalFocus(options: {
  active: boolean;
  dialogRef: React.RefObject<HTMLElement>;
  initialFocusRef: React.RefObject<HTMLElement>;
  returnFocusRef: React.RefObject<HTMLElement>;
  backgroundRef: React.RefObject<HTMLElement>;
  onDismiss(): void;
}): void;
```

`getBrowserCaribbeanRuntime()` is a module singleton: it creates one writer/tail
for the origin and returns the same object across rerenders, route visits, and
React StrictMode probe remounts. Runtime construction reads
`window.localStorage` inside `try/catch`; property access itself may throw a
`SecurityError`. On success it stores `{ kind: 'available' }`. On failure it
stores `{ kind: 'unavailable', error }` and a guarded `StorageLike` whose three
methods throw that captured error; construction and rendering never throw. The
setup surface exposes saving-disabled status. Only after the player submits
Start does the controller retain those plain start options as pending intent
and enter `consent-required` with `detail.kind === 'runtime-access'`; it does
not call `createCampaign`/`createJournal` until the player explicitly chooses
Continue without saving. An inaccessible store cannot pretend it has a campaign
to Resume. Do not probe by writing.

The runtime uses `navigator.locks` when present, `Date.now()` only at this
UI/storage boundary, one uint32 from `crypto.getRandomValues`,
`crypto.randomUUID()`, and build label `caribbean-port-1`. `CaribbeanPage` keeps
the supplied-or-singleton runtime in one lazy ref and never replaces it on
rerender. Tests inject every value.

- [ ] **Step 1: Write minimum-screen RED tests**

  Table-test `390×844`, `820×1180`, portrait `1024×1366`, `959×600`, `960×599`,
  exact landscape `960×600`, and `1440×900`. Unsupported means width `< 960`,
  height `< 600`, **or** `innerWidth < innerHeight`; below that combined gate,
  the notice is a focused `role="alert"`, says
  “Caribbean Career needs a 960 × 600 playfield. Use a larger landscape
  display.”, and a child mount spy remains zero. At/above the boundary, render
  the child and remove the notice. Dispatch `resize` and prove both transitions.

- [ ] **Step 2: Capture screen-gate RED, then implement it**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/MinimumScreenGate.test.tsx
  ```

  Expected: missing-module failure. Use `innerWidth`, `innerHeight`, the exact
  predicate `width >= 960 && height >= 600 && width >= height`, one resize
  listener, and a ref/effect to focus the notice. `CaribbeanPage` must place the
  controller-owning child inside this gate, not call the hook before it.

- [ ] **Step 3: Write runtime/lifecycle and controller RED tests**

  Use real domain/storage functions and an injected deferred lock. Cover module-
  singleton runtime/writer identity across rerender and StrictMode, empty load,
  deterministic start, resume, degraded-load hold, same-page busy guard, one
  writer call per mutation, compacted journal adoption, recovery continuation,
  abandonment, and no port-navigation saves:

  ```ts
  const starting = act(() => result.current.start({
    name: 'Morgan', pronouns: 'they/them', talent: 'navigation', length: 'adventure',
  }));
  expect(result.current.busy).toBe(true); // synchronous ref before first await
  await starting;
  expect(result.current.journal?.state.lastEventId).toBe(0);

  const writes = storage.setItem.mock.calls.length;
  act(() => result.current.selectActivity('market'));
  expect(result.current.journal?.state.lastEventId).toBe(0);
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
  ```

  Lock absence/denial before Start or Resume leaves `journal === null` and
  enters `consent-required`. Denial for an event leaves the persisted
  predecessor visible and holds its candidate internally. Only explicit
  `continueWithoutSaving()` publishes the pending start/resume/event and enters
  session-scoped `memory-only`; consent is never persisted. `retrySaving()` may
  leave memory-only only after an exact-revision success and is unavailable
  when `canRetrySaving` is false after conflict.

  In `runtime.test.ts`, use `vi.resetModules()`, install a throwing getter for
  `window.localStorage`, and dynamically import/call the **real**
  `getBrowserCaribbeanRuntime()` adapter. Assert construction does not throw,
  `storageCapability.kind === 'unavailable'`, and rendering exposes the
  saving-disabled setup rather than an error boundary. Submit Start and assert
  `journal === null` in `consent-required`; only a subsequent Continue Without
  Saving click creates the memory campaign. Restore the property descriptor
  after the test. There is no implicit memory campaign and no test-only
  reset/export on the production singleton.

  Add deferred completion cases: unmount and replace a hook generation while a
  lock is pending. The acquired storage callback completes exactly once, but
  mounted/generation guards ignore its late UI result. `busyRef` clears in
  `finally` only for the current generation. A synchronous second dispatch
  before rerender is rejected; a new controller loads committed storage.

- [ ] **Step 4: Specify and test conflict/reconciliation ownership**

  Interleave controllers A/B from revision `R0`: A saves event A to `R1`; B's
  event B conflicts. B freezes mutation/autosave and retains its local fork only
  for these explicit actions:

  1. `reloadExternalSave()` discards the fork by choice and adopts a freshly
     loaded clean external journal/revision;
  2. `exportInMemoryJournal()` returns canonical JSON without writing; or
  3. `continueWithoutSaving()` keeps the fork in memory with
     `canRetrySaving: false` for this session.

  Never adopt `SaveResult.actual` as write authority, never show Retry Saving
  for a conflict fork, and never save it over the other tab. Prove neither
  event is silently overwritten and no retry loop exists.

  The writer operation wraps `saveCampaign` plus same-lock reconciliation for
  typed `write-previous`/`write-current` failure. Compare canonical journals:
  candidate equal loaded active means success; predecessor equal loaded active
  proves the one-event candidate is a strict extension and may enter a
  retryable consent phase using that newly read exact revision; anything else
  is conflict. If reread fails or writer reports operation/protocol failure,
  enter non-mutating `operation-uncertain` and require export/reload or explicit
  memory-only consent before returning to port.

- [ ] **Step 5: Capture controller RED, then implement the state machine**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state/useCaribbean.test.tsx
  ```

  Expected: missing-module failure. Assign a generation token on mount, mark it
  inactive on cleanup, and check it after every await. Use `try/finally` for the
  synchronous busy ref/state. Do not discard writer/save/recovery tags.
  `resume()` performs no write but requires writer capability or explicit
  memory-only consent before mounting. A degraded/recovered load cannot resume
  until recovery succeeds; an unreadable load can only export or abandon.

- [ ] **Step 6: Write setup/resume/recovery component RED tests**

  Lock these visible states:

  - empty: optional captain fields with defaults `Captain`, `they/them`,
    Navigation, Adventure, fixed “Bridgetown · 1675”; all five talents and all
    three lengths remain selectable;
  - loaded: captain, career, Bridgetown, last saved label, Mistral condition,
    gold, and provisions months plus Resume and explicit Abandon campaign;
  - recovered/degraded: Download recovery file, Recover known-good campaign,
    and Abandon campaign behind confirmation;
  - both unreadable: Download recovery file and Abandon only;
  - storage unavailable or writer unavailable: explicit “saving disabled” copy
    and an opt-in “Continue without saving” path, never a false saved state.

  Every setup input has a visible `<label>`; invalid fields set `aria-invalid`
  and `aria-describedby` to their inline error. Saving/conflict/recovery results
  use `role="status"` or `role="alert"`. Keyboard-only tests exercise Download,
  Recover, Reload newer save, Export in-memory journal, Continue without saving,
  and Abandon.

  The confirmation is a named `role="dialog"` with `aria-modal`, explicit
  description, and inert background. Initial focus lands on Cancel, Tab and
  Shift+Tab remain contained, Escape cancels, and close restores focus to the
  opener. The second action is `Quarantine and abandon`. Mock
  `URL.createObjectURL`; assert exact export bytes and URL revocation.

- [ ] **Step 7: Implement setup, modal focus, and staged recovery**

  Every setup choice is optional because the form begins with the recommended
  values; omit appearance/background/difficulty because canonical state does
  not support them. `useModalFocus` owns inert restoration, two-way focus trap,
  least-destructive initial focus, and opener restoration while composing
  `useDismissOnEscape`. Do not expose seed or save internals. Recovery copy
  never claims repair before success. The controller retains the complete
  `ContinuationRequiredRecoveryResult`, not only its nested continuation;
  before exposing normal Resume/Recover/Abandon again it runs
  `continueRecovery` under the writer to reload/match active slots. Component
  tests cover every continuation cause and its associated `failedOperation` or
  `saveFailure`, and assert truthful distinct copy plus the same retained
  key/raw/stage. The staged post-verification UI retries the same quarantine or
  abandons from it, never inventing a replacement ID.
  `quarantine-invalidated` removes all destructive continuation actions.
  `external-revision-conflict` offers only download of the already verified
  quarantine, reload of the newly observed active save, or cancel; after reload,
  a still-degraded new `LoadResult` returns to a fresh recovery/export decision
  with a new quarantine ID. Neither blocked result can call the old token.
  Before verification, `recovery-blocked` retains the exact collision/conflict/
  storage/invalid-source result for truthful copy; no generic warning erases it.
  An identical pre-existing quarantine continues idempotently; a different-byte
  preflight collision may retry with one freshly injected ID while leaving the
  occupied key untouched.

- [ ] **Step 8: Split production CSS from the Battle Lab**

  Move only root variables and `.caribbean-app` base declarations into
  `theme.css`. `caribbean.css` imports the theme and retains every
  `.caribbean-lab`, briefing, bearing, and harness selector. `production.css`
  imports the theme and contains setup/resume/recovery only; `CaribbeanPage`
  imports `production.css`, never `caribbean.css`. Snapshot moved declarations
  so the harness appearance does not drift. Normal build checks reject the
  stable `.caribbean-lab` marker.

- [ ] **Step 9: Register `/caribbean`, total Save Station formatting, and route proof**

  Create this descriptor and add it immediately after `unicorn` in `GAMES`:

  ```ts
  export const caribbean: GameDescriptor = {
    id: 'caribbean',
    title: 'Caribbean Career',
    tag: '3D battles',
    players: { min: 1, max: 1 },
    computer: true,
    path: '/caribbean',
    description: 'Trade, chase rumours, and command a growing fleet across the Caribbean.',
    Icon: ShipIcon,
    Page: CaribbeanPage,
    savedGames,
  };
  ```

  Create and directly test this total helper in `state/selectors.ts`:

  ```ts
  export const CAMPAIGN_LENGTH_LABELS = {
    adventure: 'Adventure',
    voyage: 'Voyage',
    legend: 'Legend',
  } as const satisfies Record<CampaignLength, string>;

  export function formatCaribbeanSaveSummary(state: CampaignStateV1) {
    const months = provisionsMonths(state);
    const provisions = months === null
      ? '— months provisions'
      : `${months.toFixed(1)} months provisions`;
    return {
      title: `Caribbean Career — ${state.captain.name}`,
      meta: `${CAMPAIGN_LENGTH_LABELS[state.career.length]} · Bridgetown · ${provisions}`,
    };
  }
  ```

  `savedGames()` catches storage and formatting failures and returns `[]`. For
  a loaded save it spreads the helper into stable key `/caribbean?resume=1`,
  colour `#4ec5c1`, and `ShipIcon` fields. Test normal and null-month fallback;
  reading never writes.

  The query may bypass the resume summary only for a clean loaded save; degraded
  or recovered loads always stop at recovery. Reading the row never writes.

  Modify `App.test.tsx`: seed an active profile, set a supported viewport and
  `window.location.hash = '#/caribbean'`, render the actual `App`, and assert the
  Caribbean setup/resume or minimum-screen surface is inside the single main
  landmark. This proves registry/HashRouter/PlayerGate wiring.

- [ ] **Step 10: Verify, review, and commit**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state src/games/caribbean/components src/app/Menu.test.tsx src/app/App.test.tsx
  npm run typecheck
  git diff --check
  ```

  Expected: PASS. Review exact-once writer use, consent, StrictMode identity,
  late completion, conflict ownership, recovery continuation, full dialog
  behavior, route wiring, total summary formatting, and CSS isolation. Fix all
  findings test-first, then commit:

  ```bash
  git add src/games/caribbean/index.ts src/games/caribbean/state src/games/caribbean/components src/games/caribbean/styles src/app/registry.ts src/app/Menu.test.tsx src/app/App.test.tsx
  git commit -m "feat(caribbean): add career setup and resume"
  ```

### Task 4: Build the Accessible Seven-Item Bridgetown Shell

**Files:**

- Create: `src/games/caribbean/components/port/PortMenu.tsx`
- Create: `src/games/caribbean/components/port/PortMenu.test.tsx`
- Create: `src/games/caribbean/components/port/PortPage.tsx`
- Create: `src/games/caribbean/components/port/PortPage.test.tsx`
- Create: `src/games/caribbean/components/port/GovernorHouse.tsx`
- Create: `src/games/caribbean/components/port/ShipyardSummary.tsx`
- Create: `src/games/caribbean/components/port/DivideShares.tsx`
- Create: `src/games/caribbean/styles/port.css`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`

**Interfaces:**

- Consumes: `CaribbeanController`, `BRIDGETOWN`, current `CampaignStateV1`,
  `PortActivity`, and Task 3 full-page boundary.
- Produces:

```ts
export const PORT_ACTIONS = [
  { kind: 'activity', activity: 'governor', label: "Governor's House" },
  { kind: 'activity', activity: 'tavern', label: 'Tavern' },
  { kind: 'activity', activity: 'market', label: 'Market' },
  { kind: 'activity', activity: 'shipyard', label: 'Shipyard' },
  { kind: 'activity', activity: 'shares', label: 'Divide Shares' },
  { kind: 'activity', activity: 'log', label: "Captain's Log" },
  { kind: 'set-sail', label: 'Set Sail' },
] as const;
```

- [ ] **Step 1: Write order, navigation, and focus RED tests**

  Assert the seven exact labels in DOM order; active activity gets
  `aria-current="page"`; panel selection does not change journal/event ID or
  call storage; Escape returns to menu and restores focus to its trigger; and
  heading/focus order remains logical at `960×600` and `1440×900`.

  Set Sail is a native disabled button with adjacent visible text “Sea routes
  open in the next package.” It is not cast to `PortActivity` and does not
  dispatch. Shipyard opens a useful read-only Mistral summary; Divide Shares
  opens “Available after a profitable voyage”; Governor's House shows English
  control, standing, peace context, and “No commission offered today.” No item
  leads to an empty panel.

- [ ] **Step 2: Capture shell RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/port/PortMenu.test.tsx src/games/caribbean/components/port/PortPage.test.tsx
  ```

  Expected: missing-module failures.

- [ ] **Step 3: Implement the stable port router**

  `PortPage` owns no canonical state. It renders a compact top status rail
  (Bridgetown, 1675, gold, crew, morale, Mistral hull/sails, provisions months),
  the current activity content, and the ordered activity menu. Use semantic
  `nav`/buttons and one `<main>`-compatible section, not a giant button sidebar.
  On Escape, call `controller.closeActivity()` and focus the corresponding menu
  button in an effect after the menu renders.

- [ ] **Step 4: Implement the modern harbour presentation**

  `port.css` is imported only by the production `PortPage` and builds on
  `theme.css`; it never imports the harness `caribbean.css`. Use CSS gradients,
  simple pseudo-element silhouettes, and the existing
  Caribbean palette for a full-page sunlit harbour. Keep content centered in a
  wide grid with translucent compact surfaces and restrained brass rules. Do
  not import images, fonts, Three.js, `battle.css`, or Battle Lab components.
  Add rules/tests proving `font-size >= 14px`, menu/action `min-height: 44px`,
  visible `:focus-visible`, reduced-motion gating, and no mobile layout that
  bypasses the blocking screen gate.

- [ ] **Step 5: Verify, browser-smoke, review, and commit**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/port src/games/caribbean/components/CaribbeanPage.test.tsx
  npm run typecheck
  git diff --check
  ```

  Open the production route at `1440×900` and exact `960×600`; verify no
  horizontal scroll, obscured action, focus loss, console error, or network
  asset request. Obtain an independent UX/accessibility review and fix every
  finding. Commit:

  ```bash
  git add src/games/caribbean/components/port src/games/caribbean/components/CaribbeanPage.tsx src/games/caribbean/styles
  git commit -m "feat(caribbean): add Bridgetown port shell"
  ```

### Task 5: Connect the Compact Six-Good Market

**Files:**

- Create: `src/games/caribbean/components/port/Market.tsx`
- Create: `src/games/caribbean/components/port/Market.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/styles/port.css`

**Interfaces:**

- Consumes: `CARGO_IDS`, `GOODS`, `BRIDGETOWN_MARKET`, `quoteTrade`,
  `marketTradeDraft`, `shipHoldUsed`, `provisionsMonths`, and controller
  `dispatch`.
- Produces:

```ts
export interface MarketProps {
  state: CampaignStateV1;
  busy: boolean;
  onTrade(draft: CampaignEventDraftFor<'market-traded'>): Promise<void>;
}
```

- [ ] **Step 1: Write six-row UI RED tests**

  Assert exact row order; each row shows name, owned quantity, fixed unit price,
  and icon-plus-word Cheap/Fair/Expensive; the summary shows opening `500 gold`,
  `54 / 100 hold`, and `3.4 months`. Use compact `Sell all`, `−5`, `−1`, `+1`,
  `+5`, and `Max` controls with unique accessible names and `44×44` targets.

  Test impossible actions disabled with exact reason, one click creates exactly
  one `market-traded`, controls disable while busy, a successful `+5`
  provisions trade updates `480 gold`, `59 / 100`, `3.9 months` in one render,
  and a denied writer leaves prior totals unchanged until explicit Continue
  without saving publishes the held candidate. Conflict replaces Market with
  the frozen conflict choices; it never leaves active trade controls visible.

- [ ] **Step 2: Capture Market RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/port/Market.test.tsx
  ```

  Expected: missing-module failure.

- [ ] **Step 3: Implement one-click quote-first controls**

  Every control derives a fresh `quoteTrade` from current props. For `Max`,
  compute the greatest positive integer that remains within gold and hold by
  bounded binary search from `0..SLOOP_CLASS.hold`; do not loop to an arbitrary
  global maximum. `Sell all` uses the negative owned quantity. Successful
  quotes dispatch `marketTradeDraft(quote)` immediately—no confirmation modal
  for routine cargo. Failed quotes render their exact plain-language reason and
  never dispatch.

- [ ] **Step 4: Keep logistics dominant and simple**

  Format domain months to one decimal only at render. Add `Low` below `1.0`
  month and `Critical` below `0.5`, with text/shape as well as colour, but add no
  consumption or extra resource. Keep all six rows visible at desktop without
  a giant command panel; at exact `960×600`, the content area may scroll while
  the port rail/menu stays usable.

- [ ] **Step 5: Verify, review, and commit**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/economy.test.ts src/games/caribbean/components/port/Market.test.tsx src/games/caribbean/state/useCaribbean.test.tsx
  npm run typecheck
  git diff --check
  ```

  Expected: PASS. Review keyboard names, disabled reasons, same-render totals,
  and small-screen density. Fix all findings test-first, then commit:

  ```bash
  git add src/games/caribbean/components/port/Market.tsx src/games/caribbean/components/port/Market.test.tsx src/games/caribbean/components/port/PortPage.tsx src/games/caribbean/styles/port.css
  git commit -m "feat(caribbean): connect Bridgetown market"
  ```

### Task 6: Add the One-Card Tavern and One-Action Captain's Log

**Files:**

- Create: `src/games/caribbean/domain/leadSelectors.ts`
- Create: `src/games/caribbean/domain/leadSelectors.test.ts`
- Create: `src/games/caribbean/components/port/Tavern.tsx`
- Create: `src/games/caribbean/components/port/Tavern.test.tsx`
- Create: `src/games/caribbean/components/log/CaptainsLog.tsx`
- Create: `src/games/caribbean/components/log/CaptainsLog.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/styles/port.css`

**Interfaces:**

- Consumes: current `LEADS['red-jackdaw']`, existing `lead-accepted` draft and
  reducer, campaign day, and controller `dispatch`.
- Produces:

```ts
export type RedJackdawView =
  | {
      status: 'available';
      sentence: string;
      nextAction: string;
    }
  | {
      status: 'active';
      sentence: string;
      nextAction: string;
      daysRemaining: number;
    }
  | {
      status: 'completed' | 'expired';
      sentence: string;
      terminalCopy: string;
    };

export function redJackdawView(state: CampaignStateV1): RedJackdawView;
```

- [ ] **Step 1: Write selector lifecycle RED tests**

  Assert content resolution without stored prose, available/active/completed/
  expired views, `18 days remaining` at opening acceptance, clamp at zero, and
  no mutation. Completed returns `The Red Jackdaw lead is complete.`; expired
  returns `This rumour has gone cold.` Neither terminal object has
  `nextAction` or instructs the player to sail east. Although this package
  cannot create terminal status, every already-valid state renders safely.

- [ ] **Step 2: Write Tavern/Log RED tests with exact copy**

  Tavern shows exactly one speaker card, the exact rumour sentence, and one
  `Mark on chart` action. It dispatches this draft exactly once:

  ```ts
  { type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } }
  ```

  After acceptance, it says `Marked in the Captain's Log` and has no active
  duplicate action. The live region announces once. The Log initially says
  `No leads yet`; after acceptance it shows `Red Jackdaw`, `18 days remaining`,
  and the exact next action. Assert absence of nested steps, progress
  percentages, pin priority, clue trees, and an embedded map. Add terminal Log
  fixtures proving completed/expired copy never renders the obsolete action.

- [ ] **Step 3: Capture RED, then implement content-resolved views**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/leadSelectors.test.ts src/games/caribbean/components/port/Tavern.test.tsx src/games/caribbean/components/log/CaptainsLog.test.tsx
  ```

  Expected: missing-module failures. Implement selectors as pure functions.
  Components may read content and state but cannot create a new quest event,
  store prose, complete/expire the lead, or autosave on panel navigation.

- [ ] **Step 4: Verify port-to-log comprehension and commit**

  Run the integrated component path: open Tavern, accept, Escape/menu, open Log,
  and assert target direction/next action remain visible with event ID exactly
  one higher. Reload the saved journal and repeat the assertion.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain src/games/caribbean/components/port src/games/caribbean/components/log src/games/caribbean/state
  npm run typecheck
  git diff --check
  ```

  Obtain an independent simplicity/accessibility review. Fix all findings
  test-first, then commit:

  ```bash
  git add src/games/caribbean/domain/leadSelectors.ts src/games/caribbean/domain/leadSelectors.test.ts src/games/caribbean/components/port src/games/caribbean/components/log
  git commit -m "feat(caribbean): add rumour and captain log"
  ```

### Task 7: Prove the Production Bridgetown Package in Tests and a Real Desktop Browser

**Files:**

- Create: `src/games/caribbean/caribbean.integration.test.tsx`
- Create: `scripts/caribbean-port-check.mjs`
- Modify: `package.json`
- Create: selected PNGs under `docs/screenshots/caribbean-port/`
- Create: `docs/screenshots/caribbean-port/metrics.json`
- Modify: `docs/games/caribbean-career/README.md`

**Interfaces:**

- Consumes: every Task 1–6 interface and the actual registry-routed production
  page.
- Produces: `npm run caribbean:port-check`, deterministic browser evidence, and
  a cumulative package report/review.

- [ ] **Step 1: Write the integrated resolved-state journey RED test**

  Use real domain, storage, writer fake, and React components; mock only injected
  time/seed/quarantine ID:

  ```ts
  it('persists setup -> trade -> rumour -> log while port navigation stays transient', async () => {
    render(<CaribbeanPage runtime={runtime({ seed: 1702, now: [100, 200, 300] })} />);
    await beginRecommendedCareer(user);
    await openPortActivity(user, 'Market');
    await user.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));
    await closeActivity(user);
    await openPortActivity(user, 'Tavern');
    await user.click(screen.getByRole('button', { name: 'Mark on chart' }));
    await closeActivity(user);
    await openPortActivity(user, "Captain's Log");

    expect(screen.getByText('Sail east of Bridgetown and identify the Red Jackdaw.')).toBeVisible();
    expect(loadedJournal(storage).state.lastEventId).toBe(2);
    unmount();
    render(<CaribbeanPage runtime={runtime({ storage })} />);
    await user.click(screen.getByRole('button', { name: 'Resume career' }));
    expect(screen.getByText('3.9 months')).toBeVisible();
  });
  ```

  Add recovery journey: create two real saves, corrupt current, reload, export
  exact bytes, confirm recovery under writer lock, verify quarantine contains
  corrupt raw, then resume canonical previous. Add no-lock journey: Start leaves
  `journal` null until explicit Continue without saving; only then may a trade
  enter memory, the warning persists, and storage bytes remain unchanged. Add
  two-controller conflict/export/reload and unmount-before-lock-completion paths.

- [ ] **Step 2: Capture integrated RED, then close only real seams**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/caribbean.integration.test.tsx
  ```

  Expected: FAIL at the first incomplete Task 1–6 integration. Fix production
  seams; do not add test-only success branches or bypass storage/domain rules.

- [ ] **Step 3: Build the normal-production Playwright gate**

  Add `"caribbean:port-check": "node scripts/caribbean-port-check.mjs"`.
  The script runs a normal `vite build` without `BUILD_HARNESS`, serves `dist`
  on its own strict port, seeds the arcade player profile, and drives
  `/#/caribbean`. It fails on console error, page error, failed request, external
  URL, horizontal overflow, visible production text below 14 px, visible active
  target below `44×44`, wrong seven-item order, duplicate semantic event,
  missing save, checksum/replay failure, a mounted campaign controller in any
  unsupported portrait, or a blocked exact `960×600` landscape viewport.

  Capture settled reduced-motion PNGs:

  - `setup-desktop.png` at `1440×900`;
  - `port-desktop.png` at `1440×900`;
  - `market-desktop.png` after the `+5` provision trade;
  - `tavern-desktop.png` before acceptance;
  - `captains-log-desktop.png` after acceptance;
  - `recovery-desktop.png` with corrupt current/valid previous;
  - `port-minimum-supported.png` at `960×600`;
  - `minimum-screen-width.png` at `959×600`; and
  - `minimum-screen-height.png` at `960×599`;
  - `minimum-screen-large-portrait.png` at `1024×1366`.

  Before the first navigation, install a Playwright `context.addInitScript`
  that fixes the actual browser boundary used by production: `Date.now()` reads
  a documented integer sequence, one-element `Uint32Array` calls to
  `Crypto.prototype.getRandomValues` read a documented seed sequence, and
  `Crypto.prototype.randomUUID` reads documented valid UUIDs such as
  `00000000-0000-4000-8000-000000000001`. Use
  `Object.defineProperty(Crypto.prototype, ...)`, retain the native
  `getRandomValues` behavior for arrays outside the production seed shape, and
  install the overrides before loading `/#/caribbean`. This is test harness
  control at browser APIs, not a test-only branch or injected runtime in the
  production bundle. Keep the real routed page, real `navigator.locks`, and real
  `window.localStorage`.

  `metrics.json` records browser/version, each viewport/DPR/orientation verdict,
  the fixed now/seed/UUID fixtures actually consumed, final event count, save
  checksum, external/failed request counts, minimum measured font/target,
  horizontal overflow, screenshot filenames, and recovery fields
  `quarantineKey`, `quarantineVerified`, `recoveredChecksum`, and
  `recoveryReloaded`. The script writes evidence only when bytes change.

  Run the same journey twice from clean storage with the same init-script
  fixtures. Before updating evidence, assert canonical `metrics.json` bytes and
  settled reduced-motion PNG bytes are identical between runs. A difference is
  a failed determinism check to diagnose, never an accepted timestamp/random-ID
  churn. This specifically makes campaign seed, save time, quarantine time/ID,
  checksums, metrics, and rendered time-dependent labels reproducible without a
  production bypass.

  The browser journey must complete recovery, not only photograph it: create
  two real resolved saves, retain the canonical previous payload/checksum,
  replace current with exact corrupt raw, reload into Recovery, inspect the
  downloaded/exported JSON for that raw, confirm Recover, read the generated
  quarantine key and assert its raw contains the corrupt source, assert active
  current is a clean replay-valid republish and no corrupt active slot remains,
  reload the page, Resume, and compare state/checksum with the known previous.
  Capture `recovery-desktop.png` before confirmation but fail the run unless all
  post-confirmation/reload assertions pass under the real browser Web Lock.

- [ ] **Step 4: Prove normal-build preview and asset isolation**

  After the normal build, the script and manual inspection must assert:

  ```text
  dist/preview-caribbean-game.html does not exist
  no dist asset named caribbean-sloop*.glb exists
  /#/caribbean requests no .glb and no preview-caribbean resource
  the /caribbean-loaded module graph contains no CaribbeanLab/NavalBattlePage/NavalScene marker
  production CSS contains neither a battle.css marker nor `.caribbean-lab`
  ```

  Then run one `BUILD_HARNESS=1` build and prove the existing Battle Lab still
  builds; do not change its output or fold it into the production route.

- [ ] **Step 5: Run the complete clean-room engineering gate**

  Remove only the two project-owned generated TypeScript build-info files, then
  run each logical command separately:

  ```bash
  rm -f node_modules/.tmp/tsconfig.app.tsbuildinfo node_modules/.tmp/tsconfig.node.tsbuildinfo
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  git diff --check
  git status --short
  ```

  Expected: check PASS with only documented baseline warnings, full Vitest PASS,
  normal and harness builds PASS, browser check PASS, diff check silent, and
  status contains only intended Task 7/evidence files.

- [ ] **Step 6: Conduct visual, accessibility, and product review**

  Inspect every PNG at original resolution. Confirm a first-time player can
  identify Market, Shipyard, Tavern, and Set Sail in one glance; Set Sail is
  visibly unavailable rather than broken; port navigation is compact; Market
  emphasizes months/gold/hold without administrative noise; Tavern/Log repeat
  one plain target; recovery never implies bytes were deleted before success;
  and the shell retains the approved modern aesthetic. Record missing real
  target-iPad or human evidence as future evidence, not a fabricated pass.

- [ ] **Step 7: Run independent cumulative review and commit evidence**

  Write the implementation report under
  `.superpowers/sdd/2026-08-24-caribbean-bridgetown-port/` with RED/GREEN,
  mutation, focused/full command, browser, screenshot, bundle, and commit
  evidence. Assign a fresh reviewer the cumulative diff from `3ddf1ab` and this
  plan. Required review topics:

  - event validation totality and market atomicity;
  - checkpoint continuity at both strict thresholds;
  - tagged writer acquisition/operation failures, exact-once FIFO recovery;
  - explicit memory consent, lifecycle generation guards, no unsafe fallback;
  - conflict fork freeze/export/reload with no revision adoption overwrite;
  - idempotent quarantine continuation, per-step byte re-verification,
    operation-reachable cleanup reporting, and external-revision refusal;
  - controller concurrency and compacted-journal adoption;
  - no event/save for `PortActivity` selection;
  - accessibility and the landscape `960×600` mount gate, including blocked
    `1024×1366` portrait;
  - production/harness/naval dependency isolation; and
  - original-style simplicity versus unnecessary management.

  Any BLOCKER, MAJOR, or MINOR returns to the owning task with a new RED test
  and separate fix commit. Only after a zero-finding cumulative re-review,
  commit Task 7 files:

  ```bash
  git add package.json scripts/caribbean-port-check.mjs src/games/caribbean/caribbean.integration.test.tsx docs/games/caribbean-career/README.md docs/screenshots/caribbean-port
  git commit -m "test(caribbean): verify Bridgetown port package"
  ```

  Leave the worktree clean. Do not merge or push.

## Package Exit Criteria

The Bridgetown package is complete only when every statement is true:

1. Setup choices are optional, recommendations are visible, and all three
   career lengths/five talents create a valid deterministic campaign.
2. Clean saves resume; degraded saves recover only after verified quarantine.
   Every resumable late failure retains the full cause, operation/save failure,
   exact stage/key/raw, and only finite operation-reachable revisions. Every
   continuation byte-verifies its quarantine immediately before each destructive
   step; missing/changed bytes and external active revisions stop without active
   mutation. External bytes require reload plus a fresh export/quarantine
   decision and are never admitted to or abandoned by an old token.
3. Writer acquisition, operation results, operation throws, and protocol
   failures remain distinct; callbacks are exact-once and synchronous tail
   advancement keeps deferred A/B strictly FIFO through every result/failure.
   Missing/denied locks and a throwing `window.localStorage` property require
   explicit session-only memory consent without constructing a journal first.
4. Save conflict freezes writes and offers only reload external, export local,
   or explicitly continue memory-only; no controller adopts another tab's
   revision as authority to overwrite it. Late async UI completions are ignored.
5. Market trades are atomic resolved events using the six exact fixed prices,
   unlimited port supply, current gold/cargo/capacity, and no state migration.
6. A legal journal compacts only above 256 events or 512 KiB UTF-8, keeps its
   canonical state, and appends the next monotonic event from the checkpoint.
   UTF-8 threshold policy stays in storage; pure domain imports no TextEncoder.
7. The seven port actions are visible in exact order; selecting six panels is
   transient; Set Sail is clearly unavailable; every stub contains useful copy.
8. Provisions remain one resource shown as months. One direct rumour creates the
   existing lead; only available/active status exposes a next action.
9. Unless width is at least 960, height at least 600, and width at least height,
   no campaign controller mounts; `1024×1366` portrait is explicitly blocked
   while `960×600` landscape works. Supported layouts meet 14 px/44 px/focus/
   non-colour requirements and have no horizontal overflow.
10. Setup errors and destructive dialogs meet label/description/focus/inert/
    announcement/Escape/focus-return requirements.
11. Normal `/caribbean` contains no `.caribbean-lab`, Battle Lab, naval scene,
    battle CSS, harness HTML, or Caribbean GLB. Harness builds remain intact.
12. The real browser completes quarantine, republish, reload, and canonical
    resume; a recovery screenshot alone is insufficient. A pre-navigation fixed
    clock/seed/UUID boundary makes two clean runs produce byte-identical metrics
    and reduced-motion screenshots while retaining real Web Locks/localStorage.
13. Focused tests, full tests, check, normal/harness builds, browser evidence,
    diff check, per-task reviews, and cumulative zero-finding review are green.

## Next Package After Approval

Add deterministic strategic sailing and the encounter handoff as a separate
package: widen the validator from port mode only, introduce named calendar and
provision-consumption events, make Set Sail functional, preserve one next
action, and connect the already-approved naval duel without changing this
package's simple market, port order, writer safety, or recovery guarantees.
