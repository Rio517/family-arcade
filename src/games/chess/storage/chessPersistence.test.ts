import { beforeEach, describe, expect, it } from 'vitest';
import {
  chessToStored,
  loadChessGame,
  loadLocalChessGame,
  loadResumableChessGame,
  saveChessGame,
  saveLocalChessGame,
  storedToChess,
  storedToLocalChess,
  sweepStaleChessSessions,
  type StoredChessGame,
  type StoredLocalChess,
} from './chessPersistence';
import { createLocalSession, createOnlineSession } from '@games/chess/domain/session';
import type { Ply, Square } from '@games/chess/domain/types';

const sq = (name: string): Square => ({ row: 8 - Number(name[1]), col: 'abcdefgh'.indexOf(name[0]) });
const ply = (from: string, to: string): Ply => ({ from: sq(from), to: sq(to) });

/** Fool's mate — a log whose replay is checkmate (a finished game). */
const FINISHED_LOG: Ply[] = [
  ply('f2', 'f3'), ply('e7', 'e5'), ply('g2', 'g4'), ply('d8', 'h4'),
];

/** A game that's clearly still going. */
const LIVE_LOG: Ply[] = [ply('e2', 'e4')];

function stored(code: string, log: Ply[], finished: boolean): StoredChessGame {
  return { code, side: 'host', myName: 'Me', oppName: 'You', log, finished, updatedAt: 1 };
}

const key = (code: string) => `chess:session:v1:${code}`;

beforeEach(() => {
  localStorage.clear();
});

describe('who sat down, and as which colour, survives a refresh', () => {
  it('round-trips the colour and the seated ticket through storage', () => {
    // A host who chose Black, playing as ticket u1.
    const live = { ...createOnlineSession('host', 'ABCD', 'Rio', 'b'), seatedUserId: 'u1', oppName: 'Kai', log: LIVE_LOG };
    const stored = chessToStored(live, 7)!;
    expect(stored).toMatchObject({ code: 'ABCD', side: 'host', myColor: 'b', seatedUserId: 'u1', updatedAt: 7 });

    saveChessGame(stored);
    const back = storedToChess(loadChessGame('ABCD')!);
    expect(back.myColor).toBe('b');
    expect(back.seatedUserId).toBe('u1');
    expect(back).toMatchObject({ side: 'host', myName: 'Rio', oppName: 'Kai', log: LIVE_LOG });
  });

  it('a nobody-signed-in seat is kept as null, not dropped', () => {
    const live = { ...createOnlineSession('guest', 'ABCD', 'Kai', 'b'), oppName: 'Rio' };
    const back = storedToChess(chessToStored(live, 1)!);
    expect(back.myColor).toBe('w'); // guest of a Black host
    expect(back.seatedUserId).toBeNull();
  });

  it('a save from before colours were stored still loads: host=White, no ticket', () => {
    // The shape older builds wrote — no myColor, no seatedUserId.
    const old = stored('OLDG', LIVE_LOG, false);
    expect('myColor' in old).toBe(false);
    localStorage.setItem(key('OLDG'), JSON.stringify(old));

    const back = storedToChess(loadChessGame('OLDG')!);
    expect(back.myColor).toBe('w');
    expect(back.seatedUserId).toBeNull();
    expect(back.side).toBe('host');

    const oldGuest = storedToChess({ ...old, side: 'guest' });
    expect(oldGuest.myColor).toBe('b');
  });
});

