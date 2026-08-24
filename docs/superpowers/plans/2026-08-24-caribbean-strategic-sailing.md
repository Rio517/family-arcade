# Caribbean Strategic Sailing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic, saveable Bridgetown -> authored sea leg -> pursue/avoid contact -> existing naval battle -> journaled safe return loop on the normal Caribbean route.

**Architecture:** Persist each strategic phase in the existing campaign journal and create naval combat from one serialized `NavalBattleInput`; keep the 60 Hz `NavalSession` transient and campaign-immutable until withdrawal or a validated terminal result. Reuse the existing writer, rotating saves, recovery, full-bleed battle, and minimum-screen gate, while widening V1 validation only for already-reserved modes and one optional compacted outcome summary.

**Tech Stack:** TypeScript 5.6, React 18, Vitest 2, Testing Library, React Router 6, Web Locks, localStorage, Three.js 0.170, Vite 5, Playwright, CSS, and the existing canonical JSON/FNV-1a save stack. No new dependency is justified.

**Spec:** `docs/superpowers/specs/2026-08-24-caribbean-strategic-sailing-design.md`

## Global Constraints

- Work only in `/Users/marioflores/code/arcade/.worktrees/caribbean-game` on `codex/caribbean-game`, starting from clean HEAD `afdb53c`. Do not merge, push, rebase, fetch, or touch `main`.
- Preserve `CampaignStateV1.schemaVersion: 1`, `contentVersion: 'caribbean-slice-1'`, save-envelope version 1, and storage keys `caribbean:campaign:current` / `caribbean:campaign:previous`.
- Existing V1 port saves and legacy `voyage` / `legend` values remain readable without a byte rewrite. No save transform is added.
- Use validation widening only for `sailing`, `encounter`, and `naval`; `capture`, `boarding`, `treasure`, `shares`, and `retired` remain invalid until their resume screens exist.
- `world.lastVoyage` is optional only for legacy-save compatibility. Every new safe-return transition sets it so compaction retains the latest result.
- Set Sail requires Bridgetown port mode, an active Red Jackdaw lead, an undefeated target, a valid flagship, and at least 2 provisions.
- The authored leg costs exactly 1 day / 1 provision outbound and 1 day / 1 provision returning. No continuous strategic clock runs.
- `nextSeed` is the sole LCG step. The sea leg advances navigation RNG once; pursuit advances naval RNG once and uses the result as battle input seed. World RNG does not change.
- `createRedJackdawBattleInput` is the only authored battle-input builder. Do not duplicate wind, arena, time limit, positions, opponent, or objective in campaign/UI code.
- Aim legality stays in `domain/naval/geometry.ts`; boarding/surrender/escape/separation stay in `domain/naval/outcomes.ts`; terminal projection/validation stays in `domain/naval/resolution.ts`.
- No campaign write occurs while a live `NavalSession` ticks. Withdrawal or one validated terminal result is the next campaign event.
- Persistent tactical damage, capture, repairs, fleet changes, morale, prize ships, multi-port economies, conquest, romance, free-roaming 3D overworld, and procedural content remain deferred.
- Normal production may contain a lazy, offline-precacheable production naval chunk and the local GLB. It must not contain `CaribbeanLab`, `debugBridge`, preview HTML, harness config, or harness-only markers.
- Setup, port, sailing, and avoid journeys must not request naval JS/CSS/GLB. Pursuit may request only local emitted assets.
- Landscape width must be `>= 960`, height `>= 600`, and width `>= height`. Every unsupported viewport mounts only the focused notice; no controller or naval session runs beneath it.
- Visible text is at least 14 px; active controls are at least 44x44 CSS px; every interactive control has `data-testid`, keyboard/touch access, visible focus, non-colour state, and stable geometry.
- Every production change uses strict RED -> observed expected failure -> minimum GREEN -> focused verification -> self-review -> one scoped commit. No production edit precedes its failing test.
- Every task report records the production mutation that each test catches and confirms expected literals are hand-derived rather than computed with the code under test.
- Every UI task runs a real production browser gate before package completion. Evidence is deterministic, fail-closed, and preserves all existing version-2 port evidence channels.
- Clean build verification uses `tsc -b --force` or moves only the two known `.tsbuildinfo` files to a `mktemp -d` directory; do not broadly delete caches.

---

## Locked File and Responsibility Map

| Unit | Files | Single responsibility |
| --- | --- | --- |
| Authored voyage | create `content/voyage.ts`, `content/voyage.test.ts` | One Bridgetown route, costs, labels, checkpoints |
| Battle input | modify `content/naval.ts`, content/create-battle tests | One Red Jackdaw input builder shared by lab and campaign |
| Naval resolution | create `domain/naval/resolution.ts`, `resolution.test.ts`; modify `outcomes.ts` only to export reusable facts/helpers | Terminal naval state -> validated semantic summary |
| Campaign voyage | create `domain/voyage.ts`, `voyage.test.ts`; modify campaign types/events/reducer/validator/replay/selectors and tests | Readiness, drafts, phase transitions, result state, compaction |
| Persistence compatibility | modify storage schema/persistence/recovery tests only; `migrations.ts` remains identity | Prove old bytes and intermediate modes survive save/recovery |
| Controller | modify `state/useCaribbean.ts`, controller tests, `state/selectors.ts` | Named actions delegate to the existing atomic dispatch path |
| Strategic UI | create `components/voyage/SailingPage.tsx`, `EncounterPage.tsx`, `CampaignNavalBattle.tsx`, tests, `styles/voyage.css`; modify port/log/page components and tests | Port departure, authored leg, meaningful contact, lazy saved-input battle, return log |
| Battle integration | modify `components/voyage/CampaignNavalBattle.tsx` and tests, `NavalBattlePage`, `NavalSession`, `useNavalSession`, test session and tests | Pause/reload, withdraw/result action, exactly-once safe return |
| Evidence | modify integration tests, port browser script/evaluator/tests, package docs, metrics/screenshots | Deterministic normal-route proof and isolation |

## Exact Shared Interfaces

Tasks must use these names and signatures. A later task may consume them but may not redefine them.

