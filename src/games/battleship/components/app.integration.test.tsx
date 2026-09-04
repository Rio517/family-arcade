import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, within, fireEvent, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getUsersSnapshot, resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { loadSession, saveSession } from '@games/battleship/storage/sessionStore';
import { shipCells } from '@games/battleship/domain/board';
import { resolveShot } from '@games/battleship/domain/engine';
import { BOARD_SIZE, type Coord, type Fleet, type GameLog } from '@games/battleship/domain/types';
import type { PartyValue } from '@shared/party/PartyContext';
import { fakeParty, fakePartyWithKai } from '@shared/party/testing';

// The party is mocked (its provider lives above the router): the page's door
// and the lobby's ladder read it, and the tests below set it.
const mockParty = vi.hoisted(() => ({ value: null as unknown as PartyValue }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

/** A legal, hand-placed fleet: five ships on even rows, all pointing east. */
const FLEET: Fleet = [
  { shipId: 'carrier', row: 0, col: 0, orientation: 'H' },
  { shipId: 'battleship', row: 2, col: 0, orientation: 'H' },
  { shipId: 'cruiser', row: 4, col: 0, orientation: 'H' },
  { shipId: 'submarine', row: 6, col: 0, orientation: 'H' },
  { shipId: 'destroyer', row: 8, col: 0, orientation: 'H' },
];

/** A battle two shots in: the host opened fire and missed, the guest answered in kind. */
const MID_BATTLE: GameLog = [
  { type: 'start', first: 'host' },
  { type: 'shot', by: 'host', row: 9, col: 9, hit: false, sunk: null, allSunk: false },
  { type: 'shot', by: 'guest', row: 9, col: 9, hit: false, sunk: null, allSunk: false },
];

/** The save a reload finds: Kai, the guest, mid-battle against Rio under `code`. */
function seedGuestSave(code: string) {
  saveSession({
    code,
    side: 'guest',
    myName: 'Kai',
    mySkinId: 'aqua',
    seatedUserId: 'u-kai',
    oppName: 'Rio',
    oppSkinId: 'aqua',
    myFleet: FLEET,
    myReady: true,
    oppReady: true,
    log: MID_BATTLE,
    epoch: 0,
    finished: false,
    updatedAt: 1,
  });
}

/**
 * High-level, DOM-driven integration test: two real <BattleshipPage> clients
 * connected through an in-memory stand-in for the WebRTC transport. It walks the
 * actual user journey — create a game, choose a fleet, position ships, and fire
 * the first shot at the rival — and asserts the shot round-trips to the
 * opponent and back. Nobody types a name: the signed-in ticket is the identity,
 * and that name is what rides the `hello` message to the other captain. This is
 * the one test that exercises the whole stack (components → hook → session
 * state machine → "network") the way a player does.
 */

// What the page asked of the wire — which codes it dialled — so a test can
// say "joined once" without a second client on the other end.
const wire = vi.hoisted(() => ({ joins: [] as string[] }));

// Replace the PeerJS transport with an in-memory bus that links the two clients.
vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  const hosts = new Map<string, InstanceType<typeof GameConnection>>();

  class GameConnection {
    private peer: GameConnection | null = null;
    constructor(private handlers: {
      onStatus: (status: string, detail?: string) => void;
      onOpen: () => void;
      onMessage: (msg: unknown) => void;
    }) {}
    host(code: string) {
      // One code the signalling server "can't" host, for the back-out path.
      if (code === 'DOWN') return this.handlers.onStatus('error', 'signalling is down');
      hosts.set(code, this);
      this.handlers.onStatus('hosting');
    }
    join(code: string) {
      wire.joins.push(code);
      const host = hosts.get(code);
      if (!host) return this.handlers.onStatus('error', 'no host');
      this.peer = host;
      host.peer = this;
      // Both channels open; each side runs its hello + sync handshake.
      this.handlers.onStatus('connected');
      host.handlers.onStatus('connected');
      this.handlers.onOpen();
      host.handlers.onOpen();
    }
    send(msg: unknown): boolean {
      if (!this.peer) return false;
      // Deliver on the next tick, like a real data channel — avoids deep
      // synchronous re-entrancy across the two React roots.
      const peer = this.peer;
      setTimeout(() => peer.handlers.onMessage(msg), 0);
      return true;
    }
    destroy() {
      this.peer = null;
    }
  }

  return { ...actual, GameConnection };
});

