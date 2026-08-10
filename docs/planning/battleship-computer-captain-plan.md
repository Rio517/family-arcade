# Ship Battle Computer Captain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-player Ship Battle against four computer captains, weakest to strongest, per ADR 0009.

**Architecture:** The bot impersonates a network peer: a `LoopbackConnection` implementing the same `host/join/send/destroy` surface as `GameConnection` runs a second pure `SessionState` in-process, pumping protocol messages both ways with thinking delays. The gunner brain is a pure, seeded function of the game log (`radarGrid` is its fair view). The event-sourced session machine, `useBattleship`'s message plumbing, and the single-writer invariants are untouched.

**Tech Stack:** TypeScript, React 18, vitest; existing pure domain (`session.ts`, `engine.ts`, `board.ts:autoPlace`).

## Global Constraints

- Offline PWA, no network for solo games; bot brain lazy-loads via dynamic `import()`.
- Pure policies take `rng: () => number`; tests seed via `@test/helpers` `seededRng`.
- One logical op per Bash call; gates before PR (`check`, `vitest`, `build`); UI change ⇒ committed screenshot.
- Icons SVG only; kid-warm copy; `data-testid` + keyboard + `:focus-visible` on interactive elements.
- Existing battleship tests stay green (session/engine/board/Placement/Battle/page suites).

---

### Task 1: Captain personas

**Files:** Create `src/games/battleship/domain/bots/personas.ts`; test `personas.test.ts` beside it.

**Produces:**
```ts
export interface CaptainPersona {
  id: string; name: string; tagline: string; rung: 1 | 2 | 3 | 4; skinId: string;
}
export const CAPTAIN_PERSONAS: readonly CaptainPersona[]; // 4, weakest first
export function captainById(id: string): CaptainPersona;  // unknown → rung 1
```
Personas: Deckhand Bobble (1, aqua), Bosun Marlin (2, verdant), Captain Wake (3, ember), Admiral Grimtide (4, void).

- [ ] RED: four captains rungs 1–4 in order; `captainById('nope').rung === 1`.
- [ ] GREEN: implement. Commit `feat(battleship): four computer captains`.

### Task 2: The gunner — one shot from the log

**Files:** Create `src/games/battleship/domain/bots/gunner.ts`, `src/games/battleship/domain/bots/index.ts` (re-exports); test `gunner.test.ts`.

**Produces:** `decideShot(log: GameLog, mySide: Side, persona: CaptainPersona, rng: () => number): Coord`

Mechanics (all derived from the log — stateless and fair):
- `radarGrid(log, mySide)` for tried cells; candidates are `'unknown'` cells.
- Active hits: walk `shotsBy(log, mySide)` in order, collecting hits and clearing the list every time an event has `sunk !== null` (the engine marks only the finishing cell sunk).
- Surviving ship sizes: `FLEET` sizes minus the sizes of sunk `ShipId`s seen in my shots.
- Rung 1: uniform random among candidates.
- Rung 2: target mode when active hits exist — untried orthogonal neighbours of the hits; with 2+ aligned hits only the two line ends; else hunt at random.
- Rung 3: rung 2, but hunting only on parity cells `(row+col) % 2 === offset` (offset from rng once per call) while any remain.
- Rung 4: probability density — for each surviving size, slide every horizontal/vertical placement; a placement is valid over `'unknown'` and `'hit'` cells only; each valid placement votes for its unknown cells, placements covering active hits vote ×8; fire at the top-voted candidate (ties broken by rng).
- Fallback: first unknown cell (never out of bounds, never a repeat).

- [ ] RED tests: never repeats a tried cell (feed a half-played log); rung 2 follows up a fresh hit on a neighbour; rung 2 shoots a line end for two aligned hits; rung 3 hunts on one parity only; rung 4 targets the only cell consistent with an active hit pair; after a sink the target list resets (next shot is a hunt, not a neighbour of the sunk ship); same seed ⇒ same shot.
- [ ] GREEN: implement. Commit `feat(battleship): the gunner — hunt, target, parity, density`.

### Task 3: The loopback peer

**Files:** Create `src/games/battleship/state/loopback.ts`; test `loopback.test.ts`.

