# Caribbean Strategic Sailing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic, saveable Bridgetown -> authored sea leg -> pursue/avoid contact -> existing naval battle -> journaled safe return loop on the normal Caribbean route.

**Architecture:** Persist each strategic phase in the existing campaign journal and create naval combat from one serialized `NavalBattleInput`; keep the 60 Hz `NavalSession` transient and campaign-immutable until withdrawal or a validated terminal result. Reuse the existing writer, rotating saves, recovery, full-bleed battle, and minimum-screen gate, while widening V1 validation only for already-reserved modes and one optional compacted outcome summary.

**Tech Stack:** TypeScript 5.6, React 18, Vitest 2, Testing Library, React Router 6, Web Locks, localStorage, Three.js 0.170, Vite 5, Playwright, CSS, and the existing canonical JSON/FNV-1a save stack. No new dependency is justified.

**Spec:** `docs/superpowers/specs/2026-08-24-caribbean-strategic-sailing-design.md`

## Global Constraints

- Work only in `/Users/marioflores/code/arcade/.worktrees/caribbean-game` on `codex/caribbean-game`. The code/product baseline is `afdb53c5aa197401313917d65d5d5677aaf8a97a`; the reviewed plan baseline is `0508a6227ee90c682f5812e3d9858f5cd20e337f`; implementation starts from the clean commit that most recently changed this plan (the docs-fix commit containing this revision), resolved and compared to `HEAD` by the exact preflight below. Do not merge, push, rebase, fetch, or touch `main`.
- Preserve `CampaignStateV1.schemaVersion: 1`, `contentVersion: 'caribbean-slice-1'`, save-envelope version 1, and storage keys `caribbean:campaign:current` / `caribbean:campaign:previous`.
- Existing V1 port saves and legacy `voyage` / `legend` values remain readable without a byte rewrite. No save transform is added.
- Use validation widening only for `sailing`, `encounter`, and `naval`; `capture`, `boarding`, `treasure`, `shares`, and `retired` remain invalid until their resume screens exist.
- `world.lastVoyage` is optional only for legacy-save compatibility. Every new safe-return transition sets it so compaction retains the latest result.
- Set Sail requires Bridgetown port mode, an active Red Jackdaw lead, an undefeated target, a valid flagship, and at least 2 provisions.
- Readiness precedence is exactly `not-in-bridgetown`, `target-defeated`, `lead-not-active`, `flagship-unavailable`, `insufficient-provisions`.
- The authored leg costs exactly 1 day / 1 provision outbound and 1 day / 1 provision returning. No continuous strategic clock runs.
- `nextSeed` is the sole LCG step. The sea leg advances navigation RNG once; pursuit advances naval RNG once and uses the result as battle input seed. World RNG does not change.
- `createRedJackdawBattleInput` is the only authored battle-input builder. Do not duplicate wind, arena, time limit, positions, opponent, or objective in campaign/UI code.
- Accepted active modes must be canonical without predecessor events: exact route checkpoints and lineage IDs, active lead, undefeated target, guaranteed return provision, and—when naval—full builder equality plus `input.seed === rng.naval`.
- Aim legality stays in `domain/naval/geometry.ts`; boarding/surrender/escape/separation stay in `domain/naval/outcomes.ts`; terminal projection/validation stays in `domain/naval/resolution.ts`.
- No campaign write occurs while a live `NavalSession` ticks. Withdrawal or one validated terminal result is the next campaign event.
- Persistent tactical damage, capture, repairs, fleet changes, morale, prize ships, multi-port economies, conquest, romance, free-roaming 3D overworld, and procedural content remain deferred.
- Normal production may contain a lazy, offline-precacheable production naval chunk and the local GLB. It must not contain `CaribbeanLab`, `debugBridge`, preview HTML, harness config, or harness-only markers.
- Setup, port, sailing, and avoid journeys must not request naval JS/CSS/GLB. Pursuit may request only local emitted assets.
- Landscape width must be `>= 960`, height `>= 600`, and width `>= height`. Every unsupported viewport mounts only the focused notice; no controller or naval session runs beneath it.
- Visible text is at least 14 px; active controls are at least 44x44 CSS px; every interactive control has `data-testid`, keyboard/touch access, visible focus, non-colour state, and stable geometry.
- Every production change uses strict RED -> observed expected failure -> minimum GREEN -> focused verification -> self-review -> one scoped commit. No production edit precedes its failing test.
- Named controller actions acquire a synchronous `{ generation, token }` owner before reading state/drafting and release only when that exact owner still matches after dispatch settles; a stale completion can never release a new-runtime action. Duplicate promises fulfill with at most one `applied` and never reject because of the duplicate.
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
| Campaign voyage | create `domain/voyage.ts`, `voyage.test.ts`; modify campaign types/events/reducer/validator/`replay.ts`/selectors and tests | Readiness, drafts, evolving-day replay, phase transitions, result state, compaction |
| Persistence compatibility | modify storage schema/persistence/recovery tests only; `migrations.ts` remains identity | Prove old bytes and intermediate modes survive save/recovery |
| Controller | create `state/namedActionGate.ts` and test; modify `state/useCaribbean.ts`, controller tests, `state/selectors.ts` | Token/generation-owned named actions, single candidate-publication effects, port-focus intent, existing atomic dispatch path |
| Strategic UI | create voyage screens plus `components/setup/PersistenceDecisionOverlay.tsx` and tests; modify port/log/page components and tests | Port departure, authored leg/contact, active-route consent/conflict overlay, lazy saved-input battle, return/reload focus and log |
| Battle integration | modify `CampaignNavalBattle`, `CaribbeanPage`, `NavalBattlePage`, `BattleHud`, `NavalSession`, hooks/tests; create golden victory JSON | Pause/reload, valid Return, invalid-resolution restart/withdraw, exactly-once safe return, public tick contract |
| Evidence | modify integration tests, port browser script/evaluator/tests, naval-check script/tests, package docs, port/naval metrics/screenshots | Deterministic public-control victory, non-writing verification, capture ownership, normal/harness isolation |

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
  | 'target-defeated'
  | 'lead-not-active'
  | 'flagship-unavailable'
  | 'insufficient-provisions';
export class VoyageTransitionError extends Error {
  readonly code: 'wrong-predecessor' | 'not-ready';
}
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

// state/namedActionGate.ts — Task 3
export interface NamedActionOwner {
  generation: number;
  token: symbol;
}
export class NamedActionGate {
  acquire(generation: number): NamedActionOwner | null;
  reset(): void;
  release(owner: NamedActionOwner): void;
}

// state/useCaribbean.ts — Task 3
setSail(): Promise<CampaignDispatchOutcome>;
completeSeaLeg(): Promise<CampaignDispatchOutcome>;
avoidEncounter(): Promise<CampaignDispatchOutcome>;
engageEncounter(): Promise<CampaignDispatchOutcome>;
withdrawBattle(): Promise<CampaignDispatchOutcome>;
resolveBattle(resolution: NavalResolution): Promise<CampaignDispatchOutcome>;
portFocusTarget: 'last-voyage' | null;
acknowledgePortFocus(): void;

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
export interface NavalResolutionErrorAction {
  message: 'Battle result could not be verified.';
  busy: boolean;
  restartLabel: 'Restart engagement';
  withdrawLabel: 'Withdraw to Bridgetown';
  restart(): void;
  withdraw(): void;
}
// Add optional resultAction / exitAction / resolutionErrorAction props.
// Existing Battle Lab defaults stay restart-only and retain Battle Lab copy.

// state/naval/NavalSession.ts — Task 5
setPaused(value: boolean): void;

