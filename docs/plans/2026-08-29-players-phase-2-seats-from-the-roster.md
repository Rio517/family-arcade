# Players Phase 2 — Seats from the Roster: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass-and-play chairs (Chess same-device, Risk's six, Magic Coins) are filled by tapping tickets from the roster — never typed — and the last lineup is remembered per game.

**Architecture:** A pure seat model (`seats.ts`: a chair is a ticket, a bot, or empty — ids only, names derived at render), a lineup store keyed by game id (`arcade.lineup.v1`, read via `useSyncExternalStore`), one shared tappable roster row (`TicketStrip`), and a default `SeatPicker` composition that Chess and Magic Coins use as-is while Risk composes the strip into its own heraldic row. Identity writers move out of `useProfile` into `useIdentity`, which `src/games/**` cannot import (ESLint), so "no game writes a name" becomes structural. `addUser` becomes append-only. `StoredUser.createdAt` goes.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, Vite, knip, ESLint flat config.

## Global Constraints

- Gates under Node 20: `export PATH="$HOME/.local/share/mise/installs/node/20.20.2/bin:$PATH"`.
- `npm run check` exit 0 with **0 errors** (67 deliberate warnings); never pipe it. `npx vitest run` green, on a quiet machine (never while `npm run shots` builds). `npm run build` exit 0. `npm run shots` regenerated and reviewed.
- One logical shell operation per Bash call (`bash -c "…"` for chains). Files containing backticks are written with the Write tool.
- Icons are SVG, never emoji. Interactive elements carry `data-testid` and a keyboard path; dialogs close on Escape via `useDismissOnEscape`; text ≥ 14px; tap targets ≥ 44px. Copy is warm and kid-facing.
- Design: `docs/ideas/players-and-party.md` § Seats (revised 2026-08-29). Lineup precedence: **a saved lineup wins wholesale; the signed-in ticket seeds chair ① only when the game has no lineup yet.**
- Storage keys: shared state is `arcade.<thing>.v<n>`; a game's own is `<game>:<thing>:v<n>`; every key is normalized on read in a pure `x.ts` + `xStore.ts` pair. Never rename an existing key.

---

### Task 1: Roster cleanup — `addUser` append-only, `createdAt` gone, `useIdentity`

**Files:**
- Modify: `src/shared/profile/users.ts`, `users.test.ts`, `usersStore.ts`, `useUsers.ts` → rename to `useIdentity.ts`, `useProfile.ts`, `PlayerGate.tsx`, `PlayingAs.tsx`, `PlayerBooth.tsx` (+ `PlayerBooth.test.tsx` seed shape), `PartyBar.tsx`, `party-ui.test.tsx`, `PlayingAs.test.tsx`, `PlayerGate.test.tsx`, `profileStore.test.ts`, `TicketList.test.tsx`, `tickets.test.ts`, the four integration tests that call `addUser(…, name, 1)`, `scripts/screenshots.mjs` SEED_ROSTER (drop nothing — it never had `createdAt`).
- Modify: `eslint.config.js` — a `no-restricted-imports` block for `src/games/**/*.{ts,tsx}`.

**Interfaces:**
- `StoredUser = { id: string; profile: Profile }` (no `createdAt`).
- `addUser(state, id, name): UsersState` — appends, does **not** change `activeId`.
- `migrateDeviceProfile(old: Profile | null): UsersState`.
- `useIdentity(): { users, active, signIn(id), newPlayer(name), addPlayer(name): string, setName(name) }` — `newPlayer` = `addPlayer` + `signIn`; `addPlayer` returns the new id and leaves the signed-in player alone (for seat pickers).
- `useProfile(): { profile, setPronouns, recordResult, update }` — `setName` removed (Caribbean keeps writing pronouns through `useProfile`; the rule is about *names*).

