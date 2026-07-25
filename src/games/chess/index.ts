import type { GameDescriptor } from '@shared/game';
import { ChessIcon } from '@shared/ui/icons';
import { ChessPage } from './components/ChessPage';
import { loadResumableChessGame } from './storage/chessPersistence';

export const chess: GameDescriptor = {
  id: 'chess',
  title: 'Chess',
  tag: '2-Player',
  path: '/chess',
  description: 'Drag-and-drop chess — same device or online with a code.',
  Icon: ChessIcon,
  Page: ChessPage,
  loadResumable: () => {
    const r = loadResumableChessGame();
    return r ? { code: r.code, label: `vs ${r.oppName || 'opponent'}` } : null;
  },
};
