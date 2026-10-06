import { BoxGeometry, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import { BallisticEngine } from './ballistic';
import type { BodySpec, Engine, EngineBody, Pose } from './engine';
import { measure } from './measure';
import { RapierEngine } from './rapier';
import type { Rapier } from './rapier';
import type {
  Backend,
  BodyOptions,
  PhysicsBody,
  PhysicsOptions,
  PhysicsStats,
  PhysicsWorld,
  StaticBox,
  Vec3,
} from './types';

const Q_IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/**
 * Normal motion uses Rapier's own sleeping only: a body is drawn as asleep exactly when Rapier says it sleeps.
 * Reduced motion adds a kit rule: a body that has been slow for `QUIET_TIME_REDUCED` seconds is put to rest
 * (and to sleep in Rapier) once every body touching it is slow too.
 */
const QUIET_SPEED = 0.03;
const QUIET_TIME_REDUCED = 0.15;
/** Reduced motion: after this long a slow body is put to rest, so nothing keeps rolling or jittering. */
const SETTLE_AGE_REDUCED = 1.2;
const SETTLE_SPEED_REDUCED = 0.6;
/** Reduced motion limits. */
const REDUCED_BOUNCE = 0.06;
const REDUCED_LIN_DAMP = 1.6;
const REDUCED_ANG_DAMP = 6;

class Entry implements PhysicsBody {
  prev = new Float64Array(7);
  cur = new Float64Array(7);
  asleep = false;
  /** Awake (or just woke) state not yet written to the object. */
  dirty = true;
  removed = false;
  quiet = 0;
  age = 0;
  constructor(
    readonly object: Object3D,
    readonly eb: EngineBody,
    readonly seq: number,
    private readonly owner: World,
  ) {}
  applyImpulse(x: number, y: number, z: number): void {
    if (this.removed) return;
    this.eb.impulse(x, y, z);
    this.wake();
  }
  wake(): void {
    if (this.removed) return;
    this.eb.wake();
    this.asleep = false;
    this.quiet = 0;
    this.dirty = true;
    this.prev.set(this.cur);
  }
  remove(): void {
    this.owner.removeEntry(this);
  }
}

function resolveGravity(g: number | Vec3 | undefined): Vec3 {
  if (typeof g === 'number') return { x: 0, y: g, z: 0 };
  return g ? { x: g.x, y: g.y, z: g.z } : { x: 0, y: -9.81, z: 0 };
}

class World implements PhysicsWorld {
  private entries: Entry[] = [];
  private readonly byBody = new Map<EngineBody, Entry>();
  private acc = 0;
  private seq = 0;
  private steps = 0;
  private disposed = false;
  private readonly fixedStep: number;
  private readonly maxSubsteps: number;
  private readonly maxBodies: number;

  constructor(
    private readonly engine: Engine,
    readonly backend: Backend,
    private readonly opts: PhysicsOptions,
  ) {
    this.fixedStep = opts.fixedStep && opts.fixedStep > 0 ? opts.fixedStep : 1 / 60;
    this.maxSubsteps = Math.max(1, Math.floor(opts.maxSubsteps ?? 4));
    this.maxBodies = Math.max(1, Math.floor(opts.maxBodies ?? 128));
  }

  get reducedMotion(): boolean {
    return !!this.opts.reducedMotion;
  }

  get bodyCount(): number {
    return this.entries.length;
  }

  get allAsleep(): boolean {
    for (let i = 0; i < this.entries.length; i++) if (!this.entries[i].asleep) return false;
    return true;
  }

  /**
   * Runs a throwaway World (the same class and engine kind) through addStatic, addBody with every shape,
   * a burst of bodies, several steps with sync, impulses and remove, then disposes it, so the kit's JS
   * path and Rapier are warm before the first real spill. It never touches this world: bodies, poses,
   * sleeping, the step accumulator and `bodyCount` are unchanged. Call it after the static colliders are
   * in (during a countdown or loading screen); `createPhysics` already calls it once.
   */
  warmUp(): void {
    if (!this.disposed) this.warmScratch();
  }

  private warmScratch(): void {
    const engine = this.engine.scratch();
    if (!engine) return;
    const w = new World(engine, this.backend, {
      maxBodies: 16,
      reducedMotion: this.opts.reducedMotion,
      fixedStep: this.fixedStep,
      maxSubsteps: this.maxSubsteps,
    });
    try {
      w.addGround(0);
      w.addStatic({ center: { x: 1, y: 0.25, z: 0 }, size: { x: 0.6, y: 0.5, z: 0.6 } });
      w.addStatic(new Mesh(new BoxGeometry(0.6, 0.5, 0.6)));
      const box = new BoxGeometry(0.2, 0.2, 0.2);
      const hull = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
      const kinds = ['box', 'sphere', 'cylinder', 'hull', 'box', 'box'] as const;
      const made: PhysicsBody[] = [];
      const spawn = (kind: (typeof kinds)[number], i: number): void => {
        const m = kind === 'hull' ? hull : new Mesh(box);
        m.position.set((i % 3) * 0.05, 0.2 + i * 0.25, 0);
        made.push(w.addBody(m, { shape: kind, mass: 1, bounce: 0.3, velocity: { x: 0.1 }, spin: { x: 1 }, ccd: i === 5 }));
      };
      kinds.forEach(spawn);
      for (let i = 0; i < 12; i++) spawn(kinds[i % kinds.length], i + 6); // a burst, as a spill makes
      for (let i = 0; i < 6; i++) w.step(this.fixedStep);
      made[0].applyImpulse(0, 1, 0);
      made[1].wake();
      w.stats();
      made[2].remove();
      made[3].remove();
    } finally {
      w.dispose();
    }
  }

  addGround(y: number): void {
    this.engine.addGround(y);
  }

  addStatic(box: StaticBox): void {
    if (box instanceof Object3D) {
      const b = measureWorldBox(box);
      this.engine.addStaticBox(b.center, b.half, b.quaternion);
      return;
    }
    const s = box.size;
    this.engine.addStaticBox(box.center, { x: s.x / 2, y: s.y / 2, z: s.z / 2 }, box.quaternion ?? Q_IDENTITY);
  }

  addBody(object: Object3D, options: BodyOptions = {}): PhysicsBody {
    if (this.disposed) throw new Error('physics world was disposed');
    if (this.entries.length >= this.maxBodies) this.evictOne();
    const spec = this.specFor(object, options);
    const entry = new Entry(object, this.engine.create(spec), this.seq++, this);
    entry.eb.read(entry.cur);
    entry.prev.set(entry.cur);
    this.entries.push(entry);
    this.byBody.set(entry.eb, entry);
    return entry;
  }

  private specFor(object: Object3D, options: BodyOptions): BodySpec {
    const m = measure(object, options);
    const reduced = this.reducedMotion;
    return {
      ...m,
      mass: Math.max(options.mass ?? 1, 1e-3),
      bounce: Math.min(options.bounce ?? 0.3, reduced ? REDUCED_BOUNCE : 1),
      friction: Math.max(options.friction ?? 0.6, reduced ? 0.8 : 0),
      linDamp: reduced ? REDUCED_LIN_DAMP : 0.1,
      angDamp: reduced ? REDUCED_ANG_DAMP : 3,
      ccd: options.ccd ?? Math.min(m.half.x, m.half.y, m.half.z) * 2 < 0.04,
      velocity: { x: options.velocity?.x ?? 0, y: options.velocity?.y ?? 0, z: options.velocity?.z ?? 0 },
      spin: { x: options.spin?.x ?? 0, y: options.spin?.y ?? 0, z: options.spin?.z ?? 0 },
    };
  }

  /** The cap: the oldest resting body goes, or the oldest body if all are moving. */
  private evictOne(): void {
    let victim: Entry | null = null;
    for (const e of this.entries) if (e.asleep && (!victim || e.seq < victim.seq)) victim = e;
    victim ??= this.entries[0] ?? null;
    if (!victim) return;
    this.removeEntry(victim);
    this.opts.onEvict?.(victim);
  }

  removeEntry(e: Entry): void {
    if (e.removed) return;
    e.removed = true;
    const i = this.entries.indexOf(e);
    if (i >= 0) this.entries.splice(i, 1);
    this.byBody.delete(e.eb);
    if (!this.disposed) e.eb.remove();
  }

  step(dt: number): void {
    if (this.disposed) return;
    const h = this.fixedStep;
    this.acc += Math.min(Math.max(dt, 0), h * this.maxSubsteps);
    const entries = this.entries;
    const reduced = this.reducedMotion;
    const quietTime = QUIET_TIME_REDUCED;
    let steps = 0;
    while (this.acc >= h) {
      this.acc -= h;
      steps++;
      for (let i = 0; i < entries.length; i++) if (!entries[i].asleep) entries[i].prev.set(entries[i].cur);
      this.engine.step(h);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.asleep) {
          // Something may have woken it.
          if (!e.eb.isSleeping()) {
            e.asleep = false;
            e.dirty = true;
            e.quiet = 0;
            e.prev.set(e.cur);
          } else continue;
        }
        e.eb.read(e.cur);
        e.age += h;
        if (e.eb.isSleeping()) {
          e.asleep = true;
          e.prev.set(e.cur);
          e.dirty = true;
          continue;
        }
        const c = e.cur;
        const p = e.prev;
        const speed = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) / h;
        const turn = 1 - Math.abs(c[3] * p[3] + c[4] * p[4] + c[5] * p[5] + c[6] * p[6]);
        const late = reduced && e.age > SETTLE_AGE_REDUCED;
        const slow = speed < (late ? SETTLE_SPEED_REDUCED : QUIET_SPEED) && turn < 2e-6 * (late ? 100 : 1);
        e.quiet = slow ? e.quiet + h : 0;
      }
      if (reduced) this.restQuiet(quietTime);
    }
    this.steps = steps;
    const a = this.acc / h;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.asleep) {
        if (e.dirty) {
          write(e.object, e.cur, e.cur, 0);
          e.dirty = false;
        }
        continue;
      }
      write(e.object, e.prev, e.cur, a);
      e.dirty = true;
    }
  }

  /**
   * Reduced motion only. Rests a group of touching bodies together, and only when every awake body in
   * the group has been slow long enough; the group is put to sleep in Rapier too. A body that is slow
   * while something touching it still moves is never rested.
   */
  private restQuiet(quietTime: number): void {
    const entries = this.entries;
    const seen = new Set<Entry>();
    const group: Entry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const root = entries[i];
      if (root.asleep || seen.has(root)) continue;
      group.length = 0;
      group.push(root);
      seen.add(root);
      let calm = true;
      for (let k = 0; k < group.length; k++) {
        const e = group[k];
        if (e.quiet < quietTime) calm = false;
        e.eb.touching((other) => {
          const o = this.byBody.get(other);
          if (o && !o.asleep && !seen.has(o)) {
            seen.add(o);
            group.push(o);
          }
        });
      }
      if (!calm) continue;
      for (const e of group) {
        e.eb.sleep();
        e.asleep = true;
        e.prev.set(e.cur);
        e.dirty = true;
      }
    }
  }

  stats(): PhysicsStats {
    let asleep = 0;
    for (const e of this.entries) if (e.asleep) asleep++;
    return { backend: this.backend, bodies: this.entries.length, asleep, steps: this.steps };
  }

  dispose(): void {
    if (this.disposed) return;
    for (const e of this.entries) e.removed = true;
    this.entries = [];
    this.disposed = true;
    this.engine.dispose();
  }
}

