import type { GameDescriptor, SavedGameSummary } from '@shared/game';
import { ChessIcon } from '@shared/ui/icons';
import { ChessPage } from './components/ChessPage';
import { loadLocalChessGame, loadResumableChessGame } from './storage/chessPersistence';

/** The Save Station rows for chess: one same-device save, one online game. */
function savedGames(): SavedGameSummary[] {
  const out: SavedGameSummary[] = [];
  const chessLocal = loadLocalChessGame();
  if (chessLocal) {
    const moves = Math.ceil(chessLocal.log.length / 2);
    out.push({
      key: 'chess-local',
      to: '/chess?resume=local',
      color: '#e8b64c',
      Icon: ChessIcon,
      title: `Chess — ${chessLocal.whiteName} vs ${chessLocal.blackName}`,
      meta: `same device · ${moves === 0 ? 'fresh setup' : `${moves} move${moves === 1 ? '' : 's'} in`}${chessLocal.start ? ' · custom' : ''}`,
    });
  }
  const chessOnline = loadResumableChessGame();
  if (chessOnline) {
    out.push({
      key: 'chess-online',
      to: `/chess?resume=${chessOnline.code}`,
      color: '#e8b64c',
      Icon: ChessIcon,
      title: `Chess — vs ${chessOnline.oppName || 'opponent'}`,
      meta: `online · code ${chessOnline.code}`,
    });
  }
  return out;
}

export const chess: GameDescriptor = {
  id: 'chess',
  title: 'Chess',
  players: { min: 1, max: 2 },
  seats: { min: 1, max: 2 },
  path: '/chess',
  description: 'Drag-and-drop chess — same device or online with a code.',
  Icon: ChessIcon,
  Page: ChessPage,
  savedGames,
};
