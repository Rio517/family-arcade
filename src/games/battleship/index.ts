import type { GameDescriptor, SavedGameSummary } from '@shared/game';
import preview from './assets/preview.webp';
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
  players: { min: 2, max: 2 },
  seats: { min: 1, max: 1 },
  computer: true,
  path: '/play',
  preview: {
    image: preview,
    facts: ['2 players', 'One iPad each — or the computer', 'About 10 min'],
    blurb:
      'Place your fleet on a moonlit sea and hunt the other captain\'s ships, shot by shot. Four computer captains if nobody else is around.',
  },
  description: 'Two devices, one code. Pick your fleet, place your ships, and duel.',
  Icon: ShipIcon,
  Page: BattleshipPage,
  savedGames,
};
