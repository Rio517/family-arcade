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
  if (evidence.packagePhase !== 'setup') issues.push('packagePhase must be setup');

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

  for (const [section, label] of [['market', 'market'], ['art', 'art']]) {
    const value = evidence[section];
    if (!isRecord(value) || Object.keys(value).length !== 1 || value.status !== 'not-yet-observed') {
      issues.push(`${label} must remain not-yet-observed during setup phase`);
    }
  }

  return { ok: issues.length === 0, issues };
}
