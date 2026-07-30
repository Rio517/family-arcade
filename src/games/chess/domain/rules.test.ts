import { describe, expect, it } from 'vitest';
import {
  applyMove,
  customStart,
  initialState,
  inCheck,
  isGameOver,
  isSquareAttacked,
  legalMoves,
  legalMovesFrom,
  resolvePly,
  replay,
  setupIssue,
  status,
  winnerOf,
} from './rules';
import { parseFen, toFen } from './fen';
import { squareName, type Ply, type Square } from './types';

/** Parse an algebraic square like "e4" into {row,col}. */
function sq(name: string): Square {
  return { row: 8 - Number(name[1]), col: 'abcdefgh'.indexOf(name[0]) };
}

/** Count legal moves in a position given by FEN. */
function moveCount(fen: string): number {
  return legalMoves(parseFen(fen)).length;
}

describe('FEN round-trip', () => {
  it('parses and re-serializes the opening position', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(toFen(parseFen(start))).toBe(start);
  });

  it('matches initialState()', () => {
    expect(toFen(initialState())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});

describe('opening move generation', () => {
  it('gives White exactly 20 legal opening moves', () => {
    expect(legalMoves(initialState())).toHaveLength(20);
  });

  it('a knight on b1 has two opening moves', () => {
    expect(legalMovesFrom(initialState(), sq('b1'))).toHaveLength(2);
  });

  it('a pawn on e2 can step one or two squares', () => {
    const dests = legalMovesFrom(initialState(), sq('e2')).map((m) => squareName(m.to)).sort();
    expect(dests).toEqual(['e3', 'e4']);
  });
});

describe('perft (move-tree node counts from the opening)', () => {
  // The canonical perft numbers are a gold-standard correctness check: any bug
  // in move generation, check filtering, castling, or en passant shifts them.
  function perft(fen: string, depth: number): number {
    const state = parseFen(fen);
    const walk = (s: ReturnType<typeof parseFen>, d: number): number => {
      if (d === 0) return 1;
      let nodes = 0;
      for (const m of legalMoves(s)) nodes += walk(applyMove(s, m), d - 1);
      return nodes;
    };
    return walk(state, depth);
  }

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('depth 1 = 20', () => expect(perft(START, 1)).toBe(20));
  it('depth 2 = 400', () => expect(perft(START, 2)).toBe(400));
  it('depth 3 = 8902', () => expect(perft(START, 3)).toBe(8902));

  it('"Kiwipete" position depth 1 = 48, depth 2 = 2039', () => {
    // A dense middlegame position (Peter McKenzie's) that exercises castling,
    // en passant, and pins all at once — a classic generator torture test.
    const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(perft(kiwipete, 1)).toBe(48);
    expect(perft(kiwipete, 2)).toBe(2039);
  });
});

describe('castling', () => {
  it('offers both castles when the back rank is clear', () => {
    const state = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const kingMoves = legalMovesFrom(state, sq('e1'));
    expect(kingMoves.some((m) => m.castle === 'K' && squareName(m.to) === 'g1')).toBe(true);
    expect(kingMoves.some((m) => m.castle === 'Q' && squareName(m.to) === 'c1')).toBe(true);
  });

  it('moves the rook when the king castles kingside', () => {
    const state = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const castle = legalMovesFrom(state, sq('e1')).find((m) => m.castle === 'K')!;
    const after = applyMove(state, castle);
    expect(after.board[7][6]).toMatchObject({ color: 'w', type: 'k' }); // king to g1
    expect(after.board[7][5]).toMatchObject({ color: 'w', type: 'r' }); // rook to f1
    expect(after.board[7][7]).toBeNull();
    expect(after.castling.wK).toBe(false);
    expect(after.castling.wQ).toBe(false);
  });

  it('forbids castling through an attacked square', () => {
    // A black rook on f8 attacks f1, so White may not castle kingside.
    const state = parseFen('r4rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(legalMovesFrom(state, sq('e1')).some((m) => m.castle === 'K')).toBe(false);
  });

  it('forbids castling while in check', () => {
    const state = parseFen('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1'); // rook on e8 checks the king
    expect(legalMovesFrom(state, sq('e1')).some((m) => m.castle)).toBe(false);
  });

  it('drops the queenside right after the a-rook moves', () => {
    const state = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const rookUp = resolvePly(state, { from: sq('a1'), to: sq('a2') })!;
    const after = applyMove(state, rookUp);
    expect(after.castling.wQ).toBe(false);
    expect(after.castling.wK).toBe(true);
  });
});

describe('en passant', () => {
  it('exposes the en-passant target after a double pawn push', () => {
    const start = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const push = resolvePly(start, { from: sq('e2'), to: sq('e4') })!;
    const after = applyMove(start, push);
    expect(after.enPassant && squareName(after.enPassant)).toBe('e3');
  });

  it('lets an adjacent pawn capture en passant, removing the passed pawn', () => {
    // White pawn e5, black just played d7-d5 → ep target d6.
    const state = parseFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1');
    const ep = legalMovesFrom(state, sq('e5')).find((m) => m.enPassant);
    expect(ep).toBeTruthy();
    expect(squareName(ep!.to)).toBe('d6');
    const after = applyMove(state, ep!);
    expect(after.board[3][3]).toBeNull(); // the captured black pawn on d5 is gone
    expect(after.board[2][3]).toMatchObject({ color: 'w', type: 'p' }); // white pawn on d6
  });
});

describe('promotion', () => {
  it('offers all four promotion pieces for a pawn reaching the last rank', () => {
    const state = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const promos = legalMovesFrom(state, sq('a7')).filter((m) => squareName(m.to) === 'a8');
    expect(promos.map((m) => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
  });

  it('places the chosen promotion piece', () => {
    const state = parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const promo = resolvePly(state, { from: sq('a7'), to: sq('a8'), promotion: 'q' })!;
    const after = applyMove(state, promo);
    expect(after.board[0][0]).toMatchObject({ color: 'w', type: 'q' });
  });
});

describe('check, pins, and legality filtering', () => {
  it('detects a square attacked by a queen', () => {
    const state = parseFen('8/8/8/8/8/8/8/Q6k w - - 0 1');
    expect(isSquareAttacked(state.board, sq('h1'), 'w')).toBe(true);
  });

  it('reports a king in check', () => {
    const state = parseFen('4k3/8/8/8/8/8/8/4R2K b - - 0 1'); // rook on e1 checks e8
    expect(inCheck(state, 'b')).toBe(true);
  });

  it('a pinned piece cannot expose its king', () => {
    // Black rook e8, white king e1, white rook e4 pinned on the e-file. The
    // pinned rook may only move along the file, never sideways.
    const state = parseFen('4r3/8/8/8/4R3/8/8/4K3 w - - 0 1');
    const rookMoves = legalMovesFrom(state, sq('e4')).map((m) => squareName(m.to));
    expect(rookMoves).not.toContain('a4');
    expect(rookMoves).toContain('e5'); // toward the attacker, still legal
  });
});

describe('game endings', () => {
  it('recognizes fool\'s-mate as checkmate with Black winning', () => {
    // 1. f3 e5 2. g4 Qh4#
    const log: Ply[] = [
      { from: sq('f2'), to: sq('f3') },
      { from: sq('e7'), to: sq('e5') },
      { from: sq('g2'), to: sq('g4') },
      { from: sq('d8'), to: sq('h4') },
    ];
    const state = replay(log);
    expect(status(state)).toBe('checkmate');
    expect(winnerOf(state)).toBe('b');
  });

  it('recognizes stalemate (no legal move, not in check)', () => {
    // Classic K+Q vs K stalemate: black king a8, white queen c7, white king c6.
    const state = parseFen('k7/2Q5/2K5/8/8/8/8/8 b - - 0 1');
    expect(inCheck(state, 'b')).toBe(false);
    expect(status(state)).toBe('stalemate');
    expect(winnerOf(state)).toBeNull();
  });

  it('recognizes insufficient material (K vs K)', () => {
    expect(status(parseFen('k7/8/8/8/8/8/8/7K w - - 0 1'))).toBe('draw-material');
  });

  it('flags the fifty-move rule', () => {
    expect(status(parseFen('k7/8/8/8/8/8/8/R6K w - - 100 60'))).toBe('draw-fifty');
  });

  it('K+B vs K+B with both bishops on the same square colour is a dead draw', () => {
    // White bishop c2 and black bishop f7 both live on light squares —
    // they can never even meet, so no mate is ever possible.
    expect(status(parseFen('k7/5b2/8/8/8/8/2B5/K7 w - - 0 1'))).toBe('draw-material');
  });

  it('K+B vs K+B on opposite square colours stays playable', () => {
    // White bishop c2 (light) vs black bishop c7 (dark): mates exist.
    expect(status(parseFen('k7/2b5/8/8/8/8/2B5/K7 w - - 0 1'))).toBe('playing');
  });
});

describe('threefold repetition', () => {
  // Both sides bounce their kingside knights out and back: after four plies
  // the opening position is on the board again (same side to move, same
  // castling rights, no en-passant square).
  const shuffle: Ply[] = [
    { from: sq('g1'), to: sq('f3') },
    { from: sq('g8'), to: sq('f6') },
    { from: sq('f3'), to: sq('g1') },
    { from: sq('f6'), to: sq('g8') },
  ];

  it('two occurrences of a position is still just playing', () => {
    // One full shuffle: the opening position has now occurred twice.
    expect(status(replay(shuffle))).toBe('playing');
  });

  it('the third occurrence is a repetition draw (nobody wins)', () => {
    const state = replay([...shuffle, ...shuffle]);
    expect(status(state)).toBe('repetition');
    expect(winnerOf(state)).toBeNull();
    expect(isGameOver('repetition')).toBe(true);
  });

  it('applyMove copies the position counts instead of mutating them', () => {
    const midway = replay(shuffle);
    const countsBefore = JSON.parse(JSON.stringify(midway.repetition));
    replay(shuffle, midway); // shuffle again from the same state
    expect(midway.repetition).toEqual(countsBefore); // untouched
  });
});

describe('replay / resolvePly', () => {
  it('rejects an illegal ply', () => {
    expect(resolvePly(initialState(), { from: sq('e2'), to: sq('e5') })).toBeNull();
  });

  it('replays a short game and matches a known FEN', () => {
    // 1. e4 e5 2. Nf3 — a well-known resulting position.
    const log: Ply[] = [
      { from: sq('e2'), to: sq('e4') },
      { from: sq('e7'), to: sq('e5') },
      { from: sq('g1'), to: sq('f3') },
    ];
    expect(toFen(replay(log))).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    );
  });

  it('counts moves consistently after a capture', () => {
    expect(moveCount('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')).toBe(29);
  });
});

describe('custom starts (free play promoted into a real game)', () => {
  const boardOf = (fen: string) => parseFen(fen).board;

  it('keeps castling rights only where king and rook sit at home', () => {
    const standard = customStart(initialState().board);
    expect(standard.castling).toEqual({ wK: true, wQ: true, bK: true, bQ: true });

    // White king wandered to e2: White can never castle, Black still can.
    const wandered = customStart(boardOf('r3k2r/8/8/8/8/8/4K3/R6R w - - 0 1'));
    expect(wandered.castling).toEqual({ wK: false, wQ: false, bK: true, bQ: true });
  });

  it('replays a log from a custom start', () => {
    const start = customStart(boardOf('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'));
    const after = replay([{ from: sq('d1'), to: sq('d7') }], start);
    expect(after.turn).toBe('b');
    expect(after.board[1][3]).toEqual({ color: 'w', type: 'q' }); // queen on d7
  });

  it('requires at least one king per side', () => {
    expect(setupIssue(boardOf('8/8/8/8/8/8/8/8 w - - 0 1'))).toMatch(/need a king/);
    expect(setupIssue(boardOf('8/8/8/8/8/8/8/4K3 w - - 0 1'))).toMatch(/Black needs a king/);
  });

  it("blocks a start when Black's king is already capturable (White moves first)", () => {
    expect(setupIssue(boardOf('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1'))).toMatch(/Black's king/);
  });

  it('blocks a start from checkmate or a dead draw, allows a live position', () => {
    // White checkmated in the corner: Ka1 vs Qb2 guarded by Kb3.
    expect(setupIssue(boardOf('8/8/8/8/8/1k6/1q6/K7 w - - 0 1'))).toMatch(/checkmated/);
    // Bare kings can never mate.
    expect(setupIssue(boardOf('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toMatch(/enough pieces/);
    // Kings + a white queen out of contact: perfectly playable.
    expect(setupIssue(boardOf('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'))).toBeNull();
  });
});

describe('the king hunt (custom games with extra kings)', () => {
  const boardOf = (fen: string) => parseFen(fen).board;

  it('extra kings switch the game into the hunt (and disable castling)', () => {
    const start = customStart(boardOf('4k3/8/8/8/8/8/8/R2KK2R w - - 0 1'));
    expect(start.kingHunt).toBe(true);
    expect(start.castling).toEqual({ wK: false, wQ: false, bK: false, bQ: false });
    expect(setupIssue(boardOf('4k3/8/8/8/8/8/8/R2KK2R w - - 0 1'))).toBeNull();
  });

  it('has no check: a king may step right next to the enemy king', () => {
    const start = customStart(boardOf('8/8/8/3k4/8/3KK3/8/8 w - - 0 1'));
    expect(start.kingHunt).toBe(true);
    const dests = legalMovesFrom(start, sq('d3')).map((m) => squareName(m.to));
    expect(dests).toContain('d4'); // adjacent to the enemy king — allowed in the hunt
  });

  it('capturing SOME kings does not end it; taking the LAST king does', () => {
    // Black has two kings; the white queen takes one — game still on.
    const start = customStart(boardOf('Q2kk3/8/8/8/8/8/8/3KK3 w - - 0 1'));
    const midway = replay([{ from: sq('a8'), to: sq('d8') }], start); // Qxd8 — a king falls
    expect(status(midway)).not.toBe('kings-taken');
    expect(winnerOf(midway)).toBeNull();

    // Black down to one king (still a hunt — White has two): taking it wins.
    const oneLeft = customStart(boardOf('Q2k4/8/8/8/8/8/8/3KK3 w - - 0 1'));
    expect(oneLeft.kingHunt).toBe(true);
    const done = replay([{ from: sq('a8'), to: sq('d8') }], oneLeft);
    expect(status(done)).toBe('kings-taken');
    expect(winnerOf(done)).toBe('w');
  });

  it('bare kings are playable in the hunt (no material draw)', () => {
    const start = customStart(boardOf('3kk3/8/8/8/8/8/8/4K3 w - - 0 1'));
    expect(status(start)).toBe('playing');
  });
});