function write(o: Object3D, a: Pose, b: Pose, t: number): void {
  o.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  // Normalised lerp of the two quaternions (short way round).
  const s = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6] < 0 ? -1 : 1;
  const x = a[3] + (s * b[3] - a[3]) * t;
  const y = a[4] + (s * b[4] - a[4]) * t;
  const z = a[5] + (s * b[5] - a[5]) * t;
  const w = a[6] + (s * b[6] - a[6]) * t;
  const n = 1 / (Math.hypot(x, y, z, w) || 1);
  o.quaternion.set(x * n, y * n, z * n, w * n);
}

function measureWorldBox(o: Object3D): { center: Vec3; half: Vec3; quaternion: { x: number; y: number; z: number; w: number } } {
  const m = measure(o, {});
  const off = new Vector3(m.offset.x, m.offset.y, m.offset.z).applyQuaternion(new Quaternion(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w));
  return {
    quaternion: m.quaternion,
    center: { x: m.position.x + off.x, y: m.position.y + off.y, z: m.position.z + off.z },
    half: m.half,
  };
}

function isRapier(m: unknown): m is Rapier {
  return !!m && typeof (m as Rapier).World === 'function';
}

/**
 * Makes a physics world. Rapier is loaded here, lazily, so a game that never calls this pays nothing.
 * If Rapier cannot load (no WASM, blocked, timed out) the world still works with a simple ballistic
 * fallback; check `world.backend`.
 */
