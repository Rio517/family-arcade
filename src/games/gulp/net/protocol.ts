/**
 * The wire protocol for a Gulp Universe round on several devices.
 *
 * The host's device runs the round (docs/plans/2026-10-02-gulp-play-together.md).
 * Each guest builds the same city from the round's seed, steers its own hole
 * on its own screen and reports where it is with `pos`; the host decides
 * everything else and sends it back. Up to four children: the host is seat 0,
 * guests take seats 1 to 3, computer holes the seats after them.
 *
 * Joining: `hello` on every fresh channel, then the host's `lobby` while it
 * picks a map, `start` for a round, `ready` once a guest's city is built.
 *
 * `isGulpMsg` is the single choke point for inbound data: anything malformed or
 * oversized is dropped before it reaches the game.
 */
import { SKINS } from '../components/skins';
import { KINDS, type PropKind } from '../domain/catalog';
import { MAPS, type MapId } from '../domain/city';
import type { Difficulty } from '../domain/rivals';

/** The broker id prefix, so a Gulp code never collides with another game's. */
export const GULP_PREFIX = 'gulp-v1-';
/** Children in one round: the host and three guests. */
export const MAX_CHILDREN = 4;
/** Every hole in a round, children and computer: more than the biggest map holds. */
export const MAX_HOLES = 12;
const MAX_NAME_LEN = 40;
const MAX_TOKEN_LEN = 40;
const SKIN_COUNT = SKINS.length;

/** A seat at the table: a child on a device, or a computer hole. */
export interface Seat {
  name: string;
  skin: number;
  human: boolean;
}

/** What the host picked on its menu, which every device's round is built from. */
export interface RoundSettings {
  map: MapId;
  difficulty: Difficulty;
  /** Seconds; 0 plays until the host ends it. */
  duration: number;
  powerups: boolean;
  fightBack: boolean;
}

/**
 * Both ways, on every fresh channel. `token` is the seat a guest was given,
 * so a guest who drops (or reloads) and comes back gets its own hole again;
 * `inRound` says it still has a round going.
 */
export interface HelloMsg {
  t: 'hello';
  name: string;
  skin: number;
  token: string;
  inRound: boolean;
}

/** Host → guest, whenever the menu changes: the settings and who is at the table. */
export interface LobbyMsg {
  t: 'lobby';
  settings: RoundSettings;
  /** The children at the table so far, host first. */
  children: Seat[];
}

/** Guest → host: the colour this child wants (taken colours go to the next free one). */
export interface PickMsg {
  t: 'pick';
  skin: number;
}

/** Host → guest: a round begins. Every device builds the same world from this. */
export interface StartMsg {
  t: 'start';
  /** A whole number for `seededRng`. */
  seed: number;
  settings: RoundSettings;
  /** The wonders the host's deck dealt, so every city has the same ones. */
  wonders: PropKind[];
  /** Every hole in order: the children, then the computer holes. */
  seats: Seat[];
  /** Which seat is yours. */
  you: number;
}

/** Guest → host: my city is built; the 3-2-1 can start. */
export interface ReadyMsg {
  t: 'ready';
}

/**
 * Guest → host, about 20 times a second: where my hole is and how it moves,
 * in hundredths of a unit (whole numbers pack small). `seq` counts up, so a
 * late one is ignored.
 */
export interface PosMsg {
  t: 'pos';
  seq: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Host → guest: the round is over; the standings by hole id, best first. */
export interface OverMsg {
  t: 'over';
  order: number[];
}

/** Guest → host, from the results card: another round, please. */
export interface AgainMsg {
  t: 'again';
}

export type GulpMsg = HelloMsg | LobbyMsg | PickMsg | StartMsg | ReadyMsg | PosMsg | OverMsg | AgainMsg;

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const inRange = (v: unknown, lo: number, hi: number): v is number => isInt(v) && v >= lo && v <= hi;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const DIFFICULTIES: readonly unknown[] = ['easy', 'medium', 'hard'];

function isSettings(v: unknown): v is RoundSettings {
  if (!isRecord(v)) return false;
  return (
    typeof v.map === 'string' &&
    Object.hasOwn(MAPS, v.map) &&
    DIFFICULTIES.includes(v.difficulty) &&
    inRange(v.duration, 0, 60 * 60) &&
    isBool(v.powerups) &&
    isBool(v.fightBack)
  );
}

function isSeat(v: unknown): v is Seat {
  return isRecord(v) && isStr(v.name, MAX_NAME_LEN) && inRange(v.skin, 0, SKIN_COUNT - 1) && isBool(v.human);
}

const isSeats = (v: unknown, max: number): v is Seat[] => Array.isArray(v) && v.length >= 1 && v.length <= max && v.every(isSeat);

export function isGulpMsg(value: unknown): value is GulpMsg {
  if (!isRecord(value)) return false;
  const m = value;
  switch (m.t) {
    case 'hello':
      return isStr(m.name, MAX_NAME_LEN) && inRange(m.skin, 0, SKIN_COUNT - 1) && isStr(m.token, MAX_TOKEN_LEN) && isBool(m.inRound);
    case 'lobby':
      return isSettings(m.settings) && isSeats(m.children, MAX_CHILDREN);
    case 'pick':
      return inRange(m.skin, 0, SKIN_COUNT - 1);
    case 'start':
      return (
        inRange(m.seed, 0, 2 ** 32 - 1) &&
        isSettings(m.settings) &&
        Array.isArray(m.wonders) &&
        m.wonders.length <= 64 &&
        m.wonders.every((k) => typeof k === 'string' && Object.hasOwn(KINDS, k)) &&
        isSeats(m.seats, MAX_HOLES) &&
        inRange(m.you, 1, MAX_CHILDREN - 1) &&
        m.you < m.seats.length
      );
    case 'ready':
    case 'again':
      return true;
    case 'pos':
      return isInt(m.seq) && m.seq >= 0 && [m.x, m.z, m.vx, m.vz].every((n) => isInt(n) && Math.abs(n) < 1e9);
    case 'over':
      return Array.isArray(m.order) && m.order.length <= MAX_HOLES && m.order.every((n) => inRange(n, 0, MAX_HOLES - 1));
    default:
      return false;
  }
}
