#!/usr/bin/env node
/**
 * Build the app, serve it, and screenshot each view into docs/screenshots/.
 *
 *   npm run shots                  # every shot
 *   npm run shots -- landing menu  # only shots whose name contains an argument
 *
 * Two things make this worth a script rather than ad-hoc Playwright calls:
 *
 * 1. `saveIfChanged` — a PNG is written only when its bytes actually differ,
 *    so re-running doesn't churn git with visually identical images.
 * 2. It serves the *production* build on its own port and tears it down, so a
 *    shot never depends on whichever dev server happened to be running.
 *
 * Browser: Playwright's bundled Chromium. Set PW_CHROMIUM to override with an
 * explicit executable (the cloud sandbox has one at /opt/pw-browsers/...).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.SHOTS_PORT ?? 4317);
const BASE = `http://localhost:${PORT}`;

/** Phone-ish and tablet-ish; the family plays on iPads and phones. */
const PHONE = { width: 430, height: 932 };
const TABLET = { width: 1180, height: 820 };

/**
 * Each shot: where to go, how big, and an optional `prep` that runs before
 * the capture (dismiss an overlay, wait for a canvas to paint, …).
 */
const SHOTS = [
  {
    name: 'arcade-landing',
    path: '/',
    viewport: TABLET,
    fullPage: true,
  },
  {
    name: 'arcade-landing-phone',
    path: '/',
    viewport: PHONE,
    fullPage: true,
  },
  {
    name: 'privacy',
    path: '/privacy',
    viewport: TABLET,
    fullPage: true,
  },
  {
    name: 'battle-view',
    path: '/preview-b.html',
    viewport: TABLET,
    // The board animates its hit/miss markers in; let them settle.
    prep: async (page) => page.waitForTimeout(900),
  },
  {
    // Close-up of the 3D ocean alone — this is where ship meshes get judged.
    name: 'battle-fleet-3d-closeup',
    path: '/preview-b.html',
    viewport: { width: 1500, height: 1000 },
    selector: '[data-testid="fleet3d"]',
    prep: async (page) => {
      await page.click('[data-testid="fleet-view-3d"]');
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'battle-fleet-3d',
    path: '/preview-b.html',
    viewport: TABLET,
    // Switch the fleet board to the 3D ocean, then wait for three.js to load,
    // the ship meshes to decode, and the water to settle.
    prep: async (page) => {
      await page.click('[data-testid="fleet-view-3d"]');
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    // The war council with a computer general seated, so the persona ladder
    // and the person/computer toggles are captured.
    name: 'risk-setup',
    path: '/#/risk',
    viewport: TABLET,
    prep: async (page) => {
      const help = page.getByTestId('risk-help-close');
      if (await help.count()) await help.click();
      await page.getByTestId('seat-bot-2').click();
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'risk-board',
    path: '/#/risk',
    viewport: TABLET,
    prep: playRiskToAttack,
  },
  {
    name: 'risk-board-phone',
    path: '/#/risk',
    viewport: PHONE,
    prep: playRiskToAttack,
  },
];

/**
 * Risk has no harness page: the board only exists once a campaign is under way,
 * and getting there means claiming 42 lands and deploying every army — well
 * over a hundred taps. So drive it from inside the page and stop on the attack
 * phase, which is the state worth looking at (the stepper mid-way, the rail
 * populated, a real spread of colours).
 */
async function playRiskToAttack(page) {
  const help = page.getByTestId('risk-help-close');
  if (await help.count()) await help.click();
  await page.getByTestId('count-3').click();
  await page.getByTestId('risk-start').click();

  await page.evaluate(async () => {
    const phase = () => document.querySelector('[data-testid="risk-phase"]')?.textContent ?? '';
    const tick = () => new Promise((r) => setTimeout(r, 0));
    // Cycling the token list spreads the claims around the world instead of
    // handing one general a solid continent.
    for (let i = 0; i < 600 && !/attack/i.test(phase()); i++) {
      const tokens = document.querySelectorAll('[data-testid^="token-"]');
      if (tokens.length === 0) break;
      tokens[i % tokens.length].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      // Reinforce ends on a button, not a tap, once every army is placed.
      if (/place 0/i.test(phase())) {
        document.querySelector('[data-testid="end-reinforce"]')?.click();
        await tick();
      }
    }
  });
  await page.getByTestId('risk-phase').waitFor();
  // The plaque drops in on a spring; let it land.
  await page.waitForTimeout(700);
}

function saveIfChanged(file, buffer) {
  const name = path.basename(file);
  const existing = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!existing) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    console.log(`  new:       ${name}`);
    return 'new';
  }
  if (!existing.equals(buffer)) {
    fs.writeFileSync(file, buffer);
    console.log(`  updated:   ${name}`);
    return 'updated';
  }
  console.log(`  unchanged: ${name}`);
  return 'unchanged';
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
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

async function main() {
  const filters = process.argv.slice(2);
  const shots = filters.length
    ? SHOTS.filter((s) => filters.some((f) => s.name.includes(f)))
    : SHOTS;

  if (shots.length === 0) {
    console.error(`No shot matches ${filters.join(', ')}. Known shots:`);
    for (const s of SHOTS) console.error(`  ${s.name}`);
    process.exitCode = 1;
    return;
  }

  console.log('Building (with the battle harness)…');
  await run('npx', ['vite', 'build'], { env: { ...process.env, BUILD_HARNESS: '1' } });

  console.log(`Serving dist on ${BASE}…`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  let browser;
  try {
    await waitForServer(BASE);

    browser = await chromium.launch({
      executablePath: process.env.PW_CHROMIUM || undefined,
      // ANGLE gives the 3D scenes a real GL backend headless; without it the
      // chess/battleship/racer canvases fall back to their error placeholder.
      args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'],
    });

    console.log(`Capturing ${shots.length} shot(s) into docs/screenshots/`);
    const tally = { new: 0, updated: 0, unchanged: 0 };

    for (const shot of shots) {
      const page = await browser.newPage({
        viewport: shot.viewport ?? TABLET,
        deviceScaleFactor: 2,
        // Screenshots are documentation, not a motion demo — and the arcade
        // gates its animations on this, so shots come out settled.
        reducedMotion: 'reduce',
      });
      await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
      if (shot.prep) await shot.prep(page);
      // `selector` crops to one element — useful when the thing under review is
      // a canvas inside a wide layout and a full-page shot renders it tiny.
      const target = shot.selector ? page.locator(shot.selector) : page;
      const buffer = await target.screenshot(
        shot.selector ? {} : { fullPage: shot.fullPage ?? false },
      );
      tally[saveIfChanged(path.join(OUT, `${shot.name}.png`), buffer)] += 1;
      await page.close();
    }

    console.log(
      `Done — ${tally.new} new, ${tally.updated} updated, ${tally.unchanged} unchanged.`,
    );
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  if (String(err).includes("Executable doesn't exist")) {
    console.error('\nInstall the browser with: npx playwright install chromium');
    console.error('Or point PW_CHROMIUM at an existing Chromium binary.');
  }
  process.exitCode = 1;
});