// scripts/fixtures/caribbean-campaign-victory.json — Task 5
export interface CampaignVictoryTrace {
  input: { battleId: 'voyage-5-battle'; seed: 1971161494 };
  cadenceTicks: 6;
  segments: Array<{ atTick: number; rudder: -1 | 0 | 1; sail: 'full' | 'reefed'; ammunition: 'round' | 'chain' | 'grape'; fire: 'port' | 'starboard' | null }>;
  expected: { outcome: { kind: 'boarding-ready'; victorShipId: 'player' }; atTick: 11855; seedAfter: 1310878278 };
}
```

## Shared-File and Interface Conflict Table

| Tasks | Shared surface | Producer / ordering ruling |
| --- | --- | --- |
| 1 -> 2 | `createRedJackdawBattleInput`, `NavalResolution` | Task 1 owns names/shapes and commits first; Task 2 imports them unchanged. |
| 1 -> 5 | `NavalResolution`, naval rule helpers | Task 5 consumes terminal projection; it does not add campaign rules to `NavalBattlePage`. |
| 2 -> 3 | six voyage draft helpers and evolving replay validation | Task 2 owns all predecessor/RNG/input/day semantics, including `domain/replay.ts`; Task 3 only delegates. |
| 2 -> 4 | readiness/copy, accepted modes, `lastVoyage` | Task 4 renders selectors and state; no UI copy of eligibility logic. |
| 2 -> 6 | events/replay/compaction | Task 6 exercises the committed union and cannot rename payloads. |
| 3 -> 4 | controller actions, named-action gate, candidate-publication effects, `busy`, `portFocusTarget` | Task 3 commits before buttons/focus effects are enabled. Task 4 never clears activity or sets focus from an initiating promise. |
| 3 -> 5 | `withdrawBattle` / `resolveBattle` | Task 5 uses the same writer-safe methods, never raw `dispatch`. |
| 4 -> 5 | `PersistenceDecisionOverlay`, `CaribbeanPage.tsx` | Task 4 makes consent/conflict an overlay without unmounting any active route. Task 5 adds terminal-result failure integration cases and may modify route props/tests, but cannot replace overlay ownership. |
| 4 <-> 5 | `CampaignNavalBattle.tsx` | Task 4 creates lazy saved-input/rematch routing; Task 5 owns terminal Return, explicit resolution-error state, tick surface, and disposal. |
| 4 -> 7 | sailing/encounter test IDs and screenshots | Task 4 locks IDs; evidence drives them without alternate hooks. |
| 5 -> 7 | result/withdraw/reload test IDs and lazy assets | Task 5 locks behavior; evidence measures it. |
| 5 -> 6 | golden victory trace and exact HUD tick | Task 5 proves pure replay and public tick semantics; Task 6's scheduler consumes the literal JSON and public controls without a session/debug hook. |
| 6 -> 7 | evidence schema v3/evaluator/screenshot list and naval `--semantic-probe`/`--verify`/`--capture` modes | Task 6 owns fail-closed/non-writing tooling; Task 7 alone captures generated port/naval bytes, uses semantic probe while dirty, and uses final verify only after its commit. |
| 1,2,3 | `domain/events.ts`, reducer, validator | Sequential only. Task 1 does not edit campaign events; Task 2 owns the complete union; Task 3 does not edit it. |
| 4,5 | `CaribbeanPage.tsx` | Task 4 creates four-mode routing and the active-route persistence overlay; Task 5 adds terminal consent/conflict integration. Review Task 5 diff against Task 4 HEAD. |
| 6,7 | port/naval evidence scripts and generated bytes | Task 6 changes scripts/evaluators without generated bytes. Task 7 captures naval first from clean Task 6 HEAD, then captures port evidence, stages both owned trees, commits, and repeats with non-writing verify. |

No tasks may run in parallel against these shared surfaces. Independent review can reject each commit without invalidating a sibling task.

## Execution Preflight

- [ ] Confirm worktree, branch, base, and clean tracked status.

  Run:

  ```bash
  pwd
  git branch --show-current
  git rev-parse HEAD
  git log -1 --format=%H -- docs/superpowers/plans/2026-08-24-caribbean-strategic-sailing.md docs/superpowers/specs/2026-08-24-caribbean-strategic-sailing-design.md
  test "$(git rev-parse HEAD)" = "$(git log -1 --format=%H -- docs/superpowers/plans/2026-08-24-caribbean-strategic-sailing.md docs/superpowers/specs/2026-08-24-caribbean-strategic-sailing-design.md)"
  git merge-base --is-ancestor afdb53c5aa197401313917d65d5d5677aaf8a97a HEAD
  git merge-base --is-ancestor 0508a6227ee90c682f5812e3d9858f5cd20e337f HEAD
  git status --short
  ```

  Expected: the specified worktree and branch; `HEAD` equals the latest commit that changed this plan/spec; both fixed baselines are ancestors; status emits nothing. Record the resolved full `HEAD` as the implementation base and Task 1 base. A worker on `0508a62` fails because it does not contain this corrected plan.

- [ ] Create ignored SDD ledger `.superpowers/sdd/2026-08-24-caribbean-strategic-sailing/progress.md` and record the spec/plan commit, task base/head, RED/GREEN commands, review findings, and fixes. Do not stage `.superpowers/sdd`.

- [ ] Run the baseline gates serially and record exact counts/output.

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  node --test scripts/lib/caribbean-port-identity-evidence.test.mjs
  node --test scripts/lib/caribbean-naval-evidence.test.mjs scripts/lib/caribbean-naval-check.test.mjs scripts/lib/caribbean-naval-scenario.test.mjs
  git status --short
  ```

  Expected: all exit 0, the status remains empty, and only documented warning-only diagnostics remain. Do not run either current browser capture command here: both own generated evidence and the current naval command has no non-writing mode. Task 6 adds semantic-probe/final-verify modes; Task 7 owns both captures.

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
  expect(input).toEqual({
    battleId: 'voyage-3-battle',
    seed: 0x1234_5678,
    windFrom: Math.PI / 3,
    windStrength: 1,
    arenaRadius: 92,
    timeLimitTicks: 14_400,
    objective: 'capture-red-jackdaw',
    player: {
      id: 'player', stableShipId: 'mistral', name: 'Mistral', classId: 'sloop',
      position: { x: 0, z: -36 }, heading: 0,
      hull: 91, sails: 82, crew: 50, cannon: 8,
    },
    opponent: {
      id: 'opponent', stableShipId: 'red-jackdaw', name: 'Red Jackdaw', classId: 'sloop',
      position: { x: 0, z: 36 }, heading: Math.PI,
      hull: 100, sails: 100, crew: 48, cannon: 8,
    },
  });
  const second = createRedJackdawBattleInput({
    battleId: 'voyage-3-battle', seed: 0x1234_5678,
    player: { stableShipId: 'mistral', name: 'Mistral', classId: 'sloop', hull: 91, sails: 82, crew: 50, cannon: 8 },
  });
  expect(second).toEqual(input);
  expect(second.player.position).not.toBe(input.player.position);
  expect(second.opponent.position).not.toBe(input.opponent.position);
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

  Cover player/opponent surrender and sink, boarding-ready, player/opponent escape, separation, exact keys, finite/integer bounds, battle mismatch, nonterminal state, and input immutability. Add literal rejection for player and opponent hull/sails/crew/cannon one above that ship's saved input—even where the value is below the sloop maximum—and `atTick: input.timeLimitTicks + 1`.

- [ ] **Step 5: Capture resolution RED and implement minimum GREEN**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/naval/resolution.test.ts src/games/caribbean/domain/naval/outcomes.test.ts
  ```

  Expected: missing resolution module or exports.

  Export naval-owned decisive-fact helpers/constants from `outcomes.ts` only where `resolution.ts` needs them. Validate by reconstructing each exact fact through those helpers; do not copy numeric thresholds into campaign files.

- [ ] **Step 6: Mutation proof, focused GREEN, review, and commit**

  Temporarily make boarding range validation accept `8`; the range mutation case must fail. Restore it. Temporarily permit final player sails above `input.player.sails`; the monotonicity case must fail. Restore it. Temporarily change player crew and opponent cannon defaults, then opponent heading from `Math.PI`; the whole-object builder cases must fail each mutation. Restore all mutations.

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
- Modify: `src/games/caribbean/domain/replay.ts`
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

**Interfaces:** Consumes Task 1 route/input/resolution and existing journal/storage contracts. Produces the six event variants, optional `world.lastVoyage`, readiness/copy/draft helpers, `VoyageTransitionError`, strict canonical mode validators, and reducer behavior in the spec.

- [ ] **Step 1: Write readiness and draft-helper RED tests**

  Use hand-authored state mutations and exact results:

  ```ts
  const state = activeLeadCampaign();
  expect(state.lastEventId).toBe(1);
  expect(voyageReadiness(state)).toEqual({ kind: 'ready', requiredProvisions: 2 });
  expect(voyageStartedDraft(state)).toEqual({
    type: 'voyage-started',
    payload: { voyageId: 'voyage-2' },
  });
  ```

  Table-test exact precedence `not-in-bridgetown`, `target-defeated`, `lead-not-active`, `flagship-unavailable`, `insufficient-provisions`, exact player copy, a one-provision boundary, nonzero checkpoint `lastEventId`, and no mutation. A literal post-victory state with both `targetDefeated: true` and lead `completed` must return `{ kind: 'blocked', reason: 'target-defeated', requiredProvisions: 2 }`; a separate no-lead state returns `lead-not-active`. For each test record the production branch it catches.

- [ ] **Step 2: Capture readiness RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/voyage.test.ts
  ```

  Expected: missing `domain/voyage`.

