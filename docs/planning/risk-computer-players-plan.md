# Risk Computer Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any Risk seat can be a computer general — four named personas, weakest to strongest, per ADR 0009.

**Architecture:** A pure, seeded policy in `src/games/risk/domain/bots/` returns one `BotStep` at a time; a React effect in a newly extracted `state/useRisk.ts` hook applies steps through the same pure rule functions the UI calls, with a short "thinking" delay. The bot module is lazy-loaded via dynamic `import()` so games without a computer seat pay zero bytes.

**Tech Stack:** TypeScript, React 18, vitest + testing-library, existing pure domain in `src/games/risk/domain/rules.ts`.

## Global Constraints

- Offline PWA: no network, no runtime downloads (ADR 0004).
- Bot policies are pure and take `rng: () => number` (ADR 0005); production passes `Math.random`, tests pass `seededRng(n)`.
- One logical operation per Bash call; gates before PR: `npm run check`, `npx vitest run`, `npm run build`; UI change ⇒ `npm run shots` screenshot committed.
- Icons are SVG, never emoji; kid-facing copy is warm; interactive elements get `data-testid`, keyboard path, `:focus-visible`.
- Existing tests must stay green: `RiskPage.test.tsx`, `useMapZoom.test.ts`, `rules.test.ts`.

---

### Task 1: Promote `seededRng` to a shared util

**Files:**
- Create: `src/shared/rng.ts`
- Modify: `src/test/helpers.ts` (re-export, keep test imports working)
- Test: `src/shared/rng.test.ts`

**Interfaces:**
- Produces: `seededRng(seed: number): () => number` (mulberry32) — used by every later task's tests and by bot callers.

- [ ] Write failing test `src/shared/rng.test.ts`: same seed ⇒ same first three values; different seeds differ; values in [0,1).
- [ ] Run: `npx vitest run src/shared/rng.test.ts` — FAIL (module missing).
- [ ] Move the mulberry32 implementation from `src/test/helpers.ts` into `src/shared/rng.ts` (exported `seededRng`); make `src/test/helpers.ts` re-export it.
- [ ] Run rng test + full suite — PASS.
- [ ] Commit `feat(shared): seededRng becomes a shared util`.

### Task 2: Players can be computers (domain + persistence tolerance)

**Files:**
- Modify: `src/games/risk/domain/types.ts` (PlayerState), `src/games/risk/domain/rules.ts` (NewPlayer, newGame)
- Test: extend `src/games/risk/domain/rules.test.ts`

**Interfaces:**
- Produces: `PlayerState.bot?: string` (persona id), `NewPlayer.bot?: string`; `newGame` copies it through. Absent = human. `riskPersistence` round-trips it for free (state JSON), loader already tolerates unknown optional fields.

- [ ] Write failing test: `newGame(topo, [{name,color},{name,color,bot:'cadet'}]).players[1].bot === 'cadet'` and `players[0].bot === undefined`.
- [ ] Run — FAIL (property dropped).
- [ ] Add `bot?: string` to `NewPlayer` (`rules.ts:28`) and `PlayerState` (`types.ts:31`); spread it in `newGame`'s mapping (`rules.ts:82`): `...(p.bot ? { bot: p.bot } : {})`.
- [ ] Run — PASS. Commit `feat(risk): a player seat can be a computer persona`.

### Task 3: Extract `state/useRisk.ts` from RiskPage (behavior-preserving)

**Files:**
- Create: `src/games/risk/state/useRisk.ts`
- Modify: `src/games/risk/components/RiskPage.tsx`
- Test: `src/games/risk/state/useRisk.test.ts` + existing `RiskPage.test.tsx` stays green

**Interfaces:**
- Produces the hook consumed by Task 5's bot effect and by RiskPage:

```ts
export interface StartConfig { mapId: string; players: NewPlayer[]; diceMode: DiceMode }
export interface UseRiskResult {
  map: RiskMap | null; state: GameState | null;
  sel: string | null; dest: string | null; moveCount: number; battle: BattleResult | null;
  targets: Set<string>;
  start(cfg: StartConfig): void; resume(saved: StoredRisk): boolean;
  pick(id: string): void; setMoveCount(n: number): void;
  doneReinforce(): void; doneAttack(): void; doneTurn(): void;
  confirmFortify(): void; cancelSelection(): void; newCampaign(): void;
}
export function useRisk(): UseRiskResult
```

- [ ] Write failing hook test (renderHook): `start()` yields claim phase; `pick(freeTerritory)` claims it; full happy-path place/doneReinforce wiring.
- [ ] Run — FAIL (module missing).
- [ ] Move from `RiskPage.tsx` into the hook verbatim: `map/state/sel/dest/moveCount/battle` state, the autosave effect (`:80-84`), `targets` memo (`:100-111`), `onPick` (→ `pick`), `resetSelection` (→ `cancelSelection`), the three done-handlers, fortify confirm, `start`, `resume` (returns false when the stored map no longer builds), `newCampaign` (state/map → null). RiskPage keeps: setup form state, zoom, all JSX.
- [ ] Run hook test + `RiskPage.test.tsx` + `rules.test.ts` — PASS, no behavior change.
- [ ] Commit `refactor(risk): turn logic moves into state/useRisk`.

### Task 4: The bot brain — personas and `decide`

**Files:**
- Create: `src/games/risk/domain/bots/personas.ts`, `src/games/risk/domain/bots/decide.ts`, `src/games/risk/domain/bots/index.ts`
- Test: `src/games/risk/domain/bots/decide.test.ts`

**Interfaces:**
- Produces:

