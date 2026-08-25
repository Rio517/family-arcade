#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';
import { driveCampaignVictory, verifyRenderedRudderRelease } from './lib/caribbean-campaign-victory-driver.mjs';
import { normalBuildIsolationFailure } from './lib/caribbean-normal-build-isolation.mjs';
import { continueAfterSupportRestore } from './lib/caribbean-support-restore.mjs';
import {
  ART_ACTIVITY_CONTRAST_SPECS,
  ART_CAPTURE_FIXTURE_STATE,
  ART_CONTRAST_SELECTORS,
  ART_VIEWPORT_SPECS,
  EXPECTED_MARKET_ACTION_IDS,
  compareNormalRouteScreenshotRuns,
  evaluatePortIdentityEvidence,
  marketStabilityFailure,
  validateMarketStability,
} from './lib/caribbean-port-identity-evidence.mjs';

const MODULE_URL = new URL(import.meta.url);
const ROOT = fileURLToPath(new URL('..', MODULE_URL));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'docs', 'screenshots', 'caribbean-port');
const TRACKED_EVIDENCE_ROOT = path.join(ROOT, 'docs');
const MISMATCH_DIAGNOSTIC_DIRECTORY = '/private/tmp/caribbean-port-identity-diagnostic';
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
  'port-tablet-landscape.png',
  'port-compact-landscape.png',
  'port-art-fallback.png',
  'player-profile-desktop.png',
];
const VOYAGE_SCREENSHOTS = [
  'sailing-desktop.png',
  'encounter-desktop.png',
  'sailing-minimum-supported.png',
  'sailing-large-portrait-notice.png',
];
const BATTLE_SCREENSHOTS = [
  'campaign-battle-desktop.png',
  'campaign-result-desktop.png',
  'returned-log-desktop.png',
  'campaign-battle-fallback.png',
  'campaign-battle-resize-notice.png',
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
const CAMPAIGN_VICTORY_TRACE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'scripts', 'fixtures', 'caribbean-campaign-victory.json'),
  'utf8',
));
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
  profileDesktop: { width: 1440, height: 900, supported: false, controllerMounted: false, noticeVisible: false, noticeFocused: false, targetRootSelector: '.booth' },
  portDesktop: { width: 1440, height: 900, supported: true },
  portTabletLandscape: { width: 1180, height: 820, supported: true },
  portCompactLandscape: { width: 1024, height: 768, supported: true },
  artFallback: { width: 1440, height: 900, supported: true },
  minimumSupported: { width: 960, height: 600, supported: true },
  minimumWidth: { width: 959, height: 600, supported: false },
  minimumHeight: { width: 960, height: 599, supported: false },
  largePortrait: { width: 1024, height: 1366, supported: false },
};
export const MARKET_PROBE_MINIMUM_NOW_FIXTURES = 42;
export const PORT_CHECK_DEADLINE_MS = 900_000;
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

function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error('Port evidence command aborted');
}

async function buildNormalProduction(signal) {
  const env = { ...process.env };
  delete env.BUILD_HARNESS;
  console.log('Building the normal production bundle…');
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { cwd: ROOT, env, stdio: 'inherit' });
    let forceTimer = null;
    const abort = () => {
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), 250);
      forceTimer.unref?.();
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (forceTimer !== null) clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(abortReason(signal));
      else if (code === 0) resolve();
      else reject(new Error(`npm run build exited ${code}`));
    });
  });
}

function portDeadlineError(timeoutMs) {
  return new Error(`Port evidence command exceeded ${timeoutMs}ms`);
}

function passivePortDeadline(signal) {
  return {
    signal,
    throwIfExpired() {
      if (signal.aborted) throw abortReason(signal);
    },
    async race(value) {
      this.throwIfExpired();
      const result = await value;
      this.throwIfExpired();
      return result;
    },
    async cleanup(value) {
      return value;
    },
  };
}

export async function runWithPortCheckDeadline(operation, timeoutMs = PORT_CHECK_DEADLINE_MS) {
  invariant(Number.isFinite(timeoutMs) && timeoutMs > 0, 'port evidence deadline is invalid');
  const controller = new AbortController();
  const startedAt = performance.now();
  const expiresAt = startedAt + timeoutMs;
  const cleanupReserveMs = Math.min(5_000, Math.max(5, timeoutMs * 0.05));
  const abortAfterMs = Math.max(0, timeoutMs - cleanupReserveMs);
  const reason = portDeadlineError(timeoutMs);
  const abortTimer = setTimeout(() => controller.abort(reason), abortAfterMs);
  let rejectHardDeadline;
  const hardDeadline = new Promise((_, reject) => { rejectHardDeadline = reject; });
  const hardTimer = setTimeout(() => {
    controller.abort(reason);
    rejectHardDeadline(reason);
  }, timeoutMs);
  const throwIfExpired = () => {
    if (controller.signal.aborted || performance.now() >= expiresAt) {
      controller.abort(reason);
      throw reason;
    }
  };
  const deadline = {
    signal: controller.signal,
    expiresAt,
    timeoutMs,
    throwIfExpired,
    race(value, { onLateResolve } = {}) {
      const candidate = Promise.resolve(value);
      const disposeLate = (result) => {
        if (onLateResolve) void Promise.resolve(onLateResolve(result)).catch(() => {});
      };
      return new Promise((resolve, reject) => {
        let boundarySettled = false;
        const abort = () => {
          boundarySettled = true;
          reject(reason);
        };
        controller.signal.addEventListener('abort', abort, { once: true });
        candidate.then((result) => {
          controller.signal.removeEventListener('abort', abort);
          if (boundarySettled) {
            disposeLate(result);
            return;
          }
          try {
            throwIfExpired();
            resolve(result);
          } catch (error) {
            boundarySettled = true;
            disposeLate(result);
            reject(error);
          }
        }, (error) => {
          controller.signal.removeEventListener('abort', abort);
          if (!boundarySettled) reject(error);
        });
        try {
          throwIfExpired();
        } catch (error) {
          boundarySettled = true;
          reject(error);
        }
      });
    },
    cleanup(value) {
      const remainingMs = expiresAt - performance.now();
      if (remainingMs <= 0) return Promise.reject(reason);
      let cleanupTimer;
      return Promise.race([
        Promise.resolve(value),
        new Promise((_, reject) => {
          cleanupTimer = setTimeout(() => reject(reason), remainingMs);
        }),
      ]).finally(() => clearTimeout(cleanupTimer));
    },
  };
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => operation(controller.signal, deadline)),
      hardDeadline,
    ]);
    throwIfExpired();
    return result;
  } catch (error) {
    if (controller.signal.aborted || performance.now() >= expiresAt) throw reason;
    throw error;
  } finally {
    clearTimeout(abortTimer);
    clearTimeout(hardTimer);
  }
}

