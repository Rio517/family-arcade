import { describe, expect, it } from 'vitest';

import { evaluatePortIdentityEvidence } from './caribbean-port-identity-evidence.mjs';

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
    packagePhase: 'setup',
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
    market: { status: 'not-yet-observed' },
    ...overrides,
  };
}

describe('evaluatePortIdentityEvidence', () => {
  it('accepts exact setup identity evidence while Market and art remain pending', () => {
    expect(evaluatePortIdentityEvidence(setupEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ['a missing retained v1 section', (() => {
      const evidence = setupEvidence();
      delete evidence.journey;
      return evidence;
    })(), 'retained v1 section journey is missing'],
    ['an unknown field', setupEvidence({ unexpected: true }), 'unknown evidence field unexpected'],
    ['the wrong package phase', setupEvidence({ packagePhase: 'profile' }), 'packagePhase must be setup'],
    ['premature Market success', setupEvidence({ market: { status: 'verified' } }), 'market must remain not-yet-observed during setup phase'],
    ['premature art success', setupEvidence({ art: { status: 'verified' } }), 'art must remain not-yet-observed during setup phase'],
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
