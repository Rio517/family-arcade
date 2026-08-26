import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fileHashes(directory) {
  return new Map(fs.readdirSync(directory).sort().map((name) => [
    name,
    sha256(fs.readFileSync(path.join(directory, name))),
  ]));
}

const trace = JSON.parse(fs.readFileSync(
  new URL('../fixtures/caribbean-campaign-victory.json', import.meta.url),
  'utf8',
));

const NORMAL_ROUTE_SCREENSHOTS = [
  'setup-desktop.png',
  'port-desktop.png',
  'market-desktop.png',
  'tavern-desktop.png',
  'captains-log-desktop.png',
  'recovery-desktop.png',
  'port-minimum-supported.png',
  'minimum-screen-width.png',
  'minimum-screen-height.png',
  'minimum-screen-large-portrait.png',
  'port-tablet-landscape.png',
  'port-compact-landscape.png',
  'port-art-fallback.png',
  'player-profile-desktop.png',
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

function selectedComparison(variant = 'selected-a') {
  return {
    ok: true,
    selectedRun: 'A',
    selectedArtifacts: new Map(NORMAL_ROUTE_SCREENSHOTS.map((name) => {
      const bytes = Buffer.from(`${variant}:${name}`);
      return [name, { sourceRun: 'A', bytes, sha256: sha256(bytes) }];
    })),
  };
}

const TERMINAL_RESULT_SCREENSHOT = 'campaign-result-desktop.png';

function terminalResultSemanticState() {
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
      backend: {
        vendor: 'Google Inc. (Google)',
        renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
      },
      framebufferSample: {
        algorithm: 'fnv1a32-rgba-grid-v1',
        sampleCount: 40,
        nonzeroSampleChannels: 0,
        sampleHash: '02187e45',
      },
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

function strategicSailingEvidence() {
  return {
    status: 'verified',
    modeSequence: ['port', 'sailing', 'encounter', 'port', 'sailing', 'encounter', 'naval', 'port'],
    eventIds: [1, 2, 3, 4, 5, 6, 7, 8],
    eventTypes: [
      'lead-accepted', 'voyage-started', 'sea-leg-completed', 'encounter-avoided',
      'voyage-started', 'sea-leg-completed', 'naval-engaged', 'naval-resolved',
    ],
    outbound: { elapsedDays: 1, provisionsUsed: 1 },
    return: { elapsedDays: 1, provisionsUsed: 1 },
    rng: {
      navigationTransitionsVerified: true,
      navalTransitionVerified: true,
      worldUnchanged: true,
    },
    navalInput: { persistedBeforeMount: true, byteEqualAfterReload: true, tickAfterReload: 0 },
    resolution: {
      outcome: 'boarding-ready',
      victorShipId: 'player',
      atTick: 11_855,
      seedAfter: 1_310_878_278,
      exactlyOnce: true,
      campaignWritesDuringBattle: 0,
      returnedTo: 'bridgetown',
    },
    recovery: { intermediateModeRecovered: true, unreadableBytesPreserved: true },
    focus: {
      sailingHeading: true,
      encounterHeading: true,
      avoidedReturnLog: true,
      navalReloadBattle: true,
      resolvedReturnLog: true,
    },
    accessibility: {
      minimumTextPx: 14,
      minimumTargetWidthPx: 44,
      minimumTargetHeightPx: 44,
      minimumContrastRatio: 4.5,
      horizontalOverflowPx: 0,
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
      setupNavalCount: 0,
      portNavalCount: 0,
      sailingNavalCount: 0,
      avoidNavalCount: 0,
      pursuitLocalNavalAssets: true,
      externalCount: 0,
      failedCount: 0,
    },
    fallback: { htmlChartVisible: true, battleControlsUsable: true },
    screenshots: [
      'sailing-desktop.png',
      'encounter-desktop.png',
      'campaign-battle-desktop.png',
      'campaign-result-desktop.png',
      'returned-log-desktop.png',
      'sailing-minimum-supported.png',
      'campaign-battle-fallback.png',
      'sailing-large-portrait-notice.png',
      'campaign-battle-resize-notice.png',
    ],
    isolation: {
      productionNavalEmitted: true,
      productionNavalPrecached: true,
      requestedBeforePursuit: false,
      requestedAfterPursuit: true,
      harnessMarkersAbsent: true,
      harnessPreviewAbsent: true,
    },
  };
}

function comparisonRun(semanticState = terminalResultSemanticState()) {
  const evidenceDirectory = path.resolve('docs/screenshots/caribbean-port');
  const metrics = JSON.parse(fs.readFileSync(path.join(evidenceDirectory, 'metrics.json'), 'utf8'));
  metrics.schemaVersion = 3;
  metrics.determinism = {
    cleanRuns: 2,
    metricsByteIdentical: true,
    screenshotsByteIdentical: false,
    byteComparedScreenshotsIdentical: true,
  };
  metrics.strategicSailing = strategicSailingEvidence();
  return {
    metrics,
    screenshots: new Map(NORMAL_ROUTE_SCREENSHOTS.map((name) => [
      name,
      fs.readFileSync(path.join(evidenceDirectory, name)),
    ])),
    screenshotStates: new Map([[TERMINAL_RESULT_SCREENSHOT, semanticState]]),
  };
}

function passiveComparisonDeadline() {
  return { throwIfExpired() {} };
}

function diagnosticManifest(directory) {
  const report = JSON.parse(fs.readFileSync(
    path.join(directory, 'campaign-result-desktop-mismatch.json'),
    'utf8',
  ));
  const metricsA = fs.readFileSync(path.join(directory, 'metrics-run-a.canonical.json'));
  const metricsB = fs.readFileSync(path.join(directory, 'metrics-run-b.canonical.json'));
  const pngA = fs.readFileSync(path.join(directory, 'campaign-result-desktop-run-a.png'));
  const pngB = fs.readFileSync(path.join(directory, 'campaign-result-desktop-run-b.png'));
  return { report, metricsA, metricsB, pngA, pngB };
}

function assertCompleteDiagnosticFileSet(directory) {
  assert.deepEqual(fs.readdirSync(directory).sort(), [
    'campaign-result-desktop-mismatch.json',
    'campaign-result-desktop-run-a.png',
    'campaign-result-desktop-run-b.png',
    'metrics-run-a.canonical.json',
    'metrics-run-b.canonical.json',
  ]);
}

function assertCompleteSuccessDiagnosticFileSet(directory) {
  assert.deepEqual(fs.readdirSync(directory).sort(), [
    'campaign-result-desktop-mismatch.json',
    'campaign-result-desktop-run-a.png',
    'campaign-result-desktop-run-b.png',
    'metrics-run-a.canonical.json',
    'metrics-run-b.canonical.json',
    'selected-run-a-publication.json',
  ]);
}

function selectedPublicationManifest(directory) {
  return JSON.parse(fs.readFileSync(
    path.join(directory, 'selected-run-a-publication.json'),
    'utf8',
  ));
}

function withDiagnosticEnvironment(t) {
  const previous = process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS;
  process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS;
    else process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS = previous;
  });
}

function withoutDiagnosticEnvironment(t) {
  const previous = process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS;
  delete process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS;
  t.after(() => {
    if (previous === undefined) delete process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS;
    else process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS = previous;
  });
}