function insideDirectory(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function publicationTrustedAnchor(candidate) {
  const candidates = [ROOT, os.tmpdir()]
    .map((directory) => ({ lexical: path.resolve(directory), real: fs.realpathSync(directory) }))
    .filter(({ lexical }) => insideDirectory(candidate, lexical))
    .sort((left, right) => right.lexical.length - left.lexical.length);
  return candidates[0] ?? { lexical: path.parse(candidate).root, real: path.parse(candidate).root };
}

function pinPublicationDirectory(outputDirectory) {
  const lexical = path.resolve(outputDirectory);
  const anchor = publicationTrustedAnchor(lexical);
  let cursor = anchor.real;
  for (const component of path.relative(anchor.lexical, lexical).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const status = fs.lstatSync(cursor, { throwIfNoEntry: false });
    invariant(status !== undefined, 'publication outputDirectory must be an existing directory');
    invariant(!status.isSymbolicLink(),
      `publication outputDirectory ancestor cannot be a symbolic link: ${component}`);
  }
  const status = fs.lstatSync(cursor, { throwIfNoEntry: false });
  invariant(status?.isDirectory() && !status.isSymbolicLink(),
    'publication outputDirectory must be a real directory');
  return { lexical, real: fs.realpathSync(cursor) };
}

export function validateProgrammaticPortDestination(outputDirectory) {
  invariant(typeof outputDirectory === 'string' && outputDirectory.trim().length > 0,
    'programmatic port evidence outputDirectory is invalid');
  const lexical = path.resolve(outputDirectory);
  const trackedLexical = path.resolve(TRACKED_EVIDENCE_ROOT);
  if (lexical === path.resolve(OUT)) throw new Error('programmatic port evidence cannot target tracked docs');
  invariant(!insideDirectory(lexical, trackedLexical),
    'programmatic port evidence cannot target tracked evidence');
  invariant(fs.statSync(lexical, { throwIfNoEntry: false })?.isDirectory(),
    'programmatic port evidence outputDirectory must be an existing directory');
  const trackedResolved = fs.realpathSync(trackedLexical);
  invariant(!insideDirectory(fs.realpathSync(lexical), trackedResolved),
    'programmatic port evidence cannot target tracked evidence');
  const pinned = pinPublicationDirectory(lexical);
  const resolved = pinned.real;
  invariant(!insideDirectory(resolved, trackedResolved),
    'programmatic port evidence cannot target tracked evidence');
  return resolved;
}

export function validateTrackedPortDestination(
  outputDirectory = OUT,
  trackedEvidenceRoot = TRACKED_EVIDENCE_ROOT,
) {
  const tracked = pinPublicationDirectory(trackedEvidenceRoot);
  const output = pinPublicationDirectory(outputDirectory);
  invariant(insideDirectory(output.real, tracked.real),
    'tracked port evidence outputDirectory escaped tracked docs');
  return output.real;
}

function independentNextSeed(seed) {
  return (Math.imul(1_664_525, seed >>> 0) + 1_013_904_223) >>> 0;
}

function isUint32(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

export function evaluateStrategicSailingCausality({
  storageWrites,
  lifecycle,
  navigationEvents,
  navalEvents,
  initialNavigationRng,
  returnedNavigationRng,
  initialNavalRng,
  returnedNavalRng,
  persistedNavalInputSeed,
  initialWorldRng,
  returnedWorldRng,
}) {
  const mounts = Array.isArray(lifecycle)
    ? lifecycle.filter((row) => row?.type === 'naval-mount' && Number.isSafeInteger(row.sequence))
    : [];
  const writes = Array.isArray(storageWrites) ? storageWrites : [];
  const firstMount = mounts[0] ?? null;
  const persistedBeforeMount = firstMount !== null && writes.some((write) => {
    if (write?.key !== CURRENT_SAVE_KEY || !Number.isSafeInteger(write.sequence)
      || write.sequence >= firstMount.sequence || typeof write.after !== 'string') return false;
    try {
      return JSON.parse(write.after)?.payload?.state?.mode?.kind === 'naval';
    } catch {
      return false;
    }
  });
  const campaignWritesDuringBattle = firstMount === null ? -1 : writes.filter((write) => (
    [CURRENT_SAVE_KEY, PREVIOUS_SAVE_KEY].includes(write?.key)
      && Number.isSafeInteger(write.sequence) && write.sequence > firstMount.sequence
  )).length;
  const navigationTransitionsVerified = Array.isArray(navigationEvents)
    && navigationEvents.length === 2
    && navigationEvents.every((transition) => isUint32(transition?.before)
      && isUint32(transition?.after) && transition.after === independentNextSeed(transition.before))
    && isUint32(initialNavigationRng) && navigationEvents[0].before === initialNavigationRng
    && navigationEvents[1].before === navigationEvents[0].after
    && isUint32(returnedNavigationRng) && navigationEvents[1].after === returnedNavigationRng;
  const navalTransitionVerified = Array.isArray(navalEvents)
    && navalEvents.length === 1
    && isUint32(navalEvents[0]?.before) && isUint32(navalEvents[0]?.after)
    && navalEvents[0].after === independentNextSeed(navalEvents[0].before)
    && isUint32(initialNavalRng) && navalEvents[0].before === initialNavalRng
    && isUint32(returnedNavalRng) && navalEvents[0].after === returnedNavalRng
    && isUint32(persistedNavalInputSeed) && navalEvents[0].after === persistedNavalInputSeed;
  return {
    persistedBeforeMount,
    campaignWritesDuringBattle,
    navigationTransitionsVerified,
    navalTransitionVerified,
    worldUnchanged: isUint32(initialWorldRng) && returnedWorldRng === initialWorldRng,
  };
}

function assertNormalBuildIsolation() {
  const entries = fs.readdirSync(DIST, { recursive: true })
    .filter((entry) => typeof entry === 'string');
  const textualEntries = entries.filter((entry) => /\.(?:js|css|map)$/i.test(entry));
  const shippedText = textualEntries
    .map((entry) => fs.readFileSync(path.join(DIST, entry), 'utf8'))
    .join('\n');
  const failure = normalBuildIsolationFailure({ entries, shippedText });
  invariant(failure === null, `Normal build shipped ${failure}`);
  readEmittedNavalAssets();
}

function readUiSlice(argv) {
  const argument = argv.find((value) => value.startsWith('--ui-slice='));
  return argument?.slice('--ui-slice='.length) ?? null;
}

function fileResponsePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${HOST}:${PORT}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(DIST, relative);
  if (candidate !== DIST && !candidate.startsWith(`${DIST}${path.sep}`)) return null;
  return candidate;
}

export async function startStaticServer() {
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

export async function stopStaticServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

let publicationTemporarySequence = 0;

function safePublicationFile(outputDirectory, filename, expectedRealDirectory) {
  invariant(filename === path.basename(filename) && !filename.includes('/') && !filename.includes('\\'),
    `publication filename is invalid: ${filename}`);
  const pinned = pinPublicationDirectory(outputDirectory);
  invariant(expectedRealDirectory === undefined || pinned.real === expectedRealDirectory,
    'publication outputDirectory changed after validation');
  const root = pinned.real;
  const destination = path.join(root, filename);
  const status = fs.lstatSync(destination, { throwIfNoEntry: false });
  invariant(status === undefined || (status.isFile() && !status.isSymbolicLink()),
    `publication destination cannot be a symbolic link: ${filename}`);
  invariant(fs.realpathSync(path.dirname(destination)) === fs.realpathSync(root),
    `publication destination parent escaped outputDirectory: ${filename}`);
  return { destination, status };
}

const PASSIVE_PUBLICATION_DEADLINE = Object.freeze({ throwIfExpired() {} });

function publishFiles(entries, outputDirectory, deadline = PASSIVE_PUBLICATION_DEADLINE) {
  const pinned = pinPublicationDirectory(outputDirectory);
  const root = pinned.real;
  const staged = [];
  try {
    for (const [filename, bytes] of entries) {
      const { destination, status } = safePublicationFile(root, filename, pinned.real);
      const next = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      let current = null;
      if (status?.isFile()) {
        const currentDescriptor = fs.openSync(destination, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          current = fs.readFileSync(currentDescriptor);
        } finally {
          fs.closeSync(currentDescriptor);
        }
      }
      if (current?.equals(next)) {
        staged.push({ filename, changed: false });
        continue;
      }
      const temporary = path.join(
        root,
        `.${filename}.${process.pid}.${publicationTemporarySequence += 1}.tmp`,
      );
      const stagedFile = {
        filename,
        destination,
        temporary,
        temporaryCreated: false,
        changed: true,
        updated: current !== null,
      };
      staged.push(stagedFile);
      let descriptor;
      try {
        descriptor = fs.openSync(
          temporary,
          fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
          0o600,
        );
        stagedFile.temporaryCreated = true;
        fs.writeFileSync(descriptor, next);
        fs.closeSync(descriptor);
        descriptor = undefined;
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
      }
    }

    deadline.throwIfExpired();
    for (const file of staged) {
      if (!file.changed) continue;
      deadline.throwIfExpired();
      safePublicationFile(root, file.filename, pinned.real);
      fs.renameSync(file.temporary, file.destination);
      file.temporary = undefined;
    }
  } finally {
    for (const file of staged) {
      if (file.temporaryCreated && file.temporary !== undefined) fs.rmSync(file.temporary, { force: true });
    }
  }
  for (const file of staged) {
    console.log(file.changed ? `${file.updated ? 'updated' : 'new'}: ${file.filename}` : `unchanged: ${file.filename}`);
  }
}

function saveIfChanged(filename, bytes, outputDirectory = OUT) {
  publishFiles([[filename, bytes]], outputDirectory);
}

export function publishNormalRouteComparison({ comparison, metricsBytes, outputDirectory, deadline } = {}) {
  invariant(comparison?.ok === true, 'normal-route comparison did not succeed');
  invariant(comparison.selectedRun === 'A', 'normal-route publication owner must be run A');
  invariant(comparison.selectedArtifacts instanceof Map && comparison.selectedArtifacts.size === 23,
    'normal-route publication must contain exactly 23 selected artifacts');
  invariant(typeof outputDirectory === 'string' && outputDirectory.trim().length > 0,
    'normal-route publication destination is required');
  invariant((Buffer.isBuffer(metricsBytes) || ArrayBuffer.isView(metricsBytes)) && metricsBytes.byteLength > 0,
    'normal-route metrics bytes are required');
  const expectedNames = [...SCREENSHOTS, ...STRATEGIC_SCREENSHOTS];
  invariant(expectedNames.every((name) => comparison.selectedArtifacts.has(name))
    && [...comparison.selectedArtifacts.keys()].every((name) => expectedNames.includes(name)),
  'normal-route publication membership is invalid');

  const verified = [];
  for (const [name, artifact] of comparison.selectedArtifacts) {
    invariant(artifact?.sourceRun === 'A', `normal-route publication contains non-A artifact ${name}`);
    invariant(Buffer.isBuffer(artifact.bytes) || ArrayBuffer.isView(artifact.bytes),
      `normal-route publication bytes are missing for ${name}`);
    const actualHash = createHash('sha256').update(artifact.bytes).digest('hex');
    invariant(actualHash === artifact.sha256, `normal-route publication hash drifted for ${name}`);
    verified.push([name, actualHash, artifact.bytes]);
  }

  const artifactHashes = new Map(verified.map(([name, actualHash]) => [name, actualHash]));
  publishFiles([
    ...verified.map(([name, , bytes]) => [name, bytes]),
    ['metrics.json', metricsBytes],
  ], outputDirectory, deadline);
  return {
    artifactHashes,
    metricsSha256: createHash('sha256').update(metricsBytes).digest('hex'),
  };
}

export function browserBoundaryInitScript({
  nowFixtures,
  seedFixtures,
  uuidFixtures,
  traceKey,
  writerLock,
  currentSaveKey,
  previousSaveKey,
  usersRaw,
  installDateFixture,
}) {
      const defaultTrace = {
        nowIndex: 0,
        seedIndex: 0,
        uuidIndex: 0,
        nowConsumed: [],
        seedsConsumed: [],
        uuidsConsumed: [],
        locks: [],
        sequence: 0,
        storageWrites: [],
        lifecycle: [],
      };
      let trace = defaultTrace;
      try {
        const raw = sessionStorage.getItem(traceKey);
        if (raw !== null) trace = { ...defaultTrace, ...JSON.parse(raw) };
      } catch {
        trace = defaultTrace;
      }
      const persist = () => {
        let latest = defaultTrace;
        try {
          const raw = sessionStorage.getItem(traceKey);
          if (raw !== null) latest = { ...defaultTrace, ...JSON.parse(raw) };
        } catch {
          latest = defaultTrace;
        }
        trace = {
          ...latest,
          seedIndex: trace.seedIndex,
          uuidIndex: trace.uuidIndex,
          seedsConsumed: trace.seedsConsumed,
          uuidsConsumed: trace.uuidsConsumed,
          locks: trace.locks,
          sequence: trace.sequence,
          storageWrites: trace.storageWrites,
          lifecycle: trace.lifecycle,
          ...(installDateFixture ? {
            nowIndex: trace.nowIndex,
            nowConsumed: trace.nowConsumed,
          } : {}),
        };
        sessionStorage.setItem(traceKey, JSON.stringify(trace));
      };
      localStorage.setItem('arcade.users.v1', usersRaw);

      if (installDateFixture) {
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
      }

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
        failNextStorageWrite: false,
        writerHeld: false,
        releaseWriter() {
          releaseHeldWriter?.();
          releaseHeldWriter = null;
          control.writerHeld = false;
        },
      };
      let navalMounted = false;
      let observer = null;
      const recordNavalMount = () => {
        if (navalMounted) return;
        const visible = document.querySelector('[data-testid="naval-elapsed"]');
        if (visible === null) return;
        navalMounted = true;
        observer?.disconnect();
        trace.lifecycle.push({
          sequence: ++trace.sequence,
          type: 'naval-mount',
          storageWriteCount: trace.storageWrites.length,
        });
        persist();
      };
      const nativeSetItem = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value(key, value) {
          if (this === localStorage && (key === currentSaveKey || key === previousSaveKey)) {
            recordNavalMount();
          }
          if (this === localStorage && key === currentSaveKey && control.failNextStorageWrite) {
            control.failNextStorageWrite = false;
            throw new DOMException('Port-check forced storage failure', 'QuotaExceededError');
          }
          const before = this === localStorage ? localStorage.getItem(key) : null;
          const result = nativeSetItem.call(this, key, value);
          if (this === localStorage && (key === currentSaveKey || key === previousSaveKey)) {
            trace.storageWrites.push({
              sequence: ++trace.sequence,
              key,
              before,
              after: String(value),
            });
            persist();
          }
          return result;
        },
      });
      observer = new MutationObserver(recordNavalMount);
      observer.observe(document, { childList: true, subtree: true });
      recordNavalMount();
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
}

