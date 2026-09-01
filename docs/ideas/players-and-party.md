# One ticket, every game — players and the party

Status: proposed 2026-08-29, awaiting the family's go.

## The ask (2026-08-29, as given in review, lightly tidied)

> Fundamentally change the way people put in their names. A universal profile
> across all games for the main player; secondary players can also be picked.
> Each player, once created, lives in local storage, so when you play different
> games you don't constantly have to type your name. That player is connected to
> party mode, so the identity is matched and you don't type your name there
> either. Games shouldn't have the name buttons or the five-name picker at all —
> when you open a game, if you don't already have a profile, it asks you to pick
> one or create one. And if somebody's already connected in party mode, that
> should be the connection the games use, so you don't constantly reconnect.

This is the second half of the "real players" work (PR #121 built the roster,
the ticket booth, and the gate at every game door). What's already true today:

- A player is a **ticket** in `arcade.users.v1` — name, pronouns, points, wins,
  history across every game. One ticket is signed in per browser.
- Opening any game with nobody signed in shows the **gate**: pick a ticket or
  make one. Signed in, the game just opens.
- The party already reads the signed-in ticket's name (`PartyContext` →
  `useProfile`), and the party already lives above the router, so it survives
  moving between games (ADR 0008).

What is *not* true yet, and what this plan builds:

1. Games still ask for your name — Ship Battle twice, Chess online, Rainbow
   Racer's lobby, and the party panel itself all show a name box plus the
   five-name chips. **Every one of those goes.**
2. Pass-and-play seats (Chess same-device, Risk's six chairs, Magic Coins'
   "Player 1/2/3") are typed or blank. **They get filled from the roster.**
3. The party is presence only; every online game still makes you trade a code.
   **The party becomes the table: games connect through it, no codes.**

## Three rules

**Your ticket is who you are.** A game never asks the signed-in player for a
name. Anywhere a lobby used to say "Your name", it now says *Playing as Klara*
with a small *Not you?* link that steps back to the gate. Renaming happens at
the booth, nowhere else.

