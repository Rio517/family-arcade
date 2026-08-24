#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import { evaluatePortIdentityEvidence, marketStabilityFailure, validateMarketStability } from './lib/caribbean-port-identity-evidence.mjs';

const MODULE_URL = new URL(import.meta.url);
const ROOT = fileURLToPath(new URL('..', MODULE_URL));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'screenshots', 'caribbean-port');
const HOST = '127.0.0.1';
const PORT = 0;
const ROUTE = '/#/caribbean';
const CURRENT_SAVE_KEY = 'caribbean:campaign:current';
const PREVIOUS_SAVE_KEY = 'caribbean:campaign:previous';
const QUARANTINE_PREFIX = 'caribbean:campaign:quarantine:';
const WRITER_LOCK = 'caribbean:campaign:writer';
const TRACE_KEY = 'caribbean:port-check:trace';
const SCREENSHOTS = [
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
  'player-profile-desktop.png',
];
const PORT_ORDER = [
  "Governor's House",
  'Tavern',
  'Market',
  'Shipyard',
  'Divide Shares',
  "Captain's Log",
  'Set Sail',
];
const VIEWPORTS = {
  setupDesktop: { width: 1440, height: 900, supported: true },
  portDesktop: { width: 1440, height: 900, supported: true },
  minimumSupported: { width: 960, height: 600, supported: true },
  minimumWidth: { width: 959, height: 600, supported: false },
  minimumHeight: { width: 960, height: 599, supported: false },
  largePortrait: { width: 1024, height: 1366, supported: false },
};
export const MARKET_PROBE_MINIMUM_NOW_FIXTURES = 42;
export const NOW_FIXTURES = Array.from({ length: 96 }, (_, index) => 1_700_000_000_000 + index * 1_000);
const SEED_FIXTURES = [1702, 2702, 3702, 4702, 5702, 6702, 7702, 8702];
const UUID_FIXTURES = Array.from(
  { length: 12 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const MIME = {
  '.css': 'text/css; charset=utf-8',
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

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  const visit = (candidate) => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') {
      invariant(Number.isFinite(candidate), 'Canonical JSON received a non-finite number');
      return candidate;
    }
    if (Array.isArray(candidate)) return candidate.map(visit);
    invariant(typeof candidate === 'object', 'Canonical JSON received a non-JSON value');
    const result = {};
    for (const key of Object.keys(candidate).sort()) result[key] = visit(candidate[key]);
    return result;
  };
  return JSON.stringify(visit(value));
}

function checksumPayload(payload) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonicalJson(payload))) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function replayJournal(journal) {
  invariant(journal && typeof journal === 'object', 'Save journal is missing');
  let state = structuredClone(journal.initial);
  for (const event of journal.events) {
    invariant(event.id === state.lastEventId + 1, `Non-contiguous event ${event.id}`);
    invariant(event.atDay === state.calendar.elapsedDays, `Wrong event day for ${event.id}`);
    if (event.type === 'market-traded') {
      invariant(event.payload.portId === 'bridgetown', 'Trade replay used another port');
      const ship = state.fleet.ships.find((candidate) => candidate.id === event.payload.shipId);
      invariant(ship, `Trade replay could not find ship ${event.payload.shipId}`);
      const currentQuantity = ship.cargo[event.payload.cargoId];
      invariant(Number.isSafeInteger(currentQuantity), `Trade replay found unknown cargo ${event.payload.cargoId}`);
      ship.cargo[event.payload.cargoId] = currentQuantity + event.payload.delta;
      state.wealth.gold -= event.payload.delta * event.payload.unitPrice;
    } else if (event.type === 'lead-accepted') {
      invariant(event.payload.leadId === 'red-jackdaw', 'Lead replay used an unknown lead');
      invariant(!state.leads.some((lead) => lead.id === 'red-jackdaw'), 'Lead replay duplicated acceptance');
      state.leads.push({
        id: 'red-jackdaw',
        kind: 'rumour',
        status: 'active',
        acceptedDay: event.atDay,
        expiresDay: event.atDay + 18,
      });
    } else {
      throw new Error(`Unknown campaign event ${event.type}`);
    }
    state.lastEventId = event.id;
  }
  invariant(canonicalJson(state) === canonicalJson(journal.state), 'Campaign replay did not reproduce stored state');
  return state;
}

function verifyEnvelope(raw, label) {
  invariant(typeof raw === 'string', `${label} save is missing`);
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error(`${label} save is malformed JSON`);
  }
  invariant(envelope.version === 1, `${label} save has unsupported version`);
  invariant(envelope.checksum === checksumPayload(envelope.payload), `${label} save checksum failed`);
  replayJournal(envelope.payload);
  return envelope;
}

function buildNormalProduction() {
  const env = { ...process.env };
  delete env.BUILD_HARNESS;
  console.log('Building the normal production bundle…');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, env, stdio: 'inherit' });
}

function assertNormalBuildIsolation() {
  invariant(!fs.existsSync(path.join(DIST, 'preview-caribbean-game.html')), 'Normal build shipped preview-caribbean-game.html');
  const assets = fs.readdirSync(path.join(DIST, 'assets'));
  const caribbeanGlbs = assets.filter((name) => /^caribbean-sloop.*\.glb$/i.test(name));
  invariant(caribbeanGlbs.length === 0, `Normal build shipped Caribbean sloop GLB: ${caribbeanGlbs.join(', ')}`);
}

function fileResponsePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}:${PORT}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(DIST, relative);
  if (candidate !== DIST && !candidate.startsWith(`${DIST}${path.sep}`)) return null;
  return candidate;
}

async function startStaticServer() {
  const server = http.createServer((request, response) => {
    const file = fileResponsePath(request.url ?? '/');
    if (file === null) {
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
    server.listen(PORT, HOST, resolve);
  });
  const address = server.address();
  invariant(address !== null && typeof address !== 'string', 'Production server did not expose a local port');
  const baseUrl = `http://${HOST}:${address.port}`;
  try {
    const response = await fetch(`${baseUrl}/`, { cache: 'no-store' });
    invariant(response.status === 200, `Production health check returned ${response.status}`);
    return { server, baseUrl };
  } catch (error) {
    await stopStaticServer(server);
    throw error;
  }
}

async function stopStaticServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function saveIfChanged(filename, bytes) {
  const destination = path.join(OUT, filename);
  const next = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const current = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
  if (current?.equals(next)) {
    console.log(`unchanged: ${filename}`);
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, next);
  console.log(`${current ? 'updated' : 'new'}: ${filename}`);
}

async function installBrowserBoundary(context) {
  await context.addInitScript(
    ({ nowFixtures, seedFixtures, uuidFixtures, traceKey, writerLock, usersRaw }) => {
      const defaultTrace = {
        nowIndex: 0,
        seedIndex: 0,
        uuidIndex: 0,
        nowConsumed: [],
        seedsConsumed: [],
        uuidsConsumed: [],
        locks: [],
      };
      let trace = defaultTrace;
      try {
        const raw = sessionStorage.getItem(traceKey);
        if (raw !== null) trace = { ...defaultTrace, ...JSON.parse(raw) };
      } catch {
        trace = defaultTrace;
      }
      const persist = () => sessionStorage.setItem(traceKey, JSON.stringify(trace));
      localStorage.setItem('arcade.users.v1', usersRaw);

      Object.defineProperty(Date, 'now', {
        configurable: true,
        value: () => {
          if (trace.nowIndex >= nowFixtures.length) throw new Error('Port-check Date.now fixtures exhausted');
          const value = nowFixtures[trace.nowIndex++];
          trace.nowConsumed.push(value);
          persist();
          return value;
        },
      });

      const nativeGetRandomValues = Crypto.prototype.getRandomValues;
      Object.defineProperty(Crypto.prototype, 'getRandomValues', {
        configurable: true,
        value(array) {
          if (array instanceof Uint32Array && array.length === 1) {
            if (trace.seedIndex >= seedFixtures.length) throw new Error('Port-check seed fixtures exhausted');
            const value = seedFixtures[trace.seedIndex++];
            array[0] = value;
            trace.seedsConsumed.push(value);
            persist();
            return array;
          }
          return nativeGetRandomValues.call(this, array);
        },
      });

      Object.defineProperty(Crypto.prototype, 'randomUUID', {
        configurable: true,
        value() {
          if (trace.uuidIndex >= uuidFixtures.length) throw new Error('Port-check UUID fixtures exhausted');
          const value = uuidFixtures[trace.uuidIndex++];
          trace.uuidsConsumed.push(value);
          persist();
          return value;
        },
      });

      let releaseHeldWriter = null;
      const control = {
        traceKey,
        writerLock,
        holdNextWriter: false,
        writerHeld: false,
        releaseWriter() {
          releaseHeldWriter?.();
          releaseHeldWriter = null;
          control.writerHeld = false;
        },
      };
      if (typeof LockManager !== 'undefined') {
        const nativeRequest = LockManager.prototype.request;
        Object.defineProperty(LockManager.prototype, 'request', {
          configurable: true,
          value(name, options, callback) {
            trace.locks.push({ name, mode: options?.mode ?? 'exclusive' });
            persist();
            if (name !== writerLock || !control.holdNextWriter) return nativeRequest.call(this, name, options, callback);
            control.holdNextWriter = false;
            return nativeRequest.call(this, name, options, async (lock) => {
              control.writerHeld = true;
              await new Promise((resolve) => { releaseHeldWriter = resolve; });
              return callback(lock);
            });
          },
        });
      }
      persist();
      window.__CARIBBEAN_PORT_CHECK__ = control;
    },
    {
      nowFixtures: NOW_FIXTURES,
      seedFixtures: SEED_FIXTURES,
      uuidFixtures: UUID_FIXTURES,
      traceKey: TRACE_KEY,
      writerLock: WRITER_LOCK,
      usersRaw: JSON.stringify({
        users: [{
          id: 'port-check-player',
          createdAt: 1_700_000_000_000,
          profile: {
            name: 'Mario', pronouns: 'he/him', points: 0, wins: 0, losses: 0,
            unlocked: [], lastSkinId: '', history: [],
          },
        }],
        activeId: 'port-check-player',
      }),
    },
  );
}

function recordFailures(page, baseUrl, failures) {
  const localOrigin = new URL(baseUrl).origin;
  page.on('console', (message) => {
    if (message.type() === 'error') failures.console.push(message.text());
  });
  page.on('pageerror', (error) => failures.page.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== localOrigin) {
      failures.external.push(request.url());
    }
    if (url.origin === localOrigin) failures.requestedPaths.push(url.pathname);
  });
  page.on('requestfailed', (request) => {
    failures.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.requests.push(`${response.status()} ${response.url()}`);
  });
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function readLayout(page, name, expected) {
  const result = await page.evaluate(({ viewportName, expectedViewport }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    };
    const root = document.querySelector('.caribbean-production, .caribbean-minimum-screen');
    const textElements = [document.body, ...document.body.querySelectorAll('*')].filter((element) => (
      visible(element)
      && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    ));
    const activeTargetSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"])';
    const activeTargets = [...document.querySelectorAll(activeTargetSelector)].filter(visible);
    const routeTargets = root === null ? [] : [...root.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [role="button"]:not([aria-disabled="true"])',
    )].filter(visible);
    const targetSizes = activeTargets.map((element) => {
      const rect = element.getBoundingClientRect();
      return { testId: element.getAttribute('data-testid'), width: rect.width, height: rect.height };
    });
    const partyPill = document.querySelector('.party-pill');
    const partyRect = visible(partyPill) ? partyPill.getBoundingClientRect() : null;
    const partyHitElement = partyRect === null ? null : document.elementFromPoint(
      partyRect.left + partyRect.width / 2,
      partyRect.top + partyRect.height / 2,
    );
    const partyObscured = partyPill !== null && partyRect !== null
      && partyHitElement !== partyPill && !partyPill.contains(partyHitElement);
    const occludedTargets = partyRect === null ? [] : routeTargets.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const intersects = Math.min(rect.right, partyRect.right) > Math.max(rect.left, partyRect.left)
        && Math.min(rect.bottom, partyRect.bottom) > Math.max(rect.top, partyRect.top);
      if (!intersects) return [];
      return [{
        testId: element.getAttribute('data-testid'),
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? null,
      }];
    });
    const fontSizes = textElements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const controllerMounted = document.querySelector('.caribbean-production') !== null;
    const notice = document.querySelector('.caribbean-minimum-screen');
    const supported = expectedViewport.supported;
    return {
      name: viewportName,
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
      expectedSupported: supported,
      controllerMounted,
      noticeVisible: visible(notice),
      noticeFocused: notice !== null && document.activeElement === notice,
      minimumFontPx: fontSizes.length === 0 ? null : Math.min(...fontSizes),
      minimumTargetWidthPx: targetSizes.length === 0 ? null : Math.min(...targetSizes.map((target) => target.width)),
      minimumTargetHeightPx: targetSizes.length === 0 ? null : Math.min(...targetSizes.map((target) => target.height)),
      undersizedTargets: targetSizes.filter((target) => target.width < 44 || target.height < 44),
      occludedTargets,
      partyObscured,
      horizontalOverflowPx: Math.max(
        0,
        document.documentElement.scrollWidth - innerWidth,
        document.body.scrollWidth - innerWidth,
        root instanceof HTMLElement ? root.scrollWidth - root.clientWidth : 0,
      ),
    };
  }, { viewportName: name, expectedViewport: expected });
  invariant(result.width === expected.width && result.height === expected.height, `${name} viewport drifted`);
  invariant(result.dpr === 1, `${name} used DPR ${result.dpr}`);
  invariant(result.horizontalOverflowPx === 0, `${name} has ${result.horizontalOverflowPx}px horizontal overflow`);
  if (expected.supported) {
    invariant(result.controllerMounted && !result.noticeVisible, `${name} blocked a supported playfield`);
    invariant(result.minimumFontPx !== null && result.minimumFontPx >= 14, `${name} has ${result.minimumFontPx}px text`);
    invariant(result.undersizedTargets.length === 0, `${name} has undersized active targets: ${JSON.stringify(result.undersizedTargets)}`);
    invariant(result.occludedTargets.length === 0, `${name} has Party control occlusion: ${JSON.stringify(result.occludedTargets)}`);
    invariant(!result.partyObscured, `${name} renders the Party control beneath another surface`);
  } else {
    invariant(!result.controllerMounted && result.noticeVisible && result.noticeFocused, `${name} mounted a controller or failed to focus its notice`);
  }
  return result;
}

