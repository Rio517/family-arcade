/**
 * How a swallowed thing moves as it falls into a hole, worked out apart from
 * the meshes so it can be checked without a renderer. A hole's mouth cuts the
 * ground away only inside its circle, and its throat narrows going down (see
 * holeView.ts), so whatever is under the street outside the circle, or
 * outside the throat's wall, is hidden. A thing much wider than the mouth
 * would lose its corners that way as it tipped in. So a falling thing tips
 * over the rim, never past it, then slides toward the middle and shrinks as
 * it drops, just enough that every part of it under the street stays inside
 * the throat at the depth it has reached, and dwindles away at the bottom.
 * A small thing already fits and falls as before. A swallowed ship's
 * containers spill off and fall by the same rule (`spillPose`).
 *
 * Positions here are measured from the hole's middle, at the level of the
 * street the thing stood on, so the fall follows a moving hole.
 */
import * as THREE from 'three';

/** How deep the throat goes below the rim, in mouth radii: holeView.ts draws its funnel this deep. */
export const THROAT_DEPTH = 2.6;
/** The throat narrows to this share of the mouth at its floor. */
const THROAT_FLOOR = 0.42;

/**
 * The throat's radius at `depth` below the rim, both in mouth radii: the
 * shape holeView.ts turns its funnel from (its PIT_PROFILE), 1 at the rim
 * and narrowing quickly, then slowly, to its floor.
 */
export function throatRadius(depth: number): number {
  if (depth <= 0) return 1;
  if (depth >= THROAT_DEPTH) return THROAT_FLOOR;
  const t = Math.pow(depth / THROAT_DEPTH, 1 / 1.15);
  return THROAT_FLOOR + (1 - THROAT_FLOOR) * Math.pow(1 - t, 2.4);
}

/** The throat's radius looked up rather than worked out: it is asked for thousands of times a frame. */
const LUT_STEPS = 128;
const THROAT_LUT = Float32Array.from({ length: LUT_STEPS + 2 }, (_, i) => throatRadius((i / LUT_STEPS) * THROAT_DEPTH));
function throatAt(depth: number): number {
  const f = (Math.min(Math.max(depth, 0), THROAT_DEPTH) / THROAT_DEPTH) * LUT_STEPS;
  const i = Math.floor(f);
  return THROAT_LUT[i] + (THROAT_LUT[i + 1] - THROAT_LUT[i]) * (f - i);
}

/** The share of the throat a falling thing may fill: the wall bulges in a little between the points checked. */
const MARGIN = 0.95;
/**
 * Just under the street, a thing may still reach past the rim a little, as
 * if scraping over it: up to this many mouth radii more at the street, none
 * by `SCRAPE_DEPTH` down. Without it, a corner that dips a hair under the
 * street outside the mouth would make the whole thing jump smaller at once.
 */
const SCRAPE = 0.5;
const SCRAPE_DEPTH = 0.08;
/** The point a thing hangs from stays this far inside the room it has, leaving space round it for the rest of it. */
const HOLD = 0.85;

/** How far from the hole's middle a falling thing may reach at `depth` under the street, in world units, for a mouth of radius `r`. */
function room(depth: number, r: number): number {
  const d = depth / r;
  return r * (MARGIN * throatAt(d) + SCRAPE * Math.max(0, 1 - d / SCRAPE_DEPTH));
}

/** Pull a point under the street in toward the hole's middle until it is inside the throat, with room to spare. */
function holdInside(p: THREE.Vector3, r: number): void {
  const depth = -p.y;
  if (depth <= 0) return;
  // Below the floor nothing shows; keep to the floor's room so it never jumps back out.
  const lim = HOLD * room(Math.min(depth, THROAT_DEPTH * r * 0.999), r);
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

/** Each corner's offset from the point the thing shrinks about, as drawn at full size: eight (x, y, z). */
const offsets = new Float64Array(24);

/** Whether a thing drawn at `s` of its size, shrinking about `anchor`, is wholly inside the throat where it is under the street. */
function fits(anchor: THREE.Vector3, s: number, r: number): boolean {
  const floor = THROAT_DEPTH * r;
  for (let e = 0; e < EDGES.length; e += 2) {
    const a = EDGES[e] * 3;
    const b = EDGES[e + 1] * 3;
    const ax = anchor.x + s * offsets[a];
    const az = anchor.z + s * offsets[a + 2];
    const da = -(anchor.y + s * offsets[a + 1]);
    const bx = anchor.x + s * offsets[b];
    const bz = anchor.z + s * offsets[b + 2];
    const db = -(anchor.y + s * offsets[b + 1]);
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
      // The stretch just above the floor counts too: the throat is narrowest there.
      const depth = Math.min(da + (db - da) * u, floor * 0.999);
      if (depth <= 0) continue;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      const lim = room(depth, r);
      if (x * x + z * z > lim * lim) return false;
    }
  }
  return true;
}

