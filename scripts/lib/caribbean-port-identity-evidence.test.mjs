import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CARGO_IDS } from '../../src/games/caribbean/content/campaign';
import * as portCheck from '../caribbean-port-check.mjs';

import {
  EVIDENCE_CARGO_IDS,
  EXPECTED_MARKET_ACTION_IDS,
  evaluatePortIdentityEvidence,
  marketStabilityFailure,
  validateMarketStability,
} from './caribbean-port-identity-evidence.mjs';

const {
  MARKET_PROBE_MINIMUM_NOW_FIXTURES,
  NOW_FIXTURES,
  profileScreenshotReadinessErrors,
} = portCheck;

const SCREENSHOTS = [
  'setup-desktop.png', 'port-desktop.png', 'market-desktop.png', 'tavern-desktop.png',
  'captains-log-desktop.png', 'recovery-desktop.png', 'port-minimum-supported.png',
  'minimum-screen-width.png', 'minimum-screen-height.png', 'minimum-screen-large-portrait.png',
  'port-tablet-landscape.png', 'port-compact-landscape.png', 'port-art-fallback.png',
  'player-profile-desktop.png',
];

const STRATEGIC_SCREENSHOTS = [
  'sailing-desktop.png',
  'encounter-desktop.png',
  'campaign-battle-desktop.png',
  'campaign-result-desktop.png',
  'returned-log-desktop.png',
  'sailing-minimum-supported.png',
  'campaign-battle-fallback.png',
  'sailing-large-portrait-notice.png',
  'campaign-battle-resize-notice.png',
];

const NORMAL_ROUTE_SCREENSHOTS = [...SCREENSHOTS, ...STRATEGIC_SCREENSHOTS];
const RESULT_SCREENSHOT = 'campaign-result-desktop.png';

async function strategicAccessibilitySample(
  resultVisible,
  { battleTextPx = 18, noticeTextPx = 14 } = {},
) {
  document.body.innerHTML = `
    <section class="campaign-naval-battle__engagement">
      <div class="naval-battle-page">
        <p style="font-size: ${battleTextPx}px">Battle command</p>
        <div class="naval-result" style="display: ${resultVisible ? 'block' : 'none'}">
          <p style="font-size: 20px">Victory</p>
        </div>
      </div>
      <p class="campaign-naval-battle__restart-note" style="font-size: ${noticeTextPx}px">Reloading restarts this engagement.</p>
      <p class="campaign-naval-battle__status" style="font-size: ${noticeTextPx}px">Battle result not saved.</p>
    </section>
  `;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const hidden = getComputedStyle(this).display === 'none';
    // Production's wrapper has no in-flow box because its battle and notices
    // are positioned surfaces. Evidence must sample those visible descendants.
    const collapsedWrapper = this.classList.contains('campaign-naval-battle__engagement');
    return {
      x: 0, y: 0,
      width: hidden || collapsedWrapper ? 0 : 100,
      height: hidden || collapsedWrapper ? 0 : 24,
    };
  };

  try {
    expect(
      portCheck.readStrategicSurface,
      'the production evidence reader must be directly mutation-testable',
    ).toBeTypeOf('function');
    if (typeof portCheck.readStrategicSurface !== 'function') return null;
    return await portCheck.readStrategicSurface({
      evaluate(operation, argument) {
        return operation(argument);
      },
    });
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    document.body.replaceChildren();
  }
}

