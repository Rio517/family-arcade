import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KINDS, type PropKind } from '../domain/catalog';
import { buildHeliBodyGeometry, buildRotorGeometry } from './military';
import { flushClashes } from './kit';
import { buildKindGeometry } from './props';

/**
 * Kinds whose budget is not their tier's: people are instanced by the
 * hundred, so they get a tight budget of their own; a building site stands in for the building that
 * will go up on its lot, so it gets about as much as that building. Wonders
 * are one of a kind in a city, so they get more, and the two lattice-and-glass
 * giants the most. The military base sits outside the tier ladder's usual
 * mix, so each of its kinds has its own budget; the bomber only flies over.
 * Park people and dogs come in crowds like the walkers, and each piece of
 * playground gear gets what its shape needs.
 */
const BUDGET: Partial<Record<PropKind, number>> = {
  // Street clutter stands by the hundred on every map, so it is held lean.
  cone: 45,
  hydrant: 150,
  bin: 125,
  mailbox: 85,
  planter: 140,
  bike: 185,
  lamp: 120,
  person: 340,
  sitter: 360,
  dog: 250,
  police: 340,
  garbagetruck: 1300,
  icecreamvan: 1300,
  policecar: 900,
  swings: 600,
  slide: 700,
  seesaw: 300,
  sandbox: 500,
  climber: 900,
  carousel: 700,
  agility: 400,
  site: 900,
  bigsite: 2500,
  tank: 1200,
  helicopter: 1500,
  watchtower: 600,
  barracks: 1500,
  radar: 1800,
  hangar: 2500,
  bomber: 3500,
  liberty: 6000,
  megaspire: 8000,
  irontower: 8000,
  pyramid: 6000,
  pearlpalace: 6000,
  colosseum: 6000,
  opera: 6000,
  onion: 6000,
  clocktower: 6000,
  leaning: 6000,
  stonecircle: 6000,
  moai: 6000,
};

/** Triangle budgets by tier, so a city of instanced props stays fast on an iPad. */
function budget(kind: PropKind, tier: number): number {
  const own = BUDGET[kind];
  if (own !== undefined) return own;
  if (tier <= 1) return 300;
  if (tier <= 4) return 900;
  if (tier <= 7) return 2500;
  return 5000;
}

const kinds = Object.keys(KINDS) as PropKind[];

/**
 * Buildings and landmarks stand on a base whose underside is the ground, so
 * the vertices at y = 0 spread across most of the footprint. When some part
 * dips below the base, the snap to the ground lifts the whole model and
 * leaves a gap under it; this catches that. These big kinds touch the ground
 * in only a few places on purpose.
 */
const OFF_BASE: Partial<Record<PropKind, string>> = {
  jet: 'stands on its wheels',
  windturbine: 'its blades are far wider than its foundation pad',
  radar: 'a dish on a mast, wider than its plinth',
  bomber: 'flies over',
};

