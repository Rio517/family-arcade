# Caribbean Strategic Sailing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic, saveable Bridgetown -> authored sea leg -> pursue/avoid contact -> existing naval battle -> journaled safe return loop on the normal Caribbean route.

**Architecture:** Persist each strategic phase in the existing campaign journal and create naval combat from one serialized `NavalBattleInput`; keep the 60 Hz `NavalSession` transient and campaign-immutable until withdrawal or a validated terminal result. Reuse the existing writer, rotating saves, recovery, full-bleed battle, and minimum-screen gate, while widening V1 validation only for already-reserved modes and one optional compacted outcome summary.

**Tech Stack:** TypeScript 5.6, React 18, Vitest 2, Testing Library, React Router 6, Web Locks, localStorage, Three.js 0.170, Vite 5, Playwright, CSS, and the existing canonical JSON/FNV-1a save stack. No new dependency is justified.

**Spec:** `docs/designs/2026-08-24-caribbean-strategic-sailing-design.md`

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
- Every existing evidence `*.test.mjs` that imports `vitest` runs only through `mise exec node@20 -- npx vitest run`. Deliberate native suites use the non-Vitest suffix `.node-test.mjs`, import `node:test`/`node:assert`, run separately through `mise exec node@20 -- node --test`, and dynamically import the missing module inside a named test so the RED is collected before that named contract fails. The full Vitest glob must not collect native suites.
- Named controller actions acquire a synchronous `{ generation, token }` owner before reading state/drafting and release only when that exact owner still matches after dispatch settles; a stale completion can never release a new-runtime action. Duplicate promises fulfill with at most one `applied` and never reject because of the duplicate.
- Every task report records the production mutation that each test catches and confirms expected literals are hand-derived rather than computed with the code under test.
- Every UI task runs a real production browser gate before package completion. Stable evidence is deterministic, honest performance/pixel observations use their exact approved boundary, every gate fails closed, and all existing version-2 port evidence channels remain present. The integrated normal route byte-compares metrics and 22 of its exact 23 screenshots; only `campaign-result-desktop.png` is observational, with exact A/B stable semantic digest/state equality, independently validated and verbatim per-run post-present framebuffer observations, PNG/dimension validity, tracked run-A ownership, and original-resolution inspection instead of a pixel threshold.
- Before every Task 1–6 source commit, run the task's focused suite, `mise exec node@20 -- npm run check`, full `mise exec node@20 -- npx vitest run`, clean `mise exec node@20 -- npx tsc -b --force`, and real `mise exec node@20 -- npm run build`, then `git diff --check`. The forced solution build is the clean typecheck; the following package build is the required production Vite build. Do not delete caches.
- Tasks 4 and 5 must run their owned normal-production browser mode, inspect and stage its gate-owned screenshots in the same UI commit. Task 7 may recapture them cumulatively but cannot supply missing per-commit browser evidence retroactively. The terminal result screenshot never gains an undocumented exact-byte claim merely because one capture happens to repeat.
- Naval source provenance uses Task 6's deterministic `git ls-files` seed plus transitive tracked-local import/HTML/CSS/build-entry closure, not a hand-maintained final file list; unresolved/omitted local dependencies fail closed, path membership/order and raw-byte hashes are exact, and live performance/PNG pixels remain observational.

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
| Strategic UI | create voyage screens plus `components/setup/PersistenceDecisionOverlay.tsx` and tests; modify port/log/page and normal-route browser code; own voyage screenshots | Port departure, authored leg/contact, active-route consent/conflict overlay, lazy saved-input battle, return/reload focus and log |
| Battle integration | modify `MinimumScreenGate`, `CampaignNavalBattle`, `CaribbeanPage`, `NavalBattlePage`, `BattleHud`, `NavalSession`, hooks/tests/browser driver; create golden victory JSON and own battle screenshots | Pause/reload/resize lifecycle, valid Return, invalid-resolution restart/withdraw, exactly-once safe return, public tick contract |
| Evidence | modify integration tests, port browser script/evaluator/tests, naval-check script/tests, package docs, port/naval metrics/screenshots | Exact strategic stable/one-terminal-observation evidence, stable naval manifest plus honest observational ranges, capture ownership, normal/harness isolation |

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

// state/useCaribbean.ts — Task 3 internal boundary
export interface EventPublication {
  predecessor: CampaignJournal;
  publishedJournal: CampaignJournal;
  appendedEvent: CampaignEvent;
}
type PublishEventCandidate = (
  generation: number,
  publication: EventPublication,
) => void;

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

// components/MinimumScreenGate.tsx — Task 5
export interface MinimumScreenGateProps {
  children(supportGeneration: number): ReactNode;
}
// supportGeneration is 0 on initial support and increments only on each
// unsupported -> supported transition. Children are not invoked while blocked.

// scripts/lib/caribbean-naval-verification.mjs — Task 6
export const CARIBBEAN_NAVAL_SOURCE_SEEDS: readonly string[];
export interface CaribbeanNavalSourceRow { path: string; sha256: string }
export interface CaribbeanNavalSourceEdge {
  importer: string;
  specifier: string;
  target: string;
}
export interface CaribbeanNavalSourceAudit {
  seeds: string[];
  paths: string[];
  edges: CaribbeanNavalSourceEdge[];
}
export type CaribbeanNavalSourceDiagnostic =
  | 'nonliteral-dynamic-import'
  | 'nonliteral-commonjs-require'
  | 'unsupported-import-meta-glob';
export class CaribbeanNavalSourceAuditError extends Error {
  readonly code: 'source-files';
  readonly diagnostic: CaribbeanNavalSourceDiagnostic;
  readonly importer: string;
}
export interface CaribbeanNavalSourceManifest {
  files: CaribbeanNavalSourceRow[];
  sourceHash: string;
}
export function auditCaribbeanNavalSourceClosure(
  root: string,
): CaribbeanNavalSourceAudit;
export function collectCaribbeanNavalSourceManifest(
  root: string,
): CaribbeanNavalSourceManifest;
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
| 4 -> 5 | `PersistenceDecisionOverlay`, `CaribbeanPage.tsx`, `scripts/caribbean-port-check.mjs`, port screenshots | Task 4 makes consent/conflict an overlay and owns voyage browser evidence. Task 5 adds terminal/lifecycle integration and battle browser evidence without replacing overlay ownership. |
| 4 <-> 5 | `CampaignNavalBattle.tsx` | Task 4 creates lazy saved-input/rematch routing; Task 5 owns terminal Return, explicit resolution-error state, tick surface, and disposal. |
| 4 -> 7 | sailing/encounter test IDs and four owned screenshots | Task 4 captures/stages its normal-route screenshots with the UI commit; Task 7 may only cumulatively recapture through the same gate. |
| 5 -> 7 | result/withdraw/reload/resize test IDs, driver, lazy assets, and five owned screenshots | Task 5 captures/stages battle evidence with its UI commit; Task 7 may only cumulatively recapture. |
| 5 -> 6 | golden victory trace, driver, exact HUD tick, port browser command, and all Task 1/5 source paths | Task 5 produces the public-control driver needed for its browser proof; Task 6 derives the exact dependency-complete tracked source manifest and extends/tests its clock/evidence contracts without a session/debug hook. |
| 6 -> 7 | evidence schema v3/evaluator/screenshot list and naval `--semantic-probe`/`--verify`/`--capture` modes | Task 6 owns fail-closed/non-writing tooling; Task 7 alone captures generated port/naval bytes, uses semantic probe while dirty, and uses final verify only after its commit. |
| 1,2,3 | `domain/events.ts`, reducer, validator | Sequential only. Task 1 does not edit campaign events; Task 2 owns the complete union; Task 3 does not edit it. |
| 4,5 | `CaribbeanPage.tsx`, `scripts/caribbean-port-check.mjs`, port screenshots | Task 4 creates four-mode routing/voyage capture; Task 5 adds terminal consent/conflict, support-generation resume, and battle capture. Review Task 5 diff against Task 4 HEAD. |
| 6,7 | port/naval evidence scripts and generated bytes | Task 6 changes scripts/evaluators without generated bytes. Task 7 captures naval first from clean Task 6 HEAD, then captures port evidence, stages both owned trees, commits, and repeats with non-writing verify. |

No tasks may run in parallel against these shared surfaces. Independent review can reject each commit without invalidating a sibling task.

## Execution Preflight

- [ ] Confirm worktree, branch, base, and clean tracked status.

  Run:

  ```bash
  pwd
  git branch --show-current
  git rev-parse HEAD
  git log -1 --format=%H -- docs/plans/2026-08-24-caribbean-strategic-sailing.md docs/designs/2026-08-24-caribbean-strategic-sailing-design.md
  test "$(git rev-parse HEAD)" = "$(git log -1 --format=%H -- docs/plans/2026-08-24-caribbean-strategic-sailing.md docs/designs/2026-08-24-caribbean-strategic-sailing-design.md)"
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
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-art.test.mjs scripts/lib/caribbean-port-identity-evidence.test.mjs
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-naval-evidence.test.mjs scripts/lib/caribbean-naval-check.test.mjs scripts/lib/caribbean-naval-scenario.test.mjs
  git status --short
  ```

  Expected: Vitest collects every listed `.test.mjs` through its own runner;
  all commands exit 0, status remains empty, and only documented warning-only
  diagnostics remain. The forced solution build precedes the real package
  build, so incremental state cannot mask a type error. Do not run either
  current browser capture command here: both own generated evidence and the
  current naval command has no non-writing mode. Task 6 adds semantic-probe/
  final-verify modes; Task 7 owns the cumulative captures.

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
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
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
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
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

- [ ] **Step 1: Write every gate and publication RED before production**

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

  In the named Vitest case, dynamically import the absent gate so the suite
  collects before the missing-module assertion fails. Unit-test this literal ownership sequence against `NamedActionGate` for both
  persisted and memory-only labels: A acquires generation 1; `reset()` models a
  runtime swap; B acquires generation 2; A settles/releases; C attempts to
  acquire generation 2 and receives `null`; B releases; only then may the next
  action acquire. The controller integration repeats the matrix with deferred
  real dispatch promises and asserts A/B fulfill, C fulfills
  `{ kind: 'not-applied' }`, and no duplicate event/save appears.

  In `useCaribbean.test.tsx`, also write the full publication matrix now—not
  after the boundary exists. Cover deferred Web Lock, denied lock, write
  failure, immediate save, direct memory, delayed Continue without saving,
  conflict-to-memory, retry, repeated consent, runtime replacement, stale
  completion, duplicate terminal resolution, and reload-discard. For every
  open activity (`governor`, `tavern`, `market`, `shipyard`, `shares`, `log`),
  only a published `voyage-started` clears to `menu`; only a published avoid,
  withdraw, or resolve sets one-shot log focus.

  Add two threshold fixtures made entirely through real `appendJournal` and
  legal drafts. The exact departure stream is event 1 `lead-accepted`, events
  2–256 as 255 alternating valid Bridgetown provision trades, then event 257
  `voyage-started`. The exact resolution stream is event 1 `lead-accepted`,
  events 2–253 as 252 alternating valid Bridgetown provision trades, event 254
  `voyage-started`, event 255 `sea-leg-completed`, event 256 `naval-engaged`,
  then the matching event 257 `naval-resolved`. Assert every quoted trade is
  `ok: true`, the event IDs/types above are literal, and the resolution uses
  the naval input produced at event 256.

  Run both histories through (a) immediate save and (b) writer denial ->
  memory publication -> Retry saving. Immediate save adopts the writer's
  compacted journal while applying the original event's activity/focus once.
  Denial first adopts the 257-event memory journal and applies once; Retry then
  adopts the compacted writer journal without applying again. Every compacted
  result has `events: []`, `initial` deeply and canonically equal to `state`,
  and `initial !== state` by reference. Assert live journal canonical JSON
  equals loaded saved journal after immediate save/retry; departure clears the
  original activity exactly once, resolution focuses Log exactly once, and the
  retained terminal outcome remains in `lastVoyage`.

- [ ] **Step 2: Capture controller RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state/namedActionGate.test.ts src/games/caribbean/state/useCaribbean.test.tsx src/games/caribbean/state/selectors.test.ts src/games/caribbean/state/runtime.test.ts
  ```

  Expected: Vitest collects all four suites. The named gate suite fails because
  `state/namedActionGate` is missing; controller tests separately report the
  missing six actions, absent A/B/C ownership, absent saved/direct/delayed
  publication effects, and compacted outcome/live-journal mismatch.
  `runtime.test.ts` names the exact failing assertion: expected new
  `caribbean-sailing-1`, received old `caribbean-port-1`. A runner-
  initialization error is not an accepted RED.

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
  call the exact `PublishEventCandidate` boundary declared above. `dispatch`
  extracts `appendedEvent` from the original one-event candidate before any
  writer call. The boundary adopts `publication.publishedJournal` and consumes
  `{ campaignId, id: appendedEvent.id, type: appendedEvent.type }` once per
  runtime generation. Only there:

  - `voyage-started` sets activity to `menu`;
  - `encounter-avoided`, `battle-withdrawn`, and `naval-resolved` set
    `portFocusTarget` to `last-voyage`; and
  - all other event types have no transient effect.

  The persistence writer still owns candidate creation/revision/conflict. The
  event and memory-save pending intents retain `appendedEvent`. On immediate
  success, pass the original predecessor/event with
  `publishedJournal: outcome.journal`, so writer compaction is adopted exactly.
  Direct/delayed memory passes the memory candidate. Retry passes the writer's
  possibly compacted outcome plus the retained event; its already-consumed
  token updates the live journal shape without repeating activity/focus.
  Repeated consent, conflict refresh, or stale completion cannot consume twice.
  Denial, write failure, pending consent, and unresolved conflict do not
  consume before publication. Reload external save discards the pending event.
  Named bindings remain direct:

  ```ts
  const publication: EventPublication = {
    predecessor: intent.predecessor,
    publishedJournal: outcome.journal,
    appendedEvent: intent.appendedEvent,
  };
  publishEventCandidate(generation, publication);
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

- [ ] **Step 4: Run the complete focused GREEN**

  Rerun the exact Step 2 command, including `runtime.test.ts`. Expected: every
  gate, six-action, publication, both legal event-257 immediate/denial-retry
  histories, failure, retry, selector, and exact `caribbean-sailing-1` runtime
  case passes; no save occurs from controller construction/resume alone for a
  saved naval snapshot.

