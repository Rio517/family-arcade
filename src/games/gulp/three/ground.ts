/**
 * Gulp Universe's ground: pavements, roads with their markings, and what each
 * block stands on (grass, paving, fields, concrete), on an island in the sea.
 *
 * Built from flat layers of quads, each with a small tiling texture mapped in
 * world units, so the ground stays crisp at any map size: a Region map is
 * five times the width of a Town and needs no bigger textures. Layers are
 * kept apart by a little height and polygon offset, so nothing flickers.
 * Grass is laid as a grid of vertices whose colour drifts with a smooth
 * field of where they are, and its texture is read at two scales, so a
 * meadow has no edges and no visible repeat.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRng } from '@shared/rng';
import { inside } from '../domain/city/common';
import { inRect } from '../domain/space';
import { BLOCK, PARK_PATH, PARK_PLAZA, ROAD, SIDEWALK, type Airfield, type BlockKind, type City, type PlayArea, type Side } from '../domain/city';

type Surface = 'grass' | 'meadow' | 'forest' | 'paving' | 'plaza' | 'concrete' | 'field' | 'rock' | 'parking';

/** The grassy surfaces: soft colour, no straight edges, no visible repeat. */
const GREEN: ReadonlySet<Surface> = new Set(['grass', 'meadow', 'forest', 'rock']);

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
  forest: 'forest',
  windfarm: 'meadow',
  airport: 'concrete',
  mountain: 'rock',
  wonder: 'plaza',
  military: 'concrete',
  helipad: 'concrete',
  playpark: 'grass',
  dogpark: 'meadow',
  arena: 'concrete',
  parking: 'parking',
};

/** One flat quad in world units, UVs in world units divided by `tile`. */
function quad(x0: number, z0: number, x1: number, z1: number, y: number, tile: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  return g;
}

/**
 * Smooth value noise, 0..1: the same number at the same spot every time, and
 * no steps anywhere, so colour drawn from it has no edges.
 */
function hash(i: number, j: number): number {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * u;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * u;
  return a + (b - a) * v;
}

/**
 * The grass's colour at a spot, as a vertex colour: broad lighter and darker
 * swathes, a little warmer where it is drier. It depends only on where the
 * spot is, so two pieces of grass that meet always agree along the join.
 */
export function grassTint(x: number, z: number): [number, number, number] {
  const broad = valueNoise(x / 95 + 11.3, z / 95 - 7.9);
  const fine = valueNoise(x / 37 - 3.1, z / 37 + 21.7);
  const t = 0.9 + 0.15 * (broad * 0.65 + fine * 0.35);
  const dry = valueNoise(x / 140 + 40.2, z / 140 + 5.5) - 0.5;
  return [t * (1 + dry * 0.1), t, t * (1 - dry * 0.14)];
}

/**
 * Grass over a rectangle: a grid of vertices every `step` or so, so the
 * colour can drift smoothly across it. UVs are world units over `tile`,
 * turned and shifted by `look` (a block's own grass can be turned; the
 * countryside is never turned, so its pieces join without a seam).
 */
function sheet(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  tile: number,
  step: number,
  look: { turn: number; dx: number; dz: number } = { turn: 0, dx: 0, dz: 0 },
): THREE.BufferGeometry {
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const c = Math.cos(look.turn);
  const sn = Math.sin(look.turn);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = x / tile;
    const v = z / tile;
    uv.setXY(i, u * c - v * sn + look.dx, u * sn + v * c + look.dz);
    col.set(grassTint(x, z), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** How far across one repeat of the grass texture is, in world units. */
const GRASS_TILE = 22;

/** How far the land runs out on its green sides: past the fog, to the horizon. */
export const HORIZON = 3000;

/**
 * All the grass outside the street grid, as one mesh (shared vertices, so no
 * joins and no cracks) under one unturned texture mapping and one colour
 * field: the countryside ring, and past the edge of play the land that
 * carries on to the horizon on every side that is not sea. Vertices are 9
 * apart on the playable land and 60 apart beyond it.
 */
export function countryGrass(city: City, y = -0.09): THREE.BufferGeometry {
  const { half, land, shores } = city;
  const run = (a: number, b: number, step: number) => {
    if (b - a < 1e-6) return [];
    const n = Math.max(1, Math.ceil((b - a) / step));
    return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / n);
  };
  // Grid lines that land exactly on the street grid's edges and the shore.
  const lines = [...run(-HORIZON, -land, 60), ...run(-land, -half, 9), ...run(-half, half, 9), ...run(half, land, 9), ...run(land, HORIZON, 60), HORIZON];
  const n = lines.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  for (const z of lines) {
    for (const x of lines) {
      pos.push(x, y, z);
      uv.push(x / GRASS_TILE, z / GRASS_TILE);
      col.push(...grassTint(x, z));
    }
  }
  const sea = (x: number, z: number) =>
    (x < -land && shores.includes('w')) || (x > land && shores.includes('e')) || (z < -land && shores.includes('n')) || (z > land && shores.includes('s'));
  const index: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      // Only squares outside the street grid, and not out over the sea.
      const inGrid = lines[i] >= -half && lines[i + 1] <= half && lines[j] >= -half && lines[j + 1] <= half;
      if (inGrid || sea((lines[i] + lines[i + 1]) / 2, (lines[j] + lines[j + 1]) / 2)) continue;
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // Wound to face up.
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n * n }, () => [0, 1, 0]).flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

