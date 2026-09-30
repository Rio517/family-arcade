/**
 * Where things are: the grid that lets a hole look only at what is near it,
 * and small bits of geometry the rules share.
 */
import type { Prop } from './catalog';
import type { World } from './world';

const CELL = 12;
const cellKey = (cx: number, cz: number) => `${cx}:${cz}`;

function addToGrid(w: World, p: Prop): void {
  const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
  const list = w.grid.get(key);
  if (list) list.push(p.id);
  else w.grid.set(key, [p.id]);
}

/** Build the grid afresh from the things standing in the city. */
export function indexProps(w: World): void {
  w.grid = new Map();
  for (const p of w.props.values()) addToGrid(w, p);
}

/** Add a thing to the city during the round: into the props and the grid. */
export function placeProp(w: World, p: Prop): void {
  w.props.set(p.id, p);
  addToGrid(w, p);
}

/**
 * Things near a point, from the grid. The grid keeps the ids of eaten things
 * too, so something the city puts back is found again without re-adding it.
 */
export function propsNear(w: World, x: number, z: number, radius: number): Prop[] {
  const out: Prop[] = [];
  const c0x = Math.floor((x - radius) / CELL);
  const c1x = Math.floor((x + radius) / CELL);
  const c0z = Math.floor((z - radius) / CELL);
  const c1z = Math.floor((z + radius) / CELL);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      const ids = w.grid.get(cellKey(cx, cz));
      if (!ids) continue;
      for (const id of ids) {
        const p = w.props.get(id);
        if (p) out.push(p);
      }
    }
  }
  return out;
}

/** Whether (x, z) lies in a rectangle given by its edges. */
export const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): boolean =>
  x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** An angle brought into -π..π, for turning the short way round. */
export function wrapAngle(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

/**
 * A spot on land between `near` and `far` from (x, z). It tries a few
 * directions for one that fits on land as it is, so a spot meant to be off
 * screen is not pulled back into view by the edge of the land.
 */
export function spotNear(w: World, x: number, z: number, near: number, far: number): { x: number; z: number } {
  const edge = w.city.land - 4;
  let spot = { x, z };
  for (let tries = 0; tries < 6; tries++) {
    const a = w.rng() * Math.PI * 2;
    const d = near + w.rng() * (far - near);
    spot = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
    if (Math.abs(spot.x) <= edge && Math.abs(spot.z) <= edge) return spot;
  }
  return { x: Math.max(-edge, Math.min(edge, spot.x)), z: Math.max(-edge, Math.min(edge, spot.z)) };
}
