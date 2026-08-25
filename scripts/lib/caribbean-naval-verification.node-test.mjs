import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SOURCE_SEEDS = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'knip.json',
  'index.html',
  'preview-caribbean-game.html',
  'scripts/caribbean-port-check.mjs',
  'scripts/caribbean-naval-check.mjs',
  'scripts/fixtures/caribbean-campaign-victory.json',
  ':(glob)scripts/lib/caribbean-naval-*.mjs',
  ':(glob)scripts/lib/caribbean-port-identity-*.mjs',
  ':(glob)scripts/lib/caribbean-campaign-*.mjs',
  ':(glob)src/games/caribbean/**',
  ':(glob)public/**',
];

const NAVAL_SCREENSHOTS = [
  { name: 'battle-boundary-supported.png', width: 960, height: 600, state: 'battle-boundary' },
  { name: 'battle-desktop.png', width: 1440, height: 900, state: 'battle' },
  { name: 'battle-minimum-supported.png', width: 1024, height: 768, state: 'battle-minimum' },
  { name: 'battle-tablet-landscape.png', width: 1180, height: 820, state: 'battle-tablet' },
  { name: 'boarding-ready-result.png', width: 1180, height: 820, state: 'boarding-ready' },
  { name: 'briefing-tablet.png', width: 1180, height: 820, state: 'briefing' },
  { name: 'broadside-handedness.png', width: 1180, height: 820, state: 'starboard-broadside' },
  { name: 'decision-tablet.png', width: 1180, height: 820, state: 'decision' },
  { name: 'fallback-tablet-landscape.png', width: 1024, height: 768, state: 'fallback' },
  { name: 'minimum-screen-phone-landscape.png', width: 844, height: 390, state: 'unsupported-landscape' },
  { name: 'minimum-screen-phone-portrait.png', width: 430, height: 932, state: 'unsupported-portrait' },
];

const FIXTURE_SOURCE_FILES = [{
  path: 'package.json',
  sha256: '1111111111111111111111111111111111111111111111111111111111111111',
}];
const FIXTURE_SOURCE_HASH = 'ee14b07d6b9b60df47675ab00178e3f17c6a84f1d278f135cfdbeb01309678c0';

function pngBytes(width, height, variant = 0) {
  const bytes = Buffer.alloc(25);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]).copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = variant;
  return bytes;
}

function stableManifest({
  sourceFiles = FIXTURE_SOURCE_FILES,
  sourceHash = FIXTURE_SOURCE_HASH,
} = {}) {
  const supported = {
    battle: true,
    notice: false,
    fullBleed: true,
    centerClear: true,
    controlsVisible: true,
    touchSized: true,
    labelsContained: true,
    shortcutKeys: true,
    sailControl: true,
    noOuterScroll: true,
  };
  const unsupported = { notice: true, battle: false, liveFrame: false, focused: true };
  return {
    version: 1,
    sourceFiles,
    sourceHash,
    canonicalInput: { battleId: 'battle-lab-red-jackdaw', seed: 1702 },
    viewports: {
      tablet: { width: 1180, height: 820 },
      desktop: { width: 1440, height: 900 },
      minimum: { width: 1024, height: 768 },
      boundary: { width: 960, height: 600 },
      phonePortrait: { width: 430, height: 932 },
      phoneLandscape: { width: 844, height: 390 },
    },
    screenshots: structuredClone(NAVAL_SCREENSHOTS),
    asset: {
      path: '/assets/caribbean-sloop-fixture.glb',
      sha256: '3333333333333333333333333333333333333333333333333333333333333333',
    },
    handedness: {
      portVectorPositiveX: true,
      starboardVectorNegativeX: true,
      portMuzzlePositiveX: true,
      starboardMuzzleNegativeX: true,
      steeringPortPositive: true,
      steeringStarboardNegative: true,
      rudderReleased: true,
    },
    outcome: {
      ok: true,
      outcome: 'boarding-ready',
      initial: {
        distance: 7.02,
        outcomeInjected: false,
        damageInjectedAfterStart: false,
        timeInjected: false,
        opponent: { hull: 72, sails: 30, crew: 18, cannon: 6 },
      },
    },
    fallback: {
      ok: true,
      chart: true,
      retry: true,
      restart: true,
      battleControls: true,
      labelsClear: true,
    },
    motion: {
      normal: { preference: 'no-preference', reducedMotion: false },
      reduced: { preference: 'reduce', reducedMotion: true },
    },
    display: {
      supported: {
        boundary: structuredClone(supported),
        desktop: structuredClone(supported),
        minimum: structuredClone(supported),
        tablet: structuredClone(supported),
      },
      unsupported: {
        landscape: structuredClone(unsupported),
        portrait: structuredClone(unsupported),
      },
      resize: {
        notice: true,
        noticeFocused: true,
        battleUnmounted: true,
        tickStopped: true,
        restoredWithNewSession: true,
      },
      prebattle: {
        decision: { legendComplete: true, ctaVisible: true, noOuterScroll: true },
        briefing: { legendComplete: true, ctaVisible: true, noOuterScroll: true },
      },
    },
  };
}

function validGeneration({ sourceFiles, sourceHash, variant = 0, captureHead = null } = {}) {
  const manifest = stableManifest({ sourceFiles, sourceHash });
  return {
    verdict: { ok: true },
    capture: captureHead === null ? undefined : {
      headCommitAtCapture: captureHead,
      worktreeDirtyBeforeCapture: false,
    },
    source: captureHead === null ? undefined : {
      headCommitAtCapture: captureHead,
      worktreeDirtyBeforeCapture: false,
      sourceTreeSha256: manifest.sourceHash,
      sourceTreeFiles: manifest.sourceFiles.map((row) => row.path),
      sourceFiles: manifest.sourceFiles,
      sourceHash: manifest.sourceHash,
    },
    stableManifest: manifest,
    observations: validObservations(variant),
    artifacts: manifest.screenshots.map((row) => ({
      ...row,
      bytes: pngBytes(row.width, row.height, variant),
    })),
  };
}

