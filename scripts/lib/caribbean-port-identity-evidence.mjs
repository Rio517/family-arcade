import { createHash } from 'node:crypto';

const RETAINED_V1_SECTIONS = [
  'browser',
  'route',
  'build',
  'viewports',
  'fixtures',
  'webLocks',
  'journey',
  'accessibility',
  'profile',
  'art',
  'market',
  'requests',
  'failures',
  'isolation',
  'recovery',
  'screenshots',
  'determinism',
];

const V3_FIELDS = [
  ...RETAINED_V1_SECTIONS,
  'schemaVersion',
  'packagePhase',
  'profileIdentity',
  'marketStability',
  'strategicSailing',
  'screenshotEvidence',
  'mapNetwork',
];

const STRATEGIC_MODE_SEQUENCE = Object.freeze([
  'port', 'sailing', 'encounter', 'port', 'sailing', 'encounter', 'naval', 'port',
]);
const STRATEGIC_EVENT_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
const STRATEGIC_EVENT_TYPES = Object.freeze([
  'lead-accepted', 'voyage-started', 'sea-leg-completed', 'encounter-avoided',
  'voyage-started', 'sea-leg-completed', 'naval-engaged', 'naval-resolved',
]);
const STRATEGIC_SCREENSHOTS = Object.freeze([
  'sailing-desktop.png',
  'encounter-desktop.png',
  'campaign-battle-desktop.png',
  'campaign-result-desktop.png',
  'returned-log-desktop.png',
  'sailing-minimum-supported.png',
  'campaign-battle-fallback.png',
  'sailing-large-portrait-notice.png',
  'campaign-battle-resize-notice.png',
]);
const STRATEGIC_VIEWPORTS = Object.freeze({
  sailingDesktop: Object.freeze({ width: 1440, height: 900, supported: true, noticeOnly: false }),
  encounterDesktop: Object.freeze({ width: 1440, height: 900, supported: true, noticeOnly: false }),
  battleDesktop: Object.freeze({ width: 1440, height: 900, supported: true, noticeOnly: false }),
  sailingMinimumSupported: Object.freeze({ width: 960, height: 600, supported: true, noticeOnly: false }),
  battleFallback: Object.freeze({ width: 1440, height: 900, supported: true, noticeOnly: false }),
  sailingLargePortraitNotice: Object.freeze({ width: 1024, height: 1366, supported: false, noticeOnly: true }),
  battleResizeNotice: Object.freeze({ width: 1024, height: 1366, supported: false, noticeOnly: true }),
});

const FINAL_VIEWPORTS = Object.freeze({
  setupDesktop: Object.freeze({ width: 1440, height: 900, expectedSupported: true, controllerMounted: true, noticeVisible: false, noticeFocused: false }),
  profileDesktop: Object.freeze({ width: 1440, height: 900, expectedSupported: false, controllerMounted: false, noticeVisible: false, noticeFocused: false }),
  portDesktop: Object.freeze({ width: 1440, height: 900, expectedSupported: true, controllerMounted: true, noticeVisible: false, noticeFocused: false }),
  portTabletLandscape: Object.freeze({ width: 1180, height: 820, expectedSupported: true, controllerMounted: true, noticeVisible: false, noticeFocused: false }),
  portCompactLandscape: Object.freeze({ width: 1024, height: 768, expectedSupported: true, controllerMounted: true, noticeVisible: false, noticeFocused: false }),
  artFallback: Object.freeze({ width: 1440, height: 900, expectedSupported: true, controllerMounted: true, noticeVisible: false, noticeFocused: false }),
  minimumSupported: Object.freeze({ width: 960, height: 600, expectedSupported: true, controllerMounted: true, noticeVisible: false, noticeFocused: false }),
  minimumWidth: Object.freeze({ width: 959, height: 600, expectedSupported: false, controllerMounted: false, noticeVisible: true, noticeFocused: true }),
  minimumHeight: Object.freeze({ width: 960, height: 599, expectedSupported: false, controllerMounted: false, noticeVisible: true, noticeFocused: true }),
  largePortrait: Object.freeze({ width: 1024, height: 1366, expectedSupported: false, controllerMounted: false, noticeVisible: true, noticeFocused: true }),
});

const FINAL_SCREENSHOTS = Object.freeze([
  'setup-desktop.png', 'port-desktop.png', 'market-desktop.png', 'tavern-desktop.png',
  'captains-log-desktop.png', 'recovery-desktop.png', 'port-minimum-supported.png',
  'minimum-screen-width.png', 'minimum-screen-height.png', 'minimum-screen-large-portrait.png',
  'port-tablet-landscape.png', 'port-compact-landscape.png', 'port-art-fallback.png',
  'player-profile-desktop.png',
]);
const FINAL_ART_SHA256 = '0c1c99213d2903fb84a027a6f64508548c631b8fdefc6e41031e7954854ec67d';
const TERMINAL_RESULT_SCREENSHOT = 'campaign-result-desktop.png';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAMPLE_HASH_PATTERN = /^[a-f0-9]{8}$/;

export const EVIDENCE_CARGO_IDS = Object.freeze([
  'provisions', 'tools', 'luxuries', 'sugar-molasses', 'tobacco-dyewood', 'powder-arms',
]);

export const EXPECTED_MARKET_ACTION_IDS = Object.freeze(EVIDENCE_CARGO_IDS.flatMap((cargoId) => [
  'buy-1', 'buy-5', 'buy-max', 'sell-1', 'sell-5', 'sell-all',
].map((action) => `market-${cargoId}-${action}`)).sort());

export const ART_VIEWPORT_SPECS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900, focalX: 58, focalY: 50 }),
  Object.freeze({ name: 'wide', width: 1180, height: 820, focalX: 56, focalY: 50 }),
  Object.freeze({ name: 'tablet', width: 1024, height: 768, focalX: 54, focalY: 50 }),
  Object.freeze({ name: 'minimum', width: 960, height: 600, focalX: 52, focalY: 50 }),
]);

export const ART_CONTRAST_SELECTORS = Object.freeze([
  '.caribbean-port-status-rail dt',
  '.caribbean-port-status-rail dd',
  '.caribbean-port-captain',
  '.caribbean-port-stage h1',
  '.caribbean-port-bearing',
  '.caribbean-port-activity h2',
  '.caribbean-port-arrival',
  '.caribbean-port-action',
]);

export const ART_ACTIVITY_CONTRAST_SPECS = Object.freeze([
  Object.freeze({ selector: '.caribbean-market-price-cue--expensive', text: 'Expensive' }),
  Object.freeze({
    selector: '.caribbean-tavern-rumour blockquote',
    text: 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.',
  }),
  Object.freeze({
    selector: '.caribbean-log-action-label',
    text: 'NEXT ACTION',
  }),
  Object.freeze({
    selector: '.caribbean-log-action-copy',
    text: 'Sail east of Bridgetown and identify the Red Jackdaw.',
  }),
]);

export const ART_CAPTURE_FIXTURE_STATE = Object.freeze({
  gold: '500 gold',
  provisions: '3.4 months',
});

const ART_MENU_GEOMETRY_IDS = Object.freeze([
  'party-pill', 'port-position', 'port-fact-0', 'port-fact-1', 'port-fact-2', 'port-fact-3', 'port-fact-4',
  'port-stage-title', 'port-bearing', 'port-activity-heading',
  'port-action-governor', 'port-action-tavern', 'port-action-market', 'port-action-shipyard',
  'port-action-shares', 'port-action-log', 'port-action-set-sail', 'port-arrival',
].sort());

const ART_MARKET_GEOMETRY_IDS = Object.freeze([
  ...ART_MENU_GEOMETRY_IDS.filter((id) => id !== 'port-arrival'),
  ...EXPECTED_MARKET_ACTION_IDS,
  'port-close-activity',
].sort());

