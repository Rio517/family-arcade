import type { Object3D } from 'three';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type ShapeKind = 'box' | 'sphere' | 'cylinder' | 'hull';

/** Which engine is running: Rapier, or the ballistic fallback used when Rapier could not load. */
export type Backend = 'rapier' | 'ballistic';

export interface PhysicsOptions {
  /** Metres per second squared. A number is gravity along y (default -9.81); or pass a vector. */
  gravity?: number | Vec3;
  /** Seconds per physics step (default 1/60). */
  fixedStep?: number;
  /** Most steps one `step(dt)` may run; a longer frame is cut short instead of spiralling (default 4). */
  maxSubsteps?: number;
  /** Most bodies alive at once (default 128). At the cap the oldest resting body is removed, else the oldest body. */
  maxBodies?: number;
  /** Things settle fast: heavy damping, almost no bounce, put to rest early. */
  reducedMotion?: boolean;
  /** Called when the body cap removes a body, so the game can hide or recycle its object. */
  onEvict?: (body: PhysicsBody) => void;
  /** Give up on Rapier and use the fallback if it has not loaded after this many ms (default 8000). */
  initTimeoutMs?: number;
  /** Load Rapier yourself (also how tests force a failure). Default: a dynamic import of `@dimforge/rapier3d-compat`. */
  loadRapier?: () => Promise<unknown>;
  /** Called once if Rapier failed to load and the fallback took over. */
  onFallback?: (error: unknown) => void;
}

export interface BodyOptions {
  /** Default 'box'. The size comes from the object's own bounds; 'hull' uses its vertices. */
  shape?: ShapeKind;
  /** Kilograms (default 1). Only matters between bodies. */
  mass?: number;
  /** Restitution 0..1 (default 0.3). */
  bounce?: number;
  /** Friction 0..1+ (default 0.6). */
  friction?: number;
  /** Starting velocity, metres per second. */
  velocity?: Partial<Vec3>;
  /** Starting spin, radians per second about each axis. */
  spin?: Partial<Vec3>;
  /** Full size to use instead of measuring the object (a plain Object3D stands in for an instanced mesh). */
  size?: Partial<Vec3>;
  /** Continuous collision for thin, fast things such as coins (default: on when the thinnest side is under 4 cm). */
  ccd?: boolean;
}

/** A box for `addStatic`: an object (its world bounds are used), or an explicit centre, full size and optional turn. */
export type StaticBox =
  | Object3D
  | { center: Vec3; size: Vec3; quaternion?: { x: number; y: number; z: number; w: number } };

export interface PhysicsBody {
  readonly object: Object3D;
  /** True while the body is at rest. */
  readonly asleep: boolean;
  /** True once removed (by you, by the cap, or by `dispose`). */
  readonly removed: boolean;
  /** A push in kg*m/s, which also wakes the body. */
  applyImpulse(x: number, y: number, z: number): void;
  /** Take it out of the simulation; its object keeps the last pose written. */
  remove(): void;
}

export interface PhysicsStats {
  backend: Backend;
  bodies: number;
  asleep: number;
  /** Rigid-body steps run by the last `step(dt)`. */
  steps: number;
}

export interface PhysicsWorld {
  readonly backend: Backend;
  readonly reducedMotion: boolean;
  /** Bodies alive now. */
  readonly bodyCount: number;
  /** True when every body is at rest (a game can stop calling `step`). */
  readonly allAsleep: boolean;
  /** A flat, endless floor with its top at `y`. */
  addGround(y: number): void;
  /** A fixed box (a tray wall, a crate you do not want to move). */
  addStatic(box: StaticBox): void;
  addBody(object: Object3D, options?: BodyOptions): PhysicsBody;
  /** Advance by `dt` seconds of wall time: runs fixed steps and writes interpolated poses to each object. */
  step(dt: number): void;
  stats(): PhysicsStats;
  /** Remove every body, freeing the engine. The world is unusable afterwards. */
  dispose(): void;
}