function writeGeneration(directory, generation, { artifactVariant = null } = {}) {
  const { artifacts: _artifacts, ...metrics } = generation;
  fs.writeFileSync(path.join(directory, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  for (const [index, artifact] of generation.artifacts.entries()) {
    const row = generation.stableManifest.screenshots[index];
    const bytes = artifactVariant === null
      ? artifact.bytes
      : pngBytes(row.width, row.height, artifactVariant);
    fs.writeFileSync(path.join(directory, artifact.name), bytes);
  }
}

function writeFiles(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
}

async function makeTrackedGraph(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-source-graph-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scaffold = {
    'package.json': JSON.stringify({
      dependencies: { react: '1.0.0', '@scope/runtime': '1.0.0' },
      devDependencies: { '@types/declared': '1.0.0', '@types/scope__typed': '1.0.0', typescript: '1.0.0' },
    }),
    'package-lock.json': '{}\n',
    'tsconfig.json': '{}\n',
    'tsconfig.node.json': '{}\n',
    'tsconfig.app.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: {
      '@shared/*': ['src/shared/*'],
      '@games/*': ['src/games/*'],
      '@app/*': ['src/app/*'],
      '@test/*': ['src/test/*'],
    } } }),
    'vite.config.ts': `import { fileURLToPath, URL } from 'node:url';\nexport default { resolve: { alias: {\n  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),\n  '@games': fileURLToPath(new URL('./src/games', import.meta.url)),\n  '@app': fileURLToPath(new URL('./src/app', import.meta.url)),\n  '@test': fileURLToPath(new URL('./src/test', import.meta.url)),\n} } };\n`,
    'knip.json': '{}\n',
    'index.html': '<script type="module" src="/src/app/main.tsx"></script>\n',
    'preview-caribbean-game.html': '<script type="module" src="/src/games/caribbean/preview.tsx"></script>\n',
    'scripts/caribbean-port-check.mjs': "import './lib/caribbean-campaign-victory-driver.mjs';\n",
    'scripts/caribbean-naval-check.mjs': "import './lib/caribbean-naval-evidence.mjs';\n",
    'scripts/fixtures/caribbean-campaign-victory.json': '{}\n',
    'scripts/lib/caribbean-naval-evidence.mjs': 'export const naval = true;\n',
    'scripts/lib/caribbean-port-identity-evidence.mjs': 'export const identity = true;\n',
    'scripts/lib/caribbean-campaign-victory-driver.mjs': 'export const driver = true;\n',
    'src/app/main.tsx': "import '@shared/styles/tokens.css'; import './App';\n",
    'src/app/App.tsx': "import '@app/registry'; export default function App() { return null; }\n",
    'src/app/registry.ts': 'export const registry = true;\n',
    'src/games/caribbean/preview.tsx': "import '@shared/styles/tokens.css';\n",
    'src/shared/styles/tokens.css': ':root { --ink: #000; }\n',
    'src/shared/storage/kv.ts': 'export const kv = true;\n',
    'src/test/.keep': '\n',
    'public/.keep': '\n',
  };
  writeFiles(root, { ...scaffold, ...files });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '--', ...Object.keys({ ...scaffold, ...files })], { cwd: root });
  return root;
}

function validObservations(variant = 0) {
  return {
    fpsSamples: Array(20).fill(60 + variant),
    sustainedFps: 60 + variant,
    maxDrawCalls: 30 + variant,
    maxTriangles: 8_000 + variant,
    boardingDuration: 3 + variant / 10,
    samples: Array.from({ length: 20 }, (_, index) => ({
      tick: (index + 1) * (60 + variant), paused: false, outcome: null,
      textures: 3, geometries: 30, materials: 30, bufferAttributes: 100,
      activeEffects: index === variant ? 4 + variant : 0, effectCapacity: 96,
    })),
    growthAfterWarmup: { textures: 0, geometries: 0, materials: 0, bufferAttributes: 0, effectCapacity: 0 },
    failures: { console: [], page: [], requests: [], unhandledRejections: [], allocation: [], capacity: [], pool: [] },
  };
}

const unsupportedLoaderFixtures = [
  {
    name: 'rejects nonliteral dynamic import with its source-files diagnostic',
    importer: 'src/games/caribbean/dynamic.mjs',
    diagnostic: 'nonliteral-dynamic-import',
    files: {
      'src/games/caribbean/dynamic.mjs': "const target = './dependency.mjs'; void import(target);\n",
      'src/games/caribbean/dependency.mjs': 'export default 1;\n',
    },
  },
  {
    name: 'rejects nonliteral CommonJS require with its source-files diagnostic',
    importer: 'src/games/caribbean/commonjs.cjs',
    diagnostic: 'nonliteral-commonjs-require',
    files: {
      'src/games/caribbean/commonjs.cjs': "const target = './dependency.cjs'; require(target);\n",
      'src/games/caribbean/dependency.cjs': 'module.exports = 1;\n',
    },
  },
  {
    name: 'rejects import.meta.glob with its source-files diagnostic',
    importer: 'src/games/caribbean/glob.ts',
    diagnostic: 'unsupported-import-meta-glob',
    files: {
      'src/games/caribbean/glob.ts': "export const modules = import.meta.glob('./views/*.tsx');\n",
      'src/games/caribbean/views/a.tsx': 'export default function A() { return null; }\n',
    },
  },
];

for (const fixture of unsupportedLoaderFixtures) {
  test(fixture.name, async (t) => {
    const root = await makeTrackedGraph(t, fixture.files);
    const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
    assert.throws(
      () => auditCaribbeanNavalSourceClosure(root),
      (error) => {
        assert.equal(error?.constructor?.name, 'CaribbeanNavalSourceAuditError');
        assert.equal(error.code, 'source-files');
        assert.equal(error.diagnostic, fixture.diagnostic);
        assert.equal(error.importer, fixture.importer);
        assert.equal(
          error.message,
          `CARIBBEAN_SOURCE_AUDIT_FAILED source-files diagnostic=${fixture.diagnostic} importer=${fixture.importer}`,
        );
        return true;
      },
    );
  });
}

