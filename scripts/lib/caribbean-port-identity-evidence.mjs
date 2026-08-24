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
  'profile',
  'art',
  'market',
];

const BOOTH_CONTROLS = [
  'booth-switch',
  'booth-edit-profile',
  'booth-new',
  'booth-profile-name',
  'booth-profile-pronouns',
  'booth-profile-save',
];

export const EVIDENCE_CARGO_IDS = Object.freeze([
  'provisions', 'tools', 'luxuries', 'sugar-molasses', 'tobacco-dyewood', 'powder-arms',
]);

export const EXPECTED_MARKET_ACTION_IDS = Object.freeze(EVIDENCE_CARGO_IDS.flatMap((cargoId) => [
  'buy-1', 'buy-5', 'buy-max', 'sell-1', 'sell-5', 'sell-all',
].map((action) => `market-${cargoId}-${action}`)).sort());

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

function validateBoothViewport(issues, value, name, width, height) {
  if (!isRecord(value)) {
    issues.push(`profile evidence must include Booth ${name} viewport evidence`);
    return;
  }
  if (!isRecord(value.viewport) || value.viewport.width !== width || value.viewport.height !== height) {
    issues.push(`Booth ${name} viewport is wrong`);
  }
  if (value.pageHorizontalOverflowPx !== 0 || value.boothHorizontalOverflowPx !== 0
    || value.pageContained !== true || value.boothContained !== true) {
    issues.push(`Booth ${name} must have zero horizontal overflow and full containment`);
  }
  if (!sameMembers(value.labels, ['Name', 'Pronouns'])) {
    issues.push(`Booth ${name} labels are incomplete`);
  }
  if (!Array.isArray(value.visibleText) || value.visibleText.length === 0
    || value.visibleText.some((entry) => !isRecord(entry) || typeof entry.text !== 'string' || entry.fontPx < 14)) {
    issues.push(`Booth ${name} visible copy is below 14px or missing`);
  }
  if (!Array.isArray(value.controls) || !sameMembers(value.controls.map((entry) => entry?.testId), BOOTH_CONTROLS)
    || value.controls.some((entry) => !isRecord(entry) || entry.width < 44 || entry.height < 44)) {
    issues.push(`Booth ${name} controls must cover every control at 44px`);
  }
  if (!Array.isArray(value.focusChecks)
    || !sameMembers(value.focusChecks.map((entry) => entry?.testId), BOOTH_CONTROLS)
    || value.focusChecks.some((entry) => !isRecord(entry) || entry.focused !== true || entry.visible !== true)) {
    issues.push(`Booth ${name} focus checks must cover every control`);
  }
}

/**
 * The staged evidence boundary is deliberately import-safe: the browser check
 * owns collection, while this pure evaluator makes a phase claim fail closed.
 */
export function evaluatePortIdentityEvidence(evidence) {
  const issues = [];
  if (!exactKeys(issues, evidence, V2_FIELDS, 'evidence')) return { ok: false, issues };

  for (const section of RETAINED_V1_SECTIONS) {
    if (!(section in evidence)) issues.push(`retained v1 section ${section} is missing`);
  }
  if (evidence.schemaVersion !== 2) issues.push('schemaVersion must be 2');
  if (evidence.packagePhase !== 'market') issues.push('packagePhase must be market');

  const profile = evidence.profile;
  if (!isRecord(profile)) {
    issues.push('profile evidence is missing');
  } else if (
    profile.status !== 'setup-verified'
    || profile.defaultPronouns !== 'he/him'
    || profile.boothProfilePersisted !== true
    || Object.keys(profile).length !== 4
  ) {
    issues.push('profile evidence must be exact setup-verified evidence');
  } else {
    const setup = profile.setup;
    if (
      !isRecord(setup)
      || Object.keys(setup).length !== 4
      || !isRecord(setup.prefill)
      || Object.keys(setup.prefill).length !== 2
      || setup.prefill.captainName !== 'Mario'
      || setup.prefill.pronouns !== 'he/him'
      || !isRecord(setup.sharedPronounSnapshot)
      || Object.keys(setup.sharedPronounSnapshot).length !== 2
      || setup.sharedPronounSnapshot.profile !== 'they/them'
      || setup.sharedPronounSnapshot.campaign !== 'they/them'
      || setup.careerLengthControlPresent !== false
      || !isRecord(setup.accessibility)
      || Object.keys(setup.accessibility).length !== 3
      || setup.accessibility.minimumFontPx < 14
      || setup.accessibility.minimumTargetHeightPx < 44
      || setup.accessibility.horizontalOverflowPx !== 0
    ) {
      issues.push('profile evidence must be exact setup-verified evidence');
    }
  }

  const boothProfile = evidence.accessibility?.boothProfile;
  if (!isRecord(boothProfile)) {
    issues.push('profile evidence must include Booth desktop viewport evidence');
    issues.push('profile evidence must include Booth narrow viewport evidence');
  } else {
    validateBoothViewport(issues, boothProfile.desktop, 'desktop', 1440, 900);
    validateBoothViewport(issues, boothProfile.narrow, 'narrow', 960, 600);
  }

  if (!isRecord(evidence.art) || Object.keys(evidence.art).length !== 1 || evidence.art.status !== 'not-yet-observed') {
    issues.push('art must remain not-yet-observed during market phase');
  }
  if (!isRecord(evidence.market) || evidence.market.status !== 'verified' || !Array.isArray(evidence.market.samples)
    || Object.keys(evidence.market).length !== 2) {
    issues.push('market evidence must contain verified samples');
  } else {
    const market = validateMarketStability(evidence.market.samples);
    if (!market.ok) issues.push(...market.errors);
  }

  return { ok: issues.length === 0, issues };
}
