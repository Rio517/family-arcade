/**
 * Tall things standing between the camera and the child's hole, too big for
 * it to swallow, are swapped for see-through copies while they are in the
 * way, so the hole is never lost behind a building.
 */
import * as THREE from 'three';
import { KINDS, type Prop } from '../domain/catalog';
import { canEat, type Hole, type World } from '../domain/world';
import { groundAt } from './ground';
import { modelOf } from './models';

/** How see-through a building standing in front of the child's hole goes: faint, still there. */
const GHOST = 0.3;
/** Something taller than the camera is high would veil the whole screen: fainter still. */
const GHOST_TOWERING = 0.15;
/** Seconds a see-through copy lingers after it was last in the way, so a
 * building doesn't flick between solid and faded at the edge of the view. */
const LINGER = 0.6;
/** Tall things are filed by square of this many units, so each frame only
 * those near the sight lines are checked. */
const CELL = 32;

const cellOf = (v: number): number => Math.floor(v / CELL);
const cellKey = (cx: number, cz: number): number => cx * 65536 + cz;

export class SeeThrough {
  private cells = new Map<number, Prop[]>();
  /** The widest half-footprint filed: how far past a sight line a building can still stand in it. */
  private reach = 0;
  private ghosts = new Map<number, THREE.Mesh>();
  /** When each see-through copy was last needed. */
  private seen = new Map<number, number>();
  private want = new Set<number>();
  private targets = [new THREE.Vector3(), new THREE.Vector3()];
  private rays = [new THREE.Ray(), new THREE.Ray()];
  private far = [0, 0];
  private box = new THREE.Box3();
  private hit = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    /** The city's shared material; each copy gets its own see-through clone. */
    private material: THREE.MeshStandardMaterial,
    private reducedMotion: boolean,
    /** Hides a thing where it is drawn while its copy stands in, and shows it again after. */
    private show: (p: Prop, shown: boolean) => void,
  ) {}

  /** A tall thing that might stand in the way. */
  track(p: Prop): void {
    const info = KINDS[p.kind];
    this.reach = Math.max(this.reach, Math.max(info.w, info.d) / 2);
    const key = cellKey(cellOf(p.x), cellOf(p.z));
    const list = this.cells.get(key);
    if (list) list.push(p);
    else this.cells.set(key, [p]);
  }

  untrack(p: Prop): void {
    const key = cellKey(cellOf(p.x), cellOf(p.z));
    const list = this.cells.get(key);
    if (list) this.cells.set(key, list.filter((t) => t.id !== p.id));
  }

  /** A thing's see-through copy, if it has one. */
  get(id: number): THREE.Mesh | undefined {
    return this.ghosts.get(id);
  }

  /** Hand over a thing's see-through copy (it is being swallowed): the caller now owns it. */
  take(id: number): THREE.Mesh | undefined {
    const ghost = this.ghosts.get(id);
    this.ghosts.delete(id);
    return ghost;
  }

  /** Fade whatever stands between the camera at `eye` and the child's hole. `time` is the scene's clock. */
  update(world: World, me: Hole, eye: THREE.Vector3, time: number, dt: number): void {
    const want = this.want;
    want.clear();
    if (me.alive) this.inTheWay(world, me, eye, want);
    for (const id of want) this.seen.set(id, time);
    // Fade in and out over a quarter of a second rather than snapping.
    const step = this.reducedMotion ? 1 : Math.min(1, dt * 4);
    for (const [id, ghost] of this.ghosts) {
      const mat = ghost.material as THREE.MeshStandardMaterial;
      const keep = want.has(id) || time - (this.seen.get(id) ?? 0) < LINGER;
      const p = world.props.get(id);
      const towering = p ? (KINDS[p.kind].h * p.hScale) / Math.max(1, eye.y) > 0.6 : false;
      const target = keep ? (towering ? GHOST_TOWERING : GHOST) : 1;
      mat.opacity += (target - mat.opacity) * step;
      if (keep || mat.opacity < 0.97) continue;
      this.seen.delete(id);
      this.scene.remove(ghost);
      mat.dispose();
      this.ghosts.delete(id);
      if (p) this.show(p, true);
    }
    for (const id of want) {
      if (this.ghosts.has(id)) continue;
      const p = world.props.get(id);
      if (!p) continue;
      const mat = this.material.clone();
      mat.transparent = true;
      mat.opacity = 1;
      mat.depthWrite = false;
      const ghost = new THREE.Mesh(modelOf(p), mat);
      ghost.position.set(p.x, groundAt(world.city, p.x, p.z), p.z);
      ghost.rotation.y = p.rot;
      ghost.renderOrder = 2;
      // The see-through copy still casts the building's shadow: without it
      // the shadow vanished while faded and popped back late.
      ghost.castShadow = true;
      this.scene.add(ghost);
      this.ghosts.set(id, ghost);
      this.show(p, false);
    }
  }

  /**
   * The tall things crossing the sight lines from the camera to the hole's
   * eyes and the middle of its mouth. Only buildings standing in front of
   * the hole (on the camera's side) count: one behind it never hides the
   * mouth, and letting it fade made it flick on and off as the hole moved
   * along it.
   */
  private inTheWay(world: World, me: Hole, eye: THREE.Vector3, into: Set<number>): void {
    const a = this.targets[0];
    const b = this.targets[1];
    a.set(me.x, 0.5 + me.r * 0.4, me.z - me.r);
    b.set(me.x, 0.3, me.z);
    for (let i = 0; i < 2; i++) {
      const t = this.targets[i];
      this.rays[i].origin.copy(eye);
      this.rays[i].direction.copy(t).sub(eye).normalize();
      this.far[i] = eye.distanceTo(t);
    }
    // A building blocks a sight line only where the line crosses its
    // footprint, so only the squares under the lines (widened by the widest
    // footprint) can hold one.
    const pad = this.reach;
    const cx0 = cellOf(Math.min(eye.x, a.x, b.x) - pad);
    const cx1 = cellOf(Math.max(eye.x, a.x, b.x) + pad);
    const cz0 = cellOf(Math.min(eye.z, a.z, b.z) - pad);
    const cz1 = cellOf(Math.max(eye.z, a.z, b.z) + pad);
    const box = this.box;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const p of list) {
          if (!world.props.has(p.id)) continue;
          // Food stays solid: a building the hole can swallow is what the
          // child is steering for, and must not fade away just before it goes.
          if (canEat(me, p)) continue;
          const info = KINDS[p.kind];
          const half = Math.max(info.w, info.d) / 2;
          if (p.z + half < me.z + me.r * 0.3) continue;
          box.min.set(p.x - half, 0, p.z - half);
          box.max.set(p.x + half, info.h * p.hScale, p.z + half);
          if (this.blocks(0, eye) || this.blocks(1, eye)) into.add(p.id);
        }
      }
    }
  }

  /** Whether sight line `i` meets the current box before it reaches its target. */
  private blocks(i: number, eye: THREE.Vector3): boolean {
    return this.rays[i].intersectBox(this.box, this.hit) !== null && eye.distanceTo(this.hit) < this.far[i] - 0.5;
  }
}
