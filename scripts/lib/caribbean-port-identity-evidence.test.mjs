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
    packagePhase: 'market',
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
    art: { status: 'not-yet-observed' },
    market: { status: 'verified', samples: marketSamples() },
    ...overrides,
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
  it('accepts exact profile evidence while Market is verified and art remains pending', () => {
    expect(evaluatePortIdentityEvidence(setupEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ['a missing retained v1 section', (() => {
      const evidence = setupEvidence();
      delete evidence.journey;
      return evidence;
    })(), 'retained v1 section journey is missing'],
    ['an unknown field', setupEvidence({ unexpected: true }), 'unknown evidence field unexpected'],
    ['the wrong package phase', setupEvidence({ packagePhase: 'profile' }), 'packagePhase must be market'],
    ['missing Market samples', setupEvidence({ market: { status: 'verified' } }), 'market evidence must contain verified samples'],
    ['premature art success', setupEvidence({ art: { status: 'verified' } }), 'art must remain not-yet-observed during market phase'],
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
