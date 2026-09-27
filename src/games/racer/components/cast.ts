/**
 * Who can race in Rainbow Racer, and how each one looks on the scoreboard and
 * in the sky. Kept apart from the screens so the scene, the page and the
 * setup can all read it.
 */
import type { RacerLook } from '../three/scene';
import type { CharacterId } from '../three/riders';
// Rendered from the real 3D riders by `npm run racer-portraits`.
import unicornPic from '../assets/portraits/unicorn.webp';
import fairyPic from '../assets/portraits/fairy.webp';
import princessPic from '../assets/portraits/princess.webp';
import bunnyPic from '../assets/portraits/bunny.webp';

export interface Driver {
  id: CharacterId;
  name: string;
  /** How they fly, in a few words, for the picker. */
  flies: string;
  /** The name a computer rival of this character goes by. */
  rival: string;
  /** A picture of the racer as it flies, for the menus and the scoreboard. */
  portrait: string;
  color: number;
  css: string;
}

/**
 * The cast, by the lead designer's rules: whoever can fly, flies by herself;
 * whoever can't, rides something that flies. No dragons.
 */
export const DRIVERS: Driver[] = [
  { id: 'unicorn', name: 'Unicorn', flies: 'Flies on her own wings', rival: 'Sparkle', portrait: unicornPic, color: 0xff7fc4, css: '#ff7fc4' },
  { id: 'fairy', name: 'Fairy', flies: 'Flies by herself', rival: 'Flutter', portrait: fairyPic, color: 0xa78bfa, css: '#a78bfa' },
  { id: 'princess', name: 'Princess', flies: 'Rides a flying unicorn', rival: 'Pearl', portrait: princessPic, color: 0xffa94d, css: '#f08c1a' },
  { id: 'bunny', name: 'Bunny', flies: 'Rides a fluffy cloud', rival: 'Hopper', portrait: bunnyPic, color: 0x6cc6ff, css: '#2f9fe0' },
];

export const driverById = (id: string): Driver => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
export const lookOf = (d: Driver, label = ''): RacerLook => ({
  portrait: d.portrait,
  color: d.color,
  character: d.id,
  label,
});

/** The computer rivals for a one-player race: everyone you didn't pick. */
export function rivalsFor(d: Driver): Driver[] {
  return DRIVERS.filter((r) => r.id !== d.id);
}