describe('buildKindGeometry', () => {
  for (const kind of kinds) {
    const info = KINDS[kind];
    const scales = info.scales ? [0.75, 1, 1.6] : [1];
    for (let v = 0; v < info.variants; v++) {
      for (const s of scales) {
        it(`${kind} variant ${v} at height x${s} fits its footprint and budget`, () => {
          const g = buildKindGeometry(kind, v, s);
          const pos = g.getAttribute('position');
          expect(pos.itemSize).toBe(3);
          expect(g.getAttribute('normal').count).toBe(pos.count);
          const color = g.getAttribute('color');
          expect(color.count).toBe(pos.count);
          expect(color.itemSize).toBe(3);
          expect(g.index).toBeNull();

          const tris = pos.count / 3;
          expect(tris).toBeGreaterThan(0);
          expect(tris).toBeLessThanOrEqual(budget(kind, info.tier));

          const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
          // Origin is the footprint centre, so each half-extent must fit half the footprint.
          expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual((info.w / 2) * 1.1);
          expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual((info.d / 2) * 1.1);
          expect(box.min.y).toBeGreaterThanOrEqual(-0.02);
          expect(box.min.y).toBeLessThanOrEqual(0.02);
          const h = info.h * s;
          expect(box.max.y).toBeGreaterThanOrEqual(h * 0.85);
          expect(box.max.y).toBeLessThanOrEqual(h * 1.15);

          for (const value of [...(pos.array as Float32Array), ...(color.array as Float32Array)]) {
            expect(Number.isFinite(value)).toBe(true);
          }
          g.dispose();
        });
      }
    }
  }

  it('wraps out-of-range and odd variants instead of failing', () => {
    for (const variant of [-1, 7, 99, 2.5, Number.NaN]) {
      const g = buildKindGeometry('car', variant);
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
    }
    const wrapped = buildKindGeometry('house', 5).getAttribute('color').array;
    const direct = buildKindGeometry('house', 1).getAttribute('color').array;
    expect(Array.from(wrapped)).toEqual(Array.from(direct));
  });

  it('draws the same geometry every time', () => {
    const a = buildKindGeometry('tree', 1).getAttribute('position').array;
    const b = buildKindGeometry('tree', 1).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('gives variants different colours', () => {
    const a = buildKindGeometry('car', 0).getAttribute('color').array;
    const b = buildKindGeometry('car', 1).getAttribute('color').array;
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('grows taller buildings by adding floors, not by ignoring the scale', () => {
    for (const kind of kinds.filter((k) => KINDS[k].scales)) {
      const short = buildKindGeometry(kind, 0, 1);
      const tall = buildKindGeometry(kind, 0, 1.6);
      expect(tall.getAttribute('position').count).toBeGreaterThan(short.getAttribute('position').count);
    }
  });

  it('gives flying helicopters a rotor centred on its hub, blades flat', () => {
    const g = buildRotorGeometry();
    const pos = g.getAttribute('position');
    expect(g.getAttribute('color').count).toBe(pos.count);
    expect(pos.count / 3).toBeLessThanOrEqual(300);
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    const heli = KINDS.helicopter;
    // Blades reach well out but stay inside the helicopter's footprint.
    expect(box.max.x).toBeGreaterThan(heli.w * 0.4);
    expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(heli.d / 2);
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.01);
    expect(Math.abs(box.min.z + box.max.z)).toBeLessThan(0.01);
    expect(box.max.y - box.min.y).toBeLessThan(0.8);
    g.dispose();
  });

  it('gives flying helicopters a body without the still rotor, in the parked frame', () => {
    const parked = buildKindGeometry('helicopter', 0).getAttribute('position');
    const body = buildHeliBodyGeometry().getAttribute('position');
    const rotor = buildRotorGeometry().getAttribute('position');
    expect(body.count + rotor.count).toBe(parked.count);
    // The rotor is drawn last, so the body is the parked model minus its tail end.
    expect(Array.from(body.array)).toEqual(Array.from(parked.array).slice(0, body.array.length));
    const box = new THREE.Box3().setFromBufferAttribute(body as THREE.BufferAttribute);
    expect(box.min.y).toBeCloseTo(0, 5);
    // The mast top sits just under the hub height the scene spins the rotor at.
    expect(box.max.y).toBeLessThan(3.4);
    expect(box.max.y).toBeGreaterThan(3.2);
  });

  it('stands buildings and landmarks flat on the ground across their footprint', () => {
    for (const kind of kinds) {
      const info = KINDS[kind];
      if (info.tier < 5 || OFF_BASE[kind] !== undefined) continue;
      for (let v = 0; v < info.variants; v++) {
        const pos = buildKindGeometry(kind, v).getAttribute('position');
        let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
        for (let i = 0; i < pos.count; i++) {
          if (pos.getY(i) > 0.03) continue;
          x0 = Math.min(x0, pos.getX(i));
          x1 = Math.max(x1, pos.getX(i));
          z0 = Math.min(z0, pos.getZ(i));
          z1 = Math.max(z1, pos.getZ(i));
        }
        expect((x1 - x0) / info.w, `${kind} ${v} ground span across x`).toBeGreaterThanOrEqual(0.7);
        expect((z1 - z0) / info.d, `${kind} ${v} ground span across z`).toBeGreaterThanOrEqual(0.7);
      }
    }
  });

  it('ignores the height scale for kinds that do not scale', () => {
    const a = buildKindGeometry('car', 0, 1).getAttribute('position').array;
    const b = buildKindGeometry('car', 0, 2).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

/** The model's triangles split by colour, one geometry per colour. */
function byColour(g: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const groups = new Map<string, { p: number[]; c: number[] }>();
  for (let i = 0; i < pos.count; i += 3) {
    const key = `${col.getX(i)},${col.getY(i)},${col.getZ(i)}`;
    const grp = groups.get(key) ?? groups.set(key, { p: [], c: [] }).get(key)!;
    for (let k = 0; k < 3; k++) {
      grp.p.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      grp.c.push(col.getX(i + k), col.getY(i + k), col.getZ(i + k));
    }
  }
  return [...groups.values()].map(({ p, c }) => {
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    part.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return part;
  });
}

/**
 * Faces left flush after the kit lifts details off what they sit on: each is
 * inside its model (the top of the bus's door glass under the roof, the back
 * of a container's door bars, a stripe inside the ice-cream van's body, the
 * pitch's edge under the stadium's stands, the mall's inset wall) or on the
 * bomber, which only flies past far overhead.
 */
const HIDDEN_FLUSH: Partial<Record<PropKind, number>> = { bus: 3, container: 8, icecreamvan: 5, stadium: 6, mall: 8, bomber: 92 };

describe('flicker', () => {
  it('leaves no differently coloured faces flush on one another, where they would flicker', () => {
    const found: string[] = [];
    for (const kind of Object.keys(KINDS) as PropKind[]) {
      for (let v = 0; v < KINDS[kind].variants; v++) {
        let g: THREE.BufferGeometry;
        try {
          g = buildKindGeometry(kind, v);
        } catch {
          // A kind still waiting for its model is reported by the budget tests above.
          continue;
        }
        const n = flushClashes(byColour(g)).length;
        if (n > (HIDDEN_FLUSH[kind] ?? 0)) found.push(`${kind} #${v}: ${n}`);
      }
    }
    expect(found).toEqual([]);
  });
});