```ts
// content/voyage.ts — Task 1
export const RED_JACKDAW_VOYAGE: Readonly<{
  routeId: 'bridgetown-red-jackdaw';
  portId: 'bridgetown';
  bearingLabel: 'East by north';
  windLabel: 'Fresh trade wind from ENE';
  start: SailingCheckpoint;
  contact: SailingCheckpoint;
  returnCost: { elapsedDays: 1; provisionsUsed: 1 };
}>;

// content/naval.ts — Task 1
export interface RedJackdawBattleArgs {
  battleId: string;
  seed: number;
  player: Omit<NavalShipInput, 'id' | 'position' | 'heading'>;
}
export function createRedJackdawBattleInput(args: RedJackdawBattleArgs): NavalBattleInput;

// domain/naval/resolution.ts — Task 1
export type NavalResolutionValidation =
  | { ok: true; value: NavalResolution }
  | { ok: false; issues: string[] };
export function summarizeNavalResolution(state: NavalState): NavalResolution;
export function validateNavalResolution(
  input: NavalBattleInput,
  value: unknown,
): NavalResolutionValidation;

// domain/voyage.ts — Task 2
export type VoyageReadiness =
  | { kind: 'ready'; requiredProvisions: 2 }
  | { kind: 'blocked'; reason: VoyageBlockedReason; requiredProvisions: 2 };
export type VoyageBlockedReason =
  | 'not-in-bridgetown'
  | 'lead-not-active'
  | 'target-defeated'
  | 'flagship-unavailable'
  | 'insufficient-provisions';
export function voyageReadiness(state: CampaignStateV1): VoyageReadiness;
export function voyageStartedDraft(state: CampaignStateV1): CampaignEventDraftFor<'voyage-started'>;
export function seaLegCompletedDraft(state: CampaignStateV1): CampaignEventDraftFor<'sea-leg-completed'>;
export function encounterAvoidedDraft(state: CampaignStateV1): CampaignEventDraftFor<'encounter-avoided'>;
export function navalEngagedDraft(state: CampaignStateV1): CampaignEventDraftFor<'naval-engaged'>;
export function battleWithdrawnDraft(state: CampaignStateV1): CampaignEventDraftFor<'battle-withdrawn'>;
export function navalResolvedDraft(
  state: CampaignStateV1,
  resolution: NavalResolution,
): CampaignEventDraftFor<'naval-resolved'>;
export function voyageBlockedCopy(reason: VoyageBlockedReason): string;

// state/useCaribbean.ts — Task 3
setSail(): Promise<CampaignDispatchOutcome>;
completeSeaLeg(): Promise<CampaignDispatchOutcome>;
avoidEncounter(): Promise<CampaignDispatchOutcome>;
engageEncounter(): Promise<CampaignDispatchOutcome>;
withdrawBattle(): Promise<CampaignDispatchOutcome>;
resolveBattle(resolution: NavalResolution): Promise<CampaignDispatchOutcome>;

// components/battle/NavalBattlePage.tsx — Task 5
export interface NavalResultAction {
  label: string;
  busy: boolean;
  activate(state: NavalState): void;
}
export interface NavalExitAction {
  label: string;
  busy: boolean;
  activate(): void;
}
// Add optional resultAction / exitAction props; existing Battle Lab defaults stay restart-only.

// state/naval/NavalSession.ts — Task 5
setPaused(value: boolean): void;
```

## Shared-File and Interface Conflict Table

| Tasks | Shared surface | Producer / ordering ruling |
| --- | --- | --- |
| 1 -> 2 | `createRedJackdawBattleInput`, `NavalResolution` | Task 1 owns names/shapes and commits first; Task 2 imports them unchanged. |
| 1 -> 5 | `NavalResolution`, naval rule helpers | Task 5 consumes terminal projection; it does not add campaign rules to `NavalBattlePage`. |
| 2 -> 3 | six voyage draft helpers | Task 2 owns all predecessor/RNG/input semantics; Task 3 only delegates. |
| 2 -> 4 | readiness/copy, accepted modes, `lastVoyage` | Task 4 renders selectors and state; no UI copy of eligibility logic. |
| 2 -> 6 | events/replay/compaction | Task 6 exercises the committed union and cannot rename payloads. |
| 3 -> 4 | controller action methods, `busy` | Task 3 commits before buttons are enabled. |
| 3 -> 5 | `withdrawBattle` / `resolveBattle` | Task 5 uses the same writer-safe methods, never raw `dispatch`. |
| 4 <-> 5 | `CampaignNavalBattle.tsx`, `CaribbeanPage.tsx` | Task 4 owns complete mode routing, lazy CSS/input/session/disposal; Task 5 extends only result/exit/pause props and safe-return behavior. |
| 4 -> 7 | sailing/encounter test IDs and screenshots | Task 4 locks IDs; evidence drives them without alternate hooks. |
| 5 -> 7 | result/withdraw/reload test IDs and lazy assets | Task 5 locks behavior; evidence measures it. |
| 6 -> 7 | evidence schema v3/evaluator/screenshot list | Task 6 owns fail-closed schema; Task 7 only produces accepted bytes through the script. |
| 1,2,3 | `domain/events.ts`, reducer, validator | Sequential only. Task 1 does not edit campaign events; Task 2 owns the complete union; Task 3 does not edit it. |
| 4,5 | `CaribbeanPage.tsx` | Task 4 creates all four-mode routing with a lazy import target; Task 5 may adjust only the lazy naval props/tests. Review Task 5 diff against Task 4 HEAD. |
| 6,7 | `scripts/caribbean-port-check.mjs`, metrics/screenshots | Task 6 changes evaluator/script structure without committed generated bytes; Task 7 runs it and owns evidence bytes/docs. |

No tasks may run in parallel against these shared surfaces. Independent review can reject each commit without invalidating a sibling task.

## Execution Preflight

- [ ] Confirm worktree, branch, base, and clean tracked status.

  Run:

  ```bash
  pwd
  git branch --show-current
  git rev-parse HEAD
  git status --short
  ```

  Expected: the specified worktree, `codex/caribbean-game`, `afdb53c5aa197401313917d65d5d5677aaf8a97a`, and no output from status.

- [ ] Create ignored SDD ledger `.superpowers/sdd/2026-08-24-caribbean-strategic-sailing/progress.md` and record the spec/plan commit, task base/head, RED/GREEN commands, review findings, and fixes. Do not stage `.superpowers/sdd`.

