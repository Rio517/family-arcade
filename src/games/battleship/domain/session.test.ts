import { describe, expect, it } from 'vitest';
import {
  applyMessage,
  chooseSkin,
  confirmReady,
  connectHandshake,
  createSession,
  fireAt,
  isMyTurn,
  phase,
  proposeRematch,
  releaseUnansweredFire,
  setFleet,
  toPlacing,
  type SessionState,
} from './session';
import { autoPlace, shipCells } from './board';
import { hasStarted, winner } from './engine';
import type { Message } from './protocol';
import { seededRng } from '@test/helpers';
import type { Coord, Fleet, ShotEvent, Side } from './types';

const HOST_FIRST = () => 0.1; // rng < 0.5 → start.first = 'host'

function newSession(side: Side): SessionState {
  return createSession(side, 'CODE', side === 'host' ? 'Rio' : 'Kid', 'aqua');
}

function mkShot(by: Side, row: number, col: number, hit = false): ShotEvent {
  return { type: 'shot', by, row, col, hit, sunk: null, allSunk: false };
}

// ── Unit transitions ─────────────────────────────────────────────────────────

describe('createSession', () => {
  it('remembers which ticket sat down, so the result can credit the right player', () => {
    expect(createSession('host', 'CODE', 'Rio', 'aqua', 'u-rio').seatedUserId).toBe('u-rio');
  });
  it('seats nobody by default (a captain with no ticket, e.g. an old save)', () => {
    expect(newSession('guest').seatedUserId).toBeNull();
  });
});

describe('setup transitions', () => {
  it('starts in the fleet phase', () => {
    expect(phase(newSession('host'))).toBe('fleet');
  });
  it('chooseSkin / toPlacing / setFleet advance the wizard', () => {
    let s = chooseSkin(newSession('host'), 'ember');
    expect(s.mySkinId).toBe('ember');
    s = toPlacing(s);
    expect(phase(s)).toBe('placing');
    s = setFleet(s, autoPlace(seededRng(1)));
    expect(s.myFleet).toHaveLength(5);
  });
});

describe('confirmReady', () => {
  it('marks ready, moves to waiting, and announces readiness', () => {
    const out = confirmReady(newSession('guest'));
    expect(out.state.myReady).toBe(true);
    expect(phase(out.state)).toBe('waiting');
    expect(out.outgoing).toContainEqual({ t: 'ready', ready: true });
  });

  it('host authors the opening move once both are ready', () => {
    const hostReady: SessionState = { ...newSession('host'), oppReady: true };
    const out = confirmReady(hostReady, HOST_FIRST);
    expect(hasStarted(out.state.log)).toBe(true);
    expect(out.outgoing).toContainEqual({ t: 'start', first: 'host' });
  });

  it('guest never authors the opening move', () => {
    const guestReady: SessionState = { ...newSession('guest'), oppReady: true };
    const out = confirmReady(guestReady, HOST_FIRST);
    expect(hasStarted(out.state.log)).toBe(false);
  });
});

describe('fireAt', () => {
  const started: SessionState = { ...newSession('host'), log: [{ type: 'start', first: 'host' }] };

  it('locks the board and emits a fire on a legal shot', () => {
    const out = fireAt(started, { row: 2, col: 3 });
    expect(out.state.pendingFire).toEqual({ row: 2, col: 3 });
    expect(out.outgoing).toContainEqual({ t: 'fire', row: 2, col: 3 });
  });

  it('is a no-op when it is not my turn', () => {
    const notMyTurn: SessionState = { ...started, log: [{ type: 'start', first: 'guest' }] };
    const out = fireAt(notMyTurn, { row: 0, col: 0 });
    expect(out.state.pendingFire).toBeNull();
    expect(out.outgoing).toEqual([]);
  });

  it('is a no-op while a shot is already pending', () => {
    const out = fireAt({ ...started, pendingFire: { row: 1, col: 1 } }, { row: 2, col: 2 });
    expect(out.outgoing).toEqual([]);
  });
});

