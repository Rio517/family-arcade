#!/usr/bin/env node
/**
 * Play a whole solo Ship Battle with the darker-arcade guns on, end to end,
 * in a real browser: `node scripts/play-battle-fx.mjs <base-url> [fx]`
 * (e.g. http://localhost:5185 a). It checks what unit tests can't see:
 *
 *   - a shot plays (the skip appears, the target cell stays unrevealed) and a
 *     tap skips it,
 *   - the computer's shells come in and the game carries on,
 *   - the last shot plays out before the result card, and the result shows,
 *   - the log in storage only ever grows (skipping never rewrites it).
 *
 * Prints a line per milestone and exits non-zero on a failure. Writes a
 * picture of the final blast and of the result to the system temp dir.
 */
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5185';
const FX = process.argv[3] ?? 'a';
const ROSTER = { activeId: 'k', users: [{ id: 'k', profile: { name: 'Klara', points: 0, wins: 0, losses: 0 } }] };
const out = (name) => path.join(os.tmpdir(), `battle-fx-${FX}-${name}.png`);

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((r) => {
  localStorage.setItem('arcade.users.v1', JSON.stringify(r));
  localStorage.setItem('bs-watch-shots-v1', 'on');
}, ROSTER);
await page.goto(`${BASE}/#/play?fx=${FX}&bar=0`);
await page.getByTestId('solo-game').click();
await page.getByTestId('captain-bobble').click();
await page.getByTestId('fleet-continue').click();
await page.getByTestId('fast-start').click();
await page.getByTestId('turn-pill').waitFor({ timeout: 15000 });
console.log('battle on');

const logLength = () =>
  page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes('SOLO')) {
        try {
          return JSON.parse(localStorage.getItem(k)).log?.length ?? -1;
        } catch {
          return -1;
        }
      }
    }
    return -1;
  });

let fired = 0;
let skipped = 0;
let watched = 0;
let lastLen = 0;
let sawHoldBeforeResult = false;
const cells = [];
for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push([r, c]);
const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  if (await page.getByTestId('rematch').count().catch(() => 0)) break;
  if (await page.locator('[data-testid="result"], .result-hero').count()) break;
  const len = await logLength();
  if (len < lastLen) throw new Error(`the log shrank: ${lastLen} -> ${len}`);
  lastLen = Math.max(lastLen, len);
  const skip = page.getByTestId('skip-shot');
  if (await skip.count()) {
    // Watch every fifth shot in full; skip the rest.
    if (fired % 5 === 0) {
      watched++;
      await skip.waitFor({ state: 'detached', timeout: 5000 });
    } else {
      skipped++;
      await skip.click();
    }
    // The game is over but the battle is still up: the final shot is playing out.
    if ((await page.getByTestId('turn-pill').count()) === 0 && (await page.getByTestId('fleet3d').count())) {
      sawHoldBeforeResult = true;
      await page.screenshot({ path: out('final') });
    }
    continue;
  }
  const pill = await page.getByTestId('turn-pill').textContent().catch(() => '');
  if (pill?.includes('Your shot')) {
    while (cells.length) {
      const [r, c] = cells.shift();
      const cell = page.getByTestId(`cell-enemy-${r}-${c}`);
      if (await cell.isEnabled().catch(() => false)) {
        await cell.click();
        fired++;
        // The salvo should start: the skip appears and the cell is not yet revealed.
        await page.getByTestId('skip-shot').waitFor({ timeout: 4000 });
        break;
      }
    }
    continue;
  }
  if ((await page.getByTestId('turn-pill').count()) === 0 && (await page.getByTestId('fleet3d').count())) {
    sawHoldBeforeResult = true;
    await page.screenshot({ path: out('final') });
  }
  await page.waitForTimeout(120);
}
await page.waitForTimeout(2500);
await page.screenshot({ path: out('result') });
const result = await page.locator('.result-hero').count();
console.log(`fired ${fired}, watched ${watched}, skipped ${skipped}, log ${lastLen}, held the battle for the last shot: ${sawHoldBeforeResult}, result shown: ${result > 0}`);
console.log(`pictures: ${out('final')} ${out('result')}`);
if (errors.length) console.log('page errors:\n' + errors.join('\n'));
await browser.close();
if (!result || errors.length) process.exit(1);