const MARKET_PHASES = ['before', 'pending', 'resolved'];
const MARKET_STATUS = {
  before: '',
  pending: 'Saving trade.',
  resolved: '',
};

const MARKET_SAMPLE_KEYS = ['phase', 'actionTestId', 'stage', 'rows', 'actionStrips', 'stageClientWidth', 'stageScrollWidth', 'rowsClientWidth', 'rowsScrollWidth', 'actionStripWidths', 'scrollLeft', 'scrollTop', 'focusedTestId', 'status', 'ariaBusy'];
const RECT_KEYS = ['x', 'y', 'width', 'height'];
const MARKET_STRIP_WIDTH_KEYS = ['testId', 'clientWidth', 'scrollWidth'];
const BOOTH_VIEWPORT_KEYS = ['viewport', 'activePronouns', 'labels', 'visibleText', 'controls', 'pageHorizontalOverflowPx', 'boothHorizontalOverflowPx', 'pageContained', 'boothContained', 'focusChecks'];
const BOOTH_TEXT_KEYS = ['text', 'fontPx'];
const BOOTH_CONTROL_KEYS = ['testId', 'label', 'width', 'height'];
const BOOTH_FOCUS_KEYS = ['testId', 'focused', 'visible'];
const ART_EMITTED_KEYS = ['url', 'contentType', 'precached'];
const ART_REPORT_KEYS = ['historicalReview', 'representationReview', 'subjectRoi', 'sha256'];
const ART_SCREENSHOT_KEYS = ['normal', 'fallback'];
const ART_VIEWPORT_KEYS = ['name', 'viewport', 'focal', 'naturalSize', 'fixtureState', 'contrasts', 'menuGeometry', 'marketGeometry', 'activityContrasts'];
const ART_VIEWPORT_SIZE_KEYS = ['width', 'height'];
const ART_FOCAL_KEYS = ['xPercent', 'yPercent', 'roiVisibleRatio'];
const ART_CONTRAST_KEYS = ['selector', 'minimumRatio', 'backgroundAlpha'];
const ART_ACTIVITY_CONTRAST_KEYS = ['selector', 'text', 'minimumRatio', 'backgroundAlpha'];
const ART_FIXTURE_KEYS = ['gold', 'provisions'];
const ART_GEOMETRY_KEYS = ['leaves', 'overlapPairs'];
const ART_LEAF_KEYS = ['id', 'contained', 'horizontalOverflowPx', 'verticalOverflowPx'];

