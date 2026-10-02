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
 * Playing: the host sends a `tick` 20 times a second, and a `snap` (all of the
 * round) to a guest who comes back or asks with `resync`. How they spell the
 * round is in wire.ts.
 *
 * `isGulpMsg` is the single choke point for inbound data: anything malformed or
 * oversized is dropped before it reaches the game.
 */
import { SKINS } from '../components/skins';
import { KINDS, type PropKind } from '../domain/catalog';
import { MAPS, type MapId } from '../domain/city';
import { PERSON_ID } from '../domain/people';
import type { Difficulty } from '../domain/rivals';
import { ATTACKS, CAUSES, COP_STATES, COPS, ENDED, EV, FOODS, LOOP_STEPS, POWERS, STATUS } from './wire';
import type { AttackWire, BombWire, ClockWire, CopWire, EventWire, HoleWire, PowerWire, PropWire, SumWire, TallyWire } from './wire';

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

/**
 * Host → guest, 20 times a second: the round as it stands and what happened
 * since the last tick. `seq` counts up from 0 by one a tick, so a guest can
 * tell when it has missed one. Every CHECK_EVERY ticks (see codec.ts) `sum`
 * says what the guest's city should add up to.
 */
export interface TickMsg {
  t: 'tick';
  seq: number;
  clock: ClockWire;
  /** Every hole, by id. */
  holes: HoleWire[];
  power: PowerWire[];
  cops: CopWire[];
  attacks: AttackWire[];
  /** What happened since the last tick, in order. */
  events: EventWire[];
  sum?: SumWire;
}

/**
 * Host → guest: all of the round as it stands now, for a guest who comes
 * back or has drifted. `seq` is the tick the host sends next; that tick may
 * repeat a little of what the snapshot already holds.
 */
export interface SnapshotMsg {
  t: 'snap';
  seq: number;
  clock: ClockWire;
  holes: HoleWire[];
  /** What each hole has done this round, by id. */
  tally: TallyWire[];
  power: PowerWire[];
  cops: CopWire[];
  attacks: AttackWire[];
  /** Which things stand, by id from 1: seven ids to a number, the lowest id in the lowest bit. */
  stand: number[];
  /** Things built during the round that stand or may be put back. */
  added: PropWire[];
  /**
   * Two numbers for each person, in order: how far round their loop
   * (-1 while swallowed), and the block whose pavement they walk (-1 for the
   * loop they started on).
   */
  people: number[];
}

/** Guest → host: my copy of the round has drifted; send me a snapshot. */
export interface ResyncMsg {
  t: 'resync';
}

export type GulpMsg = HelloMsg | LobbyMsg | PickMsg | StartMsg | ReadyMsg | PosMsg | OverMsg | AgainMsg | TickMsg | SnapshotMsg | ResyncMsg;

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
    Object.prototype.hasOwnProperty.call(MAPS, v.map) &&
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

// ── The round on the wire (see wire.ts) ──────────────────────────────────

/** Events in one tick, at most: a giant swallowing a block makes about 400. */
const MAX_EVENTS = 2000;
/** People in a round, at most: more than the biggest map holds. */
const MAX_PEOPLE = 10_000;
const MAX_POWERUPS = 8;
const MAX_COPS = 32;
const MAX_ATTACKS = 32;
const MAX_BOMBS = 16;
const MAX_ADDED = 20_000;
const MAX_NEWS_LEN = 120;

/** A whole number of hundredths or tenths, well inside any map. */
const isNum = (v: unknown): v is number => isInt(v) && Math.abs(v) < 1e9;
const isTuple = (v: unknown, n: number): v is unknown[] => Array.isArray(v) && v.length === n;
const isList = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const isKind = (v: unknown): v is PropKind => typeof v === 'string' && Object.prototype.hasOwnProperty.call(KINDS, v);
const isCode = (v: unknown, list: readonly unknown[]) => inRange(v, 0, list.length - 1);
/** Ids: things in the city are 1 up, people from PERSON_ID, police and tanks swallowed below 0. */
const isPropId = (v: unknown) => inRange(v, 1, PERSON_ID - 1);
const isPersonId = (v: unknown) => inRange(v, PERSON_ID, PERSON_ID + MAX_PEOPLE - 1);
const isOtherId = (v: unknown) => inRange(v, -999_999, -1);
const isUid = (v: unknown) => inRange(v, 0, 2 ** 31 - 1);

