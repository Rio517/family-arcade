#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { evaluateNavalEvidence } from './lib/caribbean-naval-evidence.mjs';

const MODULE_URL = new URL(import.meta.url);
const ROOT = MODULE_URL.protocol === 'file:'
  ? fileURLToPath(new URL('..', MODULE_URL))
  : process.cwd();
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'screenshots', 'caribbean-naval');
const HARNESS_PATH = '/preview-caribbean-game.html';
const GLB_PATTERN = /^caribbean-sloop-[A-Za-z0-9_-]+\.glb$/;
const ANGLE_ARGS = ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'];
export const VIEWPORTS = {
  tablet: { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
  minimum: { width: 1024, height: 768 },
  boundary: { width: 960, height: 600 },
  phonePortrait: { width: 430, height: 932 },
  phoneLandscape: { width: 844, height: 390 },
};
const TASK8_TREE_FILES = [
  'package.json',
  'scripts/caribbean-naval-check.mjs',
  'scripts/lib/caribbean-naval-evidence.mjs',
  'scripts/lib/caribbean-naval-evidence.test.mjs',
  'scripts/lib/caribbean-naval-check.test.mjs',
  'scripts/lib/caribbean-naval-scenario.test.mjs',
  'src/games/caribbean/components/CaribbeanLab.test.tsx',
  'src/games/caribbean/components/CaribbeanLab.tsx',
  'src/games/caribbean/components/battle/BattleHud.tsx',
  'src/games/caribbean/components/battle/BattleShortcutLegend.tsx',
  'src/games/caribbean/components/battle/NavalBattlePage.tsx',
  'src/games/caribbean/components/battle/NavalViewport.tsx',
  'src/games/caribbean/domain/naval/geometry.test.ts',
  'src/games/caribbean/domain/naval/geometry.ts',
  'src/games/caribbean/preview.tsx',
  'src/games/caribbean/state/naval/debugBridge.test.ts',
  'src/games/caribbean/state/naval/debugBridge.ts',
  'src/games/caribbean/state/naval/harnessConfig.test.ts',
  'src/games/caribbean/state/naval/harnessConfig.ts',
  'src/games/caribbean/three/naval/NavalScene.ts',
  'src/games/caribbean/three/naval/bearingLine.test.ts',
  'src/games/caribbean/three/naval/bearingLine.ts',
  'src/games/caribbean/three/naval/sceneMath.ts',
  'src/games/caribbean/styles/battle.css',
  'src/games/caribbean/styles/caribbean.css',
];

const CANONICAL_INPUT = {
  battleId: 'battle-lab-red-jackdaw',
  seed: 1702,
  windFrom: Math.PI / 3,
  windStrength: 1,
  arenaRadius: 92,
  timeLimitTicks: 14_400,
  objective: 'capture-red-jackdaw',
  player: {
    id: 'player', stableShipId: 'mistral', name: 'Mistral', classId: 'sloop',
    position: { x: 0, z: -36 }, heading: 0, hull: 100, sails: 100, crew: 52, cannon: 8,
  },
  opponent: {
    id: 'opponent', stableShipId: 'red-jackdaw', name: 'Red Jackdaw', classId: 'sloop',
    position: { x: 0, z: 36 }, heading: Math.PI, hull: 100, sails: 100, crew: 48, cannon: 8,
  },
};

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

function fileResponsePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://naval.local').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(DIST, relative);
  if (candidate !== DIST && !candidate.startsWith(`${DIST}${path.sep}`)) return null;
  return candidate;
}

export async function startStaticServer(options = {}) {
  const createServer = options.createServer ?? http.createServer;
  const healthCheck = options.healthCheck ?? fetch;
  const server = createServer((request, response) => {
    const file = fileResponsePath(request.url ?? '/');
    if (!file) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (error, contents) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Static server did not receive a TCP port');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await healthCheck(`${baseUrl}${HARNESS_PATH}`);
    if (response.status !== 200) throw new Error(`Harness health check returned ${response.status}`);
    return { server, baseUrl };
  } catch (error) {
    await stopStaticServer(server);
    throw error;
  }
}

async function stopStaticServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function findHashedGlb() {
  const assets = path.join(DIST, 'assets');
  const matches = fs.readdirSync(assets).filter((name) => GLB_PATTERN.test(name));
  if (matches.length !== 1) throw new Error(`Expected one hashed Caribbean sloop GLB, found ${matches.length}`);
  const file = path.join(assets, matches[0]);
  return {
    file,
    requestPath: `/assets/${matches[0]}`,
    bytes: fs.statSync(file).size,
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
}

function saveIfChanged(filename, bytes) {
  const destination = path.join(OUT, filename);
  const next = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const current = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
  if (current?.equals(next)) {
    console.log(`unchanged: ${filename}`);
    return false;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, next);
  console.log(`${current ? 'updated' : 'new'}: ${filename}`);
  return true;
}

export function captureSourceProvenance({ root = ROOT, sourceFiles = TASK8_TREE_FILES } = {}) {
  const digest = createHash('sha256');
  for (const relativePath of sourceFiles) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(root, relativePath)));
    digest.update('\0');
  }
  return {
    headCommitAtCapture: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    worktreeDirtyBeforeCapture: execFileSync(
      'git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' },
    ).trim().length > 0,
    sourceTreeSha256: digest.digest('hex'),
    sourceTreeFiles: sourceFiles,
  };
}

