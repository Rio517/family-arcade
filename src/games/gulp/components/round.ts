/**
 * The plain parts of a Gulp Universe round's screens: the menu's settings, the
 * scoreboard snapshot copied out of the live world, and how the 3D scene is
 * loaded. Kept apart from the components so each file holds only components.
 */
import { MAPS, type MapId, type Side } from '../domain/city';
import type { Difficulty } from '../domain/rivals';
import { EAT_HOLE, POWER_TIME, comboOf, levelOf, levelProgress, nextLabel, standings, type World } from '../domain/world';
import type { Settings } from '../storage/settings';
import type { GulpScene } from '../three/scene';
import { SKINS } from './skins';

/** Builds the 3D scene; tests hand in a fake (jsdom has no WebGL). */
export type SceneLoader = () => Promise<{ GulpScene: typeof GulpScene }>;

// three.js loads on demand, as in the other 3D games: the arcade menu must
// not front-load the 3D library.
export const loadScene: SceneLoader = () => import('../three/scene');

export type { Settings };

/** The maps from smallest to biggest, as the menu and the Scores dialog list them. */
export const MAP_ORDER: MapId[] = ['town', 'city', 'mega', 'region'];

export const DIFFICULTY_TITLE: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

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
  /** Lives left, or null where there are none to lose (Easy). */
  lives: number | null;
  /** Out of lives: out of the round. */
  out: boolean;
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
  speed: number;
  double: number;
  /** 0..1 of each power-up still to run, for the countdown bars. */
  speedLeft: number;
  doubleLeft: number;
  /** True when the child's hole is close to the edge of the world. */
  nearEdge: boolean;
  /** The combo multiplier and the things eaten in the streak. */
  combo: number;
  streak: number;
  alive: boolean;
  /** The child's lives left, or null where there are none to lose (Easy). */
  lives: number | null;
  eatenBy: string | null;
  respawnIn: number;
  elapsed: number;
  /** Arrows at the edge of the screen toward danger on its way: attacks coming for the child, and bigger holes close by. */
  pointers: Pointer[];
}

export interface Pointer {
  key: string;
  /** Screen direction from the middle: 0 is up, clockwise, in radians. */
  angle: number;
  kind: 'tanker' | 'tank' | 'heli' | 'hole';
  label: string;
}

export interface Banner {
  id: number;
  kind: 'level' | 'warn' | 'good' | 'hurt' | 'news';
  text: string;
  sub?: string;
  /** Points the moment scored, shown on the banner as "+25 points". */
  points?: number;
}

export function hudOf(w: World, me: number): Hud {
  const order = standings(w);
  const rows = order.map((h, i) => ({
    id: h.id,
    rank: i + 1,
    name: h.name,
    css: SKINS[h.skin % SKINS.length].css,
    score: h.score,
    me: h.id === me,
    lives: Number.isFinite(h.lives) ? h.lives : null,
    out: h.lives <= 0,
  }));
  // Holes out of lives leave the list, so the five shown are still in the
  // round; their ranks stay as the results card will count them.
  const top = rows.filter((r) => !r.out || r.me).slice(0, 5);
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
    speed: Math.ceil(h.speedTime),
    double: Math.ceil(h.doubleTime),
    speedLeft: h.speedTime / POWER_TIME.speed,
    doubleLeft: h.doubleTime / POWER_TIME.double,
    nearEdge: h.alive && nearOpenEdge(w, h.x, h.z),
    combo: comboOf(h.streak),
    streak: h.streak,
    alive: h.alive,
    lives: Number.isFinite(h.lives) ? h.lives : null,
    eatenBy: h.eatenBy,
    respawnIn: Math.max(1, Math.ceil(h.respawnIn)),
    elapsed: w.elapsed,
    pointers: h.alive ? pointersFor(w, h) : [],
  };
}

const ATTACK_LABEL: Record<Pointer['kind'], string> = { tanker: 'Fuel truck', tank: 'Tank', heli: 'Helicopter', hole: '' };

/**
 * Where danger is coming from, as arrows at the screen's edge: a fuel truck,
 * tank or helicopter on its way to the child (the bomber shows its own red
 * circles), and on Medium and Hard any hole big enough to swallow the child
 * that is close. Screen up is the city's north (-z), screen right its east.
 */
function pointersFor(w: World, h: World['holes'][number]): Pointer[] {
  const out: Pointer[] = [];
  const angleTo = (x: number, z: number) => Math.atan2(x - h.x, -(z - h.z));
  for (const a of w.attacks) {
    if (a.kind === 'bomber' || a.target !== h.id) continue;
    // A tank or helicopter on its way home is no danger any more.
    if ((a.kind === 'tank' || a.kind === 'heli') && a.home) continue;
    // Only while it is still on its way: once it is close, it can be seen.
    if (Math.hypot(a.x - h.x, a.z - h.z) < h.r + 18) continue;
    out.push({ key: `a${a.id}`, angle: angleTo(a.x, a.z), kind: a.kind, label: ATTACK_LABEL[a.kind] });
  }
  if (w.options.difficulty !== 'easy' && h.safe <= 0) {
    for (const o of w.holes) {
      if (o === h || !o.alive || o.r < h.r * EAT_HOLE) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d > 25 + o.r * 2.5 || d < o.r) continue;
      out.push({ key: `h${o.id}`, angle: angleTo(o.x, o.z), kind: 'hole', label: `${o.name} is bigger!` });
    }
  }
  return out;
}


/**
 * Near the edge of play on a side with no sea. Where the sea is the edge the
 * child can see it, so no warning is needed; where the green carries on
 * past the edge, the warning says where play stops.
 */
function nearOpenEdge(w: World, x: number, z: number): boolean {
  const edge = w.city.land - 24;
  if (w.city.extraLand.some((l) => x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1)) return false;
  const near: Side[] = [];
  if (x > edge) near.push('e');
  if (x < -edge) near.push('w');
  if (z > edge) near.push('s');
  if (z < -edge) near.push('n');
  return near.some((side) => !w.city.shores.includes(side));
}

