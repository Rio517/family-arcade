/**
 * The moving extras in a Gulp Universe round: explosions and gas, "+points"
 * popping up over the child's hole, power-up orbs, and the city fighting
 * back (a tanker with a warning sign, a plane, and red target rings where
 * its bombs will land).
 */
import * as THREE from 'three';
import type { Attack, PowerKind, PowerUp } from '../domain/world';
import { buildHeliBodyGeometry, buildRotorGeometry } from './military';
import { buildKindGeometry } from './props';
import { ProjectileKit } from './projectiles';

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  total: number;
  vel: THREE.Vector3;
  grow: number;
  /** Pulls it down (sparks); 0 for fire and smoke, which rise. */
  gravity: number;
  /** Opacity when fresh; it fades to nothing over its life. */
  peak: number;
  /** Fire cools from `hot` to `cold` over its life. */
  hot?: THREE.Color;
  cold?: THREE.Color;
}

/** A chunk of debris thrown out by an explosion: it arcs, lands, and shrinks away. */
interface Chunk {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

/** Something flat on the ground: the shock ring racing out, the scorch mark left behind. */
interface Mark {
  mesh: THREE.Mesh;
  life: number;
  total: number;
  /** Scale at the start and at the end. */
  from: number;
  to: number;
  /** Opacity at full strength, and the share of its life it holds that before fading. */
  peak: number;
  hold: number;
}

/** A wonder for its star: its kind, and each piece of it with where its top is. */
export interface WonderSpot {
  kind: string;
  members: Array<{ id: number; x: number; z: number; top: number }>;
}

interface Popup {
  sprite: THREE.Sprite;
  /** Seconds left. */
  life: number;
  /** Seconds in all, longer for the bigger tiers. */
  total: number;
  /** Height gained over the whole pop. */
  rise: number;
  y0: number;
}

/**
 * How a points pop looks by what it is worth: cream for an ordinary gulp,
 * gold for a big one (a car park's worth, a tower), pink for a huge one
 * (a skyscraper, a wonder). Bigger tiers are a little larger and linger longer.
 */
type PopupTier = 'normal' | 'big' | 'huge';
/** Gold from about a tower (150), pink from about a skyscraper (1,600) or a wonder. */
const POPUP_BIG = 150;
const POPUP_HUGE = 1500;
const popupTier = (points: number): PopupTier => (points >= POPUP_HUGE ? 'huge' : points >= POPUP_BIG ? 'big' : 'normal');
const POPUP_LOOK: Record<PopupTier, { fill: string; scale: number; life: number }> = {
  normal: { fill: '#fff3d1', scale: 1, life: 0.6 },
  // A big gulp's points stay up long enough to read and enjoy.
  big: { fill: '#ffc41f', scale: 1.15, life: 1.4 },
  huge: { fill: '#ff5cc8', scale: 1.35, life: 2.4 },
};

/** A points pop's height on screen (an ordinary one; bigger tiers scale it up). */
const POPUP_HEIGHT = 0.046;

const POWER_COLOR: Record<PowerKind, number> = { speed: 0x39c6ff, double: 0xffc62e };

export class Effects {
  readonly group = new THREE.Group();
  private puffTex = softTexture();
  private puffs: Puff[] = [];
  private popups: Popup[] = [];
  private popupTex = new Map<string, THREE.Texture>();
  private orbs = new Map<number, THREE.Group>();
  /** Reused by syncPowerups every frame instead of a fresh Set, since it is only ever read there. */
  private livePowerupIds = new Set<number>();
  private orbGeo = new THREE.IcosahedronGeometry(1, 1);
  private ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  private discGeo = new THREE.CircleGeometry(1, 48);
  private powerIcons: Record<PowerKind, THREE.Texture> = { speed: iconTexture('bolt'), double: iconTexture('x2') };
  private attackViews = new Map<number, { group: THREE.Group; rings: Map<number, THREE.Mesh>; bombs: Map<number, THREE.Mesh>; liveShellIds: Set<number> }>();
  /** Reused by syncAttacks every frame instead of a fresh Set, since it is only ever read there. */
  private liveAttackIds = new Set<number>();
  private tankerGeo: THREE.BufferGeometry;
  private bomberGeo: THREE.BufferGeometry;
  private tankGeo: THREE.BufferGeometry;
  private heliGeo: THREE.BufferGeometry;
  private rotorGeo: THREE.BufferGeometry;
  private projectiles = new ProjectileKit();
  private kitMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
  private warnTex = iconTexture('warn');
  /** A gold star over each wonder still standing (one shared material; see `syncWonders`). */
  private starMat = new THREE.SpriteMaterial({ map: iconTexture('star'), transparent: true, depthWrite: false, sizeAttenuation: false });
  private wonderStars = new Map<string, THREE.Sprite>();
  private time = 0;
  private protos = new THREE.Group();
  private chunks: Chunk[] = [];
  private marks: Mark[] = [];
  private chunkGeo = new THREE.BoxGeometry(1, 1, 1);
  private chunkMats = [0x3d3a38, 0x6b4a33, 0x8d8f96].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  private emberMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff5a14, emissiveIntensity: 0.55, flatShading: true });
  /** Small repeatable randomness for the look of explosions (never gameplay). */
  private seed = 1;

  /** The ground's height at a spot (a block stands a kerb above the road); the scene sets it. */
  ground: (x: number, z: number) => number = () => 0;

  constructor(private reducedMotion: boolean) {
    this.tankerGeo = buildKindGeometry('tanker', 0);
    this.bomberGeo = buildKindGeometry('bomber', 0);
    this.tankGeo = buildKindGeometry('tank', 0);
    this.heliGeo = buildHeliBodyGeometry();
    this.rotorGeo = buildRotorGeometry();
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * An explosion, in layers: a white-hot flash; a fireball that rises and
   * cools from yellow to red; a shock ring racing out over the ground;
   * sparks and chunks of debris thrown up and falling back; dark smoke that
   * lingers and climbs; and a scorch mark that fades after a few seconds.
   */
  boom(x: number, z: number, size: number): void {
    const r = () => this.rand();
    // The flash, and a scorch mark: both even with reduced motion.
    this.puff(new THREE.Vector3(x, 1.5, z), 0xffe2a0, new THREE.Vector3(), size * 1.5, 0.16, size * 2, { additive: true, opacity: 0.7 });
    this.mark(x, z, size * 1.5, size * 1.5, 6, 0.75, 0.6, this.scorchMat);
    if (this.reducedMotion) {
      for (let i = 0; i < 4; i++) this.puff(new THREE.Vector3(x, 1 + size * 0.3, z), 0xff8a2e, new THREE.Vector3(), size * 0.9, 0.8, size * 0.5);
      return;
    }
    // The shock ring.
    this.mark(x, z, size * 0.3, size * 3.4, 0.5, 0.9, 0, this.waveMat);
    // The fireball: hot at the heart, cooling as it climbs.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + r();
      const out = size * (0.3 + r() * 0.6);
      this.puff(
        new THREE.Vector3(x + Math.cos(a) * size * 0.25, 0.8 + size * 0.2 * r(), z + Math.sin(a) * size * 0.25),
        0xffe27a,
        new THREE.Vector3(Math.cos(a) * out, size * (1 + r() * 1.2), Math.sin(a) * out),
        size * (0.55 + r() * 0.35),
        0.7 + r() * 0.4,
        size * 0.9,
        { additive: true, cold: 0xff3b1f },
      );
    }
    // Smoke: dark, slow, and lasting.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r();
      const out = size * (0.2 + r() * 0.4);
      this.puff(
        new THREE.Vector3(x + Math.cos(a) * size * 0.4, 1 + size * 0.4, z + Math.sin(a) * size * 0.4),
        0x1e1e24,
        new THREE.Vector3(Math.cos(a) * out, size * (0.5 + r() * 0.5), Math.sin(a) * out),
        size * 0.45,
        1.8 + r() * 1,
        size * 0.35,
        { cold: 0x3a3a42, opacity: 0.6 },
      );
    }
    // Sparks: quick and bright, falling back.
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const out = size * (1.8 + r() * 2);
      this.puff(
        new THREE.Vector3(x, 1 + size * 0.2, z),
        0xffd36b,
        new THREE.Vector3(Math.cos(a) * out, size * (2 + r() * 2.5), Math.sin(a) * out),
        size * 0.14,
        0.5 + r() * 0.4,
        -size * 0.1,
        { additive: true, gravity: size * 7 },
      );
    }
    // Debris: chunks of the street, some still glowing.
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const out = size * (1.2 + r() * 1.6);
      const mesh = new THREE.Mesh(this.chunkGeo, i % 4 === 0 ? this.emberMat : this.chunkMats[i % this.chunkMats.length]);
      mesh.scale.setScalar(size * (0.035 + r() * 0.045));
      mesh.position.set(x, 1 + size * 0.2, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.chunks.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * out, size * (2.2 + r() * 2), Math.sin(a) * out),
        spin: new THREE.Vector3(r() * 12 - 6, r() * 12 - 6, r() * 12 - 6),
        life: 1.8 + r() * 0.6,
      });
    }
  }

  private waveMat = new THREE.MeshBasicMaterial({
    map: ringTexture(),
    color: 0xfff0c0,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -24,
  });

  private scorchMat = new THREE.MeshBasicMaterial({
    map: softTexture(),
    color: 0x16110e,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -20,
  });

  private mark(x: number, z: number, from: number, to: number, life: number, peak: number, hold: number, material: THREE.MeshBasicMaterial): void {
    const mesh = new THREE.Mesh(this.markGeo, material.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, this.ground(x, z) + 0.08, z);
    mesh.scale.setScalar(from);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.marks.push({ mesh, life, total: life, from, to, peak, hold });
  }

  private markGeo = new THREE.PlaneGeometry(2, 2);

  /**
   * Dust puffing out round the base of a building as it rises: soft, pale,
   * low, drifting outwards and up, gone in a couple of seconds.
   */
  dust(x: number, z: number, size: number): void {
    // A block going up all at once raises one cloud, not dozens: past this
    // many puffs in the air, a new building rises without its own.
    if (this.puffs.length > 90) return;
    const n = this.reducedMotion ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.4;
      const out = size * (0.25 + this.rand() * 0.2);
      this.puff(
        new THREE.Vector3(x + Math.cos(a) * size * 0.5, 0.6, z + Math.sin(a) * size * 0.5),
        0xd8cdb8,
        new THREE.Vector3(Math.cos(a) * out, 0.8 + this.rand() * 1.2, Math.sin(a) * out),
        size * 0.22,
        1.6 + this.rand() * 0.8,
        size * 0.25,
        { cold: 0xeee6d8, opacity: 0.55 },
      );
    }
  }

  /** A lick of flame off a burning rim: it rises, cooling from yellow to red, and goes. */
  flame(x: number, z: number, size: number): void {
    this.puff(new THREE.Vector3(x, 0.6, z), 0xffd060, new THREE.Vector3(0, size * 1.6, 0), size * 0.6, 0.55, size * 0.4, {
      additive: true,
      cold: 0xff3b1f,
    });
  }

  /**
   * Green gas billowing out round the rim of a hole that ate the chemical
   * works: low, spreading outward and see-through, so even a giant hole's
   * cloud never hides the city or the rivals round it.
   */
  gas(x: number, z: number, size: number): void {
    const n = this.reducedMotion ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.puff(
        new THREE.Vector3(x + Math.cos(a) * size * 0.9, 0.8, z + Math.sin(a) * size * 0.9),
        i % 2 ? 0x8fe36a : 0xc6f26a,
        new THREE.Vector3(Math.cos(a) * size * 0.35, size * 0.12, Math.sin(a) * size * 0.35),
        size * 0.45,
        1.8,
        size * 0.5,
        { opacity: 0.5 },
      );
    }
  }

  private puff(
    at: THREE.Vector3,
    color: number,
    vel: THREE.Vector3,
    size: number,
    life: number,
    grow: number,
    o: { additive?: boolean; cold?: number; gravity?: number; opacity?: number } = {},
  ): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.puffTex,
        color,
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    sprite.renderOrder = 6;
    this.group.add(sprite);
    this.puffs.push({
      sprite,
      life,
      total: life,
      vel,
      grow,
      gravity: o.gravity ?? 0,
      peak: o.opacity ?? 0.85,
      hot: o.cold !== undefined ? new THREE.Color(color) : undefined,
      cold: o.cold !== undefined ? new THREE.Color(o.cold) : undefined,
    });
  }

  /** "+8" rising over where the child just ate. */
  popup(points: number, at: THREE.Vector3): void {
    const tier = popupTier(points);
    const look = POPUP_LOOK[tier];
    const key = `${tier}:${points}`;
    let tex = this.popupTex.get(key);
    if (!tex) {
      tex = textTexture(`+${points}`, look.fill);
      this.popupTex.set(key, tex);
      // A long round scores hundreds of different amounts: keep only the recent ones.
      if (this.popupTex.size > 64) {
        const [oldest, old] = this.popupTex.entries().next().value!;
        old.dispose();
        this.popupTex.delete(oldest);
      }
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    // The texture is as wide as its number: keep the letters' height, widen the sprite to match.
    const aspect = tex.image.width / tex.image.height;
    sprite.scale.set(POPUP_HEIGHT * aspect * look.scale, POPUP_HEIGHT * look.scale, 1);
    sprite.position.copy(at);
    // Over the hole's see-through ring and the power-up countdown (20 to 22), under its eyes.
    sprite.renderOrder = 23;
    this.group.add(sprite);
    this.popups.push({ sprite, life: look.life, total: look.life, rise: 4 * look.scale, y0: at.y });
  }

  /**
   * One of everything this class draws, never shown: the scene compiles
   * their shaders up front, so the first explosion, orb or bomber of a
   * round does not stall the frame it appears in.
   */
  prototypes(): THREE.Group {
    // Kept (and disposed with the rest): freeing their materials would free the shaders too.
    const g = this.protos;
    if (g.children.length) return g;
    g.add(this.makeOrb('speed'));
    for (const kind of ['tanker', 'bomber', 'tank', 'heli'] as const) g.add(this.makeAttack({ kind } as Attack));
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2d20, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    g.add(ring, ...this.projectiles.warmMeshes());
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false, premultipliedAlpha: true })));
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: this.warnTex, depthTest: false, transparent: true, sizeAttenuation: false })));
    g.add(new THREE.Mesh(this.chunkGeo, this.chunkMats[0]), new THREE.Mesh(this.chunkGeo, this.emberMat));
    g.add(new THREE.Mesh(this.markGeo, this.waveMat), new THREE.Mesh(this.markGeo, this.scorchMat));
    return g;
  }

  /** Power-up orbs float and spin, sized so the child's hole can see them. */
  /**
   * A gold star bobbing over each wonder still standing, the same size on
   * screen at any height, so a child spots a wonder from across the city. A
   * wonder in pieces (the Easter Island heads) has one star over whatever
   * of it is left; it goes when the last piece is swallowed.
   */
  syncWonders(wonders: ReadonlyArray<WonderSpot>, standing: (id: number) => boolean, time: number): void {
    for (const w of wonders) {
      let n = 0;
      let x = 0;
      let z = 0;
      let top = 0;
      for (const m of w.members) {
        if (!standing(m.id)) continue;
        n += 1;
        x += m.x;
        z += m.z;
        top = Math.max(top, m.top);
      }
      let star = this.wonderStars.get(w.kind);
      if (!n) {
        if (star) star.visible = false;
        continue;
      }
      if (!star) {
        star = new THREE.Sprite(this.starMat);
        star.scale.set(0.05, 0.05, 1);
        star.renderOrder = 9;
        this.wonderStars.set(w.kind, star);
        this.group.add(star);
      }
      star.visible = true;
      const bob = this.reducedMotion ? 0 : Math.sin(time * 2.2 + x * 0.1) * 0.8;
      star.position.set(x / n, top + 4 + bob, z / n);
    }
  }

  syncPowerups(list: PowerUp[], scale: number): void {
    const live = this.livePowerupIds;
    live.clear();
    for (const p of list) {
      live.add(p.id);
      let orb = this.orbs.get(p.id);
      if (!orb) {
        orb = this.makeOrb(p.kind);
        this.orbs.set(p.id, orb);
        this.group.add(orb);
      }
      orb.position.set(p.x, this.ground(p.x, p.z), p.z);
      orb.scale.setScalar(scale);
      const body = orb.children[0];
      body.position.y = 1.6 + (this.reducedMotion ? 0 : Math.sin(this.time * 3 + p.id) * 0.25);
      if (!this.reducedMotion) body.rotation.y = this.time * 1.5;
      // Fade out over the last few seconds.
      const fade = Math.min(1, p.life / 3);
      orb.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.opacity = fade;
      });
    }
    for (const [id, orb] of this.orbs) {
      if (live.has(id)) continue;
      this.group.remove(orb);
      orb.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
      this.orbs.delete(id);
    }
  }

  private makeOrb(kind: PowerKind): THREE.Group {
    const color = POWER_COLOR[kind];
    const orb = new THREE.Group();
    const body = new THREE.Group();
    const ball = new THREE.Mesh(
      this.orbGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, flatShading: true }),
    );
    ball.castShadow = true;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.powerIcons[kind], transparent: true, depthTest: false }));
    icon.scale.setScalar(1.5);
    icon.renderOrder = 9;
    body.add(ball, icon);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.scale.setScalar(1.6);
    orb.add(body, ring);
    return orb;
  }

  /**
   * Tankers, planes and the rings where bombs will land. `r` is the size of
   * the child's hole: the plane flies below the camera, which rises with it.
   */
  syncAttacks(list: Attack[], r: number): void {
    const live = this.liveAttackIds;
    live.clear();
    // Over the rooftops but under the camera, and big enough to read against a giant hole.
    const alt = 14 + r * 1.3;
    // Fuel trucks and tanks grow with the hole, more slowly, so a giant can
    // still spot them from its height and they still fit the streets.
    const big = Math.max(1, Math.sqrt(r / 5));
    for (const a of list) {
      live.add(a.id);
      let view = this.attackViews.get(a.id);
      if (!view) {
        view = { group: this.makeAttack(a), rings: new Map(), bombs: new Map(), liveShellIds: new Set() };
        this.attackViews.set(a.id, view);
        this.group.add(view.group);
      }
      const body = view.group.children[0];
      if (a.kind === 'tanker') {
        body.position.set(a.x, this.ground(a.x, a.z), a.z);
        body.rotation.y = a.heading;
        body.scale.setScalar(big);
        const warn = view.group.children[1];
        warn.position.set(a.x, (6 + (this.reducedMotion ? 0 : Math.sin(this.time * 8) * 0.6)) * big, a.z);
        continue;
      }
      if (a.kind === 'bomber') {
        body.position.set(a.x, alt, a.z);
        body.rotation.y = Math.atan2(a.dx, a.dz);
        body.scale.setScalar(Math.max(0.6, r / 12));
      } else if (a.kind === 'tank') {
        body.position.set(a.x, this.ground(a.x, a.z), a.z);
        body.rotation.y = a.heading;
        body.scale.setScalar(big);
      } else {
        // A helicopter hovers low enough to see, bobbing, its rotor spinning.
        const hover = 9 + r * 0.8 + (this.reducedMotion ? 0 : Math.sin(this.time * 2 + a.id) * 0.5);
        body.position.set(a.x, hover, a.z);
        body.rotation.y = a.heading;
        body.scale.setScalar(Math.max(1, r / 14));
        const rotor = body.getObjectByName('rotor');
        if (rotor && !this.reducedMotion) rotor.rotation.y = this.time * 18;
      }
      const shells = a.kind === 'bomber' ? a.bombs : a.shells;
      // Reused per attack view every frame instead of a fresh Set.
      const now = view.liveShellIds;
      now.clear();
      for (const b of shells) now.add(b.id);
      for (const b of shells) {
        let ring = view.rings.get(b.id);
        if (!ring) {
          // A red rim with a see-through red floor: the danger zone.
          ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2d20, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
          const fill = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
          fill.name = 'fill';
          ring.add(fill);
          ring.rotation.x = -Math.PI / 2;
          ring.renderOrder = 7;
          fill.renderOrder = 6;
          view.rings.set(b.id, ring);
          view.group.add(ring);
        }
        // Just over the kerb, so it shows across road and pavement alike.
        ring.position.set(b.x, 0.4, b.z);
        ring.scale.setScalar(b.radius);
        const soon = Math.max(0, Math.min(1, 1 - b.fuse / 3));
        const pulse = this.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(this.time * (8 + soon * 14));
        (ring.material as THREE.MeshBasicMaterial).opacity = (0.6 + soon * 0.4) * pulse;
        const fill = ring.getObjectByName('fill') as THREE.Mesh;
        (fill.material as THREE.MeshBasicMaterial).opacity = (0.15 + soon * 0.25) * pulse;
        // A bomb falls for its last moment; a shell or rocket arcs all the way.
        const shell = b.from && b.flight;
        if (shell || b.fuse < 1.2) {
          let bomb = view.bombs.get(b.id);
          if (!bomb) {
            bomb = this.projectiles.make(a.kind === 'bomber' ? 'bomber' : a.kind === 'heli' ? 'heli' : 'tank');
            view.bombs.set(b.id, bomb);
            view.group.add(bomb);
          }
          if (b.from && b.flight) {
            const k = 1 - b.fuse / b.flight;
            const x = b.from.x + (b.x - b.from.x) * k;
            const z = b.from.z + (b.z - b.from.z) * k;
            const y = b.from.y * (1 - k) + Math.sin(k * Math.PI) * (4 + r * 0.3);
            bomb.position.set(x, y, z);
            bomb.scale.setScalar(Math.max(0.7, r / 14));
            // Along the arc's tangent: pitch as well as yaw.
            this.projectiles.pointAlong(bomb, b.x - b.from.x, -b.from.y + Math.PI * (4 + r * 0.3) * Math.cos(k * Math.PI), b.z - b.from.z);
            this.projectiles.flicker(bomb, this.time, b.id, this.reducedMotion);
          } else {
            bomb.scale.setScalar(Math.max(1, r / 8));
            bomb.position.set(b.x, alt * (b.fuse / 1.2), b.z);
            this.projectiles.pointDown(bomb);
          }
        }
      }
      for (const [id, ring] of view.rings) {
        if (now.has(id)) continue;
        view.group.remove(ring);
        ring.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
        view.rings.delete(id);
        const bomb = view.bombs.get(id);
        if (bomb) view.group.remove(bomb);
        view.bombs.delete(id);
      }
    }
    for (const [id, view] of this.attackViews) {
      if (live.has(id)) continue;
      this.group.remove(view.group);
      for (const ring of view.rings.values()) ring.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
      this.attackViews.delete(id);
    }
  }

  private makeAttack(a: Attack): THREE.Group {
    const g = new THREE.Group();
    if (a.kind === 'tanker') {
      const truck = new THREE.Mesh(this.tankerGeo, this.kitMat);
      truck.castShadow = true;
      g.add(truck);
      const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.warnTex, depthTest: false, transparent: true, sizeAttenuation: false }));
      warn.scale.set(0.06, 0.06, 1);
      warn.renderOrder = 12;
      g.add(warn);
    } else if (a.kind === 'bomber') {
      const plane = new THREE.Mesh(this.bomberGeo, this.kitMat);
      plane.castShadow = true;
      g.add(plane);
    } else if (a.kind === 'tank') {
      const tank = new THREE.Mesh(this.tankGeo, this.kitMat);
      tank.castShadow = true;
      g.add(tank);
    } else {
      // The parked helicopter's model, with a spinning rotor laid over its own.
      const heli = new THREE.Group();
      const body = new THREE.Mesh(this.heliGeo, this.kitMat);
      body.castShadow = true;
      const rotor = new THREE.Mesh(this.rotorGeo, this.kitMat);
      rotor.name = 'rotor';
      // Over the model's own hub (see three/military.ts).
      rotor.position.set(0, 3.4, 1.0);
      heli.add(body, rotor);
      g.add(heli);
    }
    return g;
  }

  step(dt: number): void {
    this.time += dt;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      const mat = p.sprite.material as THREE.SpriteMaterial;
      if (!this.reducedMotion) {
        p.sprite.position.addScaledVector(p.vel, dt);
        if (p.gravity) p.vel.y -= p.gravity * dt;
        else p.vel.multiplyScalar(1 - dt * 2);
        p.sprite.scale.addScalar(p.grow * dt);
        if (p.sprite.scale.x < 0.02) p.life = 0;
      }
      if (p.hot && p.cold) mat.color.copy(p.hot).lerp(p.cold, Math.min(1, 1 - p.life / p.total));
      mat.opacity = p.peak * Math.max(0, p.life / p.total);
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      const m = c.mesh;
      if (m.position.y > 0.05 || c.vel.y > 0) {
        m.position.addScaledVector(c.vel, dt);
        c.vel.y -= 30 * dt;
        m.rotation.x += c.spin.x * dt;
        m.rotation.y += c.spin.y * dt;
        m.rotation.z += c.spin.z * dt;
        if (m.position.y < 0.05) {
          // Landed: a little skid, then still.
          m.position.y = 0.05;
          c.vel.set(c.vel.x * 0.2, 0, c.vel.z * 0.2);
          c.spin.set(0, 0, 0);
        }
      }
      if (c.life < 0.4) m.scale.multiplyScalar(Math.max(0, 1 - dt / Math.max(0.05, c.life)));
      if (c.life <= 0) {
        this.group.remove(m);
        this.chunks.splice(i, 1);
      }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const k = this.marks[i];
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
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      // Rises fast then settles (ease-out cubic), and fades over the last
      // part instead of blinking out. Reduced motion keeps it in place.
      const t = Math.min(1, Math.max(0, 1 - p.life / p.total));
      if (!this.reducedMotion) p.sprite.position.y = p.y0 + p.rise * (1 - (1 - t) ** 3);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, (1 - t) * 2.5);
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.popups.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.protos.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
    for (const p of this.puffs) (p.sprite.material as THREE.Material).dispose();
    for (const k of this.marks) (k.mesh.material as THREE.Material).dispose();
    this.chunkGeo.dispose();
    this.markGeo.dispose();
    for (const m of [...this.chunkMats, this.emberMat, this.waveMat, this.scorchMat]) m.dispose();
    this.waveMat.map?.dispose();
    this.scorchMat.map?.dispose();
    for (const p of this.popups) (p.sprite.material as THREE.Material).dispose();
    for (const t of this.popupTex.values()) t.dispose();
    for (const t of Object.values(this.powerIcons)) t.dispose();
    this.starMat.map?.dispose();
    this.starMat.dispose();
    this.puffTex.dispose();
    this.warnTex.dispose();
    this.orbGeo.dispose();
    this.ringGeo.dispose();
    this.discGeo.dispose();
    this.projectiles.dispose();
    this.tankerGeo.dispose();
    this.bomberGeo.dispose();
    this.tankGeo.dispose();
    this.heliGeo.dispose();
    this.rotorGeo.dispose();
    this.kitMat.dispose();
  }
}