test('diagnostic cleanup never follows symlinked ancestors or stale child links', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-symlink-diagnostic-'));
  const outside = path.join(temporary, 'outside');
  const linkedParent = path.join(temporary, 'link');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, linkedParent, 'dir');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const outsideDiagnostic = path.join(outside, 'diagnostic');
  fs.mkdirSync(outsideDiagnostic, { recursive: true });
  const sentinel = path.join(outsideDiagnostic, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'must survive');
  const secondState = terminalResultSemanticState();
  secondState.canvas.backend.renderer = `${secondState.canvas.backend.renderer} drift`;

  await assert.rejects(
    portCommand.compareRuns(
      comparisonRun(),
      comparisonRun(secondState),
      passiveComparisonDeadline(),
      { diagnosticDirectory: path.join(linkedParent, 'diagnostic') },
    ),
    /port mismatch diagnostic directory ancestor cannot be a symbolic link: link/,
  );
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'must survive');

  const staleDiagnostic = path.join(temporary, 'stale-diagnostic');
  const staleTarget = path.join(outside, 'stale-target');
  fs.mkdirSync(staleDiagnostic);
  fs.mkdirSync(staleTarget);
  const staleSentinel = path.join(staleTarget, 'sentinel.txt');
  fs.writeFileSync(staleSentinel, 'must also survive');
  fs.symlinkSync(staleTarget, path.join(staleDiagnostic, 'linked-child'), 'dir');

  await assert.rejects(
    portCommand.compareRuns(
      comparisonRun(),
      comparisonRun(secondState),
      passiveComparisonDeadline(),
      { diagnosticDirectory: staleDiagnostic },
    ),
    /screenshotEvidence semantic observations differ/,
  );
  assert.equal(fs.readFileSync(staleSentinel, 'utf8'), 'must also survive');
  assertCompleteDiagnosticFileSet(staleDiagnostic);
});

const SEMANTIC_GATE_ERROR =
  'Caribbean port identity evidence failed: screenshotEvidence semantic observations differ';
const DIAGNOSTIC_PRESERVATION_ERROR =
  'Caribbean port mismatch diagnostic preservation failed';

function semanticDriftComparisonRuns() {
  const secondState = terminalResultSemanticState();
  secondState.canvas.backend.renderer = `${secondState.canvas.backend.renderer} drift`;
  return { first: comparisonRun(), second: comparisonRun(secondState) };
}

function assertNoDiagnosticTransactionArtifacts(parent, diagnosticDirectory) {
  assert.equal(fs.existsSync(diagnosticDirectory), false);
  const stagingPrefix = `.${path.basename(diagnosticDirectory)}.stage-`;
  assert.deepEqual(
    fs.readdirSync(parent).filter((name) => name.startsWith(stagingPrefix)),
    [],
  );
}

function isPreservationFailureWithOriginalGate(error) {
  assert.equal(error?.message, DIAGNOSTIC_PRESERVATION_ERROR);
  assert.equal(error?.cause?.message, SEMANTIC_GATE_ERROR);
  return true;
}

function simulateMissingPrivateTmp(t) {
  const originalRealpathSync = fs.realpathSync;
  let calls = 0;
  fs.realpathSync = (candidate, ...args) => {
    if (typeof candidate === 'string' && path.resolve(candidate) === '/private/tmp') {
      calls += 1;
      const error = new Error('simulated missing /private/tmp');
      error.code = 'ENOENT';
      error.path = '/private/tmp';
      error.syscall = 'realpath';
      throw error;
    }
    return originalRealpathSync(candidate, ...args);
  };
  t.after(() => {
    fs.realpathSync = originalRealpathSync;
  });
  return () => calls;
}

test('diagnostics-off comparisons never inspect or mutate diagnostic paths', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-disabled-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  const staleFile = path.join(diagnosticDirectory, 'stale.txt');
  fs.mkdirSync(diagnosticDirectory);
  fs.writeFileSync(staleFile, 'must remain untouched');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withoutDiagnosticEnvironment(t);
  const { first, second } = semanticDriftComparisonRuns();
  const passingFirst = comparisonRun();
  const passingSecond = comparisonRun();
  const guardedMethods = [
    'realpathSync', 'lstatSync', 'readdirSync', 'unlinkSync', 'rmdirSync',
    'mkdtempSync', 'openSync', 'writeFileSync', 'renameSync',
  ];
  const originals = new Map(guardedMethods.map((name) => [name, fs[name]]));
  const touched = [];
  for (const name of guardedMethods) {
    fs[name] = (...args) => {
      touched.push(name);
      throw new Error(`diagnostics-off touched fs.${name}`);
    };
  }

  try {
    await assert.rejects(
      portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
      (error) => {
        assert.equal(error.message, SEMANTIC_GATE_ERROR);
        return true;
      },
    );
    const comparison = await portCommand.compareRuns(
      passingFirst,
      passingSecond,
      passiveComparisonDeadline(),
      { diagnosticDirectory },
    );
    assert.equal(comparison.comparison.selectedRun, 'A');
  } finally {
    for (const [name, original] of originals) fs[name] = original;
  }

  assert.deepEqual(touched, []);
  assert.equal(fs.readFileSync(staleFile, 'utf8'), 'must remain untouched');
});

test('missing optional private temp anchor permits enabled explicit temp diagnostics', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-linux-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  const outside = path.join(temporary, 'outside');
  fs.mkdirSync(diagnosticDirectory);
  fs.mkdirSync(outside);
  const sentinel = path.join(outside, 'sentinel.txt');
  fs.writeFileSync(sentinel, 'must survive stale cleanup');
  fs.symlinkSync(outside, path.join(diagnosticDirectory, 'linked-child'), 'dir');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const privateTmpCalls = simulateMissingPrivateTmp(t);
  const { first, second } = semanticDriftComparisonRuns();

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
    (error) => {
      assert.equal(error.message, SEMANTIC_GATE_ERROR);
      return true;
    },
  );

  assert.ok(privateTmpCalls() > 0, 'the missing optional anchor simulation must be exercised');
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'must survive stale cleanup');
  assertCompleteDiagnosticFileSet(diagnosticDirectory);
});

test('diagnostic anchor discovery skips missing private temp and fails closed on unavailable destinations', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  withDiagnosticEnvironment(t);
  const privateTmpCalls = simulateMissingPrivateTmp(t);
  const outsideDirectory = path.join(
    process.cwd(),
    `.caribbean-port-invalid-diagnostic-${process.pid}`,
  );
  t.after(() => fs.rmSync(outsideDirectory, { recursive: true, force: true }));

  for (const options of [
    {},
    { diagnosticDirectory: outsideDirectory },
  ]) {
    const { first, second } = semanticDriftComparisonRuns();
    await assert.rejects(
      portCommand.compareRuns(first, second, passiveComparisonDeadline(), options),
      /port mismatch diagnostic directory must be a child of a temporary root/,
    );
  }

  assert.ok(privateTmpCalls() > 0, 'the missing optional anchor simulation must be exercised');
  assert.equal(fs.existsSync(outsideDirectory), false);
});

test('diagnostic-enabled default remains the exact macOS private-temp destination', async (t) => {
  const privateTmp = fs.lstatSync('/private/tmp', { throwIfNoEntry: false });
  if (privateTmp === undefined || !privateTmp.isDirectory() || privateTmp.isSymbolicLink()) {
    t.skip('the fixed macOS private-temp diagnostic destination is unavailable');
    return;
  }
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const diagnosticDirectory = '/private/tmp/caribbean-port-identity-diagnostic';
  fs.rmSync(diagnosticDirectory, { recursive: true, force: true });
  t.after(() => fs.rmSync(diagnosticDirectory, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const { first, second } = semanticDriftComparisonRuns();

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline()),
    (error) => {
      assert.equal(error.message, SEMANTIC_GATE_ERROR);
      return true;
    },
  );

  assertCompleteDiagnosticFileSet(diagnosticDirectory);
});

