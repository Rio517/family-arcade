#!/usr/bin/env node
// Generates <shelf>/index.html from rounds/*/README.md front matter and screens/*/.
// Usage: node index.mjs <shelf dir>
import fs from 'node:fs';
import path from 'node:path';
import { listDirs, parseReadme, currentDir, IMG_RE } from './lib.mjs';

const shelf = path.resolve(process.argv[2] || '.');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const url = (...parts) => parts.filter(Boolean).map((p) => p.split('/').map(encodeURIComponent).join('/')).join('/');

function firstImage(roundDir, data, rel) {
  const dirs = [path.join(roundDir, 'shots')];
  const cur = currentDir(roundDir, data);
  if (cur !== roundDir) dirs.unshift(path.join(cur, 'shots'));
  dirs.push(roundDir); // fallback: a loose image beside the README (older rounds)
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const f = fs.readdirSync(d).filter((n) => IMG_RE.test(n)).sort()[0];
    if (f) return url(rel, path.relative(roundDir, d), f);
  }
  return null;
}

function readRounds() {
  return listDirs(path.join(shelf, 'rounds')).map((name) => {
    const dir = path.join(shelf, 'rounds', name);
    const { data, hasFrontMatter, error } = parseReadme(path.join(dir, 'README.md'));
    const rel = `rounds/${name}`;
    const hasIndex = fs.existsSync(path.join(dir, 'index.html'));
    const pages = hasIndex ? [] : fs.readdirSync(dir).filter((n) => n.endsWith('.html'));
    const link = hasIndex ? url(rel, 'index.html') : pages.length === 1 ? url(rel, pages[0]) : fs.existsSync(path.join(dir, 'README.md')) ? url(rel, 'README.md') : url(rel) + '/';
    const dateStr = data.date ? String(data.date).slice(0, 10) : (name.match(/^(\d{4})(\d{2})(\d{2})/) || []).slice(1).join('-');
    return {
      name,
      data,
      needsReadme: !hasFrontMatter,
      error,
      link,
      hasIndex,
      date: dateStr || '',
      status: String(data.status || '').toLowerCase(),
      thumb: firstImage(dir, data, rel),
    };
  });
}