- [ ] **Step 5: Mutation proof, verification, review, and commit**

  Temporarily let `release` compare generation only; the A/runtime-swap/B/A-settles/C matrix must fail because stale A admits C. Restore it. Temporarily adopt the original candidate instead of `outcome.journal`; both event-257 immediate-save cases must fail canonical equality. Alias compacted `initial` and `state`; both histories must fail reference isolation. Drop `appendedEvent` on compaction; the activity/focus cases must fail. Clear the consumed-token set on retry; both denial-memory-retry cases must fail duplicate effects. Restore them. Temporarily call `appendJournal` directly in `resolveBattle`; the storage-failure case must fail. Restore it. Restore `runtime.ts` to `caribbean-port-1`; the focused runtime assertion must fail with the literal old/new mismatch.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/state src/games/caribbean/storage/writer.test.ts
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
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
- Modify: `scripts/caribbean-port-check.mjs`
- Create: `docs/screenshots/caribbean-port/sailing-desktop.png`
- Create: `docs/screenshots/caribbean-port/encounter-desktop.png`
- Create: `docs/screenshots/caribbean-port/sailing-minimum-supported.png`
- Create: `docs/screenshots/caribbean-port/sailing-large-portrait-notice.png`

**Interfaces:** Consumes controller Task 3, readiness/copy/state Task 2, and existing `MinimumScreenGate`. Produces stable test IDs `port-action-set-sail`, `voyage-continue-east`, `encounter-avoid`, `encounter-pursue`, `voyage-status`, `voyage-instrument`, `captains-log-last-voyage`, and `campaign-persistence-dialog`, plus an active-route consent/conflict overlay reused by Task 5.

- [ ] **Step 1: Write and observe the production-browser RED before component test imports exist**

  Before production UI or component-test edits, add required
  `--ui-slice=voyage` parsing and the fixed seed/UUID/Date/Web-Lock normal-route
  journey to `scripts/caribbean-port-check.mjs`. It builds/serves normal
  `dist`, starts from clean localStorage, commissions the campaign, marks the
  lead, and drives only rendered setup/port/Set Sail/Continue controls. It
  writes only the four Task 4 screenshots after every assertion succeeds.

  Run against the still-buildable pre-feature source:

  ```bash
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- node scripts/caribbean-port-check.mjs --ui-slice=voyage
  ```

  Expected: the browser reaches the normal production port then exits 1 with
  exactly `CARIBBEAN_VOYAGE_UI_FAILED missing-port-action-set-sail`; it writes
  no screenshot. Build/runner failure is not an accepted RED. This harness edit
  is test infrastructure, not production behavior.

- [ ] **Step 2: Write Port, voyage, and encounter RED tests**

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

  `SailingPage` must show Bridgetown, exact bearing/wind, 1-day/1-provision outbound consequence, current total provisions, and one Continue east action. `EncounterPage` must focus its heading and state exact consequences: Avoid spends the guaranteed return cost and keeps the lead; Pursue enters the two-to-four-minute duel. Buttons synchronously guard pending calls and announce applied/not-applied.

  Because the new voyage modules do not exist at RED, dynamically import each
  one inside its named Vitest case rather than through a top-level import. The
  suite must register before that named missing-module failure occurs; remove
  no assertion when the module is added for GREEN.

  The route SVG must be `aria-hidden`; semantic text must contain the same facts. Depart through Set Sail while Governor's House, Tavern, Market, Shipyard, Divide Shares, and Captain's Log are each open; an applied controller response routes to sailing with activity `menu`, while a not-applied response leaves the exact activity open.

- [ ] **Step 3: Write overlay, setup, Log, focus, and CSS/accessibility RED tests**

  Extract the existing consent/conflict choices from `CampaignSetup` into `PersistenceDecisionOverlay` without changing their controller methods or exact test IDs. With a non-null port, sailing, encounter, or naval journal, render `consent-required` and `save-conflict` phases and assert the mode screen stays mounted beneath `role="dialog"`, the route branch is inert, initial focus enters the first decision, Tab is trapped, export changes no route, and Escape cannot silently dismiss a required choice. A null journal still uses `CampaignSetup`; recovery phases still use `RecoveryPanel`.

  Add port focus cases: same-session avoid/withdraw/resolve with `portFocusTarget: 'last-voyage'` focuses `port-action-log` and acknowledges once; reload/resume into ready port focuses `port-action-set-sail`; reload of a victorious port focuses `port-action-log`; a new port campaign with neither readiness nor summary focuses the harbour heading.

  Before editing `CaptainsLog.tsx`, create a damaged terminal `lastVoyage`
  fixture in `CaptainsLog.test.tsx`. Require the exact terminal outcome remains
  present, the pre-battle hull/sails/crew/cannon values remain unchanged, and
  “Bridgetown’s harbour crew made Mistral ready for the next departure; the
  battle outcome remains in this log, but its damage is not carried onto the
  ready flagship.” is visible.
  Avoid-only results must not render battle-damage copy. Task 4 owns this
  component proof only; `caribbean.integration.test.tsx` remains wholly in Task
  5's file list, RED, implementation, and staging boundary.

  Before editing either CSS file, write `voyageResponsive.test.tsx` and static
  CSS assertions for fixed full-screen stage, minimum 44 px controls, 14 px
  copy, opaque decision backplates, safe-area padding, zero outer horizontal
  overflow, reduced-motion override, no dominant production-grid background,
  and no portrait/phone rule that bypasses `MinimumScreenGate`. Component tests
  also require heading focus after mode change, a stable status node,
  `:focus-visible`, no emoji, and no inaccessible SVG name duplication.
  One named static test reads existing `production.css` first and requires the
  checked-in `8.333% 100%` grid layer to be absent, producing a concrete RED on
  existing bytes before any CSS edit. A separate named test reads the absent
  voyage CSS and fails there. Dynamically import the absent overlay inside its
  named test, so every suite collects before its missing-contract failure.

- [ ] **Step 4: Observe every Task 4 component and CSS RED before production edits**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/port/PortMenu.test.tsx src/games/caribbean/components/port/PortPage.test.tsx src/games/caribbean/components/voyage src/games/caribbean/components/setup/PersistenceDecisionOverlay.test.tsx src/games/caribbean/components/setup/CampaignSetup.test.tsx src/games/caribbean/components/log/CaptainsLog.test.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/styles/voyageResponsive.test.tsx
  ```

  Expected: Vitest collects every named suite. Record failures named
  `enables Set Sail only when voyage readiness is ready`, `focuses the
  published last voyage action once`, `renders the authored sea leg and
  encounter actions`, `traps focus in the required persistence overlay`,
  `keeps setup-only persistence decisions when the journal is null`, `keeps
  the active route beneath the persistence decision dialog`, `shows the
  safe-return explanation without mutating the flagship`, `removes the
  production grid before voyage composition`, and `enforces voyage responsive
  floors`.
  A collection/runner failure is not an accepted RED. Do not edit a Task 4
  production component or CSS file until this command has produced those
  failures.

- [ ] **Step 5: Implement mode routing, overlay ownership, and compact historical composition**

  `CaribbeanPage` routes `port`, `sailing`, and `encounter` synchronously. `showCampaign` is true whenever a journal exists and no recovery phase is active—even during consent/conflict. Render `PersistenceDecisionOverlay` as a sibling above the still-mounted route for those two phases; never render the commission form over a non-null active journal. The overlay captures the focused initiating element, uses `useModalFocus`, and returns focus when reload discards the candidate. Declare the naval branch with:

  ```ts
  const CampaignNavalBattle = lazy(() => import('./voyage/CampaignNavalBattle'));
  ```

  Create `CampaignNavalBattle` as a narrow saved-input adapter: assert naval mode, call `useNavalSession(mode.input)`, render the unchanged `NavalBattlePage`, and import `../../styles/battle.css` from this lazy module. At this task boundary the existing terminal rematch remains available; Task 5 replaces that terminal action additively with campaign return. Assert the campaign journal receives no event while this session ticks and unmount disposes it. Wrap only the naval branch in `Suspense` with a labelled `Loading the engagement…` status.

  Build the voyage page structure from the spec's six existing tokens/type
  roles, with semantic classes but without editing `voyage.css` or
  `production.css` yet. The full-screen sea/sky contains one inline SVG
  one-mast silhouette/brass wake; the route SVG is hidden from assistive
  technology while equivalent text remains present.

- [ ] **Step 6: Add compacted outcome log and exact port focus**

  `CaptainsLog` reads `state.world.lastVoyage` and derives one concise authored result line plus returned day. It retains the Red Jackdaw lead card. Exact examples:

  ```text
  Avoided contact · Returned to Bridgetown on day 2.
  Victory — Red Jackdaw surrendered · Returned on day 4.
  Withdrawn from battle · Returned on day 4.
  ```

  After every naval result line, render this exact additional sentence:

  ```text
  Bridgetown’s harbour crew made Mistral ready for the next departure; the battle outcome remains in this log, but its damage is not carried onto the ready flagship.
  ```

  The already-red `CaptainsLog.test.tsx` starts from a damaged terminal
  resolution and proves `lastVoyage.outcome` remains exact, the flagship's
  pre-battle hull/sails/crew/cannon object is unchanged, and the sentence is
  visible. Avoid-only results do not show battle-damage copy.
  Outcome text is derived from codes and `NavalOutcome`; no event prose,
  repair action, or battle threshold is recreated.

  `PortPage` first consumes Task 3's `last-voyage` focus intent. Without an intent on mount/resume, focus Set Sail when readiness is ready, else Captain's Log when `lastVoyage` exists, else the harbour heading. Do not auto-open the log or alter canonical state.

- [ ] **Step 7: Implement CSS/accessibility GREEN and rerun the complete focused set**

  Now edit `voyage.css` and `production.css` to satisfy the already-observed
  Step 4 CSS failures. Use broad local sea/sky colour, opaque Deep Keel/Harbour
  Glass text backplates, 44 px controls, 14 px copy, safe-area padding, stable
  geometry, and a complete non-animated wake under reduced motion. Do not add a
  portrait/phone override around `MinimumScreenGate`.

  Rerun the exact Step 4 command. Expected: all Task 4 port, voyage, overlay,
  setup, Log, page, responsive, focus, and accessibility cases pass. This is
  the focused GREEN; no Task 4 test is first introduced after production.

- [ ] **Step 8: Capture owned browser evidence and run the per-source-commit gate**

  Kill/restore post-victory Set Sail copy, the exact harbour-readiness Log
  sentence, active-route rendering during `save-conflict`, overlay inert/focus,
  publication-only activity reset expectation, reload Set Sail focus, semantic
  wind text, and reduced-motion suppression. Each owning named test must fail.

  First rerun the voyage browser mode after GREEN:

  ```bash
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- node scripts/caribbean-port-check.mjs --ui-slice=voyage
  ```

  Expected: exit 0 with `CARIBBEAN_VOYAGE_UI_OK screenshots=4`. Inspect all
  four PNGs at original resolution and require correct route composition,
  focus, copy, minimum landscape, and notice-only portrait; the command owns no
  other generated path.

  Then run the complete commit gate:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components src/games/caribbean/styles
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/components/port src/games/caribbean/components/log src/games/caribbean/components/voyage src/games/caribbean/components/setup/PersistenceDecisionOverlay.tsx src/games/caribbean/components/setup/PersistenceDecisionOverlay.test.tsx src/games/caribbean/components/setup/CampaignSetup.tsx src/games/caribbean/components/setup/CampaignSetup.test.tsx src/games/caribbean/components/CaribbeanPage.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/styles/voyage.css src/games/caribbean/styles/voyageResponsive.test.tsx src/games/caribbean/styles/production.css scripts/caribbean-port-check.mjs docs/screenshots/caribbean-port/sailing-desktop.png docs/screenshots/caribbean-port/encounter-desktop.png docs/screenshots/caribbean-port/sailing-minimum-supported.png docs/screenshots/caribbean-port/sailing-large-portrait-notice.png
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
- Modify: `src/games/caribbean/components/MinimumScreenGate.tsx`
- Modify: `src/games/caribbean/components/MinimumScreenGate.test.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Modify: `src/games/caribbean/caribbean.integration.test.tsx`
- Modify: `src/games/caribbean/styles/battle.css`
- Create: `scripts/fixtures/caribbean-campaign-victory.json`
- Create: `scripts/lib/caribbean-campaign-victory-driver.mjs`
- Create: `scripts/lib/caribbean-campaign-victory-driver.node-test.mjs`
- Modify: `scripts/caribbean-port-check.mjs`
- Create: `docs/screenshots/caribbean-port/campaign-battle-desktop.png`
- Create: `docs/screenshots/caribbean-port/campaign-result-desktop.png`
- Create: `docs/screenshots/caribbean-port/returned-log-desktop.png`
- Create: `docs/screenshots/caribbean-port/campaign-battle-fallback.png`
- Create: `docs/screenshots/caribbean-port/campaign-battle-resize-notice.png`

**Interfaces:** Consumes saved `mode.input`, Task 1 summary, Task 3 actions/focus, and Task 4's wrapper/overlay/browser mode. Produces additive `resultAction`, `exitAction`, `resolutionErrorAction`, `setPaused`, render-prop `MinimumScreenGateProps`, a visible exact-tick HUD surface, literal golden victory trace, public-control `driveCampaignVictory`, automatic support-restored resume, owned browser evidence, and safe-return behavior without changing the wrapper's default export.

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

- [ ] **Step 10: Observe and implement the native public-control driver RED**

  `caribbean-campaign-victory-driver.node-test.mjs` imports `test` from
  `node:test` and `assert` from `node:assert/strict`. Its named
  `exports and drives the public-control trace` test dynamically imports the
  absent driver, then exercises a fake rendered-control adapter. Run it alone:

  ```bash
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-driver.node-test.mjs
  ```

  Expected RED: Node collects the named test, which fails on missing
  `caribbean-campaign-victory-driver.mjs`; no Vitest-authored file is passed to
  Node. Implement `driveCampaignVictory({ page, trace, timeoutMs = 330_000 })`:
  require saved-input equality and tick-zero mount; advance 16 ms once and
  require first-RAF tick zero; apply each row through keyboard rudder and
  rendered sail/ammo/fire controls; advance repeated 16 ms quanta until exactly
  N+6 or terminal 11855; reject skip/overshoot/non-victory; race a real Node
  timeout. The native suite additionally asserts 140-ms rudder release and
  exact final outcome/seed. Rerun it to GREEN.

