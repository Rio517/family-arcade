import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, within, fireEvent, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BattleshipPage } from './BattleshipPage';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState } from '@shared/profile/users';

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

function renderApp(): RenderResult {
  return render(
    <MemoryRouter initialEntries={['/play']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BattleshipPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // This flow exercises the radar and the wire, not the 3D ocean — pin the
  // fleet tile to the 2D grid so the lazy three.js chunk never enters the run.
  localStorage.setItem('bs-fleet-view-v1', '2d');
  // One ticket signed in — the games never ask for a name any more.
  resetUsersStore();
  setUsersState(addUser(emptyUsersState(), 'u1', 'Rio', 1));
  cleanup();
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

    // ── Host creates a game and gets a code ───────────────────────────────
    fireEvent.click(host.getByTestId('create-game'));
    const code = (await host.findByTestId('game-code')).textContent!.trim();
    expect(code).toMatch(/^[A-Z0-9]{4}$/);

    // ── Guest joins with the code ─────────────────────────────────────────
    fireEvent.click(guest.getByTestId('show-join'));
    fireEvent.change(guest.getByTestId('code-input'), { target: { value: code } });
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
    // the opponent's `hello` — so "Rio's waters" (not "Opponent's") proves the
    // signed-in ticket name travelled, with nobody typing it.
    expect(shooter.getAllByText(/Radar — Rio's waters/).length).toBeGreaterThan(0);
    expect(defender.getAllByText(/Radar — Rio's waters/).length).toBeGreaterThan(0);

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
