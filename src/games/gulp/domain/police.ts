/**
 * When the child's hole has eaten a good few things, someone calls the
 * police: two cars race down the nearest street and park near the hole, and
 * the officers get out and stand round it, waving their batons. They do no
 * harm; the cars and the officers are there to be swallowed.
 */
import { FIT, footSize, makeProp, type PropKind } from './catalog';
import { levelOf } from './growth';
import { gobble, type Hole } from './holes';
import { placeProp } from './space';
import type { World, WorldEvent } from './world';

export interface Responder {
  id: number;
  kind: 'car' | 'officer';
  x: number;
  z: number;
  heading: number;
  /** A car drives to (tx, tz) and parks; an officer stands near the hole. */
  tx: number;
  tz: number;
  state: 'drive' | 'stand' | 'leave';
  /** Seconds in this state. */
  t: number;
  /** Swallowed, or a car that has parked and become part of the city: no longer shown. */
  done: boolean;
}

/** Things the child eats before someone calls the police, and seconds between calls. */
const POLICE_AFTER = 35;
export const POLICE_COOL = 50;
const POLICE_STAY = 25;
/** Seconds an officer takes to stroll off once it leaves. */
const LEAVE_TIME = 6;

export function police(w: World, dt: number, me: Hole, events: WorldEvent[]): void {
  w.police.cool = Math.max(0, w.police.cool - dt);
  const small = levelOf(me.r) <= 6;
  if (me.alive && small && w.police.cool === 0 && w.police.eaten >= POLICE_AFTER && !w.responders.length) {
    w.police.eaten = 0;
    w.police.cool = POLICE_COOL;
    callPolice(w, me, events);
  }
  const reach = (kind: PropKind, x: number, z: number) =>
    w.holes.find((h) => h.alive && footSize(kind) <= h.r * FIT && Math.hypot(h.x - x, h.z - z) < h.r - 0.3);
  for (const r of w.responders) {
    r.t += dt;
    if (r.kind === 'car') {
      const dx = r.tx - r.x;
      const dz = r.tz - r.z;
      const d = Math.hypot(dx, dz);
      const eater = reach('policecar', r.x, r.z);
      if (eater) {
        r.done = true;
        gobble(w, eater, makeProp(-r.id, 'policecar', r.x, r.z, r.heading), events);
        continue;
      }
      if (d < 0.5) {
        // Parked: now it's a car in the city like any other, and two officers get out.
        r.done = true;
        const parked = makeProp(w.nextPropId++, 'policecar', r.tx, r.tz, r.heading);
        placeProp(w, parked);
        events.push({ type: 'park', prop: parked });
        for (const side of [-1, 1]) {
          w.responders.push({
            id: w.nextId++,
            kind: 'officer',
            x: r.tx + Math.cos(r.heading) * side * 1.8,
            z: r.tz - Math.sin(r.heading) * side * 1.8,
            heading: r.heading,
            tx: 0,
            tz: 0,
            state: 'stand',
            t: 0,
            done: false,
          });
        }
        continue;
      }
      const step = Math.min(d, 18 * dt);
      r.x += (dx / d) * step;
      r.z += (dz / d) * step;
      continue;
    }
    const eater = reach('police', r.x, r.z);
    if (eater) {
      r.done = true;
      gobble(w, eater, makeProp(-r.id, 'police', r.x, r.z, r.heading), events);
      continue;
    }
    const dx = me.x - r.x;
    const dz = me.z - r.z;
    const d = Math.hypot(dx, dz) || 1;
    if (r.state === 'stand') {
      // Keep a careful distance from the rim, facing the hole.
      const want = me.r + 5;
      const step = Math.max(-2.2 * dt, Math.min(2.2 * dt, d - want));
      r.x += (dx / d) * step;
      r.z += (dz / d) * step;
      r.heading = Math.atan2(dx, dz);
      if (r.t > POLICE_STAY || !me.alive) {
        r.state = 'leave';
        r.t = 0;
      }
    } else if (r.state === 'leave' && r.t < LEAVE_TIME) {
      // Stroll off, and they're gone.
      r.x -= (dx / d) * 2 * dt;
      r.z -= (dz / d) * 2 * dt;
      r.heading = Math.atan2(-dx, -dz);
    }
  }
  w.responders = w.responders.filter((r) => !r.done && !(r.state === 'leave' && r.t >= LEAVE_TIME));
}

/** Two police cars, one down each way of the street nearest the hole. */
function callPolice(w: World, me: Hole, events: WorldEvent[]): void {
  const roads = w.city.roads;
  const nearX = roads.reduce((a, b) => (Math.abs(b - me.x) < Math.abs(a - me.x) ? b : a));
  const nearZ = roads.reduce((a, b) => (Math.abs(b - me.z) < Math.abs(a - me.z) ? b : a));
  // The street running along z (at x = nearX) or along x (at z = nearZ), whichever is closer.
  const alongZ = Math.abs(nearX - me.x) < Math.abs(nearZ - me.z);
  const edge = w.city.half - 6;
  for (const side of [-1, 1]) {
    const stopAlong = (alongZ ? me.z : me.x) + side * (me.r + 9);
    // From well out of sight up the street.
    const startAlong = stopAlong + side * (110 + me.r * 2);
    const lane = side * 2.4;
    const clampE = (v: number) => Math.max(-edge, Math.min(edge, v));
    const sx = alongZ ? nearX + lane : clampE(startAlong);
    const sz = alongZ ? clampE(startAlong) : nearZ + lane;
    const tx = alongZ ? nearX + lane : clampE(stopAlong);
    const tz = alongZ ? clampE(stopAlong) : nearZ + lane;
    w.responders.push({ id: w.nextId++, kind: 'car', x: sx, z: sz, heading: Math.atan2(tx - sx, tz - sz), tx, tz, state: 'drive', t: 0, done: false });
  }
  events.push({ type: 'police', x: me.x, z: me.z });
}
