/**
 * Blasts, splashes and muzzle flashes on the fleet board, in layers after
 * Gulp's explosions (src/games/gulp/three/effects.ts): a white-hot flash, a
 * fireball cooling from yellow to red as it climbs, a shock ring racing over
 * the water, sparks and debris thrown up and falling back, and smoke that
 * lingers. A miss throws up a column of spray and rings on the water.
 *
 * Two takes: 'a' (arcade) is punchy and saturated, star-glint sparks and a
 * cyan ring on the sea; 'b' (cinematic) is a heavier, realistic blast with a
 * flash of light on the water and smoke that hangs.
 *
 * View only: it plays what the scene hands it and never touches game state.
 * Randomness is a seeded LCG, so a blast looks the same on every replay.
 */
import * as THREE from 'three';
import { puffTexture, ringTexture, smokeTexture, sprayTexture, starTexture } from './textures';

export type BoomStyle = 'a' | 'b';

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  total: number;
  vel: THREE.Vector3;
  grow: number;
  gravity: number;
  drag: number;
  peak: number;
  hot?: THREE.Color;
  cold?: THREE.Color;
  /** Seconds to wait before it appears (secondary blasts along a hull). */
  delay: number;
}

interface Chunk {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  delay: number;
}

interface Mark {
  mesh: THREE.Mesh;
  life: number;
  total: number;
  from: number;
  to: number;
  peak: number;
  hold: number;
  delay: number;
}

/** A spray column: one tall sprite that shoots up, hangs, and collapses. */
interface Column {
  sprite: THREE.Sprite;
  life: number;
  total: number;
  height: number;
  width: number;
}

const PALETTE = {
  a: {
    flash: 0xfff4c8,
    fireHot: 0xffe95c,
    fireCold: 0xe0301c,
    smoke: 0x2a2440,
    smokeCold: 0x4a4466,
    spark: 0xfff07a,
    ring: 0x7ff3ff,
    ring2: 0xffb347,
    spray: 0xe6fbff,
    debris: [0x2b3340, 0x4b5563, 0x1d2430],
  },
  b: {
    flash: 0xffe2a0,
    fireHot: 0xffd66b,
    fireCold: 0xc2361b,
    smoke: 0x1b1c22,
    smokeCold: 0x3a3b42,
    spark: 0xffc46b,
    ring: 0xfff0c0,
    ring2: 0xfff0c0,
    spray: 0xdfeef5,
    debris: [0x3d3a38, 0x55595f, 0x24262b],
  },
} as const;

