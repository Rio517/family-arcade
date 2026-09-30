/**
 * Who can race in Rainbow Racer, what the ones who can't fly ride on, and how
 * each looks on the scoreboard and in the sky. Kept apart from the screens so
 * the scene, the page and the setup can all read it.
 */
import type { RacerLook } from '../three/scene';
import type { CharacterId } from '../three/riders';
import type { MountId } from '../domain/mounts';
// Rendered from the real 3D riders by `npm run racer-portraits`.
import unicornPic from '../assets/portraits/unicorn.webp';
import fairyPic from '../assets/portraits/fairy.webp';
import princessCloudPic from '../assets/portraits/princess-cloud.webp';
import princessBirdPic from '../assets/portraits/princess-bird.webp';
import princessUnicornPic from '../assets/portraits/princess-unicorn.webp';
import bunnyCloudPic from '../assets/portraits/bunny-cloud.webp';
import bunnyBirdPic from '../assets/portraits/bunny-bird.webp';
import bunnyUnicornPic from '../assets/portraits/bunny-unicorn.webp';

export interface Driver {
  id: CharacterId;
  name: string;
  /** How they fly, in a few words, for the picker. */
  flies: string;
  /** The name a computer rival of this character goes by. */
  rival: string;
  /** A picture of the racer as it flies (on its usual ride), for the menus and the scoreboard. */
  portrait: string;
  color: number;
  css: string;
  /**
   * A racer who can't fly picks a ride. `usual` is the one a computer rival
   * takes; `portraits` pictures this racer on each ride.
   */
  rides?: { usual: MountId; portraits: Record<MountId, string> };
}

/**
 * The cast, by the lead designer's rules: whoever can fly, flies by herself;
 * whoever can't rides something that flies, and gets to pick it. No dragons.
 */
export const DRIVERS: Driver[] = [
  { id: 'unicorn', name: 'Unicorn', flies: 'Flies on her own wings', rival: 'Sparkle', portrait: unicornPic, color: 0xff7fc4, css: '#ff7fc4' },
  { id: 'fairy', name: 'Fairy', flies: 'Flies by herself', rival: 'Flutter', portrait: fairyPic, color: 0xa78bfa, css: '#a78bfa' },
  {
    id: 'princess',
    name: 'Princess',
    flies: 'Rides a cloud, a bird or a unicorn',
    rival: 'Pearl',
    portrait: princessUnicornPic,
    color: 0xffa94d,
    css: '#f08c1a',
    rides: { usual: 'unicorn', portraits: { cloud: princessCloudPic, bird: princessBirdPic, unicorn: princessUnicornPic } },
  },
  {
    id: 'bunny',
    name: 'Bunny',
    flies: 'Rides a cloud, a bird or a unicorn',
    rival: 'Hopper',
    portrait: bunnyCloudPic,
    color: 0x6cc6ff,
    css: '#2f9fe0',
    rides: { usual: 'cloud', portraits: { cloud: bunnyCloudPic, bird: bunnyBirdPic, unicorn: bunnyUnicornPic } },
  },
];

interface Mount {
  id: MountId;
  name: string;
  /** What it's like to ride, in a few words, for the picker. */
  blurb: string;
}

/** The rides, in the order the picker shows them. */
export const MOUNTS: Mount[] = [
  { id: 'cloud', name: 'Cloud', blurb: 'Soft and fluffy' },
  { id: 'bird', name: 'Bird', blurb: 'Big flappy wings' },
  { id: 'unicorn', name: 'Unicorn', blurb: 'Rainbow mane and wings' },
];

export const driverById = (id: string): Driver => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];

/** The ride a racer is on: the one picked, or their usual; null for a racer who flies. */
function rideOf(d: Driver, mount: MountId | null = null): MountId | null {
  return d.rides ? (mount ?? d.rides.usual) : null;
}

/** The racer's picture, on the ride they're on. */
export function portraitOf(d: Driver, mount: MountId | null = null): string {
  const ride = rideOf(d, mount);
  return d.rides && ride ? d.rides.portraits[ride] : d.portrait;
}

export const lookOf = (d: Driver, label = '', mount: MountId | null = null): RacerLook => ({
  portrait: portraitOf(d, mount),
  color: d.color,
  character: d.id,
  mount: rideOf(d, mount) ?? undefined,
  label,
});

/** The computer rivals for a one-player race: everyone you didn't pick. */
export function rivalsFor(d: Driver): Driver[] {
  return DRIVERS.filter((r) => r.id !== d.id);
}