const BOOTH_CONTROLS = [
  'booth-switch',
  'booth-edit-profile',
  'booth-new',
  'booth-profile-name',
  'booth-profile-pronouns',
  'booth-profile-save',
];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(issues, value, allowed, label) {
  if (!isRecord(value)) {
    issues.push(`${label} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`unknown ${label} field ${key}`);
  }
  return true;
}

function sameMembers(values, expected) {
  return Array.isArray(values)
    && values.length === expected.length
    && expected.every((value) => values.includes(value));
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validRect(value) {
  return isRecord(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && finiteNonNegative(value.width)
    && finiteNonNegative(value.height);
}

function rectDrift(left, right) {
  return Math.max(
    Math.abs(left.x - right.x),
    Math.abs(left.y - right.y),
    Math.abs(left.width - right.width),
    Math.abs(left.height - right.height),
  );
}

function sampleShapeErrors(sample) {
  const errors = [];
  if (!isRecord(sample)) return ['sample must be an object'];
  exactObject(errors, sample, MARKET_SAMPLE_KEYS, 'market sample');
  if (!MARKET_PHASES.includes(sample.phase)) errors.push('sample has an invalid phase');
  if (typeof sample.actionTestId !== 'string') errors.push('sample action id is missing');
  if (!exactObject(errors, sample.stage, RECT_KEYS, 'market sample stage') || !validRect(sample.stage)) errors.push('sample stage rectangle is malformed');
  if (!Array.isArray(sample.rows)) errors.push('sample rows must be an array');
  else if (sample.rows.length !== 6 || sample.rows.some((rect, index) => !exactObject(errors, rect, RECT_KEYS, `market sample row ${index}`) || !validRect(rect))) errors.push('sample rows must contain exactly six rectangles');
  if (!Array.isArray(sample.actionStrips)) errors.push('sample action strips must be an array');
  else if (sample.actionStrips.length !== 6 || sample.actionStrips.some((rect, index) => !exactObject(errors, rect, RECT_KEYS, `market sample action strip ${index}`) || !validRect(rect))) errors.push('sample action strips must contain exactly six rectangles');
  for (const field of ['stageClientWidth', 'stageScrollWidth', 'rowsClientWidth', 'rowsScrollWidth']) {
    if (!finiteNonNegative(sample[field])) errors.push(`sample ${field} is invalid`);
  }
  if (!Array.isArray(sample.actionStripWidths) || sample.actionStripWidths.length !== 6 || sample.actionStripWidths.some((entry, index) => (
    !exactObject(errors, entry, MARKET_STRIP_WIDTH_KEYS, `market sample action strip width ${index}`) || typeof entry.testId !== 'string'
      || !finiteNonNegative(entry.clientWidth) || !finiteNonNegative(entry.scrollWidth)
  ))) errors.push('sample action strip widths are malformed');
  if (!finiteNonNegative(sample.scrollLeft) || !finiteNonNegative(sample.scrollTop)) errors.push('sample scroll position is invalid');
  if (sample.focusedTestId !== sample.actionTestId) errors.push('sample did not retain action focus');
  if (sample.status !== MARKET_STATUS[sample.phase]) errors.push('sample status is wrong');
  if (sample.ariaBusy !== (sample.phase === 'pending')) errors.push('sample busy state is wrong');
  return errors;
}

export function validateMarketStability(samples, maxDrift = 1) {
  const errors = [];
  if (!Array.isArray(samples)) return { ok: false, errors: ['market samples must be an array'] };
  if (!Number.isFinite(maxDrift) || maxDrift < 0) return { ok: false, errors: ['max drift is invalid'] };
  if (samples.length !== EXPECTED_MARKET_ACTION_IDS.length * MARKET_PHASES.length) {
    errors.push('market sample count must be exactly 108');
  }
  const byAction = new Map();
  for (const sample of samples) {
    const shapeErrors = sampleShapeErrors(sample);
    if (shapeErrors.length > 0) errors.push(...shapeErrors);
    if (shapeErrors.length > 0 || !isRecord(sample)
      || typeof sample.actionTestId !== 'string' || !MARKET_PHASES.includes(sample.phase)) continue;
    const phaseMap = byAction.get(sample.actionTestId) ?? new Map();
    if (phaseMap.has(sample.phase)) errors.push(`duplicate ${sample.phase} sample for ${sample.actionTestId}`);
    phaseMap.set(sample.phase, sample);
    byAction.set(sample.actionTestId, phaseMap);
  }
  const actualIds = [...byAction.keys()].sort();
  if (!sameMembers(actualIds, EXPECTED_MARKET_ACTION_IDS)) errors.push('market action ids are not the exact expected set');
  for (const actionTestId of EXPECTED_MARKET_ACTION_IDS) {
    const phases = byAction.get(actionTestId);
    if (!phases || MARKET_PHASES.some((phase) => !phases.has(phase))) {
      errors.push(`market action ${actionTestId} is missing a phase`);
      continue;
    }
    const before = phases.get('before');
    for (const phase of ['pending', 'resolved']) {
      const current = phases.get(phase);
      if (!validRect(before.stage) || !validRect(current.stage)) continue;
      if (rectDrift(before.stage, current.stage) > maxDrift) errors.push(`${actionTestId} stage drift exceeds ${maxDrift}px`);
      if (before.rows.length !== current.rows.length || before.actionStrips.length !== current.actionStrips.length) {
        errors.push(`${actionTestId} row or action strip count changed`);
        continue;
      }
      for (let index = 0; index < before.rows.length; index += 1) {
        if (rectDrift(before.rows[index], current.rows[index]) > maxDrift) errors.push(`${actionTestId} row drift exceeds ${maxDrift}px`);
      }
      for (let index = 0; index < before.actionStrips.length; index += 1) {
        if (rectDrift(before.actionStrips[index], current.actionStrips[index]) > maxDrift) errors.push(`${actionTestId} action strip drift exceeds ${maxDrift}px`);
      }
    }
  }
  for (const sample of samples) {
    if (!isRecord(sample)) continue;
    if (finiteNonNegative(sample.stageScrollWidth) && finiteNonNegative(sample.stageClientWidth)
      && sample.stageScrollWidth > sample.stageClientWidth) errors.push('market stage overflows horizontally');
    if (finiteNonNegative(sample.rowsScrollWidth) && finiteNonNegative(sample.rowsClientWidth)
      && sample.rowsScrollWidth > sample.rowsClientWidth) errors.push('market rows overflow horizontally');
    if (sample.scrollLeft !== 0) errors.push('market stage scrolled horizontally');
    if (Array.isArray(sample.actionStripWidths) && sample.actionStripWidths.some((entry) => (
      isRecord(entry) && finiteNonNegative(entry.scrollWidth) && finiteNonNegative(entry.clientWidth)
        && entry.scrollWidth > entry.clientWidth
    ))) errors.push('market action strip overflows horizontally');
  }
  return errors.length === 0 ? { ok: true, maxDrift } : { ok: false, errors };
}

export function marketStabilityFailure(verdict) {
  if (!isRecord(verdict)) throw new Error('market stability failure is malformed');
  if (verdict.ok === true) return null;
  if (verdict.ok !== false || !Array.isArray(verdict.errors) || verdict.errors.some((error) => typeof error !== 'string')) {
    throw new Error('market stability failure is malformed');
  }
  return verdict.errors.join(' | ');
}

function exactObject(issues, value, keys, label) {
  if (!exactKeys(issues, value, keys, label)) return false;
  for (const key of keys) if (!(key in value)) issues.push(`${label} field ${key} is missing`);
  return Object.keys(value).length === keys.length;
}

function exactArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function semanticDigest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function validateTerminalSystems(issues, systems, expected, label) {
  const keys = ['hull', 'sails', 'crew', 'cannon'];
  if (!exactObject(issues, systems, keys, label)
    || keys.some((key) => systems[key] !== expected[key])) {
    issues.push(`${label} is invalid`);
  }
}

function validateTerminalSemanticState(issues, state, label) {
  if (!exactObject(issues, state, ['tick', 'resultVisible', 'canvas', 'terminal', 'player', 'opponent'], label)) return;
  if (state.tick !== 11_855 || state.resultVisible !== true) issues.push(`${label} terminal visibility is invalid`);

  const canvas = state.canvas;
  if (!exactObject(issues, canvas, [
    'width', 'height', 'rect', 'drawingBuffer', 'opacity', 'transform', 'engine',
    'backend',
  ], `${label}.canvas`)) return;
  if (canvas.width !== 1440 || canvas.height !== 900 || canvas.opacity !== '1'
    || canvas.transform !== 'none' || canvas.engine !== 'three.js r170') {
    issues.push(`${label}.canvas is invalid`);
  }
  if (!exactObject(issues, canvas.rect, ['x', 'y', 'width', 'height'], `${label}.canvas.rect`)
    || canvas.rect.x !== 0 || canvas.rect.y !== 0 || canvas.rect.width !== 1440 || canvas.rect.height !== 900) {
    issues.push(`${label}.canvas.rect is invalid`);
  }
  if (!exactObject(issues, canvas.drawingBuffer, ['width', 'height'], `${label}.canvas.drawingBuffer`)
    || canvas.drawingBuffer.width !== 1440 || canvas.drawingBuffer.height !== 900) {
    issues.push(`${label}.canvas.drawingBuffer is invalid`);
  }
  if (!exactObject(issues, canvas.backend, ['vendor', 'renderer'], `${label}.canvas.backend`)
    || typeof canvas.backend.vendor !== 'string' || canvas.backend.vendor.length === 0
    || typeof canvas.backend.renderer !== 'string' || canvas.backend.renderer.length === 0) {
    issues.push(`${label}.canvas.backend is invalid`);
  }
  const terminal = state.terminal;
  if (!exactObject(issues, terminal, ['outcome', 'victorShipId', 'atTick', 'seedAfter'], `${label}.terminal`)
    || terminal.outcome !== 'boarding-ready' || terminal.victorShipId !== 'player'
    || terminal.atTick !== 11_855 || terminal.seedAfter !== 1_310_878_278) {
    issues.push(`${label}.terminal is invalid`);
  }
  validateTerminalSystems(issues, state.player, { hull: 78, sails: 61, crew: 44, cannon: 8 }, `${label}.player`);
  validateTerminalSystems(issues, state.opponent, { hull: 88, sails: 14, crew: 9, cannon: 8 }, `${label}.opponent`);
}

function validateTerminalRenderObservation(issues, observation, label) {
  if (!exactObject(issues, observation, ['kind', 'framebufferSample'], label)) return;
  if (observation.kind !== 'post-present-default-framebuffer-readpixels') {
    issues.push(`${label}.kind is invalid`);
  }
  const sample = observation.framebufferSample;
  if (!exactObject(issues, sample, [
    'algorithm', 'sampleCount', 'nonzeroSampleChannels', 'sampleHash',
  ], `${label}.framebufferSample`)
    || sample.algorithm !== 'fnv1a32-rgba-grid-v1'
    || sample.sampleCount !== 40
    || !Number.isInteger(sample.nonzeroSampleChannels)
    || sample.nonzeroSampleChannels < 0
    || sample.nonzeroSampleChannels > 160
    || typeof sample.sampleHash !== 'string'
    || !SAMPLE_HASH_PATTERN.test(sample.sampleHash)) {
    issues.push(`${label}.framebufferSample is invalid`);
  }
}

function validateScreenshotObservationRun(issues, value, label) {
  const keys = [
    'pngSignatureVerified', 'nonzeroBytes', 'width', 'height', 'pngSha256',
    'semanticDigest', 'semanticState', 'renderObservation',
  ];
  if (!exactObject(issues, value, keys, label)) return;
  if (value.pngSignatureVerified !== true || value.nonzeroBytes !== true
    || value.width !== 1440 || value.height !== 900 || !SHA256_PATTERN.test(value.pngSha256)
    || !SHA256_PATTERN.test(value.semanticDigest)) {
    issues.push(`${label} PNG declaration is invalid`);
  }
  validateTerminalSemanticState(issues, value.semanticState, `${label}.semanticState`);
  validateTerminalRenderObservation(issues, value.renderObservation, `${label}.renderObservation`);
  if (isRecord(value.semanticState) && value.semanticDigest !== semanticDigest(value.semanticState)) {
    issues.push(`${label}.semanticDigest does not match canonical state`);
  }
}

function validateScreenshotEvidence(issues, evidence) {
  const keys = [
    'expectedCount', 'byteComparedCount', 'comparisonExceptionNames',
    'trackedCapture', 'observation',
  ];
  if (!exactObject(issues, evidence, keys, 'screenshotEvidence')) return;
  if (evidence.expectedCount !== 23 || evidence.byteComparedCount !== 22
    || !exactArray(evidence.comparisonExceptionNames, [TERMINAL_RESULT_SCREENSHOT])
    || evidence.trackedCapture !== 'run-a') {
    issues.push('screenshotEvidence comparison boundary is invalid');
  }
  const observation = evidence.observation;
  if (!exactObject(issues, observation, [
    'filename', 'kind', 'width', 'height', 'semanticDigestAlgorithm', 'runA', 'runB',
  ], 'screenshotEvidence.observation')) return;
  if (observation.filename !== TERMINAL_RESULT_SCREENSHOT
    || observation.kind !== 'webgl-composited-terminal'
    || observation.width !== 1440 || observation.height !== 900
    || observation.semanticDigestAlgorithm !== 'sha256-canonical-json-v1') {
    issues.push('screenshotEvidence observation is invalid');
  }
  validateScreenshotObservationRun(issues, observation.runA, 'screenshotEvidence.observation.runA');
  validateScreenshotObservationRun(issues, observation.runB, 'screenshotEvidence.observation.runB');
  if (isRecord(observation.runA) && isRecord(observation.runB)
    && (canonicalJson(observation.runA.semanticState) !== canonicalJson(observation.runB.semanticState)
      || observation.runA.semanticDigest !== observation.runB.semanticDigest)) {
    issues.push('screenshotEvidence semantic observations differ');
  }
}

function validStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function validateViewports(issues, viewports) {
  if (!exactObject(issues, viewports, Object.keys(FINAL_VIEWPORTS), 'viewports')) return;
  for (const [name, expected] of Object.entries(FINAL_VIEWPORTS)) {
    const value = viewports[name];
    const keys = ['name', 'width', 'height', 'dpr', 'orientation', 'expectedSupported', 'controllerMounted', 'noticeVisible', 'noticeFocused', 'minimumFontPx', 'minimumTargetWidthPx', 'minimumTargetHeightPx', 'undersizedTargets', 'occludedTargets', 'partyObscured', 'horizontalOverflowPx'];
    if (!exactObject(issues, value, keys, `viewports.${name}`)) continue;
    if (value.name !== name || value.width !== expected.width || value.height !== expected.height || value.dpr !== 1
      || value.orientation !== (expected.width >= expected.height ? 'landscape' : 'portrait')
      || value.expectedSupported !== expected.expectedSupported || value.controllerMounted !== expected.controllerMounted
      || value.noticeVisible !== expected.noticeVisible || value.noticeFocused !== expected.noticeFocused
      || !finiteNonNegative(value.minimumFontPx) || value.minimumFontPx < 14
      || !finiteNonNegative(value.minimumTargetWidthPx) || value.minimumTargetWidthPx < 44
      || !finiteNonNegative(value.minimumTargetHeightPx) || value.minimumTargetHeightPx < 44
      || !Array.isArray(value.undersizedTargets) || value.undersizedTargets.length !== 0
      || !Array.isArray(value.occludedTargets) || value.occludedTargets.length !== 0
      || value.partyObscured !== false || value.horizontalOverflowPx !== 0) {
      issues.push(`viewports.${name} violates the final viewport contract`);
    }
  }
}

function validateFixtures(issues, fixtures) {
  const keys = ['nowProvided', 'seedsProvided', 'uuidsProvided', 'nowConsumed', 'seedsConsumed', 'uuidsConsumed'];
  if (!exactObject(issues, fixtures, keys, 'fixtures')) return;
  const now = Array.from({ length: 96 }, (_, index) => 1_700_000_000_000 + index * 1_000);
  const seeds = [1702, 2702, 3702, 4702, 5702, 6702, 7702, 8702];
  const uuids = Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  if (!exactArray(fixtures.nowProvided, now) || !exactArray(fixtures.seedsProvided, seeds) || !exactArray(fixtures.uuidsProvided, uuids)
    || !exactArray(fixtures.nowConsumed, now.slice(0, 6)) || !exactArray(fixtures.seedsConsumed, seeds.slice(0, 1))
    || !exactArray(fixtures.uuidsConsumed, uuids.slice(0, 1))) issues.push('fixtures do not match the committed deterministic channel');
}

function validateBoothViewport(issues, value, name, width, height) {
  if (!isRecord(value)) {
    issues.push(`profile evidence must include Booth ${name} viewport evidence`);
    return;
  }
  exactObject(issues, value, BOOTH_VIEWPORT_KEYS, `Booth ${name}`);
  if (!exactObject(issues, value.viewport, ART_VIEWPORT_SIZE_KEYS, `Booth ${name} viewport`) || value.viewport.width !== width || value.viewport.height !== height) issues.push(`Booth ${name} viewport is wrong`);
  if (value.pageHorizontalOverflowPx !== 0 || value.boothHorizontalOverflowPx !== 0 || value.pageContained !== true || value.boothContained !== true) issues.push(`Booth ${name} must have zero horizontal overflow and full containment`);
  if (!sameMembers(value.labels, ['Name', 'Pronouns'])) issues.push(`Booth ${name} labels are incomplete`);
  if (!Array.isArray(value.visibleText) || value.visibleText.length === 0 || value.visibleText.some((entry, index) => !exactObject(issues, entry, BOOTH_TEXT_KEYS, `Booth ${name} visible text ${index}`) || typeof entry.text !== 'string' || entry.fontPx < 14)) issues.push(`Booth ${name} visible copy is below 14px or missing`);
  if (!Array.isArray(value.controls) || !sameMembers(value.controls.map((entry) => entry?.testId), BOOTH_CONTROLS) || value.controls.some((entry, index) => !exactObject(issues, entry, BOOTH_CONTROL_KEYS, `Booth ${name} control ${index}`) || entry.width < 44 || entry.height < 44)) issues.push(`Booth ${name} controls must cover every control at 44px`);
  if (!Array.isArray(value.focusChecks) || !sameMembers(value.focusChecks.map((entry) => entry?.testId), BOOTH_CONTROLS) || value.focusChecks.some((entry, index) => !exactObject(issues, entry, BOOTH_FOCUS_KEYS, `Booth ${name} focus ${index}`) || entry.focused !== true || entry.visible !== true)) issues.push(`Booth ${name} focus checks must cover every control`);
}

function validSubjectRoi(value) {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 1)
    && value[2] > 0 && value[3] > 0 && value[0] + value[2] <= 1 && value[1] + value[3] <= 1;
}

function validateArtGeometry(issues, geometry, viewportName, state, expectedIds) {
  if (!exactObject(issues, geometry, ART_GEOMETRY_KEYS, `art ${viewportName} ${state} geometry`) || !Array.isArray(geometry.leaves) || !sameMembers(geometry.leaves.map((leaf) => leaf?.id), expectedIds)
    || geometry.leaves.some((leaf, index) => !exactObject(issues, leaf, ART_LEAF_KEYS, `art ${viewportName} ${state} leaf ${index}`) || leaf.contained !== true || leaf.horizontalOverflowPx !== 0 || leaf.verticalOverflowPx !== 0)) issues.push(`art ${viewportName} ${state} geometry clips or escapes the viewport`);
  if (!isRecord(geometry) || !Array.isArray(geometry.overlapPairs) || geometry.overlapPairs.length !== 0) issues.push(`art ${viewportName} ${state} interactive rectangles overlap`);
}

function validateArtEvidence(issues, art) {
  const rawKeys = ['status', 'asset', 'emitted', 'report', 'screenshots', 'viewports'];
  const summaryKeys = ['loaded', 'localRequest', 'naturalWidth', 'naturalHeight', 'fallbackVerified', 'precached', 'historicalReview', 'representationReview', 'focalVisibleAt', 'minimumSubjectRoiVisibleFraction', 'minimumTextContrast', 'overlapCount', 'clippingCount', 'sha256'];
  if (!exactObject(issues, art, [...rawKeys, ...summaryKeys], 'art')) return;
  if (art.status !== 'verified') issues.push('art evidence must be verified');
  if (art.asset !== 'src/games/caribbean/assets/bridgetown-1675.webp') issues.push('art evidence names the wrong production asset');
  if (!exactObject(issues, art.emitted, ART_EMITTED_KEYS, 'art emitted') || typeof art.emitted.url !== 'string' || !/^\/assets\/bridgetown-1675-[^/]+\.webp$/.test(art.emitted.url) || art.emitted.contentType !== 'image/webp') issues.push('art emitted WebP evidence is malformed');
  else if (art.emitted.precached !== true) issues.push('art emitted WebP must be precached');
  if (!exactObject(issues, art.report, ART_REPORT_KEYS, 'art report') || art.report.historicalReview !== 'pass' || art.report.representationReview !== 'pass' || art.report.sha256 !== FINAL_ART_SHA256) issues.push('art historical and representation reviews must pass');
  if (!validSubjectRoi(art.report?.subjectRoi)) issues.push('art subject ROI is missing or malformed');
  const expectedScreenshots = ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}.png`);
  const expectedFallbacks = ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}-fallback.png`);
  if (!exactObject(issues, art.screenshots, ART_SCREENSHOT_KEYS, 'art screenshots') || !sameMembers(art.screenshots.normal, expectedScreenshots) || !sameMembers(art.screenshots.fallback, expectedFallbacks)) issues.push('art screenshots must cover normal and fallback at every supported viewport');
  if (!Array.isArray(art.viewports) || !sameMembers(art.viewports.map((viewport) => viewport?.name), ART_VIEWPORT_SPECS.map(({ name }) => name))) {
    issues.push('art viewport evidence must cover the exact supported set');
    return;
  }
  for (const spec of ART_VIEWPORT_SPECS) {
    const viewport = art.viewports.find((candidate) => candidate?.name === spec.name);
    if (!exactObject(issues, viewport, ART_VIEWPORT_KEYS, `art ${spec.name} viewport`)
      || !exactObject(issues, viewport.viewport, ART_VIEWPORT_SIZE_KEYS, `art ${spec.name} viewport size`) || viewport.viewport.width !== spec.width || viewport.viewport.height !== spec.height
      || !exactObject(issues, viewport.naturalSize, ART_VIEWPORT_SIZE_KEYS, `art ${spec.name} natural size`) || viewport.naturalSize.width !== 1920 || viewport.naturalSize.height !== 1080
      || !exactObject(issues, viewport.focal, ART_FOCAL_KEYS, `art ${spec.name} focal`) || viewport.focal.xPercent !== spec.focalX || viewport.focal.yPercent !== spec.focalY
      || !Number.isFinite(viewport.focal.roiVisibleRatio) || viewport.focal.roiVisibleRatio < 0.7 || viewport.focal.roiVisibleRatio > 1) issues.push(`art ${spec.name} focal evidence is wrong or hides the subject`);
    if (!Array.isArray(viewport?.contrasts) || !sameMembers(viewport.contrasts.map((sample) => sample?.selector), ART_CONTRAST_SELECTORS)
      || viewport.contrasts.some((sample, index) => !exactObject(issues, sample, ART_CONTRAST_KEYS, `art ${spec.name} contrast ${index}`) || !Number.isFinite(sample.minimumRatio) || sample.minimumRatio < 4.5 || sample.backgroundAlpha !== 1)) issues.push(`art ${spec.name} contrast must be opaque and at least 4.5:1`);
    if (!Array.isArray(viewport?.activityContrasts)) issues.push(`art ${spec.name} activity contrast must cover actual opaque states`);
    else {
      for (const activitySpec of ART_ACTIVITY_CONTRAST_SPECS) {
        const samples = viewport.activityContrasts.filter((sample) => sample?.selector === activitySpec.selector);
        if (samples.length !== 1 || !exactObject(issues, samples[0], ART_ACTIVITY_CONTRAST_KEYS, `art ${spec.name} activity contrast ${activitySpec.selector}`) || samples[0]?.text !== activitySpec.text || samples[0]?.backgroundAlpha !== 1 || !Number.isFinite(samples[0]?.minimumRatio) || samples[0].minimumRatio < 4.5) issues.push(`art ${spec.name} activity contrast is incomplete or insufficient`);
      }
      if (viewport.activityContrasts.some((sample) => !ART_ACTIVITY_CONTRAST_SPECS.some(({ selector }) => selector === sample?.selector))) issues.push(`art ${spec.name} activity contrast contains an unexpected selector`);
    }
    if (!exactObject(issues, viewport?.fixtureState, ART_FIXTURE_KEYS, `art ${spec.name} fixture`) || viewport.fixtureState.gold !== ART_CAPTURE_FIXTURE_STATE.gold || viewport.fixtureState.provisions !== ART_CAPTURE_FIXTURE_STATE.provisions) issues.push(`art ${spec.name} capture fixture must remain at 500 gold / 3.4 months`);
    validateArtGeometry(issues, viewport?.menuGeometry, spec.name, 'menu', ART_MENU_GEOMETRY_IDS);
    validateArtGeometry(issues, viewport?.marketGeometry, spec.name, 'market', ART_MARKET_GEOMETRY_IDS);
  }
}

function validateProfileEvidence(issues, profile) {
  if (!isRecord(profile) || profile.status !== 'setup-verified' || profile.defaultPronouns !== 'he/him' || profile.boothProfilePersisted !== true || Object.keys(profile).length !== 4) {
    issues.push('profile evidence must be exact setup-verified evidence');
    return;
  }
  const setup = profile.setup;
  if (!isRecord(setup) || Object.keys(setup).length !== 4 || !isRecord(setup.prefill) || Object.keys(setup.prefill).length !== 2 || setup.prefill.captainName !== 'Mario' || setup.prefill.pronouns !== 'he/him'
    || !isRecord(setup.sharedPronounSnapshot) || Object.keys(setup.sharedPronounSnapshot).length !== 2 || setup.sharedPronounSnapshot.profile !== 'they/them' || setup.sharedPronounSnapshot.campaign !== 'they/them'
    || setup.careerLengthControlPresent !== false || !isRecord(setup.accessibility) || Object.keys(setup.accessibility).length !== 3
    || setup.accessibility.minimumFontPx < 14 || setup.accessibility.minimumTargetHeightPx < 44 || setup.accessibility.horizontalOverflowPx !== 0) issues.push('profile evidence must be exact setup-verified evidence');
}

function countArtGeometry(art, key, innerKey) {
  return art.viewports.reduce((total, viewport) => total + (viewport[key]?.[innerKey]?.length ?? 0), 0);
}

function minimumArtContrast(art) {
  return Math.min(...art.viewports.flatMap((viewport) => [...viewport.contrasts, ...viewport.activityContrasts].map((sample) => sample.minimumRatio)));
}

function validateFinalArtSummary(issues, art) {
  const focalVisibleAt = art.viewports.map((viewport) => `${viewport.viewport.width}x${viewport.viewport.height}`);
  const minimumSubjectRoiVisibleFraction = Math.min(...art.viewports.map((viewport) => viewport.focal.roiVisibleRatio));
  const expected = {
    status: 'verified', loaded: art.viewports.every((viewport) => viewport.naturalSize.width === 1920 && viewport.naturalSize.height === 1080),
    localRequest: /^\/assets\/bridgetown-1675-[^/]+\.webp$/.test(art.emitted.url), naturalWidth: art.viewports[0]?.naturalSize.width,
    naturalHeight: art.viewports[0]?.naturalSize.height, fallbackVerified: sameMembers(art.screenshots.fallback, ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}-fallback.png`)),
    precached: art.emitted.precached, historicalReview: art.report.historicalReview, representationReview: art.report.representationReview,
    focalVisibleAt, minimumSubjectRoiVisibleFraction, minimumTextContrast: minimumArtContrast(art),
    overlapCount: countArtGeometry(art, 'menuGeometry', 'overlapPairs') + countArtGeometry(art, 'marketGeometry', 'overlapPairs'),
    clippingCount: art.viewports.reduce((total, viewport) => total + ['menuGeometry', 'marketGeometry'].reduce((subtotal, geometry) => subtotal + (geometry.leaves?.filter((leaf) => !leaf.contained || leaf.horizontalOverflowPx !== 0 || leaf.verticalOverflowPx !== 0).length ?? 0), 0), 0),
    sha256: art.report.sha256,
  };
  for (const [key, value] of Object.entries(expected)) if (art[key] !== value && !exactArray(art[key], value)) issues.push(`art summary ${key} disagrees with raw evidence`);
}

