import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

test('programmatic port evidence rejects unsafe destinations before browser work and caller cleanup still runs', async () => {
  const portCommand = await import('../caribbean-port-check.mjs');
  const trackedDirectory = path.resolve('docs/screenshots/caribbean-port');
  const trackedBefore = fileHashes(trackedDirectory);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-forced-failure-'));
  try {
    await assert.rejects(portCommand.runPortCheck(undefined), /outputDirectory/);
    await assert.rejects(portCommand.runPortCheck({}), /outputDirectory/);
    await assert.rejects(portCommand.runPortCheck({ outputDirectory: '' }), /outputDirectory/);
    await assert.rejects(portCommand.runPortCheck({ outputDirectory: trackedDirectory }), /tracked docs/);
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
