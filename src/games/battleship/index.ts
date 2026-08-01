import type { GameDescriptor, SavedGameSummary } from '@shared/game';
import { ShipIcon } from '@shared/ui/icons';
import { BattleshipPage } from './components/BattleshipPage';
import { loadResumableSession } from './storage/sessionStore';

/** The Save Station row for an unfinished online battle, if there is one. */
function savedGames(): SavedGameSummary[] {
  const ship = loadResumableSession();
  if (!ship) return [];
  return [{
    key: 'battleship',
    to: `/play?resume=${ship.code}`,
    color: '#35c7e8',
    Icon: ShipIcon,
    title: `Ship Battle — vs ${ship.oppName || 'opponent'}`,
    meta: `online · code ${ship.code}`,
  }];
}

export const battleship: GameDescriptor = {
  id: 'battleship',
  title: 'Ship Battle',
  tag: '2 Players',
  path: '/play',
  description: 'Two devices, one code. Pick your fleet, place your ships, and duel.',
  Icon: ShipIcon,
  Page: BattleshipPage,
  savedGames,
};
