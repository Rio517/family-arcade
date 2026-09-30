/**
 * People (and dogs) walking round the town: round the pavements, running
 * from a hole that comes too close, and falling into one that catches them.
 */
import { makeProp } from './catalog';
import { BLOCK, SIDEWALK, type Block, type City } from './city';
import { gobble, isCrumb, type Hole } from './holes';
import type { World, WorldEvent } from './world';

type Rng = () => number;

/** A walk round a square: the pavement round a block, or a path inside a park. */
interface Loop {
  x0: number;
  z0: number;
  side: number;
}

export interface Person {
  id: number;
  /** A person, or a dog out for a walk. */
  kind: 'person' | 'dog';
  variant: number;
  loop: Loop;
  /** How far round the loop, and which way round. */
  t: number;
  dir: 1 | -1;
  speed: number;
  x: number;
  z: number;
  heading: number;
  alive: boolean;
  respawnIn: number;
  /**
   * `walk`: round the loop. `flee`: sprinting along the street away from a
   * hole. `back`: walking back to the loop once it is safe.
   */
  state: 'walk' | 'flee' | 'back';
  /** Seconds left of running away. */
  panic: number;
  /** While fleeing: which way (a unit vector along the street). */
  runX: number;
  runZ: number;
}

/** People are 'person' things with ids above every building's. */
const PERSON_ID = 1_000_000;
const PEOPLE_PER_BLOCK = 2.5;
const WALK = 1.4;
/** How far off a hole is noticed, beyond its rim, and how fast people run. */
const NOTICE = 10;
const RUN = 7;

/**
 * Blocks nobody walks round: out of town, the airfield, or a stadium built
 * out over the street, where the pavement would run straight through it.
 */
const NO_WALK = ['farm', 'forest', 'windfarm', 'mountain', 'military', 'helipad', 'airport', 'arena'];

/** The pavement round a block. */
const pavement = (b: Block): Loop => ({ x0: b.x + SIDEWALK / 2, z0: b.z + SIDEWALK / 2, side: BLOCK - SIDEWALK });
/** A path inside a park, `inset` in from the block's edge. */
const parkPath = (b: Block, inset: number): Loop => ({ x0: b.x + inset, z0: b.z + inset, side: BLOCK - inset * 2 });

function newPerson(id: number, kind: Person['kind'], variant: number, loop: Loop, t: number, dir: 1 | -1, speed: number): Person {
  const p: Person = {
    id,
    kind,
    variant,
    loop,
    t,
    dir,
    speed,
    x: 0,
    z: 0,
    heading: 0,
    alive: true,
    respawnIn: 0,
    state: 'walk',
    panic: 0,
    runX: 0,
    runZ: 0,
  };
  walkTo(p);
  return p;
}

/**
 * People on the pavements of the town blocks, and in the dog parks dogs out
 * with their owners (each dog trotting just ahead of its person).
 */
export function createPeople(city: City, rng: Rng): Person[] {
  const blocks = city.blockList.filter((b) => !NO_WALK.includes(b.kind));
  const count = Math.round(blocks.length * PEOPLE_PER_BLOCK);
  const people: Person[] = [];
  let id = PERSON_ID;
  for (let n = 0; n < count; n++) {
    const b = blocks[Math.floor(rng() * blocks.length)];
    people.push(newPerson(id++, 'person', Math.floor(rng() * 8), pavement(b), rng(), rng() < 0.5 ? 1 : -1, WALK * (0.8 + rng() * 0.4)));
  }
  for (const b of city.blockList.filter((x) => x.kind === 'dogpark')) {
    for (let k = 0; k < 3; k++) {
      const t = k / 3 + rng() * 0.1;
      const dir: 1 | -1 = k % 2 ? 1 : -1;
      const inset = 6 + k * 3;
      people.push(newPerson(id++, 'person', Math.floor(rng() * 8), parkPath(b, inset), t, dir, WALK));
      people.push(newPerson(id++, 'dog', Math.floor(rng() * 4), parkPath(b, inset), t + dir * 0.015, dir, WALK));
    }
  }
  return people;
}

/** Which way each edge of a loop runs, walking anticlockwise. */
const EDGE_X = [1, 0, -1, 0];
const EDGE_Z = [0, 1, 0, -1];

/**
 * The point `t` of the way round a loop, written into `out`, and which edge
 * it is on. Anticlockwise from the south-west corner: along x, up z, back x,
 * down z.
 */
function onLoop(loop: Loop, t: number, out: { x: number; z: number }): number {
  const { x0, z0, side } = loop;
  const u = (((t % 1) + 1) % 1) * 4;
  const k = Math.floor(u);
  const f = (u - k) * side;
  out.x = k === 0 ? x0 + f : k === 1 ? x0 + side : k === 2 ? x0 + side - f : x0;
  out.z = k === 0 ? z0 : k === 1 ? z0 + f : k === 2 ? z0 + side : z0 + side - f;
  return k;
}

