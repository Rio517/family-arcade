/**
 * Chess themes — a whole look for the set AND the room it sits in, applied
 * across every view (flat, tabletop, full 3D, free play, captured trays, the
 * log's mini board) and the page chrome around them:
 *
 * - `classic`: "The War Room" — the tournament set at home in the same
 *   wood-panelled study as Risk. Marble squares, a leather-and-brass room,
 *   ivory vs ebony pieces.
 * - `unicorn`: the enchanted set — Team Rose vs Team Lavender, sparkle pawns,
 *   unicorn knights with golden horns, faerie bishops, fairytale towers, and
 *   heart & star crowns, in a candy-pink twilight.
 * - `galaxy`: the Galaxy Fleet — the Comet Guard vs the Nebula Fleet. Light
 *   flies the Comet Guard (arrow-fighter pawns, dart-ship knights, twin-engine
 *   hauler bishops, a hammerhead cruiser rook, a beloved saucer freighter
 *   queen, a whale-back flagship king); dark fields the Nebula Fleet
 *   (twin-panel fighters and dagger-panel flyers, a fin shuttle, wedge
 *   cruisers, and a moon fortress).
 *
 * The active theme travels by context so deep leaves (drag ghosts, promotion
 * pickers, mini boards) follow along without prop-threading.
 */
import { createContext, useContext } from 'react';

export type ChessThemeId = 'classic' | 'unicorn' | 'galaxy';

export const CHESS_THEME_KEY = 'chess-theme-v1';

/** Picker order + labels, shared by the game side panel and free play. */
export const CHESS_THEMES: { id: ChessThemeId; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'unicorn', label: 'Unicorn' },
  { id: 'galaxy', label: 'Galaxy' },
];

/** Read the persisted theme, tolerating junk from older builds. */
export function storedChessTheme(): ChessThemeId {
  try {
    const t = localStorage.getItem(CHESS_THEME_KEY);
    return t === 'unicorn' || t === 'galaxy' ? t : 'classic';
  } catch {
    return 'classic';
  }
}

interface ThemeCtxValue {
  theme: ChessThemeId;
  setTheme: (t: ChessThemeId) => void;
}

export const ChessThemeContext = createContext<ThemeCtxValue>({ theme: 'classic', setTheme: () => {} });
export const useChessTheme = () => useContext(ChessThemeContext);

/** Flat 2D colours for a themed piece: body fill, outline, and accents. */
export interface PieceColors {
  fill: string;
  stroke: string;
  accent: string; // horns, crowns, cockpits — the bright detail
  accent2: string; // manes
  glow?: string; // engine glows (galaxy)
}

export const UNICORN_2D: Record<'w' | 'b', PieceColors> = {
  w: { fill: '#ffc9e5', stroke: '#a63f84', accent: '#f7c243', accent2: '#ff7ec0' }, // Team Rose
  b: { fill: '#ddc9ff', stroke: '#6b4bb0', accent: '#f7c243', accent2: '#a98cff' }, // Team Lavender
};

export const GALAXY_2D: Record<'w' | 'b', PieceColors> = {
  // Light = the Comet Guard: off-white hulls with red markings, engines
  // burning orange. Dark = the Nebula Fleet: gunmetal hulls picked out with pale
  // panel lines, cold ice-blue glows.
  w: { fill: '#e3e8f0', stroke: '#39404d', accent: '#e8543f', accent2: '#e3e8f0', glow: '#ff8a5c' },
  b: { fill: '#4d5666', stroke: '#a9b5c9', accent: '#c3cddd', accent2: '#4d5666', glow: '#8fd0ff' },
};

/** Everything the three.js scene needs to dress itself for a theme. */
export interface ScenePalette {
  background: string;
  tileLight: string;
  tileDark: string;
  frame: string;
  edge: string;
  /** How hard the rim under the tiles glows (1.4 = neon; brass wants less). */
  edgeEmissive?: number;
  whitePiece: string;
  blackPiece: string;
  /** Bright detail material — gold horns/crowns, brass royals, ship domes. */
  accent?: string;
  /** Which sculpts to build: turned staunton, fantasy creatures, starships. */
  pieceStyle: 'standard' | 'fantasy' | 'ships';
  /** Per-side engine-glow colours (ships only). */
  whiteGlow?: string;
  blackGlow?: string;
  /** Per-side detail colours (ships only) — Comet Guard markings vs Nebula Fleet trim. */
  whiteAccent?: string;
  blackAccent?: string;
  /** Scatter a starfield around the board. */
  stars?: boolean;
  /** A dream sky: pastel rainbows arching behind the board, drifting clouds. */
  dream?: boolean;
  pieceRoughness: number;
}

export const SCENE_PALETTES: Record<ChessThemeId, ScenePalette> = {
  classic: {
    // The War Room: marble inlay on a walnut table in a mahogany study.
    background: '#241811',
    tileLight: '#e6dcc4',
    tileDark: '#5a4632',
    frame: '#3a2819',
    edge: '#c2a15a',
    edgeEmissive: 0.35,
    whitePiece: '#efe6d0', // ivory
    blackPiece: '#26201a', // ebony
    accent: '#c2a15a', // brass crowns
    pieceStyle: 'standard',
    pieceRoughness: 0.34,
  },
  unicorn: {
    background: '#e9b7dd', // fallback behind the dream-sky dome
    tileLight: '#fbe3f2',
    tileDark: '#d9a0d0',
    frame: '#d9a6de', // rose-quartz terrace — reads warm against the clouds
    edge: '#ff8fd0',
    edgeEmissive: 0.9,
    whitePiece: '#f6bcdb', // Rose pearl
    blackPiece: '#cdb1f2', // Lavender pearl
    accent: '#e8b64c',
    pieceStyle: 'fantasy',
    dream: true, // rainbows and clouds behind the board
    pieceRoughness: 0.22, // pearlier
  },
  galaxy: {
    background: '#05070f',
    tileLight: '#2a3654',
    tileDark: '#121a2c',
    frame: '#0b1120',
    edge: '#3b6ea8',
    edgeEmissive: 0.6,
    whitePiece: '#d9dee8', // Comet Guard hull white
    blackPiece: '#78859c', // Nebula Fleet gunmetal — light enough to read on the dark board
    accent: '#e8eef7',
    pieceStyle: 'ships',
    whiteGlow: '#ff8a5c', // Comet Guard engines burn warm
    blackGlow: '#8fd0ff', // Nebula Fleet engines burn cold
    whiteAccent: '#e8543f', // red squadron stripes
    blackAccent: '#d3deee', // pale Nebula Fleet trim
    stars: true,
    pieceRoughness: 0.3,
  },
};