function readScreens() {
  return listDirs(path.join(shelf, 'screens')).map((name) => {
    const dir = path.join(shelf, 'screens', name);
    const { data, body } = parseReadme(path.join(dir, 'README.md'));
    const htmls = fs.readdirSync(dir).filter((n) => n.endsWith('.html')).sort();
    const main = htmls.find((n) => n === `${name}.html`) || htmls.find((n) => n === 'index.html') || htmls[0];
    const heading = (body.match(/^#\s+(.+)$/m) || [])[1];
    return {
      name,
      title: data.title || heading || name,
      files: htmls,
      link: main ? url('screens', name, main) : url('screens', name, 'README.md'),
      thumb: (() => {
        const img = fs.readdirSync(dir).filter((n) => IMG_RE.test(n)).sort()[0];
        return img ? url('screens', name, img) : null;
      })(),
    };
  });
}

const chipLabel = { open: 'Open', picked: 'Picked', built: 'Built', parked: 'Parked' };

function card(r) {
  const d = r.data;
  const chip = r.needsReadme
    ? '<span class="chip chip-warn">needs README</span>'
    : `<span class="chip chip-${esc(r.status || 'open')}">${esc(chipLabel[r.status] || r.status || 'open')}</span>`;
  const meta = [];
  if (d.current) meta.push(`showing ${esc(d.current)}`);
  if (d.tested_with) meta.push(`tested with ${esc(d.tested_with)}`);
  if (Array.isArray(d.sizes) && d.sizes.length) meta.push(esc(d.sizes.join(', ')));
  return `<article class="card">
  <a class="thumb" href="${r.link}">${r.thumb ? `<img src="${r.thumb}" alt="" loading="lazy">` : '<span class="nothumb">no shots yet</span>'}</a>
  <div class="body">
    <div class="row">${chip}<time>${esc(r.date)}</time></div>
    <h3><a href="${r.link}">${esc(d.title || r.name)}</a></h3>
    <div class="folder">${esc(r.name)}</div>
    ${d.question ? `<p class="q">${esc(d.question)}</p>` : ''}
    ${d.picked ? `<p class="pick"><b>Picked:</b> ${esc(d.picked)}${d.spec ? ` &middot; <a href="${url('rounds', r.name, String(d.spec))}">spec</a>` : ''}</p>` : ''}
    ${meta.length ? `<p class="meta">${meta.join(' &middot; ')}</p>` : ''}
    ${r.needsReadme ? `<p class="meta">Add front matter to <code>rounds/${esc(r.name)}/README.md</code>.${r.error ? ' YAML error: ' + esc(r.error) : ''}</p>` : ''}
  </div>
</article>`;
}

function section(title, hint, rounds) {
  if (!rounds.length) return '';
  const sorted = [...rounds].sort((a, b) => b.date.localeCompare(a.date) || b.name.localeCompare(a.name));
  return `<section><h2>${title} <span class="count">${rounds.length}</span></h2><p class="hint">${hint}</p><div class="grid">${sorted.map(card).join('\n')}</div></section>`;
}

const rounds = readRounds();
const screens = readScreens();
const open = rounds.filter((r) => r.needsReadme || r.status === 'open' || !['picked', 'built', 'parked'].includes(r.status));
const done = rounds.filter((r) => !open.includes(r) && (r.status === 'picked' || r.status === 'built'));
const parked = rounds.filter((r) => r.status === 'parked');

let title = path.basename(shelf);
try {
  const pj = JSON.parse(fs.readFileSync(path.join(shelf, 'package.json'), 'utf8'));
  if (pj.name) title = pj.name;
} catch {}

const screenHtml = screens.length
  ? `<section><h2>Canonical screens <span class="count">${screens.length}</span></h2><p class="hint">The approved spec. Principles and key interactions, not every pixel.</p><div class="screens">${screens
      .map(
        (s) => `<a class="screen" href="${s.link}">${s.thumb ? `<img src="${s.thumb}" alt="" loading="lazy">` : ''}<b>${esc(s.title)}</b><span>${esc(s.name)} &middot; ${s.files.length} file${s.files.length === 1 ? '' : 's'}</span></a>`
      )
      .join('')}</div></section>`
  : '';

const html = `<!doctype html>
<!-- GENERATED by .shelf/index.mjs from rounds/*/README.md and screens/*/. Never hand-edit; run \`npm run index\`. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mockup shelf: ${esc(title)}</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#23211d;--soft:#6b665c;--line:#e3ded2;--accent:#2f5d8a;--open:#b5651d;--picked:#2e7d4f;--built:#2f5d8a;--parked:#7a7a7a;--warn:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#1b1a17;--card:#26241f;--ink:#efeae0;--soft:#a39d90;--line:#38352e;--accent:#8db6e0;--open:#e8a15d;--picked:#6fcf97;--built:#8db6e0;--parked:#9a9a9a;--warn:#ff8a80}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1800px;margin:0 auto;padding:40px 48px 80px}
h1{font-size:30px;margin:0 0 4px}
.sub{color:var(--soft);margin:0 0 32px}
h2{font-size:22px;margin:40px 0 2px}
.count{font-size:14px;color:var(--soft);font-weight:400;margin-left:6px}
.hint{color:var(--soft);margin:0 0 16px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.thumb{display:block;aspect-ratio:16/10;background:#0001;border-bottom:1px solid var(--line)}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.nothumb{display:flex;height:100%;align-items:center;justify-content:center;color:var(--soft);font-size:14px}
.body{padding:14px 16px 16px}
.row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
time{color:var(--soft);font-size:13px}
.chip{font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;padding:2px 9px;border-radius:99px;border:1px solid currentColor}
.chip-open{color:var(--open)}.chip-picked{color:var(--picked)}.chip-built{color:var(--built)}.chip-parked{color:var(--parked)}.chip-warn{color:var(--warn)}
h3{font-size:18px;margin:0}
h3 a,.screen{color:inherit;text-decoration:none}
h3 a:hover{color:var(--accent);text-decoration:underline}
.folder{font:12px ui-monospace,Menlo,monospace;color:var(--soft);margin-bottom:8px}
.q{margin:6px 0}
.pick{margin:6px 0;color:var(--picked)}
.pick a{color:var(--accent)}
.meta{margin:6px 0 0;color:var(--soft);font-size:13px}
code{font:12px ui-monospace,Menlo,monospace;background:#0001;padding:1px 4px;border-radius:4px}
.screens{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.screen{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:2px}
.screen img{width:100%;border-radius:8px;margin-bottom:8px}
.screen:hover{border-color:var(--accent)}
.screen span{color:var(--soft);font-size:13px}
.empty{color:var(--soft)}
</style>
</head>
<body>
<main>
<h1>Mockup shelf</h1>
<p class="sub">${esc(title)} &middot; ${rounds.length} round${rounds.length === 1 ? '' : 's'}, ${screens.length} canonical screen${screens.length === 1 ? '' : 's'}</p>
${section('Open', 'Questions still being asked.', open)}
${section('Picked and built', 'Decided. The pick is recorded in the round README.', done)}
${section('Parked', 'Set aside for now.', parked)}
${screenHtml}
${!rounds.length && !screens.length ? '<p class="empty">Nothing here yet. Add <code>rounds/YYYYMMDD-topic/README.md</code> with front matter.</p>' : ''}
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(shelf, 'index.html'), html);
console.log(`index: ${rounds.length} rounds, ${screens.length} screens -> ${path.join(shelf, 'index.html')}`);