- [ ] **Step 11: Write routing, support-lifecycle, overlay, integration, and browser RED**

  Extend `MinimumScreenGate.test.tsx` and `CaribbeanPage.test.tsx` with saved
  naval journals. Initial resume mounts the lazy campaign battle at tick zero
  from exact input; remount constructs a fresh session with the same input; no
  auto-dispatch occurs. On a fresh `#/caribbean` route without `?resume=1`,
  create the campaign and reach its persisted naval mode in the same supported
  controller, then resize unsupported and
  assert the controller/session unmount/dispose and only the focused notice
  remains. Resize supported and require automatic persisted resume, a different
  session identity at tick zero, canonical-byte-equal input, and visible
  “Reloading restarts this engagement from first contact.” No controller hook
  call or RAF survives under the notice. Empty/unreadable storage follows
  setup/recovery rather than auto-creating a campaign.

  From a real terminal session click Return and force: writer denial/write failure -> consent; stale revision -> conflict; export; Continue without saving; and Reload newer save. In every pending case assert the normal result modal and exact terminal state remain mounted beneath `campaign-persistence-dialog`; no port copy appears. Continue publishes the pending candidate once and only then unmounts to port/log focus. Export changes neither route nor journal. Reload discards the candidate and retains/reveals the external naval predecessor; Return can be retried once without a rejected duplicate promise. A successful retry or memory consent produces exactly one resolution event.

  Extend `caribbean.integration.test.tsx` with the real component/controller journey:

  ```text
  setup -> mark lead -> Set Sail -> reload sailing -> Continue east
  -> Avoid -> port -> Set Sail -> Continue east -> Pursue
  -> saved naval input -> terminal real-domain result -> Return
  -> reload port -> Captain's Log
  ```

  Assert literal event IDs/types: `1 lead-accepted`, `2 voyage-started voyage-2`, `3 sea-leg-completed voyage-2-contact`, `4 encounter-avoided`, `5 voyage-started voyage-5`, `6 sea-leg-completed voyage-5-contact`, `7 naval-engaged voyage-5-battle`, `8 naval-resolved`; exact days, provisions, RNG transitions, mode sequence, one resolution, no campaign write during ticks, completed lead, disabled Set Sail reason `The Red Jackdaw lead is complete.`, Captain's Log return focus, exact harbour-readiness sentence, unchanged flagship, terminal `lastVoyage.outcome`, and canonical save/reload equality. A second fixture covers battle withdrawal and retained active lead.

  Extend `scripts/caribbean-port-check.mjs` with required
  `--ui-slice=battle`. It reuses Task 4's fixed fixtures and Task 5's driver,
  captures battle at tick zero, exact result at tick 11855, returned Log,
  forced HTML fallback, and the notice during a naval unsupported resize; it
  then resizes supported and asserts the automatic fresh tick-zero resume.

  Run before editing `MinimumScreenGate.tsx` or Task 5 routing:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/MinimumScreenGate.test.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- node scripts/caribbean-port-check.mjs --ui-slice=battle
  ```

  Expected RED: Vitest collects and names the missing terminal routing,
  support-generation resume, and full journal assertions. The browser reaches
  production battle/return but exits 1 with
  `CARIBBEAN_BATTLE_UI_FAILED support-restored-resume`; no screenshots are
  written. A runner/build/driver-import failure is not accepted.

- [ ] **Step 12: Implement routing and the unsupported-support generation**

  Change `MinimumScreenGate` to the exact render-prop interface declared above.
  Its state is `{ supported, supportGeneration }`; children are never invoked
  while unsupported, and a false -> true resize increments generation before
  invoking them. `CaribbeanPage` renders:

  ```tsx
  <MinimumScreenGate>
    {(supportGeneration) => (
      <ControllerPage
        key={`support-${supportGeneration}`}
        runtime={runtime}
        autoResume={requestedResume() || supportGeneration > 0}
      />
    )}
  </MinimumScreenGate>
  ```

  `ControllerPage` replaces its direct `requestedResume()` check with the
  `autoResume` prop while retaining all loaded/recovered/busy guards. The key
  guarantees fresh controller/session identity; persisted load supplies the
  canonical naval input. Implement the minimum terminal route props and rerun
  the Step 11 Vitest command to GREEN.

- [ ] **Step 13: Capture owned evidence, mutation proof, full gate, review, and commit**

  Kill/restore terminal in-flight guard, resolution-error branching, overlay route preservation, golden trace seed, exact HUD tick, clone boundary, hidden pause call, and lazy CSS ownership. Tests must catch duplicate resolve/rejected duplicate, invalid Return, terminal unmount on consent, non-winning trace, tick drift, mutable input leak, hidden ticking, and eager battle import.

  Mutate support generation to stay zero; the fresh-route resize test must land
  on setup and fail. Keep children mounted under notice; controller/RAF absence
  fails. Remove the harbour sentence or copy damage into flagship; Log and
  integration fail. Restore.

  Capture and inspect the five owned screenshots:

  ```bash
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- node scripts/caribbean-port-check.mjs --ui-slice=battle
  ```

  Expected: `CARIBBEAN_BATTLE_UI_OK screenshots=5`; exact tick-zero battle,
  result, returned Log/copy, fallback, and notice-only resize images are
  readable at original resolution. Then run:

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean/components/battle src/games/caribbean/components/voyage src/games/caribbean/state/naval src/games/caribbean/domain/naval/replay.test.ts src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-driver.node-test.mjs
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  git diff --check
  ```

  Commit:

  ```bash
  git add src/games/caribbean/components/voyage/CampaignNavalBattle.tsx src/games/caribbean/components/voyage/CampaignNavalBattle.test.tsx src/games/caribbean/components/battle/NavalBattlePage.tsx src/games/caribbean/components/battle/NavalBattlePage.test.tsx src/games/caribbean/components/battle/BattleHud.tsx src/games/caribbean/components/battle/BattleHud.test.tsx src/games/caribbean/components/MinimumScreenGate.tsx src/games/caribbean/components/MinimumScreenGate.test.tsx src/games/caribbean/state/naval src/games/caribbean/domain/naval/replay.test.ts src/games/caribbean/components/CaribbeanPage.tsx src/games/caribbean/components/CaribbeanPage.test.tsx src/games/caribbean/caribbean.integration.test.tsx src/games/caribbean/styles/battle.css scripts/fixtures/caribbean-campaign-victory.json scripts/lib/caribbean-campaign-victory-driver.mjs scripts/lib/caribbean-campaign-victory-driver.node-test.mjs scripts/caribbean-port-check.mjs docs/screenshots/caribbean-port/campaign-battle-desktop.png docs/screenshots/caribbean-port/campaign-result-desktop.png docs/screenshots/caribbean-port/returned-log-desktop.png docs/screenshots/caribbean-port/campaign-battle-fallback.png docs/screenshots/caribbean-port/campaign-battle-resize-notice.png
  git commit -m "feat(caribbean): connect campaign naval return"
  ```

---

### Task 6: Define the Integrated Route and Fail-Closed Evidence Contract

**Files:**

- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `scripts/caribbean-port-check.mjs`
- Verify unchanged: `scripts/lib/caribbean-campaign-victory-driver.mjs`
- Verify unchanged: `scripts/lib/caribbean-campaign-victory-driver.node-test.mjs`
- Create: `scripts/lib/caribbean-campaign-victory-browser.node-test.mjs`
- Create: `scripts/lib/caribbean-naval-verification.mjs`
- Create: `scripts/lib/caribbean-naval-verification.node-test.mjs`
- Modify: `scripts/caribbean-naval-check.mjs`
- Modify: `scripts/lib/caribbean-naval-check.test.mjs`

**Interfaces:** Consumes Task 5's literal `CampaignVictoryTrace`, `driveCampaignVictory`, public tick, browser modes/screenshots, and all production interfaces. Produces port evidence schema version 3, pure `compareNormalRouteScreenshotRuns`, `publishNormalRouteComparison`, its exact 22-byte/one-semantic screenshot boundary and tagged run-A byte ownership, `CARIBBEAN_NAVAL_SOURCE_SEEDS`/`auditCaribbeanNavalSourceClosure`/`collectCaribbeanNavalSourceManifest`, the exact `CaribbeanNavalSourceAuditError` syntax diagnostics, real clock integration, revised isolation, exact naval screenshot/stable-manifest contract, observational range validation, and naval `--semantic-probe`/`--verify`/`--capture` modes. Does not commit generated metrics/PNG bytes.

- [ ] **Step 1: Define exact schema-v3 evaluator tests**

  Put the serialized evaluator rows under exact describe name `schema-v3
  strategic sailing evidence`. Extend raw and normalized fixtures with:

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

  Add exact fields for focus, min text/target, contrast, overflow, viewport,
  requests, fallback, screenshot names, lazy isolation, and the spec's
  `screenshotEvidence` object. Preserve `determinism.screenshotsByteIdentical`
  but require its honest v3 value `false`; add exact
  `byteComparedScreenshotsIdentical: true`. The fixture has 23 exact names,
  22 byte-compared files, and exactly one exception name:
  `campaign-result-desktop.png`. Its observation row is exactly 1440x900,
  `webgl-composited-terminal`, `trackedCapture: 'run-a'`, and contains valid/
  nonempty run-A/run-B PNG facts, lowercase 64-hex `pngSha256` values, the
  stable normalized semantic state, two lowercase 64-hex SHA-256 canonical-JSON
  digests from the spec, and one explicit per-run `renderObservation`. The
  serialized evaluator validates each declared PNG hash only as lowercase
  64-hex because it has no PNG buffers; it never claims to recompute PNG
  hashes. It recomputes the stable semantic-state digests, requires the two
  semantic digests and complete stable states to be equal, and locks the
  terminal/player/opponent facts literally. Backend vendor and renderer are
  nonempty equal strings. Each `renderObservation` has literal kind
  `post-present-default-framebuffer-readpixels`; its `framebufferSample` has
  exactly algorithm `fnv1a32-rgba-grid-v1`, integer sample count `40`, integer
  nonzero-channel count in inclusive range `0..160`, and lowercase eight-hex
  `sampleHash`. The positive fixture uses the measured divergent pair run A
  `160` / `9df398c6` and run B `0` / `02187e45`, requires equal stable states
  and digests, and requires both render observations to survive verbatim. No
  `fingerprint` alias is accepted. Add independent run-A and run-B malformed
  fixtures for `-1`, `161`, `1.5`, sample count `39`, uppercase/nine-hex/
  non-hex hashes, wrong kind, and every missing/extra/wrong-type nested key.
  Add empty/equal-but-wrong backend and stable tick/result/canvas/outcome/seed/
  system drift rows. The evaluator rejects those plus false verification,
  wrong sequence/count, premature naval requests, harness markers, names
  outside the exact screenshot sets, an absent/unknown/second exception, or
  stable semantic/digest drift. It does not reject two independently valid
  render observations merely because their counts or hashes differ.

  Before any comparator or writer source edit, define and test this exact
  byte-bearing flow in the same test file under exact
  describe name `normal-route screenshot byte comparator`. Dynamically import
  the module inside each named test so a missing export is an assertion failure
  after collection, not runner initialization:

  ```ts
  interface NormalRouteScreenshotRun {
    run: 'A' | 'B';
    screenshotBuffers: ReadonlyMap<string, Buffer>;
    semanticStates: ReadonlyMap<string, TerminalResultSemanticState>;
    renderObservations: ReadonlyMap<string, TerminalResultRenderObservation>;
    checks: {
      routeFailures: 0; requestFailures: 0; consoleFailures: 0;
      pageFailures: 0; semanticProbesPassed: true;
    };
  }

  type NormalRouteScreenshotComparison =
    | { ok: false; issues: readonly string[] }
    | {
        ok: true;
        issues: readonly [];
        selectedRun: 'A';
        selectedArtifacts: ReadonlyMap<string, {
          sourceRun: 'A'; bytes: Buffer; sha256: string;
        }>;
        screenshotEvidence: NormalRouteScreenshotEvidence;
      };

  compareNormalRouteScreenshotRuns({
    expectedNames, runA, runB, declaredEvidence,
  }): NormalRouteScreenshotComparison;

  publishNormalRouteComparison({
    comparison, metricsBytes, outputDirectory,
  }): { artifactHashes: ReadonlyMap<string, string>; metricsSha256: string };
  ```

  Use valid generated 1440x900 PNG buffers. The positive fixture keeps 22 pairs
  byte-exact and gives only `campaign-result-desktop.png` different valid bytes
  with equal exact stable semantic state/digests and the measured divergent but
  independently valid render-observation pair. Require `ok: true`, literal
  `selectedRun: 'A'`, exactly 23 selected artifacts, every selected buffer to
  equal the corresponding run-A buffer, every selected hash to equal a fresh
  SHA-256 of run A, the result's run-A hash to differ from deliberately
  different run B, the returned evidence to retain both render observations
  verbatim, and a temp publication to hash identically to all 23 selections.
  The writer receives only the successful comparison, metrics bytes, and
  destination; it has no raw run-B input.

  The direct negative table changes one non-exempt buffer, omits/adds/renames
  an exception, adds a second exception, swaps tracked ownership, forges
  `selectedRun: 'B'`/B selected bytes before publication, corrupts the PNG
  signature, uses zero bytes or 1439x900 bytes, lies about either declared PNG
  hash, sets any run check failure count to one or semantic probe false, or
  applies any malformed stable-semantic or per-run render-observation fixture
  above, copies A's render observation over B, normalizes either valid sample,
  omits either observation, or puts the sample back inside stable semantic
  equality/digest input. Every negative row must fail without throwing and
  publish no artifact; the positive measured 160-vs-0 row kills the old exact
  sample-equality contract. The comparator reads
  signatures and embedded dimensions from the buffers, recomputes both PNG
  hashes, and cross-checks the declarations; fixture booleans never substitute
  for bytes. No fixture or implementation contains a pixel-delta, perceptual,
  colour, or similarity threshold.

