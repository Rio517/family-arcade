#!/usr/bin/env node
/**
 * Frame times for Ship Battle's darker-arcade effects (?fx=), against a
 * production build of the guns harness (preview-guns.html, BUILD_HARNESS).
 *
 *   node scripts/perf-battle-fx.mjs            # today, A and B; normal and 4x CPU throttle
 *   node scripts/perf-battle-fx.mjs --no-build # reuse dist/ from a harness build
 *
 * Each pass opens the battle at iPad size (1180×820, DPR 2) with `demo=1`,
 * which plays an exchange of fire on a loop (salvos, incoming shells, hits,
 * a miss, two sinkings), and records requestAnimationFrame gaps for 14 s —
 * one whole demo cycle. It also samples the ocean's draw calls through the
 * harness's `__fleet` hook. Chromium drives ANGLE's Metal backend, for real
 * GPU frame times on a Mac. A desktop number finds causes; only the iPad
 * (`?fps` on a Tailscale preview) confirms them.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PERF_BATTLE_PORT ?? 4327);
const BASE = `http://localhost:${PORT}`;
const BUILD = !process.argv.includes('--no-build');

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server never came up at ${url}`);
}

function stats(gaps) {
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
  return { frames: sorted.length, p50: pct(50), p95: pct(95), p99: pct(99), max: sorted.at(-1) ?? 0, over33: gaps.filter((g) => g > 33.4).length };
}

async function pass(fx, throttle) {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
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
    await page.goto(`${BASE}/preview-guns.html?fx=${fx}&bar=0&demo=1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="fleet3d"]', { timeout: 20_000 });
    // Let the hulls decode and the shaders compile before the clock starts.
    await page.waitForTimeout(3500);
    if (throttle) {
      const client = await context.newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.evaluate(() => {
      window.__rafGaps = [];
      window.__calls = 0;
      window.__callsTimer = setInterval(() => {
        const info = window.__fleet?.renderer?.info?.render;
        if (info) window.__calls = Math.max(window.__calls, info.calls);
      }, 50);
    });
    await page.waitForTimeout(14_000);
    const { gaps, calls } = await page.evaluate(() => ({ gaps: window.__rafGaps, calls: window.__calls }));
    return { fx, throttle: throttle ? '4x' : '1x', ...stats(gaps), peakDrawCalls: calls };
  } finally {
    await browser.close();
  }
}

if (BUILD) await run('npx', ['vite', 'build'], { BUILD_HARNESS: '1' });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
try {
  await waitForServer(BASE);
  const rows = [];
  for (const fx of ['today', 'a', 'b', 'default']) {
    for (const throttle of [false, true]) {
      const r = await pass(fx, throttle);
      rows.push(r);
      console.log(
        `fx=${r.fx.padEnd(7)} cpu ${r.throttle}  frames ${String(r.frames).padStart(4)}  ` +
          `p50 ${r.p50.toFixed(1)}ms  p95 ${r.p95.toFixed(1)}ms  p99 ${r.p99.toFixed(1)}ms  max ${r.max.toFixed(0)}ms  ` +
          `>33ms ${r.over33}  peak draws ${r.peakDrawCalls}`,
      );
    }
  }
} finally {
  server.kill();
}
