/**
 * The city fights back against big holes: fuel trucks driven into them,
 * planes dropping bombs on marked spots, and, where the map has a military
 * base, tanks and helicopters that close in and fire.
 */
import { FIT, footSize, makeProp } from './catalog';
import { levelOf, speedOf } from './growth';
import { gobble, hurt, type Hole } from './holes';
import type { Difficulty } from './rivals';
import { spotNear, wrapAngle } from './space';
import type { World, WorldEvent } from './world';

export interface Bomb {
  id: number;
  x: number;
  z: number;
  radius: number;
  /** Seconds until it lands; the scene shows a target ring until then. */
  fuse: number;
  /** A shell or rocket: where it was fired from, and its whole flight time (for the arc). */
  from?: { x: number; z: number; y: number };
  flight?: number;
}

/** A tank or a helicopter from the military base: it closes in, then fires. */
interface Unit {
  id: number;
  /** The units sent out together share a wave, and go home together. */
  wave: number;
  /** Hits the wave has landed; enough of them and it goes home. */
  hits: number;
  home: boolean;
  target: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  life: number;
  /** Seconds until it fires again. */
  reload: number;
  shells: Bomb[];
}

export type Attack =
  | { id: number; kind: 'tanker'; x: number; z: number; heading: number; speed: number; target: number; life: number }
  | {
      id: number;
      kind: 'bomber';
      target: number;
      /** The plane: where it is, which way it flies, how fast. */
      x: number;
      z: number;
      dx: number;
      dz: number;
      speed: number;
      life: number;
      bombs: Bomb[];
    }
  | (Unit & { kind: 'tank' })
  | (Unit & { kind: 'heli' });

/** A fuel truck's reach: it crashes when its nose touches the rim. */
const TANKER_SIZE = footSize('tanker');
const TANK_SIZE = footSize('tank');
/** The base only sends tanks after holes this close; helicopters go anywhere. */
const TANK_RANGE = 200;
const MIN_ATTACK_LEVEL = 4;
/**
 * How often the city goes after the child rather than a computer hole, when
 * both are big enough: now and then on Easy, half the time on Hard (where a
 * child in the lead is always the one it goes after).
 */
const CHILD_SHARE: Record<Difficulty, number> = { easy: 0.2, medium: 0.35, hard: 0.5 };
/** Hits a wave of tanks or helicopters lands before it heads home. */
const WAVE_HITS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

export function fightBack(w: World, dt: number, events: WorldEvent[], player: Hole | null): void {
  w.nextAttack -= dt;
  if (w.nextAttack <= 0) launch(w, events, player);

  for (const a of w.attacks) {
    a.life -= dt;
    if (a.kind === 'tanker') driveTanker(w, a, dt, events);
    else if (a.kind === 'bomber') flyBomber(w, a, dt, events);
    else moveUnit(w, a, dt, events);
  }
  w.attacks = w.attacks.filter((a) => a.life > 0);
}

/**
 * Pick who the city goes after: big holes only. The child is one of them,
 * picked now and then (see CHILD_SHARE); otherwise the biggest computer hole.
 */
function pickTarget(w: World, big: Hole[], player: Hole | null): Hole {
  const rivals = big.filter((h) => h !== player);
  if (!player || !big.includes(player) || !rivals.length) return rivals.length ? biggestOf(rivals) : big[0];
  const { difficulty } = w.options;
  if (difficulty === 'hard' && player === biggestOf(big)) return player;
  return w.rng() < CHILD_SHARE[difficulty] ? player : biggestOf(rivals);
}

const biggestOf = (hs: Hole[]): Hole => hs.reduce((a, b) => (b.r > a.r ? b : a));

