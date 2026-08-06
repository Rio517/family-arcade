#!/usr/bin/env node
/**
 * Shrink a 3D ship until it's small enough to bundle into the arcade.
 *
 *   npm run glb -- ~/Downloads/destroyer.glb
 *   npm run glb -- raw/*.glb --out src/games/battleship/assets/ships/modern
 *   npm run glb -- ship.glb --tris 3000 --tex 128
 *   npm run glb -- --selftest        # verify the pipeline with synthetic meshes
 *
 * Why this exists: TRELLIS won't emit fewer than 100k triangles with a 1024²
 * texture — around 3 MB per ship, where the whole installed PWA is 1.5 MB. A
 * ship is a couple of hundred pixels on a 10×10 board, so nearly all of that
 * detail is invisible. This cuts it to a few thousand triangles, shrinks the
 * texture, and meshopt-compresses what's left.
 *
 * Four deliberate choices:
 *
 * - **Hand-authored models are never decimated.** A Blender ship arrives at
 *   ~6k triangles with every edge placed on purpose; running a 4k budget over
 *   it trades visible crispness for a few KB that texture compression was
 *   going to save anyway. Anything under AUTHORED_MAX_TRIS skips the lossy
 *   geometry passes unless you insist with --force-simplify.
 * - **Nothing is written until the result is checked.** See verify(): if a
 *   pass ate geometry, dropped a node, or renamed a material, the run fails
 *   and writes no file. A damaged ship that reaches dist/ is only discovered
 *   in the browser, days later.
 * - **Node structure is preserved.** No flatten, no join unless you ask with
 *   --flatten. Ship parts have to stay separate nodes so things like the
 *   submarine's torpedo doors can be animated later.
 * - **Meshopt, not Draco.** three.js needs a decoder either way, but meshopt's
 *   is ~30 KB against Draco's ~200 KB of wasm — and on an offline PWA that
 *   decoder ships to every player.
 *
 * Loading the output needs `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`,
 * which shipModels.ts already does.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const DEFAULTS = {
  /** Triangles per model. A hull reads fine well under this on a board game. */
  tris: 4000,
  /** Square texture edge, px. */
  tex: 256,
  /** How far simplification may drift from the original surface (0–1). */
  error: 0.01,
};

/**
 * Below this, a model is assumed hand-authored and its geometry is left alone.
 * Image-to-3D output lands at 100k+; nothing modelled by hand for this game
 * comes within an order of magnitude of the threshold, so the guess is safe in
 * both directions.
 */
const AUTHORED_MAX_TRIS = 25_000;

// ── argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    ...DEFAULTS,
    inputs: [],
    out: null,
    flatten: false,
    forceSimplify: false,
    selftest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest') opts.selftest = true;
    else if (a === '--flatten') opts.flatten = true;
    else if (a === '--force-simplify') opts.forceSimplify = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--tris') opts.tris = Number(argv[++i]);
    else if (a === '--tex') opts.tex = Number(argv[++i]);
    else if (a === '--error') opts.error = Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else opts.inputs.push(a);
  }
  if (!Number.isFinite(opts.tris) || opts.tris < 100) throw new Error('--tris must be >= 100');
  if (!Number.isFinite(opts.tex) || opts.tex < 16) throw new Error('--tex must be >= 16');
  return opts;
}

// ── measuring ───────────────────────────────────────────────────────────────

function primitiveTriangles(prim) {
  const indices = prim.getIndices();
  const position = prim.getAttribute('POSITION');
  return Math.round((indices ? indices.getCount() : (position?.getCount() ?? 0)) / 3);
}

/**
 * Count what the GPU actually draws, by walking the scene graph — NOT by
 * summing the mesh list.
 *
 * This distinction is the whole reason the old report was untrustworthy.
 * dedup() collapses identical meshes (a ship has dozens: railing segments,
 * gun barrels, life rafts) so several nodes end up sharing one mesh. Summing
 * the mesh list then shows a 58% "triangle loss" on a battleship that in fact
 * lost nine triangles — and the same blindness works the other way, hiding a
 * genuine loss behind an instance count that happens to look healthy.
 */
function renderedStats(document) {
  let tris = 0;
  let verts = 0;
  let instances = 0;
  const walk = (node) => {
    const mesh = node.getMesh();
    if (mesh) {
      instances++;
      for (const prim of mesh.listPrimitives()) {
        tris += primitiveTriangles(prim);
        verts += prim.getAttribute('POSITION')?.getCount() ?? 0;
      }
    }
    for (const child of node.listChildren()) walk(child);
  };
  for (const scene of document.getRoot().listScenes()) for (const node of scene.listChildren()) walk(node);
  return { tris, verts, instances };
}