/**
 * The green textures repeat every few metres; sampling the texture a second
 * time, larger and turned, and averaging the two stretches that repeat far
 * beyond anything on screen. One extra texture read, no extra draw calls.
 */
function unrepeat(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 grassNear = texture2D( map, vMapUv );
        vec4 grassFar = texture2D( map, mat2( 0.6, -0.8, 0.8, 0.6 ) * vMapUv * 0.43 + vec2( 0.37, 0.71 ) );
        diffuseColor *= mix( grassNear, grassFar, 0.5 );
      #endif`,
    );
  };
  return m;
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
  const edgeOf = city.land;

  // What each block stands on.
  const surfaces: Record<Surface, THREE.Texture> = {
    grass: tex((g, s) => drawGrass(g, s, '#7fcb5c', '#6cb94b', 1), 512),
    meadow: tex((g, s) => drawGrass(g, s, '#98d56d', '#86c35c', 2), 512),
    forest: tex((g, s) => drawGrass(g, s, '#5fa84a', '#4d943b', 3), 512),
    rock: tex((g, s) => drawGrass(g, s, '#8fae6a', '#8a8f86', 4), 512),
    paving: tex((g, s) => drawTiles(g, s, '#efcf9c', 'rgba(160,115,60,0.3)', 4)),
    plaza: tex((g, s) => drawTiles(g, s, '#ece0c8', 'rgba(150,120,90,0.25)', 6)),
    concrete: tex((g, s) => drawTiles(g, s, '#c9c8c3', 'rgba(90,90,90,0.22)', 2)),
    parking: tex(drawParking),
    field: tex(drawField),
  };
  const bySurface = new Map<Surface, THREE.BufferGeometry[]>();
  const paths: THREE.BufferGeometry[] = [];
  for (const b of city.blockList) {
    // The airport's blocks are drawn as one field (see below).
    if (b.kind === 'airport') continue;
    // The Easter Island heads stand on grass, not paving.
    const surface = b.wonder === 'moai' ? 'grass' : FLOOR[b.kind];
    const inset = surface === 'paving' || surface === 'plaza' ? SIDEWALK : SIDEWALK - 0.4;
    const list = bySurface.get(surface) ?? [];
    // Green ground: a big tile, turned and shifted per block so no two blocks
    // repeat (the pavement round it hides the change), coloured by the same smooth field
    // as the countryside. Paving keeps its neat grid.
    const x0 = b.x + inset;
    const z0 = b.z + inset;
    const x1 = b.x + b.size - inset;
    const z1 = b.z + b.size - inset;
    if (GREEN.has(surface)) {
      const r = seededRng(Math.round(b.x * 131 + b.z * 7));
      const look = { turn: Math.floor(r() * 4) * (Math.PI / 2), dx: r(), dz: r() };
      list.push(sheet(x0, z0, x1, z1, -0.08, GRASS_TILE, 9, look));
    } else list.push(quad(x0, z0, x1, z1, -0.08, 8));
    bySurface.set(surface, list);
    if (b.kind === 'park') {
      // A cross of paths and a round plaza for the fountain.
      const c = BLOCK / 2;
      const w = PARK_PATH / 2;
      paths.push(quad(b.x + c - w, b.z + SIDEWALK, b.x + c + w, b.z + b.size - SIDEWALK, -0.07, 4));
      paths.push(quad(b.x + SIDEWALK, b.z + c - w, b.x + b.size - SIDEWALK, b.z + c + w, -0.07, 4));
      paths.push(disc(b.x + c, b.z + c, PARK_PLAZA, -0.065, 4));
    }
  }
  const field = city.airfield;
  // The countryside: one meadow all the way round and on to the horizon,
  // its colour drifting smoothly, and ploughed fields on top (the farther
  // ones only scenery).
  const scene = scenery(city);
  bySurface.set('meadow', [...(bySurface.get('meadow') ?? []), countryGrass(city)]);
  const fields = bySurface.get('field') ?? [];
  for (const f of [...city.fields, ...scene.fields]) fields.push(quad(f.x0, f.z0, f.x1, f.z1, -0.08, 8));
  bySurface.set('field', fields);

  for (const [surface, parts] of bySurface) {
    const m = flat(surfaces[surface], 0xffffff, 1);
    const mesh = layer(parts, GREEN.has(surface) ? unrepeat(m) : m, 1);
    if (mesh) group.add(mesh);
  }
  const pathMesh = layer(paths, flat(surfaces.plaza, 0xf3e6cc, 2), 2);
  if (pathMesh) group.add(pathMesh);
  for (const mesh of playMeshes(city.play)) group.add(mesh);
  if (city.port) {
    const q = city.port.quay;
    const quay = layer([quad(q.x0, q.z0, q.x1, q.z1, -0.07, 8)], flat(surfaces.concrete, 0xffffff, 2), 2);
    if (quay) group.add(quay);
  }

  // Roads, then their markings.
  const asphalt = tex(drawAsphalt);
  const roads: THREE.BufferGeometry[] = [];
  for (const r of city.roads) {
    roads.push(quad(-half, r - ROAD / 2, half, r + ROAD / 2, -0.05, 10));
    roads.push(quad(r - ROAD / 2, -half, r + ROAD / 2, half, -0.05, 10));
  }
  for (const r of city.countryRoads) roads.push(quad(r.x0, r.z0, r.x1, r.z1, -0.05, 10));
  // The middle roads run on out to the horizon on the green sides.
  for (const r of scene.roads) roads.push(quad(r.x0, r.z0, r.x1, r.z1, -0.05, 10));
  const roadMesh = layer(roads, flat(asphalt, 0xffffff, 3), 3);
  if (roadMesh) group.add(roadMesh);
  // Streets built over to join an arena to its car park (the airport's are
  // under its own field).
  const inField = (l: { x0: number; z0: number; x1: number; z1: number }) =>
    !!field && l.x0 >= field.area.x0 - 1 && l.x1 <= field.area.x1 + 1 && l.z0 >= field.area.z0 - 1 && l.z1 <= field.area.z1 + 1;
  const lots = city.lots.filter((l) => !inField(l)).map((l) => quad(l.x0, l.z0, l.x1, l.z1, -0.043, 8));
  const lotMesh = layer(lots, flat(surfaces.concrete, 0xffffff, 5), 5);
  if (lotMesh) group.add(lotMesh);

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
          const built = (px: number, pz: number) =>
            city.lots.some((l) => inRect(l, px, pz)) ||
            (!!field && px > field.area.x0 && px < field.area.x1 && pz > field.area.z0 && pz < field.area.z1);
          // No crossing on a built-over street, or leading into the airport.
          const reach = ROAD / 2 + 1;
          if (Math.abs(cx) < half - 1 && !built(cx, z + t) && !built(cx, z - reach) && !built(cx, z + reach)) white.push(quad(cx - 1.2, z + t, cx + 1.2, z + t + 0.9, -0.04, 4));
          if (Math.abs(cz) < half - 1 && !built(x + t, cz) && !built(x - reach, cz) && !built(x + reach, cz)) white.push(quad(x + t, cz - 1.2, x + t + 0.9, cz + 1.2, -0.04, 4));
        }
      }
    }
  }
  const whiteMesh = layer(white, flat(null, 0xf4f4f0, 4), 4);
  if (whiteMesh) group.add(whiteMesh);
  if (field) for (const mesh of airfieldMeshes(field, surfaces.meadow, surfaces.concrete, asphalt)) group.add(mesh);

  // A stone sea wall along each shore, standing out of the sea. Its top sits
  // below every ground layer (they run from -0.1 up to 0).
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.9 });
  const reach = (side: 'n' | 's' | 'e' | 'w') => (city.shores.includes(side) ? edgeOf : HORIZON);
  for (const side of city.shores) {
    const alongX = side === 'n' || side === 's';
    const [a0, a1] = alongX ? [-reach('w'), reach('e')] : [-reach('n'), reach('s')];
    const wall = new THREE.Mesh(new THREE.BoxGeometry(alongX ? a1 - a0 + 3 : 3, 3, alongX ? 3 : a1 - a0 + 3), wallMat);
    const out = side === 'n' || side === 'w' ? -edgeOf : edgeOf;
    wall.position.set(alongX ? (a0 + a1) / 2 : out, -1.75, alongX ? out : (a0 + a1) / 2);
    wall.receiveShadow = true;
    group.add(wall);
  }
  const woods = trees(scene.trees);
  if (woods) group.add(woods);
  const edgeMesh = boundary(city);
  if (edgeMesh) group.add(edgeMesh);

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
    if (l.kind === 'islet') extraGrass.push(sheet(l.x0, l.z0, l.x1, l.z1, -0.08, GRASS_TILE, 9));
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
  const isletMesh = layer(extraGrass, unrepeat(flat(surfaces.grass, 0xffffff, 1)), 1);
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
// Playgrounds and courts
// -------------------------------------------------------------------------

