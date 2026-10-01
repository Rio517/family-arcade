/**
 * How a swallowed thing moves as it falls into a hole, worked out apart from
 * the meshes so it can be checked without a renderer. A hole's mouth cuts the
 * ground away only inside its circle, and its throat widens a little just
 * under the rim and goes straight down from there (see holeView.ts), so
 * whatever is under the street outside the circle, or past the throat's
 * wall, is hidden. A falling thing tips over the rim, never past it, then
 * slips straight down the throat at its own size, sliding over to where none
 * of it is cut off, and drops through the throat's dark floor out of sight. A swallowed ship's containers spill off and fall
 * by the same rule (`spillPose`).
 *
 * Positions here are measured from the hole's middle, at the level of the
 * street the thing stood on, so the fall follows a moving hole.
 */
import * as THREE from 'three';

/** How deep the throat goes below the rim, in mouth radii: holeView.ts draws it this deep. */
export const THROAT_DEPTH = 2.6;
/**
 * Just under the rim the throat widens to this share of the mouth, over
 * `THROAT_LIP` mouth radii, and goes straight down from there: room for
 * anything a mouth can swallow, at any turn, without it touching the wall.
 */
const THROAT_WIDE = 1.2;
const THROAT_LIP = 0.12;

/** The throat's radius at `depth` below the rim, both in mouth radii: the shape holeView.ts turns its throat from. */
export function throatRadius(depth: number): number {
  if (depth <= 0) return 1;
  const t = Math.min(1, depth / THROAT_LIP);
  return 1 + (THROAT_WIDE - 1) * t * (2 - t);
}

/** The share of the throat a falling thing may fill: the wall bulges in a little between the points checked. */
const MARGIN = 0.95;
/**
 * Just under the street, a thing may still reach past the rim a little, as
 * if scraping over it: up to this many mouth radii more at the street, none
 * by `SCRAPE_DEPTH` down. Without it, a corner that dips a hair under the
 * street outside the mouth would make the whole thing jump in at once.
 */
const SCRAPE = 0.5;
const SCRAPE_DEPTH = 0.08;

/** How far from the hole's middle a falling thing may reach at `depth` under the street, in world units, for a mouth of radius `r`. */
function room(depth: number, r: number): number {
  const d = depth / r;
  return r * (MARGIN * throatRadius(d) + SCRAPE * Math.max(0, 1 - d / SCRAPE_DEPTH));
}

/** Pull a point under the street in toward the hole's middle until everything within `pad` of it is inside the throat. */
function holdInside(p: THREE.Vector3, r: number, pad: number): void {
  const depth = -p.y;
  if (depth <= 0) return;
  const lim = Math.max(0, room(depth, r) - pad);
  const d = Math.hypot(p.x, p.z);
  if (d > lim) {
    p.x *= lim / d;
    p.z *= lim / d;
  }
}

/** A box's eight corners, as (x, y, z) signs one after another: y runs 0 (base) to 1 (top). */
const CORNERS = [-1, 0, -1, 1, 0, -1, -1, 1, -1, 1, 1, -1, -1, 0, 1, 1, 0, 1, -1, 1, 1, 1, 1, 1] as const;
/** Its twelve edges, as pairs of corners. */
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7] as const;
/** Points checked along each edge where it is under the street. */
const SAMPLES = 5;

/** Each corner's offset from the line the thing tips over, as it is turned now: eight (x, y, z). */
const offsets = new Float64Array(24);

