// Shared helpers for the mockup shelf scripts.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;

export function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => d.name)
    .sort();
}

// Returns { data, body, hasFrontMatter }.
export function parseReadme(file) {
  if (!fs.existsSync(file)) return { data: {}, body: '', hasFrontMatter: false, missing: true };
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text, hasFrontMatter: false };
  let data = {};
  try {
    data = YAML.parse(m[1]) || {};
  } catch (e) {
    return { data: {}, body: m[2], hasFrontMatter: false, error: e.message };
  }
  if (typeof data !== 'object' || Array.isArray(data)) data = {};
  return { data, body: m[2], hasFrontMatter: Object.keys(data).length > 0 };
}

export function parseSize(s) {
  const m = String(s).match(/^(\d+)x(\d+)$/i);
  return m ? { w: +m[1], h: +m[2] } : null;
}

// The folder that holds the current round's files: rounds/<x>/ or rounds/<x>/<current>/.
export function currentDir(roundDir, data) {
  const cur = data.current && String(data.current);
  if (cur && fs.existsSync(path.join(roundDir, cur)) && fs.statSync(path.join(roundDir, cur)).isDirectory()) {
    return path.join(roundDir, cur);
  }
  return roundDir;
}

// Shelf dir: first positional arg, else the parent of .shelf/ when run from there, else cwd.
export function resolveShelf(argv, scriptUrl) {
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      if (['--port', '--round'].includes(argv[i])) i++;
      continue;
    }
    pos.push(argv[i]);
  }
  if (pos[0]) return path.resolve(pos[0]);
  const here = path.dirname(new URL(scriptUrl).pathname);
  if (path.basename(here) === '.shelf') return path.dirname(here);
  return process.cwd();
}

export function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