/** Set every vertex of a flat piece to one colour (the material's colour is white). */
function painted(g: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry {
  const c = g.attributes.color ?? new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3);
  for (let i = 0; i < c.count; i++) c.setXYZ(i, ...rgb);
  g.setAttribute('color', c);
  return g;
}

/** A flat ring (or half of one) round (x, z), for court lines. `half` is -1 or 1 for the side it bulges to (z), 0 for whole. */
function arc(x: number, z: number, r: number, width: number, y: number, half: -1 | 0 | 1): THREE.BufferGeometry {
  // Before the turn to lie flat, +y becomes -z: a start of 0 bulges to -z, of pi to +z.
  const g = new THREE.RingGeometry(r - width, r, 28, 1, half === 1 ? Math.PI : 0, half === 0 ? Math.PI * 2 : Math.PI);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return painted(g, [1, 1, 1]);
}

const RUBBER: [number, number, number] = [0.9, 0.47, 0.36];
const RUBBER_EDGE: [number, number, number] = [0.66, 0.31, 0.25];
const COURT: [number, number, number] = [0.27, 0.52, 0.74];
const KEY: [number, number, number] = [0.87, 0.47, 0.31];

/**
 * Soft play surfaces (rubber, with a darker edge) and basketball courts
 * (blue, orange keys, white lines, a hoop's three-point arc at each end).
 * Three meshes for all of them: the surfaces, the edges and keys, the lines.
 */