/** Whether a thing whose tipping line is at `anchor` is wholly inside the throat where it is under the street. */
function fits(anchor: THREE.Vector3, r: number): boolean {
  const floor = THROAT_DEPTH * r;
  for (let e = 0; e < EDGES.length; e += 2) {
    const a = EDGES[e] * 3;
    const b = EDGES[e + 1] * 3;
    const ax = anchor.x + offsets[a];
    const az = anchor.z + offsets[a + 2];
    const da = -(anchor.y + offsets[a + 1]);
    const bx = anchor.x + offsets[b];
    const bz = anchor.z + offsets[b + 2];
    const db = -(anchor.y + offsets[b + 1]);
    // Above the street, or below the throat's floor: nothing there is cut off.
    if ((da <= 0 && db <= 0) || (da >= floor && db >= floor)) continue;
    // Only the stretch of the edge between the street and the floor counts.
    let u0 = 0;
    let u1 = 1;
    if (db !== da) {
      const atStreet = -da / (db - da);
      const atFloor = (floor - da) / (db - da);
      u0 = Math.max(0, Math.min(atStreet, atFloor));
      u1 = Math.min(1, Math.max(atStreet, atFloor));
    }
    for (let i = 0; i < SAMPLES; i++) {
      const u = u0 + ((u1 - u0) * i) / (SAMPLES - 1);
      const depth = da + (db - da) * u;
      if (depth <= 0) continue;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      const lim = room(depth, r);
      if (x * x + z * z > lim * lim) return false;
    }
  }
  return true;
}

/** Share of the fall spent tipping over the rim before it drops free, for a thing that topples right over. */
const TIP = 0.4;
/** How far it has tipped (radians) when it goes over, and when it is gone. */
const TIPPED = 1.05;
const TUMBLED = 1.45;
/**
 * The furthest out a thing tips over, as a share of the mouth: just inside
 * the rim, so the part of it outside lifts up off the street instead of
 * sinking through it.
 */
const RIM_PIVOT = 0.9;

/**
 * How far over a thing tips, as a share of the full tumble: a thing no taller
 * than the mouth is wide topples right over, a tower much taller than that
 * only leans in (its top reaches no further than about the mouth's far rim)
 * and drops straight down, so it never lies across the street or sinks
 * through the ground outside the mouth.
 */
const tiltShare = (height: number, r: number) => Math.min(1, Math.asin(Math.min(1, (r * 0.9) / height)) / TUMBLED);
/**
 * A thing much longer than the mouth is wide tips in only so far too: its
 * inner end dips no deeper than this share of the mouth, and then it sinks,
 * rather than plunging its far end down while the rest is still on the street.
 */
const PLUNGE = 0.6;

/**
 * How far over a thing may tip and still fit down the throat, as a share of
 * the full tumble. Tipped by `a`, it spans `2 half cos a + height sin a`
 * along the line to the middle, and that must fit across the throat beside
 * its width (`across`, half of it). A thing that only just fits the mouth
 * hardly tips at all: it slips straight down.
 */
function roomToTip(half: number, across: number, height: number, r: number): number {
  const wall = MARGIN * THROAT_WIDE * r;
  if (across >= wall) return 0;
  const span = 2 * Math.sqrt(wall * wall - across * across);
  let share = 0;
  for (let i = 1; i <= 40; i++) {
    const a = (i / 40) * TUMBLED;
    if (2 * half * Math.cos(a) + height * Math.sin(a) > span) break;
    share = i / 40;
  }
  return share;
}

/** A swallowed thing's fall: set once by `startFall`, followed by `fallPose`. */
export interface Fall {
  /** Where the middle of its footprint stood, from the hole's middle. */
  offX: number;
  offZ: number;
  /** Half its footprint across and along (the model's x and z), and its height as drawn. */
  hw: number;
  hd: number;
  height: number;
  rot: number;
  /** How far out from the middle of its footprint it tips over: its own outer edge, or the line just inside the rim if that is nearer. */
  pd: number;
  /** Half its footprint along the line to the middle: as it drops it slides in this far (no further than the hole's middle), so any part that stood past the rim comes in over the mouth. */
  half: number;
  /** How far over it tips, as a share of the full tumble (see `tiltShare`, `PLUNGE` and `roomToTip`). */
  tilt: number;
  /** The share of the fall spent tipping: less for a thing that only leans. */
  tipEnd: number;
  /** How far it sinks by the end, at the least. */
  sink: number;
  /** Its highest point above the line it tips over, once tipped as far as it goes: it sinks until that is under the throat's floor. */
  top: number;
  /**
   * How far through its sinking it is (0..1), and how far through the drop
   * it was when last drawn: it sinks with the drop, but not while it still
   * rests on the rim, and catches up after.
   */
  sunk: number;
  dropped: number;
}