async function readSetupIdentityEvidence(page, layout) {
  const result = await page.evaluate(() => ({
    captainName: document.querySelector('#caribbean-captain-name')?.value ?? null,
    pronouns: document.querySelector('#caribbean-pronouns')?.value ?? null,
    careerLengthControlPresent: document.querySelector('#caribbean-length') !== null,
  }));
  invariant(result.captainName === 'Mario', `Setup captain prefill is wrong: ${result.captainName}`);
  invariant(result.pronouns === 'he/him', `Setup pronoun prefill is wrong: ${result.pronouns}`);
  invariant(!result.careerLengthControlPresent, 'Setup still renders a Career length control');
  return {
    prefill: { captainName: result.captainName, pronouns: result.pronouns },
    careerLengthControlPresent: result.careerLengthControlPresent,
    accessibility: {
      minimumFontPx: layout.minimumFontPx,
      minimumTargetHeightPx: layout.minimumTargetHeightPx,
      horizontalOverflowPx: layout.horizontalOverflowPx,
    },
  };
}

const BOOTH_CONTROL_IDS = [
  'booth-switch',
  'booth-edit-profile',
  'booth-new',
  'booth-profile-name',
  'booth-profile-pronouns',
  'booth-profile-save',
];

async function readPlayerProfileLayout(page, name, viewport) {
  await page.getByTestId('booth-edit-profile').focus();
  await page.keyboard.press('Shift+Tab');
  const focusChecks = [];
  for (const testId of BOOTH_CONTROL_IDS) {
    const focus = await page.evaluate((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!(element instanceof HTMLElement)) return { focused: false, visible: false };
      const style = getComputedStyle(element);
      return {
        focused: document.activeElement === element,
        visible: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
      };
    }, testId);
    focusChecks.push({ testId, ...focus });
    if (testId !== BOOTH_CONTROL_IDS.at(-1)) await page.keyboard.press('Tab');
  }
  const result = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    };
    const booth = document.querySelector('.booth');
    if (!(booth instanceof HTMLElement)) throw new Error('Ticket Booth is not mounted');
    const boothRect = booth.getBoundingClientRect();
    const textElements = [booth, ...booth.querySelectorAll('*')].filter((element) => (
      visible(element)
      && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    ));
    const controls = [...booth.querySelectorAll('button, input')].filter(visible).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        testId: element.getAttribute('data-testid'),
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? null,
        width: rect.width,
        height: rect.height,
      };
    });
    const labels = [...booth.querySelectorAll('label')].filter(visible).map((label) => label.textContent?.trim());
    const contained = [...booth.querySelectorAll('*')].filter(visible).every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= boothRect.left && rect.right <= boothRect.right;
    });
    return {
      activePronouns: document.querySelector('.booth-hero .pstub-pronouns')?.textContent?.trim() ?? null,
      labels,
      visibleText: textElements.map((element) => ({
        text: element.textContent?.trim() ?? '',
        fontPx: Number.parseFloat(getComputedStyle(element).fontSize),
      })),
      controls,
      pageHorizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth, document.body.scrollWidth - innerWidth),
      boothHorizontalOverflowPx: Math.max(0, booth.scrollWidth - booth.clientWidth),
      pageContained: document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth,
      boothContained: contained,
    };
  });
  const measurement = { viewport, ...result, focusChecks };
  invariant(result.activePronouns === 'they/them', `Booth displayed wrong saved pronouns: ${result.activePronouns}`);
  invariant(result.labels.includes('Name') && result.labels.includes('Pronouns'), 'Booth editor labels are incomplete');
  invariant(result.visibleText.every((entry) => entry.fontPx >= 14), `Booth has visible copy below 14px: ${JSON.stringify(result.visibleText)}`);
  invariant(result.controls.length === BOOTH_CONTROL_IDS.length && result.controls.every((control) => control.width >= 44 && control.height >= 44), `Booth has undersized controls: ${JSON.stringify(result.controls)}`);
  invariant(result.pageHorizontalOverflowPx === 0 && result.boothHorizontalOverflowPx === 0 && result.pageContained && result.boothContained, `Booth profile editor overflows its page or ticket column: ${JSON.stringify(measurement)}`);
  invariant(focusChecks.every((check) => check.focused && check.visible), `Booth ${name} Tab focus is not visibly complete: ${JSON.stringify(focusChecks)}`);
  return measurement;
}