test('diagnostic bundle publication is atomic across injected staging and rename failures', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-atomic-diagnostic-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const cases = [
    { phase: 'before-staging', shouldThrow: (phase) => phase === 'before-staging' },
    {
      phase: 'during-file-creation',
      shouldThrow: (phase, detail) => phase === 'after-staged-file' && detail.index === 1,
    },
    { phase: 'directory-rename', shouldThrow: () => false, renameFails: true },
  ];

  for (const fixture of cases) {
    const diagnosticDirectory = path.join(temporary, `diagnostic-${fixture.phase}`);
    const { first, second } = semanticDriftComparisonRuns();
    const options = {
      diagnosticDirectory,
      diagnosticCheckpoint(phase, detail) {
        if (fixture.shouldThrow(phase, detail)) throw new Error(`injected ${fixture.phase}`);
      },
    };
    if (fixture.renameFails) {
      options.diagnosticRename = (source, destination) => {
        assert.equal(path.dirname(source), fs.realpathSync(temporary));
        assert.equal(path.dirname(destination), fs.realpathSync(temporary));
        throw new Error('injected directory-rename');
      };
    }
    await assert.rejects(
      portCommand.compareRuns(first, second, passiveComparisonDeadline(), options),
      isPreservationFailureWithOriginalGate,
    );
    assertNoDiagnosticTransactionArtifacts(temporary, diagnosticDirectory);
  }
});

test('diagnostic deadline failure leaves no partial bundle and retains the gate error', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-deadline-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  let checks = 0;
  const deadline = {
    throwIfExpired() {
      checks += 1;
      if (checks === 8) throw new Error('injected diagnostic deadline');
    },
  };
  const { first, second } = semanticDriftComparisonRuns();

  await assert.rejects(
    portCommand.compareRuns(first, second, deadline, { diagnosticDirectory }),
    isPreservationFailureWithOriginalGate,
  );
  assert.equal(checks, 8);
  assertNoDiagnosticTransactionArtifacts(temporary, diagnosticDirectory);
});

test('diagnostic bundle remains invisible until its complete directory commit', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-visibility-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const observedBeforeCommit = [];
  const { first, second } = semanticDriftComparisonRuns();

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), {
      diagnosticDirectory,
      diagnosticCheckpoint(phase) {
        if (phase === 'after-staged-file' || phase === 'directory-rename') {
          observedBeforeCommit.push(fs.existsSync(diagnosticDirectory));
        }
      },
    }),
    (error) => {
      assert.equal(error.message, SEMANTIC_GATE_ERROR);
      return true;
    },
  );

  assert.deepEqual(observedBeforeCommit, [false, false, false, false, false, false]);
  assert.deepEqual(fs.readdirSync(diagnosticDirectory).sort(), [
    'campaign-result-desktop-mismatch.json',
    'campaign-result-desktop-run-a.png',
    'campaign-result-desktop-run-b.png',
    'metrics-run-a.canonical.json',
    'metrics-run-b.canonical.json',
  ]);
  assert.deepEqual(
    fs.readdirSync(temporary).filter((name) => name.startsWith('.diagnostic.stage-')),
    [],
  );
});

test('diagnostic comparison preserves semantic drift before the evaluator rejects', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-semantic-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);

  const first = comparisonRun();
  const secondState = terminalResultSemanticState();
  secondState.canvas.backend.renderer = `${secondState.canvas.backend.renderer} drift`;
  const second = comparisonRun(secondState);

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
    (error) => {
      assert.equal(
        error.message,
        'Caribbean port identity evidence failed: screenshotEvidence semantic observations differ',
      );
      return true;
    },
  );

  assert.deepEqual(fs.readdirSync(diagnosticDirectory).sort(), [
    'campaign-result-desktop-mismatch.json',
    'campaign-result-desktop-run-a.png',
    'campaign-result-desktop-run-b.png',
    'metrics-run-a.canonical.json',
    'metrics-run-b.canonical.json',
  ]);
  const diagnostic = diagnosticManifest(diagnosticDirectory);
  assert.deepEqual(diagnostic.pngA, first.screenshots.get(TERMINAL_RESULT_SCREENSHOT));
  assert.deepEqual(diagnostic.pngB, second.screenshots.get(TERMINAL_RESULT_SCREENSHOT));
  assert.equal(diagnostic.report.sha256.runA, sha256(diagnostic.pngA));
  assert.equal(diagnostic.report.sha256.runB, sha256(diagnostic.pngB));
  assert.deepEqual(diagnostic.report.runA, first.screenshotStates.get(TERMINAL_RESULT_SCREENSHOT));
  assert.deepEqual(diagnostic.report.runB, second.screenshotStates.get(TERMINAL_RESULT_SCREENSHOT));
  assert.deepEqual(diagnostic.report.failure, {
    stage: 'evaluator',
    run: 'A',
    issues: ['screenshotEvidence semantic observations differ'],
  });
  assert.equal(
    diagnostic.report.semanticDigest.runA,
    sha256(Buffer.from(canonicalJson(diagnostic.report.runA))),
  );
  assert.equal(
    diagnostic.report.semanticDigest.runB,
    sha256(Buffer.from(canonicalJson(diagnostic.report.runB))),
  );
  assert.notEqual(diagnostic.report.semanticDigest.runA, diagnostic.report.semanticDigest.runB);
  assert.equal(diagnostic.report.canonicalMetricsSha256.runA, sha256(diagnostic.metricsA));
  assert.equal(diagnostic.report.canonicalMetricsSha256.runB, sha256(diagnostic.metricsB));
  assert.deepEqual(diagnostic.report.firstDifferingPaths, {
    semanticState: '/canvas/backend/renderer',
    canonicalMetrics: null,
  });
  assert.equal(diagnostic.metricsA.toString(), `${canonicalJson(first.metrics)}\n`);
  assert.equal(diagnostic.metricsB.toString(), `${canonicalJson(second.metrics)}\n`);
  assert.deepEqual(JSON.parse(diagnostic.metricsA), first.metrics);
  assert.deepEqual(JSON.parse(diagnostic.metricsB), second.metrics);
});

test('diagnostic comparison preserves evaluator-valid canonical metrics drift', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-metrics-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);

  const first = comparisonRun();
  const second = comparisonRun();
  second.metrics.browser.version = `${second.metrics.browser.version}-drift`;

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
    (error) => {
      assert.equal(error.message, 'Two clean browser runs produced different metrics.json bytes');
      return true;
    },
  );

  const diagnostic = diagnosticManifest(diagnosticDirectory);
  assert.deepEqual(diagnostic.report.failure, {
    stage: 'canonical-metrics',
    run: null,
    issues: ['Two clean browser runs produced different metrics.json bytes'],
  });
  assert.equal(diagnostic.report.semanticDigest.runA, diagnostic.report.semanticDigest.runB);
  assert.deepEqual(diagnostic.report.firstDifferingPaths, {
    semanticState: null,
    canonicalMetrics: '/browser/version',
  });
  assert.equal(JSON.parse(diagnostic.metricsA).browser.version, first.metrics.browser.version);
  assert.equal(JSON.parse(diagnostic.metricsB).browser.version, second.metrics.browser.version);
  assert.equal(diagnostic.metricsA.toString(), `${canonicalJson(first.metrics)}\n`);
  assert.equal(diagnostic.metricsB.toString(), `${canonicalJson(second.metrics)}\n`);
  assert.equal(diagnostic.report.canonicalMetricsSha256.runA, sha256(diagnostic.metricsA));
  assert.equal(diagnostic.report.canonicalMetricsSha256.runB, sha256(diagnostic.metricsB));
});

