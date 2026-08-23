import { describe, expect, it } from 'vitest';

import { evaluateNavalEvidence } from './caribbean-naval-evidence.mjs';

function healthyEvidence(overrides = {}) {
  return {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    unhandledRejections: [],
    asset: {
      expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb',
      requestedPaths: ['/assets/caribbean-sloop-CQMe92wZ.glb'],
      remoteDependencies: [],
    },
    performance: {
      fpsSamples: [50, 52, 60],
      sustainedFps: 50,
      maxDrawCalls: 120,
      maxTriangles: 100_000,
    },
    resources: {
      growthAfterWarmup: {
        textures: 0,
        geometries: 0,
        materials: 0,
        activeEffects: 0,
        effectCapacity: 0,
      },
      allocationErrors: [],
      capacityErrors: [],
      poolErrors: [],
    },
    handedness: {
      portVectorX: 1,
      starboardVectorX: -1,
      portMuzzleOriginX: 6,
      starboardMuzzleOriginX: -6,
      steeringPortHeadingDelta: 0.01,
      steeringStarboardHeadingDelta: -0.01,
      staleRudder: false,
    },
    scenario: { ok: true, outcome: 'boarding-ready' },
    fallback: { ok: true },
    ...overrides,
  };
}

describe('evaluateNavalEvidence', () => {
  it('accepts every exact technical boundary', () => {
    expect(evaluateNavalEvidence(healthyEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ['console error', { consoleErrors: ['WebGL exploded'] }],
    ['page error', { pageErrors: ['uncaught render error'] }],
    ['request failure', { requestFailures: ['GET /missing.glb'] }],
    ['unhandled rejection', { unhandledRejections: ['loader rejected'] }],
  ])('fails on a %s', (_label, override) => {
    expect(evaluateNavalEvidence(healthyEvidence(override)).ok).toBe(false);
  });

  it.each([
    ['missing asset request', { expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb', requestedPaths: [], remoteDependencies: [] }],
    ['different hashed asset request', { expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb', requestedPaths: ['/assets/caribbean-sloop-wrong.glb'], remoteDependencies: [] }],
    ['remote dependency', { expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb', requestedPaths: ['/assets/caribbean-sloop-CQMe92wZ.glb'], remoteDependencies: ['https://cdn.example/sea.png'] }],
  ])('fails on %s', (_label, asset) => {
    expect(evaluateNavalEvidence(healthyEvidence({ asset })).ok).toBe(false);
  });

  it('accepts 120 calls and 100,000 triangles but rejects the first value above each cap', () => {
    expect(evaluateNavalEvidence(healthyEvidence()).ok).toBe(true);
    expect(evaluateNavalEvidence(healthyEvidence({ performance: { fpsSamples: [60], sustainedFps: 60, maxDrawCalls: 121, maxTriangles: 100_000 } })).ok).toBe(false);
    expect(evaluateNavalEvidence(healthyEvidence({ performance: { fpsSamples: [60], sustainedFps: 60, maxDrawCalls: 120, maxTriangles: 100_001 } })).ok).toBe(false);
  });

  it.each([
    ['negative draw calls', { maxDrawCalls: -1, maxTriangles: 100_000 }],
    ['negative triangles', { maxDrawCalls: 120, maxTriangles: -1 }],
    ['NaN draw calls', { maxDrawCalls: Number.NaN, maxTriangles: 100_000 }],
    ['missing triangles', { maxDrawCalls: 120 }],
  ])('rejects malformed performance evidence: %s', (_label, counters) => {
    expect(evaluateNavalEvidence(healthyEvidence({ performance: {
      fpsSamples: [60], sustainedFps: 60, ...counters,
    } })).ok).toBe(false);
  });

  it('accepts sustained 50 FPS and rejects sustained 49.99 FPS', () => {
    expect(evaluateNavalEvidence(healthyEvidence()).ok).toBe(true);
    expect(evaluateNavalEvidence(healthyEvidence({ performance: { fpsSamples: [49.99], sustainedFps: 49.99, maxDrawCalls: 120, maxTriangles: 100_000 } })).ok).toBe(false);
  });

  it.each(['textures', 'geometries', 'materials', 'activeEffects', 'effectCapacity'])('fails when %s grows after warm-up', (resource) => {
    const growthAfterWarmup = { textures: 0, geometries: 0, materials: 0, activeEffects: 0, effectCapacity: 0, [resource]: 1 };
    expect(evaluateNavalEvidence(healthyEvidence({ resources: { growthAfterWarmup, allocationErrors: [], capacityErrors: [], poolErrors: [] } })).ok).toBe(false);
  });

  it.each(['allocationErrors', 'capacityErrors', 'poolErrors'])('fails when %s is non-empty', (field) => {
    expect(evaluateNavalEvidence(healthyEvidence({ resources: {
      growthAfterWarmup: { textures: 0, geometries: 0, materials: 0, activeEffects: 0, effectCapacity: 0 },
      allocationErrors: [], capacityErrors: [], poolErrors: [], [field]: ['failure'],
    } })).ok).toBe(false);
  });

  it.each([
    ['port vector is not exactly +X', { portVectorX: 0.999 }],
    ['starboard vector is not exactly -X', { starboardVectorX: -0.999 }],
    ['port muzzle is not on +X', { portMuzzleOriginX: 0 }],
    ['starboard muzzle is not on -X', { starboardMuzzleOriginX: 0 }],
    ['A does not increase heading', { steeringPortHeadingDelta: 0 }],
    ['D does not decrease heading', { steeringStarboardHeadingDelta: 0 }],
    ['rudder remains held after release', { staleRudder: true }],
  ])('fails when %s', (_label, handednessOverride) => {
    expect(evaluateNavalEvidence(healthyEvidence({ handedness: {
      ...healthyEvidence().handedness,
      ...handednessOverride,
    } })).ok).toBe(false);
  });

  it.each([
    ['missing port vector', { portVectorX: undefined }],
    ['NaN port vector', { portVectorX: Number.NaN }],
    ['NaN starboard vector', { starboardVectorX: Number.NaN }],
    ['NaN port muzzle', { portMuzzleOriginX: Number.NaN }],
    ['NaN starboard muzzle', { starboardMuzzleOriginX: Number.NaN }],
    ['NaN port turn', { steeringPortHeadingDelta: Number.NaN }],
    ['NaN starboard turn', { steeringStarboardHeadingDelta: Number.NaN }],
  ])('rejects malformed handedness evidence: %s', (_label, handednessOverride) => {
    expect(evaluateNavalEvidence(healthyEvidence({ handedness: {
      ...healthyEvidence().handedness,
      ...handednessOverride,
    } })).ok).toBe(false);
  });

  it.each([
    ['scenario execution fails', { scenario: { ok: false, outcome: null } }],
    ['boarding-ready is not reached', { scenario: { ok: true, outcome: 'surrender' } }],
    ['fallback controls fail', { fallback: { ok: false } }],
  ])('fails when %s', (_label, override) => {
    expect(evaluateNavalEvidence(healthyEvidence(override)).ok).toBe(false);
  });
});
