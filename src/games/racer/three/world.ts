/**
 * One sky cell's scenery, built from its hash: islands (by the island
 * source), cloud banks and now and then a balloon.
 *
 * Everything static in a cell is baked into one land mesh (bake.ts), and
 * the cell's waterfalls into one more, so a whole cell costs one or two draw
 * calls however much is in it. A cell comes in two versions: a far one,
 * cheap, for the many cells out in the haze, and a near one, with every
 * tree and flower, for the few around the camera (the scene swaps them).
 * The geometry is the cell's own and is freed with it; the materials are
 * shared by every cell.
 */
import * as THREE from 'three';
import { cloudBanksInCell, islandsInCell, type CloudBank } from '../domain/scenery';
import { CELL, cellNoise } from '../domain/sky';
import { Batch, bakedMaterial, lit, seeded, SUN_DIR } from './bake';
import type { IslandSource } from './islands';

const CLOUD_TOP = new THREE.Color('#ffffff');
const CLOUD_MID = new THREE.Color('#eaf1fd');
const CLOUD_UNDER = new THREE.Color('#bccfee');
const BALLOONS = ['#ff5d6c', '#4aa3ff', '#ffd23f', '#53d08a', '#c38bff'].map((c) => new THREE.Color(c));
const BALLOON_STRIPE = new THREE.Color('#fff6e0');
const BASKET = new THREE.Color('#a8743f');

