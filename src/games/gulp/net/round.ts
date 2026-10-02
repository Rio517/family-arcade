/**
 * A shared round's world, built the same way on every device: the host's real
 * one and each guest's mirror come from the same seed, settings, wonders and
 * seats, so the city, the people and the starting spots match exactly.
 */
import { seededRng } from '@shared/rng';
import type { PropKind } from '../domain/catalog';
import { createWorld, type Racer, type World } from '../domain/world';
import type { RoundSettings, Seat } from './protocol';

export interface RoundStart {
  seed: number;
  settings: RoundSettings;
  wonders: PropKind[];
  seats: Seat[];
}

/** The children are the seats at the front of the list that a child sits in; the rest are computer holes. */
export function buildRound(start: RoundStart): World {
  const { seed, settings, wonders, seats } = start;
  const first = seats.findIndex((s) => !s.human);
  const children = first < 0 ? seats.length : first;
  const racer = ({ name, skin }: Seat): Racer => ({ name, skin });
  return createWorld(seededRng(seed), seats.slice(0, children).map(racer), seats.slice(children).map(racer), {
    map: settings.map,
    duration: settings.duration,
    powerups: settings.powerups,
    fightBack: settings.fightBack,
    difficulty: settings.difficulty,
    wonders,
    regrow: true,
    shared: true,
  });
}
