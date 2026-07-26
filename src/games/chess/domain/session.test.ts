import { describe, expect, it } from 'vitest';
import {
  applyMessage,
  canIMove,
  createLocalSession,
  createOnlineSession,
  makeMove,
  phase,
  proposeRematch,
  turnColor,
  truncateLog,
  undoMove,
  type SessionState,
} from './session';
import type { Ply, Square } from './types';

const sq = (name: string): Square => ({ row: 8 - Number(name[1]), col: 'abcdefgh'.indexOf(name[0]) });
const ply = (from: string, to: string, promotion?: Ply['promotion']): Ply => ({
  from: sq(from),
  to: sq(to),
  ...(promotion ? { promotion } : {}),
});

describe('local session', () => {
  it('lets either colour move on its turn, alternating', () => {
    let s = createLocalSession('Alice', 'Bob');
    expect(turnColor(s)).toBe('w');
    expect(canIMove(s)).toBe(true);

    s = makeMove(s, ply('e2', 'e4')).state;
    expect(turnColor(s)).toBe('b');
    expect(canIMove(s)).toBe(true); // hotseat: the other player moves on the same device

    s = makeMove(s, ply('e7', 'e5')).state;
    expect(s.log).toHaveLength(2);
    expect(turnColor(s)).toBe('w');
  });

  it('ignores an illegal move', () => {
    const s = createLocalSession('Alice', 'Bob');
    const out = makeMove(s, ply('e2', 'e5')); // pawn can't jump three
    expect(out.state.log).toHaveLength(0);
  });

  it('reports a finish on checkmate (fool\'s mate)', () => {
    let s = createLocalSession('Alice', 'Bob');
    s = makeMove(s, ply('f2', 'f3')).state;
    s = makeMove(s, ply('e7', 'e5')).state;
    s = makeMove(s, ply('g2', 'g4')).state;
    const out = makeMove(s, ply('d8', 'h4'));
    expect(out.finished).toBeTruthy();
    expect(out.finished?.status).toBe('checkmate');
    expect(out.finished?.winner).toBe('b');
    expect(out.finished?.iWon).toBeNull(); // local: no "me"
    expect(phase(out.state)).toBe('over');
  });

  it('rematch resets the board immediately', () => {
    let s = createLocalSession('Alice', 'Bob');
    s = makeMove(s, ply('e2', 'e4')).state;
    s = proposeRematch(s).state;
    expect(s.log).toHaveLength(0);
  });

  it('takes back the last move (and no-ops on an empty log)', () => {
    let s = createLocalSession('Alice', 'Bob');
    expect(undoMove(s).state.log).toHaveLength(0); // nothing to undo

    s = makeMove(s, ply('e2', 'e4')).state;
    s = makeMove(s, ply('e7', 'e5')).state;
    expect(turnColor(s)).toBe('w');

    s = undoMove(s).state;
    expect(s.log).toHaveLength(1);
    expect(turnColor(s)).toBe('b'); // back to Black's turn
  });

  it('rewinds to an earlier move via the log', () => {
    let s = createLocalSession('Alice', 'Bob');
    s = makeMove(s, ply('e2', 'e4')).state;
    s = makeMove(s, ply('e7', 'e5')).state;
    s = makeMove(s, ply('g1', 'f3')).state;
    expect(s.log).toHaveLength(3);

    s = truncateLog(s, 1).state; // keep only 1.e4
    expect(s.log).toHaveLength(1);
    expect(turnColor(s)).toBe('b');
    expect(truncateLog(s, 1)).toEqual({ state: s, outgoing: [] }); // already there → no-op
  });
});

describe('undo is local-only', () => {
  it('is a no-op online (longer-log reconciliation would override it)', () => {
    let s = createOnlineSession('host', 'ABCD', 'Host');
    s = makeMove(s, ply('e2', 'e4')).state;
    const out = undoMove(s);
    expect(out.state.log).toHaveLength(1); // unchanged
    expect(out.outgoing).toEqual([]);
    expect(truncateLog(s, 0).state.log).toHaveLength(1); // truncate also local-only
  });
});

