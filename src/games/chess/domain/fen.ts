/**
 * Forsyth–Edwards Notation (FEN) ⇄ GameState.
 *
 * FEN is the standard one-line encoding of a chess position. It keeps the tests
 * readable (positions are written as strings) and gives the UI a compact way to
 * describe an opening or a puzzle. Ranks are listed 8→1, which matches our
 * row 0 = rank 8 convention exactly.
 */

import {
  type Board,
  type GameState,
  type Piece,
  type PieceType,
  type Square,
} from './types';

const PIECE_LETTERS: Record<string, PieceType> = {
  p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k',
};

function letterToPiece(ch: string): Piece {
  const type = PIECE_LETTERS[ch.toLowerCase()];
  return { color: ch === ch.toUpperCase() ? 'w' : 'b', type };
}

function pieceToLetter(p: Piece): string {
  return p.color === 'w' ? p.type.toUpperCase() : p.type;
}

/** Parse a FEN string into a GameState. Throws on malformed input. */
export function parseFen(fen: string): GameState {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`Bad FEN: ${fen}`);
  const [placement, active, castling, ep, half = '0', full = '1'] = parts;

  const board: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`Bad FEN ranks: ${fen}`);
  for (let row = 0; row < 8; row++) {
    let col = 0;
    for (const ch of rows[row]) {
      if (/\d/.test(ch)) {
        col += Number(ch);
      } else {
        if (col > 7) throw new Error(`Bad FEN rank overflow: ${fen}`);
        board[row][col] = letterToPiece(ch);
        col++;
      }
    }
  }

  return {
    board,
    turn: active === 'b' ? 'b' : 'w',
    castling: {
      wK: castling.includes('K'),
      wQ: castling.includes('Q'),
      bK: castling.includes('k'),
      bQ: castling.includes('q'),
    },
    enPassant: ep === '-' ? null : parseSquare(ep),
    halfmoveClock: Number(half) || 0,
    fullmoveNumber: Number(full) || 1,
  };
}

/** Serialize a GameState back to FEN (mainly for tests / debugging). */
export function toFen(state: GameState): string {
  const rows: string[] = [];
  for (let row = 0; row < 8; row++) {
    let out = '';
    let gap = 0;
    for (let col = 0; col < 8; col++) {
      const p = state.board[row][col];
      if (!p) {
        gap++;
      } else {
        if (gap) {
          out += gap;
          gap = 0;
        }
        out += pieceToLetter(p);
      }
    }
    if (gap) out += gap;
    rows.push(out);
  }
  const c = state.castling;
  const castle =
    `${c.wK ? 'K' : ''}${c.wQ ? 'Q' : ''}${c.bK ? 'k' : ''}${c.bQ ? 'q' : ''}` || '-';
  const ep = state.enPassant ? squareToName(state.enPassant) : '-';
  return `${rows.join('/')} ${state.turn} ${castle} ${ep} ${state.halfmoveClock} ${state.fullmoveNumber}`;
}

const FILES = 'abcdefgh';

function parseSquare(name: string): Square {
  const col = FILES.indexOf(name[0]);
  const rank = Number(name[1]); // 1..8
  return { row: 8 - rank, col };
}

function squareToName(sq: Square): string {
  return `${FILES[sq.col]}${8 - sq.row}`;
}
