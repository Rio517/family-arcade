import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadChessGame,
  loadResumableChessGame,
  saveChessGame,
  sweepStaleChessSessions,
  type StoredChessGame,
} from './chessPersistence';
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