describe('online session — turn ownership', () => {
  it('host controls White and only moves on White\'s turn', () => {
    const host = createOnlineSession('host', 'ABCD', 'Host');
    expect(host.myColor).toBe('w');
    expect(canIMove(host)).toBe(true);

    // After White moves it's Black's turn; the host (White) may not move.
    const afterWhite = makeMove(host, ply('e2', 'e4')).state;
    expect(turnColor(afterWhite)).toBe('b');
    expect(canIMove(afterWhite)).toBe(false);
  });

  it('guest controls Black and cannot move first', () => {
    const guest = createOnlineSession('guest', 'ABCD', 'Guest');
    expect(guest.myColor).toBe('b');
    expect(canIMove(guest)).toBe(false); // White (host) moves first
  });

  it('emits a move message online but not locally', () => {
    const online = createOnlineSession('host', 'ABCD', 'Host');
    expect(makeMove(online, ply('e2', 'e4')).outgoing).toEqual([
      { t: 'move', ply: ply('e2', 'e4') },
    ]);
    const local = createLocalSession('A', 'B');
    expect(makeMove(local, ply('e2', 'e4')).outgoing).toEqual([]);
  });
});

describe('online session — sync between two peers', () => {
  function relay(to: SessionState, msgs: ReturnType<typeof makeMove>['outgoing']) {
    let s = to;
    for (const m of msgs) s = applyMessage(s, m).state;
    return s;
  }

  it('a full game stays in lock-step and both agree on the winner', () => {
    let host = createOnlineSession('host', 'ABCD', 'Host');
    let guest = createOnlineSession('guest', 'ABCD', 'Guest');

    // Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    const moves: Array<[('host' | 'guest'), Ply]> = [
      ['host', ply('e2', 'e4')],
      ['guest', ply('e7', 'e5')],
      ['host', ply('f1', 'c4')],
      ['guest', ply('b8', 'c6')],
      ['host', ply('d1', 'h5')],
      ['guest', ply('g8', 'f6')],
      ['host', ply('h5', 'f7')],
    ];

    for (const [who, p] of moves) {
      if (who === 'host') {
        const out = makeMove(host, p);
        host = out.state;
        guest = relay(guest, out.outgoing);
      } else {
        const out = makeMove(guest, p);
        guest = out.state;
        host = relay(host, out.outgoing);
      }
    }

    expect(host.log).toEqual(guest.log);
    expect(phase(host)).toBe('over');
    expect(phase(guest)).toBe('over');
    // Host is White and delivered mate; the winner is White on both peers.
    const hostFinish = applyMessage(guest, { t: 'sync', log: host.log, wantRematch: false });
    expect(hostFinish.finished?.winner).toBe('w');
  });

  it('resyncs a lagging peer via longer-log-wins', () => {
    let host = createOnlineSession('host', 'ABCD', 'Host');
    const guest = createOnlineSession('guest', 'ABCD', 'Guest');

    host = makeMove(host, ply('e2', 'e4')).state; // guest never received this
    // Guest reconnects and receives the host's sync with the longer log.
    const out = applyMessage(guest, { t: 'sync', log: host.log, wantRematch: false });
    expect(out.state.log).toEqual(host.log);
  });

  it('rejects a divergent (forged) log on sync', () => {
    const guest = createOnlineSession('guest', 'ABCD', 'Guest');
    const bogus = [ply('e2', 'e4'), ply('e7', 'e5')];
    // Guest already has its own single move that doesn't match the bogus prefix.
    const seeded: SessionState = { ...guest, log: [ply('d2', 'd4')] };
    const out = applyMessage(seeded, { t: 'sync', log: bogus, wantRematch: false });
    expect(out.state.log).toEqual([ply('d2', 'd4')]); // kept ours, rejected theirs
  });

  it('a mismatched protocol version surfaces an error', () => {
    const guest = createOnlineSession('guest', 'ABCD', 'Guest');
    const out = applyMessage(guest, { t: 'hello', v: 999, side: 'host', name: 'Host' });
    expect(out.error).toBeTruthy();
  });
});

describe('online rematch', () => {
  it('resets only once both sides propose', () => {
    let host = createOnlineSession('host', 'ABCD', 'Host');
    host = makeMove(host, ply('e2', 'e4')).state;

    host = proposeRematch(host).state;
    expect(host.iWantRematch).toBe(true);
    expect(host.log).toHaveLength(1); // not reset yet

    host = applyMessage(host, { t: 'rematch' }).state; // opponent also proposes
    expect(host.log).toHaveLength(0);
    expect(host.iWantRematch).toBe(false);
  });
});
