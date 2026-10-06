#!/usr/bin/env node
/**
 * A local, repeatable performance audit for Gulp Universe: Lighthouse on the
 * menu (mobile and desktop presets, performance category only) and real
 * frame times while playing a City round, both against a production build.
 *
 *   npm run perf:gulp            # prints the table, exits 0 either way
 *   npm run perf:gulp -- --strict  # exits 1 if any budget is missed
 *   npm run perf:gulp -- --map=region --frames-only
 *                                # frame times on another map, no Lighthouse
 *   npm run perf:gulp -- --spill --dpr=2
 *                                # frame times with ships spilling: a level 17
 *                                # hole by the Region harbour, a ship going in
 *                                # every 3 s (the preview-gulp-spill harness),
 *                                # at device pixel ratio 2; no Lighthouse
 *
 * This is not a CI gate — `three/perf.test.ts` covers that with timing-free,
 * deterministic guards on triangle counts and build work. This script is for
 * running by hand "from time to time" (the owner's phrase) when touching the
 * 3D scene, the props kit, or the map generator: it needs a real browser,
 * Lighthouse, and about a minute and a half, so it doesn't belong in the
 * normal `npm test` run.
 *
 * How to read the table: each row is a measurement against a budget, marked
 * ✅ or ⚠️. A ⚠️ is a prompt to look, not a build failure — see `--strict`
 * above if a caller wants this to gate something. A JSON copy of every
 * number (plus the Lighthouse longest-task detail) is written to the system
 * temp dir; the run prints its path.
 *
 * Gotchas carried over from getting this working by hand:
 * - The app opens on a "who's playing" gate. A Chrome profile is seeded with
 *   `arcade.users.v1` in localStorage before Lighthouse or Playwright ever
 *   load the game, and — Lighthouse only — a hash-only navigation to #/gulp
 *   needs a real reload after: a hash change alone doesn't re-read storage.
 * - Lighthouse needs `--disable-storage-reset` (or the seeded profile is
 *   wiped before it loads the page) and a *fresh* profile directory per run
 *   — reusing one lets the PWA's service worker serve a stale build.
 * - `[data-testid="gulp-hud"]` lays its children out absolutely, so its own
 *   box has no size: `state: 'attached'` is the wait that resolves.
 *   `state: 'visible'` hangs forever.
 *
 * Browsers: Lighthouse drives a real Chrome (Playwright's `chrome` channel
 * seeds its profile); the frame-time pass drives Playwright's bundled
 * Chromium with ANGLE's Metal backend, for real GPU frame times on a Mac.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PERF_GULP_PORT ?? 4329);
const BASE = `http://localhost:${PORT}`;
const STRICT = process.argv.includes('--strict');
/** Which map the frame-time pass plays (the Town, City, Megalopolis or Region). */
const MAP = (process.argv.find((a) => a.startsWith('--map=')) ?? '--map=city').slice('--map='.length);
/** Ships spilling into a late-round hole, on the harness page, instead of a fresh round. */
const SPILL = process.argv.includes('--spill');
const FRAMES_ONLY = SPILL || process.argv.includes('--frames-only');
/** The device pixel ratio the frame-time pass emulates (the scene draws at up to 1.5 of it). */
const DPR = Number((process.argv.find((a) => a.startsWith('--dpr=')) ?? '--dpr=1').slice('--dpr='.length));

/** Past the "who's playing" gate: one family member, no history to load. */
const ROSTER = { activeId: 'k', users: [{ id: 'k', profile: { name: 'Clara', points: 0, wins: 0, losses: 0 } }] };

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

function runCollecting(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${err}`))));
  });
}

/** Poll until the preview server answers, rather than sleeping a guessed amount. */
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server never came up at ${url}`);
}

/** Seed a fresh Chrome profile with the roster, past the gate, sitting on #/gulp. */
async function seedProfile(profileDir) {
  const context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(BASE, { waitUntil: 'load' });
    await page.evaluate((state) => localStorage.setItem('arcade.users.v1', JSON.stringify(state)), ROSTER);
    await page.goto(`${BASE}/#/gulp`, { waitUntil: 'load' });
    // A hash-only change doesn't re-read storage; a real reload does.
    await page.reload({ waitUntil: 'load' });
  } finally {
    await context.close();
  }
}

