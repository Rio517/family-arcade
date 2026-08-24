const RETAINED_V1_SECTIONS = [
  'browser',
  'route',
  'build',
  'viewports',
  'fixtures',
  'webLocks',
  'journey',
  'accessibility',
  'requests',
  'failures',
  'isolation',
  'recovery',
  'screenshots',
  'determinism',
];

const V2_FIELDS = [
  ...RETAINED_V1_SECTIONS,
  'schemaVersion',
  'packagePhase',
  'profileIdentity',
  'art',
  'marketStability',
];

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
  '.caribbean-port-action-reason',
]);

export const ART_ACTIVITY_CONTRAST_SPECS = Object.freeze([
  Object.freeze({ selector: '.caribbean-market-status:not(:empty)', text: 'Cargo ledger updated.' }),
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
  resolved: 'Cargo ledger updated.',
};

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
  if (!MARKET_PHASES.includes(sample.phase)) errors.push('sample has an invalid phase');
  if (typeof sample.actionTestId !== 'string') errors.push('sample action id is missing');
  if (!validRect(sample.stage)) errors.push('sample stage rectangle is malformed');
  if (!Array.isArray(sample.rows)) errors.push('sample rows must be an array');
  else if (sample.rows.length !== 6 || sample.rows.some((rect) => !validRect(rect))) errors.push('sample rows must contain exactly six rectangles');
  if (!Array.isArray(sample.actionStrips)) errors.push('sample action strips must be an array');
  else if (sample.actionStrips.length !== 6 || sample.actionStrips.some((rect) => !validRect(rect))) errors.push('sample action strips must contain exactly six rectangles');
  for (const field of ['stageClientWidth', 'stageScrollWidth', 'rowsClientWidth', 'rowsScrollWidth']) {
    if (!finiteNonNegative(sample[field])) errors.push(`sample ${field} is invalid`);
  }
  if (!Array.isArray(sample.actionStripWidths) || sample.actionStripWidths.length !== 6 || sample.actionStripWidths.some((entry) => (
    !isRecord(entry) || typeof entry.testId !== 'string'
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

function validateFinalArt(issues, art) {
  const keys = ['status', 'loaded', 'localRequest', 'naturalWidth', 'naturalHeight', 'fallbackVerified', 'precached', 'historicalReview', 'representationReview', 'focalVisibleAt', 'minimumSubjectRoiVisibleFraction', 'minimumTextContrast', 'overlapCount', 'clippingCount', 'sha256'];
  if (!exactObject(issues, art, keys, 'art')) return;
  if (art.status !== 'verified' || art.loaded !== true || art.localRequest !== true || art.naturalWidth !== 1920 || art.naturalHeight !== 1080
    || art.fallbackVerified !== true || art.precached !== true || art.historicalReview !== 'pass' || art.representationReview !== 'pass'
    || !exactArray(art.focalVisibleAt, ['1440x900', '1180x820', '1024x768', '960x600'])
    || !Number.isFinite(art.minimumSubjectRoiVisibleFraction) || art.minimumSubjectRoiVisibleFraction < 0.7
    || !Number.isFinite(art.minimumTextContrast) || art.minimumTextContrast < 4.5
    || art.overlapCount !== 0 || art.clippingCount !== 0 || art.sha256 !== FINAL_ART_SHA256) {
    issues.push('art violates the final identity-and-fallback contract');
  }
}

/** The pure final gate is intentionally strict: any absent, additional, or malformed channel fails closed. */
export function evaluatePortIdentityEvidence(evidence) {
  const issues = [];
  if (!exactObject(issues, evidence, V2_FIELDS, 'evidence')) return { ok: false, issues };
  if (evidence.schemaVersion !== 2) issues.push('schemaVersion must be 2');
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
  if (!exactObject(issues, evidence.accessibility, ['minimumMeasuredFontPx', 'minimumMeasuredTargetWidthPx', 'minimumMeasuredTargetHeightPx', 'horizontalOverflowPx'], 'accessibility')
    || !finiteNonNegative(evidence.accessibility.minimumMeasuredFontPx) || evidence.accessibility.minimumMeasuredFontPx < 14
    || !finiteNonNegative(evidence.accessibility.minimumMeasuredTargetWidthPx) || evidence.accessibility.minimumMeasuredTargetWidthPx < 44
    || !finiteNonNegative(evidence.accessibility.minimumMeasuredTargetHeightPx) || evidence.accessibility.minimumMeasuredTargetHeightPx < 44
    || evidence.accessibility.horizontalOverflowPx !== 0) issues.push('accessibility is invalid');
  if (!exactObject(issues, evidence.requests, ['externalCount', 'failedCount', 'requestedPaths'], 'requests') || evidence.requests.externalCount !== 0 || evidence.requests.failedCount !== 0
    || !validStringArray(evidence.requests.requestedPaths) || evidence.requests.requestedPaths.some((path) => !path.startsWith('/') || path.startsWith('//'))) issues.push('requests are invalid');
  if (!exactObject(issues, evidence.failures, ['console', 'page', 'requests', 'external'], 'failures') || Object.values(evidence.failures).some((value) => !Array.isArray(value) || value.length !== 0)) issues.push('failures are invalid');
  if (!exactObject(issues, evidence.isolation, ['previewHtmlAbsent', 'caribbeanGlbAbsent', 'glbRequested', 'previewResourceRequested', 'moduleMarkersAbsent', 'battleCssAbsent'], 'isolation')
    || evidence.isolation.previewHtmlAbsent !== true || evidence.isolation.caribbeanGlbAbsent !== true || evidence.isolation.glbRequested !== false || evidence.isolation.previewResourceRequested !== false || evidence.isolation.moduleMarkersAbsent !== true || evidence.isolation.battleCssAbsent !== true) issues.push('isolation is invalid');
  if (!exactObject(issues, evidence.recovery, ['quarantineKey', 'quarantineVerified', 'exportedCorruptRawVerified', 'recoveredChecksum', 'recoveryReloaded'], 'recovery')
    || typeof evidence.recovery.quarantineKey !== 'string' || !evidence.recovery.quarantineKey.startsWith('caribbean:campaign:quarantine:') || evidence.recovery.quarantineVerified !== true || evidence.recovery.exportedCorruptRawVerified !== true || !/^[a-f0-9]{8}$/.test(evidence.recovery.recoveredChecksum) || evidence.recovery.recoveryReloaded !== true) issues.push('recovery is invalid');
  if (!exactArray(evidence.screenshots, FINAL_SCREENSHOTS)) issues.push('screenshots are not the exact final set');
  if (!exactObject(issues, evidence.determinism, ['cleanRuns', 'metricsByteIdentical', 'screenshotsByteIdentical'], 'determinism') || evidence.determinism.cleanRuns !== 2 || evidence.determinism.metricsByteIdentical !== true || evidence.determinism.screenshotsByteIdentical !== true) issues.push('determinism is invalid');
  if (!exactObject(issues, evidence.profileIdentity, ['status', 'defaultPronouns', 'setupNamePrefilled', 'setupPronounsPrefilled', 'campaignSnapshotPreserved', 'careerLengthControlAbsent', 'newCampaignLength'], 'profileIdentity')
    || evidence.profileIdentity.status !== 'verified' || evidence.profileIdentity.defaultPronouns !== 'he/him' || evidence.profileIdentity.setupNamePrefilled !== true || evidence.profileIdentity.setupPronounsPrefilled !== true || evidence.profileIdentity.campaignSnapshotPreserved !== true || evidence.profileIdentity.careerLengthControlAbsent !== true || evidence.profileIdentity.newCampaignLength !== 'adventure') issues.push('profileIdentity is invalid');
  validateFinalArt(issues, evidence.art);
  if (!exactObject(issues, evidence.marketStability, ['status', 'sampleCount', 'actionIds', 'maxDrift', 'horizontalOverflow', 'focusPreserved', 'busyStatesVerified', 'statusesVerified'], 'marketStability')
    || evidence.marketStability.status !== 'verified' || evidence.marketStability.sampleCount !== 108 || !exactArray(evidence.marketStability.actionIds, EXPECTED_MARKET_ACTION_IDS) || !Number.isFinite(evidence.marketStability.maxDrift) || evidence.marketStability.maxDrift < 0 || evidence.marketStability.maxDrift > 1 || evidence.marketStability.horizontalOverflow !== 0 || evidence.marketStability.focusPreserved !== true || evidence.marketStability.busyStatesVerified !== true || evidence.marketStability.statusesVerified !== true) issues.push('marketStability is invalid');
  return { ok: issues.length === 0, issues };
}
