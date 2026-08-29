import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, within, fireEvent, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState } from '@shared/profile/users';
import { ChessPage } from './ChessPage';

/**
 * Two-player integration tests: real <ChessPage> clients wired together through
 * an in-memory stand-in for the WebRTC transport (same pattern as battleship's
 * app.integration.test.tsx and racer's racer.integration.test.tsx). They walk
 * the actual online journey — create a game, join by code, the hello/sync
 * handshake, moves crossing the wire via the 2D board, turn ownership, and a
 * full end-of-game rematch handshake — the way two family members play it.
 *
 * The epoch-based stale-sync protection itself is unit-tested in
 * domain/session.test.ts; here the rematch test proves the UI round-trips the
 * whole thing: both boards reset and the next game's moves still flow.
 */

// Observable spine of the mock transport, shared between the hoisted vi.mock
// factory and the tests: every delivered message, tagged by sender.
const bus = vi.hoisted(() => ({
  wire: [] as Array<{ from: string; msg: { t: string; [k: string]: unknown } }>,
  reset(): void {
    this.wire.length = 0;
  },
}));

// Replace the PeerJS transport with an in-memory bus linking host and guest.
// generateCode / normalizeCode stay real (spread from the actual module).
vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  const hosts = new Map<string, GameConnection>();

  class GameConnection {
    private peer: GameConnection | null = null;
    label = '?';
    destroyed = false;
    constructor(private handlers: {
      onStatus: (status: string, detail?: string) => void;
      onOpen: () => void;
      onMessage: (msg: unknown) => void;
    }) {}
    host(code: string) {
      this.label = 'host';
      hosts.set(code, this);
      this.handlers.onStatus('hosting');
    }
    join(code: string) {
      this.label = 'guest';
      const host = hosts.get(code);
      if (!host || host.destroyed) return this.handlers.onStatus('error', 'no host');
      this.peer = host;
      host.peer = this;
      // Both channels open; each side runs its hello + sync handshake.
      this.handlers.onStatus('connected');
      host.handlers.onStatus('connected');
      this.handlers.onOpen();
      host.handlers.onOpen();
    }
    send(msg: unknown): boolean {
      const peer = this.peer;
      if (!peer || peer.destroyed) return false;
      bus.wire.push({ from: this.label, msg: msg as { t: string } });
      // Deliver on the next tick, like a real data channel — avoids deep
      // synchronous re-entrancy across the two React roots.
      setTimeout(() => {
        if (!peer.destroyed) peer.handlers.onMessage(msg);
      }, 0);
      return true;
    }
    destroy() {
      this.destroyed = true;
      for (const [code, conn] of hosts) if (conn === this) hosts.delete(code);
      this.peer = null;
    }
  }

  return { ...actual, GameConnection };
});

/** Only characters the real generateCode can emit (no look-alikes O/0, I/1, L). */
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function renderClient() {
  const result: RenderResult = render(
    <MemoryRouter initialEntries={['/chess']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ChessPage />
    </MemoryRouter>,
  );
  return within(result.container);
}

type Client = ReturnType<typeof renderClient>;

/**
 * Sign this browser in as `name`. Both clients share one roster (one jsdom, one
 * localStorage), so each side signs in just before it creates or joins — the
 * name is copied into that client's session at that moment and stays put.
 */
function signInAs(name: string) {
  act(() => {
    setUsersState(addUser(emptyUsersState(), `u-${name.toLowerCase()}`, name, 1));
  });
}

/** Sign in, then walk the mode picker into the online lobby. */
function toOnlineLobby(app: Client, name: string) {
  signInAs(name);
  fireEvent.click(app.getByTestId('mode-online'));
  // The lobby names you from your ticket instead of asking.
  expect(app.getByTestId('playing-as')).toHaveTextContent(`You're ${name}`);
  expect(app.queryByTestId('chess-name')).toBeNull();
}

/** Does this client's board show a piece on the named square? */
function pieceOn(app: Client, square: string): boolean {
  return app.getByTestId(`sq-${square}`).querySelector('.pstand') !== null;
}

/** Tap-to-move on the 2D board: select the piece, then its destination. */
function tapMove(app: Client, from: string, to: string) {
  fireEvent.click(app.getByTestId(`sq-${from}`));
  fireEvent.click(app.getByTestId(`sq-${to}`));
}

/** The name shown on the "to move" player card. */
function turnName(app: Client): string {
  return app.getByTestId('chess-turn').textContent ?? '';
}

/** Full two-client setup: Mario hosts, Kiddo joins with the code, names cross. */
async function connectClients(): Promise<{ host: Client; guest: Client; code: string }> {
  const host = renderClient();
  const guest = renderClient();

  toOnlineLobby(host, 'Mario');
  fireEvent.click(host.getByTestId('chess-create'));
  const code = host.getByTestId('chess-code').textContent!.trim();

  toOnlineLobby(guest, 'Kiddo');
  fireEvent.change(guest.getByTestId('chess-join-code'), { target: { value: code } });
  fireEvent.click(guest.getByTestId('chess-join'));

  // Both ends report the link is up. (The hello handshake also crosses the
  // names — asserted on the wire and in the ☰ menu by the handshake test.)
  await waitFor(() => {
    expect(host.getAllByText('Connected').length).toBeGreaterThan(0);
    expect(guest.getAllByText('Connected').length).toBeGreaterThan(0);
  });
  return { host, guest, code };
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
  resetUsersStore();
  bus.reset();
});

