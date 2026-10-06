/**
 * Real bodies for a swallowed ship's containers: they tumble off its deck,
 * knock against the hole's rim, pile up on the throat's floor and rest
 * there a moment before the hole gulps the pile down (see propView's
 * `moveCargo`). Built on the studio's physics kit, which runs Rapier.
 *
 * Cosmetic only. The round has already decided what was swallowed and
 * scored; nothing here goes back into it or over the wire, and each device
 * plays its own spill.
 *
 * Rapier is about 1.65 MB gzipped, so it is loaded here and nowhere else:
 * the kit imports it on the first `load`, which the scene asks for when a
 * round has ships to spill. Until it has loaded, or when it cannot load or
 * throws, a spill plays the scripted way (fall.ts's `spillPose`).
 *
 * Each pile plays out in a lane of one physics world, in its hole's own
 * frame, scaled so the mouth's radius is `MOUTH`: a mouth of any size, and
 * a hole that moves, are the same lane, so each lane's rim, throat wall and
 * floor are built once, when the world is made. One hole's spills share its
 * lane, so a second ship's containers land on the first one's.
 */
import * as THREE from 'three';
import { createPhysics, type BodyOptions, type PhysicsBody, type PhysicsOptions, type PhysicsWorld } from '../../../vendor/arcade-physics';
import type { World } from '../domain/world';
import { THROAT_DEPTH, throatRadius, type Spill } from './fall';

/** The mouth's radius in a lane: about the size the kit's tolerances are made for. */
const MOUTH = 10;
/** The street round the mouth reaches this far out, so a container that bounces off the rim lands on something. */
const STREET = 36;
/** The throat's wall and floor, as holeView.ts draws them (fall.ts's shape). */
const WALL = MOUTH * throatRadius(THROAT_DEPTH);
const FLOOR = MOUTH * THROAT_DEPTH;
/**
 * A bowl in the throat that the pile lands in: from the wall at `BOWL_EDGE`
 * deep down to a flat middle `BOWL_MIDDLE` across at `BOWL_DEEP`, steep
 * enough that containers slide together into a heap. Down there the throat
 * is drawn black, so the bowl itself never shows.
 */
const BOWL_EDGE = 13;
const BOWL_DEEP = 17;
const BOWL_MIDDLE = 2.5;
/** Segments round the rim and the wall. */
const SIDES = 24;
/** How far apart the lanes sit in the world: well clear of each other's streets. */
const LANE_GAP = 120;
/** Holes that can have a pile at once; a third spills the scripted way. */
const LANES = 2;
/** Bodies alive at once: two ships' worth. At the cap the kit lets the oldest resting one go. */
const MAX_BODIES = 80;
/**
 * Lane units a second squared. Faster than real gravity at a lane's scale,
 * so a pile is down about a second after the containers leave the deck,
 * as quick as the scripted spill.
 */
const GRAVITY = 40;

/** The push off the deck: across to where the spill aims in this many seconds, a hop, and a shove off the side. */
const ACROSS_TIME = 0.6;
const HOP = 4;
const SHOVE = 1.7;
/** How they tumble: radians a second about the way they roll, and about upright. */
const ROLL_SPIN = 2.4;
const TURN_SPIN = 1.5;
const CONTAINER_MASS = 4;
const BOUNCE = 0.22;
const FRICTION = 0.7;

/**
 * Once every container is down and still (or this long after the last one
 * left the deck, whichever is first), the pile rests for `REST`, then sinks
 * through the floor over `SINK`.
 */
const SETTLE_LIMIT = 4;
const REST = 1.4;
const SINK = 0.7;
/**
 * The pile is still once no container has moved faster than this (lane
 * units a second) for `STILL_TIME`: a heap keeps jittering a hair long after
 * it looks settled, and the kit only puts a body to sleep once it is quite
 * still, so the pile does not wait for that.
 */
const STILL_SPEED = 0.15;
const STILL_TIME = 0.35;
/** A push too small to see that wakes a body (Rapier ignores a zero one). */
const WAKE = 1e-6;
/** A container left lying still this long on the street outside the mouth is pushed back in, at most `NUDGES` times. */
const NUDGE_AFTER = 0.3;
const NUDGES = 3;