- [ ] **Step 2: Capture evaluator RED and implement structure**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs
  ```

  Expected: Vitest collects the suite and schema 3 fixtures fail against the
  current schema-2 evaluator. The named pure comparator test also reaches its
  body and fails because `compareNormalRouteScreenshotRuns` and
  `publishNormalRouteComparison` are absent (or, if exposed only as the current
  blanket comparator, because it rejects the one valid byte-different result
  pair); the 22 exact-pair characterization stays green. A Vitest internal-
  state/runner failure is not an accepted RED.

  Update only the serialized evaluator and script structure here; do not
  implement the byte-bearing comparator/writer until Step 8. Keep every schema-2
  browser/route/build/viewport/fixture/Web-Lock/journey/accessibility/request/
  failure/profile/art/market/recovery/determinism field; the retained blanket
  screenshot boolean becomes `false` in schema v3 and the additive byte-
  compared/observational fields carry the exact replacement meaning. Revise
  isolation to distinguish emitted/precacheable from requested-before-pursuit.

  Run the two boundaries separately after the schema implementation:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs -t "schema-v3 strategic sailing evidence"
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs -t "normal-route screenshot byte comparator"
  ```

  Expected: every serialized schema-v3 row is GREEN. The pure comparator
  describe remains the same specific RED recorded above until Step 8; no source
  comparator is added here merely to make the full file green early.

- [ ] **Step 3: Reverify the Task 5 native scheduler boundary**

  Run the deliberate native suite separately under Node 20:

  ```bash
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-driver.node-test.mjs
  ```

  Expected: Node collects every named Task 5 scheduler case and all pass. Do
  not modify the driver or its native suite in Task 6; the real-browser RED is
  additive and cannot substitute a fake adapter for `NavalSession`.

