import { describe, expect, it } from 'vitest';

import { evaluateNavalEvidence } from './caribbean-naval-evidence.mjs';

function healthyEvidence(overrides = {}) {
  const samples = Array.from({ length: 20 }, (_, index) => ({
    tick: (index + 1) * 60,
    paused: false,
    outcome: null,
    textures: 3,
    geometries: 30,
    materials: 30,
    bufferAttributes: 88,
    activeEffects: index % 4 === 0 ? 5 : 0,
    effectCapacity: 96,
  }));
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
        bufferAttributes: 0,
        activeEffects: 5,
        effectCapacity: 0,
      },
      observedSeconds: 20,
      samples,
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
    scenario: {
      ok: true,
      outcome: 'boarding-ready',
      elapsedBrowserSeconds: 1.5,
      initial: {
        distance: 7.02,
        outcomeInjected: false,
        damageInjectedAfterStart: false,
        timeInjected: false,
        opponent: { hull: 72, sails: 30, crew: 18, cannon: 6 },
      },
    },
    fallback: { ok: true, chart: true, retry: true, restart: true, battleControls: true, labelsClear: true },
    motion: {
      normal: { preference: 'no-preference', reducedMotion: false, shipIntermediateFrames: 12, cameraIntermediateFrames: 9 },
      reduced: { preference: 'reduce', reducedMotion: true, shipSnaps: 4, cameraSnaps: 2 },
    },
    display: {
      supported: {
        desktop: { viewport: { width: 1440, height: 900 }, battle: true, notice: false, fullBleed: true, centerClear: true, controlsVisible: true, noOuterScroll: true, minimumActionFontSize: 14, sailControl: true },
        tablet: { viewport: { width: 1180, height: 820 }, battle: true, notice: false, fullBleed: true, centerClear: true, controlsVisible: true, noOuterScroll: true, minimumActionFontSize: 14, sailControl: true },
        minimum: { viewport: { width: 1024, height: 768 }, battle: true, notice: false, fullBleed: true, centerClear: true, controlsVisible: true, noOuterScroll: true, minimumActionFontSize: 14, sailControl: true },
        boundary: { viewport: { width: 960, height: 600 }, battle: true, notice: false, fullBleed: true, centerClear: true, controlsVisible: true, noOuterScroll: true, minimumActionFontSize: 14, sailControl: true },
      },
      unsupported: {
        portrait: { viewport: { width: 430, height: 932 }, notice: true, battle: false, liveFrame: false, focused: true },
        landscape: { viewport: { width: 844, height: 390 }, notice: true, battle: false, liveFrame: false, focused: true },
      },
      resize: { notice: true, noticeFocused: true, battleUnmounted: true, tickStopped: true, restoredWithNewSession: true },
      prebattle: {
        decision: { legendComplete: true, ctaVisible: true, noOuterScroll: true },
        briefing: { legendComplete: true, ctaVisible: true, noOuterScroll: true },
      },
    },
    ...overrides,
  };
}

