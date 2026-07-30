/**
 * Chess rules — all pure functions, no I/O.
 *
 * The engine works on immutable `GameState`s. `legalMoves` produces every legal
 * move for the side to move (already filtered so you can never leave your own
 * king in check); `applyMove` returns a fresh state; `status` classifies the
 * position (check / checkmate / stalemate / draws). Castling, en passant, and
 * promotion are all handled.
 */

import {
  type Board,
  type CastleFlag,
  type Color,
  type GameState,
  type Move,
  type Piece,
  type PieceType,
  type Ply,
  type PromotionType,
  type Square,
  type Status,
  sameSquare,
} from './types';
import { toFen } from './fen';

const SIZE = 8;

/**
 * The repetition key for a position: the FEN minus the move clocks (placement,
 * side to move, castling rights, en-passant square). Two positions with the
 * same key are "the same position" for the threefold-repetition rule.
 */
export function positionKey(state: GameState): string {
  return toFen(state).split(' ').slice(0, 4).join(' ');
}

/** How often the current position has occurred (at least once — it's here now). */
function repetitionCount(state: GameState): number {
  return state.repetition?.[positionKey(state)] ?? 1;
}

/** Seed a starting position's repetition record: it has occurred once. */
function seedRepetition(state: GameState): GameState {
  return { ...state, repetition: { [positionKey(state)]: 1 } };
}

export function opponent(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function onBoard(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
}

/** Deep-clone a board (states are immutable, so applyMove copies before edit). */
function cloneBoard(board: Board): Board {
  return board.map((r) => r.map((p) => (p ? { ...p } : null)));
}

const BACK_RANK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** The standard opening position. */
export function initialState(): GameState {
  const board = emptyBoard();
  for (let col = 0; col < SIZE; col++) {
    board[0][col] = { color: 'b', type: BACK_RANK[col] };
    board[1][col] = { color: 'b', type: 'p' };
    board[6][col] = { color: 'w', type: 'p' };
    board[7][col] = { color: 'w', type: BACK_RANK[col] };
  }
  return seedRepetition({
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  });
}

const KNIGHT_DELTAS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING_DELTAS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Is `target` attacked by any piece of `byColor`? Used for check detection and
 * to validate that a king never castles through, into, or out of check. Note it
 * ignores en passant (irrelevant for attacks on the king).
 */
export function isSquareAttacked(board: Board, target: Square, byColor: Color): boolean {
  const { row, col } = target;

  // Pawns: a pawn of byColor attacks diagonally "forward". White attacks toward
  // smaller rows, so a white pawn on (row+1, col±1) attacks (row, col).
  const pawnRowDelta = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const r = row + pawnRowDelta;
    const c = col + dc;
    if (onBoard(r, c)) {
      const p = board[r][c];
      if (p && p.color === byColor && p.type === 'p') return true;
    }
  }

  // Knights
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const r = row + dr;
    const c = col + dc;
    if (onBoard(r, c)) {
      const p = board[r][c];
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  // King (adjacent)
  for (const [dr, dc] of KING_DELTAS) {
    const r = row + dr;
    const c = col + dc;
    if (onBoard(r, c)) {
      const p = board[r][c];
      if (p && p.color === byColor && p.type === 'k') return true;
    }
  }

  // Sliding: bishops/queens on diagonals, rooks/queens on files/ranks.
  const rays: Array<{ dirs: number[][]; types: PieceType[] }> = [
    { dirs: BISHOP_DIRS, types: ['b', 'q'] },
    { dirs: ROOK_DIRS, types: ['r', 'q'] },
  ];
  for (const { dirs, types } of rays) {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (onBoard(r, c)) {
        const p = board[r][c];
        if (p) {
          if (p.color === byColor && types.includes(p.type)) return true;
          break; // blocked
        }
        r += dr;
        c += dc;
      }
    }
  }

  return false;
}

/** Locate a color's king. Returns null only on malformed boards. */
export function findKing(board: Board, color: Color): Square | null {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const p = board[row][col];
      if (p && p.color === color && p.type === 'k') return { row, col };
    }
  }
  return null;
}

