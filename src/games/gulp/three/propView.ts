/**
 * The city's things as drawn. They stand in batches (one InstancedMesh per
 * model per area of the map), so a Region map with thousands of things stays
 * quick and the areas off screen are skipped. Things put up during a round
 * go into batches of their own, made as they are needed, and rise there; a
 * slot let go by an eaten one is used again. A swallowed thing tips into its hole
 * (`swallow`, `stepFallers`, and fall.ts for the way it moves), and a
 * swallowed ship's containers spill off on their own (`stepCargo`); one too
 * big to swallow rocks on the rim of the child's hole (`wobble`); one in the
 * way of the camera goes see-through (see seeThrough.ts).
 */
import * as THREE from 'three';
import { FIT, KINDS, isSite, type Prop } from '../domain/catalog';
import { BUILD_TIME, canEat, propsNear, type Hole, type World } from '../domain/world';
import { blobTexture } from './canvasTextures';
import { emptySpill, fallPose, noise, spillPose, startFall, startSpill, type Fall, type FallPose, type Spill } from './fall';
import { groundAt } from './ground';
import { containerModel, hullModel, modelOf } from './models';
import { CONTAINER, shipCargo } from './park';
import { SeeThrough } from './seeThrough';

/**
 * How long a swallowed thing takes to go, in seconds: a cone is gone in half
 * a second, a skyscraper topples for over a second and a half.
 */
const fallTime = (size: number) => Math.min(1.6, Math.max(0.5, 0.45 + size * 0.07));
/**
 * A swallowed ship's containers slide off its deck one after another over
 * this share of the ship's fall (each after `CARGO_FIRST` of it), and each
 * spills into the mouth over about a second.
 */
const CARGO_FIRST = 0.04;
const CARGO_SPREAD = 0.3;
const SPILL_TIME = 1.0;
/** Buildings from this tier up can hide the child's hole, and fade. */
const TALL_TIER = 5;
/**
 * Things are batched per square of this many units (four blocks), so the
 * squares off screen are skipped while the hole is small. Two blocks made
 * batches of one or two things each, and a giant's view drew too many.
 */
const CHUNK = 216;
/** Things that sit lower than the ground: a ship floats in the sea, below the quay. */
const SINK: Partial<Record<Prop['kind'], number>> = { ship: -2 };
/** Small street furniture: no shadows, to save the shadow pass drawing hundreds of them. */
const CLUTTER: ReadonlySet<string> = new Set(['lamp', 'bin', 'hydrant', 'planter', 'cone', 'bike', 'mailbox']);
/** Where a batch puts a thing it is not showing. */
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
/** Slots in each batch of things put up during a round. */
const POOL_SIZE = 32;
/** How far above and around its square a batch's tallest thing can reach, for culling. */
const POOL_REACH = 100;
/**
 * The tiny things that go when the camera is far up (about level 15): people,
 * street lamps and the street clutter a giant takes without a fuss. Trees stay.
 */
const isTiny = (kind: Prop['kind']): boolean => kind === 'lamp' || (KINDS[kind].tier <= 1 && !isSite(kind));

/**
 * A batch's own handle on a model many batches share: the same vertex data
 * (uploaded to the graphics card once), in a geometry of its own, so the
 * renderer keeps each batch's attribute setup instead of redoing it for every
 * batch that draws the same model.
 */
function ownCopy(model: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(model.attributes)) g.setAttribute(name, attribute);
  g.setIndex(model.index);
  for (const group of model.groups) g.addGroup(group.start, group.count, group.materialIndex);
  return g;
}

/** A batch for things put up during a round, and its slots let go. */
interface Pool {
  mesh: THREE.InstancedMesh;
  free: number[];
}

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
  /** A vehicle's soft shadow patch, drawn with the same matrix. */
  blob?: THREE.InstancedMesh;
  /** The batch it was given when it was put up during the round. */
  pool?: Pool;
}

interface Faller {
  mesh: THREE.Mesh;
  hole: number;
  /** 0..1 through the fall, and how long the whole fall takes. */
  t: number;
  time: number;
  /** How it falls (see fall.ts): where it stood from the hole's middle, so the fall follows a moving hole. */
  fall: Fall;
  /** The mouth's size when it went in, for when the hole itself is gone. */
  r: number;
  /** Where the hole's middle was last seen. */
  cx: number;
  cz: number;
  /** A see-through copy has its own material to free. */
  ownMaterial: boolean;
  /** The level it stood at (a block stands a kerb above the road; a ship floats below the quay). */
  y0: number;
}

