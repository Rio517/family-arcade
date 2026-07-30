/**
 * Core domain types for chess.
 *
 * Like Ship Battle, a whole game is an *event-sourced* value: the shared truth
 * is an ordered list of plies (`Ply[]`), and the full board state — whose turn
 * it is, castling rights, whether it's checkmate — is a pure function of
 * replaying those plies from the standard opening position. Nothing here
 * touches the DOM, the network, or `localStorage`, so it is exhaustively
 * testable and replays cleanly after a reconnect.
 *
 * Board coordinates use `{ row, col }` with **row 0 at the top (rank 8)** and
 * **row 7 at the bottom (rank 1)**; col 0 is file a, col 7 is file h. So White's
 * back rank is row 7 and White pawns advance toward smaller row numbers.
 */

export type Color = 'w' | 'b';

/** p=pawn, n=knight, b=bishop, r=rook, q=queen, k=king. */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** A piece a pawn may promote to. */
export type PromotionType = 'q' | 'r' | 'b' | 'n';

export interface Piece {
  color: Color;
  type: PieceType;
}

export interface Square {
  row: number;
  col: number;
}

/** 8×8 grid indexed `board[row][col]`; empty squares are `null`. */
export type Board = (Piece | null)[][];

/**
 * A single played move as stored in the shared log — deliberately minimal
 * (from, to, optional promotion). Everything else about the move (was it a
 * capture, a castle, an en-passant) is re-derived by the engine when the ply is
 * replayed, so the log stays canonical and tiny.
 */
export interface Ply {
  from: Square;
  to: Square;
  promotion?: PromotionType;
}

/** The ordered, shared game timeline. Replaying it yields the current state. */
export type GameLog = Ply[];

/** Which side each connected player controls (online mode). */
export type Side = 'host' | 'guest';

export const CASTLE_FLAGS = ['wK', 'wQ', 'bK', 'bQ'] as const;
export type CastleFlag = (typeof CASTLE_FLAGS)[number];

/**
 * A fully-derived position. Immutable — the engine never mutates a state in
 * place; `applyMove` returns a fresh one.
 */
export interface GameState {
  board: Board;
  turn: Color;
  /** Remaining castling rights (a side is dropped once its king or rook moves). */
  castling: Record<CastleFlag, boolean>;
  /** The square a pawn may capture *onto* via en passant this turn, else null. */
  enPassant: Square | null;
  /** Half-moves since the last pawn move or capture (for the 50-move rule). */
  halfmoveClock: number;
  /** Starts at 1, increments after each Black move. */
  fullmoveNumber: number;
  /**
   * King-hunt variant (custom games with more than one king on a side):
   * no check or checkmate — kings are capturable like any piece, and a side
   * loses when its LAST king is taken.
   */
  kingHunt?: boolean;
  /**
   * Occurrence count per position for the threefold-repetition draw, keyed by
   * the position parts of the FEN (placement, side to move, castling rights,
   * en-passant square — never the move clocks). Seeded with the starting
   * position and built up by `applyMove` (copy-on-write, never mutated).
   * Optional so hand-built states (e.g. straight from `parseFen`) still work.
   */
  repetition?: Record<string, number>;
}

/**
 * A legal move with everything the UI/engine needs, produced by move
 * generation. `from`/`to`/`promotion` are the storable part (see `Ply`).
 */
export interface Move {
  from: Square;
  to: Square;
  piece: PieceType;
  /** The captured piece type, if any (includes the en-passant victim). */
  captured: PieceType | null;
  /** Kingside ('K') or queenside ('Q') castle, else null. */
  castle: 'K' | 'Q' | null;
  /** True when this move is an en-passant capture. */
  enPassant: boolean;
  /** The piece a pawn promotes to, if this move is a promotion. */
  promotion?: PromotionType;
}

export type Status =
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  /** King-hunt variant: the side to move has lost its last king. */
  | 'kings-taken'
  | 'draw-fifty'
  | 'draw-material'
  /** The same position has occurred three times — a repetition draw. */
  | 'repetition';

export const FILES = 'abcdefgh';
export const RANKS = '87654321'; // row 0 → rank 8, row 7 → rank 1

/** Algebraic name of a square, e.g. {row:7,col:4} → "e1". */
export function squareName(sq: Square): string {
  return `${FILES[sq.col]}${RANKS[sq.row]}`;
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.row === b.row && a.col === b.col;
}
