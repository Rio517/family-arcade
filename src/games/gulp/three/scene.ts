/**
 * The three.js view of a Gulp Universe round: a toy city on an island, holes
 * roaming it, things tipping into them, and (when switched on) power-ups and
 * a city that fights back.
 *
 * Framework-free, like the racer's scene: the page builds one of these and
 * each frame hands it the world and what just happened. Things are drawn in
 * batches (one InstancedMesh per kind and colour per area of the map), so a
 * Region map with thousands of things stays quick and the areas off screen
 * are skipped. A building standing between the camera and the child's hole
 * is swapped for a see-through copy while it is in the way. Everything is
 * procedural, so the PWA stays offline.
 */
import * as THREE from 'three';
import { disposeDeep } from '@shared/three/disposeDeep';
import { KINDS, type Prop } from '../domain/catalog';
import { BUILD_TIME, canEat, propsNear, type Hole, type Person, type World, type WorldEvent } from '../domain/world';
import { Effects } from './effects';
import { buildGround, type Ground } from './ground';
import { buildKindGeometry } from './props';

export interface HoleLook {
  /** The hole's colour: rim, throat and name tag. */
  color: number;
  /** Shown over the hole. */
  label: string;
}

/** How long a swallowed thing takes to disappear, in seconds. */
const FALL = 0.8;
/** Buildings from this tier up can hide the child's hole, and fade. */
const TALL_TIER = 5;
/** The sun always comes from the same side; shadows are fitted around the camera. */
const SUN_DIR = new THREE.Vector3(0.35, 1, 0.25).normalize();
const SHADOW_MAP = 2048;

/** How see-through a building standing in front of the child's hole goes. */
const GHOST = 0.2;

/** Things are batched per square of this many units (two blocks), so the
 * squares off screen are skipped while the hole is small. */
const CHUNK = 108;

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
}

interface Faller {
  mesh: THREE.Mesh;
  hole: number;
  t: number;
  from: THREE.Vector3;
  rot: number;
  h: number;
  /** A see-through copy has its own material to free. */
  ownMaterial: boolean;
}

interface HoleObj {
  group: THREE.Group;
  disc: THREE.Mesh;
  body: THREE.Group;
  rim: THREE.MeshStandardMaterial;
  pupils: THREE.Object3D[];
  lids: THREE.Object3D[];
  /** The two eyes: they grow more slowly than the hole. */
  eyes: THREE.Object3D[];
  label: THREE.Sprite;
  materials: THREE.Material[];
  /** 1 while visible, shrinking to 0 when swallowed. */
  shown: number;
  flash: number;
  blink: number;
}

