import type { GameDescriptor } from '@shared/game';
import preview from './assets/preview.webp';
import { UnicornIcon } from '@shared/ui/icons';
import { UnicornPage } from './components/UnicornPage';

export const unicorn: GameDescriptor = {
  id: 'unicorn',
  title: 'Magic Coins',
  players: { min: 1, max: 3 },
  seats: { min: 1, max: 3 },
  path: '/unicorn',
  preview: {
    image: preview,
    facts: ['1–3 players', 'One iPad, passed around', 'About 5 min'],
    blurb:
      'Fly the sky or swim the sea as your favourite character and race to 20 rainbow coins. Quick, silly, and made for little ones.',
  },
  description:
    'Fly the sky or swim the sea, pick your character, and race to 20 rainbow coins. Grab power-ups on the way!',
  Icon: UnicornIcon,
  Page: UnicornPage,
};
