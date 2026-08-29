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
    // The fleet tile opens on the 3D ocean by default now — wait for the
    // hulls to decode and the hit/miss markers to settle.
    prep: async (page) => {
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
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
    // The same close-up sailing the MODERN navy — Ford, Kirov, Type 055,
    // Virginia, Hobart — so both eras stay reviewable side by side.
    name: 'battle-fleet-3d-modern',
    path: '/preview-b.html?era=modern',
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
    // The Ship Battle lobby with the captain ladder open — the solo door.
    name: 'battle-lobby',
    path: '/#/play',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('solo-game').click();
      await page.getByTestId('captain-grimtide').waitFor();
    },
  },
  {
    // The fleet screen: colour picker plus the Classic/Modern navy choice.
    name: 'battle-fleet-select',
    path: '/#/play',
    viewport: TABLET,
    fullPage: true,
    prep: async (page) => {
      await page.getByTestId('solo-game').click();
      await page.getByTestId('captain-grimtide').click();
      await page.getByTestId('era-modern').waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    // The galaxy set in 3D — where the family's generated ships live (the
    // X-wing pawns lead; more authored pieces land here as they're made).
    name: 'chess-galaxy-3d',
    path: '/#/chess',
    viewport: TABLET,
    prep: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem('chess-view-v1', '3d');
        localStorage.setItem('chess-theme-v1', 'galaxy');
      });
      await page.reload();
      await page.getByTestId('mode-local').click();
      await page.getByTestId('start-local').click();
      await page.getByTestId('chess3d').waitFor();
      // Scene, starfield, and the async piece models all need to land.
      await page.waitForTimeout(3500);
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
  {
    // The ticket booth gate at a game door: players exist, nobody signed in.
    name: 'player-gate',
    path: '/#/chess',
    viewport: PHONE,
    seed: 'signedOut',
  },
  {
    // The party panel wears the signed-in ticket — "You're Klara · Change" —
    // where a name box and five-name chips used to be.
    name: 'party-panel',
    path: '/',
    viewport: PHONE,
    prep: async (page) => {
      await page.getByTestId('party-pill').click();
      await page.getByTestId('playing-as').waitFor();
    },
  },
  {
    // The arena with the artist-made bunny steed (coins land randomly, so the
    // pixels churn a little every regeneration — that's expected).
    name: 'racer-arena',
    path: '/#/racer',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('racer-mode-solo').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.waitForSelector('.racer-canvas canvas', { timeout: 20000 });
      // Ride the brake while the scene and the steed GLB land — left alone,
      // the racer cruises to the fence and the camera ends up in a hillside.
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(2500);
      await page.keyboard.up('ArrowDown');
    },
  },
];

/**
 * Every shot runs with this roster already in localStorage: the gate would
 * otherwise block each game flow before it starts. Klara is signed in with a
 * little history so the landing's Ticket Booth has something to show; the
 * `player-gate` shot flips activeId to null to capture the gate itself.
 * History stays within ~24h so its labels render as the stable "today"/
 * "yest." instead of churning absolute dates on every regeneration.
 */
const NOW = Date.now();
const SEED_ROSTER = {
  activeId: 'seed-klara',
  users: [
    {
      id: 'seed-rio',
      profile: { name: 'Rio', points: 2150, wins: 18, losses: 9 },
    },
    {
      id: 'seed-klara',
      profile: {
        name: 'Klara',
        points: 1240,
        wins: 12,
        losses: 5,
        history: [
          { code: 'AB12', game: 'chess', opponent: 'Rio', result: 'win', pointsEarned: 100, finishedAt: NOW - 2 * 3600e3 },
          { code: 'CD34', game: 'battleship', opponent: 'Papa', result: 'loss', pointsEarned: 25, finishedAt: NOW - 5 * 3600e3 },
          { code: 'EF56', game: 'battleship', opponent: 'Flora', result: 'win', pointsEarned: 145, finishedAt: NOW - 26 * 3600e3 },
        ],
      },
    },
    {
      id: 'seed-flora',
      profile: { name: 'Flora', points: 980, wins: 9, losses: 6 },
    },
  ],
};

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
    const turn = () => document.querySelector('[data-testid="risk-turn"]')?.textContent ?? '';
    const tick = () => new Promise((r) => setTimeout(r, 0));
    // Cycling the token list spreads the claims around the world instead of
    // handing one general a solid continent.
    for (let i = 0; i < 600 && !/attacks/i.test(turn()); i++) {
      const tokens = document.querySelectorAll('[data-testid^="token-"]');
      if (tokens.length === 0) break;
      tokens[i % tokens.length].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      // Placing ends on a button, not a tap, once every army is down.
      const done = document.querySelector('[data-testid="end-reinforce"]');
      if (done && !done.disabled) {
        done.click();
        await tick();
      }
    }
  });
  // Leave a land selected, so the shot shows the brass marching-ants
  // highlight and its glowing targets — the state a mid-attack table sees.
  await page.evaluate(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    for (const tk of document.querySelectorAll('[data-testid^="token-"]')) {
      tk.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      if (document.querySelector('.risk-terr.sel')) return;
    }
  });
  await page.getByTestId('risk-turn').waitFor();
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
      const roster = shot.seed === 'signedOut' ? { ...SEED_ROSTER, activeId: null } : SEED_ROSTER;
      await page.addInitScript((state) => {
        try {
          localStorage.setItem('arcade.users.v1', JSON.stringify(state));
        } catch {
          /* storage blocked — the gate will show instead */
        }
      }, roster);
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