- [ ] **Step 4: Write and observe the real-browser clock/trace RED**

  In `caribbean-campaign-victory-browser.node-test.mjs`, import `test` from
  `node:test`, dynamically import the port command inside the named
  `real NavalSession obeys installed clock boundaries` test, start the real preview and
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
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-browser.node-test.mjs
  ```

  Expected RED: Node collects the named test, which fails because the port
  command lacks exported `runStrategicSailingJourney`; the truncated real route
  then lacks the required failure contract. Schema-evaluator or runner failure
  is not accepted.

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
  `1310878278`, exact final systems. Completed public-control journeys measured
  268–277 seconds. Keep the real Node `330_000ms` fail-closed deadline for each
  victory, but budget `900_000ms` for the full default two-clean-run command,
  including two victories, build, base-route journeys, memory probes, warm-up,
  and cleanup. Set the existing one-journey plus truncated-trace native test to
  an explicit `600_000ms` test timeout. The separate native test that invokes
  the full A/B gate in Step 9 uses `1_020_000ms`, exceeding the complete command
  budget plus runner setup/cleanup. These outer budgets do not weaken the
  per-victory deadline.

  At the visible terminal result, read one normalized capture state through
  public DOM/WebGL APIs: exact HUD tick/result visibility; canvas size/rect,
  drawing buffer, opacity, transform, Three.js engine marker, WebGL vendor/
  renderer; exact terminal trace; and rendered player/opponent systems.
  Separately retain one
  explicit per-run render observation containing the fixed framebuffer sample
  with literal kind `post-present-default-framebuffer-readpixels`, exact algorithm
  `fnv1a32-rgba-grid-v1`, integer count `40`, integer nonzero channels in
  inclusive range `0..160`, and lowercase eight-hex `sampleHash`. Keep the
  already measured post-present `readPixels` ordering unchanged. Zero channels
  with hash `02187e45` and nonzero channels with another valid hash are both
  honest observations; retain each run verbatim and do not require them to
  repeat across A/B.
  Do not move sampling to a new render/frame hook, pre-present read,
  `preserveDrawingBuffer`, composited-PNG sample, added RAF, `gl.finish`, or any
  other unmeasured seam. Never copy, normalize, round, omit, or overwrite one
  run's observation with the other, and never introduce a pixel/perceptual
  threshold. The sample is per-run diagnostic render evidence, not proof of
  visible pixels. Exclude only the render observation from the stable semantic
  state and its canonical SHA-256 digest; SHA-256 the original PNG bytes
  separately. Capture the real full-page PNG without hiding/replacing the
  canvas or modifying product rendering. Public stable semantic equality
  remains exact tick/result, canvas/drawing buffer/backend, outcome/seed,
  systems, and zero route/request/console/page/semantic-probe failures; Task
  7's original-resolution A/B/tracked inspection owns visual truth.

  Remove the staged two-16ms terminal settle and the falsified normal-route
  experiments only: additional relative frames, absolute `performance.now`
  normalization, explicit final RAF/`gl.finish`, disposable route/renderer
  warm-up, Chromium `--deterministic-mode`, and any experimental explicit
  SwiftShader/software-compositor arguments added to the normal-route Chromium
  launch. Do not change the separate approved naval-harness environment:
  `scripts/caribbean-naval-check.mjs` retains `ANGLE_ARGS` exactly
  `['--use-gl=angle', '--use-angle=default',
  '--enable-unsafe-swiftshader']`. Rerun the Step 4 command to GREEN.

- [ ] **Step 6: Write and observe CLI destination/cleanup/provenance RED**

  Test exported verification helpers and the CLI with injected temp/docs roots.
  Replace `TASK8_TREE_FILES`; do not extend that historical fixed list. The
  exact `CARIBBEAN_NAVAL_SOURCE_SEEDS` passed as separate arguments after
  `git ls-files -z --` is:

  ```text
  package.json
  package-lock.json
  vite.config.ts
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  knip.json
  index.html
  preview-caribbean-game.html
  scripts/caribbean-port-check.mjs
  scripts/caribbean-naval-check.mjs
  scripts/fixtures/caribbean-campaign-victory.json
  :(glob)scripts/lib/caribbean-naval-*.mjs
  :(glob)scripts/lib/caribbean-port-identity-*.mjs
  :(glob)scripts/lib/caribbean-campaign-*.mjs
  :(glob)src/games/caribbean/**
  :(glob)public/**
  ```

  Independently call `git ls-files -z` once for the complete tracked universe.
  Parse NUL-delimited paths, normalize separators to `/`, reject duplicates and
  non-files, and sort bytewise ascending. Starting from the seeds, calculate a
  fixed-point local dependency closure with the exact spec algorithm:

  - use the installed TypeScript compiler API for static import/export,
    side-effect import, import-type nodes, literal dynamic import/require,
    triple-slash path, and literal local-file
    `new URL('./asset', import.meta.url)` edges in JS/TS variants;
  - extract local module-script sources and stylesheet/icon/manifest links from
    HTML, plus local `@import`/`url(...)` from CSS;
  - strip query/hash; load aliases from `tsconfig.app.json`, require the
    `vite.config.ts` alias object to agree, and literal-test
    `@shared`/`@games`/`@app`/`@test`; resolve relative and root/public paths
    through the literal extension/index list in the spec;
  - ignore `node:` and a bare package specifier only when its package root is
    declared in `package.json`; permit a type-only bare import through its
    declared `@types` name using the spec's scoped/unscoped mapping, and reject
    any other unknown bare/alias-like specifier;
    validate Vite's directory-valued
    `fileURLToPath(new URL(...))` alias roots as directories without adding file
    rows; and
  - enqueue every uniquely resolved tracked target. Reject unresolved or
    ambiguous local edges, nonliteral dynamic imports/requires, unsupported
    `import.meta.glob`, duplicates, or any resolved edge target absent from the
    final closure with `source-files`. The sole nonliteral-import execution
    ruling is `import(/* @vite-ignore */ modulePath)` where the exact sole
    identifier argument owns that exact leading comment. Resolve that argument
    through a TypeScript `Program`/`TypeChecker` symbol at the import occurrence,
    not a file-wide name map. The nearest visible declaration bound to that
    occurrence must be one unique, already-declared, same-file immutable
    `const`, initialized only by parenthesized/string-literal `+`
    concatenation; it must have no assignment/update references. Resolve the
    resulting local path uniquely to a tracked file and enqueue it. Parameter,
    catch, import, `let`, or dynamic inner-`const` shadowing; duplicate same-
    scope declarations; use before declaration or outside declaration scope;
    a comment on any node other than the argument's own leading trivia;
    unannotated identifiers; template substitution; referenced variables;
    calls; mutation; cross-file values; and unresolved/ambiguous results remain
    `nonliteral-dynamic-import`. Same-name valid consts in disjoint scopes each
    resolve only their own bound import; neither may bless another scope by
    identifier text.

  Sort the final closure paths bytewise. Hash each file's raw bytes as SHA-256
  into `{ path, sha256 }`; compute `sourceHash` as SHA-256 of canonical JSON for
  that complete row array. No observation, generated PNG, `dist`, or docs
  evidence path enters the closure.

  Required matrix:

  | Mode/case | Destination and comparison | Exact result |
  | --- | --- | --- |
  | semantic probe, tracked stale/current | unique temp; semantics only | exit 0, exactly `NAVAL_SEMANTIC_PROBE_OK tracked=stale` or `NAVAL_SEMANTIC_PROBE_OK tracked=current` |
  | capture, clean Task 6 HEAD | docs destination via `saveIfChanged` | exit 0, `NAVAL_CAPTURE_OK head=<sha> changed=<n>` |
  | final verify, clean post-capture HEAD | unique temp; canonical stable-manifest equality plus fresh observation/artifact range validation | exit 0, `NAVAL_VERIFY_OK capture=<sha> source=<sha> artifacts=<n>` |
  | missing/unknown mode | no destination | exit 1, `NAVAL_CLI_FAILED mode` |
  | semantic probe with any unsupported-loader fixture | no harness/docs output; exact temp removed | exit 1, exactly `NAVAL_SEMANTIC_PROBE_FAILED source-files diagnostic=<diagnostic>` |
  | capture with any unsupported-loader fixture | no harness/docs output; exact temp removed | exit 1, exactly `NAVAL_CAPTURE_FAILED source-files diagnostic=<diagnostic>` |
  | final verify with any unsupported-loader fixture | no accepted output; exact temp removed | exit 1, exactly `NAVAL_VERIFY_FAILED source-files diagnostic=<diagnostic>` |
  | semantic/stale/dirty/hash/source/stable-manifest/observation-range/artifact-manifest/destination/cleanup failure | no accepted output | exit 1, mode-specific `NAVAL_SEMANTIC_PROBE_FAILED <code>`, `NAVAL_CAPTURE_FAILED <code>`, or `NAVAL_VERIFY_FAILED <code>` |

  In the three unsupported-loader rows, `<diagnostic>` is tested separately as
  each exact literal `nonliteral-dynamic-import`,
  `nonliteral-commonjs-require`, and `unsupported-import-meta-glob`; one parser
  guard or shared fixture cannot satisfy another row.

  The verify fixture requires capture HEAD ancestor, exact source-file manifest
  and source hash, a zero-finding closure audit, and a clean tracked worktree.
  It compares candidate and current source rows for exact length, order, path,
  and per-file hash: missing,
  extra, or reordered rows fail `source-files`; equal paths with changed hashes
  or aggregate hash fail `source-hash`. Compare canonical bytes only
  for `stableManifest`: version 1; sorted source paths/hash; canonical input;
  viewport names/dimensions; screenshot name/dimension/semantic-state rows;
  local GLB path/hash; handedness; deterministic outcome facts without elapsed
  time; fallback; motion labels; and display booleans. Fresh PNGs are not byte-
  compared; require exact manifest rows, PNG signature, nonzero bytes,
  dimensions, and matching DOM state.

  Fresh observations use the exact spec ranges: 20 advancing unpaused samples;
  sustained FPS >= 50; draw calls <= 120; triangles <= 100000; boarding
  duration in `[0,15)`; zero post-warmup growth for textures/geometries/
  materials/buffer attributes/effect capacity; at least one bounded active
  effect; zero console/page/request/unhandled-rejection/allocation/capacity/pool failures. Live ticks/FPS/durations/frame/effect/resource
  samples, observation JSON bytes, and PNG pixels may differ.

  The native test performs two real temp generations through the actual harness
  and accepts them when stable manifests match even if observations differ. It
  also clones complete generation A, deliberately substitutes different valid
  FPS/duration/resource/frame values and different valid PNG pixels, and
  requires acceptance; then mutates one stable field, each observation range,
  and artifact name/dimension/signature to require rejection. A named
  `audits the real tracked dependency closure` test runs against the repository
  rather than an injected expected list. It asserts every recorded local edge's
  importer/target is in `audit.paths`, every target is tracked, no unresolved
  edge exists, and literal membership includes
  `src/shared/storage/kv.ts`, `src/shared/styles/tokens.css`,
  `src/app/main.tsx`, `src/app/App.tsx`, `src/app/registry.ts`,
  `src/games/caribbean/content/naval.ts`,
  `src/games/caribbean/domain/naval/resolution.ts`,
  `src/games/caribbean/state/naval/NavalSession.ts`,
  `src/games/caribbean/state/naval/FrameRunner.ts`,
  `src/games/caribbean/components/voyage/CampaignNavalBattle.tsx`,
  `src/games/caribbean/styles/battle.css`,
  `src/games/caribbean/assets/caribbean-sloop.glb`,
  `scripts/lib/caribbean-campaign-victory-driver.mjs`,
  `scripts/lib/caribbean-campaign-victory-browser.node-test.mjs`,
  `scripts/lib/caribbean-naval-verification.mjs`,
  `scripts/lib/caribbean-naval-verification.node-test.mjs`,
  `scripts/fixtures/caribbean-campaign-victory.json`,
  `scripts/caribbean-port-check.mjs`, `scripts/caribbean-naval-check.mjs`, and
  every literal seed/build/package input above. Assert the exact real edges
  `index.html` `/src/app/main.tsx` -> `src/app/main.tsx`, both
  `src/app/main.tsx` and `src/games/caribbean/preview.tsx`
  `@shared/styles/tokens.css` -> `src/shared/styles/tokens.css`, and
  `src/shared/profile/usersStore.ts` `@shared/storage/kv` ->
  `src/shared/storage/kv.ts`. In independent temporary graph
  fixtures created with `mkdtemp`, `git init`, and explicit `git add` (no
  commit/network/global config), cover relative+extensionless+directory-index,
  alias-config agreement and all four aliases;
  HTML `/src/app/main.tsx`; TypeScript side-effect CSS import; CSS `@import` and
  asset `url(...)`; literal dynamic import/require/new-URL; accepted declared
  package/`@types`/`node:` imports; and rejected unknown bare specifiers. Add a
  new tracked transitive local import and require the
  closure/manifest to grow by exactly its dependency edge; then remove that
  target from the tracked universe and require `source-files`.

  Before production exists, register these exact fixtures and three independent
  named native tests. `makeTrackedGraph` creates a separate `mkdtemp` root,
  writes the suite's already-valid package/TypeScript/Vite four-alias scaffold
  plus only the listed case files, then runs local `git init` and explicit
  `git add -- <all fixture paths>`; `t.after` removes that root. The case
  importers live under the real `:(glob)src/games/caribbean/**` seed. The helper
  performs no commit, network call, or global Git configuration.

  ```js
  const unsupportedLoaderFixtures = [
    {
      name: 'rejects nonliteral dynamic import with its source-files diagnostic',
      importer: 'src/games/caribbean/dynamic.mjs',
      diagnostic: 'nonliteral-dynamic-import',
      files: {
        'src/games/caribbean/dynamic.mjs': "const target = './dependency.mjs'; void import(target);\n",
        'src/games/caribbean/dependency.mjs': 'export default 1;\n',
      },
    },
    {
      name: 'rejects nonliteral CommonJS require with its source-files diagnostic',
      importer: 'src/games/caribbean/commonjs.cjs',
      diagnostic: 'nonliteral-commonjs-require',
      files: {
        'src/games/caribbean/commonjs.cjs': "const target = './dependency.cjs'; require(target);\n",
        'src/games/caribbean/dependency.cjs': 'module.exports = 1;\n',
      },
    },
    {
      name: 'rejects import.meta.glob with its source-files diagnostic',
      importer: 'src/games/caribbean/glob.ts',
      diagnostic: 'unsupported-import-meta-glob',
      files: {
        'src/games/caribbean/glob.ts': "export const modules = import.meta.glob('./views/*.tsx');\n",
        'src/games/caribbean/views/a.tsx': 'export default function A() { return null; }\n',
      },
    },
  ];

  for (const fixture of unsupportedLoaderFixtures) {
    test(fixture.name, async (t) => {
      const root = await makeTrackedGraph(t, fixture.files);
      const { auditCaribbeanNavalSourceClosure } =
        await import('./caribbean-naval-verification.mjs');
      assert.throws(
        () => auditCaribbeanNavalSourceClosure(root),
        (error) => {
          assert.equal(error?.constructor?.name, 'CaribbeanNavalSourceAuditError');
          assert.equal(error.code, 'source-files');
          assert.equal(error.diagnostic, fixture.diagnostic);
          assert.equal(error.importer, fixture.importer);
          assert.equal(
            error.message,
            `CARIBBEAN_SOURCE_AUDIT_FAILED source-files diagnostic=${fixture.diagnostic} importer=${fixture.importer}`,
          );
          return true;
        },
      );
    });
  }
  ```

  Before collector implementation, add positive native fixtures whose seeded
  importers contain the following exact forms. Each fixture gets its own
  `makeTrackedGraph` root and named test; do not combine files into one graph:

  ```js
  // same lexical block
  const modulePath = './annotated-' + 'dependency';
  void import(/* @vite-ignore */ modulePath);

  // enclosing declaration is the exact visible binding used by the real seed
  const modulePath = './annotated-' + 'dependency';
  test('loader', async () => import(/* @vite-ignore */ modulePath));

  // two disjoint scopes resolve independently, never by shared identifier text
  { const modulePath = './dependency-' + 'a'; void import(/* @vite-ignore */ modulePath); }
  { const modulePath = './dependency-' + 'b'; void import(/* @vite-ignore */ modulePath); }
  ```

  Track each exact target and require its edge/target in the closure. Then add
  this independent negative matrix; each row tracks any apparently referenced
  target so only binding/comment validation owns the failure, and each expects
  `nonliteral-dynamic-import` for its exact importer:

  | Named RED fixture | Exact rejected binding/comment shape |
  | --- | --- |
  | `rejects parameter shadowing of an annotated path` | valid outer const; `function load(modulePath) { import(/* @vite-ignore */ modulePath) }` |
  | `rejects catch shadowing of an annotated path` | valid outer const; `catch (modulePath) { import(/* @vite-ignore */ modulePath) }` |
  | `rejects an import binding as an annotated path` | `import { modulePath } from './source'; import(/* @vite-ignore */ modulePath)` |
  | `rejects inner let shadowing of an annotated path` | valid outer const; inner `let modulePath = runtime()` at the import |
  | `rejects dynamic inner const shadowing of an annotated path` | valid outer const; inner `const modulePath = './dependency-' + suffix` at the import |
  | `rejects reassignment or update of the resolved const symbol` | valid declaration plus `modulePath = runtime()` or `modulePath++` |
  | `rejects duplicate same-scope declarations` | two same-block `const modulePath` declarations before the import |
  | `rejects use before declaration` | annotated import precedes its same-block const declaration |
  | `rejects use outside declaration scope` | const exists only in a completed inner block; annotated import follows outside |
  | `rejects cross-scope name-map blessing` | valid const exists in an unrelated sibling scope while the annotated identifier at the import is unbound/dynamic |
  | `rejects referenced initializer state` | initializer concatenates a `suffix` identifier |
  | `rejects misplaced vite-ignore comments` | put the token on the declaration, before `import`, after the identifier, and in an unrelated comment; none is the identifier argument's exact leading comment |

  Run every negative fixture once through the direct audit and once through
  each of semantic-probe, capture, and verify. Each direct row asserts exact
  error class/code/importer/message. Each mode row asserts its exact
  `*_FAILED source-files diagnostic=nonliteral-dynamic-import` line, no
  accepted/harness/docs output, and exact `finally` cleanup. The RED run occurs
  before Step 7 source work, collects every named fixture, and fails against
  the current file-wide-name implementation rather than from runner startup.

  Because the absent verification module is imported inside each test body,
  Node collects all base-parser and annotated-binding names before RED failure.
  A separate test named
  `propagates every unsupported-loader diagnostic through every CLI mode and cleans`
  injects each fixture into semantic-probe, capture, and verify and requires
  the exact mode-specific failure string from the matrix, no accepted/harness/
  docs output, and exact temp cleanup in all nine rows. Mode parsing succeeds first;
  source audit owns the next precedence boundary, before harness launch,
  clean/stale/ancestry checks, or destination mutation, so no unrelated error
  can mask these diagnostics. Unresolved paths and ambiguous extension
  candidates remain separate `source-files` fixtures. Delete one captured
  critical row and inject one out-of-closure `README.md` row; both must fail
  `source-files`. Change one retained file hash; it must fail `source-hash`.
  Also inject stale capture, dirty source, wrong destination, and cleanup
  failure. Both success and every failure remove the exact temp directory in
  `finally`; tracked docs remain untouched.
  Failure `<code>` is the literal union `semantic | stale-capture |
  dirty-worktree | source-hash | source-files | stable-manifest |
  observation-range | artifact-manifest | destination | cleanup`, restricted
  to the mode that owns that check.

  `caribbean-naval-verification.node-test.mjs` dynamically imports the absent
  verification module inside named native tests. Keep the existing
  `caribbean-naval-check.test.mjs` Vitest suite separate. Run before editing the
  CLI/destination code:

  ```bash
  mise exec node@20 -- node --test scripts/lib/caribbean-naval-verification.node-test.mjs
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-naval-check.test.mjs
  ```

  Expected RED: Node output lists and collects `rejects nonliteral dynamic
  import with its source-files diagnostic`, `rejects nonliteral CommonJS
  require with its source-files diagnostic`, `rejects import.meta.glob with its
  source-files diagnostic`, and `propagates every unsupported-loader diagnostic
  through every CLI mode and cleans`, the nine-row base parser table, all three
  positive annotated-binding fixtures, every direct negative binding/comment
  row above, and all three CLI-propagation rows for every negative fixture,
  plus named real-closure, resolver, omitted-import, missing/extra/hash-drift,
  stable/observation, and cleanup tests. The binding fixtures specifically fail
  against name-based resolution or the absent verification implementation after
  collection, never runner initialization. Vitest independently collects the
  existing CLI suite and fails on historical `TASK8_TREE_FILES`/missing required
  modes and result codes. Runner-initialization failure is not accepted.

- [ ] **Step 7: Implement semantic-probe, capture, and final verify modes**

  Implement the exact seed/closure collector, including the approved annotated
  same-file literal-const exception. Construct a TypeScript `Program` and
  `TypeChecker` for each parsed importer, call `getSymbolAtLocation` on the
  exact import argument, and inspect that symbol's declaration/reference nodes.
  Accept only the nearest visible unique declaration that meets Step 6's const,
  position, initializer, immutability, and exact leading-comment rules. Never
  collect consts into a file-wide identifier map or search `node.getText()` for
  the annotation. Resolve same-name declarations independently by symbol and
  reject every shadowed/dynamic/misplaced-comment fixture. Remove
  `TASK8_TREE_FILES`.
  `--semantic-probe` generates in temp, runs harness/evaluator, skips tracked
  provenance/artifact equality, reports tracked current when source plus stable
  manifest match (regardless of observation bytes), reports stale otherwise,
  and cleans. `--capture` alone owns docs and requires clean Task 6 HEAD.
  `--verify` is only the clean post-capture/post-commit stable-manifest plus
  fresh-observation gate described in Step 6. Missing/unknown mode fails, so
  nobody captures accidentally. Do not freeze, normalize, or byte-compare
  honest performance/PNG observations.

  Before the real-repository GREEN audit, stage exactly the Task 6 source list
  from Step 9. `git ls-files` must see the three newly created native/module
  files as members of the prospective commit; an untracked-file union is not
  permitted in the production collector. Do not commit yet. Require the audit
  to include the browser native test and both verification module/test paths
  literally.

  Rerun the two Step 6 commands. Expected: every named native real-closure,
  resolver, omitted-import, three distinct unsupported-loader diagnostics,
  nine mode-propagation/cleanup rows, missing/extra/hash-drift, two-generation,
  stable-drift, range, artifact, destination, and cleanup test passes; the
  existing Vitest CLI suite passes under Vitest.

  Run the new source command after GREEN:

  ```bash
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  git status --short
  ```

  Expected: exit 0 with exactly `NAVAL_SEMANTIC_PROBE_OK tracked=stale` or
  `NAVAL_SEMANTIC_PROBE_OK tracked=current`; status
  contains only Task 6 source edits, no naval metrics/screenshots or temp dirs.

- [ ] **Step 8: Implement the RED-proven comparator, then lock screenshot and isolation manifest**

  Only after Step 1's direct run-object/schema RED is recorded, implement pure
  `compareNormalRouteScreenshotRuns` in
  `scripts/lib/caribbean-port-identity-evidence.mjs` and exported
  `publishNormalRouteComparison` in `scripts/caribbean-port-check.mjs`. The comparator takes the
  exact 23-name allowlist, both complete tagged run objects, and the declarative
  schema-v3 screenshot-evidence object. It derives PNG signature, byte length,
  embedded size, and SHA-256 from every actual buffer; cross-checks both
  declared PNG hashes; byte-compares all 22 non-exempt rows; applies arbitrary
  pixel acceptance only to literal `campaign-result-desktop.png` after every
  semantic/schema check; and returns the exact Step-1 tagged union. Success
  always has `selectedRun: 'A'` and 23 A-only selected artifacts with their
  recomputed hashes. Failure has issues and no selection. It fails closed on an
  incomplete/extra buffer/state map or exemption set and never computes a
  pixel similarity value.

  The writer accepts only a successful comparison, metrics bytes, and concrete
  output directory. It rejects a forged B tag or missing/empty destination and
  writes only `comparison.selectedArtifacts`; raw run A/B maps are not writer
  inputs. Return a publication manifest containing every written artifact hash
  and the metrics hash. In `caribbean-port-check.mjs`, remove the direct
  `first.screenshots` publication loop: after comparison, call only this writer
  and return `{ metrics, comparison, publication }` for programmatic callers.
  The no-options CLI path may still own tracked docs. If an options object
  explicitly contains `outputDirectory`, undefined/empty values or the tracked
  docs path fail before build/capture; a concrete non-docs directory is passed
  through unchanged, so non-writing callers cannot fall back to `OUT`.

  Run immediately after this minimum implementation:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs
  ```

  Expected GREEN: the named valid 22+1 direct-run fixture returns the A-tagged
  artifact set and publishes all 23 A hashes to temp; forged B selection/
  publication and every non-exempt drift, exception-set, ownership, PNG-byte/
  declared-hash/dimension, stable-semantic, per-run observation-shape,
  destination, and unknown/missing-key row fails closed; the measured valid
  160-vs-0 render-observation fixture passes without weakening stable semantic
  equality; all retained schema-v2 and schema-v3 evaluator tests pass.

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
  campaign-battle-resize-notice.png
  ```

  These nine files are already owned/staged by Tasks 4–5. Task 6 locks their
  exact cumulative manifest without regenerating them. Preserve all current
  screenshot files. Assert initial setup/port/sailing/avoid requests exclude
  naval chunk/CSS/GLB; pursue requests hashed local naval assets; normal source
  contains no harness modules; harness build remains isolated.

  Lock the complete normal-route union at 23 exact names. Compare metrics bytes
  and every PNG except `campaign-result-desktop.png` exactly; there are 22 and
  no wildcard. For the exception, validate both generated files as nonempty
  1440x900 PNGs, compute each lowercase 64-hex `pngSha256`, require the exact
  stable normalized terminal state and equal canonical semantic SHA-256 digests
  from Step 5, and retain arbitrary honest pixels. The stable normalized state
  includes exact nonempty backend strings but not `framebufferSample`,
  `performance.now`, or `document.timeline.currentTime`. Each run separately
  supplies one actual render-observation map entry with literal kind
  `post-present-default-framebuffer-readpixels` and the closed sample shape
  (`fnv1a32-rgba-grid-v1`, `40`, integer `0..160`, lowercase eight-hex
  `sampleHash`). Independently validate both and cross-check each declaration
  against its actual run map; retain them verbatim without requiring equality.
  Record run A as the tracked capture owner. Build one declared
  `screenshotEvidence` record containing both PNG hashes, stable states/digests,
  and render observations, and run the serialized evaluator for schema,
  semantic-digest, and per-run observation validation. Then pass that
  declaration plus the complete A/B run objects to the buffer comparator,
  require its successful returned `screenshotEvidence` to deep-equal the
  declaration, and attach that same canonical value to both metrics records.
  Only then finalize the unchanged raw pretty-JSON metrics-byte comparison.
  Publish only the successful comparator's selected artifacts; never index the
  raw first/second screenshot or observation maps in the writer.

  When `CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS=1`, preserve run-A/run-B result PNGs
  plus their stable state/digest, verbatim render observations, and hash record
  in the exact ignored destination
  `/private/tmp/caribbean-port-identity-diagnostic`, even when their PNG bytes
  happen to match. Also write `selected-run-a-publication.json` there with
  literal `selectedRun: 'A'`, the exact sorted 23-row selected filename/SHA-256
  manifest, `metricsSha256` returned by the writer, and both render observations
  copied verbatim from the successful comparison. The preserved run-A
  bytes/hash, both observation records, and every manifest row must be the same
  values written to metrics/destination. Never add diagnostic variants to
  source provenance or tracked screenshot membership.

  Independently expose a safe programmatic diagnostic destination for later
  temp-only gates: `runPortCheck({ outputDirectory, diagnosticDirectory })`.
  Supplying the second path explicitly enables diagnostics without a global
  environment mutation; validate and pin it as an existing real parent plus an
  absent-or-cleanable non-docs leaf before build/capture. Omission keeps the
  current diagnostics-off no-filesystem-touch behavior. On a metrics-byte
  mismatch the bundle must preserve key-sorted canonical A/B metrics and hashes,
  a `canonicalJsonEqual` boolean, and the deterministic first differing JSON
  pointer. The thrown error includes that pointer (or literal `null`) and the
  boolean. This diagnostic addition does not canonicalize publication, weaken
  raw metrics-byte equality, select a run, or write any tracked path.

- [ ] **Step 9: Mutation proof, focused verification, review, and commit**

  Mutate raw fixtures for duplicated resolution, changed literal event ID,
  changed mode order, terminal tick `11856`, wrong seed,
  `tickAfterReload: 1`, a naval request on avoid, missing prior v2 field,
  unknown nested key, and false recovery preservation. Each returns a failed
  verdict without throwing. Mutate first-RAF behavior and clock/Date
  installation order.

  Step 1's pure comparator/evaluator matrix must already be GREEN before this
  mutation phase. Temporarily bypass exact exemption-set membership; the
  missing/unknown/second-exception rows must kill it. Temporarily return
  `selectedRun: 'B'`, substitute one B buffer/hash into the selected A map, then
  separately bypass the selected-artifact writer and publish raw run B; the
  direct tag/identity/temp-publication rows and full A/B output-hash test must
  kill those three mutations independently. Temporarily trust claimed PNG
  facts instead of reading the buffers; signature/dimension/declared-hash lies
  must kill it. Temporarily byte-compare the designated result again; the valid
  different-pixel fixture must kill it. Temporarily accept `-1`, `161`, or a
  fractional nonzero-channel count, or a non-eight-hex `sampleHash`; their
  independently malformed run-A/run-B fixtures must kill those mutations.
  Temporarily require a positive channel count; the valid measured run-B zero/
  `02187e45` observation must kill that unmeasured restriction. Temporarily put
  the sample back into stable state/digest equality; the positive measured run
  A `160`/`9df398c6` versus run B `0`/`02187e45` fixture must kill it.
  Separately copy A over B, normalize/round either sample, omit either record,
  or stop cross-checking declarations against the actual render-observation
  maps; verbatim-retention and malformed-row tests must kill each mutation.
  Mutate the metrics mismatch path to omit canonical A/B, its first pointer, or
  `canonicalJsonEqual`; the diagnostic fixture must kill each omission while
  the raw metrics-byte gate remains red. Restore each mutation independently
  and rerun the focused suite after each. No test or implementation may
  introduce a pixel-delta, perceptual, colour, or similarity threshold or move
  the sample from its measured post-present seam.

  In a temporary tracked graph, add a new local import and require automatic
  closure growth; remove its target and make it ambiguous. Then mutation-kill
  the three unsupported-loader guards independently: change only nonliteral
  `import(variable)` handling to ignore/accept, run the native suite and require
  only the named dynamic-import diagnostic plus its three CLI rows to fail;
  restore it and require GREEN. Repeat for only CommonJS `require(variable)`
  and its distinct named diagnostic/three CLI rows, then for literal-pattern
  `import.meta.glob('./views/*.tsx')` and its distinct named diagnostic/three
  CLI rows. Then mutation-kill annotated binding resolution independently:
  replace the TypeChecker symbol with a file-wide name lookup (parameter/
  catch/inner-shadow/cross-scope rows fail); accept a `let` or assigned symbol
  (declaration-kind/reassignment rows fail); skip declaration-position checks
  (use-before row fails); skip pure-literal initialization (referenced-suffix
  row fails); and search whole-node text for `@vite-ignore` (misplaced-comment
  rows fail). Rejecting either exact positive form or conflating the two
  disjoint-scope positives must fail only its owning positive. If one mutation
  is killed only by an unrelated syntax fixture, the tests are improperly
  coupled and Task 6 remains incomplete. Omit each literal
  `kv.ts`/token-CSS/app-main
  critical row, add an out-of-closure source, reorder rows, and change a
  retained source hash; the verification suite must fail with `source-files`
  or `source-hash` exactly. Mutate stable manifest, observation ranges,
  artifact manifest, and each CLI destination; the owning browser/naval-
  verification test must fail. Different valid FPS/duration/resource/PNG
  observations must continue to pass. After restoring every mutation, rerun
  the full Step 9 matrix; all annotated-binding positive/negative/direct/three-
  mode rows, all three parser fixtures, all nine base mode-specific
  propagation/cleanup rows, and the exact normal-route screenshot boundary
  must be GREEN.

  The browser-native suite keeps the one-journey plus truncated-trace test at
  explicit timeout `600_000ms`. A separate test with timeout `1_020_000ms` runs
  the real exported two-clean-run port gate, whose full-command budget is
  `900_000ms`, into a unique temporary output directory. The result must expose
  `comparison.ok: true`, `selectedRun: 'A'`, 23 selected A artifacts, and the
  publication manifest; returned screenshot evidence must deep-equal metrics.
  The test reads and hashes every written screenshot and `metrics.json`; each
  must equal its returned selected-A/publication hash.
  `campaign-result-desktop.png` must equal the declared/recomputed run-A hash;
  a synthetic differing-result integration fixture additionally proves it is
  unequal to run B. Hash the tracked screenshot tree before and after and prove
  no tracked candidate changed. Remove the temp directory in `t.after`, and add
  a forced `runPortCheck` failure fixture that proves cleanup still occurs and
  no candidate is written to docs. Explicit `outputDirectory: undefined`, `''`,
  or the tracked docs path fails before build/capture. Each real victory still
  has the unchanged `330_000ms` fail-closed deadline. A one-journey GREEN cannot
  substitute for this integrated A/B gate.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs scripts/lib/caribbean-naval-check.test.mjs
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-driver.node-test.mjs
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-browser.node-test.mjs
  mise exec node@20 -- node --test scripts/lib/caribbean-naval-verification.node-test.mjs
  mise exec node@20 -- node --check scripts/caribbean-port-check.mjs
  mise exec node@20 -- node --check scripts/caribbean-naval-check.mjs
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  git diff --cached --check
  git diff --check
  ```

  Commit only source/schema/test changes:

  ```bash
  git add scripts/caribbean-port-check.mjs scripts/caribbean-naval-check.mjs scripts/lib/caribbean-port-identity-evidence.mjs scripts/lib/caribbean-port-identity-evidence.test.mjs scripts/lib/caribbean-campaign-victory-browser.node-test.mjs scripts/lib/caribbean-naval-verification.mjs scripts/lib/caribbean-naval-verification.node-test.mjs scripts/lib/caribbean-naval-check.test.mjs
  git commit -m "test(caribbean): define sailing evidence gate"
  ```