function serializedHarnessUrl(baseUrl, input, extra = {}) {
  const params = new URLSearchParams({ input: JSON.stringify(input), ...extra });
  return `${baseUrl}${HARNESS_PATH}?${params}`;
}

function physicalScenario(side) {
  const input = structuredClone(CANONICAL_INPUT);
  input.battleId = `naval-evidence-${side}`;
  input.seed = side === 'port' ? 8_023 : 8_024;
  input.player.position = { x: 0, z: 0 };
  input.player.heading = 0;
  input.opponent.position = { x: side === 'port' ? 20 : -20, z: 0 };
  input.opponent.heading = Math.PI;
  return input;
}

function performanceScenario() {
  const input = structuredClone(CANONICAL_INPUT);
  input.battleId = 'naval-evidence-active-performance';
  input.seed = 8_026;
  input.player.position = { x: 0, z: 0 };
  input.player.heading = 0;
  input.player.crew = 75;
  input.player.cannon = 12;
  input.opponent.position = { x: 20, z: 0 };
  input.opponent.heading = 0;
  input.opponent.crew = 75;
  input.opponent.cannon = 12;
  return input;
}

export function boardingScenario() {
  const input = structuredClone(CANONICAL_INPUT);
  input.battleId = 'naval-evidence-boarding-ready';
  input.seed = 8_025;
  input.player.position = { x: 0, z: -3.51 };
  input.player.heading = 0;
  input.player.sails = 30;
  input.player.crew = 24;
  input.opponent.position = { x: 0, z: 3.51 };
  input.opponent.heading = 0;
  input.opponent.hull = 72;
  input.opponent.sails = 30;
  input.opponent.crew = 18;
  input.opponent.cannon = 6;
  return input;
}

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function sceneMetricsFrom(element) {
  const data = element.dataset;
  return {
    fps: Number(data.sceneFps),
    dpr: Number(data.sceneDpr),
    tier: data.sceneTier,
    drawCalls: Number(data.sceneDrawCalls),
    triangles: Number(data.sceneTriangles),
    textures: Number(data.sceneTextures),
    geometries: Number(data.sceneGeometries),
    materials: Number(data.sceneMaterials),
    bufferAttributes: Number(data.sceneBufferAttributes),
    activeEffects: Number(data.sceneActiveEffects),
    effectCapacity: Number(data.sceneEffectCapacity),
    reducedMotion: data.sceneReducedMotion === 'true',
    shipIntermediateFrames: Number(data.sceneShipIntermediateFrames),
    cameraIntermediateFrames: Number(data.sceneCameraIntermediateFrames),
    reducedMotionShipSnaps: Number(data.sceneReducedMotionShipSnaps),
    reducedMotionCameraSnaps: Number(data.sceneReducedMotionCameraSnaps),
  };
}

async function readSceneMetrics(page) {
  const frame = page.getByTestId('naval-scene-frame');
  await frame.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="naval-scene-frame"]');
    return Boolean(element?.getAttribute('data-scene-fps'));
  }, undefined, { timeout: 20_000 });
  return frame.evaluate(sceneMetricsFrom);
}

async function readActiveSceneSample(page) {
  const metrics = await readSceneMetrics(page);
  const simulation = await page.evaluate(() => {
    const snapshot = window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot();
    return {
      tick: snapshot.state.tick,
      paused: snapshot.paused,
      outcome: snapshot.state.outcome?.kind ?? null,
    };
  });
  return { ...metrics, ...simulation };
}

async function enterBattle(page) {
  await page.getByTestId('lab-start-naval').click();
  await page.getByTestId('naval-briefing').waitFor();
  await page.getByTestId('naval-enter-battle').click();
  await page.getByTestId('naval-battle-page').waitFor();
  await page.waitForFunction(() => Boolean(window.__CARIBBEAN_NAVAL_DEBUG__), undefined, { timeout: 10_000 });
}

async function waitForRudder(page, value) {
  await page.waitForFunction(
    (expected) => window.__CARIBBEAN_NAVAL_DEBUG__?.getSnapshot().currentCommand.rudder === expected,
    value,
  );
}

