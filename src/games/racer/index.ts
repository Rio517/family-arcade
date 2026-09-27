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
  computer: true,
  path: '/racer',
  preview: {
    image: preview,
    facts: ['1–2 players', 'Fly anywhere in the sky', 'About 2 min'],
    blurb:
      'Fly a unicorn or a fairy, or ride one: a princess on a flying unicorn, a bunny on a cloud. Follow the rainbow road and grab 20 coins first; power-ups make you bigger, give you big wings, or pour out coins.',
  },
  description:
    'Mario Kart in the sky: follow the rainbow road or fly anywhere, zoom through rainbow rings, and catch power-ups. Race the computer or a friend.',
  Icon: BoltIcon,
  Page: RacerPage,
};