function playMeshes(areas: readonly PlayArea[]): THREE.Mesh[] {
  const base: THREE.BufferGeometry[] = [];
  const mid: THREE.BufferGeometry[] = [];
  const lines: THREE.BufferGeometry[] = [];
  const band = (list: THREE.BufferGeometry[], a: PlayArea, w: number, y: number, rgb: [number, number, number]) => {
    list.push(painted(quad(a.x0, a.z0, a.x1, a.z0 + w, y, 4), rgb));
    list.push(painted(quad(a.x0, a.z1 - w, a.x1, a.z1, y, 4), rgb));
    list.push(painted(quad(a.x0, a.z0 + w, a.x0 + w, a.z1 - w, y, 4), rgb));
    list.push(painted(quad(a.x1 - w, a.z0 + w, a.x1, a.z1 - w, y, 4), rgb));
  };
  for (const a of areas) {
    if (a.kind === 'soft') {
      base.push(painted(quad(a.x0, a.z0, a.x1, a.z1, -0.07, 4), RUBBER));
      band(mid, a, 0.5, -0.068, RUBBER_EDGE);
      continue;
    }
    base.push(painted(quad(a.x0, a.z0, a.x1, a.z1, -0.07, 4), COURT));
    const cx = (a.x0 + a.x1) / 2;
    const cz = (a.z0 + a.z1) / 2;
    // The boundary, the half-way line and the centre circle.
    band(lines, { ...a, x0: a.x0 + 0.4, z0: a.z0 + 0.4, x1: a.x1 - 0.4, z1: a.z1 - 0.4 }, 0.3, -0.066, [1, 1, 1]);
    lines.push(painted(quad(a.x0 + 0.4, cz - 0.15, a.x1 - 0.4, cz + 0.15, -0.066, 4), [1, 1, 1]));
    lines.push(arc(cx, cz, 1.8, 0.3, -0.066, 0));
    // At each end: the key, and the three-point arc round the hoop.
    for (const end of [-1, 1] as const) {
      const z = end < 0 ? a.z0 + 0.4 : a.z1 - 0.4;
      const z2 = z - end * 5.2;
      mid.push(painted(quad(cx - 2, Math.min(z, z2), cx + 2, Math.max(z, z2), -0.068, 4), KEY));
      lines.push(arc(cx, z - end * 1.2, 4.4, 0.3, -0.066, end < 0 ? 1 : -1));
    }
  }
  const out = [layer(base, flat(null, 0xffffff, 2), 2), layer(mid, flat(null, 0xffffff, 3), 3), layer(lines, flat(null, 0xf4f4f0, 4), 4)];
  return out.filter((m): m is THREE.Mesh => m !== null);
}

