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
import { groundAt } from './ground';
import { modelOf } from './models';
import { SeeThrough } from './seeThrough';

/**
 * How long a swallowed thing takes to go, in seconds: a cone is gone in half
 * a second, a skyscraper topples for over a second and a half.
 */
const fallTime = (size: number) => Math.min(1.6, Math.max(0.5, 0.45 + size * 0.07));
/** Share of the fall spent tipping over the rim before it drops free. */
const TIP = 0.4;
/** How far it has tipped (radians) when it goes over, and when it is gone. */
const TIPPED = 1.05;
const TUMBLED = 1.45;
/**
 * How far over a thing tips, as a share of the full tumble: a thing no taller
 * than the mouth is wide topples right over, a tower much taller than that
 * only leans in (its top reaches no further than about the mouth's far rim)
 * and drops straight down, so it never lies across the street or sinks
 * through the ground outside the mouth.
 */
const tiltShare = (height: number, r: number) => Math.min(1, Math.asin(Math.min(1, (r * 0.9) / height)) / TUMBLED);
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
  /** 0..1 through the fall, and how long the whole fall takes. */
  t: number;
  time: number;
  /** Where it stood, from the hole's middle: the fall follows a moving hole. */
  offX: number;
  offZ: number;
  /** Half its footprint along the line to the middle: it tips over its outer edge. */
  half: number;
  rot: number;
  h: number;
  /** A see-through copy has its own material to free. */
  ownMaterial: boolean;
  /** The ground it stood on (a block stands a kerb above the road). */
  y0: number;
  /** How far over it tips, as a share of the full tumble (see `tiltShare`). */
  tilt: number;
}