- [ ] Run the baseline gates serially and record exact counts/output.

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  mise exec node@20 -- npm run caribbean:naval-check
  ```

  Expected: all exit 0; only the repository's documented warning-only diagnostics may remain.

---

### Task 1: Define the Authored Voyage and Naval Resolution Boundary

**Files:**

- Create: `src/games/caribbean/content/voyage.ts`
- Create: `src/games/caribbean/content/voyage.test.ts`
- Modify: `src/games/caribbean/content/naval.ts`
- Modify: `src/games/caribbean/content/content.test.ts`
- Modify: `src/games/caribbean/domain/naval/createBattle.test.ts`
- Create: `src/games/caribbean/domain/naval/resolution.ts`
- Create: `src/games/caribbean/domain/naval/resolution.test.ts`
- Modify: `src/games/caribbean/domain/naval/outcomes.ts`
- Modify: `src/games/caribbean/domain/naval/outcomes.test.ts`
- Modify: `src/games/caribbean/domain/naval/types.ts`

**Interfaces:** Produces `RED_JACKDAW_VOYAGE`, `createRedJackdawBattleInput`, `NavalResolution`, `NavalDecisiveFact`, `summarizeNavalResolution`, and `validateNavalResolution` exactly as declared above. Consumes existing `BATTLE_LAB_INPUT`, `NavalState`, `validateNavalState`, `evaluateOutcome`, `nextSeed`, and sloop limits.

- [ ] **Step 1: Write route and shared-input RED tests**

  Add literal expectations that catch changed cost/checkpoint/wind/opponent facts and prove the lab uses the builder:

  ```ts
  expect(RED_JACKDAW_VOYAGE).toEqual({
    routeId: 'bridgetown-red-jackdaw',
    portId: 'bridgetown',
    bearingLabel: 'East by north',
    windLabel: 'Fresh trade wind from ENE',
    start: { tick: 0, position: { x: 0, z: 0 }, heading: Math.PI / 2, elapsedDays: 0, provisionsUsed: 0 },
    contact: { tick: 3_600, position: { x: 24, z: 4 }, heading: Math.PI / 2, elapsedDays: 1, provisionsUsed: 1 },
    returnCost: { elapsedDays: 1, provisionsUsed: 1 },
  });

  const input = createRedJackdawBattleInput({
    battleId: 'voyage-3-battle',
    seed: 0x1234_5678,
    player: {
      stableShipId: 'mistral', name: 'Mistral', classId: 'sloop',
      hull: 91, sails: 82, crew: 50, cannon: 8,
    },
  });
  expect(input).toMatchObject({
    battleId: 'voyage-3-battle', seed: 0x1234_5678,
    windFrom: Math.PI / 3, windStrength: 1, arenaRadius: 92,
    timeLimitTicks: 14_400, objective: 'capture-red-jackdaw',
    player: { id: 'player', position: { x: 0, z: -36 }, heading: 0, hull: 91 },
    opponent: { id: 'opponent', stableShipId: 'red-jackdaw', position: { x: 0, z: 36 }, heading: Math.PI },
  });
  ```

- [ ] **Step 2: Capture the expected RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/content/voyage.test.ts src/games/caribbean/content/content.test.ts src/games/caribbean/domain/naval/createBattle.test.ts
  ```

  Expected: missing `content/voyage` and missing `createRedJackdawBattleInput`; no production file has changed.

- [ ] **Step 3: Implement frozen route and single input builder**

  Add the exact route object and builder. Recreate `BATTLE_LAB_INPUT` by calling the builder with battle ID `battle-lab-red-jackdaw`, seed `1702`, and its existing 100/100/52/8 lab player. Deep-create positions on every call and keep `validateNavalInput(BATTLE_LAB_INPUT)` green.

- [ ] **Step 4: Write terminal-summary RED tests before resolution code**

  Use literal terminal fixtures for all branches. Each test first passes `validateNavalState`, then asserts semantic output and rejection mutations:

  ```ts
  const summary = summarizeNavalResolution(boardingReadyState);
  expect(summary).toEqual({
    battleId: 'battle-lab-red-jackdaw',
    outcome: { kind: 'boarding-ready', victorShipId: 'player' },
    atTick: boardingReadyState.tick,
    seedAfter: boardingReadyState.seed,
    player: { hull: 100, sails: 100, crew: 50, cannon: 8 },
    opponent: { hull: 64, sails: 24, crew: 16, cannon: 6 },
    decisive: {
      kind: 'boarding-ready', victorShipId: 'player',
      range: 6, relativeSpeed: 1, targetSails: 24,
      targetCrew: 16, playerCrew: 50,
    },
  });
  expect(validateNavalResolution(boardingReadyState.input, summary)).toEqual({ ok: true, value: summary });
  expect(validateNavalResolution(boardingReadyState.input, {
    ...summary,
    decisive: { ...summary.decisive, range: 8 },
  })).toMatchObject({ ok: false });
  ```

  Cover player/opponent surrender and sink, boarding-ready, player/opponent escape, separation, exact keys, finite/integer bounds, battle mismatch, nonterminal state, and input immutability.

- [ ] **Step 5: Capture resolution RED and implement minimum GREEN**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval/resolution.test.ts src/games/caribbean/domain/naval/outcomes.test.ts
  ```

  Expected: missing resolution module or exports.

  Export naval-owned decisive-fact helpers/constants from `outcomes.ts` only where `resolution.ts` needs them. Validate by reconstructing each exact fact through those helpers; do not copy numeric thresholds into campaign files.

- [ ] **Step 6: Mutation proof, focused GREEN, review, and commit**

  Temporarily make boarding range validation accept `8`; the range mutation case must fail. Restore it. Temporarily change the builder's opponent heading from `Math.PI`; the literal builder case must fail. Restore it.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/content src/games/caribbean/domain/naval
  mise exec node@20 -- npm run typecheck
  git diff --check
  ```

  Inspect only Task 1's diff. Commit:

  ```bash
  git add src/games/caribbean/content/voyage.ts src/games/caribbean/content/voyage.test.ts src/games/caribbean/content/naval.ts src/games/caribbean/content/content.test.ts src/games/caribbean/domain/naval
  git commit -m "feat(caribbean): define strategic voyage contracts"
  ```

---

### Task 2: Add Replayable Campaign Voyage Transitions

**Files:**

- Create: `src/games/caribbean/domain/voyage.ts`
- Create: `src/games/caribbean/domain/voyage.test.ts`
- Modify: `src/games/caribbean/domain/types.ts`
- Modify: `src/games/caribbean/domain/events.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.ts`
- Modify: `src/games/caribbean/domain/reduceCampaign.test.ts`
- Modify: `src/games/caribbean/domain/replay.test.ts`
- Modify: `src/games/caribbean/domain/validateCampaign.ts`
- Modify: `src/games/caribbean/domain/validateCampaign.test.ts`
- Modify: `src/games/caribbean/domain/compactJournal.test.ts`
- Modify: `src/games/caribbean/domain/leadSelectors.ts`
- Modify: `src/games/caribbean/domain/leadSelectors.test.ts`
- Modify: `src/games/caribbean/storage/schema.test.ts`
- Modify: `src/games/caribbean/storage/persistence.test.ts`
- Modify: `src/games/caribbean/storage/recovery.test.ts`
- Verify unchanged: `src/games/caribbean/storage/migrations.ts`