function marketSummary(samples, verdict) {
  return {
    status: 'verified', sampleCount: samples.length,
    actionIds: [...new Set(samples.map((sample) => sample.actionTestId))].sort(), maxDrift: verdict.maxDrift,
    horizontalOverflow: samples.reduce((total, sample) => total + Number(sample.stageScrollWidth > sample.stageClientWidth || sample.rowsScrollWidth > sample.rowsClientWidth || sample.scrollLeft !== 0 || sample.actionStripWidths.some((entry) => entry.scrollWidth > entry.clientWidth)), 0),
    focusPreserved: samples.every((sample) => sample.focusedTestId === sample.actionTestId),
    busyStatesVerified: samples.every((sample) => sample.ariaBusy === (sample.phase === 'pending')),
    statusesVerified: samples.every((sample) => sample.status === MARKET_STATUS[sample.phase]),
  };
}

function validateExactTrueRecord(issues, value, keys, label) {
  if (!exactObject(issues, value, keys, label)) return;
  for (const key of keys) if (value[key] !== true) issues.push(`${label}.${key} must be true`);
}

function validateStrategicSailing(issues, strategic) {
  const keys = [
    'status', 'modeSequence', 'eventIds', 'eventTypes', 'outbound', 'return', 'rng',
    'navalInput', 'resolution', 'recovery', 'focus', 'accessibility', 'viewports',
    'requests', 'fallback', 'screenshots', 'isolation',
  ];
  if (!exactObject(issues, strategic, keys, 'strategicSailing')) return;
  if (strategic.status !== 'verified') issues.push('strategicSailing.status must be verified');
  if (!exactArray(strategic.modeSequence, STRATEGIC_MODE_SEQUENCE)) issues.push('strategicSailing.modeSequence is invalid');
  if (!exactArray(strategic.eventIds, STRATEGIC_EVENT_IDS)) issues.push('strategicSailing.eventIds are invalid');
  if (!exactArray(strategic.eventTypes, STRATEGIC_EVENT_TYPES)) issues.push('strategicSailing.eventTypes are invalid');

  for (const label of ['outbound', 'return']) {
    const value = strategic[label];
    if (!exactObject(issues, value, ['elapsedDays', 'provisionsUsed'], `strategicSailing.${label}`)
      || value.elapsedDays !== 1 || value.provisionsUsed !== 1) {
      issues.push(`strategicSailing.${label} cost is invalid`);
    }
  }

  validateExactTrueRecord(
    issues,
    strategic.rng,
    ['navigationTransitionsVerified', 'navalTransitionVerified', 'worldUnchanged'],
    'strategicSailing.rng',
  );
  if (!exactObject(issues, strategic.navalInput, ['persistedBeforeMount', 'byteEqualAfterReload', 'tickAfterReload'], 'strategicSailing.navalInput')
    || strategic.navalInput.persistedBeforeMount !== true
    || strategic.navalInput.byteEqualAfterReload !== true
    || strategic.navalInput.tickAfterReload !== 0) {
    issues.push('strategicSailing.navalInput is invalid');
  }
  const resolutionKeys = [
    'outcome', 'victorShipId', 'atTick', 'seedAfter', 'exactlyOnce',
    'campaignWritesDuringBattle', 'returnedTo',
  ];
  if (!exactObject(issues, strategic.resolution, resolutionKeys, 'strategicSailing.resolution')
    || strategic.resolution.outcome !== 'boarding-ready'
    || strategic.resolution.victorShipId !== 'player'
    || strategic.resolution.atTick !== 11_855
    || strategic.resolution.seedAfter !== 1_310_878_278
    || strategic.resolution.exactlyOnce !== true
    || strategic.resolution.campaignWritesDuringBattle !== 0
    || strategic.resolution.returnedTo !== 'bridgetown') {
    issues.push('strategicSailing.resolution is invalid');
  }
  validateExactTrueRecord(
    issues,
    strategic.recovery,
    ['intermediateModeRecovered', 'unreadableBytesPreserved'],
    'strategicSailing.recovery',
  );
  validateExactTrueRecord(
    issues,
    strategic.focus,
    ['sailingHeading', 'encounterHeading', 'avoidedReturnLog', 'navalReloadBattle', 'resolvedReturnLog'],
    'strategicSailing.focus',
  );

  const accessibilityKeys = [
    'minimumTextPx', 'minimumTargetWidthPx', 'minimumTargetHeightPx',
    'minimumContrastRatio', 'horizontalOverflowPx',
  ];
  if (!exactObject(issues, strategic.accessibility, accessibilityKeys, 'strategicSailing.accessibility')
    || !finiteNonNegative(strategic.accessibility.minimumTextPx) || strategic.accessibility.minimumTextPx < 14
    || !finiteNonNegative(strategic.accessibility.minimumTargetWidthPx) || strategic.accessibility.minimumTargetWidthPx < 44
    || !finiteNonNegative(strategic.accessibility.minimumTargetHeightPx) || strategic.accessibility.minimumTargetHeightPx < 44
    || !finiteNonNegative(strategic.accessibility.minimumContrastRatio) || strategic.accessibility.minimumContrastRatio < 4.5
    || strategic.accessibility.horizontalOverflowPx !== 0) {
    issues.push('strategicSailing.accessibility is invalid');
  }

  if (exactObject(issues, strategic.viewports, Object.keys(STRATEGIC_VIEWPORTS), 'strategicSailing.viewports')) {
    for (const [name, expected] of Object.entries(STRATEGIC_VIEWPORTS)) {
      const value = strategic.viewports[name];
      if (!exactObject(issues, value, ['width', 'height', 'supported', 'noticeOnly'], `strategicSailing.viewports.${name}`)
        || Object.entries(expected).some(([key, expectedValue]) => value[key] !== expectedValue)) {
        issues.push(`strategicSailing.viewports.${name} is invalid`);
      }
    }
  }

  const requestKeys = [
    'setupNavalCount', 'portNavalCount', 'sailingNavalCount', 'avoidNavalCount',
    'pursuitLocalNavalAssets', 'externalCount', 'failedCount',
  ];
  if (!exactObject(issues, strategic.requests, requestKeys, 'strategicSailing.requests')
    || ['setupNavalCount', 'portNavalCount', 'sailingNavalCount', 'avoidNavalCount', 'externalCount', 'failedCount']
      .some((key) => strategic.requests[key] !== 0)
    || strategic.requests.pursuitLocalNavalAssets !== true) {
    issues.push('strategicSailing.requests are invalid');
  }
  validateExactTrueRecord(
    issues,
    strategic.fallback,
    ['htmlChartVisible', 'battleControlsUsable'],
    'strategicSailing.fallback',
  );
  if (!exactArray(strategic.screenshots, STRATEGIC_SCREENSHOTS)) issues.push('strategicSailing.screenshots are not the exact set');
  const isolationKeys = [
    'productionNavalEmitted', 'productionNavalPrecached', 'requestedBeforePursuit',
    'requestedAfterPursuit', 'harnessMarkersAbsent', 'harnessPreviewAbsent',
  ];
  if (!exactObject(issues, strategic.isolation, isolationKeys, 'strategicSailing.isolation')
    || strategic.isolation.productionNavalEmitted !== true
    || strategic.isolation.productionNavalPrecached !== true
    || strategic.isolation.requestedBeforePursuit !== false
    || strategic.isolation.requestedAfterPursuit !== true
    || strategic.isolation.harnessMarkersAbsent !== true
    || strategic.isolation.harnessPreviewAbsent !== true) {
    issues.push('strategicSailing.isolation is invalid');
  }
}

