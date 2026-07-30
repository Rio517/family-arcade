import { describe, expect, it } from 'vitest';
import { parseFen, toFen } from './fen';
import { initialState } from './rules';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// After 1.e4 c5 2.e5 d5 — White to move, may capture en passant on d6.
const MIDGAME_FEN = 'rnbqkbnr/pp2pppp/8/2ppP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';

// Both sides castled kingside — no castling rights remain at all.
const CASTLED_FEN = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 b - - 8 6';

// Only White's rights survive, and the move clocks are well into the game.
const PARTIAL_RIGHTS_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQ - 13 42';

describe('parseFen ⇄ toFen round-trips', () => {
  it('round-trips the standard opening exactly', () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });

  it('serializes the engine\'s initialState() as the standard opening FEN', () => {
    expect(toFen(initialState())).toBe(START_FEN);
  });

  it('parses the standard opening into the expected fields', () => {
    const s = parseFen(START_FEN);
    expect(s.turn).toBe('w');
    expect(s.castling).toEqual({ wK: true, wQ: true, bK: true, bQ: true });
    expect(s.enPassant).toBeNull();
    expect(s.halfmoveClock).toBe(0);
    expect(s.fullmoveNumber).toBe(1);
    // Spot-check placement: white rook a1, black king e8, empty e4.
    expect(s.board[7][0]).toEqual({ color: 'w', type: 'r' });
    expect(s.board[0][4]).toEqual({ color: 'b', type: 'k' });
    expect(s.board[4][4]).toBeNull();
  });

  it('round-trips a mid-game position with an en-passant square and clocks', () => {
    const s = parseFen(MIDGAME_FEN);
    expect(s.turn).toBe('w');
    expect(s.enPassant).toEqual({ row: 2, col: 3 }); // d6
    expect(s.halfmoveClock).toBe(0);
    expect(s.fullmoveNumber).toBe(3);
    // The pawn structure of 1.e4 c5 2.e5 d5: white pawn e5, black pawns c5+d5.
    expect(s.board[3][4]).toEqual({ color: 'w', type: 'p' });
    expect(s.board[3][2]).toEqual({ color: 'b', type: 'p' });
    expect(s.board[3][3]).toEqual({ color: 'b', type: 'p' });
    expect(toFen(s)).toBe(MIDGAME_FEN);
  });

  it('round-trips partial castling rights and non-trivial move numbers', () => {
    const s = parseFen(PARTIAL_RIGHTS_FEN);
    expect(s.turn).toBe('b');
    expect(s.castling).toEqual({ wK: true, wQ: true, bK: false, bQ: false });
    expect(s.halfmoveClock).toBe(13);
    expect(s.fullmoveNumber).toBe(42);
    expect(toFen(s)).toBe(PARTIAL_RIGHTS_FEN);
  });

  it('round-trips a position with no castling rights as "-"', () => {
    const s = parseFen(CASTLED_FEN);
    expect(s.castling).toEqual({ wK: false, wQ: false, bK: false, bQ: false });
    expect(toFen(s)).toBe(CASTLED_FEN);
  });

  it('defaults missing clocks to 0 / 1 when the FEN only has four fields', () => {
    const s = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(s.halfmoveClock).toBe(0);
    expect(s.fullmoveNumber).toBe(1);
  });
});

describe('parseFen rejects malformed input', () => {
  it('throws when the placement has too few ranks', () => {
    expect(() => parseFen('8/8/8 w - - 0 1')).toThrow(/Bad FEN/);
    expect(() => parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1')).toThrow(/Bad FEN/);
  });

  it('throws when the placement has too many ranks', () => {
    expect(() => parseFen('8/8/8/8/8/8/8/8/8 w - - 0 1')).toThrow(/Bad FEN/);
  });

  it('throws when a rank overflows past the h-file', () => {
    expect(() => parseFen('ppppppppp/8/8/8/8/8/8/8 w - - 0 1')).toThrow(/overflow/);
    expect(() => parseFen('8p/8/8/8/8/8/8/8 w - - 0 1')).toThrow(/overflow/);
  });

  it('throws on garbage that is not FEN-shaped at all', () => {
    expect(() => parseFen('')).toThrow(/Bad FEN/);
    expect(() => parseFen('not-a-fen')).toThrow(/Bad FEN/);
    expect(() => parseFen('hello world')).toThrow(/Bad FEN/);
  });
});
