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

const BOOTH_CONTROLS = [
  'booth-switch',
  'booth-edit-profile',
  'booth-new',
  'booth-profile-name',
  'booth-profile-pronouns',
  'booth-profile-save',
];

function boothViewport(width, height) {
  return {
    viewport: { width, height },
    pageHorizontalOverflowPx: 0,
    boothHorizontalOverflowPx: 0,
    pageContained: true,
    boothContained: true,
    labels: ['Name', 'Pronouns'],
    visibleText: [{ text: 'Pronouns', fontPx: 14 }],
    controls: BOOTH_CONTROLS.map((testId) => ({ testId, width: 44, height: 44 })),
    focusChecks: BOOTH_CONTROLS.map((testId) => ({ testId, focused: true, visible: true })),
  };
}

function retainedV1Evidence() {
  return {
    browser: { name: 'Chromium', version: '151.0.7922.34' },
    route: '/#/caribbean',
    build: 'normal production (BUILD_HARNESS unset)',
    viewports: {},
    fixtures: {},
    webLocks: {},
    journey: {},
    accessibility: {
      boothProfile: {
        desktop: boothViewport(1440, 900),
        narrow: boothViewport(960, 600),
      },
    },
    requests: {},
    failures: {},
    isolation: {},
    recovery: {},
    screenshots: ['setup-desktop.png', 'player-profile-desktop.png'],
    determinism: {},
  };
}

function setupEvidence(overrides = {}) {
  return {
    ...retainedV1Evidence(),
    schemaVersion: 2,
    packagePhase: 'art',
    profile: {
      status: 'setup-verified',
      defaultPronouns: 'he/him',
      boothProfilePersisted: true,
      setup: {
        prefill: { captainName: 'Mario', pronouns: 'he/him' },
        sharedPronounSnapshot: { profile: 'they/them', campaign: 'they/them' },
        careerLengthControlPresent: false,
        accessibility: { minimumFontPx: 14, minimumTargetHeightPx: 44, horizontalOverflowPx: 0 },
      },
    },
    art: artEvidence(),
    market: { status: 'verified', samples: marketSamples() },
    ...overrides,
  };
}

const ART_VIEWPORTS = [
  ['desktop', 1440, 900, 58],
  ['wide', 1180, 820, 56],
  ['tablet', 1024, 768, 54],
  ['minimum', 960, 600, 52],
];

const CONTRAST_SELECTORS = [
  '.caribbean-port-status-rail dt',
  '.caribbean-port-status-rail dd',
  '.caribbean-port-captain',
  '.caribbean-port-stage h1',
  '.caribbean-port-bearing',
  '.caribbean-port-activity h2',
  '.caribbean-port-arrival',
  '.caribbean-port-action',
  '.caribbean-port-action-reason',
];