describe('strategic accessibility surface collection', () => {
  it.each([
    ['live engagement', false],
    ['terminal result', true],
  ])('includes campaign reload/status notices beside the %s', async (_label, resultVisible) => {
    const sample = await strategicAccessibilitySample(resultVisible);
    expect(sample?.minimumTextPx).toBe(14);
  });

  it('includes the live tactical surface when its zero-box wrapper contains positioned children', async () => {
    const sample = await strategicAccessibilitySample(false, {
      battleTextPx: 14,
      noticeTextPx: 16,
    });
    expect(sample?.minimumTextPx).toBe(14);
  });

  it('samples the map-led encounter surface after the encounter layout replacement', async () => {
    document.body.innerHTML = `
      <section class="caribbean-voyage caribbean-voyage--encounter">
        <h1 style="font-size: 32px">Red Jackdaw sighted</h1>
        <p style="font-size: 14px">Contact report</p>
        <button type="button" style="font-size: 14px">Pursue</button>
      </section>
    `;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return { x: 0, y: 0, width: 100, height: 44 };
    };

    try {
      const sample = await portCheck.readStrategicSurface({
        evaluate(operation, argument) {
          return operation(argument);
        },
      });
      expect(sample.minimumTextPx).toBe(14);
      expect(sample.minimumTargetHeightPx).toBe(44);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      document.body.replaceChildren();
    }
  });
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function solidPng(width, height, [red, green, blue]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([red, green, blue], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const EXACT_PNG = solidPng(1440, 900, [8, 24, 48]);
const RESULT_RUN_A_PNG = solidPng(1440, 900, [64, 96, 128]);
const RESULT_RUN_B_PNG = solidPng(1440, 900, [65, 96, 128]);

function terminalSemanticState() {
  return {
    tick: 11_855,
    resultVisible: true,
    canvas: {
      width: 1440,
      height: 900,
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      drawingBuffer: { width: 1440, height: 900 },
      opacity: '1',
      transform: 'none',
      engine: 'three.js r170',
      backend: { vendor: 'Google Inc. (Google)', renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' },
    },
    terminal: {
      outcome: 'boarding-ready',
      victorShipId: 'player',
      atTick: 11_855,
      seedAfter: 1_310_878_278,
    },
    player: { hull: 78, sails: 61, crew: 44, cannon: 8 },
    opponent: { hull: 88, sails: 14, crew: 9, cannon: 8 },
  };
}

function terminalRenderObservation(nonzeroSampleChannels, sampleHash) {
  return {
    kind: 'post-present-default-framebuffer-readpixels',
    framebufferSample: {
      algorithm: 'fnv1a32-rgba-grid-v1',
      sampleCount: 40,
      nonzeroSampleChannels,
      sampleHash,
    },
  };
}

function screenshotEvidence({
  runABytes = RESULT_RUN_A_PNG,
  runBBytes = RESULT_RUN_B_PNG,
  runAState = terminalSemanticState(),
  runBState = terminalSemanticState(),
  runAObservation = terminalRenderObservation(160, '9df398c6'),
  runBObservation = terminalRenderObservation(0, '02187e45'),
} = {}) {
  return {
    expectedCount: 23,
    byteComparedCount: 22,
    comparisonExceptionNames: [RESULT_SCREENSHOT],
    trackedCapture: 'run-a',
    observation: {
      filename: RESULT_SCREENSHOT,
      kind: 'webgl-composited-terminal',
      width: 1440,
      height: 900,
      semanticDigestAlgorithm: 'sha256-canonical-json-v1',
      runA: {
        pngSignatureVerified: true,
        nonzeroBytes: true,
        width: 1440,
        height: 900,
        pngSha256: sha256(runABytes),
        semanticDigest: sha256(canonicalJson(runAState)),
        semanticState: runAState,
        renderObservation: runAObservation,
      },
      runB: {
        pngSignatureVerified: true,
        nonzeroBytes: true,
        width: 1440,
        height: 900,
        pngSha256: sha256(runBBytes),
        semanticDigest: sha256(canonicalJson(runBState)),
        semanticState: runBState,
        renderObservation: runBObservation,
      },
    },
  };
}

function screenshotRun(
  run,
  resultBytes = run === 'A' ? RESULT_RUN_A_PNG : RESULT_RUN_B_PNG,
  renderObservation = run === 'A'
    ? terminalRenderObservation(160, '9df398c6')
    : terminalRenderObservation(0, '02187e45'),
) {
  return {
    run,
    screenshotBuffers: new Map(NORMAL_ROUTE_SCREENSHOTS.map((name) => [
      name,
      name === RESULT_SCREENSHOT ? resultBytes : EXACT_PNG,
    ])),
    semanticStates: new Map([[RESULT_SCREENSHOT, terminalSemanticState()]]),
    renderObservations: new Map([[RESULT_SCREENSHOT, renderObservation]]),
    checks: {
      routeFailures: 0,
      requestFailures: 0,
      consoleFailures: 0,
      pageFailures: 0,
      semanticProbesPassed: true,
    },
  };
}

function comparisonFixture() {
  return {
    expectedNames: NORMAL_ROUTE_SCREENSHOTS,
    runA: screenshotRun('A'),
    runB: screenshotRun('B'),
    declaredEvidence: screenshotEvidence(),
  };
}

function mutateDeclaredSemanticStates(evidence, mutate) {
  mutate(evidence.observation.runA.semanticState);
  mutate(evidence.observation.runB.semanticState);
  evidence.observation.runA.semanticDigest = sha256(canonicalJson(evidence.observation.runA.semanticState));
  evidence.observation.runB.semanticDigest = sha256(canonicalJson(evidence.observation.runB.semanticState));
}

function mutateDeclaredSemanticState(evidence, runKey, mutate) {
  mutate(evidence.observation[runKey].semanticState);
  evidence.observation[runKey].semanticDigest = sha256(canonicalJson(evidence.observation[runKey].semanticState));
}

function mutateDeclaredRenderObservation(evidence, runKey, mutate) {
  mutate(evidence.observation[runKey].renderObservation);
}

function mutateComparisonRenderObservation(fixture, runKey, mutate, { declaration = true, actual = true } = {}) {
  if (declaration) mutateDeclaredRenderObservation(fixture.declaredEvidence, runKey, mutate);
  if (actual) {
    const run = runKey === 'runA' ? fixture.runA : fixture.runB;
    const observation = structuredClone(run.renderObservations.get(RESULT_SCREENSHOT));
    mutate(observation);
    run.renderObservations.set(RESULT_SCREENSHOT, observation);
  }
}

const RENDER_OBSERVATION_MUTATIONS = [
  ['wrong kind', (observation) => { observation.kind = 'presented-frame-fingerprint'; }],
  ['non-string kind', (observation) => { observation.kind = 1; }],
  ['missing kind', (observation) => { delete observation.kind; }],
  ['wrong algorithm', (observation) => { observation.framebufferSample.algorithm = 'sha256-rgba-grid-v1'; }],
  ['non-string algorithm', (observation) => { observation.framebufferSample.algorithm = 1; }],
  ['missing algorithm', (observation) => { delete observation.framebufferSample.algorithm; }],
  ['wrong sample count', (observation) => { observation.framebufferSample.sampleCount = 39; }],
  ['missing sample count', (observation) => { delete observation.framebufferSample.sampleCount; }],
  ['string sample count', (observation) => { observation.framebufferSample.sampleCount = '40'; }],
  ['sample below range', (observation) => { observation.framebufferSample.nonzeroSampleChannels = -1; }],
  ['sample above range', (observation) => { observation.framebufferSample.nonzeroSampleChannels = 161; }],
  ['fractional sample channels', (observation) => { observation.framebufferSample.nonzeroSampleChannels = 1.5; }],
  ['missing sample channels', (observation) => { delete observation.framebufferSample.nonzeroSampleChannels; }],
  ['string sample channels', (observation) => { observation.framebufferSample.nonzeroSampleChannels = '0'; }],
  ['uppercase sample hash', (observation) => { observation.framebufferSample.sampleHash = 'A2187E45'; }],
  ['nine-hex sample hash', (observation) => { observation.framebufferSample.sampleHash = '002187e45'; }],
  ['non-hex sample hash', (observation) => { observation.framebufferSample.sampleHash = 'zzzzzzzz'; }],
  ['numeric eight-digit sample hash', (observation) => { observation.framebufferSample.sampleHash = 12345678; }],
  ['missing sample hash', (observation) => { delete observation.framebufferSample.sampleHash; }],
  ['fingerprint alias', (observation) => {
    observation.framebufferSample.fingerprint = observation.framebufferSample.sampleHash;
  }],
  ['array framebuffer sample', (observation) => { observation.framebufferSample = []; }],
  ['extra sample key', (observation) => { observation.framebufferSample.normalized = true; }],
  ['missing framebuffer sample', (observation) => { delete observation.framebufferSample; }],
  ['extra observation key', (observation) => { observation.presented = true; }],
];

const PER_RUN_RENDER_OBSERVATION_MUTATIONS = ['runA', 'runB'].flatMap((runKey) => (
  [
    ...RENDER_OBSERVATION_MUTATIONS.map(([label, mutate]) => [
      `${runKey} ${label}`,
      (evidence) => mutateDeclaredRenderObservation(evidence.screenshotEvidence, runKey, mutate),
    ]),
    [`${runKey} missing render observation`, (evidence) => {
      delete evidence.screenshotEvidence.observation[runKey].renderObservation;
    }],
    [`${runKey} null render observation`, (evidence) => {
      evidence.screenshotEvidence.observation[runKey].renderObservation = null;
    }],
  ]
));

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
    '.caribbean-port-arrival', '.caribbean-port-action',
  ];
  const activity = [
    ['.caribbean-market-price-cue--expensive', 'Expensive'],
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
    status: phase === 'pending' ? 'Saving trade.' : '',
    ariaBusy: phase === 'pending',
  })));
}

