/**
 * What the parts of the city builder share: sizes, the rectangle and side
 * types, the tools every placer is handed, and a local frame for laying out
 * a site in its own coordinates.
 */
import type { PropKind } from '../catalog';
import { inRect } from '../space';

export type Rng = () => number;

export type MapId = 'town' | 'city' | 'mega' | 'region';

export type Side = 'n' | 's' | 'e' | 'w';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A playground's soft surface, or a small basketball court (long side along z). */
export interface PlayArea extends Rect {
  kind: 'soft' | 'court';
}

/** Road width, block size (pavement included) and pavement width. */
export const ROAD = 10;
export const BLOCK = 34;
export const SIDEWALK = 2.5;
/** From one road's centre line to the next. */
export const PITCH = ROAD + BLOCK;
/** A mountain is round: the radius of its foot, a little inside its square footprint. */
export const MOUNTAIN_FOOT = 18;

export type Add = (kind: PropKind, x: number, z: number, rot?: number, variant?: number, hScale?: number) => void;

export interface Tools {
  map: MapId;
  /** Where interiors record their playground surfaces and courts. */
  play: PlayArea[];
  rng: Rng;
  add: Add;
  pick: <T>(list: readonly T[]) => T;
  variant: () => number;
  turn: () => number;
}

/** Whether (x, z) lies in any of the rectangles, each grown by `pad`. */
export const inside = (rects: readonly Rect[], x: number, z: number, pad = 0): boolean =>
  rects.some((r) => inRect({ x0: r.x0 - pad, z0: r.z0 - pad, x1: r.x1 + pad, z1: r.z1 + pad }, x, z));

/**
 * A site's own frame: `u` along `U` and `v` along `V` from `origin`, both
 * unit vectors on the map's axes. `at` gives a map point, `rect` a map
 * rectangle from two corners, and `facing` the turn (as in Prop.rot) that
 * faces a thing's front along a direction in the frame.
 */
export function localFrame(origin: readonly [number, number], U: readonly [number, number], V: readonly [number, number]) {
  const at = (u: number, v: number): [number, number] => [origin[0] + u * U[0] + v * V[0], origin[1] + u * U[1] + v * V[1]];
  return {
    at,
    rect(u0: number, v0: number, u1: number, v1: number): Rect {
      const [ax, az] = at(u0, v0);
      const [bx, bz] = at(u1, v1);
      return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
    },
    facing: (du: number, dv: number) => Math.atan2(du * U[0] + dv * V[0], du * U[1] + dv * V[1]),
  };
}