describe('online chess: create and join', () => {
  it('the host creates a game and shows a shareable 4-character code while waiting', () => {
    const host = renderClient();

    toOnlineLobby(host, 'Mario');
    fireEvent.click(host.getByTestId('chess-create'));

    expect(host.getByTestId('chess-code').textContent!.trim()).toMatch(CODE_RE);
    // The invite modal and the connection badge both say we're waiting.
    expect(host.getAllByText(/Waiting for opponent/).length).toBeGreaterThan(0);
    // The host plays White and the board is already up.
    expect(pieceOn(host, 'e2')).toBe(true);
  });

  it('joining by code completes the hello/sync handshake: names cross and both show Connected', async () => {
    const { host, guest } = await connectClients();

    await waitFor(() => {
      expect(host.getAllByText('Connected').length).toBeGreaterThan(0);
      expect(guest.getAllByText('Connected').length).toBeGreaterThan(0);
    });
    // Once the guest is in, the host's code chip disappears.
    expect(host.queryByTestId('chess-code')).toBeNull();

    // The crossed names show in each player's ☰ menu (the player cards moved
    // there when the side panel gave its space to the board). getAllBy: the
    // active player's name is also on the title-bar turn chip.
    fireEvent.click(host.getByTestId('chess-menu'));
    expect(host.getAllByText('Kiddo').length).toBeGreaterThan(0);
    fireEvent.click(host.getByTestId('chess-menu-close'));
    fireEvent.click(guest.getByTestId('chess-menu'));
    expect(guest.getAllByText('Mario').length).toBeGreaterThan(0);
    fireEvent.click(guest.getByTestId('chess-menu-close'));

    // Both sides introduced themselves and synced their (empty) logs.
    const hellos = bus.wire.filter((w) => w.msg.t === 'hello');
    expect(hellos.map((h) => h.from).sort()).toEqual(['guest', 'host']);
    expect(hellos.find((h) => h.from === 'host')!.msg).toMatchObject({ name: 'Mario', side: 'host' });
    expect(hellos.find((h) => h.from === 'guest')!.msg).toMatchObject({ name: 'Kiddo', side: 'guest' });
    const syncs = bus.wire.filter((w) => w.msg.t === 'sync');
    expect(syncs.map((s) => s.from).sort()).toEqual(['guest', 'host']);
    for (const s of syncs) expect(s.msg).toMatchObject({ log: [], epoch: 0, wantRematch: false });
  });
});

