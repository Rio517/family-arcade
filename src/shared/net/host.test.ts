import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameHost } from './host';
import { CONNECTION_SERVICE } from './peer';

// A minimal in-memory PeerJS stand-in, in the style of peer.test.ts: tests
// drive it by emitting the events a real broker / data channel would.
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
    opens() {
      this.open = true;
      this.emit('open');
    }
  }

  const fakePeers: FakePeer[] = [];
  class FakePeer extends FakeEmitter {
    id: string | undefined;
    /** What `new Peer` was handed: broker host, port, path and ICE servers. */
    options: unknown;
    destroyed = false;
    constructor(...args: unknown[]) {
      super();
      this.id = typeof args[0] === 'string' ? args[0] : undefined;
      this.options = typeof args[0] === 'string' ? args[1] : args[0];
      fakePeers.push(this);
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

function hosted(maxGuests?: number) {
  const opened: string[] = [];
  const closed: string[] = [];
  const statuses: string[] = [];
  const messages: Array<[string, Msg]> = [];
  const host = new GameHost<Msg>(
    {
      onStatus: (s) => statuses.push(s),
      onGuestOpen: (id) => opened.push(id),
      onGuestClose: (id) => closed.push(id),
      onMessage: (id, m) => messages.push([id, m]),
    },
    { prefix: 'test-v1-', isMessage: isMsg, maxGuests },
  );
  host.host('KXQZ');
  const peer = fakePeers[fakePeers.length - 1];
  peer.emit('open');
  const join = (id: string) => {
    const conn = new FakeDataConnection(id);
    peer.emit('connection', conn);
    conn.opens();
    return conn;
  };
  return { host, peer, opened, closed, statuses, messages, join };
}

describe('GameHost', () => {
  beforeEach(() => {
    fakePeers.length = 0;
  });

  it('registers the same broker id GameConnection.host would', () => {
    hosted();
    expect(fakePeers[0].id).toBe('test-v1-KXQZ');
  });

  it('registers with the arcade’s own connection service', () => {
    hosted();
    expect(fakePeers[0].options).toBe(CONNECTION_SERVICE);
  });

  it('accepts three guests and tells the game about each', () => {
    const { host, opened, join } = hosted();
    join('a');
    join('b');
    join('c');
    expect(opened).toEqual(['a', 'b', 'c']);
    expect(host.guests()).toEqual(['a', 'b', 'c']);
  });

  it('turns a fourth guest away', () => {
    const { host, opened, messages, join } = hosted();
    join('a');
    join('b');
    join('c');
    const fourth = join('d');
    fourth.emit('data', { t: 'forged' });
    expect(fourth.closed).toBe(true);
    expect(opened).not.toContain('d');
    expect(messages).toHaveLength(0);
    expect(host.guests()).toEqual(['a', 'b', 'c']);
    expect(host.send('d', { t: 'x' })).toBe(false);
  });

  it('honours a smaller maxGuests', () => {
    const { host, join } = hosted(1);
    join('a');
    expect(join('b').closed).toBe(true);
    expect(host.guests()).toEqual(['a']);
  });

  it('send reaches one guest and broadcast reaches all', () => {
    const { host, join } = hosted();
    const a = join('a');
    const b = join('b');
    expect(host.send('a', { t: 'one' })).toBe(true);
    expect(a.sent).toEqual([{ t: 'one' }]);
    expect(b.sent).toEqual([]);
    expect(host.broadcast({ t: 'all' })).toBe(2);
    expect(a.sent).toEqual([{ t: 'one' }, { t: 'all' }]);
    expect(b.sent).toEqual([{ t: 'all' }]);
  });

  it('a guest closing fires onGuestClose and frees the seat', () => {
    const { host, closed, join } = hosted();
    const a = join('a');
    join('b');
    join('c');
    a.close();
    expect(closed).toEqual(['a']);
    expect(host.guests()).toEqual(['b', 'c']);
    join('d');
    expect(host.guests()).toEqual(['b', 'c', 'd']);
  });

  it('a reconnect with the same id replaces the old channel', () => {
    const { host, closed, opened, join } = hosted();
    const old = join('a');
    const fresh = join('a');
    expect(old.closed).toBe(true);
    expect(opened).toEqual(['a', 'a']); // synced again on the new channel
    expect(closed).toEqual([]); // a swap is not a departure
    expect(host.guests()).toEqual(['a']);
    host.send('a', { t: 'hi' });
    expect(fresh.sent).toEqual([{ t: 'hi' }]);
    expect(old.sent).toEqual([]);
    // The stale channel's late events do nothing.
    old.emit('data', { t: 'late' });
    old.emit('close');
    expect(host.guests()).toEqual(['a']);
  });

  it('a reconnect works even when the table is full', () => {
    const { host, join } = hosted();
    join('a');
    join('b');
    join('c');
    const back = join('b');
    expect(back.closed).toBe(false);
    expect(host.guests().sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops invalid messages and tags valid ones with their guest', () => {
    const { messages, join } = hosted();
    const a = join('a');
    a.emit('data', 'nonsense');
    a.emit('data', null);
    a.emit('data', { t: 'ok' });
    expect(messages).toEqual([['a', { t: 'ok' }]]);
  });

  it('kick closes one guest and reports it', () => {
    const { host, closed, join } = hosted();
    const a = join('a');
    join('b');
    host.kick('a');
    expect(a.closed).toBe(true);
    expect(closed).toEqual(['a']);
    expect(host.guests()).toEqual(['b']);
  });

  it('destroy closes every guest and the broker peer', () => {
    const { host, peer, closed, join } = hosted();
    const a = join('a');
    const b = join('b');
    host.destroy();
    expect(a.closed).toBe(true);
    expect(b.closed).toBe(true);
    expect(peer.destroyed).toBe(true);
    expect(closed).toEqual([]);
    expect(host.guests()).toEqual([]);
  });

  it('reclaims its own id when the broker still holds the old registration', () => {
    vi.useFakeTimers();
    try {
      const statuses: string[] = [];
      const host = new GameHost<Msg>(
        { onStatus: (s) => statuses.push(s), onGuestOpen: () => {}, onGuestClose: () => {}, onMessage: () => {} },
        { prefix: 'test-v1-', isMessage: isMsg },
      );
      host.host('KXQZ');
      const first = fakePeers[0];
      first.emit('error', { type: 'unavailable-id' });
      expect(first.destroyed).toBe(true);
      vi.advanceTimersByTime(2_500);
      expect(fakePeers).toHaveLength(2);
      expect(fakePeers[1].id).toBe('test-v1-KXQZ');
      expect(statuses).not.toContain('error');
      vi.advanceTimersByTime(21_000);
      fakePeers[1].emit('error', { type: 'unavailable-id' });
      expect(statuses[statuses.length - 1]).toBe('error');
      host.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
