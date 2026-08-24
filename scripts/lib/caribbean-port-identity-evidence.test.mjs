import { describe, expect, it } from 'vitest';
import { CARGO_IDS } from '../../src/games/caribbean/content/campaign';
import { MARKET_PROBE_MINIMUM_NOW_FIXTURES, NOW_FIXTURES } from '../caribbean-port-check.mjs';

import {
  EVIDENCE_CARGO_IDS,
  EXPECTED_MARKET_ACTION_IDS,
  evaluatePortIdentityEvidence,
  marketStabilityFailure,
  validateMarketStability,
} from './caribbean-port-identity-evidence.mjs';

const SCREENSHOTS = [
  'setup-desktop.png', 'port-desktop.png', 'market-desktop.png', 'tavern-desktop.png',
  'captains-log-desktop.png', 'recovery-desktop.png', 'port-minimum-supported.png',
  'minimum-screen-width.png', 'minimum-screen-height.png', 'minimum-screen-large-portrait.png',
  'port-tablet-landscape.png', 'port-compact-landscape.png', 'port-art-fallback.png',
  'player-profile-desktop.png',
];

const VIEWPORTS = {
  setupDesktop: [1440, 900, true],
  profileDesktop: [1440, 900, false],
  portDesktop: [1440, 900, true],
  portTabletLandscape: [1180, 820, true],
  portCompactLandscape: [1024, 768, true],
  artFallback: [1440, 900, true],
  minimumSupported: [960, 600, true],
  minimumWidth: [959, 600, false],
  minimumHeight: [960, 599, false],
  largePortrait: [1024, 1366, false],
};

function viewport(name, [width, height, expectedSupported]) {
  const profile = name === 'profileDesktop';
  return {
    name,
    width,
    height,
    dpr: 1,
    orientation: width >= height ? 'landscape' : 'portrait',
    expectedSupported,
    controllerMounted: expectedSupported,
    noticeVisible: profile ? false : !expectedSupported,
    noticeFocused: profile ? false : !expectedSupported,
    minimumFontPx: 14,
    minimumTargetWidthPx: 44,
    minimumTargetHeightPx: 44,
    undersizedTargets: [],
    occludedTargets: [],
    partyObscured: false,
    horizontalOverflowPx: 0,
  };
}

function marketSamples() {
  return EXPECTED_MARKET_ACTION_IDS.flatMap((actionTestId) => ['before', 'pending', 'resolved'].map((phase) => ({
    phase,
    actionTestId,
    stage: { x: 160, y: 82, width: 1120, height: 730 },
    rows: Array.from({ length: 6 }, (_, index) => ({ x: 232, y: 240 + index * 72, width: 976, height: 72 })),
    actionStrips: Array.from({ length: 6 }, () => ({ x: 720, y: 240, width: 488, height: 44 })),
    stageClientWidth: 1120,
    stageScrollWidth: 1120,
    rowsClientWidth: 976,
    rowsScrollWidth: 976,
    actionStripWidths: Array.from({ length: 6 }, (_, index) => ({
      testId: `market-action-strip-${index + 1}`, clientWidth: 488, scrollWidth: 488,
    })),
    scrollLeft: 0,
    scrollTop: 0,
    focusedTestId: actionTestId,
    status: phase === 'before' ? '' : phase === 'pending' ? 'Saving trade.' : 'Cargo ledger updated.',
    ariaBusy: phase === 'pending',
  })));
}

