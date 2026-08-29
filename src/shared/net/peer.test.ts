import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameConnection, generateCode, normalizeCode } from './peer';
import { seededRng } from '@test/helpers';

// A minimal in-memory PeerJS stand-in: just enough surface for GameConnection
// to register, receive connections, and swap channels. Tests drive it by
// emitting the events a real broker / data channel would.
const { FakePeer, FakeDataConnection, fakePeers } = vi.hoisted(() => {
  class FakeEmitter {
    private handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    on(ev: string, fn: (...args: unknown[]) => void) {
      const list = this.handlers.get(ev) ?? [];
      list.push(fn);
      this.handlers.set(ev, list);
      return this;
    }
    emit(ev: string, ...args: unknown[]) {
      for (const fn of [...(this.handlers.get(ev) ?? [])]) fn(...args);
    }
    removeAllListeners() {
      this.handlers.clear();
    }
  }

  class FakeDataConnection extends FakeEmitter {
    open = false;
    closed = false;
    sent: unknown[] = [];
    constructor(public peer = 'anon') {
      super();
    }
    send(msg: unknown) {
      this.sent.push(msg);
    }
    close() {
      this.closed = true;
      this.open = false;
      this.emit('close');
    }
    /** Test helper: the data channel finishes opening. */
    opens() {
      this.open = true;
      this.emit('open');
    }
  }

  const fakePeers: FakePeer[] = [];
  class FakePeer extends FakeEmitter {
    id: string | undefined;
    destroyed = false;
    constructor(...args: unknown[]) {
      super();
      this.id = typeof args[0] === 'string' ? args[0] : undefined;
      fakePeers.push(this);
    }
    connect() {
      return new FakeDataConnection();
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
    }
  }

  return { FakePeer, FakeDataConnection, fakePeers };
});

vi.mock('peerjs', () => ({ default: FakePeer }));

type Msg = { t: string };
const isMsg = (v: unknown): v is Msg => typeof v === 'object' && v !== null && 't' in v;

function hostedConnection() {
  const statuses: string[] = [];
  const messages: Msg[] = [];
  const gc = new GameConnection<Msg>(
    { onStatus: (s) => statuses.push(s), onMessage: (m) => messages.push(m), onOpen: () => {} },
    { prefix: 'test-v1-', isMessage: isMsg },
  );
  gc.host('KXQZ');
  const peer = fakePeers[fakePeers.length - 1];
  peer.emit('open');
  return { gc, peer, statuses, messages };
}

describe('GameConnection — one guest at a time', () => {
  beforeEach(() => {
    fakePeers.length = 0;
  });

  it('refuses a stranger dialing in while a channel is live', () => {
    const { gc, peer, messages } = hostedConnection();

    // The real guest connects and the channel opens.
    const guest = new FakeDataConnection('guest-peer');
    peer.emit('connection', guest);
    guest.opens();

    // Someone else who learned the code dials the same id mid-game. They must
    // be refused — adopting them would hand over the game log (and the kids'
    // names in the hello) and kick the real guest off.
    const stranger = new FakeDataConnection('stranger-peer');
    peer.emit('connection', stranger);
    stranger.opens();
    stranger.emit('data', { t: 'forged' });

    expect(stranger.closed).toBe(true);
    expect(messages).toHaveLength(0); // nothing from the stranger got through
    // The real guest still holds the live channel.
    expect(gc.send({ t: 'ping' })).toBe(true);
    expect(guest.sent).toContainEqual({ t: 'ping' });
    expect(stranger.sent).toHaveLength(0);
  });

  it('still adopts the guest reconnecting after their channel closed', () => {
    const { gc, peer, statuses } = hostedConnection();

    const guest = new FakeDataConnection('guest-peer');
    peer.emit('connection', guest);
    guest.opens();

    // Wifi blip: the guest's channel closes, then they dial back in.
    guest.close();
    expect(statuses).toContain('reconnecting');
    const rejoined = new FakeDataConnection('guest-peer');
    peer.emit('connection', rejoined);
    rejoined.opens();

    expect(statuses.filter((s) => s === 'connected')).toHaveLength(2);
    expect(gc.send({ t: 'ping' })).toBe(true);
    expect(rejoined.sent).toContainEqual({ t: 'ping' });
  });
});

describe('generateCode', () => {
  it('produces a 4-character code from the safe alphabet', () => {
    const code = generateCode(seededRng(1));
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('never emits look-alike characters (I, O, L, 0, 1)', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(generateCode(seededRng(seed))).not.toMatch(/[IOL01]/);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(generateCode(seededRng(9))).toBe(generateCode(seededRng(9)));
  });
});

describe('normalizeCode', () => {
  it('uppercases, drops invalid characters, and caps at 4', () => {
    expect(normalizeCode('ab1cd')).toBe('ABCD'); // the ambiguous '1' is dropped
    expect(normalizeCode('  wxyz  ')).toBe('WXYZ');
    expect(normalizeCode('abcdef')).toBe('ABCD'); // capped to 4
    expect(normalizeCode('!!')).toBe('');
  });
});

describe('GameConnection — a reload must not strand the party', () => {
  beforeEach(() => {
    fakePeers.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const quiet = (statuses: string[]) => ({
    onStatus: (s: string) => statuses.push(s),
    onMessage: () => {},
    onOpen: () => {},
  });

  it('a guest keeps dialing for as long as it was told to — a cold-starting iPad takes a while', () => {
    const statuses: string[] = [];
    const gc = new GameConnection<Msg>(quiet(statuses), { prefix: 'test-v1-', isMessage: isMsg, dialTimeoutMs: 120_000 });
    gc.join('KXQZ');
    fakePeers[fakePeers.length - 1].emit('open'); // dials; the channel never opens
    vi.advanceTimersByTime(25_000); // past the default 20 s window
    expect(statuses).not.toContain('error');
    vi.advanceTimersByTime(100_000);
    expect(statuses).toContain('error');
  });

  it('a host reclaims its own id when the broker still holds the old registration', () => {
    const statuses: string[] = [];
    const gc = new GameConnection<Msg>(quiet(statuses), { prefix: 'test-v1-', isMessage: isMsg });
    gc.host('KXQZ');
    const first = fakePeers[fakePeers.length - 1];
    first.emit('error', { type: 'unavailable-id' });
    expect(statuses[statuses.length - 1]).toBe('reconnecting');
    expect(first.destroyed).toBe(true);
    vi.advanceTimersByTime(2_500);
    expect(fakePeers).toHaveLength(2);
    expect(fakePeers[1].id).toBe('test-v1-KXQZ');
    fakePeers[1].emit('open');
    expect(statuses).not.toContain('error');
    gc.destroy();
  });

  it('a code that stays taken past the deadline is still an error', () => {
    const statuses: string[] = [];
    const gc = new GameConnection<Msg>(quiet(statuses), { prefix: 'test-v1-', isMessage: isMsg });
    gc.host('KXQZ');
    vi.advanceTimersByTime(21_000);
    fakePeers[fakePeers.length - 1].emit('error', { type: 'unavailable-id' });
    expect(statuses[statuses.length - 1]).toBe('error');
  });
});