- [ ] **Step 3: Add event-shape and validator RED tests**

  Extend `validateCampaignEvent` tables with exact valid fixtures and one malformed fixture per field. Extend `validateCampaign` with literal reachable `sailing`, `encounter`, and `naval` states. Use this exact invariant matrix:

  | Mode | Literal positive | One-at-a-time RED mutations |
  | --- | --- | --- |
  | sailing at `lastEventId: 2` | `voyage-2`, deep-equal authored start, active lead, undefeated target, flagship, 2 provisions | `voyage-3`; contact checkpoint; completed/missing lead; defeated target; missing flagship; 1 provision |
  | encounter at `lastEventId: 3` | `voyage-2`, `voyage-2-contact`, deep-equal authored contact, active lead, undefeated target, flagship, 1 provision | wrong voyage/contact ID; start/range-only checkpoint; completed/missing lead; defeated target; missing flagship; 0 provisions |
  | naval at `lastEventId: 4` | `voyage-2`, `voyage-2-battle`, matching wrapper/input ID, authored contact, active lead, undefeated target, flagship, 1 provision, `input.seed === rng.naval`, whole-input builder equality | wrong voyage/battle/wrapper/input ID; checkpoint; lead; target; flagship; 0 provisions; seed/RNG mismatch; any player/opponent/builder fact |

  Reject safe-integer lineage underflow, unknown/extra keys, and the still-invalid reserved modes. Validators import route/builder authorities and compare canonical values; they do not copy constants.

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

  `navalEngagedDraft` calls `createRedJackdawBattleInput` with the current flagship snapshot and `seed: navalAfter`. Every draft helper throws `VoyageTransitionError` with exact code `wrong-predecessor` or `not-ready`; never coerce. Tests assert hand-derived `voyage-2-contact` / `voyage-2-battle` literals and never compute expected IDs from reducer output.

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
    voyageId: 'voyage-2',
    battleId: 'voyage-2-battle',
    result: 'victory',
    outcome: { kind: 'boarding-ready', victorShipId: 'player' },
    returnedDay: 2,
  });
  expect(departed.events.at(-1)).toMatchObject({ id: 2, type: 'voyage-started', payload: { voyageId: 'voyage-2' } });
  expect(contact.events.at(-1)).toMatchObject({ id: 3, type: 'sea-leg-completed', payload: { voyageId: 'voyage-2', encounterId: 'voyage-2-contact' } });
  expect(engaged.events.at(-1)).toMatchObject({ id: 4, type: 'naval-engaged', payload: { voyageId: 'voyage-2', encounterId: 'voyage-2-contact', battleId: 'voyage-2-battle' } });
  expect(returned.events.at(-1)).toMatchObject({ id: 5, type: 'naval-resolved', payload: { voyageId: 'voyage-2', battleId: 'voyage-2-battle' } });
  expect(returned.state.fleet.ships[0]).toMatchObject({
    hull: activeLeadJournal.state.fleet.ships[0].hull,
    sails: activeLeadJournal.state.fleet.ships[0].sails,
    crew: activeLeadJournal.state.fleet.ships[0].crew,
    cannon: activeLeadJournal.state.fleet.ships[0].cannon,
    cargo: { ...activeLeadJournal.state.fleet.ships[0].cargo, provisions: 32 },
  });
  ```

  Assert the exhaustive literal classifier table: each of `surrender`, `sunk`, and `boarding-ready` with player victor -> `victory`; the same three with opponent victor -> `defeat`; `escaped` player/opponent and `separated` player/opponent -> `unresolved`; encounter avoid -> `avoided`; withdrawal -> `withdrew`. Add lead expiry on return, matching-ID/RNG/checkpoint/input rejection, event-ID exhaustion, and every prior input immutable. Victory alone completes the lead and target.

- [ ] **Step 7: Implement reducer branches and capture GREEN**

  Use small private functions `spendVoyageCost`, `returnToBridgetown`, and `classifyResolution` inside `reduceCampaign.ts`. `returnToBridgetown` must set `mode`, calendar, provisions, optional summary, lead completion/expiry, and `lastEventId` before one final `validateCampaign` call. Do not apply tactical damage to `fleet`.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/voyage.test.ts src/games/caribbean/domain/reduceCampaign.test.ts src/games/caribbean/domain/validateCampaign.test.ts
  ```

  Expected: all pass with no stderr.

- [ ] **Step 8: Observe evolving-day replay RED, then add the explicit replay/compact/load/recover matrix**

  Before editing `replay.ts`, add literal replay cases with event days
  `0 -> 1 -> 2`, a post-leg event incorrectly stamped day 0, and a compacted
  checkpoint beginning at `lastEventId: 7` / day 7 whose later events are
  stamped day 8 after reducer-owned advancement and whose final state is day
  9. Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/domain/replay.test.ts
  ```

  Expected RED: the direct voyage stream first fails at
  `events.2.atDay:invariant` because current `validateJournal` compares every
  event to the initial day. Implement `validateJournal` as an ordered fold:
  validate the next literal ID, call `reduceCampaign(current, event)`, and
  adopt its returned state. Do not precheck `atDay` against `journal.initial`;
  the reducer remains the sole owner of event-day validity and which
  transition advances the day. The wrong-day fixture remains rejected by the
  reducer-owned invariant.

  Assert canonical replay equality for avoid and battle streams; compact after return; append a new `voyage-6` from returned `lastEventId: 5`; parse a hand-built legacy V1 raw envelope with no `lastVoyage`; save it unchanged before mutation; append departure and verify its old raw becomes `previous`; preserve unknown future versions.

  For each exact positive state from Step 3 (`sailing` event 2, `encounter` event 3, `naval` event 4), run all four rows: direct save/load canonical equality; `compactJournal` to empty events with the same nonzero `initial.lastEventId`, then save/load equality; corrupt current and recover the exact previous mode; and mutate each cross-field invariant in the compacted `initial` to prove rejection without predecessor events. The mutation set is checkpoint, lineage ID, lead, target, flagship, return provision for all applicable modes, plus naval wrapper/input ID, RNG seed, player sails, opponent cannon, and objective. Assert unreadable current/previous raw bytes remain byte-exact and a mutated previous is never promoted.

  Verify `migrateSaveEnvelope` remains identity and receives no source edit.

- [ ] **Step 9: Mutation proof, complete GREEN, review, and commit**

  Kill/restore readiness precedence, navigation RNG assignment, return provision subtraction, evolving-current replay (restore the old initial-day comparison), compacted encounter ID comparison, naval input-seed equality, full builder comparison, final replay equality, exhaustive escape classification, and optional legacy `lastVoyage` acceptance. Each named test must fail for the intended reason.

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

- Create: `src/games/caribbean/state/namedActionGate.ts`
- Create: `src/games/caribbean/state/namedActionGate.test.ts`
- Modify: `src/games/caribbean/state/useCaribbean.ts`
- Modify: `src/games/caribbean/state/useCaribbean.test.tsx`
- Modify: `src/games/caribbean/state/selectors.ts`
- Modify: `src/games/caribbean/state/selectors.test.ts`
- Modify: `src/games/caribbean/state/runtime.ts`
- Modify: `src/games/caribbean/state/runtime.test.ts`

**Interfaces:** Consumes Task 2 helpers/`VoyageTransitionError` and existing writer/candidate publication paths. Produces `NamedActionGate`, the six guarded named methods, one event-candidate publication boundary, one-shot `portFocusTarget`, and acknowledgement method. Runtime build changes from `caribbean-port-1` to exact `caribbean-sailing-1`; no storage key/version changes.

- [ ] **Step 1: Write named-action RED tests**

  For persisted and memory-only controllers, run each legal action and assert exactly one event, exact mode, event ID, save call count, action guard, and returned `CampaignDispatchOutcome`. Spy on the pure helper only through observable event/state; do not assert a mock button exists.

  ```ts
  await act(() => result.current.setSail());
  expect(result.current.journal?.events.at(-1)).toMatchObject({
    id: 2,
    type: 'voyage-started',
    payload: { voyageId: 'voyage-2' },
  });
  expect(result.current.journal?.state.mode).toMatchObject({ kind: 'sailing', voyageId: 'voyage-2' });
  ```

  For all six methods in both persistence modes, call twice without awaiting and use `Promise.allSettled`. Both entries must be `fulfilled`; exactly one value is `{ kind: 'applied', eventId: literal }`, the other is `{ kind: 'not-applied' }`; journal/save counts are one. Add wrong-predecessor named calls that fulfill `not-applied`, while direct Task 2 helper tests retain thrown `VoyageTransitionError`. Seed fixtures through real `appendJournal`/`saveCampaign`; do not partially mock journal/store side effects.

  Unit-test this literal ownership sequence against `NamedActionGate` for both
  persisted and memory-only labels: A acquires generation 1; `reset()` models a
  runtime swap; B acquires generation 2; A settles/releases; C attempts to
  acquire generation 2 and receives `null`; B releases; only then may the next
  action acquire. The controller integration repeats the matrix with deferred
  real dispatch promises and asserts A/B fulfill, C fulfills
  `{ kind: 'not-applied' }`, and no duplicate event/save appears.

- [ ] **Step 2: Capture controller RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state/useCaribbean.test.tsx src/games/caribbean/state/selectors.test.ts
  ```

  Expected: controller methods do not exist and runtime build literal differs.

