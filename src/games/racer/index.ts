import type { GameDescriptor } from '@shared/game';
import preview from './assets/preview.webp';
import { BoltIcon } from '@shared/ui/icons';
import { RacerPage } from './components/RacerPage';

export const racer: GameDescriptor = {
  id: 'racer',
  title: 'Rainbow Racer',
  tag: '3D',
  players: { min: 1, max: 2 },
  seats: { min: 1, max: 1 },
  path: '/racer',
  preview: {
    image: preview,
    facts: ['1–2 players', 'One iPad each', 'About 3 min'],
    blurb:
      'Drive a unicorn, dragon, fairy or butterfly around a 3D arena and grab 20 rainbow coins first. Race a friend on their own iPad.',
  },
  description:
    'Drive your unicorn around a sunny 3D arena and scoop up 20 rainbow coins as fast as you can!',
  Icon: BoltIcon,
  Page: RacerPage,
};
