#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import {
  ART_ACTIVITY_CONTRAST_SPECS,
  ART_CONTRAST_SELECTORS,
  ART_VIEWPORT_SPECS,
  EXPECTED_MARKET_ACTION_IDS,
  evaluatePortIdentityEvidence,
  marketStabilityFailure,
  validateMarketStability,
} from './lib/caribbean-port-identity-evidence.mjs';

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
  ...ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}.png`),
  ...ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}-fallback.png`),
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
  '.webp': 'image/webp',
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

function recordFailures(page, baseUrl, failures, allowedFailedUrl = null) {
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
    if (request.url() === allowedFailedUrl) {
      failures.allowlistedRequests = (failures.allowlistedRequests ?? 0) + 1;
      return;
    }
    failures.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) failures.requests.push(`${response.status()} ${response.url()}`);
  });
}

function readEmittedArt() {
  const assetsDirectory = path.join(DIST, 'assets');
  const names = fs.readdirSync(assetsDirectory).filter((name) => /^bridgetown-1675-[^/]+\.webp$/.test(name));
  invariant(names.length === 1, `Expected one emitted Bridgetown WebP, found ${names.join(', ')}`);
  const name = names[0];
  const url = `/assets/${name}`;
  const precacheSources = fs.readdirSync(DIST, { recursive: true })
    .filter((entry) => typeof entry === 'string' && /(?:^|\/)(?:sw|workbox-[^/]+)\.js$/.test(entry))
    .map((entry) => fs.readFileSync(path.join(DIST, entry), 'utf8'));
  return {
    url,
    contentType: 'image/webp',
    precached: precacheSources.some((source) => source.includes(`assets/${name}`)),
  };
}

