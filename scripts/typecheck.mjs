// The real typecheck: TypeScript 7 (native), clean every time, no cache.
// `typescript` stays on 5.x because typescript-eslint needs its API (it
// supports <6.1); `typescript7` is the same compiler rewritten in Go and
// only checks. `--composite false` stops it reading or writing a
// *.tsbuildinfo, so a stale one can't hide an error. Both projects run side
// by side; the first failure's exit code wins.
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tsc = join(root, 'node_modules/typescript7/bin/tsc')

const run = (project) =>
  new Promise((done) => {
    const p = spawn(process.execPath, [tsc, '-p', project, '--noEmit', '--composite', 'false'], { cwd: root, stdio: 'inherit' })
    p.on('close', (code) => done(code ?? 1))
  })

const codes = await Promise.all(['tsconfig.app.json', 'tsconfig.node.json'].map(run))
process.exit(codes.find((c) => c !== 0) ?? 0)