function strategicSailingEvidence() {
  return {
    status: 'verified',
    modeSequence: ['port', 'sailing', 'encounter', 'port', 'sailing', 'encounter', 'naval', 'port'],
    eventIds: [1, 2, 3, 4, 5, 6, 7, 8],
    eventTypes: ['lead-accepted', 'voyage-started', 'sea-leg-completed', 'encounter-avoided', 'voyage-started', 'sea-leg-completed', 'naval-engaged', 'naval-resolved'],
    outbound: { elapsedDays: 1, provisionsUsed: 1 },
    return: { elapsedDays: 1, provisionsUsed: 1 },
    rng: { navigationTransitionsVerified: true, navalTransitionVerified: true, worldUnchanged: true },
    navalInput: { persistedBeforeMount: true, byteEqualAfterReload: true, tickAfterReload: 0 },
    resolution: {
      outcome: 'boarding-ready', victorShipId: 'player', atTick: 11_855,
      seedAfter: 1_310_878_278, exactlyOnce: true, campaignWritesDuringBattle: 0,
      returnedTo: 'bridgetown',
    },
    recovery: { intermediateModeRecovered: true, unreadableBytesPreserved: true },
    focus: {
      sailingHeading: true, encounterHeading: true, avoidedReturnLog: true,
      navalReloadBattle: true, resolvedReturnLog: true,
    },
    accessibility: {
      minimumTextPx: 14, minimumTargetWidthPx: 44, minimumTargetHeightPx: 44,
      minimumContrastRatio: 4.5, horizontalOverflowPx: 0,
    },
    viewports: {
      sailingDesktop: { width: 1440, height: 900, supported: true, noticeOnly: false },
      encounterDesktop: { width: 1440, height: 900, supported: true, noticeOnly: false },
      battleDesktop: { width: 1440, height: 900, supported: true, noticeOnly: false },
      sailingMinimumSupported: { width: 960, height: 600, supported: true, noticeOnly: false },
      battleFallback: { width: 1440, height: 900, supported: true, noticeOnly: false },
      sailingLargePortraitNotice: { width: 1024, height: 1366, supported: false, noticeOnly: true },
      battleResizeNotice: { width: 1024, height: 1366, supported: false, noticeOnly: true },
    },
    requests: {
      setupNavalCount: 0, portNavalCount: 0, sailingNavalCount: 0, avoidNavalCount: 0,
      pursuitLocalNavalAssets: true, externalCount: 0, failedCount: 0,
    },
    fallback: { htmlChartVisible: true, battleControlsUsable: true },
    screenshots: [...STRATEGIC_SCREENSHOTS],
    isolation: {
      productionNavalEmitted: true, productionNavalPrecached: true,
      requestedBeforePursuit: false, requestedAfterPursuit: true,
      harnessMarkersAbsent: true, harnessPreviewAbsent: true,
    },
  };
}

