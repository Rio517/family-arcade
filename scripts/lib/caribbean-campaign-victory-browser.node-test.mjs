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
