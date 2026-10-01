import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIT, KINDS, footSize, type PropKind } from '../domain/catalog';
import { emptySpill, fallPose, spillPose, startFall, startSpill, throatRadius, THROAT_DEPTH, type FallPose } from './fall';

/** Below this depth (in mouth radii) a corner may no longer reach past the throat's wall at all. */
const CLEAR_BELOW = 0.08;

const pose = (): FallPose => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });

/** Points all over a box's edges (`hw`, `hd` half sizes, y from `y0` to `y1`), in its own frame. */
function edgePoints(hw: number, y0: number, y1: number, hd: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        out.push(new THREE.Vector3(hw * (2 * u - 1), a < 0 ? y0 : y1, b * hd));
        out.push(new THREE.Vector3(a * hw, y0 + (y1 - y0) * u, b * hd));
        out.push(new THREE.Vector3(a * hw, b < 0 ? y0 : y1, hd * (2 * u - 1)));
      }
    }
  }
  return out;
}

/** The points of a box drawn at `p`, where they are. */
function placed(points: THREE.Vector3[], p: FallPose): THREE.Vector3[] {
  const m = new THREE.Matrix4().compose(p.position, p.quaternion, new THREE.Vector3(1, 1, 1));
  return points.map((q) => q.clone().applyMatrix4(m));
}

/**
 * How far past the throat's wall (in mouth radii) any part of a box drawn at
 * `p` reaches, where it is deeper than `CLEAR_BELOW` under the street and
 * above the throat's floor: 0 when it is all inside.
 */
function worstReach(points: THREE.Vector3[], p: FallPose, r: number): number {
  let worst = 0;
  for (const v of placed(points, p)) {
    const depth = -v.y / r;
    if (depth <= CLEAR_BELOW || depth >= THROAT_DEPTH) continue;
    worst = Math.max(worst, Math.hypot(v.x, v.z) / r - throatRadius(depth));
  }
  return worst;
}

/** The highest point of a box drawn at `p`. */
const topOf = (points: THREE.Vector3[], p: FallPose) => Math.max(...placed(points, p).map((v) => v.y));

/**
 * Where a thing of `size` can stand, from the middle of a mouth of radius
 * `r`, when it is swallowed (see domain/holes.ts eatProps): over the middle,
 * and halfway and all the way out to the furthest it can be, all round.
 */
function spots(size: number, r: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]];
  const far = r - size * 0.35;
  for (const share of [0.5, 1]) {
    for (let a = 0; a < 6; a++) out.push([Math.sin((a * Math.PI) / 3 + 0.3) * far * share, Math.cos((a * Math.PI) / 3 + 0.3) * far * share]);
  }
  return out;
}

/** Run a whole fall at 60 frames a second: the worst reach past the wall, the biggest step sideways in one frame, and the last pose. */
function runFall(kind: PropKind, hScale: number, r: number, x: number, z: number, rot: number) {
  const info = KINDS[kind];
  const height = info.h * hScale;
  const f = startFall(x, z, info.w, info.d, height, rot, r);
  const points = edgePoints(info.w / 2, 0, height, info.d / 2);
  const p = pose();
  let worst = 0;
  let step = 0;
  let last: THREE.Vector3 | null = null;
  const frames = 96;
  for (let i = 0; i <= frames; i++) {
    fallPose(f, i / frames, r, p);
    worst = Math.max(worst, worstReach(points, p, r));
    if (last) step = Math.max(step, Math.hypot(p.position.x - last.x, p.position.z - last.z) / r);
    last = p.position.clone();
  }
  return { worst, step, f, p, points };
}

/** Big things, and the shortest each comes (a short tower has the widest footprint for its mouth). */
const BIG: Array<[PropKind, number]> = [
  ['ship', 1],
  ['stadium', 1],
  ['mall', 1],
  ['factory', 1],
  ['warehouse', 1],
  ['office', 0.9],
  ['house', 0.85],
  ['tower', 0.8],
  ['skyscraper', 0.8],
  ['apartment', 0.8],
  ['mountain', 1],
];

describe('throatRadius', () => {
  it('is the mouth at the rim and never narrows going down', () => {
    expect(throatRadius(0)).toBe(1);
    expect(throatRadius(-1)).toBe(1);
    for (let d = 0; d < THROAT_DEPTH; d += 0.01) expect(throatRadius(d + 0.01)).toBeGreaterThanOrEqual(throatRadius(d));
  });

  it('is wider than anything a mouth can swallow, from just under the rim down', () => {
    for (const [kind, hScale] of BIG) {
      const info = KINDS[kind];
      // Middle to corner, for the smallest mouth that takes it.
      const corner = Math.hypot(info.w, info.d) / 2 / (footSize(kind, hScale) / FIT);
      expect(corner, kind).toBeLessThan(0.95 * throatRadius(0.3));
    }
  });
});