async function installBrowserBoundary(context, { installDate = true } = {}) {
  await context.addInitScript(
    browserBoundaryInitScript,
    {
      nowFixtures: NOW_FIXTURES,
      seedFixtures: SEED_FIXTURES,
      uuidFixtures: UUID_FIXTURES,
      traceKey: TRACE_KEY,
      writerLock: WRITER_LOCK,
      currentSaveKey: CURRENT_SAVE_KEY,
      previousSaveKey: PREVIOUS_SAVE_KEY,
      installDateFixture: installDate,
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

async function installPageDateBoundary(page) {
  await page.addInitScript(({ nowFixtures, traceKey }) => {
    const defaultTrace = {
      nowIndex: 0,
      seedIndex: 0,
      uuidIndex: 0,
      nowConsumed: [],
      seedsConsumed: [],
      uuidsConsumed: [],
      locks: [],
      sequence: 0,
      storageWrites: [],
      lifecycle: [],
    };
    let trace = defaultTrace;
    try {
      const raw = sessionStorage.getItem(traceKey);
      if (raw !== null) trace = { ...defaultTrace, ...JSON.parse(raw) };
    } catch {
      trace = defaultTrace;
    }
    const persist = () => {
      let latest = defaultTrace;
      try {
        const raw = sessionStorage.getItem(traceKey);
        if (raw !== null) latest = { ...defaultTrace, ...JSON.parse(raw) };
      } catch {
        latest = defaultTrace;
      }
      trace = {
        ...latest,
        nowIndex: trace.nowIndex,
        nowConsumed: trace.nowConsumed,
      };
      sessionStorage.setItem(traceKey, JSON.stringify(trace));
    };
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
  }, { nowFixtures: NOW_FIXTURES, traceKey: TRACE_KEY });
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

export function readEmittedNavalAssets() {
  const assets = fs.readdirSync(path.join(DIST, 'assets'));
  const patterns = [
    /^CampaignNavalBattle-[^/]+\.js$/,
    /^CampaignNavalBattle-[^/]+\.css$/,
    /^caribbean-sloop-[^/]+\.glb$/,
  ];
  const names = patterns.map((pattern) => {
    const matches = assets.filter((name) => pattern.test(name));
    invariant(matches.length === 1, `Expected one emitted naval asset for ${pattern}, found ${matches.join(', ')}`);
    return matches[0];
  });
  const precacheSources = fs.readdirSync(DIST, { recursive: true })
    .filter((entry) => typeof entry === 'string' && /(?:^|\/)(?:sw|workbox-[^/]+)\.js$/.test(entry))
    .map((entry) => fs.readFileSync(path.join(DIST, entry), 'utf8'));
  const urls = names.map((name) => `/assets/${name}`);
  invariant(
    names.every((name) => precacheSources.some((source) => source.includes(`assets/${name}`))),
    'Production naval assets are absent from the PWA precache',
  );
  return { names, urls, precacheVerified: true };
}

function assertNoNavalAssetRequests(requestedPaths, emittedNaval, phase) {
  const requested = new Set(requestedPaths);
  const fetched = emittedNaval.urls.filter((url) => requested.has(url));
  invariant(fetched.length === 0, `${phase}-requested-naval-assets-${fetched.join('|')}`);
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
    const targetRoot = expectedViewport.targetRootSelector === undefined
      ? document
      : document.querySelector(expectedViewport.targetRootSelector);
    if (!(targetRoot instanceof Document) && !(targetRoot instanceof HTMLElement)) throw new Error(`Target scope is missing: ${expectedViewport.targetRootSelector}`);
    const activeTargets = [...targetRoot.querySelectorAll(activeTargetSelector)].filter(visible);
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
    const routeTargetDiagnostics = routeTargets.map((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const scrollableAncestor = (() => {
        let ancestor = element.parentElement;
        while (ancestor !== null && ancestor !== document.body) {
          const style = getComputedStyle(ancestor);
          if (/(?:auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)
            && (ancestor.scrollHeight > ancestor.clientHeight || ancestor.scrollWidth > ancestor.clientWidth)) return true;
          ancestor = ancestor.parentElement;
        }
        return false;
      })();
      return {
        element,
        rect,
        testId: element.getAttribute('data-testid'),
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? null,
        hitBlocked: hit !== element && !element.contains(hit),
        hitTag: hit instanceof HTMLElement ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null,
        contained: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        scrollableAncestor,
      };
    });
    const occludedTargets = partyRect === null ? [] : routeTargetDiagnostics.flatMap((target) => {
      const { rect } = target;
      const inlineIntersects = Math.min(rect.right, partyRect.right) > Math.max(rect.left, partyRect.left);
      const blockClearance = Math.max(rect.top - partyRect.bottom, partyRect.top - rect.bottom);
      if (!inlineIntersects || blockClearance >= 8) return [];
      return [{
        testId: target.testId,
        label: target.label,
        blockClearance,
        targetRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        partyRect: { left: partyRect.left, top: partyRect.top, right: partyRect.right, bottom: partyRect.bottom },
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
      ...(expectedViewport.requireRouteHitTest ? {
        hitBlockedTargets: routeTargetDiagnostics.filter((target) => target.hitBlocked && (target.contained || !target.scrollableAncestor)).map(({ testId, label, hitTag, rect, contained, scrollableAncestor }) => ({
          testId, label, hitTag, contained, scrollableAncestor,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        })),
      } : {}),
      ...(expectedViewport.requireRouteContainment ? {
        offscreenTargets: routeTargetDiagnostics.filter((target) => !target.contained && !target.scrollableAncestor).map(({ testId, label, rect }) => ({
          testId, label, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        })),
      } : {}),
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
  const expectedController = expected.controllerMounted ?? expected.supported;
  const expectedNotice = expected.noticeVisible ?? !expected.supported;
  const expectedNoticeFocus = expected.noticeFocused ?? !expected.supported;
  if (expectedController) {
    invariant(result.controllerMounted && !result.noticeVisible, `${name} blocked a supported playfield`);
    invariant(result.minimumFontPx !== null && result.minimumFontPx >= 14, `${name} has ${result.minimumFontPx}px text`);
    invariant(result.undersizedTargets.length === 0, `${name} has undersized active targets: ${JSON.stringify(result.undersizedTargets)}`);
    invariant(result.occludedTargets.length === 0, `${name} has Party control occlusion: ${JSON.stringify(result.occludedTargets)}`);
    if (expected.requireRouteContainment) invariant(result.offscreenTargets.length === 0, `${name} has offscreen route targets without a scroll path: ${JSON.stringify(result.offscreenTargets)}`);
    if (expected.requireRouteHitTest) invariant(result.hitBlockedTargets.length === 0, `${name} has blocked route targets: ${JSON.stringify(result.hitBlockedTargets)}`);
    invariant(!result.partyObscured, `${name} renders the Party control beneath another surface`);
  } else if (expectedNotice) {
    invariant(!result.controllerMounted && result.noticeVisible && result.noticeFocused, `${name} mounted a controller or failed to focus its notice`);
  } else {
    invariant(!result.controllerMounted && !result.noticeVisible && result.noticeFocused === expectedNoticeFocus,
      `${name} mounted a Caribbean controller or unsupported notice unexpectedly`);
    invariant(result.minimumFontPx !== null && result.minimumFontPx >= 14, `${name} has ${result.minimumFontPx}px text`);
    invariant(result.undersizedTargets.length === 0, `${name} has undersized active targets: ${JSON.stringify(result.undersizedTargets)}`);
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

async function readPlayerProfileLayout(page, name, viewport, expectedPronouns) {
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
  invariant(result.activePronouns === expectedPronouns, `Booth displayed wrong saved pronouns: ${result.activePronouns}`);
  invariant(result.labels.includes('Name') && result.labels.includes('Pronouns'), 'Booth editor labels are incomplete');
  invariant(result.visibleText.every((entry) => entry.fontPx >= 14), `Booth has visible copy below 14px: ${JSON.stringify(result.visibleText)}`);
  invariant(result.controls.length === BOOTH_CONTROL_IDS.length && result.controls.every((control) => control.width >= 44 && control.height >= 44), `Booth has undersized controls: ${JSON.stringify(result.controls)}`);
  invariant(result.pageHorizontalOverflowPx === 0 && result.boothHorizontalOverflowPx === 0 && result.pageContained && result.boothContained, `Booth profile editor overflows its page or ticket column: ${JSON.stringify(measurement)}`);
  invariant(focusChecks.every((check) => check.focused && check.visible), `Booth ${name} Tab focus is not visibly complete: ${JSON.stringify(focusChecks)}`);
  return measurement;
}

async function readProfileScreenshotState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const activeInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const describe = (node) => node instanceof HTMLElement ? {
      tag: node.tagName, testId: node.dataset.testid ?? null, id: node.id || null,
      name: node.getAttribute('name'), type: node.getAttribute('type'), value: 'value' in node ? node.value : null,
    } : null;
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scroll: {
        window: { x: scrollX, y: scrollY },
        documentElement: { left: document.documentElement.scrollLeft, top: document.documentElement.scrollTop },
        body: { left: document.body.scrollLeft, top: document.body.scrollTop },
      },
      booth: (() => {
        const element = document.querySelector('.booth');
        return element instanceof HTMLElement ? { left: element.scrollLeft, top: element.scrollTop } : null;
      })(),
      activeElement: describe(active),
      caret: activeInput ? { start: activeInput.selectionStart, end: activeInput.selectionEnd, direction: activeInput.selectionDirection } : null,
      selection: range ? {
        anchor: describe(selection.anchorNode?.parentElement ?? null), focus: describe(selection.focusNode?.parentElement ?? null),
        startOffset: range.startOffset, endOffset: range.endOffset, collapsed: range.collapsed, text: selection.toString(),
      } : null,
      profileInputs: [...document.querySelectorAll('[data-testid="booth-profile-name"], [data-testid="booth-profile-pronouns"]')].map((element) => ({
        testId: element.getAttribute('data-testid'), value: element instanceof HTMLInputElement ? element.value : null,
        selectionStart: element instanceof HTMLInputElement ? element.selectionStart : null,
        selectionEnd: element instanceof HTMLInputElement ? element.selectionEnd : null,
      })),
      fonts: document.fonts ? { status: document.fonts.status, size: document.fonts.size } : null,
    };
  });
}

export function profileScreenshotReadinessErrors(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['profile screenshot state is missing'];
  if (state.activeElement?.tag && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(state.activeElement.tag)) errors.push('profile screenshot retains an interactive focus target');
  if (state.selection !== null) errors.push('profile screenshot retains a document selection');
  if (state.caret !== null) errors.push('profile screenshot retains an input caret');
  if (state.scroll?.window?.x !== 0 || state.scroll?.window?.y !== 0
    || state.scroll?.documentElement?.left !== 0 || state.scroll?.documentElement?.top !== 0
    || state.scroll?.body?.left !== 0 || state.scroll?.body?.top !== 0
    || state.booth?.left !== 0 || state.booth?.top !== 0) errors.push('profile screenshot has non-deterministic scroll state');
  if (state.fonts?.status !== 'loaded') errors.push('profile screenshot fonts are not ready');
  if (!Array.isArray(state.profileInputs) || state.profileInputs.some((input) => input.selectionStart !== input.selectionEnd)) errors.push('profile screenshot retains an input selection range');
  return errors;
}

async function preparePlayerProfileScreenshot(page) {
  await page.evaluate(async () => {
    const booth = document.querySelector('.booth');
    if (!(booth instanceof HTMLElement)) throw new Error('Ticket Booth is not mounted for screenshot readiness');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    getSelection()?.removeAllRanges();
    for (const input of booth.querySelectorAll('input')) {
      input.setSelectionRange(0, 0);
      input.blur();
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollLeft = 0;
    document.body.scrollTop = 0;
    booth.scrollLeft = 0;
    booth.scrollTop = 0;
    await document.fonts.ready;
    const signature = () => JSON.stringify({
      scroll: [scrollX, scrollY, document.documentElement.scrollLeft, document.documentElement.scrollTop, document.body.scrollLeft, document.body.scrollTop, booth.scrollLeft, booth.scrollTop],
      booth: booth.getBoundingClientRect().toJSON(),
      active: document.activeElement?.tagName ?? null,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstPaint = signature();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (signature() !== firstPaint) throw new Error('Player profile screenshot layout did not stabilize across animation frames');
  });
  const state = await readProfileScreenshotState(page);
  const errors = profileScreenshotReadinessErrors(state);
  invariant(errors.length === 0, `Player profile screenshot is not ready: ${errors.join(' | ')}`);
  return state;
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

async function captureBattle(page, screenshots, directory, filename) {
  await page.evaluate(() => document.fonts.ready);
  const bytes = await page.screenshot({ animations: 'disabled' });
  screenshots.set(filename, bytes);
  fs.writeFileSync(path.join(directory, filename), bytes);
}

async function readBattleCaptureState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.naval-scene-canvas');
    const elapsed = document.querySelector('[data-testid="naval-elapsed"]');
    const resultAction = document.querySelector('[data-testid="naval-result-action"]');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('terminal capture canvas is missing');
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('terminal capture WebGL context is missing');
    const pixels = [];
    const pixel = new Uint8Array(4);
    for (let row = 1; row <= 5; row += 1) {
      for (let column = 1; column <= 8; column += 1) {
        const x = Math.min(gl.drawingBufferWidth - 1, Math.floor(gl.drawingBufferWidth * column / 9));
        const y = Math.min(gl.drawingBufferHeight - 1, Math.floor(gl.drawingBufferHeight * row / 6));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        pixels.push(...pixel);
      }
    }
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = String(gl.getParameter(rendererInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR) ?? '');
    const renderer = String(gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? '');
    let sampleHash = 2_166_136_261;
    for (const value of pixels) sampleHash = Math.imul(sampleHash ^ value, 16_777_619) >>> 0;
    return {
      tick: Number(elapsed?.getAttribute('data-battle-tick')),
      resultVisible: resultAction instanceof HTMLElement && resultAction.offsetParent !== null,
      canvas: {
        width: canvas.width,
        height: canvas.height,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
        opacity: style.opacity,
        transform: style.transform,
        engine: canvas.dataset.engine ?? '',
        backend: { vendor, renderer },
        framebufferSample: {
          algorithm: 'fnv1a32-rgba-grid-v1',
          sampleCount: pixels.length / 4,
          nonzeroSampleChannels: pixels.filter((value) => value !== 0).length,
          sampleHash: sampleHash.toString(16).padStart(8, '0'),
        },
      },
    };
  });
}

async function assertBattleControlHitTargets(page) {
  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left, top: value.top, right: value.right, bottom: value.bottom,
        width: value.width, height: value.height,
      };
    };
    const controls = [...document.querySelectorAll('.naval-battle-page .naval-control, .naval-battle-page .naval-effects-volume input')]
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const disabled = element instanceof HTMLButtonElement || element instanceof HTMLInputElement
          ? element.disabled
          : element.getAttribute('aria-disabled') === 'true';
        const closedDetails = element.closest('details:not([open])');
        return !disabled && style.display !== 'none' && style.visibility !== 'hidden'
          && style.pointerEvents !== 'none' && bounds.width > 0 && bounds.height > 0
          && (closedDetails === null || element.matches('summary'));
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          testId: element.getAttribute('data-testid'),
          rect: rect(element),
          hitTestId: hit instanceof HTMLElement ? hit.closest('[data-testid]')?.getAttribute('data-testid') ?? null : null,
          hitClass: hit instanceof HTMLElement ? hit.className : null,
          clear: hit === element || (hit !== null && element.contains(hit)),
        };
      });
    const partyPill = document.querySelector('[data-testid="party-pill"]');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      partyPill: partyPill instanceof HTMLElement ? rect(partyPill) : null,
      controls,
    };
  });
  const blocked = geometry.controls.filter(({ clear }) => !clear);
  invariant(
    blocked.length === 0,
    `battle-control-hit-test-${canonicalJson({ viewport: geometry.viewport, partyPill: geometry.partyPill, blocked })}`,
  );
  return geometry;
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

    const statusValue = (label) => {
      const row = [...document.querySelectorAll('.caribbean-port-status-rail dl > div')].find(
        (candidate) => candidate.querySelector('dt')?.textContent?.trim() === label,
      );
      const value = row?.querySelector('dd')?.textContent?.trim();
      if (value === undefined) throw new Error(`Missing art fixture status: ${label}`);
      return value;
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
      fixtureState: { gold: statusValue('Gold'), provisions: statusValue('Provisions') },
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
  let fallbackLayout;
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
      invariant(evidence.fixtureState.gold === ART_CAPTURE_FIXTURE_STATE.gold
        && evidence.fixtureState.provisions === ART_CAPTURE_FIXTURE_STATE.provisions,
      `Art capture fixture drifted before ${spec.name}: ${JSON.stringify(evidence.fixtureState)}`);
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
      viewports.push(evidence);
      await normalPage.getByRole('button', { name: 'Back to harbour' }).click();
    }
    for (const [index, spec] of ART_VIEWPORT_SPECS.entries()) {
      await normalPage.setViewportSize({ width: spec.width, height: spec.height });
      await normalPage.getByRole('heading', { name: 'Choose your next port action', level: 2 }).waitFor();
      const activityContrasts = [];
      await normalPage.getByRole('button', { name: 'Market' }).click();
      await normalPage.getByRole('heading', { name: 'Market', level: 2 }).waitFor();
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
      for (const activitySpec of ART_ACTIVITY_CONTRAST_SPECS.slice(2)) {
        activityContrasts.push(await readActivityContrast(normalPage, activitySpec));
      }
      viewports[index].activityContrasts = activityContrasts;
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
    fallbackLayout = await readLayout(fallbackPage, 'artFallback', VIEWPORTS.artFallback);
    for (const spec of ART_VIEWPORT_SPECS) {
      await fallbackPage.setViewportSize({ width: spec.width, height: spec.height });
      await fallbackPage.getByRole('heading', { name: 'Choose your next port action', level: 2 }).waitFor();
      invariant(await fallbackPage.getByRole('button', { name: 'Market' }).isEnabled(), `${spec.name} fallback lost port controls`);
      if (spec.name === 'desktop') await capture(fallbackPage, screenshots, runDirectory, 'port-art-fallback.png');
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
  invariant(fallbackLayout !== undefined, 'Forced art failure did not record its desktop viewport');
  return {
    viewports,
    fallbackLayout,
    localRequest: normalFailures.requestedPaths.includes(emitted.url),
  };
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

async function readVoyageEnvelope(page, expectedMode) {
  const raw = await readActiveEnvelope(page);
  invariant(typeof raw === 'string', `missing-${expectedMode}-save`);
  const envelope = JSON.parse(raw);
  invariant(envelope.version === 1, `wrong-${expectedMode}-save-version`);
  invariant(envelope.checksum === checksumPayload(envelope.payload), `invalid-${expectedMode}-save-checksum`);
  invariant(envelope.payload?.state?.mode?.kind === expectedMode, `missing-saved-${expectedMode}-mode`);
  return envelope;
}

async function runVoyageUiCheck() {
  await buildNormalProduction();
  const emittedNaval = readEmittedNavalAssets();
  const { server, baseUrl } = await startStaticServer();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-voyage-ui-'));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      reducedMotion: 'reduce',
    });
    await installBrowserBoundary(context);
    const page = await context.newPage();
    const failures = { console: [], page: [], requests: [], external: [], requestedPaths: [] };
    recordFailures(page, baseUrl, failures);
    const screenshots = new Map();
    try {
      await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
      assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'setup');
      await page.getByRole('button', { name: 'Start career' }).click();
      await page.getByTestId('caribbean-career-ready').waitFor();
      assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'port');
      await page.getByRole('button', { name: 'Tavern' }).click();
      await page.getByRole('button', { name: 'Mark on chart' }).click();
      await page.getByText("Marked in the Captain's Log").waitFor();

      const setSail = page.getByTestId('port-action-set-sail');
      if (await setSail.count() !== 1 || !await setSail.isEnabled()) {
        throw new Error('missing-port-action-set-sail');
      }
      await setSail.click();
      await page.getByTestId('voyage-status').waitFor();
      const sailingEnvelope = await readVoyageEnvelope(page, 'sailing');
      invariant(sailingEnvelope.payload.events.at(-1)?.type === 'voyage-started', 'missing-voyage-started-event');
      assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'sailing');
      await capture(page, screenshots, directory, 'sailing-desktop.png');

      await page.setViewportSize({ width: 960, height: 600 });
      await page.getByTestId('voyage-status').waitFor();
      await readLayout(page, 'sailingMinimumSupported', { width: 960, height: 600, supported: true });
      await capture(page, screenshots, directory, 'sailing-minimum-supported.png');

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByTestId('voyage-continue-east').click();
      await page.getByTestId('encounter-pursue').waitFor();
      const encounterEnvelope = await readVoyageEnvelope(page, 'encounter');
      invariant(encounterEnvelope.payload.events.at(-1)?.type === 'sea-leg-completed', 'missing-sea-leg-completed-event');
      await capture(page, screenshots, directory, 'encounter-desktop.png');

      await page.setViewportSize({ width: 1024, height: 1366 });
      await page.getByTestId('caribbean-minimum-screen').waitFor();
      await readLayout(page, 'sailingLargePortraitNotice', { width: 1024, height: 1366, supported: false });
      await capture(page, screenshots, directory, 'sailing-large-portrait-notice.png');

      await page.setViewportSize({ width: 1440, height: 900 });
      await continueAfterSupportRestore(page, { expectedTestId: 'encounter-avoid' });
      await page.getByTestId('encounter-avoid').click();
      await page.getByTestId('caribbean-career-ready').waitFor();
      const returnedEnvelope = await readVoyageEnvelope(page, 'port');
      invariant(returnedEnvelope.payload.events.at(-1)?.type === 'encounter-avoided', 'missing-encounter-avoided-event');
      await settle(page);
      const returnedFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
      invariant(returnedFocus === 'port-action-log', `avoid-return-focused-${returnedFocus ?? 'nothing'}`);
      assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'avoid');

      invariant(failures.console.length === 0, `console-errors-${failures.console.join('|')}`);
      invariant(failures.page.length === 0, `page-errors-${failures.page.join('|')}`);
      invariant(failures.requests.length === 0, `request-errors-${failures.requests.join('|')}`);
      invariant(failures.external.length === 0, `external-requests-${failures.external.join('|')}`);
      invariant(VOYAGE_SCREENSHOTS.every((filename) => screenshots.has(filename)), 'incomplete-voyage-screenshot-set');
      for (const filename of VOYAGE_SCREENSHOTS) saveIfChanged(filename, screenshots.get(filename));
      console.log(`CARIBBEAN_VOYAGE_UI_OK screenshots=${VOYAGE_SCREENSHOTS.length}`);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    await stopStaticServer(server);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function readStrategicSurface(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    };
    const color = (value) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (value.startsWith('color(srgb')) {
        return {
          r: (channels[0] ?? 0) * 255,
          g: (channels[1] ?? 0) * 255,
          b: (channels[2] ?? 0) * 255,
          a: channels[3] ?? 1,
        };
      }
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (raw) => {
        const value = raw / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const result = document.querySelector('.naval-result');
    const roots = result && visible(result)
      ? [result]
      : [...document.querySelectorAll(
          '.caribbean-voyage-decision, .naval-battle-page, .caribbean-port-activity',
        )].filter(visible);
    const text = roots.flatMap((root) => [root, ...root.querySelectorAll('*')]).filter((element) => (
      visible(element)
      && element.closest('.naval-visually-hidden') === null
      && [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    ));
    const targets = [...document.querySelectorAll('button:not([disabled])')].filter(visible);
    const contrastSamples = text.flatMap((element) => {
      let backgroundElement = element;
      let background = color(getComputedStyle(backgroundElement).backgroundColor);
      while (background.a < 0.999 && backgroundElement.parentElement !== null) {
        backgroundElement = backgroundElement.parentElement;
        background = color(getComputedStyle(backgroundElement).backgroundColor);
      }
      if (background.a < 0.999) return [];
      return [contrast(color(getComputedStyle(element).color), background)];
    });
    const widths = targets.map((element) => element.getBoundingClientRect().width);
    const heights = targets.map((element) => element.getBoundingClientRect().height);
    return {
      minimumTextPx: text.length === 0
        ? null
        : Math.min(...text.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))),
      minimumTargetWidthPx: widths.length === 0 ? null : Math.min(...widths),
      minimumTargetHeightPx: heights.length === 0 ? null : Math.min(...heights),
      minimumContrastRatio: contrastSamples.length === 0 ? null : Math.min(...contrastSamples),
      horizontalOverflowPx: Math.max(
        0,
        document.documentElement.scrollWidth - innerWidth,
        document.body.scrollWidth - innerWidth,
      ),
    };
  });
}