test('diagnostic comparison preserves non-exempt buffer drift before comparator rejection', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-comparator-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const first = comparisonRun();
  const second = comparisonRun();
  second.screenshots.set('setup-desktop.png', second.screenshots.get('port-desktop.png'));

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
    (error) => {
      assert.equal(
        error.message,
        'Normal-route screenshot comparison failed: setup-desktop.png bytes differ outside the observation exception',
      );
      return true;
    },
  );

  assertCompleteDiagnosticFileSet(diagnosticDirectory);
  const diagnostic = diagnosticManifest(diagnosticDirectory);
  assert.deepEqual(diagnostic.report.failure, {
    stage: 'comparator',
    run: null,
    issues: ['setup-desktop.png bytes differ outside the observation exception'],
  });
  assert.deepEqual(diagnostic.report.firstDifferingPaths, {
    semanticState: null,
    canonicalMetrics: null,
  });
  assert.equal(diagnostic.report.sha256.runA, sha256(diagnostic.pngA));
  assert.equal(diagnostic.report.sha256.runB, sha256(diagnostic.pngB));
  assert.deepEqual(diagnostic.pngA, diagnostic.pngB);
  assert.deepEqual(diagnostic.report.runA, first.screenshotStates.get(TERMINAL_RESULT_SCREENSHOT));
  assert.deepEqual(diagnostic.report.runB, second.screenshotStates.get(TERMINAL_RESULT_SCREENSHOT));
  assert.equal(
    diagnostic.report.semanticDigest.runA,
    sha256(Buffer.from(canonicalJson(diagnostic.report.runA))),
  );
  assert.equal(
    diagnostic.report.semanticDigest.runB,
    sha256(Buffer.from(canonicalJson(diagnostic.report.runB))),
  );
  assert.equal(diagnostic.report.canonicalMetricsSha256.runA, sha256(diagnostic.metricsA));
  assert.equal(diagnostic.report.canonicalMetricsSha256.runB, sha256(diagnostic.metricsB));
});

test('diagnostic comparison preserves an invalid terminal buffer before comparator rejection', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-terminal-buffer-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const first = comparisonRun();
  const second = comparisonRun();
  second.screenshots.set(TERMINAL_RESULT_SCREENSHOT, Buffer.from('invalid terminal PNG'));

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
    (error) => {
      assert.equal(
        error.message,
        'Normal-route screenshot comparison failed: campaign-result-desktop.png is not a valid nonempty PNG in both runs',
      );
      return true;
    },
  );

  assertCompleteDiagnosticFileSet(diagnosticDirectory);
  const diagnostic = diagnosticManifest(diagnosticDirectory);
  assert.deepEqual(diagnostic.report.failure, {
    stage: 'comparator',
    run: null,
    issues: ['campaign-result-desktop.png is not a valid nonempty PNG in both runs'],
  });
  assert.equal(diagnostic.report.sha256.runA, sha256(diagnostic.pngA));
  assert.equal(diagnostic.report.sha256.runB, sha256(diagnostic.pngB));
  assert.deepEqual(diagnostic.pngB, Buffer.from('invalid terminal PNG'));
  assert.match(diagnostic.report.pixelStats.error, /unsupported image format|Input buffer/);
});

test('diagnostic comparison preserves comparator setup errors when terminal data exists', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-comparator-setup-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const first = comparisonRun();
  const second = comparisonRun();
  const screenshotBuffers = second.screenshots;
  second.screenshots = {
    get(filename) {
      if (filename === 'setup-desktop.png') throw new Error('injected screenshot map failure');
      return screenshotBuffers.get(filename);
    },
  };

  await assert.rejects(
    portCommand.compareRuns(first, second, passiveComparisonDeadline(), { diagnosticDirectory }),
    (error) => {
      assert.equal(error.message, 'injected screenshot map failure');
      return true;
    },
  );

  assertCompleteDiagnosticFileSet(diagnosticDirectory);
  const diagnostic = diagnosticManifest(diagnosticDirectory);
  assert.deepEqual(diagnostic.report.failure, {
    stage: 'comparator',
    run: null,
    issues: ['injected screenshot map failure'],
  });
  assert.deepEqual(diagnostic.report.firstDifferingPaths, {
    semanticState: null,
    canonicalMetrics: null,
  });
});

test('diagnostic first-difference paths follow RFC 6901 escaping and edge rules', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-pointer-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const fixtures = [
    {
      name: 'escapes tilde and slash tokens',
      expected: '/~0route~1leg',
      states() {
        const first = terminalResultSemanticState();
        const second = terminalResultSemanticState();
        first['~route/leg'] = 'east';
        second['~route/leg'] = 'west';
        return [first, second];
      },
    },
    {
      name: 'reports a missing object member',
      expected: '/canvas/backend/renderer',
      states() {
        const first = terminalResultSemanticState();
        const second = terminalResultSemanticState();
        delete second.canvas.backend.renderer;
        return [first, second];
      },
    },
    {
      name: 'reports an array element',
      expected: '/samples/1',
      states() {
        const first = terminalResultSemanticState();
        const second = terminalResultSemanticState();
        first.samples = [10, 20];
        second.samples = [10, 21];
        return [first, second];
      },
    },
    {
      name: 'reports an array length boundary',
      expected: '/samples/1',
      states() {
        const first = terminalResultSemanticState();
        const second = terminalResultSemanticState();
        first.samples = [10];
        second.samples = [10, 20];
        return [first, second];
      },
    },
    {
      name: 'reports a container type change',
      expected: '/canvas/backend',
      states() {
        const first = terminalResultSemanticState();
        const second = terminalResultSemanticState();
        second.canvas.backend = [];
        return [first, second];
      },
    },
    {
      name: 'uses the empty pointer for a root difference',
      expected: '',
      states() {
        return [terminalResultSemanticState(), null];
      },
    },
  ];

  for (const fixture of fixtures) {
    const [firstState, secondState] = fixture.states();
    await assert.rejects(
      portCommand.compareRuns(
        comparisonRun(firstState),
        comparisonRun(secondState),
        passiveComparisonDeadline(),
        { diagnosticDirectory },
      ),
      /Caribbean port identity evidence failed/,
      fixture.name,
    );
    const diagnostic = diagnosticManifest(diagnosticDirectory);
    assert.equal(
      diagnostic.report.firstDifferingPaths.semanticState,
      fixture.expected,
      fixture.name,
    );
    assert.equal(diagnostic.report.firstDifferingPaths.canonicalMetrics, null, fixture.name);
  }
});

test('diagnostic-enabled compare success clears stale artifacts until selected publication', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.compareRuns, 'function');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-no-diagnostic-'));
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);

  fs.mkdirSync(diagnosticDirectory);
  fs.writeFileSync(path.join(diagnosticDirectory, 'stale.txt'), 'stale');
  const comparison = await portCommand.compareRuns(
    comparisonRun(),
    comparisonRun(),
    passiveComparisonDeadline(),
    { diagnosticDirectory },
  );
  assert.equal(comparison.comparison.ok, true);
  assert.equal(comparison.comparison.selectedRun, 'A');
  assert.equal(fs.existsSync(diagnosticDirectory), false);
});

