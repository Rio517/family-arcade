/**
 * A shell's trail in flight: a small, bright head; a thin streak behind it
 * that tapers to nothing and fades; and a soft ribbon of smoke left hanging
 * where it flew, which swells, drifts up a little and thins away. All three
 * are drawn from the shell's own path (sampled backwards from where it is
 * now), so the trail is one smooth line at any frame rate, and the smoke
 * stays where it was laid in the sky while the shell flies on.
 *
 * Our shells are white-gold; the enemy's burn red-orange, so the two sides
 * never read as one shell. A plane leaves a contrail the same way, with no
 * head: a propeller plane a thin white one, a jet a short orange burner
 * streak ahead of it, the enemy's bomber a red one. Two takes: 'a' (arcade)
 * is a crisp, bright streak with a short puff of smoke; 'b' (cinematic) a
 * fainter, finer streak with more smoke that hangs longer.
 *
 * Three draw calls a trail, whatever its length. View only: nothing here
 * reads or writes game state.
 */
import * as THREE from 'three';
import { glowTexture, ribbonTexture } from './textures';

export type TracerStyle = 'a' | 'b';
/** Our shell, theirs, and the planes' contrails: a propeller plane, a jet, the enemy's bomber. */
export type TracerKind = 'ours' | 'theirs' | 'prop' | 'jet' | 'bomber';

interface Look {
  /** Head sprite: white-hot core and the halo around it (none on a contrail). */
  head: { core: string; halo: string; size: number } | null;
  /** The streak's colour, how long a stretch of the flight it covers (ms), its half-width at the head, its opacity there. */
  streak: number;
  streakMs: number;
  width: number;
  peak: number;
  /** The smoke: its colour, how long a puff of it hangs (ms), its half-width fresh and old, its opacity. */
  smoke: number;
  smokeMs: number;
  smokeWidth: [number, number];
  smokeOpacity: number;
}

const LOOKS: Record<TracerStyle, Record<TracerKind, Look>> = {
  a: {
    ours: { head: { core: '#ffffff', halo: '#ffe08a', size: 0.28 }, streak: 0xfff0c0, streakMs: 120, width: 0.034, peak: 1, smoke: 0xb4bdcc, smokeMs: 600, smokeWidth: [0.035, 0.22], smokeOpacity: 0.4 },
    theirs: { head: { core: '#fff4ec', halo: '#ff3b2f', size: 0.34 }, streak: 0xff5a32, streakMs: 140, width: 0.042, peak: 1, smoke: 0xa4908f, smokeMs: 600, smokeWidth: [0.035, 0.22], smokeOpacity: 0.4 },
    prop: { head: null, streak: 0xe8f3ff, streakMs: 170, width: 0.014, peak: 0.7, smoke: 0xe2eaf6, smokeMs: 700, smokeWidth: [0.012, 0.085], smokeOpacity: 0.3 },
    jet: { head: null, streak: 0xffa24a, streakMs: 150, width: 0.036, peak: 1, smoke: 0xe2eaf6, smokeMs: 700, smokeWidth: [0.014, 0.1], smokeOpacity: 0.34 },
    bomber: { head: null, streak: 0xff4a2a, streakMs: 130, width: 0.024, peak: 1, smoke: 0xb9a9a8, smokeMs: 600, smokeWidth: [0.012, 0.085], smokeOpacity: 0.3 },
  },
  b: {
    ours: { head: { core: '#fffaf0', halo: '#ffcf7a', size: 0.21 }, streak: 0xffe2a8, streakMs: 150, width: 0.022, peak: 0.75, smoke: 0x8f959e, smokeMs: 1150, smokeWidth: [0.04, 0.3], smokeOpacity: 0.4 },
    theirs: { head: { core: '#fff0e2', halo: '#ff6420', size: 0.24 }, streak: 0xff7a34, streakMs: 160, width: 0.026, peak: 0.8, smoke: 0x7c7270, smokeMs: 1150, smokeWidth: [0.04, 0.3], smokeOpacity: 0.42 },
    prop: { head: null, streak: 0xdde6f0, streakMs: 170, width: 0.009, peak: 0.4, smoke: 0xcfd7e2, smokeMs: 1000, smokeWidth: [0.014, 0.11], smokeOpacity: 0.24 },
    jet: { head: null, streak: 0xff9a40, streakMs: 140, width: 0.028, peak: 0.9, smoke: 0xcfd7e2, smokeMs: 1000, smokeWidth: [0.014, 0.11], smokeOpacity: 0.24 },
    bomber: { head: null, streak: 0xff5a2a, streakMs: 140, width: 0.026, peak: 0.9, smoke: 0x9e9290, smokeMs: 900, smokeWidth: [0.014, 0.11], smokeOpacity: 0.26 },
  },
};