/** The largest size, no more than `most`, at which the corners in `offsets` fit inside the throat, shrinking about `anchor`. */
function fitScale(anchor: THREE.Vector3, most: number, r: number): number {
  if (fits(anchor, most, r)) return most;
  // Step down to a size that fits, then narrow in on the largest one.
  let hi = most;
  let lo = most * 0.8;
  while (lo > 0.02 && !fits(anchor, lo, r)) {
    hi = lo;
    lo *= 0.8;
  }
  if (lo <= 0.02) return lo;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (fits(anchor, mid, r)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Share of the fall spent tipping over the rim before it drops free. */
const TIP = 0.4;
/** How far it has tipped (radians) when it goes over, and when it is gone. */
const TIPPED = 1.05;
const TUMBLED = 1.45;
/**
 * The furthest out a thing tips over, as a share of the mouth: just inside
 * the rim, where the throat's wall curves in under the street, so the edge
 * it tips over clears the wall as it goes.
 */
const RIM_PIVOT = 0.9;
/**
 * Moments of the fall looked at when it starts (every `STEP`), to see how
 * small it must be by each: it eases down to each size over the `EASE_IN`
 * before the moment just ahead of it, instead of shrinking all at once when a
 * corner first dips under the street.
 */
const STEP = 0.05;
const LOOK_AHEAD = Array.from({ length: 15 }, (_, i) => (i + 1) * STEP);
const EASE_IN = 0.25;
/** The last share of the fall, in which it dwindles away into the dark, so it is not just gone. */
const DWINDLE = 0.3;

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
 * inner end dips no deeper than this share of the mouth, where the throat is
 * still wide, and then it sinks, rather than plunging its far end to the
 * narrow bottom while the rest is still on the street.
 */
const PLUNGE = 0.6;

/** A swallowed thing's fall: set once by `startFall`, its size (`s`) kept up by `fallPose`. */
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
  /** Half its footprint along the line to the middle: as it drops it slides in this far, so any part that stood past the rim comes in over the mouth. */
  half: number;
  /** How far over it tips, as a share of the full tumble (see `tiltShare` and `PLUNGE`). */
  tilt: number;
  /** How far it sinks by the end. */
  sink: number;
  /** How small it must be by each of the `LOOK_AHEAD` moments. */
  needs: number[];
  /** How big it is drawn now: it shrinks to fit the throat, and never grows back. */
  s: number;
}

/** Where a falling thing is drawn: its model's origin from the hole's middle, its turn, and its size (the same every way). */
export interface FallPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
}

const anchor = new THREE.Vector3();
const pivot = new THREE.Vector3();
const corner = new THREE.Vector3();
const axis = new THREE.Vector3();
const yaw = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Start the fall of a thing whose footprint (`w` × `d`, turned `rot`) stood
 * at (`offX`, `offZ`) from the middle of a mouth of radius `r`, `height` tall.
 */
export function startFall(offX: number, offZ: number, w: number, d: number, height: number, rot: number, r: number): Fall {
  const dist = Math.hypot(offX, offZ);
  // Half its footprint along the line from the hole's middle to it.
  const along = Math.atan2(offX, offZ) - rot;
  const half = Math.abs(Math.sin(along)) * (w / 2) + Math.abs(Math.cos(along)) * (d / 2);
  // It tips over its own outer edge, unless that stands past the rim: then
  // over a line just inside the rim (never inward of its own middle).
  const pd = Math.max(0, Math.min(dist + half, RIM_PIVOT * r) - dist);
  const tilt = Math.min(tiltShare(height, r), Math.asin(Math.min(1, (PLUNGE * r) / Math.max(1e-6, pd + half))) / TUMBLED);
  const f: Fall = { offX, offZ, hw: w / 2, hd: d / 2, height, rot, pd, half, tilt, sink: height * 1.4 + 3, needs: [], s: 1 };
  // Look ahead: how small must it be by each moment?
  const pose: FallPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
  const needs = LOOK_AHEAD.map((k) => {
    f.s = 1;
    fallPose(f, k, r, pose);
    return f.s;
  });
  f.needs = needs;
  f.s = 1;
  return f;
}

/**
 * Where a falling thing is drawn `k` (0..1) of the way through its fall into
 * a mouth that is now `r` across. It tips over the edge of its footprint
 * furthest from the hole's middle, or nearer in when that edge stands past
 * the rim (the part outside lifts up), leaning in faster and faster like
 * anything overbalancing; then it drops, still turning over, sliding down
 * the throat toward the middle. It keeps its heading: no spinning. All the
 * while it is drawn just small enough to fit the throat, and it dwindles
 * away at the end.
 */