test('diagnostic-enabled successful compare and writer atomically preserve selected run A', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-success-diagnostic-'));
  const outputDirectory = path.join(temporary, 'output');
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  fs.mkdirSync(outputDirectory);
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const first = comparisonRun();
  const second = comparisonRun();
  const runA = Buffer.from(first.screenshots.get(TERMINAL_RESULT_SCREENSHOT));
  const runB = Buffer.from(second.screenshots.get('port-desktop.png'));
  assert.equal(runA.equals(runB), false, 'the fixture must distinguish A from B');
  second.screenshots.set(TERMINAL_RESULT_SCREENSHOT, runB);

  const comparisonResult = await portCommand.compareRuns(
    first,
    second,
    passiveComparisonDeadline(),
    { diagnosticDirectory },
  );
  assert.equal(comparisonResult.comparison.ok, true);
  assert.equal(comparisonResult.comparison.selectedRun, 'A');
  assert.equal(fs.existsSync(diagnosticDirectory), false,
    'success diagnostics must wait for selected-A publication');

  const publication = await portCommand.publishSuccessfulNormalRouteComparison({
    first,
    second,
    comparisonResult,
    outputDirectory,
    deadline: passiveComparisonDeadline(),
  });

  assertCompleteSuccessDiagnosticFileSet(diagnosticDirectory);
  const diagnostic = diagnosticManifest(diagnosticDirectory);
  const manifest = selectedPublicationManifest(diagnosticDirectory);
  const observation = first.metrics.screenshotEvidence.observation;
  assert.deepEqual(diagnostic.pngA, runA);
  assert.deepEqual(diagnostic.pngB, runB);
  assert.deepEqual(diagnostic.report.failure, null);
  assert.deepEqual(diagnostic.report.firstDifferingPaths, {
    semanticState: null,
    canonicalMetrics: null,
  });
  assert.equal(diagnostic.report.sha256.runA, observation.runA.pngSha256);
  assert.equal(diagnostic.report.sha256.runB, observation.runB.pngSha256);
  assert.equal(diagnostic.report.semanticDigest.runA, observation.runA.semanticDigest);
  assert.equal(diagnostic.report.semanticDigest.runB, observation.runB.semanticDigest);
  assert.deepEqual(diagnostic.report.runA, observation.runA.semanticState);
  assert.deepEqual(diagnostic.report.runB, observation.runB.semanticState);
  assert.equal(diagnostic.metricsA.toString(), `${canonicalJson(first.metrics)}\n`);
  assert.equal(diagnostic.metricsB.toString(), `${canonicalJson(second.metrics)}\n`);

  const expectedArtifacts = NORMAL_ROUTE_SCREENSHOTS.map((filename) => ({
    filename,
    sha256: sha256(first.screenshots.get(filename)),
  })).sort((left, right) => left.filename.localeCompare(right.filename));
  assert.deepEqual(manifest, {
    selectedRun: 'A',
    artifacts: expectedArtifacts,
    metricsSha256: sha256(comparisonResult.metricsBytes),
  });
  assert.equal(publication.metricsSha256, manifest.metricsSha256);
  assert.equal(publication.artifactHashes.size, 23);
  for (const artifact of expectedArtifacts) {
    const written = fs.readFileSync(path.join(outputDirectory, artifact.filename));
    assert.deepEqual(written, first.screenshots.get(artifact.filename), artifact.filename);
    assert.equal(sha256(written), artifact.sha256, artifact.filename);
    assert.equal(publication.artifactHashes.get(artifact.filename), artifact.sha256);
  }
  assert.deepEqual(
    fs.readFileSync(path.join(outputDirectory, TERMINAL_RESULT_SCREENSHOT)),
    runA,
  );
  assert.equal(
    fs.readFileSync(path.join(outputDirectory, TERMINAL_RESULT_SCREENSHOT)).equals(runB),
    false,
  );
  assert.equal(
    sha256(fs.readFileSync(path.join(outputDirectory, 'metrics.json'))),
    manifest.metricsSha256,
  );
});

test('diagnostics-off successful compare and writer leave no diagnostic bundle', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-success-disabled-'));
  const outputDirectory = path.join(temporary, 'output');
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  fs.mkdirSync(outputDirectory);
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withoutDiagnosticEnvironment(t);
  const first = comparisonRun();
  const second = comparisonRun();
  const comparisonResult = await portCommand.compareRuns(
    first,
    second,
    passiveComparisonDeadline(),
    { diagnosticDirectory },
  );

  const publication = await portCommand.publishSuccessfulNormalRouteComparison({
    first,
    second,
    comparisonResult,
    outputDirectory,
    deadline: passiveComparisonDeadline(),
  });

  assert.equal(publication.artifactHashes.size, 23);
  assert.equal(fs.existsSync(diagnosticDirectory), false);
});

test('selected-A writer failure never publishes a forged success diagnostic', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-writer-failure-'));
  const outputDirectory = path.join(temporary, 'output');
  const diagnosticDirectory = path.join(temporary, 'diagnostic');
  const outside = path.join(temporary, 'outside.png');
  fs.mkdirSync(outputDirectory);
  fs.writeFileSync(outside, 'must survive writer rejection');
  fs.symlinkSync(outside, path.join(outputDirectory, 'setup-desktop.png'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const first = comparisonRun();
  const second = comparisonRun();
  const comparisonResult = await portCommand.compareRuns(
    first,
    second,
    passiveComparisonDeadline(),
    { diagnosticDirectory },
  );

  await assert.rejects(
    portCommand.publishSuccessfulNormalRouteComparison({
      first,
      second,
      comparisonResult,
      outputDirectory,
      deadline: passiveComparisonDeadline(),
    }),
    /publication destination cannot be a symbolic link: setup-desktop\.png/,
  );

  assert.equal(fs.readFileSync(outside, 'utf8'), 'must survive writer rejection');
  assertNoDiagnosticTransactionArtifacts(temporary, diagnosticDirectory);
});

test('successful diagnostic transaction commits identical runs atomically or leaves no partial bundle', async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-success-atomic-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  withDiagnosticEnvironment(t);
  const cases = [
    { phase: 'before-staging', shouldThrow: (phase) => phase === 'before-staging' },
    {
      phase: 'during-file-creation',
      shouldThrow: (phase, detail) => phase === 'after-staged-file' && detail.index === 2,
    },
    { phase: 'directory-rename', shouldThrow: () => false, renameFails: true },
    { phase: 'identical-success', shouldThrow: () => false, succeeds: true },
  ];

  for (const fixture of cases) {
    const outputDirectory = path.join(temporary, `output-${fixture.phase}`);
    const diagnosticDirectory = path.join(temporary, `diagnostic-${fixture.phase}`);
    fs.mkdirSync(outputDirectory);
    const first = comparisonRun();
    const second = comparisonRun();
    const options = {
      diagnosticDirectory,
      diagnosticCheckpoint(phase, detail) {
        if (fixture.shouldThrow(phase, detail)) throw new Error(`injected ${fixture.phase}`);
      },
    };
    if (fixture.renameFails) {
      options.diagnosticRename = (source, destination) => {
        assert.equal(path.dirname(source), fs.realpathSync(temporary));
        assert.equal(path.dirname(destination), fs.realpathSync(temporary));
        throw new Error('injected success directory-rename');
      };
    }
    const comparisonResult = await portCommand.compareRuns(
      first,
      second,
      passiveComparisonDeadline(),
      options,
    );

    const successPublication = portCommand.publishSuccessfulNormalRouteComparison({
      first,
      second,
      comparisonResult,
      outputDirectory,
      deadline: passiveComparisonDeadline(),
    });
    if (fixture.succeeds) {
      await successPublication;
      assertCompleteSuccessDiagnosticFileSet(diagnosticDirectory);
      const diagnostic = diagnosticManifest(diagnosticDirectory);
      assert.deepEqual(diagnostic.pngA, diagnostic.pngB);
      assert.equal(diagnostic.report.sha256.runA, diagnostic.report.sha256.runB);
      assert.equal(
        diagnostic.report.sha256.runA,
        first.metrics.screenshotEvidence.observation.runA.pngSha256,
      );
    } else {
      await assert.rejects(successPublication, /injected/);
    }

    assert.equal(fs.existsSync(path.join(outputDirectory, 'metrics.json')), true,
      'the selected writer must precede diagnostic preservation');
    if (!fixture.succeeds) assertNoDiagnosticTransactionArtifacts(temporary, diagnosticDirectory);
  }
});