- [ ] **Step 1: Failing tests.** In `users.test.ts`: `addUser` no longer activates (`activeId` stays `null` after one add; stays `'u1'` after adding `u2` while `u1` is active); `migrateDeviceProfile(old)` single-arg; `normalizeUsersState` output has no `createdAt`. In a new `useIdentity.test.tsx`: `addPlayer('Nana')` returns an id, roster grows, `active` unchanged; `newPlayer('Nana')` signs Nana in; `setName` renames the active ticket only. Run → FAIL.
- [ ] **Step 2: Implement.** `useUsers.ts` → `useIdentity.ts` (git mv), add `addPlayer`/`setName`; `newPlayer` composes `setActiveUser(addUser(...), id)`. Remove `createdAt` everywhere (`normalizeUsersState` ignores the key). Move `setName` off `useProfile`. Update every caller.
- [ ] **Step 3: ESLint guard.** Add to `eslint.config.js` after the test block:
  ```js
  {
    // Identity is set at the gate and the booth, never inside a game — the
    // design rule "no game writes a name" enforced at the import boundary.
    files: ['src/games/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/useIdentity', '@shared/profile/useIdentity'], message: 'Games read the ticket through useProfile(); only the gate, the booth and PlayingAs change who is signed in.' }] }],
    },
  },
  ```
  Verify it bites: temporarily import `useIdentity` in `ChessPage.tsx`, run `npx eslint src/games/chess/components/ChessPage.tsx`, see the error, revert.
- [ ] **Step 4:** `npx vitest run src/shared src/app` → PASS. Commit: `refactor(players): addUser appends only; createdAt gone; useIdentity owns the writers`.

---

### Task 2: `seats.ts` — the pure seat model

**Files:**
- Create: `src/shared/profile/seats.ts`, `seats.test.ts`.

**Interfaces (produces):**
```ts
export type Seat =
  | { kind: 'ticket'; userId: string }
  | { kind: 'bot'; botId: string }
  | { kind: 'empty' };
export type LineupEntry = { userId: string } | { bot: string } | null;
export type Lineup = LineupEntry[];
export const EMPTY_SEAT: Seat;
export function seatsFromLineup(users: StoredUser[], lineup: Lineup | null, activeId: string | null, count: number): Seat[];
export function lineupOf(seats: Seat[]): Lineup;
export function setSeat(seats: Seat[], index: number, seat: Seat): Seat[];
export function clearSeat(seats: Seat[], index: number): Seat[];
export function fillNextEmpty(seats: Seat[], seat: Seat): Seat[]; // same array if no chair is free
export function swapSeats(seats: Seat[], a: number, b: number): Seat[];
export function seatedUserIds(seats: Seat[]): string[];
export function seatName(seat: Seat, users: StoredUser[], botName: (id: string) => string): string; // '' for empty or a vanished ticket
export function normalizeLineup(raw: unknown): Lineup;               // bad entries → null
export function normalizeLineups(raw: unknown): Record<string, Lineup>; // bad map → {}
```

- [ ] **Step 1: Failing tests** covering: saved lineup wins over the active ticket; no lineup → chair ① is the active ticket, rest empty; no lineup and nobody signed in → all empty; a lineup naming a vanished user → that chair empty; count shorter/longer than the lineup (truncate/pad); bots round-trip through `lineupOf`; `fillNextEmpty` skips filled chairs and returns the same reference when full; `swapSeats`; `seatName` for all three kinds; `normalizeLineup(['x', { userId: 3 }, { bot: 'cadet' }, { userId: 'u1' }])` → `[null, null, {bot:'cadet'}, {userId:'u1'}]`.
- [ ] **Step 2: Implement** (pure, no imports beyond `users.ts` types). Run → PASS. Commit: `feat(players): pure seats - ticket, bot, or empty`.

---

### Task 3: `lineupStore.ts` + `useLineup`

**Files:**
- Create: `src/shared/profile/lineupStore.ts`, `lineupStore.test.ts`, `useSeats.ts`, `useSeats.test.tsx`.

