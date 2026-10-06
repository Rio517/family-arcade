import type * as RapierModule from '@dimforge/rapier3d-compat';
import type { BodySpec, Engine, EngineBody, Pose } from './engine';
import type { Vec3 } from './types';

export type Rapier = typeof RapierModule;

class RapierBody implements EngineBody {
  constructor(
    private readonly world: RapierModule.World,
    readonly rb: RapierModule.RigidBody,
    private readonly bodies: Map<number, RapierBody>,
  ) {}
  read(out: Pose): void {
    const t = this.rb.translation();
    const r = this.rb.rotation();
    out[0] = t.x;
    out[1] = t.y;
    out[2] = t.z;
    out[3] = r.x;
    out[4] = r.y;
    out[5] = r.z;
    out[6] = r.w;
  }
  isSleeping(): boolean {
    return this.rb.isSleeping();
  }
  sleep(): void {
    this.rb.sleep();
  }
  wake(): void {
    this.rb.wakeUp();
  }
  touching(fn: (other: EngineBody) => void): void {
    for (let i = 0, n = this.rb.numColliders(); i < n; i++) {
      this.world.contactPairsWith(this.rb.collider(i), (other) => {
        const parent = other.parent();
        const body = parent ? this.bodies.get(parent.handle) : undefined;
        if (body && body !== this) fn(body);
      });
    }
  }
  impulse(x: number, y: number, z: number): void {
    // Rapier ignores a zero impulse, even with wakeUp set, so wake explicitly.
    this.rb.wakeUp();
    this.rb.applyImpulse({ x, y, z }, true);
  }
  remove(): void {
    this.bodies.delete(this.rb.handle);
    this.world.removeRigidBody(this.rb);
  }
}

export class RapierEngine implements Engine {
  private readonly world: RapierModule.World;
  private readonly bodies = new Map<number, RapierBody>();
  constructor(
    private readonly R: Rapier,
    gravity: Vec3,
    fixedStep: number,
  ) {
    this.world = new R.World(gravity);
    this.world.timestep = fixedStep;
  }

  /** Static things bounce nothing back of their own: the dynamic body's `bounce` wins (Max rule). */
  private staticDesc(desc: RapierModule.ColliderDesc): RapierModule.ColliderDesc {
    return desc
      .setRestitution(0)
      .setRestitutionCombineRule(this.R.CoefficientCombineRule.Max)
      .setFriction(0.9);
  }

  addGround(y: number): void {
    this.world.createCollider(this.staticDesc(this.R.ColliderDesc.cuboid(500, 0.5, 500)).setTranslation(0, y - 0.5, 0));
  }

  addStaticBox(c: Vec3, h: Vec3, q: { x: number; y: number; z: number; w: number }): void {
    this.world.createCollider(this.staticDesc(this.R.ColliderDesc.cuboid(h.x, h.y, h.z)).setTranslation(c.x, c.y, c.z).setRotation(q));
  }

  create(s: BodySpec): EngineBody {
    const R = this.R;
    const rbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(s.position.x, s.position.y, s.position.z)
      .setRotation(s.quaternion)
      .setLinvel(s.velocity.x, s.velocity.y, s.velocity.z)
      .setAngvel(s.spin)
      .setLinearDamping(s.linDamp)
      .setAngularDamping(s.angDamp)
      .setCcdEnabled(s.ccd)
      .setCanSleep(true);
    const rb = this.world.createRigidBody(rbDesc);
    let cd: RapierModule.ColliderDesc | null = null;
    if (s.kind === 'sphere') cd = R.ColliderDesc.ball(s.radius);
    else if (s.kind === 'cylinder') cd = R.ColliderDesc.cylinder(s.half.y, Math.max(s.half.x, s.half.z));
    else if (s.kind === 'hull' && s.points) cd = R.ColliderDesc.convexHull(s.points);
    if (!cd) cd = R.ColliderDesc.cuboid(s.half.x, s.half.y, s.half.z);
    cd.setTranslation(s.offset.x, s.offset.y, s.offset.z)
      .setMass(s.mass)
      .setRestitution(s.bounce)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setFriction(s.friction);
    this.world.createCollider(cd, rb);
    const body = new RapierBody(this.world, rb, this.bodies);
    this.bodies.set(rb.handle, body);
    return body;
  }

  step(h: number): void {
    this.world.timestep = h;
    this.world.step();
  }

  scratch(): Engine | null {
    return new RapierEngine(this.R, this.world.gravity, this.world.timestep);
  }

  dispose(): void {
    this.world.free();
  }
}