/** Something put up during the round; `t` runs 0..1 while it rises. */
interface Built {
  mesh: THREE.Mesh;
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
  private fallAxis = new THREE.Vector3();
  private fallQ = new THREE.Quaternion();
  private fallYaw = new THREE.Quaternion();
  private fallUp = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);
  /** The world the view was last stepped with, for where a swallowing hole stands. */
  private lastWorld: World;

  constructor(
    private scene: THREE.Scene,
    /** The one flat-shaded, vertex-coloured material every model shares. */
    private material: THREE.MeshStandardMaterial,
    world: World,
    private reducedMotion: boolean,
  ) {
    this.lastWorld = world;
    this.seeThrough = new SeeThrough(scene, material, reducedMotion, (p, shown) => this.setShown(p, shown));
    this.buildBatches(world);
  }

  /** A thing leaves the city: hide it where it stood, and start a copy falling. */
  swallow(p: Prop, hole: number): void {
    this.setShown(p, false);
    const ghost = this.seeThrough.take(p.id);
    const built = this.built.get(p.id);
    if (built) this.built.delete(p.id);
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
      mesh.position.set(p.x, this.groundOf(p), p.z);
      mesh.rotation.y = p.rot;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const info = KINDS[p.kind];
    const h = this.holeAt(hole);
    const offX = mesh.position.x - (h?.x ?? mesh.position.x);
    const offZ = mesh.position.z - (h?.z ?? mesh.position.z);
    // Half its footprint along the line from the hole's middle to it.
    const along = Math.atan2(offX, offZ) - p.rot;
    const half = Math.abs(Math.sin(along)) * (info.w / 2) + Math.abs(Math.cos(along)) * (info.d / 2);
    const height = info.h * p.hScale;
    const tilt = tiltShare(height, h?.r ?? height);
    this.fallers.push({ mesh, hole, t: 0, time: fallTime(p.size), offX, offZ, half, rot: p.rot, h: height, ownMaterial, y0: mesh.position.y, tilt });
  }

  /**
   * Something new goes up. A construction site pops up out of the ground; a
   * tower's frame climbs out more slowly with its own scaffolding and crane;
   * a finished building rises out of the ground over a few seconds, with a
   * little overshoot, while dust puffs out round its base (see the scene).
   */
  raise(p: Prop): void {
    const mesh = new THREE.Mesh(modelOf(p), this.material);
    mesh.position.set(p.x, this.groundOf(p), p.z);
    mesh.rotation.y = p.rot;
    mesh.scale.y = 0.02;
    // A building site is low: no shadow to draw.
    mesh.castShadow = !isSite(p.kind);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const time = p.kind === 'tallsite' ? 2.5 : isSite(p.kind) ? 0.6 : BUILD_TIME;
    this.built.set(p.id, { mesh, t: this.reducedMotion ? 1 : 0, time });
    if (!isSite(p.kind)) this.seeThrough.track(p);
  }

  /** Something that was always there joins the city (a police car that has parked): no rising out of the ground. */
  appear(p: Prop): void {
    this.raise(p);
    const b = this.built.get(p.id);
    if (b) {
      b.t = 1;
      b.mesh.scale.y = 1;
    }
  }

  /** Take away something built during the round (a site whose building is done). */
  clear(p: Prop): void {
    const b = this.built.get(p.id);
    if (!b) return;
    this.built.delete(p.id);
    this.scene.remove(b.mesh);
    this.seeThrough.untrack(p);
  }

  /** Show a thing again where it stands (it grew back). */
  show(p: Prop): void {
    this.setShown(p, true);
  }

  /** Things falling into holes, and buildings rising. */
  step(world: World, dt: number): void {
    this.lastWorld = world;
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
      w.position.set(p.x, this.groundOf(p), p.z);
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
        dummy.position.set(p.x, (SINK[p.kind] ?? 0) + groundAt(world.city, p.x, p.z), p.z);
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
  /** How high the ground is where a thing stands. */
  private groundOf(p: Prop): number {
    return groundAt(this.lastWorld.city, p.x, p.z);
  }

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

  /**
   * A swallowed thing tips over the edge of its footprint furthest from the
   * hole's middle, leaning in faster and faster like anything overbalancing,
   * then drops out of sight, still turning over. It keeps its heading: no
   * spinning. The ground outside the mouth hides whatever is below it, so it
   * seems to fall into the hole, not through the street.
   */
  private stepFallers(world: World, dt: number): void {
    const up = this.fallUp;
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt / f.time;
      const h = world.holes[f.hole];
      const cx = h ? h.x : f.mesh.position.x - f.offX;
      const cz = h ? h.z : f.mesh.position.z - f.offZ;
      const k = Math.min(1, f.t);
      // Toward the middle along the ground, and the axis it tips about.
      const d = Math.hypot(f.offX, f.offZ) || 1;
      const inX = -f.offX / d;
      const inZ = -f.offZ / d;
      this.fallAxis.set(inZ, 0, -inX);
      // Tipping (accelerating), then over and dropping (under gravity).
      const tip = Math.min(1, k / TIP);
      const drop = Math.max(0, (k - TIP) / (1 - TIP));
      const angle = (TIPPED * tip * tip + (TUMBLED - TIPPED) * drop) * f.tilt;
      this.fallQ.setFromAxisAngle(this.fallAxis, angle);
      // Pivot on the outer edge of its footprint: the base swings in and down.
      const px = f.offX - inX * f.half;
      const pz = f.offZ - inZ * f.half;
      up.set(inX * f.half, 0, inZ * f.half).applyQuaternion(this.fallQ);
      const sink = drop * drop * (f.h * 1.4 + 3);
      f.mesh.position.set(cx + px + up.x + inX * drop * f.half, f.y0 + up.y - sink, cz + pz + up.z + inZ * drop * f.half);
      this.fallYaw.setFromAxisAngle(this.yAxis, f.rot);
      f.mesh.quaternion.copy(this.fallQ).multiply(this.fallYaw);
      if (f.t >= 1) {
        this.scene.remove(f.mesh);
        if (f.ownMaterial) (f.mesh.material as THREE.Material).dispose();
        this.fallers.splice(i, 1);
      }
    }
  }

  private stepBuilt(dt: number): void {
    for (const b of this.built.values()) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / b.time);
      // Up with a little overshoot, then settled.
      const k = b.t;
      const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      b.mesh.scale.y = b.t >= 1 || this.reducedMotion ? 1 : Math.max(0.02, Math.min(1.04, ease));
    }
  }

  private holeAt(id: number): Hole | undefined {
    return this.lastWorld.holes[id];
  }
}