/** A container on a swallowed ship: riding on the deck, then spilling off on its own. */
interface CargoBox {
  mesh: THREE.InstancedMesh;
  index: number;
  /** Its middle on the ship, in the ship's own frame. */
  local: THREE.Vector3;
  /** Which side of the deck it stands on: it slides off that way. */
  side: number;
  /** When it slides off, as a share of the ship's fall. */
  leaveAt: number;
  /** Its spill once it has left the deck (see fall.ts), whether it has, how far into it (0..1), and how long it takes. */
  spill: Spill;
  off: boolean;
  u: number;
  time: number;
}

/** A swallowed ship's containers, one batch per colour. */
interface Cargo {
  /** The ship they ride on until each spills off; null once the ship is gone. */
  ship: Faller | null;
  meshes: THREE.InstancedMesh[];
  boxes: CargoBox[];
  /** Those still falling. */
  left: number;
  /** For a stagger and a tumble of their own, the same every time. */
  seed: number;
  /** The hole they fall into, where its middle was last seen and how big it was, and the level the ship floated at. */
  hole: number;
  cx: number;
  cz: number;
  r: number;
  y0: number;
}

/** Something put up during the round, rising: `t` runs 0..1 over `time` seconds. */
interface Rising {
  t: number;
  time: number;
}

export class PropView {
  private slots = new Map<number, Slot>();
  private batches: Array<{ mesh: THREE.InstancedMesh; kind: Prop['kind']; casts: boolean }> = [];
  /** The soft dark patches under vehicles, a batch beside each vehicle batch. */
  private blobs: THREE.InstancedMesh[] = [];
  /** Batches for things put up during the round, by area and model. */
  private pools = new Map<string, Pool[]>();
  private rising = new Map<number, Rising>();
  private riseMatrix = new THREE.Matrix4();
  private riseScale = new THREE.Matrix4();
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
  /** Where a falling thing or container is drawn this frame (see fall.ts). */
  private pose: FallPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  private boxAt = new THREE.Vector3();
  private boxScale = new THREE.Vector3(1, 1, 1);
  private boxMatrix = new THREE.Matrix4();
  /** Swallowed ships' containers, spilling. */
  private cargo: Cargo[] = [];
  /** The world the view was last stepped with, for where a swallowing hole stands. */
  private lastWorld: World;

  constructor(
    private scene: THREE.Scene,
    /** The one flat-shaded, vertex-coloured material every model shares, for the batches. */
    private material: THREE.MeshStandardMaterial,
    /** The same look for things drawn one by one: falling into a hole (see the scene). */
    private looseMaterial: THREE.MeshStandardMaterial,
    world: World,
    private reducedMotion: boolean,
  ) {
    this.lastWorld = world;
    this.seeThrough = new SeeThrough(scene, material, reducedMotion, (p, shown) => this.setShown(p, shown));
    this.buildBatches(world);
  }

  /** A tiny thing a giant took without a fuss: hide it where it stood, no fall. */
  vanish(p: Prop): void {
    this.setShown(p, false);
    this.release(p);
  }