test('strategic causality rejects mount-before-save same-byte writes and wrong RNG lineage', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.evaluateStrategicSailingCausality, 'function');
  const valid = {
    storageWrites: [{
      sequence: 1,
      key: 'caribbean:campaign:current',
      before: '{"old":true}',
      after: '{"payload":{"state":{"mode":{"kind":"naval"}}}}',
    }],
    lifecycle: [{ sequence: 2, type: 'naval-mount', storageWriteCount: 1 }],
    navigationEvents: [
      { before: 3_913_270_709, after: 3_424_590_736 },
      { before: 3_424_590_736, after: 2_953_755_055 },
    ],
    navalEvents: [{ before: 3_992_748_115, after: 1_971_161_494 }],
    initialNavigationRng: 3_913_270_709,
    returnedNavigationRng: 2_953_755_055,
    initialNavalRng: 3_992_748_115,
    returnedNavalRng: 1_971_161_494,
    persistedNavalInputSeed: 1_971_161_494,
    initialWorldRng: 2_180_952_782,
    returnedWorldRng: 2_180_952_782,
  };
  assert.deepEqual(portCommand.evaluateStrategicSailingCausality(valid), {
    persistedBeforeMount: true,
    campaignWritesDuringBattle: 0,
    navigationTransitionsVerified: true,
    navalTransitionVerified: true,
    worldUnchanged: true,
  });

  const mountedBeforeSave = structuredClone(valid);
  mountedBeforeSave.lifecycle[0].sequence = 0;
  assert.equal(portCommand.evaluateStrategicSailingCausality(mountedBeforeSave).persistedBeforeMount, false);

  const sameBytes = structuredClone(valid);
  sameBytes.storageWrites.push({
    sequence: 3,
    key: 'caribbean:campaign:current',
    before: valid.storageWrites[0].after,
    after: valid.storageWrites[0].after,
  });
  assert.equal(portCommand.evaluateStrategicSailingCausality(sameBytes).campaignWritesDuringBattle, 1);

  const writeBeforeRemount = structuredClone(sameBytes);
  writeBeforeRemount.lifecycle.push({ sequence: 4, type: 'naval-mount', storageWriteCount: 2 });
  assert.equal(portCommand.evaluateStrategicSailingCausality(writeBeforeRemount).campaignWritesDuringBattle, 1);

  const wrongRng = structuredClone(valid);
  wrongRng.navigationEvents[1].after += 1;
  wrongRng.navalEvents[0].after += 1;
  const wrongVerdict = portCommand.evaluateStrategicSailingCausality(wrongRng);
  assert.equal(wrongVerdict.navigationTransitionsVerified, false);
  assert.equal(wrongVerdict.navalTransitionVerified, false);

  const disconnectedNavigation = structuredClone(valid);
  disconnectedNavigation.navigationEvents[1] = { before: 1, after: 1_015_568_748 };
  assert.equal(
    portCommand.evaluateStrategicSailingCausality(disconnectedNavigation).navigationTransitionsVerified,
    false,
  );

  const detachedEndpoints = structuredClone(valid);
  detachedEndpoints.navigationEvents = [
    { before: 1, after: 1_015_568_748 },
    { before: 1_015_568_748, after: 1_586_005_467 },
  ];
  detachedEndpoints.navalEvents = [{ before: 2, after: 1_017_233_273 }];
  const detachedVerdict = portCommand.evaluateStrategicSailingCausality(detachedEndpoints);
  assert.equal(detachedVerdict.navigationTransitionsVerified, false);
  assert.equal(detachedVerdict.navalTransitionVerified, false);

  for (const field of ['initialNavigationRng', 'returnedNavigationRng']) {
    const oneDetachedEndpoint = structuredClone(valid);
    oneDetachedEndpoint[field] = 1;
    assert.equal(
      portCommand.evaluateStrategicSailingCausality(oneDetachedEndpoint).navigationTransitionsVerified,
      false,
      field,
    );
  }
  for (const field of ['initialNavalRng', 'returnedNavalRng', 'persistedNavalInputSeed']) {
    const oneDetachedEndpoint = structuredClone(valid);
    oneDetachedEndpoint[field] = 1;
    assert.equal(
      portCommand.evaluateStrategicSailingCausality(oneDetachedEndpoint).navalTransitionVerified,
      false,
      field,
    );
  }

  const nonUint32 = structuredClone(valid);
  nonUint32.navigationEvents[0].before += 2 ** 32;
  nonUint32.initialNavigationRng += 2 ** 32;
  assert.equal(portCommand.evaluateStrategicSailingCausality(nonUint32).navigationTransitionsVerified, false);
});

test('storage instrumentation records a same-task public mount before its save', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.browserBoundaryInitScript, 'function');
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/',
  });
  try {
    const options = {
      nowFixtures: [1_700_000_000_000],
      seedFixtures: [1702],
      uuidFixtures: ['00000000-0000-4000-8000-000000000001'],
      traceKey: 'fixture-trace',
      writerLock: 'fixture-lock',
      currentSaveKey: 'caribbean:campaign:current',
      previousSaveKey: 'caribbean:campaign:previous',
      installDateFixture: false,
      usersRaw: '{"users":[],"activeId":null}',
    };
    dom.window.eval(`(${portCommand.browserBoundaryInitScript.toString()})(${JSON.stringify(options)})`);
    const mounted = dom.window.document.createElement('p');
    mounted.dataset.testid = 'naval-elapsed';
    dom.window.document.body.append(mounted);
    dom.window.localStorage.setItem(
      options.currentSaveKey,
      '{"payload":{"state":{"mode":{"kind":"naval"}}}}',
    );
    const recorded = JSON.parse(dom.window.sessionStorage.getItem(options.traceKey));
    assert.deepEqual(recorded.lifecycle, [{
      sequence: 1,
      type: 'naval-mount',
      storageWriteCount: 0,
    }]);
    assert.equal(recorded.storageWrites[0].sequence, 2);
    assert.equal(portCommand.evaluateStrategicSailingCausality({
      storageWrites: recorded.storageWrites,
      lifecycle: recorded.lifecycle,
      navigationEvents: [],
      navalEvents: [],
    }).persistedBeforeMount, false);
  } finally {
    dom.window.close();
  }
});

test('whole-command deadline aborts work and awaits cleanup before rejecting', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(portCommand.PORT_CHECK_DEADLINE_MS, 900_000);
  assert.equal(typeof portCommand.runWithPortCheckDeadline, 'function');
  let cleaned = false;
  let latePublication = false;
  await assert.rejects(
    portCommand.runWithPortCheckDeadline(async (signal) => {
      try {
        while (!signal.aborted) await delay(1);
        await delay(2);
        if (!signal.aborted) latePublication = true;
        signal.throwIfAborted();
      } finally {
        cleaned = true;
      }
    }, 10),
    /Port evidence command exceeded 10ms/,
  );
  assert.equal(cleaned, true);
  assert.equal(latePublication, false);

  await assert.rejects(
    portCommand.runWithPortCheckDeadline(async () => {
      const blockedUntil = Date.now() + 40;
      while (Date.now() < blockedUntil) { /* deliberately starve the timer */ }
      return 'overdue-success';
    }, 10),
    /Port evidence command exceeded 10ms/,
  );

  const noncooperative = portCommand.runWithPortCheckDeadline(
    () => new Promise(() => {}),
    10,
  );
  const hardResult = await Promise.race([
    noncooperative.then(
      () => ({ kind: 'resolved' }),
      (error) => ({ kind: 'rejected', message: error.message }),
    ),
    delay(100).then(() => ({ kind: 'independent-guard' })),
  ]);
  assert.deepEqual(hardResult, {
    kind: 'rejected',
    message: 'Port evidence command exceeded 10ms',
  });
});