function isClock(v: unknown): v is ClockWire {
  return isTuple(v, 5) && isNum(v[0]) && v[0] >= 0 && isNum(v[1]) && v[1] >= 0 && isCode(v[2], STATUS) && isCode(v[3], ENDED) && inRange(v[4], 0, 1);
}

function isHole(v: unknown): v is HoleWire {
  if (!isTuple(v, 16) || !v.every(isNum)) return false;
  const [, , , , r, score, lives, alive, respawnIn, ...rest] = v as number[];
  return r > 0 && score >= 0 && lives >= -1 && (alive === 0 || alive === 1) && respawnIn >= -1 && rest.every((n) => n >= 0);
}

const isPower = (v: unknown): v is PowerWire =>
  isTuple(v, 5) && isUid(v[0]) && isCode(v[1], POWERS) && isNum(v[2]) && isNum(v[3]) && isNum(v[4]) && v[4] >= 0;

const isCop = (v: unknown, holes: number): v is CopWire =>
  isTuple(v, 10) &&
  isUid(v[0]) &&
  isCode(v[1], COPS) &&
  inRange(v[2], 0, holes - 1) &&
  [v[3], v[4], v[5], v[6], v[7]].every(isNum) &&
  isCode(v[8], COP_STATES) &&
  isNum(v[9]) &&
  v[9] >= 0;

function isBomb(v: unknown): v is BombWire {
  if (!Array.isArray(v) || (v.length !== 5 && v.length !== 9)) return false;
  return isUid(v[0]) && v.slice(1).every(isNum) && (v[3] as number) >= 0;
}

const isBombs = (v: unknown): v is BombWire[] => isList(v, MAX_BOMBS) && v.every(isBomb);

function isAttack(v: unknown, holes: number): v is AttackWire {
  if (!Array.isArray(v) || !isUid(v[1]) || !inRange(v[2], 0, holes - 1)) return false;
  switch (v[0]) {
    case 0:
      return v.length === 8 && v.slice(3).every(isNum);
    case 1:
      return v.length === 9 && v.slice(3, 8).every(isNum) && isBombs(v[8]);
    case 2:
    case 3:
      return v.length === 14 && isUid(v[3]) && isNum(v[4]) && inRange(v[5], 0, 1) && v.slice(6, 13).every(isNum) && isBombs(v[13]);
    default:
      return false;
  }
}

const isProp = (v: unknown): v is PropWire =>
  isTuple(v, 7) && isPropId(v[0]) && isKind(v[1]) && inRange(v[2], 0, 255) && isNum(v[3]) && isNum(v[4]) && isNum(v[5]) && inRange(v[6], 1, 100_000);

function isEvent(v: unknown, holes: number): v is EventWire {
  if (!Array.isArray(v)) return false;
  const hole = (i: number) => inRange(v[i], 0, holes - 1);
  const n = v.length;
  switch (v[0]) {
    case EV.eat:
      // A thing the guest has by id, or a police car, officer or tank in full.
      if (n === 4) return (isPropId(v[1]) || isPersonId(v[1])) && hole(2) && inRange(v[3], 0, 1e9);
      return n === 8 && isOtherId(v[1]) && hole(2) && inRange(v[3], 0, 1e9) && isKind(v[4]) && isNum(v[5]) && isNum(v[6]) && isNum(v[7]);
    case EV.regrow:
      return n === 2 && isPropId(v[1]);
    case EV.crumb:
      return n === 2 && (isPropId(v[1]) || isPersonId(v[1]));
    case EV.rebuild:
      return n === 3 && isProp(v[1]) && (v[2] === 0 || isPropId(v[2]));
    case EV.park:
      return n === 2 && isProp(v[1]);
    case EV.news:
      return n === 4 && isStr(v[1], MAX_NEWS_LEN) && isNum(v[2]) && isNum(v[3]);
    case EV.food:
      return n === 4 && hole(1) && isCode(v[2], FOODS) && inRange(v[3], 0, 1e9);
    case EV.combo:
    case EV.level:
      return n === 3 && hole(1) && inRange(v[2], 1, 9999);
    case EV.wonder:
      return n === 4 && hole(1) && isKind(v[2]) && KINDS[v[2]].wonder !== undefined && inRange(v[3], 0, 1e9);
    case EV.police:
      return n === 3 && isNum(v[1]) && isNum(v[2]);
    case EV.gulp:
      return n === 4 && hole(1) && hole(2) && inRange(v[3], 0, 1e9);
    case EV.respawn:
    case EV.out:
      return n === 2 && hole(1);
    case EV.power:
      return n === 3 && hole(1) && isCode(v[2], POWERS);
    case EV.hurt:
      return n === 3 && hole(1) && isCode(v[2], CAUSES);
    case EV.boom:
      return n === 4 && isNum(v[1]) && isNum(v[2]) && isNum(v[3]) && v[3] >= 0;
    case EV.incoming:
      return n === 3 && hole(1) && isCode(v[2], ATTACKS);
    case EV.back:
      return n === 4 && inRange(v[1], 0, MAX_PEOPLE - 1) && inRange(v[2], -1, 99_999) && inRange(v[3], 0, LOOP_STEPS - 1);
    default:
      return false;
  }
}