describe('fallPose', () => {
  it('keeps every part of a big thing inside the throat, from anywhere it can be swallowed', () => {
    for (const [kind, hScale] of BIG) {
      const size = footSize(kind, hScale);
      // The smallest mouth that takes it, and one a good deal bigger.
      for (const r of [size / FIT, (size / FIT) * 1.6]) {
        for (const [x, z] of spots(size, r)) {
          for (const rot of [0, 0.7]) {
            const { worst } = runFall(kind, hScale, r, x, z, rot);
            expect(worst, `${kind} in r=${r.toFixed(1)} from (${x.toFixed(1)}, ${z.toFixed(1)}) turned ${rot}`).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  it('slides a big thing in smoothly, never with a jump', () => {
    for (const [kind, hScale] of BIG) {
      const size = footSize(kind, hScale);
      const r = size / FIT;
      for (const [x, z] of spots(size, r)) {
        const { step } = runFall(kind, hScale, r, x, z, 0.4);
        expect(step, `${kind} from (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(0.05);
      }
    }
  });

  it('drops everything, big or small, all the way under the throat floor by the end', () => {
    for (const [kind, hScale] of [...BIG, ['car', 1] as [PropKind, number], ['person', 1] as [PropKind, number]]) {
      const size = footSize(kind, hScale);
      for (const r of [size / FIT, (size / FIT) * 3]) {
        const [x, z] = spots(size, r)[3];
        const { p, points } = runFall(kind, hScale, r, x, z, 0.4);
        expect(topOf(points, p), `${kind} in r=${r.toFixed(1)}`).toBeLessThan(-THROAT_DEPTH * r);
      }
    }
  });

  it('lets a thing that only just fits slip straight down, hardly tipping', () => {
    const info = KINDS.house;
    const r = footSize('house', 0.85) / FIT;
    const f = startFall(0, r * 0.4, info.w, info.d, info.h * 0.85, 0, r);
    const p = pose();
    for (let k = 0; k <= 1; k += 0.05) {
      fallPose(f, k, r, p);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);
      expect(Math.acos(up.y)).toBeLessThan(0.2);
    }
  });

  it('topples a small thing right over as it goes in', () => {
    const r = 20;
    const info = KINDS.car;
    const f = startFall(0, 10, info.w, info.d, info.h, 0, r);
    const p = pose();
    fallPose(f, 0.4, r, p);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);
    expect(Math.acos(up.y)).toBeCloseTo(1.05, 2);
    // Over toward the middle (at -z).
    expect(up.z).toBeLessThan(0);
  });

  it('tips a thing standing past the rim over the rim, lifting the part outside', () => {
    // A ship lying along the line to the middle, its far end well past the rim.
    const r = (footSize('ship') / FIT) * 1.6;
    const f = startFall(0, r * 0.6, 12, 44, 14, 0, r);
    expect(r * 0.6 + f.pd).toBeLessThan(r);
    const p = pose();
    fallPose(f, 0.2, r, p);
    // Its outer end (the bow, at +z) is up off the water, not under the street.
    const bow = new THREE.Vector3(0, 0, 22).applyQuaternion(p.quaternion).add(p.position);
    expect(bow.y).toBeGreaterThan(0);
  });
});

describe('spillPose', () => {
  it('lands containers inside the throat, even ones that came off past the rim, and drops them under its floor', () => {
    const r = footSize('ship') / FIT;
    const size = { w: 2.4, h: 2.4, d: 6.1 };
    const points = edgePoints(size.w / 2, -size.h / 2, size.h / 2, size.d / 2);
    const p = pose();
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const a = i * 0.7;
      const from = r * (0.2 + 0.03 * i);
      const b = emptySpill(size);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      startSpill(b, Math.sin(a) * from, 4 + (i % 3) * 2.5, Math.cos(a) * from, q, Math.cos(a), -Math.sin(a), r, i);
      for (let u = 0; u <= 1; u += 1 / 60) {
        spillPose(b, u, r, p);
        worst = Math.max(worst, worstReach(points, p, r));
      }
      spillPose(b, 1, r, p);
      expect(topOf(points, p)).toBeLessThan(-THROAT_DEPTH * r);
    }
    expect(worst).toBeLessThan(0.01);
  });
});