async function verifyEmittedArtResponse(baseUrl, emitted) {
  const response = await fetch(`${baseUrl}${emitted.url}`, { method: 'HEAD', cache: 'no-store' });
  invariant(response.status === 200, `Emitted art returned ${response.status}`);
  invariant(response.headers.get('content-type') === 'image/webp', `Emitted art used ${response.headers.get('content-type')}`);
  invariant(emitted.precached, 'Emitted art is absent from the production PWA precache');
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
  const backdrop = page.getByTestId('caribbean-port-backdrop');
  if (await backdrop.count() === 1 && !await backdrop.evaluate((element) => element.classList.contains('caribbean-port-backdrop--fallback'))) {
    const art = page.getByTestId('caribbean-port-art');
    await art.evaluate(async (element) => {
      if (!(element instanceof HTMLImageElement)) throw new Error('Port art is not an image');
      if (!element.complete) {
        await new Promise((resolve, reject) => {
          element.addEventListener('load', resolve, { once: true });
          element.addEventListener('error', reject, { once: true });
        });
      }
      if (element.naturalWidth === 0) throw new Error('Port art completed without decoded pixels');
      await element.decode();
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="caribbean-port-backdrop"]')?.classList.contains('caribbean-port-backdrop--loaded'));
  }
  await settle(page);
  const bytes = await page.screenshot({ animations: 'disabled' });
  screenshots.set(filename, bytes);
  fs.writeFileSync(path.join(directory, filename), bytes);
}

async function readArtViewport(page, spec, subjectRoi) {
  return page.evaluate(({ viewportSpec, roi, contrastSelectors, marketActionIds }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const parseColor = (value) => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (value.startsWith('color(srgb')) {
        return { r: (numbers[0] ?? 0) * 255, g: (numbers[1] ?? 0) * 255, b: (numbers[2] ?? 0) * 255, a: numbers[3] ?? 1 };
      }
      return { r: numbers[0] ?? 0, g: numbers[1] ?? 0, b: numbers[2] ?? 0, a: numbers[3] ?? 1 };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const art = document.querySelector('[data-testid="caribbean-port-art"]');
    const container = document.querySelector('[data-testid="caribbean-port-backdrop"]');
    const shell = document.querySelector('[data-testid="caribbean-career-ready"]');
    if (!(art instanceof HTMLImageElement) || !(container instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
      throw new Error('Harbour art probe could not find its production elements');
    }
    const containerRect = container.getBoundingClientRect();
    const shellStyle = getComputedStyle(shell);
    const focalX = Number.parseFloat(shellStyle.getPropertyValue('--caribbean-port-art-focal-x'));
    const focalY = Number.parseFloat(shellStyle.getPropertyValue('--caribbean-port-art-focal-y'));
    const sourceWidth = art.naturalWidth;
    const sourceHeight = art.naturalHeight;
    const scale = Math.max(containerRect.width / sourceWidth, containerRect.height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const offsetX = (containerRect.width - renderedWidth) * focalX / 100;
    const offsetY = (containerRect.height - renderedHeight) * focalY / 100;
    const subject = {
      left: offsetX + roi[0] * renderedWidth,
      top: offsetY + roi[1] * renderedHeight,
      right: offsetX + (roi[0] + roi[2]) * renderedWidth,
      bottom: offsetY + (roi[1] + roi[3]) * renderedHeight,
    };
    const intersectionWidth = Math.max(0, Math.min(containerRect.width, subject.right) - Math.max(0, subject.left));
    const intersectionHeight = Math.max(0, Math.min(containerRect.height, subject.bottom) - Math.max(0, subject.top));
    const subjectArea = (subject.right - subject.left) * (subject.bottom - subject.top);

    const contrasts = contrastSelectors.map((selector) => {
      const elements = [...document.querySelectorAll(selector)].filter(visible);
      if (elements.length === 0) throw new Error(`Contrast selector has no visible elements: ${selector}`);
      const samples = elements.map((element) => {
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        const background = parseColor(style.backgroundColor);
        return { ratio: contrast(foreground, background), backgroundAlpha: background.a };
      });
      return {
        selector,
        minimumRatio: Math.min(...samples.map((sample) => sample.ratio)),
        backgroundAlpha: Math.min(...samples.map((sample) => sample.backgroundAlpha)),
      };
    });

    const geometry = (market) => {
      const entries = [
        ['party-pill', document.querySelector('[data-testid="party-pill"]')],
        ['port-position', document.querySelector('.caribbean-port-position')],
        ...[...document.querySelectorAll('.caribbean-port-status-rail dl > div')].map((element, index) => [`port-fact-${index}`, element]),
        ['port-stage-title', document.querySelector('.caribbean-port-stage h1')],
        ['port-bearing', document.querySelector('.caribbean-port-bearing')],
        ['port-activity-heading', document.querySelector('.caribbean-port-activity h2')],
        ...['governor', 'tavern', 'market', 'shipyard', 'shares', 'log', 'set-sail'].map((id) => [
          `port-action-${id}`, document.querySelector(`[data-testid="port-action-${id}"]`),
        ]),
        ...(market
          ? [
            ['port-close-activity', document.querySelector('[data-testid="port-close-activity"]')],
            ...marketActionIds.map((id) => [id, document.querySelector(`[data-testid="${id}"]`)]),
          ]
          : [['port-arrival', document.querySelector('.caribbean-port-arrival')]]),
      ];
      const leaves = entries.map(([id, element]) => {
        if (!(element instanceof HTMLElement) || !visible(element)) throw new Error(`Geometry leaf is missing: ${id}`);
        const value = rect(element);
        return {
          id,
          contained: value.left >= 0 && value.top >= 0 && value.right <= innerWidth && value.bottom <= innerHeight,
          horizontalOverflowPx: Math.max(0, element.scrollWidth - element.clientWidth),
          verticalOverflowPx: Math.max(0, element.scrollHeight - element.clientHeight),
        };
      });
      const interactive = entries.filter(([id]) => id === 'party-pill'
        || id === 'port-close-activity'
        || id.startsWith('port-action-')
        || id.startsWith('market-'));
      const overlapPairs = [];
      for (let leftIndex = 0; leftIndex < interactive.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < interactive.length; rightIndex += 1) {
          const [leftId, leftElement] = interactive[leftIndex];
          const [rightId, rightElement] = interactive[rightIndex];
          if (leftElement.contains(rightElement) || rightElement.contains(leftElement)) continue;
          const leftRect = rect(leftElement);
          const rightRect = rect(rightElement);
          if (Math.min(leftRect.right, rightRect.right) > Math.max(leftRect.left, rightRect.left)
            && Math.min(leftRect.bottom, rightRect.bottom) > Math.max(leftRect.top, rightRect.top)) {
            overlapPairs.push([leftId, rightId]);
          }
        }
      }
      return { leaves, overlapPairs };
    };

    return {
      name: viewportSpec.name,
      viewport: { width: innerWidth, height: innerHeight },
      focal: {
        xPercent: focalX,
        yPercent: focalY,
        roiVisibleRatio: subjectArea === 0 ? 0 : intersectionWidth * intersectionHeight / subjectArea,
      },
      naturalSize: { width: sourceWidth, height: sourceHeight },
      contrasts,
      menuGeometry: geometry(false),
    };
  }, { viewportSpec: spec, roi: subjectRoi, contrastSelectors: ART_CONTRAST_SELECTORS, marketActionIds: EXPECTED_MARKET_ACTION_IDS });
}

async function readActivityContrast(page, activitySpec) {
  return page.evaluate(({ selector, text }) => {
    const parseColor = (value) => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (value.startsWith('color(srgb')) {
        return { r: (numbers[0] ?? 0) * 255, g: (numbers[1] ?? 0) * 255, b: (numbers[2] ?? 0) * 255, a: numbers[3] ?? 1 };
      }
      return { r: numbers[0] ?? 0, g: numbers[1] ?? 0, b: numbers[2] ?? 0, a: numbers[3] ?? 1 };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`Activity contrast selector is not visible: ${selector}`);
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) {
      throw new Error(`Activity contrast selector is not visible: ${selector}`);
    }
    const actualText = element.innerText.replace(/\s+/g, ' ').trim();
    if (actualText !== text) throw new Error(`Activity contrast selector has wrong state: ${selector}=${actualText}`);
    const foreground = parseColor(style.color);
    const background = parseColor(style.backgroundColor);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return {
      selector,
      text: actualText,
      minimumRatio: (lighter + 0.05) / (darker + 0.05),
      backgroundAlpha: background.a,
    };
  }, activitySpec);
}

