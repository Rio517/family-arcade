/**
 * Chess piece silhouettes — inline SVG, emoji-free, in keeping with the app's
 * icon language. Each piece is a filled shape whose fill/stroke come from the
 * piece colour, so a White piece reads on a dark square and a Black piece reads
 * on a light one (contrasting outline + a soft drop-shadow do the lifting).
 */

import type { Color, PieceType } from '../game/chess/types';

interface PieceProps {
  color: Color;
  type: PieceType;
  size?: number;
}

// Paths are drawn in a 45×45 box (the de-facto chess-SVG canvas), baseline base
// around y≈40, centred on x≈22.5.
const PATHS: Record<PieceType, JSX.Element> = {
  p: (
    <>
      <circle cx="22.5" cy="13" r="5.5" />
      <path d="M17.5 18 Q22.5 23 27.5 18 L29.5 31 H15.5 Z" />
      <path d="M12 31 H33 L35.5 39 H9.5 Z" />
    </>
  ),
  r: (
    <>
      <path d="M12 18 V12 h3.5 V15 h3.5 V12 h4 V15 h3.5 V12 H33 V18 l-2.5 2.5 V30 h-16 V20.5 Z" />
      <path d="M11 30 H34 L36 39 H9 Z" />
    </>
  ),
  n: (
    <>
      <path d="M22 10 C16.5 10 13.5 14.5 13.5 20 L11 23.5 C10 25.5 12.5 26.5 14.5 24.5 L16.5 22.5 C16.7 26 15 28.5 13.5 31 H32 C32.5 22 31 13.5 24 10.6 C23.3 10.2 22.7 10 22 10 Z" />
      <circle cx="16.5" cy="17.5" r="1.2" fill="#0b1220" stroke="none" />
      <path d="M11.5 31 H33 L35 39 H9.5 Z" />
    </>
  ),
  b: (
    <>
      <circle cx="22.5" cy="9.5" r="2.3" />
      <path d="M22.5 12 C28 15.5 28 22 22.5 26 C17 22 17 15.5 22.5 12 Z" />
      <path d="M22.5 15 V23 M19 19 h7" stroke="#0b1220" strokeWidth="1.4" fill="none" />
      <path d="M15 26 Q22.5 30 30 26 L31.5 31 H13.5 Z" />
      <path d="M12 31 H33 L35 39 H10 Z" />
    </>
  ),
  q: (
    <>
      <path d="M10.5 21 L13 12 L17 18.5 L22.5 10.5 L28 18.5 L32 12 L34.5 21 Z" />
      <circle cx="13" cy="11" r="1.7" />
      <circle cx="22.5" cy="9" r="1.9" />
      <circle cx="32" cy="11" r="1.7" />
      <path d="M12.5 21 H32.5 L30.5 31 H14.5 Z" />
      <path d="M11.5 31 H33.5 L35.5 39 H9.5 Z" />
    </>
  ),
  k: (
    <>
      <path d="M22.5 5 V11 M19.5 7.5 H25.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M11.5 22 L15 14 L19 18.5 L22.5 11.5 L26 18.5 L30 14 L33.5 22 Z" />
      <path d="M13 22 H32 L30 31 H15 Z" />
      <path d="M11.5 31 H33.5 L35.5 39 H9.5 Z" />
    </>
  ),
};

export function ChessPiece({ color, type, size = 44 }: PieceProps) {
  const fill = color === 'w' ? '#f8fafc' : '#111827';
  const stroke = color === 'w' ? '#0b1220' : '#cbd5e1';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 45 45"
      fill={fill}
      stroke={stroke}
      strokeWidth={1.4}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))' }}
    >
      {PATHS[type]}
    </svg>
  );
}

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
};

export function pieceName(type: PieceType): string {
  return PIECE_NAMES[type];
}