/** Where a falling thing is drawn: its model's origin from the hole's middle, and its turn. */
export interface FallPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const anchor = new THREE.Vector3();
const pivot = new THREE.Vector3();
const corner = new THREE.Vector3();
const axis = new THREE.Vector3();
const yaw = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Toward the hole's middle along the ground, from where a thing stood (a thing right over the middle tips away from the camera). */
function inward(f: Fall): { x: number; z: number } {
  const dist = Math.hypot(f.offX, f.offZ);
  return dist > 1e-6 ? { x: -f.offX / dist, z: -f.offZ / dist } : { x: 0, z: -1 };
}

/** Turn a thing over by `angle` toward the middle: sets `turn`, `pivot` (the line it tips over, in its own frame) and `offsets`. */
function tipOver(f: Fall, angle: number): void {
  const into = inward(f);
  axis.set(into.z, 0, -into.x);
  yaw.setFromAxisAngle(Y_AXIS, f.rot);
  turn.setFromAxisAngle(axis, angle).multiply(yaw);
  pivot.set(-into.x * f.pd, 0, -into.z * f.pd).applyQuaternion(yaw.invert());
  for (let c = 0; c < 24; c += 3) {
    corner.set(CORNERS[c] * f.hw - pivot.x, CORNERS[c + 1] * f.height, CORNERS[c + 2] * f.hd - pivot.z).applyQuaternion(turn);
    offsets[c] = corner.x;
    offsets[c + 1] = corner.y;
    offsets[c + 2] = corner.z;
  }
}

/**
 * Start the fall of a thing whose footprint (`w` × `d`, turned `rot`) stood
 * at (`offX`, `offZ`) from the middle of a mouth of radius `r`, `height` tall.
 */
export function startFall(offX: number, offZ: number, w: number, d: number, height: number, rot: number, r: number): Fall {
  const dist = Math.hypot(offX, offZ);
  // Half its footprint along the line from the hole's middle to it, and across it.
  const along = Math.atan2(offX, offZ) - rot;
  const half = Math.abs(Math.sin(along)) * (w / 2) + Math.abs(Math.cos(along)) * (d / 2);
  const across = Math.abs(Math.cos(along)) * (w / 2) + Math.abs(Math.sin(along)) * (d / 2);
  // It tips over its own outer edge, unless that stands past the rim: then
  // over a line just inside the rim (never inward of its own middle).
  const pd = Math.max(0, Math.min(dist + half, RIM_PIVOT * r) - dist);
  const tilt = Math.min(
    tiltShare(height, r),
    Math.asin(Math.min(1, (PLUNGE * r) / Math.max(1e-6, pd + half))) / TUMBLED,
    roomToTip(half, across, height, r),
  );
  const tipEnd = TIP * Math.min(1, Math.sqrt(tilt / 0.25));
  const f: Fall = { offX, offZ, hw: w / 2, hd: d / 2, height, rot, pd, half, tilt, tipEnd, sink: height * 1.4 + 3, top: 0, sunk: 0, dropped: 0 };
  tipOver(f, TUMBLED * tilt);
  for (let c = 1; c < 24; c += 3) f.top = Math.max(f.top, offsets[c]);
  return f;
}

/** Whether a thing fits with its tipping line `reach` out from the hole's middle (along `x`, `z`) at height `y`. */
function fitsAt(x: number, z: number, reach: number, y: number, r: number): boolean {
  anchor.set(x * reach, y, z * reach);
  return fits(anchor, r);
}

/**
 * How far out from the hole's middle a thing's tipping line should be (at
 * height `y`, along `x`, `z`): `want` if all of it is inside the throat
 * there, or else as near `want` as it can be on the way to `best`, where it
 * fits if it fits anywhere; `best` if even there it does not.
 */
function fitReach(x: number, z: number, y: number, want: number, best: number, r: number): number {
  if (fitsAt(x, z, want, y, r)) return want;
  if (!fitsAt(x, z, best, y, r)) return best;
  let ok = best;
  let not = want;
  for (let i = 0; i < 8; i++) {
    const mid = (ok + not) / 2;
    if (fitsAt(x, z, mid, y, r)) ok = mid;
    else not = mid;
  }
  return ok;
}