/** The pure final gate is intentionally strict: any absent, additional, or malformed channel fails closed. */
export function evaluatePortIdentityEvidence(evidence) {
  const issues = [];
  if (!exactObject(issues, evidence, V3_FIELDS, 'evidence')) return { ok: false, issues };
  for (const section of RETAINED_V1_SECTIONS) if (!(section in evidence)) issues.push(`retained v1 section ${section} is missing`);
  if (evidence.schemaVersion !== 3) issues.push('schemaVersion must be 3');
  if (evidence.packagePhase !== 'complete') issues.push('packagePhase must be complete');
  if (!exactObject(issues, evidence.browser, ['name', 'version'], 'browser') || evidence.browser.name !== 'Chromium' || typeof evidence.browser.version !== 'string' || evidence.browser.version.length === 0) issues.push('browser is invalid');
  if (evidence.route !== '/#/caribbean') issues.push('route is invalid');
  if (evidence.build !== 'normal production (BUILD_HARNESS unset)') issues.push('build is invalid');
  validateViewports(issues, evidence.viewports);
  validateFixtures(issues, evidence.fixtures);
  if (!exactObject(issues, evidence.webLocks, ['realNavigatorLocks', 'calls'], 'webLocks') || evidence.webLocks.realNavigatorLocks !== true
    || !Array.isArray(evidence.webLocks.calls) || evidence.webLocks.calls.length < 5 || evidence.webLocks.calls.some((call) => !isRecord(call) || !exactObject(issues, call, ['name', 'mode'], 'webLocks.calls') || call.name !== 'caribbean:campaign:writer' || call.mode !== 'exclusive')) issues.push('webLocks are invalid');
  if (!exactObject(issues, evidence.journey, ['finalEventCount', 'eventTypes', 'saveChecksum', 'replayVerified'], 'journey') || evidence.journey.finalEventCount !== 2
    || !exactArray(evidence.journey.eventTypes, ['market-traded', 'lead-accepted']) || !/^[a-f0-9]{8}$/.test(evidence.journey.saveChecksum) || evidence.journey.replayVerified !== true) issues.push('journey is invalid');
  if (!exactObject(issues, evidence.accessibility, ['minimumMeasuredFontPx', 'minimumMeasuredTargetWidthPx', 'minimumMeasuredTargetHeightPx', 'horizontalOverflowPx', 'boothProfile'], 'accessibility')
    || !finiteNonNegative(evidence.accessibility.minimumMeasuredFontPx) || evidence.accessibility.minimumMeasuredFontPx < 14
    || !finiteNonNegative(evidence.accessibility.minimumMeasuredTargetWidthPx) || evidence.accessibility.minimumMeasuredTargetWidthPx < 44
    || !finiteNonNegative(evidence.accessibility.minimumMeasuredTargetHeightPx) || evidence.accessibility.minimumMeasuredTargetHeightPx < 44
    || evidence.accessibility.horizontalOverflowPx !== 0) issues.push('accessibility is invalid');
  const boothProfile = evidence.accessibility?.boothProfile;
  if (!exactObject(issues, boothProfile, ['desktop', 'narrow'], 'Booth profile')) {
    issues.push('profile evidence must include Booth desktop viewport evidence');
    issues.push('profile evidence must include Booth narrow viewport evidence');
  } else {
    validateBoothViewport(issues, boothProfile.desktop, 'desktop', 1440, 900);
    validateBoothViewport(issues, boothProfile.narrow, 'narrow', 960, 600);
  }
  if (!exactObject(issues, evidence.requests, ['externalCount', 'failedCount', 'requestedPaths'], 'requests') || evidence.requests.externalCount !== 0 || evidence.requests.failedCount !== 0
    || !validStringArray(evidence.requests.requestedPaths) || evidence.requests.requestedPaths.some((path) => !path.startsWith('/') || path.startsWith('//'))) issues.push('requests are invalid');
  if (!exactObject(issues, evidence.mapNetwork, [
    'status', 'provider', 'tileJsonUrl', 'providerRequestCount',
    'abortedTileJsonRequestCount', 'successfulTileJsonResponseCount',
    'unavailableWithoutCanvas', 'fakeGeographyAbsent', 'retryRecovered',
    'renderIdleAfterRetry', 'unavailableScreenshotFilename',
    'unavailableScreenshotSha256',
  ], 'mapNetwork')
    || evidence.mapNetwork.status !== 'verified'
    || evidence.mapNetwork.provider !== 'OpenFreeMap'
    || evidence.mapNetwork.tileJsonUrl !== 'https://tiles.openfreemap.org/planet'
    || !Number.isSafeInteger(evidence.mapNetwork.providerRequestCount)
    || evidence.mapNetwork.providerRequestCount < 2
    || !Number.isSafeInteger(evidence.mapNetwork.abortedTileJsonRequestCount)
    || evidence.mapNetwork.abortedTileJsonRequestCount < 1
    || !Number.isSafeInteger(evidence.mapNetwork.successfulTileJsonResponseCount)
    || evidence.mapNetwork.successfulTileJsonResponseCount < 1
    || evidence.mapNetwork.unavailableWithoutCanvas !== true
    || evidence.mapNetwork.fakeGeographyAbsent !== true
    || evidence.mapNetwork.unavailableScreenshotFilename !== 'map-unavailable-desktop.png'
    || !SHA256_PATTERN.test(evidence.mapNetwork.unavailableScreenshotSha256)
    || evidence.mapNetwork.retryRecovered !== true
    || evidence.mapNetwork.renderIdleAfterRetry !== true) {
    issues.push('mapNetwork must prove an honest provider failure and successful retry');
  }
  if (!exactObject(issues, evidence.failures, ['console', 'page', 'requests', 'external'], 'failures') || Object.values(evidence.failures).some((value) => !Array.isArray(value) || value.length !== 0)) issues.push('failures are invalid');
  if (!exactObject(issues, evidence.isolation, ['previewHtmlAbsent', 'caribbeanGlbAbsent', 'glbRequested', 'previewResourceRequested', 'moduleMarkersAbsent', 'battleCssAbsent'], 'isolation')
    || evidence.isolation.previewHtmlAbsent !== true || evidence.isolation.caribbeanGlbAbsent !== false || evidence.isolation.glbRequested !== false || evidence.isolation.previewResourceRequested !== false || evidence.isolation.moduleMarkersAbsent !== true || evidence.isolation.battleCssAbsent !== true) issues.push('isolation is invalid');
  if (!exactObject(issues, evidence.recovery, ['quarantineKey', 'quarantineVerified', 'exportedCorruptRawVerified', 'recoveredChecksum', 'recoveryReloaded'], 'recovery')
    || typeof evidence.recovery.quarantineKey !== 'string' || !evidence.recovery.quarantineKey.startsWith('caribbean:campaign:quarantine:') || evidence.recovery.quarantineVerified !== true || evidence.recovery.exportedCorruptRawVerified !== true || !/^[a-f0-9]{8}$/.test(evidence.recovery.recoveredChecksum) || evidence.recovery.recoveryReloaded !== true) issues.push('recovery is invalid');
  if (!exactArray(evidence.screenshots, FINAL_SCREENSHOTS)) issues.push('screenshots are not the exact final set');
  if (!exactObject(issues, evidence.determinism, [
    'cleanRuns', 'metricsByteIdentical', 'screenshotsByteIdentical',
    'byteComparedScreenshotsIdentical',
  ], 'determinism') || evidence.determinism.cleanRuns !== 2
    || evidence.determinism.metricsByteIdentical !== true
    || evidence.determinism.screenshotsByteIdentical !== false
    || evidence.determinism.byteComparedScreenshotsIdentical !== true) {
    issues.push('determinism is invalid');
  }
  validateScreenshotEvidence(issues, evidence.screenshotEvidence);
  validateProfileEvidence(issues, evidence.profile);
  if (!exactObject(issues, evidence.profileIdentity, ['status', 'defaultPronouns', 'setupNamePrefilled', 'setupPronounsPrefilled', 'campaignSnapshotPreserved', 'careerLengthControlAbsent', 'newCampaignLength'], 'profileIdentity')) issues.push('profileIdentity is invalid');
  else {
    const profile = evidence.profile;
    const expectedProfileIdentity = isRecord(profile) && isRecord(profile.setup) ? {
      status: 'verified', defaultPronouns: profile.defaultPronouns,
      setupNamePrefilled: profile.setup.prefill?.captainName === 'Mario', setupPronounsPrefilled: profile.setup.prefill?.pronouns === profile.defaultPronouns,
      campaignSnapshotPreserved: profile.setup.sharedPronounSnapshot?.profile === 'they/them' && profile.setup.sharedPronounSnapshot?.campaign === 'they/them',
      careerLengthControlAbsent: profile.setup.careerLengthControlPresent === false, newCampaignLength: 'adventure',
    } : null;
    if (!expectedProfileIdentity || Object.entries(expectedProfileIdentity).some(([key, value]) => evidence.profileIdentity[key] !== value)) issues.push('profileIdentity disagrees with raw profile evidence');
  }
  const artIssueCount = issues.length;
  validateArtEvidence(issues, evidence.art);
  if (issues.length === artIssueCount && isRecord(evidence.art) && Array.isArray(evidence.art.viewports)) validateFinalArtSummary(issues, evidence.art);
  if (!isRecord(evidence.market) || evidence.market.status !== 'verified' || !Array.isArray(evidence.market.samples) || Object.keys(evidence.market).length !== 2) issues.push('market evidence must contain verified samples');
  const marketVerdict = isRecord(evidence.market) && Array.isArray(evidence.market.samples) ? validateMarketStability(evidence.market.samples) : null;
  if (marketVerdict && !marketVerdict.ok) issues.push(...marketVerdict.errors);
  if (!exactObject(issues, evidence.marketStability, ['status', 'sampleCount', 'actionIds', 'maxDrift', 'horizontalOverflow', 'focusPreserved', 'busyStatesVerified', 'statusesVerified'], 'marketStability')) issues.push('marketStability is invalid');
  else if (!marketVerdict?.ok || Object.entries(marketSummary(evidence.market.samples, marketVerdict)).some(([key, value]) => evidence.marketStability[key] !== value && !exactArray(evidence.marketStability[key], value))) issues.push('marketStability disagrees with raw market evidence');
  validateStrategicSailing(issues, evidence.strategicSailing);
  return { ok: issues.length === 0, issues };
}

