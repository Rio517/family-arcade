/** Power-ups that turn up from time to time: a burst of speed, or double points. */
import type { Hole } from './holes';
import { spotNear } from './space';
import type { World, WorldEvent } from './world';

export type PowerKind = 'speed' | 'double';

export interface PowerUp {
  id: number;
  kind: PowerKind;
  x: number;
  z: number;
  /** Seconds before it fades away. */
  life: number;
}

/** How long each power-up lasts, in seconds. */
export const POWER_TIME: Record<PowerKind, number> = { speed: 8, double: 10 };
/** How much faster the speed power-up makes a hole. */
export const POWER_SPEED = 1.6;
const POWER_LIFE = 20;
const POWER_MAX = 2;

export function spawnPowerups(w: World, dt: number, player: Hole | null): void {
  for (const p of w.powerups) p.life -= dt;
  w.powerups = w.powerups.filter((p) => p.life > 0);
  w.nextPower -= dt;
  if (w.nextPower > 0) return;
  // Now and then, not all the time: a boost should feel like a treat.
  w.nextPower = 18 + w.rng() * 10;
  if (w.powerups.length >= POWER_MAX) return;
  // Mostly within the child's sight, so the child finds most of them.
  const alive = w.holes.filter((h) => h.alive);
  const near = player && player.alive && w.rng() < 0.75 ? player : alive[Math.floor(w.rng() * alive.length)];
  if (!near) return;
  const spot = spotNear(w, near.x, near.z, 14 + near.r * 2, 30 + near.r * 3);
  w.powerups.push({ id: w.nextId++, kind: w.rng() < 0.5 ? 'speed' : 'double', ...spot, life: POWER_LIFE });
}

export function takePowerups(w: World, h: Hole, events: WorldEvent[]): void {
  for (const p of w.powerups) {
    if (p.life <= 0 || Math.hypot(p.x - h.x, p.z - h.z) > h.r + 1.2) continue;
    p.life = 0;
    if (p.kind === 'speed') h.speedTime = POWER_TIME.speed;
    else h.doubleTime = POWER_TIME.double;
    events.push({ type: 'power', hole: h.id, kind: p.kind });
  }
  w.powerups = w.powerups.filter((p) => p.life > 0);
}