  /**
   * A thing leaves the city: hide it where it stood, and start a copy
   * falling. A ship falls with a bare deck while its containers spill off
   * one by one (with reduced motion they stay on and fall with it).
   */
  swallow(p: Prop, hole: number): void {
    this.setShown(p, false);
    const ghost = this.seeThrough.take(p.id);
    const rise = this.rising.get(p.id);
    this.release(p);
    const spills = p.kind === 'ship' && !this.reducedMotion;
    const model = spills ? hullModel(p.variant) : modelOf(p);
    let mesh: THREE.Mesh;
    let ownMaterial = false;
    if (ghost) {
      mesh = ghost;
      mesh.geometry = model;
      ownMaterial = true;
    } else {
      mesh = new THREE.Mesh(model, this.looseMaterial);
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const y0 = (SINK[p.kind] ?? 0) + this.groundOf(p);
    mesh.position.set(p.x, y0, p.z);
    mesh.rotation.set(0, p.rot, 0);
    const riseY = rise ? this.risen(rise.t) : 1;
    mesh.scale.set(1, riseY, 1);
    const info = KINDS[p.kind];
    const h = this.holeAt(hole);
    const r = h?.r ?? Math.max(info.w, info.d);
    const cx = h?.x ?? p.x;
    const cz = h?.z ?? p.z;
    const fall = startFall(p.x - cx, p.z - cz, info.w, info.d, info.h * p.hScale * riseY, p.rot, r);
    const faller: Faller = { mesh, hole, t: 0, time: fallTime(p.size), fall, r, cx, cz, ownMaterial, y0 };
    this.fallers.push(faller);
    if (spills) this.spillCargo(p, faller);
  }

  /**
   * Something new goes up. A construction site pops up out of the ground; a
   * tower's frame climbs out more slowly with its own scaffolding and crane;
   * a finished building rises out of the ground over a few seconds, with a
   * little overshoot, while dust puffs out round its base (see the scene).
   */
  raise(p: Prop): void {
    this.slots.set(p.id, this.slotFor(p));
    const time = p.kind === 'tallsite' ? 2.5 : isSite(p.kind) ? 0.6 : BUILD_TIME;
    if (!this.reducedMotion) this.rising.set(p.id, { t: 0, time });
    this.setShown(p, true);
    if (!isSite(p.kind)) this.seeThrough.track(p);
  }

  /** Something that was always there joins the city (a police car that has parked): no rising out of the ground. */
  appear(p: Prop): void {
    this.slots.set(p.id, this.slotFor(p));
    this.setShown(p, true);
    this.seeThrough.track(p);
  }

  /** Take away something built during the round (a site whose building is done). */
  clear(p: Prop): void {
    this.setShown(p, false);
    this.release(p);
    this.seeThrough.untrack(p);
  }

  /**
   * Show or hide the tiny things (see `isTiny`) and the patches under
   * vehicles: they go when the camera is high above them. From there a
   * car's patch hardly shows, but each batch of patches is still a draw.
   */
  showTiny(shown: boolean): void {
    for (const b of this.batches) if (isTiny(b.kind)) b.mesh.visible = shown;
    for (const b of this.blobs) b.visible = shown;
  }

  /** Show a thing again where it stands (it grew back). */
  show(p: Prop): void {
    this.setShown(p, true);
  }

  /** Things falling into holes, and buildings rising. */
  step(world: World, dt: number): void {
    this.lastWorld = world;
    this.stepFallers(world, dt);
    this.stepCargo(world, dt);
    this.stepRising(dt);
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
      else this.place(p, w.matrix);
    }
  }

  /** Swap whatever stands between the camera at `eye` and the child's hole for a see-through copy. */
  fadeInTheWay(world: World, me: Hole, eye: THREE.Vector3, time: number, dt: number): void {
    this.seeThrough.update(world, me, eye, time, dt);
  }

  /** Small things cast no shadow once the camera is high above them (a hole of radius `r`). */
  castShadows(r: number): void {
    const small = r > 14;
    for (const b of this.batches) b.mesh.castShadow = b.casts && !(small && KINDS[b.kind].tier <= 2);
  }

  dispose(): void {
    this.blobTex.dispose();
    this.blobMat.dispose();
    for (const g of this.blobGeos.values()) g.dispose();
    this.seeThrough.dispose();
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
      const mesh = new THREE.InstancedMesh(ownCopy(modelOf(list[0])), this.material, list.length);
      // Vehicles cast no sun shadow: small, low shadows came out with a gap
      // under the wheels. They sit on a soft dark patch instead, which is
      // steadier and cheaper to draw.
      const blob = vehicle ? new THREE.InstancedMesh(ownCopy(this.blobGeometry(kind)), this.blobMat, list.length) : undefined;
      // A batch never moves, only its things do: no need to work out where it is every frame.
      mesh.matrixAutoUpdate = false;
      if (blob) blob.matrixAutoUpdate = false;
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
        this.blobs.push(blob);
      }
      // Small street clutter casts no shadow either: hundreds of them, for little look.
      const casts = !vehicle && !CLUTTER.has(kind);
      mesh.castShadow = casts;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.batches.push({ mesh, kind, casts });
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

