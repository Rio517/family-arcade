#!/usr/bin/env node
/**
 * Make each game's landing-page preview image from a committed screenshot:
 * a 640px-wide webp, cropped to 16:9 from the top, small enough to bundle
 * (the PWA precaches it, so it works offline) and sharp enough to sell the
 * game on a ticket.
 *
 *   npm run previews            # every game
 *   npm run previews -- chess   # one
 *
 * Which screenshot each game uses is decided here, on purpose: the ticket
 * shows the game at its best, not whichever shot changed last.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = path.join(ROOT, 'docs', 'screenshots');

/** game id → the screenshot that sells it, and where its webp lives. */
const PREVIEWS = {
  chess: { from: 'chess-galaxy-3d.png', to: 'src/games/chess/assets/preview.webp' },
  battleship: { from: 'battle-fleet-3d.png', to: 'src/games/battleship/assets/preview.webp' },
  racer: { from: 'racer-arena.png', to: 'src/games/racer/assets/preview.webp' },
  risk: { from: 'risk-board.png', to: 'src/games/risk/assets/preview.webp' },
  unicorn: { from: 'coins-sky.png', to: 'src/games/unicorn/assets/preview.webp' },
  mirror: { from: 'mirror-effects.png', to: 'src/games/mirror/assets/preview.webp' },
  caribbean: { from: 'caribbean-naval/battle-tablet-landscape.png', to: 'src/games/caribbean/assets/preview.webp' },
  yahtzee: { from: 'yahtzee-tabs.png', to: 'src/app/assets/yahtzee-preview.webp' },
};

const only = process.argv.slice(2);
const WIDTH = 640;
const HEIGHT = 360;

for (const [id, { from, to }] of Object.entries(PREVIEWS)) {
  if (only.length && !only.includes(id)) continue;
  const src = path.join(SHOTS, from);
  if (!fs.existsSync(src)) {
    console.log(`  skip ${id}: ${from} not found`);
    continue;
  }
  const out = path.join(ROOT, to);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const meta = await sharp(src).metadata();
  // Crop a 16:9 window from the top of the shot (the title bars and boards
  // sit high), scaled so the crop is the full width.
  const cropH = Math.min(meta.height, Math.round((meta.width * HEIGHT) / WIDTH));
  await sharp(src)
    .extract({ left: 0, top: 0, width: meta.width, height: cropH })
    .resize(WIDTH, HEIGHT, { fit: 'cover' })
    .webp({ quality: 78 })
    .toFile(out);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`  ${id}: ${from} → ${path.relative(ROOT, out)} (${kb} KB)`);
}
