# Players Phase 3 — The Party Is the Table: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two devices in a party never trade a game code again — whoever opens an online game "opens the table", the other device's party pill lights up, one tap seats them — and the party survives a reload.

**Architecture:** Two PRs. **3a** grows the party layer (ADR 0008) without touching games: tests for `PartyContext` first, then `table`/`knock` messages on the presence link, a `resolveGame` prop so shared stays game-blind (ADR 0002), persistence under `arcade.party.v1` with the reconnect failure modes designed for, and the pill invite. **3b** carves the game seam: the three online hooks collapse `hostGame`/`joinGame` into `startTable({ role, code, seatedUserId })`, lobbies branch on the party, chess announces the host's side, and every online session (and Risk's campaign) keeps the ticket id that started it — so Phase 4 is a delete.

**Tech Stack:** React 18 + TypeScript, PeerJS (`GameConnection`), Vitest + Testing Library, Vite.

## Global Constraints

- Gates under Node 20 (`export PATH="$HOME/.local/share/mise/installs/node/20.20.2/bin:$PATH"`); `npm run check` 0 errors (67 warnings), `npx vitest run` on a quiet machine, `npm run build`, `npm run shots` reviewed. One shell op per Bash call; backtick-bearing files via the Write tool.
- ADR 0003/0008 hold: **game rules travel on each game's own link**; the party's presence link carries names and a four-character handoff only, never anything that replays or rewrites history.
- `src/shared/**` never imports a game or the registry; `src/games/**` never imports `useIdentity`/`usersStore`/`users` (ESLint guard).
- Design: `docs/ideas/players-and-party.md` §§ "The party carries the table", "The party survives a reload", "Results for everyone seated". Storage key scheme in `src/shared/storage/kv.ts`.
- Accessibility floors; SVG icons; warm kid copy; every animation behind `prefers-reduced-motion`.

---

## PR 3a — the party layer

### Task 1: `PartyContext` gets its first tests

**Files:** Create `src/shared/party/PartyContext.test.tsx`; read `src/games/chess/components/chess.integration.test.tsx` for the `vi.mock('@shared/net/peer', …)` pattern that captures a `GameConnection`'s handlers.

Mock `GameConnection` so each instance exposes `handlers` and a `sent: PartyMsg[]` log, plus `host(code)`/`join(code)`/`destroy()` spies. Render `<PartyProvider>` with a `Probe` that surfaces `useParty()`.

- [ ] Tests (RED): `myName` follows the roster (`setUsersState(...)` → probe shows the new name); `hostParty()` returns a 4-char code, hosts with prefix `party-v1-`, and sends `hello` on `onOpen`; a ticket switch while `inParty` re-sends `hello` with the new name; a peer `hello` sets `theirName` (clamped to 24 code points, `'Friend'` when blank); `leaveParty()` destroys the connection and clears `code/role/theirName`; the media call is not started by join/host.
- [ ] Commit: `test(party): PartyContext under a mocked link`.

### Task 2: Protocol — `table`, `knock`, `table-closed`

**Files:** `src/shared/party/protocol.ts`, `protocol.test.ts`.

```ts
export interface PartyTable { t: 'table'; game: string; code: string; hostSide?: string }
export interface PartyKnock { t: 'knock'; game: string }
export interface PartyTableClosed { t: 'table-closed' }
export type PartyMsg = PartyHello | PartyTable | PartyKnock | PartyTableClosed;
```
`isPartyMsg`: `game` is a string ≤ 32 chars; `code` is exactly `normalizeCode(code)` and 4 long; `hostSide` absent or ≤ 8 chars. Bounds first, like `MAX_NAME_LEN`.

- [ ] Tests (RED) for each accept/reject; commit `feat(party): the table and the knock on the wire`.

### Task 3: `party.ts` + `partyStore.ts` — the party survives a reload

**Files:** Create `src/shared/party/party.ts` (pure), `party.test.ts`, `partyStore.ts`, `partyStore.test.ts`.