describe('applyMessage', () => {
  it('rejects a peer on a mismatched protocol version', () => {
    const out = applyMessage(newSession('host'), { t: 'hello', v: 999, side: 'guest', name: 'X', skinId: 'aqua' });
    expect(out.error).toBeTruthy();
    expect(out.state.oppName).toBeNull();
  });

  it('records a valid hello and clamps a long name', () => {
    const out = applyMessage(newSession('host'), { t: 'hello', v: 1, side: 'guest', name: 'x'.repeat(50), skinId: 'ember' });
    expect(out.state.oppName).toHaveLength(24);
    expect(out.state.oppSkinId).toBe('ember');
  });

  it('host authors start when the guest reports ready', () => {
    const hostReady: SessionState = { ...newSession('host'), myReady: true };
    const out = applyMessage(hostReady, { t: 'ready', ready: true }, HOST_FIRST);
    expect(out.state.oppReady).toBe(true);
    expect(hasStarted(out.state.log)).toBe(true);
    expect(out.outgoing).toContainEqual({ t: 'start', first: 'host' });
  });

  it('guest adopts the host start event', () => {
    const out = applyMessage(newSession('guest'), { t: 'start', first: 'guest' });
    expect(hasStarted(out.state.log)).toBe(true);
    expect(phase(out.state)).toBe('battle');
  });

  it('a longer sync log supersedes ours', () => {
    const log = [{ type: 'start', first: 'host' } as const, mkShot('host', 1, 1)];
    const out = applyMessage(newSession('guest'), { t: 'sync', log, ready: true });
    expect(out.state.log).toEqual(log);
    expect(out.state.oppReady).toBe(true);
  });

  it('as defender, resolves an incoming fire and answers with a shot', () => {
    const fleet = autoPlace(seededRng(3));
    const defender: SessionState = { ...newSession('host'), myFleet: fleet, log: [{ type: 'start', first: 'guest' }] };
    const target = shipCells(fleet[0])[0]; // a known ship cell → a hit
    const out = applyMessage(defender, { t: 'fire', row: target.row, col: target.col });
    expect(out.outgoing.find((m) => m.t === 'shot')).toBeTruthy();
    expect(out.state.log.filter((e) => e.type === 'shot')).toHaveLength(1);
  });

  it('re-sends but does not re-append a duplicate fire', () => {
    const fleet = autoPlace(seededRng(4));
    const target = shipCells(fleet[0])[0];
    let s: SessionState = { ...newSession('host'), myFleet: fleet, log: [{ type: 'start', first: 'guest' }] };
    s = applyMessage(s, { t: 'fire', row: target.row, col: target.col }).state;
    const dup = applyMessage(s, { t: 'fire', row: target.row, col: target.col });
    expect(dup.outgoing.find((m) => m.t === 'shot')).toBeTruthy();
    expect(dup.state.log.filter((e) => e.type === 'shot')).toHaveLength(1);
  });
});

describe('connectHandshake', () => {
  it('sends hello + sync so a (re)connecting peer catches up', () => {
    const s: SessionState = { ...newSession('host'), myReady: true, log: [{ type: 'start', first: 'host' }] };
    const msgs = connectHandshake(s);
    expect(msgs.map((m) => m.t)).toEqual(['hello', 'sync']);
    expect(msgs.find((m) => m.t === 'sync')).toMatchObject({ log: s.log, ready: true, epoch: 0 });
  });

  it('carries the current epoch after a rematch', () => {
    const s: SessionState = { ...newSession('host'), epoch: 2 };
    expect(connectHandshake(s).find((m) => m.t === 'sync')).toMatchObject({ epoch: 2 });
  });
});

