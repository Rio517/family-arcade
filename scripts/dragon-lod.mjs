#!/usr/bin/env node
/**
 * The dragon mask the mirror wears, made from the sculpted master.
 *
 *   npm run dragon-lod -- "<master>.glb"                 # 300k triangles → src/shared/effects/assets/dragon-mask.glb
 *   npm run dragon-lod -- "<master>.glb" --tris 0        # every triangle the master has
 *   npm run dragon-lod -- "<master>.glb" --out <file> --tris 150000 --jaw 14
 *
 * The master is a reference sculpt: 1.2M triangles, colour as vertex data,
 * and no rig — a static jaw at the origin, no fire socket, no eye anchors.
 * This turns it into the asset `overlay/dragon.ts` expects, and everything it
 * needs it reads from the geometry rather than from a number typed in here:
 *
 * - **Eye anchors.** The shell is rasterised front-on and the two enclosed
 *   openings in its upper half are the eye apertures; `EyeAperture_L/R`
 *   empties go at their centres. The app hangs the mask from that line and
 *   scales it so the wearer's eyes look out of the holes.
 * - **The jaw.** The lower-jaw sculpt, the lower teeth, the lower gum and the
 *   mouth lining move together under a `DragonJaw` pivot at the jaw's
 *   rear-top edge, with `open_rotation_x` in its extras — the same contract
 *   the fire dragon shipped with.
 * - **The fire socket.** `FireSocket` sits at the bite line, just in front of
 *   the teeth, +Z out of the mouth.
 *
 * Then meshopt's simplifier takes the triangle count down (vertex colour
 * rides along — the jade, the pale tips and the ivory survive), everything is
 * quantised and meshopt-compressed, and the result is checked before it is
 * written: the rig nodes exist, the parts are all there, the count is what
 * was asked for.
 *
 * Units are the master's own; +Y up, +Z out of the face toward the camera,
 * as the fire dragon was. Whether it fits a head is judged on one:
 * `MIRROR_PORTRAIT=<photo> npm run shots -- mirror` (see screenshots.mjs).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const DEFAULT_OUT = 'src/shared/effects/assets/dragon-mask.glb';
const DEFAULT_TRIS = 300_000;
const DEFAULT_JAW_DEGREES = 14;

/** What the master calls its parts. The jaw set moves; everything else is the head. */
const SHELL = /^DragonMaskSculpt$/;
const JAW_PARTS = [/^DragonJawSculpt$/, /^LowerTooth_/, /^Dark mouth lining$/];
const TEETH = /Tooth_/;
const GUM = /^Gum tucked under lip/;

function parseArgs(argv) {
  const opts = { input: null, out: DEFAULT_OUT, tris: DEFAULT_TRIS, jawDegrees: DEFAULT_JAW_DEGREES };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--tris') opts.tris = Number(argv[++i]);
    else if (a === '--jaw') opts.jawDegrees = Number(argv[++i]);
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else if (opts.input) fail('one master at a time');
    else opts.input = a;
  }
  if (!opts.input) fail('usage: npm run dragon-lod -- "<master>.glb" [--tris N|0] [--jaw degrees] [--out file]');
  if (!Number.isFinite(opts.tris) || opts.tris < 0) fail('--tris wants a triangle count, or 0 for all of them');
  return opts;
}

function fail(message) {
  console.error(`dragon-lod: ${message}`);
  process.exit(1);
}

// ── geometry ───────────────────────────────────────────────────────────────

/** Axis-aligned bounds of a node's mesh, in its own space (the master's nodes all sit at the origin). */
function bounds(node) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const pos = prim.getAttribute('POSITION');
    const [pmin, pmax] = [pos.getMin([]), pos.getMax([])];
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], pmin[i]);
      max[i] = Math.max(max[i], pmax[i]);
    }
  }
  return { min, max };
}

function union(a, b) {
  return {
    min: a.min.map((v, i) => Math.min(v, b.min[i])),
    max: a.max.map((v, i) => Math.max(v, b.max[i])),
  };
}

function triangleCount(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return Math.round(tris);
}

/**
 * The eye apertures, found by looking at the shell from the front: rasterise
 * every triangle onto a grid, flood the outside in from the edges, and the
 * two largest enclosed openings are the holes the eyes look through (the
 * nostrils are the only others, a tenth the size). Returns their centres in model units, left eye first (the wearer's
 * left is −X, the viewer's right).
 */