async function capture(page, screenshots, directory, filename) {
  await settle(page);
  const bytes = await page.screenshot({ animations: 'disabled' });
  screenshots.set(filename, bytes);
  fs.writeFileSync(path.join(directory, filename), bytes);
}

async function readMarketGeometry(page, phase, actionTestId) {
  return page.evaluate(({ samplePhase, actionId }) => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    const stage = document.querySelector('.caribbean-port-stage--market');
    const rows = [...document.querySelectorAll('.caribbean-market-row')];
    const strips = [...document.querySelectorAll('.caribbean-market-actions')];
    const status = document.querySelector('[data-testid="caribbean-market-status"]');
    if (!(stage instanceof HTMLElement) || !(status instanceof HTMLElement)) {
      throw new Error('Market geometry probe could not find stable containers');
    }
    return {
      phase: samplePhase,
      actionTestId: actionId,
      stage: rect(stage),
      rows: rows.map(rect),
      actionStrips: strips.map(rect),
      stageClientWidth: stage.clientWidth,
      stageScrollWidth: stage.scrollWidth,
      rowsClientWidth: document.querySelector('.caribbean-market-goods').clientWidth,
      rowsScrollWidth: document.querySelector('.caribbean-market-goods').scrollWidth,
      actionStripWidths: strips.map((strip) => ({
        testId: strip.dataset.testid,
        clientWidth: strip.clientWidth,
        scrollWidth: strip.scrollWidth,
      })),
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
      focusedTestId: document.activeElement?.dataset?.testid ?? null,
      status: status.textContent?.trim() ?? '',
      ariaBusy: document.querySelector('[data-testid="caribbean-market"]')?.getAttribute('aria-busy') === 'true',
    };
  }, { samplePhase: phase, actionId: actionTestId });
}

async function openProbeMarket(page, baseUrl) {
  await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
  await page.evaluate(({ currentKey, previousKey, quarantinePrefix }) => {
    for (const key of Object.keys(localStorage)) {
      if (key === currentKey || key === previousKey || key.startsWith(quarantinePrefix)) localStorage.removeItem(key);
    }
  }, { currentKey: CURRENT_SAVE_KEY, previousKey: PREVIOUS_SAVE_KEY, quarantinePrefix: QUARANTINE_PREFIX });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start career' }).click();
  await page.getByTestId('caribbean-career-ready').waitFor();
  await page.getByRole('button', { name: 'Market' }).click();
  await page.getByRole('heading', { name: 'Market', level: 2 }).waitFor();
}