  /**
   * A slot for something put up during the round, in a batch for its model
   * and square of the map: a free one in a batch already made, or a new batch.
   */
  private slotFor(p: Prop): Slot {
    const geo = modelOf(p);
    const cx = Math.floor(p.x / CHUNK);
    const cz = Math.floor(p.z / CHUNK);
    const key = `${cx}:${cz}:${geo.uuid}`;
    let list = this.pools.get(key);
    if (!list) {
      list = [];
      this.pools.set(key, list);
    }
    let pool = list.find((q) => q.free.length > 0 || q.mesh.count < POOL_SIZE);
    if (!pool) {
      const mesh = new THREE.InstancedMesh(ownCopy(geo), this.material, POOL_SIZE);
      mesh.count = 0;
      mesh.matrixAutoUpdate = false;
      // A building site is low: no shadow to draw.
      const casts = !isSite(p.kind);
      mesh.castShadow = casts;
      mesh.receiveShadow = true;
      // Everything in it stands in one square: bound it by the square, not by its slots.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK), CHUNK * Math.SQRT1_2 + POOL_REACH);
      this.scene.add(mesh);
      pool = { mesh, free: [] };
      list.push(pool);
      this.batches.push({ mesh, kind: p.kind, casts });
    }
    const index = pool.free.pop() ?? pool.mesh.count++;
    const d = this.dummy;
    d.position.set(p.x, (SINK[p.kind] ?? 0) + this.groundOf(p), p.z);
    d.rotation.set(0, p.rot, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    return { mesh: pool.mesh, index, matrix: d.matrix.clone(), pool };
  }

  /** Let go of the slot of something put up during the round (it was eaten or replaced). */
  private release(p: Prop): void {
    this.rising.delete(p.id);
    const slot = this.slots.get(p.id);
    if (!slot?.pool) return;
    slot.pool.free.push(slot.index);
    this.slots.delete(p.id);
  }

  /** How tall a thing rising out of the ground stands, 0..1 through its rise: up with a little overshoot, then settled. */
  private risen(t: number): number {
    if (t >= 1 || this.reducedMotion) return 1;
    return Math.max(0.02, Math.min(1.04, 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)));
  }

  /** A slot's matrix squashed to how far it has risen. */
  private risenMatrix(slot: Slot, t: number): THREE.Matrix4 {
    return this.riseMatrix.copy(slot.matrix).multiply(this.riseScale.makeScale(1, this.risen(t), 1));
  }