function without(object, ...path) {
  const copy = structuredClone(object);
  const parent = path.slice(0, -1).reduce((value, key) => value[key], copy);
  delete parent[path.at(-1)];
  return copy;
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
    ['consoleErrors', 'console errors'],
    ['pageErrors', 'page errors'],
    ['requestFailures', 'request failures'],
    ['unhandledRejections', 'unhandled rejections'],
  ])('fails closed when %s is missing, non-array, or contains a non-string', (field, label) => {
    expect(evaluateNavalEvidence(without(healthyEvidence(), field)).issues).toContain(`${label} must be an array`);
    expect(evaluateNavalEvidence(healthyEvidence({ [field]: field === 'consoleErrors' ? 1 : {} })).issues).toContain(`${label} must be an array`);
    expect(evaluateNavalEvidence(healthyEvidence({ [field]: [12] })).issues).toContain(`${label} contains malformed entries`);
  });

  it.each([
    ['missing asset request', { expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb', requestedPaths: [], remoteDependencies: [] }],
    ['different hashed asset request', { expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb', requestedPaths: ['/assets/caribbean-sloop-wrong.glb'], remoteDependencies: [] }],
    ['remote dependency', { expectedPath: '/assets/caribbean-sloop-CQMe92wZ.glb', requestedPaths: ['/assets/caribbean-sloop-CQMe92wZ.glb'], remoteDependencies: ['https://cdn.example/sea.png'] }],
  ])('fails on %s', (_label, asset) => {
    expect(evaluateNavalEvidence(healthyEvidence({ asset })).ok).toBe(false);
  });

  it.each([
    ['asset object', without(healthyEvidence(), 'asset'), 'asset evidence is missing'],
    ['expected path', without(healthyEvidence(), 'asset', 'expectedPath'), 'expected hashed GLB path is malformed'],
    ['requested paths', without(healthyEvidence(), 'asset', 'requestedPaths'), 'asset requested paths must be an array'],
    ['requested path entry', healthyEvidence({ asset: { ...healthyEvidence().asset, requestedPaths: [12] } }), 'asset requested paths contain malformed entries'],
    ['remote dependencies', without(healthyEvidence(), 'asset', 'remoteDependencies'), 'remote dependencies must be an array'],
    ['remote dependency entry', healthyEvidence({ asset: { ...healthyEvidence().asset, remoteDependencies: [12] } }), 'remote dependencies contain malformed entries'],
  ])('fails closed on malformed %s evidence', (_label, evidence, reason) => {
    expect(evaluateNavalEvidence(evidence).issues).toContain(reason);
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

  it.each([
    ['missing', without(healthyEvidence(), 'performance', 'fpsSamples'), 'FPS samples must be a non-empty array'],
    ['non-array', healthyEvidence({ performance: { ...healthyEvidence().performance, fpsSamples: 60 } }), 'FPS samples must be a non-empty array'],
    ['empty', healthyEvidence({ performance: { ...healthyEvidence().performance, fpsSamples: [] } }), 'FPS samples must be a non-empty array'],
    ['NaN', healthyEvidence({ performance: { ...healthyEvidence().performance, fpsSamples: [Number.NaN] } }), 'FPS samples contain invalid values'],
    ['infinity', healthyEvidence({ performance: { ...healthyEvidence().performance, fpsSamples: [Number.POSITIVE_INFINITY] } }), 'FPS samples contain invalid values'],
    ['negative', healthyEvidence({ performance: { ...healthyEvidence().performance, fpsSamples: [-1] } }), 'FPS samples contain invalid values'],
  ])('fails closed on %s FPS samples', (_label, evidence, reason) => {
    expect(evaluateNavalEvidence(evidence).issues).toContain(reason);
  });

  it.each(['textures', 'geometries', 'materials', 'effectCapacity'])('fails when %s grows after warm-up', (resource) => {
    const growthAfterWarmup = { textures: 0, geometries: 0, materials: 0, activeEffects: 0, effectCapacity: 0, [resource]: 1 };
    expect(evaluateNavalEvidence(healthyEvidence({ resources: { growthAfterWarmup, allocationErrors: [], capacityErrors: [], poolErrors: [] } })).ok).toBe(false);
  });

  it('accepts active-effect counts rising and falling inside a fixed pool', () => {
    expect(evaluateNavalEvidence(healthyEvidence()).ok).toBe(true);
  });

  it('requires the buffer-attribute class to be present, integral, and stable', () => {
    const missing = healthyEvidence();
    delete missing.resources.samples[4].bufferAttributes;
    expect(evaluateNavalEvidence(missing).issues).toContain('resource sample 4 bufferAttributes is invalid');
    const growth = healthyEvidence();
    growth.resources.growthAfterWarmup.bufferAttributes = 1;
    expect(evaluateNavalEvidence(growth).issues).toContain('bufferAttributes grew after warm-up');
  });

  it.each([
    ['resource object', without(healthyEvidence(), 'resources'), 'resource evidence is missing'],
    ['observation duration', without(healthyEvidence(), 'resources', 'observedSeconds'), 'resource observation must last 20 seconds'],
    ['samples', without(healthyEvidence(), 'resources', 'samples'), 'resource samples must contain 20 observations'],
    ['allocation errors', without(healthyEvidence(), 'resources', 'allocationErrors'), 'allocation errors must be an array'],
    ['capacity errors', without(healthyEvidence(), 'resources', 'capacityErrors'), 'capacity errors must be an array'],
    ['pool errors', without(healthyEvidence(), 'resources', 'poolErrors'), 'pool errors must be an array'],
  ])('fails closed on malformed %s', (_label, evidence, reason) => {
    expect(evaluateNavalEvidence(evidence).issues).toContain(reason);
  });

  it('requires an unpaused, advancing active simulation for all 20 resource samples', () => {
    const paused = healthyEvidence();
    paused.resources.samples[8].paused = true;
    expect(evaluateNavalEvidence(paused).issues).toContain('resource sample 8 is paused');

    const stagnant = healthyEvidence();
    stagnant.resources.samples[9].tick = stagnant.resources.samples[8].tick;
    expect(evaluateNavalEvidence(stagnant).issues).toContain('resource simulation did not advance at sample 9');

    const idle = healthyEvidence();
    idle.resources.samples.forEach((sample) => { sample.activeEffects = 0; });
    expect(evaluateNavalEvidence(idle).issues).toContain('resource observation contained no active effects');

    const resolved = healthyEvidence();
    resolved.resources.samples[11].outcome = 'sunk';
    expect(evaluateNavalEvidence(resolved).issues).toContain('resource sample 11 is not an unresolved battle');
  });

  it.each([
    ['negative active count', 'activeEffects', -1, 'resource sample 6 activeEffects is invalid'],
    ['NaN active count', 'activeEffects', Number.NaN, 'resource sample 6 activeEffects is invalid'],
    ['fractional capacity', 'effectCapacity', 95.5, 'resource sample 6 effectCapacity is invalid'],
    ['over-cap active count', 'activeEffects', 97, 'resource sample 6 exceeds effect capacity'],
  ])('validates every active sample: %s', (_label, field, value, reason) => {
    const evidence = healthyEvidence();
    evidence.resources.samples[6][field] = value;
    expect(evaluateNavalEvidence(evidence).issues).toContain(reason);
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

  it.each(Object.keys(healthyEvidence().handedness).filter((field) => !['port', 'starboard'].includes(field)))(
    'fails closed when handedness.%s is missing',
    (field) => {
      expect(evaluateNavalEvidence(without(healthyEvidence(), 'handedness', field)).ok).toBe(false);
    },
  );

  it.each([
    ['scenario shell', { scenario: { ok: true, outcome: 'boarding-ready' } }],
    ['missing scenario', { scenario: undefined }],
    ['NaN scenario time', { scenario: { ...healthyEvidence().scenario, elapsedBrowserSeconds: Number.NaN } }],
    ['negative scenario time', { scenario: { ...healthyEvidence().scenario, elapsedBrowserSeconds: -1 } }],
    ['fallback shell', { fallback: { ok: true } }],
    ['missing fallback', { fallback: undefined }],
    ['false chart proof', { fallback: { ...healthyEvidence().fallback, chart: false } }],
    ['overlapping fallback copy', { fallback: { ...healthyEvidence().fallback, labelsClear: false } }],
  ])('fails closed on malformed %s proof', (_label, override) => {
    expect(evaluateNavalEvidence(healthyEvidence(override)).ok).toBe(false);
  });

  it.each([
    ['scenario execution fails', { scenario: { ok: false, outcome: null } }],
    ['boarding-ready is not reached', { scenario: { ok: true, outcome: 'surrender' } }],
    ['fallback controls fail', { fallback: { ok: false } }],
  ])('fails when %s', (_label, override) => {
    expect(evaluateNavalEvidence(healthyEvidence(override)).ok).toBe(false);
  });

  it('accepts only the exact supported and warning-state viewport matrix', () => {
    expect(evaluateNavalEvidence(healthyEvidence()).ok).toBe(true);
    const wrongBoundary = healthyEvidence();
    wrongBoundary.display.supported.minimum.viewport.width = 959;
    expect(evaluateNavalEvidence(wrongBoundary).issues).toContain('display supported minimum viewport is not 1024x768');
    const livePhone = healthyEvidence();
    livePhone.display.unsupported.portrait.liveFrame = true;
    expect(evaluateNavalEvidence(livePhone).issues).toContain('display unsupported portrait liveFrame must be false');
  });

  it('fails closed on absent motion, undersized action type, missing sail, clipped briefing, or unfocused notice', () => {
    for (const mutate of [
      (e) => { e.motion.normal.shipIntermediateFrames = 0; },
      (e) => { e.motion.reduced.cameraSnaps = 0; },
      (e) => { e.display.supported.boundary.minimumActionFontSize = 13.99; },
      (e) => { e.display.supported.boundary.sailControl = false; },
      (e) => { e.display.prebattle.briefing.ctaVisible = false; },
      (e) => { e.display.prebattle.briefing.legendComplete = false; },
      (e) => { e.display.unsupported.portrait.focused = false; },
      (e) => { e.display.resize.noticeFocused = false; },
    ]) {
      const evidence = healthyEvidence();
      mutate(evidence);
      expect(evaluateNavalEvidence(evidence).ok).toBe(false);
    }
  });

  it.each([
    ['display record', without(healthyEvidence(), 'display'), 'display evidence is missing'],
    ['desktop proof', without(healthyEvidence(), 'display', 'supported', 'desktop'), 'display supported desktop evidence is missing'],
    ['boundary proof', without(healthyEvidence(), 'display', 'supported', 'boundary'), 'display supported boundary evidence is missing'],
    ['phone notice', { ...healthyEvidence(), display: { ...healthyEvidence().display, unsupported: { ...healthyEvidence().display.unsupported, portrait: { ...healthyEvidence().display.unsupported.portrait, notice: false } } } }, 'display unsupported portrait notice must be true'],
    ['resize disposal', { ...healthyEvidence(), display: { ...healthyEvidence().display, resize: { ...healthyEvidence().display.resize, tickStopped: false } } }, 'display resize tickStopped must be true'],
  ])('fails closed on malformed %s', (_label, evidence, reason) => {
    expect(evaluateNavalEvidence(evidence).issues).toContain(reason);
  });
});
