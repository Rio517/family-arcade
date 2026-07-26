/**
 * Read-only game analysis derived from the move log — notation, per-move board
 * snapshots, and the captured-piece tally. Pure functions of the `Ply[]`, so the
 * UI (move list, position preview, captured trays) stays a view of the log.
 */

import { applyMove, initialState, resolvePly, status } from './rules';
import { FILES, squareName, type Color, type GameState, type PieceType, type Ply } from './types';

export interface MoveInfo {
  ply: Ply;
  /** Who made the move. */
  color: Color;
  piece: PieceType;
  captured: PieceType | null;
  /** Short algebraic-ish notation (no disambiguation — fine for a family game). */
  san: string;
  /** The full position immediately after this move. */
  after: GameState;
}

const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function toSan(
  move: { piece: PieceType; from: Ply['from']; to: Ply['to']; captured: PieceType | null; castle: 'K' | 'Q' | null; promotion?: PieceType },
  after: GameState,
): string {
  let base: string;
  if (move.castle === 'K') base = 'O-O';
  else if (move.castle === 'Q') base = 'O-O-O';
  else {
    const letter = move.piece === 'p' ? '' : move.piece.toUpperCase();
    const cap = move.captured ? 'x' : '';
    // A pawn capture names its starting file, e.g. exd5.
    const disamb = move.piece === 'p' && move.captured ? FILES[move.from.col] : '';
    const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    base = `${letter}${disamb}${cap}${squareName(move.to)}${promo}`;
  }
  const st = status(after);
  return base + (st === 'checkmate' ? '#' : st === 'check' ? '+' : '');
}

/** Walk the log once, producing per-move notation and board snapshots. */
export function analyzeGame(log: Ply[]): MoveInfo[] {
  let s = initialState();
  const out: MoveInfo[] = [];
  for (const ply of log) {
    const move = resolvePly(s, ply);
    if (!move) break; // a canonical log never contains an illegal ply
    const color = s.turn;
    const after = applyMove(s, move);
    out.push({ ply, color, piece: move.piece, captured: move.captured, san: toSan(move, after), after });
    s = after;
  }
  return out;
}

export interface Captures {
  /** Black pieces White has captured. */
  byWhite: PieceType[];
  /** White pieces Black has captured. */
  byBlack: PieceType[];
  /** Positive → White is ahead in material by this many points. */
  whiteLead: number;
}

const CAPTURE_ORDER: Record<PieceType, number> = { q: 0, r: 1, b: 2, n: 3, p: 4, k: 5 };

export function tallyCaptures(moves: MoveInfo[]): Captures {
  const byWhite: PieceType[] = [];
  const byBlack: PieceType[] = [];
  for (const m of moves) {
    if (!m.captured) continue;
    (m.color === 'w' ? byWhite : byBlack).push(m.captured);
  }
  const sort = (a: PieceType[]) => a.sort((x, y) => CAPTURE_ORDER[x] - CAPTURE_ORDER[y]);
  const val = (a: PieceType[]) => a.reduce((s, p) => s + PIECE_VALUE[p], 0);
  return { byWhite: sort(byWhite), byBlack: sort(byBlack), whiteLead: val(byWhite) - val(byBlack) };
}
