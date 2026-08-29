# Players Phase 1 — No More Name Boxes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No game ever asks the signed-in player for a name again — the ticket
is the identity; every lobby opens with *You're Papa · Change*, and picking a
ticket anywhere is one list with a type-to-filter-or-create field.

**Architecture:** Two new shared pieces in `src/shared/profile/` — a pure
matcher (`tickets.ts`) and a `TicketList` component — are reused by the gate,
by a new `PlayingAs` line, and by the booth's *Switch*. Every per-game name
surface (Ship Battle lobby + fleet screen, Chess online, Racer 2P, the party
panel) is replaced by `PlayingAs`; `NamePicker`, `recentNames` and
`FAMILY_NAMES` are deleted. Games read `profile.name` directly; nothing in a
game writes a name.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, Vite, knip.

## Global Constraints

- Gates under Node 20: `export PATH="$HOME/.local/share/mise/installs/node/20.20.2/bin:$PATH"`.
- `npm run check` (tsc + eslint + knip) must exit 0 with **0 errors** (67 react-hooks warnings are deliberate); never pipe it — redirect to a file and print `EXIT=$?`.
- `npx vitest run` all green; `npm run build` exit 0; `npm run shots` regenerated and reviewed.
- One logical shell operation per Bash call (`bash -c "…"` for chains). Files containing markdown backticks are written with the Write tool, never a heredoc.
- Icons are SVG (`@shared/ui/icons`), never emoji. Every interactive element has a `data-testid` and a keyboard path; dialogs close on Escape via `useDismissOnEscape`; text ≥ 14px.
- Name rules stay: trimmed, max 20 characters (`setName` in `profile.ts`).
- Design doc: `docs/planning/players-and-party.md` (rules, phases, out-of-scope).

---

### Task 1: Pure ticket matching

**Files:**
- Create: `src/shared/profile/tickets.ts`
- Test: `src/shared/profile/tickets.test.ts`

**Interfaces:**
- Produces: `foldName(s: string): string`, `matchTickets(users: StoredUser[], query: string): StoredUser[]`, `canCreateTicket(users: StoredUser[], query: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { canCreateTicket, foldName, matchTickets } from './tickets';
import type { StoredUser } from './users';

const u = (id: string, name: string): StoredUser => ({
  id, createdAt: 0, profile: { name, pronouns: 'he/him', points: 0, wins: 0, losses: 0, unlocked: [], lastSkinId: '', history: [] },
});
const ROSTER = [u('a', 'Papa'), u('b', 'Klara'), u('c', 'Flora'), u('d', 'Mommy Zoë')];

describe('foldName', () => {
  it('lower-cases and strips accents', () => {
    expect(foldName('  Zoë ')).toBe('zoe');
  });
});

describe('matchTickets', () => {
  it('returns everyone for a blank query, in roster order', () => {
    expect(matchTickets(ROSTER, '   ').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('matches a prefix of any word, case- and accent-insensitively', () => {
    expect(matchTickets(ROSTER, 'fl').map((x) => x.id)).toEqual(['c']);
    expect(matchTickets(ROSTER, 'ZO').map((x) => x.id)).toEqual(['d']);
    expect(matchTickets(ROSTER, 'zoe').map((x) => x.id)).toEqual(['d']);
  });
  it('does not match inside a word', () => {
    expect(matchTickets(ROSTER, 'lara')).toEqual([]);
  });
});

describe('canCreateTicket', () => {
  it('is false for a blank query', () => {
    expect(canCreateTicket(ROSTER, ' ')).toBe(false);
  });
  it('is false when a ticket already has exactly that name (folded)', () => {
    expect(canCreateTicket(ROSTER, 'papa')).toBe(false);
    expect(canCreateTicket(ROSTER, 'Mommy zoe')).toBe(false);
  });
  it('is true for a new name, even one that prefix-matches someone', () => {
    expect(canCreateTicket(ROSTER, 'Pa')).toBe(true);
    expect(canCreateTicket(ROSTER, 'Nana')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module missing)**

Run: `npx vitest run src/shared/profile/tickets.test.ts`

- [ ] **Step 3: Implement**

```ts
/**
 * Matching for the ticket list: the one place a player is picked, at the gate
 * and behind "Change". Prefix-on-any-word, case- and accent-folded, so "fl"
 * finds Flora and "zo" finds Mommy Zoë — fast for a seven-year-old.
 */
