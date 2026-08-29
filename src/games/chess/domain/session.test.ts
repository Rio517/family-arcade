import { describe, expect, it } from 'vitest';
import {
  applyMessage,
  canIMove,
  connectHandshake,
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
import { isChessMessage } from './protocol';
import type { Ply, Square } from './types';

const sq = (name: string): Square => ({ row: 8 - Number(name[1]), col: 'abcdefgh'.indexOf(name[0]) });
const ply = (from: string, to: string, promotion?: Ply['promotion']): Ply => ({
  from: sq(from),
  to: sq(to),
  ...(promotion ? { promotion } : {}),
});

/** Two tickets at a same-device table. */
const alice = { name: 'Alice', userId: 'u-alice' };
const bob = { name: 'Bob', userId: 'u-bob' };
/** A chair holding no ticket — a bot, or nobody at all. */
const unticketed = (name: string) => ({ name, userId: null });

describe('local session', () => {
  it('lets either colour move on its turn, alternating', () => {
    let s = createLocalSession(alice, bob);
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
    const s = createLocalSession(alice, bob);
    const out = makeMove(s, ply('e2', 'e5')); // pawn can't jump three
    expect(out.state.log).toHaveLength(0);
  });

  it('reports a finish on checkmate (fool\'s mate)', () => {
    let s = createLocalSession(alice, bob);
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

  it('the finish names both chairs — tickets and names — so the page never re-reads the roster', () => {
    let s = createLocalSession(alice, bob);
    s = makeMove(s, ply('f2', 'f3')).state;
    s = makeMove(s, ply('e7', 'e5')).state;
    s = makeMove(s, ply('g2', 'g4')).state;
    const out = makeMove(s, ply('d8', 'h4'));
    expect(out.finished).toMatchObject({
      winner: 'b',
      whiteUserId: 'u-alice',
      blackUserId: 'u-bob',
      whiteName: 'Alice',
      blackName: 'Bob',
      seatedUserId: null, // same device: nobody "sat down at this device" online
    });
  });

  it('a chair with no ticket finishes as null, never as a made-up id', () => {
    let s = createLocalSession(alice, unticketed('Bot'));
    expect(s.whiteUserId).toBe('u-alice');
    expect(s.blackUserId).toBeNull();
    s = makeMove(s, ply('f2', 'f3')).state;
    s = makeMove(s, ply('e7', 'e5')).state;
    s = makeMove(s, ply('g2', 'g4')).state;
    const out = makeMove(s, ply('d8', 'h4'));
    expect(out.finished).toMatchObject({ whiteUserId: 'u-alice', blackUserId: null, blackName: 'Bot' });
  });

  it('rematch resets the board immediately', () => {
    let s = createLocalSession(alice, bob);
    s = makeMove(s, ply('e2', 'e4')).state;
    s = proposeRematch(s).state;
    expect(s.log).toHaveLength(0);
  });

  it('takes back the last move (and no-ops on an empty log)', () => {
    let s = createLocalSession(alice, bob);
    expect(undoMove(s).state.log).toHaveLength(0); // nothing to undo

    s = makeMove(s, ply('e2', 'e4')).state;
    s = makeMove(s, ply('e7', 'e5')).state;
    expect(turnColor(s)).toBe('w');

    s = undoMove(s).state;
    expect(s.log).toHaveLength(1);
    expect(turnColor(s)).toBe('b'); // back to Black's turn
  });

  it('rewinds to an earlier move via the log', () => {
    let s = createLocalSession(alice, bob);
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
    const local = createLocalSession(unticketed('A'), unticketed('B'));
    expect(makeMove(local, ply('e2', 'e4')).outgoing).toEqual([]);
  });
});

describe('online session — the host picks a colour', () => {
  it('host=White by default, and the guest takes the other colour', () => {
    expect(createOnlineSession('host', 'ABCD', 'Host').myColor).toBe('w');
    expect(createOnlineSession('guest', 'ABCD', 'Guest').myColor).toBe('b');
    expect(createOnlineSession('host', 'ABCD', 'Host', 'w').myColor).toBe('w');
    expect(createOnlineSession('guest', 'ABCD', 'Guest', 'w').myColor).toBe('b');
  });

  it('a host who picks Black hands White to the guest', () => {
    const host = createOnlineSession('host', 'ABCD', 'Host', 'b');
    const guest = createOnlineSession('guest', 'ABCD', 'Guest', 'b');
    expect(host.myColor).toBe('b');
    expect(guest.myColor).toBe('w');
    // Turn ownership follows the colour, not the side of the connection.
    expect(canIMove(host)).toBe(false);
    expect(canIMove(guest)).toBe(true);
    const afterWhite = makeMove(guest, ply('e2', 'e4')).state;
    expect(canIMove(afterWhite)).toBe(false);
  });

  it('no session remembers a ticket until someone sits down', () => {
    expect(createOnlineSession('host', 'ABCD', 'Host').seatedUserId).toBeNull();
    expect(createOnlineSession('guest', 'ABCD', 'Guest', 'b').seatedUserId).toBeNull();
    expect(createLocalSession(unticketed('A'), unticketed('B')).seatedUserId).toBeNull();
  });

  it('online sessions have no chair tickets — the seat is the one ticket at this device', () => {
    const host = createOnlineSession('host', 'ABCD', 'Host');
    expect(host.whiteUserId).toBeNull();
    expect(host.blackUserId).toBeNull();
  });

  it('an online finish carries the seated ticket (captured at the start), not the chairs', () => {
    // The host sat down as u-rio, playing White; the guest is Kai. Scholar's
    // mate arrives via sync and the finish says who to credit.
    let host: SessionState = { ...createOnlineSession('host', 'ABCD', 'Rio'), seatedUserId: 'u-rio' };
    host = applyMessage(host, { t: 'hello', v: 1, side: 'guest', name: 'Kai' }).state;
    const mate: Ply[] = [
      ply('e2', 'e4'), ply('e7', 'e5'),
      ply('f1', 'c4'), ply('b8', 'c6'),
      ply('d1', 'h5'), ply('g8', 'f6'),
      ply('h5', 'f7'),
    ];
    const out = applyMessage(host, { t: 'sync', log: mate, wantRematch: false });
    expect(out.finished).toMatchObject({
      iWon: true,
      seatedUserId: 'u-rio',
      whiteUserId: null,
      blackUserId: null,
      whiteName: 'Rio',
      blackName: 'Kai',
      opponent: 'Kai',
    });
  });

  it('an online finish as Black still names the colours the right way round', () => {
    const guest = { ...createOnlineSession('guest', 'ABCD', 'Kai'), seatedUserId: 'u-kai', oppName: 'Rio' };
    const mate: Ply[] = [ply('f2', 'f3'), ply('e7', 'e5'), ply('g2', 'g4'), ply('d8', 'h4')];
    const out = applyMessage(guest, { t: 'sync', log: mate, wantRematch: false });
    expect(out.finished).toMatchObject({ iWon: true, seatedUserId: 'u-kai', whiteName: 'Rio', blackName: 'Kai' });
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

  it('a rematch cannot reset a game still in progress (guard parity with battleship)', () => {
    let host = createOnlineSession('host', 'ABCD', 'Host');
    host = makeMove(host, ply('e2', 'e4')).state;
    // A forged mid-game 'rematch' plus our own stale intent must never wipe a
    // live board — battleship guards this with winner(log) === null.
    let s = applyMessage(host, { t: 'rematch' }).state;
    s = proposeRematch(s).state;
    expect(s.log).toHaveLength(1);
    expect(s.epoch).toBe(0);
  });

  it('a newer-epoch sync carrying an illegal log is refused, not thrown', () => {
    const guest = createOnlineSession('guest', 'ABCD', 'Guest');
    // Shape-valid (in-range squares) but illegal to replay: e2 → e2. The
    // equal-epoch branch already defends this; the adopt-newer-epoch branch
    // must too, or a hostile peer white-screens the victim via a fake epoch.
    const evil = { t: 'sync' as const, log: [ply('e2', 'e2')], wantRematch: false, epoch: 3 };
    expect(() => applyMessage(guest, evil)).not.toThrow();
    const out = applyMessage(guest, evil);
    expect(out.state.epoch).toBe(0); // nothing adopted
    expect(out.state.log).toHaveLength(0);
    // The sender is answered with our own (valid) sync so an honest laggard
    // still converges.
    expect(out.outgoing.some((m) => m.t === 'sync')).toBe(true);
  });

  it('reports the code and opponent name with the finish, for the profile history', () => {
    let guest = createOnlineSession('guest', 'ABCD', 'Guest');
    guest = applyMessage(guest, { t: 'hello', v: 1, side: 'host', name: 'Dad' }).state;
    // Scholar's mate arrives whole via sync; the finish must say who and where.
    const mate: Ply[] = [
      ply('e2', 'e4'), ply('e7', 'e5'),
      ply('f1', 'c4'), ply('b8', 'c6'),
      ply('d1', 'h5'), ply('g8', 'f6'),
      ply('h5', 'f7'),
    ];
    const out = applyMessage(guest, { t: 'sync', log: mate, wantRematch: false });
    expect(out.finished?.code).toBe('ABCD');
    expect(out.finished?.opponent).toBe('Dad');
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
  it('resets only once both sides propose, and only on a finished game', () => {
    // Scholar's mate — the game must actually be over for a reset to happen
    // (a mid-game rematch is guarded; see the guard-parity test above).
    const mate: Ply[] = [
      ply('e2', 'e4'), ply('e7', 'e5'),
      ply('f1', 'c4'), ply('b8', 'c6'),
      ply('d1', 'h5'), ply('g8', 'f6'),
      ply('h5', 'f7'),
    ];
    let host: SessionState = { ...createOnlineSession('host', 'ABCD', 'Host'), log: mate };

    host = proposeRematch(host).state;
    expect(host.iWantRematch).toBe(true);
    expect(host.log).toHaveLength(7); // not reset yet

    host = applyMessage(host, { t: 'rematch' }).state; // opponent also proposes
    expect(host.log).toHaveLength(0);
    expect(host.iWantRematch).toBe(false);
  });
});

describe('rematch epochs — a stale sync cannot un-win a rematch', () => {
  // Scholar's mate: a finished game's log (White wins on move 4).
  const FINISHED_LOG: Ply[] = [
    ply('e2', 'e4'), ply('e7', 'e5'),
    ply('f1', 'c4'), ply('b8', 'c6'),
    ply('d1', 'h5'), ply('g8', 'f6'),
    ply('h5', 'f7'),
  ];

  /** A host session sitting on the finished game, ready to rematch. */
  function finishedHost(): SessionState {
    return { ...createOnlineSession('host', 'ABCD', 'Host'), log: FINISHED_LOG };
  }

  /** Run the full two-sided rematch (I propose, the peer's rematch arrives). */
  function afterRematch(): SessionState {
    let s = proposeRematch(finishedHost()).state;
    s = applyMessage(s, { t: 'rematch' }).state;
    return s;
  }

  it('the rematch reset bumps the epoch and clears the log', () => {
    const s = afterRematch();
    expect(s.log).toHaveLength(0);
    expect(s.epoch).toBe(1);
    expect(phase(s)).toBe('play');
  });

  it('ignores a stale old-epoch sync carrying the finished log (and re-syncs the laggard)', () => {
    const s = afterRematch();
    // The peer's pre-rematch sync arrives late, carrying the finished game.
    const out = applyMessage(s, { t: 'sync', log: FINISHED_LOG, wantRematch: false, epoch: 0 });
    expect(out.state.log).toHaveLength(0); // the rematch survives
    expect(out.state.epoch).toBe(1);
    expect(phase(out.state)).toBe('play'); // not "un-won" back to game over
    expect(out.finished).toBeUndefined();
    // And we answer with our own sync so the stale peer catches up.
    expect(out.outgoing).toEqual([{ t: 'sync', log: [], epoch: 1, wantRematch: false }]);
  });

  it('treats a sync without an epoch (older build) as epoch 0 — still stale', () => {
    const s = afterRematch();
    const out = applyMessage(s, { t: 'sync', log: FINISHED_LOG, wantRematch: false });
    expect(out.state.log).toHaveLength(0);
    expect(out.state.epoch).toBe(1);
  });

  it('adopts the peer log AND epoch wholesale when theirs is newer (catch-up)', () => {
    // Guest still holds the finished game at epoch 0 (it missed the reset,
    // and had itself asked for the rematch).
    const guest: SessionState = {
      ...createOnlineSession('guest', 'ABCD', 'Guest'),
      log: FINISHED_LOG,
      iWantRematch: true,
    };
    const out = applyMessage(guest, { t: 'sync', log: [], wantRematch: false, epoch: 1 });
    expect(out.state.log).toHaveLength(0); // shorter, but the newer game wins
    expect(out.state.epoch).toBe(1);
    expect(out.state.iWantRematch).toBe(false); // stale intent cleared
    expect(phase(out.state)).toBe('play');
  });

  it('equal epochs still reconcile by longer-log-wins', () => {
    const guest = createOnlineSession('guest', 'ABCD', 'Guest');
    const out = applyMessage(guest, { t: 'sync', log: [ply('e2', 'e4')], wantRematch: false, epoch: 0 });
    expect(out.state.log).toEqual([ply('e2', 'e4')]);
  });

  it('connectHandshake syncs carry my epoch', () => {
    const s = afterRematch();
    const sync = connectHandshake(s).find((m) => m.t === 'sync');
    expect(sync).toEqual({ t: 'sync', log: [], epoch: 1, wantRematch: false });
  });
});

describe('sync epoch validation (isChessMessage)', () => {
  it('accepts a sync without an epoch (deployed pre-epoch builds)', () => {
    expect(isChessMessage({ t: 'sync', log: [], wantRematch: false })).toBe(true);
  });

  it('accepts an in-range integer epoch', () => {
    expect(isChessMessage({ t: 'sync', log: [], wantRematch: false, epoch: 0 })).toBe(true);
    expect(isChessMessage({ t: 'sync', log: [], wantRematch: false, epoch: 42 })).toBe(true);
  });

  it('rejects negative, fractional, huge, or non-numeric epochs', () => {
    for (const epoch of [-1, 1.5, 1e6 + 1, '2', NaN, null]) {
      expect(isChessMessage({ t: 'sync', log: [], wantRematch: false, epoch })).toBe(false);
    }
  });
});

describe('security: forged sync log', () => {
  it('refuses a longer-but-illegal sync without crashing (no white-screen DoS)', () => {
    // reconcileLogs only checks the prefix; a peer can send a longer log of
    // illegal plies (a1->a1). Replaying it throws — the reducer must catch that
    // and refuse the sync rather than propagate the throw to the UI.
    const guest = createOnlineSession('guest', 'CODE', 'Bob');
    const illegal = Array.from({ length: 5 }, () => ply('a1', 'a1'));
    const run = () => applyMessage(guest, { t: 'sync', log: illegal, epoch: 0, wantRematch: false });
    expect(run).not.toThrow();
    const out = run();
    expect(out.state.log).toHaveLength(0); // bad log refused
    expect(out.outgoing.some((m) => m.t === 'sync')).toBe(true); // re-asserts ours
  });

  it('still adopts a legal longer sync', () => {
    // Sanity: the guard must not reject honest catch-up syncs.
    const guest = createOnlineSession('guest', 'CODE', 'Bob');
    const legal = [ply('e2', 'e4'), ply('e7', 'e5')];
    const out = applyMessage(guest, { t: 'sync', log: legal, epoch: 0, wantRematch: false });
    expect(out.state.log).toHaveLength(2);
  });
});