describe('start authoring via sync (reconnect deadlock regression)', () => {
  it('host authors start when the guest readiness arrives only via sync', () => {
    // Host readied first; the guest's live `ready` was lost on a drop and its
    // readiness reaches the host only in the reconnect sync.
    const hostReady: SessionState = { ...newSession('host'), myReady: true };
    const out = applyMessage(hostReady, { t: 'sync', log: [], ready: true }, HOST_FIRST);
    expect(out.state.oppReady).toBe(true);
    expect(hasStarted(out.state.log)).toBe(true);
    expect(out.outgoing).toContainEqual({ t: 'start', first: 'host' });
  });
});

describe('finish detection', () => {
  const overLog = [
    { type: 'start', first: 'host' } as const,
    { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: 'destroyer', allSunk: true } as const,
  ];

  it('does not re-report a finish after the game is already over', () => {
    const over: SessionState = { ...newSession('guest'), myFleet: autoPlace(seededRng(1)), log: overLog };
    expect(applyMessage(over, { t: 'sync', log: overLog, ready: true }).finished).toBeUndefined();
    expect(applyMessage(over, { t: 'shot', event: mkShot('guest', 5, 5) }).finished).toBeUndefined();
  });

  it('reports finish when the winning shot arrives via sync (reconnect race)', () => {
    const loser: SessionState = { ...newSession('guest'), myFleet: autoPlace(seededRng(2)), log: [{ type: 'start', first: 'host' }] };
    const out = applyMessage(loser, { t: 'sync', log: overLog, ready: true });
    expect(out.finished).toBeDefined();
    expect(out.finished?.won).toBe(false); // host sank everything; I'm the guest
  });
});

describe('fire lock (pendingFire)', () => {
  it('clears the lock when the matching shot arrives', () => {
    const s: SessionState = { ...newSession('host'), log: [{ type: 'start', first: 'host' }], pendingFire: { row: 1, col: 1 } };
    const out = applyMessage(s, { t: 'shot', event: mkShot('host', 1, 1) });
    expect(out.state.pendingFire).toBeNull();
    expect(out.state.log.filter((e) => e.type === 'shot')).toHaveLength(1);
  });

  it('clears the lock on a duplicate shot without re-appending', () => {
    const shot = mkShot('host', 1, 1);
    const s: SessionState = { ...newSession('host'), log: [{ type: 'start', first: 'host' }, shot], pendingFire: { row: 1, col: 1 } };
    const out = applyMessage(s, { t: 'shot', event: shot });
    expect(out.state.pendingFire).toBeNull();
    expect(out.state.log.filter((e) => e.type === 'shot')).toHaveLength(1);
  });

  it('fireAt is a no-op on an already-tried cell (even on my turn)', () => {
    const s: SessionState = {
      ...newSession('host'),
      log: [{ type: 'start', first: 'host' }, mkShot('host', 3, 3), mkShot('guest', 0, 0)],
    };
    expect(isMyTurn(s)).toBe(true);
    const out = fireAt(s, { row: 3, col: 3 });
    expect(out.outgoing).toEqual([]);
    expect(out.state.pendingFire).toBeNull();
  });

  it('releaseUnansweredFire releases only while it is still my turn', () => {
    const stillMine: SessionState = { ...newSession('host'), log: [{ type: 'start', first: 'host' }], pendingFire: { row: 2, col: 2 } };
    expect(releaseUnansweredFire(stillMine).pendingFire).toBeNull();

    const turnPassed: SessionState = { ...newSession('host'), log: [{ type: 'start', first: 'host' }, mkShot('host', 2, 2)], pendingFire: { row: 2, col: 2 } };
    expect(releaseUnansweredFire(turnPassed).pendingFire).toEqual({ row: 2, col: 2 });
  });
});

// ── Full-game harness (drives the REAL session functions) ────────────────────

