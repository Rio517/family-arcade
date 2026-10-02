/**
 * How a shared Gulp Universe round is spelled on the wire: the units, the
 * codes and the short lists the host's ticks and snapshots are made of
 * (docs/plans/2026-10-02-gulp-play-together.md, "On the wire").
 *
 * Everything travels as whole numbers, because BinaryPack packs a whole
 * number in one to five bytes and any fraction in nine:
 *
 * - lengths and positions in hundredths of a unit, turns in hundredths of a
 *   radian;
 * - timers in tenths of a second, rounded up, so a timer still running reads
 *   as running on the guest too; "for ever" is -1;
 * - the fuse of a bomb or shell in hundredths of a second, since it sets
 *   where the falling bomb is drawn.
 *
 * A thing is referred to by its id. A thing the guest cannot know yet (a
 * new building, a parked police car) is sent in full, as `makeProp` needs it.
 */
import type { PropKind } from '../domain/catalog';

/** A length, a position or a turn on the wire: hundredths. `|| 0` keeps -0 off the wire. */
export const hundredths = (v: number): number => Math.round(v * 100) || 0;
export const fromHundredths = (v: number): number => v / 100;

/**
 * A timer on the wire: tenths of a second, rounded up. The small allowance
 * keeps a timer of exactly 0.3 s from reading as 0.4 s after the multiply.
 */
export const tenths = (s: number): number => (s === Infinity ? -1 : Math.ceil(s * 10 - 1e-6) || 0);
export const fromTenths = (v: number): number => (v < 0 ? Infinity : v / 10);

/** How far round their loop someone is, 0 to 1, in ten-thousandths. */
export const LOOP_STEPS = 10_000;

export const STATUS = ['countdown', 'playing', 'over'] as const;
export const ENDED = [null, 'time', 'ended', 'out', 'last'] as const;
export const POWERS = ['speed', 'double'] as const;
export const COPS = ['car', 'officer'] as const;
export const COP_STATES = ['drive', 'stand', 'leave'] as const;
export const FOODS = ['treat', 'healthy'] as const;
export const CAUSES = ['chem', 'tanker', 'bomb'] as const;
/** The attacks, in the order their codes go: also the `incoming` event's kinds. */
export const ATTACKS = ['tanker', 'bomber', 'tank', 'heli'] as const;

/** The first word of each event on the wire. */
export const EV = {
  eat: 0,
  regrow: 1,
  crumb: 2,
  rebuild: 3,
  park: 4,
  news: 5,
  food: 6,
  combo: 7,
  wonder: 8,
  police: 9,
  gulp: 10,
  level: 11,
  respawn: 12,
  out: 13,
  power: 14,
  hurt: 15,
  boom: 16,
  incoming: 17,
  back: 18,
} as const;

/**
 * A hole: where it is and how it moves, its size, score and lives (-1: none
 * to lose), whether it is in play, its timers, its combo streak, how many
 * times it has come back, and how long its device has been gone (-1: here).
 */
export type HoleWire = [
  x: number,
  z: number,
  vx: number,
  vz: number,
  r: number,
  score: number,
  lives: number,
  alive: number,
  respawnIn: number,
  safe: number,
  speedTime: number,
  doubleTime: number,
  stun: number,
  burn: number,
  streak: number,
  respawns: number,
  away: number,
];

/** The round's clock and how it stands (see STATUS and ENDED). */
export type ClockWire = [elapsed: number, countdown: number, status: number, endedBy: number, allOut: number];

export type PowerWire = [id: number, kind: number, x: number, z: number, life: number];

/** A police car or officer (see COPS and COP_STATES), and the child it was called to. */
export type CopWire = [id: number, kind: number, child: number, x: number, z: number, heading: number, tx: number, tz: number, state: number, t: number];

/** A bomb, or a shell with where it was fired from and its whole flight time. */
export type BombWire =
  | [id: number, x: number, z: number, radius: number, fuse: number]
  | [id: number, x: number, z: number, radius: number, fuse: number, fromX: number, fromZ: number, fromY: number, flight: number];

/** An attack, by its code in ATTACKS. A bomber's heading is the way it flies. */
export type AttackWire =
  | [kind: 0, id: number, target: number, x: number, z: number, heading: number, speed: number, life: number]
  | [kind: 1, id: number, target: number, x: number, z: number, heading: number, speed: number, life: number, bombs: BombWire[]]
  | [
      kind: 2 | 3,
      id: number,
      target: number,
      wave: number,
      hits: number,
      home: number,
      x: number,
      z: number,
      heading: number,
      speed: number,
      life: number,
      reload: number,
      shots: number,
      shells: BombWire[],
    ];

/** A thing in full: what `makeProp` needs to make it. */
export type PropWire = [id: number, kind: PropKind, variant: number, x: number, z: number, rot: number, hScale: number];

/**
 * What happened, one short list each, by its code in EV. A thing swallowed is
 * named by id, except a police car, officer or tank (a negative id), which
 * the guest never had as a thing and is sent in full. A person's return says
 * which block's pavement they walk (-1: the loop they started on) and how
 * far round it.
 */
export type EventWire =
  | [code: 0, id: number, hole: number, gained: number]
  | [code: 0, id: number, hole: number, gained: number, kind: PropKind, x: number, z: number, rot: number]
  | [code: 1 | 2, id: number]
  | [code: 3, prop: PropWire, replaces: number]
  | [code: 4, prop: PropWire]
  | [code: 5, text: string, x: number, z: number]
  | [code: 6, hole: number, food: number, bonus: number]
  | [code: 7, hole: number, mult: number]
  | [code: 8, hole: number, kind: PropKind, points: number]
  | [code: 9, x: number, z: number]
  | [code: 10, eater: number, eaten: number, points: number]
  | [code: 11, hole: number, level: number]
  | [code: 12 | 13, hole: number]
  | [code: 14, hole: number, kind: number]
  | [code: 15, hole: number, cause: number]
  | [code: 16, x: number, z: number, size: number]
  | [code: 17, target: number, kind: number]
  | [code: 18, person: number, block: number, t: number];

/** What a hole has done this round, for the results: a snapshot's share. */
export type TallyWire = [kills: number, gulped: number, wonderKinds: PropKind[], biggest: [kind: PropKind, points: number] | null, eatenBy: string | null];

/** The once-a-second check: things standing, the sum of their ids, and people about. */
export type SumWire = [standing: number, idSum: number, people: number];
