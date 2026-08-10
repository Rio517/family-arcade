#!/usr/bin/env node
/**
 * Drag all over the Risk map and prove nothing gets text-selected.
 *
 *   npm run risk:drag
 *
 * Why a browser script rather than a unit test: jsdom has no layout and no
 * selection model, so the thing being tested — what a real pointer drag across
 * an SVG does to the document selection — simply doesn't exist there. This
 * needs a real engine.
 *
 * Three properties, all of which have been broken at some point:
 *
 * 1. A drag never selects text. Without `user-select: none` a drag across the
 *    board grabs the engraved continent names, and you finish a pan with
 *    "SOUTH AMERICA" highlighted in blue.
 * 2. A drag never picks a territory. Panning ends over some country; treating
 *    that as a tap would launch attacks nobody asked for.
 * 3. A plain click still DOES pick a territory — the guard against (2) is easy
 *    to write so aggressively that the board stops responding at all.
 *
 * Drag coordinates come from a seeded LCG, so a failure is reproducible rather
 * than a story about the one time it went wrong.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.SHOTS_PORT ?? 4318);
const BASE = `http://localhost:${PORT}`;
const DRAGS = Number(process.env.RISK_DRAGS ?? 24);

/** Same LCG the games use for reproducible scenery. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server never came up at ${url}`);
}

/** Claim and deploy the whole map from inside the page, stopping on attack. */
async function playToAttack(page) {
  const help = page.getByTestId('risk-help-close');
  if (await help.count()) await help.click();
  await page.getByTestId('count-3').click();
  await page.getByTestId('risk-start').click();
  await page.evaluate(async () => {
    const phase = () => document.querySelector('[data-testid="risk-phase"]')?.textContent ?? '';
    const tick = () => new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 600 && !/attack/i.test(phase()); i++) {
      const tokens = document.querySelectorAll('[data-testid^="token-"]');
      if (tokens.length === 0) break;
      tokens[i % tokens.length].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      if (/place 0/i.test(phase())) {
        document.querySelector('[data-testid="end-reinforce"]')?.click();
        await tick();
      }
    }
  });
}

const selectedText = (page) => page.evaluate(() => window.getSelection()?.toString() ?? '');
const pickedCount = (page) => page.locator('.risk-terr.sel').count();

async function main() {
  console.log('Building…');
  await run('npx', ['vite', 'build']);

  console.log(`Serving dist on ${BASE}…`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  let browser;
  const failures = [];
  try {
    await waitForServer(BASE);
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await page.goto(`${BASE}/#/risk`, { waitUntil: 'networkidle' });
    await playToAttack(page);

    const box = await page.getByTestId('risk-map').boundingBox();
    if (!box) throw new Error('the map has no bounding box — did the campaign start?');

    const rand = lcg(20260810);
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];

    // Zoom in first. At the default extent the view already covers the whole
    // map, so panning is clamped to a no-op and the drags would never exercise
    // the interaction this script exists to check.
    await page.getByTestId('risk-zoom-in').click();
    await page.getByTestId('risk-zoom-in').click();

    console.log(`Dragging ${DRAGS} times across the board…`);
    for (let i = 0; i < DRAGS; i++) {
      // Inset from the edges so a drag can't start on the chrome that overlays
      // the map (the plaque, the rail, the war bar).
      const [x0, y0] = at(0.12 + rand() * 0.76, 0.22 + rand() * 0.5);
      const [x1, y1] = at(0.12 + rand() * 0.76, 0.22 + rand() * 0.5);

      await page.mouse.move(x0, y0);
      await page.mouse.down();
      // Several intermediate moves: one long jump can be swallowed as a click.
      for (let s = 1; s <= 6; s++) {
        await page.mouse.move(x0 + ((x1 - x0) * s) / 6, y0 + ((y1 - y0) * s) / 6);
      }
      await page.mouse.up();

      const text = await selectedText(page);
      if (text.trim() !== '') {
        failures.push(`drag ${i}: selected text ${JSON.stringify(text.slice(0, 60))}`);
      }
      if ((await pickedCount(page)) > 0) {
        failures.push(`drag ${i}: ended with a territory picked`);
        await page.keyboard.press('Escape');
      }
    }

    // The guard must not have gone so far that tapping stops working.
    const reset = page.getByTestId('risk-zoom-reset');
    if (await reset.isEnabled()) await reset.click();
    const before = await pickedCount(page);
    // Not just any land: in the attack phase only your own, with two or more
    // armies, can be picked as the source. Clicking someone else's is a no-op
    // by design and would fail this check for the wrong reason. The owner and
    // count are both in the territory's aria-label.
    const general = (await page.getByTestId('risk-turn').locator('strong').textContent())?.trim();
    let clicked = null;
    for (const t of await page.locator('.risk-terr').all()) {
      const label = (await t.getAttribute('aria-label')) ?? '';
      const armies = Number(/,\s*(\d+)\s+armies/.exec(label)?.[1] ?? 0);
      if (!general || !label.includes(general) || armies < 2) continue;
      // Click the army token, not the path. A country's bounding-box centre
      // lands outside the country whenever the shape is concave enough —
      // Indonesia, Scandinavia — and the click would fall on a neighbour that
      // legitimately refuses to be picked. The token is the intended target
      // anyway: it sits at the label anchor and carries a fat hit circle.
      const id = (await t.getAttribute('data-testid'))?.replace(/^terr-/, '');
      const token = page.getByTestId(`token-${id}`);
      if (!(await token.count())) continue;
      await token.click();
      clicked = id;
      break;
    }
    if (!clicked) failures.push(`found no land of ${general}'s with 2+ armies to click`);
    else if ((await pickedCount(page)) === before) {
      failures.push(
        `a plain click on ${clicked} no longer picks a territory — the drag guard is too eager`,
      );
    }
  } finally {
    await browser?.close();
    server.kill();
  }

  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  · ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS — ${DRAGS} drags, no text selected, no stray picks, tapping still works.`);
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exitCode = 1;
});
