/**
 * Gulp Universe's ground: pavements, roads with their markings, and what each
 * block stands on (grass, paving, fields, concrete), on an island in the sea.
 *
 * Built from flat layers of quads, each with a small tiling texture mapped in
 * world units, so the ground stays crisp at any map size: a Region map is
 * five times the width of a Town and needs no bigger textures. Layers are
 * kept apart by a little height and polygon offset, so nothing flickers.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRng } from '@shared/rng';
import { BLOCK, ROAD, SIDEWALK, type BlockKind, type City } from '../domain/city';

type Surface = 'grass' | 'meadow' | 'forest' | 'paving' | 'plaza' | 'concrete' | 'field' | 'rock';

/** What each kind of block stands on inside its pavement ring. */
const FLOOR: Record<BlockKind, Surface> = {
  skyline: 'plaza',
  downtown: 'paving',
  town: 'paving',
  suburb: 'meadow',
  park: 'grass',
  plaza: 'plaza',
  landmark: 'concrete',
  industrial: 'concrete',
  farm: 'field',
  forest: 'forest',
  windfarm: 'meadow',
  airport: 'concrete',
  apron: 'concrete',
  mountain: 'rock',
  wonder: 'plaza',
};

/**
 * One flat quad in world units, UVs in world units divided by `tile`. `look`
 * turns and shifts the texture and tints it, so neighbouring blocks of grass
 * don't show the same pattern.
 */
function quad(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  tile: number,
  look: { turn: number; dx: number; dz: number; tint: number } = { turn: 0, dx: 0, dz: 0, tint: 1 },
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const c = Math.cos(look.turn);
  const sn = Math.sin(look.turn);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / tile;
    const v = pos.getZ(i) / tile;
    uv.setXY(i, u * c - v * sn + look.dx, u * sn + v * c + look.dz);
  }
  const col = new Float32Array(pos.count * 3).fill(look.tint);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function disc(x: number, z: number, r: number, y: number, tile: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, 40);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  return g;
}

/** A flat layer: its quads merged into one mesh, drawn in its turn. */
function layer(parts: THREE.BufferGeometry[], material: THREE.Material, order: number): THREE.Mesh | null {
  if (!parts.length) return null;
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = order;
  return mesh;
}

function flat(map: THREE.Texture | null, color: number, offset: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, color, roughness: 0.95, metalness: 0, vertexColors: true });
  // Later layers win over earlier ones without needing much height between them.
  m.polygonOffset = true;
  m.polygonOffsetFactor = -offset;
  m.polygonOffsetUnits = -offset * 4;
  return m;
}

export interface Ground {
  group: THREE.Group;
  /** Moved every frame for gently drifting water. */
  water: THREE.Texture;
  dispose(): void;
}