async function runMarketProbe(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce',
  });
  await installBrowserBoundary(context);
  const page = await context.newPage();
  const samples = [];
  const actions = ['buy-1', 'sell-1', 'buy-5', 'sell-5', 'buy-max', 'sell-all'];
  const goods = ['provisions', 'tools', 'luxuries', 'sugar-molasses', 'tobacco-dyewood', 'powder-arms'];
  try {
    for (const cargoId of goods) {
      await openProbeMarket(page, baseUrl);
      for (const action of actions) {
        const actionTestId = `market-${cargoId}-${action}`;
        const control = page.getByTestId(actionTestId);
        await control.focus();
        await page.waitForFunction(() => document.querySelector('[data-testid="caribbean-market-status"]')?.textContent === '');
        samples.push(await readMarketGeometry(page, 'before', actionTestId));
        await page.evaluate(() => { window.__CARIBBEAN_PORT_CHECK__.holdNextWriter = true; });
        await control.click();
        await page.getByTestId('caribbean-market-status').getByText('Saving trade.').waitFor();
        await page.waitForFunction(() => window.__CARIBBEAN_PORT_CHECK__.writerHeld === true);
        samples.push(await readMarketGeometry(page, 'pending', actionTestId));
        await page.evaluate(() => window.__CARIBBEAN_PORT_CHECK__.releaseWriter());
        try {
          await page.getByTestId('caribbean-market-status').getByText('Cargo ledger updated.').waitFor({ timeout: 5_000 });
        } catch (error) {
          const diagnostic = await page.evaluate(() => ({
            status: document.querySelector('[data-testid="caribbean-market-status"]')?.textContent?.trim(),
            busy: document.querySelector('[data-testid="caribbean-market"]')?.getAttribute('aria-busy'),
            focusedTestId: document.activeElement?.dataset?.testid ?? null,
            control: {
              holdNextWriter: window.__CARIBBEAN_PORT_CHECK__.holdNextWriter,
              writerHeld: window.__CARIBBEAN_PORT_CHECK__.writerHeld,
            },
            currentSave: localStorage.getItem('caribbean:campaign:current'),
          }));
          throw new Error(`Market probe did not resolve ${actionTestId}: ${JSON.stringify(diagnostic)}; ${error.message}`);
        }
        samples.push(await readMarketGeometry(page, 'resolved', actionTestId));
      }
    }
    const verdict = validateMarketStability(samples);
    const failure = marketStabilityFailure(verdict);
    invariant(failure === null, `Market stability evidence failed: ${failure}`);
    return samples;
  } finally {
    await context.close();
  }
}