/**
 * Where a falling thing is drawn `k` (0..1) of the way through its fall into
 * a mouth that is now `r` across. It tips over the edge of its footprint
 * furthest from the hole's middle, or nearer in when that edge stands past
 * the rim (the part outside lifts up), leaning in faster and faster like
 * anything overbalancing; then it drops, still turning over, slipping down
 * the throat and sliding over to where none of it is cut off by the wall.
 * It keeps its heading and its size, and by the end it is all below the
 * throat's floor.
 */
export function fallPose(f: Fall, k: number, r: number, out: FallPose): void {
  const into = inward(f);
  // Tipping (accelerating), then over and dropping (under gravity).
  const tip = f.tipEnd > 0 ? Math.min(1, k / f.tipEnd) : 1;
  const drop = Math.max(0, (k - f.tipEnd) / (1 - f.tipEnd));
  tipOver(f, (TIPPED * tip * tip + (TUMBLED - TIPPED) * drop) * f.tilt);
  // Its middle slides in as it drops, never past the hole's middle.
  const planned = Math.max(0, Math.hypot(f.offX, f.offZ) - drop * f.half) + f.pd;
  // How far it reaches out and in from its tipping line as it leans now, and to the side.
  let lo = Infinity;
  let hi = -Infinity;
  let side = 0;
  for (let c = 0; c < 24; c += 3) {
    const away = -(into.x * offsets[c] + into.z * offsets[c + 2]);
    lo = Math.min(lo, away);
    hi = Math.max(hi, away);
    side = Math.max(side, Math.abs(into.z * offsets[c] - into.x * offsets[c + 2]));
  }
  // The nearest place to that where all of it is inside the throat's wall,
  // or right over the middle if it is too big for that. It eases over to
  // there as it drops, so it is there before it is deep: a tall thing
  // leaning in has its foot kicked back out, as anything toppling does.
  const wall = MARGIN * THROAT_WIDE * r;
  const span = side < wall ? Math.sqrt(wall * wall - side * side) : 0;
  const centred = -(lo + hi) / 2;
  const target = hi - lo <= 2 * span ? Math.min(Math.max(planned, -span - lo), span - hi) : centred;
  const ease = 1 - (1 - drop) * (1 - drop);
  const want = planned + (target - planned) * ease;
  // Down under gravity, deep enough by the end that the top of it is under
  // the floor; but a thing still resting on the street past the rim sinks
  // only as far as it fits, while it slides off.
  const deep = Math.max(0, THROAT_DEPTH * r * 1.02 + f.top - f.sink);
  const depthAt = (u: number) => -(u * u * f.sink + u * u * u * u * deep);
  const free = drop >= 1 ? 1 : f.sunk + ((1 - f.sunk) * Math.max(0, drop - f.dropped)) / (1 - f.dropped);
  f.dropped = drop;
  let sunk = free;
  if (drop < 1 && !fitsAt(-into.x, -into.z, want, depthAt(free), r)) {
    sunk = f.sunk;
    if (fitsAt(-into.x, -into.z, want, depthAt(sunk), r)) {
      let not = free;
      for (let i = 0; i < 8; i++) {
        const mid = (sunk + not) / 2;
        if (fitsAt(-into.x, -into.z, want, depthAt(mid), r)) sunk = mid;
        else not = mid;
      }
    }
  }
  f.sunk = sunk;
  const y = depthAt(sunk);
  const reach = fitReach(-into.x, -into.z, y, want, centred, r);
  anchor.set(-into.x * reach, y, -into.z * reach);
  out.quaternion.copy(turn);
  out.position.copy(pivot).applyQuaternion(turn).negate().add(anchor);
}

/** A container spilling off a swallowed ship, once it has slid off the deck: see `startSpill`. */
export interface Spill {
  /** Where its middle was when it came off, from the hole's middle, and how it was turned then. */
  x0: number;
  y0: number;
  z0: number;
  q0: THREE.Quaternion;
  /** Where it lands, from the hole's middle. */
  tx: number;
  tz: number;
  /** How fast it hops off, and how hard it falls (so it ends deep in the throat). */
  vy: number;
  g: number;
  /** It rolls over the way it slides, and turns a little as it goes. */
  rollX: number;
  rollZ: number;
  roll: number;
  spin: number;
  /** Half its width, height and length. */
  hw: number;
  hh: number;
  hd: number;
}