- [ ] **Step 3: Implement token/generation ownership and the single publication boundary**

  Implement the exact `NamedActionGate` interface declared above. `acquire`
  returns a fresh symbol-bearing owner only while empty. `release` clears only
  when both token and generation match. The runtime effect increments existing
  `generationRef` and resets the gate before accepting new work. Inside the
  hook, acquire before
  reading `journalRef` or constructing a draft, and release the captured owner
  in `finally`; do not use a boolean ref:

  ```ts
  const namedActionGateRef = useRef(new NamedActionGate());
  const dispatchNamedAction = useCallback(async (
    createDraft: (state: CampaignStateV1) => CampaignEventDraft,
  ): Promise<CampaignDispatchOutcome> => {
    const owner = namedActionGateRef.current.acquire(generationRef.current);
    if (owner === null) return { kind: 'not-applied' };
    try {
      const active = journalRef.current;
      if (active === null || busyRef.current) return { kind: 'not-applied' };
      let draft: CampaignEventDraft;
      try {
        draft = createDraft(active.state);
      } catch (error) {
        if (error instanceof VoyageTransitionError) return { kind: 'not-applied' };
        throw error;
      }
      return await dispatch(draft);
    } finally {
      namedActionGateRef.current.release(owner);
    }
  }, [dispatch]);
  ```

  Bind every action directly to its Task 2 helper. Do not pass `onApplied`
  callbacks. Refactor the existing immediate saved publication, direct
  memory-only publication, and delayed **Continue without saving** adoption to
  call one `publishEventCandidate(predecessor, candidate)` boundary. That
  boundary adopts the journal and consumes an event token
  `{ campaignId, eventId, type }` once per runtime generation. Only there:

  - `voyage-started` sets activity to `menu`;
  - `encounter-avoided`, `battle-withdrawn`, and `naval-resolved` set
    `portFocusTarget` to `last-voyage`; and
  - all other event types have no transient effect.

  The persistence writer still owns candidate creation/revision/conflict. The
  publication boundary owns both journal adoption and transient publication;
  a retry that later saves an already adopted memory candidate, repeated
  consent, conflict refresh, or stale completion cannot consume the token
  twice. Denial, write failure, pending consent, and unresolved conflict do not
  consume it. Reload external save discards it. Named bindings remain direct:

  ```ts
  type PublishEventCandidate = (
    generation: number,
    predecessor: CampaignJournal,
    candidate: CampaignJournal,
  ) => void;
  ```

  Every current `updateJournal(generation, outcome.journal)` that publishes an
  event candidate, and `continueWithoutSaving`'s direct `setJournal`, routes
  through this function. Load/recovery publication without a local predecessor
  is not an event candidate and never synthesizes transient effects.

  ```ts
  const setSail = () => dispatchNamedAction(voyageStartedDraft);
  const completeSeaLeg = () => dispatchNamedAction(seaLegCompletedDraft);
  const avoidEncounter = () => dispatchNamedAction(encounterAvoidedDraft);
  const engageEncounter = () => dispatchNamedAction(navalEngagedDraft);
  const withdrawBattle = () => dispatchNamedAction(battleWithdrawnDraft);
  const resolveBattle = (resolution: NavalResolution) => dispatchNamedAction(
    (state) => navalResolvedDraft(state, structuredClone(resolution)),
  );
  ```

  `acknowledgePortFocus` clears only the transient intent. Do not copy save/revision/memory logic.

- [ ] **Step 4: Add failure and exact-once RED/GREEN cases**

  Cover same-tick double activation of every method in both persistence modes, deferred Web Lock, denied lock, write failure, consent then memory-only, save conflict, retry, runtime generation replacement, stale promise completion, duplicate terminal resolution, and external reload. Exact behavior: `Promise.allSettled` sees no duplicate rejection; at most one legal successor event; failures return `not-applied` until consent publishes its candidate.

  Table-test departure and each return event through (a) immediate successful
  save, (b) direct memory-only publication, and (c) save denial followed by
  delayed **Continue without saving**. For every open activity (`governor`,
  `tavern`, `market`, `shipyard`, `shares`, `log`), only publication clears a
  departure to `menu`. Only published avoid/withdraw/resolve sets one-shot log
  focus. Denial, write failure, pending/conflict, retry, repeated consent, and
  reload-discard assert zero early/duplicate effects. A retry that persists the
  already adopted candidate leaves activity/focus unchanged. Acknowledgement
  and runtime replacement clear focus.

  Verify no save occurs from controller construction/resume alone for a saved naval snapshot.

- [ ] **Step 5: Mutation proof, verification, review, and commit**

  Temporarily let `release` compare generation only; the A/runtime-swap/B/A-settles/C matrix must fail because stale A admits C. Restore it. Temporarily apply transient effects on named-action settlement and omit delayed consent from the publication boundary; the denial/direct-memory/delayed-memory tables must fail. Restore them. Temporarily call `appendJournal` directly in `resolveBattle`; the storage-failure case must fail. Restore it.

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
- Create: `src/games/caribbean/components/setup/PersistenceDecisionOverlay.tsx`
- Create: `src/games/caribbean/components/setup/PersistenceDecisionOverlay.test.tsx`
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
- Modify: `src/games/caribbean/components/setup/CampaignSetup.tsx`
- Modify: `src/games/caribbean/components/setup/CampaignSetup.test.tsx`
- Modify: `src/games/caribbean/styles/production.css`

**Interfaces:** Consumes controller Task 3, readiness/copy/state Task 2, and existing `MinimumScreenGate`. Produces stable test IDs `port-action-set-sail`, `voyage-continue-east`, `encounter-avoid`, `encounter-pursue`, `voyage-status`, `voyage-instrument`, `captains-log-last-voyage`, and `campaign-persistence-dialog`, plus an active-route consent/conflict overlay reused by Task 5.

- [ ] **Step 1: Write Port Set Sail RED tests**

  Change `PortMenu` props to receive readiness, busy, and `onSetSail`. Assert disabled reason for every selector code in Task 2 precedence; active lead/two-provision boundary enables; click and Enter call once; busy prevents duplicates; active port activities still use exact order/focus. A completed-lead/defeated-target component fixture must display `The Red Jackdaw lead is complete.`, never Tavern instructions.

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

  The route SVG must be `aria-hidden`; semantic text must contain the same facts. Depart through Set Sail while Governor's House, Tavern, Market, Shipyard, Divide Shares, and Captain's Log are each open; an applied controller response routes to sailing with activity `menu`, while a not-applied response leaves the exact activity open.

- [ ] **Step 3: Write active-route persistence and return-focus RED tests**

  Extract the existing consent/conflict choices from `CampaignSetup` into `PersistenceDecisionOverlay` without changing their controller methods or exact test IDs. With a non-null port, sailing, encounter, or naval journal, render `consent-required` and `save-conflict` phases and assert the mode screen stays mounted beneath `role="dialog"`, the route branch is inert, initial focus enters the first decision, Tab is trapped, export changes no route, and Escape cannot silently dismiss a required choice. A null journal still uses `CampaignSetup`; recovery phases still use `RecoveryPanel`.

  Add port focus cases: same-session avoid/withdraw/resolve with `portFocusTarget: 'last-voyage'` focuses `port-action-log` and acknowledges once; reload/resume into ready port focuses `port-action-set-sail`; reload of a victorious port focuses `port-action-log`; a new port campaign with neither readiness nor summary focuses the harbour heading.