export class GulpScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private ground: Ground;
  private effects: Effects;
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 });
  private geometries = new Map<string, THREE.BufferGeometry>();
  private slots = new Map<number, Slot>();
  private batches: Array<{ mesh: THREE.InstancedMesh; tier: number }> = [];
  /** Tall things that might stand in the way, and the see-through copies in use. */
  private tall: Prop[] = [];
  private ghosts = new Map<number, THREE.Mesh>();
  /** When each see-through copy was last needed: they linger a moment, so a
   * building doesn't flick between solid and faded at the edge of the view. */
  private ghostSeen = new Map<number, number>();
  /** Buildings put up during the round, drawn one by one; `t` runs 0..1 while they rise. */
  private built = new Map<number, { mesh: THREE.Mesh; scaffold: THREE.Group; t: number; time: number }>();
  private scaffoldMat = new THREE.MeshStandardMaterial({ color: 0xffb81c, roughness: 0.6 });
  private scaffoldGeo = new THREE.BoxGeometry(1, 1, 1);
  private bubble: { sprite: THREE.Sprite; life: number; hole: number } | null = null;
  private bubbleTex = new Map<string, THREE.Texture>();
  private lastYum = -10;
  private lightBasis = new THREE.Matrix4();
  /** Things wobbling on the rim of the child's hole: too big to fall in yet. */
  private wobbling = new Map<number, number>();
  /** People: one batch per outfit, and where each person sits in it. */
  private facing = new Map<number, number>();
  private frameDt = 0;
  private peopleSlots: Array<{ person: Person; mesh: THREE.InstancedMesh; index: number }> = [];
  private wobbleDummy = new THREE.Object3D();
  private tiltAxis = new THREE.Vector3();
  private tiltQ = new THREE.Quaternion();
  private holes: HoleObj[] = [];
  private fallers: Faller[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private resizeObs: ResizeObserver | null = null;
  private time = 0;
  private pending = 0;
  private pendingAt = new THREE.Vector3();
  private pendingFor = 0;
  private disposed = false;
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private shadowReach = 0;

  constructor(
    private container: HTMLElement,
    world: World,
    looks: HoleLook[],
    /** The hole the camera follows: the child's, or a rival in attract mode. */
    private follow: number,
    private reducedMotion = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // A little under the iPad's full density: the city is busy, and the
    // difference is hard to see at arm's length.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    // Neutral tone mapping keeps the toy colours bold (filmic curves wash them out).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x8fd8f5);
    this.scene.fog = new THREE.Fog(0x8fd8f5, 260, 620);
    this.camera = new THREE.PerspectiveCamera(45, this.aspect(), 1, 1200);

    // Less fill and a stronger sun: crisper shadows and more contrast.
    this.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8a8070, 0.95));
    this.sun = new THREE.DirectionalLight(0xfff2de, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.ground = buildGround(world.city, this.renderer);
    this.scene.add(this.ground.group);
    this.buildProps(world);
    this.buildPeople(world);
    this.effects = new Effects(reducedMotion);
    this.scene.add(this.effects.group);
    looks.forEach((look, i) => this.holes.push(this.buildHole(look, i === follow)));

    const first = world.holes[follow];
    if (first) this.snapCamera(first);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
    }
  }

  private aspect(): number {
    return (this.container.clientWidth || 800) / (this.container.clientHeight || 600);
  }

  // ---------------------------------------------------------------------
  // Things in the city
  // ---------------------------------------------------------------------

  private geometry(p: Prop): THREE.BufferGeometry {
    // Buildings come in a few heights; everything else in its colours.
    const h = KINDS[p.kind].scales ? Math.round(p.hScale * 4) / 4 : 1;
    const key = `${p.kind}:${p.variant}:${h}`;
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = buildKindGeometry(p.kind, p.variant, h);
      geo.computeBoundingSphere();
      this.geometries.set(key, geo);
    }
    return geo;
  }

  private buildProps(world: World): void {
    const groups = new Map<string, Prop[]>();
    for (const p of world.city.props) {
      const key = `${Math.floor(p.x / CHUNK)}:${Math.floor(p.z / CHUNK)}:${this.geometry(p).uuid}`;
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
      if (KINDS[p.kind].tier >= TALL_TIER) this.tall.push(p);
    }
    const dummy = new THREE.Object3D();
    for (const list of groups.values()) {
      const mesh = new THREE.InstancedMesh(this.geometry(list[0]), this.material, list.length);
      list.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.updateMatrix();
        const matrix = dummy.matrix.clone();
        mesh.setMatrixAt(i, world.props.has(p.id) ? matrix : this.hidden);
        this.slots.set(p.id, { mesh, index: i, matrix });
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.batches.push({ mesh, tier: KINDS[list[0].kind].tier });
    }
  }

  private setShown(p: Prop, shown: boolean): void {
    const slot = this.slots.get(p.id);
    if (!slot) {
      const b = this.built.get(p.id);
      if (b) b.mesh.visible = shown;
      return;
    }
    slot.mesh.setMatrixAt(slot.index, shown ? slot.matrix : this.hidden);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  private buildPeople(world: World): void {
    const byLook = new Map<number, Person[]>();
    for (const p of world.people) {
      const v = p.variant % KINDS.person.variants;
      byLook.set(v, [...(byLook.get(v) ?? []), p]);
    }
    for (const [v, list] of byLook) {
      const geo = buildKindGeometry('person', v);
      this.geometries.set(`person-walk:${v}`, geo);
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      mesh.castShadow = true;
      // They move every frame, so their bounds are the whole island.
      mesh.frustumCulled = false;
      list.forEach((person, index) => this.peopleSlots.push({ person, mesh, index }));
      this.scene.add(mesh);
    }
  }

  /** Everyone where the world says, bobbing a little as they walk. */
  private syncPeople(): void {
    const d = this.wobbleDummy;
    const touched = new Set<THREE.InstancedMesh>();
    for (const { person: p, mesh, index } of this.peopleSlots) {
      if (!p.alive) {
        mesh.setMatrixAt(index, this.hidden);
      } else {
        // A soft step bob, a little quicker when running.
        const bob = this.reducedMotion ? 0 : Math.abs(Math.sin(this.time * (p.panic > 0 ? 10 : 6) + p.id)) * 0.07;
        // Turn smoothly toward the way they walk (corners and turn-rounds).
        let face = this.facing.get(p.id) ?? p.heading;
        let turn = p.heading - face;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        face += turn * (this.reducedMotion ? 1 : Math.min(1, this.frameDt * 10));
        this.facing.set(p.id, face);
        d.position.set(p.x, bob, p.z);
        d.rotation.set(0, face, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        mesh.setMatrixAt(index, d.matrix);
      }
      touched.add(mesh);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  /** A thing leaves the city: hide it where it stood, and start a copy falling. */
  private swallow(p: Prop, hole: number): void {
    this.setShown(p, false);
    const ghost = this.ghosts.get(p.id);
    const built = this.built.get(p.id);
    if (built) {
      this.built.delete(p.id);
      this.scene.remove(built.scaffold);
    }
    let mesh: THREE.Mesh;
    let ownMaterial = false;
    if (ghost) {
      this.ghosts.delete(p.id);
      if (built) this.scene.remove(built.mesh);
      mesh = ghost;
      ownMaterial = true;
    } else if (built) {
      // A building still going up falls as it stands.
      mesh = built.mesh;
      mesh.visible = true;
    } else {
      mesh = new THREE.Mesh(this.geometry(p), this.material);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.rot;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const info = KINDS[p.kind];
    this.fallers.push({ mesh, hole, t: 0, from: mesh.position.clone(), rot: p.rot, h: info.h * p.hScale, ownMaterial });
  }

  // ---------------------------------------------------------------------
  // Holes
  // ---------------------------------------------------------------------

  private buildHole(look: HoleLook, mine: boolean): HoleObj {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    const keep = <M extends THREE.Material>(m: M) => {
      materials.push(m);
      return m;
    };
    const throat = keep(new THREE.MeshBasicMaterial({ map: throatTexture(look.color), fog: false }));
    // Always over the ground's layers, whatever the camera angle.
    throat.polygonOffset = true;
    throat.polygonOffsetFactor = -8;
    throat.polygonOffsetUnits = -32;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 56), throat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.12;
    disc.renderOrder = 5;
    group.add(disc);

    const body = new THREE.Group();
    const rim = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.45, emissive: look.color, emissiveIntensity: 0.12 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 10, 56), rim);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    body.add(ring);

    // Teeth round the rim, leaning in: friendly, not scary.
    const white = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    const toothGeo = new THREE.ConeGeometry(0.09, 0.24, 5);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, white);
      tooth.position.set(Math.cos(a) * 0.88, 0.1, Math.sin(a) * 0.88);
      tooth.rotation.set(0, -a, 0);
      tooth.rotateZ(0.9);
      body.add(tooth);
    }

    // Googly eyes on the far rim, where the camera always sees them.
    const eyeGeo = new THREE.SphereGeometry(0.32, 18, 14);
    const pupilGeo = new THREE.SphereGeometry(0.16, 14, 10);
    const lidGeo = new THREE.SphereGeometry(0.335, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const black = keep(new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3 }));
    const lidMat = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.5 }));
    const pupils: THREE.Object3D[] = [];
    const lids: THREE.Object3D[] = [];
    const eyes: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.38, 0.4, -1.0);
      const ball = new THREE.Mesh(eyeGeo, white);
      ball.castShadow = true;
      const pupil = new THREE.Mesh(pupilGeo, black);
      pupil.position.set(0, 0.03, 0.21);
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.scale.y = 0.05;
      eye.add(ball, pupil, lid);
      body.add(eye);
      eyes.push(eye);
      pupils.push(pupil);
      lids.push(lid);
    }
    group.add(body);

    // The child's own hole shows through buildings as a glowing ring, so it
    // is never lost behind a skyscraper.
    if (mine) {
      const xray = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.07, 8, 56),
        new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.55, depthTest: false, fog: false }),
      );
      xray.rotation.x = Math.PI / 2;
      xray.position.y = 0.06;
      xray.renderOrder = 20;
      body.add(xray);
    }
    const label = labelSprite(look.label, look.color, mine);
    group.add(label);
    this.scene.add(group);
    return { group, disc, body, rim, pupils, lids, eyes, label, materials, shown: 1, flash: 0, blink: 2 + (group.id % 5) * 0.7 };
  }

  private syncHole(obj: HoleObj, h: Hole, dt: number): void {
    const target = h.alive ? 1 : 0;
    obj.shown += (target - obj.shown) * Math.min(1, dt * (h.alive ? 5 : 9));
    const visible = obj.shown > 0.02;
    obj.group.visible = visible;
    if (!visible) return;
    obj.group.position.set(h.x, 0, h.z);
    const r = h.r * obj.shown;
    obj.disc.scale.set(r, r, 1);
    obj.body.scale.setScalar(r);
    // The eyes grow with the square root of the hole, so a giant's eyes stay
    // cute instead of filling the screen. They sit on the rim either way.
    const eye = Math.min(1, Math.sqrt(2.4 / Math.max(0.1, r)));
    obj.eyes.forEach((e, i) => {
      e.scale.setScalar(eye);
      e.position.set((i ? 1 : -1) * 0.38 * eye, 0.4 * eye, -1.0);
    });
    // Above the eyes on the far rim, not over them.
    obj.label.position.set(0, 1.4 + r * 0.9, -r * 1.1);

    // Blinking while it is safe after coming back.
    const blink = h.safe > 0 && !this.reducedMotion ? 0.55 + 0.45 * Math.sin(this.time * 18) : 1;
    for (const m of obj.materials) {
      m.transparent = blink < 1;
      m.opacity = blink;
    }
    // A glow on a level-up; red and a wobble while reeling from a hit; the
    // rim shimmers while a power-up is on.
    obj.flash = Math.max(0, obj.flash - dt * 1.5);
    const powered = h.speedTime > 0 || h.doubleTime > 0;
    const shimmer = powered && !this.reducedMotion ? 0.35 + 0.25 * Math.sin(this.time * 10) : 0;
    obj.rim.emissiveIntensity = 0.12 + obj.flash * 1.2 + shimmer;
    obj.rim.emissive.setHex(h.stun > 0 ? 0xff2a2a : h.speedTime > 0 ? 0x5fe3ff : h.doubleTime > 0 ? 0xffd34d : obj.rim.color.getHex());
    obj.body.rotation.y = h.stun > 0 && !this.reducedMotion ? Math.sin(this.time * 30) * 0.12 : 0;

    // The pupils look where the hole is going; now and then the eyes blink.
    // Eased, so they glide rather than snap when the hole turns or stops.
    const speed = Math.hypot(h.vx, h.vz);
    const look = Math.min(1, speed / 4);
    const lx = speed > 0.01 ? (h.vx / speed) * 0.1 * look : 0;
    const lz = speed > 0.01 ? (h.vz / speed) * 0.06 * look : 0;
    const k = Math.min(1, dt * 8);
    for (const p of obj.pupils) {
      p.position.x += (lx - p.position.x) * k;
      p.position.y += (0.03 - lz * 0.3 - p.position.y) * k;
      p.position.z = 0.21;
    }
    if (!this.reducedMotion) {
      obj.blink -= dt;
      const closing = obj.blink < 0.12 ? 1 - Math.abs(obj.blink - 0.06) / 0.06 : 0;
      for (const lid of obj.lids) lid.scale.y = 0.05 + closing * 0.95;
      if (obj.blink <= 0) obj.blink = 2.5 + ((this.time * 7.3) % 3);
    }
  }

  // ---------------------------------------------------------------------
  // Each frame
  // ---------------------------------------------------------------------

  /** Mirror the world, play what just happened, and move the camera. */
  sync(world: World, events: WorldEvent[], dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    this.frameDt = dt;
    const me = world.holes[this.follow];

    for (const e of events) {
      if (e.type === 'eat') {
        this.swallow(e.prop, e.hole);
        if (e.hole === this.follow) {
          const h = world.holes[e.hole];
          this.pending += e.prop.points * (h && h.doubleTime > 0 ? 2 : 1);
          this.pendingAt.set(e.prop.x, 2 + KINDS[e.prop.kind].h, e.prop.z);
        }
      } else if (e.type === 'rebuild') {
        if (e.replaces) this.clear(e.replaces);
        this.raise(e.prop);
      } else if (e.type === 'food' && e.hole === this.follow) {
        if (e.food === 'healthy') this.say(`Healthy! +${e.bonus}`, true, e.hole);
        else if (this.time - this.lastYum > 2.5) {
          this.lastYum = this.time;
          this.say('Yum!', false, e.hole);
        }
      } else if (e.type === 'regrow') {
        this.setShown(e.prop, true);
      } else if (e.type === 'level') {
        const obj = this.holes[e.hole];
        if (obj) obj.flash = 1;
      } else if (e.type === 'boom') {
        this.effects.boom(e.x, e.z, Math.max(3, e.size));
        if (me && Math.hypot(e.x - me.x, e.z - me.z) < 30 + me.r * 3) this.shake = 0.5;
      } else if (e.type === 'hurt' && e.cause === 'chem') {
        const h = world.holes[e.hole];
        if (h) this.effects.gas(h.x, h.z, Math.max(3, h.r));
      }
    }

    // Points gathered over a quarter second show as one "+n" over the hole.
    this.pendingFor += dt;
    if (this.pending > 0 && this.pendingFor > 0.25) {
      this.effects.popup(this.pending, this.pendingAt);
      this.pending = 0;
      this.pendingFor = 0;
    }

    world.holes.forEach((h, i) => {
      const obj = this.holes[i];
      if (obj) this.syncHole(obj, h, dt);
    });

    this.stepFallers(world, dt);
    this.stepBuilt(dt);
    this.syncPeople();
    this.stepBubble(world, dt);
    if (me) this.wobble(world, me, dt);
    const scale = me ? Math.max(1, me.r / 2.5) : 1;
    this.effects.syncPowerups(world.powerups, scale);
    this.effects.syncAttacks(world.attacks, me ? me.r : 2);
    this.effects.step(dt);

    if (me) {
      this.moveCamera(me, dt);
      this.fadeInTheWay(world, me, dt);
      // Small things cast no shadow once the camera is high above them.
      const small = me.r > 14;
      for (const b of this.batches) b.mesh.castShadow = !(small && b.tier <= 2);
    }
    if (!this.reducedMotion) this.ground.water.offset.set(this.time * 0.004, this.time * 0.006);
  }

  private stepFallers(world: World, dt: number): void {
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt / FALL;
      const h = world.holes[f.hole];
      const k = Math.min(1, f.t);
      // Slide toward the middle of the hole, tip over its edge, and sink.
      const tx = h ? h.x : f.from.x;
      const tz = h ? h.z : f.from.z;
      const slide = Math.min(1, k * 1.6);
      f.mesh.position.x = f.from.x + (tx - f.from.x) * slide;
      f.mesh.position.z = f.from.z + (tz - f.from.z) * slide;
      f.mesh.position.y = -k * k * (f.h * 1.4 + 2);
      const along = Math.atan2(tx - f.from.x, tz - f.from.z);
      const tilt = Math.min(1.3, k * 2.2);
      f.mesh.rotation.set(Math.cos(along) * tilt, f.rot + k * 1.2, -Math.sin(along) * tilt, 'YXZ');
      if (f.t >= 1) {
        this.scene.remove(f.mesh);
        if (f.ownMaterial) (f.mesh.material as THREE.Material).dispose();
        this.fallers.splice(i, 1);
      }
    }
  }

  /**
   * Anything too big to swallow that sits over the rim of the child's hole
   * rocks and leans in, as if it is about to go: a hint of what is next.
   */
  private wobble(world: World, me: Hole, dt: number): void {
    // Each thing's wobble eases in while it sits on the rim and out after,
    // so nothing snaps upright or starts shaking in a single frame.
    const near = new Set<number>();
    if (me.alive && !this.reducedMotion) {
      for (const p of propsNear(world, me.x, me.z, me.r + 12)) {
        if (canEat(me, p) || this.ghosts.has(p.id)) continue;
        const reach = Math.max(KINDS[p.kind].w, KINDS[p.kind].d) / 2;
        if (Math.hypot(me.x - p.x, me.z - p.z) > me.r + reach * 0.6) continue;
        near.add(p.id);
        if (!this.wobbling.has(p.id)) this.wobbling.set(p.id, 0);
      }
    }
    for (const [id, amount] of this.wobbling) {
      const p = world.props.get(id);
      const next = Math.max(0, Math.min(1, amount + (near.has(id) ? dt * 3 : -dt * 3)));
      if (!p || next === 0) {
        this.wobbling.delete(id);
        if (p && !this.ghosts.has(id)) this.setShown(p, true);
        const b = this.built.get(id);
        if (b) b.mesh.quaternion.setFromEuler(new THREE.Euler(0, p ? p.rot : 0, 0));
        continue;
      }
      this.wobbling.set(id, next);
      if (this.ghosts.has(id)) continue;
      // A gentle lean toward the hole and a slow rock around it. The angle is
      // capped by height, so a tower's top sways a little, not by metres.
      const h = KINDS[p.kind].h * p.hScale;
      const cap = Math.min(0.08, 0.6 / Math.max(1, h));
      const lean = next * cap * (0.6 + 0.4 * Math.sin(this.time * 7 + id * 1.7));
      const dx = me.x - p.x;
      const dz = me.z - p.z;
      this.tiltAxis.set(dz, 0, -dx);
      if (this.tiltAxis.lengthSq() < 0.0001) this.tiltAxis.set(1, 0, 0);
      this.tiltAxis.normalize();
      this.tiltQ.setFromAxisAngle(this.tiltAxis, lean);
      const w = this.wobbleDummy;
      w.position.set(p.x, 0, p.z);
      w.rotation.set(0, p.rot, 0);
      w.scale.set(1, 1, 1);
      w.quaternion.premultiply(this.tiltQ);
      w.updateMatrix();
      this.place(p, w.matrix, w.quaternion);
    }
  }


  /** Set where a thing is drawn: its batch slot, or its own mesh if it was built during the round. */
  private place(p: Prop, matrix: THREE.Matrix4, q: THREE.Quaternion): void {
    const slot = this.slots.get(p.id);
    if (slot) {
      slot.mesh.setMatrixAt(slot.index, matrix);
      slot.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const b = this.built.get(p.id);
    if (b && b.t >= 1) b.mesh.quaternion.copy(q);
  }

  /** A new building goes up: it rises out of a yellow scaffold over a few seconds. */
  /** Take away something built during the round (a site whose building is done). */
  private clear(p: Prop): void {
    const b = this.built.get(p.id);
    if (!b) return;
    this.built.delete(p.id);
    this.scene.remove(b.mesh, b.scaffold);
    this.tall = this.tall.filter((t) => t.id !== p.id);
  }

  /**
   * Something new goes up. A construction site pops up out of the ground; a
   * finished building rises out of its site's scaffold over a few seconds.
   */
  private raise(p: Prop): void {
    const mesh = new THREE.Mesh(this.geometry(p), this.material);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.rot;
    mesh.scale.y = 0.02;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (p.kind === 'site' || p.kind === 'bigsite') {
      // Sites pop up quickly, with no scaffold of their own.
      this.built.set(p.id, { mesh, scaffold: new THREE.Group(), t: this.reducedMotion ? 1.4 : 0, time: 0.6 });
      return;
    }
    const info = KINDS[p.kind];
    const w = info.w + 0.6;
    const d = info.d + 0.6;
    const h = info.h * p.hScale + 1;
    const scaffold = new THREE.Group();
    scaffold.position.set(p.x, 0, p.z);
    scaffold.rotation.y = p.rot;
    const bar = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(this.scaffoldGeo, this.scaffoldMat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      scaffold.add(m);
    };
    const t = 0.35;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(t, h, t, (sx * w) / 2, h / 2, (sz * d) / 2);
    for (let y = h / 3; y <= h; y += h / 3) {
      bar(w, t, t, 0, y, d / 2);
      bar(w, t, t, 0, y, -d / 2);
      bar(t, t, d, w / 2, y, 0);
      bar(t, t, d, -w / 2, y, 0);
    }
    this.scene.add(scaffold);
    this.built.set(p.id, { mesh, scaffold, t: this.reducedMotion ? 1 : 0, time: BUILD_TIME });
    this.tall.push(p);
  }

  private stepBuilt(dt: number): void {
    for (const b of this.built.values()) {
      if (b.t >= 1.4) continue;
      b.t += dt / b.time;
      const k = Math.min(1, b.t);
      // Up with a little overshoot, then settled.
      const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      b.mesh.scale.y = Math.max(0.02, Math.min(1.04, ease));
      if (b.t >= 1 || this.reducedMotion) b.mesh.scale.y = 1;
      // The scaffold comes down once the building is up.
      b.scaffold.scale.y = b.t < 1 ? 1 : Math.max(0.001, 1 - (b.t - 1) / 0.4);
      if (b.t >= 1.4) this.scene.remove(b.scaffold);
    }
  }

  /** A small speech bubble by the child's hole: "Yum!" or a health bonus. */
  private say(text: string, healthy: boolean, hole: number): void {
    const key = `${healthy ? 'h' : 't'}:${text}`;
    let tex = this.bubbleTex.get(key);
    if (!tex) {
      tex = bubbleTexture(text, healthy);
      this.bubbleTex.set(key, tex);
    }
    if (!this.bubble) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      sprite.renderOrder = 12;
      sprite.scale.set(0.12, 0.06, 1);
      this.scene.add(sprite);
      this.bubble = { sprite, life: 0, hole };
    }
    const mat = this.bubble.sprite.material as THREE.SpriteMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.bubble.life = 1.3;
    this.bubble.hole = hole;
  }

  private stepBubble(world: World, dt: number): void {
    const b = this.bubble;
    if (!b) return;
    b.life -= dt;
    const h = world.holes[b.hole];
    const mat = b.sprite.material as THREE.SpriteMaterial;
    if (b.life <= 0 || !h?.alive) {
      mat.opacity = 0;
      return;
    }
    mat.opacity = Math.min(1, b.life * 3);
    // Up and to the right of the eyes, like a comic.
    b.sprite.position.set(h.x + h.r * 0.9, 1.5 + h.r * 0.8, h.z - h.r * 1.1);
  }

  /** Where the camera sits for a hole: higher as the hole grows. */
  private cameraFor(h: Hole): { pos: THREE.Vector3; look: THREE.Vector3 } {
    // Close in, so the city's things look big and chunky around the hole.
    const up = 16 + h.r * 3;
    const back = 11.5 + h.r * 2.2;
    return { pos: new THREE.Vector3(h.x, up, h.z + back), look: new THREE.Vector3(h.x, 0, h.z - 2) };
  }

  private snapCamera(h: Hole): void {
    const c = this.cameraFor(h);
    this.camPos.copy(c.pos);
    this.camLook.copy(c.look);
  }

  private moveCamera(h: Hole, dt: number): void {
    const c = this.cameraFor(h);
    const k = 1 - Math.pow(0.002, dt);
    this.camPos.lerp(c.pos, k);
    this.camLook.lerp(c.look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && !this.reducedMotion) {
      this.shake = Math.max(0, this.shake - dt);
      const amp = this.shake * (1 + h.r * 0.1);
      this.camera.position.x += Math.sin(this.time * 60) * amp;
      this.camera.position.y += Math.cos(this.time * 47) * amp;
    }
    this.camera.lookAt(this.camLook);

    // Near, far and fog follow the camera's height, so a giant sees far.
    const dist = this.camPos.distanceTo(this.camLook);
    const far = dist * 4 + 600;
    if (Math.abs(this.camera.far - far) > 20) {
      this.camera.near = Math.max(0.5, dist * 0.02);
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist * 2.6 + 150;
    fog.far = dist * 5 + 450;

    // The sun's shadows cover what the camera sees, and grow with it.
    const reach = Math.round(40 + h.r * 6);
    if (reach !== this.shadowReach) {
      this.shadowReach = reach;
      const cam = this.sun.shadow.camera;
      cam.left = -reach;
      cam.right = reach;
      cam.top = reach;
      cam.bottom = -reach;
      cam.near = 1;
      cam.far = 700 + h.r * 14;
      cam.updateProjectionMatrix();
    }
    // Snap the shadow camera to whole shadow-map texels, measured across the
    // sun's view: otherwise shadows crawl and shimmer as the camera glides.
    const texel = (2 * reach) / SHADOW_MAP;
    this.lightBasis.lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const snapped = this.camLook.clone().applyMatrix4(this.lightBasis.clone().transpose());
    snapped.x = Math.round(snapped.x / texel) * texel;
    snapped.y = Math.round(snapped.y / texel) * texel;
    snapped.applyMatrix4(this.lightBasis);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(SUN_DIR, 300 + h.r * 6);
  }

  /**
   * Tall things between the camera and the child's hole are swapped for
   * see-through copies while they are in the way.
   */
  private fadeInTheWay(world: World, me: Hole, dt: number): void {
    const want = new Set<number>();
    if (me.alive) {
      // Sight lines from the camera to the hole's eyes and the middle of its
      // mouth. Only buildings standing in front of the hole (on the camera's
      // side) may fade: one behind it never hides the mouth, and letting it
      // fade made it flick on and off as the hole moved along it.
      const eye = this.camera.position;
      const targets = [new THREE.Vector3(me.x, 0.5 + me.r * 0.4, me.z - me.r), new THREE.Vector3(me.x, 0.3, me.z)];
      const rays = targets.map((t) => ({ ray: new THREE.Ray(eye.clone(), t.clone().sub(eye).normalize()), far: eye.distanceTo(t) }));
      const box = new THREE.Box3();
      const hit = new THREE.Vector3();
      for (const p of this.tall) {
        if (!world.props.has(p.id)) continue;
        const info = KINDS[p.kind];
        const half = Math.max(info.w, info.d) / 2;
        if (p.z + half < me.z + me.r * 0.3) continue;
        const h = info.h * p.hScale;
        box.min.set(p.x - half, 0, p.z - half);
        box.max.set(p.x + half, h, p.z + half);
        if (rays.some(({ ray, far }) => ray.intersectBox(box, hit) && eye.distanceTo(hit) < far - 0.5)) want.add(p.id);
      }
    }
    for (const id of want) this.ghostSeen.set(id, this.time);
    // Fade in and out over a quarter of a second rather than snapping.
    const step = this.reducedMotion ? 1 : Math.min(1, dt * 4);
    for (const [id, ghost] of this.ghosts) {
      const mat = ghost.material as THREE.MeshStandardMaterial;
      const keep = want.has(id) || this.time - (this.ghostSeen.get(id) ?? 0) < 0.6;
      const target = keep ? GHOST : 1;
      mat.opacity += (target - mat.opacity) * step;
      if (keep || mat.opacity < 0.97) continue;
      this.ghostSeen.delete(id);
      this.scene.remove(ghost);
      mat.dispose();
      this.ghosts.delete(id);
      const p = world.props.get(id);
      if (p) this.setShown(p, true);
    }
    for (const id of want) {
      if (this.ghosts.has(id)) continue;
      const p = world.props.get(id);
      if (!p) continue;
      const mat = this.material.clone();
      mat.transparent = true;
      mat.opacity = 1;
      mat.depthWrite = false;
      const ghost = new THREE.Mesh(this.geometry(p), mat);
      ghost.position.set(p.x, 0, p.z);
      ghost.rotation.y = p.rot;
      ghost.renderOrder = 2;
      this.scene.add(ghost);
      this.ghosts.set(id, ghost);
      this.setShown(p, false);
    }
  }


  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.effects.dispose();
    this.ground.dispose();
    for (const t of this.bubbleTex.values()) t.dispose();
    this.scaffoldGeo.dispose();
    this.scaffoldMat.dispose();
    disposeDeep(this.scene);
    for (const g of this.geometries.values()) g.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// -------------------------------------------------------------------------
// Painted textures
// -------------------------------------------------------------------------

/** The inside of a hole: its colour at the rim, dark rings, black at the bottom. */
function throatTexture(color: number): THREE.Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const col = new THREE.Color(color);
  const tone = (f: number) =>
    `rgb(${Math.round(col.r * 255 * f)},${Math.round(col.g * 255 * f)},${Math.round(col.b * 255 * f)})`;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, '#000000');
  grad.addColorStop(0.45, '#07030a');
  grad.addColorStop(0.72, tone(0.32));
  grad.addColorStop(0.9, tone(0.62));
  grad.addColorStop(1, tone(0.8));
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // Rings going down the throat.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  for (const f of [0.62, 0.74, 0.85]) {
    g.lineWidth = 4 * f;
    g.beginPath();
    g.arc(s / 2, s / 2, (s / 2) * f, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A name tag that always faces the camera and keeps its size on screen. */
function labelSprite(text: string, color: number, mine: boolean): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 30px ui-rounded, system-ui, -apple-system, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 34);
  g.fillStyle = mine ? '#ffffff' : 'rgba(20,24,36,0.7)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 22);
  g.fill();
  g.fillStyle = mine ? `#${new THREE.Color(color).getHexString()}` : '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.scale.set(0.15, 0.0375, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A white speech bubble with a little tail; green words for healthy food. */
function bubbleTexture(text: string, healthy: boolean): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(29,31,51,0.85)';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(8, 8, 240, 86, 40);
  g.moveTo(52, 90);
  g.lineTo(36, 122);
  g.lineTo(84, 92);
  g.fill();
  g.stroke();
  // Cover the seam between the bubble and its tail.
  g.fillRect(44, 84, 44, 10);
  g.font = '900 44px ui-rounded, system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = healthy ? '#1a9c3c' : '#e0457b';
  g.fillText(text, 128, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
