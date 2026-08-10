# 9. Computer players are seeded domain policies, not LLMs

Status: Proposed

## Context

The family wants computer opponents: Risk against the generals with nobody on
the other chairs, single-player Ship Battle, and eventually a computer seat in
any game. The kids are 6, 8 and 10, so one difficulty cannot fit everyone —
the six-year-old needs an opponent she can beat sometimes, the ten-year-old
needs one that pushes him.

Three architecture invariants bound the solution space before any cleverness:

- **Offline-first, no runtime downloads (ADR 0004).** A cloud LLM or any
  API-driven "AI" is out — the arcade must play on a plane. It would also be
  slower, cost money per move, and play these games *worse* than the classic
  algorithms below.
- **Bundle discipline (ADR 0006).** All five games currently share one ~149 KB
  gzip `index` chunk; there is no per-game code splitting, only `React.lazy`
  boundaries. An embedded engine (Stockfish-wasm is megabytes) taxes every
  player — including the five-year-old opening Magic Coins — for one feature.
- **Pure, seeded domains (ADR 0002, 0005).** Every game already derives play
  from pure `domain/` functions taking an `rng` parameter. A bot that is also
  a pure seeded function slots into replay, persistence and vitest unchanged.

The classic algorithms are genuinely strong here: Ship Battle's hunt/target +
probability-density bot is near-optimal in ~150 lines; Risk plays a good game
from a scored heuristic policy; a few hundred lines of minimax with
alpha-beta pruning beats most club players at friendly depths. None of this
needs machine learning.

## Decision

**A computer player is a pure, seeded policy function in its game's own
`domain/`** — `(visibleState, rng) => action` — presented to the family as a
**ladder of named characters**, local games only in v1.

Concretely:

1. **No LLMs, no wasm engines, no network.** Bot brains are hand-written
   TypeScript in `src/games/<id>/domain/bots/`, unit-tested like any rule.
2. **Fair information only.** A bot sees what a human in that seat sees —
   Ship Battle bots read `radarGrid(log, side)`, never the opponent's fleet.
3. **Personas are the difficulty.** Each game ships ~4 named opponents, each
   a fixed policy preset, weakest to strongest, so picking a character *is*
   picking a difficulty and each kid has a rung to beat and a rung to chase.
   Under the hood one mechanism grades all of them: policies score candidate
   moves, and a rung sets search depth plus a softmax temperature over those
   scores (low rungs sometimes play the second- or third-best move, seeded —
   they blunder plausibly rather than acting randomly).
4. **Bots are lazy-loaded.** Policy modules load via dynamic `import()` when
   a computer seat is chosen, following the three.js precedent, so games
   without a bot in play pay zero bytes.
5. **Seeded and replayable.** `seededRng` (mulberry32, today a test helper in
   `src/test/helpers.ts`) is promoted to a shared util; bot decisions draw
   from it per ADR 0005. Persistence records the bot seat (a flag on the
   player/session state in `riskPersistence` / `chessPersistence`), so a
   resumed game remembers who is a computer.
6. **Local-only in v1.** No bot ever authors network messages; the
   event-sourced online invariants are untouched. A bot seat in online games
   would be a follow-up amendment.
7. **Pacing is UI, not domain.** Bots "think" for ~500–900 ms of seeded
   jitter before moving (timers live in the React layer, the rule stays pure —
   the `useBattleship` fire-watchdog idiom), so a six-year-old can follow the
   turn.

### Where each bot plugs in (rollout order)

1. **Risk** — richest payoff: 2–6 player games where any general can be a
   computer. Prep: extract the inline turn logic from `RiskPage.tsx` into
   `state/useRisk.ts`; then an effect keyed on `(current, phase)` asks the
   policy for a move and dispatches through the same pure functions the UI
   calls (`placeArmy`, `resolveAttack`, `fortify`, `endTurn`). The domain has
   no move enumerator, so the policy derives candidates from `territoriesOf`
   + `MapTopology.adjacency` + `canAttack`/`canFortify`. Heuristics: continent
   bonus value, border pressure, army ratios; attack while the ratio favours,
   fortify toward the frontier.
2. **Ship Battle** — the game has no local mode, and it does not need one:
   the bot impersonates a **network peer** by implementing the three-method
   `GameConnection` surface (`host`/`join`/`send`) as an in-process loopback
   around a second `SessionState`. `useBattleship` and the event-sourced log
   are untouched; `session.test.ts`'s two-session `Peer` pump is the working
   blueprint, `autoPlace(rng)` already builds the bot's fleet, and
   `radarGrid` is its fair view. Policy ladder: random-ish → hunt/target →
   + parity → + full probability density.
3. **Chess** — the best socket, the biggest brain. Local mode already lets
   either colour move (`canIMove`), `legalMoves(state)` is a complete
   enumerator, and `applyMove` is copy-on-write and documented search-safe.
   A `botColor` on the local session plus one effect in `useChess`; the
   policy is minimax + alpha-beta over `legalMoves`, evaluation from material
   + piece-square tables, rungs = depth 1–4 with graded temperature. Search
   runs in a `requestIdleCallback`/chunked loop (or a worker later) so deep
   rungs never jank the board.
4. **Rainbow Racer and Magic Coins** — deferred; real-time games need a
   per-frame *input producer* (`KartInput` / `setDir`), not a move chooser.
   The seams exist (`stepRace`'s `RemoteInput` slot; `setDir` in the rAF
   loop) and are recorded here so a future session doesn't re-derive them,
   but they are a different pattern and out of scope for the ladder above.

## Consequences

- Works offline forever, costs nothing per move, and every bot game is
  reproducible from its seed — a bug report is a replayable log.
- Bot code is ordinary domain code: pure, typed, unit-tested, reviewed like
  rules. Tuning a persona is editing numbers, not prompting a model.
- Each game writes its own brain — there is no shared "bot framework" beyond
  the persona/rng contract, honouring "shared never imports a game".
- The ladder gives the family progression without settings screens: beat the
  rung-2 character, try the rung-3 one. Difficulty conversations become
  character conversations.
- Deliberate limitation: heuristic Risk and depth-limited chess are beatable
  by strong adults. That is the right trade for this arcade; revisit only if
  the kids outgrow rung 4.
- Prep work is honest: Risk needs its `state/` hook extracted first, and
  Ship Battle's loopback peer is new plumbing (though test-proven in shape).
