/**
 * Image-generated ship meshes, and the details that make them read at board
 * scale.
 *
 * The hulls come from an image-to-3D model, optimised down to a few thousand
 * triangles (`npm run glb`). They arrive as bare geometry — no UVs, no
 * textures, no colour — which is exactly what this game wants, because each
 * player's fleet is tinted with their skin colour. A baked texture would
 * freeze one grey hull into the mesh and make the six fleet skins pointless.
 *
 * So everything on top of the geometry is generated here, in code:
 *
 * - **Deck markings** — a canvas-drawn decal laid just above the flight deck.
 *   Seen from the battle camera the deck is the biggest surface on the board
 *   and, untextured, a carrier is an anonymous white slab. The markings are
 *   drawn as translucent paint so the skin tint still shows through.
 * - **Night lights** — small emissive points along the deck edge and at the
 *   masthead. They cost nothing, they survive any tint because they're
 *   emissive rather than coloured, and on dark water a few glowing pixels do
 *   more to sell a ship than any amount of hull detail.
 *
 * No runtime downloads: the .glb is imported so Vite hashes it into `dist/`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { ShipId } from '@games/battleship/domain/types';
import carrierUrl from '@games/battleship/assets/ships/modern/carrier.glb';

/**
 * Per-ship placement. The meshes come out of the generator in their own
 * orientation and scale, so each needs to be told which way is forward and
 * how deep it floats. `yaw` turns the model's long axis onto the board's +x;
 * `sink` is in cells, applied after scaling.
 */
interface ModelSpec {
  url: string;
  /** Radians about Y to bring the bow to +x. */
  yaw: number;
  /** Fraction of hull height left below the waterline. */
  sink: number;
  /**
   * Where the working deck sits, as a fraction of the model's total height.
   * This is NOT the top of the bounding box — that's the masthead. Deck paint
   * and running lights hang off this, so getting it wrong floats them in the
   * air above the ship.
   */
  deckFrac: number;
}

const SPECS: Partial<Record<ShipId, ModelSpec>> = {
  carrier: { url: carrierUrl, yaw: -Math.PI / 2, sink: 0.28, deckFrac: 0.46 },
};

const cache = new Map<ShipId, THREE.Group>();

/**
 * Load every available ship mesh once. Resolves when all have arrived (or
 * failed) so the caller can rebuild the fleet with real hulls.
 */
export async function loadShipModels(): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const ids = Object.keys(SPECS) as ShipId[];
  await Promise.all(
    ids.map(async (id) => {
      if (cache.has(id)) return;
      const spec = SPECS[id];
      if (!spec) return;
      try {
        const gltf = await loader.loadAsync(spec.url);
        cache.set(id, gltf.scene);
      } catch {
        // A missing or corrupt model must never take the scene down: the
        // caller falls back to procedural geometry for this hull.
      }
    }),
  );
}

/**
 * A board-ready instance of a ship, or null if its mesh isn't loaded.
 *
 * The model is normalised into the same convention the procedural ships use:
 * length along +x, centred on its cell span, waterline at y = 0.
 */
export function buildModelShip(
  id: ShipId,
  size: number,
  sunk: boolean,
  skinColor: string,
): THREE.Group | null {
  const source = cache.get(id);
  const spec = SPECS[id];
  if (!source || !spec) return null;

  const model = source.clone(true);
  model.rotation.y = spec.yaw;

  // Measure after the yaw so "length" is the board's x axis.
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  if (dims.x <= 0 || dims.y <= 0) return null;

  const target = size - 0.24; // match the procedural hulls' clearance
  const scale = target / dims.x;

  const hull = new THREE.Group();
  hull.add(model);
  hull.scale.setScalar(scale);

  // Re-centre on the cell span and float the hull at the waterline.
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  model.position.y += dims.y * (0.5 - spec.sink);

  const tint = new THREE.Color(skinColor);
  const body = new THREE.MeshStandardMaterial({
    // Match the procedural hulls' haze grey, pulled slightly toward the fleet
    // colour so two navies differ without the ships turning into toys. Keep
    // this in step with buildWarship's hullMat or the fleet looks mismatched.
    color: new THREE.Color(sunk ? '#3c4450' : '#93a0ae').lerp(tint, sunk ? 0.05 : 0.12),
    roughness: 0.62,
    metalness: 0.2,
    flatShading: true, // the hulls are low-poly; smooth shading reads as melted
  });
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = body;
  });

  // Deck height, measured rather than guessed: fire rays straight down at a
  // few points along the hull and take the highest surface that isn't the
  // island. A fraction-of-height guess doesn't survive five different ships.
  const deckY = measureDeckY(model, dims) ?? dims.y * (spec.deckFrac - spec.sink);
  if (!sunk) {
    hull.add(buildDeckDecal(id, dims.x, dims.z, deckY, skinColor));
    hull.add(buildNightLights(dims.x, dims.y, dims.z, deckY, skinColor));
  }

  return hull;
}

