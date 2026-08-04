#!/usr/bin/env node
/**
 * Turn a raw image-to-3D GLB (TRELLIS.2 and friends) into one small enough to
 * bundle into the arcade.
 *
 *   npm run glb -- ~/Downloads/destroyer.glb
 *   npm run glb -- raw/*.glb --out src/games/battleship/assets/ships/modern
 *   npm run glb -- ship.glb --tris 3000 --tex 128
 *   npm run glb -- --selftest        # verify the pipeline with a synthetic mesh
 *
 * Why this exists: TRELLIS won't emit fewer than 100k triangles with a 1024²
 * texture — around 3 MB per ship, where the whole installed PWA is 1.5 MB. A
 * ship is a couple of hundred pixels on a 10×10 board, so nearly all of that
 * detail is invisible. This cuts it to a few thousand triangles, shrinks the
 * texture, and meshopt-compresses what's left.
 *
 * Two deliberate choices:
 *
 * - **Node structure is preserved.** No flatten, no join unless you ask with
 *   --flatten. Ship parts have to stay separate nodes so things like the
 *   submarine's torpedo doors can be animated later.
 * - **Meshopt, not Draco.** three.js needs a decoder either way, but meshopt's
 *   is ~30 KB against Draco's ~200 KB of wasm — and on an offline PWA that
 *   decoder ships to every player.
 *
 * Loading the output needs `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { NodeIO } from '@gltf-transform/core';
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

// ── argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { ...DEFAULTS, inputs: [], out: null, flatten: false, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--selftest') opts.selftest = true;
    else if (a === '--flatten') opts.flatten = true;
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

// ── reporting ───────────────────────────────────────────────────────────────

function countTriangles(document) {
  let tris = 0;
  let verts = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      tris += indices ? indices.getCount() / 3 : (position?.getCount() ?? 0) / 3;
      verts += position?.getCount() ?? 0;
    }
  }
  return { tris: Math.round(tris), verts };
}

function describe(document, bytes) {
  const root = document.getRoot();
  const { tris, verts } = countTriangles(document);
  return {
    bytes,
    tris,
    verts,
    meshes: root.listMeshes().length,
    nodes: root.listNodes().length,
    materials: root.listMaterials().length,
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
  row('nodes', before.nodes, after.nodes);
  row('meshes', before.meshes, after.meshes);
  row('textures', before.texturePx || '—', after.texturePx || '—');
  console.log('  └────────────┴──────────────┴──────────────┘');
  console.log(`  ${pct}% smaller`);
}

// ── the pipeline ────────────────────────────────────────────────────────────

function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

async function optimize(document, opts) {
  const { tris: startTris } = countTriangles(document);
  // simplify() takes a ratio, not a count.
  const ratio = startTris > 0 ? Math.min(1, opts.tris / startTris) : 1;

  const transforms = [
    dedup(),
    // weld merges duplicate vertices — simplification can't collapse edges
    // across a seam that isn't actually shared, which is most of a raw
    // photogrammetry-style mesh.
    weld(),
  ];

  if (opts.flatten) transforms.push(flatten(), join());

  transforms.push(
    simplify({ simplifier: MeshoptSimplifier, ratio, error: opts.error }),
    prune(),
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

  return document;
}

async function processFile(io, input, opts) {
  const beforeBytes = fs.statSync(input).size;
  const document = await io.read(input);
  const before = describe(document, beforeBytes);

  await optimize(document, opts);

  const outDir = opts.out ?? path.dirname(input);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${path.basename(input, path.extname(input))}.opt.glb`);

  const glb = await io.writeBinary(document);
  fs.writeFileSync(outFile, glb);

  const after = describe(document, glb.byteLength);
  report(path.basename(input), before, after);
  console.log(`  → ${path.relative(process.cwd(), outFile)}`);
  return { before, after };
}

// ── self-test ───────────────────────────────────────────────────────────────

/**
 * Build a dense textured sphere roughly the size of a raw TRELLIS export, so
 * the pipeline can be verified without spending GPU quota on a real ship.
 */
async function buildTestDocument(io, segments = 220) {
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

  // A detailed texture, not a flat colour: prune() legitimately swaps a
  // single-colour texture for a material factor, which would make the
  // self-test's output look far smaller than a real textured ship.
  const TEX = 1024;
  const pixels = Buffer.alloc(TEX * TEX * 3);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = (y * TEX + x) * 3;
      const plate = ((x >> 5) + (y >> 5)) % 2 ? 18 : 0;
      const streak = Math.sin(x * 0.11) * Math.cos(y * 0.07) * 22;
      const grime = ((x * 7919 + y * 104729) % 37) - 18;
      const base = 128 + plate + streak + grime;
      pixels[i] = Math.max(0, Math.min(255, base - 8));
      pixels[i + 1] = Math.max(0, Math.min(255, base));
      pixels[i + 2] = Math.max(0, Math.min(255, base + 14));
    }
  }
  const texture = await sharp(pixels, { raw: { width: TEX, height: TEX, channels: 3 } })
    .png()
    .toBuffer();

  const material = document
    .createMaterial('hull')
    .setBaseColorTexture(
      document.createTexture('hullTex').setImage(texture).setMimeType('image/png'),
    );

  const prim = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      document.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer),
    )
    .setIndices(
      document.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
    )
    .setMaterial(material);

  const mesh = document.createMesh('hull').addPrimitive(prim);
  const node = document.createNode('hull').setMesh(mesh);
  document.createScene().addChild(node);
  return document;
}

async function selftest(io, opts) {
  console.log('Self-test — synthesising a dense textured mesh (~100k triangles)…');
  const document = await buildTestDocument(io);
  const raw = await io.writeBinary(document);
  const before = describe(document, raw.byteLength);

  const fresh = await io.readBinary(raw);
  await optimize(fresh, opts);
  const out = await io.writeBinary(fresh);
  const after = describe(fresh, out.byteLength);

  report('synthetic-ship.glb', before, after);

  // Round-trip the compressed result. Meshopt-compressed buffer views are the
  // part most likely to be written wrong and only fail later, in the browser.
  const roundTrip = await io.readBinary(out);
  const rt = describe(roundTrip, out.byteLength);
  const required = roundTrip.getRoot().listExtensionsRequired().map((e) => e.extensionName);
  const compressed = required.includes('EXT_meshopt_compression');

  const checks = [
    ['triangle budget met', after.tris <= opts.tris * 1.1],
    ['smaller than input', after.bytes < before.bytes],
    ['texture retained', after.textures > 0],
    ['node structure preserved', after.nodes === before.nodes],
    ['re-reads after compression', rt.tris === after.tris && rt.verts === after.verts],
    ['meshopt compression applied', compressed],
  ];
  for (const [label, pass] of checks) console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}`);

  const ok = checks.every(([, pass]) => pass);
  console.log(
    ok
      ? `\n  PASS — a ${opts.tris.toLocaleString()}-triangle budget lands at ${kb(after.bytes)} per model.`
      : '\n  FAIL — see the checks above.',
  );
  if (!ok) process.exitCode = 1;
  return after;
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
  for (const input of opts.inputs) {
    if (!fs.existsSync(input)) {
      console.error(`  skipped (not found): ${input}`);
      process.exitCode = 1;
      continue;
    }
    const { after } = await processFile(io, input, opts);
    total += after.bytes;
  }
  console.log(`\nTotal: ${kb(total)} across ${opts.inputs.length} model(s).`);
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exitCode = 1;
});