export class BoomKit {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  private chunks: Chunk[] = [];
  private marks: Mark[] = [];
  private columns: Column[] = [];
  private seed = 7;
  private chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  private markGeo = new THREE.PlaneGeometry(2, 2);
  private chunkMats: THREE.MeshStandardMaterial[];
  private emberMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff5a14, emissiveIntensity: 1.1, flatShading: true });
  /** The cinematic take lights the water for a blink; one light, reused. */
  private flashLight: THREE.PointLight | null = null;
  private flashLife = 0;
  /** Camera shake still owed, in world units; decays every step. */
  private shakeAmp = 0;

  constructor(
    private style: BoomStyle,
    private reducedMotion: boolean,
  ) {
    this.chunkMats = PALETTE[style].debris.map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }),
    );
    if (style === 'b') {
      this.flashLight = new THREE.PointLight(0xffb060, 0, 6, 2);
      this.group.add(this.flashLight);
    }
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** How far the camera should jolt this frame (0 when calm or under reduced motion). */
  shake(): number {
    return this.reducedMotion ? 0 : this.shakeAmp;
  }

  /**
   * A shell finding a hull. `size` is about a cell for a hit; a sinking blows
   * bigger and sets off secondary blasts along `along` (the hull's length).
   */
  boom(at: THREE.Vector3, size: number, sunk = false, along?: THREE.Vector3[]): void {
    const P = PALETTE[this.style];
    const r = () => this.rand();
    const arcade = this.style === 'a';
    this.puff(at.clone().setY(at.y + 0.1), P.flash, new THREE.Vector3(), size * (arcade ? 1.7 : 1.5), 0.16, size * 2.2, { additive: true, opacity: 0.95, tex: arcade ? 'star' : 'puff' });
    if (this.flashLight) {
      this.flashLight.position.copy(at).setY(at.y + 0.6);
      this.flashLight.intensity = sunk ? 26 : 16;
      this.flashLife = 0.35;
    }
    this.shakeAmp = Math.max(this.shakeAmp, sunk ? 0.16 : 0.06);
    if (this.reducedMotion) {
      // A still blast: the flash and a glow that fades in place.
      for (let i = 0; i < 3; i++) this.puff(at.clone().setY(at.y + 0.2), P.fireHot, new THREE.Vector3(), size * 0.8, 0.7, 0, { additive: true, cold: P.fireCold });
      return;
    }
    // The shock ring on the water, and (arcade) a hot second ring inside it.
    this.mark(at, size * 0.3, size * (arcade ? 3.4 : 2.8), 0.55, 0.95, 0, P.ring);
    if (arcade) this.mark(at, size * 0.2, size * 2.1, 0.42, 0.8, 0, P.ring2, 0.05);
    // The fireball. Additive puffs pile up to white over a dark sea, so the
    // body is laid on with colour (cel-solid in the arcade take) and only a
    // small heart glows.
    const fireballs = sunk ? 16 : 11;
    for (let i = 0; i < fireballs; i++) {
      const a = (i / fireballs) * Math.PI * 2 + r();
      const out = size * (0.25 + r() * 0.55);
      this.puff(
        new THREE.Vector3(at.x + Math.cos(a) * size * 0.18, at.y + 0.08 + size * 0.15 * r(), at.z + Math.sin(a) * size * 0.18),
        i % 3 === 0 ? P.fireHot : arcade ? 0xff9a1f : 0xff8a2a,
        new THREE.Vector3(Math.cos(a) * out, size * (0.9 + r() * 1.3), Math.sin(a) * out),
        size * (0.42 + r() * 0.3),
        0.6 + r() * 0.45,
        size * 0.8,
        { additive: !arcade, cold: P.fireCold, drag: 2.2, opacity: arcade ? 0.95 : 0.5, tex: arcade ? 'smoke' : 'puff' },
      );
    }
    for (let i = 0; i < 3; i++) {
      this.puff(
        at.clone().setY(at.y + 0.12 + i * 0.08),
        P.fireHot,
        new THREE.Vector3(0, size * (0.6 + i * 0.3), 0),
        size * 0.36,
        0.35 + i * 0.08,
        size * 0.5,
        { additive: true, cold: P.fireCold, opacity: 0.55 },
      );
    }
    const smokes = arcade ? 7 : 10;
    for (let i = 0; i < smokes; i++) {
      const a = (i / smokes) * Math.PI * 2 + r();
      const out = size * (0.12 + r() * 0.3);
      this.puff(
        new THREE.Vector3(at.x + Math.cos(a) * size * 0.25, at.y + 0.25 + size * 0.3, at.z + Math.sin(a) * size * 0.25),
        P.smoke,
        new THREE.Vector3(Math.cos(a) * out, size * (0.45 + r() * 0.5), Math.sin(a) * out),
        size * 0.42,
        (arcade ? 1.5 : 2.2) + r() * 1,
        size * 0.4,
        { cold: P.smokeCold, opacity: arcade ? 0.7 : 0.62, tex: 'smoke', delay: 0.08, drag: 1.4 },
      );
    }
    const sparks = sunk ? 22 : 14;
    for (let i = 0; i < sparks; i++) {
      const a = r() * Math.PI * 2;
      const out = size * (1.4 + r() * 1.8);
      this.puff(
        at.clone().setY(at.y + 0.15),
        P.spark,
        new THREE.Vector3(Math.cos(a) * out, size * (1.8 + r() * 2.4), Math.sin(a) * out),
        size * (arcade ? 0.2 : 0.12),
        (arcade ? 0.55 : 0.9) + r() * 0.4,
        -size * 0.08,
        { additive: true, gravity: size * 6.5, tex: arcade ? 'star' : 'puff' },
      );
    }
    const debris = sunk ? 12 : 7;
    for (let i = 0; i < debris; i++) {
      const a = r() * Math.PI * 2;
      const out = size * (0.9 + r() * 1.4);
      const mesh = new THREE.Mesh(this.chunkGeo, i % 4 === 0 ? this.emberMat : this.chunkMats[i % this.chunkMats.length]);
      mesh.scale.setScalar(size * (0.035 + r() * 0.045));
      mesh.position.copy(at).setY(at.y + 0.15);
      mesh.visible = false;
      this.group.add(mesh);
      this.chunks.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * out, size * (2 + r() * 1.8), Math.sin(a) * out),
        spin: new THREE.Vector3(r() * 12 - 6, r() * 12 - 6, r() * 12 - 6),
        life: 1.6 + r() * 0.6,
        delay: 0,
      });
    }
    // Spray thrown up round the hull: a shell that hits a ship still churns the sea.
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      this.puff(
        new THREE.Vector3(at.x + Math.cos(a) * size * 0.4, 0.05, at.z + Math.sin(a) * size * 0.4),
        P.spray,
        new THREE.Vector3(Math.cos(a) * size * 0.4, size * (1 + r()), Math.sin(a) * size * 0.4),
        size * 0.1,
        0.6 + r() * 0.3,
        size * 0.15,
        { gravity: size * 4, opacity: 0.5 },
      );
    }
    // A sinking ship goes up in a chain along its hull.
    if (sunk && along) {
      along.forEach((p, i) => {
        const d = 0.14 + i * 0.16;
        for (let k = 0; k < 6; k++) {
          const a = r() * Math.PI * 2;
          this.puff(
            p.clone().setY(p.y + 0.12),
            P.fireHot,
            new THREE.Vector3(Math.cos(a) * size * 0.4, size * (0.8 + r()), Math.sin(a) * size * 0.4),
            size * (0.35 + r() * 0.2),
            0.55 + r() * 0.3,
            size * 0.7,
            { additive: true, cold: P.fireCold, delay: d, drag: 2.2 },
          );
        }
        this.puff(p.clone().setY(p.y + 0.15), P.flash, new THREE.Vector3(), size * 1.1, 0.14, size * 1.6, { additive: true, delay: d, tex: arcade ? 'star' : 'puff' });
        this.mark(p, size * 0.25, size * 1.8, 0.45, 0.8, 0, P.ring, d);
      });
    }
  }

  /** A shell into the sea: a column of spray, droplets, and rings spreading on the water. */
  splash(at: THREE.Vector3, size: number): void {
    const P = PALETTE[this.style];
    const r = () => this.rand();
    if (this.reducedMotion) {
      this.mark(at, size * 0.9, size * 0.9, 1.2, 0.7, 0.5, P.spray);
      return;
    }
    const col = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sprayTexture(), color: P.spray, transparent: true, depthWrite: false, premultipliedAlpha: true }),
    );
    col.center.set(0.5, 0);
    col.position.copy(at).setY(0.02);
    col.renderOrder = 6;
    this.group.add(col);
    const height = size * (this.style === 'a' ? 2.4 : 2.8);
    this.columns.push({ sprite: col, life: 1.1, total: 1.1, height, width: size * 1.15 });
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2;
      const out = size * (0.3 + r() * 0.9);
      this.puff(
        at.clone().setY(0.1),
        P.spray,
        new THREE.Vector3(Math.cos(a) * out, size * (2.2 + r() * 2.2), Math.sin(a) * out),
        size * (0.05 + r() * 0.07),
        0.75 + r() * 0.35,
        size * 0.05,
        { gravity: size * 7.5, opacity: 0.85 },
      );
    }
    this.mark(at, size * 0.2, size * 1.6, 0.9, 0.8, 0, P.spray);
    this.mark(at, size * 0.1, size * 1.0, 1.1, 0.6, 0, P.spray, 0.18);
    if (this.style === 'a') this.mark(at, size * 0.3, size * 2.2, 0.6, 0.5, 0, P.ring, 0.05);
  }

  /** A gun going off: a flash at the muzzle, a cough of smoke, and the sea flattened under the blast. */
  muzzle(at: THREE.Vector3, dir: THREE.Vector3, size: number): void {
    const P = PALETTE[this.style];
    const arcade = this.style === 'a';
    this.puff(at.clone(), P.flash, dir.clone().multiplyScalar(size * 2), size * (arcade ? 0.9 : 0.75), 0.12, size * 3, { additive: true, tex: arcade ? 'star' : 'puff' });
    this.puff(at.clone().addScaledVector(dir, size * 0.25), P.fireHot, dir.clone().multiplyScalar(size * 3), size * 0.5, 0.14, size * 2, { additive: true, cold: P.fireCold });
    if (this.reducedMotion) return;
    for (let i = 0; i < 4; i++) {
      this.puff(
        at.clone().addScaledVector(dir, size * (0.3 + i * 0.25)),
        0x9aa3b2,
        dir.clone().multiplyScalar(size * (1.2 + this.rand())).setY(size * 0.4),
        size * 0.35,
        0.9 + this.rand() * 0.5,
        size * 0.6,
        { opacity: 0.45, tex: 'smoke', drag: 2.5 },
      );
    }
    const water = at.clone().addScaledVector(dir, size * 0.6).setY(0);
    this.mark(water, size * 0.3, size * 1.5, 0.5, 0.45, 0, P.spray);
  }

  /** Incoming: a warning ring that tightens on the water where the shell will land. */
  telegraph(at: THREE.Vector3, seconds: number): void {
    this.mark(at, 1.5, 0.45, seconds, this.style === 'a' ? 0.95 : 0.7, 0.85, this.style === 'a' ? 0xff3355 : 0xffa040);
  }

  /** A short glowing streak for a shell in flight; the caller moves it. */
  shellSprite(): THREE.Sprite {
    const P = PALETTE[this.style];
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.style === 'a' ? starTexture() : puffTexture(), color: P.spark, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true }),
    );
    s.scale.setScalar(this.style === 'a' ? 0.34 : 0.26);
    s.renderOrder = 7;
    this.group.add(s);
    return s;
  }

  /** A fading glow left behind a shell. */
  trail(at: THREE.Vector3, size: number): void {
    const P = PALETTE[this.style];
    this.puff(at.clone(), P.spark, new THREE.Vector3(), size, 0.2, -size * 2.5, { additive: true, opacity: 0.55 });
  }

  /** A smoke wisp off a trail (the cinematic take's shells leave a line in the sky). */
  wisp(at: THREE.Vector3, size: number): void {
    this.puff(at.clone(), 0x8a909c, new THREE.Vector3(0, 0.1, 0), size, 0.7, size * 0.8, { opacity: 0.22, tex: 'smoke' });
  }

  removeSprite(s: THREE.Sprite): void {
    this.group.remove(s);
    s.material.dispose();
  }

  private puff(
    at: THREE.Vector3,
    color: number,
    vel: THREE.Vector3,
    size: number,
    life: number,
    grow: number,
    o: { additive?: boolean; cold?: number; gravity?: number; opacity?: number; tex?: 'puff' | 'smoke' | 'star'; delay?: number; drag?: number } = {},
  ): void {
    const map = o.tex === 'smoke' ? smokeTexture() : o.tex === 'star' ? starTexture() : puffTexture();
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map,
        color,
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity: 0,
      }),
    );
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    sprite.material.rotation = this.rand() * Math.PI * 2;
    sprite.renderOrder = o.additive ? 7 : 6;
    sprite.visible = !o.delay;
    this.group.add(sprite);
    this.puffs.push({
      sprite,
      life,
      total: life,
      vel,
      grow,
      gravity: o.gravity ?? 0,
      drag: o.drag ?? (o.gravity ? 0 : 2),
      peak: o.opacity ?? 0.9,
      hot: o.cold !== undefined ? new THREE.Color(color) : undefined,
      cold: o.cold !== undefined ? new THREE.Color(o.cold) : undefined,
      delay: o.delay ?? 0,
    });
  }

  private mark(at: THREE.Vector3, from: number, to: number, life: number, peak: number, hold: number, color: number, delay = 0): void {
    const mesh = new THREE.Mesh(
      this.markGeo,
      new THREE.MeshBasicMaterial({
        map: ringTexture(),
        color,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -24,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.09, at.z);
    mesh.scale.setScalar(from);
    mesh.renderOrder = 5;
    mesh.visible = delay === 0;
    this.group.add(mesh);
    this.marks.push({ mesh, life, total: life, from, to, peak, hold, delay });
  }

  /** True while anything is still playing (the loop can idle the kit otherwise). */
  busy(): boolean {
    return this.puffs.length + this.chunks.length + this.marks.length + this.columns.length > 0 || this.flashLife > 0;
  }

  step(dt: number): void {
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 0.6);
    if (this.flashLight && this.flashLife > 0) {
      this.flashLife = Math.max(0, this.flashLife - dt);
      this.flashLight.intensity *= Math.max(0, 1 - dt * 9);
      if (this.flashLife === 0) this.flashLight.intensity = 0;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
        p.sprite.visible = true;
      }
      p.life -= dt;
      const mat = p.sprite.material;
      if (!this.reducedMotion) {
        p.sprite.position.addScaledVector(p.vel, dt);
        if (p.gravity) p.vel.y -= p.gravity * dt;
        if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - dt * p.drag));
        const s = p.sprite.scale.x + p.grow * dt;
        p.sprite.scale.setScalar(Math.max(0.001, s));
        if (s < 0.01) p.life = 0;
        // Droplets and sparks that reach the sea are gone.
        if (p.gravity && p.sprite.position.y < 0) p.life = 0;
      }
      if (p.hot && p.cold) mat.color.copy(p.hot).lerp(p.cold, Math.min(1, 1 - p.life / p.total));
      const t = 1 - p.life / p.total;
      // A quick fade-in keeps a fresh puff from popping into being.
      mat.opacity = p.peak * Math.min(1, t * 12) * Math.max(0, p.life / p.total);
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        mat.dispose();
        this.puffs.splice(i, 1);
      }
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.delay > 0) {
        c.delay -= dt;
        if (c.delay > 0) continue;
      }
      c.mesh.visible = true;
      c.life -= dt;
      const m = c.mesh;
      if (m.position.y > 0.02 || c.vel.y > 0) {
        m.position.addScaledVector(c.vel, dt);
        c.vel.y -= 9 * dt;
        m.rotation.x += c.spin.x * dt;
        m.rotation.y += c.spin.y * dt;
        m.rotation.z += c.spin.z * dt;
        if (m.position.y < 0.02) {
          // Into the sea: a plop of spray, then it slips under.
          m.position.y = 0.02;
          c.vel.set(c.vel.x * 0.15, 0, c.vel.z * 0.15);
          c.spin.multiplyScalar(0.2);
          c.life = Math.min(c.life, 0.6);
          this.puff(m.position.clone(), PALETTE[this.style].spray, new THREE.Vector3(0, 0.5, 0), 0.08, 0.35, 0.3, { opacity: 0.6, gravity: 2 });
        }
      } else {
        m.position.y -= dt * 0.15;
      }
      if (c.life < 0.4) m.scale.multiplyScalar(Math.max(0, 1 - dt / Math.max(0.05, c.life)));
      if (c.life <= 0) {
        this.group.remove(m);
        this.chunks.splice(i, 1);
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const k = this.marks[i];
      if (k.delay > 0) {
        k.delay -= dt;
        if (k.delay > 0) continue;
        k.mesh.visible = true;
      }
      k.life -= dt;
      const t = 1 - k.life / k.total;
      const ease = 1 - Math.pow(1 - Math.min(1, t), 3);
      k.mesh.scale.setScalar(k.from + (k.to - k.from) * ease);
      const fade = t < k.hold ? 1 : Math.max(0, 1 - (t - k.hold) / (1 - k.hold));
      (k.mesh.material as THREE.MeshBasicMaterial).opacity = k.peak * fade;
      if (k.life <= 0) {
        this.group.remove(k.mesh);
        (k.mesh.material as THREE.Material).dispose();
        this.marks.splice(i, 1);
      }
    }
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.life -= dt;
      const t = 1 - c.life / c.total;
      // Shoots up fast, hangs, then slumps back into the sea.
      const rise = t < 0.3 ? 1 - Math.pow(1 - t / 0.3, 3) : 1 - Math.pow((t - 0.3) / 0.7, 2) * 0.85;
      c.sprite.scale.set(c.width * (0.6 + 0.6 * t), Math.max(0.01, c.height * rise), 1);
      c.sprite.material.opacity = 0.95 * Math.min(1, t * 10) * (t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5);
      if (c.life <= 0) {
        this.group.remove(c.sprite);
        c.sprite.material.dispose();
        this.columns.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.puffs) {
      this.group.remove(p.sprite);
      p.sprite.material.dispose();
    }
    for (const c of this.chunks) this.group.remove(c.mesh);
    for (const k of this.marks) {
      this.group.remove(k.mesh);
      (k.mesh.material as THREE.Material).dispose();
    }
    for (const c of this.columns) {
      this.group.remove(c.sprite);
      c.sprite.material.dispose();
    }
    this.puffs = [];
    this.chunks = [];
    this.marks = [];
    this.columns = [];
    this.chunkGeo.dispose();
    this.markGeo.dispose();
    for (const m of [...this.chunkMats, this.emberMat]) m.dispose();
    this.flashLight?.dispose();
  }
}