function launch(w: World, events: WorldEvent[], player: Hole | null): void {
  const big = w.holes.filter((h) => h.alive && h.safe <= 0 && levelOf(h.r) >= MIN_ATTACK_LEVEL);
  if (!big.length) {
    w.nextAttack = 5;
    return;
  }
  // Now and then, not all the time: each attack should feel like an event.
  w.nextAttack = 20 + w.rng() * 12;
  const target = pickTarget(w, big, player);
  // A map with a military base sends its army half the time.
  const base = w.city.base;
  if (base && w.rng() < 0.5) {
    const near = Math.hypot(target.x - base.x, target.z - base.z) < TANK_RANGE;
    const kind = near && w.rng() < 0.6 ? 'tank' : 'heli';
    const count = kind === 'tank' ? 2 : 1;
    const wave = w.nextId;
    for (let i = 0; i < count; i++) {
      const heading = Math.atan2(target.x - base.x, target.z - base.z);
      const unit: Unit = {
        id: w.nextId++,
        wave,
        hits: 0,
        home: false,
        target: target.id,
        x: base.x + (i - (count - 1) / 2) * 6 * Math.cos(heading),
        z: base.z - (i - (count - 1) / 2) * 6 * Math.sin(heading),
        heading,
        // Tanks trundle; helicopters are quick, but never quicker than a hole can dodge.
        speed: kind === 'tank' ? Math.max(6, speedOf(target.r) * 0.55) : Math.max(28, speedOf(target.r) * 1.3),
        life: kind === 'tank' ? 45 : 35,
        reload: 1.5 + i,
        shells: [],
      };
      w.attacks.push(kind === 'tank' ? { ...unit, kind: 'tank' } : { ...unit, kind: 'heli' });
    }
    events.push({ type: 'incoming', target: target.id, kind });
    return;
  }
  const bomber = levelOf(target.r) >= 6 ? w.rng() < 0.75 : w.rng() < 0.2;
  const id = w.nextId++;
  if (bomber) {
    const a = w.rng() * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const reach = 140 + target.r * 4;
    const speed = 62 + target.r;
    const radius = Math.max(5, target.r * 0.8);
    // Bombs along the plane's line, over where the hole is now. Each lands a
    // little after the plane passes, so its target ring shows for a while.
    const bombs: Bomb[] = [-1.3, 0, 1.3].map((k) => {
      const bx = target.x + dx * k * radius * 1.4;
      const bz = target.z + dz * k * radius * 1.4;
      const pass = (reach + k * radius * 1.4) / speed;
      return { id: w.nextId++, x: bx, z: bz, radius, fuse: pass + 1 };
    });
    w.attacks.push({ id, kind: 'bomber', target: target.id, x: target.x - dx * reach, z: target.z - dz * reach, dx, dz, speed, life: (reach * 2) / speed + 2, bombs });
  } else {
    // Out of sight, then it drives in: nothing appears out of nowhere on screen.
    const spot = spotNear(w, target.x, target.z, 90 + target.r * 4, 105 + target.r * 4.5);
    const heading = Math.atan2(target.x - spot.x, target.z - spot.z);
    // A little slower than the hole it chases, and slow to turn: a child who
    // sees it coming can always get out of the way.
    w.attacks.push({ id, kind: 'tanker', ...spot, heading, speed: speedOf(target.r) * 0.8, target: target.id, life: 26 });
  }
  events.push({ type: 'incoming', target: target.id, kind: bomber ? 'bomber' : 'tanker' });
}

function driveTanker(w: World, a: Extract<Attack, { kind: 'tanker' }>, dt: number, events: WorldEvent[]): void {
  const target = w.holes[a.target];
  // It turns toward its hole, but only so fast: a sharp swerve gets away.
  if (target?.alive) {
    const turn = wrapAngle(Math.atan2(target.x - a.x, target.z - a.z) - a.heading);
    a.heading += Math.max(-1, Math.min(1, turn)) * 0.8 * dt;
  }
  // Quick while it is far off, so it arrives; slower close up, so it can be dodged.
  const far = target?.alive && Math.hypot(target.x - a.x, target.z - a.z) > 45 + target.r * 2 ? 1.6 : 1;
  a.x += Math.sin(a.heading) * a.speed * far * dt;
  a.z += Math.cos(a.heading) * a.speed * far * dt;
  // It crashes into any hole it reaches, big or small, and goes up in flames.
  for (const h of w.holes) {
    if (!h.alive || h.safe > 0) continue;
    if (Math.hypot(h.x - a.x, h.z - a.z) > h.r + TANKER_SIZE * 0.4) continue;
    a.life = 0;
    hurt(w, h, 'tanker', events);
    return;
  }
  if (Math.abs(a.x) > w.city.land + 20 || Math.abs(a.z) > w.city.land + 20) a.life = 0;
}

/**
 * A tank or helicopter: head for its hole, stop at a distance (a helicopter
 * circles), and fire every few seconds at the spot where the hole is now.
 * Each shell shows its red target circle while it flies, so a moving hole
 * gets away. A hole big enough simply swallows a tank that comes too close.
 * Once its wave has landed its hits (see WAVE_HITS), or its time is up, it
 * goes back to the base and stops there.
 */