function minimumMovingAverage(values, width) {
  if (values.length < width) return Math.min(...values);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= values.length - width; index += 1) {
    const slice = values.slice(index, index + width);
    minimum = Math.min(minimum, slice.reduce((sum, value) => sum + value, 0) / width);
  }
  return minimum;
}

function resourceGrowth(samples, field) {
  const values = samples.map((sample) => sample[field]);
  return Math.max(...values) - Math.min(...values);
}

function errorRecorder(page, baseUrl, aggregate) {
  const localOrigin = new URL(baseUrl).origin;
  page.on('console', (message) => {
    if (message.type() === 'error') aggregate.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => aggregate.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== localOrigin) {
      aggregate.remoteDependencies.push(request.url());
    }
    if (url.origin === localOrigin) aggregate.requestedPaths.push(url.pathname);
  });
  page.on('requestfailed', (request) => {
    aggregate.requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) aggregate.requestFailures.push(`${response.status()} ${response.url()}`);
  });
}

async function flushUnhandled(page, aggregate) {
  const failures = await page.evaluate(() => window.__NAVAL_UNHANDLED__ ?? []);
  aggregate.unhandledRejections.push(...failures);
}

async function screenshot(page, filename) {
  saveIfChanged(filename, await page.screenshot({ animations: 'disabled' }));
}

async function readSupportedDisplay(page, viewport) {
  return page.evaluate((expectedViewport) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const stage = rect('.naval-battle-stage');
    const commandStrip = document.querySelector('[aria-label="Battle commands"]');
    const controlIds = [
      'naval-rudder-port', 'naval-fire-port', 'naval-ammo-round', 'naval-ammo-chain',
      'naval-ammo-grape', 'naval-sail-toggle', 'naval-fire-starboard', 'naval-rudder-starboard', 'naval-options-toggle',
    ];
    const controls = controlIds.map((id) => document.querySelector(`[data-testid="${id}"]`));
    const touchSized = controls.every((element) => {
      const bounds = element?.getBoundingClientRect();
      return visible(element) && bounds.width >= 44 && bounds.height >= 44;
    });
    const labelsContained = controls.every((element) => {
      const bounds = element?.getBoundingClientRect();
      if (!bounds) return false;
      return [...element.querySelectorAll('span, strong')].every((label) => {
        const labelBounds = label.getBoundingClientRect();
        return labelBounds.left >= bounds.left - 1 && labelBounds.right <= bounds.right + 1
          && labelBounds.top >= bounds.top - 1 && labelBounds.bottom <= bounds.bottom + 1;
      });
    });
    const actionType = controls.flatMap((element) => element
      ? [element, ...element.querySelectorAll('*')].filter((candidate) => [...candidate.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      ))
      : []);
    const minimumActionFontSize = Math.min(...actionType.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
    const sailControl = document.querySelector('[data-testid="naval-sail-toggle"]');
    const commandText = commandStrip?.textContent ?? '';
    const pauseText = document.querySelector('[data-testid="naval-pause"]')?.textContent ?? '';
    const shortcutKeys = ['A', 'Q', '1', '2', '3', 'R', 'E', 'D'].every((key) => commandText.includes(key))
      && pauseText.includes('Space') && pauseText.includes('Esc');
    const center = {
      left: innerWidth * 0.35,
      right: innerWidth * 0.65,
      top: innerHeight * 0.3,
      bottom: innerHeight * 0.66,
    };
    const blockers = [...document.querySelectorAll(
      '.naval-mission-line, .naval-opponent-rail > *, .naval-player-rail > *, .naval-command-strip',
    )].filter(visible);
    const intersectsCenter = blockers.some((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left < center.right && bounds.right > center.left
        && bounds.top < center.bottom && bounds.bottom > center.top;
    });
    return {
      viewport: expectedViewport,
      battle: visible(document.querySelector('[data-testid="naval-battle-page"]')),
      notice: visible(document.querySelector('[data-testid="caribbean-display-notice"]')),
      fullBleed: Boolean(stage)
        && stage.left <= 1 && stage.top <= 1
        && stage.width >= innerWidth - 2 && stage.height >= innerHeight - 2,
      centerClear: !intersectsCenter,
      controlsVisible: visible(commandStrip)
        && touchSized && labelsContained
        && shortcutKeys,
      touchSized,
      labelsContained,
      shortcutKeys,
      minimumActionFontSize,
      sailControl: visible(sailControl) && controls.includes(sailControl),
      noOuterScroll: document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight,
    };
  }, viewport);
}