// -------------------------------------------------------------------------
// Scenery past the edge of play
// -------------------------------------------------------------------------

/**
 * What stands on the green beyond the edge of play, near enough to see:
 * ploughed fields, clumps of trees, and the middle roads running on to the
 * horizon. Scenery only (nothing to eat), from a seeded random, the same
 * every time for a map.
 */
export function scenery(city: City): { fields: Box[]; trees: Array<{ x: number; z: number; s: number }>; roads: Box[] } {
  const { land, shores } = city;
  const mid = city.roads[Math.floor(city.blocks / 2)];
  const roads: Box[] = [];
  if (!shores.includes('n')) roads.push({ x0: mid - ROAD / 2, z0: -HORIZON, x1: mid + ROAD / 2, z1: -land });
  if (!shores.includes('s')) roads.push({ x0: mid - ROAD / 2, z0: land, x1: mid + ROAD / 2, z1: HORIZON });
  if (!shores.includes('w')) roads.push({ x0: -HORIZON, z0: mid - ROAD / 2, x1: -land, z1: mid + ROAD / 2 });
  if (!shores.includes('e')) roads.push({ x0: land, z0: mid - ROAD / 2, x1: HORIZON, z1: mid + ROAD / 2 });
  const far = land + 520;
  /** On the green past the edge of play, off the roads. */
  const open = (x: number, z: number, pad: number) => {
    if (Math.abs(x) < land + 12 + pad && Math.abs(z) < land + 12 + pad) return false;
    if ((x < -land && shores.includes('w')) || (x > land && shores.includes('e')) || (z < -land && shores.includes('n')) || (z > land && shores.includes('s'))) return false;
    return !inside(roads, x, z, 8 + pad);
  };
  const r = seededRng(city.blocks * 7919 + Math.round(land));
  const at = () => -far + r() * far * 2;
  const fields: Box[] = [];
  for (let i = 0; i < 260 && fields.length < 56; i++) {
    const x = at();
    const z = at();
    const w = 24 + r() * 20;
    const d = 20 + r() * 16;
    const f = { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
    const clear = [
      [f.x0, f.z0],
      [f.x1, f.z0],
      [f.x0, f.z1],
      [f.x1, f.z1],
    ].every(([px, pz]) => open(px, pz, 0));
    const apart = fields.every((o) => f.x1 + 6 < o.x0 || o.x1 + 6 < f.x0 || f.z1 + 6 < o.z0 || o.z1 + 6 < f.z0);
    if (clear && apart) fields.push(f);
  }
  const trees: Array<{ x: number; z: number; s: number }> = [];
  for (let i = 0; i < 420; i++) {
    const cx = at();
    const cz = at();
    if (!open(cx, cz, 0)) continue;
    const n = 6 + Math.floor(r() * 10);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 30;
      const z = cz + (r() - 0.5) * 30;
      const onField = inside(fields, x, z, 2);
      if (open(x, z, 2) && !onField) trees.push({ x, z, s: 0.8 + r() * 0.7 });
    }
  }
  return { fields, trees, roads };
}

/**
 * The edge of play on the green sides: where the hedge runs (in stretches
 * along each side, `a` measured along it) and where the gates stand, one
 * where each middle road goes through. Sea sides have none: the sea wall is
 * the edge there.
 */