**Interfaces:** Consumes Task 1 route/input/resolution and existing journal/storage contracts. Produces the six event variants, optional `world.lastVoyage`, readiness/copy/draft helpers, strict mode validators, and reducer behavior in the spec.

- [ ] **Step 1: Write readiness and draft-helper RED tests**

  Use hand-authored state mutations and exact results:

  ```ts
  const state = activeLeadCampaign();
  expect(voyageReadiness(state)).toEqual({ kind: 'ready', requiredProvisions: 2 });
  expect(voyageStartedDraft(state)).toEqual({
    type: 'voyage-started',
    payload: { voyageId: `voyage-${state.lastEventId + 1}` },
  });
  ```

  Table-test the five blocked reasons in the locked priority order, exact player copy, a one-provision boundary, nonzero checkpoint `lastEventId`, and no mutation. For each test record the production branch it would catch.

- [ ] **Step 2: Capture readiness RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/voyage.test.ts
  ```

  Expected: missing `domain/voyage`.

- [ ] **Step 3: Add event-shape and validator RED tests**

  Extend `validateCampaignEvent` tables with exact valid fixtures and one malformed fixture per field. Extend `validateCampaign` with literal valid `sailing`, `encounter`, and `naval` states plus wrong checkpoint ranges, mismatched wrapper/input battle IDs, mismatched flagship input facts, unknown/extra keys, and the still-invalid reserved modes.

  Add optional `lastVoyage` cases for every result, outcome/result mismatch, invalid returned day, unknown keys, and legacy `world` without the field.

- [ ] **Step 4: Capture event/mode RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/validateCampaign.test.ts src/games/caribbean/domain/reduceCampaign.test.ts
  ```

  Expected: non-port modes still fail with `mode.kind:unknown-id`; new event types fail with `type:unknown-id`.

- [ ] **Step 5: Implement event syntax and pure transition helpers**

  Add strict exact-key validation for each payload. The helpers must derive these facts:

  ```ts
  const navigationAfter = nextSeed(state.rng.navigation);
  const navalAfter = nextSeed(state.rng.naval);
  const encounterId = `${mode.voyageId}-contact`;
  const battleId = `${mode.voyageId}-battle`;
  ```

  `navalEngagedDraft` calls `createRedJackdawBattleInput` with the current flagship snapshot and `seed: navalAfter`. Reject the helper call with a stable domain error when the predecessor mode/readiness is wrong; never coerce.

- [ ] **Step 6: Write full sequence RED tests**

  Build two literal streams through `appendJournal`:

  ```ts
  const departed = appendJournal(activeLeadJournal, voyageStartedDraft(activeLeadJournal.state));
  const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
  const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
  const returned = appendJournal(engaged, navalResolvedDraft(engaged.state, playerVictoryResolution));

  expect(returned.state.mode).toEqual({ kind: 'port', portId: 'bridgetown' });
  expect(returned.state.calendar.elapsedDays).toBe(2);
  expect(returned.state.fleet.ships[0].cargo.provisions).toBe(32);
  expect(returned.state.world.targetDefeated).toBe(true);
  expect(returned.state.world.lastVoyage).toEqual({
    voyageId: departed.state.mode.kind === 'sailing' ? departed.state.mode.voyageId : '',
    battleId: engaged.state.mode.kind === 'naval' ? engaged.state.mode.battleId : null,
    result: 'victory',
    outcome: { kind: 'boarding-ready', victorShipId: 'player' },
    returnedDay: 2,
  });
  expect(returned.state.fleet.ships[0]).toMatchObject({
    hull: activeLeadJournal.state.fleet.ships[0].hull,
    sails: activeLeadJournal.state.fleet.ships[0].sails,
    crew: activeLeadJournal.state.fleet.ships[0].crew,
    cannon: activeLeadJournal.state.fleet.ships[0].cannon,
    cargo: { ...activeLeadJournal.state.fleet.ships[0].cargo, provisions: 32 },
  });
  ```

  Add avoid, withdraw, player defeat, player/opponent escape, separation, lead expiry on return, matching-ID/RNG/checkpoint/input rejection, event-ID exhaustion, and every prior input immutable. Victory alone completes the lead and target.

- [ ] **Step 7: Implement reducer branches and capture GREEN**

  Use small private functions `spendVoyageCost`, `returnToBridgetown`, and `classifyResolution` inside `reduceCampaign.ts`. `returnToBridgetown` must set `mode`, calendar, provisions, optional summary, lead completion/expiry, and `lastEventId` before one final `validateCampaign` call. Do not apply tactical damage to `fleet`.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/voyage.test.ts src/games/caribbean/domain/reduceCampaign.test.ts src/games/caribbean/domain/validateCampaign.test.ts
  ```

  Expected: all pass with no stderr.

- [ ] **Step 8: Add replay, compaction, save, and recovery compatibility tests**

  Assert canonical replay equality for avoid and battle streams; compact after return; append a new voyage from the compacted nonzero event ID; parse a hand-built legacy V1 raw envelope with no `lastVoyage`; save it unchanged before mutation; append departure and verify its old raw becomes `previous`; load valid sailing/encounter/naval snapshots; recover a prior naval snapshot after current corruption; preserve unknown future versions.

  Verify `migrateSaveEnvelope` remains identity and receives no source edit.

- [ ] **Step 9: Mutation proof, complete GREEN, review, and commit**

  Kill/restore navigation RNG assignment, return provision subtraction, battle-ID comparison, final replay equality, and optional legacy `lastVoyage` acceptance. Each named test must fail for the intended reason.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain src/games/caribbean/storage
  mise exec node@20 -- npm run typecheck
  git diff --check
  git diff --exit-code -- src/games/caribbean/storage/migrations.ts
  ```

  Commit:

  ```bash
  git add src/games/caribbean/domain src/games/caribbean/storage/schema.test.ts src/games/caribbean/storage/persistence.test.ts src/games/caribbean/storage/recovery.test.ts
  git commit -m "feat(caribbean): add replayable voyage transitions"
  ```

---

### Task 3: Orchestrate Persisted Voyage Actions

**Files:**