/** Is `color`'s king currently in check? */
export function inCheck(state: GameState, color: Color): boolean {
  const king = findKing(state.board, color);
  if (!king) return false;
  return isSquareAttacked(state.board, king, opponent(color));
}

/** Build a Move record, filling in the captured piece from the board. */
function makeMove(
  board: Board,
  from: Square,
  to: Square,
  piece: PieceType,
  extra: Partial<Move> = {},
): Move {
  const target = board[to.row][to.col];
  return {
    from,
    to,
    piece,
    captured: target ? target.type : null,
    castle: null,
    enPassant: false,
    ...extra,
  };
}

const PROMOTION_TYPES: PromotionType[] = ['q', 'r', 'b', 'n'];

/**
 * Pseudo-legal moves for the piece on `from` (moves that follow the piece's
 * movement rules but may leave the king in check — `legalMoves` filters those).
 */
function pseudoMovesFrom(state: GameState, from: Square): Move[] {
  const { board } = state;
  const piece = board[from.row][from.col];
  if (!piece) return [];
  const moves: Move[] = [];
  const { row, col } = from;
  const enemy = opponent(piece.color);

  const addSlides = (dirs: number[][]) => {
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (onBoard(r, c)) {
        const occ = board[r][c];
        if (!occ) {
          moves.push(makeMove(board, from, { row: r, col: c }, piece.type));
        } else {
          if (occ.color === enemy) moves.push(makeMove(board, from, { row: r, col: c }, piece.type));
          break;
        }
        r += dr;
        c += dc;
      }
    }
  };

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? -1 : 1;
      const startRow = piece.color === 'w' ? 6 : 1;
      const promoteRow = piece.color === 'w' ? 0 : 7;

      // Single & double push (only onto empty squares).
      const one = { row: row + dir, col };
      if (onBoard(one.row, one.col) && !board[one.row][one.col]) {
        pushPawnMove(moves, board, from, one, promoteRow);
        const two = { row: row + 2 * dir, col };
        if (row === startRow && !board[two.row][two.col]) {
          moves.push(makeMove(board, from, two, 'p'));
        }
      }

      // Diagonal captures, incl. en passant.
      for (const dc of [-1, 1]) {
        const t = { row: row + dir, col: col + dc };
        if (!onBoard(t.row, t.col)) continue;
        const occ = board[t.row][t.col];
        if (occ && occ.color === enemy) {
          pushPawnMove(moves, board, from, t, promoteRow);
        } else if (!occ && state.enPassant && sameSquare(state.enPassant, t)) {
          // En passant: the captured pawn sits beside us, on our own row.
          moves.push({
            from,
            to: t,
            piece: 'p',
            captured: 'p',
            castle: null,
            enPassant: true,
          });
        }
      }
      break;
    }

    case 'n':
      for (const [dr, dc] of KNIGHT_DELTAS) {
        const r = row + dr;
        const c = col + dc;
        if (!onBoard(r, c)) continue;
        const occ = board[r][c];
        if (!occ || occ.color === enemy) moves.push(makeMove(board, from, { row: r, col: c }, 'n'));
      }
      break;

    case 'b':
      addSlides(BISHOP_DIRS);
      break;
    case 'r':
      addSlides(ROOK_DIRS);
      break;
    case 'q':
      addSlides([...BISHOP_DIRS, ...ROOK_DIRS]);
      break;

    case 'k': {
      for (const [dr, dc] of KING_DELTAS) {
        const r = row + dr;
        const c = col + dc;
        if (!onBoard(r, c)) continue;
        const occ = board[r][c];
        if (!occ || occ.color === enemy) moves.push(makeMove(board, from, { row: r, col: c }, 'k'));
      }
      addCastles(state, from, moves);
      break;
    }
  }

  return moves;
}

function pushPawnMove(moves: Move[], board: Board, from: Square, to: Square, promoteRow: number) {
  if (to.row === promoteRow) {
    for (const promotion of PROMOTION_TYPES) {
      moves.push(makeMove(board, from, to, 'p', { promotion }));
    }
  } else {
    moves.push(makeMove(board, from, to, 'p'));
  }
}