async function readUnsupportedDisplay(page, viewport) {
  return page.evaluate((expectedViewport) => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    return {
      viewport: expectedViewport,
      notice: visible('[data-testid="caribbean-display-notice"]'),
      battle: visible('[data-testid="naval-battle-page"]'),
      liveFrame: visible('[data-testid="naval-scene-frame"]'),
      focused: document.activeElement?.getAttribute('data-testid') === 'caribbean-display-notice',
    };
  }, viewport);
}

async function readPrebattleDisplay(page, phase) {
  return page.evaluate((currentPhase) => {
    const viewportContains = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden'
        && bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
    };
    const legend = document.querySelector('[aria-label="Battle controls"]');
    const keys = [...(legend?.querySelectorAll('kbd') ?? [])].map((element) => element.textContent?.trim());
    const expected = ['A', 'Q', '1', '2', '3', 'R', 'E', 'D', 'Space / Esc'];
    const cta = document.querySelector(`[data-testid="${currentPhase === 'decision' ? 'lab-start-naval' : 'naval-enter-battle'}"]`);
    return {
      legendComplete: expected.every((key) => keys.includes(key))
        && viewportContains(legend)
        && [...(legend?.querySelectorAll('li') ?? [])].every(viewportContains),
      ctaVisible: viewportContains(cta),
      noOuterScroll: document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight,
    };
  }, phase);
}

async function newEvidencePage(browser, baseUrl, aggregate, viewport, reducedMotion = 'no-preference') {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion,
  });
  await page.addInitScript(() => {
    window.__NAVAL_UNHANDLED__ = [];
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
      window.__NAVAL_UNHANDLED__.push(reason);
    });
  });
  errorRecorder(page, baseUrl, aggregate);
  return page;
}

async function captureCanonicalJourney(browser, baseUrl, aggregate) {
  const page = await newEvidencePage(browser, baseUrl, aggregate, VIEWPORTS.tablet);
  await page.goto(`${baseUrl}${HARNESS_PATH}`, { waitUntil: 'networkidle' });
  const decisionDisplay = await readPrebattleDisplay(page, 'decision');
  await screenshot(page, 'decision-tablet.png');
  await page.getByTestId('lab-start-naval').click();
  await page.getByTestId('naval-briefing').waitFor();
  const briefingDisplay = await readPrebattleDisplay(page, 'briefing');
  await screenshot(page, 'briefing-tablet.png');
  await page.getByTestId('naval-enter-battle').click();
  await page.getByTestId('naval-battle-page').waitFor();
  await page.waitForFunction(() => Boolean(window.__CARIBBEAN_NAVAL_DEBUG__));
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-testid="naval-scene-frame"]');
    return frame?.getAttribute('data-scene-reduced-motion') === 'false'
      && Number(frame.getAttribute('data-scene-ship-intermediate-frames')) > 0
      && Number(frame.getAttribute('data-scene-camera-intermediate-frames')) > 0;
  }, undefined, { timeout: 20_000 });
  const canonicalInput = await page.evaluate(() => {
    const input = window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.input;
    return { battleId: input.battleId, seed: input.seed };
  });
  if (canonicalInput.battleId !== CANONICAL_INPUT.battleId || canonicalInput.seed !== CANONICAL_INPUT.seed) {
    throw new Error(`Production Battle Lab default drifted: ${JSON.stringify(canonicalInput)}`);
  }
  const tabletMetrics = await readSceneMetrics(page);
  const tabletDisplay = await readSupportedDisplay(page, VIEWPORTS.tablet);
  await screenshot(page, 'battle-tablet-landscape.png');

  const headingBeforePort = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.ships.player.heading);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyA');
  await waitForRudder(page, 0);
  const headingAfterPort = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.ships.player.heading);
  const headingBeforeStarboard = headingAfterPort;
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyD');
  await waitForRudder(page, 0);
  const headingAfterStarboard = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.ships.player.heading);
  const staleRudder = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().currentCommand.rudder !== 0);

  await page.setViewportSize(VIEWPORTS.desktop);
  await page.waitForTimeout(1_100);
  const desktopMetrics = await readSceneMetrics(page);
  const desktopDisplay = await readSupportedDisplay(page, VIEWPORTS.desktop);
  await screenshot(page, 'battle-desktop.png');
  await page.setViewportSize(VIEWPORTS.minimum);
  await page.waitForTimeout(1_100);
  const minimumMetrics = await readSceneMetrics(page);
  const minimumDisplay = await readSupportedDisplay(page, VIEWPORTS.minimum);
  await screenshot(page, 'battle-minimum-supported.png');

  await page.setViewportSize(VIEWPORTS.boundary);
  await page.waitForTimeout(1_100);
  const boundaryMetrics = await readSceneMetrics(page);
  const boundaryDisplay = await readSupportedDisplay(page, VIEWPORTS.boundary);
  await screenshot(page, 'battle-boundary-supported.png');

  await page.evaluate(() => { window.__NAVAL_PRIOR_DEBUG__ = window.__CARIBBEAN_NAVAL_DEBUG__; });
  await page.setViewportSize(VIEWPORTS.phoneLandscape);
  await page.getByTestId('caribbean-display-notice').waitFor();
  const blockedTickStart = await page.evaluate(() => window.__NAVAL_PRIOR_DEBUG__.getSnapshot().state.tick);
  await page.waitForTimeout(450);
  const blockedTickEnd = await page.evaluate(() => window.__NAVAL_PRIOR_DEBUG__.getSnapshot().state.tick);
  const landscapeDisplay = await readUnsupportedDisplay(page, VIEWPORTS.phoneLandscape);
  await screenshot(page, 'minimum-screen-phone-landscape.png');

  await page.setViewportSize(VIEWPORTS.phonePortrait);
  await page.getByTestId('caribbean-display-notice').waitFor();
  const portraitDisplay = await readUnsupportedDisplay(page, VIEWPORTS.phonePortrait);
  await screenshot(page, 'minimum-screen-phone-portrait.png');

  await page.setViewportSize(VIEWPORTS.tablet);
  await page.getByTestId('naval-battle-page').waitFor();
  await page.waitForFunction(() => window.__CARIBBEAN_NAVAL_DEBUG__ !== window.__NAVAL_PRIOR_DEBUG__);
  const restoredTick = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.tick);
  await page.waitForFunction(
    (tick) => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.tick > tick,
    restoredTick,
  );
  const restoredWithNewSession = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__ !== window.__NAVAL_PRIOR_DEBUG__);

  await flushUnhandled(page, aggregate);
  await page.close();

  return {
    steeringPortHeadingDelta: headingAfterPort - headingBeforePort,
    steeringStarboardHeadingDelta: headingAfterStarboard - headingBeforeStarboard,
    staleRudder,
    canonicalInput,
    viewportMetrics: { tablet: tabletMetrics, desktop: desktopMetrics, minimum: minimumMetrics, boundary: boundaryMetrics },
    display: {
      supported: { desktop: desktopDisplay, tablet: tabletDisplay, minimum: minimumDisplay, boundary: boundaryDisplay },
      unsupported: { portrait: portraitDisplay, landscape: landscapeDisplay },
      resize: {
        notice: landscapeDisplay.notice,
        noticeFocused: landscapeDisplay.focused,
        battleUnmounted: !landscapeDisplay.battle,
        tickStopped: blockedTickEnd === blockedTickStart,
        restoredWithNewSession,
      },
      prebattle: { decision: decisionDisplay, briefing: briefingDisplay },
    },
  };
}