describe('online chess: moves cross the wire', () => {
  it("the host's e4 arrives on the guest's board and hands the guest the turn; the reply comes back", async () => {
    const { host, guest } = await connectClients();

    // White (the host, Mario) is on the clock first — on both screens.
    expect(turnName(host)).toContain('Mario');
    expect(turnName(guest)).toContain('Mario');

    tapMove(host, 'e2', 'e4');
    expect(pieceOn(host, 'e4')).toBe(true); // instant locally
    expect(pieceOn(host, 'e2')).toBe(false);

    // …and one tick later on the guest's board, where it is now Kiddo's turn.
    await waitFor(() => {
      expect(pieceOn(guest, 'e4')).toBe(true);
      expect(pieceOn(guest, 'e2')).toBe(false);
      expect(turnName(guest)).toContain('Kiddo');
    });

    // The guest answers 1…e5 and the host sees it arrive.
    tapMove(guest, 'e7', 'e5');
    await waitFor(() => {
      expect(pieceOn(host, 'e5')).toBe(true);
      expect(turnName(host)).toContain('Mario');
    });
  });

  it("the guest cannot move White's pieces, and cannot move at all before their turn", async () => {
    const { host, guest } = await connectClients();

    // Not the guest's turn yet: tapping their own pawn does nothing.
    tapMove(guest, 'e7', 'e5');
    expect(pieceOn(guest, 'e5')).toBe(false);
    expect(pieceOn(guest, 'e7')).toBe(true);

    tapMove(host, 'e2', 'e4');
    await waitFor(() => expect(turnName(guest)).toContain('Kiddo'));

    // On their turn, the guest still cannot pick up a White pawn.
    tapMove(guest, 'd2', 'd4');
    expect(pieceOn(guest, 'd4')).toBe(false);
    expect(pieceOn(guest, 'd2')).toBe(true);

    // But their own pieces move fine — and that move reaches the host, while
    // the attempted White move never does (reliable ordered channel: e5
    // arriving proves d4 was never sent).
    tapMove(guest, 'e7', 'e5');
    await waitFor(() => expect(pieceOn(host, 'e5')).toBe(true));
    expect(pieceOn(host, 'd4')).toBe(false);
    const guestMoves = bus.wire.filter((w) => w.from === 'guest' && w.msg.t === 'move');
    expect(guestMoves).toHaveLength(1);
  });
});

describe("online chess: fool's mate and the rematch handshake", () => {
  it(
    'the mate ends the game on both screens, both tap rematch, and a fresh game plays on',
    async () => {
      const { host, guest } = await connectClients();

      // Fool's mate: 1.f3 e5 2.g4 Qh4# — Black (the guest) wins. Each move
      // must land on the other board before that player can answer it.
      tapMove(host, 'f2', 'f3');
      await waitFor(() => expect(turnName(guest)).toContain('Kiddo'));
      tapMove(guest, 'e7', 'e5');
      await waitFor(() => expect(turnName(host)).toContain('Mario'));
      tapMove(host, 'g2', 'g4');
      await waitFor(() => expect(turnName(guest)).toContain('Kiddo'));
      tapMove(guest, 'd8', 'h4');

      // Checkmate lands on both screens, crediting Kiddo on each.
      const guestHeadline = await guest.findByTestId('chess-result-headline');
      expect(guestHeadline.textContent).toContain('Kiddo wins');
      await waitFor(() => {
        expect(host.getByTestId('chess-result-headline').textContent).toContain('Kiddo wins');
      });

      // Host asks for a rematch: their button locks in, the guest sees the ask.
      fireEvent.click(host.getByTestId('chess-rematch'));
      expect(host.getByTestId('chess-rematch')).toBeDisabled();
      expect(host.getByTestId('chess-rematch').textContent).toContain('Rematch requested');
      await waitFor(() => expect(guest.getByText(/wants a rematch/)).toBeInTheDocument());

      // Guest accepts: both sides reset to a fresh board (the epoch bump —
      // its stale-sync semantics are covered by domain/session tests).
      fireEvent.click(guest.getByTestId('chess-rematch'));
      await waitFor(() => {
        for (const app of [host, guest]) {
          expect(app.queryByTestId('chess-result-headline')).toBeNull();
          expect(pieceOn(app, 'f2')).toBe(true); // pawns back home
          expect(pieceOn(app, 'e7')).toBe(true);
          expect(pieceOn(app, 'h4')).toBe(false); // the mating queen is gone
          expect(pieceOn(app, 'd8')).toBe(true); // …back on her square
        }
      });
      expect(bus.wire.filter((w) => w.msg.t === 'rematch')).toHaveLength(2);

      // The new game is live: White to move, and moves still cross the wire.
      expect(turnName(host)).toContain('Mario');
      tapMove(host, 'e2', 'e4');
      await waitFor(() => {
        expect(pieceOn(guest, 'e4')).toBe(true);
        expect(turnName(guest)).toContain('Kiddo');
      });
    },
    15000,
  );
});
