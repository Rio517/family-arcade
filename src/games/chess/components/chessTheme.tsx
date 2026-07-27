/**
 * Chess themes — a whole look for the set, applied across every view (flat,
 * tabletop, full 3D, free play, captured trays, the log's mini board):
 *
 * - `classic`: the ivory-vs-slate tournament set.
 * - `unicorn`: the enchanted set — Team Rose vs Team Lavender, sparkle pawns,
 *   unicorn knights with golden horns, crystal bishops, fairytale towers, and
 *   heart & star crowns, on a pink pearl board.
 *
 * The active theme travels by context so deep leaves (drag ghosts, promotion
 * pickers, mini boards) follow along without prop-threading.
 */
import { createContext, useContext } from 'react';

export type ChessThemeId = 'classic' | 'unicorn';

export const CHESS_THEME_KEY = 'chess-theme-v1';

interface ThemeCtxValue {
  theme: ChessThemeId;
  setTheme: (t: ChessThemeId) => void;
}

export const ChessThemeContext = createContext<ThemeCtxValue>({ theme: 'classic', setTheme: () => {} });
export const useChessTheme = () => useContext(ChessThemeContext);

/** Flat 2D colours for a themed piece: body fill, outline, and two accents. */
export interface PieceColors {
  fill: string;
  stroke: string;
  accent: string; // horns, crowns, sparkles — gold
  accent2: string; // manes
}

export const UNICORN_2D: Record<'w' | 'b', PieceColors> = {
  w: { fill: '#ffc9e5', stroke: '#a63f84', accent: '#f7c243', accent2: '#ff7ec0' }, // Team Rose
  b: { fill: '#ddc9ff', stroke: '#6b4bb0', accent: '#f7c243', accent2: '#a98cff' }, // Team Lavender
};

/** Everything the three.js scene needs to dress itself for a theme. */
export interface ScenePalette {
  background: string;
  tileLight: string;
  tileDark: string;
  frame: string;
  edge: string;
  whitePiece: string;
  blackPiece: string;
  /** Gold accent for horns/crowns; absent = plain classic pieces. */
  accent?: string;
  pieceRoughness: number;
}

export const SCENE_PALETTES: Record<ChessThemeId, ScenePalette> = {
  classic: {
    background: '#0d1524',
    tileLight: '#dde5ef',
    tileDark: '#41546f',
    frame: '#1a2334',
    edge: '#0fb3c0',
    whitePiece: '#efe8d6',
    blackPiece: '#232b3a',
    pieceRoughness: 0.34,
  },
  unicorn: {
    background: '#2a1636',
    tileLight: '#fbe3f2',
    tileDark: '#d9a0d0',
    frame: '#43254e',
    edge: '#ff8fd0',
    whitePiece: '#f6bcdb', // Rose pearl
    blackPiece: '#cdb1f2', // Lavender pearl
    accent: '#e8b64c',
    pieceRoughness: 0.22, // pearlier
  },
};