async function setupArtPage(page, baseUrl) {
  await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start career' }).click();
  await page.getByTestId('caribbean-career-ready').waitFor();
}

async function captureArtEvidence(browser, baseUrl, runDirectory, screenshots, emitted, subjectRoi) {
  const normalContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce',
  });
  await installBrowserBoundary(normalContext);
  const normalPage = await normalContext.newPage();
  const normalFailures = { console: [], page: [], requests: [], external: [], requestedPaths: [] };
  recordFailures(normalPage, baseUrl, normalFailures);
  const viewports = [];
  try {
    await setupArtPage(normalPage, baseUrl);
    await normalPage.getByTestId('caribbean-port-backdrop').waitFor();
    await normalPage.waitForFunction(() => document.querySelector('[data-testid="caribbean-port-backdrop"]')?.classList.contains('caribbean-port-backdrop--loaded'));
    await normalPage.evaluate(async () => { await document.querySelector('[data-testid="caribbean-port-art"]').decode(); });
    for (const spec of ART_VIEWPORT_SPECS) {
      await normalPage.setViewportSize({ width: spec.width, height: spec.height });
      await normalPage.getByRole('heading', { name: 'Choose your next port action', level: 2 }).waitFor();
      const evidence = await readArtViewport(normalPage, spec, subjectRoi);
      invariant(evidence.naturalSize.width === 1920 && evidence.naturalSize.height === 1080, 'Browser decoded the wrong art dimensions');
      await capture(normalPage, screenshots, runDirectory, `port-art-${spec.name}.png`);
      await normalPage.getByRole('button', { name: 'Market' }).click();
      await normalPage.getByRole('heading', { name: 'Market', level: 2 }).waitFor();
      evidence.marketGeometry = await normalPage.evaluate(async ({ marketActionIds }) => {
        const visible = (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
        };
        const baseEntries = [
          ['party-pill', document.querySelector('[data-testid="party-pill"]')],
          ['port-position', document.querySelector('.caribbean-port-position')],
          ...[...document.querySelectorAll('.caribbean-port-status-rail dl > div')].map((element, index) => [`port-fact-${index}`, element]),
          ['port-stage-title', document.querySelector('.caribbean-port-stage h1')],
          ['port-bearing', document.querySelector('.caribbean-port-bearing')],
          ['port-activity-heading', document.querySelector('.caribbean-port-activity h2')],
          ...['governor', 'tavern', 'market', 'shipyard', 'shares', 'log', 'set-sail'].map((id) => [`port-action-${id}`, document.querySelector(`[data-testid="port-action-${id}"]`)]),
          ['port-close-activity', document.querySelector('[data-testid="port-close-activity"]')],
        ];
        const measure = ([id, element]) => {
          if (!(element instanceof HTMLElement) || !visible(element)) throw new Error(`Market geometry leaf is missing: ${id}`);
          const box = element.getBoundingClientRect();
          return {
            id,
            contained: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
            horizontalOverflowPx: Math.max(0, element.scrollWidth - element.clientWidth),
            verticalOverflowPx: Math.max(0, element.scrollHeight - element.clientHeight),
          };
        };
        const stage = document.querySelector('.caribbean-port-stage--market');
        if (!(stage instanceof HTMLElement)) throw new Error('Market geometry stage is missing');
        stage.scrollTop = 0;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const leaves = baseEntries.map(measure);
        const overlapKeys = new Set();
        const interactiveSelector = '[data-testid="party-pill"], [data-testid="port-close-activity"], [data-testid^="port-action-"], [data-testid^="market-"]';
        for (const actionId of marketActionIds) {
          const action = document.querySelector(`[data-testid="${actionId}"]`);
          if (!(action instanceof HTMLElement)) throw new Error(`Market geometry leaf is missing: ${actionId}`);
          action.scrollIntoView({ block: 'center', inline: 'nearest' });
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          leaves.push(measure([actionId, action]));
          const actionRect = action.getBoundingClientRect();
          for (const candidate of [...document.querySelectorAll(interactiveSelector)].filter(visible)) {
            if (candidate === action || action.contains(candidate) || candidate.contains(action)) continue;
            const candidateRect = candidate.getBoundingClientRect();
            if (Math.min(actionRect.right, candidateRect.right) > Math.max(actionRect.left, candidateRect.left)
              && Math.min(actionRect.bottom, candidateRect.bottom) > Math.max(actionRect.top, candidateRect.top)) {
              const pair = [actionId, candidate.getAttribute('data-testid')].sort();
              overlapKeys.add(JSON.stringify(pair));
            }
          }
        }
        const fixedInteractive = baseEntries.filter(([id]) => id === 'party-pill'
          || id === 'port-close-activity' || id.startsWith('port-action-'));
        for (let leftIndex = 0; leftIndex < fixedInteractive.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < fixedInteractive.length; rightIndex += 1) {
            const [leftId, leftElement] = fixedInteractive[leftIndex];
            const [rightId, rightElement] = fixedInteractive[rightIndex];
            const left = leftElement.getBoundingClientRect();
            const right = rightElement.getBoundingClientRect();
            if (Math.min(left.right, right.right) > Math.max(left.left, right.left)
              && Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top)) {
              overlapKeys.add(JSON.stringify([leftId, rightId].sort()));
            }
          }
        }
        return { leaves, overlapPairs: [...overlapKeys].map(JSON.parse).sort() };
      }, { marketActionIds: EXPECTED_MARKET_ACTION_IDS });
      const activityContrasts = [];
      await normalPage.getByTestId('market-provisions-buy-1').click();
      await normalPage.getByTestId('caribbean-market-status').getByText('Cargo ledger updated.').waitFor();
      activityContrasts.push(await readActivityContrast(normalPage, ART_ACTIVITY_CONTRAST_SPECS[0]));
      await normalPage.getByRole('button', { name: 'Back to harbour' }).click();
      await normalPage.getByRole('button', { name: 'Tavern' }).click();
      await normalPage.getByRole('heading', { name: 'Tavern', level: 2 }).waitFor();
      activityContrasts.push(await readActivityContrast(normalPage, ART_ACTIVITY_CONTRAST_SPECS[1]));
      const markOnChart = normalPage.getByRole('button', { name: 'Mark on chart' });
      if (await markOnChart.count() === 1) {
        await markOnChart.click();
        await normalPage.getByText("Marked in the Captain's Log").waitFor();
      }
      await normalPage.getByRole('button', { name: 'Back to harbour' }).click();
      await normalPage.getByRole('button', { name: "Captain's Log" }).click();
      await normalPage.getByText('Sail east of Bridgetown and identify the Red Jackdaw.').waitFor();
      activityContrasts.push(await readActivityContrast(normalPage, ART_ACTIVITY_CONTRAST_SPECS[2]));
      evidence.activityContrasts = activityContrasts;
      viewports.push(evidence);
      await normalPage.getByRole('button', { name: 'Back to harbour' }).click();
    }
    invariant(normalFailures.console.length === 0 && normalFailures.page.length === 0
      && normalFailures.requests.length === 0 && normalFailures.external.length === 0,
    `Normal art capture failures: ${JSON.stringify(normalFailures)}`);
  } finally {
    await normalContext.close();
  }

  const fallbackContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await installBrowserBoundary(fallbackContext);
  const fallbackPage = await fallbackContext.newPage();
  const failedUrl = `${baseUrl}${emitted.url}`;
  const fallbackFailures = { console: [], page: [], requests: [], external: [], requestedPaths: [], allowlistedRequests: 0 };
  recordFailures(fallbackPage, baseUrl, fallbackFailures, failedUrl);
  await fallbackPage.route(failedUrl, (route) => route.abort('failed'));
  try {
    await setupArtPage(fallbackPage, baseUrl);
    try {
      await fallbackPage.waitForFunction(() => document.querySelector('[data-testid="caribbean-port-backdrop"]')?.classList.contains('caribbean-port-backdrop--fallback'), null, { timeout: 5_000 });
    } catch (error) {
      const diagnostic = await fallbackPage.evaluate(() => ({
        className: document.querySelector('[data-testid="caribbean-port-backdrop"]')?.className ?? null,
        artSrc: document.querySelector('[data-testid="caribbean-port-art"]')?.src ?? null,
        artComplete: document.querySelector('[data-testid="caribbean-port-art"]')?.complete ?? null,
        naturalWidth: document.querySelector('[data-testid="caribbean-port-art"]')?.naturalWidth ?? null,
      }));
      throw new Error(`Forced art failure did not reach fallback: ${JSON.stringify({ diagnostic, failures: fallbackFailures })}; ${error.message}`);
    }
    for (const spec of ART_VIEWPORT_SPECS) {
      await fallbackPage.setViewportSize({ width: spec.width, height: spec.height });
      await fallbackPage.getByRole('heading', { name: 'Choose your next port action', level: 2 }).waitFor();
      invariant(await fallbackPage.getByRole('button', { name: 'Market' }).isEnabled(), `${spec.name} fallback lost port controls`);
      await capture(fallbackPage, screenshots, runDirectory, `port-art-${spec.name}-fallback.png`);
    }
    invariant(fallbackFailures.allowlistedRequests === 1, `Expected one allowlisted art failure, found ${fallbackFailures.allowlistedRequests}`);
    const expectedAbortConsole = fallbackFailures.console.filter((message) => message === 'Failed to load resource: net::ERR_FAILED');
    invariant(expectedAbortConsole.length === 1, `Expected one console companion for the allowlisted abort, found ${expectedAbortConsole.length}`);
    fallbackFailures.console = fallbackFailures.console.filter((message) => message !== 'Failed to load resource: net::ERR_FAILED');
    invariant(fallbackFailures.console.length === 0 && fallbackFailures.page.length === 0
      && fallbackFailures.requests.length === 0 && fallbackFailures.external.length === 0,
    `Fallback art capture failures: ${JSON.stringify(fallbackFailures)}`);
  } finally {
    await fallbackContext.close();
  }
  return viewports;
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