export function edgeOfPlay(city: City): { hedges: Array<{ side: Side; a0: number; a1: number }>; gates: Array<{ side: Side; at: number }> } {
  const { land, shores } = city;
  const mid = city.roads[Math.floor(city.blocks / 2)];
  const gap = ROAD / 2 + 2;
  const hedges: Array<{ side: Side; a0: number; a1: number }> = [];
  const gates: Array<{ side: Side; at: number }> = [];
  for (const side of ['n', 's', 'e', 'w'] as const) {
    if (shores.includes(side)) continue;
    hedges.push({ side, a0: -land, a1: mid - gap }, { side, a0: mid + gap, a1: land });
    gates.push({ side, at: mid });
  }
  return { hedges, gates };
}

const HEDGE: Array<[number, number, number]> = [
  [0.2, 0.5, 0.22],
  [0.24, 0.56, 0.25],
  [0.18, 0.45, 0.2],
];
const RAIL: [number, number, number] = [0.93, 0.9, 0.84];
const PILLAR: [number, number, number] = [0.84, 0.8, 0.72];

/**
 * The edge of play drawn: a low hedge standing on the line itself, a white
 * post-and-rail fence just outside it, and at each road a pair of stone
 * pillars with the gates swung open outwards. One mesh; scenery, not food.
 */
function boundary(city: City): THREE.Mesh | null {
  const { land } = city;
  const { hedges, gates } = edgeOfPlay(city);
  if (!hedges.length) return null;
  const parts: THREE.BufferGeometry[] = [];
  const r = seededRng(Math.round(land) * 31 + city.blocks);
  /** A box given along the side (a), out from the line (o) and up (y), for a side. */
  const box = (side: Side, a: number, o: number, y: number, la: number, lo: number, h: number, rgb: [number, number, number]) => {
    const out = side === 'e' || side === 's' ? 1 : -1;
    const alongX = side === 'n' || side === 's';
    const c = out * (land + o);
    const g = new THREE.BoxGeometry(alongX ? la : lo, h, alongX ? lo : la);
    g.translate(alongX ? a : c, y + h / 2, alongX ? c : a);
    parts.push(painted(g, rgb));
  };
  for (const { side, a0, a1 } of hedges) {
    // The hedge in clipped lengths of a few units, each a shade and a height of its own.
    for (let a = a0; a < a1 - 0.5; ) {
      const len = Math.min(a1 - a, 3 + r() * 5);
      const h = 1.0 + r() * 0.4;
      const rgb = HEDGE[Math.floor(r() * HEDGE.length)];
      box(side, a + len / 2, 0, 0, len + 0.05, 1.6, h, rgb);
      // A narrower, lighter top, so it reads clipped and soft rather than a slab.
      box(side, a + len / 2, 0, h, len + 0.05, 1.1, 0.3, [rgb[0] * 1.15, rgb[1] * 1.15, rgb[2] * 1.1]);
      a += len;
    }
    // Posts and two rails a step outside it.
    for (let a = a0 + 0.2; a <= a1; a += 3.2) box(side, a, 1.6, 0, 0.26, 0.26, 1.15, RAIL);
    for (const y of [0.45, 0.9]) box(side, (a0 + a1) / 2, 1.6, y, a1 - a0, 0.12, 0.12, RAIL);
  }
  for (const { side, at } of gates) {
    for (const s of [-1, 1]) {
      const a = at + s * (ROAD / 2 + 1.4);
      box(side, a, 0, 0, 1.3, 1.3, 2.3, PILLAR);
      box(side, a, 0, 2.3, 1.6, 1.6, 0.25, PILLAR);
      // The gate, swung open outwards along the road: a frame of rails.
      for (const y of [0.35, 1.25]) box(side, a - s * 0.3, 3.3, y, 0.12, 5.2, 0.14, RAIL);
      box(side, a - s * 0.3, 5.8, 0.15, 0.16, 0.16, 1.3, RAIL);
    }
  }
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The scenery's trees: one instanced mesh of low pines, casting no shadow. */
function trees(list: ReadonlyArray<{ x: number; z: number; s: number }>): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const trunk = painted(new THREE.CylinderGeometry(0.3, 0.36, 1.4, 6).translate(0, 0.7, 0), [0.45, 0.31, 0.2]);
  const low = painted(new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 2.8, 0), [0.24, 0.55, 0.3]);
  const top = painted(new THREE.ConeGeometry(1.25, 2.8, 7).translate(0, 4.6, 0), [0.28, 0.62, 0.34]);
  const geo = mergeGeometries([trunk, low, top]);
  for (const g of [trunk, low, top]) g.dispose();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), list.length);
  const m = new THREE.Matrix4();
  list.forEach((t, i) => mesh.setMatrixAt(i, m.makeScale(t.s, t.s, t.s).setPosition(t.x, 0, t.z)));
  mesh.computeBoundingSphere();
  return mesh;
}