function completeEvidence(overrides = {}) {
  return {
    schemaVersion: 2,
    packagePhase: 'complete',
    browser: { name: 'Chromium', version: '151.0.7922.34' },
    route: '/#/caribbean',
    build: 'normal production (BUILD_HARNESS unset)',
    viewports: Object.fromEntries(Object.entries(VIEWPORTS).map(([name, spec]) => [name, viewport(name, spec)])),
    fixtures: {
      nowProvided: Array.from({ length: 96 }, (_, index) => 1_700_000_000_000 + index * 1_000),
      seedsProvided: [1702, 2702, 3702, 4702, 5702, 6702, 7702, 8702],
      uuidsProvided: Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
      nowConsumed: Array.from({ length: 6 }, (_, index) => 1_700_000_000_000 + index * 1_000),
      seedsConsumed: [1702],
      uuidsConsumed: ['00000000-0000-4000-8000-000000000001'],
    },
    webLocks: { realNavigatorLocks: true, calls: Array.from({ length: 5 }, () => ({ name: 'caribbean:campaign:writer', mode: 'exclusive' })) },
    journey: { finalEventCount: 2, eventTypes: ['market-traded', 'lead-accepted'], saveChecksum: 'ba05d9f4', replayVerified: true },
    accessibility: { minimumMeasuredFontPx: 14, minimumMeasuredTargetWidthPx: 44, minimumMeasuredTargetHeightPx: 44, horizontalOverflowPx: 0 },
    requests: { externalCount: 0, failedCount: 0, requestedPaths: ['/'] },
    failures: { console: [], page: [], requests: [], external: [] },
    isolation: { previewHtmlAbsent: true, caribbeanGlbAbsent: true, glbRequested: false, previewResourceRequested: false, moduleMarkersAbsent: true, battleCssAbsent: true },
    recovery: { quarantineKey: 'caribbean:campaign:quarantine:00000000-0000-4000-8000-000000000001', quarantineVerified: true, exportedCorruptRawVerified: true, recoveredChecksum: '9d36f629', recoveryReloaded: true },
    screenshots: SCREENSHOTS,
    determinism: { cleanRuns: 2, metricsByteIdentical: true, screenshotsByteIdentical: true },
    profileIdentity: { status: 'verified', defaultPronouns: 'he/him', setupNamePrefilled: true, setupPronounsPrefilled: true, campaignSnapshotPreserved: true, careerLengthControlAbsent: true, newCampaignLength: 'adventure' },
    art: { status: 'verified', loaded: true, localRequest: true, naturalWidth: 1920, naturalHeight: 1080, fallbackVerified: true, precached: true, historicalReview: 'pass', representationReview: 'pass', focalVisibleAt: ['1440x900', '1180x820', '1024x768', '960x600'], minimumSubjectRoiVisibleFraction: 0.7, minimumTextContrast: 4.5, overlapCount: 0, clippingCount: 0, sha256: '0c1c99213d2903fb84a027a6f64508548c631b8fdefc6e41031e7954854ec67d' },
    marketStability: { status: 'verified', sampleCount: 108, actionIds: EXPECTED_MARKET_ACTION_IDS, maxDrift: 1, horizontalOverflow: 0, focusPreserved: true, busyStatesVerified: true, statusesVerified: true },
    ...overrides,
  };
}