async function captureReducedMotion(browser, baseUrl, aggregate) {
  const page = await newEvidencePage(browser, baseUrl, aggregate, VIEWPORTS.tablet, 'reduce');
  await page.goto(`${baseUrl}${HARNESS_PATH}`, { waitUntil: 'networkidle' });
  await enterBattle(page);
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-testid="naval-scene-frame"]');
    return frame?.getAttribute('data-scene-reduced-motion') === 'true'
      && Number(frame.getAttribute('data-scene-reduced-motion-ship-snaps')) > 0
      && Number(frame.getAttribute('data-scene-reduced-motion-camera-snaps')) > 0;
  }, undefined, { timeout: 20_000 });
  const metrics = await readSceneMetrics(page);
  await flushUnhandled(page, aggregate);
  await page.close();
  return {
    preference: 'reduce',
    reducedMotion: metrics.reducedMotion,
    shipSnaps: metrics.reducedMotionShipSnaps,
    cameraSnaps: metrics.reducedMotionCameraSnaps,
  };
}

async function captureActivePlateau(browser, baseUrl, aggregate) {
  const page = await newEvidencePage(browser, baseUrl, aggregate, VIEWPORTS.tablet);
  await page.goto(serializedHarnessUrl(baseUrl, performanceScenario()), { waitUntil: 'networkidle' });
  await enterBattle(page);
  await readSceneMetrics(page);
  await page.waitForTimeout(2_000);
  const afterEventId = await page.evaluate(() => {
    const events = window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.events;
    return events.at(-1)?.id ?? 0;
  });
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(
    (eventId) => window.__CARIBBEAN_NAVAL_DEBUG__.getVolleyEvidence(eventId).some((event) => event.side === 'port'),
    afterEventId,
  );

  const samples = [];
  const started = performance.now();
  for (let second = 1; second <= 20; second += 1) {
    const remaining = started + second * 1_000 - performance.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
    samples.push(await readActiveSceneSample(page));
  }
  await flushUnhandled(page, aggregate);
  await page.close();
  return samples;
}

