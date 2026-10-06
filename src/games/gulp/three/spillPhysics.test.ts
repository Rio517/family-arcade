import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { massFor } from '../domain/growth';
import { round } from '../domain/testing';
import type { World } from '../domain/world';
import { THROAT_DEPTH, throatRadius } from './fall';
import { shipCargo } from './park';
import { PropView } from './propView';
import { SpillPhysics, wantsSpillPhysics } from './spillPhysics';

const STEP = 1 / 60;

// jsdom has no 2D canvas: the vehicles' soft patch is painted on one.
const paint = new Proxy({} as Record<string | symbol, unknown>, {
  get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: () => {} })),
  set: (t, k, v) => {
    t[k] = v;
    return true;
  },
});
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(paint as never);

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(paint as never);
});

/** A Region round with Robin's hole at `r`, `dx`, `dz` from the first moored ship (the spill harness's framing). */
function harbour(r = 26, dx = 15, dz = -7) {
  const w = round(7, 0, { map: 'region' });
  const ships = w.city.props.filter((p) => p.kind === 'ship');
  const me = w.holes[0];
  me.r = r;
  me.mass = massFor(r);
  me.x = ships[0].x + dx;
  me.z = ships[0].z + dz;
  return { w, ships, me };
}

function view(w: World, spills: SpillPhysics | null) {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  return { scene, props: new PropView(scene, material, material.clone(), w, false, spills) };
}

/** The middles of the spilled containers drawn now (their batches are the scene's only ones that move every frame). */
function containers(scene: THREE.Scene): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const size = new THREE.Vector3();
  scene.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || o.instanceMatrix.usage !== THREE.DynamicDrawUsage) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      m.decompose(at, q, size);
      if (size.x > 0) out.push(at.clone());
    }
  });
  return out;
}

const cargoBatches = (scene: THREE.Scene) =>
  scene.children.filter((o) => o instanceof THREE.InstancedMesh && o.instanceMatrix.usage === THREE.DynamicDrawUsage).length;

/** Inside the hole's throat: within its wall and below the street. */
function inThroat(p: THREE.Vector3, hole: { x: number; z: number; r: number }): boolean {
  const out = Math.hypot(p.x - hole.x, p.z - hole.z);
  return out < hole.r * throatRadius(THROAT_DEPTH) && p.y < 0 && p.y > -hole.r * THROAT_DEPTH;
}

/** Step the view until the physics has let every body go after having some: the pile is at rest. */
function untilRest(props: PropView, w: World, spills: SpillPhysics, limit = 6) {
  let most = 0;
  for (let t = 0; t < limit; t += STEP) {
    props.step(w, STEP);
    const bodies = spills.world?.bodyCount ?? 0;
    most = Math.max(most, bodies);
    if (most > 0 && bodies === 0) return { at: t, most };
  }
  return { at: Infinity, most };
}

