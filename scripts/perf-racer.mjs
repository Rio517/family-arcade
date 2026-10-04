#!/usr/bin/env node
/**
 * Frame times in a Rainbow Racer race, against one or more production builds.
 *
 *   node scripts/perf-racer.mjs                       # build, then measure dist/
 *   node scripts/perf-racer.mjs --no-build            # measure dist/ as it is
 *   node scripts/perf-racer.mjs --no-build old=/tmp/dist-old new=dist
 *
 * Each pass opens the real game at iPad size (1180×820, DPR 2), starts a solo
 * race as the unicorn (so the three rivals are the fairy, the princess on her
 * unicorn and the bunny on its cloud), waits out the countdown, then records
 * requestAnimationFrame gaps, the work done inside each frame, and the draw
 * calls and triangles it sends, for 12 s under a 4× CPU slowdown. With several
 * builds the passes interleave (old, new, old, new, ...) so drift on the
 * machine lands on both. Chromium drives ANGLE's Metal backend, for real GPU
 * frame times on a Mac; only the iPad confirms them.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PERF_RACER_PORT ?? 4364);
const ROUNDS = Number(process.env.PERF_RACER_ROUNDS ?? 3);
const BUILD = !process.argv.includes('--no-build');
const builds = process.argv
  .slice(2)
  .filter((a) => a.includes('='))
  .map((a) => {
    const [label, dir] = a.split('=');
    return { label, dir };
  });
if (!builds.length) builds.push({ label: 'dist', dir: 'dist' });

/** A signed-in player, so the arcade opens straight into the game. */
const ROSTER = { activeId: 'perf', users: [{ id: 'perf', profile: { name: 'Perf', points: 0, wins: 0, losses: 0 } }] };

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
  const mean = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length);
  return { frames: sorted.length, mean, p50: pct(50), p95: pct(95), p99: pct(99), max: sorted.at(-1) ?? 0, over33: gaps.filter((g) => g > 33.4).length };
}

async function pass(base) {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.addInitScript((roster) => {
      try {
        localStorage.setItem('arcade.users.v1', JSON.stringify(roster));
      } catch {
        /* storage blocked */
      }
      // Frame gaps, the main-thread work inside each frame's callbacks (the
      // game's sync and render), which vsync does not round off, and the draw
      // calls and triangles each frame sends to the GPU.
      const raf = window.requestAnimationFrame.bind(window);
      window.__rafGaps = [];
      window.__work = [];
      window.__draws = [];
      let stamp = -1;
      let work = 0;
      const gl = { calls: 0, tris: 0 };
      for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        for (const name of ['drawElements', 'drawArrays']) {
          const draw = Ctx?.prototype?.[name];
          if (!draw) continue;
          Ctx.prototype[name] = function (mode, a, b, c) {
            gl.calls += 1;
            if (mode === 4) gl.tris += (name === 'drawArrays' ? b : a) / 3;
            return draw.call(this, mode, a, b, c);
          };
        }
      }
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          if (t !== stamp) {
            if (stamp >= 0) {
              window.__work.push(work);
              if (gl.calls) window.__draws.push({ ...gl });
            }
            stamp = t;
            work = 0;
            gl.calls = 0;
            gl.tris = 0;
          }
          const start = performance.now();
          cb(t);
          work += performance.now() - start;
        });
      let last = null;
      const loop = (t) => {
        if (last !== null) window.__rafGaps.push(t - last);
        last = t;
        raf(loop);
      };
      raf(loop);
    }, ROSTER);
    await page.goto(`${base}/#/racer`, { waitUntil: 'networkidle' });
    await page.getByTestId('racer-mode-solo').click();
    await page.getByTestId('racer-driver-unicorn').click();
    await page.waitForSelector('.racer-canvas canvas', { timeout: 20_000 });
    await page.waitForSelector('[data-testid="racer-score-3"]', { timeout: 20_000 });
    // The countdown, and the shaders compiling, before the clock starts.
    await page.waitForTimeout(4500);
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.__rafGaps = [];
      window.__work = [];
      window.__draws = [];
    });
    await page.waitForTimeout(12_000);
    const { gaps, work, draws } = await page.evaluate(() => ({ gaps: window.__rafGaps, work: window.__work, draws: window.__draws }));
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    return { gap: stats(gaps), work: stats(work), calls: median(draws.map((d) => d.calls)), tris: median(draws.map((d) => d.tris)) };
  } finally {
    await browser.close();
  }
}

if (BUILD) await run('npx', ['vite', 'build']);
const servers = builds.map((b, i) => {
  const port = PORT + i;
  const proc = spawn('npx', ['vite', 'preview', '--outDir', b.dir, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  // A port someone else holds makes our server exit: never measure their page.
  proc.on('exit', (code) => {
    if (code) {
      console.error(`vite preview for ${b.label} exited ${code}: is port ${port} taken?`);
      process.exit(1);
    }
  });
  return { ...b, base: `http://localhost:${port}`, proc };
});
try {
  for (const s of servers) await waitForServer(s.base);
  const all = new Map(servers.map((s) => [s.label, []]));
  for (let round = 1; round <= ROUNDS; round++) {
    for (const s of servers) {
      const r = await pass(s.base);
      all.get(s.label).push(r);
      console.log(
        `${s.label.padEnd(8)} run ${round}  frames ${String(r.gap.frames).padStart(4)}  gap mean ${r.gap.mean.toFixed(1)}ms  ` +
          `p95 ${r.gap.p95.toFixed(1)}ms  >33ms ${r.gap.over33}  |  work mean ${r.work.mean.toFixed(2)}ms  ` +
          `p50 ${r.work.p50.toFixed(2)}ms  p95 ${r.work.p95.toFixed(2)}ms  max ${r.work.max.toFixed(1)}ms  |  ` +
          `${r.calls} draws, ${Math.round(r.tris).toLocaleString('en')} triangles a frame`,
      );
    }
  }
  for (const [label, runs] of all) {
    const avg = (kind, k) => runs.reduce((s, r) => s + r[kind][k], 0) / runs.length;
    console.log(
      `${label.padEnd(8)} average of ${runs.length}: gap mean ${avg('gap', 'mean').toFixed(1)}ms  p95 ${avg('gap', 'p95').toFixed(1)}ms  ` +
        `>33ms ${avg('gap', 'over33').toFixed(1)}  |  work mean ${avg('work', 'mean').toFixed(2)}ms  p95 ${avg('work', 'p95').toFixed(2)}ms`,
    );
  }
} finally {
  for (const s of servers) s.proc.kill();
}