async function captureBroadside(browser, baseUrl, aggregate, side) {
  const page = await newEvidencePage(browser, baseUrl, aggregate, VIEWPORTS.tablet);
  await page.goto(serializedHarnessUrl(baseUrl, physicalScenario(side)), { waitUntil: 'networkidle' });
  await enterBattle(page);
  await readSceneMetrics(page);
  await page.waitForFunction(
    (wantedSide) => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().state.ships.player.reload[wantedSide].loaded === true,
    side,
  );
  await page.keyboard.press(side === 'port' ? 'KeyQ' : 'KeyE');
  await page.waitForFunction(
    (wantedSide) => window.__CARIBBEAN_NAVAL_DEBUG__.getVolleyEvidence(0).some((event) => event.side === wantedSide),
    side,
  );
  const evidence = await page.evaluate(
    (wantedSide) => window.__CARIBBEAN_NAVAL_DEBUG__.getVolleyEvidence(0).find((event) => event.side === wantedSide),
    side,
  );
  await page.waitForTimeout(900);
  const volleyMetrics = await readSceneMetrics(page);
  return { page, evidence, volleyMetrics };
}

async function captureHandedness(browser, baseUrl, aggregate) {
  const port = await captureBroadside(browser, baseUrl, aggregate, 'port');
  await flushUnhandled(port.page, aggregate);
  await port.page.close();
  const starboard = await captureBroadside(browser, baseUrl, aggregate, 'starboard');
  await starboard.page.evaluate(({ portEvidence, starboardEvidence }) => {
    const panel = document.createElement('aside');
    panel.setAttribute('data-testid', 'naval-handedness-evidence');
    panel.style.cssText = 'position:fixed;right:18px;top:82px;z-index:10000;width:350px;padding:18px 20px;border:1px solid #d7b565;background:rgba(4,20,29,.94);color:#f6edda;font:14px/1.45 ui-monospace,monospace;box-shadow:0 18px 50px rgba(0,0,0,.42)';
    const heading = document.createElement('strong');
    heading.style.cssText = 'display:block;color:#d7b565;font:700 17px/1.3 system-ui,sans-serif;margin-bottom:10px';
    heading.textContent = 'Physical broadside evidence';
    const body = document.createElement('pre');
    body.style.cssText = 'margin:0;white-space:pre-wrap';
    const point = (value) => JSON.stringify({
      x: Number(value.x.toFixed(3)),
      z: Number(value.z.toFixed(3)),
    });
    body.textContent = [
      `PORT / Q\nvector ${point(portEvidence.vector)}\nmuzzle ${point(portEvidence.muzzleOrigin)}`,
      `STARBOARD / E\nvector ${point(starboardEvidence.vector)}\nmuzzle ${point(starboardEvidence.muzzleOrigin)}`,
    ].join('\n\n');
    panel.append(heading, body);
    document.body.appendChild(panel);
  }, { portEvidence: port.evidence, starboardEvidence: starboard.evidence });
  await screenshot(starboard.page, 'broadside-handedness.png');
  await flushUnhandled(starboard.page, aggregate);
  await starboard.page.close();
  return {
    port: port.evidence,
    starboard: starboard.evidence,
    portMetrics: port.volleyMetrics,
    starboardMetrics: starboard.volleyMetrics,
  };
}

async function captureBoardingReady(browser, baseUrl, aggregate) {
  const input = boardingScenario();
  const initialDistance = Math.hypot(
    input.opponent.position.x - input.player.position.x,
    input.opponent.position.z - input.player.position.z,
  );
  const page = await newEvidencePage(browser, baseUrl, aggregate, VIEWPORTS.tablet);
  await page.goto(serializedHarnessUrl(baseUrl, input), { waitUntil: 'networkidle' });
  const started = performance.now();
  await enterBattle(page);
  await page.getByTestId('naval-result-restart').waitFor({ timeout: 15_000 });
  const elapsedBrowserSeconds = (performance.now() - started) / 1_000;
  const snapshot = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot());
  await screenshot(page, 'boarding-ready-result.png');
  await flushUnhandled(page, aggregate);
  await page.close();
  return {
    ok: snapshot.state.outcome?.kind === 'boarding-ready'
      && elapsedBrowserSeconds < 15
      && initialDistance > 7
      && input.opponent.hull > 20
      && input.opponent.crew > 8,
    outcome: snapshot.state.outcome?.kind ?? null,
    elapsedBrowserSeconds: round(elapsedBrowserSeconds),
    initial: {
      distance: round(initialDistance),
      outcomeInjected: false,
      damageInjectedAfterStart: false,
      timeInjected: false,
      opponent: {
        hull: input.opponent.hull,
        sails: input.opponent.sails,
        crew: input.opponent.crew,
        cannon: input.opponent.cannon,
      },
    },
  };
}

