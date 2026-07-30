import type { GameDescriptor } from '@shared/game';
import { BoltIcon } from '@shared/ui/icons';
import { RacerPage } from './components/RacerPage';

export const racer: GameDescriptor = {
  id: 'racer',
  title: 'Rainbow Racer',
  tag: '1–2 Players · 3D',
  path: '/racer',
  description:
    'Drive your unicorn around a sunny 3D arena and scoop up 20 rainbow coins as fast as you can!',
  Icon: BoltIcon,
  Page: RacerPage,
};