function moveUnit(w: World, a: Extract<Attack, { kind: 'tank' | 'heli' }>, dt: number, events: WorldEvent[]): void {
  const target = w.holes[a.target];
  const tank = a.kind === 'tank';
  const base = w.city.base ?? { x: a.x, z: a.z };
  if (a.life <= 0 && !a.home) goHome(a, base);
  if (a.home) {
    const d = Math.hypot(base.x - a.x, base.z - a.z);
    const turn = wrapAngle(Math.atan2(base.x - a.x, base.z - a.z) - a.heading);
    a.heading += Math.max(-1, Math.min(1, turn)) * (tank ? 1.2 : 2) * dt;
    a.x += Math.sin(a.heading) * a.speed * dt;
    a.z += Math.cos(a.heading) * a.speed * dt;
    if (d < 6 && !a.shells.length) a.life = 0;
  } else if (target?.alive) {
    const d = Math.hypot(target.x - a.x, target.z - a.z);
    const stand = target.r + (tank ? 22 : 26);
    const want = Math.atan2(target.x - a.x, target.z - a.z);
    // Close in; a helicopter that is close enough circles round.
    const aim = !tank && d < stand + 4 ? want + Math.PI / 2 : want;
    const turn = wrapAngle(aim - a.heading);
    a.heading += Math.max(-1, Math.min(1, turn)) * (tank ? 1.2 : 2) * dt;
    if (!tank || d > stand) {
      a.x += Math.sin(a.heading) * a.speed * dt;
      a.z += Math.cos(a.heading) * a.speed * dt;
    }
    a.reload -= dt;
    // The tanks of a wave take turns: one shell in the air at a time.
    const mateFiring = w.attacks.some((o) => o !== a && (o.kind === 'tank' || o.kind === 'heli') && o.wave === a.wave && o.shells.length > 0);
    if (a.reload <= 0 && d < stand + 30 && !mateFiring) {
      a.reload = tank ? 2.8 : 2.2;
      const flight = tank ? 1.5 : 1.1;
      a.shells.push({
        id: w.nextId++,
        x: target.x,
        z: target.z,
        radius: Math.max(4, target.r * (tank ? 0.35 : 0.3)),
        fuse: flight,
        flight,
        from: { x: a.x, z: a.z, y: tank ? 2.2 : 10 + target.r * 0.8 },
      });
    }
  }
  const { falling, hits } = fall(w, a.shells, dt, events);
  a.shells = falling;
  if (hits) {
    for (const o of w.attacks) {
      if ((o.kind !== 'tank' && o.kind !== 'heli') || o.wave !== a.wave) continue;
      o.hits += hits;
      if (o.hits >= WAVE_HITS[w.options.difficulty] && !o.home) goHome(o, base);
    }
  }
  // A big hole swallows a tank that rolls into it.
  if (tank) {
    for (const h of w.holes) {
      if (!h.alive || TANK_SIZE > h.r * FIT || Math.hypot(h.x - a.x, h.z - a.z) > h.r - 1.5) continue;
      a.life = 0;
      gobble(w, h, makeProp(-a.id, 'tank', a.x, a.z, a.heading), events);
      return;
    }
  }
}

/** Turn for the base, with time enough to drive there. */
function goHome(a: Unit, base: { x: number; z: number }): void {
  a.home = true;
  a.life = Math.hypot(base.x - a.x, base.z - a.z) / a.speed + 4;
}

function flyBomber(w: World, a: Extract<Attack, { kind: 'bomber' }>, dt: number, events: WorldEvent[]): void {
  a.x += a.dx * a.speed * dt;
  a.z += a.dz * a.speed * dt;
  a.bombs = fall(w, a.bombs, dt, events).falling;
}

/**
 * Count down the bombs or shells in the air. Each one that lands goes off
 * and hurts every hole it hits; the rest are returned, still falling, with
 * how many holes were hit.
 */
function fall(w: World, bombs: Bomb[], dt: number, events: WorldEvent[]): { falling: Bomb[]; hits: number } {
  let hits = 0;
  for (const b of bombs) {
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    events.push({ type: 'boom', x: b.x, z: b.z, size: b.radius });
    for (const h of w.holes) {
      if (!h.alive || h.safe > 0 || Math.hypot(h.x - b.x, h.z - b.z) >= b.radius + h.r * 0.25) continue;
      hurt(w, h, 'bomb', events);
      hits += 1;
    }
  }
  return { falling: bombs.filter((b) => b.fuse > 0), hits };
}