---

### Task 7: Record Browser Evidence and Close the Package

**Files:**

- Modify: `docs/games/caribbean-career/README.md`
- Modify: `docs/screenshots/caribbean-port/metrics.json`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/sailing-desktop.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/encounter-desktop.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/campaign-battle-desktop.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/campaign-result-desktop.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/returned-log-desktop.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/sailing-minimum-supported.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/campaign-battle-fallback.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/sailing-large-portrait-notice.png`
- Modify only if cumulative gate changes bytes: `docs/screenshots/caribbean-port/campaign-battle-resize-notice.png`
- Refresh only if bytes changed through the gate: existing `docs/screenshots/caribbean-port/*.png`
- Modify: `docs/screenshots/caribbean-naval/metrics.json`
- Refresh only if bytes genuinely change through `--capture`: existing `docs/screenshots/caribbean-naval/*.png`
- Report only, ignored: `.superpowers/sdd/2026-08-24-caribbean-strategic-sailing/task-7-report.md`

**Interfaces:** Consumes Task 6 gates. Produces schema-v3 port evidence with exact stable bytes and one named terminal WebGL observation, refreshed naval provenance/evidence, and package documentation. No production source change belongs here; a browser defect returns to its owning task with a new RED and separate fix commit.

- [ ] **Step 1: Run focused and full automated gates fresh**

  ```bash
  mise exec node@20 -- npx vitest run src/games/caribbean
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  ```

  Read full output and record file/test counts, zero failures, and warning classification.

- [ ] **Step 2: Capture independent naval evidence from a clean Task 6 HEAD**

  Confirm `git status --short` is empty, record Task 6 full HEAD, then run the only mutating naval command exactly once before changing any other evidence/docs:

  ```bash
  mise exec node@20 -- npx tsc -b --force
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check -- --capture
  ```

  Expected: Battle Lab passes; `docs/screenshots/caribbean-naval/metrics.json`
  records the exact clean Task 6 HEAD, `worktreeDirtyBeforeCapture: false`, the
  new source hash/stable manifest, and honest observed FPS/duration/resources.
  Only metrics and genuinely changed naval screenshots appear in status. Their
  pixels and observation bytes are captured facts, not future byte-equality
  promises. Record every changed path; Task 7 owns all of them.

- [ ] **Step 3: Run the sole final mutating port capture with owned diagnostics**

  ```bash
  rm -rf /private/tmp/caribbean-port-identity-diagnostic
  CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS=1 mise exec node@20 -- npm run caribbean:port-check
  test -f /private/tmp/caribbean-port-identity-diagnostic/campaign-result-desktop-run-a.png
  test -f /private/tmp/caribbean-port-identity-diagnostic/campaign-result-desktop-run-b.png
  test -f /private/tmp/caribbean-port-identity-diagnostic/campaign-result-desktop-mismatch.json
  test -f /private/tmp/caribbean-port-identity-diagnostic/metrics-run-a.canonical.json
  test -f /private/tmp/caribbean-port-identity-diagnostic/metrics-run-b.canonical.json
  test -f /private/tmp/caribbean-port-identity-diagnostic/selected-run-a-publication.json
  cmp -s /private/tmp/caribbean-port-identity-diagnostic/campaign-result-desktop-run-a.png docs/screenshots/caribbean-port/campaign-result-desktop.png
  mise exec node@20 -- node --input-type=module -e "import assert from 'node:assert/strict'; import {createHash} from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex'); const root='docs/screenshots/caribbean-port'; const diagnostics='/private/tmp/caribbean-port-identity-diagnostic'; const metricsBytes=fs.readFileSync(path.join(root,'metrics.json')); const metrics=JSON.parse(metricsBytes); const diagnostic=JSON.parse(fs.readFileSync(path.join(diagnostics,'campaign-result-desktop-mismatch.json'),'utf8')); const publication=JSON.parse(fs.readFileSync(path.join(diagnostics,'selected-run-a-publication.json'),'utf8')); assert.equal(publication.selectedRun,'A'); assert.equal(publication.artifacts.length,23); for (const row of publication.artifacts) assert.equal(sha256(fs.readFileSync(path.join(root,row.filename))),row.sha256); assert.equal(sha256(metricsBytes),publication.metricsSha256); const tracked=fs.readFileSync(path.join(root,'campaign-result-desktop.png')); const preservedB=fs.readFileSync(path.join(diagnostics,'campaign-result-desktop-run-b.png')); const {runA,runB}=metrics.screenshotEvidence.observation; assert.equal(runA.pngSha256,sha256(tracked)); assert.equal(runB.pngSha256,sha256(preservedB)); assert.equal(diagnostic.sha256.runA,runA.pngSha256); assert.equal(diagnostic.sha256.runB,runB.pngSha256); assert.deepEqual(diagnostic.runA,runA.semanticState); assert.deepEqual(diagnostic.runB,runB.semanticState); assert.deepEqual(diagnostic.renderObservations,{runA:runA.renderObservation,runB:runB.renderObservation}); assert.deepEqual(publication.renderObservations,diagnostic.renderObservations);"
  ```

  Expected: schema version 3 accepted; the command's two internal clean-
  localStorage runs produce byte-identical metrics and 22 byte-identical
  screenshots. Its only comparison exception is
  `campaign-result-desktop.png`; both variants are valid nonempty 1440x900 PNGs
  with exact equal stable normalized semantic state/digests at tick `11855`,
  while their independently valid post-present render observations are retained
  verbatim and may differ, and run A owns the tracked capture. Exact
  IDs/modes/RNG/input, exactly-once
  resolution, final systems, focus, recovery, and zero console/page/request
  failures pass. An identical terminal PNG is allowed but not required. The
  command compares A/B before publishing run A. This is the final and only
  pre-commit port command allowed to write the tracked destination. Record its
  run-A `pngSha256`, stable semantic digest and complete stable semantic state,
  plus both per-run render observations verbatim in
  `.superpowers/sdd/2026-08-24-caribbean-strategic-sailing/task-7-report.md`;
  also record the sorted 23-row A-selected publication manifest and metrics
  hash after the command has recomputed every tracked candidate and matched it.
  Those metrics/report values, all tracked hashes, and the preserved run-A
  bytes jointly name the inspection owner. No later mutating port invocation is
  permitted.

- [ ] **Step 4: Prove non-writing harness verification and normal/harness isolation**

  ```bash
  mise exec node@20 -- npx tsc -b --force
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

  Inspect 1440x900, 1180x820, 1024x768, exact 960x600, HTML fallback,
  and portrait notice. For `campaign-result-desktop.png`, inspect the preserved
  run-A and run-B variants from Step 3 plus the just-published tracked run-A
  output at original 1440x900 after the final mutating command; record their
  three exact PNG hashes and that the modal, HUD, controls, ship composition,
  text, and result remain fully legible in all three. Reconfirm `cmp -s` for
  preserved A versus tracked A immediately after inspection. Do not use a
  rescaled viewer as evidence. Read and record both per-run framebuffer
  observations from metrics, the mismatch diagnostic, and the selected-run-A
  success manifest. Require exact three-way equality for each observation
  record; do not require run A's observation to equal run B's.
  For all captures verify: historical one-mast silhouette; sea-dominant
  composition; functional brass route line; compact modern controls; exact
  consequences; no clipping/overlap/scroll; readable focus; full-bleed battle
  unchanged; result/return action clear; Captain's Log outcome; unsupported
  notice only. Remove the exact ignored diagnostic directory only after its A,
  B, hash/stable-state record, both render observations, selected-A publication
  manifest, and tracked A have been inspected and recorded; do not run another
  tracked-output port capture to recreate it.

  ```bash
  rm -rf /private/tmp/caribbean-port-identity-diagnostic
  test ! -e /private/tmp/caribbean-port-identity-diagnostic
  ```

  Record observations as engineering visual review. Do not label human comprehension, touch quality, Safari, or target-iPad performance observed.

- [ ] **Step 6: Update the career evidence ledger**

  In `README.md`, document the new command path, exact screenshot membership,
  the 22-byte/one-terminal-observation boundary and run-A ownership, reload
  semantics, safe-return/persistent-damage boundary, lazy production naval
  isolation, and remaining human/iPad evidence. Do not change the governing
  product dossier or claim the naval milestone is production-ready.

- [ ] **Step 7: Run fresh pre-commit verification and inspect exact owned changes**

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check -- --semantic-probe
  git diff --check
  git status --short
  ```

  Then execute this entire code block as one self-contained Node 20 logical
  operation. No line inside its quoted `-e` program may be submitted as a
  separate shell command, and no shell variable or exported environment value
  carries state:

  ```bash
  mise exec node@20 -- node --input-type=module -e "
  import assert from 'node:assert/strict';
  import { createHash } from 'node:crypto';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import { runPortCheck } from './scripts/caribbean-port-check.mjs';
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const trackedDirectory = path.resolve('docs/screenshots/caribbean-port');
  const trackedNames = fs.readdirSync(trackedDirectory).filter((name) => fs.statSync(path.join(trackedDirectory, name)).isFile()).sort();
  const trackedBefore = new Map(trackedNames.map((name) => [name, sha256(fs.readFileSync(path.join(trackedDirectory, name)))]));
  const operationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-precommit-'));
  const outputDirectory = path.join(operationRoot, 'output');
  const diagnosticDirectory = path.join(operationRoot, 'diagnostic');
  fs.mkdirSync(outputDirectory);
  assert.equal(typeof operationRoot, 'string');
  assert.notEqual(operationRoot.length, 0);
  assert.ok(path.relative(trackedDirectory, outputDirectory).startsWith('..' + path.sep));
  assert.ok(path.relative(trackedDirectory, diagnosticDirectory).startsWith('..' + path.sep));
  let succeeded = false;
  try {
    const result = await runPortCheck({ outputDirectory, diagnosticDirectory });
    assert.equal(result.comparison.ok, true);
    assert.equal(result.comparison.selectedRun, 'A');
    assert.deepEqual(result.comparison.screenshotEvidence, result.metrics.screenshotEvidence);
    assert.equal(result.comparison.selectedArtifacts.size, 23);
    const expectedNames = [...result.comparison.selectedArtifacts.keys(), 'metrics.json'].sort();
    const writtenNames = fs.readdirSync(outputDirectory).sort();
    assert.deepEqual(writtenNames, expectedNames);
    assert.equal(writtenNames.length, 24);
    for (const [name, artifact] of result.comparison.selectedArtifacts) {
      assert.equal(artifact.sourceRun, 'A');
      const writtenHash = sha256(fs.readFileSync(path.join(outputDirectory, name)));
      assert.equal(writtenHash, artifact.sha256);
      assert.equal(result.publication.artifactHashes.get(name), artifact.sha256);
    }
    assert.equal(sha256(fs.readFileSync(path.join(outputDirectory, 'metrics.json'))), result.publication.metricsSha256);
    assert.equal(result.comparison.selectedArtifacts.get('campaign-result-desktop.png').sha256, result.metrics.screenshotEvidence.observation.runA.pngSha256);
    const diagnostic = JSON.parse(fs.readFileSync(path.join(diagnosticDirectory, 'campaign-result-desktop-mismatch.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(diagnosticDirectory, 'selected-run-a-publication.json'), 'utf8'));
    const { runA, runB } = result.metrics.screenshotEvidence.observation;
    assert.deepEqual(diagnostic.renderObservations, { runA: runA.renderObservation, runB: runB.renderObservation });
    assert.deepEqual(manifest.renderObservations, diagnostic.renderObservations);
    assert.equal(diagnostic.firstDifferingPaths.semanticState, null);
    assert.equal(diagnostic.firstDifferingPaths.canonicalMetrics, null);
    assert.equal(diagnostic.canonicalJsonEqual, true);
    const trackedAfterNames = fs.readdirSync(trackedDirectory).filter((name) => fs.statSync(path.join(trackedDirectory, name)).isFile()).sort();
    assert.deepEqual(trackedAfterNames, trackedNames);
    for (const name of trackedNames) assert.equal(sha256(fs.readFileSync(path.join(trackedDirectory, name))), trackedBefore.get(name));
    succeeded = true;
  } catch (error) {
    if (fs.existsSync(diagnosticDirectory)) {
      const names = fs.readdirSync(diagnosticDirectory).sort();
      assert.ok(names.includes('metrics-run-a.canonical.json'));
      assert.ok(names.includes('metrics-run-b.canonical.json'));
      assert.ok(names.includes('campaign-result-desktop-mismatch.json'));
      const report = JSON.parse(fs.readFileSync(path.join(diagnosticDirectory, 'campaign-result-desktop-mismatch.json'), 'utf8'));
      assert.ok(report.firstDifferingPaths.canonicalMetrics === null || typeof report.firstDifferingPaths.canonicalMetrics === 'string');
      assert.equal(typeof report.canonicalJsonEqual, 'boolean');
      console.error('PORT_TEMP_DIAGNOSTIC_PRESERVED ' + diagnosticDirectory + ' pointer=' + String(report.firstDifferingPaths.canonicalMetrics) + ' canonicalJsonEqual=' + String(report.canonicalJsonEqual));
    } else {
      fs.rmSync(operationRoot, { recursive: true, force: true });
    }
    throw error;
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    assert.equal(fs.existsSync(outputDirectory), false);
    if (succeeded) {
      fs.rmSync(operationRoot, { recursive: true, force: true });
      assert.equal(fs.existsSync(operationRoot), false);
    }
    const trackedAfterNames = fs.readdirSync(trackedDirectory).filter((name) => fs.statSync(path.join(trackedDirectory, name)).isFile()).sort();
    assert.deepEqual(trackedAfterNames, trackedNames);
    for (const name of trackedNames) assert.equal(sha256(fs.readFileSync(path.join(trackedDirectory, name))), trackedBefore.get(name));
  }
  "
  ```

  Verify every status path is in the Task 7 file list, semantic probe added no
  change, no temporary/raw traces/debug globals/build artifacts remain, and
  both screenshot trees contain only gate-owned bytes. Confirm port metrics say
  `trackedCapture: 'run-a'`, name exactly one observation exception, and retain
  the exact run-A PNG hash, stable semantic digest/state boundary, and both
  verbatim render observations recorded in the Task 7 report; recompute all 23
  tracked PNG hashes plus metrics and require equality with the recorded
  selected-A publication manifest. All other
  screenshots are in the byte-compared set. The temporary port gate may
  produce different honest terminal pixels but cannot publish them to docs and
  receives concrete internally created non-docs output and diagnostic
  destinations, so it cannot overwrite the inspected Step-3 A/B files. On
  success, verify both observations and remove the complete temporary root. If
  the Node operation fails before diagnostics exist, remove the root; if a
  comparison-stage bundle exists, remove only output, preserve the unique
  diagnostic directory, print its path/first pointer/`canonicalJsonEqual`, and
  stop. In every case confirm tracked hashes remain unchanged. Do not retry;
  diagnose and fix the owning gate from the preserved canonical A/B records.
  `--verify` is intentionally not run against this dirty pre-commit tree.

- [ ] **Step 8: Commit all owned evidence and documentation**

  ```bash
  git add docs/games/caribbean-career/README.md docs/screenshots/caribbean-port docs/screenshots/caribbean-naval
  git commit -m "test(caribbean): verify strategic sailing loop"
  ```

- [ ] **Step 9: Run post-commit non-writing verification and cumulative zero-finding review**

  Run:

  ```bash
  mise exec node@20 -- npm run caribbean:naval-check -- --verify
  git diff HEAD^ HEAD --check
  git status --short
  ```

  Require exit 0 and empty status. Verification regenerates honest fresh
  observations, range-validates them, and compares only stable manifest/source/
  provenance; it does not require FPS/duration/resource/PNG bytes to repeat. Do
  not rerun `--capture` after the evidence commit because that would falsify the
  clean Task 6 capture provenance.

  Reconfirm the normal-route port record still has exactly one observational
  result screenshot; all 23 tracked PNG hashes and metrics still equal the
  selected-A publication manifest recorded in the Task 7 report; and the result
  PNG's recomputed SHA-256 equals the exact run-A `pngSha256`; the exact stable
  semantic digest/state and both independently valid verbatim render
  observations equal the metrics/report/success-manifest records. No later
  command may have replaced those tracked bytes. No final review may summarize
  all 23 port screenshots as byte-identical or the two render observations as
  necessarily equal; it must state the 22+1 and stable-versus-observational
  boundaries explicitly.

  Review from plan execution base through Task 7 HEAD. Required topics: source-of-truth rule reuse; event/validator totality; RNG lineage; old-save compatibility; replay/compaction; writer conflicts/consent/recovery; no mutation during battle; terminal exactly-once; reload restart disclosure; session disposal; safe-return ruling; Set Sail readiness; a11y; lazy isolation; deterministic evidence; scope discipline.

  Any BLOCKER, MAJOR, or MINOR returns to the owning task with a new failing test and separate fix commit. Repeat fresh focused/full/browser verification after fixes. Package close requires zero findings and clean tracked status.

---

## Post-cumulative Evidence Contract Amendment — default framebuffer observation

This amendment is the only authorized continuation after source-fix commit
`e5230c634a5c1fd7e5756c0b06bc002aeb186b5b`. It does not reopen product rules,
add a screenshot exception, or weaken metrics equality. It corrects the
terminal evidence schema and independently makes any future metrics mismatch
diagnosable before cleanup.

The preserved ignored reproduction is
`/private/tmp/caribbean-port-temp-metrics-repro-e5230c6`. Its run-A/run-B PNGs
are byte-identical at
`9697f1a90da5a5de05132af5ae60fb24a063a5d07c532915e7168cd9433c6442`;
canonical A/B metrics are byte-identical at
`0fdbe9b75f17a08d9bee672e99c5f7e71418183d3c8d4534494a5c9aeb66ca07`;
and its exact first semantic pointer is
`/canvas/framebufferSample/nonzeroSampleChannels`, from run A
`160`/`9df398c6` to run B `0`/`02187e45`. The earlier required temp-only gate's
separate later metrics-byte mismatch remains unresolved because diagnostics
were disabled and its cleaned run directories cannot be reconstructed.

**Files:**

- Modify: `docs/designs/2026-08-24-caribbean-strategic-sailing-design.md`
- Modify: `docs/plans/2026-08-24-caribbean-strategic-sailing.md`
- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-campaign-victory-browser.node-test.mjs`
- Verify unchanged: `src/games/caribbean/**`
- Refresh only after the new source commit: `docs/screenshots/caribbean-naval/**`
  and `docs/screenshots/caribbean-port/**`

**Interfaces:** Consumes the existing schema-v3 22+1 comparator, actual A/B
buffer ownership, hardened diagnostic publisher, and exact post-present
`readPixels` seam. Produces stable `TerminalResultSemanticState`, explicit
`TerminalResultRenderObservation`, actual `renderObservations` run maps,
verbatim observations in metrics/diagnostics/success manifest, and safe
programmatic diagnostics for temp-only full gates. It leaves raw pretty-JSON
metrics equality, the sole PNG exception, and A-only publication unchanged.

- [ ] **Amendment Step 1: Approve and commit the docs-only contract**

  Review the two-doc diff against the preserved five-file diagnostic bundle.
  Require exact mention of both failures and every hash/pointer above; the
  stable/observational split; independent per-run validation; no equality for
  the two samples; exact stable equality; 22+1; A-only publication; verbatim
  diagnostics/manifest/inspection; prohibited normalization/seam/threshold
  changes; and future metrics diagnostic preservation. Run:

  ```bash
  git diff --check -- docs/designs/2026-08-24-caribbean-strategic-sailing-design.md docs/plans/2026-08-24-caribbean-strategic-sailing.md
  rg -n "framebufferSample|renderObservation|canonicalJsonEqual|9df398c6|02187e45|0fdbe9b7|9697f1a9" docs/designs/2026-08-24-caribbean-strategic-sailing-design.md docs/plans/2026-08-24-caribbean-strategic-sailing.md
  git status --short
  ```

  Expected: independent plan review is APPROVED with zero findings; only the
  two docs plus the pre-existing twelve generated-evidence paths are modified.
  Stage and commit only the two docs:

  ```bash
  git add docs/designs/2026-08-24-caribbean-strategic-sailing-design.md docs/plans/2026-08-24-caribbean-strategic-sailing.md
  git commit -m "docs(caribbean): amend terminal render evidence"
  ```

- [ ] **Amendment Step 2: Write and observe the stable/observation RED**

  In `caribbean-port-identity-evidence.test.mjs`, change the fixture model so
  `TerminalResultSemanticState.canvas` has no `framebufferSample`; each run row
  instead has:

  ```js
  renderObservation: {
    kind: 'post-present-default-framebuffer-readpixels',
    framebufferSample: {
      algorithm: 'fnv1a32-rgba-grid-v1',
      sampleCount: 40,
      nonzeroSampleChannels: 160,
      sampleHash: '9df398c6',
    },
  }
  ```

  Give run B the same shape with `nonzeroSampleChannels: 0` and
  `sampleHash: '02187e45'`. Add `renderObservations` maps to the byte-bearing run
  fixtures. The named positive test requires evaluator and comparator success,
  equal recomputed stable digests, and exact verbatim retention of both
  different observations. The negative table independently mutates each run's
  kind, algorithm, count `39`, channel count `-1`/`161`/`1.5`, uppercase/
  nine-hex/non-hex hash, missing/extra key, declaration-versus-map value, and
  stable tick/result/canvas/backend/outcome/seed/system field.

  Run before source edits:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs -t "schema-v3 strategic sailing evidence|normal-route screenshot byte comparator"
  ```

  Expected RED: the current evaluator rejects the measured divergent pair as
  `screenshotEvidence semantic observations differ` or rejects the new exact
  shape; the test runner itself collects normally.

- [ ] **Amendment Step 3: Implement only the stable/observation split**

  In `readBattleCaptureState`, keep the existing post-present public DOM/WebGL
  read order, but return stable canvas facts separately from:

  ```js
  {
    kind: 'post-present-default-framebuffer-readpixels',
    framebufferSample: {
      algorithm: 'fnv1a32-rgba-grid-v1',
      sampleCount: pixels.length / 4,
      nonzeroSampleChannels: pixels.filter((value) => value !== 0).length,
      sampleHash: sampleHash.toString(16).padStart(8, '0'),
    },
  }
  ```

  Carry actual render observations in their own screenshot map. Exclude that
  map from `strategicSailing`, just as screenshot bytes/states are excluded.
  `createNormalRouteScreenshotEvidence` embeds each observation with its own
  run; `normalRouteScreenshotRun` supplies both actual maps. The evaluator
  validates each closed observation independently. The comparator requires
  each declaration to canonical-deep-equal its corresponding actual map entry,
  preserves both verbatim, and continues to require exact stable state/digest
  equality. It never compares render A to render B.

  Run:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs -t "schema-v3 strategic sailing evidence|normal-route screenshot byte comparator"
  ```

  Expected GREEN: the measured 160-vs-0 positive row passes; all malformed,
  forged, omitted, and stable-drift rows fail closed without publication.

- [ ] **Amendment Step 4: Write REDs and harden metrics mismatch diagnostics**

  In `caribbean-campaign-victory-browser.node-test.mjs`, add direct tests for
  `runPortCheck({ outputDirectory, diagnosticDirectory })`. The explicit
  diagnostic destination opts in without an environment variable and receives
  the same pinned-parent/no-symlink/no-tracked-docs validation as existing
  diagnostics. Omission must preserve the current diagnostics-off zero-path-
  touch contract. Invalid/empty/tracked/symlink destinations fail before build.

  Extend the mismatch report to contain:

  ```js
  {
    canonicalJsonEqual: boolean,
    firstDifferingPaths: {
      semanticState: string | null,
      renderObservation: string | null,
      canonicalMetrics: string | null,
    },
    renderObservations: { runA, runB },
  }
  ```

  On final raw metrics-byte drift, always compute the key-sorted canonical A/B
  buffers, their hashes, `canonicalJsonEqual`, and the first canonical JSON
  pointer. With an explicit diagnostic destination, atomically preserve them
  before throwing. Include pointer/boolean in the error message even when
  diagnostics are off. Do not serialize published metrics with `canonicalJson`,
  remove a run-local field, round a number, weaken equality, or select/publish
  either run on failure. Add both render observations to the success mismatch
  report and `selected-run-a-publication.json` and cross-check them against the
  comparison before atomic publication.

  Run:

  ```bash
  mise exec node@20 -- node --test --test-name-pattern="diagnostic comparison preserves|diagnostic-enabled successful compare|programmatic port evidence" scripts/lib/caribbean-campaign-victory-browser.node-test.mjs
  mise exec node@20 -- node --check scripts/caribbean-port-check.mjs
  mise exec node@20 -- node --check scripts/lib/caribbean-port-identity-evidence.mjs
  ```

  Expected GREEN: evaluator, comparator, metrics-byte, success-manifest,
  diagnostics-off, safe-destination, cleanup, and publication tests pass.

- [ ] **Amendment Step 5: Kill the exact mutations and run source gates**

  Independently apply and restore each mutation: put the sample back inside
  stable state/digest equality; skip run-A validation; skip run-B validation;
  accept an out-of-range/fractional/bad-hash sample; copy A over B; normalize or
  omit either observation; stop checking actual observation maps; relax one
  stable field; broaden the PNG exception; select/publish B; suppress canonical
  A/B files, `canonicalJsonEqual`, or the first pointer; canonicalize published
  metrics; or weaken final byte equality. Each owning RED must fail. Then run:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs
  mise exec node@20 -- node --test scripts/lib/caribbean-campaign-victory-browser.node-test.mjs
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run build
  git diff --check
  ```

  Require fresh independent source review with zero BLOCKER/MAJOR/MINOR. Commit
  only the four amendment source/test files:

  ```bash
  git add scripts/lib/caribbean-port-identity-evidence.mjs scripts/lib/caribbean-port-identity-evidence.test.mjs scripts/caribbean-port-check.mjs scripts/lib/caribbean-campaign-victory-browser.node-test.mjs
  git commit -m "fix(caribbean): separate framebuffer render observation"
  ```

- [ ] **Amendment Step 6: Restore a clean capture base and recapture once**

  The twelve evidence modifications captured from `e5230c6` failed their later
  required temp gate and may not be committed as final proof. After recording
  their hashes and only with explicit execution approval, restore exactly those
  twelve generated paths to the new HEAD's tracked parents; do not touch any
  source/doc/report path:

  ```bash
  shasum -a 256 \
    docs/screenshots/caribbean-naval/battle-boundary-supported.png \
    docs/screenshots/caribbean-naval/battle-desktop.png \
    docs/screenshots/caribbean-naval/battle-minimum-supported.png \
    docs/screenshots/caribbean-naval/battle-tablet-landscape.png \
    docs/screenshots/caribbean-naval/boarding-ready-result.png \
    docs/screenshots/caribbean-naval/broadside-handedness.png \
    docs/screenshots/caribbean-naval/metrics.json \
    docs/screenshots/caribbean-port/campaign-battle-desktop.png \
    docs/screenshots/caribbean-port/campaign-battle-fallback.png \
    docs/screenshots/caribbean-port/campaign-result-desktop.png \
    docs/screenshots/caribbean-port/market-desktop.png \
    docs/screenshots/caribbean-port/metrics.json
  git restore --source=HEAD -- \
    docs/screenshots/caribbean-naval/battle-boundary-supported.png \
    docs/screenshots/caribbean-naval/battle-desktop.png \
    docs/screenshots/caribbean-naval/battle-minimum-supported.png \
    docs/screenshots/caribbean-naval/battle-tablet-landscape.png \
    docs/screenshots/caribbean-naval/boarding-ready-result.png \
    docs/screenshots/caribbean-naval/broadside-handedness.png \
    docs/screenshots/caribbean-naval/metrics.json \
    docs/screenshots/caribbean-port/campaign-battle-desktop.png \
    docs/screenshots/caribbean-port/campaign-battle-fallback.png \
    docs/screenshots/caribbean-port/campaign-result-desktop.png \
    docs/screenshots/caribbean-port/market-desktop.png \
    docs/screenshots/caribbean-port/metrics.json
  git status --short
  ```

  Require empty status, then run fresh serial build/provenance gates. From that
  exact clean source HEAD run exactly one naval `--capture`, followed by exactly
  one diagnostics-enabled tracked port capture:

  ```bash
  mise exec node@20 -- npx tsc -b --force
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:naval-check -- --capture
  rm -rf /private/tmp/caribbean-port-identity-diagnostic
  CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS=1 mise exec node@20 -- npm run caribbean:port-check
  ```

  Do not rerun either failed tracked capture without reporting first.

  Require the six-file port success bundle, A-only 23-artifact publication,
  exact 22+1 boundary, exact stable A/B state/digest equality, independent
  valid render observations copied identically through metrics/diagnostic/
  success manifest, and original-resolution preserved-A/preserved-B/tracked-A
  inspection. Equal render samples are allowed; unequal valid samples are also
  allowed. No inspection may call either sample visible-pixel proof.

- [ ] **Amendment Step 7: Run the diagnostic temp gate, verify, and commit evidence**

  Execute Task 7 Step 7's self-contained operation with unique output and
  diagnostic destinations. On success, remove both after verifying hashes,
  stable semantics, and both render observations. On failure, remove output,
  preserve and report the diagnostic bundle/pointer/`canonicalJsonEqual`, prove
  tracked hashes unchanged, and stop without retry.

  If it passes, run fresh post-capture check/full Vitest/forced TypeScript/build,
  naval semantic-probe/verify, exact scope and provenance checks, and a final
  zero-finding cumulative review. Commit only honest refreshed evidence and any
  strictly required README provenance wording:

  ```bash
  git add docs/screenshots/caribbean-port docs/screenshots/caribbean-naval docs/games/caribbean-career/README.md
  git commit -m "test(caribbean): refresh strategic sailing evidence"
  ```

  Require final clean status. Do not merge, push, rebase, fetch, or touch
  `main`.

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
8. Final tactical outcome remains in `lastVoyage` while the pre-battle flagship stays byte-unchanged; Captain's Log shows the exact harbour-readiness/no-carried-damage sentence and no half-built repair/capture system ships.
9. Pause freezes the live session; background leaves it paused; nonterminal withdrawal pauses synchronously before writer await and stays paused through pending/conflict/reject/reload. Unsupported resize leaves no controller/session under the notice; support restoration automatically mounts a fresh controller and tick-zero naval session from byte-identical persisted input with restart disclosure, even without `?resume=1`.
10. Sailing/encounter/naval satisfy exact checkpoint/ID/lead/target/provision and naval RNG/full-builder invariants after direct load, compaction, and recovery without predecessor events.
11. Replay from event zero and a nonzero compacted checkpoint yields canonical equality; `lastVoyage`, time, provisions, RNG, lead, target, and event ID survive compaction.
12. Existing V1 saves load byte-valid with no required migration; the first new save rotates old raw bytes normally; intermediate-mode recovery preserves unreadable data.
13. Every simultaneous named-action pair in persisted/memory-only modes fulfills with at most one applied event; the A/runtime-swap/B/A-settles/C matrix preserves B ownership; the two exact legal event-257 departure/resolution histories prove immediate and denial-memory-retry publication consumes the original event token once while adopting an event-free, canonical/deep-equal but reference-distinct checkpoint.
14. Consent/conflict keeps the predecessor route and terminal modal mounted; invalid resolution has campaign-specific restart/withdraw while a valid result has Return only.
15. Landscape `>=960x600` works with 14 px/44 px/focus/contrast/overflow/reduced-motion guarantees; phones and portrait mount only the notice.
16. Normal setup/port/sailing/avoid does not request naval assets; pursuit loads only local production assets; no harness/debug module ships; Battle Lab remains independently green.
17. The real-session literal public-control trace mounts at tick zero, primes first RAF without a tick, advances through actual 16 ms RAF quanta to exact six-tick publications/final tick `11855`, preserves ordered clock/Date fixtures and `nowConsumed`, and fails closed on drift, timeout, or non-victory.
18. Schema-v3 normal-route port metrics and 22 of its exact 23 screenshots are byte-identical across two clean runs. The sole exact exception is the valid nonempty 1440x900 `campaign-result-desktop.png`; it accepts arbitrary honest pixels only after exact A/B equality of the canonical stable semantic state/digest at tick `11855`, canvas/drawing-buffer/nonempty equal backend, terminal outcome, and final systems. Each run separately retains one verbatim `post-present-default-framebuffer-readpixels` observation with exact `fnv1a32-rgba-grid-v1`, count `40`, integer `0..160` nonzero channels, and lowercase eight-hex hash. Zero and nonzero samples are valid, the two records may differ, neither proves visible pixels, and neither enters stable state/digest/equality. The buffer comparator cross-checks each declared observation against its actual run map, recomputes both PNG hashes, returns only tagged A-selected artifacts, and the writer consumes only that selection. Diagnostics, the success manifest, Task 7's report, and inspection retain both observations without copying, normalizing, rounding, swapping, or omission. Task 6 hashes every temp publication against run A; Task 7's sole final mutating command preserves A/B and hashes all 23 tracked PNGs plus metrics against the selected-A publication manifest before inspecting A/B/tracked. Later port verification is one self-contained Node operation with internal mkdtemp, explicit non-docs output and diagnostic destinations, full A-hash/tracked-unchanged proof, success cleanup, and failure preservation of canonical A/B metrics, their hashes, `canonicalJsonEqual`, and the first JSON pointer. Raw metrics-byte equality and A-only publication remain unchanged. Unknown/missing/additional exceptions, sample type/range/hash/retention failure, PNG/hash/dimension failure, stable semantic drift, selected-owner drift, or any non-exempt byte drift fails closed. No perceptual threshold or seam/render scheduling change is used. This does not impose byte identity on the separate live naval-harness observations in criterion 19.
19. Naval semantic probe is non-writing and tolerates stale tracked provenance; Task 7's clean-Task-6-HEAD capture owns honest observations; final clean `--verify` proves the exact sorted seed-to-fixed-point tracked-local import/HTML/CSS/build-entry closure and raw-byte row/hash manifest—including `kv.ts`, token CSS, and app main—while accepting varied in-range FPS/duration/resource/PNG observations and rejecting unresolved/omitted/new dependencies; nonliteral dynamic imports except the exact annotated same-file immutable literal-concatenation const selected by lexical TypeScript symbol at the import occurrence, already declared, unmutated, and exactly annotated on the identifier argument; shadowed, mis-scoped, duplicate, use-before, reassigned, or name-map-blessed bindings; nonliteral CommonJS requires; every `import.meta.glob` call including literal patterns; missing/extra/reordered rows; and hash, stable, range, or artifact drift with the exact source diagnostic, mode prefix, and cleanup contract. The normal-route deterministic-flag cleanup does not change the naval harness's approved `ANGLE_ARGS`.
20. Every Task 1–6 source commit has fresh focused tests, check, full Vitest, forced clean solution build, real package build, and diff check; Tasks 4–5 also commit inspected normal-production screenshots with their UI source; cumulative gates/review are fresh and zero-finding.
21. Human first-time and target-iPad Safari/touch/offline/thermal observations remain honestly unobserved unless actually performed.
22. Worktree is clean; no merge, push, rebase, fetch, or main change occurred.