**Everyone at the table has a ticket.** When a game seats more than one person
on this device, the extra chairs are filled by tapping tickets from the roster,
not by typing. Someone new? *+ New player* makes them a ticket (without
switching who's signed in), so the second and third child become real players
with their own history, the same as the first.

**The party is the table.** Two devices in a party never trade a game code
again. Whoever opens an online game "opens the table"; the other device's party
pill lights up — *Klara opened Chess → Join* — and one tap seats them. Both
sides read the same party, so the game link is made for them.

## What players see

### Picking a ticket (the gate, and *Change* anywhere)

One list, used everywhere a ticket is chosen: the saved tickets on this
device, plus a single field that **filters as you type and creates when
nothing matches**.

```
Who's playing?
 [ type a name… ]
 [P] Papa      120 tickets · 3 wins       ADMIT ONE
 [K] Klara     640 tickets · 5 wins       ADMIT ONE
 [F] Flora     210 tickets · 2 wins       ADMIT ONE
```

Type "fl" and only Flora is left; Enter takes the top match. Type "Nana" and
the list is empty and the button reads *Make a ticket for Nana*. The five-name
chip row is gone from the gate as well — a fresh device just types names.

### Lobbies (Ship Battle, Chess online, Rainbow Racer 2P, the party panel)

The name panel is replaced by one small line at the top of the setup screen:

```
[P]  You're Papa                  Change ›
```

*Change* opens the ticket list above, inline; picking one switches who is
signed in and the lobby carries on. The party panel does the same: it shows
your stub, never a name box. With nobody signed in, the party panel points at
the booth instead of offering *Start a party* (a party needs a name to
announce).

### Seats (Chess same-device, Risk, Magic Coins)

A shared **seat picker** replaces per-game name inputs:

```
Who's playing?
 ① [K] Klara  (you)                    ×
 ② [F] Flora                           ×
 ③  tap a ticket below

Tickets on this iPad
 [R] Rio   [P] Papa   [M] Mommy   [+ New player]
```

- Tapping a ticket fills the first empty seat; × clears a seat.
- Seat ① starts as the signed-in ticket but can be cleared — a parent setting
  up a game for two kids isn't in it.
- The **last lineup is remembered per game** (`arcade.lineup.v1`), so the next
  Risk night opens with the same six chairs already filled. Tickets that were
  deleted or renamed fall back gracefully (the seat empties).
- Risk keeps its per-chair *computer general* toggle and persona chips exactly
  as today; a chair is either a ticket or a general.
- Magic Coins' "Player 1/2/3" labels become the seated names.
- Chess same-device: seat ① is White, ② is Black; a swap button flips them.

### The party as the table (Chess, Ship Battle, Rainbow Racer online)

When you're in a party, an online game's lobby loses its *Create / Join with a
code* doors and shows one panel:

```
You're in a party with Flora
[ Play Chess with Flora ]        (party host)

— or, on the other device —
Klara opened Chess…              joining ✓   (automatic)
```

If the *guest* device opens the game first, it waits — *Waiting for Klara to
open Chess* — and the host's party pill shows a knock: *Flora wants to play
Chess → Open*. Either way, the moment the host opens the table, the guest is
seated. No codes appear anywhere while a party is on.

Solo doors (battle the computer, solo racing) stay exactly where they are —
the party changes only the two-device path.

## How it works

### Identity

- `src/shared/profile/TicketList.tsx`: the filter-or-create list, used by the
  gate, by *Change*, and by the booth's *Switch*. Pure matching in
  `src/shared/profile/tickets.ts` (`matchTickets(users, query)` — prefix on
  any word, case-folded, accent-folded).
- `NamePicker`, `recentNames.ts`, `FAMILY_NAMES` and every `name-input`/
  `chess-name`/`racer-name-input`/`party-name` field are deleted. (The
  standalone Yahtzee page keeps its own roster; it can't import.) Ship
  Battle's `bs.setMyName`, Racer's local `name` state and Chess's host/join
  calls all read `profile.name` directly.
- A shared `PlayingAs` component (`src/shared/profile/PlayingAs.tsx`) renders
  the *You're Papa · Change* line and toggles the `TicketList` under it;
  lobbies and the party panel use it.

### Seats

Revised after the 2026-08-29 architecture audit (a two-state seat could not
hold a Risk general, so Risk night would have reopened with every bot chair
empty; a seat carrying a name copy would go stale on rename).

- `src/shared/profile/seats.ts` (pure): a seat is one of three things —
  `{ kind: 'ticket', userId } | { kind: 'bot', botId } | { kind: 'empty' }`.
  Ids only; display names are derived at render (ticket → roster, bot → the
  game's persona table). `fillSeat`, `clearSeat`, `seatsFromLineup(users,
  lineup, activeId, count)`, `lineupOf(seats)`.
- **Precedence:** a saved lineup wins wholesale; the signed-in ticket seeds
  chair ① only when the game has no lineup yet.
- `src/shared/profile/lineupStore.ts`: `arcade.lineup.v1` =
  `Record<gameId, Lineup>` where `Lineup = ({ userId } | { bot } | null)[]`;
  normalized on read (unknown user ids become `null`; unknown *game* ids are
  kept, not pruned); read through `useSyncExternalStore` like the roster,
  never synchronously in render.
- `GameDescriptor` gains `seats?: { min, max }` — chairs on *this* device
  (Ship Battle seats one; Risk 2–6; Chess same-device 2; Magic Coins 1–3).
  The existing `players` stays the menu badge and is documented as such.
- `addUser` becomes append-only; `useUsers.newPlayer` composes it with
  `setActiveUser`. No `addGuest` — one function that appends, one that
  activates. `+ New player` in a seat picker appends only.
- One shared `TicketStrip` (the tappable roster row) plus a default
  `SeatPicker` composition that Chess same-device and Magic Coins use as-is;
  Risk composes `TicketStrip` into its own heraldic row with the persona
  chips. No `variant` prop.
- `useProfile` splits: games keep `{ profile, update }`; a new `useIdentity`
  owns `setName`/`setPronouns`/`newPlayer` and is importable only by
  `PlayerBooth`, `PlayingAs`, `TicketList` (ESLint `no-restricted-imports`
  for `src/games/**`). "No game writes a name" becomes structural.
- `StoredUser.createdAt` is write-only today; drop it (and the `now`
  parameters it drags through `addUser`/`migrateDeviceProfile`) in this
  phase, since `users.ts` changes anyway.

### The party carries the table

`protocol.ts` grows two messages, both length-bounded like `hello`:

- `{ t: 'table', game: GameId, code: Code }` — the host announces the table it
  opened (a fresh code per table, so a rematch never collides with a saved
  session under the old code).
- `{ t: 'knock', game: GameId }` — the guest asks the host to open a game.

`PartyContext` gains `table: { game, code, hostSide? } | null`,
`knock: string | null`, `openTable(game): code` (host), `knockOn(game)`
(guest), `closeTable()`. The party host always hosts the game link — a fixed
mapping, so there's never a race over who creates the code.

Shared stays game-blind: `game` travels as a length-bounded string (checked in
`isPartyMsg` beside the name bound), and `PartyProvider` takes a
`resolveGame(id) → { title, path } | null` prop wired from `App.tsx`, so the
pill can say *Klara opened Chess → Join* without `shared/party` importing the
registry (ADR 0002). `GameDescriptor` gains `online?: boolean` so the pill
knows which games can host a table at all.

Game side, the three online hooks collapse `hostGame`/`joinGame`/`resumeGame`
into one seam — `startTable({ role, code })` — with the name read from the
hook's own options (racer's `host()` already works this way; chess's
`resumeGame` already *is* `{ role, code }` internally). The ~10 dead
`name.trim() || 'Captain'/'Player'/'Racer'` fallbacks for the local player go
with it (the gate guarantees a name); opponent fallbacks stay. Each lobby
branches on `party.inParty`:

- host: *Play X with Flora* → `startTable({ role: 'host', code:
  party.openTable('x') })`.
- guest: an effect watches `party.table`; when `table.game` matches, it calls
  `startTable({ role: 'guest', code: table.code })` once.
- Chess: the party host would otherwise be White forever. `table` announces
  `hostSide`, and chess's online create offers a side swap.

Game **rules still travel on each game's own link** (ADR 0003/0008 hold). The
party's presence link carries names and a four-character handoff, nothing
else — nothing that replays or rewrites game history.

**Before touching `PartyContext`:** it has no tests today (every party test
mocks `useParty`). A `PartyContext.test.tsx` with a mocked `GameConnection`
lands first: name follows the roster, `hello` re-sends on a ticket switch,
peer-name clamp, `leaveParty` clears state.

### The party survives a reload

Today a PWA close or a reload drops the party and the call. The party's
`{ code, role, at, table }` is written to `arcade.party.v1` (pure `party.ts` +
`partyStore.ts`, normalized on read: `role` narrowed, `code` re-run through
`normalizeCode`, `at` via `arcadeNow()` so the expiry is testable); on load, a
party younger than 12 hours rejoins automatically (host re-hosts the code,
guest re-dials). Failure modes the audit found and the design covers:

- **The host's reload must not strand the guest.** The host re-announces
  `table` on every fresh channel open (`buildConn`'s `onOpen`, the idiom
  `useRacerNet` already uses), and the guest refreshes its dial deadline on
  each `hello` rather than only on close — a PWA cold start can exceed the
  20-second dial window in `peer.ts`.
- **A stale broker registration** (`unavailable-id` after a hard PWA kill)
  is retried with backoff instead of ending in a terminal error nobody sees.
- **`party.reconnecting`** (persisted party present, not yet connected) is
  exposed, and lobbies show *Reconnecting to your party…* instead of briefly
  flashing the code doors.

*Leave party* clears it. The call is not auto-resumed — mic and camera stay
opt-in per session, as ADR 0007 decided (`hostParty`/`joinParty` both stop
the call; auto-rejoin routes through them).

### Results for everyone seated

`recordResult` today writes to the signed-in ticket — and it is already a
footgun: a game's `onFinish` fires minutes after the start, and *Change* in a
lobby can switch tickets in between, so the win lands on whoever is signed in
at the finish. `useProfile().recordResult` is **deleted**; every game records
through `recordResultFor(userId, input)` on the users store, with the user id
captured **at game start** from the seat (online: the active id at
`startTable`). Chess same-device then records a win and a loss (draws still
record nothing), Risk credits the winning general's ticket, and Rainbow
Racer's online finishes credit the racer on each device (racer has no local
two-player mode — the other racer is on the other iPad with their own
ticket). Every online game captures the signed-in ticket's id when the table
opens (`startTable({ role, code, seatedUserId })`, Phase 3) and keeps it in
its saved session, so a *resumed* game can still credit the right ticket.
(The ids are optional fields defaulted on read — no key needed a version
bump; a save from before tickets simply credits nobody.) Ship Battle records for
the captain whose id started the table; its opponent is on another device
with their own ticket.

### Storage keys

The implicit scheme, now written down (in `shared/storage/kv.ts`): shared
state is `arcade.<thing>.v<n>` (`arcade.users.v1`, `arcade.lineup.v1`,
`arcade.party.v1`); a game's own state is `<game>:<thing>:v<n>`. Existing keys
are never renamed — a rename costs the family their saves. Every key gets a
pure `normalizeX(raw)` at its read boundary, in a `x.ts` + `xStore.ts` pair
like `users`/`usersStore`.

## Out of scope, on purpose

- **No PINs, no accounts.** Trust-based family device; nothing leaves it.
- **Parties stay two devices.** Every online game is two-player; a bigger
  party is a different project.
- **Caribbean Career's captain name stays.** It is a role-play name inside a
  campaign, by design (2026-08-24 port-identity design: editable for
  role-playing, never renames the arcade profile), and it already defaults to
  the ticket. Its setup gets the *You're Papa · Change* line like every other
  game, and nothing else changes.
## Phases (each a PR, each playable)

1. **No more name boxes.** `TicketList` with the filter-or-create field at the
   gate and the booth; `PlayingAs` at the top of every lobby and the party
   panel; every name field, `NamePicker` and the five-name chips gone.
2. **Seats from the roster.** Three-state seats, `TicketStrip` +
   `SeatPicker`, lineup memory, `seats` on the descriptor, `addUser`
   append-only, the `useIdentity` split, `createdAt` dropped; Chess
   same-device, Risk, Magic Coins. (Shipped 2026-08-29, #126; racer's
   ticket id arrives with Phase 3's `startTable`.)
3. **The party is the table.** `PartyContext` tests first; protocol,
   `table`/`knock`, `resolveGame`, the pill badge, `startTable({ role, code })`
   in the three online hooks (dead local-name fallbacks deleted with it),
   chess side swap, `online` on the descriptor, party persistence with the
   reconnect cases above. (Two PRs, both shipped 2026-08-29: #131 the party
   layer — persistence, `table`/`knock`, the lit pill, `preview-party.html`;
   then the game seam — `startTable` in the three lobbies, the host's colour
   pick in chess, `preview-lobbies.html`.)
4. **Everyone's history.** `recordResultFor` with ids captured at start,
   `useProfile().recordResult` deleted, the per-game credits. (Shipped
   2026-08-29; Magic Coins' champions carry their ids but record nothing —
   an open decision, see NEXT_STEP.)

## Open questions for the family

- When the other device opens a game, should your screen **follow
  automatically** if you're sitting on the arcade's front page, or always wait
  for a tap on the glowing pill? (Plan: always a tap; auto-follow is a
  one-line change if the girls want it.)
- Magic Coins is co-operative — should it record anything on tickets?
