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

function profileEvidence(overrides = {}) {
  return {
    ...retainedV1Evidence(),
    schemaVersion: 2,
    packagePhase: 'profile',
    profile: {
      status: 'profile-only',
      defaultPronouns: 'he/him',
      boothProfilePersisted: true,
      setup: 'not-yet-observed',
    },
    art: { status: 'not-yet-observed' },
    market: { status: 'not-yet-observed' },
    ...overrides,
  };
}

describe('evaluatePortIdentityEvidence', () => {
  it('accepts the exact profile-only v2 evidence while later branches remain pending', () => {
    expect(evaluatePortIdentityEvidence(profileEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ['a missing retained v1 section', (() => {
      const evidence = profileEvidence();
      delete evidence.journey;
      return evidence;
    })(), 'retained v1 section journey is missing'],
    ['an unknown field', profileEvidence({ unexpected: true }), 'unknown evidence field unexpected'],
    ['the wrong package phase', profileEvidence({ packagePhase: 'setup' }), 'packagePhase must be profile'],
    ['premature Market success', profileEvidence({ market: { status: 'verified' } }), 'market must remain not-yet-observed during profile phase'],
    ['premature art success', profileEvidence({ art: { status: 'verified' } }), 'art must remain not-yet-observed during profile phase'],
    ['missing narrow Booth measurement', profileEvidence({
      accessibility: { boothProfile: { desktop: boothViewport(1440, 900) } },
    }), 'profile evidence must include Booth narrow viewport evidence'],
    ['a missing keyboard focus check', profileEvidence({
      accessibility: { boothProfile: {
        desktop: boothViewport(1440, 900),
        narrow: { ...boothViewport(960, 600), focusChecks: [] },
      } },
    }), 'Booth narrow focus checks must cover every control'],
  ])('fails closed on %s', (_label, evidence, issue) => {
    expect(evaluatePortIdentityEvidence(evidence)).toEqual({ ok: false, issues: [issue] });
  });
});