/** Steps taken when the world is made, so the first spill does not pay for Rapier's start (see `warmUp`). */
const WARM_STEPS = 30;

const ONE = new THREE.Vector3(1, 1, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** One hole's place in the physics world while it has a pile. */
interface Lane {
  /** Where its frame's middle sits in the physics world. */
  readonly x: number;
  /** The hole whose pile this is, or -1 while the lane is free. */
  hole: number;
  /** The hole's middle as last seen, the level of its mouth, and its radius when the pile began. */
  cx: number;
  cz: number;
  y: number;
  r: number;
  /** Piles playing out in it. */
  piles: number;
}

/** One container in a pile: its stand-in in the physics world, and its body while it has one. */
export interface Piece {
  proxy: THREE.Object3D;
  body: PhysicsBody | null;
  /** Where it was last frame, for how fast it moves, and how long it has been still. */
  last: THREE.Vector3;
  quiet: number;
  nudges: number;
  /** Dropped by the body cap while still in the air, or fell out of the world: no longer drawn. */
  lost: boolean;
}

type Phase = 'falling' | 'resting' | 'sinking' | 'gone';

/** One swallowed ship's containers in a lane: added as each leaves the deck, gone once the hole has gulped them down. */
export class Pile {
  private pieces: Piece[] = [];
  private phase: Phase = 'falling';
  /** Seconds since the last container joined, and into the rest or the sink. */
  private clock = 0;
  /** Seconds every container has been still. */
  private still = 0;
  private at = new THREE.Vector3();

  constructor(
    private physics: SpillPhysics,
    private lane: Lane,
    /** How many containers will join. */
    private expected: number,
  ) {}

  /** The hole has moved: the pile moves with it. */
  follow(cx: number, cz: number): void {
    this.lane.cx = cx;
    this.lane.cz = cz;
  }

  /**
   * A container leaves the deck: its middle at `at` and turned `q` in the
   * world, flying off the way its scripted spill `spill` would have gone
   * (sliding off to the side `sideX`, `sideZ`). Null if the physics went
   * away; it then spills the scripted way.
   */
  add(at: THREE.Vector3, q: THREE.Quaternion, spill: Spill, sideX: number, sideZ: number): Piece | null {
    if (!this.physics.world || this.phase !== 'falling') {
      this.skip();
      return null;
    }
    const lane = this.lane;
    const s = MOUTH / lane.r;
    const proxy = this.physics.takeProxy();
    proxy.position.set(lane.x + (at.x - lane.cx) * s, (at.y - lane.y) * s, (at.z - lane.cz) * s);
    proxy.quaternion.copy(q);
    const x = (at.x - lane.cx) * s;
    const z = (at.z - lane.cz) * s;
    const piece: Piece = { proxy, body: null, last: proxy.position.clone(), quiet: 0, nudges: 0, lost: false };
    piece.body = this.physics.addBody(piece, {
      shape: 'box',
      size: { x: spill.hw * 2 * s, y: spill.hh * 2 * s, z: spill.hd * 2 * s },
      mass: CONTAINER_MASS,
      bounce: BOUNCE,
      friction: FRICTION,
      velocity: {
        x: (spill.tx * s - x) / ACROSS_TIME + sideX * SHOVE,
        y: HOP,
        z: (spill.tz * s - z) / ACROSS_TIME + sideZ * SHOVE,
      },
      spin: { x: spill.rollX * ROLL_SPIN, y: spill.spin * TURN_SPIN, z: spill.rollZ * ROLL_SPIN },
    });
    if (!piece.body) {
      this.physics.drop(piece);
      this.skip();
      return null;
    }
    this.pieces.push(piece);
    this.clock = 0;
    return piece;
  }

  /** A container that will not join after all (it went down with the ship, or spills the scripted way). */
  skip(): void {
    this.expected--;
  }

  /** After the physics has stepped: whether it has all come to rest, the rest, the sink. True once the pile is gone. */
  update(dt: number): boolean {
    if (this.phase === 'gone') return true;
    this.clock += dt;
    if (this.phase === 'falling') {
      if (!this.physics.world) this.toRest(true);
      else if (this.settled(dt) || this.clock >= SETTLE_LIMIT) this.toRest(false);
    } else if (this.phase === 'resting' && this.clock >= REST) {
      this.phase = 'sinking';
      this.clock = 0;
    } else if (this.phase === 'sinking' && this.clock >= SINK) {
      this.finish();
      return true;
    }
    return false;
  }

  /** Where a piece is drawn this frame, into `out`; false if it is not drawn. */
  place(piece: Piece, out: THREE.Matrix4): boolean {
    if (piece.lost || this.phase === 'gone') return false;
    const lane = this.lane;
    const s = lane.r / MOUTH;
    const p = piece.proxy.position;
    // Sinking: down through the floor, faster and faster, out of sight.
    const k = this.phase === 'sinking' ? Math.min(1, this.clock / SINK) : 0;
    const drop = k * k * (FLOOR + p.y + MOUTH);
    this.at.set(lane.cx + (p.x - lane.x) * s, lane.y + (p.y - drop) * s, lane.cz + p.z * s);
    out.compose(this.at, piece.proxy.quaternion, ONE);
    return true;
  }

  /** Let the pile go at once (the scene is going). */
  finish(): void {
    if (this.phase === 'gone') return;
    for (const piece of this.pieces) this.physics.drop(piece);
    this.pieces.length = 0;
    this.phase = 'gone';
    this.physics.leave(this.lane);
  }

  /** Every container has joined and lies still; one left on the street outside the mouth is pushed back in. */
  private settled(dt: number): boolean {
    let fastest = 0;
    for (const piece of this.pieces) {
      const body = piece.body;
      if (!body || body.removed) continue;
      // The kit puts a body that has been slow for a moment to sleep, but
      // while anything it touches still moves, Rapier goes on moving it
      // under gravity without its contacts, and the kit stops drawing it: a
      // container would hang, sink into the one under it, then jump out.
      // Woken at once it stays solid and is drawn where it is; the pile
      // comes to rest by `STILL_SPEED` instead.
      if (body.asleep) body.applyImpulse(0, WAKE, 0);
      const p = piece.proxy.position;
      if (p.y < -FLOOR - MOUTH) {
        // Fell out of the world (it never should): it is gone.
        this.physics.removeBody(piece);
        piece.lost = true;
        continue;
      }
      const speed = dt > 0 ? p.distanceTo(piece.last) / dt : 0;
      piece.last.copy(p);
      fastest = Math.max(fastest, speed);
      piece.quiet = speed < STILL_SPEED ? piece.quiet + dt : 0;
      const dx = p.x - this.lane.x;
      const out = Math.hypot(dx, p.z);
      if (piece.quiet > NUDGE_AFTER && p.y > -2 && out > MOUTH * 0.9 && piece.nudges < NUDGES) {
        // Toward the middle and up a little, as if the hole licked it in.
        piece.nudges++;
        piece.quiet = 0;
        const m = CONTAINER_MASS;
        body.applyImpulse((-dx / out) * 9 * m, 3 * m, (-p.z / out) * 9 * m);
        fastest = Infinity;
      }
    }
    this.still = fastest < STILL_SPEED ? this.still + dt : 0;
    return this.pieces.length >= this.expected && this.still >= STILL_TIME;
  }

  /** Every body out of the physics: the pile keeps its last poses and rests. */
  private toRest(broken: boolean): void {
    for (const piece of this.pieces) this.physics.removeBody(piece);
    this.phase = broken ? 'sinking' : 'resting';
    this.clock = 0;
  }
}

/**
 * Whether a scene loads the physics: only a round with ships to spill. The
 * menu's tour spills the scripted way, and with reduced motion a ship's
 * containers ride its hull down instead of spilling, so neither downloads
 * Rapier.
 */
export function wantsSpillPhysics(world: World, menuTour: boolean, reducedMotion: boolean): boolean {
  return !menuTour && !reducedMotion && world.city.props.some((p) => p.kind === 'ship');
}

/**
 * The physics world the piles share, made on the first `load`. A lane is
 * lent to a hole while it has a pile; the stand-ins the bodies move are
 * kept and used again.
 */
export class SpillPhysics {
  world: PhysicsWorld | null = null;
  private loading: Promise<boolean> | null = null;
  private lanes: Lane[] = Array.from({ length: LANES }, (_, i) => ({ x: i * LANE_GAP, hole: -1, cx: 0, cz: 0, y: 0, r: 1, piles: 0 }));
  private proxies: THREE.Object3D[] = [];
  private byBody = new Map<PhysicsBody, Piece>();
  private disposed = false;

  constructor(
    /** For tests: load Rapier some other way (or fail to). */
    private loadRapier?: PhysicsOptions['loadRapier'],
    /** Give up after this long and spill the scripted way: the kit's own limit covers the download, not Rapier's start-up after it. */
    private loadLimitMs = 10_000,
  ) {}

  /** Load Rapier and build the lanes, once. True when real physics is there; false and spills stay scripted. */
  load(): Promise<boolean> {
    this.loading ??= this.make();
    return this.loading;
  }

  /** A pile for `expected` containers swallowed by hole `hole` (middle `cx`, `cz`, mouth at `y`, radius `r`), or null to spill them the scripted way. */
  pile(hole: number, cx: number, cz: number, y: number, r: number, expected: number): Pile | null {
    if (!this.world || r <= 0) return null;
    const lane = this.lanes.find((l) => l.hole === hole) ?? this.lanes.find((l) => l.piles === 0);
    if (!lane) return null;
    if (lane.piles === 0) Object.assign(lane, { hole, cx, cz, y, r });
    lane.piles++;
    return new Pile(this, lane, expected);
  }

  /** Advance every pile's bodies by `dt` seconds. If Rapier throws, the physics goes and the piles sink. */
  step(dt: number): void {
    const world = this.world;
    if (!world || world.bodyCount === 0 || world.allAsleep) return;
    try {
      world.step(dt);
    } catch (error) {
      console.warn('Gulp: spill physics stopped, spills go back to scripted', error);
      this.lose();
    }
  }

  takeProxy(): THREE.Object3D {
    return this.proxies.pop() ?? new THREE.Object3D();
  }

  addBody(piece: Piece, options: BodyOptions): PhysicsBody | null {
    const world = this.world;
    if (!world) return null;
    try {
      const body = world.addBody(piece.proxy, options);
      this.byBody.set(body, piece);
      return body;
    } catch (error) {
      console.warn('Gulp: spill physics stopped, spills go back to scripted', error);
      this.lose();
      return null;
    }
  }

  /** Take a piece's body out of the physics; it keeps its last pose. */
  removeBody(piece: Piece): void {
    const body = piece.body;
    if (!body) return;
    piece.body = null;
    this.byBody.delete(body);
    if (this.world && !body.removed) body.remove();
  }

  /** Done with a piece: its body goes and its stand-in is kept for the next. */
  drop(piece: Piece): void {
    this.removeBody(piece);
    this.proxies.push(piece.proxy);
  }

  leave(lane: Lane): void {
    lane.piles = Math.max(0, lane.piles - 1);
    if (lane.piles === 0) lane.hole = -1;
  }

  dispose(): void {
    this.disposed = true;
    this.byBody.clear();
    this.world?.dispose();
    this.world = null;
  }

  private async make(): Promise<boolean> {
    let world: PhysicsWorld | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const made = createPhysics({
        gravity: -GRAVITY,
        maxBodies: MAX_BODIES,
        loadRapier: this.loadRapier,
        onEvict: (body) => this.evicted(body),
        onFallback: (error) => console.warn('Gulp: no physics for spills, they stay scripted', error),
      });
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), this.loadLimitMs);
      });
      world = await Promise.race([made, late]);
      if (!world) {
        console.warn('Gulp: the spill physics took too long to start, spills stay scripted');
        void made.then((w) => w.dispose());
        return false;
      }
      // The kit's own fallback has no walls and no contact between bodies:
      // fall.ts's scripted spill suits a Gulp hole better.
      if (this.disposed || world.backend !== 'rapier') {
        world.dispose();
        return false;
      }
      for (const lane of this.lanes) build(world, lane.x);
      warmUp(world);
      this.world = world;
      return true;
    } catch (error) {
      console.warn('Gulp: no physics for spills, they stay scripted', error);
      world?.dispose();
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** The body cap let one go: a resting one stays where it lies; one still in the air is no longer drawn. */
  private evicted(body: PhysicsBody): void {
    const piece = this.byBody.get(body);
    if (!piece) return;
    this.byBody.delete(body);
    piece.body = null;
    if (!body.asleep) piece.lost = true;
  }

  /** Rapier threw: no more physics for this scene. The piles see it and sink. */
  private lose(): void {
    for (const piece of this.byBody.values()) piece.body = null;
    this.byBody.clear();
    const world = this.world;
    this.world = null;
    try {
      world?.dispose();
    } catch {
      // It is already broken; nothing more to free.
    }
  }
}