test('deadline cancels a noncooperative phase cleans resources and prevents late publication', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-deadline-output-'));
  let releasePhase;
  let browserClosed = 0;
  let serverStopped = 0;
  let runDirectories = [];
  try {
    const operation = portCommand.runWithPortCheckDeadline(
      (signal, deadline) => portCommand.runPortCheckOperation({
        outputDirectory,
        signal,
        deadline,
        dependencies: {
          build: async () => {},
          assertIsolation: () => {},
          readArt: () => ({}),
          readNaval: () => ({}),
          readAssetReport: () => ({}),
          startServer: async () => ({ server: { fixture: true }, baseUrl: 'http://fixture.invalid' }),
          verifyArtResponse: async () => {},
          launchBrowser: async () => ({ close: async () => { browserClosed += 1; } }),
          stopServer: async () => { serverStopped += 1; },
          afterResourcesStarted(resources) {
            runDirectories = resources.runDirectories;
            return new Promise((resolve) => { releasePhase = resolve; });
          },
        },
      }),
      40,
    );
    const result = await Promise.race([
      operation.then(
        () => ({ kind: 'resolved' }),
        (error) => ({ kind: 'rejected', message: error.message }),
      ),
      delay(150).then(() => ({ kind: 'independent-guard' })),
    ]);
    assert.deepEqual(result, {
      kind: 'rejected',
      message: 'Port evidence command exceeded 40ms',
    });
    assert.equal(browserClosed, 1);
    assert.equal(serverStopped, 1);
    assert.equal(runDirectories.length, 2);
    assert.ok(runDirectories.every((directory) => !fs.existsSync(directory)));
    assert.deepEqual(fs.readdirSync(outputDirectory), []);
    releasePhase?.();
    await delay(20);
    assert.equal(browserClosed, 1);
    assert.equal(serverStopped, 1);
    assert.deepEqual(fs.readdirSync(outputDirectory), []);
  } finally {
    releasePhase?.();
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('publication rechecks the monotonic deadline before committing any selected bytes', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-publication-deadline-'));
  const originalBytes = new Map([
    ...NORMAL_ROUTE_SCREENSHOTS.map((name) => [name, Buffer.from(`original:${name}`)]),
    ['metrics.json', Buffer.from('{"original":true}\n')],
  ]);
  try {
    for (const [name, bytes] of originalBytes) fs.writeFileSync(path.join(outputDirectory, name), bytes);
    const selectedBytes = Buffer.alloc(4 * 1024 * 1024, 0x5a);
    const selectedHash = sha256(selectedBytes);
    const comparison = {
      ok: true,
      selectedRun: 'A',
      selectedArtifacts: new Map(NORMAL_ROUTE_SCREENSHOTS.map((name) => [name, {
        sourceRun: 'A',
        bytes: selectedBytes,
        sha256: selectedHash,
      }])),
    };
    await assert.rejects(
      portCommand.runWithPortCheckDeadline((_signal, deadline) => Promise.resolve(
        portCommand.publishNormalRouteComparison({
          comparison,
          metricsBytes: Buffer.from('{"selected":true}\n'),
          outputDirectory,
          deadline,
        }),
      ), 10),
      /Port evidence command exceeded 10ms/,
    );
    for (const [name, bytes] of originalBytes) {
      assert.equal(sha256(fs.readFileSync(path.join(outputDirectory, name))), sha256(bytes), name);
    }
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('port operation cleans started browser server and run directories after injected failure', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(typeof portCommand.runPortCheckOperation, 'function');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-operation-output-'));
  let browserClosed = 0;
  let serverStopped = 0;
  let runDirectories = [];
  try {
    await assert.rejects(portCommand.runPortCheckOperation({
      outputDirectory,
      signal: new AbortController().signal,
      dependencies: {
        build: async () => {},
        assertIsolation: () => {},
        readArt: () => ({}),
        readNaval: () => ({}),
        readAssetReport: () => ({}),
        startServer: async () => ({ server: { fixture: true }, baseUrl: 'http://fixture.invalid' }),
        verifyArtResponse: async () => {},
        launchBrowser: async () => ({ close: async () => { browserClosed += 1; } }),
        stopServer: async () => { serverStopped += 1; },
        afterResourcesStarted(resources) {
          runDirectories = resources.runDirectories;
          throw new Error('injected post-start failure');
        },
      },
    }), /injected post-start failure/);
    assert.equal(browserClosed, 1);
    assert.equal(serverStopped, 1);
    assert.equal(runDirectories.length, 2);
    assert.ok(runDirectories.every((directory) => !fs.existsSync(directory)));
    assert.deepEqual(fs.readdirSync(outputDirectory), []);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('partial port acquisition removes the first run directory and stops its server', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-partial-output-'));
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-partial-run-'));
  let directoryCalls = 0;
  let serverStopped = 0;
  try {
    await assert.rejects(portCommand.runPortCheckOperation({
      outputDirectory,
      signal: new AbortController().signal,
      dependencies: {
        build: async () => {},
        assertIsolation: () => {},
        readArt: () => ({}),
        readNaval: () => ({}),
        readAssetReport: () => ({}),
        startServer: async () => ({ server: { fixture: true }, baseUrl: 'http://fixture.invalid' }),
        stopServer: async () => { serverStopped += 1; },
        verifyArtResponse: async () => {},
        launchBrowser: async () => { throw new Error('run-directory service was ignored'); },
        makeRunDirectory() {
          directoryCalls += 1;
          if (directoryCalls === 1) return firstDirectory;
          throw new Error('injected second run directory failure');
        },
      },
    }), /injected second run directory failure/);
    assert.equal(directoryCalls, 2);
    assert.equal(serverStopped, 1);
    assert.equal(fs.existsSync(firstDirectory), false);
  } finally {
    fs.rmSync(firstDirectory, { recursive: true, force: true });
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('naval cleanup attempts server shutdown when browser close rejects', async () => {
  const navalCommand = await import('../caribbean-naval-check.mjs');
  assert.equal(typeof navalCommand.cleanupNavalHarnessResources, 'function');
  let serverStopped = 0;
  await assert.rejects(
    navalCommand.cleanupNavalHarnessResources({
      browser: { close: async () => { throw new Error('injected browser close failure'); } },
      server: { fixture: true },
      stopServer: async () => { serverStopped += 1; },
    }),
    /injected browser close failure/,
  );
  assert.equal(serverStopped, 1);
});

test('real NavalSession obeys installed clock boundaries', { timeout: 600_000 }, async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  assert.equal(
    typeof portCommand.runStrategicSailingJourney,
    'function',
    'caribbean-port-check.mjs must export runStrategicSailingJourney',
  );

  execFileSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'BUILD_HARNESS')),
    stdio: 'inherit',
  });
  const { server, baseUrl } = await portCommand.startStaticServer();
  t.after(async () => portCommand.stopStaticServer(server));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  t.after(async () => browser.close());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-real-session-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const emittedNaval = portCommand.readEmittedNavalAssets();

  const result = await portCommand.runStrategicSailingJourney({
    browser,
    baseUrl,
    runDirectory: directory,
    emittedNaval,
    trace,
    captureScreenshots: false,
  });

  assert.deepEqual(result.modeSequence, [
    'port', 'sailing', 'encounter', 'port', 'sailing', 'encounter', 'naval', 'port',
  ]);
  assert.deepEqual(result.eventIds, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(result.eventTypes, [
    'lead-accepted', 'voyage-started', 'sea-leg-completed', 'encounter-avoided',
    'voyage-started', 'sea-leg-completed', 'naval-engaged', 'naval-resolved',
  ]);
  assert.equal(result.clock.tickAtMount, 0);
  assert.equal(result.clock.tickAfterFirstRaf, 0);
  assert.equal(result.clock.firstPublishedTick, 6);
  assert.equal(result.clock.tickAtTerminalCapture, 11_855);
  assert.equal(result.navalInput.tickAfterReload, 0);
  assert.equal(result.clock.renderedRudderReleasedAt140ms, true);
  assert.deepEqual(result.fixtures.nowConsumed, [
    1_700_000_000_000,
    1_700_000_001_000,
    1_700_000_002_000,
    1_700_000_003_000,
    1_700_000_004_000,
    1_700_000_005_000,
    1_700_000_006_000,
    1_700_000_007_000,
    1_700_000_008_000,
  ]);
  assert.deepEqual(result.resolution, {
    outcome: 'boarding-ready',
    victorShipId: 'player',
    atTick: 11_855,
    seedAfter: 1_310_878_278,
    exactlyOnce: true,
    campaignWritesDuringBattle: 0,
    returnedTo: 'bridgetown',
  });
  assert.deepEqual(result.rng, {
    navigationTransitionsVerified: true,
    navalTransitionVerified: true,
    worldUnchanged: true,
  });
  assert.deepEqual(result.navalInput, {
    persistedBeforeMount: true,
    byteEqualAfterReload: true,
    tickAfterReload: 0,
  });
  assert.deepEqual(result.completion, {
    canonicalSaveEqualAfterReload: true,
    leadStatus: 'completed',
    setSailDisabled: true,
    setSailReason: 'The Red Jackdaw lead is complete.',
    victoryReturnCopy: 'Victory — Red Jackdaw ready to board · Returned on day 4.',
    safeReturnCopy: 'Bridgetown’s harbour crew made Mistral ready for the next departure; the battle outcome remains in this log, but its damage is not carried onto the ready flagship.',
  });
  assert.deepEqual(
    result.screenshotStates.get('campaign-result-desktop.png'),
    {
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
        backend: {
          vendor: result.screenshotStates.get('campaign-result-desktop.png').canvas.backend.vendor,
          renderer: result.screenshotStates.get('campaign-result-desktop.png').canvas.backend.renderer,
        },
        framebufferSample: {
          algorithm: 'fnv1a32-rgba-grid-v1',
          sampleCount: 40,
          nonzeroSampleChannels: result.screenshotStates.get('campaign-result-desktop.png').canvas.framebufferSample.nonzeroSampleChannels,
          sampleHash: result.screenshotStates.get('campaign-result-desktop.png').canvas.framebufferSample.sampleHash,
        },
      },
      terminal: {
        outcome: 'boarding-ready', victorShipId: 'player', atTick: 11_855, seedAfter: 1_310_878_278,
      },
      player: { hull: 78, sails: 61, crew: 44, cannon: 8 },
      opponent: { hull: 88, sails: 14, crew: 9, cannon: 8 },
    },
  );
  assert.ok(result.screenshotStates.get('campaign-result-desktop.png').canvas.backend.vendor.length > 0);
  assert.ok(result.screenshotStates.get('campaign-result-desktop.png').canvas.backend.renderer.length > 0);
  assert.match(result.screenshotStates.get('campaign-result-desktop.png').canvas.framebufferSample.sampleHash, /^[a-f0-9]{8}$/);

  const truncatedTrace = structuredClone(trace);
  truncatedTrace.segments = truncatedTrace.segments.slice(0, 3);
  await assert.rejects(
    portCommand.runStrategicSailingJourney({
      browser,
      baseUrl,
      runDirectory: directory,
      emittedNaval,
      trace: truncatedTrace,
      captureScreenshots: false,
    }),
    /Normal-route naval victory was not reached/,
  );
});

test('programmatic port evidence rejects descendants and symlink aliases of tracked evidence', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const trackedDirectory = path.resolve('docs/screenshots/caribbean-port');
  const trackedBefore = fileHashes(trackedDirectory);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-forced-failure-'));
  const symlink = path.join(temporary, 'tracked-alias');
  const unrelatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-unrelated-'));
  const unrelatedSymlink = path.join(temporary, 'unrelated-alias');
  try {
    fs.symlinkSync(trackedDirectory, symlink, 'dir');
    fs.symlinkSync(unrelatedDirectory, unrelatedSymlink, 'dir');
    await assert.rejects(portCommand.runPortCheck(undefined), /outputDirectory/);
    await assert.rejects(portCommand.runPortCheck({}), /outputDirectory/);
    await assert.rejects(portCommand.runPortCheck({ outputDirectory: '' }), /outputDirectory/);
    await assert.rejects(portCommand.runPortCheck({ outputDirectory: trackedDirectory }), /tracked docs/);
    assert.throws(
      () => portCommand.validateProgrammaticPortDestination(path.join(trackedDirectory, 'review-run')),
      /tracked evidence/,
    );
    assert.throws(
      () => portCommand.validateProgrammaticPortDestination(path.resolve('docs/games')),
      /tracked evidence/,
    );
    assert.throws(
      () => portCommand.validateProgrammaticPortDestination(symlink),
      /tracked evidence/,
    );
    assert.throws(
      () => portCommand.validateProgrammaticPortDestination(unrelatedSymlink),
      /symbolic link/,
    );
    assert.equal(portCommand.validateProgrammaticPortDestination(temporary), fs.realpathSync(temporary));

    for (const filename of ['setup-desktop.png', 'metrics.json']) {
      const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-final-symlink-'));
      const outside = path.join(unrelatedDirectory, `${filename}.outside`);
      const original = Buffer.from(`outside:${filename}`);
      fs.writeFileSync(outside, original);
      fs.symlinkSync(outside, path.join(outputDirectory, filename));
      assert.throws(
        () => portCommand.publishNormalRouteComparison({
          comparison: selectedComparison(filename),
          metricsBytes: Buffer.from('{"fixture":true}\n'),
          outputDirectory,
        }),
        /symbolic link/,
      );
      assert.deepEqual(fs.readFileSync(outside), original);
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }

    const ancestorRoot = path.join(temporary, 'ancestor-root');
    const outsideParent = path.join(temporary, 'outside-parent');
    const outsidePublication = path.join(outsideParent, 'publication');
    fs.mkdirSync(ancestorRoot);
    fs.mkdirSync(outsidePublication, { recursive: true });
    fs.symlinkSync(outsideParent, path.join(ancestorRoot, 'linked-parent'), 'dir');
    const outsideBefore = fileHashes(outsidePublication);
    assert.throws(
      () => portCommand.publishNormalRouteComparison({
        comparison: selectedComparison(),
        metricsBytes: Buffer.from('{"fixture":true}\n'),
        outputDirectory: path.join(ancestorRoot, 'linked-parent', 'publication'),
      }),
      /symbolic link/,
    );
    assert.deepEqual(fileHashes(outsidePublication), outsideBefore);

    assert.equal(typeof portCommand.validateTrackedPortDestination, 'function');
    const syntheticDocs = path.join(temporary, 'synthetic-repo', 'docs');
    const trackedOutside = path.join(temporary, 'tracked-outside');
    fs.mkdirSync(path.dirname(syntheticDocs), { recursive: true });
    fs.mkdirSync(path.join(trackedOutside, 'screenshots', 'caribbean-port'), { recursive: true });
    fs.symlinkSync(trackedOutside, syntheticDocs, 'dir');
    assert.throws(
      () => portCommand.validateTrackedPortDestination(
        path.join(syntheticDocs, 'screenshots', 'caribbean-port'),
        syntheticDocs,
      ),
      /symbolic link/,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(unrelatedDirectory, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(temporary), false);
  assert.deepEqual(fileHashes(trackedDirectory), trackedBefore);
});

test('full two-run port gate publishes only comparator-selected run A into a temporary destination', { timeout: 1_020_000 }, async (t) => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const trackedDirectory = path.resolve('docs/screenshots/caribbean-port');
  const trackedBefore = fileHashes(trackedDirectory);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-two-run-'));
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));

  const result = await portCommand.runPortCheck({ outputDirectory });
  assert.equal(result.comparison.ok, true);
  assert.equal(result.comparison.selectedRun, 'A');
  assert.equal(result.comparison.selectedArtifacts.size, 23);
  assert.deepEqual(result.comparison.screenshotEvidence, result.metrics.screenshotEvidence);
  assert.deepEqual(fs.readdirSync(outputDirectory).sort(), [
    ...result.comparison.selectedArtifacts.keys(),
    'metrics.json',
  ].sort());
  for (const [name, artifact] of result.comparison.selectedArtifacts) {
    assert.equal(artifact.sourceRun, 'A');
    const writtenHash = sha256(fs.readFileSync(path.join(outputDirectory, name)));
    assert.equal(writtenHash, artifact.sha256);
    assert.equal(result.publication.artifactHashes.get(name), artifact.sha256);
  }
  assert.equal(
    sha256(fs.readFileSync(path.join(outputDirectory, 'metrics.json'))),
    result.publication.metricsSha256,
  );
  assert.equal(
    result.comparison.selectedArtifacts.get('campaign-result-desktop.png').sha256,
    result.metrics.screenshotEvidence.observation.runA.pngSha256,
  );
  assert.deepEqual(
    result.metrics.screenshotEvidence.observation.runA.semanticState,
    result.metrics.screenshotEvidence.observation.runB.semanticState,
  );
  assert.deepEqual(fileHashes(trackedDirectory), trackedBefore);
});