/**
 * Find the working deck by raycasting down onto the hull.
 *
 * Sampling several points along the centreline and taking the *median* hit
 * ignores the island and the masts (a couple of tall outliers) while still
 * landing on the real deck surface. Returns null if nothing is hit, in which
 * case the caller falls back to the spec's rough fraction.
 *
 * `model` is already centred on the origin, so hits come back in the same
 * space the decal and lights are placed in.
 */
function measureDeckY(model: THREE.Object3D, dims: THREE.Vector3): number | null {
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const hits: number[] = [];

  for (let i = 0; i < 9; i++) {
    const x = (i / 8 - 0.5) * dims.x * 0.8;
    raycaster.set(new THREE.Vector3(x, dims.y * 2, 0), down);
    const hit = raycaster.intersectObject(model, true)[0];
    if (hit) hits.push(hit.point.y);
  }
  if (hits.length === 0) return null;

  hits.sort((a, b) => a - b);
  return hits[Math.floor(hits.length / 2)];
}

/** Reusable canvas → texture, one per ship type (they never change). */
const decalTextures = new Map<ShipId, THREE.Texture>();

/**
 * Deck markings, drawn to a canvas rather than shipped as an image: zero
 * bytes in the bundle, crisp at any zoom, deterministic, and re-tintable.
 */
function deckTexture(id: ShipId, skinColor: string): THREE.Texture {
  const existing = decalTextures.get(id);
  if (existing) return existing;

  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, W, H);

  if (id === 'carrier') {
    // Angled landing strip, running bow-left to stern-right across the deck.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#f2f6ff';
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 20]);
    ctx.beginPath();
    ctx.moveTo(W * 0.08, H * 0.62);
    ctx.lineTo(W * 0.86, H * 0.36);
    ctx.stroke();

    // The strip's solid edges.
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 3;
    for (const off of [-30, 30]) {
      ctx.beginPath();
      ctx.moveTo(W * 0.08, H * 0.62 + off);
      ctx.lineTo(W * 0.86, H * 0.36 + off);
      ctx.stroke();
    }

    // Bow catapult tracks.
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = 3;
    for (const y of [H * 0.34, H * 0.5]) {
      ctx.beginPath();
      ctx.moveTo(W * 0.06, y);
      ctx.lineTo(W * 0.4, y - 8);
      ctx.stroke();
    }

    // Touchdown target in the fleet colour — the one spot of skin on the deck.
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(W * 0.66, H * 0.44, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  decalTextures.set(id, texture);
  return texture;
}

/** A transparent plane carrying the deck paint, floated just over the deck. */
function buildDeckDecal(
  id: ShipId,
  lengthX: number,
  widthZ: number,
  deckY: number,
  skinColor: string,
): THREE.Mesh {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(lengthX * 0.94, widthZ * 0.9),
    new THREE.MeshBasicMaterial({
      map: deckTexture(id, skinColor),
      transparent: true,
      depthWrite: false,
      // Without this the decal fights the deck for the same depth and flickers.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = deckY + 0.004;
  return plane;
}

/**
 * Deck-edge running lights and a masthead lamp. Emissive points, so they glow
 * under bloom and stay visible when the whole ship is only a few hundred
 * pixels wide.
 */
function buildNightLights(
  lengthX: number,
  heightY: number,
  widthZ: number,
  deckY: number,
  skinColor: string,
): THREE.Points {
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = new THREE.Color(skinColor);
  const warm = new THREE.Color('#ffe6b0');

  const perSide = 9;
  for (let i = 0; i < perSide; i++) {
    const t = (i + 0.5) / perSide;
    const x = -lengthX / 2 + t * lengthX;
    for (const side of [-1, 1]) {
      positions.push(x, deckY + 0.01, side * widthZ * 0.46);
      // Alternate skin-coloured and warm lamps so the run isn't monotonous.
      const c = i % 3 === 0 ? tint : warm;
      colors.push(c.r, c.g, c.b);
    }
  }
  // Masthead light, above the tallest point.
  positions.push(lengthX * 0.06, heightY * 0.98, 0);
  colors.push(1, 0.86, 0.7);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
}