const isTally = (v: unknown): v is TallyWire =>
  isTuple(v, 5) &&
  inRange(v[0], 0, 1e9) &&
  inRange(v[1], 0, 1e9) &&
  isList(v[2], 64) &&
  v[2].every(isKind) &&
  (v[3] === null || (isTuple(v[3], 2) && isKind(v[3][0]) && inRange(v[3][1], 0, 1e9))) &&
  (v[4] === null || isStr(v[4], MAX_NAME_LEN));

const isSum = (v: unknown): v is SumWire => isTuple(v, 3) && v.every((n) => inRange(n, 0, Number.MAX_SAFE_INTEGER));

/** What a tick and a snapshot share: the clock, the holes, the power-ups, the police and the attacks. */
function isRoundState(m: Record<string, unknown>): boolean {
  if (!inRange(m.seq, 0, Number.MAX_SAFE_INTEGER) || !isClock(m.clock)) return false;
  if (!Array.isArray(m.holes) || m.holes.length < 1 || m.holes.length > MAX_HOLES || !m.holes.every(isHole)) return false;
  const holes = m.holes.length;
  return (
    isList(m.power, MAX_POWERUPS) &&
    m.power.every(isPower) &&
    isList(m.cops, MAX_COPS) &&
    m.cops.every((c) => isCop(c, holes)) &&
    isList(m.attacks, MAX_ATTACKS) &&
    m.attacks.every((a) => isAttack(a, holes))
  );
}

const isTick = (m: Record<string, unknown>): boolean =>
  isRoundState(m) &&
  isList(m.events, MAX_EVENTS) &&
  m.events.every((e) => isEvent(e, (m.holes as unknown[]).length)) &&
  (m.sum === undefined || isSum(m.sum));

const isSnapshot = (m: Record<string, unknown>): boolean =>
  isRoundState(m) &&
  Array.isArray(m.tally) &&
  m.tally.length === (m.holes as unknown[]).length &&
  m.tally.every(isTally) &&
  isList(m.stand, Math.ceil(PERSON_ID / 7)) &&
  m.stand.every((n) => inRange(n, 0, 127)) &&
  isList(m.added, MAX_ADDED) &&
  m.added.every(isProp) &&
  isList(m.people, MAX_PEOPLE * 2) &&
  m.people.length % 2 === 0 &&
  m.people.every((n, i) => (i % 2 ? inRange(n, -1, 99_999) : inRange(n, -1, LOOP_STEPS - 1)));

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
        m.wonders.every((k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(KINDS, k)) &&
        isSeats(m.seats, MAX_HOLES) &&
        inRange(m.you, 1, MAX_CHILDREN - 1) &&
        m.you < m.seats.length
      );
    case 'ready':
    case 'again':
    case 'resync':
      return true;
    case 'tick':
      return isTick(m);
    case 'snap':
      return isSnapshot(m);
    case 'pos':
      return isInt(m.seq) && m.seq >= 0 && [m.x, m.z, m.vx, m.vz].every((n) => isInt(n) && Math.abs(n) < 1e9);
    case 'over':
      return Array.isArray(m.order) && m.order.length <= MAX_HOLES && m.order.every((n) => inRange(n, 0, MAX_HOLES - 1));
    default:
      return false;
  }
}