```ts
export interface StoredParty { code: string; role: 'host' | 'guest'; at: number; table: { game: string; code: string; hostSide?: string } | null }
export const PARTY_TTL_MS = 12 * 3600e3;
export function normalizeParty(raw: unknown): StoredParty | null; // role narrowed, code via normalizeCode (must be 4), at finite, table validated like the wire message
export function isFresh(p: StoredParty, now: number): boolean;
// partyStore.ts — key 'arcade.party.v1'; loadParty(now) returns a fresh party or null (and clears a stale one); saveParty(p); clearParty()
```
`now` comes from `arcadeNow()` so the 12-hour expiry is testable.

- [ ] Tests (RED): round-trip; corrupt → null; stale → null and removed; bad code → null. Commit `feat(party): a party remembered for twelve hours`.

### Task 4: `PartyContext` — table, knock, persistence, reconnecting, `resolveGame`

**Files:** `src/shared/party/PartyContext.tsx`, `PartyContext.test.tsx`, `src/app/App.tsx` (pass `resolveGame`).

`PartyValue` gains:
```ts
table: { game: string; code: string; hostSide?: string } | null;  // the table open on this party (both sides)
knock: string | null;            // host: the game the guest is asking for
reconnecting: boolean;           // a remembered party is being re-joined
openTable: (game: string, hostSide?: string) => string;  // host only: fresh code, sends `table`, returns the code
closeTable: () => void;          // host: sends `table-closed`
knockOn: (game: string) => void; // guest
clearKnock: () => void;
retry: () => void;               // after an error: re-host / re-dial the same code
resolveGame: (id: string) => { title: string; path: string } | null;
```
Behaviour:
- `hostParty(code?)` accepts a code (auto-rejoin re-hosts the remembered one). On every `onOpen` the host sends `hello` **and** `table` if one is open (the re-announce that survives a reload).
- `openTable` generates a **fresh** game code each time (a rematch never collides with a saved session under the old code); persisted with the party.
- Guest receiving `table` sets `table`; `table-closed` clears it. Host receiving `knock` sets `knock`.
- On mount: `loadParty(arcadeNow())` → if present, `reconnecting = true`, then `hostParty(code)` / `joinParty(code)` through the normal paths (so `stopCall()` still runs — ADR 0007 holds). `reconnecting` clears on `connected` or on `leaveParty`.
- `leaveParty` clears storage. `saveParty` on host/join/openTable/closeTable/status connected.
- `resolveGame` comes from the provider prop (App wires `(id) => GAMES.find(g => g.id === id) ?? null` mapped to `{title, path}`).

- [ ] Tests (RED) in `PartyContext.test.tsx`: host `openTable` sends `table` and persists; guest receives `table`; `table-closed` clears; `knock` round trip; reload restores a fresh party as `reconnecting` and re-hosts/re-dials the same code; a stale party is ignored; `onOpen` re-announces the table; `leaveParty` clears `arcade.party.v1`; `retry` re-dials.
- [ ] Commit: `feat(party): the party carries the table and comes back after a reload`.

### Task 5: `peer.ts` — the two reconnect holes

**Files:** `src/shared/net/peer.ts`, `peer.test.ts` (create if absent; mock `peerjs`).

- `ConnectionConfig.dialTimeoutMs?` (default 20 000) — the party passes 120 000 so a PWA cold start on the other iPad doesn't end the guest's dialing in a terminal error.
- `unavailable-id` while hosting: retry `createPeer` after `DIAL_RETRY_MS`, up to the same deadline, reporting `reconnecting` ("Reclaiming your code…"); terminal error only after the deadline. (A hard PWA kill leaves the old registration on the broker for a few seconds.)
- [ ] Tests (RED): a guest keeps dialing past 20 s when configured; a host retries `unavailable-id` and succeeds on the second try. Commit `fix(net): a reload doesn't strand the party`.

### Task 6: The pill lights up

**Files:** `src/shared/party/PartyBar.tsx`, `party.css`, `party-ui.test.tsx`; `scripts/screenshots.mjs` (`party-invite` shot: seeded party state is not reachable without a link — skip unless a harness exists).