const ACTIVITY_CONTRAST_SPECS = [
  { selector: '.caribbean-market-status:not(:empty)', text: 'Cargo ledger updated.' },
  { selector: '.caribbean-tavern-rumour blockquote', text: 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.' },
  { selector: '.caribbean-log-action-label', text: 'NEXT ACTION' },
  { selector: '.caribbean-log-action-copy', text: 'Sail east of Bridgetown and identify the Red Jackdaw.' },
];

function geometryEvidence(includeMarket = false) {
  const ids = [
    'party-pill', 'port-position', ...Array.from({ length: 5 }, (_, index) => `port-fact-${index}`),
    'port-stage-title', 'port-bearing', 'port-activity-heading',
    ...EXPECTED_MARKET_ACTION_IDS.filter(() => includeMarket),
    ...['governor', 'tavern', 'market', 'shipyard', 'shares', 'log', 'set-sail'].map((id) => `port-action-${id}`),
  ];
  if (includeMarket) ids.push('port-close-activity');
  else ids.push('port-arrival');
  return {
    leaves: ids.map((id) => ({ id, contained: true, horizontalOverflowPx: 0, verticalOverflowPx: 0 })),
    overlapPairs: [],
  };
}

function artEvidence() {
  return {
    status: 'verified',
    asset: 'src/games/caribbean/assets/bridgetown-1675.webp',
    emitted: { url: '/assets/bridgetown-1675-hash.webp', contentType: 'image/webp', precached: true },
    report: {
      historicalReview: 'pass',
      representationReview: 'pass',
      subjectRoi: [0.37, 0.24, 0.58, 0.71],
    },
    screenshots: {
      normal: ART_VIEWPORTS.map(([name]) => `port-art-${name}.png`),
      fallback: ART_VIEWPORTS.map(([name]) => `port-art-${name}-fallback.png`),
    },
    viewports: ART_VIEWPORTS.map(([name, width, height, focalX]) => ({
      name,
      viewport: { width, height },
      focal: { xPercent: focalX, yPercent: 50, roiVisibleRatio: 0.8 },
      contrasts: CONTRAST_SELECTORS.map((selector) => ({ selector, minimumRatio: 7, backgroundAlpha: 1 })),
      activityContrasts: ACTIVITY_CONTRAST_SPECS.map(({ selector, text }) => ({
        selector, text, minimumRatio: 7, backgroundAlpha: 1,
      })),
      fixtureState: { gold: '500 gold', provisions: '3.4 months' },
      menuGeometry: geometryEvidence(false),
      marketGeometry: geometryEvidence(true),
    })),
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

describe('evaluatePortIdentityEvidence', () => {
  it('accepts exact verified profile, Market, and harbour-art evidence at art phase', () => {
    expect(evaluatePortIdentityEvidence(setupEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ['a missing retained v1 section', (() => {
      const evidence = setupEvidence();
      delete evidence.journey;
      return evidence;
    })(), 'retained v1 section journey is missing'],
    ['an unknown field', setupEvidence({ unexpected: true }), 'unknown evidence field unexpected'],
    ['the wrong package phase', setupEvidence({ packagePhase: 'market' }), 'packagePhase must be art'],
    ['missing Market samples', setupEvidence({ market: { status: 'verified' } }), 'market evidence must contain verified samples'],
    ['failed historical review', setupEvidence({ art: {
      ...artEvidence(), report: { ...artEvidence().report, historicalReview: 'fail' },
    } }), 'art historical and representation reviews must pass'],
    ['missing ROI', setupEvidence({ art: {
      ...artEvidence(), report: { historicalReview: 'pass', representationReview: 'pass' },
    } }), 'art subject ROI is missing or malformed'],
    ['contrast below 4.5', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport, index) => index === 0
        ? { ...viewport, contrasts: viewport.contrasts.map((sample, sampleIndex) => sampleIndex === 0
          ? { ...sample, minimumRatio: 4.49 } : sample) }
        : viewport),
    } }), 'art desktop contrast must be opaque and at least 4.5:1'],
    ['an omitted nested log-label selector', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport, index) => index === 0
        ? { ...viewport, activityContrasts: viewport.activityContrasts.filter(
          (sample) => sample.selector !== '.caribbean-log-action-label',
        ) }
        : viewport),
    } }), 'art desktop activity contrast must include exact .caribbean-log-action-label / NEXT ACTION'],
    ['a transparent nested log-label sample', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport, index) => index === 0
        ? { ...viewport, activityContrasts: viewport.activityContrasts.map((sample) => (
          sample.selector === '.caribbean-log-action-label' ? { ...sample, backgroundAlpha: 0 } : sample
        )) }
        : viewport),
    } }), 'art desktop activity contrast .caribbean-log-action-label must resolve to an opaque background'],
    ['a sub-4.5 nested log-label sample', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport, index) => index === 0
        ? { ...viewport, activityContrasts: viewport.activityContrasts.map((sample) => (
          sample.selector === '.caribbean-log-action-label' ? { ...sample, minimumRatio: 4.49 } : sample
        )) }
        : viewport),
    } }), 'art desktop activity contrast .caribbean-log-action-label must be at least 4.5:1'],
    ['responsive fixture drift after an activity probe', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport) => viewport.name === 'wide'
        ? { ...viewport, fixtureState: { gold: '496 gold', provisions: '3.5 months' } }
        : viewport),
    } }), 'art wide capture fixture must remain at 500 gold / 3.4 months'],
    ['clipped leaf', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport, index) => index === 0
        ? { ...viewport, menuGeometry: {
          ...viewport.menuGeometry,
          leaves: viewport.menuGeometry.leaves.map((leaf, leafIndex) => leafIndex === 0
            ? { ...leaf, horizontalOverflowPx: 1 } : leaf),
        } }
        : viewport),
    } }), 'art desktop menu geometry clips or escapes the viewport'],
    ['overlapping controls', setupEvidence({ art: {
      ...artEvidence(), viewports: artEvidence().viewports.map((viewport, index) => index === 0
        ? { ...viewport, marketGeometry: { ...viewport.marketGeometry, overlapPairs: [['a', 'b']] } }
        : viewport),
    } }), 'art desktop market interactive rectangles overlap'],
    ['absent precache', setupEvidence({ art: {
      ...artEvidence(), emitted: { ...artEvidence().emitted, precached: false },
    } }), 'art emitted WebP must be precached'],
    ['missing narrow Booth measurement', setupEvidence({
      accessibility: { boothProfile: { desktop: boothViewport(1440, 900) } },
    }), 'profile evidence must include Booth narrow viewport evidence'],
    ['a missing keyboard focus check', setupEvidence({
      accessibility: { boothProfile: {
        desktop: boothViewport(1440, 900),
        narrow: { ...boothViewport(960, 600), focusChecks: [] },
      } },
    }), 'Booth narrow focus checks must cover every control'],
    ['a missing setup identity snapshot', setupEvidence({
      profile: {
        status: 'setup-verified',
        defaultPronouns: 'he/him',
        boothProfilePersisted: true,
        setup: { prefill: { captainName: 'Mario', pronouns: 'he/him' } },
      },
    }), 'profile evidence must be exact setup-verified evidence'],
  ])('fails closed on %s', (_label, evidence, issue) => {
    expect(evaluatePortIdentityEvidence(evidence)).toEqual({ ok: false, issues: [issue] });
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
    expect(EVIDENCE_CARGO_IDS).toEqual([
      'provisions', 'tools', 'luxuries', 'sugar-molasses', 'tobacco-dyewood', 'powder-arms',
    ]);
    expect(EXPECTED_MARKET_ACTION_IDS).toHaveLength(36);
    expect(validateMarketStability(marketSamples())).toEqual({ ok: true, maxDrift: 1 });
  });

  it.each([
    ['a missing phase', (samples) => samples.slice(1)],
    ['a duplicate action identity', (samples) => [...samples.slice(0, -3), ...samples.slice(0, 3)]],
    ['a 1.01px geometry jump', (samples) => samples.map((sample, index) => index === 1
      ? { ...sample, stage: { ...sample.stage, x: sample.stage.x + 1.01 } } : sample)],
    ['horizontal overflow', (samples) => samples.map((sample, index) => index === 0
      ? { ...sample, rowsScrollWidth: sample.rowsClientWidth + 1 } : sample)],
    ['lost focus', (samples) => samples.map((sample, index) => index === 0
      ? { ...sample, focusedTestId: null } : sample)],
    ['an invalid pending status', (samples) => samples.map((sample, index) => index === 1
      ? { ...sample, status: '' } : sample)],
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
      if (length === 7) {
        for (const sample of samples) {
          if (_label === 'action strips') sample.actionStrips.push({ x: 720, y: 240, width: 488, height: 44 });
          else sample.actionStripWidths.push({ testId: 'market-action-strip-7', clientWidth: 488, scrollWidth: 488 });
        }
      }
      expect(validateMarketStability(samples)).toMatchObject({ ok: false, errors: expect.any(Array) });
    }
  });

  it('accepts exactly 1px drift and rejects invalid sample shapes', () => {
    const exactBoundary = marketSamples();
    exactBoundary[1] = { ...exactBoundary[1], stage: { ...exactBoundary[1].stage, x: 161 } };
    expect(validateMarketStability(exactBoundary)).toEqual({ ok: true, maxDrift: 1 });
    expect(validateMarketStability({ samples: [] })).toMatchObject({ ok: false });
  });
});
