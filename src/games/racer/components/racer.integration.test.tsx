import { describe, expect, it, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { act, render, within, fireEvent, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RacerPage } from './RacerPage';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';

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
  conns: [] as Array<{
    label: string;
    destroyed: boolean;
    send: (msg: unknown) => boolean;
    reopen: () => void;
  }>,
  wire: [] as Array<{ from: string; msg: { t: string; [k: string]: unknown } }>,
  /** When set, a matching message is "sent" but never delivered — a lost packet. */
  drop: null as null | ((msg: { t: string; [k: string]: unknown }) => boolean),
  reset(): void {
    this.conns.length = 0;
    this.wire.length = 0;
    this.drop = null;
  },
}));

// The 3D scene is jsdom-hostile (no WebGL). By default the mock constructor
// throws — the genuine no-WebGL failure path, which renders `racer3d-fallback`.
// The reconnect test flips `fake3d.enabled` to get an inert scene instead, so
// the rAF race loop actually runs and can be driven by hand.
const fake3d = vi.hoisted(() => ({ enabled: false }));
vi.mock('../three/scene', () => {
  class RacerScene {
    constructor() {
      if (!fake3d.enabled) throw new Error('no WebGL in jsdom');
    }
    sync(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { RacerScene };
});

// Start both karts on the coin pile so a driven test race finishes in a couple
// of frames (with Math.random pinned to 0, every coin spawns at the arena
// centre). The host kart is listed first, so it wins every shared coin.
vi.mock('../domain/kart', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/kart')>();
  return {
    ...actual,
    startPositions: () => [
      { x: 0, z: 0, heading: 0 },
      { x: 0.5, z: 0, heading: 0 },
    ],
  };
});

/**
 * Two devices, one jsdom. Unlike chess and battleship — which copy the ticket
 * name into the session the moment you create or join — the racer reads its
 * player live: `useRacerNet` re-reads `opts.name` on every render and sends it
 * on channel open. Both channels open inside the guest's Connect click, so
 * switching the one shared roster mid-flow cannot tell the two roots apart:
 * the host's `hello` would go out carrying whoever was signed in by then
 * (measured — it carried the guest's name).
 *
 * So the one thing a single browser cannot have — a different ticket signed in
 * per device — is what this mock supplies: each <RacerPage> latches a roster id
 * at mount and reads THAT ticket's profile out of the real store. The roster,
 * the profile objects, and everything downstream (page → hello → the other
 * player's screen) stay real.
 */
const tickets = vi.hoisted(() => ({ queue: [] as string[] }));
vi.mock('@shared/profile/useProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/profile/useProfile')>();
  const { useState } = await import('react');
  const { getUsersSnapshot } = await import('@shared/profile/usersStore');
  function useProfile() {
    // The real hook still runs: same store subscription, same writers, so a
    // roster change re-renders this client and the read below stays live.
    const real = actual.useProfile();
    const [id] = useState(() => tickets.queue.shift() ?? '');
    if (!id) return real;
    const mine = getUsersSnapshot().users.find((u) => u.id === id);
    return mine ? { ...real, profile: mine.profile } : real;
  }
  return { ...actual, useProfile };
});

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
    constructor(private handlers: {
      onStatus: (status: string, detail?: string) => void;
      onOpen: () => void;
      onMessage: (msg: unknown) => void;
    }) {
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
      const entry = msg as { t: string; [k: string]: unknown };
      bus.wire.push({ from: this.label, msg: entry });
      // A "lost packet": it went out, but the other side never sees it.
      if (bus.drop?.(entry)) return true;
      // Deliver on the next tick, like a real data channel — avoids deep
      // synchronous re-entrancy across the two React roots.
      setTimeout(() => {
        if (!peer.destroyed) peer.handlers.onMessage(msg);
      }, 0);
      return true;
    }
    /** Simulate the data channel re-establishing after a blip: both ends re-run on-open. */
    reopen() {
      const peer = this.peer;
      this.handlers.onStatus('connected');
      this.handlers.onOpen();
      if (peer && !peer.destroyed) {
        peer.handlers.onStatus('connected');
        peer.handlers.onOpen();
      }
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

/** Render one client; `ticket` is the roster id this simulated device plays as. */
function renderClient(ticket = '') {
  if (ticket) tickets.queue.push(ticket);
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

/**
 * Two tickets on the roster and nobody signed in on the shared browser: each
 * client signs itself in (see the useProfile mock), so the two sides are
 * genuinely different players.
 */
function seedTwoTickets() {
  const roster = addUser(addUser(emptyUsersState(), 'u-rio', 'Rio'), 'u-kai', 'Kai');
  setUsersState(setActiveUser(roster, null));
}

/** Full two-client setup: Rio hosts a game, Kai joins with its code. */
function connectClients(): { host: Client; guest: Client; code: string } {
  seedTwoTickets();
  const host = renderClient('u-rio');
  const guest = renderClient('u-kai');

  toNetLobby(host, 'unicorn');
  fireEvent.click(host.getByTestId('racer-create'));
  const code = host.getByTestId('racer-code').textContent!.trim();

  toNetLobby(guest, 'dragon');
  fireEvent.click(guest.getByTestId('racer-show-join'));
  fireEvent.change(guest.getByTestId('racer-code-input'), { target: { value: code } });
  fireEvent.click(guest.getByTestId('racer-join'));

  return { host, guest, code };
}

beforeEach(() => {
  cleanup();
  bus.reset();
  tickets.queue.length = 0;
  localStorage.clear();
  resetUsersStore();
  // One ticket signed in on this browser — what a single-client test plays as.
  // Two-client tests call connectClients, which puts a second ticket on the
  // roster and hands one to each side.
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

describe('two-player racer: lobby flows', () => {
  it('host: 2 Players → pick driver → Create a game shows a shareable 4-char code and waiting copy', () => {
    const app = renderClient();

    toNetLobby(app, 'unicorn');
    fireEvent.click(app.getByTestId('racer-create'));

    expect(app.getByTestId('racer-code').textContent!.trim()).toMatch(CODE_RE);
    expect(app.getByText(/Waiting for your friend to join/)).toBeInTheDocument();
  });

  it('the lobby plays as the signed-in ticket, with no name box to fill in', () => {
    const app = renderClient();

    toNetLobby(app, 'unicorn');

    expect(app.getByTestId('playing-as')).toHaveTextContent("You're Rio");
    expect(app.queryByTestId('racer-name-input')).toBeNull();
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
      // Each side introduces itself with ITS OWN ticket name — the host is Rio,
      // the guest is Kai — so a hello that echoed the local player back, or one
      // built from anything but the signed-in ticket, would show up here.
      expect(bus.wire.find((w) => w.from === 'host' && w.msg.t === 'hello')!.msg).toMatchObject({
        name: 'Rio',
        driver: 'unicorn',
      });
      expect(bus.wire.find((w) => w.from === 'guest' && w.msg.t === 'hello')!.msg).toMatchObject({
        name: 'Kai',
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

      // The race opens with exactly ONE full world snapshot from the host —
      // after that, coin sync rides compact worldDelta messages, never a
      // full-field rebroadcast that could head-of-line-block the pos stream.
      await waitFor(() => {
        const worlds = bus.wire.filter((w) => w.from === 'host' && w.msg.t === 'world');
        expect(worlds).toHaveLength(1);
        expect(worlds[0].msg).toMatchObject({ status: 'racing', scores: [0, 0] });
        expect((worlds[0].msg.coins as unknown[]).length).toBeGreaterThan(0);
      });
      expect(bus.wire.filter((w) => w.msg.t === 'worldDelta')).toHaveLength(0);
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

describe('two-player racer: reconnect re-sync', () => {
  let frames: FrameRequestCallback[];
  let now: number;

  // Pay the lazy 3D chunk's transform cost once, before the timed waits below —
  // the first client's `import('./Track3D')` is what outlived the ceilings on
  // a loaded CI worker (the same fix the Ship Battle Fleet3D tests needed).
  beforeAll(async () => {
    await import('./Track3D');
  });

  beforeEach(() => {
    fake3d.enabled = true;
    frames = [];
    now = 0;
    // Capture animation frames so the test drives both race loops by hand.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    // Every coin spawns at the arena centre — where both karts start (see the
    // kart-module mock above) — so the host finishes in two frames.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    fake3d.enabled = false;
    vi.restoreAllMocks();
  });

  /** Run every pending animation frame, then let queued messages deliver. */
  async function pump(rounds = 1) {
    for (let r = 0; r < rounds; r++) {
      const batch = frames.splice(0, frames.length);
      await act(async () => {
        for (const cb of batch) {
          now += 50;
          cb(now);
        }
        await new Promise((res) => setTimeout(res, 0));
      });
    }
  }

  it(
    'a channel reopen after a lost "race over" packet re-syncs the guest with the finished world',
    async () => {
      const { host, guest } = connectClients();
      // Generous ceilings: both waits gate on each client's lazy scene import
      // resolving, and under full-suite CPU load that occasionally outlives
      // testing-library's 1s default — this test flaked three times in a week
      // on exactly the frames.length wait at 1s, then twice more in CI at 8s
      // once the suite passed 170 files (2026-08-29). The ceilings are only a
      // cap on how long a slow worker may take; a fast one is never held up.
      await waitFor(() => expect(bus.wire.filter((w) => w.msg.t === 'go')).toHaveLength(1), { timeout: 20000 });
      // Both race loops are live (the mocked scene builds fine here).
      await waitFor(() => expect(frames.length).toBeGreaterThanOrEqual(2), { timeout: 20000 });

      // Weak wifi: the host's final "race over" message never arrives.
      bus.drop = (msg) => (msg.t === 'world' || msg.t === 'worldDelta') && msg.status === 'over';

      // Drive the race until the host finishes (its kart sits on the coin pile).
      for (let i = 0; i < 40 && !host.queryByTestId('racer-win'); i++) await pump();
      expect(host.getByTestId('racer-win')).toBeInTheDocument();

      // The finish went out — and was lost. The guest still thinks it's racing.
      expect(bus.wire.some((w) => w.from === 'host' && w.msg.status === 'over')).toBe(true);
      await pump(2);
      expect(guest.queryByTestId('racer-win')).toBeNull();

      // The connection blips and the channel comes back.
      bus.drop = null;
      const before = bus.wire.length;
      const hostConn = bus.conns.find((c) => c.label === 'host' && !c.destroyed)!;
      await act(async () => {
        hostConn.reopen();
        await new Promise((res) => setTimeout(res, 0));
      });

      // The host re-introduced itself and re-sent the authoritative world…
      const resync = bus.wire.slice(before).filter((w) => w.from === 'host' && w.msg.t === 'world');
      expect(resync).toHaveLength(1);
      expect(resync[0].msg).toMatchObject({ status: 'over', winner: 0 });
      // …without restarting the race (both hellos said inRace).
      expect(bus.wire.filter((w) => w.msg.t === 'go')).toHaveLength(1);

      // The guest now learns the race ended and crowns the host by name. The
      // guest is playing as Kai, so "Rio" on this screen can only have come off
      // the wire — the host's hello, carried into the race's name list.
      await pump(2);
      expect(guest.getByTestId('racer-win')).toBeInTheDocument();
      expect(guest.getByText('Rio wins!')).toBeInTheDocument();
      expect(guest.queryByText('Kai wins!')).toBeNull();
    },
    // Two 20s ceilings above, plus the race itself.
    60000,
  );
});
