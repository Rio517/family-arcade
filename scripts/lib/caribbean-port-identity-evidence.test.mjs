import { describe, expect, it } from 'vitest';

import { evaluatePortIdentityEvidence } from './caribbean-port-identity-evidence.mjs';

function retainedV1Evidence() {
  return {
    browser: { name: 'Chromium', version: '151.0.7922.34' },
    route: '/#/caribbean',
    build: 'normal production (BUILD_HARNESS unset)',
    viewports: {},
    fixtures: {},
    webLocks: {},
    journey: {},
    accessibility: {},
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
  ])('fails closed on %s', (_label, evidence, issue) => {
    expect(evaluatePortIdentityEvidence(evidence)).toEqual({ ok: false, issues: [issue] });
  });
});