/** Add legal castling moves for the king on `from`, if rights + geometry allow. */
function addCastles(state: GameState, from: Square, moves: Move[]) {
  const { board } = state;
  const king = board[from.row][from.col];
  if (!king || king.type !== 'k') return;
  const color = king.color;
  const homeRow = color === 'w' ? 7 : 0;
  // King must be on its home square and not currently in check.
  if (from.row !== homeRow || from.col !== 4) return;
  const enemy = opponent(color);
  if (isSquareAttacked(board, from, enemy)) return;

  const rightsK: CastleFlag = color === 'w' ? 'wK' : 'bK';
  const rightsQ: CastleFlag = color === 'w' ? 'wQ' : 'bQ';

  // Kingside: squares f,g empty; rook on h; king passes f,g unattacked.
  if (state.castling[rightsK]) {
    const rook = board[homeRow][7];
    if (
      rook && rook.type === 'r' && rook.color === color &&
      !board[homeRow][5] && !board[homeRow][6] &&
      !isSquareAttacked(board, { row: homeRow, col: 5 }, enemy) &&
      !isSquareAttacked(board, { row: homeRow, col: 6 }, enemy)
    ) {
      moves.push({
        from,
        to: { row: homeRow, col: 6 },
        piece: 'k',
        captured: null,
        castle: 'K',
        enPassant: false,
      });
    }
  }

  // Queenside: squares b,c,d empty; rook on a; king passes d,c unattacked.
  if (state.castling[rightsQ]) {
    const rook = board[homeRow][0];
    if (
      rook && rook.type === 'r' && rook.color === color &&
      !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] &&
      !isSquareAttacked(board, { row: homeRow, col: 3 }, enemy) &&
      !isSquareAttacked(board, { row: homeRow, col: 2 }, enemy)
    ) {
      moves.push({
        from,
        to: { row: homeRow, col: 2 },
        piece: 'k',
        captured: null,
        castle: 'Q',
        enPassant: false,
      });
    }
  }
}

/**
 * Apply a (legal or castling/en-passant-annotated) move, returning a fresh
 * state. Assumes the move is well-formed; `legalMoves` only ever produces valid
 * ones. Updates castling rights, en-passant square, and the move clocks.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const board = cloneBoard(state.board);
  const mover = board[move.from.row][move.from.col];
  if (!mover) return state; // defensive; shouldn't happen for generated moves
  const color = mover.color;

  // En-passant capture: remove the pawn that sits beside the destination.
  if (move.enPassant) {
    board[move.from.row][move.to.col] = null;
  }

  // Move the piece.
  board[move.from.row][move.from.col] = null;
  board[move.to.row][move.to.col] = move.promotion
    ? { color, type: move.promotion }
    : mover;

  // Castling: relocate the rook to the other side of the king.
  if (move.castle) {
    const homeRow = color === 'w' ? 7 : 0;
    if (move.castle === 'K') {
      board[homeRow][5] = board[homeRow][7];
      board[homeRow][7] = null;
    } else {
      board[homeRow][3] = board[homeRow][0];
      board[homeRow][0] = null;
    }
  }

  const castling = { ...state.castling };
  // King move (incl. castle) forfeits both rights for that color.
  if (mover.type === 'k') {
    if (color === 'w') {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }
  // A rook leaving its home square forfeits that side.
  dropRookRight(castling, color, move.from);
  // Capturing a rook on its home square forfeits the opponent's right there.
  dropRookRight(castling, opponent(color), move.to);

  // En-passant target: only set after a two-square pawn advance.
  let enPassant: Square | null = null;
  if (mover.type === 'p' && Math.abs(move.to.row - move.from.row) === 2) {
    enPassant = { row: (move.to.row + move.from.row) / 2, col: move.from.col };
  }

  const resetClock = mover.type === 'p' || move.captured !== null;

  const next: GameState = {
    board,
    turn: opponent(color),
    castling,
    enPassant,
    halfmoveClock: resetClock ? 0 : state.halfmoveClock + 1,
    fullmoveNumber: color === 'b' ? state.fullmoveNumber + 1 : state.fullmoveNumber,
    // The king-hunt variant is for the whole game, not just the first move.
    ...(state.kingHunt ? { kingHunt: true } : {}),
  };

  // Threefold-repetition bookkeeping: count the position we just arrived at.
  // Copy — never mutate — so replays and search (perft) can share ancestors.
  const key = positionKey(next);
  const repetition = { ...(state.repetition ?? {}) };
  repetition[key] = (repetition[key] ?? 0) + 1;
  return { ...next, repetition };
}

/** Forfeit a castling right if the square is a color's home rook square. */
function dropRookRight(castling: Record<CastleFlag, boolean>, color: Color, sq: Square) {
  const homeRow = color === 'w' ? 7 : 0;
  if (sq.row !== homeRow) return;
  if (sq.col === 0) castling[color === 'w' ? 'wQ' : 'bQ'] = false;
  if (sq.col === 7) castling[color === 'w' ? 'wK' : 'bK'] = false;
}