function findEyeApertures(shellNode) {
  const N = 512;
  const b = bounds(shellNode);
  const half = (Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2) * 1.02;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const toGrid = (x, y) => [((x - (cx - half)) / (2 * half)) * N, ((y - (cy - half)) / (2 * half)) * N];
  const covered = new Uint8Array(N * N);

  for (const prim of shellNode.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray();
    const idx = prim.getIndices()?.getArray();
    const count = idx ? idx.length : pos.length / 3;
    const at = (k) => (idx ? idx[k] : k);
    for (let t = 0; t < count; t += 3) {
      const [ax, ay] = toGrid(pos[at(t) * 3], pos[at(t) * 3 + 1]);
      const [bx, by] = toGrid(pos[at(t + 1) * 3], pos[at(t + 1) * 3 + 1]);
      const [qx, qy] = toGrid(pos[at(t + 2) * 3], pos[at(t + 2) * 3 + 1]);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, qx)));
      const x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, qx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, qy)));
      const y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by, qy)));
      const area = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
      if (area === 0) continue;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / area;
          const w1 = ((qx - bx) * (py - by) - (qy - by) * (px - bx)) / area;
          const w2 = ((ax - qx) * (py - qy) - (ay - qy) * (px - qx)) / area;
          if (w0 >= 0 && w1 >= 0 && w2 >= 0) covered[y * N + x] = 1;
        }
      }
    }
  }

  // Flood the outside from the borders.
  const outside = new Uint8Array(N * N);
  const stack = [];
  for (let i = 0; i < N; i++) stack.push(i, i * N, i * N + N - 1, (N - 1) * N + i);
  while (stack.length) {
    const i = stack.pop();
    if (outside[i] || covered[i]) continue;
    outside[i] = 1;
    const x = i % N;
    if (x > 0) stack.push(i - 1);
    if (x < N - 1) stack.push(i + 1);
    if (i >= N) stack.push(i - N);
    if (i < N * N - N) stack.push(i + N);
  }

  // Label what is left: enclosed openings.
  const seen = new Uint8Array(N * N);
  const holes = [];
  for (let s = 0; s < N * N; s++) {
    if (covered[s] || outside[s] || seen[s]) continue;
    let count = 0;
    let sx = 0;
    let sy = 0;
    const q = [s];
    seen[s] = 1;
    while (q.length) {
      const i = q.pop();
      count++;
      sx += i % N;
      sy += Math.floor(i / N);
      for (const j of [i - 1, i + 1, i - N, i + N]) {
        if (j < 0 || j >= N * N || covered[j] || outside[j] || seen[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    const gx = sx / count;
    const gy = sy / count;
    holes.push({
      pixels: count,
      x: cx - half + ((gx + 0.5) / N) * 2 * half,
      y: cy - half + ((gy + 0.5) / N) * 2 * half,
    });
  }
  if (process.env.DRAGON_LOD_DEBUG) {
    const c = covered.reduce((a, v) => a + v, 0);
    const o = outside.reduce((a, v) => a + v, 0);
    console.log(`  raster: covered ${c} outside ${o} holes ${holes.length}`, holes.slice(0, 8));
  }
  // Eyes: the largest opening each side (the nostrils are a tenth the size).
  const bySize = holes.sort((a, b) => b.pixels - a.pixels);
  const left = bySize.find((h) => h.x < 0);
  const right = bySize.find((h) => h.x > 0);
  if (!left || !right) fail('could not find two eye apertures in the shell');
  if (Math.abs(left.pixels - right.pixels) > 0.1 * left.pixels) {
    fail(`the eye apertures differ in size (${left.pixels} vs ${right.pixels} px) — is the front +Z?`);
  }
  return { left, right };
}

// ── the build ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

  const doc = await io.read(opts.input);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const [master] = scene.listChildren();
  if (!master || scene.listChildren().length !== 1) fail('expected one root node holding the parts');
  const parts = master.listChildren();
  const startTris = triangleCount(doc);
  console.log(`${path.basename(opts.input)}: ${parts.length} parts, ${startTris.toLocaleString()} triangles`);

  for (const p of parts) {
    const t = p.getTranslation();
    if (t.some((v) => v !== 0) || p.getRotation().some((v, i) => v !== [0, 0, 0, 1][i])) {
      fail(`${p.getName()} is not at the origin — the master's parts were expected untransformed`);
    }
  }
  const shell = parts.find((p) => SHELL.test(p.getName()));
  const jawParts = parts.filter((p) => JAW_PARTS.some((re) => re.test(p.getName())));
  const jawSculpt = jawParts.find((p) => /^DragonJawSculpt$/.test(p.getName()));
  const teeth = parts.filter((p) => TEETH.test(p.getName()));
  const gums = parts.filter((p) => GUM.test(p.getName()));
  if (!shell || !jawSculpt || teeth.length === 0) fail('missing the shell, the jaw sculpt, or the teeth');

  // The lower gum belongs to the jaw: of the two gums, the one that sits lower.
  if (gums.length === 2) {
    const lower = gums.reduce((a, b) => (bounds(a).min[1] < bounds(b).min[1] ? a : b));
    jawParts.push(lower);
  }

  // Where the rig goes, from the geometry.
  const eyes = findEyeApertures(shell);
  const jawBox = bounds(jawSculpt);
  const jawHeight = jawBox.max[1] - jawBox.min[1];
  const jawDepth = jawBox.max[2] - jawBox.min[2];
  // The hinge: inside the jaw, at its rear-top, so the chin swings and the
  // back of the jaw stays in the head.
  const pivot = [0, jawBox.max[1] - 0.1 * jawHeight, jawBox.min[2] + 0.1 * jawDepth];
  const teethBox = teeth.map(bounds).reduce(union);
  const upperTeeth = teeth.filter((t) => /Upper/.test(t.getName())).map(bounds).reduce(union);
  const lowerTeeth = teeth.filter((t) => /Lower/.test(t.getName())).map(bounds).reduce(union);
  // The bite line, a touch below it, just in front of the teeth.
  const biteY = (upperTeeth.min[1] + lowerTeeth.max[1]) / 2;
  const socket = [0, biteY - 0.05, teethBox.max[2] + 0.05];
  // The app reads the anchors' x and y; z only has to be on the shell's face.
  const eyeZ = bounds(shell).max[2] * 0.4;
  const jawOpen = (opts.jawDegrees * Math.PI) / 180;

  console.log(`  eye apertures  L (${eyes.left.x.toFixed(3)}, ${eyes.left.y.toFixed(3)})  R (${eyes.right.x.toFixed(3)}, ${eyes.right.y.toFixed(3)})`);
  console.log(`  jaw pivot      (${pivot.map((v) => v.toFixed(3)).join(', ')})  opens ${opts.jawDegrees}°`);
  console.log(`  fire socket    (${socket.map((v) => v.toFixed(3)).join(', ')})`);
  console.log(`  jaw parts      ${jawParts.map((p) => p.getName()).join(', ')}`);

  // Build the rig.
  master.setName('DragonMaskRoot').setExtras({
    asset_type: 'face-overlay',
    forward_axis: '+Z',
    anchor: 'between-eyes',
    eye_anchors: ['EyeAperture_L', 'EyeAperture_R'],
    jaw_node: 'DragonJaw',
    jaw_blendshape: 'jawOpen',
    jaw_max_degrees: opts.jawDegrees,
    fire_socket: 'FireSocket',
    fire_direction: '+Z',
    source: path.basename(opts.input),
    built_by: 'scripts/dragon-lod.mjs',
  });
  const jaw = doc
    .createNode('DragonJaw')
    .setTranslation(pivot)
    .setExtras({ animation_role: 'jaw', closed_rotation_x: 0, open_rotation_x: jawOpen, jaw_max_degrees: opts.jawDegrees });
  master.addChild(jaw);
  for (const p of jawParts) {
    master.removeChild(p);
    jaw.addChild(p);
    p.setTranslation(pivot.map((v) => -v));
  }
  master.addChild(
    doc.createNode('FireSocket').setTranslation(socket).setExtras({ effect_role: 'fire_origin', effect_axis: '+Z' }),
  );
  master.addChild(doc.createNode('EyeAperture_L').setTranslation([eyes.left.x, eyes.left.y, eyeZ]));
  master.addChild(doc.createNode('EyeAperture_R').setTranslation([eyes.right.x, eyes.right.y, eyeZ]));

  // Bring the count down, then pack.
  const transforms = [dedup(), weld()];
  if (opts.tris > 0 && opts.tris < startTris) {
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: opts.tris / startTris, error: 0.01 }));
  }
  transforms.push(
    prune({ keepLeaves: true }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }),
  );
  await doc.transform(...transforms);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  // Nothing is written until it is checked.
  const problems = [];
  const names = new Set(root.listNodes().map((n) => n.getName()));
  for (const need of ['DragonMaskRoot', 'DragonJaw', 'FireSocket', 'EyeAperture_L', 'EyeAperture_R']) {
    if (!names.has(need)) problems.push(`rig node ${need} is missing after packing`);
  }
  for (const p of parts) if (!names.has(p.getName())) problems.push(`part ${p.getName()} was lost`);
  const endTris = triangleCount(doc);
  if (opts.tris > 0 && Math.abs(endTris - Math.min(opts.tris, startTris)) > 0.1 * opts.tris) {
    problems.push(`asked for ${opts.tris.toLocaleString()} triangles, got ${endTris.toLocaleString()}`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }

  const out = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`  → ${path.relative(process.cwd(), out)}  ${endTris.toLocaleString()} triangles, ${kb.toLocaleString()} KB`);
}

main().catch((err) => {
  console.error(err.stack ?? err);
  process.exit(1);
});
