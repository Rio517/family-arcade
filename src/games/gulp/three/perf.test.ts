/**
 * Performance guards for Gulp Universe's 3D city: timing-free and
 * deterministic (everything here comes from a seeded city and pure geometry
 * builders), so these never flake in CI the way a frame-rate test would.
 * They catch the two ways this scene has actually gotten slow: a map that
 * grew too many triangles, and a model-build pass that got quadratically
 * more expensive. `npm run perf:gulp` (scripts/perf-gulp.mjs) is the
 * companion audit that measures real frame times and Lighthouse scores; run
 * it by hand from time to time, since it needs a browser and takes a while.
 */
import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { KINDS, type PropKind } from '../domain/catalog';
import { createCity, type MapId } from '../domain/city';
import { flushCompareCount, resetFlushCompareCount } from './kit';
import { modelFor } from './models';
import { buildKindGeometry } from './props';

// ---------------------------------------------------------------------------
// Triangles per map
// ---------------------------------------------------------------------------

/** A prop's model key, matching three/models.ts's `modelOf`: a scaling
 * kind's height is rounded to quarters, so nearby heights share one model. */
function modelKey(kind: PropKind, variant: number, hScale: number): { key: string; h: number } {
  const h = KINDS[kind].scales ? Math.round(hScale * 4) / 4 : 1;
  return { key: `${kind}:${variant}:${h}`, h };
}

/** Total triangles a city draws: every prop's model, built once per distinct
 * (kind, variant, height) and multiplied by how many props share it — the
 * same batching `three/propView.ts` does with `InstancedMesh`. Also reports the
 * total within `NEAR` units of the map's centre, which is roughly the ground
 * the camera frames around a mid-size hole. */
const NEAR = 90;

function triangleTotals(map: MapId): { whole: number; near: number } {
  const city = createCity(seededRng(7), map);
  const cache = new Map<string, number>();
  let whole = 0;
  let near = 0;
  for (const p of city.props) {
    const { key, h } = modelKey(p.kind, p.variant, p.hScale);
    let tris = cache.get(key);
    if (tris === undefined) {
      const g = buildKindGeometry(p.kind, p.variant, h);
      tris = g.getAttribute('position').count / 3;
      g.dispose();
      cache.set(key, tris);
    }
    whole += tris;
    if (Math.hypot(p.x, p.z) <= NEAR) near += tris;
  }
  return { whole, near };
}

/**
 * Caps, each about 15% above what a fixed seed (7) measured on 2026-09-30
 * after the maps grew: whole map / within 90 units of the centre.
 *   town:   1,186,413 / 262,824
 *   city:   1,915,679 / 195,950
 *   mega:   2,825,687 / 175,964
 *   region: 3,143,489 / 205,960
 * Measure first, then raise these if a deliberate change needs more room.
 */
const TRIANGLE_CAPS: Record<MapId, { whole: number; near: number }> = {
  town: { whole: 1_365_000, near: 303_000 },
  city: { whole: 2_204_000, near: 226_000 },
  mega: { whole: 3_250_000, near: 203_000 },
  region: { whole: 3_616_000, near: 237_000 },
};

describe('triangles per map', () => {
  for (const map of ['town', 'city', 'mega', 'region'] as MapId[]) {
    it(`${map} stays under its triangle cap, whole and near the middle`, () => {
      const { whole, near } = triangleTotals(map);
      const cap = TRIANGLE_CAPS[map];
      expect(whole).toBeLessThanOrEqual(cap.whole);
      expect(near).toBeLessThanOrEqual(cap.near);
    });
  }
});

// ---------------------------------------------------------------------------
// Model build work (the flush pass)
// ---------------------------------------------------------------------------

/**
 * `Kit.build()` runs `separateFlush`, which calls `flushClashes` to find
 * faces that would flicker and lifts them apart, looping until none are left
 * (up to 12 passes). Its cost is the facet pairs it compares, not time —
 * `flushCompareCount` (a test-only counter in kit.ts) tallies exactly that.
 * A regression that made the flush check quadratically slower once doubled
 * build time; this catches the same regression without timing anything.
 *
 * Cap: about 15% above 16,431, the compare count building every kind and
 * variant once (its default height), measured on 2026-09-30.
 */
const FLUSH_COMPARE_CAP = 18_900;

describe('model build work', () => {
  it('keeps the flush pass cheap while building every kind and variant once', () => {
    resetFlushCompareCount();
    for (const kind of Object.keys(KINDS) as PropKind[]) {
      const info = KINDS[kind];
      for (let v = 0; v < info.variants; v++) {
        try {
          buildKindGeometry(kind, v);
        } catch {
          // A kind without a model yet is covered by props.test.ts's budget test.
          continue;
        }
      }
    }
    expect(flushCompareCount).toBeLessThanOrEqual(FLUSH_COMPARE_CAP);
  });
});

// ---------------------------------------------------------------------------
// The menu and a round share models
// ---------------------------------------------------------------------------

describe('the model cache', () => {
  it('builds each placed kind once, and reuses it for the next scene', () => {
    // A full city stands in for "the menu, then a round": both ask for the
    // same set of models. `modelFor` is the module-level cache in
    // three/models.ts that every scene draws from, so this needs no WebGL context.
    const city = createCity(seededRng(7), 'region');
    const first = new Map<string, ReturnType<typeof modelFor>>();
    for (const p of city.props) {
      const { key, h } = modelKey(p.kind, p.variant, p.hScale);
      if (!first.has(key)) first.set(key, modelFor(p.kind, p.variant, h));
    }
    // Asking again (as a round would, right after the menu) must return the
    // exact object already in the cache, not a freshly built one.
    for (const p of city.props) {
      const { key, h } = modelKey(p.kind, p.variant, p.hScale);
      expect(modelFor(p.kind, p.variant, h)).toBe(first.get(key));
    }
  });
});
