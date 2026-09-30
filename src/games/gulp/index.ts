import { lazy } from 'react';
import type { GameDescriptor } from '@shared/game';
import preview from './assets/preview.webp';
import { GulpIcon } from '@shared/ui/icons';

/** The game itself loads when its door is opened, not with the arcade's front page. */
const GulpPage = lazy(() => import('./components/GulpPage').then((m) => ({ default: m.GulpPage })));

/**
 * What the arcade knows about Gulp Universe: the ticket on the wall, the route,
 * who can play. The registry lists this and nothing else needs to.
 */
export const gulp: GameDescriptor = {
  id: 'gulp',
  title: 'Gulp Universe',
  players: { min: 1, max: 1 },
  seats: { min: 1, max: 1 },
  computer: true,
  path: '/gulp',
  preview: {
    image: preview,
    facts: ['1 player vs the computer', 'Town to a whole region', '2–10 min'],
    blurb:
      'You are a hungry hole in a toy city. Swallow cones, then cars, then buses, towers, stadiums and even mountains. Grow bigger than the other holes before the clock runs out!',
  },
  description: 'Be a hungry hole: swallow the city, grow bigger and bigger, and out-eat the computer holes.',
  Icon: GulpIcon,
  Page: GulpPage,
};
