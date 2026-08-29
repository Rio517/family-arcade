import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, within, fireEvent, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { loadSession } from '@games/battleship/storage/sessionStore';
import type { PartyValue } from '@shared/party/PartyContext';

// The party is mocked (its provider lives above the router): the lobby reads
// it to decide whether the code doors are open, and the tests below set it.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

function makeParty(over: Partial<PartyValue> = {}): PartyValue {
  return {
    myName: 'Rio',
    status: 'idle',
    code: '',
    role: null,
    inParty: false,
    theirName: null,
    hostParty: vi.fn(() => 'ABCD'),
    joinParty: vi.fn(),
    leaveParty: vi.fn(),
    retry: vi.fn(),
    reconnecting: false,
    table: null,
    knock: null,
    openTable: vi.fn(() => 'WXYZ'),
    closeTable: vi.fn(),
    knockOn: vi.fn(),
    clearKnock: vi.fn(),
    resolveGame: () => null,
    call: {
      active: false,
      status: 'idle',
      muted: false,
      cameraOn: false,
      localStream: null,
      remoteStream: null,
      start: vi.fn(),
      stop: vi.fn(),
      toggleMute: vi.fn(),
      toggleCamera: vi.fn(),
    },
    ...over,
  } as PartyValue;
}

/** The party as seen from one side of it, already linked to the friend. */
const inPartyAs = (role: 'host' | 'guest', over: Partial<PartyValue> = {}) =>
  makeParty({ inParty: true, status: 'connected', role, code: 'PRTY', theirName: 'Kai', ...over });

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

function renderApp(): RenderResult {
  return render(
    <MemoryRouter initialEntries={['/play']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BattleshipPage />
    </MemoryRouter>,
  );
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

beforeEach(() => {
  localStorage.clear();
  mockParty.value = makeParty();
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
    mockParty.value = inPartyAs('host');
    const app = within(renderApp().container);

    fireEvent.click(app.getByTestId('battle-party-play'));
    expect(mockParty.value.openTable).toHaveBeenCalledWith('battleship');
    expect((await app.findByTestId('game-code')).textContent!.trim()).toBe('WXYZ');
    const saved = loadSession('WXYZ');
    expect(saved?.side).toBe('host');
    expect(saved?.seatedUserId).toBe('u1');
  });

  it('the guest walks in the moment the table is open, seated under their own ticket', () => {
    signInAs('Kai');
    mockParty.value = inPartyAs('guest', { theirName: 'Rio', table: { game: 'battleship', code: 'NOPE' } });
    renderApp();

    // No knock — the table was already open — and the join went out at once.
    expect(mockParty.value.knockOn).not.toHaveBeenCalled();
    const saved = loadSession('NOPE');
    expect(saved?.side).toBe('guest');
    expect(saved?.myName).toBe('Kai');
    expect(saved?.seatedUserId).toBe('u-kai');
  });

  it('a party host readying up sees no QR invite — the friend is already walking in', async () => {
    mockParty.value = inPartyAs('host');
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
    mockParty.value = inPartyAs('host', { openTable: vi.fn(() => 'DOWN') });
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