describe('a swallowed ship spilling its containers as real bodies', () => {
  it('tumbles them into the hole, piles them up inside, rests them, then gulps them down', async () => {
    const { w, ships, me } = harbour();
    const spills = new SpillPhysics();
    expect(await spills.load()).toBe(true);
    const { scene, props } = view(w, spills);
    props.swallow(ships[0], 0);
    const total = shipCargo(ships[0].variant).length;

    // Every container gets a body, they are all down and still within a few seconds,
    // and the physics lets them go then.
    const rest = untilRest(props, w, spills);
    expect(rest.most).toBe(total);
    expect(rest.at).toBeGreaterThan(1);
    expect(rest.at).toBeLessThan(3.5);

    // The pile: every container is drawn, inside the throat.
    const pile = containers(scene);
    expect(pile).toHaveLength(total);
    for (const p of pile) expect(inThroat(p, me), `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`).toBe(true);

    // A moving hole carries its pile.
    me.x += 5;
    props.step(w, STEP);
    const moved = containers(scene);
    expect(moved[0].x - pile[0].x).toBeCloseTo(5, 5);

    // It rests a moment, then the hole gulps it down: gone, its batches freed.
    let goneAt = Infinity;
    for (let t = 0; t < 4 && goneAt === Infinity; t += STEP) {
      props.step(w, STEP);
      if (containers(scene).length === 0) goneAt = t;
    }
    expect(goneAt).toBeGreaterThan(1);
    expect(goneAt).toBeLessThan(2.5);
    props.step(w, STEP);
    expect(cargoBatches(scene)).toBe(0);
    props.dispose();
    spills.dispose();
  });

  it('never makes a container jump once the heap has formed', async () => {
    // A body the physics rested while what it leant on still moved used to
    // hang, sink into the one under it and then jump out, metres in a frame.
    const { w, ships } = harbour();
    const spills = new SpillPhysics();
    await spills.load();
    const { scene, props } = view(w, spills);
    props.swallow(ships[0], 0);
    for (let t = 0; t < 2; t += STEP) props.step(w, STEP);
    let before = containers(scene);
    let fastest = 0;
    for (let t = 0; t < 1.5; t += STEP) {
      props.step(w, STEP);
      const now = containers(scene);
      // Gone once the hole gulps the heap down; the check is over by then.
      if (now.length !== before.length) break;
      for (let i = 0; i < now.length; i++) fastest = Math.max(fastest, now[i].distanceTo(before[i]) / STEP);
      before = now;
    }
    // World units a second: about 12 for a container settling into the heap; a jump was over 130.
    expect(fastest).toBeLessThan(30);
    props.dispose();
    spills.dispose();
  });

  it('piles up the same way every time, so its pictures repeat', async () => {
    const piles: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const { w, ships } = harbour();
      const spills = new SpillPhysics();
      await spills.load();
      const { scene, props } = view(w, spills);
      props.swallow(ships[0], 0);
      untilRest(props, w, spills);
      piles.push(containers(scene).map((p) => p.toArray().map((n) => n.toFixed(4)).join(',')));
      props.dispose();
      spills.dispose();
    }
    expect(piles[1]).toEqual(piles[0]);
  });

  it("lets both ships a giant swallows at once share one pile, within the body cap", async () => {
    // Between the two moored ships, big enough for both.
    const { w, ships, me } = harbour(60, 31, -8);
    const spills = new SpillPhysics();
    await spills.load();
    const { scene, props } = view(w, spills);
    for (const ship of ships) props.swallow(ship, 0);
    const total = ships.reduce((n, s) => n + shipCargo(s.variant).length, 0);
    const rest = untilRest(props, w, spills);
    expect(rest.most).toBe(total);
    expect(rest.most).toBeLessThanOrEqual(80);
    const pile = containers(scene);
    expect(pile).toHaveLength(total);
    for (const p of pile) expect(inThroat(p, me)).toBe(true);
    props.dispose();
    spills.dispose();
  });

  it('spills the scripted way when Rapier cannot load, and the round goes on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spills = new SpillPhysics(() => Promise.reject(new Error('no WebAssembly here')));
    expect(await spills.load()).toBe(false);
    expect(spills.world).toBeNull();
    expect(warn).toHaveBeenCalled();

    const { w, ships } = harbour();
    const { scene, props } = view(w, spills);
    props.swallow(ships[0], 0);
    let seen = 0;
    let goneAt = Infinity;
    for (let t = 0; t < 4 && goneAt === Infinity; t += STEP) {
      props.step(w, STEP);
      const now = containers(scene).length;
      seen = Math.max(seen, now);
      if (seen > 0 && now === 0) goneAt = t;
    }
    // They spill and drop out of sight as before the physics, and their batches are freed.
    expect(seen).toBe(shipCargo(ships[0].variant).length);
    expect(goneAt).toBeLessThan(2.5);
    props.step(w, STEP);
    expect(cargoBatches(scene)).toBe(0);
    props.dispose();
    spills.dispose();
  });

  it('gives up on a Rapier that never finishes starting, and spills the scripted way', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Loads, but its start-up never ends: the kit's time limit covers the download and the start-up together.
    const stuck = { World: function World() {}, init: () => new Promise(() => {}) };
    const spills = new SpillPhysics(() => Promise.resolve(stuck), 50);
    expect(await spills.load()).toBe(false);
    expect(spills.world).toBeNull();
    expect(warn).toHaveBeenCalled();
    const { me } = harbour();
    expect(spills.pile(0, me.x, me.z, 0, me.r, 37)).toBeNull();
  });

  it('lets the pile sink away if Rapier throws mid-spill, and spills later ships the scripted way', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { w, ships } = harbour();
    const spills = new SpillPhysics();
    await spills.load();
    const { scene, props } = view(w, spills);
    props.swallow(ships[0], 0);
    for (let t = 0; t < 0.8; t += STEP) props.step(w, STEP);
    expect(containers(scene).length).toBeGreaterThan(0);

    vi.spyOn(spills.world!, 'step').mockImplementation(() => {
      throw new Error('unreachable executed');
    });
    let goneAt = Infinity;
    for (let t = 0; t < 3 && goneAt === Infinity; t += STEP) {
      props.step(w, STEP);
      if (containers(scene).length === 0) goneAt = t;
    }
    expect(warn).toHaveBeenCalled();
    expect(spills.world).toBeNull();
    // Straight to sinking: no rest for a pile whose physics is gone.
    expect(goneAt).toBeLessThan(1.2);

    // The next ship spills the scripted way.
    props.swallow(ships[1], 0);
    let seen = 0;
    for (let t = 0; t < 3; t += STEP) {
      props.step(w, STEP);
      seen = Math.max(seen, containers(scene).length);
    }
    expect(seen).toBe(shipCargo(ships[1].variant).length);
    expect(containers(scene)).toHaveLength(0);
    props.dispose();
    spills.dispose();
  });
});

describe('when a scene loads the physics', () => {
  it('only for a round with ships to spill, never for the menu or with reduced motion', () => {
    const region = round(7, 0, { map: 'region' });
    expect(wantsSpillPhysics(region, false, false)).toBe(true);
    // The menu's tour and reduced motion spill without it.
    expect(wantsSpillPhysics(region, true, false)).toBe(false);
    expect(wantsSpillPhysics(region, false, true)).toBe(false);
    // The City has no harbour: no ships, no Rapier download.
    expect(wantsSpillPhysics(round(7, 0, { map: 'city' }), false, false)).toBe(false);
  });
});