describe('sweepStaleChessSessions', () => {
  it('removes finished and corrupt sessions but keeps a live one', () => {
    localStorage.setItem(key('DONE'), JSON.stringify(stored('DONE', FINISHED_LOG, true)));
    localStorage.setItem(key('JUNK'), '{not even json');
    // A log that no longer replays (an illegal ply) is as good as corrupt.
    localStorage.setItem(key('BROK'), JSON.stringify(stored('BROK', [ply('e2', 'e5')], false)));
    localStorage.setItem(key('LIVE'), JSON.stringify(stored('LIVE', LIVE_LOG, false)));

    sweepStaleChessSessions();

    expect(localStorage.getItem(key('DONE'))).toBeNull();
    expect(localStorage.getItem(key('JUNK'))).toBeNull();
    expect(localStorage.getItem(key('BROK'))).toBeNull();
    expect(loadChessGame('LIVE')).toMatchObject({ code: 'LIVE' });
  });

  it('leaves non-chess keys alone', () => {
    localStorage.setItem('battleship:session:v1:SHIP', '{whatever}');
    localStorage.setItem(key('DONE'), JSON.stringify(stored('DONE', FINISHED_LOG, true)));
    sweepStaleChessSessions();
    expect(localStorage.getItem('battleship:session:v1:SHIP')).toBe('{whatever}');
    expect(localStorage.getItem(key('DONE'))).toBeNull();
  });

  it('runs on save (old stale codes vanish; the fresh save survives)', () => {
    localStorage.setItem(key('DONE'), JSON.stringify(stored('DONE', FINISHED_LOG, true)));
    localStorage.setItem(key('JUNK'), 'not json');

    saveChessGame(stored('LIVE', LIVE_LOG, false));

    expect(localStorage.getItem(key('DONE'))).toBeNull();
    expect(localStorage.getItem(key('JUNK'))).toBeNull();
    expect(loadChessGame('LIVE')).toMatchObject({ code: 'LIVE' });
  });

  it('runs on resume lookup and never resumes a swept game', () => {
    // The "last session" points at a finished game — the sweep clears it and
    // the resume lookup comes back empty instead of resurrecting it.
    saveChessGame(stored('DONE', FINISHED_LOG, true));
    expect(loadResumableChessGame()).toBeNull();
    expect(localStorage.getItem(key('DONE'))).toBeNull();

    // A live game, by contrast, is still resumable after the sweep.
    saveChessGame(stored('LIVE', LIVE_LOG, false));
    expect(loadResumableChessGame()).toMatchObject({ code: 'LIVE' });
  });
});

describe('the same-device autosave keeps both chairs — tickets included', () => {
  const rio = { name: 'Rio', userId: 'u1' };
  const flora = { name: 'Flora', userId: 'u2' };

  it('round-trips both tickets with the names and the log', () => {
    const live = { ...createLocalSession(rio, flora), log: LIVE_LOG };
    saveLocalChessGame(live, 7);

    const stored = loadLocalChessGame()!;
    expect(stored).toMatchObject({ v: 1, whiteName: 'Rio', blackName: 'Flora', whiteUserId: 'u1', blackUserId: 'u2', updatedAt: 7 });

    const back = storedToLocalChess(stored);
    expect(back).toMatchObject({ mode: 'local', myName: 'Rio', oppName: 'Flora', whiteUserId: 'u1', blackUserId: 'u2', log: LIVE_LOG });
    expect(back.seatedUserId).toBeNull();
  });

  it('a chair with nobody in it is kept as null, not dropped', () => {
    saveLocalChessGame({ ...createLocalSession(rio, { name: 'Black', userId: null }), log: LIVE_LOG }, 1);
    const back = storedToLocalChess(loadLocalChessGame()!);
    expect(back.whiteUserId).toBe('u1');
    expect(back.blackUserId).toBeNull();
  });

  it('a save from before tickets rode along still loads — same version, null tickets', () => {
    // The exact shape older builds wrote: no whiteUserId, no blackUserId.
    const old: StoredLocalChess = { v: 1, whiteName: 'Rio', blackName: 'Flora', log: LIVE_LOG, updatedAt: 1 };
    expect('whiteUserId' in old).toBe(false);
    localStorage.setItem('chess:local:v1', JSON.stringify(old));

    const stored = loadLocalChessGame();
    expect(stored).not.toBeNull();
    const back = storedToLocalChess(stored!);
    expect(back).toMatchObject({ myName: 'Rio', oppName: 'Flora', log: LIVE_LOG });
    expect(back.whiteUserId).toBeNull();
    expect(back.blackUserId).toBeNull();
  });
});
