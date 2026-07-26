import type { GameDescriptor } from '@shared/game';
import { ShipIcon } from '@shared/ui/icons';
import { BattleshipPage } from './components/BattleshipPage';

export const battleship: GameDescriptor = {
  id: 'battleship',
  title: 'Ship Battle',
  tag: '2-Player',
  path: '/play',
  description: 'Two devices, one code. Pick your fleet, place your ships, and duel.',
  Icon: ShipIcon,
  Page: BattleshipPage,
};