test('accepts only an annotated same-file const built from literal concatenation', async (t) => {
  const root = await makeTrackedGraph(t, {
    'src/games/caribbean/annotated.test.ts': [
      "const modulePath = './annotated-' + 'dependency';",
      'void import(/* @vite-ignore */ modulePath);',
    ].join('\n'),
    'src/games/caribbean/annotated-dependency.ts': 'export const dependency = true;\n',
  });
  const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
  const audit = auditCaribbeanNavalSourceClosure(root);
  assert.ok(audit.paths.includes('src/games/caribbean/annotated-dependency.ts'));
  assert.ok(audit.edges.some((edge) => edge.importer === 'src/games/caribbean/annotated.test.ts'
    && edge.specifier === './annotated-dependency'
    && edge.target === 'src/games/caribbean/annotated-dependency.ts'));
});

test('resolves annotated imports through enclosing and disjoint lexical const bindings', async (t) => {
  const root = await makeTrackedGraph(t, {
    'src/games/caribbean/annotated-scopes.test.ts': [
      "const modulePath = './enclosing-dependency';",
      'async function enclosing() { void import(/* @vite-ignore */ modulePath); }',
      "{ const modulePath = './first-' + 'dependency'; void import(/* @vite-ignore */ modulePath); }",
      "{ const modulePath = './second-' + 'dependency'; void import(/* @vite-ignore */ modulePath); }",
      'void enclosing;',
    ].join('\n'),
    'src/games/caribbean/enclosing-dependency.ts': 'export const enclosing = true;\n',
    'src/games/caribbean/first-dependency.ts': 'export const first = true;\n',
    'src/games/caribbean/second-dependency.ts': 'export const second = true;\n',
  });
  const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
  const audit = auditCaribbeanNavalSourceClosure(root);
  for (const expected of [
    'src/games/caribbean/enclosing-dependency.ts',
    'src/games/caribbean/first-dependency.ts',
    'src/games/caribbean/second-dependency.ts',
  ]) assert.ok(audit.paths.includes(expected), expected);
});

const annotatedBindingFailures = [
  {
    name: 'unannotated identifier',
    source: "const modulePath = './dependency'; void import(modulePath);",
  },
  {
    name: 'parameter shadow',
    source: "const modulePath = './dependency'; async function load(modulePath) { void import(/* @vite-ignore */ modulePath); } void load;",
  },
  {
    name: 'catch binding shadow',
    source: "const modulePath = './dependency'; try {} catch (modulePath) { void import(/* @vite-ignore */ modulePath); }",
  },
  {
    name: 'import binding',
    source: "import modulePath from './provider'; void import(/* @vite-ignore */ modulePath);",
    extras: { 'src/games/caribbean/provider.ts': "export default './dependency';\n" },
  },
  {
    name: 'let binding',
    source: "let modulePath = './dependency'; void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'dynamic inner const shadow',
    source: "const modulePath = './dependency'; { const modulePath = String('./dependency'); void import(/* @vite-ignore */ modulePath); }",
  },
  {
    name: 'duplicate same-scope declaration',
    source: "const modulePath = './dependency'; const modulePath = './dependency'; void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'use before declaration',
    source: "void import(/* @vite-ignore */ modulePath); const modulePath = './dependency';",
  },
  {
    name: 'use outside declaration scope',
    source: "{ const modulePath = './dependency'; } void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'cross-scope name blessing',
    source: "{ const modulePath = './dependency'; } async function load(modulePath) { void import(/* @vite-ignore */ modulePath); } void load;",
  },
  {
    name: 'reassigned const binding',
    source: "const modulePath = './dependency'; modulePath = './other'; void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'object destructuring assignment target',
    source: "const modulePath = './dependency'; const source = {}; ({ value: modulePath } = source); void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'array destructuring assignment target',
    source: "const modulePath = './dependency'; const source = []; [modulePath] = source; void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'for-of assignment target',
    source: "const modulePath = './dependency'; for (modulePath of ['./other']) {} void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'for-in assignment target',
    source: "const modulePath = './dependency'; for (modulePath in { other: true }) {} void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'referenced initializer',
    source: "const suffix = 'dependency'; const modulePath = './' + suffix; void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'call initializer',
    source: "const modulePath = String('./dependency'); void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'template substitution',
    source: "const suffix = 'dependency'; const modulePath = `./${suffix}`; void import(/* @vite-ignore */ modulePath);",
  },
  {
    name: 'annotation on declaration',
    source: "const /* @vite-ignore */ modulePath = './dependency'; void import(modulePath);",
  },
  {
    name: 'annotation on call expression',
    source: "const modulePath = './dependency'; /* @vite-ignore */ void import(modulePath);",
  },
  {
    name: 'non-exact argument trivia',
    source: "const modulePath = './dependency'; void import(/* other */ /* @vite-ignore */ modulePath);",
  },
];

for (const fixture of annotatedBindingFailures) {
  test(`rejects annotated lexical binding drift: ${fixture.name}`, async (t) => {
    const importer = 'src/games/caribbean/annotated-binding-failure.test.ts';
    const root = await makeTrackedGraph(t, {
      [importer]: `${fixture.source}\n`,
      'src/games/caribbean/dependency.ts': 'export const dependency = true;\n',
      'src/games/caribbean/other.ts': 'export const other = true;\n',
      ...fixture.extras,
    });
    const verification = await import('./caribbean-naval-verification.mjs');
    assert.throws(
      () => verification.auditCaribbeanNavalSourceClosure(root),
      (error) => error?.diagnostic === 'nonliteral-dynamic-import'
        && error?.importer === importer
        && error?.message === `CARIBBEAN_SOURCE_AUDIT_FAILED source-files diagnostic=nonliteral-dynamic-import importer=${importer}`,
    );

    for (const mode of ['semantic-probe', 'capture', 'verify']) {
      const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-annotated-cli-'));
      t.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
      const lines = [];
      let harnessCalls = 0;
      assert.equal(await verification.runNavalEvidenceCli({
        mode,
        root,
        docsDirectory: path.join(root, 'docs', 'screenshots', 'caribbean-naval'),
        tempParent,
        generate: async () => { harnessCalls += 1; },
        writeLine: (line) => lines.push(line),
      }), 1);
      const prefix = mode === 'semantic-probe' ? 'NAVAL_SEMANTIC_PROBE' : `NAVAL_${mode.toUpperCase()}`;
      assert.deepEqual(lines, [`${prefix}_FAILED source-files diagnostic=nonliteral-dynamic-import`]);
      assert.equal(harnessCalls, 0);
      assert.deepEqual(fs.readdirSync(tempParent), []);
    }
  });
}

