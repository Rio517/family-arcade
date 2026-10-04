#!/usr/bin/env node
/**
 * Are look C's labels vertically centred? Measured in pixels, in Chromium and
 * WebKit, on a running build of the arcade:
 *
 *   node scripts/check-text-centre.mjs http://localhost:4321
 *
 * Each box is screenshot with its text and with the text made transparent; the
 * difference is the ink. The capitals' band is the rows holding at least 20% of
 * the busiest row's ink, so commas and brackets don't count. The offset is the
 * band's middle less the box's middle (inside its border), in CSS px; positive
 * means the text sits low. Fails when WebKit, where the family plays, is off by
 * more than 1px, or Chromium (which rounds font metrics to whole pixels) by
 * more than 2px.
 */
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';

const BASE = process.argv[2];
if (!BASE) {
  console.error('usage: node scripts/check-text-centre.mjs <base url of a running build>');
  process.exit(2);
}
const DPR = 2;
const LIMIT = { webkit: 1, chromium: 2 };

/** box: what the text should centre in; text: whose ink to measure; clip: what to screenshot. */
const T = (box, text = box, clip = box, label = text) => ({ box, text, clip, label });
const toFleet = async (p) => {
  await p.getByTestId('solo-game').click();
  await p.getByTestId('captain-grimtide').click();
  await p.getByTestId('era-modern').waitFor();
};
const SCREENS = [
  {
    name: 'lobby',
    prep: async (p) => p.getByTestId('solo-game').waitFor(),
    targets: [
      T('[data-testid="back"]'), T('.pas-pill', '.pas-who'), T('.pas-change'), T('.lk-door-tag'),
      T('[data-testid="create-game"]'), T('[data-testid="show-join"]'), T('[data-testid="solo-game"]'),
      T('.lk-c-slot', '.lk-c-coin-t', '.lk-c-coin', 'coin text against its slot'),
    ],
  },
  {
    name: 'join',
    prep: async (p) => {
      await p.getByTestId('show-join').click();
      await p.getByTestId('code-input').fill('K7QX');
    },
    targets: [T('[data-testid="join-game"]'), T('[data-testid="code-input"]')],
  },
  {
    name: 'fleet',
    prep: toFleet,
    targets: [
      T('.lk-step', '.lk-step-t', '.lk-step', 'step label'), T('.lk-step-n'), T('[data-testid="fleet-info"]'),
      T('[data-testid="fleet-continue"]'), T('.fleet-points', '.fleet-points .k', '.fleet-points', 'points label'),
      T('.fleet-points', '.fleet-points .v', '.fleet-points', 'points number'),
    ],
  },
  {
    name: 'placing',
    prep: async (p) => {
      await toFleet(p);
      await p.getByTestId('fleet-continue').click();
      await p.getByTestId('auto-place').click();
    },
    targets: [
      T('[data-testid="ship-chip-carrier"]', '[data-testid="ship-chip-carrier"] .nm'),
      T('[data-testid="rotate"]'), T('[data-testid="auto-place"]'), T('[data-testid="clear-fleet"]'),
      T('[data-testid="ready"]'), T('[data-testid="fast-start"]'),
    ],
  },
];

async function pixels(png) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

async function offsetOf(page, t) {
  const geo = await page.evaluate(({ box, text, clip }) => {
    const b = document.querySelector(box);
    const c = document.querySelector(clip);
    const x = document.querySelector(text);
    if (!b || !c || !x) return null;
    document.querySelectorAll('[data-centre-ink]').forEach((e) => e.removeAttribute('data-centre-ink'));
    x.setAttribute('data-centre-ink', '');
    const br = b.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    const cs = getComputedStyle(b);
    const top = Math.min(cr.top, br.top);
    return {
      clip: { x: Math.floor(cr.left), y: Math.floor(top), width: Math.ceil(Math.max(cr.width, br.width)), height: Math.ceil(Math.max(cr.bottom, br.bottom) - top) },
      boxTop: br.top + parseFloat(cs.borderTopWidth),
      boxBottom: br.bottom - parseFloat(cs.borderBottomWidth),
    };
  }, t);
  if (!geo) return null;
  const icons = await page.addStyleTag({ content: 'svg { visibility: hidden !important; }' });
  const withText = await pixels(await page.screenshot({ clip: geo.clip, animations: 'disabled' }));
  const hide = await page.addStyleTag({
    content: '[data-centre-ink], [data-centre-ink] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }',
  });
  const without = await pixels(await page.screenshot({ clip: geo.clip, animations: 'disabled' }));
  await icons.evaluate((e) => e.remove());
  await hide.evaluate((e) => e.remove());
  const rows = new Array(withText.h).fill(0);
  for (let y = 0; y < withText.h; y++) {
    for (let x = 0; x < withText.w; x++) {
      const i = (y * withText.w + x) * withText.ch;
      const d = Math.abs(withText.data[i] - without.data[i]) + Math.abs(withText.data[i + 1] - without.data[i + 1]) + Math.abs(withText.data[i + 2] - without.data[i + 2]);
      if (d > 60) rows[y]++;
    }
  }
  const max = Math.max(...rows);
  if (!max) return null;
  const band = rows.flatMap((n, y) => (n >= max * 0.2 ? [y] : []));
  const inkTop = geo.clip.y + band[0] / DPR;
  const inkBottom = geo.clip.y + (band[band.length - 1] + 1) / DPR;
  return (inkTop + inkBottom) / 2 - (geo.boxTop + geo.boxBottom) / 2;
}

let failed = 0;
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/play`);
  const name0 = page.locator('input').first();
  if (await name0.isVisible().catch(() => false)) {
    await name0.fill('Klara');
    await name0.press('Enter');
  }
  for (const s of SCREENS) {
    await page.goto(`${BASE}/#/play`);
    await page.reload();
    await s.prep(page);
    // Every box measured fits the iPad viewport from the top of its screen.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    console.log(`\n${name} · ${s.name}`);
    for (const t of s.targets) {
      const off = await offsetOf(page, t);
      if (off === null) {
        console.log(`  missing  ${t.label}`);
        failed++;
        continue;
      }
      const bad = Math.abs(off) > LIMIT[name];
      if (bad) failed++;
      console.log(`  ${bad ? 'OFF' : 'ok '} ${off >= 0 ? '+' : ''}${off.toFixed(1)}px  ${t.label}`);
    }
  }
  await browser.close();
}
console.log(failed ? `\n${failed} label(s) off centre` : '\nEvery label is centred');
process.exit(failed ? 1 : 0);
