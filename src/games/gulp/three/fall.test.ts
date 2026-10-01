import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIT, KINDS, footSize, type PropKind } from '../domain/catalog';
import { emptySpill, fallPose, spillPose, startFall, startSpill, throatRadius, THROAT_DEPTH, type FallPose } from './fall';

/** The throat holeView.ts turns: (radius, height) pairs from the rim down, in mouth radii. */
const PIT_PROFILE = Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  return { radius: 0.42 + 0.58 * Math.pow(1 - t, 2.4), depth: THROAT_DEPTH * Math.pow(t, 1.15) };
});

/** Below this depth (in mouth radii) a corner may no longer reach past the throat's wall at all. */
const CLEAR_BELOW = 0.08;

const pose = (): FallPose => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 });

/** Points all over a box's edges (`hw`, `hh`, `hd` half sizes, y from `y0` to `y1`), in its own frame. */
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

/**
 * How far past the throat's wall (in mouth radii) any part of a box drawn at
 * `p` reaches, where it is deeper than `CLEAR_BELOW` under the street and
 * above the throat's floor: 0 when it is all inside.
 */
function worstReach(points: THREE.Vector3[], p: FallPose, r: number): number {
  const m = new THREE.Matrix4().compose(p.position, p.quaternion, new THREE.Vector3(p.scale, p.scale, p.scale));
  const v = new THREE.Vector3();
  let worst = 0;
  for (const q of points) {
    v.copy(q).applyMatrix4(m);
    const depth = -v.y / r;
    if (depth <= CLEAR_BELOW || depth >= THROAT_DEPTH) continue;
    worst = Math.max(worst, Math.hypot(v.x, v.z) / r - throatRadius(depth));
  }
  return worst;
}

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

/** Run a whole fall at 60 frames a second; the worst reach past the wall and the biggest one-frame shrink. */
function runFall(kind: PropKind, r: number, x: number, z: number, rot: number) {
  const info = KINDS[kind];
  const f = startFall(x, z, info.w, info.d, info.h, rot, r);
  const points = edgePoints(info.w / 2, 0, info.h, info.d / 2);
  const p = pose();
  let worst = 0;
  let jump = 0;
  let last = 1;
  const frames = 96;
  for (let i = 0; i <= frames; i++) {
    const k = i / frames;
    fallPose(f, k, r, p);
    worst = Math.max(worst, worstReach(points, p, r));
    // The dwindle at the end is meant: count only the fit's own shrinking.
    if (k < 0.7) jump = Math.max(jump, last - p.scale);
    last = p.scale;
  }
  return { worst, jump, f };
}

describe('throatRadius', () => {
  it('follows the funnel holeView.ts draws, from the rim to the floor', () => {
    for (const { radius, depth } of PIT_PROFILE) expect(throatRadius(depth)).toBeCloseTo(radius, 9);
    expect(throatRadius(0)).toBe(1);
    expect(throatRadius(-1)).toBe(1);
    expect(throatRadius(THROAT_DEPTH * 2)).toBeCloseTo(0.42, 9);
  });

  it('only narrows going down', () => {
    for (let d = 0; d < THROAT_DEPTH; d += 0.01) expect(throatRadius(d + 0.01)).toBeLessThanOrEqual(throatRadius(d));
  });
});

describe('fallPose', () => {
  const big: PropKind[] = ['ship', 'stadium', 'mall', 'factory', 'warehouse', 'office', 'house', 'tower', 'skyscraper', 'mountain'];

  it('keeps every part of a big thing inside the throat, from anywhere it can be swallowed', () => {
    for (const kind of big) {
      const size = footSize(kind);
      // The smallest mouth that takes it, and one a good deal bigger.
      for (const r of [size / FIT, (size / FIT) * 1.6]) {
        for (const [x, z] of spots(size, r)) {
          for (const rot of [0, 0.7]) {
            const { worst } = runFall(kind, r, x, z, rot);
            expect(worst, `${kind} in r=${r.toFixed(1)} from (${x.toFixed(1)}, ${z.toFixed(1)}) turned ${rot}`).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  it('shrinks a big thing smoothly, never all at once', () => {
    for (const kind of big) {
      const size = footSize(kind);
      const r = size / FIT;
      for (const [x, z] of spots(size, r)) {
        const { jump } = runFall(kind, r, x, z, 0.4);
        expect(jump, `${kind} from (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThan(0.06);
      }
    }
  });

  it('tips a thing standing past the rim over the rim, lifting the part outside', () => {
    // A ship lying along the line to the middle, its far end well past the rim.
    const r = footSize('ship') / FIT;
    const f = startFall(0, r * 0.6, 12, 44, 14, 0, r);
    expect(r * 0.6 + f.pd).toBeLessThan(r);
    const p = pose();
    fallPose(f, 0.2, r, p);
    // Its outer end (the bow, at +z) is up off the water, not under the street.
    const bow = new THREE.Vector3(0, 0, 22).multiplyScalar(p.scale).applyQuaternion(p.quaternion).add(p.position);
    expect(bow.y).toBeGreaterThan(0);
  });

  it('lets a small thing fall as it always has: full size until it dwindles away at the end', () => {
    const r = 20;
    const info = KINDS.car;
    for (const [x, z] of [
      [0, 10],
      [12, -9],
      [-5, 3],
    ]) {
      const f = startFall(x, z, info.w, info.d, info.h, 0.5, r);
      const p = pose();
      for (let k = 0; k <= 0.7; k += 0.05) {
        fallPose(f, k, r, p);
        expect(p.scale).toBe(1);
      }
      fallPose(f, 1, r, p);
      expect(p.scale).toBeCloseTo(0, 5);
    }
  });
});

describe('spillPose', () => {
  it('lands containers inside the throat, even ones that came off past the rim', () => {
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
      startSpill(b, Math.sin(a) * from, 4 + (i % 3) * 2.5, Math.cos(a) * from, q, 1, Math.cos(a), -Math.sin(a), r, i);
      for (let u = 0; u <= 1; u += 1 / 60) {
        spillPose(b, u, r, p);
        worst = Math.max(worst, worstReach(points, p, r));
      }
      // Gone by the end.
      spillPose(b, 1, r, p);
      expect(p.scale).toBeCloseTo(0, 5);
    }
    expect(worst).toBeLessThan(0.01);
  });
});
