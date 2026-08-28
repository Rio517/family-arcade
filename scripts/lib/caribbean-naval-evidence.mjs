const DRAW_CALL_CAP = 120;
const TRIANGLE_CAP = 100_000;
const SUSTAINED_FPS_FLOOR = 50;
const OBSERVATION_SECONDS = 20;
const HASHED_GLB_PATTERN = /^\/assets\/caribbean-sloop-[A-Za-z0-9_-]+\.glb$/;
const DISPLAY_VIEWPORTS = {
  supported: {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 1180, height: 820 },
    minimum: { width: 1024, height: 768 },
    boundary: { width: 960, height: 600 },
  },
  unsupported: {
    portrait: { width: 430, height: 932 },
    landscape: { width: 844, height: 390 },
  },
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateStringArray(issues, value, label, malformedVerb = 'contains') {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be an array`);
    return false;
  }
  if (value.some((item) => typeof item !== 'string')) {
    issues.push(`${label} ${malformedVerb} malformed entries`);
    return false;
  }
  return true;
}

function addRecordedFailures(issues, label, failures) {
  if (validateStringArray(issues, failures, label) && failures.length > 0) {
    issues.push(`${label}: ${failures.length}`);
  }
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function validateResourceSamples(issues, samples) {
  if (!Array.isArray(samples) || samples.length !== OBSERVATION_SECONDS) {
    issues.push(`resource samples must contain ${OBSERVATION_SECONDS} observations`);
    return;
  }

  let previousTick = -1;
  let sawActiveEffects = false;
  for (const [index, sample] of samples.entries()) {
    if (!isRecord(sample)) {
      issues.push(`resource sample ${index} is malformed`);
      continue;
    }
    if (!Number.isInteger(sample.tick) || sample.tick < 0) {
      issues.push(`resource sample ${index} tick is invalid`);
    } else {
      if (sample.tick <= previousTick) issues.push(`resource simulation did not advance at sample ${index}`);
      previousTick = sample.tick;
    }
    if (sample.paused !== false) issues.push(`resource sample ${index} is paused`);
    if (sample.outcome !== null) issues.push(`resource sample ${index} is not an unresolved battle`);
    for (const field of ['textures', 'geometries', 'materials', 'bufferAttributes']) {
      if (!Number.isInteger(sample[field]) || sample[field] < 0) {
        issues.push(`resource sample ${index} ${field} is invalid`);
      }
    }
    if (!Number.isInteger(sample.activeEffects) || sample.activeEffects < 0) {
      issues.push(`resource sample ${index} activeEffects is invalid`);
    } else if (sample.activeEffects > 0) {
      sawActiveEffects = true;
    }
    if (!Number.isInteger(sample.effectCapacity) || sample.effectCapacity <= 0) {
      issues.push(`resource sample ${index} effectCapacity is invalid`);
    } else if (Number.isInteger(sample.activeEffects) && sample.activeEffects > sample.effectCapacity) {
      issues.push(`resource sample ${index} exceeds effect capacity`);
    }
  }
  if (!sawActiveEffects) issues.push('resource observation contained no active effects');
}

function validateDisplayEvidence(issues, display) {
  if (!isRecord(display)) {
    issues.push('display evidence is missing');
    return;
  }
  for (const [name, expectedViewport] of Object.entries(DISPLAY_VIEWPORTS.supported)) {
    const sample = isRecord(display.supported?.[name]) ? display.supported[name] : null;
    if (!sample) {
      issues.push(`display supported ${name} evidence is missing`);
      continue;
    }
    if (sample.viewport?.width !== expectedViewport.width || sample.viewport?.height !== expectedViewport.height) {
      issues.push(`display supported ${name} viewport is not ${expectedViewport.width}x${expectedViewport.height}`);
    }
    for (const field of ['battle', 'fullBleed', 'centerClear', 'controlsVisible', 'noOuterScroll']) {
      if (sample[field] !== true) issues.push(`display supported ${name} ${field} must be true`);
    }
    if (!Number.isFinite(sample.minimumActionFontSize) || sample.minimumActionFontSize < 14) {
      issues.push(`display supported ${name} action font must be at least 14px`);
    }
    if (!Array.isArray(sample.measuredActionControls)
      || sample.measuredActionControls.some((id) => typeof id !== 'string')
      || !sample.measuredActionControls.includes('naval-pause')) {
      issues.push(`display supported ${name} measured actions must include naval-pause`);
    }
    if (sample.sailControl !== true) issues.push(`display supported ${name} sailControl must be true`);
    if (sample.notice !== false) issues.push(`display supported ${name} notice must be false`);
  }
  for (const [name, expectedViewport] of Object.entries(DISPLAY_VIEWPORTS.unsupported)) {
    const sample = isRecord(display.unsupported?.[name]) ? display.unsupported[name] : null;
    if (!sample) {
      issues.push(`display unsupported ${name} evidence is missing`);
      continue;
    }
    if (sample.viewport?.width !== expectedViewport.width || sample.viewport?.height !== expectedViewport.height) {
      issues.push(`display unsupported ${name} viewport is not ${expectedViewport.width}x${expectedViewport.height}`);
    }
    if (sample.notice !== true) issues.push(`display unsupported ${name} notice must be true`);
    if (sample.focused !== true) issues.push(`display unsupported ${name} focused must be true`);
    for (const field of ['battle', 'liveFrame']) {
      if (sample[field] !== false) issues.push(`display unsupported ${name} ${field} must be false`);
    }
  }
  const resize = isRecord(display.resize) ? display.resize : {};
  for (const field of ['notice', 'noticeFocused', 'battleUnmounted', 'tickStopped', 'restoredWithNewSession']) {
    if (resize[field] !== true) issues.push(`display resize ${field} must be true`);
  }
  const prebattle = isRecord(display.prebattle) ? display.prebattle : {};
  for (const phase of ['decision', 'briefing']) {
    const sample = isRecord(prebattle[phase]) ? prebattle[phase] : {};
    for (const field of ['legendComplete', 'ctaVisible', 'noOuterScroll']) {
      if (sample[field] !== true) issues.push(`display prebattle ${phase} ${field} must be true`);
    }
  }
}

function validateMotionEvidence(issues, motion) {
  const normal = isRecord(motion?.normal) ? motion.normal : {};
  if (normal.preference !== 'no-preference') issues.push('normal motion preference must be no-preference');
  if (normal.reducedMotion !== false) issues.push('normal scene must report reducedMotion false');
  if (!Number.isInteger(normal.shipIntermediateFrames) || normal.shipIntermediateFrames <= 0) {
    issues.push('normal scene did not observe intermediate ship frames');
  }
  if (!Number.isInteger(normal.cameraIntermediateFrames) || normal.cameraIntermediateFrames <= 0) {
    issues.push('normal scene did not observe intermediate camera frames');
  }
  const reduced = isRecord(motion?.reduced) ? motion.reduced : {};
  if (reduced.preference !== 'reduce') issues.push('reduced motion preference must be reduce');
  if (reduced.reducedMotion !== true) issues.push('reduced scene must report reducedMotion true');
  if (!Number.isInteger(reduced.shipSnaps) || reduced.shipSnaps <= 0) {
    issues.push('reduced scene did not observe ship snaps');
  }
  if (!Number.isInteger(reduced.cameraSnaps) || reduced.cameraSnaps <= 0) {
    issues.push('reduced scene did not observe camera snaps');
  }
}

export function evaluateNavalEvidence(evidence) {
  const issues = [];
  const input = isRecord(evidence) ? evidence : {};

  addRecordedFailures(issues, 'console errors', input.consoleErrors);
  addRecordedFailures(issues, 'page errors', input.pageErrors);
  addRecordedFailures(issues, 'request failures', input.requestFailures);
  addRecordedFailures(issues, 'unhandled rejections', input.unhandledRejections);

  const asset = isRecord(input.asset) ? input.asset : null;
  if (!asset) issues.push('asset evidence is missing');
  const expectedPath = asset?.expectedPath;
  if (typeof expectedPath !== 'string' || !HASHED_GLB_PATTERN.test(expectedPath)) {
    issues.push('expected hashed GLB path is malformed');
  }
  const requestedPaths = asset?.requestedPaths;
  if (validateStringArray(issues, requestedPaths, 'asset requested paths', 'contain')
    && typeof expectedPath === 'string'
    && !requestedPaths.includes(expectedPath)) {
    issues.push('exact local hashed GLB was not requested');
  }
  const remoteDependencies = asset?.remoteDependencies;
  if (validateStringArray(issues, remoteDependencies, 'remote dependencies', 'contain') && remoteDependencies.length > 0) {
    issues.push('remote dependencies were requested');
  }

  const performance = isRecord(input.performance) ? input.performance : {};
  if (!Array.isArray(performance.fpsSamples) || performance.fpsSamples.length === 0) {
    issues.push('FPS samples must be a non-empty array');
  } else if (performance.fpsSamples.some((sample) => !finiteNonNegative(sample))) {
    issues.push('FPS samples contain invalid values');
  }
  if (!finiteNonNegative(performance.maxDrawCalls) || performance.maxDrawCalls > DRAW_CALL_CAP) {
    issues.push(`draw calls exceed ${DRAW_CALL_CAP}`);
  }
  if (!finiteNonNegative(performance.maxTriangles) || performance.maxTriangles > TRIANGLE_CAP) {
    issues.push(`triangles exceed ${TRIANGLE_CAP}`);
  }
  if (!finiteNonNegative(performance.sustainedFps) || performance.sustainedFps < SUSTAINED_FPS_FLOOR) {
    issues.push(`sustained FPS below ${SUSTAINED_FPS_FLOOR}`);
  }

  const resources = isRecord(input.resources) ? input.resources : null;
  if (!resources) issues.push('resource evidence is missing');
  if (resources?.observedSeconds !== OBSERVATION_SECONDS) {
    issues.push(`resource observation must last ${OBSERVATION_SECONDS} seconds`);
  }
  validateResourceSamples(issues, resources?.samples);
  const growth = isRecord(resources?.growthAfterWarmup) ? resources.growthAfterWarmup : {};
  for (const name of ['textures', 'geometries', 'materials', 'bufferAttributes', 'effectCapacity']) {
    if (!Number.isFinite(growth[name]) || growth[name] !== 0) {
      issues.push(`${name} grew after warm-up`);
    }
  }
  if (!finiteNonNegative(growth.activeEffects)) issues.push('activeEffects range is invalid');
  addRecordedFailures(issues, 'allocation errors', resources?.allocationErrors);
  addRecordedFailures(issues, 'capacity errors', resources?.capacityErrors);
  addRecordedFailures(issues, 'pool errors', resources?.poolErrors);

  const handedness = isRecord(input.handedness) ? input.handedness : {};
  if (!Number.isFinite(handedness.portVectorX) || Math.abs(handedness.portVectorX - 1) > 1e-9) issues.push('port vector is not +X');
  if (!Number.isFinite(handedness.starboardVectorX) || Math.abs(handedness.starboardVectorX + 1) > 1e-9) issues.push('starboard vector is not -X');
  if (!Number.isFinite(handedness.portMuzzleOriginX) || !(handedness.portMuzzleOriginX > 0)) issues.push('port muzzle is not on +X');
  if (!Number.isFinite(handedness.starboardMuzzleOriginX) || !(handedness.starboardMuzzleOriginX < 0)) issues.push('starboard muzzle is not on -X');
  if (!Number.isFinite(handedness.steeringPortHeadingDelta) || !(handedness.steeringPortHeadingDelta > 0)) issues.push('A did not turn physically to port');
  if (!Number.isFinite(handedness.steeringStarboardHeadingDelta) || !(handedness.steeringStarboardHeadingDelta < 0)) issues.push('D did not turn physically to starboard');
  if (handedness.staleRudder !== false) issues.push('rudder remained active after release');

  const scenario = isRecord(input.scenario) ? input.scenario : {};
  if (scenario.ok !== true) issues.push('deterministic scenario failed');
  if (scenario.outcome !== 'boarding-ready') issues.push('boarding-ready outcome not reached');
  if (!finiteNonNegative(scenario.elapsedBrowserSeconds) || scenario.elapsedBrowserSeconds >= 15) {
    issues.push('boarding-ready browser time is invalid');
  }
  const initial = isRecord(scenario.initial) ? scenario.initial : {};
  if (!Number.isFinite(initial.distance) || initial.distance <= 7) issues.push('boarding scenario initial distance is invalid');
  for (const field of ['outcomeInjected', 'damageInjectedAfterStart', 'timeInjected']) {
    if (initial[field] !== false) issues.push(`boarding scenario ${field} proof is invalid`);
  }
  const opponent = isRecord(initial.opponent) ? initial.opponent : {};
  for (const field of ['hull', 'sails', 'crew', 'cannon']) {
    if (!finiteNonNegative(opponent[field])) issues.push(`boarding scenario opponent ${field} is invalid`);
  }

  const fallback = isRecord(input.fallback) ? input.fallback : {};
  if (fallback.ok !== true) issues.push('WebGL fallback controls failed');
  for (const field of ['chart', 'retry', 'restart', 'battleControls', 'labelsClear']) {
    if (fallback[field] !== true) issues.push(`fallback ${field} was not observed`);
  }

  validateMotionEvidence(issues, input.motion);
  validateDisplayEvidence(issues, input.display);

  return { ok: issues.length === 0, issues };
}