function describe(document, bytes) {
  const root = document.getRoot();
  const { tris, verts, instances } = renderedStats(document);
  return {
    bytes,
    tris,
    verts,
    instances,
    meshes: root.listMeshes().length,
    nodes: root.listNodes().length,
    // Materials are matched BY NAME at runtime — shipModels.ts finds the team
    // stripe that way and tints it per player. A pass that renames or merges
    // materials would leave every fleet the artist's default colour, which is
    // why verify() treats the name list as a contract.
    materials: root.listMaterials().map((m) => m.getName()),
    textures: root.listTextures().length,
    texturePx: root
      .listTextures()
      .map((t) => t.getSize())
      .filter(Boolean)
      .map(([w, h]) => `${w}×${h}`)
      .join(', '),
  };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function report(name, before, after) {
  const pct = ((1 - after.bytes / before.bytes) * 100).toFixed(1);
  console.log(`\n  ${name}`);
  console.log('  ┌────────────┬──────────────┬──────────────┐');
  const row = (label, a, b) =>
    console.log(`  │ ${label.padEnd(10)} │ ${String(a).padStart(12)} │ ${String(b).padStart(12)} │`);
  row('', 'before', 'after');
  console.log('  ├────────────┼──────────────┼──────────────┤');
  row('size', kb(before.bytes), kb(after.bytes));
  row('triangles', before.tris.toLocaleString(), after.tris.toLocaleString());
  row('vertices', before.verts.toLocaleString(), after.verts.toLocaleString());
  row('parts', before.instances, after.instances);
  row('nodes', before.nodes, after.nodes);
  row('materials', before.materials.length, after.materials.length);
  row('textures', before.texturePx || '—', after.texturePx || '—');
  console.log('  └────────────┴──────────────┴──────────────┘');
  // Shared meshes are a win, not a loss — say so plainly, since the number
  // going down used to read as damage.
  if (after.meshes < before.meshes) {
    console.log(`  ${before.meshes - after.meshes} duplicate meshes now shared between parts`);
  }
  console.log(`  ${pct}% smaller`);
}

// ── the pipeline ────────────────────────────────────────────────────────────

function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

async function optimize(document, opts) {
  const start = renderedStats(document);
  const authored = start.tris <= AUTHORED_MAX_TRIS && !opts.forceSimplify;

  // Materials are deliberately excluded from dedup. It merges materials that
  // are identical apart from their name, and an artist will happily author
  // "Carrier Team Paint" as plain gray — indistinguishable from the hull until
  // the game tints it. Merging those two would silently break per-player
  // colours. The savings are in the accessors and meshes anyway.
  const transforms = [
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.SKIN] }),
  ];

  if (!authored) {
    // weld merges duplicate vertices — simplification can't collapse edges
    // across a seam that isn't actually shared, which is most of a raw
    // photogrammetry-style mesh.
    transforms.push(weld());
  }

  if (opts.flatten) transforms.push(flatten(), join());

  if (!authored) {
    // simplify() takes a ratio, not a count.
    const ratio = start.tris > 0 ? Math.min(1, opts.tris / start.tris) : 1;
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: opts.error }));
  }

  transforms.push(
    // keepLeaves, because this script promises to preserve node structure and
    // prune's default is to delete childless, meshless nodes — which in a
    // Blender export are the empties parts get positioned against.
    prune({ keepLeaves: true }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [opts.tex, opts.tex],
    }),
  );

  await document.transform(...transforms);

  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  return { authored, startTris: start.tris };
}

/**
 * Everything that must still be true afterwards. Returns a list of failures;
 * empty means the model is safe to write.
 */
function verify(before, after, opts, run) {
  const problems = [];

  if (run.authored) {
    // Nothing in the authored path may touch geometry, so anything other than
    // an exact match means a pass misbehaved.
    if (after.tris !== before.tris) {
      problems.push(`geometry changed on a hand-authored model: ${before.tris} → ${after.tris} triangles`);
    }
  } else {
    const floor = Math.min(before.tris, opts.tris) * 0.9;
    if (after.tris < floor) {
      problems.push(
        `simplification overshot: ${after.tris} triangles, expected at least ${Math.round(floor)}`,
      );
    }
  }

  // --flatten is an explicit request to collapse the graph, so the structural
  // checks below only apply to the default path.
  if (!opts.flatten) {
    if (after.instances !== before.instances) {
      problems.push(`parts lost: ${before.instances} drawn meshes → ${after.instances}`);
    }
    if (after.nodes !== before.nodes) {
      problems.push(`nodes lost: ${before.nodes} → ${after.nodes}`);
    }
    const missing = before.materials.filter((m) => !after.materials.includes(m));
    if (missing.length > 0) {
      problems.push(`materials renamed or dropped: ${missing.join(', ')}`);
    }
  }

  if (before.textures > 0 && after.textures === 0) problems.push('textures were dropped');
  if (after.bytes >= before.bytes) problems.push(`no smaller than the input (${kb(after.bytes)})`);

  return problems;
}

