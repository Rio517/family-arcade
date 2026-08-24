import { describe, expect, it } from 'vitest';
import { CARGO_IDS } from '../../src/games/caribbean/content/campaign';
import { MARKET_PROBE_MINIMUM_NOW_FIXTURES, NOW_FIXTURES, profileScreenshotReadinessErrors } from '../caribbean-port-check.mjs';

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

const BOOTH_CONTROLS = [
  'booth-switch', 'booth-edit-profile', 'booth-new', 'booth-profile-name',
  'booth-profile-pronouns', 'booth-profile-save',
];

function boothViewport(width, height) {
  return {
    viewport: { width, height }, pageHorizontalOverflowPx: 0, boothHorizontalOverflowPx: 0,
    activePronouns: 'she/her', pageContained: true, boothContained: true, labels: ['Name', 'Pronouns'],
    visibleText: [{ text: 'Pronouns', fontPx: 14 }],
    controls: BOOTH_CONTROLS.map((testId) => ({ testId, label: testId, width: 44, height: 44 })),
    focusChecks: BOOTH_CONTROLS.map((testId) => ({ testId, focused: true, visible: true })),
  };
}

function rawArtEvidence() {
  const artViewports = [
    ['desktop', 1440, 900, 58], ['wide', 1180, 820, 56],
    ['tablet', 1024, 768, 54], ['minimum', 960, 600, 52],
  ];
  const selectors = [
    '.caribbean-port-status-rail dt', '.caribbean-port-status-rail dd', '.caribbean-port-captain',
    '.caribbean-port-stage h1', '.caribbean-port-bearing', '.caribbean-port-activity h2',
    '.caribbean-port-arrival', '.caribbean-port-action', '.caribbean-port-action-reason',
  ];
  const activity = [
    ['.caribbean-market-status:not(:empty)', 'Cargo ledger updated.'],
    ['.caribbean-tavern-rumour blockquote', 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.'],
    ['.caribbean-log-action-label', 'NEXT ACTION'],
    ['.caribbean-log-action-copy', 'Sail east of Bridgetown and identify the Red Jackdaw.'],
  ];
  const geometry = (market) => ({
    leaves: [
      'party-pill', 'port-position', ...Array.from({ length: 5 }, (_, index) => `port-fact-${index}`),
      'port-stage-title', 'port-bearing', 'port-activity-heading',
      ...['governor', 'tavern', 'market', 'shipyard', 'shares', 'log', 'set-sail'].map((id) => `port-action-${id}`),
      ...(market ? ['port-close-activity', ...EXPECTED_MARKET_ACTION_IDS] : ['port-arrival']),
    ].map((id) => ({ id, contained: true, horizontalOverflowPx: 0, verticalOverflowPx: 0 })),
    overlapPairs: [],
  });
  return {
    status: 'verified', asset: 'src/games/caribbean/assets/bridgetown-1675.webp',
    emitted: { url: '/assets/bridgetown-1675-hash.webp', contentType: 'image/webp', precached: true },
    report: {
      historicalReview: 'pass', representationReview: 'pass', subjectRoi: [0.37, 0.24, 0.58, 0.71],
      sha256: '0c1c99213d2903fb84a027a6f64508548c631b8fdefc6e41031e7954854ec67d',
    },
    screenshots: {
      normal: artViewports.map(([name]) => `port-art-${name}.png`),
      fallback: artViewports.map(([name]) => `port-art-${name}-fallback.png`),
    },
    viewports: artViewports.map(([name, width, height, focalX]) => ({
      name, viewport: { width, height }, naturalSize: { width: 1920, height: 1080 },
      focal: { xPercent: focalX, yPercent: 50, roiVisibleRatio: 0.8 },
      contrasts: selectors.map((selector) => ({ selector, minimumRatio: 7, backgroundAlpha: 1 })),
      activityContrasts: activity.map(([selector, text]) => ({ selector, text, minimumRatio: 7, backgroundAlpha: 1 })),
      fixtureState: { gold: '500 gold', provisions: '3.4 months' },
      menuGeometry: geometry(false), marketGeometry: geometry(true),
    })),
  };
}

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
    accessibility: {
      minimumMeasuredFontPx: 14, minimumMeasuredTargetWidthPx: 44, minimumMeasuredTargetHeightPx: 44, horizontalOverflowPx: 0,
      boothProfile: { desktop: boothViewport(1440, 900), narrow: boothViewport(960, 600) },
    },
    requests: { externalCount: 0, failedCount: 0, requestedPaths: ['/'] },
    failures: { console: [], page: [], requests: [], external: [] },
    isolation: { previewHtmlAbsent: true, caribbeanGlbAbsent: false, glbRequested: false, previewResourceRequested: false, moduleMarkersAbsent: true, battleCssAbsent: true },
    recovery: { quarantineKey: 'caribbean:campaign:quarantine:00000000-0000-4000-8000-000000000001', quarantineVerified: true, exportedCorruptRawVerified: true, recoveredChecksum: '9d36f629', recoveryReloaded: true },
    screenshots: SCREENSHOTS,
    determinism: { cleanRuns: 2, metricsByteIdentical: true, screenshotsByteIdentical: true },
    profile: {
      status: 'setup-verified', defaultPronouns: 'he/him', boothProfilePersisted: true,
      setup: {
        prefill: { captainName: 'Mario', pronouns: 'he/him' },
        sharedPronounSnapshot: { profile: 'they/them', campaign: 'they/them' },
        careerLengthControlPresent: false,
        accessibility: { minimumFontPx: 14, minimumTargetHeightPx: 44, horizontalOverflowPx: 0 },
      },
    },
    profileIdentity: { status: 'verified', defaultPronouns: 'he/him', setupNamePrefilled: true, setupPronounsPrefilled: true, campaignSnapshotPreserved: true, careerLengthControlAbsent: true, newCampaignLength: 'adventure' },
    art: {
      ...rawArtEvidence(), loaded: true, localRequest: true, naturalWidth: 1920, naturalHeight: 1080,
      fallbackVerified: true, precached: true, historicalReview: 'pass', representationReview: 'pass',
      focalVisibleAt: ['1440x900', '1180x820', '1024x768', '960x600'],
      minimumSubjectRoiVisibleFraction: 0.8, minimumTextContrast: 7, overlapCount: 0, clippingCount: 0,
      sha256: '0c1c99213d2903fb84a027a6f64508548c631b8fdefc6e41031e7954854ec67d',
    },
    market: { status: 'verified', samples: marketSamples() },
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
    'determinism', 'profile', 'profileIdentity', 'art', 'market', 'marketStability',
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
    ['the retained Booth profile measurements', (e) => { delete e.accessibility.boothProfile; }],
    ['a retained Booth control measurement', (e) => { e.accessibility.boothProfile.desktop.controls.pop(); }],
    ['the retained art asset observation', (e) => { delete e.art.asset; }],
    ['a retained raw art viewport ROI', (e) => { e.art.viewports[0].focal.roiVisibleRatio = 0.69; }],
    ['a retained raw art contrast observation', (e) => { e.art.viewports[0].contrasts[0].minimumRatio = 4.49; }],
    ['raw market samples', (e) => { e.market.samples.pop(); }],
  ])('fails closed when %s is absent or invalid', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });

  it.each([
    ['profile identity default pronouns', (e) => { e.profileIdentity.defaultPronouns = 'they/them'; }],
    ['profile identity setup prefill claim', (e) => { e.profileIdentity.setupNamePrefilled = false; }],
    ['art summary hash', (e) => { e.art.sha256 = 'not-the-raw-hash'; }],
    ['art summary focal ROI', (e) => { e.art.minimumSubjectRoiVisibleFraction = 0.81; }],
    ['market sample count', (e) => { e.marketStability.sampleCount = 107; }],
    ['market action identities', (e) => { e.marketStability.actionIds = []; }],
    ['market focus claim', (e) => { e.marketStability.focusPreserved = false; }],
  ])('rejects a summary that disagrees with retained raw evidence: %s', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });

  it.each([
    ['a Market sample', (e) => { e.market.samples[0].unexpected = true; }],
    ['a Market stage rectangle', (e) => { e.market.samples[0].stage.unexpected = true; }],
    ['a Market row rectangle', (e) => { e.market.samples[0].rows[0].unexpected = true; }],
    ['a Market action-strip rectangle', (e) => { e.market.samples[0].actionStrips[0].unexpected = true; }],
    ['a Market strip-width record', (e) => { e.market.samples[0].actionStripWidths[0].unexpected = true; }],
    ['a Booth viewport measurement', (e) => { e.accessibility.boothProfile.desktop.unexpected = true; }],
    ['a Booth viewport record', (e) => { e.accessibility.boothProfile.desktop.viewport.unexpected = true; }],
    ['a Booth visible-text record', (e) => { e.accessibility.boothProfile.desktop.visibleText[0].unexpected = true; }],
    ['a Booth control record', (e) => { e.accessibility.boothProfile.desktop.controls[0].unexpected = true; }],
    ['a Booth focus record', (e) => { e.accessibility.boothProfile.desktop.focusChecks[0].unexpected = true; }],
    ['the raw art emission record', (e) => { e.art.emitted.unexpected = true; }],
    ['the raw art report record', (e) => { e.art.report.unexpected = true; }],
    ['the raw art screenshot record', (e) => { e.art.screenshots.unexpected = true; }],
    ['a raw art viewport', (e) => { e.art.viewports[0].unexpected = true; }],
    ['a raw art viewport-size record', (e) => { e.art.viewports[0].viewport.unexpected = true; }],
    ['a raw art natural-size record', (e) => { e.art.viewports[0].naturalSize.unexpected = true; }],
    ['a raw art focal record', (e) => { e.art.viewports[0].focal.unexpected = true; }],
    ['a raw art contrast record', (e) => { e.art.viewports[0].contrasts[0].unexpected = true; }],
    ['a raw art activity-contrast record', (e) => { e.art.viewports[0].activityContrasts[0].unexpected = true; }],
    ['a raw art fixture record', (e) => { e.art.viewports[0].fixtureState.unexpected = true; }],
    ['a raw art geometry record', (e) => { e.art.viewports[0].menuGeometry.unexpected = true; }],
    ['a raw art geometry leaf', (e) => { e.art.viewports[0].menuGeometry.leaves[0].unexpected = true; }],
  ])('fails closed on an unknown retained raw nested field in %s', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });

  it('returns structured issues instead of throwing after a malformed raw art record', () => {
    const evidence = completeEvidence();
    evidence.art.viewports[0].contrasts = null;
    expect(() => evaluatePortIdentityEvidence(evidence)).not.toThrow();
    expect(evaluatePortIdentityEvidence(evidence)).toMatchObject({ ok: false, issues: expect.any(Array) });
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

describe('player profile screenshot readiness', () => {
  const ready = {
    activeElement: { tag: 'BODY' }, caret: null, selection: null,
    scroll: { window: { x: 0, y: 0 }, documentElement: { left: 0, top: 0 }, body: { left: 0, top: 0 } },
    booth: { left: 0, top: 0 }, fonts: { status: 'loaded' },
    profileInputs: [{ selectionStart: 0, selectionEnd: 0 }, { selectionStart: 0, selectionEnd: 0 }],
  };

  it('accepts the normalized pre-screenshot state', () => {
    expect(profileScreenshotReadinessErrors(ready)).toEqual([]);
  });

  it('makes an omitted focus/selection/scroll normalization a failed evidence state', () => {
    expect(profileScreenshotReadinessErrors({
      ...ready,
      activeElement: { tag: 'INPUT' }, caret: { start: 2, end: 2 }, selection: { collapsed: true },
      scroll: { ...ready.scroll, window: { x: 0, y: 12 } }, booth: { left: 0, top: 8 },
      profileInputs: [{ selectionStart: 1, selectionEnd: 4 }],
    })).toEqual(expect.arrayContaining([
      'profile screenshot retains an interactive focus target',
      'profile screenshot retains a document selection',
      'profile screenshot retains an input caret',
      'profile screenshot has non-deterministic scroll state',
      'profile screenshot retains an input selection range',
    ]));
  });
});