// -------------------------------------------------------------------------
// The airport's field
// -------------------------------------------------------------------------

type Box = { x0: number; z0: number; x1: number; z1: number };

/** Seven-segment digits: which of a b c d e f g each one lights. */
const DIGIT: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

/**
 * The runway's white paint, as rectangles on the map: edge lines, the
 * threshold stripes and the runway's number at each end (read by a pilot
 * coming in to land there), and the dashed centreline between.
 */
export function runwayMarks(f: Airfield): Box[] {
  const r = f.runway;
  const alongX = f.along === 'x';
  const [A0, A1, C0, C1] = alongX ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
  const cm = (C0 + C1) / 2;
  const out: Box[] = [];
  /** A rectangle given along the runway (a) and across it (c). */
  const put = (a0: number, a1: number, c0: number, c1: number) =>
    out.push(alongX ? { x0: Math.min(a0, a1), x1: Math.max(a0, a1), z0: Math.min(c0, c1), z1: Math.max(c0, c1) } : { x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: Math.min(a0, a1), z1: Math.max(a0, a1) });
  // Edge lines.
  put(A0 + 0.6, A1 - 0.6, C0 + 0.6, C0 + 1.3);
  put(A0 + 0.6, A1 - 0.6, C1 - 1.3, C1 - 0.6);
  // Centreline dashes, clear of the numbers.
  for (let a = A0 + 25; a + 5 <= A1 - 25; a += 9) put(a, a + 5, cm - 0.35, cm + 0.35);
  // Each end: seen from the approach, `up` points down the runway, `right` to the pilot's right.
  // North is -z: a runway along x reads 09 from its west end and 27 from its east;
  // one along z reads 18 from its north end and 36 from its south.
  const ends: Array<{ start: number; dir: 1 | -1; num: string }> = alongX
    ? [
        { start: A0, dir: 1, num: '09' },
        { start: A1, dir: -1, num: '27' },
      ]
    : [
        { start: A0, dir: 1, num: '18' },
        { start: A1, dir: -1, num: '36' },
      ];
  for (const { start, dir, num } of ends) {
    const at = (d: number) => start + dir * d;
    // Threshold stripes, three each side of the middle.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) put(at(2), at(10), cm + side * (1 + k * 2), cm + side * (2.2 + k * 2));
    }
    // The number: 4 wide, 7 long digits, strokes 0.9, from 13 to 20 in.
    const upX = alongX ? dir : 0;
    const upZ = alongX ? 0 : dir;
    const rightX = -upZ;
    const rightZ = upX;
    const [W, H, t] = [4, 7, 0.9];
    const seg: Record<string, [number, number, number, number]> = {
      a: [0, W, H - t, H],
      b: [W - t, W, H / 2, H],
      c: [W - t, W, 0, H / 2],
      d: [0, W, 0, t],
      e: [0, t, 0, H / 2],
      f: [0, t, H / 2, H],
      g: [0, W, (H - t) / 2, (H + t) / 2],
    };
    [...num].forEach((ch, i) => {
      const left = i === 0 ? -W - 0.6 : 0.6;
      for (const s of DIGIT[ch]) {
        const [r0, r1, h0, h1] = seg[s];
        const pts = [
          [r0, h0],
          [r1, h1],
        ].map(([rr, hh]) => {
          const across = left + rr;
          const down = 13 + hh;
          // Along the runway `down` in from the end; across it `across` to the right.
          const x = (alongX ? at(down) : cm) + across * rightX;
          const z = (alongX ? cm : at(down)) + across * rightZ;
          return [x, z];
        });
        out.push({ x0: Math.min(pts[0][0], pts[1][0]), x1: Math.max(pts[0][0], pts[1][0]), z0: Math.min(pts[0][1], pts[1][1]), z1: Math.max(pts[0][1], pts[1][1]) });
      }
    });
  }
  return out;
}

/**
 * The airport's ground, over its built-over streets: grass, the concrete
 * apron, the runway (darker), taxiways and the train's track bed, then the
 * paint and the sleepers, then the rails. Five meshes.
 */