import type { StoredUser } from './users';

export function foldName(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

export function matchTickets(users: StoredUser[], query: string): StoredUser[] {
  const q = foldName(query);
  if (!q) return users;
  return users.filter((u) => foldName(u.profile.name).split(/\s+/).some((w) => w.startsWith(q)));
}

/** A new ticket can be made unless the name is blank or already taken. */
export function canCreateTicket(users: StoredUser[], query: string): boolean {
  const q = foldName(query);
  if (!q) return false;
  return !users.some((u) => foldName(u.profile.name) === q);
}
```

- [ ] **Step 4: Run — expect PASS.** Then commit: `feat(players): pure ticket matching`.

---

### Task 2: `TicketList` — the one picker

**Files:**
- Create: `src/shared/profile/TicketList.tsx`
- Modify: `src/shared/profile/player.css` (add `.tlist*` rules; remove `.pgate-chips`/`.pgate-chip`)
- Test: `src/shared/profile/TicketList.test.tsx`

**Interfaces:**
- Consumes: Task 1; `playerColor(index)` from `playerColors.ts`; `StoredUser` from `users.ts`.
- Produces:
  ```ts
  export function TicketList(props: {
    users: StoredUser[];
    activeId?: string | null;          // marked "you", still tappable
    onPick: (id: string) => void;
    onCreate: (name: string) => void;  // trimmed, non-blank, not a duplicate
    autoFocus?: boolean;               // only when the roster is empty (no surprise keyboard)
    testIdPrefix?: string;             // default 'ticket'
  }): JSX.Element
  ```
  Test ids: `${p}-name` (the field), `${p}-user-${id}`, `${p}-create`, `${p}-empty`.

**Behaviour:**
- Field placeholder "Type a name…", `maxLength={20}`, `autoComplete="off"`.
- Stubs render in roster order, filtered by `matchTickets`; each stub's colour is `playerColor(indexInFullRoster)` so colours never shift while filtering.
- Enter in the field: if any match → `onPick(top match)`; else if `canCreateTicket` → `onCreate(trimmed)`.
- The create button (label `Make a ticket for {trimmed}`) renders only when `canCreateTicket` **and** there are no matches. The empty line "Nobody called that yet." renders in the same condition, above the button.
- With `users.length === 0` the field shows the label "Make your ticket" above it and the button appears as soon as something is typed.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketList } from './TicketList';
import type { StoredUser } from './users';

const u = (id: string, name: string): StoredUser => ({
  id, createdAt: 0, profile: { name, pronouns: 'he/him', points: 0, wins: 0, losses: 0, unlocked: [], lastSkinId: '', history: [] },
});
const ROSTER = [u('a', 'Papa'), u('b', 'Klara'), u('c', 'Flora')];

describe('TicketList', () => {
  it('lists every ticket and picks on tap', () => {
    const onPick = vi.fn();
    render(<TicketList users={ROSTER} onPick={onPick} onCreate={() => {}} />);
    expect(screen.getAllByTestId(/^ticket-user-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId('ticket-user-b'));
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('filters as you type and Enter takes the top match', () => {
    const onPick = vi.fn();
    render(<TicketList users={ROSTER} onPick={onPick} onCreate={() => {}} />);
    const field = screen.getByTestId('ticket-name');
    fireEvent.change(field, { target: { value: 'fl' } });
    expect(screen.getAllByTestId(/^ticket-user-/)).toHaveLength(1);
    expect(screen.queryByTestId('ticket-create')).toBeNull();
    fireEvent.submit(field.closest('form')!);
    expect(onPick).toHaveBeenCalledWith('c');
  });

  it('offers to make a ticket only when nobody matches', () => {
    const onCreate = vi.fn();
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={onCreate} />);
    const field = screen.getByTestId('ticket-name');
    fireEvent.change(field, { target: { value: '  Nana ' } });
    expect(screen.getByTestId('ticket-empty')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-create')).toHaveTextContent('Make a ticket for Nana');
    fireEvent.click(screen.getByTestId('ticket-create'));
    expect(onCreate).toHaveBeenCalledWith('Nana');
  });

  it('never offers a duplicate ticket', () => {
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={() => {}} />);
    fireEvent.change(screen.getByTestId('ticket-name'), { target: { value: 'papa' } });
    expect(screen.getByTestId('ticket-user-a')).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-create')).toBeNull();
  });

  it('marks the signed-in ticket', () => {
    render(<TicketList users={ROSTER} activeId="b" onPick={() => {}} onCreate={() => {}} />);
    expect(screen.getByTestId('ticket-user-b')).toHaveTextContent('you');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/shared/profile/TicketList.test.tsx`

- [ ] **Step 3: Implement** — a `<form>` wrapping the field (so Enter is a submit), the stub list (reuse `.pstub`/`.pmedal`/`.pstub-admit` markup from `PlayerGate.tsx:47-65`, plus a `.pstub-you` tag "you" after the name when `u.id === activeId`), the empty line and the create button. Styles in `player.css`:

```css
/* ── the ticket list: gate, Change, and the booth's Switch ── */
.tlist { display: flex; flex-direction: column; gap: 10px; }
.tlist-label { color: var(--muted); font-size: 0.85rem; }
.tlist input {
  width: 100%; padding: 11px 12px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font: inherit; font-weight: 700;
}
.tlist input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tlist-stubs { display: flex; flex-direction: column; }
.tlist-empty { color: var(--muted); text-align: center; margin: 2px 0; }
.pstub-you {
  margin-left: 8px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--gold, #ffd76a);
}
```
`.pgate-create` is reused for the create button (rename it `.tlist-create` and update the gate).

- [ ] **Step 4: Run — expect PASS.** Commit: `feat(players): the ticket list - filter as you type, make one if nobody matches`.

---

### Task 3: The gate uses the list; `FAMILY_NAMES` goes

**Files:**
- Modify: `src/shared/profile/PlayerGate.tsx` (replace lines 20-24 state, 33-36 chips, 47-108 list+form with `<TicketList users={users} onPick={signIn} onCreate={newPlayer} autoFocus={users.length === 0} testIdPrefix="pgate" />`)
- Modify: `src/shared/profile/profile.ts:122-128` — delete the `FAMILY_NAMES` export and its comment.
- Modify: `src/shared/profile/PlayerGate.test.tsx` — chips assertions become field + create.
- Modify: `scripts/screenshots.mjs` if the `player-gate` shot references `pgate-chip-*` (it shouldn't; verify with grep).

Subtitle copy stays: empty roster → "Make your ticket — it keeps your points and wins in every game."; otherwise `${gameTitle} needs a player — whose ticket?`.

- [ ] **Step 1:** Update `PlayerGate.test.tsx`: the "creates via a chip" case becomes: type `Rio` into `pgate-name`, click `pgate-create`, expect `arcade.users.v1` to contain Rio and the game to render. Keep the "picks an existing ticket" case (`pgate-user-<id>`). Run — expect FAIL on the chip case.
- [ ] **Step 2:** Rewrite the gate; delete `FAMILY_NAMES`. Run `npx vitest run src/shared/profile` — expect PASS.
- [ ] **Step 3:** Commit: `feat(players): the gate is the ticket list - no more five-name chips`.

---

### Task 4: `PlayingAs` — *You're Papa · Change*

**Files:**
- Create: `src/shared/profile/PlayingAs.tsx`
- Modify: `src/shared/profile/player.css` (add `.pas*`)
- Modify: `src/shared/profile/useUsers.ts` — nothing new needed (`signIn`, `newPlayer`, `users`, `active` suffice).
- Test: `src/shared/profile/PlayingAs.test.tsx`

**Interfaces:**
- Produces: `export function PlayingAs(): JSX.Element | null` — renders `null` when nobody is signed in (the gate handles that case; the party panel handles its own copy).
  Test ids: `playing-as` (root), `playing-as-change` (button, `aria-expanded`), list prefix `switch` (`switch-name`, `switch-user-<id>`, `switch-create`), `playing-as-cancel`.

**Behaviour:** A pill: medallion (`.pmedal.sm`, colour = `playerColor(index of active in users)`), "You're **{name}**", and a *Change ›* button. Tapping Change opens a card under the pill with `<TicketList activeId={active.id} testIdPrefix="switch" onPick={(id) => { signIn(id); close(); }} onCreate={(n) => { newPlayer(n); close(); }} />` and a *Cancel* ghost button. Escape closes (`useDismissOnEscape(open, close)`); closing returns focus to the Change button (`ref` + `.focus()`).

```css
/* ── "You're Papa · Change" at the top of every lobby ── */
.pas { display: flex; flex-direction: column; gap: 10px; margin: 0 0 14px; }
.pas-pill {
  display: flex; align-items: center; gap: 10px; min-height: 44px;
  padding: 6px 12px 6px 8px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border);
}
.pas-who { font-weight: 800; }
.pas-change {
  margin-left: auto; background: none; border: 0; padding: 8px 6px;
  color: var(--accent); font: inherit; font-weight: 800; cursor: pointer;
}
.pas-change:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
.pas-card {
  background: linear-gradient(180deg, #131c30, #0e1626);
  border: 1px solid var(--border); border-radius: 14px; padding: 14px;
}
.pmedal.sm { width: 30px; height: 30px; font-size: 0.9rem; }
```

- [ ] **Step 1: Failing tests** — seed `arcade.users.v1` with two users (Klara active, Flora), `resetUsersStore()` in `beforeEach`; assert: pill shows "You're Klara"; Change opens `switch-user-*` stubs; clicking Flora's makes `getUsersSnapshot().activeId` Flora's id and closes the card; Escape closes; renders nothing when `activeId` is null.
- [ ] **Step 2:** Implement. Run `npx vitest run src/shared/profile` — PASS.
- [ ] **Step 3:** Commit: `feat(players): PlayingAs - you're Papa, change here`.

---

### Task 5: Ship Battle — lobby and fleet screen lose their name boxes

**Files:**
- Modify: `src/games/battleship/components/Lobby.tsx` — delete the `Captain's name` panel (lines 33-48) and the `NamePicker` import; render `<PlayingAs />` first inside `.stack`; drop the `onName` prop and every `onName(readyName)` call (lines 64, 107, 155); `readyName` stays as `name.trim() || 'Captain'`.
- Modify: `src/games/battleship/components/FleetSelect.tsx` — delete the `fleet-name` field (lines 70-80), the `name`/`onName` props; keep `.fleet-top` with the points readout (check `battleship.css`/`tokens.css` for `.fleet-name` and remove).
- Modify: `src/games/battleship/components/BattleshipPage.tsx:260-282` — drop `onName={profile.setName}` and the FleetSelect `name`/`onName` props. `bs.setMyName` becomes unused → remove it from `useBattleship` (grep `setMyName` in `state/useBattleship.ts` and `domain/session.ts`; keep `Session` helpers only if still used elsewhere — knip decides).
- Tests: `Lobby.test.tsx`, `FleetSelect.test.tsx`, `app.integration.test.tsx` — remove `name-input`/`fleet-name-input`/`name-chip` steps; where a test typed a captain's name, seed `arcade.users.v1` with an active user of that name instead (helper: `seedActiveUser('Rio')` in a small `src/shared/profile/testing.ts` — exported for tests only if knip allows; otherwise inline the JSON in each test file).

- [ ] **Step 1:** Update the tests first; run `npx vitest run src/games/battleship` — expect FAIL on the removed ids.
- [ ] **Step 2:** Make the changes; run — PASS. Verify the wire name still flows: the integration test that checks `hello` carries the captain's name must pass with the seeded ticket name.
- [ ] **Step 3:** Commit: `feat(battleship): the captain is your ticket - no name boxes`.

---

### Task 6: Chess — online lobby on the ticket; hotseat keeps plain inputs (chairs come in Phase 2)

**Files:**
- Modify: `src/games/chess/components/ChessPage.tsx` — online setup (lines 386-400): delete the `Your name` panel; render `<PlayingAs />` above the `Start a game` panel. Hotseat (lines 362-376): delete both `NamePicker`s, keep the two inputs (White prefilled from `profile.profile.name`, Black `'Black'`), labels unchanged. Remove the `NamePicker` import.
- Tests: `ChessPage.test.tsx`, `chess.integration.test.tsx` — drop `white-chip`/`black-chip`/`chess-name` steps; seed the ticket where a name was typed.

- [ ] **Step 1:** Tests first → FAIL. **Step 2:** Implement → PASS. **Step 3:** Commit: `feat(chess): online plays as your ticket`.

---

### Task 7: Rainbow Racer — the lobby's name card goes

**Files:**
- Modify: `src/games/racer/components/RacerSetup.tsx:120-136` — delete the `Your racer` card's `NamePicker` + name label/input; render `<PlayingAs />` as the first child of `.racer-lobby` (setup state) — keep the driver heading if it still carries the driver emoji (it does: `Your racer {driver.emoji}`; keep the `<h2>` inside a card without the inputs). Drop `name`/`setName` props.
- Modify: `src/games/racer/components/RacerPage.tsx:28-34` — delete the `name` state and `setName`; `useRacerNet({ name: profile.profile.name.trim() || 'Racer', … })`; solo `names: ['You']` → `[profile.profile.name || 'You']` (the HUD then says the child's name).
- Modify: `src/games/racer/styles/racer.css:143-160` — delete `.racer-name-label` and the `.racer-name-input` half of the shared rule (keep `.racer-code-input`).
- Tests: `racer.integration.test.tsx` — remove `racer-chip`/`racer-name-input` steps; seed the ticket.

- [ ] Tests first → FAIL → implement → PASS → commit: `feat(racer): racers run under their ticket name`.

---

### Task 8: The party panel shows your ticket, never a name box

**Files:**
- Modify: `src/shared/party/PartyBar.tsx` — delete the `party-name` field and `NamePicker` (lines 33-42). In the not-in-party branch render `<PlayingAs />` first. When `users` has no active ticket (`useUsers().active === null`): render instead a `.party-hint` "A party needs your ticket." with `<Link to="/">Make one at the booth ›</Link>` and **hide** Start/Join.
- Modify: `src/shared/party/PartyContext.tsx` — remove `setMyName` from `PartyValue` and the value; remove the `rememberName` import/call (line 100).
- Tests: `party-ui.test.tsx` — replace any `party-name`/`party-chip` steps with a seeded ticket; add the signed-out case.

- [ ] Tests first → FAIL → implement → PASS → commit: `feat(party): the party wears your ticket`.

---

### Task 9: Caribbean — the commission form says who's signing

**Files:**
- Modify: `src/games/caribbean/components/setup/CampaignSetup.tsx:238` — render `<PlayingAs />` immediately above `<h1>Sign a captain's commission</h1>` (inside the form's parent, outside `.caribbean-form-grid` so the grid alignment the port-check measures is untouched). The captain-name and pronouns fields stay exactly as they are (role-play name by design).
- Test: `CampaignSetup.test.tsx` — one assertion that `playing-as` renders with the seeded ticket name.
- Run `npm run caribbean:port-check` if it runs headless without a dev server (read `scripts/caribbean-port-check.mjs` first); if it needs the 5178 server, note that in the PR and run it via the shots harness pattern instead.

- [ ] Test → FAIL → implement → PASS → commit: `feat(caribbean): the commission shows whose ticket signs`.

---

### Task 10: Delete the old machinery, gates, screenshots, PR

**Files:**
- Delete: `src/shared/ui/NamePicker.tsx`, `src/shared/profile/recentNames.ts`, `src/shared/profile/recentNames.test.ts`.
- Modify: `src/shared/profile/useProfile.ts:26-43` — remove the `rememberName` debounce effect and import.
- Modify: `src/shared/styles/tokens.css:87-115` — remove `.name-chips`/`.name-chip` rules (keep `.code-chip`).
- Modify: `scripts/screenshots.mjs` — add two shots: `ship-lobby` (TABLET, `/#/play`, wait `[data-testid="playing-as"]`) and `party-panel` (PHONE, `/#/`, click `party-pill`, wait `[data-testid="playing-as"]`).
- Modify: `NEXT_STEP.md` — replace the "Cross-game player names, asked for once" entry with a pointer to `docs/planning/players-and-party.md` and the remaining phases.

- [ ] **Step 1:** Delete + edit. `grep -rn 'NamePicker\|recentNames\|rememberName\|FAMILY_NAMES\|setMyName' src scripts` → no hits.
- [ ] **Step 2:** Gates: `npm run check > …/check.log 2>&1; echo EXIT=$?` (0 errors), `npx vitest run` (all green), `npm run build` (exit 0).
- [ ] **Step 3:** `npm run shots`; review `player-gate`, `ship-lobby`, `party-panel`, `racer-arena` visually.
- [ ] **Step 4:** `git fetch origin main`, `git cherry origin/main claude/players-and-party`, push, PR with body via `--body-file` (written with the Write tool), pinned screenshots at `https://raw.githubusercontent.com/Rio517/yahtzee-calculator/<sha>/docs/screenshots/<file>.png`.
