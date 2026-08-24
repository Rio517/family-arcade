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
  if (evidence.packagePhase !== 'profile') issues.push('packagePhase must be profile');

  const profile = evidence.profile;
  if (!isRecord(profile)) {
    issues.push('profile evidence is missing');
  } else if (
    profile.status !== 'profile-only'
    || profile.defaultPronouns !== 'he/him'
    || profile.boothProfilePersisted !== true
    || profile.setup !== 'not-yet-observed'
    || Object.keys(profile).length !== 4
  ) {
    issues.push('profile evidence must be exact profile-only evidence');
  }

  for (const [section, label] of [['market', 'market'], ['art', 'art']]) {
    const value = evidence[section];
    if (!isRecord(value) || Object.keys(value).length !== 1 || value.status !== 'not-yet-observed') {
      issues.push(`${label} must remain not-yet-observed during profile phase`);
    }
  }

  return { ok: issues.length === 0, issues };
}