describe('evaluatePortIdentityEvidence', () => {
  it('accepts only the final complete v2 schema with every v1 channel retained', () => {
    expect(evaluatePortIdentityEvidence(completeEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    'schemaVersion', 'packagePhase', 'browser', 'route', 'build', 'viewports', 'fixtures', 'webLocks',
    'journey', 'accessibility', 'requests', 'failures', 'isolation', 'recovery', 'screenshots',
    'determinism', 'profileIdentity', 'art', 'marketStability',
  ])('fails closed when top-level %s is missing', (section) => {
    const evidence = completeEvidence();
    delete evidence[section];
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });

  it.each([
    ['browser', (e) => { e.browser.name = 'Firefox'; }],
    ['route', (e) => { e.route = '/#/'; }],
    ['build', (e) => { e.build = 'harness'; }],
    ['viewports', (e) => { e.viewports.portDesktop.width = 1439; }],
    ['fixtures', (e) => { e.fixtures.nowConsumed[0] = 0; }],
    ['webLocks', (e) => { e.webLocks.calls[0].mode = 'shared'; }],
    ['journey', (e) => { e.journey.eventTypes = ['lead-accepted', 'market-traded']; }],
    ['accessibility', (e) => { e.accessibility.minimumMeasuredFontPx = 13.99; }],
    ['requests', (e) => { e.requests.externalCount = 1; }],
    ['failures', (e) => { e.failures.console = ['boom']; }],
    ['isolation', (e) => { e.isolation.glbRequested = true; }],
    ['recovery', (e) => { e.recovery.quarantineVerified = false; }],
    ['screenshots', (e) => { e.screenshots.pop(); }],
    ['determinism', (e) => { e.determinism.cleanRuns = 1; }],
    ['profileIdentity', (e) => { e.profileIdentity.defaultPronouns = 'they/them'; }],
    ['art', (e) => { e.art.minimumTextContrast = 4.49; }],
    ['marketStability', (e) => { e.marketStability.actionIds = []; }],
  ])('fails closed on a representative %s mutation', (_section, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });

  it.each([
    ['unknown top-level fields', (e) => { e.unexpected = true; }],
    ['unknown nested fields', (e) => { e.art.unexpected = true; }],
    ['non-finite numbers', (e) => { e.art.minimumSubjectRoiVisibleFraction = Number.NaN; }],
    ['malformed failure arrays', (e) => { e.failures.page = 'none'; }],
    ['a non-local requested path', (e) => { e.requests.requestedPaths = ['https://example.test/x']; }],
  ])('rejects %s', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });
});

describe('validateMarketStability', () => {
  it('reserves deterministic clock fixtures for six clean starts and all 36 probe trades', () => {
    expect(MARKET_PROBE_MINIMUM_NOW_FIXTURES).toBe(42);
    expect(NOW_FIXTURES.length).toBeGreaterThanOrEqual(MARKET_PROBE_MINIMUM_NOW_FIXTURES);
  });

  it('keeps import-safe evidence cargo identities in parity with production content', () => {
    expect(EVIDENCE_CARGO_IDS).toEqual(CARGO_IDS);
  });

  it('formats only an explicit failed stability verdict and keeps a successful verdict error-free', () => {
    expect(marketStabilityFailure({ ok: true, maxDrift: 1 })).toBeNull();
    expect(marketStabilityFailure({ ok: false, errors: ['rows drift'] })).toBe('rows drift');
    expect(() => marketStabilityFailure({ ok: false })).toThrow('market stability failure is malformed');
  });

  it('requires all 36 fixed cargo action identities through before, pending, and resolved phases', () => {
    expect(EVIDENCE_CARGO_IDS).toEqual(['provisions', 'tools', 'luxuries', 'sugar-molasses', 'tobacco-dyewood', 'powder-arms']);
    expect(EXPECTED_MARKET_ACTION_IDS).toHaveLength(36);
    expect(validateMarketStability(marketSamples())).toEqual({ ok: true, maxDrift: 1 });
  });

  it.each([
    ['a missing phase', (samples) => samples.slice(1)],
    ['a duplicate action identity', (samples) => [...samples.slice(0, -3), ...samples.slice(0, 3)]],
    ['a 1.01px geometry jump', (samples) => samples.map((sample, index) => index === 1 ? { ...sample, stage: { ...sample.stage, x: sample.stage.x + 1.01 } } : sample)],
    ['horizontal overflow', (samples) => samples.map((sample, index) => index === 0 ? { ...sample, rowsScrollWidth: sample.rowsClientWidth + 1 } : sample)],
    ['lost focus', (samples) => samples.map((sample, index) => index === 0 ? { ...sample, focusedTestId: null } : sample)],
    ['an invalid pending status', (samples) => samples.map((sample, index) => index === 1 ? { ...sample, status: '' } : sample)],
  ])('fails closed on %s', (_label, mutate) => {
    expect(validateMarketStability(mutate(marketSamples()))).toMatchObject({ ok: false });
  });

  it.each([
    ['null rows', (sample) => ({ ...sample, rows: null })],
    ['non-array rows', (sample) => ({ ...sample, rows: {} })],
    ['null action strips', (sample) => ({ ...sample, actionStrips: null })],
    ['non-array action strips', (sample) => ({ ...sample, actionStrips: {} })],
  ])('returns a failed verdict rather than throwing for %s', (_label, mutate) => {
    const samples = marketSamples();
    samples[0] = mutate(samples[0]);
    expect(() => validateMarketStability(samples)).not.toThrow();
    expect(validateMarketStability(samples)).toMatchObject({ ok: false, errors: expect.any(Array) });
  });

  it.each([
    ['action strips', (sample, length) => ({ ...sample, actionStrips: sample.actionStrips.slice(0, length) })],
    ['strip-width entries', (sample, length) => ({ ...sample, actionStripWidths: sample.actionStripWidths.slice(0, length) })],
  ])('rejects %s with 0, 5, or 7 entries in every sample', (_label, mutate) => {
    for (const length of [0, 5, 7]) {
      const samples = marketSamples().map((sample) => mutate(sample, length));
      if (length === 7) for (const sample of samples) {
        if (_label === 'action strips') sample.actionStrips.push({ x: 720, y: 240, width: 488, height: 44 });
        else sample.actionStripWidths.push({ testId: 'market-action-strip-7', clientWidth: 488, scrollWidth: 488 });
      }
      expect(validateMarketStability(samples)).toMatchObject({ ok: false, errors: expect.any(Array) });
    }
  });
});