async function captureFallback(browser, baseUrl, aggregate) {
  const page = await newEvidencePage(browser, baseUrl, aggregate, VIEWPORTS.minimum);
  await page.goto(serializedHarnessUrl(baseUrl, CANONICAL_INPUT, { forceWebglFailure: '1' }), { waitUntil: 'networkidle' });
  await enterBattle(page);
  await page.getByTestId('naval-html-chart').waitFor();
  await page.getByTestId('naval-scene-retry').waitFor();
  await page.getByTestId('naval-scene-restart').waitFor();
  await page.getByTestId('naval-fire-port').waitFor();
  await page.getByTestId('naval-scene-retry').click();
  await page.getByTestId('naval-scene-retry').waitFor();
  const beforeRestart = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().battleGeneration);
  await page.getByTestId('naval-scene-restart').click();
  await page.waitForFunction(
    (generation) => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().battleGeneration > generation,
    beforeRestart,
  );
  const afterRestart = await page.evaluate(() => window.__CARIBBEAN_NAVAL_DEBUG__.getSnapshot().battleGeneration);
  await screenshot(page, 'fallback-tablet-landscape.png');
  const chart = await page.getByTestId('naval-html-chart').isVisible();
  const battleControls = await page.getByTestId('naval-fire-port').isEnabled();
  const retry = await page.getByTestId('naval-scene-retry').isEnabled();
  const restart = await page.getByTestId('naval-scene-restart').isEnabled();
  const labelsClear = await page.evaluate(() => {
    const caption = document.querySelector('.naval-chart figcaption')?.getBoundingClientRect();
    const actions = document.querySelector('.naval-viewport-fallback__actions')?.getBoundingClientRect();
    return Boolean(caption && actions && actions.top >= caption.bottom + 8);
  });
  const ok = chart && battleControls && retry && restart && labelsClear && afterRestart === beforeRestart + 1;
  await flushUnhandled(page, aggregate);
  await page.close();
  return { ok, chart, retry, restart, battleControls, labelsClear };
}

export function plateauEvidence(samples) {
  const allocationErrors = [];
  const capacityErrors = [];
  const poolErrors = [];
  for (const [index, sample] of samples.entries()) {
    for (const field of ['textures', 'geometries', 'materials', 'bufferAttributes', 'activeEffects', 'effectCapacity']) {
      if (!Number.isFinite(sample[field]) || sample[field] < 0) allocationErrors.push(`sample ${index} ${field}=${sample[field]}`);
    }
    if (!Number.isInteger(sample.effectCapacity) || sample.effectCapacity <= 0) capacityErrors.push(`sample ${index} capacity=${sample.effectCapacity}`);
    if (sample.activeEffects > sample.effectCapacity) poolErrors.push(`sample ${index} active=${sample.activeEffects} capacity=${sample.effectCapacity}`);
  }
  return {
    observedSeconds: 20,
    samples,
    growthAfterWarmup: {
      textures: resourceGrowth(samples, 'textures'),
      geometries: resourceGrowth(samples, 'geometries'),
      materials: resourceGrowth(samples, 'materials'),
      bufferAttributes: resourceGrowth(samples, 'bufferAttributes'),
      activeEffects: resourceGrowth(samples, 'activeEffects'),
      effectCapacity: resourceGrowth(samples, 'effectCapacity'),
    },
    allocationErrors,
    capacityErrors,
    poolErrors,
  };
}