- In a party with `table` set and the current route not equal to that game's path (use `useLocation`): the pill gets `.invite` (glow, reduced-motion-gated) and a badge `{title} ›`; the panel shows *{theirName} opened {title}* with a `Link` to the path (`party-invite-go`).
- Host with `knock`: *{theirName} wants to play {title}* + *Open* link (`party-knock-go`); `clearKnock` on navigation.
- `reconnecting`: pill shows "reconnecting…"; panel shows *Reconnecting to your party…* with *Leave party*; on `error`: *Try again* (`party-retry`) and *Leave*.
- The pill's two avatars use `Medal` (same colour as everywhere; the other player's medal uses a neutral index).
- [ ] Tests (RED) with the mocked `useParty`; commit `feat(party): the pill says who opened what`.

### Task 7: 3a gates + PR

- [ ] check · vitest · build · shots (party panel) · PR "feat(party): the party carries the table — comes back after a reload, lights up the pill".

---

## PR 3b — the game seam

### Task 8: `startTable` in the three online hooks; every session keeps its ticket id

**Files:** `src/games/chess/state/useChess.ts`, `domain/session.ts`, `storage/chessPersistence.ts` (+tests); `src/games/battleship/state/useBattleship.ts`, `domain/session.ts`, `storage/sessionStore.ts` (+tests); `src/games/racer/net/useRacerNet.ts`, `components/RacerPage.tsx`; `src/games/risk/domain/rules.ts` (`NewPlayer.userId?`, `PlayerState.userId?`), `RiskPage.tsx` (pass `userId` from a ticket chair); `src/games/unicorn` (`PlayerConfig.userId?`).

- `startTable({ role, code, seatedUserId, hostSide? })` replaces `hostGame(name)` + `joinGame(code, name)` in chess and battleship, and `host()` + `join(code)` in racer; the name comes from the hook's `opts.name`. `resumeGame(code)` stays.
- `SessionState.seatedUserId: string | null` in chess and battleship; stored shapes gain the optional field (old saves → `null`; no version bump needed because the field is optional and normalized).
- Chess: `createOnlineSession(side, code, myName, hostSide: Color = 'w')` — `myColor` = `hostSide` for the host, the opposite for the guest; stored shape gains optional `myColor` (old saves derive from side).
- Delete the unreachable local-name fallbacks (`|| 'Captain'/'Player'/'Racer'/'You'`) — the gate guarantees a name; keep opponent fallbacks.
- [ ] Tests first per module; commit per game.

### Task 9: Lobbies on the party

**Files:** `src/games/chess/components/ChessPage.tsx` (online setup), `src/games/battleship/components/Lobby.tsx` + `BattleshipPage.tsx`, `src/games/racer/components/RacerSetup.tsx` + `RacerPage.tsx`; tests for each with a mocked `useParty`.

Each online lobby reads `useParty()`:
- `party.reconnecting` → *Reconnecting to your party…* (no code doors).
- `party.inParty && party.role === 'host'` → one button *Play {Game} with {theirName}* → `startTable({ role: 'host', code: party.openTable(gameId, hostSide), seatedUserId })`. Chess adds *I play White / Black* (default White) before it.
- `party.inParty && party.role === 'guest'` → on mount `knockOn(gameId)` if no table for this game; when `party.table?.game === gameId`, `startTable({ role: 'guest', code: party.table.code, seatedUserId })` once (ref-guarded); until then *Waiting for {theirName} to open {Game}…*.
- Not in a party → the code doors exactly as today.
- Leaving a game as host (`exitToMenu`/`leave`) → `party.closeTable()`.
- `seatedUserId` = `useProfile().profile` has no id — add `useProfile().userId` (the active ticket's id, read-only) so games capture it without `useIdentity`.
- [ ] Tests first; commit per game.

### Task 10: 3b gates + PR

- [ ] The Ship Battle `Lobby` loses its `name` prop; `PartyBar` invite screenshot if reachable; `NEXT_STEP.md`; PR "feat(players): the party is the table — no codes between two devices in a party".
