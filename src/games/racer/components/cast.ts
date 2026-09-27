/**
 * Who can race in Rainbow Racer, and how each one looks on the scoreboard and
 * in the sky. Kept apart from the screens so the scene, the page and the
 * setup can all read it.
 */
import type { RacerLook } from '../three/scene';
import type { CharacterId } from '../three/riders';

export interface Driver {
  id: CharacterId;
  name: string;
  /** How they fly, in a few words, for the picker. */
  flies: string;
  /** The name a computer rival of this character goes by. */
  rival: string;
  emoji: string;
  color: number;
  css: string;
}

/**
 * The cast, by the lead designer's rules: whoever can fly, flies by herself;
 * whoever can't, rides something that flies. No dragons.
 */
export const DRIVERS: Driver[] = [
  { id: 'unicorn', name: 'Unicorn', flies: 'Flies on her own wings', rival: 'Sparkle', emoji: '🦄', color: 0xff7fc4, css: '#ff7fc4' },
  { id: 'fairy', name: 'Fairy', flies: 'Flies by herself', rival: 'Flutter', emoji: '🧚', color: 0xa78bfa, css: '#a78bfa' },
  { id: 'princess', name: 'Princess', flies: 'Rides a flying unicorn', rival: 'Pearl', emoji: '👸', color: 0xffa94d, css: '#f08c1a' },
  { id: 'bunny', name: 'Bunny', flies: 'Rides a fluffy cloud', rival: 'Hopper', emoji: '🐰', color: 0x6cc6ff, css: '#2f9fe0' },
];

export const driverById = (id: string): Driver => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
export const lookOf = (d: Driver, label = ''): RacerLook => ({
  emoji: d.emoji,
  color: d.color,
  character: d.id,
  label,
});

/** The computer rivals for a one-player race: everyone you didn't pick. */
export function rivalsFor(d: Driver): Driver[] {
  return DRIVERS.filter((r) => r.id !== d.id);
}
