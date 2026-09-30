/**
 * The city's things as drawn. They stand in batches (one InstancedMesh per
 * model per area of the map), so a Region map with thousands of things stays
 * quick and the areas off screen are skipped. Things put up during a round
 * are drawn one by one as they rise. A swallowed thing tips into its hole
 * (`swallow`, `stepFallers`); one too big to swallow rocks on the rim of the
 * child's hole (`wobble`); one in the way of the camera goes see-through
 * (see seeThrough.ts).
 */
import * as THREE from 'three';
import { FIT, KINDS, isSite, type Prop } from '../domain/catalog';
import { BUILD_TIME, canEat, propsNear, type Hole, type World } from '../domain/world';
import { blobTexture } from './canvasTextures';
import { modelOf } from './models';
import { SeeThrough } from './seeThrough';

/** How long a swallowed thing takes to disappear, in seconds. */
const FALL = 0.8;
/** Buildings from this tier up can hide the child's hole, and fade. */
const TALL_TIER = 5;
/** Things are batched per square of this many units (two blocks), so the
 * squares off screen are skipped while the hole is small. */
const CHUNK = 108;
/** Things that sit lower than the ground: a ship floats in the sea, below the quay. */
const SINK: Partial<Record<Prop['kind'], number>> = { ship: -2 };
/** Small street furniture: no shadows, to save the shadow pass drawing hundreds of them. */
const CLUTTER: ReadonlySet<string> = new Set(['lamp', 'bin', 'hydrant', 'planter', 'cone', 'bike', 'mailbox']);
/** Where a batch puts a thing it is not showing. */
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
  /** A vehicle's soft shadow patch, drawn with the same matrix. */
  blob?: THREE.InstancedMesh;
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

/** Something put up during the round; `t` runs 0..1 while it rises, and on to 1.4 while its scaffold comes down. */
interface Built {
  mesh: THREE.Mesh;
  scaffold: THREE.Group;
  t: number;
  /** Seconds to rise. */
  time: number;
}

export class PropView {
  private slots = new Map<number, Slot>();
  private batches: Array<{ mesh: THREE.InstancedMesh; tier: number; casts: boolean }> = [];
  private built = new Map<number, Built>();
  private fallers: Faller[] = [];
  private seeThrough: SeeThrough;
  private scaffoldMat = new THREE.MeshStandardMaterial({ color: 0xffb81c, roughness: 0.6 });
  private scaffoldGeo = new THREE.BoxGeometry(1, 1, 1);
  private blobTex = blobTexture();
  private blobMat = new THREE.MeshBasicMaterial({
    map: this.blobTex,
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -40,
  });
  private blobGeos = new Map<string, THREE.BufferGeometry>();
  /** Things wobbling on the rim of the child's hole (too big to fall in yet): how far into their wobble, and how hard. */
  private wobbling = new Map<number, number>();
  private shakeOf = new Map<number, number>();
  private dummy = new THREE.Object3D();
  private tiltAxis = new THREE.Vector3();
  private tiltQ = new THREE.Quaternion();
  private upright = new THREE.Euler();

  constructor(
    private scene: THREE.Scene,
    /** The one flat-shaded, vertex-coloured material every model shares. */
    private material: THREE.MeshStandardMaterial,
    world: World,
    private reducedMotion: boolean,
  ) {
    this.seeThrough = new SeeThrough(scene, material, reducedMotion, (p, shown) => this.setShown(p, shown));
    this.buildBatches(world);
  }

