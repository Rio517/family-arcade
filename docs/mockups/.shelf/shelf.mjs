#!/usr/bin/env node
// Runs index.mjs, then serves the shelf with live reload on 0.0.0.0:<port>. Never opens a browser.
// Usage: node shelf.mjs [shelf dir] --port N
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import browserSync from 'browser-sync';
import { resolveShelf, flag } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shelf = resolveShelf(process.argv.slice(2), import.meta.url);
const port = Number(flag(process.argv, '--port', process.env.PORT || 4300));

function runIndex() {
  const r = spawnSync(process.execPath, [path.join(here, 'index.mjs'), shelf], { stdio: 'inherit' });
  if (r.status !== 0) console.error('index.mjs failed');
}
// Fail loudly if the port is taken instead of letting browser-sync pick another one.
await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once('error', (e) => {
    console.error(`Port ${port} is not available (${e.code}). Stop the other server or pass --port.`);
    process.exit(1);
  });
  probe.listen(port, '0.0.0.0', () => probe.close(resolve));
});
runIndex();

// Optional package.json "shelf": { "routes": { "/screenshots": "../screenshots" } } serves folders outside the shelf,
// for old pages whose relative links climb out of it (relative targets resolve from the shelf dir).
let routes = {};
try {
  const pj = JSON.parse(fs.readFileSync(path.join(shelf, 'package.json'), 'utf8'));
  for (const [k, v] of Object.entries((pj.shelf && pj.shelf.routes) || {})) routes[k] = path.resolve(shelf, v);
} catch {}

const bs = browserSync.create('shelf');
bs.init(
  {
    server: { baseDir: shelf, routes },
    host: '0.0.0.0',
    listen: '0.0.0.0',
    port,
    open: false, // never open a browser
    ui: false,
    notify: false,
    ghostMode: false,
    logLevel: 'silent',
    files: ['**/*.{html,css,js,png,jpg,jpeg,webm,md}'].map((m) => ({
      match: [m, '!**/node_modules/**', '!**/.shelf/**'],
      fn: (event, file) => {
        if (event === 'change' || event === 'add' || event === 'unlink') bs.reload(file);
      },
    })),
    watchOptions: { ignoreInitial: true, ignored: ['**/node_modules/**', '**/.shelf/**', '**/.git/**'] },
  },
  (err) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    const actual = bs.getOption('port');
    const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
    console.log(`Mockup shelf: ${shelf}`);
    console.log(`  Local:   http://localhost:${actual}`);
    for (const n of nets) console.log(`  Network: http://${n.address}:${actual}`);
  }
);

let timer;
bs.watch('**/README.md', { ignoreInitial: true, ignored: ['**/node_modules/**', '**/.shelf/**'] }, () => {
  clearTimeout(timer);
  timer = setTimeout(runIndex, 150);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { bs.exit(); process.exit(0); });