**Interfaces (produces):**
```ts
// lineupStore.ts — key 'arcade.lineup.v1', Record<gameId, Lineup>, normalized on read
export const LINEUP_KEY = 'arcade.lineup.v1';
export function getLineupsSnapshot(): Record<string, Lineup>;
export function subscribeLineups(cb: () => void): () => void;
export function setLineup(gameId: string, lineup: Lineup): void;  // persists + notifies
export function resetLineupStore(): void;                          // tests
// useSeats.ts
export function useSeats(gameId: string, count: number): {
  seats: Seat[]; users: StoredUser[];
  setSeats: (next: Seat[]) => void;
  remember: () => void;   // setLineup(gameId, lineupOf(seats)) — call when the game starts
};
```
`useSeats` initialises from `seatsFromLineup(users, lineups[gameId] ?? null, activeId, count)` once per mount and when `count` changes (re-derive, keeping already-chosen chairs where indices still exist).

- [ ] **Step 1: Failing tests.** Store: round-trips through localStorage; corrupt JSON → `{}`; unknown game ids are kept on read (a temporarily unregistered game keeps its lineup). Hook: seeds from the active ticket when no lineup; seeds from the lineup when present; `remember()` writes `arcade.lineup.v1`; a count increase pads with empties without losing chosen chairs.
- [ ] **Step 2: Implement** (mirror `usersStore.ts`). Run → PASS. Commit: `feat(players): lineups remembered per game`.

---

### Task 4: `TicketStrip` and `SeatPicker`

**Files:**
- Create: `src/shared/profile/TicketStrip.tsx`, `TicketStrip.test.tsx`, `SeatPicker.tsx`, `SeatPicker.test.tsx`; styles appended to `player.css`.

**Interfaces (produces):**
```tsx
// The tappable roster row under any seat UI. Used tickets are dimmed (still
// tappable — tapping a seated ticket moves it? No: it is a no-op with the
// chair highlighted). "+ New player" reveals one field + "Make a ticket",
// which appends WITHOUT signing in (useIdentity().addPlayer) and returns the id.
export function TicketStrip(props: {
  seated: ReadonlySet<string>;
  onPick: (userId: string) => void;     // called for unseated tickets and for a freshly made one
  testIdPrefix?: string;                // default 'strip' → strip-user-<id>, strip-new, strip-name, strip-create
}): JSX.Element;

// The default composition: numbered rows + the strip. Chess and Magic Coins use it as-is.
export function SeatPicker(props: {
  seats: Seat[];
  onChange: (next: Seat[]) => void;
  rowLabel?: (index: number) => React.ReactNode;   // e.g. 'White' / 'Black'
  accent?: (index: number) => string;               // per-chair colour for the number badge
  botName?: (botId: string) => string;              // only Risk has bots; default returns ''
  testIdPrefix?: string;                            // default 'seat' → seat-<i>, seat-<i>-clear
}): JSX.Element;
```
Rows: `① [medal] Klara  (you)   ×` for a ticket; `② tap a ticket below` (dashed) for empty. Tapping a strip ticket fills the **first empty** chair; × clears. `(you)` marks the signed-in ticket. Everything ≥ 44px, focus-visible, labels for screen readers ("Chair 2: tap a ticket below").

- [ ] **Step 1: Failing tests** (strip): lists the roster with medals; seated ids get `aria-pressed`/dimmed and don't fire `onPick`; `+ New player` → type → Make → `onPick(newId)` and the roster grew while `activeId` is unchanged; blank/duplicate names refused. (picker): tapping a ticket fills the first empty chair; × empties; a full picker ignores further taps; `rowLabel`/`accent` render; keyboard: Tab to a chip, Enter picks.
- [ ] **Step 2: Implement.** Run → PASS. Commit: `feat(players): TicketStrip and SeatPicker`.

---

### Task 5: `seats` on the descriptor