export function buildGround(city: City, renderer: THREE.WebGLRenderer): Ground {
  const group = new THREE.Group();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];
  const tex = (draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) => {
    const t = tiling(draw, size, aniso);
    textures.push(t);
    return t;
  };
  const half = city.half;

  // Pavement under everything: the land itself.
  const paving = tex(drawSlabs);
  // Every layer sits just under y = 0, so no thing standing on the ground
  // shares a plane with it (a shared plane flickers).
  const land = layer([quad(-half, -half, half, half, -0.1, 4)], flat(paving, 0xffffff, 0), 0);
  if (land) group.add(land);

  // What each block stands on.
  const surfaces: Record<Surface, THREE.Texture> = {
    grass: tex((g, s) => drawGrass(g, s, '#7fcb5c', '#6cb94b', 1), 512),
    meadow: tex((g, s) => drawGrass(g, s, '#98d56d', '#86c35c', 2), 512),
    forest: tex((g, s) => drawGrass(g, s, '#5fa84a', '#4d943b', 3), 512),
    rock: tex((g, s) => drawGrass(g, s, '#8fae6a', '#8a8f86', 4), 512),
    paving: tex((g, s) => drawTiles(g, s, '#efcf9c', 'rgba(160,115,60,0.3)', 4)),
    plaza: tex((g, s) => drawTiles(g, s, '#ece0c8', 'rgba(150,120,90,0.25)', 6)),
    concrete: tex((g, s) => drawTiles(g, s, '#c9c8c3', 'rgba(90,90,90,0.22)', 2)),
    field: tex(drawField),
  };
  const bySurface = new Map<Surface, THREE.BufferGeometry[]>();
  const paths: THREE.BufferGeometry[] = [];
  const kerbs: THREE.BufferGeometry[] = [];
  const shadows: THREE.BufferGeometry[] = [];
  for (const b of city.blockList) {
    const surface = FLOOR[b.kind];
    const inset = surface === 'paving' || surface === 'plaza' ? SIDEWALK : SIDEWALK - 0.4;
    const list = bySurface.get(surface) ?? [];
    // Green ground: a big tile, turned, shifted and tinted per block, so no
    // two blocks repeat. Paving keeps its neat grid.
    const green = surface === 'grass' || surface === 'meadow' || surface === 'forest' || surface === 'rock';
    const r = seededRng(Math.round(b.x * 131 + b.z * 7));
    const look = green ? { turn: Math.floor(r() * 4) * (Math.PI / 2), dx: r(), dz: r(), tint: 0.93 + r() * 0.12 } : undefined;
    list.push(quad(b.x + inset, b.z + inset, b.x + b.size - inset, b.z + b.size - inset, -0.08, green ? 22 : 8, look));
    bySurface.set(surface, list);
    if (b.kind === 'park') {
      // A cross of paths and a round plaza for the fountain.
      const c = BLOCK / 2;
      paths.push(quad(b.x + c - 2.5, b.z + SIDEWALK, b.x + c + 2.5, b.z + b.size - SIDEWALK, -0.07, 4));
      paths.push(quad(b.x + SIDEWALK, b.z + c - 2.5, b.x + b.size - SIDEWALK, b.z + c + 2.5, -0.07, 4));
      paths.push(disc(b.x + c, b.z + c, 10, -0.065, 4));
    }
    // A bright kerb round the block, wide enough not to shimmer as a
    // hairline from a height, with a shadow on the road side below.
    const k = 0.5;
    const o = 0.35;
    shadows.push(quad(b.x - o, b.z - o, b.x + b.size + o, b.z, -0.045, 4));
    shadows.push(quad(b.x - o, b.z + b.size, b.x + b.size + o, b.z + b.size + o, -0.045, 4));
    shadows.push(quad(b.x - o, b.z, b.x, b.z + b.size, -0.045, 4));
    shadows.push(quad(b.x + b.size, b.z, b.x + b.size + o, b.z + b.size, -0.045, 4));
    kerbs.push(quad(b.x, b.z, b.x + b.size, b.z + k, -0.06, 4));
    kerbs.push(quad(b.x, b.z + b.size - k, b.x + b.size, b.z + b.size, -0.06, 4));
    kerbs.push(quad(b.x, b.z, b.x + k, b.z + b.size, -0.06, 4));
    kerbs.push(quad(b.x + b.size - k, b.z, b.x + b.size, b.z + b.size, -0.06, 4));
  }
  for (const [surface, parts] of bySurface) {
    const mesh = layer(parts, flat(surfaces[surface], 0xffffff, 1), 1);
    if (mesh) group.add(mesh);
  }
  const pathMesh = layer(paths, flat(surfaces.plaza, 0xf3e6cc, 2), 2);
  if (pathMesh) group.add(pathMesh);
  const kerbMesh = layer(kerbs, flat(null, 0xf3f1ea, 2), 2);
  if (kerbMesh) group.add(kerbMesh);

  // Roads, then their markings.
  const asphalt = tex(drawAsphalt);
  const roads: THREE.BufferGeometry[] = [];
  for (const r of city.roads) {
    roads.push(quad(-half, r - ROAD / 2, half, r + ROAD / 2, -0.05, 10));
    roads.push(quad(r - ROAD / 2, -half, r + ROAD / 2, half, -0.05, 10));
  }
  const roadMesh = layer(roads, flat(asphalt, 0xffffff, 3), 3);
  if (roadMesh) group.add(roadMesh);
  const shadowMesh = layer(shadows, flat(null, 0x3a3f4a, 4), 4);
  if (shadowMesh) group.add(shadowMesh);

  // No centre lines: plain roads read calmer, and thin lines shimmer at a
  // distance. Zebra crossings stay.
  const white: THREE.BufferGeometry[] = [];
  // Zebra crossings on each side of every crossing.
  for (const x of city.roads) {
    for (const z of city.roads) {
      for (const side of [-1, 1]) {
        const cx = x + side * (ROAD / 2 + 1.8);
        const cz = z + side * (ROAD / 2 + 1.8);
        for (let t = -ROAD / 2 + 1; t < ROAD / 2 - 0.5; t += 1.8) {
          if (Math.abs(cx) < half - 1) white.push(quad(cx - 1.2, z + t, cx + 1.2, z + t + 0.9, -0.04, 4));
          if (Math.abs(cz) < half - 1) white.push(quad(x + t, cz - 1.2, x + t + 0.9, cz + 1.2, -0.04, 4));
        }
      }
    }
  }
  const whiteMesh = layer(white, flat(null, 0xf4f4f0, 4), 4);
  if (whiteMesh) group.add(whiteMesh);

  // The island's edge, standing out of the sea, and the sea.
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(half * 2 + 3, 3, half * 2 + 3),
    new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.9 }),
  );
  // Its top sits below every ground layer (they run from -0.1 up to 0).
  edge.position.y = -1.75;
  edge.receiveShadow = true;
  group.add(edge);

  // The wonder islet (grass on a stone base) and the bridge out to it.
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.9 });
  const extraGrass: THREE.BufferGeometry[] = [];
  const extraRoad: THREE.BufferGeometry[] = [];
  for (const land of city.extraLand) {
    // Only the part over the water is drawn; the rest is the town's own road.
    const l = { ...land, z1: Math.min(land.z1, -half) };
    const w = l.x1 - l.x0;
    const d = l.z1 - l.z0;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.5, 3, d + 1.5), stone);
    base.position.set((l.x0 + l.x1) / 2, -1.75, (l.z0 + l.z1) / 2);
    base.receiveShadow = true;
    group.add(base);
    if (l.kind === 'islet') extraGrass.push(quad(l.x0, l.z0, l.x1, l.z1, -0.08, 22));
    else {
      extraRoad.push(quad(l.x0, l.z0, l.x1, l.z1, -0.05, 10));
      // Railings along both sides of the bridge.
      for (const x of [l.x0 - 0.3, l.x1 + 0.3]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, d), new THREE.MeshStandardMaterial({ color: 0xe8452f, roughness: 0.6 }));
        rail.position.set(x, 0.45, (l.z0 + l.z1) / 2);
        rail.castShadow = true;
        group.add(rail);
      }
    }
  }
  const isletMesh = layer(extraGrass, flat(surfaces.grass, 0xffffff, 1), 1);
  if (isletMesh) group.add(isletMesh);
  const bridgeMesh = layer(extraRoad, flat(asphalt, 0xffffff, 3), 3);
  if (bridgeMesh) group.add(bridgeMesh);

  const water = tiling(drawWaves, 256, aniso);
  water.repeat.set(80, 80);
  textures.push(water);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0x2fb3e0, map: water, roughness: 0.35, metalness: 0.05 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -2.2;
  group.add(sea);

  return {
    group,
    water,
    dispose() {
      for (const t of textures) t.dispose();
    },
  };
}