  private setShown(p: Prop, shown: boolean): void {
    const slot = this.slots.get(p.id);
    if (!slot) return;
    const rise = this.rising.get(p.id);
    slot.mesh.setMatrixAt(slot.index, !shown ? HIDDEN : rise ? this.risenMatrix(slot, rise.t) : slot.matrix);
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

  private place(p: Prop, matrix: THREE.Matrix4): void {
    const slot = this.slots.get(p.id);
    // A thing still rising does not rock yet.
    if (!slot || this.rising.has(p.id)) return;
    slot.mesh.setMatrixAt(slot.index, matrix);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * A swallowed thing tips into its hole and drops out of sight, following
   * the hole if it moves (see `fallPose` in fall.ts for the way it goes).
   * The ground outside the mouth hides whatever is below it, so it seems to
   * fall into the hole, not through the street; it slides in along the
   * throat's wall when it must, so none of it is cut off.
   */
  private stepFallers(world: World, dt: number): void {
    const pose = this.pose;
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt / f.time;
      const h = world.holes[f.hole];
      if (h) {
        f.cx = h.x;
        f.cz = h.z;
        f.r = h.r;
      }
      fallPose(f.fall, Math.min(1, f.t), f.r, pose);
      f.mesh.position.set(f.cx + pose.position.x, f.y0 + pose.position.y, f.cz + pose.position.z);
      f.mesh.quaternion.copy(pose.quaternion);
      if (f.t >= 1) {
        this.scene.remove(f.mesh);
        if (f.ownMaterial) (f.mesh.material as THREE.Material).dispose();
        this.fallers.splice(i, 1);
        for (const c of this.cargo) if (c.ship === f) c.ship = null;
      }
    }
  }

  /**
   * Load a swallowed ship's containers onto its falling hull: one batch per
   * colour (a handful of draws for the lot, in the batches' own shader),
   * each container riding on the deck until its turn to slide off. The
   * stacks go in no set order, each from the top down.
   */
  private spillCargo(p: Prop, ship: Faller): void {
    const boxes = shipCargo(p.variant);
    const byColour = new Map<number, number>();
    for (const b of boxes) byColour.set(b.color, (byColour.get(b.color) ?? 0) + 1);
    const meshes = new Map<number, THREE.InstancedMesh>();
    for (const [color, count] of byColour) {
      const mesh = new THREE.InstancedMesh(containerModel(color), this.material, count);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // They move every frame and stay over the mouth: no bounds to keep up, and no shadows to draw.
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      meshes.set(color, mesh);
      this.scene.add(mesh);
    }
    const seed = p.id * 7919;
    const { hole, cx, cz, r, y0 } = ship;
    const cargo: Cargo = { ship, meshes: [...meshes.values()], boxes: [], left: boxes.length, seed, hole, cx, cz, r, y0 };
    const stacks = [...new Set(boxes.map((b) => `${b.x}:${b.z}`))];
    for (const b of boxes) {
      const mesh = meshes.get(b.color)!;
      const stack = stacks.indexOf(`${b.x}:${b.z}`);
      const above = boxes.filter((o) => o.x === b.x && o.z === b.z && o.y > b.y).length;
      cargo.boxes.push({
        mesh,
        index: mesh.count++,
        local: new THREE.Vector3(b.x, b.y, b.z),
        side: b.x < 0 ? -1 : 1,
        leaveAt: CARGO_FIRST + CARGO_SPREAD * (0.8 * noise(seed, stack) + 0.1 * above),
        spill: emptySpill(CONTAINER),
        off: false,
        u: 0,
        time: SPILL_TIME * (0.85 + 0.3 * noise(seed, 100 + cargo.boxes.length)),
      });
    }
    this.cargo.push(cargo);
    this.moveCargo(cargo, this.lastWorld, 0);
  }

  /** Swallowed ships' containers, riding and spilling; each ship's batches are freed once all of its containers are gone. */
  private stepCargo(world: World, dt: number): void {
    for (let i = this.cargo.length - 1; i >= 0; i--) {
      const c = this.cargo[i];
      this.moveCargo(c, world, dt);
      if (c.left > 0) continue;
      for (const m of c.meshes) {
        this.scene.remove(m);
        m.dispose();
      }
      this.cargo.splice(i, 1);
    }
  }

  /**
   * Each container rides on its ship's deck (tipping with it) until its
   * turn comes, then slides off the side, hops, tumbles and
   * drops into the mouth on its own, kept inside the throat like the ship
   * (see `spillPose`).
   */
  private moveCargo(c: Cargo, world: World, dt: number): void {
    const pose = this.pose;
    const h = world.holes[c.hole];
    if (h) {
      c.cx = h.x;
      c.cz = h.z;
      c.r = h.r;
    }
    const ship = c.ship;
    if (ship) ship.mesh.updateMatrix();
    for (let n = 0; n < c.boxes.length; n++) {
      const b = c.boxes[n];
      if (b.u >= 1) continue;
      if (!b.off) {
        if (!ship) {
          // The ship went before this one came off (it never should): it goes with it.
          b.u = 1;
          b.mesh.setMatrixAt(b.index, HIDDEN);
          c.left--;
          continue;
        }
        this.boxAt.copy(b.local).applyMatrix4(ship.mesh.matrix);
        if (ship.t < b.leaveAt) {
          // Riding on the deck, tipping with the ship.
          this.boxMatrix.compose(this.boxAt, ship.mesh.quaternion, ship.mesh.scale);
          b.mesh.setMatrixAt(b.index, this.boxMatrix);
          continue;
        }
        // Its turn: off the side of the deck, from where it is now.
        const rot = ship.fall.rot;
        startSpill(
          b.spill,
          this.boxAt.x - c.cx,
          this.boxAt.y - c.y0,
          this.boxAt.z - c.cz,
          ship.mesh.quaternion,
          Math.cos(rot) * b.side,
          -Math.sin(rot) * b.side,
          c.r,
          c.seed + 31 * n,
        );
        b.off = true;
      }
      b.u = Math.min(1, b.u + dt / b.time);
      spillPose(b.spill, b.u, c.r, pose);
      if (b.u >= 1) {
        b.mesh.setMatrixAt(b.index, HIDDEN);
        c.left--;
        continue;
      }
      this.boxAt.set(c.cx + pose.position.x, c.y0 + pose.position.y, c.cz + pose.position.z);
      this.boxMatrix.compose(this.boxAt, pose.quaternion, this.boxScale);
      b.mesh.setMatrixAt(b.index, this.boxMatrix);
    }
    for (const m of c.meshes) m.instanceMatrix.needsUpdate = true;
  }

  /** Things put up during the round rise out of the ground in their batch slots. */
  private stepRising(dt: number): void {
    for (const [id, rise] of this.rising) {
      rise.t = Math.min(1, rise.t + dt / rise.time);
      const slot = this.slots.get(id);
      // One the camera sees through is drawn as its see-through copy for now.
      if (slot && !this.seeThrough.get(id)) {
        slot.mesh.setMatrixAt(slot.index, rise.t >= 1 ? slot.matrix : this.risenMatrix(slot, rise.t));
        slot.mesh.instanceMatrix.needsUpdate = true;
      }
      if (rise.t >= 1) this.rising.delete(id);
    }
  }

  private holeAt(id: number): Hole | undefined {
    return this.lastWorld.holes[id];
  }
}
