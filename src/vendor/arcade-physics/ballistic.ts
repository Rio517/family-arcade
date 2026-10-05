import type { BodySpec, Engine, EngineBody, Pose } from './engine';
import type { Vec3 } from './types';

/**
 * The fallback when Rapier cannot load: each body flies ballistically, bounces on the ground and on
 * the tops of static boxes, slides to a stop, flattens upright and goes to sleep. No body-to-body
 * contact and no walls. Good enough that nothing is left hanging in the air.
 */

interface StaticTop {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
}

/** A landing slower than this (m/s) does not bounce: it rests. */
const REST_SPEED = 0.7;

class BallisticBody implements EngineBody {
  readonly p = [0, 0, 0];
  readonly v = [0, 0, 0];
  readonly q = [0, 0, 0, 1];
  readonly w = [0, 0, 0];
  asleep = false;
  quiet = 0;
  alive = true;
  /** Distance from the object's origin down to the lowest point at rest. */
  readonly drop: number;
  constructor(readonly spec: BodySpec, private readonly world: BallisticEngine) {
    const s = spec;
    this.p[0] = s.position.x;
    this.p[1] = s.position.y;
    this.p[2] = s.position.z;
    this.v[0] = s.velocity.x;
    this.v[1] = s.velocity.y;
    this.v[2] = s.velocity.z;
    this.w[0] = s.spin.x;
    this.w[1] = s.spin.y;
    this.w[2] = s.spin.z;
    this.q[0] = s.quaternion.x;
    this.q[1] = s.quaternion.y;
    this.q[2] = s.quaternion.z;
    this.q[3] = s.quaternion.w;
    const ext = s.kind === 'sphere' ? s.radius : s.half.y;
    this.drop = ext - s.offset.y;
  }
  read(out: Pose): void {
    out[0] = this.p[0];
    out[1] = this.p[1];
    out[2] = this.p[2];
    out[3] = this.q[0];
    out[4] = this.q[1];
    out[5] = this.q[2];
    out[6] = this.q[3];
  }
  isSleeping(): boolean {
    return this.asleep;
  }
  sleep(): void {
    this.asleep = true;
    this.v[0] = this.v[1] = this.v[2] = 0;
    this.w[0] = this.w[1] = this.w[2] = 0;
  }
  impulse(x: number, y: number, z: number): void {
    const k = 1 / this.spec.mass;
    this.v[0] += x * k;
    this.v[1] += y * k;
    this.v[2] += z * k;
    this.asleep = false;
    this.quiet = 0;
  }
  remove(): void {
    this.alive = false;
    this.world.drop(this);
  }
}

export class BallisticEngine implements Engine {
  private groundY = -Infinity;
  private readonly tops: StaticTop[] = [];
  private readonly bodies: BallisticBody[] = [];
  constructor(private readonly g: Vec3) {}

  addGround(y: number): void {
    this.groundY = y;
  }

  addStaticBox(c: Vec3, h: Vec3): void {
    this.tops.push({ x0: c.x - h.x, x1: c.x + h.x, z0: c.z - h.z, z1: c.z + h.z, top: c.y + h.y });
  }

  create(spec: BodySpec): EngineBody {
    const b = new BallisticBody(spec, this);
    this.bodies.push(b);
    return b;
  }

  drop(b: BallisticBody): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  private floorAt(x: number, y: number, z: number, drop: number): number {
    let f = this.groundY;
    for (let i = 0; i < this.tops.length; i++) {
      const t = this.tops[i];
      // A top only counts when the body is above it (it is not tunnelling up from under).
      if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1 && t.top > f && y - drop >= t.top - 0.25) f = t.top;
    }
    return f;
  }

  step(h: number): void {
    const { g } = this;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.asleep) continue;
      const { p, v, q, w, spec } = b;
      v[0] += g.x * h;
      v[1] += g.y * h;
      v[2] += g.z * h;
      const air = Math.max(0, 1 - spec.linDamp * 0.1 * h);
      v[0] *= air;
      v[1] *= air;
      v[2] *= air;
      p[0] += v[0] * h;
      p[1] += v[1] * h;
      p[2] += v[2] * h;
      // Spin: q <- exp(w h / 2) * q.
      const wl = Math.hypot(w[0], w[1], w[2]);
      if (wl > 1e-6) {
        const a = (wl * h) / 2;
        const s = Math.sin(a) / wl;
        mulQ(q, s * w[0], s * w[1], s * w[2], Math.cos(a));
      }
      const floor = this.floorAt(p[0], p[1], p[2], b.drop);
      let resting = false;
      if (floor > -Infinity && p[1] - b.drop < floor) {
        p[1] = floor + b.drop;
        if (v[1] < -REST_SPEED) {
          v[1] = -v[1] * spec.bounce;
          // A bounce scrubs some sideways speed and tumbles the body a little.
          const k = Math.max(0, 1 - spec.friction * 0.25);
          v[0] *= k;
          v[2] *= k;
        } else {
          v[1] = 0;
          resting = true;
        }
      }
      if (resting) {
        const slide = Math.max(0, 1 - (3 + spec.friction * 6) * h);
        v[0] *= slide;
        v[2] *= slide;
        const damp = Math.max(0, 1 - (6 + spec.angDamp) * h);
        w[0] *= damp;
        w[1] *= damp;
        w[2] *= damp;
        flatten(q, Math.min(1, 12 * h));
        const speed = Math.hypot(v[0], v[2]) + Math.hypot(w[0], w[1], w[2]);
        b.quiet = speed < 0.05 ? b.quiet + h : 0;
        if (b.quiet > 0.15) b.sleep();
      } else {
        b.quiet = 0;
      }
    }
  }

  dispose(): void {
    this.bodies.length = 0;
    this.tops.length = 0;
  }
}

/** q <- r * q (r given as x y z w). */
function mulQ(q: number[], rx: number, ry: number, rz: number, rw: number): void {
  const [x, y, z, w] = q;
  q[0] = rw * x + rx * w + ry * z - rz * y;
  q[1] = rw * y - rx * z + ry * w + rz * x;
  q[2] = rw * z + rx * y - ry * x + rz * w;
  q[3] = rw * w - rx * x - ry * y - rz * z;
  const n = 1 / Math.hypot(q[0], q[1], q[2], q[3]);
  q[0] *= n;
  q[1] *= n;
  q[2] *= n;
  q[3] *= n;
}

/** Eases q toward the same yaw with no tilt (its y axis straight up). */
function flatten(q: number[], k: number): void {
  const [x, y, z, w] = q;
  // Yaw about y from the quaternion: twist component about the y axis.
  const n = Math.hypot(y, w);
  const ty = n > 1e-9 ? y / n : 0;
  const tw = n > 1e-9 ? w / n : 1;
  // Slerp-ish (normalised lerp) from q toward the pure-yaw quaternion (0, ty, 0, tw), keeping hemisphere.
  const dot = y * ty + w * tw + 0 * x + 0 * z;
  const s = dot < 0 ? -1 : 1;
  q[0] = x * (1 - k);
  q[1] = y + (s * ty - y) * k;
  q[2] = z * (1 - k);
  q[3] = w + (s * tw - w) * k;
  const m = 1 / Math.hypot(q[0], q[1], q[2], q[3]);
  q[0] *= m;
  q[1] *= m;
  q[2] *= m;
  q[3] *= m;
}