```ts
// personas.ts
export interface RiskPersona {
  id: string; name: string; tagline: string; rung: 1 | 2 | 3 | 4;
  temperature: number;      // softmax over move scores; high = wobbly
  attackEdge: number;       // required (attackers-1) - defenders advantage to consider an attack
  fortifyChance: number;    // 0..1, chance the persona bothers to fortify
}
export const RISK_PERSONAS: readonly RiskPersona[];  // 4, weakest first
export function personaById(id: string): RiskPersona; // falls back to rung 1
```

```ts
// decide.ts / index.ts
export type BotStep =
  | { kind: 'place'; territoryId: string }
  | { kind: 'doneReinforce' } | { kind: 'attack'; from: string; to: string }
  | { kind: 'doneAttack' } | { kind: 'fortify'; from: string; to: string; count: number }
  | { kind: 'doneTurn' };
export function decide(state: GameState, topo: MapTopology, persona: RiskPersona, rng: () => number): BotStep
```

Personas (family may rename in review): Cadet Pip (τ1.4, edge+2, fortify 0), Scout Wren (τ0.8, edge+1, fortify 0.5), General Flint (τ0.35, edge 0, fortify 1), Field Marshal Vex (τ0.12, edge −1, fortify 1).

Scoring (all in `decide.ts`, pure helpers):
- `softmaxPick(scored: {score:number, ...}[], temperature, rng)` — exp((s−max)/τ) weights.
- Claim: `2*(adjacent owned) + continentDensity(bonus/size) − 0.5*(entry points)`.
- Deploy/reinforce placement: frontier pressure `sum(enemy neighbour armies) − own armies`, `+3` if the territory is in a continent where the bot owns all but ≤2 territories.
- Attack candidates: every owned `from` (armies ≥ 2) × enemy neighbour `to` with `canAttack`; score `(armies[from]−1) − armies[to] + 3*(completes my continent) + 2*(breaks a held enemy continent)`; drop candidates below `persona.attackEdge`; empty ⇒ `doneAttack`.
- Fortify: with probability `fortifyChance`, move `armies−1` from the safest owned territory (no enemy neighbours, most armies) to the connected frontier territory with highest pressure; otherwise/no candidate ⇒ `doneTurn`.

- [ ] Write failing tests (seeded): claim step returns a `place` on an unclaimed id; reinforce places on a frontier not an interior; timid persona returns `doneAttack` where bold persona returns an `attack`; fortify moves interior → frontier; determinism (same seed ⇒ same step).
- [ ] Run — FAIL. Implement personas + decide per the formulas above.
- [ ] Run — PASS. Commit `feat(risk): four computer generals, one seeded policy`.

### Task 5: Integration — bots play a whole war

**Files:**
- Test: `src/games/risk/domain/bots/bots-play.test.ts`

- [ ] Test: 3 rung-3/4 bots, seeded rng, pure loop: `decide` → apply via `placeArmy`/`resolveAttack(…,rng)`/`fortify`/`end*`; assert a winner within 5000 steps, no illegal step ever thrown, and same seed ⇒ same winner + step count. A second test: 2 rung-1 bots survive 200 steps without error (no termination claim).
- [ ] Run — expect PASS against Task 4 (fix decide if it stalls or crashes; this test exists to catch that).
- [ ] Commit `test(risk): computer generals finish a full campaign deterministically`.

### Task 6: The bot turn loop in `useRisk`

**Files:**
- Modify: `src/games/risk/state/useRisk.ts`
- Test: extend `src/games/risk/state/useRisk.test.ts`

- [ ] Failing test (fake timers): `start` with players `[human, {bot:'vex'}]`; play the human's claim; advance timers; await the dynamic import microtask; assert the bot claimed a territory (state advanced without any `pick`).
- [ ] Implement: effect keyed on `[state, map]` — when `state.players[state.current].bot` and phase ≠ over, `setTimeout` 500–900 ms (Math.random jitter — pacing, not gameplay), then `const { decide, personaById } = await import('../domain/bots')`, apply the returned step through the hook's own dispatchers (attack steps also `setBattle(result)` so the dice row shows). Cleanup cancels timer; a stale state check (`stateRef`) guards the async gap.
- [ ] Run hook tests — PASS. Commit `feat(risk): computer generals take their own turns`.

### Task 7: Setup screen — seat toggles and persona picker

**Files:**
- Modify: `src/games/risk/components/RiskPage.tsx`, `src/games/risk/styles/risk.css`
- Test: extend `src/games/risk/components/RiskPage.test.tsx`

- [ ] Failing test: toggle seat 2 to computer (`seat-bot-1`), pick persona (`persona-1-flint`), start; assert board reaches claim phase and `risk-turn` eventually shows the persona playing (fake timers).
- [ ] Implement: per-seat state `seats: (string | null)[]` (persona id or null=human). Each `risk-player-row` gains an SVG-icon toggle button (`data-testid="seat-bot-${i}"`, aria-pressed) flipping human ↔ computer; computer seats swap the name input for four persona chips (`data-testid="persona-${i}-${personaId}"`, tagline in `title` and visible small text). `start()` passes `bot: seats[i] ?? undefined` and uses the persona name as the seat name. CSS: chips restyle `.risk-choice`; keep 14px+ text.
- [ ] Run component tests — PASS.
- [ ] Add a `risk-setup` entry to `SHOTS` in `scripts/screenshots.mjs` (route `/#/risk`, prep closes the help dialog) so the new setup UI is captured; run `npm run shots`, commit changed shots.
- [ ] Commit `feat(risk): muster computer generals from the war council`.

### Task 8: Gates and PR

- [ ] `npm run check` (0 errors), `npx vitest run` (all green), `npm run build`, `npm run shots`.
- [ ] Fetch main, `git cherry`, push branch `claude/risk-computer-players`, open PR (screenshots per convention, attribution footer), tell the owner.