/** Every legal move for the side to move (king-safety filtered). */
export function legalMoves(state: GameState): Move[] {
  const { board, turn } = state;
  const moves: Move[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const p = board[row][col];
      if (!p || p.color !== turn) continue;
      for (const move of pseudoMovesFrom(state, { row, col })) {
        // King hunt: no check concept — kings move (and fall) like any piece.
        if (state.kingHunt) {
          moves.push(move);
          continue;
        }
        const next = applyMove(state, move);
        // The move is legal only if it doesn't leave our own king in check.
        if (!inCheck({ ...next, turn }, turn)) moves.push(move);
      }
    }
  }
  return moves;
}

/** Legal moves originating from a specific square (for the UI's drag hints). */
export function legalMovesFrom(state: GameState, from: Square): Move[] {
  return legalMoves(state).filter((m) => sameSquare(m.from, from));
}

/**
 * Find the fully-annotated legal move matching a bare `Ply` (from/to/promotion),
 * or null if it isn't legal. This is the gate every played move passes through.
 */
export function resolvePly(state: GameState, ply: Ply): Move | null {
  const candidates = legalMoves(state).filter(
    (m) => sameSquare(m.from, ply.from) && sameSquare(m.to, ply.to),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Multiple only happens on a promotion (4 choices) — match the requested one,
  // defaulting to a queen when the caller didn't specify.
  const want = ply.promotion ?? 'q';
  return candidates.find((m) => m.promotion === want) ?? null;
}

/** Only bishops/knights (or lone kings) remain → no forced mate is possible. */
function insufficientMaterial(board: Board): boolean {
  const minors: Array<{ piece: Piece; squareShade: number }> = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const p = board[row][col];
      if (!p || p.type === 'k') continue;
      if (p.type === 'n' || p.type === 'b') {
        minors.push({ piece: p, squareShade: (row + col) % 2 });
      } else {
        return false; // a pawn, rook, or queen can force mate
      }
    }
  }
  // K vs K, K vs KN, K vs KB. (Two bishops / bishop+knight can mate.)
  if (minors.length <= 1) return true;
  // K+B vs K+B with both bishops on the SAME square colour: a FIDE dead
  // position — the bishops can never even meet, let alone mate.
  if (minors.length === 2) {
    const [a, b] = minors;
    return (
      a.piece.type === 'b' &&
      b.piece.type === 'b' &&
      a.piece.color !== b.piece.color &&
      a.squareShade === b.squareShade
    );
  }
  return false;
}

/** How many kings `color` still has (the king-hunt life counter). */
export function countKings(board: Board, color: Color): number {
  let n = 0;
  for (const row of board) {
    for (const p of row) {
      if (p && p.color === color && p.type === 'k') n++;
    }
  }
  return n;
}

/** Classify the position for the side to move. */
export function status(state: GameState): Status {
  if (state.kingHunt) {
    // King hunt: lose your last king, lose the game. No check, no mate,
    // no material draws (even bare kings can capture each other here).
    if (countKings(state.board, state.turn) === 0) return 'kings-taken';
    if (legalMoves(state).length === 0) return 'stalemate';
    if (repetitionCount(state) >= 3) return 'repetition';
    if (state.halfmoveClock >= 100) return 'draw-fifty';
    return 'playing';
  }
  const moves = legalMoves(state);
  const checked = inCheck(state, state.turn);
  if (moves.length === 0) return checked ? 'checkmate' : 'stalemate';
  if (insufficientMaterial(state.board)) return 'draw-material';
  if (repetitionCount(state) >= 3) return 'repetition';
  if (state.halfmoveClock >= 100) return 'draw-fifty';
  return checked ? 'check' : 'playing';
}

