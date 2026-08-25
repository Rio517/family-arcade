import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

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
  try {
    fs.symlinkSync(trackedDirectory, symlink, 'dir');
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
    assert.equal(portCommand.validateProgrammaticPortDestination(temporary), fs.realpathSync(temporary));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
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