- Modify: `src/games/caribbean/state/useCaribbean.ts`
- Modify: `src/games/caribbean/state/useCaribbean.test.tsx`
- Modify: `src/games/caribbean/state/selectors.ts`
- Modify: `src/games/caribbean/state/selectors.test.ts`
- Modify: `src/games/caribbean/state/runtime.ts`
- Modify: `src/games/caribbean/state/runtime.test.ts`

**Interfaces:** Consumes Task 2 helper functions and existing `dispatch`. Produces the six named controller methods. Runtime build changes from `caribbean-port-1` to exact `caribbean-sailing-1`; no storage key/version changes.

- [ ] **Step 1: Write named-action RED tests**

  For persisted and memory-only controllers, run each legal action and assert exactly one event, exact mode, event ID, save call count, busy guard, and returned `CampaignDispatchOutcome`. Spy on the pure helper only through observable event/state; do not assert a mock button exists.

  ```ts
  await act(() => result.current.setSail());
  expect(result.current.journal?.events.at(-1)).toMatchObject({
    id: 2,
    type: 'voyage-started',
    payload: { voyageId: 'voyage-2' },
  });
  expect(result.current.journal?.state.mode).toMatchObject({ kind: 'sailing', voyageId: 'voyage-2' });
  ```

  Seed fixtures through real `appendJournal`/`saveCampaign`; do not partially mock journal/store side effects.

- [ ] **Step 2: Capture controller RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state/useCaribbean.test.tsx src/games/caribbean/state/selectors.test.ts
  ```

  Expected: controller methods do not exist and runtime build literal differs.

- [ ] **Step 3: Implement one delegation helper**

  Inside the hook, add:

  ```ts
  const dispatchFromState = useCallback(async (
    createDraft: (state: CampaignStateV1) => CampaignEventDraft,
  ): Promise<CampaignDispatchOutcome> => {
    const active = journalRef.current;
    if (active === null || busyRef.current) return { kind: 'not-applied' };
    return dispatch(createDraft(active.state));
  }, [dispatch]);
  ```

  Bind every action directly to its Task 2 helper:

  ```ts
  const setSail = () => dispatchFromState(voyageStartedDraft);
  const completeSeaLeg = () => dispatchFromState(seaLegCompletedDraft);
  const avoidEncounter = () => dispatchFromState(encounterAvoidedDraft);
  const engageEncounter = () => dispatchFromState(navalEngagedDraft);
  const withdrawBattle = () => dispatchFromState(battleWithdrawnDraft);
  const resolveBattle = (resolution: NavalResolution) => (
    dispatchFromState((state) => navalResolvedDraft(state, structuredClone(resolution)))
  );
  ```

  Do not copy save/revision/memory logic.

- [ ] **Step 4: Add failure and exact-once RED/GREEN cases**

  Cover same-tick double activation, deferred Web Lock, denied lock, write failure, consent then memory-only, save conflict, retry, runtime generation replacement, stale promise completion, duplicate terminal resolution, and external reload. Exact expected behavior: at most one legal successor event; failures return `not-applied` until the existing consent path publishes its candidate.

  Verify no save occurs from controller construction/resume alone for a saved naval snapshot.

- [ ] **Step 5: Mutation proof, verification, review, and commit**

  Temporarily bypass `busyRef` in `dispatchFromState`; the deferred double-activation case must fail. Restore it. Temporarily call `appendJournal` directly in `resolveBattle`; the storage-failure case must fail. Restore it.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state src/games/caribbean/storage/writer.test.ts
  mise exec node@20 -- npm run typecheck
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/state
  git commit -m "feat(caribbean): orchestrate persisted voyage actions"
  ```

---

### Task 4: Enable Set Sail and Build the Authored Sea/Encounter Screens

**Files:**

- Create: `src/games/caribbean/components/voyage/SailingPage.tsx`
- Create: `src/games/caribbean/components/voyage/SailingPage.test.tsx`
- Create: `src/games/caribbean/components/voyage/EncounterPage.tsx`
- Create: `src/games/caribbean/components/voyage/EncounterPage.test.tsx`
- Create: `src/games/caribbean/components/voyage/VoyageInstrument.tsx`
- Create: `src/games/caribbean/components/voyage/VoyageInstrument.test.tsx`
- Create: `src/games/caribbean/components/voyage/CampaignNavalBattle.tsx`
- Create: `src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx`
- Create: `src/games/caribbean/styles/voyage.css`
- Create: `src/games/caribbean/styles/voyageResponsive.test.tsx`
- Modify: `src/games/caribbean/components/port/PortMenu.tsx`
- Modify: `src/games/caribbean/components/port/PortMenu.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Modify: `src/games/caribbean/components/log/CaptainsLog.tsx`
- Modify: `src/games/caribbean/components/log/CaptainsLog.test.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Modify: `src/games/caribbean/styles/production.css`

**Interfaces:** Consumes controller Task 3, readiness/copy/state Task 2, and existing `MinimumScreenGate`. Produces stable test IDs `port-action-set-sail`, `voyage-continue-east`, `encounter-avoid`, `encounter-pursue`, `voyage-status`, `voyage-instrument`, and `captains-log-last-voyage`.

- [ ] **Step 1: Write Port Set Sail RED tests**

  Change `PortMenu` props to receive readiness, busy, and `onSetSail`. Assert disabled reason for every selector code; active lead/two-provision boundary enables; click and Enter call once; busy prevents duplicates; active port activities still use exact order/focus.

  ```tsx
  render(<PortMenu
    activeActivity="menu"
    readiness={{ kind: 'ready', requiredProvisions: 2 }}
    busy={false}
    onSetSail={onSetSail}
    onSelect={onSelect}
  />);
  expect(screen.getByTestId('port-action-set-sail')).toBeEnabled();
  await user.click(screen.getByTestId('port-action-set-sail'));
  expect(onSetSail).toHaveBeenCalledTimes(1);
  ```

- [ ] **Step 2: Write voyage and encounter RED tests**

  `SailingPage` must show Bridgetown, exact bearing/wind, 1-day/1-provision outbound consequence, current total provisions, and one Continue east action. `EncounterPage` must focus its heading and state exact consequences: Avoid spends the guaranteed return cost and keeps the lead; Pursue enters the two-to-four-minute duel. Buttons synchronously guard pending calls and announce applied/not-applied.

  The route SVG must be `aria-hidden`; semantic text must contain the same facts.