function minimumStrategicAccessibility(samples) {
  invariant(samples.length > 0, 'strategic accessibility samples are missing');
  for (const sample of samples) {
    invariant(sample.minimumTextPx >= 14, `strategic text below 14px: ${canonicalJson(sample)}`);
    invariant(sample.minimumTargetWidthPx >= 44, `strategic target width below 44px: ${canonicalJson(sample)}`);
    invariant(sample.minimumTargetHeightPx >= 44, `strategic target height below 44px: ${canonicalJson(sample)}`);
    invariant(sample.minimumContrastRatio >= 4.5, `strategic contrast below 4.5:1: ${canonicalJson(sample)}`);
    invariant(sample.horizontalOverflowPx === 0, `strategic horizontal overflow: ${canonicalJson(sample)}`);
  }
  return {
    minimumTextPx: Math.min(...samples.map((sample) => sample.minimumTextPx)),
    minimumTargetWidthPx: Math.min(...samples.map((sample) => sample.minimumTargetWidthPx)),
    minimumTargetHeightPx: Math.min(...samples.map((sample) => sample.minimumTargetHeightPx)),
    minimumContrastRatio: Math.min(...samples.map((sample) => sample.minimumContrastRatio)),
    horizontalOverflowPx: Math.max(...samples.map((sample) => sample.horizontalOverflowPx)),
  };
}

async function readRenderedSystems(page, accessibleName) {
  // The terminal result dialog correctly makes the tactical HUD inaccessible,
  // so role queries exclude these still-rendered read-only values at this seam.
  const section = page.locator(`[aria-label="${accessibleName}"]`);
  return section.evaluate((element) => {
    const result = {};
    for (const entry of element.querySelectorAll('.naval-system-value')) {
      const label = entry.querySelector('span')?.textContent?.trim().toLowerCase();
      const value = Number(entry.querySelector('strong')?.textContent?.trim());
      if (label) result[label] = value;
    }
    return result;
  });
}

function navalRequestCount(requestedPaths, emittedNaval) {
  const requested = new Set(requestedPaths);
  return emittedNaval.urls.filter((url) => requested.has(url)).length;
}

function exactActiveElement(page, selector) {
  return page.locator(selector).evaluate((element) => element === document.activeElement);
}

