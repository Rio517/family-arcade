// The one gate to run and quote: `npm run gates`.
// Runs check, vitest and build with output going to files (never piped, so
// nothing is lost), parses the real numbers, compares them with
// gates-baseline.json and prints ONE summary line. Exit 1 on a regression.
// `npm run gates -- --update-baseline` rewrites the baseline after an
// intended change; say in the commit why it moved.
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const baselinePath = join(root, 'gates-baseline.json')
const update = process.argv.includes('--update-baseline')
const MAIN_GROWTH_LIMIT = 2048 // bytes

const logDir = join(tmpdir(), `gates-${new Date().toISOString().replace(/[:.]/g, '-')}`)
mkdirSync(logDir, { recursive: true })

const hasHeavy = spawnSync('sh', ['-c', 'command -v heavy'], { encoding: 'utf8' }).status === 0

/** Run a shell command with stdout+stderr going to a file; returns the exit code and log text. */
function step(name, kind, cmd) {
  const file = join(logDir, `${name}.log`)
  const fd = openSync(file, 'w')
  const full = hasHeavy ? ['heavy', 'run', '--kind', kind, '--', 'sh', '-c', cmd] : ['sh', '-c', cmd]
  const r = spawnSync(full[0], full.slice(1), { cwd: root, stdio: ['ignore', fd, fd] })
  closeSync(fd)
  return { file, exit: r.status ?? 1, text: readFileSync(file, 'utf8') }
}

/** Delete stray *.tsbuildinfo outside node_modules, as CLAUDE.md requires. */
function deleteTsbuildinfo(dir = root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.claude') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) deleteTsbuildinfo(p)
    else if (e.name.endsWith('.tsbuildinfo')) unlinkSync(p)
  }
}

const num = (s) => Number(String(s).replace(/,/g, ''))
const fmt = (n) => (n == null ? '?' : n.toLocaleString('en-US'))

const check = step('check', 'check', 'npm run check')
const test = step('vitest', 'test', 'npx vitest run')
deleteTsbuildinfo()
const build = step('build', 'build', 'npm run build')

// ESLint summary line; 0/0 when absent and the check exited 0.
const lint = check.text.match(/✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)/)
const errors = lint ? num(lint[2]) : check.exit === 0 ? 0 : null
const warnings = lint ? num(lint[3]) : check.exit === 0 ? 0 : null
// knip is the last step of `check`: clean means check passed; otherwise it is
// only "not clean" if the run got as far as knip.
const knipRan = /npm (notice )?run .*knip/.test(check.text) || /\n> knip/.test(check.text)
const knipClean = check.exit === 0 ? true : knipRan ? false : null

const tf = test.text.match(/Test Files\s+(?:.*?\|\s*)?(\d+) passed(?:\s*\|.*?)?\s*\((\d+)\)/)
const tt = test.text.match(/Tests\s+(?:.*?\|\s*)?(\d+) passed(?:\s*\|.*?)?\s*\((\d+)\)/)
const anyFail = /^\s*(FAIL|×)\s/m.test(test.text) || /\d+ failed/.test(test.text) || test.exit !== 0

let mainBytes = null
const assets = join(root, 'dist/assets')
if (existsSync(assets)) {
  for (const f of readdirSync(assets)) {
    if (/^index-.*\.js$/.test(f)) mainBytes = Math.max(mainBytes ?? 0, statSync(join(assets, f)).size)
  }
}
const pre = build.text.match(/precache\s+(\d+) entries/)

const cur = {
  errors,
  warnings,
  testFiles: tf ? num(tf[1]) : null,
  testFilesTotal: tf ? num(tf[2]) : null,
  tests: tt ? num(tt[1]) : null,
  testsTotal: tt ? num(tt[2]) : null,
  mainBytes,
  precache: pre ? num(pre[1]) : null,
}

console.log('Full logs:')
for (const s of [check, test, build]) console.log(`  ${s.file}`)

if (update) {
  const unparsed = Object.entries(cur).filter(([, v]) => v == null).map(([k]) => k)
  if (unparsed.length || check.exit !== 0 || anyFail || build.exit !== 0) {
    console.log(`GATES FAIL · not updating the baseline: a gate failed or did not parse (${unparsed.join(', ') || 'exit codes'})`)
    process.exit(1)
  }
  writeFileSync(baselinePath, JSON.stringify(cur, null, 2) + '\n')
  console.log(`Baseline written to ${baselinePath}`)
}

const base = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null
const bad = []
const mark = (ok, text, label) => {
  if (!ok) bad.push(label)
  return ok ? text : `${text} ✗`
}
const exit0 = (s) => s.exit === 0

const parts = [
  mark(
    exit0(check) && errors != null && (!base || (errors <= base.errors && warnings <= base.warnings)),
    `check ${fmt(errors)} err / ${fmt(warnings)} warn (base ${fmt(base?.warnings)})`,
    'check',
  ),
  mark(knipClean === true, `knip ${knipClean === true ? 'clean' : knipClean === false ? 'NOT clean' : 'not reached'}`, 'knip'),
  mark(
    !anyFail && cur.tests != null && (!base || (cur.testFiles >= base.testFiles && cur.tests >= base.tests)),
    `tests ${fmt(cur.testFiles)}/${fmt(cur.testFilesTotal)} files, ${fmt(cur.tests)}/${fmt(cur.testsTotal)}${anyFail ? ' FAIL' : ''}`,
    'tests',
  ),
  mark(exit0(build), `build ${exit0(build) ? 'ok' : `FAILED (exit ${build.exit})`}`, 'build'),
  mark(
    mainBytes != null && (!base || mainBytes <= base.mainBytes + MAIN_GROWTH_LIMIT),
    `main ${fmt(mainBytes)} B (base ${fmt(base?.mainBytes)})`,
    'main',
  ),
  `precache ${fmt(cur.precache)}`,
]
if (!base) bad.push('baseline missing (run with --update-baseline)')
console.log(`GATES ${bad.length ? 'FAIL' : 'ok'} · ${parts.join(' · ')}`)
process.exit(bad.length ? 1 : 0)