- [ ] **Step 3: Capture component RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/port/PortMenu.test.tsx src/games/caribbean/components/port/PortPage.test.tsx src/games/caribbean/components/voyage src/games/caribbean/components/CaribbeanPage.test.tsx
  ```

  Expected: missing voyage components and Set Sail remains disabled.

- [ ] **Step 4: Implement mode routing and compact historical composition**

  `CaribbeanPage` routes `port`, `sailing`, and `encounter` synchronously. Declare the naval branch with:

  ```ts
  const CampaignNavalBattle = lazy(() => import('./voyage/CampaignNavalBattle'));
  ```

  Create `CampaignNavalBattle` as a narrow saved-input adapter: assert naval mode, call `useNavalSession(mode.input)`, render the unchanged `NavalBattlePage`, and import `../../styles/battle.css` from this lazy module. At this task boundary the existing terminal rematch remains available; Task 5 replaces that terminal action additively with campaign return. Assert the campaign journal receives no event while this session ticks and unmount disposes it. Wrap only the naval branch in `Suspense` with a labelled `Loading the engagement…` status.

  Build the voyage page from the spec's six existing tokens/type roles. The full-screen sea/sky uses broad local CSS colour and one inline SVG one-mast silhouette/brass wake. Opaque Deep Keel/Harbour Glass backplates carry text. Under reduced motion the wake renders complete with no animation.

- [ ] **Step 5: Add compacted outcome log**

  `CaptainsLog` reads `state.world.lastVoyage` and derives one concise authored result line plus returned day. It retains the Red Jackdaw lead card. Exact examples:

  ```text
  Avoided contact · Returned to Bridgetown on day 2.
  Victory — Red Jackdaw surrendered · Returned on day 4.
  Withdrawn from battle · Returned on day 4.
  ```

  Outcome text is derived from codes and `NavalOutcome`; no event prose or battle thresholds are recreated.

- [ ] **Step 6: CSS/accessibility RED and GREEN**

  Static CSS tests require fixed full-screen stage, minimum 44 px controls, 14 px copy, opaque decision backplates, safe-area padding, no outer horizontal overflow, reduced-motion override, no dominant production-grid background, and no portrait/phone override that bypasses `MinimumScreenGate`.

  At exact component view, verify heading focus after mode change, stable status node, focus-visible selector, no emoji, and no inaccessible SVG name duplication.

- [ ] **Step 7: Mutation proof, focused/full component verification, review, and commit**

  Kill/restore two-provision readiness rendering, swap pursue/avoid handlers, remove semantic wind text, and remove reduced-motion animation suppression. Each named test must fail.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components src/games/caribbean/styles
  mise exec node@20 -- npm run check
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/components/port src/games/caribbean/components/log src/games/caribbean/components/voyage src/games/caribbean/components/CaribbeanPage.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/styles/voyage.css src/games/caribbean/styles/voyageResponsive.test.tsx src/games/caribbean/styles/production.css
  git commit -m "feat(caribbean): open the Bridgetown sea route"
  ```

---

### Task 5: Connect the Existing Full-Bleed Battle and Safe Return

**Files:**

- Modify: `src/games/caribbean/components/voyage/CampaignNavalBattle.tsx`
- Modify: `src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/state/naval/NavalSession.ts`
- Modify: `src/games/caribbean/state/naval/NavalSession.test.ts`
- Modify: `src/games/caribbean/state/naval/useNavalSession.ts`
- Modify: `src/games/caribbean/state/naval/testSession.ts`
- Modify: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Modify: `src/games/caribbean/caribbean.integration.test.tsx`
- Modify: `src/games/caribbean/styles/battle.css`

**Interfaces:** Consumes saved `mode.input`, Task 1 summary, Task 3 controller actions, and Task 4's lazy `CampaignNavalBattle`. Produces additive `resultAction`, `exitAction`, `setPaused`, and safe-return behavior without changing the wrapper's default export.

- [ ] **Step 1: Write additive NavalBattlePage RED tests**

  Preserve every current rematch assertion. Add campaign-mode cases:

  ```tsx
  render(<NavalBattlePage
    session={terminalSession}
    sceneFactory={null}
    resultAction={{ label: 'Return to Bridgetown', busy: false, activate }}
    exitAction={{ label: 'Withdraw to Bridgetown', busy: false, activate: withdraw }}
  />);
  await user.click(screen.getByTestId('naval-result-action'));
  expect(activate).toHaveBeenCalledWith(terminalSession.getSnapshot().state);
  expect(terminalSession.restartCount).toBe(0);
  ```

  Assert synchronous busy guards, focus/inert/modal retention, default `naval-result-restart` in Battle Lab, withdraw inside Options, no withdrawal after terminal result, and no call from diagnostics.

- [ ] **Step 2: Write explicit pause/background RED tests**

  `NavalSession.setPaused(true)` freezes ticks and clears queued frame work; repeated `true` is idempotent; `false` resumes unless diagnostic/outcome. `NavalBattlePage` sets paused true on hidden visibility and does not auto-resume on visible. Existing Escape/toggle behavior remains.