async function reloadStrategicResume(page) {
  await page.evaluate(() => {
    history.replaceState(history.state, '', '/#/caribbean?resume=1');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

/**
 * Drives the complete normal production route with the real campaign controller,
 * persisted naval input, real NavalSession, rendered controls, and Playwright clock.
 * Generated bytes stay in runDirectory; only the outer port command may publish them.
 */
export async function runStrategicSailingJourney({
  browser,
  baseUrl,
  runDirectory,
  emittedNaval,
  trace = CAMPAIGN_VICTORY_TRACE,
  captureScreenshots = true,
}) {
  invariant(browser && typeof browser.newContext === 'function', 'strategic journey browser is missing');
  invariant(typeof baseUrl === 'string' && baseUrl.startsWith('http://127.0.0.1:'), 'strategic journey base URL is invalid');
  invariant(typeof runDirectory === 'string' && fs.existsSync(runDirectory), 'strategic journey directory is missing');
  invariant(emittedNaval?.urls?.length === 3, 'strategic journey emitted naval manifest is invalid');

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  });
  await installBrowserBoundary(context, { installDate: false });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2023-11-14T22:13:20.000Z') });
  await installPageDateBoundary(page);
  const failures = { console: [], page: [], requests: [], external: [], requestedPaths: [] };
  recordFailures(page, baseUrl, failures);
  const screenshots = new Map();
  const screenshotStates = new Map();
  const accessibilitySamples = [];
  const modeSequence = [];
  let firstEncounterEnvelope;
  let navalEnvelope;
  let navalRaw;
  let tickAtMount;
  let tickAfterFirstRaf;
  let firstPublishedTick;
  let tickAfterReload;
  let tickAtTerminalCapture;
  let terminalBoundaryTrace;
  let completion;
  let renderedRudderReleasedAt140ms = false;
  let intermediateModeRecovered = false;
  let unreadableBytesPreserved = false;
  const focus = {
    sailingHeading: false,
    encounterHeading: false,
    avoidedReturnLog: false,
    navalReloadBattle: false,
    resolvedReturnLog: false,
  };
  const phaseNavalCounts = {
    setupNavalCount: 0,
    portNavalCount: 0,
    sailingNavalCount: 0,
    avoidNavalCount: 0,
  };

  const maybeCapture = async (filename, battle = false) => {
    if (!captureScreenshots) return;
    if (battle) await captureBattle(page, screenshots, runDirectory, filename);
    else await capture(page, screenshots, runDirectory, filename);
  };

  try {
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
    phaseNavalCounts.setupNavalCount = navalRequestCount(failures.requestedPaths, emittedNaval);
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'strategic-setup');
    await page.getByRole('button', { name: 'Start career' }).click();
    await page.getByTestId('caribbean-career-ready').waitFor();
    await page.getByRole('button', { name: 'Tavern' }).click();
    await page.getByRole('button', { name: 'Mark on chart' }).click();
    await page.getByText("Marked in the Captain's Log").waitFor();
    await page.getByRole('button', { name: 'Back to harbour' }).click();
    phaseNavalCounts.portNavalCount = navalRequestCount(failures.requestedPaths, emittedNaval);
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'strategic-port');
    const initialEnvelope = await readVoyageEnvelope(page, 'port');
    invariant(initialEnvelope.payload.events.length === 1, 'strategic lead event count drifted');
    invariant(initialEnvelope.payload.events[0]?.type === 'lead-accepted', 'strategic lead event is missing');
    const initialState = structuredClone(initialEnvelope.payload.state);
    modeSequence.push('port');

    await page.getByTestId('port-action-set-sail').click();
    await page.getByTestId('voyage-continue-east').waitFor();
    modeSequence.push('sailing');
    focus.sailingHeading = await exactActiveElement(page, '#caribbean-sailing-title');
    invariant(focus.sailingHeading, 'strategic sailing heading did not receive focus');
    const firstSailingEnvelope = await readVoyageEnvelope(page, 'sailing');
    await maybeCapture('sailing-desktop.png');
    accessibilitySamples.push(await readStrategicSurface(page));
    phaseNavalCounts.sailingNavalCount = navalRequestCount(failures.requestedPaths, emittedNaval);
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'strategic-sailing');

    await page.setViewportSize({ width: 960, height: 600 });
    await page.getByTestId('voyage-continue-east').waitFor();
    await readLayout(page, 'strategicSailingMinimumSupported', {
      width: 960, height: 600, supported: true, requireRouteHitTest: true, requireRouteContainment: true,
    });
    await maybeCapture('sailing-minimum-supported.png');
    await page.setViewportSize({ width: 1440, height: 900 });

    await reloadStrategicResume(page);
    await page.getByTestId('voyage-continue-east').waitFor();
    invariant(await exactActiveElement(page, '#caribbean-sailing-title'), 'reloaded sailing heading did not receive focus');
    const reloadedSailingEnvelope = await readVoyageEnvelope(page, 'sailing');
    invariant(
      canonicalJson(firstSailingEnvelope.payload.state.mode) === canonicalJson(reloadedSailingEnvelope.payload.state.mode),
      'saved sailing mode changed after reload',
    );
    await page.getByTestId('voyage-continue-east').click();
    await page.getByTestId('encounter-pursue').waitFor();
    modeSequence.push('encounter');
    focus.encounterHeading = await exactActiveElement(page, '#caribbean-encounter-title');
    invariant(focus.encounterHeading, 'strategic encounter heading did not receive focus');
    firstEncounterEnvelope = await readVoyageEnvelope(page, 'encounter');
    await maybeCapture('encounter-desktop.png');
    accessibilitySamples.push(await readStrategicSurface(page));

    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.getByTestId('caribbean-minimum-screen').waitFor();
    await readLayout(page, 'strategicSailingLargePortraitNotice', {
      width: 1024, height: 1366, supported: false,
    });
    await maybeCapture('sailing-large-portrait-notice.png');
    await page.setViewportSize({ width: 1440, height: 900 });
    await continueAfterSupportRestore(page, { expectedTestId: 'encounter-avoid' });
    await page.getByTestId('encounter-avoid').click();
    await page.getByTestId('caribbean-career-ready').waitFor();
    modeSequence.push('port');
    focus.avoidedReturnLog = await exactActiveElement(page, '[data-testid="port-action-log"]');
    invariant(focus.avoidedReturnLog, 'avoid return did not focus Captain’s Log');
    const avoidedEnvelope = await readVoyageEnvelope(page, 'port');
    phaseNavalCounts.avoidNavalCount = navalRequestCount(failures.requestedPaths, emittedNaval);
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'strategic-avoid');

    await page.getByTestId('port-action-set-sail').click();
    await page.getByTestId('voyage-continue-east').waitFor();
    modeSequence.push('sailing');
    await page.getByTestId('voyage-continue-east').click();
    await page.getByTestId('encounter-pursue').waitFor();
    modeSequence.push('encounter');
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'strategic-before-pursuit');
    await page.clock.pauseAt(new Date('2023-11-14T22:13:30.000Z'));
    await page.getByTestId('encounter-pursue').click();
    await page.getByTestId('naval-elapsed').waitFor();
    modeSequence.push('naval');
    navalRaw = await readActiveEnvelope(page);
    navalEnvelope = await readVoyageEnvelope(page, 'naval');
    const savedInputBytes = canonicalJson(navalEnvelope.payload.state.mode.input);
    invariant(
      canonicalJson({
        battleId: navalEnvelope.payload.state.mode.input.battleId,
        seed: navalEnvelope.payload.state.mode.input.seed,
      }) === canonicalJson(trace.input),
      'strategic saved naval input does not match the golden trace',
    );
    await page.getByText('3D tactical sea restored.').waitFor();
    invariant(
      emittedNaval.urls.every((url) => failures.requestedPaths.includes(url)),
      `pursuit did not request the exact local naval assets: ${canonicalJson(failures.requestedPaths)}`,
    );
    tickAtMount = Number(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick'));
    invariant(tickAtMount === 0, 'strategic battle did not mount at tick zero');
    await page.clock.runFor(16);
    tickAfterFirstRaf = Number(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick'));
    invariant(tickAfterFirstRaf === 0, 'strategic first RAF advanced the battle');
    firstPublishedTick = 0;
    for (let frame = 0; frame < 12 && firstPublishedTick === 0; frame += 1) {
      await page.clock.runFor(16);
      firstPublishedTick = Number(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick'));
    }
    invariant(firstPublishedTick === 6, `strategic first public cadence was ${firstPublishedTick}`);

    await reloadStrategicResume(page);
    await continueAfterSupportRestore(page, { expectedTestId: 'naval-elapsed' });
    tickAfterReload = Number(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick'));
    invariant(tickAfterReload === 0, 'strategic reload did not restart at tick zero');
    focus.navalReloadBattle = await page.getByTestId('naval-battle-page').isVisible();
    const reloadedNavalEnvelope = await readVoyageEnvelope(page, 'naval');
    invariant(
      savedInputBytes === canonicalJson(reloadedNavalEnvelope.payload.state.mode.input),
      'strategic saved input bytes changed after reload',
    );
    await page.clock.runFor(16);
    invariant(
      Number(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick')) === 0,
      'strategic reload first RAF advanced the battle',
    );
    await maybeCapture('campaign-battle-desktop.png', true);
    accessibilitySamples.push(await readStrategicSurface(page));
    await verifyRenderedRudderRelease(page);
    renderedRudderReleasedAt140ms = true;

    const rawBeforeVictory = await readActiveEnvelope(page);
    let terminal;
    try {
      terminal = await driveCampaignVictory({ page, trace, clockPrimed: true });
    } catch (error) {
      throw new Error(`Normal-route naval victory was not reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    invariant(canonicalJson(terminal) === canonicalJson(CAMPAIGN_VICTORY_TRACE.expected), 'strategic terminal trace drifted');
    invariant(await readActiveEnvelope(page) === rawBeforeVictory, 'campaign save changed while the battle ticked');
    const playerSystems = await readRenderedSystems(page, 'Mistral systems');
    const opponentSystems = await readRenderedSystems(page, 'Red Jackdaw systems');
    invariant(canonicalJson(playerSystems) === canonicalJson({ hull: 78, sails: 61, crew: 44, cannon: 8 }), `strategic final player systems drifted: ${canonicalJson(playerSystems)}`);
    invariant(canonicalJson(opponentSystems) === canonicalJson({ hull: 88, sails: 14, crew: 9, cannon: 8 }), `strategic final opponent systems drifted: ${canonicalJson(opponentSystems)}`);
    const terminalCaptureState = {
      ...await readBattleCaptureState(page),
      terminal: {
        outcome: terminal.outcome.kind,
        victorShipId: terminal.outcome.victorShipId,
        atTick: terminal.atTick,
        seedAfter: terminal.seedAfter,
      },
      player: playerSystems,
      opponent: opponentSystems,
    };
    tickAtTerminalCapture = terminalCaptureState.tick;
    invariant(tickAtTerminalCapture === 11_855, `terminal capture tick was ${tickAtTerminalCapture}`);
    screenshotStates.set('campaign-result-desktop.png', terminalCaptureState);
    await maybeCapture('campaign-result-desktop.png', true);
    accessibilitySamples.push(await readStrategicSurface(page));
    terminalBoundaryTrace = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), TRACE_KEY);

    await page.getByTestId('naval-result-action').click();
    await page.getByTestId('caribbean-career-ready').waitFor();
    modeSequence.push('port');
    focus.resolvedReturnLog = await exactActiveElement(page, '[data-testid="port-action-log"]');
    invariant(focus.resolvedReturnLog, 'resolved return did not focus Captain’s Log');
    const returnedRaw = await readActiveEnvelope(page);
    const returnedEnvelope = await readVoyageEnvelope(page, 'port');
    const resolutionEvents = returnedEnvelope.payload.events.filter((event) => event.type === 'naval-resolved');
    invariant(resolutionEvents.length === 1, `strategic resolution count was ${resolutionEvents.length}`);
    await reloadStrategicResume(page);
    await page.getByTestId('caribbean-career-ready').waitFor();
    const reloadedReturnedRaw = await readActiveEnvelope(page);
    const reloadedReturnedEnvelope = await readVoyageEnvelope(page, 'port');
    const canonicalSaveEqualAfterReload = returnedRaw === reloadedReturnedRaw
      && canonicalJson(returnedEnvelope.payload.state) === canonicalJson(reloadedReturnedEnvelope.payload.state);
    invariant(canonicalSaveEqualAfterReload, 'returned port save changed after reload');
    const leadStatus = reloadedReturnedEnvelope.payload.state.leads
      .find((lead) => lead.id === 'red-jackdaw')?.status ?? null;
    invariant(leadStatus === 'completed', `returned Red Jackdaw lead was ${leadStatus}`);
    const setSail = page.getByTestId('port-action-set-sail');
    const setSailDisabled = await setSail.isDisabled();
    invariant(setSailDisabled, 'post-victory Set Sail remained enabled');
    const setSailReason = 'The Red Jackdaw lead is complete.';
    invariant(await page.getByText(setSailReason, { exact: true }).isVisible(), 'post-victory Set Sail reason drifted');
    await page.getByTestId('port-action-log').click();
    await page.getByTestId('captains-log-last-voyage').waitFor();
    const victoryReturnCopy = 'Victory — Red Jackdaw ready to board · Returned on day 4.';
    const safeReturnCopy = 'Bridgetown’s harbour crew made Mistral ready for the next departure; the battle outcome remains in this log, but its damage is not carried onto the ready flagship.';
    invariant(await page.getByText(victoryReturnCopy, { exact: true }).isVisible(), 'victory return Log copy drifted');
    invariant(await page.getByText(safeReturnCopy, { exact: true }).isVisible(), 'safe-return Log copy drifted');
    completion = {
      canonicalSaveEqualAfterReload,
      leadStatus,
      setSailDisabled,
      setSailReason,
      victoryReturnCopy,
      safeReturnCopy,
    };
    await maybeCapture('returned-log-desktop.png', true);
    accessibilitySamples.push(await readStrategicSurface(page));

    const traceState = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), TRACE_KEY);
    const routeNowConsumed = traceState.nowConsumed.slice();
    invariant(
      canonicalJson(routeNowConsumed) === canonicalJson(NOW_FIXTURES.slice(0, 9)),
      `strategic Date.now fixture order drifted: ${canonicalJson(routeNowConsumed)}`,
    );

    await page.addInitScript(() => {
      const nativeGetContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value(type, ...args) {
          return String(type).startsWith('webgl') ? null : nativeGetContext.call(this, type, ...args);
        },
      });
    });
    await page.evaluate(({ currentKey, raw }) => localStorage.setItem(currentKey, raw), {
      currentKey: CURRENT_SAVE_KEY,
      raw: navalRaw,
    });
    await reloadStrategicResume(page);
    await page.getByTestId('naval-html-chart').waitFor();
    invariant(await page.getByTestId('naval-fire-port').isEnabled(), 'strategic fallback lost battle controls');
    await maybeCapture('campaign-battle-fallback.png', true);
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.getByTestId('caribbean-minimum-screen').waitFor();
    await maybeCapture('campaign-battle-resize-notice.png', true);

    const corruptRaw = '{not-json:strategic-intermediate-recovery';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(({ currentKey, raw }) => localStorage.setItem(currentKey, raw), {
      currentKey: CURRENT_SAVE_KEY,
      raw: corruptRaw,
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Campaign recovery required' }).waitFor();
    await page.getByRole('button', { name: 'Recover known-good campaign' }).click();
    await page.getByTestId('naval-elapsed').waitFor();
    const recoveryState = await page.evaluate(({ currentKey, prefix, corrupt }) => {
      const current = localStorage.getItem(currentKey);
      const quarantine = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
      return {
        mode: current === null ? null : JSON.parse(current).payload.state.mode.kind,
        quarantineRaw: quarantine.length === 1 ? localStorage.getItem(quarantine[0]) : null,
        corrupt,
      };
    }, { currentKey: CURRENT_SAVE_KEY, prefix: QUARANTINE_PREFIX, corrupt: corruptRaw });
    intermediateModeRecovered = recoveryState.mode === 'naval';
    unreadableBytesPreserved = typeof recoveryState.quarantineRaw === 'string'
      && recoveryState.quarantineRaw.includes(corruptRaw);
    invariant(intermediateModeRecovered, `strategic recovery returned ${recoveryState.mode}`);
    invariant(unreadableBytesPreserved, 'strategic recovery did not preserve unreadable bytes');

    failures.console = [...new Set(failures.console)].filter((message) => (
      !message.includes('THREE.WebGLRenderer: Error creating WebGL context')
    ));
    failures.page = [...new Set(failures.page)];
    failures.requests = [...new Set(failures.requests)];
    failures.external = [...new Set(failures.external)];
    invariant(failures.console.length === 0, `strategic console failures: ${failures.console.join(' | ')}`);
    invariant(failures.page.length === 0, `strategic page failures: ${failures.page.join(' | ')}`);
    invariant(failures.requests.length === 0, `strategic request failures: ${failures.requests.join(' | ')}`);
    invariant(failures.external.length === 0, `strategic external requests: ${failures.external.join(' | ')}`);

    const events = returnedEnvelope.payload.events;
    const navigationEvents = events.filter((event) => event.type === 'sea-leg-completed');
    const navalEvents = events.filter((event) => event.type === 'naval-engaged');
    const causality = evaluateStrategicSailingCausality({
      storageWrites: terminalBoundaryTrace.storageWrites,
      lifecycle: terminalBoundaryTrace.lifecycle,
      navigationEvents: navigationEvents.map((event) => event.payload.navigationRng),
      navalEvents: navalEvents.map((event) => event.payload.navalRng),
      initialNavigationRng: initialState.rng.navigation,
      returnedNavigationRng: returnedEnvelope.payload.state.rng.navigation,
      initialNavalRng: initialState.rng.naval,
      returnedNavalRng: returnedEnvelope.payload.state.rng.naval,
      persistedNavalInputSeed: navalEnvelope.payload.state.mode.input.seed,
      initialWorldRng: initialState.rng.world,
      returnedWorldRng: returnedEnvelope.payload.state.rng.world,
    });
    invariant(causality.persistedBeforeMount, 'naval input was not persisted before the first public mount');
    invariant(causality.campaignWritesDuringBattle === 0,
      `campaign wrote ${causality.campaignWritesDuringBattle} times while battle was live`);
    invariant(causality.navigationTransitionsVerified, 'navigation RNG lineage was not independently verified');
    invariant(causality.navalTransitionVerified, 'naval RNG lineage was not independently verified');
    invariant(causality.worldUnchanged, 'world RNG changed during strategic sailing');
    const firstEncounterShip = firstEncounterEnvelope.payload.state.fleet.ships[0];
    const avoidedShip = avoidedEnvelope.payload.state.fleet.ships[0];
    const accessibility = minimumStrategicAccessibility(accessibilitySamples);
    const evidence = {
      status: 'verified',
      modeSequence,
      eventIds: events.map((event) => event.id),
      eventTypes: events.map((event) => event.type),
      outbound: {
        elapsedDays: firstEncounterEnvelope.payload.state.calendar.elapsedDays - firstSailingEnvelope.payload.state.calendar.elapsedDays,
        provisionsUsed: firstSailingEnvelope.payload.state.fleet.ships[0].cargo.provisions - firstEncounterShip.cargo.provisions,
      },
      return: {
        elapsedDays: avoidedEnvelope.payload.state.calendar.elapsedDays - firstEncounterEnvelope.payload.state.calendar.elapsedDays,
        provisionsUsed: firstEncounterShip.cargo.provisions - avoidedShip.cargo.provisions,
      },
      rng: {
        navigationTransitionsVerified: causality.navigationTransitionsVerified,
        navalTransitionVerified: causality.navalTransitionVerified,
        worldUnchanged: causality.worldUnchanged,
      },
      navalInput: {
        persistedBeforeMount: causality.persistedBeforeMount,
        byteEqualAfterReload: savedInputBytes === canonicalJson(reloadedNavalEnvelope.payload.state.mode.input),
        tickAfterReload,
      },
      resolution: {
        outcome: terminal.outcome.kind,
        victorShipId: terminal.outcome.victorShipId,
        atTick: terminal.atTick,
        seedAfter: terminal.seedAfter,
        exactlyOnce: resolutionEvents.length === 1,
        campaignWritesDuringBattle: causality.campaignWritesDuringBattle,
        returnedTo: returnedEnvelope.payload.state.mode.portId,
      },
      recovery: { intermediateModeRecovered, unreadableBytesPreserved },
      completion,
      focus,
      accessibility,
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
        ...phaseNavalCounts,
        pursuitLocalNavalAssets: emittedNaval.urls.every((url) => failures.requestedPaths.includes(url)),
        externalCount: failures.external.length,
        failedCount: failures.requests.length,
      },
      fallback: { htmlChartVisible: true, battleControlsUsable: true },
      screenshots: STRATEGIC_SCREENSHOTS,
      isolation: {
        productionNavalEmitted: emittedNaval.urls.length === 3,
        productionNavalPrecached: emittedNaval.precacheVerified === true,
        requestedBeforePursuit: Object.values(phaseNavalCounts).some((count) => count !== 0),
        requestedAfterPursuit: emittedNaval.urls.every((url) => failures.requestedPaths.includes(url)),
        harnessMarkersAbsent: true,
        harnessPreviewAbsent: true,
      },
    };
    return {
      ...evidence,
      clock: {
        tickAtMount,
        tickAfterFirstRaf,
        firstPublishedTick,
        tickAtTerminalCapture,
        renderedRudderReleasedAt140ms,
      },
      fixtures: { nowConsumed: routeNowConsumed },
      screenshotBytes: screenshots,
      screenshotStates,
    };
  } finally {
    await context.close();
  }
}

async function runBattleUiCheck() {
  await buildNormalProduction();
  const { server, baseUrl } = await startStaticServer();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-battle-ui-'));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      reducedMotion: 'reduce',
    });
    await installBrowserBoundary(context);
    const page = await context.newPage();
    const failures = { console: [], page: [], requests: [], external: [], requestedPaths: [] };
    recordFailures(page, baseUrl, failures);
    const screenshots = new Map();
    try {
      await page.clock.install({ time: new Date('2023-11-14T22:13:20.000Z') });
      await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Start career' }).click();
      await page.getByTestId('caribbean-career-ready').waitFor();
      await page.getByRole('button', { name: 'Tavern' }).click();
      await page.getByRole('button', { name: 'Mark on chart' }).click();
      await page.getByText("Marked in the Captain's Log").waitFor();

      await page.getByTestId('port-action-set-sail').click();
      await page.getByTestId('voyage-continue-east').waitFor();
      await page.getByTestId('voyage-continue-east').click();
      await page.getByTestId('encounter-avoid').waitFor();
      await page.getByTestId('encounter-avoid').click();
      await page.getByTestId('caribbean-career-ready').waitFor();

      await page.getByTestId('port-action-set-sail').click();
      await page.getByTestId('voyage-continue-east').waitFor();
      await page.getByTestId('voyage-continue-east').click();
      await page.getByTestId('encounter-pursue').waitFor();
      await page.clock.pauseAt(new Date('2023-11-14T22:13:30.000Z'));
      await page.getByTestId('encounter-pursue').click();
      await page.getByTestId('naval-elapsed').waitFor();
      invariant(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick') === '0', 'campaign-battle-did-not-start-at-tick-zero');
      const navalRaw = await readActiveEnvelope(page);
      const navalEnvelope = await readVoyageEnvelope(page, 'naval');
      const navalTraceInput = {
        battleId: navalEnvelope.payload.state.mode.input.battleId,
        seed: navalEnvelope.payload.state.mode.input.seed,
      };
      invariant(navalEnvelope.payload.events.at(-1)?.type === 'naval-engaged', 'missing-naval-engaged-event');
      invariant(
        canonicalJson(navalTraceInput) === canonicalJson(CAMPAIGN_VICTORY_TRACE.input),
        `campaign-battle-input-does-not-match-golden-trace-${canonicalJson(navalTraceInput)}`,
      );
      await page.getByText('3D tactical sea restored.').waitFor();
      await page.clock.runFor(16);
      invariant(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick') === '0', 'visual-prime-advanced-campaign-battle');
      await captureBattle(page, screenshots, directory, 'campaign-battle-desktop.png');
      await assertBattleControlHitTargets(page);
      await verifyRenderedRudderRelease(page);

      const terminal = await driveCampaignVictory({
        page,
        trace: CAMPAIGN_VICTORY_TRACE,
        clockPrimed: true,
        timeoutMs: 600_000,
      });
      invariant(canonicalJson(terminal) === canonicalJson(CAMPAIGN_VICTORY_TRACE.expected), 'campaign-battle-terminal-result-drifted');
      await captureBattle(page, screenshots, directory, 'campaign-result-desktop.png');
      await page.getByTestId('naval-result-action').click();
      await page.getByTestId('caribbean-career-ready').waitFor();
      invariant(await page.getByTestId('port-action-log').evaluate((element) => element === document.activeElement), 'battle-return-did-not-focus-captains-log');

      const returnedEnvelope = await readVoyageEnvelope(page, 'port');
      invariant(returnedEnvelope.payload.events.length === 8, `battle-return-event-count-${returnedEnvelope.payload.events.length}`);
      invariant(returnedEnvelope.payload.events.at(-1)?.type === 'naval-resolved', 'missing-naval-resolved-event');
      invariant(returnedEnvelope.payload.state.calendar.elapsedDays === 4, 'battle-return-day-drifted');
      invariant(returnedEnvelope.payload.state.world.lastVoyage?.outcome?.kind === 'boarding-ready', 'battle-return-summary-drifted');
      invariant(returnedEnvelope.payload.state.fleet.ships[0]?.hull === 100, 'battle-damage-leaked-into-campaign');
      await page.getByTestId('port-action-log').click();
      await page.getByTestId('captains-log-last-voyage').waitFor();
      invariant(await page.getByTestId('captains-log-last-voyage').getByText('Victory — Red Jackdaw ready to board · Returned on day 4.').isVisible(), 'returned-log-missing-safe-victory-summary');
      await captureBattle(page, screenshots, directory, 'returned-log-desktop.png');

      await page.addInitScript(() => {
        const nativeGetContext = HTMLCanvasElement.prototype.getContext;
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
          configurable: true,
          value(type, ...args) {
            return String(type).startsWith('webgl') ? null : nativeGetContext.call(this, type, ...args);
          },
        });
      });
      await page.evaluate(({ currentKey, raw }) => {
        localStorage.setItem(currentKey, raw);
        window.location.hash = '#/caribbean?resume=1';
      }, { currentKey: CURRENT_SAVE_KEY, raw: navalRaw });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByTestId('naval-html-chart').waitFor();
      invariant(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick') === '0', 'fallback-battle-did-not-resume-at-tick-zero');
      await captureBattle(page, screenshots, directory, 'campaign-battle-fallback.png');

      await page.setViewportSize({ width: 1024, height: 1366 });
      await page.getByTestId('caribbean-minimum-screen').waitFor();
      await page.evaluate(() => { window.location.hash = '#/caribbean'; });
      await captureBattle(page, screenshots, directory, 'campaign-battle-resize-notice.png');
      await page.setViewportSize({ width: 1440, height: 900 });
      try {
        await page.getByTestId('naval-elapsed').waitFor({ timeout: 3_000 });
      } catch {
        throw new Error('support-restored-resume');
      }
      invariant(await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick') === '0', 'support-restored-battle-did-not-restart-at-tick-zero');
      const restoredInput = (await readVoyageEnvelope(page, 'naval')).payload.state.mode.input;
      invariant(canonicalJson({ battleId: restoredInput.battleId, seed: restoredInput.seed }) === canonicalJson(CAMPAIGN_VICTORY_TRACE.input), 'support-restored-battle-input-drifted');

      failures.console = [...new Set(failures.console)].filter((message) => (
        !message.includes('THREE.WebGLRenderer: Error creating WebGL context')
      ));
      failures.page = [...new Set(failures.page)];
      failures.requests = [...new Set(failures.requests)];
      failures.external = [...new Set(failures.external)];
      invariant(failures.console.length === 0, `battle-console-errors-${failures.console.join('|')}`);
      invariant(failures.page.length === 0, `battle-page-errors-${failures.page.join('|')}`);
      invariant(failures.requests.length === 0, `battle-request-errors-${failures.requests.join('|')}`);
      invariant(failures.external.length === 0, `battle-external-requests-${failures.external.join('|')}`);
      invariant(BATTLE_SCREENSHOTS.every((filename) => screenshots.has(filename)), 'incomplete-battle-screenshot-set');
      for (const filename of BATTLE_SCREENSHOTS) saveIfChanged(filename, screenshots.get(filename));
      console.log(`CARIBBEAN_BATTLE_UI_OK screenshots=${BATTLE_SCREENSHOTS.length}`);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    await stopStaticServer(server);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function runPortMemoryWarningProbe(browser, baseUrl, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  });
  await installBrowserBoundary(context);
  const page = await context.newPage();
  const failures = { console: [], page: [], requests: [], external: [], requestedPaths: [] };
  recordFailures(page, baseUrl, failures);
  try {
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => { window.__CARIBBEAN_PORT_CHECK__.failNextStorageWrite = true; });
    const controlViewport = { ...viewport, supported: true, requireRouteHitTest: true, requireRouteContainment: true };
    await readLayout(page, `memorySetup${viewport.width}x${viewport.height}`, controlViewport);
    await page.getByRole('button', { name: 'Start career' }).click();
    await page.getByRole('button', { name: 'Continue without saving' }).waitFor();
    await readLayout(page, `memoryConsent${viewport.width}x${viewport.height}`, controlViewport);
    await page.getByRole('button', { name: 'Continue without saving' }).click();
    await page.getByTestId('caribbean-career-ready').waitFor();
    await page.getByText('This career is not being saved. Keep this tab open.').waitFor();
    await settle(page);
    const geometry = await page.evaluate((viewport) => {
      const wrapper = document.querySelector('.caribbean-production');
      const warning = document.querySelector('.caribbean-memory-warning');
      const commandRail = document.querySelector('.caribbean-port-menu');
      if (!(wrapper instanceof HTMLElement) || !(warning instanceof HTMLElement) || !(commandRail instanceof HTMLElement)) {
        throw new Error('Memory warning geometry requires the port wrapper, warning, and command rail');
      }
      const warningRect = warning.getBoundingClientRect();
      const commandRect = commandRail.getBoundingClientRect();
      return {
        viewport,
        wrapperClasses: [...wrapper.classList],
        warning: { top: warningRect.top, bottom: warningRect.bottom },
        commandRail: { top: commandRect.top, bottom: commandRect.bottom },
        clearance: commandRect.top - warningRect.bottom,
      };
    }, viewport);
    invariant(geometry.wrapperClasses.includes('caribbean-production--port'), 'memory-warning-missing-port-wrapper');
    invariant(
      geometry.clearance >= 8,
      `memory-warning-clearance-below-8px-${JSON.stringify(geometry)}`,
    );
    invariant(failures.console.length === 0, `Memory warning console errors: ${failures.console.join(' | ')}`);
    invariant(failures.page.length === 0, `Memory warning page errors: ${failures.page.join(' | ')}`);
    invariant(failures.requests.length === 0, `Memory warning failed requests: ${failures.requests.join(' | ')}`);
    invariant(failures.external.length === 0, `Memory warning external requests: ${failures.external.join(' | ')}`);
    return geometry;
  } finally {
    await context.close();
  }
}

async function runJourney(browser, baseUrl, runDirectory, emittedArt, emittedNaval, assetReport) {
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
  const screenshotStates = new Map();
  const layouts = {};
  let metrics;
  try {
    console.log('Checking setup identity and Bridgetown journey…');
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'networkidle' });
    invariant(await page.getByRole('heading', { name: 'Sign a captain’s commission' }).isVisible(), 'Production route did not reach setup');
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'setup');
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
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'port');
    const menuLabels = await page.locator('[aria-label="Bridgetown activities"] button').allTextContents();
    invariant(canonicalJson(menuLabels.map((label) => label.trim())) === canonicalJson(PORT_ORDER), `Wrong port order: ${JSON.stringify(menuLabels)}`);
    invariant(await page.getByRole('button', { name: 'Set Sail' }).isDisabled(), 'Set Sail is not visibly unavailable');
    invariant(await page.getByText('Mark the Red Jackdaw rumour in the Tavern first.').isVisible(), 'Set Sail reason is not visible');
    layouts.portDesktop = await readLayout(page, 'portDesktop', VIEWPORTS.portDesktop);
    await capture(page, screenshots, runDirectory, 'port-desktop.png');

    await page.setViewportSize({ width: VIEWPORTS.portTabletLandscape.width, height: VIEWPORTS.portTabletLandscape.height });
    layouts.portTabletLandscape = await readLayout(page, 'portTabletLandscape', VIEWPORTS.portTabletLandscape);
    await capture(page, screenshots, runDirectory, 'port-tablet-landscape.png');
    await page.setViewportSize({ width: VIEWPORTS.portCompactLandscape.width, height: VIEWPORTS.portCompactLandscape.height });
    layouts.portCompactLandscape = await readLayout(page, 'portCompactLandscape', VIEWPORTS.portCompactLandscape);
    await capture(page, screenshots, runDirectory, 'port-compact-landscape.png');
    await page.setViewportSize({ width: VIEWPORTS.portDesktop.width, height: VIEWPORTS.portDesktop.height });

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
    await page.setViewportSize({ width: 960, height: 600 });
    await readLayout(page, 'recoveryMinimumControls', {
      ...VIEWPORTS.minimumSupported,
      requireRouteHitTest: true,
      requireRouteContainment: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });

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
    await page.getByTestId('booth-profile-pronouns').fill('she/her');
    await page.getByTestId('booth-profile-save').click();
    await page.getByText('she/her').waitFor();
    const persistedProfile = await page.evaluate(() => {
      const raw = localStorage.getItem('arcade.users.v1');
      return raw === null ? null : JSON.parse(raw).users.find((user) => user.id === 'port-check-player')?.profile;
    });
    invariant(
      persistedProfile?.name === 'Port Profile' && persistedProfile?.pronouns === 'she/her',
      'Booth profile did not persist name and pronouns together',
    );
    const postProfileEnvelope = verifyEnvelope(await readActiveEnvelope(page), 'site-wide profile change');
    invariant(
      postProfileEnvelope.payload.state.captain.name === 'Mario' && postProfileEnvelope.payload.state.captain.pronouns === 'they/them',
      'Editing the site-wide profile rewrote the existing campaign identity snapshot',
    );
    await page.getByTestId('booth-edit-profile').click();
    const playerProfileDesktop = await readPlayerProfileLayout(page, 'desktop', { width: 1440, height: 900 }, 'she/her');
    layouts.profileDesktop = await readLayout(page, 'profileDesktop', VIEWPORTS.profileDesktop);
    const preNormalizationProfileState = await readProfileScreenshotState(page);
    invariant(
      profileScreenshotReadinessErrors(preNormalizationProfileState).includes('profile screenshot retains an interactive focus target'),
      'Player profile screenshot readiness probe did not observe the expected post-focus interactive target',
    );
    screenshotStates.set('player-profile-desktop.png', await preparePlayerProfileScreenshot(page));
    await capture(page, screenshots, runDirectory, 'player-profile-desktop.png');
    await page.setViewportSize({ width: 960, height: 600 });
    const playerProfileNarrow = await readPlayerProfileLayout(page, 'narrow', { width: 960, height: 600 }, 'she/her');
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
    assertNoNavalAssetRequests(failures.requestedPaths, emittedNaval, 'port-journey');
    invariant(!failures.requestedPaths.some((requestPath) => requestPath.includes('preview-caribbean')), 'Production route requested preview-caribbean');

    const marketSamples = await runMarketProbe(browser, baseUrl);
    console.log('Checking painted harbour art, focal crops, contrast, geometry, and fallback…');
    const artEvidence = await captureArtEvidence(
      browser,
      baseUrl,
      runDirectory,
      screenshots,
      emittedArt,
      assetReport.subjectRoi,
    );
    layouts.artFallback = artEvidence.fallbackLayout;
    const supportedLayouts = [
      layouts.setupDesktop, layouts.portDesktop, layouts.portTabletLandscape, layouts.portCompactLandscape,
      layouts.artFallback, marketLayout, tavernLayout, logLayout, layouts.minimumSupported, recoveryLayout,
    ];
    const artViewports = artEvidence.viewports;
    const artLeaves = artViewports.flatMap((viewport) => [
      ...viewport.menuGeometry.leaves,
      ...viewport.marketGeometry.leaves,
    ]);
    const artOverlaps = artViewports.flatMap((viewport) => [
      ...viewport.menuGeometry.overlapPairs,
      ...viewport.marketGeometry.overlapPairs,
    ]);
    const artContrasts = artViewports.flatMap((viewport) => [
      ...viewport.contrasts,
      ...viewport.activityContrasts,
    ]);
    const marketVerdict = validateMarketStability(marketSamples);
    invariant(marketVerdict.ok, 'Market probe did not produce a verified final stability summary');
    const profile = {
      status: 'setup-verified',
      defaultPronouns: 'he/him',
      boothProfilePersisted: persistedProfile?.name === 'Port Profile' && persistedProfile?.pronouns === 'she/her',
      setup: setupIdentity,
    };
    const art = {
      status: 'verified',
      asset: 'src/games/caribbean/assets/bridgetown-1675.webp',
      emitted: emittedArt,
      report: {
        historicalReview: assetReport.historicalReview,
        representationReview: assetReport.representationReview,
        subjectRoi: assetReport.subjectRoi,
        sha256: assetReport.sha256,
      },
      screenshots: {
        normal: ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}.png`),
        fallback: ART_VIEWPORT_SPECS.map(({ name }) => `port-art-${name}-fallback.png`),
      },
      viewports: artViewports,
    };
    const market = { status: 'verified', samples: marketSamples };
    const marketHorizontalOverflow = marketSamples.reduce((total, sample) => total + Number(
      sample.stageScrollWidth > sample.stageClientWidth
      || sample.rowsScrollWidth > sample.rowsClientWidth
      || sample.scrollLeft !== 0
      || sample.actionStripWidths.some((entry) => entry.scrollWidth > entry.clientWidth),
    ), 0);
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
        caribbeanGlbAbsent: false,
        glbRequested: false,
        previewResourceRequested: false,
        moduleMarkersAbsent: false,
        battleCssAbsent: false,
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
      packagePhase: 'complete',
      profile,
      profileIdentity: {
        status: 'verified',
        defaultPronouns: profile.defaultPronouns,
        setupNamePrefilled: profile.setup.prefill.captainName === 'Mario',
        setupPronounsPrefilled: profile.setup.prefill.pronouns === profile.defaultPronouns,
        campaignSnapshotPreserved: profile.setup.sharedPronounSnapshot.profile === 'they/them'
          && profile.setup.sharedPronounSnapshot.campaign === 'they/them',
        careerLengthControlAbsent: profile.setup.careerLengthControlPresent === false,
        newCampaignLength: setupEnvelope.payload.state.career.length,
      },
      art: {
        ...art,
        loaded: artViewports.every((viewport) => viewport.naturalSize.width === 1920 && viewport.naturalSize.height === 1080),
        localRequest: /^\/assets\/bridgetown-1675-[^/]+\.webp$/.test(art.emitted.url),
        naturalWidth: artViewports[0].naturalSize.width,
        naturalHeight: artViewports[0].naturalSize.height,
        fallbackVerified: art.screenshots.fallback.length === ART_VIEWPORT_SPECS.length,
        precached: art.emitted.precached,
        historicalReview: art.report.historicalReview,
        representationReview: art.report.representationReview,
        focalVisibleAt: artViewports.map((viewport) => `${viewport.viewport.width}x${viewport.viewport.height}`),
        minimumSubjectRoiVisibleFraction: Math.min(...artViewports.map((viewport) => viewport.focal.roiVisibleRatio)),
        minimumTextContrast: Math.min(...artContrasts.map((sample) => sample.minimumRatio)),
        overlapCount: artOverlaps.length,
        clippingCount: artLeaves.filter((leaf) => !leaf.contained || leaf.horizontalOverflowPx !== 0 || leaf.verticalOverflowPx !== 0).length,
        sha256: art.report.sha256,
      },
      market,
      marketStability: {
        status: 'verified',
        sampleCount: market.samples.length,
        actionIds: [...new Set(market.samples.map((sample) => sample.actionTestId))].sort(),
        maxDrift: marketVerdict.maxDrift,
        horizontalOverflow: marketHorizontalOverflow,
        focusPreserved: market.samples.every((sample) => sample.focusedTestId === sample.actionTestId),
        busyStatesVerified: market.samples.every((sample) => sample.ariaBusy === (sample.phase === 'pending')),
        statusesVerified: market.samples.every((sample) => sample.status === (sample.phase === 'before' ? '' : sample.phase === 'pending' ? 'Saving trade.' : 'Cargo ledger updated.')),
      },
    };
    assertRequestedGraphIsolation(metrics);
    return { metrics, screenshots, screenshotStates };
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

async function pixelMismatchStats(firstBytes, secondBytes) {
  const [first, second] = await Promise.all([
    sharp(firstBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(secondBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (first.info.width !== second.info.width || first.info.height !== second.info.height || first.info.channels !== second.info.channels) {
    return { dimensionsMatch: false, first: first.info, second: second.info };
  }
  let changedPixels = 0;
  let changedChannels = 0;
  let totalAbsoluteDelta = 0;
  let maximumChannelDelta = 0;
  let minX = first.info.width;
  let minY = first.info.height;
  let maxX = -1;
  let maxY = -1;
  const coordinates = [];
  for (let offset = 0; offset < first.data.length; offset += first.info.channels) {
    let pixelChanged = false;
    const delta = [];
    for (let channel = 0; channel < first.info.channels; channel += 1) {
      const value = Math.abs(first.data[offset + channel] - second.data[offset + channel]);
      delta.push(value);
      if (value !== 0) {
        pixelChanged = true;
        changedChannels += 1;
        totalAbsoluteDelta += value;
        maximumChannelDelta = Math.max(maximumChannelDelta, value);
      }
    }
    if (!pixelChanged) continue;
    changedPixels += 1;
    const pixel = offset / first.info.channels;
    const x = pixel % first.info.width;
    const y = Math.floor(pixel / first.info.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (coordinates.length < 32) coordinates.push({ x, y, first: [...first.data.subarray(offset, offset + first.info.channels)], second: [...second.data.subarray(offset, offset + second.info.channels)], delta });
  }
  return {
    dimensionsMatch: true, width: first.info.width, height: first.info.height, channels: first.info.channels,
    changedPixels, changedChannels, totalAbsoluteDelta, maximumChannelDelta,
    bounds: changedPixels === 0 ? null : { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
    coordinates,
  };
}

function jsonPointerComponent(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function firstDifferingJsonPointer(first, second, pointer = '') {
  if (Object.is(first, second)) return null;
  if (Array.isArray(first) || Array.isArray(second)) {
    if (!Array.isArray(first) || !Array.isArray(second)) return pointer;
    const length = Math.max(first.length, second.length);
    for (let index = 0; index < length; index += 1) {
      const nextPointer = `${pointer}/${index}`;
      if (index >= first.length || index >= second.length) return nextPointer;
      const difference = firstDifferingJsonPointer(first[index], second[index], nextPointer);
      if (difference !== null) return difference;
    }
    return null;
  }
  const firstIsObject = first !== null && typeof first === 'object';
  const secondIsObject = second !== null && typeof second === 'object';
  if (!firstIsObject || !secondIsObject) return pointer;
  const keys = [...new Set([...Object.keys(first), ...Object.keys(second)])].sort();
  for (const key of keys) {
    const nextPointer = `${pointer}/${jsonPointerComponent(key)}`;
    if (!Object.prototype.hasOwnProperty.call(first, key)
      || !Object.prototype.hasOwnProperty.call(second, key)) return nextPointer;
    const difference = firstDifferingJsonPointer(first[key], second[key], nextPointer);
    if (difference !== null) return difference;
  }
  return null;
}

function safeMismatchDiagnosticDirectory(directory) {
  invariant(typeof directory === 'string' && directory.trim().length > 0,
    'port mismatch diagnostic directory is invalid');
  const resolved = path.resolve(directory);
  const allowedRoots = [path.resolve(os.tmpdir()), path.resolve('/private/tmp')];
  invariant(allowedRoots.some((root) => resolved !== root && insideDirectory(resolved, root)),
    'port mismatch diagnostic directory must be a child of a temporary root');
  return resolved;
}

function clearMismatchDiagnostics(directory) {
  fs.rmSync(safeMismatchDiagnosticDirectory(directory), { recursive: true, force: true });
}

async function preserveScreenshotMismatch(
  filename,
  first,
  second,
  deadline,
  { diagnosticDirectory, failure },
) {
  deadline.throwIfExpired();
  const outputDirectory = safeMismatchDiagnosticDirectory(diagnosticDirectory);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const stem = filename.replace(/\.png$/, '');
  const firstBytes = first.screenshots.get(filename);
  const secondBytes = second.screenshots.get(filename);
  const firstState = first.screenshotStates.get(filename) ?? null;
  const secondState = second.screenshotStates.get(filename) ?? null;
  const firstCanonicalMetrics = Buffer.from(`${canonicalJson(first.metrics)}\n`);
  const secondCanonicalMetrics = Buffer.from(`${canonicalJson(second.metrics)}\n`);
  const observation = first.metrics.screenshotEvidence?.observation;
  let pixelStats;
  try {
    pixelStats = await pixelMismatchStats(firstBytes, secondBytes);
  } catch (error) {
    pixelStats = { error: error instanceof Error ? error.message : String(error) };
  }
  publishFiles([
    [`${stem}-run-a.png`, firstBytes],
    [`${stem}-run-b.png`, secondBytes],
    ['metrics-run-a.canonical.json', firstCanonicalMetrics],
    ['metrics-run-b.canonical.json', secondCanonicalMetrics],
    [`${stem}-mismatch.json`, `${JSON.stringify({
      filename,
      failure,
      sha256: {
        runA: createHash('sha256').update(firstBytes).digest('hex'),
        runB: createHash('sha256').update(secondBytes).digest('hex'),
      },
      canonicalMetricsSha256: {
        runA: createHash('sha256').update(firstCanonicalMetrics).digest('hex'),
        runB: createHash('sha256').update(secondCanonicalMetrics).digest('hex'),
      },
      semanticDigest: {
        runA: observation?.runA?.semanticDigest ?? createHash('sha256').update(canonicalJson(firstState)).digest('hex'),
        runB: observation?.runB?.semanticDigest ?? createHash('sha256').update(canonicalJson(secondState)).digest('hex'),
      },
      firstDifferingPaths: {
        semanticState: firstDifferingJsonPointer(firstState, secondState),
        canonicalMetrics: firstDifferingJsonPointer(first.metrics, second.metrics),
      },
      pixelStats,
      runA: firstState,
      runB: secondState,
    }, null, 2)}\n`],
  ], outputDirectory, deadline);
}

function createNormalRouteScreenshotEvidence(first, second) {
  const filename = 'campaign-result-desktop.png';
  const createObservation = (run) => {
    const bytes = run.screenshots.get(filename);
    const semanticState = run.screenshotStates.get(filename);
    return {
      pngSignatureVerified: true,
      nonzeroBytes: bytes.length > 0,
      width: 1440,
      height: 900,
      pngSha256: createHash('sha256').update(bytes).digest('hex'),
      semanticDigest: createHash('sha256').update(canonicalJson(semanticState)).digest('hex'),
      semanticState,
    };
  };
  return {
    expectedCount: 23,
    byteComparedCount: 22,
    comparisonExceptionNames: [filename],
    trackedCapture: 'run-a',
    observation: {
      filename,
      kind: 'webgl-composited-terminal',
      width: 1440,
      height: 900,
      semanticDigestAlgorithm: 'sha256-canonical-json-v1',
      runA: createObservation(first),
      runB: createObservation(second),
    },
  };
}

function normalRouteScreenshotRun(run, tag) {
  const failures = run.metrics.failures;
  const expectedNames = [...SCREENSHOTS, ...STRATEGIC_SCREENSHOTS];
  return {
    run: tag,
    screenshotBuffers: new Map(expectedNames.map((name) => [name, run.screenshots.get(name)])),
    semanticStates: new Map([[
      'campaign-result-desktop.png',
      run.screenshotStates.get('campaign-result-desktop.png'),
    ]]),
    checks: {
      routeFailures: 0,
      requestFailures: failures.requests.length,
      consoleFailures: failures.console.length,
      pageFailures: failures.page.length,
      semanticProbesPassed: true,
    },
  };
}

export async function compareRuns(
  first,
  second,
  deadline,
  { diagnosticDirectory = MISMATCH_DIAGNOSTIC_DIRECTORY } = {},
) {
  const diagnosticOutput = safeMismatchDiagnosticDirectory(diagnosticDirectory);
  clearMismatchDiagnostics(diagnosticOutput);
  const diagnosticsEnabled = process.env.CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS === '1';
  const screenshotEvidence = createNormalRouteScreenshotEvidence(first, second);
  first.metrics.screenshotEvidence = screenshotEvidence;
  second.metrics.screenshotEvidence = screenshotEvidence;
  const preserveFailure = (failure) => diagnosticsEnabled
    ? preserveScreenshotMismatch('campaign-result-desktop.png', first, second, deadline, {
      diagnosticDirectory: diagnosticOutput,
      failure,
    })
    : Promise.resolve();
  for (const [runName, run] of [['A', first], ['B', second]]) {
    const verdict = evaluatePortIdentityEvidence(run.metrics);
    if (!verdict.ok) {
      await preserveFailure({ stage: 'evaluator', run: runName, issues: verdict.issues });
      invariant(false, `Caribbean port identity evidence failed: ${verdict.issues.join(' | ')}`);
    }
  }
  const comparison = compareNormalRouteScreenshotRuns({
    expectedNames: [...SCREENSHOTS, ...STRATEGIC_SCREENSHOTS],
    runA: normalRouteScreenshotRun(first, 'A'),
    runB: normalRouteScreenshotRun(second, 'B'),
    declaredEvidence: screenshotEvidence,
  });
  if (!comparison.ok) {
    await preserveFailure({ stage: 'comparator', run: null, issues: comparison.issues });
    invariant(false, `Normal-route screenshot comparison failed: ${comparison.issues.join(' | ')}`);
  }
  invariant(canonicalJson(comparison.screenshotEvidence) === canonicalJson(screenshotEvidence),
    'Normal-route screenshot comparison changed its declaration');
  const firstMetrics = Buffer.from(`${JSON.stringify(first.metrics, null, 2)}\n`);
  const secondMetrics = Buffer.from(`${JSON.stringify(second.metrics, null, 2)}\n`);
  if (!firstMetrics.equals(secondMetrics)) {
    await preserveFailure({
      stage: 'canonical-metrics',
      run: null,
      issues: ['Two clean browser runs produced different metrics.json bytes'],
    });
    invariant(false, 'Two clean browser runs produced different metrics.json bytes');
  }
  return { metricsBytes: firstMetrics, comparison };
}

function attachStrategicEvidence(run, strategic) {
  const evidence = Object.fromEntries(Object.entries(strategic).filter(([key]) => (
    key !== 'clock' && key !== 'completion' && key !== 'fixtures'
      && key !== 'screenshotBytes' && key !== 'screenshotStates'
  )));
  run.metrics.schemaVersion = 3;
  run.metrics.strategicSailing = evidence;
  run.metrics.determinism = {
    cleanRuns: 2,
    metricsByteIdentical: true,
    screenshotsByteIdentical: false,
    byteComparedScreenshotsIdentical: true,
  };
  for (const [filename, bytes] of strategic.screenshotBytes) run.screenshots.set(filename, bytes);
  for (const [filename, state] of strategic.screenshotStates) run.screenshotStates.set(filename, state);
}

async function runPortCheckOperationCore({ outputDirectory, signal, deadline, dependencies = {} }) {
  invariant(signal instanceof AbortSignal, 'port evidence operation signal is invalid');
  const operationDeadline = deadline ?? passivePortDeadline(signal);
  const services = {
    build: buildNormalProduction,
    assertIsolation: assertNormalBuildIsolation,
    readArt: readEmittedArt,
    readNaval: readEmittedNavalAssets,
    readAssetReport: () => JSON.parse(fs.readFileSync(path.join(
      ROOT, 'docs/games/caribbean-career/bridgetown-asset-report.json',
    ), 'utf8')),
    startServer: startStaticServer,
    verifyArtResponse: verifyEmittedArtResponse,
    launchBrowser: () => chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined }),
    stopServer: stopStaticServer,
    makeRunDirectory: () => fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-port-run-')),
    removeRunDirectory: (directory) => fs.rmSync(directory, { recursive: true, force: true }),
    afterResourcesStarted: () => {},
    ...dependencies,
  };
  await operationDeadline.race(services.build(signal));
  operationDeadline.throwIfExpired();
  services.assertIsolation();
  const emittedArt = services.readArt();
  const emittedNaval = services.readNaval();
  const assetReport = services.readAssetReport();
  operationDeadline.throwIfExpired();
  let server;
  let baseUrl;
  let browser;
  let browserClosePromise;
  let firstDirectory;
  let secondDirectory;
  const runDirectories = [];
  const closeBrowser = () => {
    if (browser === undefined) return Promise.resolve();
    browserClosePromise ??= Promise.resolve().then(() => browser.close());
    return browserClosePromise;
  };
  const abortBrowser = () => { void closeBrowser(); };
  signal.addEventListener('abort', abortBrowser, { once: true });
  try {
    const started = await operationDeadline.race(
      services.startServer(signal),
      { onLateResolve: (resource) => services.stopServer(resource.server) },
    );
    server = started.server;
    baseUrl = started.baseUrl;
    operationDeadline.throwIfExpired();
    firstDirectory = services.makeRunDirectory('A');
    runDirectories.push(firstDirectory);
    secondDirectory = services.makeRunDirectory('B');
    runDirectories.push(secondDirectory);
    await operationDeadline.race(services.verifyArtResponse(baseUrl, emittedArt, signal));
    operationDeadline.throwIfExpired();
    browser = await operationDeadline.race(
      services.launchBrowser(signal),
      { onLateResolve: (lateBrowser) => lateBrowser.close() },
    );
    operationDeadline.throwIfExpired();
    await operationDeadline.race(services.afterResourcesStarted({
      browser,
      server,
      baseUrl,
      runDirectories: [...runDirectories],
    }));
    operationDeadline.throwIfExpired();
    console.log('Running deterministic browser journey A…');
    const first = await operationDeadline.race(
      runJourney(browser, baseUrl, firstDirectory, emittedArt, emittedNaval, assetReport),
    );
    operationDeadline.throwIfExpired();
    assertRequestedGraphIsolation(first.metrics);
    const firstStrategic = await operationDeadline.race(runStrategicSailingJourney({
      browser,
      baseUrl,
      runDirectory: firstDirectory,
      emittedNaval,
    }));
    operationDeadline.throwIfExpired();
    attachStrategicEvidence(first, firstStrategic);
    console.log('Running deterministic browser journey B…');
    const second = await operationDeadline.race(
      runJourney(browser, baseUrl, secondDirectory, emittedArt, emittedNaval, assetReport),
    );
    operationDeadline.throwIfExpired();
    assertRequestedGraphIsolation(second.metrics);
    const secondStrategic = await operationDeadline.race(runStrategicSailingJourney({
      browser,
      baseUrl,
      runDirectory: secondDirectory,
      emittedNaval,
    }));
    operationDeadline.throwIfExpired();
    attachStrategicEvidence(second, secondStrategic);
    console.log('Checking memory-only port warning clearance at desktop and exact supported minimum…');
    await operationDeadline.race(runPortMemoryWarningProbe(browser, baseUrl, { width: 960, height: 600 }));
    await operationDeadline.race(runPortMemoryWarningProbe(browser, baseUrl, { width: 1440, height: 900 }));
    operationDeadline.throwIfExpired();
    const { metricsBytes, comparison } = await operationDeadline.race(compareRuns(first, second, operationDeadline));
    operationDeadline.throwIfExpired();
    const publication = publishNormalRouteComparison({
      comparison,
      metricsBytes,
      outputDirectory,
      deadline: operationDeadline,
    });
    console.log(`Caribbean port evidence passed: 22 byte-identical screenshots plus one terminal WebGL observation; run A selected, integrated route resolved, recovery reloaded.`);
    return { metrics: first.metrics, comparison, publication };
  } finally {
    signal.removeEventListener('abort', abortBrowser);
    try {
      await operationDeadline.cleanup(closeBrowser());
    } finally {
      try {
        if (server !== undefined) await operationDeadline.cleanup(services.stopServer(server));
      } finally {
        for (const directory of runDirectories) services.removeRunDirectory(directory);
      }
    }
  }
}

export async function runPortCheckOperation({ outputDirectory, signal, deadline, dependencies } = {}) {
  const safeOutputDirectory = validateProgrammaticPortDestination(outputDirectory);
  return runPortCheckOperationCore({ outputDirectory: safeOutputDirectory, signal, deadline, dependencies });
}

export async function runPortCheck(options) {
  const usesTrackedCliDestination = arguments.length === 0;
  let outputDirectory = usesTrackedCliDestination ? validateTrackedPortDestination() : OUT;
  if (!usesTrackedCliDestination) {
    invariant(options && typeof options === 'object'
      && Object.prototype.hasOwnProperty.call(options, 'outputDirectory'),
    'programmatic port evidence requires an explicit outputDirectory');
    outputDirectory = validateProgrammaticPortDestination(options.outputDirectory);
  }
  return runWithPortCheckDeadline(
    (signal, deadline) => runPortCheckOperationCore({ outputDirectory, signal, deadline }),
    PORT_CHECK_DEADLINE_MS,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const uiSlice = readUiSlice(process.argv.slice(2));
  const command = uiSlice === 'voyage'
    ? runVoyageUiCheck
    : uiSlice === 'battle'
      ? runBattleUiCheck
      : runPortCheck;
  command().catch((error) => {
    if (uiSlice === 'voyage') {
      console.error(`CARIBBEAN_VOYAGE_UI_FAILED ${error instanceof Error ? error.message : String(error)}`);
    } else if (uiSlice === 'battle') {
      console.error(`CARIBBEAN_BATTLE_UI_FAILED ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.error(error instanceof Error ? error.stack ?? error.message : error);
    }
    process.exitCode = 1;
  });
}