function airfieldMeshes(f: Airfield, grass: THREE.Texture, concrete: THREE.Texture, asphalt: THREE.Texture): THREE.Mesh[] {
  const tint = (g: THREE.BufferGeometry, rgb: [number, number, number]) => {
    const c = g.attributes.color;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, ...rgb);
    return g;
  };
  const a = f.area;
  // The shuttle track: a gravel bed, sleepers across it, two steel rails.
  const t = f.track;
  const alongX = t.x1 - t.x0 > t.z1 - t.z0;
  const [t0, t1, c] = alongX ? [t.x0, t.x1, (t.z0 + t.z1) / 2] : [t.z0, t.z1, (t.x0 + t.x1) / 2];
  /** A strip given along the track (a0..a1) and across it (c0..c1). */
  const strip = (a0: number, a1: number, c0: number, c1: number, y: number) =>
    alongX ? quad(a0, c + c0, a1, c + c1, y, 4) : quad(c + c0, a0, c + c1, a1, y, 4);
  const sleepers: THREE.BufferGeometry[] = [];
  for (let s = t0 + 0.4; s < t1 - 0.4; s += 1.4) sleepers.push(tint(strip(s, s + 0.55, -1.35, 1.35, -0.038), [0.46, 0.34, 0.25]));
  const rails = [-0.75, 0.75].map((o) => tint(strip(t0, t1, o - 0.12, o + 0.12, -0.036), [0.78, 0.8, 0.84]));
  const out: Array<THREE.Mesh | null> = [
    layer([sheet(a.x0 + 0.5, a.z0 + 0.5, a.x1 - 0.5, a.z1 - 0.5, -0.042, GRASS_TILE, 9)], unrepeat(flat(grass, 0xffffff, 5)), 5),
    layer([quad(f.apron.x0, f.apron.z0, f.apron.x1, f.apron.z1, -0.041, 8)], flat(concrete, 0xffffff, 6), 6),
    layer(
      [
        tint(quad(f.runway.x0, f.runway.z0, f.runway.x1, f.runway.z1, -0.04, 10), [0.7, 0.7, 0.74]),
        ...f.taxiways.map((w) => quad(w.x0, w.z0, w.x1, w.z1, -0.04, 10)),
        tint(quad(t.x0, t.z0, t.x1, t.z1, -0.04, 10), [0.82, 0.76, 0.66]),
      ],
      flat(asphalt, 0xffffff, 7),
      7,
    ),
    layer(
      [
        ...runwayMarks(f).map((m) => quad(m.x0, m.z0, m.x1, m.z1, -0.038, 4)),
        ...f.lines.map((m) => tint(quad(m.x0, m.z0, m.x1, m.z1, -0.038, 4), [1, 0.78, 0.16])),
        ...sleepers,
      ],
      flat(null, 0xf4f4f0, 8),
      8,
    ),
    layer(rails, flat(null, 0xffffff, 9), 9),
  ];
  return out.filter((m): m is THREE.Mesh => m !== null);
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
  // Soft patches of every size, scattered at random, then fine speckle. A
  // patch over the texture's edge is drawn again on the far side, each copy
  // with its own gradient: a gradient belongs to where it was made, so one
  // shared gradient left the copies blank and cut every edge patch straight
  // across, which showed as hard lines where the texture repeats.
  const rnd = seededRng(salt * 313);
  // Fading to the same green, not to transparent black, so a patch has no
  // dark rim round it.
  const n = parseInt(dark.slice(1), 16);
  const clear = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`;
  for (let i = 0; i < 40; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = 14 + rnd() * 60;
    for (const dx of [-s, 0, s]) {
      for (const dy of [-s, 0, s]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + r < 0 || cx - r > s || cy + r < 0 || cy - r > s) continue;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, dark);
        grad.addColorStop(1, clear);
        g.fillStyle = grad;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }
  speckle(g, s, 1600, 'rgba(255,255,255,0.08)', 2, salt * 2 + 3);
  speckle(g, s, 1600, 'rgba(0,60,0,0.08)', 2, salt * 2 + 4);
}

/** Car-park tarmac with white bays across it. */
function drawParking(g: CanvasRenderingContext2D, s: number): void {
  drawAsphalt(g, s);
  g.fillStyle = 'rgba(245,245,240,0.85)';
  // Eight units of tarmac: bays 2.7 wide down each side, a clear aisle between.
  for (let i = 0; i < 3; i++) {
    const x = (i * s) / 3;
    g.fillRect(x, 0, 3, s * 0.36);
    g.fillRect(x, s * 0.64, 3, s * 0.36);
  }
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