// -------------------------------------------------------------------------
// Tiling textures, painted in code
// -------------------------------------------------------------------------

function tiling(draw: (g: CanvasRenderingContext2D, s: number) => void, size: number, aniso: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

/** Repeatable noise: the same speckles every time, scattered by a seeded
 * random (a simple multiply-and-wrap lines the dots up into stripes). */
function speckle(g: CanvasRenderingContext2D, s: number, n: number, color: string, size: number, salt: number): void {
  const r = seededRng(salt * 7717 + 11);
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(r() * s, r() * s, size, size);
}

/** The pavement: cool light-grey square slabs with clear joints. */
function drawSlabs(g: CanvasRenderingContext2D, s: number): void {
  // Cool blue-grey, so it stays grey under the warm sun and reads apart
  // from the sandy paving inside the blocks.
  g.fillStyle = '#c3cdda';
  g.fillRect(0, 0, s, s);
  // Each slab a shade apart from its neighbours, like real paving.
  const shades = ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.035)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.06)'];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      g.fillStyle = shades[(i * 2 + j * 3) % shades.length];
      g.fillRect((i * s) / 3, (j * s) / 3, s / 3, s / 3);
    }
  }
  speckle(g, s, 500, 'rgba(0,0,0,0.035)', 2, 1);
  g.strokeStyle = 'rgba(80,92,112,0.75)';
  g.lineWidth = 4;
  // Four units of pavement: 3 x 3 slabs.
  for (let i = 0; i <= 3; i++) {
    const p = (i * s) / 3;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, s);
    g.moveTo(0, p);
    g.lineTo(s, p);
    g.stroke();
  }
}

function drawTiles(g: CanvasRenderingContext2D, s: number, base: string, line: string, n: number): void {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  speckle(g, s, 400, 'rgba(0,0,0,0.04)', 2, n);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    const p = (i * s) / n;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, s);
    g.moveTo(0, p);
    g.lineTo(s, p);
    g.stroke();
  }
}

function drawGrass(g: CanvasRenderingContext2D, s: number, base: string, dark: string, salt: number): void {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  // Soft patches of every size, scattered at random, then fine speckle.
  const rnd = seededRng(salt * 313);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = 14 + rnd() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, dark);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
  speckle(g, s, 1600, 'rgba(255,255,255,0.08)', 2, salt * 2 + 3);
  speckle(g, s, 1600, 'rgba(0,60,0,0.08)', 2, salt * 2 + 4);
}

function drawField(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#c9b565';
  g.fillRect(0, 0, s, s);
  // Crop rows.
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#b7a24f' : '#d7c475';
    g.fillRect(0, (i * s) / 8, s, s / 16);
  }
  speckle(g, s, 500, 'rgba(90,70,20,0.12)', 2, 5);
}

function drawAsphalt(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#5b616e';
  g.fillRect(0, 0, s, s);
  // Just a faint grain: nothing that reads as lines from above.
  speckle(g, s, 900, 'rgba(255,255,255,0.035)', 2, 6);
  speckle(g, s, 900, 'rgba(0,0,0,0.05)', 2, 7);
}

function drawWaves(g: CanvasRenderingContext2D, s: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(190,235,255,0.9)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const x = (i * 83) % s;
    const y = (i * 47) % s;
    g.beginPath();
    g.arc(x, y + 14, 14, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
}