async function runJourney(browser, baseUrl, runDirectory, emittedArt, assetReport) {
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
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
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
    console.log('Checking painted harbour art, focal crops, contrast, geometry, and fallback…');
    const artViewports = await captureArtEvidence(
      browser,
      baseUrl,
      runDirectory,
      screenshots,
      emittedArt,
      assetReport.subjectRoi,
    );
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
      packagePhase: 'art',
      profile: {
        status: 'setup-verified',
        defaultPronouns: 'he/him',
        boothProfilePersisted: true,
        setup: setupIdentity,
      },
      art: {
        status: 'verified',
        asset: 'src/games/caribbean/assets/bridgetown-1675.webp',
        emitted: emittedArt,
        report: {
          historicalReview: assetReport.historicalReview,
          representationReview: assetReport.representationReview,
          subjectRoi: assetReport.subjectRoi,
        },
        screenshots: {
          normal: ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}.png`),
          fallback: ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}-fallback.png`),
        },
        viewports: artViewports,
      },
      market: { status: 'verified', samples: marketSamples },
    };
    const verdict = evaluatePortIdentityEvidence(metrics);
    const artDiagnostics = artViewports.map((viewport) => ({
      name: viewport.name,
      menuLeaves: viewport.menuGeometry.leaves.filter((leaf) => !leaf.contained || leaf.horizontalOverflowPx !== 0 || leaf.verticalOverflowPx !== 0),
      menuOverlaps: viewport.menuGeometry.overlapPairs,
      marketLeaves: viewport.marketGeometry.leaves.filter((leaf) => !leaf.contained || leaf.horizontalOverflowPx !== 0 || leaf.verticalOverflowPx !== 0),
      marketOverlaps: viewport.marketGeometry.overlapPairs,
    }));
    invariant(verdict.ok, `Caribbean port identity evidence failed: ${verdict.issues.join(' | ')}; ${JSON.stringify(artDiagnostics)}`);
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
  const emittedArt = readEmittedArt();
  const assetReport = JSON.parse(fs.readFileSync(path.join(
    ROOT, 'docs/games/caribbean-career/bridgetown-asset-report.json',
  ), 'utf8'));
  const { server, baseUrl } = await startStaticServer();
  let browser;
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-run-a-'));
  const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-run-b-'));
  try {
    await verifyEmittedArtResponse(baseUrl, emittedArt);
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
    console.log('Running deterministic browser journey A…');
    const first = await runJourney(browser, baseUrl, firstDirectory, emittedArt, assetReport);
    assertRequestedGraphIsolation(first.metrics);
    console.log('Running deterministic browser journey B…');
    const second = await runJourney(browser, baseUrl, secondDirectory, emittedArt, assetReport);
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