**Files:**
- Modify: `src/shared/game.ts` (add `seats?: { min: number; max: number }` with the doc comment "chairs on THIS device; `players` is the menu badge"), every `src/games/*/index.ts`: unicorn `{1,3}`, risk `{2,6}`, chess `{1,2}`, battleship `{1,1}`, racer `{1,1}`, caribbean `{1,1}`; `src/app/App.test.tsx` or a new `registry.test.ts`: every game declares `seats` with `1 ≤ min ≤ max`.

- [ ] Test → FAIL → implement → PASS → commit: `feat(registry): every game declares its chairs`.

---

### Task 6: Chess same-device seats

**Files:**
- Modify: `src/games/chess/components/ChessPage.tsx` (the `setup === 'local'` panel), `ChessPage.test.tsx`, `chess.css` if needed.

Replace the White/Black inputs with `useSeats('chess', 2)` + `<SeatPicker rowLabel={i => i === 0 ? 'White' : 'Black'} …/>` and a **Swap sides** button (`swapSeats`, testid `chess-swap-sides`). *Start game* → `remember()` then `cx.startLocal(seatName(seats[0]) || 'White', seatName(seats[1]) || 'Black')`. The `whiteName`/`blackName` state and the inputs go; `FreePlay`'s `onStartGame` uses the same two names. `profile.setName` is unavailable to games now (Task 1) — nothing in chess needs it.

- [ ] Tests first (the existing "same-device chair names stay game-local" test becomes: seat Rio and Flora via the picker, start, assert `arcade.users.v1` unchanged except that Flora is a roster entry — not the active one; plus swap; plus "next visit opens with the same chairs"). → FAIL → implement → PASS → commit: `feat(chess): same-device chairs come from the roster`.

---

### Task 7: Risk's war council seats

**Files:**
- Modify: `src/games/risk/components/RiskPage.tsx`, `RiskPage.test.tsx` (check what exists; add if missing), `risk.css`.

Replace `names: string[]` + `seats: (string|null)[]` with one `useSeats('risk', count)` (`Seat[]`, bots as `{ kind: 'bot', botId }`). Each row keeps the heraldic seal and the person/general toggle: a human chair shows the seated ticket (medal + name, ×) or *tap a ticket below*; a general chair shows the persona chips as today. One `<TicketStrip>` under the rows. `start()` builds `NewPlayer[]`: ticket → the ticket's name; bot → persona; empty → `PLAYER_NAMES[i]` (a chair without a ticket still plays, as today). `remember()` on start. Keep test ids `count-<n>`, `seat-bot-<i>`, `persona-<i>-<id>`; the old `name-<i>` inputs go.

- [ ] Tests first → FAIL → implement → PASS → commit: `feat(risk): the generals take their tickets`.

---

### Task 8: Magic Coins seats

**Files:**
- Modify: `src/games/unicorn/components/UnicornPage.tsx`, its test, `unicorn.css`.

Insert a `seats` phase between `players` (count) and `world`: `useSeats('unicorn', playerCount)`, `<SeatPicker accent={i => PLAYER_COLORS[i]} />`, *Next* (testid `uni-seats-next`). Names flow into `PlayerConfig.name` (`seatName(...) || PLAYER_NAMES[i]`), and the character-pick title says *Klara, pick your character*. `remember()` when the game starts. `playAgain` keeps the names.

- [ ] Tests first → FAIL → implement → PASS → commit: `feat(unicorn): who's playing, by ticket`.

---

### Task 9: Gates, screenshots, PR

- [ ] `grep -rn "useUsers\|createdAt\|profile.setName" src scripts` → no hits (except `setName` inside `useIdentity`/booth).
- [ ] `scripts/screenshots.mjs`: `risk-setup` prep still valid (`seat-bot-2`); add `chess-seats` (TABLET, `/#/chess`, click the same-device door, wait `seat-0`) and `unicorn-seats` (TABLET, `/#/unicorn`, click `uni-players-2`, wait `seat-0`).
- [ ] check (0 errors) · vitest (quiet machine) · build · shots reviewed · fetch/cherry · push · PR via `--body-file`, pinned screenshots.
