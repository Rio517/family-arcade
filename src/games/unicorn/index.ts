import type { GameDescriptor } from '@shared/game';
import { UnicornIcon } from '@shared/ui/icons';
import { UnicornPage } from './components/UnicornPage';

export const unicorn: GameDescriptor = {
  id: 'unicorn',
  title: 'Magic Coins',
  tag: '1–3 Players',
  path: '/unicorn',
  description:
    'Fly the sky or swim the sea, pick your character, and race to 20 rainbow coins. Grab power-ups on the way!',
  Icon: UnicornIcon,
  Page: UnicornPage,
};