function completeEvidence(overrides = {}) {
  return {
    schemaVersion: 3,
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
    screenshots: [...SCREENSHOTS],
    determinism: {
      cleanRuns: 2,
      metricsByteIdentical: true,
      screenshotsByteIdentical: false,
      byteComparedScreenshotsIdentical: true,
    },
    screenshotEvidence: screenshotEvidence(),
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
    strategicSailing: strategicSailingEvidence(),
    ...overrides,
  };
}

describe('schema-v3 strategic sailing evidence', () => {
  it('accepts only schema v3 with every prior channel and the exact strategic route retained', () => {
    expect(evaluatePortIdentityEvidence(completeEvidence())).toEqual({ ok: true, issues: [] });
  });

  it.each([
    'schemaVersion', 'packagePhase', 'browser', 'route', 'build', 'viewports', 'fixtures', 'webLocks',
    'journey', 'accessibility', 'requests', 'failures', 'isolation', 'recovery', 'screenshots',
    'determinism', 'screenshotEvidence', 'profile', 'profileIdentity', 'art', 'market', 'marketStability', 'strategicSailing',
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
    ['screenshot evidence', (e) => { e.screenshotEvidence.expectedCount = 22; }],
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

  it.each([
    ['a duplicated resolution event', (e) => { e.strategicSailing.eventIds.push(8); e.strategicSailing.eventTypes.push('naval-resolved'); }],
    ['a changed literal event id', (e) => { e.strategicSailing.eventIds[6] = 8; }],
    ['a changed mode order', (e) => { [e.strategicSailing.modeSequence[2], e.strategicSailing.modeSequence[3]] = [e.strategicSailing.modeSequence[3], e.strategicSailing.modeSequence[2]]; }],
    ['terminal tick 11856', (e) => { e.strategicSailing.resolution.atTick = 11_856; }],
    ['the wrong terminal seed', (e) => { e.strategicSailing.resolution.seedAfter = 1_310_878_279; }],
    ['a nonzero reload tick', (e) => { e.strategicSailing.navalInput.tickAfterReload = 1; }],
    ['a naval request before pursuit', (e) => { e.strategicSailing.requests.avoidNavalCount = 1; }],
    ['a missing retained schema-v2 field', (e) => { delete e.marketStability.focusPreserved; }],
    ['an unknown strategic nested key', (e) => { e.strategicSailing.resolution.debug = true; }],
    ['false recovery preservation', (e) => { e.strategicSailing.recovery.unreadableBytesPreserved = false; }],
  ])('fails closed on strategic sailing drift: %s', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(() => evaluatePortIdentityEvidence(evidence)).not.toThrow();
    expect(evaluatePortIdentityEvidence(evidence)).toMatchObject({ ok: false, issues: expect.any(Array) });
  });

  it.each([
    ['focus', (e) => { e.strategicSailing.focus.resolvedReturnLog = false; }],
    ['minimum text', (e) => { e.strategicSailing.accessibility.minimumTextPx = 13.99; }],
    ['minimum target', (e) => { e.strategicSailing.accessibility.minimumTargetHeightPx = 43.99; }],
    ['contrast', (e) => { e.strategicSailing.accessibility.minimumContrastRatio = 4.49; }],
    ['overflow', (e) => { e.strategicSailing.accessibility.horizontalOverflowPx = 1; }],
    ['viewport', (e) => { e.strategicSailing.viewports.sailingMinimumSupported.width = 959; }],
    ['request locality', (e) => { e.strategicSailing.requests.externalCount = 1; }],
    ['fallback', (e) => { e.strategicSailing.fallback.battleControlsUsable = false; }],
    ['screenshot manifest', (e) => { e.strategicSailing.screenshots.reverse(); }],
    ['lazy isolation', (e) => { e.strategicSailing.isolation.requestedBeforePursuit = true; }],
  ])('fails closed on the strategic %s contract', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(evaluatePortIdentityEvidence(evidence).ok).toBe(false);
  });

  it.each([
    ['missing exception', (e) => { e.screenshotEvidence.comparisonExceptionNames = []; }],
    ['unknown exception', (e) => { e.screenshotEvidence.comparisonExceptionNames = ['unknown.png']; }],
    ['second exception', (e) => { e.screenshotEvidence.comparisonExceptionNames.push('campaign-battle-desktop.png'); }],
    ['wrong tracked owner', (e) => { e.screenshotEvidence.trackedCapture = 'run-b'; }],
    ['wrong observation filename', (e) => { e.screenshotEvidence.observation.filename = 'campaign-battle-desktop.png'; }],
    ['wrong observation kind', (e) => { e.screenshotEvidence.observation.kind = 'pixels-close-enough'; }],
    ['wrong observation dimensions', (e) => { e.screenshotEvidence.observation.width = 1439; }],
    ['uppercase PNG hash', (e) => { e.screenshotEvidence.observation.runA.pngSha256 = 'A'.repeat(64); }],
    ['semantic digest lie', (e) => { e.screenshotEvidence.observation.runB.semanticDigest = '0'.repeat(64); }],
    ['semantic state drift', (e) => { e.screenshotEvidence.observation.runB.semanticState.player.hull = 77; }],
    ['empty backend vendor', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.canvas.backend.vendor = ''; })],
    ['stable tick drift', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.tick = 11_856; })],
    ['stable result visibility drift', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.resultVisible = false; })],
    ['stable canvas drift', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.canvas.width = 1439; })],
    ['stable backend drift', (e) => mutateDeclaredSemanticState(e.screenshotEvidence, 'runB', (state) => { state.canvas.backend.renderer = 'different'; })],
    ['stable outcome drift', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.terminal.outcome = 'victory'; })],
    ['stable seed drift', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.terminal.seedAfter += 1; })],
    ['stable system drift', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.opponent.sails += 1; })],
    ['framebuffer sample smuggled into stable state', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => {
      state.canvas.framebufferSample = terminalRenderObservation(160, '9df398c6').framebufferSample;
    })],
    ['unknown semantic key', (e) => mutateDeclaredSemanticStates(e.screenshotEvidence, (state) => { state.debug = true; })],
    ['false PNG signature declaration', (e) => { e.screenshotEvidence.observation.runA.pngSignatureVerified = false; }],
    ['zero-byte declaration', (e) => { e.screenshotEvidence.observation.runB.nonzeroBytes = false; }],
    ...PER_RUN_RENDER_OBSERVATION_MUTATIONS,
  ])('rejects the exact screenshot boundary mutation: %s', (_label, mutate) => {
    const evidence = completeEvidence();
    mutate(evidence);
    expect(() => evaluatePortIdentityEvidence(evidence)).not.toThrow();
    expect(evaluatePortIdentityEvidence(evidence)).toMatchObject({ ok: false, issues: expect.any(Array) });
  });

  it('accepts and retains the measured divergent per-run render observations outside stable semantics', () => {
    const evidence = completeEvidence();
    const { runA, runB } = evidence.screenshotEvidence.observation;
    expect(evaluatePortIdentityEvidence(evidence)).toEqual({ ok: true, issues: [] });
    expect(runA.semanticState.canvas).not.toHaveProperty('framebufferSample');
    expect(runB.semanticState.canvas).not.toHaveProperty('framebufferSample');
    expect(runA.semanticDigest).toBe(runB.semanticDigest);
    expect(runA.renderObservation).toEqual({
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 160,
        sampleHash: '9df398c6',
      },
    });
    expect(runB.renderObservation).toEqual({
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 0,
        sampleHash: '02187e45',
      },
    });
    expect(runA.renderObservation).not.toEqual(runB.renderObservation);
  });

  it('accepts independently constructed equal interior render observations', () => {
    const evidence = completeEvidence();
    evidence.screenshotEvidence.observation.runA.renderObservation = {
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 73,
        sampleHash: '1234abcd',
      },
    };
    evidence.screenshotEvidence.observation.runB.renderObservation = structuredClone(
      evidence.screenshotEvidence.observation.runA.renderObservation,
    );
    expect(evaluatePortIdentityEvidence(evidence)).toEqual({ ok: true, issues: [] });
  });
});