/** Put someone at their place round their loop, facing the way they walk. */
function walkTo(p: Person): void {
  const k = onLoop(p.loop, p.t, p);
  p.heading = Math.atan2(EDGE_X[k] * p.dir, EDGE_Z[k] * p.dir);
}

/** The point of a loop nearest to (x, z), as a distance round it (0..1). */
function nearestOnLoop(loop: Loop, x: number, z: number): number {
  const { x0, z0, side } = loop;
  const cx = Math.max(x0, Math.min(x0 + side, x));
  const cz = Math.max(z0, Math.min(z0 + side, z));
  // Snap to the nearest edge, then turn that into a distance round.
  const d = [cz - z0, x0 + side - cx, z0 + side - cz, cx - x0];
  const edge = d.indexOf(Math.min(...d));
  const f = [cx - x0, cz - z0, x0 + side - cx, z0 + side - cz][edge] / side;
  return (edge + f) / 4;
}

/**
 * Everyone walks round their loop. A hole close by sends them sprinting away
 * along the street (they can't outrun it for long, but they try); when it
 * has gone they walk back to their loop. One close enough falls in.
 */
export function walkPeople(w: World, dt: number, events: WorldEvent[]): void {
  const edge = w.city.half - 1;
  const home = { x: 0, z: 0 };
  for (const p of w.people) {
    if (!p.alive) {
      p.respawnIn -= dt;
      if (p.respawnIn <= 0) comeBack(w, p);
      continue;
    }
    let eaten: Hole | null = null;
    let threat: Hole | null = null;
    let threatD = Infinity;
    for (const h of w.holes) {
      if (!h.alive) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < h.r - 0.3) {
        eaten = h;
        break;
      }
      // Nobody runs from a giant: it is too big to notice (they just go).
      if (d < h.r + NOTICE && d < threatD && !isCrumb(h, p.kind)) {
        threat = h;
        threatD = d;
      }
    }
    if (eaten) {
      p.alive = false;
      p.respawnIn = 8 + w.rng() * 6;
      if (!isCrumb(eaten, p.kind)) gobble(w, eaten, makeProp(p.id, p.kind, p.x, p.z, p.heading, p.variant), events);
      continue;
    }
    if (threat) {
      // Run along the street, away from the hole: the axis it is further off on.
      const ax = p.x - threat.x;
      const az = p.z - threat.z;
      if (p.state !== 'flee') {
        const along = Math.abs(ax) > Math.abs(az);
        p.runX = along ? Math.sign(ax) || 1 : 0;
        p.runZ = along ? 0 : Math.sign(az) || 1;
      }
      p.state = 'flee';
      p.panic = 1.6;
    }
    if (p.state === 'flee') {
      p.panic -= dt;
      p.x = Math.max(-edge, Math.min(edge, p.x + p.runX * RUN * dt));
      p.z = Math.max(-edge, Math.min(edge, p.z + p.runZ * RUN * dt));
      p.heading = Math.atan2(p.runX, p.runZ);
      if (p.panic <= 0) p.state = 'back';
      continue;
    }
    if (p.state === 'back') {
      const t = nearestOnLoop(p.loop, p.x, p.z);
      onLoop(p.loop, t, home);
      const dx = home.x - p.x;
      const dz = home.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        p.t = t;
        p.state = 'walk';
      } else {
        const step = Math.min(d, p.speed * 1.5 * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        p.heading = Math.atan2(dx, dz);
      }
      continue;
    }
    p.t += (p.dir * p.speed * dt) / (4 * p.loop.side);
    walkTo(p);
  }
}

/** Back into town, on a block well away from every hole (a dog goes back to its park). */
function comeBack(w: World, p: Person): void {
  const blocks = w.city.blockList;
  for (let tries = 0; tries < 6; tries++) {
    const b = blocks[Math.floor(w.rng() * blocks.length)];
    if (NO_WALK.includes(b.kind)) continue;
    if (p.kind === 'dog' && b.kind !== 'dogpark') continue;
    const cx = b.x + b.size / 2;
    const cz = b.z + b.size / 2;
    if (w.holes.some((h) => h.alive && Math.hypot(h.x - cx, h.z - cz) < h.r + b.size)) continue;
    if (p.kind === 'person') p.loop = pavement(b);
    p.t = w.rng();
    p.alive = true;
    p.state = 'walk';
    p.panic = 0;
    walkTo(p);
    return;
  }
  p.respawnIn = 2;
}