async function processFile(io, input, opts) {
  const beforeBytes = fs.statSync(input).size;
  const document = await io.read(input);
  const before = describe(document, beforeBytes);

  const run = await optimize(document, opts);

  const glb = await io.writeBinary(document);
  const after = describe(document, glb.byteLength);

  report(path.basename(input), before, after);
  if (run.authored) {
    console.log(
      `  hand-authored (${before.tris.toLocaleString()} triangles) — geometry left intact; ` +
        'pass --force-simplify to decimate anyway',
    );
  }

  const problems = verify(before, after, opts, run);
  if (problems.length > 0) {
    console.error(`  FAILED — nothing written:`);
    for (const p of problems) console.error(`    · ${p}`);
    process.exitCode = 1;
    return null;
  }

  const outDir = opts.out ?? path.dirname(input);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${path.basename(input, path.extname(input))}.opt.glb`);
  fs.writeFileSync(outFile, glb);
  console.log(`  → ${path.relative(process.cwd(), outFile)}`);
  return { before, after };
}

// ── self-test ───────────────────────────────────────────────────────────────

/** A detailed texture, not a flat colour: prune() legitimately swaps a
 * single-colour texture for a material factor, which would make the self-test's
 * output look far smaller than a real textured ship. */
async function buildTexture(size = 1024) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const plate = ((x >> 5) + (y >> 5)) % 2 ? 18 : 0;
      const streak = Math.sin(x * 0.11) * Math.cos(y * 0.07) * 22;
      const grime = ((x * 7919 + y * 104729) % 37) - 18;
      const base = 128 + plate + streak + grime;
      pixels[i] = Math.max(0, Math.min(255, base - 8));
      pixels[i + 1] = Math.max(0, Math.min(255, base));
      pixels[i + 2] = Math.max(0, Math.min(255, base + 14));
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

function addPrimitive(document, buffer, material, { positions, normals, uvs, indices }) {
  const accessor = (type, array) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  return document
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
    .setIndices(accessor('SCALAR', new Uint32Array(indices)))
    .setMaterial(material);
}

/**
 * A dense textured sphere roughly the size of a raw TRELLIS export, so the
 * lossy path can be verified without spending GPU quota on a real ship.
 */
async function buildRawDocument(segments = 220) {
  const { Document } = await import('@gltf-transform/core');
  const document = new Document();
  const buffer = document.createBuffer();

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let y = 0; y <= segments; y++) {
    const v = y / segments;
    const theta = v * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const phi = u * Math.PI * 2;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      // A little radial noise so the surface isn't trivially simplifiable —
      // a perfect sphere would flatter the pipeline.
      const r = 1 + 0.04 * Math.sin(u * 40) * Math.sin(v * 30);
      positions.push(nx * r, ny * r, nz * r);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const stride = segments + 1;
  for (let y = 0; y < segments; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * stride + x;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }

  const material = document
    .createMaterial('hull')
    .setBaseColorTexture(
      document.createTexture('hullTex').setImage(await buildTexture()).setMimeType('image/png'),
    );
  const mesh = document.createMesh('hull').addPrimitive(
    addPrimitive(document, buffer, material, { positions, normals, uvs, indices }),
  );
  document.createScene().addChild(document.createNode('hull').setMesh(mesh));
  return document;
}

/**
 * A stand-in for a Blender ship: low-poly, many small parts, several named
 * materials, and — crucially — repeated identical parts, which is what made
 * the old mesh-list triangle count read a healthy model as gutted.
 */
async function buildAuthoredDocument(parts = 40) {
  const { Document } = await import('@gltf-transform/core');
  const document = new Document();
  const buffer = document.createBuffer();

  const names = ['Test Haze Gray', 'Test Boot Stripe', 'Test Deck', 'Test Glass'];
  const texture = document
    .createTexture('paint')
    .setImage(await buildTexture(512))
    .setMimeType('image/png');
  const materials = names.map((n) => document.createMaterial(n).setBaseColorTexture(texture));

  // One box, built once and reused — identical geometry across parts is
  // exactly what dedup() is for.
  const box = { positions: [], normals: [], uvs: [], indices: [] };
  const faces = [
    [[0, 0, 1], [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]],
    [[0, 0, -1], [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]],
    [[0, 1, 0], [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]],
    [[0, -1, 0], [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]],
    [[1, 0, 0], [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]],
    [[-1, 0, 0], [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]],
  ];
  for (const [normal, verts] of faces) {
    const base = box.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      box.positions.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
      box.normals.push(...normal);
      box.uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0);
    }
    box.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const scene = document.createScene();
  const hull = document.createNode('hull');
  scene.addChild(hull);
  for (let i = 0; i < parts; i++) {
    const mesh = document
      .createMesh(`part-${i}`)
      .addPrimitive(addPrimitive(document, buffer, materials[i % materials.length], box));
    hull.addChild(
      document
        .createNode(`part-${i}`)
        .setMesh(mesh)
        .setTranslation([i * 0.5 - parts * 0.25, 0, 0]),
    );
  }
  // A locator with no mesh and no children — a Blender empty. prune() deletes
  // these by default, which would quietly break anything positioned off one.
  hull.addChild(document.createNode('flag-locator').setTranslation([0, 2, 0]));
  return document;
}

async function runCase(io, label, document, opts, extraChecks) {
  const raw = await io.writeBinary(document);
  const before = describe(document, raw.byteLength);

  const fresh = await io.readBinary(raw);
  const run = await optimize(fresh, opts);
  const out = await io.writeBinary(fresh);
  const after = describe(fresh, out.byteLength);

  report(label, before, after);

  // Round-trip the compressed result. Meshopt-compressed buffer views are the
  // part most likely to be written wrong and only fail later, in the browser.
  const roundTrip = await io.readBinary(out);
  const rt = describe(roundTrip, out.byteLength);
  const required = roundTrip.getRoot().listExtensionsRequired().map((e) => e.extensionName);

  const problems = verify(before, after, opts, run);
  const checks = [
    ['passes the write gate', problems.length === 0, problems.join('; ')],
    ['texture retained', after.textures > 0],
    ['re-reads after compression', rt.tris === after.tris && rt.verts === after.verts],
    ['meshopt compression applied', required.includes('EXT_meshopt_compression')],
    ...extraChecks(before, after, run),
  ];
  for (const [name, pass, detail] of checks) {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${!pass && detail ? ` — ${detail}` : ''}`);
  }
  return { ok: checks.every(([, pass]) => pass), after };
}