export async function createPhysics(options: PhysicsOptions = {}): Promise<PhysicsWorld> {
  const gravity = resolveGravity(options.gravity);
  const h = options.fixedStep && options.fixedStep > 0 ? options.fixedStep : 1 / 60;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const load = options.loadRapier ?? (() => import('@dimforge/rapier3d-compat'));
    const timeout = options.initTimeoutMs ?? 8000;
    // One budget for the download and Rapier's start-up (WASM init) together.
    const start = (async (): Promise<Rapier> => {
      const mod = await load();
      const ns = mod as { default?: unknown };
      const R = isRapier(mod) ? mod : isRapier(ns.default) ? ns.default : null;
      if (!R) throw new Error('Rapier module has no World');
      await R.init();
      return R;
    })();
    start.catch(() => {}); // a late failure after the timeout is not an unhandled rejection
    const R = await Promise.race([
      start,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Rapier load timed out')), timeout);
      }),
    ]);
    const world = new World(new RapierEngine(R, gravity, h), 'rapier', options);
    if (options.warmUp !== false) world.warmUp();
    return world;
  } catch (error) {
    options.onFallback?.(error);
    return new World(new BallisticEngine(gravity), 'ballistic', options);
  } finally {
    clearTimeout(timer);
  }
}

/** A small seeded random generator (mulberry32), so a game or demo can scatter things the same way every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