function pngDimensions(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length < 24
    || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function exactMapNames(map, expectedNames) {
  if (!(map instanceof Map) || map.size !== expectedNames.length) return false;
  return [...map.keys()].every((name) => typeof name === 'string' && expectedNames.includes(name))
    && expectedNames.every((name) => map.has(name));
}

function validRunChecks(checks) {
  return isRecord(checks)
    && exactArray(Object.keys(checks).sort(), [
      'consoleFailures', 'pageFailures', 'requestFailures', 'routeFailures', 'semanticProbesPassed',
    ])
    && checks.routeFailures === 0
    && checks.requestFailures === 0
    && checks.consoleFailures === 0
    && checks.pageFailures === 0
    && checks.semanticProbesPassed === true;
}

/**
 * Owns the actual A/B screenshot bytes. The sole observational row remains
 * arbitrary pixel data after exact container and semantic validation.
 */
export function compareNormalRouteScreenshotRuns({ expectedNames, runA, runB, declaredEvidence } = {}) {
  const issues = [];
  const requiredNames = [...FINAL_SCREENSHOTS, ...STRATEGIC_SCREENSHOTS];
  if (!exactArray(expectedNames, requiredNames) || new Set(expectedNames ?? []).size !== 23) {
    issues.push('expected screenshot names are not the exact 23-name allowlist');
  }
  const evidenceIssues = [];
  validateScreenshotEvidence(evidenceIssues, declaredEvidence);
  issues.push(...evidenceIssues);
  const names = exactArray(expectedNames, requiredNames) ? expectedNames : requiredNames;

  for (const [label, run, tag] of [['runA', runA, 'A'], ['runB', runB, 'B']]) {
    if (!isRecord(run) || run.run !== tag) {
      issues.push(`${label} tag is invalid`);
      continue;
    }
    if (!exactMapNames(run.screenshotBuffers, names)) issues.push(`${label} screenshot membership is invalid`);
    if (!exactMapNames(run.semanticStates, [TERMINAL_RESULT_SCREENSHOT])) issues.push(`${label} semantic-state membership is invalid`);
    if (!exactMapNames(run.renderObservations, [TERMINAL_RESULT_SCREENSHOT])) issues.push(`${label} render-observation membership is invalid`);
    else validateTerminalRenderObservation(
      issues,
      run.renderObservations.get(TERMINAL_RESULT_SCREENSHOT),
      `${label}.renderObservations.${TERMINAL_RESULT_SCREENSHOT}`,
    );
    if (!validRunChecks(run.checks)) issues.push(`${label} checks are invalid`);
  }

  const selectedArtifacts = new Map();
  if (issues.length === 0) {
    for (const name of names) {
      const aBytes = runA.screenshotBuffers.get(name);
      const bBytes = runB.screenshotBuffers.get(name);
      const aDimensions = pngDimensions(aBytes);
      const bDimensions = pngDimensions(bBytes);
      if (!aDimensions || !bDimensions) {
        issues.push(`${name} is not a valid nonempty PNG in both runs`);
        continue;
      }
      if (name === TERMINAL_RESULT_SCREENSHOT
        && (aDimensions.width !== 1440 || aDimensions.height !== 900
          || bDimensions.width !== 1440 || bDimensions.height !== 900)) {
        issues.push(`${name} must be 1440x900 in both runs`);
      }
      const aHash = createHash('sha256').update(aBytes).digest('hex');
      const bHash = createHash('sha256').update(bBytes).digest('hex');
      if (name !== TERMINAL_RESULT_SCREENSHOT && !Buffer.from(aBytes).equals(Buffer.from(bBytes))) {
        issues.push(`${name} bytes differ outside the observation exception`);
      }
      if (name === TERMINAL_RESULT_SCREENSHOT) {
        if (aHash !== declaredEvidence.observation.runA.pngSha256
          || bHash !== declaredEvidence.observation.runB.pngSha256) {
          issues.push(`${name} declared PNG hashes do not match the actual buffers`);
        }
        const stateA = runA.semanticStates.get(name);
        const stateB = runB.semanticStates.get(name);
        const renderObservationA = runA.renderObservations.get(name);
        const renderObservationB = runB.renderObservations.get(name);
        if (canonicalJson(stateA) !== canonicalJson(declaredEvidence.observation.runA.semanticState)
          || canonicalJson(stateB) !== canonicalJson(declaredEvidence.observation.runB.semanticState)
          || canonicalJson(stateA) !== canonicalJson(stateB)) {
          issues.push(`${name} semantic state does not match its declaration`);
        }
        if (canonicalJson(renderObservationA) !== canonicalJson(declaredEvidence.observation.runA.renderObservation)
          || canonicalJson(renderObservationB) !== canonicalJson(declaredEvidence.observation.runB.renderObservation)) {
          issues.push(`${name} render observation does not match its declaration`);
        }
      }
      selectedArtifacts.set(name, { sourceRun: 'A', bytes: aBytes, sha256: aHash });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    issues: [],
    selectedRun: 'A',
    selectedArtifacts,
    screenshotEvidence: declaredEvidence,
  };
}
