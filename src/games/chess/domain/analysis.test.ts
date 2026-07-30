import { describe, expect, it } from 'vitest';
import { analyzeGame, tallyCaptures } from './analysis';
import { parseFen } from './fen';
import type { Ply, Square } from './types';

const sq = (name: string): Square => ({ row: 8 - Number(name[1]), col: 'abcdefgh'.indexOf(name[0]) });
const ply = (from: string, to: string, promotion?: Ply['promotion']): Ply => ({
  from: sq(from),
  to: sq(to),
  ...(promotion ? { promotion } : {}),
});

const sans = (log: Ply[]) => analyzeGame(log).map((m) => m.san);

describe('analyzeGame — SAN notation', () => {
  it('writes plain pawn pushes and piece moves (1.e4 e5 2.Nf3)', () => {
    const moves = analyzeGame([ply('e2', 'e4'), ply('e7', 'e5'), ply('g1', 'f3')]);
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(moves.map((m) => m.color)).toEqual(['w', 'b', 'w']);
    expect(moves.map((m) => m.piece)).toEqual(['p', 'p', 'n']);
    expect(moves.every((m) => m.captured === null)).toBe(true);
  });

  it('names the starting file on a pawn capture (exd5)', () => {
    const moves = analyzeGame([ply('e2', 'e4'), ply('d7', 'd5'), ply('e4', 'd5')]);
    expect(moves[2].san).toBe('exd5');
    expect(moves[2].captured).toBe('p');
  });

  it('marks a check with "+" (1.e4 f5 2.Qh5+)', () => {
    expect(sans([ply('e2', 'e4'), ply('f7', 'f5'), ply('d1', 'h5')])).toEqual(['e4', 'f5', 'Qh5+']);
  });

  it('marks checkmate with "#" (fool\'s mate)', () => {
    expect(sans([ply('f2', 'f3'), ply('e7', 'e5'), ply('g2', 'g4'), ply('d8', 'h4')])).toEqual([
      'f3', 'e5', 'g4', 'Qh4#',
    ]);
  });

  it('writes kingside castling as O-O', () => {
    const log = [
      ply('e2', 'e4'), ply('e7', 'e5'),
      ply('g1', 'f3'), ply('b8', 'c6'),
      ply('f1', 'c4'), ply('f8', 'c5'),
      ply('e1', 'g1'),
    ];
    expect(sans(log).at(-1)).toBe('O-O');
  });

  it('writes queenside castling as O-O-O', () => {
    const log = [
      ply('d2', 'd4'), ply('d7', 'd5'),
      ply('c1', 'f4'), ply('b8', 'c6'),
      ply('b1', 'c3'), ply('g8', 'f6'),
      ply('d1', 'd2'), ply('e7', 'e6'),
      ply('e1', 'c1'),
    ];
    expect(sans(log).at(-1)).toBe('O-O-O');
  });

  it('writes a promotion as e8=Q (from a custom start position)', () => {
    const start = parseFen('8/4P3/7k/8/8/8/8/4K3 w - - 0 1');
    const moves = analyzeGame([ply('e7', 'e8', 'q')], start);
    expect(moves).toHaveLength(1);
    expect(moves[0].san).toBe('e8=Q');
    expect(moves[0].piece).toBe('p');
    // The snapshot after the move really holds the new queen.
    expect(moves[0].after.board[0][4]).toEqual({ color: 'w', type: 'q' });
  });

  it('stops analyzing at the first illegal ply instead of throwing', () => {
    expect(analyzeGame([ply('e2', 'e5')])).toEqual([]); // a pawn cannot jump three
    // Legal prefix survives; the bogus tail is dropped.
    expect(sans([ply('e2', 'e4'), ply('e7', 'e4')])).toEqual(['e4']);
  });
});

describe('tallyCaptures', () => {
  it('reports empty trays and no lead when nothing has been captured', () => {
    const caps = tallyCaptures(analyzeGame([ply('e2', 'e4'), ply('e7', 'e5')]));
    expect(caps).toEqual({ byWhite: [], byBlack: [], whiteLead: 0 });
  });

  it('counts captured pieces per side and the material lead', () => {
    // 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qxd2+?? 4.Qxd2 — each side takes pawns,
    // then White wins the queen.
    const moves = analyzeGame([
      ply('e2', 'e4'), ply('d7', 'd5'),
      ply('e4', 'd5'), ply('d8', 'd5'),
      ply('b1', 'c3'), ply('d5', 'd2'),
      ply('d1', 'd2'),
    ]);
    expect(moves.map((m) => m.san)).toEqual(['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qxd2+', 'Qxd2']);

    const caps = tallyCaptures(moves);
    expect(caps.byWhite).toEqual(['q', 'p']); // sorted big-to-small for the tray
    expect(caps.byBlack).toEqual(['p', 'p']);
    expect(caps.whiteLead).toBe(8); // (9 + 1) − (1 + 1)
  });
});