**Produces:**
```ts
export interface LoopbackOptions {
  personaId: string;
  rng?: () => number;
  /** Injectable scheduler for tests; production defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Restore a mid-game bot: its fleet plus the shared log. */
  resume?: { fleet: Fleet; log: GameLog; myReady: boolean };
}
export class LoopbackConnection {
  constructor(handlers: ConnectionHandlers<Message>, opts: LoopbackOptions);
  host(code: string): void;  // human hosts; the captain joins as guest
  join(code: string): void;  // same as host (solo humans always host)
  send(msg: Message): boolean;
  destroy(): void;
}
```
Behaviour: on `host`, build the captain's `SessionState` (guest side, persona name + skin), report `connected`, fire `onOpen`, deliver the captain's `connectHandshake`; then after a thinking delay `autoPlace(rng)` + `confirmReady`. Every `send(msg)` applies `Session.applyMessage` to the bot state and delivers `outgoing` back through `handlers.onMessage` (small latency). After every bot state change, if `phase === 'battle' && isMyTurn(bot)`, schedule one `decideShot` → `fireAt` with a 700–1200 ms think. `destroy` cancels all pending timers. The gunner module is loaded via dynamic `import()` on first need and cached.

- [ ] RED test: with an immediate scheduler and seeded rng, a scripted human session (mirroring `session.test.ts`'s pump) plays a full game against the loopback to a winner; single-writer invariants hold (every ShotEvent minted by the defender); rematch resets and plays again; `destroy` cancels a pending fire.
- [ ] GREEN: implement. Commit `feat(battleship): a computer captain behind the peer interface`.

### Task 4: `useBattleship.startSoloGame` + solo resume

**Files:** Modify `src/games/battleship/state/useBattleship.ts`, `src/games/battleship/storage/sessionStore.ts`; extend `sessionStore.test.ts` (if present) and add hook coverage in the page test (Task 5).

**Produces:** `startSoloGame(personaId: string, name: string): void` on the hook result; `GameSession.solo?: { personaId: string; botFleet: Fleet }` in storage.

- `connRef` type widens to the 4-method interface both connections satisfy.
- `startSoloGame`: creates the human session (`side 'host'`, code `'SOLO'`), constructs a `LoopbackConnection` (persona, `Math.random`), `host('SOLO')`.
- The loopback exposes `snapshot(): { fleet: Fleet; myReady: boolean }` so the persist effect can write `solo` extras; `resumeGame` sees `stored.solo` and rebuilds the loopback with `resume` data instead of a network connection.
- [ ] RED: storage round-trips the `solo` extras; loading an old blob without them still works.
- [ ] GREEN + commit `feat(battleship): solo games start, save and resume`.

### Task 5: Lobby UI + page flow

**Files:** Modify `src/games/battleship/components/Lobby.tsx`, `BattleshipPage.tsx`; extend the page test; screenshot entry in `scripts/screenshots.mjs`.

- Lobby gains a third choice: **“Battle the computer”** (`data-testid="solo-game"`) → the captain ladder (`captain-<id>` buttons, tagline + name, rung order) → `onSolo(personaId, name)`.
- `BattleshipPage` passes `onSolo={(p, n) => bs.startSoloGame(p, n)}`; the code chip and “waiting for opponent” strings already key off `oppConnected`/`showCode`, which the loopback satisfies (`connected` immediately) — verify, don't duplicate.
- [ ] RED page test: choose solo → pick Admiral Grimtide → placement phase reached; with fake-immediate scheduler injected? (No — page test drives the REAL loopback with real short timers via `waitFor`: after `fast-start`, the battle phase arrives and `oppName` shows the captain's name.)
- [ ] GREEN + `battle-lobby` screenshot (`/#/play`, solo panel open). Commit `feat(battleship): battle the computer from the lobby`.

### Task 6: Gates, live verification, PR

- [ ] `npm run check` (0 errors) · `npx vitest run` · `npm run build` (bot chunk splits) · `npm run shots`.
- [ ] Live: real browser — pick Admiral Grimtide, fast-start, exchange several real shots; captain fires back after thinking pauses; clean console.
- [ ] Fetch main, `git cherry`, push, PR with screenshots; tell the owner.