/** A soft round blob for smoke, fire and gas. */
function softTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  // Uploaded as the canvas holds it: WebKit's near-transparent gradient
  // pixels can speckle when un-premultiplied (see the racer's sun).
  t.premultiplyAlpha = true;
  return t;
}

/** A soft bright band near the edge of a circle: the explosion's shock ring. */
function ringTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(0.84, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.premultiplyAlpha = true;
  return t;
}

/**
 * "+8" in chunky letters of the given colour, on a transparent strip 64 high
 * and as wide as the text needs (never cut off). A thick dark edge and a soft
 * shadow under it keep it readable over a pale pavement or a busy building.
 */
function textTexture(text: string, fill: string): THREE.Texture {
  const c = document.createElement('canvas');
  const font = '900 44px ui-rounded, system-ui, -apple-system, sans-serif';
  const probe = c.getContext('2d')!;
  probe.font = font;
  c.width = Math.max(128, Math.ceil(probe.measureText(text).width) + 32);
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 11;
  g.strokeStyle = '#2b1d08';
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowOffsetY = 3;
  g.shadowBlur = 4;
  g.strokeText(text, c.width / 2, 32);
  g.shadowColor = 'transparent';
  g.fillStyle = fill;
  g.fillText(text, c.width / 2, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The pictures on power-up orbs and the tanker's warning sign. */
function iconTexture(kind: 'bolt' | 'x2' | 'warn' | 'star'): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  if (kind === 'star') {
    // A fat gold star with a white rim and a soft glow round it.
    const glow = g.createRadialGradient(64, 66, 10, 64, 66, 62);
    glow.addColorStop(0, 'rgba(255,230,120,0.55)');
    glow.addColorStop(1, 'rgba(255,230,120,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, s, s);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 22 : 50;
      g.lineTo(64 + Math.cos(a) * r, 68 + Math.sin(a) * r);
    }
    g.closePath();
    g.lineWidth = 9;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffc61a';
    g.fill();
  } else if (kind === 'warn') {
    g.fillStyle = '#ff3b30';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(64, 10);
    g.lineTo(120, 112);
    g.lineTo(8, 112);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '900 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 64, 76);
  } else if (kind === 'bolt') {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0a5a8a';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(74, 8);
    g.lineTo(30, 72);
    g.lineTo(60, 72);
    g.lineTo(50, 120);
    g.lineTo(98, 52);
    g.lineTo(68, 52);
    g.closePath();
    g.stroke();
    g.fill();
  } else {
    g.font = '900 70px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#7a4a00';
    g.strokeText('x2', 64, 68);
    g.fillStyle = '#ffffff';
    g.fillText('x2', 64, 68);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
