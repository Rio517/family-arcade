#!/usr/bin/env node
// Headless screenshots of the current round's option pages at each front-matter size.
// Usage: node shots.mjs [shelf dir] [--all] [--round <folder>]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { listDirs, parseReadme, parseSize, currentDir, resolveShelf, flag } from './lib.mjs';

const argv = process.argv.slice(2);
const shelf = resolveShelf(argv, import.meta.url);
const all = argv.includes('--all');
const only = flag(argv, '--round', null);

const optionFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.html') && n !== 'index.html' && (/^[a-z0-9]-.+\.html$/i.test(n) || n === 'today.html'))
    .sort();

const jobs = [];
for (const name of listDirs(path.join(shelf, 'rounds'))) {
  if (only && name !== only) continue;
  const roundDir = path.join(shelf, 'rounds', name);
  const { data } = parseReadme(path.join(roundDir, 'README.md'));
  if (!only && !all && String(data.status || '').toLowerCase() !== 'open') continue;
  const dir = currentDir(roundDir, data);
  const sizes = (Array.isArray(data.sizes) && data.sizes.length ? data.sizes : ['1440x900']).map(parseSize).filter(Boolean);
  for (const f of optionFiles(dir)) jobs.push({ name, dir, f, sizes });
}

if (!jobs.length) {
  console.log('shots: nothing to render (no open rounds with option files; use --all)');
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
let n = 0;
try {
  for (const j of jobs) {
    fs.mkdirSync(path.join(j.dir, 'shots'), { recursive: true });
    for (const { w, h } of j.sizes) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(pathToFileURL(path.join(j.dir, j.f)).href, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const out = path.join(j.dir, 'shots', `${path.basename(j.f, '.html')}-${w}x${h}.png`);
      await page.screenshot({ path: out });
      await page.close();
      n++;
      console.log(`shots: ${path.relative(shelf, out)}`);
    }
  }
} finally {
  await browser.close();
}
console.log(`shots: ${n} image${n === 1 ? '' : 's'}`);