async function readActiveEnvelope(page, key = CURRENT_SAVE_KEY) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function runJourney(browser, baseUrl, runDirectory) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  await installBrowserBoundary(context);
  const page = await context.newPage();
  const failures = { console: [], page: [], requests: [], external: [], requestedPaths: [] };
  recordFailures(page, baseUrl, failures);
  const screenshots = new Map();
  const layouts = {};
  let metrics;
  try {
    console.log('Checking setup identity and Bridgetown journey…');
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
    invariant(await page.getByRole('heading', { name: 'Sign a captain’s commission' }).isVisible(), 'Production route did not reach setup');
    layouts.setupDesktop = await readLayout(page, 'setupDesktop', VIEWPORTS.setupDesktop);
    await capture(page, screenshots, runDirectory, 'setup-desktop.png');
    const setupIdentity = await readSetupIdentityEvidence(page, layouts.setupDesktop);

    await page.getByLabel('Player pronouns').fill('they/them');
    await page.getByRole('button', { name: 'Start career' }).click();
    await page.getByTestId('caribbean-career-ready').waitFor();
    const setupProfile = await page.evaluate(() => {
      const raw = localStorage.getItem('arcade.users.v1');
      return raw === null ? null : JSON.parse(raw).users.find((user) => user.id === 'port-check-player')?.profile;
    });
    const setupEnvelope = verifyEnvelope(await readActiveEnvelope(page), 'setup identity snapshot');
    invariant(setupProfile?.pronouns === 'they/them', 'Setup did not persist normalized pronouns to the active profile');
    invariant(
      setupEnvelope.payload.state.captain.name === 'Mario'
      && setupEnvelope.payload.state.captain.pronouns === 'they/them',
      'Campaign did not capture the exact normalized active-profile pronouns',
    );
    setupIdentity.sharedPronounSnapshot = {
      profile: setupProfile.pronouns,
      campaign: setupEnvelope.payload.state.captain.pronouns,
    };
    console.log('Checking port activities and journal…');
    const menuLabels = await page.locator('[aria-label="Bridgetown activities"] button').allTextContents();
    invariant(canonicalJson(menuLabels.map((label) => label.trim())) === canonicalJson(PORT_ORDER), `Wrong port order: ${JSON.stringify(menuLabels)}`);
    invariant(await page.getByRole('button', { name: 'Set Sail' }).isDisabled(), 'Set Sail is not visibly unavailable');
    invariant(await page.getByText('Sea routes open in the next package.').isVisible(), 'Set Sail reason is not visible');
    layouts.portDesktop = await readLayout(page, 'portDesktop', VIEWPORTS.portDesktop);
    await capture(page, screenshots, runDirectory, 'port-desktop.png');

    await page.getByRole('button', { name: 'Market' }).click();
    await page.getByRole('heading', { name: 'Market', level: 2 }).waitFor();
    await page.getByRole('button', { name: 'Buy 5 Provisions' }).click();
    await page.getByRole('region', { name: 'Cargo summary' }).getByText('3.9 months').waitFor();
    const marketLayout = await readLayout(page, 'marketDesktop', VIEWPORTS.portDesktop);
    await capture(page, screenshots, runDirectory, 'market-desktop.png');

    await page.getByRole('button', { name: 'Back to harbour' }).click();
    await page.getByRole('button', { name: 'Tavern' }).click();
    await page.getByRole('heading', { name: 'Tavern', level: 2 }).waitFor();
    const tavernLayout = await readLayout(page, 'tavernDesktop', VIEWPORTS.portDesktop);
    await capture(page, screenshots, runDirectory, 'tavern-desktop.png');
    await page.getByRole('button', { name: 'Mark on chart' }).click();
    await page.getByText("Marked in the Captain's Log").waitFor();
    await page.getByRole('button', { name: 'Back to harbour' }).click();
    await page.getByRole('button', { name: "Captain's Log" }).click();
    await page.getByText('Sail east of Bridgetown and identify the Red Jackdaw.').waitFor();
    const logLayout = await readLayout(page, 'captainsLogDesktop', VIEWPORTS.portDesktop);
    await capture(page, screenshots, runDirectory, 'captains-log-desktop.png');

    const journeyRaw = await readActiveEnvelope(page);
    const journeyEnvelope = verifyEnvelope(journeyRaw, 'resolved journey');
    invariant(journeyEnvelope.payload.events.length === 2, `Expected 2 semantic events, found ${journeyEnvelope.payload.events.length}`);
    invariant(
      canonicalJson(journeyEnvelope.payload.events.map((event) => [event.id, event.type]))
        === canonicalJson([[1, 'market-traded'], [2, 'lead-accepted']]),
      'Resolved journey has missing or duplicate semantic events',
    );

    await page.getByRole('button', { name: 'Back to harbour' }).click();
    await page.setViewportSize({ width: 960, height: 600 });
    await page.getByTestId('caribbean-career-ready').waitFor();
    layouts.minimumSupported = await readLayout(page, 'minimumSupported', VIEWPORTS.minimumSupported);
    await capture(page, screenshots, runDirectory, 'port-minimum-supported.png');

    await page.setViewportSize({ width: 959, height: 600 });
    await page.getByTestId('caribbean-minimum-screen').waitFor();
    layouts.minimumWidth = await readLayout(page, 'minimumWidth', VIEWPORTS.minimumWidth);
    await capture(page, screenshots, runDirectory, 'minimum-screen-width.png');

    await page.setViewportSize({ width: 960, height: 599 });
    await page.getByTestId('caribbean-minimum-screen').waitFor();
    layouts.minimumHeight = await readLayout(page, 'minimumHeight', VIEWPORTS.minimumHeight);
    await capture(page, screenshots, runDirectory, 'minimum-screen-height.png');

    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.getByTestId('caribbean-minimum-screen').waitFor();
    layouts.largePortrait = await readLayout(page, 'largePortrait', VIEWPORTS.largePortrait);
    await capture(page, screenshots, runDirectory, 'minimum-screen-large-portrait.png');

    console.log('Checking recovery and shared profile evidence…');

    await page.setViewportSize({ width: 1440, height: 900 });
    const knownPreviousRaw = await readActiveEnvelope(page, PREVIOUS_SAVE_KEY);
    const knownPrevious = verifyEnvelope(knownPreviousRaw, 'canonical previous');
    const corruptRaw = '{not-json:port-check-exact-corrupt-current';
    await page.evaluate(({ currentKey, raw }) => localStorage.setItem(currentKey, raw), {
      currentKey: CURRENT_SAVE_KEY,
      raw: corruptRaw,
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Campaign recovery required' }).waitFor();
    const recoveryLayout = await readLayout(page, 'recoveryDesktop', VIEWPORTS.setupDesktop);
    await capture(page, screenshots, runDirectory, 'recovery-desktop.png');

    const degradedRevision = await page.evaluate(({ currentKey, previousKey }) => ({
      currentRaw: localStorage.getItem(currentKey),
      previousRaw: localStorage.getItem(previousKey),
    }), { currentKey: CURRENT_SAVE_KEY, previousKey: PREVIOUS_SAVE_KEY });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download recovery file' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    invariant(downloadPath !== null, 'Recovery export download has no path');
    const exportedRaw = fs.readFileSync(downloadPath, 'utf8');
    const expectedExport = canonicalJson({
      version: 1,
      game: 'caribbean',
      revision: degradedRevision,
      unreadableSlots: [{ slot: 'current', raw: corruptRaw, code: 'malformed-json' }],
    });
    invariant(exportedRaw === expectedExport, 'Recovery export did not preserve the exact corrupt bytes/revision');

    await page.getByRole('button', { name: 'Recover known-good campaign' }).click();
    await page.getByRole('heading', { name: 'Mario’s commission' }).waitFor();
    const recoveredStorage = await page.evaluate(({ prefix, currentKey, previousKey, corrupt }) => {
      const quarantineKeys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
      return {
        quarantineKeys,
        quarantineRaw: quarantineKeys.length === 1 ? localStorage.getItem(quarantineKeys[0]) : null,
        currentRaw: localStorage.getItem(currentKey),
        previousRaw: localStorage.getItem(previousKey),
        corruptStillActive: localStorage.getItem(currentKey) === corrupt || localStorage.getItem(previousKey) === corrupt,
      };
    }, { prefix: QUARANTINE_PREFIX, currentKey: CURRENT_SAVE_KEY, previousKey: PREVIOUS_SAVE_KEY, corrupt: corruptRaw });
    invariant(recoveredStorage.quarantineKeys.length === 1, `Expected one quarantine, found ${recoveredStorage.quarantineKeys.length}`);
    invariant(recoveredStorage.quarantineRaw?.includes(corruptRaw), 'Quarantine does not contain exact corrupt source');
    invariant(!recoveredStorage.corruptStillActive, 'Corrupt bytes remain in an active slot');
    const recoveredEnvelope = verifyEnvelope(recoveredStorage.currentRaw, 'recovered current');
    if (recoveredStorage.previousRaw !== null) verifyEnvelope(recoveredStorage.previousRaw, 'recovered previous');
    invariant(recoveredEnvelope.checksum === knownPrevious.checksum, 'Recovered checksum differs from canonical previous');
    invariant(canonicalJson(recoveredEnvelope.payload.state) === canonicalJson(knownPrevious.payload.state), 'Recovered state differs from canonical previous');

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Resume career' }).click();
    await page.getByTestId('caribbean-career-ready').waitFor();
    invariant(await page.getByRole('region', { name: 'Voyage status' }).getByText('3.9 months').isVisible(), 'Reloaded recovery did not resume canonical previous state');
    const resumedEnvelope = verifyEnvelope(await readActiveEnvelope(page), 'reloaded recovery');
    invariant(resumedEnvelope.checksum === knownPrevious.checksum, 'Reloaded recovery checksum changed');
    invariant(canonicalJson(resumedEnvelope.payload.state) === canonicalJson(knownPrevious.payload.state), 'Reloaded recovery state changed');

    await page.goto(`${baseUrl}/#/`, { waitUntil: 'networkidle' });
    await page.getByTestId('booth-edit-profile').click();
    await page.getByTestId('booth-profile-name').fill('Port Profile');
    await page.getByTestId('booth-profile-pronouns').fill('they/them');
    await page.getByTestId('booth-profile-save').click();
    await page.getByText('they/them').waitFor();
    const persistedProfile = await page.evaluate(() => {
      const raw = localStorage.getItem('arcade.users.v1');
      return raw === null ? null : JSON.parse(raw).users.find((user) => user.id === 'port-check-player')?.profile;
    });
    invariant(
      persistedProfile?.name === 'Port Profile' && persistedProfile?.pronouns === 'they/them',
      'Booth profile did not persist name and pronouns together',
    );
    await page.getByTestId('booth-edit-profile').click();
    const playerProfileDesktop = await readPlayerProfileLayout(page, 'desktop', { width: 1440, height: 900 });
    await capture(page, screenshots, runDirectory, 'player-profile-desktop.png');
    await page.setViewportSize({ width: 960, height: 600 });
    const playerProfileNarrow = await readPlayerProfileLayout(page, 'narrow', { width: 960, height: 600 });
    await page.setViewportSize({ width: 1440, height: 900 });

    const trace = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), TRACE_KEY);
    invariant(trace.seedsConsumed[0] === 1702, `Production consumed wrong seed fixtures: ${JSON.stringify(trace.seedsConsumed)}`);
    invariant(trace.uuidsConsumed.length === 1 && trace.uuidsConsumed[0] === UUID_FIXTURES[0], `Production consumed wrong UUID fixtures: ${JSON.stringify(trace.uuidsConsumed)}`);
    invariant(trace.locks.length >= 5, `Expected real Web Lock use across the journey, found ${trace.locks.length}`);
    invariant(trace.locks.every((lock) => lock.name === WRITER_LOCK && lock.mode === 'exclusive'), `Wrong Web Lock boundary: ${JSON.stringify(trace.locks)}`);

    const unique = (values) => [...new Set(values)].sort();
    failures.console = unique(failures.console);
    failures.page = unique(failures.page);
    failures.requests = unique(failures.requests);
    failures.external = unique(failures.external);
    failures.requestedPaths = unique(failures.requestedPaths);
    invariant(failures.console.length === 0, `Console errors: ${failures.console.join(' | ')}`);
    invariant(failures.page.length === 0, `Page errors: ${failures.page.join(' | ')}`);
    invariant(failures.requests.length === 0, `Failed requests: ${failures.requests.join(' | ')}`);
    invariant(failures.external.length === 0, `External requests: ${failures.external.join(' | ')}`);
    invariant(!failures.requestedPaths.some((requestPath) => requestPath.endsWith('.glb')), 'Production route requested a GLB');
    invariant(!failures.requestedPaths.some((requestPath) => requestPath.includes('preview-caribbean')), 'Production route requested preview-caribbean');

    const marketSamples = await runMarketProbe(browser, baseUrl);
    const supportedLayouts = [
      layouts.setupDesktop, layouts.portDesktop, marketLayout, tavernLayout, logLayout,
      layouts.minimumSupported, recoveryLayout,
    ];
    metrics = {
      browser: { name: 'Chromium', version: browser.version() },
      route: ROUTE,
      build: 'normal production (BUILD_HARNESS unset)',
      viewports: layouts,
      fixtures: {
        nowProvided: NOW_FIXTURES,
        seedsProvided: SEED_FIXTURES,
        uuidsProvided: UUID_FIXTURES,
        nowConsumed: trace.nowConsumed,
        seedsConsumed: trace.seedsConsumed,
        uuidsConsumed: trace.uuidsConsumed,
      },
      webLocks: { realNavigatorLocks: true, calls: trace.locks },
      journey: {
        finalEventCount: journeyEnvelope.payload.events.length,
        eventTypes: journeyEnvelope.payload.events.map((event) => event.type),
        saveChecksum: journeyEnvelope.checksum,
        replayVerified: true,
      },
      accessibility: {
        minimumMeasuredFontPx: Math.min(...supportedLayouts.map((layout) => layout.minimumFontPx)),
        minimumMeasuredTargetWidthPx: Math.min(...supportedLayouts.map((layout) => layout.minimumTargetWidthPx)),
        minimumMeasuredTargetHeightPx: Math.min(...supportedLayouts.map((layout) => layout.minimumTargetHeightPx)),
        horizontalOverflowPx: Math.max(...Object.values(layouts).map((layout) => layout.horizontalOverflowPx)),
        boothProfile: { desktop: playerProfileDesktop, narrow: playerProfileNarrow },
      },
      requests: {
        externalCount: failures.external.length,
        failedCount: failures.requests.length,
        requestedPaths: failures.requestedPaths,
      },
      failures: {
        console: failures.console,
        page: failures.page,
        requests: failures.requests,
        external: failures.external,
      },
      isolation: {
        previewHtmlAbsent: true,
        caribbeanGlbAbsent: true,
        glbRequested: false,
        previewResourceRequested: false,
      },
      recovery: {
        quarantineKey: recoveredStorage.quarantineKeys[0],
        quarantineVerified: true,
        exportedCorruptRawVerified: true,
        recoveredChecksum: recoveredEnvelope.checksum,
        recoveryReloaded: true,
      },
      screenshots: SCREENSHOTS,
      determinism: { cleanRuns: 2, metricsByteIdentical: true, screenshotsByteIdentical: true },
      schemaVersion: 2,
      packagePhase: 'market',
      profile: {
        status: 'setup-verified',
        defaultPronouns: 'he/him',
        boothProfilePersisted: true,
        setup: setupIdentity,
      },
      art: { status: 'not-yet-observed' },
      market: { status: 'verified', samples: marketSamples },
    };
    const verdict = evaluatePortIdentityEvidence(metrics);
    invariant(verdict.ok, `Caribbean port identity evidence failed: ${verdict.issues.join(' | ')}`);
    return { metrics, screenshots };
  } finally {
    await context.close();
  }
}