/** Samples along the streak, and along the smoke, tail to head. */
const N = 18;
const M = 30;
/** One lump of the smoke's texture covers this much of the sky. */
const LUMP = 0.9;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A camera-facing ribbon through `count` points: positions and colours rewritten each frame. */
function ribbon(count: number, uv: boolean): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage));
  const index: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(index);
  return geo;
}

/** One shell's (or plane's) head, streak and smoke. */
export class Tracer {
  readonly look: Look;
  private head: THREE.Sprite | null = null;
  private streak: THREE.Mesh;
  private smoke: THREE.Mesh;
  private samples: THREE.Vector3[] = Array.from({ length: Math.max(N, M) }, () => new THREE.Vector3());
  private ages = new Float32Array(M);
  private streakRgb: THREE.Color;
  private smokeRgb: THREE.Color;
  /** The whole path's length, for the smoke's texture (measured on first draw). */
  private length = 0;

  constructor(group: THREE.Group, style: TracerStyle, kind: TracerKind, scale: number) {
    const look = LOOKS[style][kind];
    this.look = {
      ...look,
      head: look.head ? { ...look.head, size: look.head.size * scale } : null,
      width: look.width * scale,
      smokeWidth: [look.smokeWidth[0] * scale, look.smokeWidth[1] * scale],
    };
    if (this.look.head) {
      this.head = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(this.look.head.core, this.look.head.halo),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          premultipliedAlpha: true,
          toneMapped: false,
        }),
      );
      this.head.scale.setScalar(this.look.head.size);
      this.head.renderOrder = 8;
      this.head.visible = false;
      group.add(this.head);
    }
    this.streakRgb = new THREE.Color(look.streak);
    this.smokeRgb = new THREE.Color(look.smoke);

    this.streak = new THREE.Mesh(
      ribbon(N, false),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    // The taper and the fade are fixed along the streak: alpha grows from
    // nothing at the tail to full at the head.
    const sc = this.streak.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const alpha = Math.pow(i / (N - 1), 1.7) * look.peak;
      for (let s = 0; s < 2; s++) sc.setXYZW(i * 2 + s, this.streakRgb.r, this.streakRgb.g, this.streakRgb.b, alpha);
    }

    // The smoke: grey, its density in the vertex alpha, its soft lumpy edge
    // in an alpha map, composited with plain (straight) alpha.
    this.smoke = new THREE.Mesh(
      ribbon(M, true),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        alphaMap: ribbonTexture(),
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    // Rewritten every frame, so their bounds are never right for culling.
    for (const m of [this.streak, this.smoke]) {
      m.frustumCulled = false;
      m.visible = false;
    }
    this.streak.renderOrder = 7;
    this.smoke.renderOrder = 6;
    group.add(this.smoke, this.streak);
  }

  /**
   * Draw the trail at `t` (0..1 of a flight of `durMs` along `path`; past 1
   * the shell is gone and only its smoke hangs on), facing `camera`. Nothing
   * is drawn before `from` (a plane's take-off run). Returns false once
   * there is nothing left to draw.
   */
  draw(path: (t: number, out: THREE.Vector3) => THREE.Vector3, t: number, durMs: number, camera: THREE.Camera, from = 0): boolean {
    const smokeSpan = this.look.smokeMs / durMs;
    if (t >= 1 + smokeSpan) return false;
    const tip = Math.min(t, 1);
    if (!this.length) {
      let len = 0;
      path(0, tmpA);
      for (let i = 1; i <= 24; i++) {
        path(i / 24, tmpB);
        len += tmpA.distanceTo(tmpB);
        tmpA.copy(tmpB);
      }
      this.length = Math.max(0.01, len);
    }

    // The head and the streak, while the shell is still in the air.
    const flying = t < 1 && t > from;
    if (this.head) {
      this.head.visible = flying;
      if (flying) path(t, this.head.position);
    }
    this.streak.visible = flying;
    if (flying) {
      const span = Math.min(t - from, this.look.streakMs / durMs);
      for (let i = 0; i < N; i++) path(t - span * (1 - i / (N - 1)), this.samples[i]);
      this.lay(this.streak, N, camera, (i) => this.look.width * Math.pow(i / (N - 1), 0.8));
    }

    // The smoke, from where it has thinned away to where the shell is now.
    const tail = Math.max(from, t - smokeSpan);
    this.smoke.visible = tip - tail > 1e-4;
    if (!this.smoke.visible) return true;
    const [w0, w1] = this.look.smokeWidth;
    const ages = this.ages;
    for (let i = 0; i < M; i++) {
      const ti = tail + (tip - tail) * (i / (M - 1));
      path(ti, this.samples[i]);
      const age = Math.min(1, ((t - ti) * durMs) / this.look.smokeMs);
      ages[i] = age;
      // Old smoke drifts up a little as it thins.
      this.samples[i].y += 0.12 * age;
    }
    this.lay(this.smoke, M, camera, (i) => w0 + (w1 - w0) * Math.sqrt(ages[i]));
    const col = this.smoke.geometry.getAttribute('color') as THREE.BufferAttribute;
    const uv = this.smoke.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < M; i++) {
      const age = ages[i];
      // Thin where it leaves the shell, densest a moment later, gone at the end.
      const alpha = this.look.smokeOpacity * smooth(0, 0.08, age) * Math.pow(1 - age, 1.4);
      const u = ((tail + (tip - tail) * (i / (M - 1))) * this.length) / LUMP;
      for (let s = 0; s < 2; s++) {
        col.setXYZW(i * 2 + s, this.smokeRgb.r, this.smokeRgb.g, this.smokeRgb.b, alpha);
        uv.setXY(i * 2 + s, u, s);
      }
    }
    col.needsUpdate = true;
    uv.needsUpdate = true;
    return true;
  }

  /** Lay `mesh`'s ribbon through the first `count` samples, `width(i)` either side, square to the view. */
  private lay(mesh: THREE.Mesh, count: number, camera: THREE.Camera, width: (i: number) => number): void {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cam = camera.position;
    for (let i = 0; i < count; i++) {
      const p = this.samples[i];
      // The line's direction here, and a side vector square to it and to the view.
      tmpA.copy(this.samples[Math.max(0, i - 1)]);
      tmpB.copy(this.samples[Math.min(count - 1, i + 1)]);
      tmpT.subVectors(tmpB, tmpA);
      if (tmpT.lengthSq() < 1e-10) tmpT.set(1, 0, 0);
      tmpV.subVectors(cam, p);
      tmpS.crossVectors(tmpT, tmpV);
      if (tmpS.lengthSq() < 1e-10) tmpS.set(0, 1, 0);
      tmpS.normalize().multiplyScalar(width(i));
      pos.setXYZ(i * 2, p.x + tmpS.x, p.y + tmpS.y, p.z + tmpS.z);
      pos.setXYZ(i * 2 + 1, p.x - tmpS.x, p.y - tmpS.y, p.z - tmpS.z);
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    if (this.head) {
      this.head.removeFromParent();
      this.head.material.dispose();
    }
    for (const m of [this.streak, this.smoke]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
