import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, within, fireEvent, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RacerPage } from './RacerPage';

/**
 * Two-player integration tests: real <RacerPage> clients wired together through
 * an in-memory stand-in for the WebRTC transport (same pattern as battleship's
 * app.integration.test.tsx). They walk the actual multiplayer journey — pick
 * 2 Players, choose a driver, create/join by code — and assert the racer
 * handshake (hello ⇄, host's go) on the wire plus the phase transitions.
 *
 * jsdom has no WebGL, so once a client reaches the race the 3D scene fails to
 * construct and Track3D renders its `racer3d-fallback` — but the page still
 * mounts the race screen and the net layer keeps running, which is what these
 * tests observe. The rAF world loop never runs without a scene, so HUD scores
 * and the win overlay are out of reach here (covered by domain/protocol tests).
 */

// Observable spine of the mock transport, shared between the hoisted vi.mock
// factory and the tests: every created connection and every delivered message.
const bus = vi.hoisted(() => ({
  conns: [] as Array<{ label: string; destroyed: boolean; send: (msg: unknown) => boolean }>,
  wire: [] as Array<{ from: string; msg: { t: string; [k: string]: unknown } }>,
  reset(): void {
    this.conns.length = 0;
    this.wire.length = 0;
  },
}));

// Replace the PeerJS transport with an in-memory bus linking host and guest.
// generateCode / normalizeCode stay real (spread from the actual module), so
// codes and code-input normalisation behave exactly as in production.
vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  const hosts = new Map<string, GameConnection>();

  class GameConnection {
    private peer: GameConnection | null = null;
    label = '?';
    destroyed = false;
    constructor(private handlers: { onStatus: Function; onOpen: Function; onMessage: Function }) {
      bus.conns.push(this);
    }
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
      // Both channels open; each side runs its hello handshake.
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

function renderClient(): ReturnType<typeof within<HTMLElement>> {
  const result: RenderResult = render(
    <MemoryRouter initialEntries={['/racer']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RacerPage />
    </MemoryRouter>,
  );
  return within(result.container);
}

type Client = ReturnType<typeof renderClient>;

/** 2 Players → pick a driver → arrive at the net lobby. */
function toNetLobby(app: Client, driverId: string) {
  fireEvent.click(app.getByTestId('racer-mode-net'));
  fireEvent.click(app.getByTestId(`racer-driver-${driverId}`));
}

/** Full two-client setup: host creates a game, guest joins with its code. */
function connectClients(): { host: Client; guest: Client; code: string } {
  const host = renderClient();
  const guest = renderClient();

  toNetLobby(host, 'unicorn');
  fireEvent.change(host.getByTestId('racer-name-input'), { target: { value: 'Mario' } });
  fireEvent.click(host.getByTestId('racer-create'));
  const code = host.getByTestId('racer-code').textContent!.trim();

  toNetLobby(guest, 'dragon');
  fireEvent.change(guest.getByTestId('racer-name-input'), { target: { value: 'Kiddo' } });
  fireEvent.click(guest.getByTestId('racer-show-join'));
  fireEvent.change(guest.getByTestId('racer-code-input'), { target: { value: code } });
  fireEvent.click(guest.getByTestId('racer-join'));

  return { host, guest, code };
}

beforeEach(() => {
  cleanup();
  bus.reset();
});

describe('two-player racer: lobby flows', () => {
  it('host: 2 Players → pick driver → Create a game shows a shareable 4-char code and waiting copy', () => {
    const app = renderClient();

    toNetLobby(app, 'unicorn');
    fireEvent.change(app.getByTestId('racer-name-input'), { target: { value: 'Mario' } });
    fireEvent.click(app.getByTestId('racer-create'));

    expect(app.getByTestId('racer-code').textContent!.trim()).toMatch(CODE_RE);
    expect(app.getByText(/Waiting for your friend to join/)).toBeInTheDocument();
  });

  it('guest: Connect stays disabled until the code has 4 valid characters, and Back returns to the choice', () => {
    const app = renderClient();

    toNetLobby(app, 'fairy');
    fireEvent.click(app.getByTestId('racer-show-join'));
    const input = app.getByTestId('racer-code-input');
    const connect = app.getByTestId('racer-join');

    // Empty → gated.
    expect(connect).toBeDisabled();

    // Too short (normalised to uppercase) → still gated.
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(input).toHaveValue('AB');
    expect(connect).toBeDisabled();

    // Look-alike junk (O, 0, I, 1, L are not in the code alphabet) is stripped.
    fireEvent.change(input, { target: { value: 'O0IL1' } });
    expect(input).toHaveValue('');
    expect(connect).toBeDisabled();

    // Four valid chars survive normalisation (junk stripped, clipped to 4).
    fireEvent.change(input, { target: { value: ' ab-2cde ' } });
    expect(input).toHaveValue('AB2C');
    expect(connect).not.toBeDisabled();

    // Back leaves join mode and returns to the create/join choice.
    fireEvent.click(app.getByTestId('racer-join-back'));
    expect(app.getByTestId('racer-create')).toBeInTheDocument();
    expect(app.queryByTestId('racer-code-input')).toBeNull();
  });

  it('leaving the lobby destroys the connection and returns to the create/join choice', () => {
    const app = renderClient();

    toNetLobby(app, 'butterfly');
    fireEvent.click(app.getByTestId('racer-create'));
    expect(app.getByTestId('racer-code')).toBeInTheDocument();
    const conn = bus.conns.at(-1)!;
    expect(conn.destroyed).toBe(false);

    fireEvent.click(app.getByTestId('racer-lobby-back'));

    expect(conn.destroyed).toBe(true);
    expect(app.getByTestId('racer-create')).toBeInTheDocument();
    expect(app.queryByTestId('racer-code')).toBeNull();
  });
});

describe('two-player racer: handshake and race start', () => {
  it(
    'guest joining the host code exchanges hello both ways, the host sends go, and both reach the race screen',
    async () => {
      const { host, guest } = connectClients();

      // Both sides introduce themselves on channel open.
      await waitFor(() => {
        const hellos = bus.wire.filter((w) => w.msg.t === 'hello');
        expect(hellos.map((h) => h.from).sort()).toEqual(['guest', 'host']);
      });
      expect(bus.wire.find((w) => w.from === 'host' && w.msg.t === 'hello')!.msg).toMatchObject({
        name: 'Mario',
        driver: 'unicorn',
      });
      expect(bus.wire.find((w) => w.from === 'guest' && w.msg.t === 'hello')!.msg).toMatchObject({
        name: 'Kiddo',
        driver: 'dragon',
      });

      // The host answers the guest's hello with the authoritative go.
      await waitFor(() => {
        const goes = bus.wire.filter((w) => w.msg.t === 'go');
        expect(goes).toHaveLength(1);
        expect(goes[0]).toMatchObject({ from: 'host', msg: { t: 'go', target: 20 } });
      });

      // Both leave the lobby for the race screen. jsdom has no WebGL, so the
      // race mounts its 3D fallback — the phase transition is what matters.
      await host.findByTestId('racer3d-fallback', undefined, { timeout: 15000 });
      await guest.findByTestId('racer3d-fallback', undefined, { timeout: 15000 });
      expect(host.queryByTestId('racer-lobby-back')).toBeNull();
      expect(guest.queryByTestId('racer-lobby-back')).toBeNull();
    },
    20000,
  );

  it(
    'a rematch request from the guest reaches the host, which echoes a fresh go to restart both sides',
    async () => {
      const { host, guest } = connectClients();

      // Let the initial handshake finish: one go, both on the race screen.
      await waitFor(() => expect(bus.wire.filter((w) => w.msg.t === 'go')).toHaveLength(1));
      await host.findByTestId('racer3d-fallback', undefined, { timeout: 15000 });
      await guest.findByTestId('racer3d-fallback', undefined, { timeout: 15000 });

      // The win overlay's "Race again" is unreachable in jsdom (it needs the
      // rAF loop, which needs a real scene), so put the guest's rematch on the
      // wire directly — the exact message its Race-again button sends.
      const guestConn = bus.conns.find((c) => c.label === 'guest')!;
      guestConn.send({ t: 'rematch' });

      await waitFor(() => {
        expect(bus.wire.filter((w) => w.from === 'guest' && w.msg.t === 'rematch')).toHaveLength(1);
        // The host answered with a second go — the startNonce bump that
        // remounts the race on both sides.
        expect(bus.wire.filter((w) => w.from === 'host' && w.msg.t === 'go')).toHaveLength(2);
      });

      // Both clients are still on the (freshly restarted) race screen.
      await host.findByTestId('racer3d-fallback', undefined, { timeout: 15000 });
      await guest.findByTestId('racer3d-fallback', undefined, { timeout: 15000 });
    },
    20000,
  );
});