export async function runNavalCheck() {
  const source = captureSourceProvenance();
  console.log('Building production bundle with the harness enabled…');
  await run('npm', ['run', 'build'], { env: { ...process.env, BUILD_HARNESS: '1' } });
  const glb = findHashedGlb();
  const { server, baseUrl } = await startStaticServer();
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ANGLE_ARGS,
    });
    const aggregate = {
      consoleErrors: [], pageErrors: [], requestFailures: [], unhandledRejections: [],
      requestedPaths: [], remoteDependencies: [],
    };
    const canonical = await captureCanonicalJourney(browser, baseUrl, aggregate);
    const reducedMotion = await captureReducedMotion(browser, baseUrl, aggregate);
    const activePlateauSamples = await captureActivePlateau(browser, baseUrl, aggregate);
    const handednessEvents = await captureHandedness(browser, baseUrl, aggregate);
    const scenario = await captureBoardingReady(browser, baseUrl, aggregate);
    const fallback = await captureFallback(browser, baseUrl, aggregate);
    const performanceSamples = [
      canonical.viewportMetrics.tablet,
      canonical.viewportMetrics.desktop,
      canonical.viewportMetrics.minimum,
      canonical.viewportMetrics.boundary,
      handednessEvents.portMetrics,
      handednessEvents.starboardMetrics,
      ...activePlateauSamples,
    ];
    const fpsSamples = activePlateauSamples.map((sample) => round(sample.fps));
    const handedness = {
      portVectorX: handednessEvents.port.vector.x,
      starboardVectorX: handednessEvents.starboard.vector.x,
      portMuzzleOriginX: handednessEvents.port.muzzleOrigin.x,
      starboardMuzzleOriginX: handednessEvents.starboard.muzzleOrigin.x,
      steeringPortHeadingDelta: round(canonical.steeringPortHeadingDelta, 6),
      steeringStarboardHeadingDelta: round(canonical.steeringStarboardHeadingDelta, 6),
      staleRudder: canonical.staleRudder,
      port: handednessEvents.port,
      starboard: handednessEvents.starboard,
    };
    const evidence = {
      consoleErrors: aggregate.consoleErrors,
      pageErrors: aggregate.pageErrors,
      requestFailures: aggregate.requestFailures,
      unhandledRejections: aggregate.unhandledRejections,
      asset: {
        expectedPath: glb.requestPath,
        requestedPaths: [...new Set(aggregate.requestedPaths)].sort(),
        remoteDependencies: [...new Set(aggregate.remoteDependencies)].sort(),
      },
      performance: {
        fpsSamples,
        sustainedFps: round(minimumMovingAverage(fpsSamples, 3)),
        maxDrawCalls: Math.max(...performanceSamples.map((sample) => sample.drawCalls)),
        maxTriangles: Math.max(...performanceSamples.map((sample) => sample.triangles)),
      },
      resources: plateauEvidence(activePlateauSamples),
      handedness,
      scenario,
      fallback,
      motion: {
        normal: {
          preference: 'no-preference',
          reducedMotion: canonical.viewportMetrics.tablet.reducedMotion,
          shipIntermediateFrames: canonical.viewportMetrics.tablet.shipIntermediateFrames,
          cameraIntermediateFrames: canonical.viewportMetrics.tablet.cameraIntermediateFrames,
        },
        reduced: reducedMotion,
      },
      display: canonical.display,
    };
    const verdict = evaluateNavalEvidence(evidence);
    const metrics = {
      source,
      canonicalInput: canonical.canonicalInput,
      seed: canonical.canonicalInput.seed,
      browser: { name: 'Chromium', version: browser.version(), angleArgs: ANGLE_ARGS },
      viewports: VIEWPORTS,
      deviceScaleFactor: 1,
      tiers: {
        tablet: canonical.viewportMetrics.tablet.tier,
        desktop: canonical.viewportMetrics.desktop.tier,
        minimum: canonical.viewportMetrics.minimum.tier,
        boundary: canonical.viewportMetrics.boundary.tier,
      },
      fps: {
        samples: fpsSamples,
        sustainedFloorMethod: 'minimum 3-sample moving average after warm-up during an unpaused advancing battle with live effects',
        sustained: evidence.performance.sustainedFps,
      },
      maximums: {
        drawCalls: evidence.performance.maxDrawCalls,
        triangles: evidence.performance.maxTriangles,
        textures: Math.max(...performanceSamples.map((sample) => sample.textures)),
        geometries: Math.max(...performanceSamples.map((sample) => sample.geometries)),
        materials: Math.max(...performanceSamples.map((sample) => sample.materials)),
        bufferAttributes: Math.max(...performanceSamples.map((sample) => sample.bufferAttributes)),
        effectActive: Math.max(...performanceSamples.map((sample) => sample.activeEffects)),
        effectCapacity: Math.max(...performanceSamples.map((sample) => sample.effectCapacity)),
      },
      resourcePlateau: {
        warmupSeconds: 2,
        observedSeconds: 20,
        samples: activePlateauSamples,
        ...evidence.resources,
      },
      asset: { path: glb.requestPath, bytes: glb.bytes, sha256: glb.sha256 },
      failures: {
        console: aggregate.consoleErrors,
        page: aggregate.pageErrors,
        requests: aggregate.requestFailures,
        unhandledRejections: aggregate.unhandledRejections,
        remoteDependencies: evidence.asset.remoteDependencies,
      },
      outcome: scenario,
      handedness,
      fallback,
      motion: evidence.motion,
      display: canonical.display,
      verdict,
    };
    saveIfChanged('metrics.json', `${JSON.stringify(metrics, null, 2)}\n`);
    if (!verdict.ok) throw new Error(`Naval evidence failed:\n- ${verdict.issues.join('\n- ')}`);
    console.log(`Naval evidence passed: ${fpsSamples.length} FPS samples, ${evidence.performance.maxDrawCalls} max calls, ${evidence.performance.maxTriangles} max triangles.`);
    return metrics;
  } finally {
    await browser?.close();
    await stopStaticServer(server);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runNavalCheck().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