export function fallPose(f: Fall, k: number, r: number, out: FallPose): void {
  const dist = Math.hypot(f.offX, f.offZ);
  // Toward the middle along the ground (a thing right over the middle tips away from the camera).
  const inX = dist > 1e-6 ? -f.offX / dist : 0;
  const inZ = dist > 1e-6 ? -f.offZ / dist : -1;
  // Tipping (accelerating), then over and dropping (under gravity).
  const tip = Math.min(1, k / TIP);
  const drop = Math.max(0, (k - TIP) / (1 - TIP));
  const angle = (TIPPED * tip * tip + (TUMBLED - TIPPED) * drop) * f.tilt;
  axis.set(inZ, 0, -inX);
  yaw.setFromAxisAngle(Y_AXIS, f.rot);
  turn.setFromAxisAngle(axis, angle).multiply(yaw);
  // The line it tips over: sliding in and sinking as it drops, and kept inside the throat.
  const reach = Math.max(0, dist + f.pd - drop * f.half);
  anchor.set(-inX * reach, -drop * drop * f.sink, -inZ * reach);
  holdInside(anchor, r);
  // That line on the thing itself, in its own frame: across its base.
  pivot.set(-inX * f.pd, 0, -inZ * f.pd).applyQuaternion(yaw.invert());
  for (let c = 0; c < 24; c += 3) {
    corner.set(CORNERS[c] * f.hw - pivot.x, CORNERS[c + 1] * f.height, CORNERS[c + 2] * f.hd - pivot.z).applyQuaternion(turn);
    offsets[c] = corner.x;
    offsets[c + 1] = corner.y;
    offsets[c + 2] = corner.z;
  }
  // Easing down to the sizes it will need, in time, and no bigger than the
  // throat has room for now.
  let most = f.s;
  for (let i = 0; i < f.needs.length; i++) {
    const by = Math.max(LOOK_AHEAD[i] - STEP, STEP);
    const from = Math.max(0, by - EASE_IN);
    const t = Math.min(1, Math.max(0, (k - from) / (by - from)));
    most = Math.min(most, 1 - (1 - f.needs[i]) * t * t * (3 - 2 * t));
  }
  f.s = fitScale(anchor, most, r);
  const end = Math.max(0, (k - (1 - DWINDLE)) / DWINDLE);
  const s = f.s * (1 - end * end * (3 - 2 * end));
  out.scale = s;
  out.quaternion.copy(turn);
  out.position.copy(pivot).applyQuaternion(turn).multiplyScalar(-s).add(anchor);
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
  /** How big it is drawn now (see `Fall.s`). */
  s: number;
}

/** A spill not started yet, for a box `size` big: made when the ship goes in, filled in by `startSpill`. */
export function emptySpill(size: { w: number; h: number; d: number }): Spill {
  const still = { x0: 0, y0: 0, z0: 0, tx: 0, tz: 0, vy: 0, g: 0, rollX: 1, rollZ: 0, roll: 0, spin: 0, s: 1 };
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
 * the hole's middle, turned `q`, at `s` of its size), sliding off the deck
 * to the side `sideX`, `sideZ` (a unit step, across the ship) and into a
 * mouth of radius `r`. `seed` makes each one fly a little differently.
 */
export function startSpill(
  b: Spill,
  x: number,
  y: number,
  z: number,
  q: THREE.Quaternion,
  s: number,
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
  // A hop off the deck as high as `hop`, then down deep into the throat.
  const hop = (0.07 + 0.1 * noise(seed, 3)) * r;
  const depth = (1.1 + 0.5 * noise(seed, 4)) * r;
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
  b.s = s;
}

/**
 * Where a spilling container is drawn `u` (0..1) of the way through its
 * spill into a mouth now `r` across: it hops off the deck, slides out to the
 * side and in toward the middle, tumbling, then drops down the throat, kept
 * just small enough to fit it, and dwindles away at the end.
 */
export function spillPose(b: Spill, u: number, r: number, out: FallPose): void {
  // Across quickly, down under gravity: it is over the mouth before it is under the street.
  const across = 1 - Math.pow(1 - u, 3);
  anchor.set(b.x0 + (b.tx - b.x0) * across, b.y0 + b.vy * u - b.g * u * u, b.z0 + (b.tz - b.z0) * across);
  holdInside(anchor, r);
  axis.set(b.rollX, 0, b.rollZ);
  turn.setFromAxisAngle(axis, b.roll * Math.pow(u, 1.3));
  yaw.setFromAxisAngle(Y_AXIS, b.spin * u);
  turn.multiply(yaw).multiply(b.q0);
  for (let c = 0; c < 24; c += 3) {
    corner.set(CORNERS[c] * b.hw, (CORNERS[c + 1] * 2 - 1) * b.hh, CORNERS[c + 2] * b.hd).applyQuaternion(turn);
    offsets[c] = corner.x;
    offsets[c + 1] = corner.y;
    offsets[c + 2] = corner.z;
  }
  b.s = fitScale(anchor, b.s, r);
  const end = Math.max(0, (u - (1 - DWINDLE)) / DWINDLE);
  out.scale = b.s * (1 - end * end * (3 - 2 * end));
  out.quaternion.copy(turn);
  out.position.copy(anchor);
}