- [ ] **Step 4: Capture component RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/port/PortMenu.test.tsx src/games/caribbean/components/port/PortPage.test.tsx src/games/caribbean/components/voyage src/games/caribbean/components/CaribbeanPage.test.tsx
  ```

  Expected: missing voyage/overlay components, Set Sail remains disabled, and setup phase still replaces active routes.

- [ ] **Step 5: Implement mode routing, overlay ownership, and compact historical composition**

  `CaribbeanPage` routes `port`, `sailing`, and `encounter` synchronously. `showCampaign` is true whenever a journal exists and no recovery phase is active—even during consent/conflict. Render `PersistenceDecisionOverlay` as a sibling above the still-mounted route for those two phases; never render the commission form over a non-null active journal. The overlay captures the focused initiating element, uses `useModalFocus`, and returns focus when reload discards the candidate. Declare the naval branch with:

  ```ts
  const CampaignNavalBattle = lazy(() => import('./voyage/CampaignNavalBattle'));
  ```

  Create `CampaignNavalBattle` as a narrow saved-input adapter: assert naval mode, call `useNavalSession(mode.input)`, render the unchanged `NavalBattlePage`, and import `../../styles/battle.css` from this lazy module. At this task boundary the existing terminal rematch remains available; Task 5 replaces that terminal action additively with campaign return. Assert the campaign journal receives no event while this session ticks and unmount disposes it. Wrap only the naval branch in `Suspense` with a labelled `Loading the engagement…` status.

  Build the voyage page from the spec's six existing tokens/type roles. The full-screen sea/sky uses broad local CSS colour and one inline SVG one-mast silhouette/brass wake. Opaque Deep Keel/Harbour Glass backplates carry text. Under reduced motion the wake renders complete with no animation.

- [ ] **Step 6: Add compacted outcome log and exact port focus**

  `CaptainsLog` reads `state.world.lastVoyage` and derives one concise authored result line plus returned day. It retains the Red Jackdaw lead card. Exact examples:

  ```text
  Avoided contact · Returned to Bridgetown on day 2.
  Victory — Red Jackdaw surrendered · Returned on day 4.
  Withdrawn from battle · Returned on day 4.
  ```

  Outcome text is derived from codes and `NavalOutcome`; no event prose or battle thresholds are recreated.

  `PortPage` first consumes Task 3's `last-voyage` focus intent. Without an intent on mount/resume, focus Set Sail when readiness is ready, else Captain's Log when `lastVoyage` exists, else the harbour heading. Do not auto-open the log or alter canonical state.

- [ ] **Step 7: CSS/accessibility RED and GREEN**

  Static CSS tests require fixed full-screen stage, minimum 44 px controls, 14 px copy, opaque decision backplates, safe-area padding, no outer horizontal overflow, reduced-motion override, no dominant production-grid background, and no portrait/phone override that bypasses `MinimumScreenGate`.

  At exact component view, verify heading focus after mode change, stable status node, focus-visible selector, no emoji, and no inaccessible SVG name duplication.

- [ ] **Step 8: Mutation proof, focused/full component verification, review, and commit**

  Kill/restore post-victory readiness copy, active-route rendering during `save-conflict`, overlay inert/focus, publication-only activity reset expectation, reload Set Sail focus, semantic wind text, and reduced-motion suppression. Each named test must fail.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components src/games/caribbean/styles
  mise exec node@20 -- npm run check
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/components/port src/games/caribbean/components/log src/games/caribbean/components/voyage src/games/caribbean/components/setup/PersistenceDecisionOverlay.tsx src/games/caribbean/components/setup/PersistenceDecisionOverlay.test.tsx src/games/caribbean/components/setup/CampaignSetup.tsx src/games/caribbean/components/setup/CampaignSetup.test.tsx src/games/caribbean/components/CaribbeanPage.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/styles/voyage.css src/games/caribbean/styles/voyageResponsive.test.tsx src/games/caribbean/styles/production.css
  git commit -m "feat(caribbean): open the Bridgetown sea route"
  ```

---

### Task 5: Connect the Existing Full-Bleed Battle and Safe Return

**Files:**

- Modify: `src/games/caribbean/components/voyage/CampaignNavalBattle.tsx`
- Modify: `src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.tsx`
- Modify: `src/games/caribbean/components/battle/NavalBattlePage.test.tsx`
- Modify: `src/games/caribbean/components/battle/BattleHud.tsx`
- Create: `src/games/caribbean/components/battle/BattleHud.test.tsx`
- Modify: `src/games/caribbean/state/naval/NavalSession.ts`
- Modify: `src/games/caribbean/state/naval/NavalSession.test.ts`
- Modify: `src/games/caribbean/state/naval/useNavalSession.ts`
- Modify: `src/games/caribbean/state/naval/testSession.ts`
- Modify: `src/games/caribbean/domain/naval/replay.test.ts`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Modify: `src/games/caribbean/caribbean.integration.test.tsx`
- Modify: `src/games/caribbean/styles/battle.css`
- Create: `scripts/fixtures/caribbean-campaign-victory.json`

**Interfaces:** Consumes saved `mode.input`, Task 1 summary, Task 3 actions/focus, and Task 4's wrapper/overlay. Produces additive `resultAction`, `exitAction`, `resolutionErrorAction`, `setPaused`, a visible exact-tick HUD surface, literal golden victory trace, and safe-return behavior without changing the wrapper's default export.

- [ ] **Step 1: Write additive NavalBattlePage RED tests**

  Preserve every current rematch assertion. Add campaign-mode cases:

  ```tsx
  render(<NavalBattlePage
    session={terminalSession}
    sceneFactory={null}
    resultAction={{ label: 'Return to Bridgetown', busy: false, activate }}
  />);
  await user.click(screen.getByTestId('naval-result-action'));
  expect(activate).toHaveBeenCalledWith(terminalSession.getSnapshot().state);
  expect(terminalSession.restartCount).toBe(0);
  ```

  Assert synchronous busy guards, focus/inert/modal retention, campaign-specific result eyebrow/copy, default `Battle Lab result` plus `naval-result-restart` in Battle Lab, withdraw inside nonterminal Options, valid terminal Return only, no terminal withdrawal beside Return, and no call from diagnostics.

  Add the distinct error branch:

  ```tsx
  resolutionErrorAction={{
    message: 'Battle result could not be verified.', busy: false,
    restartLabel: 'Restart engagement', withdrawLabel: 'Withdraw to Bridgetown',
    restart, withdraw,
  }}
  ```

  It renders `naval-resolution-error`, campaign copy, `naval-resolution-restart`, and `naval-resolution-withdraw`; restart calls only `session.restart()`/the supplied callback, withdrawal calls only the supplied action, no automatic dispatch occurs, focus starts on Restart, Tab is trapped, and Battle Lab wording is absent. This branch, not a valid result, is the only terminal presentation with withdrawal.

- [ ] **Step 2: Write explicit pause/background RED tests**

  `NavalSession.setPaused(true)` freezes ticks and clears queued frame work; repeated `true` is idempotent; `false` resumes unless diagnostic/outcome. `NavalBattlePage` sets paused true on hidden visibility and does not auto-resume on visible. Existing Escape/toggle behavior remains.

- [ ] **Step 3: Capture battle/session RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state/naval/NavalSession.test.ts src/games/caribbean/components/battle/NavalBattlePage.test.tsx
  ```

  Expected: missing `setPaused`, `resultAction`, `exitAction`, and `resolutionErrorAction` contracts.

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

  The terminal action receives the page's already-published terminal state. Clone before crossing the prop boundary. Rename the test ID to `naval-result-action` only when a custom result action exists; default keeps `naval-result-restart`. The explicit error branch suppresses the normal result branch and uses its two exact actions; it never inherits Battle Lab copy.

- [ ] **Step 5: Write CampaignNavalBattle RED tests**

  Use real `summarizeNavalResolution` and a complete manual session. Assert:

  - session input canonical JSON equals saved `mode.input`;
  - ticks and controller journal remain unchanged relative to each other while battle runs;
  - terminal click summarizes once and calls `resolveBattle` once;
  - thrown summarization, failed `validateNavalResolution`, or reducer contract rejection before a pending candidate switches to `Battle result could not be verified.` with restart/withdraw and zero auto-dispatch;
  - restart rebuilds from byte-identical saved input at tick zero and clears only the local error;
  - nonterminal withdrawal synchronously calls `session.setPaused(true)` before
    `withdrawBattle`; while a deferred writer remains unresolved, delivered RAF
    callbacks advance zero ticks;
  - an applied withdrawal unmounts to port; consent/conflict keeps the battle
    mounted paused beneath the overlay; Continue without saving unmounts;
    reloading the same naval predecessor keeps it paused; an unexpected reject
    exposes explicit Retry withdrawal and Resume battle choices and never
    auto-resumes; terminal-error withdrawal is asserted separately;
  - a `not-applied` storage/lock result retains the normal terminal modal and announces `Battle result was not saved.` without switching to resolution-error state;
  - applied result is allowed to unmount via parent mode change;
  - copy states reload starts at first contact; and
  - unmount disposes the session/audio/scene through existing hooks.

- [ ] **Step 6: Capture the CampaignNavalBattle RED before editing the wrapper**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx src/games/caribbean/components/CaribbeanPage.test.tsx
  ```

  Expected RED: Task 4's wrapper lacks campaign Return/error handling and does
  not pause before a deferred withdrawal writer. Record the exact failing test
  names; do not edit `CampaignNavalBattle.tsx` or `CaribbeanPage.tsx` first.