import { BattleshipPage } from './BattleshipPage';

/**
 * One page under a router. A fresh element every time: a rerender with the
 * identical element lets React bail out of the whole subtree, and the mocked
 * party value would never be read again.
 */
const page = () => (
  <MemoryRouter initialEntries={['/play']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <BattleshipPage />
  </MemoryRouter>
);

function renderApp(): RenderResult {
  return render(page());
}

/**
 * Sign this browser in as `name`. Both simulated clients share one roster (one
 * jsdom, one localStorage), so each side signs in just before it creates or
 * joins: the session copies that name in at that moment (Session.createSession)
 * and keeps it, which is what lets one process stand in for two devices.
 */
function signInAs(name: string) {
  act(() => {
    const id = `u-${name.toLowerCase()}`;
    setUsersState(setActiveUser(addUser(emptyUsersState(), id, name), id));
  });
}

/** Tap Change at the booth: another ticket already on the roster signs in. */
function switchTo(id: string) {
  act(() => setUsersState(setActiveUser(getUsersSnapshot(), id)));
}

beforeEach(() => {
  localStorage.clear();
  mockParty.value = fakeParty();
  wire.joins.length = 0;
  // This flow exercises the radar and the wire, not the 3D ocean — pin the
  // fleet tile to the 2D grid so the lazy three.js chunk never enters the run.
  localStorage.setItem('bs-fleet-view-v1', '2d');
  // One ticket signed in — the games never ask for a name any more.
  resetUsersStore();
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
  cleanup();
});

describe('the ticket sits down at the table', () => {
  it('creating a game seats the signed-in ticket as host under a fresh code', async () => {
    const app = within(renderApp().container);
    fireEvent.click(app.getByTestId('create-game'));
    const code = (await app.findByTestId('game-code')).textContent!.trim();
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    const saved = loadSession(code);
    expect(saved?.side).toBe('host');
    expect(saved?.myName).toBe('Rio');
    expect(saved?.seatedUserId).toBe('u1');
  });
});

describe('in a party, the party is the table', () => {
  it('the host opens Ship Battle for the friend under the code the party hands back', async () => {
    mockParty.value = fakePartyWithKai('host');
    const app = within(renderApp().container);

    fireEvent.click(app.getByTestId('battle-party-play'));
    expect(mockParty.value.openTable).toHaveBeenCalledWith('battleship');
    expect((await app.findByTestId('game-code')).textContent!.trim()).toBe('WXYZ');
    const saved = loadSession('WXYZ');
    expect(saved?.side).toBe('host');
    expect(saved?.seatedUserId).toBe('u1');
  });

  it('the guest knocks once, waits, then walks in the moment the table opens — once per code', () => {
    signInAs('Kai');
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio' });
    const view = renderApp();
    const app = within(view.container);

    expect(mockParty.value.knockOn).toHaveBeenCalledTimes(1);
    expect(mockParty.value.knockOn).toHaveBeenCalledWith('battleship');
    expect(app.getByTestId('battle-party-waiting')).toHaveTextContent('Waiting for Rio to open Ship Battle');
    expect(app.queryByTestId('create-game')).toBeNull();
    expect(app.queryByTestId('show-join')).toBeNull();
    expect(wire.joins).toEqual([]);

    // A rerender with the same (absent) table knocks no second time.
    view.rerender(page());
    expect(mockParty.value.knockOn).toHaveBeenCalledTimes(1);

    // The host opens Ship Battle: the party carries the code, the page joins.
    const { knockOn } = mockParty.value;
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio', knockOn, table: { game: 'battleship', code: 'QRST' } });
    view.rerender(page());
    expect(wire.joins).toEqual(['QRST']);
    expect(loadSession('QRST')?.side).toBe('guest');
    expect(loadSession('QRST')?.seatedUserId).toBe('u-kai');
    expect(app.queryByTestId('battle-party-waiting')).toBeNull();
    expect(app.getByTestId('fleet-continue')).toBeInTheDocument();

    // Still the same table on the next render — no double join.
    view.rerender(page());
    expect(wire.joins).toEqual(['QRST']);
  });

  it('the guest walks in the moment the table is open, seated under their own ticket', () => {
    signInAs('Kai');
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio', table: { game: 'battleship', code: 'NOPE' } });
    renderApp();

    // No knock — the table was already open — and the join went out at once.
    expect(mockParty.value.knockOn).not.toHaveBeenCalled();
    expect(wire.joins).toEqual(['NOPE']);
    const saved = loadSession('NOPE');
    expect(saved?.side).toBe('guest');
    expect(saved?.myName).toBe('Kai');
    expect(saved?.seatedUserId).toBe('u-kai');
  });

  it('a table for another game is not ours — the guest keeps waiting, and knocks', () => {
    signInAs('Kai');
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio', table: { game: 'chess', code: 'CHSS' } });
    const app = within(renderApp().container);

    expect(mockParty.value.knockOn).toHaveBeenCalledWith('battleship');
    expect(app.getByTestId('battle-party-waiting')).toBeInTheDocument();
    expect(wire.joins).toEqual([]);
  });

  it('a guest reloading mid-battle is seated back in the saved game, fleet intact', () => {
    // The reload: a save under the code the party will seat us at again.
    signInAs('Kai');
    seedGuestSave('NOPE');
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio', table: { game: 'battleship', code: 'NOPE' } });
    const app = within(renderApp().container);

    expect(wire.joins).toEqual(['NOPE']);
    // The persist pass wrote the *restored* game back, not a fresh, empty one
    // — an empty fleet here is how every host shot turned into a miss.
    const saved = loadSession('NOPE');
    expect(saved?.myFleet).toEqual(FLEET);
    expect(saved?.log).toEqual(MID_BATTLE);
    // …and the captain is back on the battle board, not picking a fleet.
    expect(app.queryByTestId('fleet-continue')).toBeNull();
    expect(app.getByTestId('turn-pill')).toBeInTheDocument();
  });

  it('a guest whose table closes before anything happened hangs up and waits at the door again', () => {
    signInAs('Kai');
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio', table: { game: 'battleship', code: 'NOPE' } });
    const view = renderApp();
    const app = within(view.container);
    expect(loadSession('NOPE')?.side).toBe('guest');
    expect(app.queryByTestId('battle-party-waiting')).toBeNull();

    // The host walked away: the table closes under us.
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio' });
    view.rerender(page());
    expect(loadSession('NOPE')).toBeNull();
    expect(app.getByTestId('battle-party-waiting')).toBeInTheDocument();
    // …and knocks again, so the host's pill lights up for the next game.
    expect(mockParty.value.knockOn).toHaveBeenCalledWith('battleship');
  });

  it('but a table closing mid-battle leaves the saved game alone', () => {
    signInAs('Kai');
    seedGuestSave('NOPE');
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio', table: { game: 'battleship', code: 'NOPE' } });
    const view = renderApp();
    const app = within(view.container);

    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio' });
    view.rerender(page());
    expect(loadSession('NOPE')?.myFleet).toEqual(FLEET);
    expect(loadSession('NOPE')?.log).toEqual(MID_BATTLE);
    expect(app.queryByTestId('battle-party-waiting')).toBeNull();
  });

  it('the host tapping ‹ Menu closes the table too — not only the in-game Back to menu', async () => {
    mockParty.value = fakePartyWithKai('host');
    const app = within(renderApp().container);

    fireEvent.click(app.getByTestId('battle-party-play'));
    expect((await app.findByTestId('game-code')).textContent!.trim()).toBe('WXYZ');
    fireEvent.click(app.getByTestId('back'));
    expect(mockParty.value.closeTable).toHaveBeenCalledWith('WXYZ');
    // Menu is not Leave: the game is still saved for a resume.
    expect(loadSession('WXYZ')?.side).toBe('host');
  });

  it('a party host readying up sees no QR invite — the friend is already walking in', async () => {
    mockParty.value = fakePartyWithKai('host');
    const app = within(renderApp().container);

    fireEvent.click(app.getByTestId('battle-party-play'));
    fireEvent.click(await app.findByTestId('fleet-continue'));
    fireEvent.click(app.getByTestId('auto-place'));
    fireEvent.click(app.getByTestId('ready'));
    await waitFor(() => {
      expect(app.queryByText(/Waiting for opponent to join/)).toBeNull();
      expect(app.queryByRole('dialog', { name: 'Invite your opponent' })).toBeNull();
    });
  });

  it('a host backing out of a table that could not open closes it for the friend', async () => {
    mockParty.value = fakePartyWithKai('host', { openTable: vi.fn(() => 'DOWN') });
    const app = within(renderApp().container);

    fireEvent.click(app.getByTestId('battle-party-play'));
    fireEvent.click(await app.findByTestId('exit-to-menu'));
    expect(mockParty.value.closeTable).toHaveBeenCalledTimes(1);
  });
});

describe('solo games never ask you to invite anyone', () => {
  it('starting a game against a captain shows no code chip and no share modal', async () => {
    const app = within(renderApp().container);

    fireEvent.click(app.getByTestId('solo-game'));
    fireEvent.click(app.getByTestId('captain-grimtide'));

    // On the fleet screen of a solo game: no "SOLO" code chip in the title
    // bar, and the invite modal must not pop — the computer captain doesn't
    // scan QR codes. (It used to: the host-waiting logic didn't know solo.)
    expect(app.getByTestId('fleet-continue')).toBeInTheDocument();
    expect(app.queryByTestId('share-chip')).toBeNull();
    expect(app.queryByText(/Waiting for opponent/)).toBeNull();

    // Through placement and into the wait, still nothing to share.
    fireEvent.click(app.getByTestId('fleet-continue'));
    fireEvent.click(app.getByTestId('auto-place'));
    fireEvent.click(app.getByTestId('ready'));
    await waitFor(() => {
      expect(app.queryByText(/Waiting for opponent to join/)).toBeNull();
      expect(app.queryByTestId('share-chip')).toBeNull();
    });
  });

  it('seats the signed-in ticket, so the win has somebody to land on', () => {
    const app = within(renderApp().container);
    fireEvent.click(app.getByTestId('solo-game'));
    fireEvent.click(app.getByTestId('captain-grimtide'));
    expect(loadSession('SOLO')?.seatedUserId).toBe('u1');
  });
});

/**
 * A battle one shot from victory: the host has hit every cell of the captain's
 * fleet but the last, and the captain answered each shot with a miss into open
 * water (rows 7 and 9 are empty in FLEET). Built with the engine's own shot
 * resolver so every hit carries the right `sunk` flag.
 */
function nearWinLog(botFleet: Fleet): { log: GameLog; last: Coord } {
  const cells = botFleet.flatMap((p) => shipCells(p));
  const last = cells[cells.length - 1];
  const log: GameLog = [{ type: 'start', first: 'host' }];
  const prior: Coord[] = [];
  cells.slice(0, -1).forEach((c, i) => {
    log.push(resolveShot(botFleet, prior, c, 'host'));
    prior.push(c);
    log.push({ type: 'shot', by: 'guest', row: i < 10 ? 9 : 7, col: i % 10, hit: false, sunk: null, allSunk: false });
  });
  return { log, last };
}

/** A solo save one shot from victory, seated under `seatedUserId`. Returns the winning cell. */
function seedNearWinSolo(seatedUserId: string | null): Coord {
  const { log, last } = nearWinLog(FLEET);
  saveSession({
    code: 'SOLO',
    side: 'host',
    myName: 'Kai',
    mySkinId: 'aqua',
    seatedUserId,
    oppName: 'Admiral Grimtide',
    oppSkinId: 'void',
    myFleet: FLEET,
    myReady: true,
    oppReady: true,
    log,
    epoch: 0,
    solo: { personaId: 'grimtide', botFleet: FLEET, botReady: true },
    finished: false,
    updatedAt: 1,
  });
  return last;
}

/** Every ticket's history, by id. */
function historyById() {
  return Object.fromEntries(getUsersSnapshot().users.map((u) => [u.id, u.profile.history]));
}

/**
 * Resume the seeded solo game from the lobby's card and fire the winning shot.
 * Waits for the captain to be on the line first — a fire sent before the
 * loopback has built its session is dropped on the floor.
 */
async function resumeAndWin(app: ReturnType<typeof within>, last: Coord) {
  fireEvent.click(app.getByTestId('resume-game'));
  await waitFor(() => expect(app.getByTestId('battleship-page')).toHaveAttribute('data-conn', 'connected'));
  fireEvent.click(app.getByTestId(`cell-enemy-${last.row}-${last.col}`));
  await app.findByText('You Win!', {}, { timeout: 4000 });
}

describe('the result lands on the ticket that sat down', () => {
  beforeEach(() => {
    // Two tickets on this device; Kai is signed in when the game is picked up.
    setUsersState(setActiveUser(addUser(addUser(emptyUsersState(), 'u-kai', 'Kai'), 'u-rio', 'Rio'), 'u-kai'));
  });

  it('a solo win credits the ticket that started the game', async () => {
    const last = seedNearWinSolo('u-kai');
    const app = within(renderApp().container);

    await resumeAndWin(app, last);

    const rows = historyById();
    expect(rows['u-kai']).toHaveLength(1);
    expect(rows['u-kai'][0]).toMatchObject({ game: 'battleship', result: 'win', opponent: 'Admiral Grimtide', code: 'SOLO' });
    expect(rows['u-rio']).toEqual([]);
    // Kai is seated and signed in: the card's running total is Kai's.
    const kai = getUsersSnapshot().users.find((u) => u.id === 'u-kai')!.profile;
    expect(app.getByText(new RegExp(`You now have ${kai.points} points`))).toBeInTheDocument();
  });

  it('shows no connection badge against a computer captain — there is no link to report', async () => {
    seedNearWinSolo('u-kai');
    const app = within(renderApp().container);
    fireEvent.click(app.getByTestId('resume-game'));
    await waitFor(() => expect(app.getByTestId('battleship-page')).toHaveAttribute('data-conn', 'connected'));
    expect(app.queryByText(/Connected/i)).toBeNull();
  });

  it('even when a different ticket is signed in by the time the game ends', async () => {
    const last = seedNearWinSolo('u-kai');
    const app = within(renderApp().container);
    fireEvent.click(app.getByTestId('resume-game'));

    // Mid-game, the family taps Change: Rio is signed in when the last shot lands.
    switchTo('u-rio');
    await waitFor(() => expect(app.getByTestId('battleship-page')).toHaveAttribute('data-conn', 'connected'));
    fireEvent.click(app.getByTestId(`cell-enemy-${last.row}-${last.col}`));
    await app.findByText('You Win!', {}, { timeout: 4000 });

    const rows = historyById();
    expect(rows['u-kai']).toHaveLength(1);
    expect(rows['u-kai'][0]).toMatchObject({ game: 'battleship', result: 'win' });
    expect(rows['u-rio']).toEqual([]);
    // Rio is signed in but the points went to Kai: the card must not read
    // Rio's balance back as "You now have".
    expect(app.queryByText(/You now have/)).toBeNull();
  });

  it('a save from before tickets took seats records nothing — for anybody', async () => {
    const last = seedNearWinSolo(null);
    const app = within(renderApp().container);

    await resumeAndWin(app, last);

    const rows = historyById();
    expect(rows['u-kai']).toEqual([]);
    expect(rows['u-rio']).toEqual([]);
    // Nothing was credited, so there is no running total to report.
    expect(app.queryByText(/You now have/)).toBeNull();
  });
});

describe('the table closes when the game ends', () => {
  it('the host closes the table at the finish, so a guest reloading is not seated at a finished game', async () => {
    mockParty.value = fakePartyWithKai('host');
    const last = seedNearWinSolo('u1');
    const app = within(renderApp().container);

    await resumeAndWin(app, last);

    // The page always says "I'm done with <my code>" at the finish — once;
    // the party decides whether that code is its open table.
    expect(mockParty.value.closeTable).toHaveBeenCalledTimes(1);
    expect(mockParty.value.closeTable).toHaveBeenCalledWith('SOLO');
  });
});

describe('two-player integration: create → place → fire', () => {
  it('lets a host and guest connect, deploy fleets, and land a first shot', async () => {
    const host = within(renderApp().container);
    const guest = within(renderApp().container);

    // ── Host creates a game and gets a code, signed in as Rio ─────────────
    signInAs('Rio');
    fireEvent.click(host.getByTestId('create-game'));
    const code = (await host.findByTestId('game-code')).textContent!.trim();
    expect(code).toMatch(/^[A-Z0-9]{4}$/);

    // ── Guest joins with the code, as a different player: Kai ─────────────
    fireEvent.click(guest.getByTestId('show-join'));
    fireEvent.change(guest.getByTestId('code-input'), { target: { value: code } });
    signInAs('Kai');
    fireEvent.click(guest.getByTestId('join-game'));

    // Both should now see they are connected (opponent name exchanged).
    await waitFor(() => expect(host.getAllByText(/Connected/i).length).toBeGreaterThan(0));

    // ── Both choose a fleet, auto-place ships, and ready up ───────────────
    for (const player of [host, guest]) {
      fireEvent.click(player.getByTestId('fleet-continue'));
      fireEvent.click(player.getByTestId('auto-place'));
      await waitFor(() => expect(player.getByTestId('ready')).not.toBeDisabled());
      fireEvent.click(player.getByTestId('ready'));
    }

    // ── The game reaches battle; one side is on the clock ─────────────────
    await waitFor(() => {
      const someoneCanFire = host.queryByText(/Your shot/) || guest.queryByText(/Your shot/);
      expect(someoneCanFire).toBeTruthy();
    });
    const shooter = host.queryByText(/Your shot/) ? host : guest;
    const defender = shooter === host ? guest : host;

    // ── The ticket name crossed the wire ──────────────────────────────────
    // The radar header is built from oppName alone, which is only ever set by
    // the opponent's `hello`. The two captains signed in under different names,
    // so each header naming the OTHER one proves the ticket name travelled —
    // nobody typed it, and neither side is reading its own name back.
    expect(host.getAllByText(/Radar — Kai's waters/).length).toBeGreaterThan(0);
    expect(host.queryByText(/Radar — Rio's waters/)).toBeNull();
    expect(guest.getAllByText(/Radar — Rio's waters/).length).toBeGreaterThan(0);
    expect(guest.queryByText(/Radar — Kai's waters/)).toBeNull();

    // ── Fire the first shot at A1 (row 0, col 0) ──────────────────────────
    fireEvent.click(shooter.getAllByTestId('cell-enemy-0-0')[0]);

    // ── The shot round-trips: A1 shows up in BOTH players' battle logs ─────
    await waitFor(() => {
      expect(shooter.getAllByText('A1').length).toBeGreaterThan(0);
      expect(defender.getAllByText('A1').length).toBeGreaterThan(0);
    });
    // Two full clients in one jsdom is heavy; the default 5s flakes when the
    // whole suite runs in parallel on a loaded machine.
  }, 20000);
});

type Scope = ReturnType<typeof within>;

/** Every cell on the board, row-major. */
function allCoords(): Coord[] {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => ({
    row: Math.floor(i / BOARD_SIZE),
    col: i % BOARD_SIZE,
  }));
}

/**
 * Lay out FLEET by hand: the placement screen selects the next unplaced ship
 * in fleet order (carrier first) pointing east, so tapping each ship's bow
 * cell rebuilds the fixture exactly — a fleet the test knows, for both
 * captains, with no random auto-place to read back.
 */
function placeFleetByHand(player: Scope) {
  for (const p of FLEET) fireEvent.click(player.getByTestId(`cell-own-${p.row}-${p.col}`));
}

/** Both captains lay out FLEET and ready up; the host's coin toss opens the battle. */
async function deployBoth(host: Scope, guest: Scope) {
  for (const player of [host, guest]) {
    placeFleetByHand(player);
    await waitFor(() => expect(player.getByTestId('ready')).not.toBeDisabled());
    fireEvent.click(player.getByTestId('ready'));
  }
}

/**
 * Play the battle out with the host winning: the host shells every cell of
 * the guest's fleet while the guest answers into open water (the odd rows are
 * empty in FLEET). Whoever the coin toss put first, the host's 17th hit lands
 * before the guest runs out of misses.
 */
async function playToHostWin(host: Scope, guest: Scope) {
  const targets = FLEET.flatMap((p) => shipCells(p));
  const water = allCoords().filter((c) => !targets.some((t) => t.row === c.row && t.col === c.col));
  let hits = 0;
  let misses = 0;
  while (hits < targets.length) {
    await waitFor(() => expect(host.queryByText(/Your shot/) || guest.queryByText(/Your shot/)).toBeTruthy());
    if (host.queryByText(/Your shot/)) {
      const t = targets[hits++];
      fireEvent.click(host.getByTestId(`cell-enemy-${t.row}-${t.col}`));
    } else {
      const w = water[misses++];
      fireEvent.click(guest.getByTestId(`cell-enemy-${w.row}-${w.col}`));
    }
  }
  await host.findByText('You Win!');
  await guest.findByText('Good Game!');
}

describe('two-player integration: to the finish, and a rematch', () => {
  beforeEach(() => {
    // Two tickets on this device, so both captains have a history to land on.
    setUsersState(setActiveUser(addUser(addUser(emptyUsersState(), 'u-rio', 'Rio'), 'u-kai', 'Kai'), 'u-rio'));
  });

  it('records the win on the host ticket and the loss on the guest ticket — and a rematch records a second row each', async () => {
    const host = within(renderApp().container);
    const guest = within(renderApp().container);

    // Rio hosts; Kai signs in on "the other iPad" and joins with the code.
    fireEvent.click(host.getByTestId('create-game'));
    const code = (await host.findByTestId('game-code')).textContent!.trim();
    switchTo('u-kai');
    fireEvent.click(guest.getByTestId('show-join'));
    fireEvent.change(guest.getByTestId('code-input'), { target: { value: code } });
    fireEvent.click(guest.getByTestId('join-game'));
    await waitFor(() => expect(host.getAllByText(/Connected/i).length).toBeGreaterThan(0));

    for (const player of [host, guest]) fireEvent.click(player.getByTestId('fleet-continue'));
    await deployBoth(host, guest);
    await playToHostWin(host, guest);

    let rows = historyById();
    expect(rows['u-rio']).toHaveLength(1);
    expect(rows['u-rio'][0]).toMatchObject({ game: 'battleship', result: 'win', opponent: 'Kai', code });
    expect(rows['u-kai']).toHaveLength(1);
    expect(rows['u-kai'][0]).toMatchObject({ game: 'battleship', result: 'loss', opponent: 'Rio', code });

    // Play again: both ask, both are back at placement, and the second game
    // is history too — by design, a rematch is a new game at the same table.
    fireEvent.click(host.getByTestId('rematch'));
    fireEvent.click(guest.getByTestId('rematch'));
    await waitFor(() => {
      expect(host.getByTestId('ready')).toBeInTheDocument();
      expect(guest.getByTestId('ready')).toBeInTheDocument();
    });
    await deployBoth(host, guest);
    await playToHostWin(host, guest);

    rows = historyById();
    expect(rows['u-rio'].map((r) => r.result)).toEqual(['win', 'win']);
    expect(rows['u-kai'].map((r) => r.result)).toEqual(['loss', 'loss']);
    expect(rows['u-rio'].map((r) => r.code)).toEqual([code, code]);
    expect(rows['u-kai'].map((r) => r.code)).toEqual([code, code]);
    // Two whole games across two full clients in one jsdom.
  }, 40000);
});