- [ ] **Step 3: Capture battle/session RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state/naval/NavalSession.test.ts src/games/caribbean/components/battle/NavalBattlePage.test.tsx
  ```

  Expected: missing `setPaused`, `resultAction`, and `exitAction` contracts.

- [ ] **Step 4: Implement additive session/page behavior**

  Implement:

  ```ts
  setPaused(value: boolean): void {
    if (this.#diagnostic || this.#state.outcome || this.#paused === value) return;
    this.#paused = value;
    this.#runner.reset();
    this.#publish(true);
  }

  togglePause(): void {
    this.setPaused(!this.#paused);
  }
  ```

  The terminal action receives the page's already-published terminal state. Clone before crossing the prop boundary. Rename the test ID to `naval-result-action` only when a custom result action exists; default keeps `naval-result-restart` so harness evidence does not drift unnecessarily.

- [ ] **Step 5: Write CampaignNavalBattle RED tests**

  Use real `summarizeNavalResolution` and a complete manual session. Assert:

  - session input canonical JSON equals saved `mode.input`;
  - ticks and controller journal remain unchanged relative to each other while battle runs;
  - terminal click summarizes once and calls `resolveBattle` once;
  - invalid summary leaves campaign naval and offers restart/withdraw;
  - withdraw calls `withdrawBattle` once;
  - not-applied result retains the modal and announces `Battle result was not saved.`;
  - applied result is allowed to unmount via parent mode change;
  - copy states reload starts at first contact; and
  - unmount disposes the session/audio/scene through existing hooks.

- [ ] **Step 6: Extend the lazy campaign wrapper**

  `CampaignNavalBattle` receives `{ controller }`, asserts `journal.state.mode.kind === 'naval'`, calls `useNavalSession(mode.input)`, and renders the unchanged full-bleed page. It retains `../../styles/battle.css` in the lazy module, not in `CaribbeanPage`, port, or non-naval voyage modules.

  Use a ref-backed in-flight guard around summarize/resolve and withdraw. Catch a thrown resolution validation error into a visible status; never pass malformed data to the controller.

- [ ] **Step 7: Production routing/reload tests**

  Extend `CaribbeanPage.test.tsx` with saved naval journals. Resume mounts the lazy campaign battle at tick zero from exact input; remount constructs a fresh session with the same input; no auto-dispatch occurs; unsupported `MinimumScreenGate` prevents lazy module/session construction.

  Extend `caribbean.integration.test.tsx` before completing the wrapper with the real component/controller journey:

  ```text
  setup -> mark lead -> Set Sail -> reload sailing -> Continue east
  -> Avoid -> port -> Set Sail -> Continue east -> Pursue
  -> saved naval input -> terminal real-domain result -> Return
  -> reload port -> Captain's Log
  ```

  Capture RED while `CampaignNavalBattle` still has only its Task 4 rematch action: the journey cannot return a terminal result to the campaign. After GREEN, assert exact event types/order/IDs, days, provisions, RNG transitions, mode sequence, one `naval-resolved`, no campaign write during ticks, completed lead, disabled Set Sail, and canonical save/reload equality. A second fixture covers battle withdrawal and retained active lead.

- [ ] **Step 8: Mutation proof, focused/full battle GREEN, review, and commit**

  Kill/restore terminal in-flight guard, clone boundary, hidden pause call, and lazy CSS ownership. Tests must catch duplicate resolve, mutable input leak, hidden ticking, and eager battle import.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/battle src/games/caribbean/components/voyage src/games/caribbean/state/naval src/games/caribbean/components/CaribbeanPage.test.tsx
  mise exec node@20 -- npm run check
  mise exec node@20 -- npm run build
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/components/voyage/CampaignNavalBattle.tsx src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx src/games/caribbean/components/battle/NavalBattlePage.tsx src/games/caribbean/components/battle/NavalBattlePage.test.tsx src/games/caribbean/state/naval src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx src/games/caribbean/styles/battle.css
  git commit -m "feat(caribbean): connect campaign naval return"
  ```

---

### Task 6: Define the Integrated Route and Fail-Closed Evidence Contract

**Files:**

- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `scripts/caribbean-port-check.mjs`

**Interfaces:** Consumes all production interfaces. Produces port evidence schema version 3 with exact new `strategicSailing` and revised `isolation` branches, plus the exact screenshot manifest used by Task 7. Does not commit generated metrics/PNG bytes.

- [ ] **Step 1: Define exact schema-v3 evaluator tests**

  Extend raw and normalized evaluator fixtures with:

  ```js
  strategicSailing: {
    status: 'verified',
    modeSequence: ['port', 'sailing', 'encounter', 'port', 'sailing', 'encounter', 'naval', 'port'],
    eventTypes: ['lead-accepted', 'voyage-started', 'sea-leg-completed', 'encounter-avoided', 'voyage-started', 'sea-leg-completed', 'naval-engaged', 'naval-resolved'],
    outbound: { elapsedDays: 1, provisionsUsed: 1 },
    return: { elapsedDays: 1, provisionsUsed: 1 },
    rng: { navigationTransitionsVerified: true, navalTransitionVerified: true, worldUnchanged: true },
    navalInput: { persistedBeforeMount: true, byteEqualAfterReload: true, tickAfterReload: 0 },
    resolution: { exactlyOnce: true, campaignWritesDuringBattle: 0, returnedTo: 'bridgetown' },
    recovery: { intermediateModeRecovered: true, unreadableBytesPreserved: true },
  }
  ```

  Add exact fields for focus, min text/target, contrast, overflow, viewport, requests, fallback, screenshot names, and lazy isolation. The evaluator rejects unknown/missing keys, false verification, wrong sequence/count, premature naval requests, harness markers, nondeterminism, and screenshots outside the exact set.

- [ ] **Step 2: Capture evaluator RED and implement structure**

  Run:

  ```bash
  node --test scripts/lib/caribbean-port-identity-evidence.test.mjs
  ```

  Expected: schema 3 fixtures are rejected by the current schema-2 evaluator.

  Update the evaluator and script structure. Keep every schema-2 browser/route/build/viewport/fixture/Web-Lock/journey/accessibility/request/failure/profile/art/market/recovery/determinism field. Revise isolation to distinguish emitted/precacheable from requested-before-pursuit.

- [ ] **Step 3: Add deterministic browser commands without test-only campaign victory**

  The browser script may use the existing naval debug bridge only in the independent harness gate, not the normal route. For the normal route, drive real UI commands into the real naval session. Add a deterministic command sequence derived from `domain/naval/replay` fixture commands through visible keyboard controls; the expected result must be a real `NavalOutcome`.

  If the route needs observability, expose a build-neutral read-only `data-*`/DOM status already useful to the player. Do not attach a normal-route debug global or outcome setter.

- [ ] **Step 4: Lock screenshot and isolation manifest**

  Add exact files:

  ```text
  sailing-desktop.png
  encounter-desktop.png
  campaign-battle-desktop.png
  campaign-result-desktop.png
  returned-log-desktop.png
  sailing-minimum-supported.png
  campaign-battle-fallback.png
  sailing-large-portrait-notice.png
  ```

  Preserve all current screenshot files. Assert initial setup/port/sailing/avoid requests exclude naval chunk/CSS/GLB; pursue requests hashed local naval assets; normal source contains no harness modules; harness build remains isolated.

- [ ] **Step 5: Mutation proof, focused verification, review, and commit**

  Mutate raw fixtures for duplicated resolution, changed mode order, `tickAfterReload: 1`, a naval request on avoid, missing prior v2 field, unknown nested key, and false recovery preservation. Each must return a failed verdict without throwing.

  Run:

  ```bash
  node --test scripts/lib/caribbean-port-identity-evidence.test.mjs
  node --check scripts/caribbean-port-check.mjs
  mise exec node@20 -- npm run check
  git diff --check
  ```

  Commit only source/schema/test changes:

  ```bash
  git add scripts/caribbean-port-check.mjs scripts/lib/caribbean-port-identity-evidence.mjs scripts/lib/caribbean-port-identity-evidence.test.mjs
  git commit -m "test(caribbean): define sailing evidence gate"
  ```

---

### Task 7: Record Browser Evidence and Close the Package

**Files:**

- Modify: `docs/games/caribbean-career/README.md`
- Modify: `docs/screenshots/caribbean-port/metrics.json`
- Create: `docs/screenshots/caribbean-port/sailing-desktop.png`
- Create: `docs/screenshots/caribbean-port/encounter-desktop.png`
- Create: `docs/screenshots/caribbean-port/campaign-battle-desktop.png`
- Create: `docs/screenshots/caribbean-port/campaign-result-desktop.png`
- Create: `docs/screenshots/caribbean-port/returned-log-desktop.png`
- Create: `docs/screenshots/caribbean-port/sailing-minimum-supported.png`
- Create: `docs/screenshots/caribbean-port/campaign-battle-fallback.png`
- Create: `docs/screenshots/caribbean-port/sailing-large-portrait-notice.png`
- Refresh only if bytes changed through the gate: existing `docs/screenshots/caribbean-port/*.png`
- Report only, ignored: `.superpowers/sdd/2026-08-24-caribbean-strategic-sailing/task-7-report.md`

**Interfaces:** Consumes Task 6 gate. Produces deterministic schema-v3 evidence bytes and package documentation. No production source change belongs in this task; a browser-discovered defect returns to its owning task with a new RED test and separate fix commit.

- [ ] **Step 1: Run focused and full automated gates fresh**

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  ```

  Read full output and record file/test counts, zero failures, and warning classification.

- [ ] **Step 2: Run normal-route evidence twice through its command**

  ```bash
  mise exec node@20 -- npm run caribbean:port-check
  ```

  Expected: schema version 3 accepted; every old and new screenshot/metric is byte-identical across two clean runs; exact event/mode/RNG/input/resolution/recovery assertions pass; no console/page/request failure.

- [ ] **Step 3: Prove independent harness and normal/harness isolation**

  ```bash
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check
  ```

  Expected: Battle Lab still passes its full-bleed/handedness/fallback/resource gate. Inspect normal `dist` and evidence to confirm only production lazy naval assets are present and no harness entry/debug/config marker ships.

- [ ] **Step 4: Inspect every changed screenshot at original resolution**

  Inspect 1440x900, 1180x820, 1024x768, exact 960x600, HTML fallback, and portrait notice. Verify: historical one-mast silhouette; sea-dominant composition; functional brass route line; compact modern controls; exact consequences; no clipping/overlap/scroll; readable focus; full-bleed battle unchanged; result/return action clear; Captain's Log outcome; unsupported notice only.

  Record observations as engineering visual review. Do not label human comprehension, touch quality, Safari, or target-iPad performance observed.

- [ ] **Step 5: Update the career evidence ledger**

  In `README.md`, document the new command path, exact screenshots, reload semantics, safe-return/persistent-damage boundary, lazy production naval isolation, and remaining human/iPad evidence. Do not change the governing product dossier or claim the naval milestone is production-ready.

- [ ] **Step 6: Run fresh final verification and inspect the exact package diff**

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  mise exec node@20 -- npm run caribbean:naval-check
  git diff --check
  git status --short
  ```

  Verify no generated temporary directories, raw evidence traces, normal-route debug globals, untracked build artifacts, or unexplained files remain.

- [ ] **Step 7: Commit evidence and documentation**

  ```bash
  git add docs/games/caribbean-career/README.md docs/screenshots/caribbean-port
  git commit -m "test(caribbean): verify strategic sailing loop"
  ```

- [ ] **Step 8: Run cumulative zero-finding review**

  Review from plan execution base through Task 7 HEAD. Required topics: source-of-truth rule reuse; event/validator totality; RNG lineage; old-save compatibility; replay/compaction; writer conflicts/consent/recovery; no mutation during battle; terminal exactly-once; reload restart disclosure; session disposal; safe-return ruling; Set Sail readiness; a11y; lazy isolation; deterministic evidence; scope discipline.

  Any BLOCKER, MAJOR, or MINOR returns to the owning task with a new failing test and separate fix commit. Repeat fresh focused/full/browser verification after fixes. Package close requires zero findings and clean tracked status.

---

## Package Exit Criteria

The package is complete only when every statement is evidenced:

1. Set Sail has one canonical readiness oracle and exact actionable reason for every blocked state.
2. The accepted route enters saved `sailing`, consumes exactly one outbound day/provision, advances navigation RNG once, and enters the matching saved encounter.
3. Avoid and battle withdrawal spend the guaranteed return day/provision, journal a compact result, return safely, and retain the active lead unless it expires.
4. Pursuit advances naval RNG once and persists one input built through `createRedJackdawBattleInput` before a naval session mounts.
5. The production route uses the approved full-bleed battle without copied aim/boarding/outcome rules or campaign writes during ticks.
6. A terminal naval state is projected/validated inside the naval domain and becomes exactly one `naval-resolved` event only on Return to Bridgetown.
7. Victory alone completes the Red Jackdaw/target; avoid, withdraw, escape, separation, and defeat allow another attempt while the lead/provisions permit it.
8. Final tactical condition is journaled while the pre-battle flagship remains serviceable under the explicit safe-return rule; no half-built repair/capture system ships.
9. Pause freezes the live session; background leaves it paused; reload/unsupported resize disposes and restarts from identical saved input at tick zero with plain disclosure.
10. Replay from event zero and a nonzero compacted checkpoint yields canonical equality; `lastVoyage`, time, provisions, RNG, lead, target, and event ID survive compaction.
11. Existing V1 saves load byte-valid with no required migration; the first new save rotates old raw bytes normally; intermediate-mode recovery preserves unreadable data.
12. Landscape `>=960x600` works with 14 px/44 px/focus/contrast/overflow/reduced-motion guarantees; phones and portrait mount only the notice.
13. Normal setup/port/sailing/avoid does not request naval assets; pursuit loads only local production assets; no harness/debug module ships; Battle Lab remains independently green.
14. Schema-v3 normal-route metrics and all screenshots are byte-identical across two clean runs and fail closed on malformed/unknown evidence.
15. Focused tests, full tests, check, normal/harness builds, both browser gates, diff checks, task reviews, and cumulative review have fresh zero-failure evidence.
16. Human first-time and target-iPad Safari/touch/offline/thermal observations remain honestly unobserved unless actually performed.
17. Worktree is clean; no merge, push, rebase, fetch, or main change occurred.