describe('normal-route screenshot byte comparator', () => {
  it('selects 23 run-A buffers after 22 byte comparisons, stable semantic equality, and two retained render observations', async () => {
    const { compareNormalRouteScreenshotRuns } = await import('./caribbean-port-identity-evidence.mjs');
    expect(compareNormalRouteScreenshotRuns).toBeTypeOf('function');
    const fixture = comparisonFixture();
    const comparison = compareNormalRouteScreenshotRuns(fixture);
    expect(comparison).toMatchObject({ ok: true, issues: [], selectedRun: 'A' });
    expect(comparison.screenshotEvidence).toEqual(fixture.declaredEvidence);
    expect(comparison.screenshotEvidence.observation.runA.semanticDigest).toBe(
      comparison.screenshotEvidence.observation.runB.semanticDigest,
    );
    expect(comparison.screenshotEvidence.observation.runA.renderObservation).toEqual({
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 160,
        sampleHash: '9df398c6',
      },
    });
    expect(comparison.screenshotEvidence.observation.runB.renderObservation).toEqual({
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 0,
        sampleHash: '02187e45',
      },
    });
    expect(comparison.screenshotEvidence.observation.runA.renderObservation).not.toEqual(
      comparison.screenshotEvidence.observation.runB.renderObservation,
    );
    expect(fixture.runA.renderObservations.get(RESULT_SCREENSHOT)).toEqual({
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 160,
        sampleHash: '9df398c6',
      },
    });
    expect(fixture.runB.renderObservations.get(RESULT_SCREENSHOT)).toEqual({
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 0,
        sampleHash: '02187e45',
      },
    });
    expect(comparison.selectedArtifacts.size).toBe(23);
    for (const [name, artifact] of comparison.selectedArtifacts) {
      expect(artifact.sourceRun).toBe('A');
      expect(Buffer.compare(artifact.bytes, fixture.runA.screenshotBuffers.get(name))).toBe(0);
      expect(artifact.sha256).toBe(sha256(fixture.runA.screenshotBuffers.get(name)));
    }
    expect(comparison.selectedArtifacts.get(RESULT_SCREENSHOT).sha256).not.toBe(
      sha256(fixture.runB.screenshotBuffers.get(RESULT_SCREENSHOT)),
    );
  });

  it('accepts equal valid independently owned render observations', async () => {
    const { compareNormalRouteScreenshotRuns } = await import('./caribbean-port-identity-evidence.mjs');
    const fixture = comparisonFixture();
    const runAObservation = {
      kind: 'post-present-default-framebuffer-readpixels',
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 73,
        sampleHash: '1234abcd',
      },
    };
    const runBObservation = structuredClone(runAObservation);
    fixture.runA.renderObservations.set(RESULT_SCREENSHOT, runAObservation);
    fixture.runB.renderObservations.set(RESULT_SCREENSHOT, runBObservation);
    fixture.declaredEvidence.observation.runA.renderObservation = structuredClone(runAObservation);
    fixture.declaredEvidence.observation.runB.renderObservation = structuredClone(runBObservation);
    const comparison = compareNormalRouteScreenshotRuns(fixture);
    expect(comparison).toMatchObject({ ok: true, issues: [], selectedRun: 'A' });
    expect(comparison.screenshotEvidence.observation.runA.renderObservation).toEqual(runAObservation);
    expect(comparison.screenshotEvidence.observation.runB.renderObservation).toEqual(runBObservation);
  });

  it('publishes only selected run-A bytes and returns their exact hashes', async () => {
    const { compareNormalRouteScreenshotRuns } = await import('./caribbean-port-identity-evidence.mjs');
    const { publishNormalRouteComparison } = await import('../caribbean-port-check.mjs');
    expect(compareNormalRouteScreenshotRuns).toBeTypeOf('function');
    expect(publishNormalRouteComparison).toBeTypeOf('function');
    const fixture = comparisonFixture();
    const comparison = compareNormalRouteScreenshotRuns(fixture);
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-comparator-'));
    const metricsBytes = Buffer.from('{"schemaVersion":3}\n');
    try {
      const publication = publishNormalRouteComparison({ comparison, metricsBytes, outputDirectory });
      expect([...publication.artifactHashes]).toHaveLength(23);
      for (const [name, artifact] of comparison.selectedArtifacts) {
        const written = fs.readFileSync(path.join(outputDirectory, name));
        expect(sha256(written)).toBe(artifact.sha256);
        expect(sha256(written)).toBe(sha256(fixture.runA.screenshotBuffers.get(name)));
      }
      expect(publication.metricsSha256).toBe(sha256(metricsBytes));
      expect(sha256(fs.readFileSync(path.join(outputDirectory, 'metrics.json')))).toBe(sha256(metricsBytes));
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    ['non-exempt byte drift', (fixture) => { fixture.runB.screenshotBuffers.set('setup-desktop.png', RESULT_RUN_B_PNG); }],
    ['missing expected name', (fixture) => { fixture.runB.screenshotBuffers.delete('setup-desktop.png'); }],
    ['unknown buffer name', (fixture) => { fixture.runA.screenshotBuffers.set('unknown.png', EXACT_PNG); }],
    ['renamed exception', (fixture) => { fixture.declaredEvidence.comparisonExceptionNames = ['campaign-result-renamed.png']; }],
    ['second exception', (fixture) => { fixture.declaredEvidence.comparisonExceptionNames.push('campaign-battle-desktop.png'); }],
    ['wrong tracked owner', (fixture) => { fixture.declaredEvidence.trackedCapture = 'run-b'; }],
    ['corrupt PNG signature', (fixture) => {
      const bytes = Buffer.from('not a png');
      fixture.runA.screenshotBuffers.set(RESULT_SCREENSHOT, bytes);
      fixture.declaredEvidence.observation.runA.pngSha256 = sha256(bytes);
    }],
    ['zero PNG bytes', (fixture) => {
      const bytes = Buffer.alloc(0);
      fixture.runB.screenshotBuffers.set(RESULT_SCREENSHOT, bytes);
      fixture.declaredEvidence.observation.runB.pngSha256 = sha256(bytes);
    }],
    ['wrong PNG dimensions', (fixture) => {
      const bytes = solidPng(1439, 900, [65, 96, 128]);
      fixture.runB.screenshotBuffers.set(RESULT_SCREENSHOT, bytes);
      fixture.declaredEvidence.observation.runB.pngSha256 = sha256(bytes);
    }],
    ['run-A PNG hash lie', (fixture) => { fixture.declaredEvidence.observation.runA.pngSha256 = '0'.repeat(64); }],
    ['run-B PNG hash lie', (fixture) => { fixture.declaredEvidence.observation.runB.pngSha256 = '0'.repeat(64); }],
    ['route check failure', (fixture) => { fixture.runA.checks.routeFailures = 1; }],
    ['request check failure', (fixture) => { fixture.runB.checks.requestFailures = 1; }],
    ['console check failure', (fixture) => { fixture.runA.checks.consoleFailures = 1; }],
    ['page check failure', (fixture) => { fixture.runB.checks.pageFailures = 1; }],
    ['semantic probe failure', (fixture) => { fixture.runB.checks.semanticProbesPassed = false; }],
    ['semantic-state map drift', (fixture) => { fixture.runB.semanticStates.get(RESULT_SCREENSHOT).player.hull = 77; }],
    ['semantic-state declaration drift', (fixture) => { fixture.declaredEvidence.observation.runB.semanticState.player.hull = 77; }],
    ...['runA', 'runB'].flatMap((runKey) => [
      [`${runKey} missing render-observation map entry`, (fixture) => {
        fixture[runKey].renderObservations.delete(RESULT_SCREENSHOT);
      }],
      [`${runKey} unknown render-observation map entry`, (fixture) => {
        fixture[runKey].renderObservations.set('unknown.png', terminalRenderObservation(0, '02187e45'));
      }],
      [`${runKey} wrong render-observation map type`, (fixture) => {
        fixture[runKey].renderObservations = {};
      }],
      [`${runKey} missing declared render observation`, (fixture) => {
        delete fixture.declaredEvidence.observation[runKey].renderObservation;
      }],
    ]),
    ['run-A render declaration drift', (fixture) => mutateComparisonRenderObservation(
      fixture,
      'runA',
      (observation) => { observation.framebufferSample.nonzeroSampleChannels = 159; },
      { declaration: true, actual: false },
    )],
    ['run-B render map drift', (fixture) => mutateComparisonRenderObservation(
      fixture,
      'runB',
      (observation) => { observation.framebufferSample.sampleHash = '12187e45'; },
      { declaration: false, actual: true },
    )],
    ['run-A render map drift', (fixture) => mutateComparisonRenderObservation(
      fixture,
      'runA',
      (observation) => { observation.framebufferSample.sampleHash = '12187e45'; },
      { declaration: false, actual: true },
    )],
    ['run-B render declaration drift', (fixture) => mutateComparisonRenderObservation(
      fixture,
      'runB',
      (observation) => { observation.framebufferSample.nonzeroSampleChannels = 1; },
      { declaration: true, actual: false },
    )],
    ...['runA', 'runB'].flatMap((runKey) => RENDER_OBSERVATION_MUTATIONS.map(([label, mutate]) => [
      `${runKey} actual and declared ${label}`,
      (fixture) => mutateComparisonRenderObservation(fixture, runKey, mutate),
    ])),
  ])('fails closed without selecting artifacts for %s', async (_label, mutate) => {
    const { compareNormalRouteScreenshotRuns } = await import('./caribbean-port-identity-evidence.mjs');
    expect(compareNormalRouteScreenshotRuns).toBeTypeOf('function');
    const fixture = comparisonFixture();
    mutate(fixture);
    let comparison;
    expect(() => { comparison = compareNormalRouteScreenshotRuns(fixture); }).not.toThrow();
    expect(comparison).toMatchObject({ ok: false, issues: expect.any(Array) });
    expect(comparison).not.toHaveProperty('selectedArtifacts');
  });

  it.each([
    ['selected-run tag', ({ comparison }) => ({ ...comparison, selectedRun: 'B' })],
    ['selected result artifact', ({ fixture, comparison }) => {
      const selectedArtifacts = new Map(comparison.selectedArtifacts);
      selectedArtifacts.set(RESULT_SCREENSHOT, {
        sourceRun: 'B',
        bytes: fixture.runB.screenshotBuffers.get(RESULT_SCREENSHOT),
        sha256: sha256(fixture.runB.screenshotBuffers.get(RESULT_SCREENSHOT)),
      });
      return { ...comparison, selectedArtifacts };
    }],
  ])('rejects forged B %s without writing artifacts', async (_label, forge) => {
    const { compareNormalRouteScreenshotRuns } = await import('./caribbean-port-identity-evidence.mjs');
    const { publishNormalRouteComparison } = await import('../caribbean-port-check.mjs');
    expect(compareNormalRouteScreenshotRuns).toBeTypeOf('function');
    expect(publishNormalRouteComparison).toBeTypeOf('function');
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-forged-b-'));
    const fixture = comparisonFixture();
    const comparison = compareNormalRouteScreenshotRuns(fixture);
    const forged = forge({ fixture, comparison });
    try {
      expect(() => publishNormalRouteComparison({
        comparison: forged,
        metricsBytes: Buffer.from('{}'),
        outputDirectory,
      })).toThrow();
      expect(fs.readdirSync(outputDirectory)).toEqual([]);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
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
