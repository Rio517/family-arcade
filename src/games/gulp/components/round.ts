/**
 * The plain parts of a Gulp Universe round's screens: the menu's settings, the
 * scoreboard snapshot copied out of the live world, and how the 3D scene is
 * loaded. Kept apart from the components so each file holds only components.
 */
import { TIERS } from '../domain/catalog';
import { MAPS, type MapId } from '../domain/city';
import { POWER_TIME, comboOf, levelOf, levelProgress, nextLabel, standings, type World } from '../domain/world';
import type { GulpScene } from '../three/scene';
import { SKINS } from './skins';

/** Builds the 3D scene; tests hand in a fake (jsdom has no WebGL). */
export type SceneLoader = () => Promise<{ GulpScene: typeof GulpScene }>;

// three.js loads on demand, as in the other 3D games: the arcade menu must
// not front-load the 3D library.
export const loadScene: SceneLoader = () => import('../three/scene');

export interface Settings {
  map: MapId;
  /** Round length: the map's own, twice that, or 0 for endless. */
  length: 'short' | 'long' | 'endless';
  powerups: boolean;
  fightBack: boolean;
  /** Things grow back and eaten buildings are rebuilt, bigger as the round goes on. */
  regrow: boolean;
  skin: number;
  muted: boolean;
}

/** Seconds a round lasts with these settings (0: until someone ends it). */
export function durationOf(s: Settings): number {
  if (s.length === 'endless') return 0;
  return MAPS[s.map].minutes * 60 * (s.length === 'long' ? 2 : 1);
}

export interface HudRow {
  id: number;
  rank: number;
  name: string;
  css: string;
  score: number;
  me: boolean;
}

export interface Hud {
  rows: HudRow[];
  /** My row when I am not in the top five. */
  mine: HudRow | null;
  clock: string;
  endless: boolean;
  countdown: number;
  level: number;
  progress: number;
  next: string | null;
  kills: number;
  speed: number;
  double: number;
  /** 0..1 of each power-up still to run, for the countdown bars. */
  speedLeft: number;
  doubleLeft: number;
  /** The combo multiplier and the things eaten in the streak. */
  combo: number;
  streak: number;
  alive: boolean;
  eatenBy: string | null;
  respawnIn: number;
  elapsed: number;
}

export interface Banner {
  id: number;
  kind: 'level' | 'warn' | 'good' | 'hurt' | 'news';
  text: string;
  sub?: string;
}


export function hudOf(w: World, me: number): Hud {
  const order = standings(w);
  const rows = order.map((h, i) => ({
    id: h.id,
    rank: i + 1,
    name: h.isPlayer ? 'You' : h.name,
    css: SKINS[h.skin % SKINS.length].css,
    score: h.score,
    me: h.id === me,
  }));
  const top = rows.slice(0, 5);
  const mine = top.some((r) => r.me) ? null : (rows.find((r) => r.me) ?? null);
  const h = w.holes[me];
  const secs = w.options.duration > 0 ? Math.max(0, Math.ceil(w.options.duration - w.elapsed)) : Math.floor(w.elapsed);
  return {
    rows: top,
    mine,
    clock: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
    endless: w.options.duration === 0,
    countdown: w.status === 'countdown' ? Math.ceil(w.countdown) : 0,
    level: levelOf(h.r),
    progress: levelProgress(h.r),
    next: nextLabel(h.r),
    kills: h.kills,
    speed: Math.ceil(h.speedTime),
    double: Math.ceil(h.doubleTime),
    speedLeft: h.speedTime / POWER_TIME.speed,
    doubleLeft: h.doubleTime / POWER_TIME.double,
    combo: comboOf(h.streak),
    streak: h.streak,
    alive: h.alive,
    eatenBy: h.eatenBy,
    respawnIn: Math.max(1, Math.ceil(h.respawnIn)),
    elapsed: w.elapsed,
  };
}

/** What a level newly lets you eat, for the level-up banner. */
export function unlockedAt(level: number): string {
  return level < TIERS.length ? TIERS[level].label : 'Anything!';
}