function assertRequestedGraphIsolation(metrics) {
  const requested = metrics.requests.requestedPaths;
  const requestedJs = requested.filter((requestPath) => requestPath.endsWith('.js'));
  const requestedCss = requested.filter((requestPath) => requestPath.endsWith('.css'));
  const js = requestedJs.map((requestPath) => fs.readFileSync(path.join(DIST, requestPath.replace(/^\//, '')), 'utf8')).join('\n');
  const css = requestedCss.map((requestPath) => fs.readFileSync(path.join(DIST, requestPath.replace(/^\//, '')), 'utf8')).join('\n');
  for (const marker of ['CaribbeanLab', 'NavalBattlePage', 'NavalScene']) {
    invariant(!js.includes(marker), `Production /caribbean-loaded graph contains ${marker}`);
  }
  invariant(!css.includes('.caribbean-lab'), 'Production CSS contains .caribbean-lab');
  invariant(!css.includes('.naval-battle-page'), 'Production CSS contains battle.css marker .naval-battle-page');
  metrics.isolation.moduleMarkersAbsent = true;
  metrics.isolation.battleCssAbsent = true;
}

function compareRuns(first, second) {
  const firstMetrics = Buffer.from(`${JSON.stringify(first.metrics, null, 2)}\n`);
  const secondMetrics = Buffer.from(`${JSON.stringify(second.metrics, null, 2)}\n`);
  invariant(firstMetrics.equals(secondMetrics), 'Two clean browser runs produced different metrics.json bytes');
  for (const filename of SCREENSHOTS) {
    const firstBytes = first.screenshots.get(filename);
    const secondBytes = second.screenshots.get(filename);
    invariant(firstBytes?.equals(secondBytes), `Two clean browser runs produced different ${filename} bytes`);
  }
  return firstMetrics;
}

export async function runPortCheck() {
  buildNormalProduction();
  assertNormalBuildIsolation();
  const { server, baseUrl } = await startStaticServer();
  let browser;
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-run-a-'));
  const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-run-b-'));
  try {
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
    console.log('Running deterministic browser journey A…');
    const first = await runJourney(browser, baseUrl, firstDirectory);
    assertRequestedGraphIsolation(first.metrics);
    console.log('Running deterministic browser journey B…');
    const second = await runJourney(browser, baseUrl, secondDirectory);
    assertRequestedGraphIsolation(second.metrics);
    const metricsBytes = compareRuns(first, second);
    for (const filename of SCREENSHOTS) saveIfChanged(filename, first.screenshots.get(filename));
    saveIfChanged('metrics.json', metricsBytes);
    console.log(`Caribbean port evidence passed: ${SCREENSHOTS.length} deterministic screenshots, 2 events, recovery reloaded.`);
    return first.metrics;
  } finally {
    await browser?.close();
    await stopStaticServer(server);
    fs.rmSync(firstDirectory, { recursive: true, force: true });
    fs.rmSync(secondDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runPortCheck().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