/**
 * Rapier's first steps are slow (about 30 ms on a fast Mac, many times that
 * on an old iPad): a box dropped into the first lane takes them now, while
 * the round counts down, instead of on the frame the first container leaves
 * a ship's deck.
 */
function warmUp(world: PhysicsWorld): void {
  const box = new THREE.Object3D();
  box.position.set(0, -BOWL_DEEP + 2, 0);
  const body = world.addBody(box, { size: { x: 1, y: 1, z: 2.5 } });
  for (let i = 0; i < WARM_STEPS; i++) world.step(1 / 60);
  body.remove();
}

/** A lane's colliders, its middle at `x`: the street round the mouth, the throat's wall, its floor. */
function build(world: PhysicsWorld, x: number): void {
  // Each slab turned to face the mouth's middle.
  const turn = (a: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -a);
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  };
  const across = (r: number) => 2 * r * Math.tan(Math.PI / SIDES) + 0.5;
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // The street: a ring of slabs from the mouth out, its top at the mouth's level.
    const street = (MOUTH + STREET) / 2;
    world.addStatic({ center: { x: x + c * street, y: -0.5, z: s * street }, size: { x: STREET - MOUTH, y: 1, z: across(STREET) }, quaternion: turn(a) });
    // The throat's wall, from just under the street down past the floor.
    const wall = WALL + 1;
    world.addStatic({ center: { x: x + c * wall, y: -(FLOOR + 2) / 2, z: s * wall }, size: { x: 2, y: FLOOR + 1, z: across(WALL + 2) }, quaternion: turn(a) });
  }
  // The bowl: its flat middle, then a ring of slabs sloping up to the wall.
  world.addStatic({ center: { x, y: -BOWL_DEEP - 0.5, z: 0 }, size: { x: 2 * BOWL_MIDDLE + 1, y: 1, z: 2 * BOWL_MIDDLE + 1 } });
  const run = WALL - BOWL_MIDDLE;
  const rise = BOWL_DEEP - BOWL_EDGE;
  const slope = Math.atan2(rise, run);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope);
  // The middle of each slab's top, then its centre half a slab below that.
  const mid = (BOWL_MIDDLE + WALL) / 2 + 0.5 * Math.sin(slope);
  const midY = -(BOWL_DEEP + BOWL_EDGE) / 2 - 0.5 * Math.cos(slope);
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -a).multiply(tilt);
    world.addStatic({
      center: { x: x + Math.cos(a) * mid, y: midY, z: Math.sin(a) * mid },
      size: { x: Math.hypot(run, rise) + 1, y: 1, z: across(WALL) },
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    });
  }
  // And the throat's floor under it all, as drawn.
  world.addStatic({ center: { x, y: -FLOOR - 1, z: 0 }, size: { x: 2 * WALL + 4, y: 2, z: 2 * WALL + 4 } });
}
