/**
 * Chess piece silhouettes — inline SVG, emoji-free, in keeping with the app's
 * icon language. Each piece is a filled shape whose fill/stroke come from the
 * piece colour, so a White piece reads on a dark square and a Black piece reads
 * on a light one (contrasting outline + a soft drop-shadow do the lifting).
 */

import type { Color, PieceType } from '@games/chess/domain/types';
import { UNICORN_2D, useChessTheme, type PieceColors } from './chessTheme';

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

/**
 * The enchanted set — Team Rose vs Team Lavender. Sparkle pawn, unicorn-head
 * knight (golden horn), crystal bishop, fairytale tower, heart-crown queen,
 * star-crown king. Same 45×45 canvas as the classic set.
 */
const UNICORN_PIECES: Record<PieceType, (c: PieceColors) => JSX.Element> = {
  p: (c) => (
    <>
      <path d="M22.5 7 C23.7 15 26.5 17.8 34 19 C26.5 20.2 23.7 23 22.5 31 C21.3 23 18.5 20.2 11 19 C18.5 17.8 21.3 15 22.5 7 Z" />
      <circle cx="22.5" cy="19" r="2.4" fill={c.accent} stroke="none" />
      <path d="M16 34 H29 L31 40 H14 Z" />
    </>
  ),
  n: (c) => (
    <>
      <path d="M24 6 L27.5 13.5 L20.5 13 Z" fill={c.accent} />
      <path d="M18 12 L18.5 6.5 L22 11 Z" />
      <path d="M18.5 14 C13 16 12 22 15 24.5 C11.5 26 11 31 14.5 33 C11.5 34 12 39 16 40 L21 40 C18.5 33 19.5 20 21.5 15 Z" fill={c.accent2} />
      <path d="M17 40 C15.5 31 15.5 24 18.5 18.5 C20.5 15 24 13 28 13.5 C31 14 32.5 18 31.5 23.5 C30.7 28 29.5 30 27 31 L27.5 40 Z" />
      <circle cx="26.5" cy="19" r="1.3" fill={c.stroke} stroke="none" />
      <path d="M14 40 H31 L33 44 H12 Z" />
    </>
  ),
  b: (c) => (
    <>
      {/* A faerie: gossamer wings, a little gown, a golden circlet and wand. */}
      <path d="M18 15 C8.5 9 6 22 17.5 25 Z" fill={c.accent2} opacity="0.85" />
      <path d="M27 15 C36.5 9 39 22 27.5 25 Z" fill={c.accent2} opacity="0.85" />
      <circle cx="22.5" cy="11.5" r="3.4" />
      <path d="M19.2 9.4 A4.4 4.4 0 0 1 25.8 9.4" stroke={c.accent} strokeWidth="1.6" fill="none" />
      <path d="M22.5 15 L27.5 31 H17.5 Z" />
      <path d="M27 22 L31.5 17.5" stroke={c.stroke} strokeWidth="1.2" fill="none" />
      <path d="M31.5 14.6 l.9 2 l2 .9 l-2 .9 l-.9 2 l-.9 -2 l-2 -.9 l2 -.9 Z" fill={c.accent} stroke="none" />
      <path d="M15 34 H30 L32 40 H13 Z" />
    </>
  ),
  r: (c) => (
    <>
      <path d="M14 40 V16 H31 V40 Z" />
      <path d="M14 16 V12.5 h3 v2 h2.8 v-2 h3.4 v2 h2.8 v-2 h3 V16 Z" />
      <path d="M22.5 25 C21 22.2 17.6 23.2 19 26 L22.5 29.5 L26 26 C27.4 23.2 24 22.2 22.5 25 Z" fill={c.accent} stroke="none" />
      <path d="M12 40 H33 L35 44 H10 Z" />
    </>
  ),
  q: (c) => (
    <>
      <path d="M10.5 30 L13 16 L18 22 L22.5 13 L27 22 L32 16 L34.5 30 Z" />
      <path d="M22.5 11 C21 8.5 17.8 9.5 19.2 12.2 L22.5 15.4 L25.8 12.2 C27.2 9.5 24 8.5 22.5 11 Z" fill={c.accent} />
      <circle cx="13" cy="15" r="1.6" fill={c.accent} stroke="none" />
      <circle cx="32" cy="15" r="1.6" fill={c.accent} stroke="none" />
      <path d="M12.5 30 H32.5 L30.5 39 H14.5 Z" />
      <path d="M11.5 39 H33.5 L35.5 43 H9.5 Z" />
    </>
  ),
  k: (c) => (
    <>
      <path d="M22.5 3.5 l1.4 3.2 l3.4 .3 l-2.6 2.3 l.8 3.4 l-3 -1.8 l-3 1.8 l.8 -3.4 l-2.6 -2.3 l3.4 -.3 Z" fill={c.accent} />
      <path d="M11 30 L14 15 L19 21 L22.5 14 L26 21 L31 15 L34 30 Z" />
      <path d="M13 30 H32 L30 39 H15 Z" />
      <path d="M11.5 39 H33.5 L35.5 43 H9.5 Z" />
    </>
  ),
};

export function ChessPiece({ color, type, size = 44 }: PieceProps) {
  const { theme } = useChessTheme();
  if (theme === 'unicorn') {
    const c = UNICORN_2D[color];
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 45 45"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        data-piece-theme="unicorn"
        style={{ filter: 'drop-shadow(0 2px 2px rgba(60,20,60,0.35))' }}
      >
        <g fill={c.fill} stroke={c.stroke} strokeWidth={1.4}>
          {UNICORN_PIECES[type](c)}
        </g>
      </svg>
    );
  }
  const light = color === 'w';
  const gid = light ? 'cp-grad-w' : 'cp-grad-b';
  const stroke = light ? '#0b1220' : '#cbd5e1';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 45 45"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }}
    >
      {/* A soft top-left highlight fading to a shaded base gives each piece a
          sculpted, carved-from-stone feel rather than a flat silhouette. */}
      <defs>
        <radialGradient id={gid} cx="38%" cy="28%" r="82%">
          {light ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="62%" stopColor="#e9edf3" />
              <stop offset="100%" stopColor="#bcc7d8" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#46536a" />
              <stop offset="60%" stopColor="#232f43" />
              <stop offset="100%" stopColor="#0b1322" />
            </>
          )}
        </radialGradient>
      </defs>
      <g fill={`url(#${gid})`} stroke={stroke} strokeWidth={1.4}>
        {PATHS[type]}
      </g>
    </svg>
  );
}

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
};

export function pieceName(type: PieceType): string {
  return PIECE_NAMES[type];
}