/**
 * Replay a whole log of plies, returning the final state. Starts from the
 * standard opening unless a custom `start` (e.g. a free-play setup promoted
 * into a real game) is given.
 */
export function replay(log: Ply[], start?: GameState): GameState {
  let state = start ?? initialState();
  for (const ply of log) {
    const move = resolvePly(state, ply);
    if (!move) throw new Error(`Illegal ply in log: ${JSON.stringify(ply)}`);
    state = applyMove(state, move);
  }
  return state;
}

/**
 * Wrap an arbitrary board (a free-play setup) into a playable GameState.
 * White moves first.
 *
 * One king per side → real chess: check, checkmate, and castling rights
 * wherever the king and rook both stand on their home squares (so a
 * hand-built standard lineup still castles, but a wandered king can't).
 *
 * More than one king on either side → the KING HUNT: no check or mate,
 * kings are capturable like any piece (and never castle), and a side loses
 * when its last king falls.
 */
export function customStart(board: Board, turn: Color = 'w'): GameState {
  const hunt = countKings(board, 'w') > 1 || countKings(board, 'b') > 1;
  const home = (row: number, col: number, color: Color, type: PieceType) => {
    const p = board[row][col];
    return !!p && p.color === color && p.type === type;
  };
  return seedRepetition({
    board: cloneBoard(board),
    turn,
    castling: hunt
      ? { wK: false, wQ: false, bK: false, bQ: false }
      : {
          wK: home(7, 4, 'w', 'k') && home(7, 7, 'w', 'r'),
          wQ: home(7, 4, 'w', 'k') && home(7, 0, 'w', 'r'),
          bK: home(0, 4, 'b', 'k') && home(0, 7, 'b', 'r'),
          bQ: home(0, 4, 'b', 'k') && home(0, 0, 'b', 'r'),
        },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    ...(hunt ? { kingHunt: true } : {}),
  });
}

/**
 * Why a free-play setup can't start as a real game (null = good to go).
 * Each side needs at least one king, and the game can't be over before
 * move one. Extra kings are welcome — that's the king hunt.
 */
export function setupIssue(board: Board): string | null {
  const wk = countKings(board, 'w');
  const bk = countKings(board, 'b');
  if (wk === 0 && bk === 0) return 'Both sides need a king — place one white and one black king.';
  if (wk === 0) return 'White needs a king.';
  if (bk === 0) return 'Black needs a king.';

  const state = customStart(board);
  if (state.kingHunt) {
    // The hunt has almost no illegal positions — just make sure White can move.
    return status(state) === 'stalemate' ? 'White has no legal moves — free something up before starting.' : null;
  }
  if (inCheck(state, 'b')) {
    return "White moves first, and Black's king is already in its sights — shield the black king before starting.";
  }
  switch (status(state)) {
    case 'checkmate':
      return 'White is already checkmated — give the white king a way out before starting.';
    case 'stalemate':
      return 'White has no legal moves — that would be stalemate before move one.';
    case 'draw-material':
      return 'Neither side has enough pieces to ever checkmate — add some firepower.';
    default:
      return null;
  }
}

/** True once the game is over (mate, all kings taken, stalemate, or a draw). */
export function isGameOver(s: Status): boolean {
  return (
    s === 'checkmate' || s === 'kings-taken' || s === 'stalemate' ||
    s === 'draw-fifty' || s === 'draw-material' || s === 'repetition'
  );
}

/**
 * The winner of a finished game, or null for a draw / unfinished game. A
 * checkmate (or, in the king hunt, taking the last king) has a winner —
 * the side that just moved (not the side to move).
 */
export function winnerOf(state: GameState): Color | null {
  const st = status(state);
  return st === 'checkmate' || st === 'kings-taken' ? opponent(state.turn) : null;
}