test('rejects an annotated dynamic import whose const is not pure literal concatenation', async (t) => {
  const root = await makeTrackedGraph(t, {
    'src/games/caribbean/annotated-dynamic.test.ts': [
      "const suffix = 'dependency';",
      "const modulePath = './annotated-' + suffix;",
      'void import(/* @vite-ignore */ modulePath);',
    ].join('\n'),
    'src/games/caribbean/annotated-dependency.ts': 'export const dependency = true;\n',
  });
  const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
  assert.throws(
    () => auditCaribbeanNavalSourceClosure(root),
    (error) => error?.diagnostic === 'nonliteral-dynamic-import'
      && error?.importer === 'src/games/caribbean/annotated-dynamic.test.ts',
  );
});

test('propagates every unsupported-loader diagnostic through every CLI mode and cleans', async (t) => {
  const { runNavalEvidenceCli } = await import('./caribbean-naval-verification.mjs');
  for (const fixture of unsupportedLoaderFixtures) {
    const root = await makeTrackedGraph(t, fixture.files);
    for (const mode of ['semantic-probe', 'capture', 'verify']) {
      await t.test(`${fixture.diagnostic} ${mode}`, async (row) => {
        const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-cli-parent-'));
        row.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
        const docs = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
        let harnessCalls = 0;
        const lines = [];
        const result = await runNavalEvidenceCli({
          mode,
          root,
          docsDirectory: docs,
          tempParent,
          generate: async () => { harnessCalls += 1; },
          writeLine: (line) => lines.push(line),
        });
        const prefix = mode === 'semantic-probe' ? 'NAVAL_SEMANTIC_PROBE' : `NAVAL_${mode.toUpperCase()}`;
        assert.equal(result, 1);
        assert.deepEqual(lines, [`${prefix}_FAILED source-files diagnostic=${fixture.diagnostic}`]);
        assert.equal(harnessCalls, 0);
        assert.equal(fs.existsSync(docs), false);
        assert.deepEqual(fs.readdirSync(tempParent), []);
      });
    }
  }
});

test('requires an explicit mode and enforces destination plus exact cleanup outcomes', async (t) => {
  const { runNavalEvidenceCli } = await import('./caribbean-naval-verification.mjs');
  const missingLines = [];
  assert.equal(await runNavalEvidenceCli({ mode: undefined, writeLine: (line) => missingLines.push(line) }), 1);
  assert.deepEqual(missingLines, ['NAVAL_CLI_FAILED mode']);

  const root = await makeTrackedGraph(t);
  const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-cleanup-parent-'));
  t.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
  const generated = ({ source }) => validGeneration({
    sourceFiles: source.files ?? source.sourceFiles,
    sourceHash: source.sourceHash,
  });

  let harnessCalls = 0;
  const destinationLines = [];
  assert.equal(await runNavalEvidenceCli({
    mode: 'semantic-probe', root, docsDirectory: path.join(root, 'wrong'), tempParent,
    generate: async (options) => { harnessCalls += 1; return generated(options); },
    writeLine: (line) => destinationLines.push(line),
  }), 1);
  assert.deepEqual(destinationLines, ['NAVAL_SEMANTIC_PROBE_FAILED destination']);
  assert.equal(harnessCalls, 0);
  assert.deepEqual(fs.readdirSync(tempParent), []);

  const successLines = [];
  assert.equal(await runNavalEvidenceCli({
    mode: 'semantic-probe', root, docsDirectory, tempParent,
    generate: async (options) => generated(options),
    writeLine: (line) => successLines.push(line),
  }), 0);
  assert.deepEqual(successLines, ['NAVAL_SEMANTIC_PROBE_OK tracked=stale']);
  assert.deepEqual(fs.readdirSync(tempParent), []);

  const cleanupLines = [];
  assert.equal(await runNavalEvidenceCli({
    mode: 'semantic-probe', root, docsDirectory, tempParent,
    generate: async (options) => generated(options),
    removeTempDirectory: () => { throw new Error('synthetic cleanup failure'); },
    writeLine: (line) => cleanupLines.push(line),
  }), 1);
  assert.deepEqual(cleanupLines, ['NAVAL_SEMANTIC_PROBE_FAILED cleanup']);
  for (const entry of fs.readdirSync(tempParent)) fs.rmSync(path.join(tempParent, entry), { recursive: true, force: true });
});

test('keeps semantic probe temporary while capture and verify honor clean provenance', async (t) => {
  const { runNavalEvidenceCli } = await import('./caribbean-naval-verification.mjs');
  const root = await makeTrackedGraph(t);
  execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const captureHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-mode-parent-'));
  t.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
  const generate = async ({ destination, source, captureHead: observedHead }) => {
    const generation = validGeneration({
      sourceFiles: source.files ?? source.sourceFiles,
      sourceHash: source.sourceHash,
      captureHead: observedHead,
    });
    writeGeneration(destination, generation);
    return generation;
  };
  const run = async (mode) => {
    const lines = [];
    const code = await runNavalEvidenceCli({ mode, root, docsDirectory, tempParent, generate, writeLine: (line) => lines.push(line) });
    assert.deepEqual(fs.readdirSync(tempParent), []);
    return { code, lines };
  };

  assert.deepEqual(await run('semantic-probe'), { code: 0, lines: ['NAVAL_SEMANTIC_PROBE_OK tracked=stale'] });
  const capture = await run('capture');
  assert.deepEqual(capture, { code: 0, lines: [`NAVAL_CAPTURE_OK head=${captureHead} changed=12`] });
  assert.deepEqual(fs.readdirSync(docsDirectory).sort(), ['metrics.json', ...NAVAL_SCREENSHOTS.map((row) => row.name)].sort());
  execFileSync('git', ['add', '--', 'docs/screenshots/caribbean-naval'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'capture'], { cwd: root });
  const sourceHash = JSON.parse(fs.readFileSync(path.join(docsDirectory, 'metrics.json'), 'utf8')).stableManifest.sourceHash;
  assert.deepEqual(await run('verify'), {
    code: 0,
    lines: [`NAVAL_VERIFY_OK capture=${captureHead} source=${sourceHash} artifacts=11`],
  });

  fs.appendFileSync(path.join(root, 'package.json'), '\n');
  let harnessCalls = 0;
  const dirtyLines = [];
  assert.equal(await runNavalEvidenceCli({
    mode: 'verify', root, docsDirectory, tempParent,
    generate: async (options) => { harnessCalls += 1; return generate(options); },
    writeLine: (line) => dirtyLines.push(line),
  }), 1);
  assert.deepEqual(dirtyLines, ['NAVAL_VERIFY_FAILED dirty-worktree']);
  assert.equal(harnessCalls, 0);
  assert.deepEqual(fs.readdirSync(tempParent), []);
});