- [ ] **Step 7: Extend the lazy campaign wrapper**

  `CampaignNavalBattle` receives `{ controller }`, asserts `journal.state.mode.kind === 'naval'`, calls `useNavalSession(mode.input)`, and renders the unchanged full-bleed page. It retains `../../styles/battle.css` in the lazy module, not in `CaribbeanPage`, port, or non-naval voyage modules.

  Use separate synchronous ref-backed in-flight guards around summarize/resolve
  and withdrawal. Prevalidate the summary with
  `validateNavalResolution(mode.input, summary)` before calling the controller.
  A thrown/failed local validation selects `resolutionErrorAction`; a
  controller `not-applied` with consent/conflict remains a normal valid
  terminal result under Task 4's persistence overlay. Restart calls the
  session's saved-input restart, resets local error/status, and dispatches
  nothing. Never pass malformed data to the controller.

  The nonterminal Options withdrawal callback calls `session.setPaused(true)`
  synchronously before invoking or awaiting `controller.withdrawBattle()`.
  Applied/memory publication lets the parent unmount. Pending consent/conflict
  retains the paused session. Reload of the same naval predecessor remains
  paused. Unexpected rejection leaves it paused and renders Retry withdrawal /
  Resume battle; Resume is the only branch that calls `setPaused(false)`.
  Terminal-error withdrawal uses the already-terminal session and remains a
  separate assertion.

- [ ] **Step 8: Write HUD and golden-fixture RED tests**

  Add a visible fixed-width `Engagement mm:ss` value to `BattleHud` with `data-testid="naval-elapsed"` and `data-battle-tick={state.tick}`. It updates from the already-published snapshot (six-tick cadence), is player-readable, and adds no debug global/session setter.

  Commit `scripts/fixtures/caribbean-campaign-victory.json` as literal six-tick command rows for exact input `{ battleId: 'voyage-5-battle', seed: 1971161494 }`. Build that input through the real campaign sequence from seed `1702` and assert whole-input equality before replaying the JSON through `replayBattle`. Exact result: player `boarding-ready`, tick `11855`, `seedAfter: 1310878278`, player systems `{ hull: 78, sails: 61, crew: 44, cannon: 8 }`, opponent `{ hull: 88, sails: 14, crew: 9, cannon: 8 }`. Assert every `atTick` is an increasing multiple of 6 below the terminal tick and all commands are public-control representable. The RED is missing fixture/tick surface or a non-winning/mismatched trace, not an evaluator-schema failure.

- [ ] **Step 9: Capture HUD/fixture RED, then implement minimum GREEN**

  Run before editing `BattleHud.tsx` or adding the fixture:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/battle/BattleHud.test.tsx src/games/caribbean/domain/naval/replay.test.ts
  ```

  Expected RED: `naval-elapsed`/`data-battle-tick` and the literal fixture are
  absent. Then add only the public tick surface and committed literal JSON;
  rerun the same command to GREEN.

- [ ] **Step 10: Write production routing, overlay, and integration RED**

  Extend `CaribbeanPage.test.tsx` with saved naval journals. Resume mounts the lazy campaign battle at tick zero from exact input; remount constructs a fresh session with the same input; no auto-dispatch occurs; unsupported `MinimumScreenGate` prevents lazy module/session construction.

  From a real terminal session click Return and force: writer denial/write failure -> consent; stale revision -> conflict; export; Continue without saving; and Reload newer save. In every pending case assert the normal result modal and exact terminal state remain mounted beneath `campaign-persistence-dialog`; no port copy appears. Continue publishes the pending candidate once and only then unmounts to port/log focus. Export changes neither route nor journal. Reload discards the candidate and retains/reveals the external naval predecessor; Return can be retried once without a rejected duplicate promise. A successful retry or memory consent produces exactly one resolution event.

  Extend `caribbean.integration.test.tsx` with the real component/controller journey:

  ```text
  setup -> mark lead -> Set Sail -> reload sailing -> Continue east
  -> Avoid -> port -> Set Sail -> Continue east -> Pursue
  -> saved naval input -> terminal real-domain result -> Return
  -> reload port -> Captain's Log
  ```

  Assert literal event IDs/types: `1 lead-accepted`, `2 voyage-started voyage-2`, `3 sea-leg-completed voyage-2-contact`, `4 encounter-avoided`, `5 voyage-started voyage-5`, `6 sea-leg-completed voyage-5-contact`, `7 naval-engaged voyage-5-battle`, `8 naval-resolved`; exact days, provisions, RNG transitions, mode sequence, one resolution, no campaign write during ticks, completed lead, disabled Set Sail reason `The Red Jackdaw lead is complete.`, Captain's Log return focus, and canonical save/reload equality. A second fixture covers battle withdrawal and retained active lead.

- [ ] **Step 11: Capture real integration RED, then implement routing GREEN**

  Run before editing `CaribbeanPage.tsx` for these cases:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx
  ```

  Expected RED: saved naval overlay/return routing and the complete terminal
  journal journey are missing. Implement the minimum Task 5 routing/props and
  rerun to GREEN. This is distinct from the wrapper RED and HUD/fixture RED.