/** A spill not started yet, for a box `size` big: made when the ship goes in, filled in by `startSpill`. */
export function emptySpill(size: { w: number; h: number; d: number }): Spill {
  const still = { x0: 0, y0: 0, z0: 0, tx: 0, tz: 0, vy: 0, g: 0, rollX: 1, rollZ: 0, roll: 0, spin: 0 };
  return { ...still, q0: new THREE.Quaternion(), hw: size.w / 2, hh: size.h / 2, hd: size.d / 2 };
}

/**
 * A number in 0..1 for `seed` and `i`, the same every time: what makes each
 * container come off and fly a little differently.
 */
export function noise(seed: number, i: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(i + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Start a container's spill from where it stands now (`x`, `y`, `z` from
 * the hole's middle, turned `q`), sliding off the deck
 * to the side `sideX`, `sideZ` (a unit step, across the ship) and into a
 * mouth of radius `r`. `seed` makes each one fly a little differently.
 */
export function startSpill(
  b: Spill,
  x: number,
  y: number,
  z: number,
  q: THREE.Quaternion,
  sideX: number,
  sideZ: number,
  r: number,
  seed: number,
): void {
  // Off the side of the deck and in toward the middle, scattering, but
  // landing well inside the mouth.
  const push = (0.15 + 0.2 * noise(seed, 0)) * r;
  const pull = 0.25 + 0.35 * noise(seed, 1);
  let tx = x + sideX * push - x * pull;
  let tz = z + sideZ * push - z * pull;
  const far = Math.hypot(tx, tz);
  const most = (0.3 + 0.3 * noise(seed, 2)) * r;
  if (far > most) {
    tx *= most / far;
    tz *= most / far;
  }
  // A hop off the deck as high as `hop`, then down through the throat's floor.
  const hop = (0.07 + 0.1 * noise(seed, 3)) * r;
  const depth = (THROAT_DEPTH * 1.02 + 0.3 * noise(seed, 4)) * r + Math.hypot(b.hw, b.hh, b.hd);
  b.vy = 2 * hop + 2 * Math.sqrt(hop * hop + hop * (Math.max(0, y) + depth));
  b.g = y + b.vy + depth;
  // It rolls over the way it travels.
  const len = Math.hypot(tx - x, tz - z);
  b.rollX = len > 1e-6 ? (tz - z) / len : sideZ;
  b.rollZ = len > 1e-6 ? -(tx - x) / len : -sideX;
  b.roll = 1.6 + 2 * noise(seed, 5);
  b.spin = (noise(seed, 6) - 0.5) * 1.6;
  b.x0 = x;
  b.y0 = y;
  b.z0 = z;
  b.q0.copy(q);
  b.tx = tx;
  b.tz = tz;
}

/**
 * Where a spilling container is drawn `u` (0..1) of the way through its
 * spill into a mouth now `r` across: it hops off the deck, slides out to the
 * side and in toward the middle, tumbling, then drops down the throat, kept
 * clear of its wall, and through its floor out of sight.
 */
export function spillPose(b: Spill, u: number, r: number, out: FallPose): void {
  // Across quickly, down under gravity: it is over the mouth before it is under the street.
  const across = 1 - Math.pow(1 - u, 3);
  anchor.set(b.x0 + (b.tx - b.x0) * across, b.y0 + b.vy * u - b.g * u * u, b.z0 + (b.tz - b.z0) * across);
  holdInside(anchor, r, Math.hypot(b.hw, b.hh, b.hd));
  axis.set(b.rollX, 0, b.rollZ);
  turn.setFromAxisAngle(axis, b.roll * Math.pow(u, 1.3));
  yaw.setFromAxisAngle(Y_AXIS, b.spin * u);
  turn.multiply(yaw).multiply(b.q0);
  out.quaternion.copy(turn);
  out.position.copy(anchor);
}