test('semantic probe classifies an invalid tracked manifest as stale without writing docs', async (t) => {
  const { runNavalEvidenceCli } = await import('./caribbean-naval-verification.mjs');
  const root = await makeTrackedGraph(t);
  const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
  fs.mkdirSync(docsDirectory, { recursive: true });
  const invalidMetrics = Buffer.from('{"stableManifest":{"version":1}}\n');
  fs.writeFileSync(path.join(docsDirectory, 'metrics.json'), invalidMetrics);
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-stale-probe-parent-'));
  t.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
  const lines = [];
  const code = await runNavalEvidenceCli({
    mode: 'semantic-probe',
    root,
    docsDirectory,
    tempParent,
    generate: async ({ source }) => validGeneration({
      sourceFiles: source.files,
      sourceHash: source.sourceHash,
    }),
    writeLine: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  assert.deepEqual(lines, ['NAVAL_SEMANTIC_PROBE_OK tracked=stale']);
  assert.deepEqual(fs.readFileSync(path.join(docsDirectory, 'metrics.json')), invalidMetrics);
  assert.deepEqual(fs.readdirSync(tempParent), []);
});

test('capture publishes validated returned bytes instead of divergent candidate files', async (t) => {
  const verification = await import('./caribbean-naval-verification.mjs');
  const root = await makeTrackedGraph(t);
  execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-publish-parent-'));
  t.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
  let returned;
  const lines = [];
  const code = await verification.runNavalEvidenceCli({
    mode: 'capture',
    root,
    docsDirectory,
    tempParent,
    generate: async ({ destination, source, captureHead }) => {
      returned = validGeneration({
        sourceFiles: source.files ?? source.sourceFiles,
        sourceHash: source.sourceHash,
        variant: 1,
        captureHead,
      });
      writeGeneration(destination, returned, { artifactVariant: 9 });
      return returned;
    },
    writeLine: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  assert.deepEqual(lines, [`NAVAL_CAPTURE_OK head=${returned.capture.headCommitAtCapture} changed=12`]);
  for (const artifact of returned.artifacts) {
    assert.deepEqual(fs.readFileSync(path.join(docsDirectory, artifact.name)), artifact.bytes, artifact.name);
  }
});

test('verify rejects a corrupt tracked artifact even when fresh generation is valid', async (t) => {
  const verification = await import('./caribbean-naval-verification.mjs');
  const root = await makeTrackedGraph(t);
  execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const captureHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const source = verification.collectCaribbeanNavalSourceManifest(root);
  const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
  fs.mkdirSync(docsDirectory, { recursive: true });
  const captured = validGeneration({
    sourceFiles: source.files ?? source.sourceFiles,
    sourceHash: source.sourceHash,
    captureHead,
  });
  writeGeneration(docsDirectory, captured);
  fs.writeFileSync(path.join(docsDirectory, NAVAL_SCREENSHOTS[0].name), Buffer.from('corrupt tracked png'));
  execFileSync('git', ['add', '--', 'docs/screenshots/caribbean-naval'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'capture'], { cwd: root });
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-corrupt-parent-'));
  t.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
  const lines = [];
  const code = await verification.runNavalEvidenceCli({
    mode: 'verify', root, docsDirectory, tempParent,
    generate: async ({ destination, source: current, captureHead: observedHead }) => {
      const fresh = validGeneration({
        sourceFiles: current.files ?? current.sourceFiles,
        sourceHash: current.sourceHash,
        variant: 1,
        captureHead: observedHead,
      });
      writeGeneration(destination, fresh);
      return fresh;
    },
    writeLine: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.deepEqual(lines, ['NAVAL_VERIFY_FAILED artifact-manifest']);
});

test('rejects symbolic dirty or mismatched capture provenance metadata', async (t) => {
  const verification = await import('./caribbean-naval-verification.mjs');
  for (const fixture of [
    {
      name: 'symbolic head',
      mutate(generation) {
        generation.capture.headCommitAtCapture = 'HEAD';
        generation.source.headCommitAtCapture = 'HEAD';
      },
    },
    {
      name: 'dirty capture',
      mutate(generation) { generation.capture.worktreeDirtyBeforeCapture = true; },
    },
    {
      name: 'mismatched source head',
      mutate(generation) { generation.source.headCommitAtCapture = '0'.repeat(40); },
    },
  ]) await t.test(fixture.name, async (row) => {
    const root = await makeTrackedGraph(row);
    execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
    const captureHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const source = verification.collectCaribbeanNavalSourceManifest(root);
    const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
    fs.mkdirSync(docsDirectory, { recursive: true });
    const captured = validGeneration({
      sourceFiles: source.files ?? source.sourceFiles,
      sourceHash: source.sourceHash,
      captureHead,
    });
    fixture.mutate(captured);
    writeGeneration(docsDirectory, captured);
    execFileSync('git', ['add', '--', 'docs/screenshots/caribbean-naval'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'capture'], { cwd: root });
    const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-provenance-parent-'));
    row.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
    const lines = [];
    const code = await verification.runNavalEvidenceCli({
      mode: 'verify', root, docsDirectory, tempParent,
      generate: async ({ destination, source: current, captureHead: observedHead }) => {
        const fresh = validGeneration({
          sourceFiles: current.files ?? current.sourceFiles,
          sourceHash: current.sourceHash,
          captureHead: observedHead,
        });
        writeGeneration(destination, fresh);
        return fresh;
      },
      writeLine: (line) => lines.push(line),
    });
    assert.equal(code, 1);
    assert.deepEqual(lines, ['NAVAL_VERIFY_FAILED stale-capture']);
  });
});

test('capture fails closed when generation edits source or moves HEAD', async (t) => {
  const verification = await import('./caribbean-naval-verification.mjs');
  for (const fixture of [
    {
      name: 'source edit',
      expected: 'dirty-worktree',
      mutate(root) { fs.appendFileSync(path.join(root, 'package.json'), '\n'); },
    },
    {
      name: 'head movement',
      expected: 'stale-capture',
      mutate(root) {
        execFileSync('git', [
          '-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid',
          'commit', '--allow-empty', '-qm', 'move head',
        ], { cwd: root });
      },
    },
  ]) await t.test(fixture.name, async (row) => {
    const root = await makeTrackedGraph(row);
    execFileSync('git', ['-c', 'user.name=Task 6', '-c', 'user.email=task6@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
    const docsDirectory = path.join(root, 'docs', 'screenshots', 'caribbean-naval');
    const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-drift-parent-'));
    row.after(() => fs.rmSync(tempParent, { recursive: true, force: true }));
    const lines = [];
    const code = await verification.runNavalEvidenceCli({
      mode: 'capture', root, docsDirectory, tempParent,
      generate: async ({ destination, source, captureHead }) => {
        const generation = validGeneration({
          sourceFiles: source.files ?? source.sourceFiles,
          sourceHash: source.sourceHash,
          captureHead,
        });
        writeGeneration(destination, generation);
        fixture.mutate(root);
        return generation;
      },
      writeLine: (line) => lines.push(line),
    });
    assert.equal(code, 1);
    assert.deepEqual(lines, [`NAVAL_CAPTURE_FAILED ${fixture.expected}`]);
    assert.equal(fs.existsSync(docsDirectory), false);
  });
});

test('resolves the tracked fixed-point graph and grows for a new transitive edge', async (t) => {
  const root = await makeTrackedGraph(t, {
    'src/games/caribbean/entry.ts': [
      "import React from 'react';",
      "import type { X } from 'declared';",
      "import type { Y } from '@scope/typed';",
      "import 'node:path';",
      "import '@games/caribbean/side.css';",
      "export { value } from './nested';",
      "export type { T } from './types';",
      "const lazy = import('./lazy.mjs');",
      "const common = require('./common.cjs');",
      "const asset = new URL('./ship.glb', import.meta.url);",
      'void React; void lazy; void common; void asset;',
    ].join('\n'),
    'src/games/caribbean/nested/index.ts': "import '@shared/storage/kv'; export const value = 1;\n",
    'src/games/caribbean/types.ts': 'export type T = number; export type X = number; export type Y = number;\n',
    'src/games/caribbean/lazy.mjs': "import './transitive.js'; export default 1;\n",
    'src/games/caribbean/transitive.js': 'export const transitive = true;\n',
    'src/games/caribbean/common.cjs': "module.exports = require('./common-dependency.json');\n",
    'src/games/caribbean/common-dependency.json': '{}\n',
    'src/games/caribbean/side.css': "@import './more.css'; .ship { background:url('./ship.webp?cache=1#x'); }\n",
    'src/games/caribbean/more.css': '.more { color: black; }\n',
    'src/games/caribbean/ship.webp': 'webp fixture\n',
    'src/games/caribbean/ship.glb': 'glb fixture\n',
  });
  const verification = await import('./caribbean-naval-verification.mjs');
  assert.deepEqual(verification.CARIBBEAN_NAVAL_SOURCE_SEEDS, SOURCE_SEEDS);
  const audit = verification.auditCaribbeanNavalSourceClosure(root);
  assert.deepEqual(Object.keys(audit).sort(), ['edges', 'paths', 'seeds']);
  for (const literal of SOURCE_SEEDS.filter((seed) => !seed.startsWith(':(glob)'))) {
    assert.ok(audit.seeds.includes(literal), `seed set missing literal ${literal}`);
  }
  for (const prefix of [
    'scripts/lib/caribbean-naval-',
    'scripts/lib/caribbean-port-identity-',
    'scripts/lib/caribbean-campaign-',
    'src/games/caribbean/',
    'public/',
  ]) assert.ok(audit.seeds.some((seed) => seed.startsWith(prefix)), `seed set missing glob class ${prefix}`);
  for (const required of [
    'src/games/caribbean/entry.ts',
    'src/games/caribbean/nested/index.ts',
    'src/games/caribbean/lazy.mjs',
    'src/games/caribbean/transitive.js',
    'src/games/caribbean/common-dependency.json',
    'src/games/caribbean/more.css',
    'src/games/caribbean/ship.webp',
    'src/games/caribbean/ship.glb',
    'src/shared/storage/kv.ts',
    'src/shared/styles/tokens.css',
  ]) assert.ok(audit.paths.includes(required), `missing ${required}`);
  assert.deepEqual(
    audit.paths,
    [...audit.paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
  );
  assert.ok(audit.edges.every((edge) => audit.paths.includes(edge.importer) && audit.paths.includes(edge.target)));

  const before = verification.collectCaribbeanNavalSourceManifest(root);
  assert.deepEqual(Object.keys(before).sort(), ['files', 'sourceHash']);
  writeFiles(root, {
    'src/games/caribbean/transitive.js': "export * from './automatic';\n",
    'src/games/caribbean/automatic.ts': 'export const automatic = true;\n',
  });
  execFileSync('git', ['add', '--', 'src/games/caribbean/transitive.js', 'src/games/caribbean/automatic.ts'], { cwd: root });
  const after = verification.collectCaribbeanNavalSourceManifest(root);
  assert.equal(after.files.length, before.files.length + 1);
  assert.ok(after.files.some((row) => row.path === 'src/games/caribbean/automatic.ts'));
  assert.notEqual(after.sourceHash, before.sourceHash);
});

test('rejects unresolved, ambiguous, unknown bare, and alias disagreement edges', async (t) => {
  const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
  const cases = [
    { files: { 'src/games/caribbean/bad.ts': "import './missing';\n" }, label: 'missing' },
    { files: {
      'src/games/caribbean/bad.ts': "import './ambiguous';\n",
      'src/games/caribbean/ambiguous.ts': 'export {};\n',
      'src/games/caribbean/ambiguous.tsx': 'export {};\n',
    }, label: 'ambiguous' },
    { files: { 'src/games/caribbean/bad.ts': "import 'undeclared-package';\n" }, label: 'bare' },
    { files: {
      'src/games/caribbean/bad.ts': "import '@shared/storage/kv';\n",
      'vite.config.ts': `import { fileURLToPath, URL } from 'node:url';\nexport default { resolve: { alias: { '@shared': fileURLToPath(new URL('./src/wrong', import.meta.url)), '@games': fileURLToPath(new URL('./src/games', import.meta.url)), '@app': fileURLToPath(new URL('./src/app', import.meta.url)), '@test': fileURLToPath(new URL('./src/test', import.meta.url)) } } };\n`,
    }, label: 'alias' },
  ];
  for (const fixture of cases) {
    const root = await makeTrackedGraph(t, fixture.files);
    assert.throws(() => auditCaribbeanNavalSourceClosure(root), (error) => error?.code === 'source-files', fixture.label);
  }
});

test('rejects generic directory URLs and ignores Vite alias comments or decoys', async (t) => {
  const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
  const directoryRoot = await makeTrackedGraph(t, {
    'src/games/caribbean/directory.ts': "export const root = new URL('../..', import.meta.url);\n",
  });
  assert.throws(
    () => auditCaribbeanNavalSourceClosure(directoryRoot),
    (error) => error?.code === 'source-files' && /unresolved edge/.test(error.message),
  );

  const decoyRoot = await makeTrackedGraph(t, {
    'vite.config.ts': [
      "import { fileURLToPath, URL } from 'node:url';",
      "// '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),",
      'export default { resolve: { alias: {',
      "  '@shared': fileURLToPath(new URL('./src/wrong', import.meta.url)),",
      "  '@games': fileURLToPath(new URL('./src/games', import.meta.url)),",
      "  '@app': fileURLToPath(new URL('./src/app', import.meta.url)),",
      "  '@test': fileURLToPath(new URL('./src/test', import.meta.url)),",
      '} } };',
    ].join('\n'),
    'src/wrong/decoy.ts': 'export const decoy = true;\n',
  });
  assert.throws(
    () => auditCaribbeanNavalSourceClosure(decoyRoot),
    (error) => error?.code === 'source-files' && /alias @shared disagrees/.test(error.message),
  );
});

test('requires every literal seed and every mandated glob class', async (t) => {
  const { auditCaribbeanNavalSourceClosure } = await import('./caribbean-naval-verification.mjs');
  const missingLiteral = await makeTrackedGraph(t);
  execFileSync('git', ['rm', '--cached', '-q', '--', 'knip.json'], { cwd: missingLiteral });
  assert.throws(
    () => auditCaribbeanNavalSourceClosure(missingLiteral),
    (error) => error?.code === 'source-files' && /required seed is missing: knip\.json/.test(error.message),
  );

  const emptyGlob = await makeTrackedGraph(t);
  execFileSync('git', ['rm', '--cached', '-q', '--', 'scripts/lib/caribbean-port-identity-evidence.mjs'], { cwd: emptyGlob });
  assert.throws(
    () => auditCaribbeanNavalSourceClosure(emptyGlob),
    (error) => error?.code === 'source-files'
      && /required seed class is empty: :\(glob\)scripts\/lib\/caribbean-port-identity-\*\.mjs/.test(error.message),
  );
});

test('rejects missing extra reordered and hash-drifted captured source manifests exactly', async (t) => {
  const root = await makeTrackedGraph(t);
  const verification = await import('./caribbean-naval-verification.mjs');
  const current = verification.collectCaribbeanNavalSourceManifest(root);
  assert.ok(Array.isArray(current.files), 'public source manifest must expose files');
  const missing = structuredClone(current);
  missing.files.pop();
  assert.throws(() => verification.verifySourceManifest(missing, current), (error) => error?.code === 'source-files');
  const extra = structuredClone(current);
  extra.files.push({ path: 'README.md', sha256: '0'.repeat(64) });
  assert.throws(() => verification.verifySourceManifest(extra, current), (error) => error?.code === 'source-files');
  const reordered = structuredClone(current);
  reordered.files.reverse();
  assert.throws(() => verification.verifySourceManifest(reordered, current), (error) => error?.code === 'source-files');
  const changed = structuredClone(current);
  changed.files[0].sha256 = 'f'.repeat(64);
  assert.throws(() => verification.verifySourceManifest(changed, current), (error) => error?.code === 'source-hash');
});

test('accepts variable observations and pixels but rejects stable range and artifact drift', async () => {
  const verification = await import('./caribbean-naval-verification.mjs');
  const makeGeneration = (variant = 0) => validGeneration({ variant });
  const captured = makeGeneration(0);
  const fresh = makeGeneration(1);
  assert.doesNotThrow(() => verification.verifyNavalGeneration(captured, fresh));

  const stable = structuredClone(fresh);
  stable.stableManifest.canonicalInput.seed += 1;
  assert.throws(() => verification.verifyNavalGeneration(captured, stable), (error) => error?.code === 'stable-manifest');
  for (const mutate of [
    (value) => { value.observations.sustainedFps = 49; },
    (value) => { value.observations.maxDrawCalls = 121; },
    (value) => { value.observations.maxTriangles = 100_001; },
    (value) => { value.observations.boardingDuration = 15; },
    (value) => { value.observations.samples[1].tick = value.observations.samples[0].tick; },
    (value) => { value.observations.growthAfterWarmup.textures = 1; },
    (value) => { value.observations.failures.console.push('boom'); },
  ]) {
    const invalid = makeGeneration(1);
    mutate(invalid);
    assert.throws(() => verification.verifyNavalGeneration(captured, invalid), (error) => error?.code === 'observation-range');
  }
  for (const mutate of [
    (value) => { value.artifacts[0].name = 'wrong.png'; },
    (value) => { value.artifacts[0].width = 2; },
    (value) => { value.artifacts[0].bytes = Buffer.from('not png'); },
  ]) {
    const invalid = makeGeneration(1);
    mutate(invalid);
    assert.throws(() => verification.verifyNavalGeneration(captured, invalid), (error) => error?.code === 'artifact-manifest');
  }

  for (const mutate of [
    (value) => { value.stableManifest.extra = true; },
    (value) => { delete value.stableManifest.fallback.labelsClear; },
    (value) => {
      value.stableManifest.sourceFiles[0].path = 'nested/../package.json';
      value.stableManifest.sourceHash = createHash('sha256')
        .update(verification.canonicalJson(value.stableManifest.sourceFiles)).digest('hex');
    },
    (value) => { value.stableManifest.screenshots.reverse(); },
    (value) => { value.stableManifest.screenshots.push(structuredClone(value.stableManifest.screenshots[0])); },
    (value) => { value.stableManifest.screenshots[0].name = '../../escape.png'; value.artifacts[0].name = '../../escape.png'; },
    (value) => { value.stableManifest.screenshots[0].name = '/absolute.png'; value.artifacts[0].name = '/absolute.png'; },
    (value) => { value.stableManifest.screenshots[0].name = 'nested/name.png'; value.artifacts[0].name = 'nested/name.png'; },
  ]) {
    const invalid = makeGeneration(1);
    mutate(invalid);
    assert.throws(
      () => verification.validateFreshNavalGeneration(invalid),
      (error) => ['stable-manifest', 'artifact-manifest'].includes(error?.code),
    );
  }
});

test('accepts two real temporary harness generations with honest observations', { timeout: 240_000 }, async (t) => {
  const root = path.resolve(process.cwd());
  const verification = await import('./caribbean-naval-verification.mjs');
  const { runNavalCheck } = await import('../caribbean-naval-check.mjs');
  const source = verification.collectCaribbeanNavalSourceManifest(root);
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-naval-generation-a-'));
  const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'caribbean-naval-generation-b-'));
  t.after(() => fs.rmSync(firstDirectory, { recursive: true, force: true }));
  t.after(() => fs.rmSync(secondDirectory, { recursive: true, force: true }));
  const first = await runNavalCheck({ destination: firstDirectory, source, captureHead: null });
  const second = await runNavalCheck({ destination: secondDirectory, source, captureHead: null });
  assert.equal(first.verdict.ok, true);
  assert.equal(second.verdict.ok, true);
  assert.equal(verification.canonicalJson(first.stableManifest), verification.canonicalJson(second.stableManifest));
  assert.doesNotThrow(() => verification.verifyNavalGeneration(first, second));
  assert.notEqual(first.artifacts[0].bytes.length, 0);
  assert.notEqual(second.artifacts[0].bytes.length, 0);
});

test('audits the real tracked dependency closure', async () => {
  const verification = await import('./caribbean-naval-verification.mjs');
  const root = path.resolve(process.cwd());
  const audit = verification.auditCaribbeanNavalSourceClosure(root);
  for (const required of [
    'src/shared/storage/kv.ts',
    'src/shared/styles/tokens.css',
    'src/app/main.tsx',
    'src/app/App.tsx',
    'src/app/registry.ts',
    'src/games/caribbean/content/naval.ts',
    'src/games/caribbean/domain/naval/resolution.ts',
    'src/games/caribbean/state/naval/NavalSession.ts',
    'src/games/caribbean/state/naval/FrameRunner.ts',
    'src/games/caribbean/components/voyage/CampaignNavalBattle.tsx',
    'src/games/caribbean/styles/battle.css',
    'src/games/caribbean/assets/caribbean-sloop.glb',
    'scripts/lib/caribbean-campaign-victory-driver.mjs',
    'scripts/lib/caribbean-campaign-victory-browser.node-test.mjs',
    'scripts/lib/caribbean-naval-verification.mjs',
    'scripts/lib/caribbean-naval-verification.node-test.mjs',
    'scripts/fixtures/caribbean-campaign-victory.json',
    'scripts/caribbean-port-check.mjs',
    'scripts/caribbean-naval-check.mjs',
  ]) assert.ok(audit.paths.includes(required), `real closure missing ${required}`);
  const expectedEdges = [
    ['index.html', '/src/app/main.tsx', 'src/app/main.tsx'],
    ['src/app/main.tsx', '@shared/styles/tokens.css', 'src/shared/styles/tokens.css'],
    ['src/games/caribbean/preview.tsx', '@shared/styles/tokens.css', 'src/shared/styles/tokens.css'],
    ['src/shared/profile/usersStore.ts', '@shared/storage/kv', 'src/shared/storage/kv.ts'],
  ];
  for (const [importer, specifier, target] of expectedEdges) {
    assert.ok(audit.edges.some((edge) => edge.importer === importer && edge.specifier === specifier && edge.target === target), `${importer} ${specifier}`);
  }
  assert.ok(audit.edges.every((edge) => audit.paths.includes(edge.importer) && audit.paths.includes(edge.target)));
  assert.deepEqual(Object.keys(audit).sort(), ['edges', 'paths', 'seeds']);
  for (const literal of SOURCE_SEEDS.filter((seed) => !seed.startsWith(':(glob)'))) {
    assert.ok(audit.seeds.includes(literal), `real closure seed set missing ${literal}`);
  }
  const manifest = verification.collectCaribbeanNavalSourceManifest(root);
  assert.deepEqual(Object.keys(manifest).sort(), ['files', 'sourceHash']);
});

test('fails closed when critical real rows are omitted reordered injected or rehashed', async () => {
  const verification = await import('./caribbean-naval-verification.mjs');
  const root = path.resolve(process.cwd());
  const current = verification.collectCaribbeanNavalSourceManifest(root);
  assert.ok(Array.isArray(current.files), 'public source manifest must expose files');
  for (const critical of ['src/shared/storage/kv.ts', 'src/shared/styles/tokens.css', 'src/app/main.tsx']) {
    const omitted = structuredClone(current);
    omitted.files = omitted.files.filter((row) => row.path !== critical);
    assert.throws(() => verification.verifySourceManifest(omitted, current), (error) => error?.code === 'source-files', critical);
  }
  const injected = structuredClone(current);
  injected.files.push({ path: 'README.md', sha256: '0'.repeat(64) });
  assert.throws(() => verification.verifySourceManifest(injected, current), (error) => error?.code === 'source-files');
  const reordered = structuredClone(current);
  [reordered.files[0], reordered.files[1]] = [reordered.files[1], reordered.files[0]];
  assert.throws(() => verification.verifySourceManifest(reordered, current), (error) => error?.code === 'source-files');
  const rehashed = structuredClone(current);
  rehashed.files[0].sha256 = 'f'.repeat(64);
  assert.throws(() => verification.verifySourceManifest(rehashed, current), (error) => error?.code === 'source-hash');
});
