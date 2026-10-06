import type { ShapeKind, Vec3 } from './types';

/** What an engine needs to know to make one body. All local to the object's origin. */
export interface BodySpec {
  kind: ShapeKind;
  /** Half extents (box, cylinder uses x/z radius and y half-height, sphere uses `radius`). */
  half: Vec3;
  radius: number;
  /** Hull vertices, xyz flat, relative to the object's origin (hull only). */
  points: Float32Array | null;
  /** The shape's centre relative to the object's origin. */
  offset: Vec3;
  mass: number;
  bounce: number;
  friction: number;
  linDamp: number;
  angDamp: number;
  ccd: boolean;
  position: Vec3;
  quaternion: { x: number; y: number; z: number; w: number };
  velocity: Vec3;
  spin: Vec3;
}

/** Pose of an object's origin: x y z, then quaternion x y z w. */
export type Pose = Float64Array;

export interface EngineBody {
  /** Writes the current pose into `out`. */
  read(out: Pose): void;
  isSleeping(): boolean;
  sleep(): void;
  /** Wakes the body for sure (even when an impulse is zero). */
  wake(): void;
  /** Calls `fn` for each other dynamic body touching this one. */
  touching(fn: (other: EngineBody) => void): void;
  impulse(x: number, y: number, z: number): void;
  remove(): void;
}

export interface Engine {
  addGround(y: number): void;
  addStaticBox(center: Vec3, half: Vec3, q: { x: number; y: number; z: number; w: number }): void;
  create(spec: BodySpec): EngineBody;
  step(h: number): void;
  /** A new, empty engine of the same kind and settings (for the warm-up's throwaway world), or null. */
  scratch(): Engine | null;
  dispose(): void;
}