async function selftest(io, opts) {
  console.log('Self-test — two synthetic models: one raw scan, one hand-authored.');

  const raw = await runCase(io, 'synthetic-scan.glb', await buildRawDocument(), opts, (b, a, run) => [
    ['decimated to budget', a.tris <= opts.tris * 1.1],
    ['took the lossy path', !run.authored],
    ['node structure preserved', a.nodes === b.nodes],
  ]);

  const authored = await runCase(
    io,
    'synthetic-authored.glb',
    await buildAuthoredDocument(),
    opts,
    (b, a, run) => [
      ['recognised as hand-authored', run.authored],
      ['every triangle kept', a.tris === b.tris],
      ['duplicate meshes shared', a.meshes < b.meshes],
      ['empty locator kept', a.nodes === b.nodes],
      ['material names intact', b.materials.every((m) => a.materials.includes(m))],
    ],
  );

  const ok = raw.ok && authored.ok;
  console.log(
    ok
      ? `\n  PASS — a ${opts.tris.toLocaleString()}-triangle budget lands at ${kb(raw.after.bytes)} per scanned model.`
      : '\n  FAIL — see the checks above.',
  );
  if (!ok) process.exitCode = 1;
  return raw.after;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = createIO();

  if (opts.selftest) {
    const after = await selftest(io, opts);
    console.log(`  Ten ships at that size ≈ ${kb(after.bytes * 10)}.`);
    return;
  }

  if (opts.inputs.length === 0) {
    console.error('Usage: npm run glb -- <input.glb> [...] [--out dir] [--tris N] [--tex N]');
    console.error('       npm run glb -- --selftest');
    process.exitCode = 1;
    return;
  }

  console.log(`Budget: ${opts.tris.toLocaleString()} triangles, ${opts.tex}² texture, meshopt-compressed.`);
  let total = 0;
  let written = 0;
  for (const input of opts.inputs) {
    if (!fs.existsSync(input)) {
      console.error(`  skipped (not found): ${input}`);
      process.exitCode = 1;
      continue;
    }
    const result = await processFile(io, input, opts);
    if (result) {
      total += result.after.bytes;
      written++;
    }
  }
  console.log(`\nTotal: ${kb(total)} across ${written} model(s).`);
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exitCode = 1;
});