/** Shared by every cell. */
export interface WorldKit {
  land: THREE.MeshBasicMaterial;
  falls: THREE.MeshBasicMaterial;
  /** Puffs with more sides to fewer: a big puff seen close needs more than a small or far one. */
  puffs: [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
  balloon: THREE.BufferGeometry;
  basket: THREE.BufferGeometry;
}

/** Falling water: soft white and pale blue streaks, tiling downward. */
function fallsTexture(): THREE.Texture {
  const w = 128;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(214,239,255,0.82)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const n = (k: number) => cellNoise(i, k, 333);
    const x = n(1) * w;
    const sw = 3 + n(2) * 10;
    const y = n(3) * h;
    const len = 80 + n(4) * 300;
    const color = n(5) < 0.6 ? `255,255,255` : `140,200,250`;
    const alpha = n(5) < 0.6 ? 0.45 + n(6) * 0.5 : 0.3 + n(6) * 0.35;
    // A long soft-edged blob, so up close a streak is a ribbon of light,
    // not a bar with square ends.
    const paint = (px: number, py: number) => {
      ctx.save();
      ctx.translate(px, py + len / 2);
      ctx.scale(1, len / sw);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sw / 2);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(0.6, `rgba(${color},${alpha * 0.6})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, sw / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    // Drawn wrapped, so the tile repeats without a seam.
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) paint(x + dx, y + dy);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A hot-air balloon's envelope: a teardrop of alternating stripes, one face per stripe. */
function balloonGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = -Math.PI / 2 + t * Math.PI;
    // Round on top, narrowing to the mouth.
    const r = Math.cos(a) * (t < 0.5 ? 0.62 + t * 0.7 : 1);
    pts.push(new THREE.Vector2(Math.max(0.12, r) * 6, Math.sin(a) * 7.2 + (t < 0.5 ? (0.5 - t) * -2 : 0)));
  }
  const geo = new THREE.LatheGeometry(pts, 12).toNonIndexed();
  geo.computeVertexNormals();
  // Which stripe each face is in, by the angle of its middle.
  const pos = geo.getAttribute('position');
  const stripe = new Float32Array(pos.count);
  for (let f = 0; f < pos.count; f += 3) {
    const x = pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2);
    const z = pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2);
    const s = Math.floor(((Math.atan2(x, z) + Math.PI) / (Math.PI * 2)) * 12) % 2;
    stripe.fill(s, f, f + 3);
  }
  geo.setAttribute('stripe', new THREE.BufferAttribute(stripe, 1));
  return geo;
}

export function createWorldKit(): WorldKit {
  const falls = new THREE.MeshBasicMaterial({
    map: fallsTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return {
    land: bakedMaterial(),
    falls,
    puffs: [new THREE.SphereGeometry(1, 12, 8), new THREE.SphereGeometry(1, 9, 6), new THREE.SphereGeometry(1, 7, 4)],
    balloon: balloonGeometry(),
    basket: new THREE.CylinderGeometry(1.3, 1.1, 2, 8),
  };
}

/** Runs the waterfalls' streaks downward (v grows down the water). */
export function flowFalls(kit: WorldKit, dt: number): void {
  const map = kit.falls.map;
  if (map) map.offset.y = (map.offset.y - dt * 0.9) % 1;
}

/**
 * A bank of cloud: puffs clustered over an oval footprint, biggest and
 * highest in the middle, flattened underneath. Bright white on top, cooler
 * and bluer underneath, a touch warmer on the sun's side.
 */
function addCloudBank(bank: CloudBank, kit: WorldKit, land: Batch, near: boolean): void {
  const rnd = seeded(bank.seed);
  const L = bank.length;
  const W = bank.width;
  const cos = Math.cos(bank.heading);
  const sin = Math.sin(bank.heading);
  const tall = bank.tall;
  const count = tall > 1 ? 16 + Math.round(rnd() * 4) : Math.max(6, Math.min(18, Math.round(L / 6)));
  const top = bank.y + W * 0.62 * tall;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const flatten = (at: THREE.Vector3) => {
    if (at.y < bank.y) at.y = bank.y;
  };
  const paint = (out: THREE.Color, at: THREE.Vector3, n: THREE.Vector3) => {
    const h = Math.min(1, Math.max(0, (at.y - bank.y) / (top - bank.y)));
    const face = Math.min(1, Math.max(0, n.y * 0.55 + 0.45));
    const k = Math.min(1, face * 0.6 + h * 0.55);
    if (k < 0.5) out.copy(CLOUD_UNDER).lerp(CLOUD_MID, k * 2);
    else out.copy(CLOUD_MID).lerp(CLOUD_TOP, (k - 0.5) * 2);
    const warm = Math.max(0, n.dot(SUN_DIR)) * 0.05;
    out.r += warm;
    out.b -= warm * 0.6;
  };
  for (let i = 0; i < count; i++) {
    // Spread along the long side, denser in the middle.
    let u = rnd() * 2 - 1;
    let w = (rnd() * 2 - 1) * 0.75;
    const d = Math.hypot(u, w);
    if (d > 1) {
      u /= d;
      w /= d;
    }
    const middle = 1 - Math.min(1, Math.hypot(u, w));
    // A tall bank is a stack of puffs, fat low down and narrowing to rounded tops.
    const climb = tall > 1 ? i / count : 0;
    const shrink = tall > 1 ? 1 - 0.5 * climb : 1;
    const r = W * (0.2 + 0.2 * middle) * (0.8 + rnd() * 0.4) * shrink;
    const lx = u * L * 0.42 * shrink;
    const lz = w * W * 0.38 * shrink;
    const x = bank.x + lx * cos + lz * sin;
    const z = bank.z - lx * sin + lz * cos;
    const y = bank.y + r * 0.25 + (tall > 1 ? climb * W * 0.62 * (tall - 0.6) : middle * W * 0.22) + rnd() * W * 0.06;
    const geo = near ? (r > 14 ? kit.puffs[0] : r > 6 ? kit.puffs[1] : kit.puffs[2]) : r > 24 ? kit.puffs[1] : kit.puffs[2];
    land.add(geo, m.compose(v.set(x, y, z), q.identity(), s.set(r * 1.15, r * 0.85, r)), paint, flatten);
  }
}

function addBalloon(cx: number, cz: number, kit: WorldKit, land: Batch): void {
  const n = (salt: number) => cellNoise(cx, cz, salt);
  const color = BALLOONS[Math.floor(n(61) * BALLOONS.length)];
  const x = cx * CELL + n(62) * CELL;
  const y = 105 + n(63) * 40;
  const z = cz * CELL + n(64) * CELL;
  const stripe = kit.balloon.getAttribute('stripe');
  land.add(kit.balloon, new THREE.Matrix4().makeTranslation(x, y, z), (out, _at, nrm, i) =>
    lit(out, stripe.getX(i) ? BALLOON_STRIPE : color, nrm),
  );
  land.add(kit.basket, new THREE.Matrix4().makeTranslation(x, y - 9.6, z), (out, _at, nrm) => lit(out, BASKET, nrm, 0.9));
}

/**
 * A sky cell's scenery as one group: its land mesh, its waterfalls, anything
 * else the island source adds. `level` 1 builds the full-detail version, 0 the cheapest. It is
 * built in steps (an island, a cloud bank, the baked meshes), each a few
 * milliseconds at most, and yields between them so the scene can spread a
 * cell over several frames; the generator returns the finished group.
 */
export function* cellSteps(cx: number, cz: number, kit: WorldKit, islands: IslandSource, level: number): Generator<void, THREE.Group> {
  const near = level === 1;
  const group = new THREE.Group();
  const cell = { land: new Batch(), falls: new Batch({ rgba: true, uvs: true }), group, near };
  for (const isl of islandsInCell(cx, cz)) {
    islands.place(isl, cell);
    yield;
  }
  for (const bank of cloudBanksInCell(cx, cz)) {
    addCloudBank(bank, kit, cell.land, near);
    yield;
  }
  if (cellNoise(cx, cz, 60) < 0.18) addBalloon(cx, cz, kit, cell.land);
  if (!cell.land.empty) {
    const land = new THREE.Mesh(cell.land.build(), kit.land);
    land.userData.baked = true;
    group.add(land);
    yield;
  }
  if (!cell.falls.empty) {
    const falls = new THREE.Mesh(cell.falls.build(), kit.falls);
    falls.userData.baked = true;
    // Drawn after the land behind it, as see-through things must be.
    falls.renderOrder = 1;
    group.add(falls);
  }
  return group;
}

/**
 * Frees a cell's own geometry and instance buffers; shared materials and
 * the island kit's geometry stay.
 */
export function disposeCell(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.userData.baked) mesh.geometry.dispose();
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

export function disposeWorldKit(kit: WorldKit): void {
  kit.land.dispose();
  kit.falls.map?.dispose();
  kit.falls.dispose();
  for (const p of kit.puffs) p.dispose();
  kit.balloon.dispose();
  kit.basket.dispose();
}