- [ ] **Step 12: Mutation proof, focused/full battle GREEN, review, and commit**

  Kill/restore terminal in-flight guard, resolution-error branching, overlay route preservation, golden trace seed, exact HUD tick, clone boundary, hidden pause call, and lazy CSS ownership. Tests must catch duplicate resolve/rejected duplicate, invalid Return, terminal unmount on consent, non-winning trace, tick drift, mutable input leak, hidden ticking, and eager battle import.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/battle src/games/caribbean/components/voyage src/games/caribbean/state/naval src/games/caribbean/domain/naval/replay.test.ts src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx
  mise exec node@20 -- npm run check
  mise exec node@20 -- npm run build
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/components/voyage/CampaignNavalBattle.tsx src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx src/games/caribbean/components/battle/NavalBattlePage.tsx src/games/caribbean/components/battle/NavalBattlePage.test.tsx src/games/caribbean/components/battle/BattleHud.tsx src/games/caribbean/components/battle/BattleHud.test.tsx src/games/caribbean/state/naval src/games/caribbean/domain/naval/replay.test.ts src/games/caribbean/components/CaribbeanPage.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx src/games/caribbean/styles/battle.css scripts/fixtures/caribbean-campaign-victory.json
  git commit -m "feat(caribbean): connect campaign naval return"
  ```

---

### Task 6: Define the Integrated Route and Fail-Closed Evidence Contract

**Files:**

- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `scripts/caribbean-port-check.mjs`
- Create: `scripts/lib/caribbean-campaign-victory-driver.mjs`
- Create: `scripts/lib/caribbean-campaign-victory-driver.test.mjs`
- Create: `scripts/lib/caribbean-campaign-victory-browser.test.mjs`
- Create: `scripts/lib/caribbean-naval-verification.mjs`
- Create: `scripts/lib/caribbean-naval-verification.test.mjs`
- Modify: `scripts/caribbean-naval-check.mjs`
- Modify: `scripts/lib/caribbean-naval-check.test.mjs`

**Interfaces:** Consumes Task 5's literal `CampaignVictoryTrace`/public tick and all production interfaces. Produces port evidence schema version 3, exported `driveCampaignVictory`, revised isolation, exact screenshot manifest, and naval `--semantic-probe`/`--verify`/`--capture` modes. Does not commit generated metrics/PNG bytes.

- [ ] **Step 1: Define exact schema-v3 evaluator tests**

  Extend raw and normalized evaluator fixtures with:

  ```js
  strategicSailing: {
    status: 'verified',
    modeSequence: ['port', 'sailing', 'encounter', 'port', 'sailing', 'encounter', 'naval', 'port'],
    eventIds: [1, 2, 3, 4, 5, 6, 7, 8],
    eventTypes: ['lead-accepted', 'voyage-started', 'sea-leg-completed', 'encounter-avoided', 'voyage-started', 'sea-leg-completed', 'naval-engaged', 'naval-resolved'],
    outbound: { elapsedDays: 1, provisionsUsed: 1 },
    return: { elapsedDays: 1, provisionsUsed: 1 },
    rng: { navigationTransitionsVerified: true, navalTransitionVerified: true, worldUnchanged: true },
    navalInput: { persistedBeforeMount: true, byteEqualAfterReload: true, tickAfterReload: 0 },
    resolution: { outcome: 'boarding-ready', victorShipId: 'player', atTick: 11855, seedAfter: 1310878278, exactlyOnce: true, campaignWritesDuringBattle: 0, returnedTo: 'bridgetown' },
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

- [ ] **Step 3: Write and observe the pure scheduler RED, then implement it**

  `caribbean-campaign-victory-driver.test.mjs` imports the literal Task 5 JSON and tests a fake page adapter. Required algorithm:

  ```js
  export async function driveCampaignVictory({ page, trace, timeoutMs = 330_000 }) {
    assertExactInput(await readSavedInput(page), trace.input);
    if (await readPublicTick(page) !== 0) throw new Error('Battle did not mount at tick 0');
    await page.clock.runFor(16); // first RAF establishes the runner timestamp
    if (await readPublicTick(page) !== 0) throw new Error('First RAF advanced simulation');
    for (let expectedTick = 0; expectedTick < trace.expected.atTick;) {
      const observed = await readPublicTick(page);
      if (observed !== expectedTick) throw new Error(`Naval tick drift: expected ${expectedTick}, observed ${observed}`);
      await applyRowsAtTickThroughControls(page, trace.segments, observed);
      for (;;) {
        await page.clock.runFor(16);
        const next = await readPublicTick(page);
        if (next === expectedTick) continue;
        const terminal = await terminalOutcome(page);
        if (terminal && next === trace.expected.atTick) break;
        if (next !== expectedTick + trace.cadenceTicks) {
          throw new Error(`Naval tick drift: expected ${expectedTick + trace.cadenceTicks}, observed ${next}`);
        }
        expectedTick = next;
        break;
      }
      if (await terminalOutcome(page)) break;
    }
    return requireExactPlayerVictory(await readVisibleTerminal(page), trace.expected);
  }
  ```

  The fake adapter proves only rendered `naval-rudder-*`,
  `naval-sail-toggle`, `naval-ammo-*`, and `naval-fire-*` controls are invoked;
  exact-tick rows apply once; no boundary is skipped/duplicated; the first RAF
  leaves tick zero; and final mid-cadence tick `11855` is accepted only with
  the exact player victory. Missing tick/input/row, overshoot, timeout, defeat,
  separation, and unresolved completion reject. Rudder rows use held/released
  keyboard events; add a separate adapter assertion for the rendered rudder
  button's existing 140 ms pulse/release timer. Use a Node `setTimeout` deadline
  race of `330_000ms`, not the installed page clock or Playwright default.

  Run before creating the driver:

  ```bash
  node --test scripts/lib/caribbean-campaign-victory-driver.test.mjs
  ```

  Expected RED: missing `caribbean-campaign-victory-driver.mjs`. Implement only
  the scheduler/adapter to make this focused command green.

- [ ] **Step 4: Write and observe the real-browser clock/trace RED**

  In `caribbean-campaign-victory-browser.test.mjs`, start the real preview and
  real `NavalSession`; no fake session/page adapter is permitted. Test the
  ordered fixture boundary:

  1. install seed, UUID, Web Lock, and storage context fixtures;
  2. create the page and install Playwright clock;
  3. install the page-scoped `Date.now` fixture after the clock;
  4. navigate and assert exact `nowConsumed` from campaign metrics;
  5. pause on encounter before clicking Pursue/session construction;
  6. assert tick-zero mount, first-RAF `runFor(16)` still tick zero, then exact
     six-tick public HUD boundaries under repeated real 16 ms RAF quanta;
  7. reload/remount under the installed paused clock and assert tick zero;
  8. exercise keyboard held/released rudder plus the public rudder button's
     140 ms timer; and
  9. run a deliberately truncated literal trace and require fail-closed exit
     `Normal-route naval victory was not reached`, including a terminal
     mid-cadence fixture.

  Run before editing the port command:

  ```bash
  node --test scripts/lib/caribbean-campaign-victory-browser.test.mjs
  ```

  Expected RED: the port command lacks the ordered clock boundary/exported
  `runStrategicSailingJourney`, and the truncated real route cannot produce the
  required failure contract. Schema-evaluator failure is not accepted.

- [ ] **Step 5: Implement the ordered normal-route public-control driver**

  Implement the exact Step 4 order in exported `runStrategicSailingJourney`.
  The old `context.addInitScript(Date.now)` must not run before or be overwritten
  by `page.clock.install`; install the page-scoped Date fixture afterward and
  require its consumed value in metrics. Pause while still on encounter, then
  click Pursue so the actual `NavalSession` mounts under the paused clock.
  `caribbean-port-check.mjs` calls `driveCampaignVictory({ page, trace })` with
  the exact Task 5 trace. Never import `captureCaptain`, `testFixtures`,
  `debugBridge`, or a session/outcome setter. Assert the saved input is
  `voyage-5-battle` / `1971161494`; terminal resolution is tick `11855`, seed
  `1310878278`, exact final systems. Expected wall time is under 90 seconds per
  run; set eight minutes for two clean runs and a real Node 330-second deadline
  per victory. Rerun the Step 4 command to GREEN.

- [ ] **Step 6: Write and observe CLI destination/cleanup/provenance RED**

  Test exported verification helpers and the CLI with injected temp/docs roots.
  Required matrix:

  | Mode/case | Destination and comparison | Exact result |
  | --- | --- | --- |
  | semantic probe, tracked stale/current | unique temp; semantics only | exit 0, exactly `NAVAL_SEMANTIC_PROBE_OK tracked=stale` or `NAVAL_SEMANTIC_PROBE_OK tracked=current` |
  | capture, clean Task 6 HEAD | docs destination via `saveIfChanged` | exit 0, `NAVAL_CAPTURE_OK head=<sha> changed=<n>` |
  | final verify, clean post-capture HEAD | unique temp; normalized metrics + PNG byte comparison | exit 0, `NAVAL_VERIFY_OK capture=<sha> source=<sha> artifacts=<n>` |
  | missing/unknown mode | no destination | exit 1, `NAVAL_CLI_FAILED mode` |
  | semantic/stale/dirty/hash/source-file/metrics-byte/PNG-byte/destination/cleanup failure | no accepted output | exit 1, mode-specific `NAVAL_SEMANTIC_PROBE_FAILED <code>`, `NAVAL_CAPTURE_FAILED <code>`, or `NAVAL_VERIFY_FAILED <code>` |

  The verify fixture requires capture HEAD ancestor, exact source-file manifest
  and source hash, and a clean tracked worktree. Normalize only candidate/current
  `headCommitAtCapture` and `worktreeDirtyBeforeCapture` to tracked values before
  metrics byte comparison. Inject one stale capture, dirty source, changed hash,
  changed source-file list, JSON byte drift, PNG byte drift, wrong destination,
  and cleanup failure. Both success and every failure remove the exact temp
  directory in `finally`; tests inspect cleanup without touching tracked docs.
  Failure `<code>` is the literal union `semantic | stale-capture |
  dirty-worktree | source-hash | source-files | metrics-byte | screenshot-byte
  | destination | cleanup`, restricted to the mode that owns that check.

  Run before editing the CLI/destination code:

  ```bash
  node --test scripts/lib/caribbean-naval-verification.test.mjs scripts/lib/caribbean-naval-check.test.mjs
  ```

  Expected RED: missing verification module and required modes/result codes.

- [ ] **Step 7: Implement semantic-probe, capture, and final verify modes**

  `--semantic-probe` generates in temp, runs harness/evaluator, skips tracked
  provenance/byte equality, reports whether tracked evidence is stale/current,
  and cleans. `--capture` alone owns docs and requires clean Task 6 HEAD.
  `--verify` is only the clean post-capture/post-commit byte gate described in
  Step 6. Missing/unknown mode fails, so nobody captures accidentally.

  Run the new source command after GREEN:

  ```bash
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  git status --short
  ```

  Expected: exit 0 with exactly `NAVAL_SEMANTIC_PROBE_OK tracked=stale` or
  `NAVAL_SEMANTIC_PROBE_OK tracked=current`; status
  contains only Task 6 source edits, no naval metrics/screenshots or temp dirs.

- [ ] **Step 8: Lock screenshot and isolation manifest**

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

- [ ] **Step 9: Mutation proof, focused verification, review, and commit**

  Mutate raw fixtures for duplicated resolution, changed literal event ID, changed mode order, terminal tick `11856`, wrong seed, `tickAfterReload: 1`, a naval request on avoid, missing prior v2 field, unknown nested key, and false recovery preservation. Each returns a failed verdict without throwing. Mutate one golden trace boundary, first-RAF behavior, clock/Date installation order, and each CLI destination; scheduler/browser/naval-verification tests must fail.

  Run:

  ```bash
  node --test scripts/lib/caribbean-port-identity-evidence.test.mjs
  node --test scripts/lib/caribbean-campaign-victory-driver.test.mjs
  node --test scripts/lib/caribbean-campaign-victory-browser.test.mjs
  node --test scripts/lib/caribbean-naval-verification.test.mjs
  node --test scripts/lib/caribbean-naval-check.test.mjs
  node --check scripts/caribbean-port-check.mjs
  node --check scripts/caribbean-naval-check.mjs
  mise exec node@20 -- npm run check
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  git diff --check
  ```

  Commit only source/schema/test changes:

  ```bash
  git add scripts/caribbean-port-check.mjs scripts/caribbean-naval-check.mjs scripts/lib/caribbean-port-identity-evidence.mjs scripts/lib/caribbean-port-identity-evidence.test.mjs scripts/lib/caribbean-campaign-victory-driver.mjs scripts/lib/caribbean-campaign-victory-driver.test.mjs scripts/lib/caribbean-campaign-victory-browser.test.mjs scripts/lib/caribbean-naval-verification.mjs scripts/lib/caribbean-naval-verification.test.mjs scripts/lib/caribbean-naval-check.test.mjs
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
- Modify: `docs/screenshots/caribbean-naval/metrics.json`
- Refresh only if bytes genuinely change through `--capture`: existing `docs/screenshots/caribbean-naval/*.png`
- Report only, ignored: `.superpowers/sdd/2026-08-24-caribbean-strategic-sailing/task-7-report.md`

**Interfaces:** Consumes Task 6 gates. Produces deterministic schema-v3 port evidence, refreshed naval provenance/evidence, and package documentation. No production source change belongs here; a browser defect returns to its owning task with a new RED and separate fix commit.

- [ ] **Step 1: Run focused and full automated gates fresh**

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  ```

  Read full output and record file/test counts, zero failures, and warning classification.

- [ ] **Step 2: Capture independent naval evidence from a clean Task 6 HEAD**

  Confirm `git status --short` is empty, record Task 6 full HEAD, then run the only mutating naval command exactly once before changing any other evidence/docs:

  ```bash
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check -- --capture
  ```

  Expected: Battle Lab passes; `docs/screenshots/caribbean-naval/metrics.json` records the exact clean Task 6 HEAD, `worktreeDirtyBeforeCapture: false`, and the new source hash. Only metrics and genuinely changed naval screenshots appear in status. Record every changed path; Task 7 owns all of them.

- [ ] **Step 3: Run normal-route evidence twice through its command**

  ```bash
  mise exec node@20 -- npm run caribbean:port-check
  ```

  Expected: schema version 3 accepted; the command's two internal clean-localStorage runs produce byte-identical screenshots/metrics; exact IDs/modes/RNG/input, public-control victory at tick `11855`, exactly-once resolution, focus, and recovery pass; no console/page/request failure. The command itself compares run A to run B before writing either result, so no separate capture invocation is needed.

- [ ] **Step 4: Prove non-writing harness verification and normal/harness isolation**

  ```bash
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  ```

  Expected: exactly `NAVAL_SEMANTIC_PROBE_OK tracked=stale` or
  `NAVAL_SEMANTIC_PROBE_OK tracked=current`; Battle Lab still
  passes its full-bleed/handedness/fallback/resource gate even though Task 7's
  evidence worktree is intentionally dirty. Inspect normal `dist` and evidence
  to confirm only production lazy naval assets are present and no harness
  entry/debug/config marker ships.

- [ ] **Step 5: Inspect every changed screenshot at original resolution**

  Inspect 1440x900, 1180x820, 1024x768, exact 960x600, HTML fallback, and portrait notice. Verify: historical one-mast silhouette; sea-dominant composition; functional brass route line; compact modern controls; exact consequences; no clipping/overlap/scroll; readable focus; full-bleed battle unchanged; result/return action clear; Captain's Log outcome; unsupported notice only.

  Record observations as engineering visual review. Do not label human comprehension, touch quality, Safari, or target-iPad performance observed.

- [ ] **Step 6: Update the career evidence ledger**

  In `README.md`, document the new command path, exact screenshots, reload semantics, safe-return/persistent-damage boundary, lazy production naval isolation, and remaining human/iPad evidence. Do not change the governing product dossier or claim the naval milestone is production-ready.

- [ ] **Step 7: Run fresh pre-commit verification and inspect exact owned changes**

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  git diff --check
  git status --short
  ```

  Verify every status path is in the Task 7 file list, semantic probe added no
  change, no temporary/raw traces/debug globals/build artifacts remain, and
  both screenshot trees contain only gate-owned bytes. `--verify` is
  intentionally not run against this dirty pre-commit tree.

- [ ] **Step 8: Commit all owned evidence and documentation**

  ```bash
  git add docs/games/caribbean-career/README.md docs/screenshots/caribbean-port docs/screenshots/caribbean-naval
  git commit -m "test(caribbean): verify strategic sailing loop"
  ```

- [ ] **Step 9: Run post-commit non-writing verification and cumulative zero-finding review**

  Run `npm run caribbean:naval-check -- --verify`, `git diff HEAD^ HEAD --check`, and `git status --short`; require exit 0 and empty status. Do not rerun `--capture` after the evidence commit because that would falsify the clean Task 6 capture provenance.

  Review from plan execution base through Task 7 HEAD. Required topics: source-of-truth rule reuse; event/validator totality; RNG lineage; old-save compatibility; replay/compaction; writer conflicts/consent/recovery; no mutation during battle; terminal exactly-once; reload restart disclosure; session disposal; safe-return ruling; Set Sail readiness; a11y; lazy isolation; deterministic evidence; scope discipline.

  Any BLOCKER, MAJOR, or MINOR returns to the owning task with a new failing test and separate fix commit. Repeat fresh focused/full/browser verification after fixes. Package close requires zero findings and clean tracked status.

---

## Package Exit Criteria

The package is complete only when every statement is evidenced:

1. Set Sail has one canonical readiness oracle with exact precedence; post-victory displays `The Red Jackdaw lead is complete.`, never an impossible Tavern instruction.
2. The accepted route enters saved `sailing`, consumes exactly one outbound day/provision, advances navigation RNG once, and enters the matching saved encounter.
3. Avoid and battle withdrawal spend the guaranteed return day/provision, journal a compact result, return safely, and retain the active lead unless it expires.
4. Pursuit advances naval RNG once and persists one input built through `createRedJackdawBattleInput` before a naval session mounts.
5. The production route uses the approved full-bleed battle without copied aim/boarding/outcome rules or campaign writes during ticks.
6. A terminal naval state is projected/validated inside the naval domain, cannot exceed saved ship values/time limit, and becomes exactly one `naval-resolved` event only on Return to Bridgetown.
7. Victory alone completes the Red Jackdaw/target; avoid, withdraw, escape, separation, and defeat allow another attempt while the lead/provisions permit it.
8. Final tactical condition is journaled while the pre-battle flagship remains serviceable under the explicit safe-return rule; no half-built repair/capture system ships.
9. Pause freezes the live session; background leaves it paused; nonterminal withdrawal pauses synchronously before writer await and stays paused through pending/conflict/reject/reload; reload/unsupported resize otherwise disposes and restarts from identical saved input at tick zero with plain disclosure.
10. Sailing/encounter/naval satisfy exact checkpoint/ID/lead/target/provision and naval RNG/full-builder invariants after direct load, compaction, and recovery without predecessor events.
11. Replay from event zero and a nonzero compacted checkpoint yields canonical equality; `lastVoyage`, time, provisions, RNG, lead, target, and event ID survive compaction.
12. Existing V1 saves load byte-valid with no required migration; the first new save rotates old raw bytes normally; intermediate-mode recovery preserves unreadable data.
13. Every simultaneous named-action pair in persisted/memory-only modes fulfills with at most one applied event; the A/runtime-swap/B/A-settles/C matrix preserves B ownership; departure clearing and return focus occur exactly once at saved/direct-memory/delayed-memory publication.
14. Consent/conflict keeps the predecessor route and terminal modal mounted; invalid resolution has campaign-specific restart/withdraw while a valid result has Return only.
15. Landscape `>=960x600` works with 14 px/44 px/focus/contrast/overflow/reduced-motion guarantees; phones and portrait mount only the notice.
16. Normal setup/port/sailing/avoid does not request naval assets; pursuit loads only local production assets; no harness/debug module ships; Battle Lab remains independently green.
17. The real-session literal public-control trace mounts at tick zero, primes first RAF without a tick, advances through actual 16 ms RAF quanta to exact six-tick publications/final tick `11855`, preserves ordered clock/Date fixtures and `nowConsumed`, and fails closed on drift, timeout, or non-victory.
18. Schema-v3 normal-route metrics and all screenshots are byte-identical across two clean runs and fail closed on malformed/unknown evidence.
19. Naval semantic probe is non-writing and tolerates stale tracked provenance; Task 7's clean-Task-6-HEAD capture owns/stages evidence; final clean post-commit `--verify` proves source/hash/provenance and normalized metric/PNG byte equality without changing tracked bytes.
20. Focused tests, full tests, check, normal/harness builds, both browser gates, diff checks, task reviews, and cumulative review have fresh zero-failure evidence.
21. Human first-time and target-iPad Safari/touch/offline/thermal observations remain honestly unobserved unless actually performed.
22. Worktree is clean; no merge, push, rebase, fetch, or main change occurred.