async function lighthouseRun(preset) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `gulp-perf-lh-${preset}-`));
  await seedProfile(profileDir);
  const outFile = path.join(profileDir, 'report.json');
  const args = [
    '-y',
    'lighthouse@12',
    `${BASE}/#/gulp`,
    '--only-categories=performance',
    '--output=json',
    `--output-path=${outFile}`,
    '--disable-storage-reset',
    `--chrome-flags=--headless=new --user-data-dir=${profileDir}`,
    '--quiet',
  ];
  if (preset === 'desktop') args.push('--preset=desktop');
  try {
    await runCollecting('npx', args);
    const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const audits = report.audits;
    const longTasks = audits['long-tasks']?.details?.items ?? [];
    const longest = [...longTasks].sort((a, b) => b.duration - a.duration)[0] ?? null;
    return {
      preset,
      score: report.categories.performance.score,
      totalBlockingTime: audits['total-blocking-time'].numericValue,
      interactive: audits['interactive']?.numericValue ?? null,
      maxPotentialFID: audits['max-potential-fid'].numericValue,
      longestTask: longest && { durationMs: longest.duration, url: longest.url },
    };
  } finally {
    // A seeded Chrome profile is tens of MB; the temp dir shouldn't grow by
    // that much every run.
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

/** Gap stats for a run of requestAnimationFrame timestamps. */
function frameStats(gaps) {
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
  return {
    count: sorted.length,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    over25: gaps.filter((g) => g > 25).length,
    over50: gaps.filter((g) => g > 50).length,
  };
}

/** Play a City round for ~20s, driving the mouse in slow circles, and record
 * requestAnimationFrame gaps the whole time. `throttle` runs it again at 4x
 * simulated CPU slowdown, standing in for an older iPad. */
async function frameTimePass(label, throttle) {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: DPR });
    const page = await context.newPage();
    await page.addInitScript((state) => {
      try {
        localStorage.setItem('arcade.users.v1', JSON.stringify(state));
      } catch {
        /* storage blocked */
      }
    }, ROSTER);
    // Installed before any page script runs, so it never misses a frame.
    await page.addInitScript(() => {
      window.__rafGaps = [];
      let last = null;
      const loop = (t) => {
        if (last !== null) window.__rafGaps.push(t - last);
        last = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    if (throttle) {
      const client = await context.newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    const durationMs = 20_000;
    if (SPILL) {
      // The harness steers the hole and swallows the ships itself.
      await page.goto(`${BASE}/preview-gulp-spill.html?perf`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid="gulp-spill-ready"]', { state: 'attached', timeout: 30_000 });
      await page.evaluate(() => {
        window.__rafGaps = [];
        window.__frameWork.length = 0;
      });
      await page.waitForTimeout(durationMs);
    } else {
      await page.goto(`${BASE}/#/gulp`, { waitUntil: 'load' });
      await page.getByTestId(`gulp-map-${MAP}`).click();
      await page.getByTestId('gulp-play').click();
      await page.waitForSelector('[data-testid="gulp-hud"]', { state: 'attached', timeout: 20_000 });
      // Drop the menu's own frames: only the round's gameplay counts.
      await page.evaluate(() => {
        window.__rafGaps = [];
      });

      const start = Date.now();
      const cx = 590;
      const cy = 420;
      const radius = 140;
      while (Date.now() - start < durationMs) {
        const t = (Date.now() - start) / 1000;
        await page.mouse.move(cx + radius * Math.cos(t), cy + radius * Math.sin(t));
        await page.waitForTimeout(16);
      }
    }

    const gaps = await page.evaluate(() => window.__rafGaps);
    // The harness also times each frame's own work, which a throttled CPU shows even when the gaps don't.
    const work = SPILL ? frameStats(await page.evaluate(() => window.__frameWork)) : null;
    return { label, ...frameStats(gaps), work };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Chosen from what this audit measures on a quiet M-series Mac (see the
 * report this script prints for today's numbers): mobile and desktop
 * blocking time are the owner's own budgets. The rest follow the same shape
 * — about the range a smooth, responsive 3D menu and round already sit in,
 * so a real regression trips one, not routine machine noise.
 */
const BUDGETS = {
  mobileBlockingMs: 1500,
  desktopBlockingMs: 300,
  mobileInteractiveMs: 6000,
  desktopInteractiveMs: 3000,
  p95FrameGapMs: 25,
  p95FrameGapThrottledMs: 45,
};

/** A budgeted row: marked ✅ or ⚠️ against `budget`. */
function row(label, value, budget) {
  return { label, value, budget, ok: value <= budget };
}

function printTable(rows) {
  const w = Math.max(...rows.map((r) => r.label.length)) + 2;
  for (const r of rows) {
    const mark = r.ok ? '✅' : '⚠️';
    console.log(`${mark} ${r.label.padEnd(w)} ${r.value.toFixed(0).padStart(6)}ms (budget ${r.budget.toFixed(0)}ms)`);
  }
}

const WHAT = SPILL ? 'ships spilling into a level 17 hole (Region harbour)' : `a ${MAP} round`;

async function main() {
  console.log('Building a production copy…');
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-perf-build-'));
  // The spill harness is built only with BUILD_HARNESS, as for the screenshots.
  await run('npx', ['vite', 'build', '--outDir', buildDir], SPILL ? { env: { ...process.env, BUILD_HARNESS: '1' } } : {});

  console.log(`Serving ${buildDir} on ${BASE}…`);
  const server = spawn('npx', ['vite', 'preview', '--outDir', buildDir, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  const results = { at: new Date().toISOString(), what: WHAT, dpr: DPR, lighthouse: {}, frames: {} };
  try {
    await waitForServer(BASE);

    if (!FRAMES_ONLY) {
      console.log('Running Lighthouse on the Gulp menu (mobile)…');
      results.lighthouse.mobile = await lighthouseRun('mobile');
      console.log('Running Lighthouse on the Gulp menu (desktop)…');
      results.lighthouse.desktop = await lighthouseRun('desktop');
    }

    console.log(`Playing ${WHAT} for ~20s at DPR ${DPR} (unthrottled)…`);
    results.frames.normal = await frameTimePass('unthrottled', false);
    console.log(`Playing ${WHAT} for ~20s at DPR ${DPR} (slow CPU, 4x throttled)…`);
    results.frames.throttled = await frameTimePass('slow CPU (4x)', true);
  } finally {
    server.kill();
  }

  const { mobile, desktop } = results.lighthouse;
  const budgeted = [
    ...(FRAMES_ONLY
      ? []
      : [
          row('mobile total blocking time', mobile.totalBlockingTime, BUDGETS.mobileBlockingMs),
          row('desktop total blocking time', desktop.totalBlockingTime, BUDGETS.desktopBlockingMs),
          row('mobile time to interactive', mobile.interactive, BUDGETS.mobileInteractiveMs),
          row('desktop time to interactive', desktop.interactive, BUDGETS.desktopInteractiveMs),
        ]),
    row('frame p95 (unthrottled)', results.frames.normal.p95, BUDGETS.p95FrameGapMs),
    row('frame p95 (slow CPU 4x)', results.frames.throttled.p95, BUDGETS.p95FrameGapThrottledMs),
  ];

  console.log('\nGulp Universe performance audit — ' + results.at);
  console.log('='.repeat(64));
  console.log('Budgets:');
  printTable(budgeted);

  console.log(`\nFor context (no budget, just reported; frames for ${WHAT} at DPR ${DPR}):`);
  if (!FRAMES_ONLY) {
    console.log(`  Lighthouse score — mobile ${mobile.score.toFixed(2)}, desktop ${desktop.score.toFixed(2)}`);
    console.log(`  max potential FID — mobile ${mobile.maxPotentialFID.toFixed(0)}ms, desktop ${desktop.maxPotentialFID.toFixed(0)}ms`);
    for (const which of ['mobile', 'desktop']) {
      const t = results.lighthouse[which].longestTask;
      console.log(`  ${which} longest task — ${t ? `${t.durationMs.toFixed(0)}ms in ${t.url}` : 'none reported'}`);
    }
  }
  for (const [label, f] of [
    ['unthrottled', results.frames.normal],
    ['slow CPU 4x', results.frames.throttled],
  ]) {
    console.log(
      `  frame gaps (${label}, ${f.count} frames) — p50 ${f.p50.toFixed(0)}ms, p99 ${f.p99.toFixed(0)}ms, max ${f.max.toFixed(0)}ms, ` +
        `${f.over25} over 25ms, ${f.over50} over 50ms`,
    );
    if (f.work) {
      const w = f.work;
      console.log(`  frame work (${label}, step + sync + draw call) — p50 ${w.p50.toFixed(1)}ms, p95 ${w.p95.toFixed(1)}ms, p99 ${w.p99.toFixed(1)}ms, max ${w.max.toFixed(1)}ms`);
    }
  }

  const missed = budgeted.filter((r) => !r.ok);
  console.log(`\n${budgeted.length - missed.length}/${budgeted.length} budgets met.`);

  const outFile = path.join(os.tmpdir(), `gulp-perf-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ ...results, budgets: BUDGETS }, null, 2));
  console.log(`Full results: ${outFile}`);

  fs.rmSync(buildDir, { recursive: true, force: true });

  if (STRICT && missed.length) {
    console.error(`\n--strict: ${missed.length} budget(s) missed.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