class Peer {
  state: SessionState;
  private tried = new Set<string>();
  constructor(readonly side: Side, fleet: Fleet, private readonly targets: Coord[], private idx = 0) {
    this.state = setFleet(createSession(side, 'CODE', side, 'aqua'), fleet);
  }
  ready(rng: () => number): Message[] {
    const o = confirmReady(this.state, rng);
    this.state = o.state;
    return o.outgoing;
  }
  fireNext(): Message[] {
    if (!isMyTurn(this.state)) return [];
    let t = this.targets[this.idx++];
    while (t && this.tried.has(`${t.row},${t.col}`)) t = this.targets[this.idx++];
    if (!t) return [];
    this.tried.add(`${t.row},${t.col}`);
    const o = fireAt(this.state, t);
    this.state = o.state;
    return o.outgoing;
  }
  recv(msg: Message, rng: () => number): { out: Message[]; finished: boolean } {
    const o = applyMessage(this.state, msg, rng);
    this.state = o.state;
    return { out: o.outgoing, finished: !!o.finished };
  }
  handshake(): Message[] {
    return connectHandshake(this.state);
  }
}

function shuffledCells(rng: () => number): Coord[] {
  const cells: Coord[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push({ row: r, col: c });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

interface QueuedMsg {
  to: Side;
  msg: Message;
}
const other = (s: Side): Side => (s === 'host' ? 'guest' : 'host');

describe('full game via the real session module', () => {
  function run(opts: { down?: number; up?: number } = {}) {
    const rng = HOST_FIRST;
    const host = new Peer('host', autoPlace(seededRng(1)), shuffledCells(seededRng(11)));
    const guest = new Peer('guest', autoPlace(seededRng(2)), shuffledCells(seededRng(22)));
    const peers: Record<Side, Peer> = { host, guest };
    const finishes: Record<Side, boolean> = { host: false, guest: false };

    let queue: QueuedMsg[] = [];
    const emit = (from: Side, msgs: Message[]) => {
      for (const msg of msgs) queue.push({ to: other(from), msg });
    };
    const deliver = (q: QueuedMsg, into: QueuedMsg[]) => {
      const { out, finished } = peers[q.to].recv(q.msg, rng);
      if (finished) finishes[q.to] = true;
      for (const msg of out) into.push({ to: other(q.to), msg });
    };

    emit('host', host.ready(rng));
    emit('guest', guest.ready(rng));

    let connected = true;
    let step = 0;
    let safety = 6000;
    while (winner(host.state.log) === null && winner(guest.state.log) === null && safety-- > 0) {
      step++;
      if (opts.down !== undefined && step === opts.down) connected = false;
      if (opts.up !== undefined && step === opts.up) {
        connected = true;
        for (let i = 0; i < 2; i++) {
          for (const m of guest.handshake()) host.recv(m, rng);
          for (const m of host.handshake()) guest.recv(m, rng);
        }
      }
      const next: QueuedMsg[] = [];
      if (connected) for (const q of queue) deliver(q, next);
      queue = connected ? next : [];
      emit('host', host.fireNext());
      emit('guest', guest.fireNext());
    }

    // Drain in-flight messages so the finishing shot reaches both peers.
    let flush = 200;
    while (queue.length && flush-- > 0) {
      const next: QueuedMsg[] = [];
      for (const q of queue) deliver(q, next);
      queue = next;
    }
    return { host, guest, finishes, safety };
  }

  it('plays to a correct winner with both logs identical', () => {
    const { host, guest, finishes, safety } = run();
    expect(safety).toBeGreaterThan(0);
    const w = winner(host.state.log);
    expect(w).not.toBeNull();
    expect(winner(guest.state.log)).toBe(w);
    expect(host.state.log).toEqual(guest.state.log);
    // Each side reported its finish exactly once (win for one, loss for other).
    expect(finishes.host).toBe(true);
    expect(finishes.guest).toBe(true);
  });

  it('survives a mid-game disconnect and resyncs to the same finished game', () => {
    const { host, guest, safety } = run({ down: 40, up: 60 });
    expect(safety).toBeGreaterThan(0);
    expect(winner(host.state.log)).not.toBeNull();
    expect(winner(host.state.log)).toBe(winner(guest.state.log));
    expect(host.state.log).toEqual(guest.state.log);
  });
});

describe('rematch', () => {
  const finishedLog: SessionState['log'] = [
    { type: 'start', first: 'host' },
    { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: 'destroyer', allSunk: true },
  ];
  const finished: SessionState = {
    ...newSession('host'),
    log: finishedLog,
    myReady: true,
    oppReady: true,
  };

  it('restarts once both sides propose, after a game is over', () => {
    expect(phase(finished)).toBe('over');
    const mine = proposeRematch(finished); // I propose — not yet restarted
    expect(phase(mine.state)).toBe('over');
    const both = applyMessage(mine.state, { t: 'rematch' }); // opponent proposes → restart
    expect(phase(both.state)).toBe('placing');
    expect(both.state.log).toEqual([]);
    expect(both.state.myReady).toBe(false);
  });

  it('bumps the epoch on every rematch reset', () => {
    const restarted = applyMessage(proposeRematch(finished).state, { t: 'rematch' }).state;
    expect(restarted.epoch).toBe(1);
  });

  describe('game epoch vs stale syncs (resurrection regression)', () => {
    const restarted: SessionState = applyMessage(proposeRematch(finished).state, { t: 'rematch' }).state;

    it('a rematch reset survives a stale sync carrying the old finished log', () => {
      expect(restarted.epoch).toBe(1);
      // The peer's pre-rematch sync (epoch 0 — or missing entirely on an old
      // app version) still carries the finished log. Without epochs its longer
      // log would win reconciliation and resurrect the finished game.
      const stale = applyMessage(restarted, { t: 'sync', log: finishedLog, ready: true });
      expect(stale.state.log).toEqual([]);
      expect(stale.state.epoch).toBe(1);
      expect(phase(stale.state)).toBe('placing');
      expect(stale.finished).toBeUndefined();
      // ...and we answer with our own sync so the lagging peer catches up.
      expect(stale.outgoing).toContainEqual({ t: 'sync', log: [], ready: false, epoch: 1 });
    });

    it('an explicit lower epoch is ignored the same way', () => {
      const stale = applyMessage(restarted, { t: 'sync', log: finishedLog, ready: true, epoch: 0 });
      expect(stale.state.log).toEqual([]);
      expect(stale.state.epoch).toBe(1);
    });

    it('adopts log and epoch wholesale from a higher-epoch sync', () => {
      // We missed the rematch: still sitting on the finished game at epoch 0
      // while the peer already reset to epoch 1 with a fresh empty log.
      const behind: SessionState = { ...finished, myFleet: autoPlace(seededRng(5)), iWantRematch: true };
      const out = applyMessage(behind, { t: 'sync', log: [], ready: false, epoch: 1 });
      expect(out.state.epoch).toBe(1);
      expect(out.state.log).toEqual([]);
      expect(phase(out.state)).toBe('placing');
      // Previous-game state is cleared exactly like a local rematch reset.
      expect(out.state.myFleet).toEqual([]);
      expect(out.state.myReady).toBe(false);
      expect(out.state.iWantRematch).toBe(false);
      expect(out.finished).toBeUndefined();
    });
  });
});

describe('security: forged shot events', () => {
  it('ignores a shot not authored by my own side (no self-declared win)', () => {
    // An honest `shot` is the result of MY fire, sent back authored by me. A
    // hostile peer forging the opponent as author + allSunk would otherwise win.
    const host = newSession('host');
    const forged: ShotEvent = { type: 'shot', by: 'guest', row: 0, col: 0, hit: true, sunk: null, allSunk: true };
    const out = applyMessage(host, { t: 'shot', event: forged });
    expect(out.state.log).toHaveLength(0); // refused, not appended
    expect(winner(out.state.log)).toBeNull();
    expect(phase(out.state)).not.toBe('over');
  });

  it('still accepts an honestly-authored shot (my own side)', () => {
    const host = newSession('host');
    const honest = mkShot('host', 2, 3, true);
    const out = applyMessage(host, { t: 'shot', event: honest });
    expect(out.state.log).toHaveLength(1);
  });
});
