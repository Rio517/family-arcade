#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

const [input, output] = process.argv.slice(2);

if (!input || !output || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/prepare-caribbean-art.mjs <input> <output>');
}
if (/^https?:\/\//i.test(input) || /^https?:\/\//i.test(output)) {
  throw new Error('Caribbean art preparation accepts local paths only');
}
if (!fs.statSync(input).isFile()) throw new Error(`Input is not a file: ${input}`);

fs.mkdirSync(path.dirname(output), { recursive: true });
await sharp(input)
  .rotate()
  .resize(1920, 1080, { fit: 'cover', position: 'center' })
  .webp({ quality: 84 })
  .toFile(output);