  /** A thing leaves the city: hide it where it stood, and start a copy falling. */
  swallow(p: Prop, hole: number): void {
    this.setShown(p, false);
    const ghost = this.seeThrough.take(p.id);
    const built = this.built.get(p.id);
    if (built) {
      this.built.delete(p.id);
      this.scene.remove(built.scaffold);
    }
    let mesh: THREE.Mesh;
    let ownMaterial = false;
    if (ghost) {
      if (built) this.scene.remove(built.mesh);
      mesh = ghost;
      ownMaterial = true;
    } else if (built) {
      // A building still going up falls as it stands.
      mesh = built.mesh;
      mesh.visible = true;
    } else {
      mesh = new THREE.Mesh(modelOf(p), this.material);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.rot;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const info = KINDS[p.kind];
    this.fallers.push({ mesh, hole, t: 0, from: mesh.position.clone(), rot: p.rot, h: info.h * p.hScale, ownMaterial });
  }

  /**
   * Something new goes up. A construction site pops up out of the ground; a
   * finished building rises out of its site's scaffold over a few seconds.
   */
  raise(p: Prop): void {
    const mesh = new THREE.Mesh(modelOf(p), this.material);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.rot;
    mesh.scale.y = 0.02;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (isSite(p.kind)) {
      // Sites pop up quickly with no scaffold of their own; a tower's frame
      // climbs out more slowly, bringing its own scaffolding and crane.
      const time = p.kind === 'tallsite' ? 2.5 : 0.6;
      this.built.set(p.id, { mesh, scaffold: new THREE.Group(), t: this.reducedMotion ? 1.4 : 0, time });
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
    this.seeThrough.track(p);
  }

  /** Something that was always there joins the city: no rising out of the ground, and no scaffold. */
  appear(p: Prop): void {
    this.raise(p);
    const b = this.built.get(p.id);
    if (b) {
      b.t = 1.4;
      b.mesh.scale.y = 1;
      this.scene.remove(b.scaffold);
    }
  }

  /** Take away something built during the round (a site whose building is done). */
  clear(p: Prop): void {
    const b = this.built.get(p.id);
    if (!b) return;
    this.built.delete(p.id);
    this.scene.remove(b.mesh, b.scaffold);
    this.seeThrough.untrack(p);
  }

  /** Show a thing again where it stands (it grew back). */
  show(p: Prop): void {
    this.setShown(p, true);
  }

  /** Things falling into holes, and buildings rising. */
  step(world: World, dt: number): void {
    this.stepFallers(world, dt);
    this.stepBuilt(dt);
  }

  /**
   * Anything too big to swallow that sits over the rim of the child's hole
   * rocks and leans in, as if it is about to go: a hint of what is next.
   * `time` is the scene's clock.
   */
  wobble(world: World, me: Hole, time: number, dt: number): void {
    // Each thing's wobble eases in while it sits on the rim and out after,
    // so nothing snaps upright or starts shaking in a single frame.
    const near = new Set<number>();
    if (me.alive && !this.reducedMotion) {
      for (const p of propsNear(world, me.x, me.z, me.r + 12)) {
        // A building the hole is right under is see-through (so the hole
        // shows), and it shakes all the same.
        if (canEat(me, p)) continue;
        const reach = Math.max(KINDS[p.kind].w, KINDS[p.kind].d) / 2;
        if (Math.hypot(me.x - p.x, me.z - p.z) > me.r + reach * 0.6) continue;
        // How close the mouth is to fitting it: a third of the size and it
        // stays still; nearly big enough and it rocks hard.
        const q = (me.r * FIT) / p.size;
        const strength = Math.max(0, Math.min(1, (q - 0.35) / 0.55));
        if (strength < 0.05) continue;
        this.shakeOf.set(p.id, strength);
        near.add(p.id);
        if (!this.wobbling.has(p.id)) this.wobbling.set(p.id, 0);
      }
    }
    for (const [id, amount] of this.wobbling) {
      const p = world.props.get(id);
      const next = Math.max(0, Math.min(1, amount + (near.has(id) ? dt * 3 : -dt * 3)));
      if (!p || next === 0) {
        this.wobbling.delete(id);
        const ghost = this.seeThrough.get(id);
        if (p && !ghost) this.setShown(p, true);
        this.upright.set(0, p ? p.rot : 0, 0);
        this.built.get(id)?.mesh.quaternion.setFromEuler(this.upright);
        ghost?.quaternion.setFromEuler(this.upright);
        continue;
      }
      this.wobbling.set(id, next);
      // A gentle lean toward the hole and a slow rock around it. The angle is
      // capped by height, so a tower's top sways a little, not by metres.
      const h = KINDS[p.kind].h * p.hScale;
      const strength = this.shakeOf.get(id) ?? 0.5;
      const cap = Math.min(0.1, 0.8 / Math.max(1, h)) * strength;
      const lean = next * cap * (0.55 + 0.45 * Math.sin(time * (5 + 9 * strength) + id * 1.7));
      const dx = me.x - p.x;
      const dz = me.z - p.z;
      this.tiltAxis.set(dz, 0, -dx);
      if (this.tiltAxis.lengthSq() < 0.0001) this.tiltAxis.set(1, 0, 0);
      this.tiltAxis.normalize();
      this.tiltQ.setFromAxisAngle(this.tiltAxis, lean);
      const w = this.dummy;
      w.position.set(p.x, 0, p.z);
      w.rotation.set(0, p.rot, 0);
      w.scale.set(1, 1, 1);
      w.quaternion.premultiply(this.tiltQ);
      w.updateMatrix();
      const ghost = this.seeThrough.get(id);
      if (ghost) ghost.quaternion.copy(w.quaternion);
      else this.place(p, w.matrix, w.quaternion);
    }
  }

  /** Swap whatever stands between the camera at `eye` and the child's hole for a see-through copy. */
  fadeInTheWay(world: World, me: Hole, eye: THREE.Vector3, time: number, dt: number): void {
    this.seeThrough.update(world, me, eye, time, dt);
  }

  /** Small things cast no shadow once the camera is high above them (a hole of radius `r`). */
  castShadows(r: number): void {
    const small = r > 14;
    for (const b of this.batches) b.mesh.castShadow = b.casts && !(small && b.tier <= 2);
  }

  dispose(): void {
    this.scaffoldGeo.dispose();
    this.scaffoldMat.dispose();
    this.blobTex.dispose();
    this.blobMat.dispose();
    for (const g of this.blobGeos.values()) g.dispose();
  }

  private buildBatches(world: World): void {
    const groups = new Map<string, Prop[]>();
    for (const p of world.city.props) {
      const key = `${Math.floor(p.x / CHUNK)}:${Math.floor(p.z / CHUNK)}:${modelOf(p).uuid}`;
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
      if (KINDS[p.kind].tier >= TALL_TIER) this.seeThrough.track(p);
    }
    const dummy = this.dummy;
    for (const list of groups.values()) {
      const kind = list[0].kind;
      const vehicle = KINDS[kind].vehicle === true;
      const mesh = new THREE.InstancedMesh(modelOf(list[0]), this.material, list.length);
      // Vehicles cast no sun shadow: small, low shadows came out with a gap
      // under the wheels. They sit on a soft dark patch instead, which is
      // steadier and cheaper to draw.
      const blob = vehicle ? new THREE.InstancedMesh(this.blobGeometry(kind), this.blobMat, list.length) : undefined;
      list.forEach((p, i) => {
        dummy.position.set(p.x, SINK[p.kind] ?? 0, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.updateMatrix();
        const matrix = dummy.matrix.clone();
        const m = world.props.has(p.id) ? matrix : HIDDEN;
        mesh.setMatrixAt(i, m);
        blob?.setMatrixAt(i, m);
        this.slots.set(p.id, { mesh, index: i, matrix, blob });
      });
      if (blob) {
        blob.renderOrder = 1;
        blob.computeBoundingSphere();
        this.scene.add(blob);
      }
      // Small street clutter casts no shadow either: hundreds of them, for little look.
      const casts = !vehicle && !CLUTTER.has(kind);
      mesh.castShadow = casts;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.batches.push({ mesh, tier: KINDS[kind].tier, casts });
    }
  }

  /** A flat soft patch a little bigger than the vehicle's footprint, just above the road. */
  private blobGeometry(kind: Prop['kind']): THREE.BufferGeometry {
    let geo = this.blobGeos.get(kind);
    if (!geo) {
      const info = KINDS[kind];
      geo = new THREE.PlaneGeometry(info.w * 1.15 + 0.3, info.d * 1.08 + 0.3);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.02, 0);
      this.blobGeos.set(kind, geo);
    }
    return geo;
  }

  private setShown(p: Prop, shown: boolean): void {
    const slot = this.slots.get(p.id);
    if (!slot) {
      const b = this.built.get(p.id);
      if (b) b.mesh.visible = shown;
      return;
    }
    slot.mesh.setMatrixAt(slot.index, shown ? slot.matrix : HIDDEN);
    slot.mesh.instanceMatrix.needsUpdate = true;
    if (slot.blob) {
      slot.blob.setMatrixAt(slot.index, shown ? slot.matrix : HIDDEN);
      slot.blob.instanceMatrix.needsUpdate = true;
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
}
