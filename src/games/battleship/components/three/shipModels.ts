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
 *
 * No runtime downloads: the .glb is imported so Vite hashes it into `dist/`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { ShipId } from '@games/battleship/domain/types';
import carrierBlenderUrl from '@games/battleship/assets/ships/modern/carrier-blender.glb';
import battleshipBlenderUrl from '@games/battleship/assets/ships/modern/battleship-blender.glb';

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
  /**
   * Deck paint as SVG source, traced from the ship's top view. Groups carry
   * the ids `deck`, `markings` and `team`, which are recoloured here before
   * rasterising — so the deck grey is set in code, not baked by the artist,
   * and the hull number takes the player's fleet colour.
   *
   * Vector rather than raster because the paint is stretched across a hull
   * several board-cells long: a traced PNG's hard edges staircase on every
   * diagonal, and nothing downstream recovers detail that was never sampled.
   */
  deckSvg?: string;
  /**
   * Hand-authored in Blender rather than generated from an image.
   *
   * These arrive as finished game assets — named nodes, their own materials,
   * real UVs, textures — so none of the machinery built for generated meshes
   * applies. No material override, no projected deck decal, no height-banded
   * shading: all of that existed to fake detail the generator couldn't
   * provide, and here it would paint over work the artist already did.
   */
  authored?: boolean;
  /** Material whose colour follows the player's fleet skin. */
  teamMaterial?: string;
}

const SPECS: Partial<Record<ShipId, ModelSpec>> = {
  carrier: {
    url: carrierBlenderUrl,
    yaw: 0, // authored bow-along-x already
    sink: 0.18,
    deckFrac: 0.46,
    authored: true,
    teamMaterial: 'Carrier Team Paint',
  },
  battleship: {
    url: battleshipBlenderUrl,
    yaw: 0,
    sink: 0.18,
    deckFrac: 0.46,
    authored: true,
    teamMaterial: 'Battleship Boot Stripe',
  },
};

/** Dark grey non-skid. The decal skips tone mapping, so this is what shows. */
const DECK_GREY = '#3b4048';
const DECK_MARKINGS = '#e8edf5';

/** Rasterised width. The deck is the largest flat surface the camera sees. */
const DECK_RASTER_W = 2048;

const cache = new Map<ShipId, THREE.Group>();

/**
 * Load every available ship mesh once. Resolves when all have arrived (or
 * failed) so the caller can rebuild the fleet with real hulls.
 */
export async function loadShipModels(skinColor: string): Promise<void> {
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
      if (spec.deckSvg && !deckPaintImages.has(id)) {
        try {
          deckPaintImages.set(id, await rasteriseDeckSvg(spec.deckSvg, skinColor));
        } catch {
          // Falls back to canvas-drawn markings.
        }
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
  withDeckPaint = true,
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

  // Re-centre on the cell span and float the hull at the waterline.
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  model.position.y += dims.y * (0.5 - spec.sink);

  // Everything below is measured by raycast, and a Raycaster works in world
  // space. Measure now, while the model is still parentless and unscaled, so
  // hits come back in the same units the decal and lights are placed in —
  // measuring after parenting it to the scaled group returned values ~5x too
  // large and floated the whole lot above the ship.
  model.updateMatrixWorld(true);

  if (spec.authored) {
    // Keep everything the artist made; only the team stripe follows the skin.
    const restyle = (m: THREE.Material): THREE.Material => {
      const std = m as THREE.MeshStandardMaterial;
      const isTeam = spec.teamMaterial !== undefined && m.name === spec.teamMaterial;
      if (!isTeam && !sunk) return m; // leave the artist's material untouched
      const next = std.clone();
      if (isTeam) next.color = new THREE.Color(skinColor);
      if (sunk && next.color) next.color = next.color.clone().multiplyScalar(0.45);
      return next;
    };

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      // Preserve arity: handing a single-material mesh an array of one makes
      // it render nothing, because three only uses arrays with geometry groups.
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(restyle)
        : restyle(mesh.material);
    });

    const hullAuthored = new THREE.Group();
    hullAuthored.add(model);
    hullAuthored.scale.setScalar(scale);
    return hullAuthored;
  }

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
  body.vertexColors = true;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = body;
  });
  shadeByHeight(model, dims);

  // Deck height, measured rather than guessed: fire rays straight down at a
  // few points along the hull and take the highest surface that isn't the
  // island. A fraction-of-height guess doesn't survive five different ships.
  const deckY = measureDeckY(model, dims) ?? dims.y * (spec.deckFrac - spec.sink);

  // Assemble only after measuring: adding the model to a scaled parent first
  // is what threw the raycast results off.
  const hull = new THREE.Group();
  hull.add(model);
  hull.scale.setScalar(scale);
  if (!sunk && withDeckPaint) hull.add(buildDeckDecal(id, dims.x, dims.z, deckY, skinColor));

  return hull;
}

/**
 * Give the superstructure its own tone, from height alone.
 *
 * The mesh is one fused object with no UVs and no material groups, so there is
 * nothing to texture the island with. But height is enough to tell the parts
 * apart: hull, island, and the radome capping the mast. Writing that into
 * vertex colours — which multiply the base colour — keeps the fleet tint
 * working while giving the island the separation it needs to read as a
 * structure rather than a lump on the deck.
 *
 * Values are relative to the hull, so this stays correct for any ship.
 */
function shadeByHeight(model: THREE.Object3D, dims: THREE.Vector3): void {
  const box = new THREE.Box3().setFromObject(model);
  const lowY = box.min.y;
  const height = Math.max(dims.y, 1e-6);

  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position) return;

    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const t = (position.getY(i) - lowY) / height;

      // Bands taken from the mesh's actual vertex distribution, not guessed:
      // the hull's bulk sits below 0.40 (the spike at 0.25–0.30 is the deck
      // plate), the island runs 0.50–0.80, and there's a distinct cluster at
      // 0.85–0.95 — the radome.
      let shade: number;
      if (t < 0.42) shade = 1.0; // hull
      else if (t < 0.84) shade = 0.74; // island — clearly darker so it reads
      else if (t < 0.96) shade = 1.55; // the radar ball, the brightest thing aboard
      else shade = 0.86; // antenna above it

      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  });
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

/** Decoded deck-paint images, keyed by ship. Populated by loadShipModels(). */
const deckPaintImages = new Map<ShipId, HTMLImageElement>();

/**
 * A composited deck-paint texture plus where its paint actually sits in the
 * image, as fractions of the image (0–1). The paint never fills its canvas, so
 * the plane has to be sized and offset by these or the deck lands crooked.
 */
interface DeckPaint {
  texture: THREE.Texture;
  /** Bounds of the non-transparent paint: [minU, minV, maxU, maxV]. */
  bounds: [number, number, number, number];
}

const deckPaintCache = new Map<string, DeckPaint>();

/**
 * Recolour the deck SVG by group id, then rasterise it.
 *
 * The artist ships placeholder colours; the real values live here so the deck
 * grey can be tuned without re-exporting art, and so the hull number can take
 * each player's fleet colour. Rasterising through a data URL keeps it offline:
 * nothing is fetched, and the browser's own rasteriser does the antialiasing
 * that a traced PNG could never have.
 */
async function rasteriseDeckSvg(svg: string, skinColor: string): Promise<HTMLImageElement> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;

  const paint = (id: string, colour: string) => {
    const group = doc.getElementById(id);
    if (!group) return;
    for (const node of [group, ...Array.from(group.querySelectorAll('*'))]) {
      const el = node as SVGElement;
      if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') {
        el.setAttribute('fill', colour);
      }
      if (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
        el.setAttribute('stroke', colour);
      }
    }
  };

  paint('deck', DECK_GREY);
  paint('markings', DECK_MARKINGS);
  paint('team', skinColor);

  // Size the raster off the viewBox so the aspect ratio is the artwork's.
  const [, , vbW, vbH] = (root.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
  const width = DECK_RASTER_W;
  const height = Math.max(1, Math.round((DECK_RASTER_W * vbH) / vbW));
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));

  const serialised = new XMLSerializer().serializeToString(doc);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialised)}`;

  const image = new Image();
  image.width = width;
  image.height = height;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('deck svg failed to rasterise'));
    image.src = url;
  });
  return image;
}

/**
 * A little non-skid grain, so the deck isn't a dead flat fill.
 *
 * Seeded, because the architecture requires anything that affects appearance
 * to be deterministic — the same ship must look the same in every session and
 * in every screenshot diff.
 */
function addNonSkidGrain(px: Uint8ClampedArray): void {
  let seed = 0x5f3a71;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const n = (next() - 0.5) * 14;
    px[i] = Math.max(0, Math.min(255, px[i] + n));
    px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + n));
    px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + n));
  }
}

/**
 * Rasterised deck paint, ready to lay on the hull.
 *
 * The SVG arrives already recoloured and antialiased, so this only adds the
 * non-skid grain and measures where the paint actually sits in the image —
 * the artwork never fills its canvas exactly, and the plane has to be sized
 * and offset by that or the deck lands crooked.
 */
function compositeDeckPaint(id: ShipId, skinColor: string): DeckPaint | null {
  const key = `${id}:${skinColor}`;
  const cached = deckPaintCache.get(key);
  if (cached) return cached;

  const image = deckPaintImages.get(id);
  if (!image) return null;

  const W = image.naturalWidth || image.width;
  const H = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, W, H);

  const src = ctx.getImageData(0, 0, W, H);
  const px = src.data;
  addNonSkidGrain(px);

  // Half coverage, not "any coverage": antialiased edges throw a faint halo
  // past the real outline, and measuring that would oversize the plane.
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] <= 127) continue;
    const p = i / 4;
    const x = p % W;
    const y = (p / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  ctx.putImageData(src, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // Laying the plane flat (rotate -90° about X) reverses its V axis relative
  // to the board's +z, so the paint comes out mirrored across the ship's long
  // axis — port markings on the starboard side, and the hull number reversed.
  // U is already correct: the artwork's bow-left lands on the hull's bow.
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.y = -1;
  texture.offset.y = 1;
  texture.anisotropy = 8; // the deck is viewed at a grazing angle from the board
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const paint: DeckPaint =
    maxX < 0
      ? { texture, bounds: [0, 0, 1, 1] }
      : { texture, bounds: [minX / W, minY / H, (maxX + 1) / W, (maxY + 1) / H] };
  deckPaintCache.set(key, paint);
  return paint;
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
    // The deck itself is near-black non-skid, not bare metal — see
    // references/carrier-modern-top.png. Only the catwalks and island stay
    // haze grey, so the paint is what carries the whole read from above.
    // Bow at -x (left of the canvas), stern at +x.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W * 0.03, H * 0.5); // bow point
    ctx.lineTo(W * 0.16, H * 0.24);
    ctx.lineTo(W * 0.62, H * 0.17);
    ctx.lineTo(W * 0.97, H * 0.2);
    ctx.lineTo(W * 0.97, H * 0.8);
    ctx.lineTo(W * 0.55, H * 0.85);
    ctx.lineTo(W * 0.16, H * 0.76);
    ctx.closePath();
    ctx.fillStyle = '#23262c';
    ctx.fill();

    // The angled landing area, a shade lighter where it overlays the deck.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#2b2f36';
    ctx.beginPath();
    ctx.moveTo(W * 0.2, H * 0.78);
    ctx.lineTo(W * 0.52, H * 0.2);
    ctx.lineTo(W * 0.98, H * 0.2);
    ctx.lineTo(W * 0.98, H * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#e8edf5';
    ctx.lineCap = 'butt';

    // Landing-strip centreline, dashed, running up the angled deck.
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 5;
    ctx.setLineDash([24, 18]);
    ctx.beginPath();
    ctx.moveTo(W * 0.24, H * 0.74);
    ctx.lineTo(W * 0.95, H * 0.31);
    ctx.stroke();

    // Its solid edge lines.
    ctx.setLineDash([]);
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.85;
    for (const off of [-42, 42]) {
      ctx.beginPath();
      ctx.moveTo(W * 0.24, H * 0.74 + off);
      ctx.lineTo(W * 0.95, H * 0.31 + off);
      ctx.stroke();
    }

    // Bow catapult tracks, running straight down the axis.
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.8;
    for (const y of [H * 0.38, H * 0.56]) {
      ctx.beginPath();
      ctx.moveTo(W * 0.08, y);
      ctx.lineTo(W * 0.46, y);
      ctx.stroke();
    }

    // Deck edge stripe.
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.16, H * 0.245);
    ctx.lineTo(W * 0.95, H * 0.205);
    ctx.stroke();

    // Hull number in the fleet colour — the one piece of team identity on an
    // otherwise authentic deck.
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = skinColor;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('71', W * 0.13, H * 0.5);
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
  const painted = compositeDeckPaint(id, skinColor);

  // With authored paint the plane is sized from the paint's own bounds, so the
  // deck outline lands on the hull whatever margin the artwork happens to
  // carry. Without it, fall back to a fraction of the bounding box — which
  // can't follow the real outline, and shows.
  let planeX: number;
  let planeZ: number;
  if (painted) {
    const [minU, minV, maxU, maxV] = painted.bounds;
    // Grow the plane so the *painted* part covers the hull's deck footprint.
    // Slightly under 1 on purpose: the model's bounding box includes sponsons
    // and the flare of the bow, which the deck itself doesn't reach.
    planeX = (lengthX * 0.93) / Math.max(maxU - minU, 0.01);
    planeZ = (widthZ * 0.93) / Math.max(maxV - minV, 0.01);
  } else {
    planeX = lengthX * 0.88;
    planeZ = widthZ * 0.82;
  }

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(planeX, planeZ),
    new THREE.MeshBasicMaterial({
      map: painted?.texture ?? deckTexture(id, skinColor),
      transparent: true,
      depthWrite: false,
      // The scene tone-maps with ACES, which crushes dark values — a charcoal
      // deck came out black. Deck paint is authored art, not lit surface, so
      // it opts out and renders at the value it was drawn at.
      toneMapped: false,
      // Without this the decal fights the deck for the same depth and flickers.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = deckY + 0.004;

  if (painted) {
    // Re-centre: the paint's centre inside the image is what must sit over the
    // hull's centre, not the image's centre.
    const [minU, minV, maxU, maxV] = painted.bounds;
    plane.position.x = -((minU + maxU) / 2 - 0.5) * planeX;
    plane.position.z = ((minV + maxV) / 2 - 0.5) * planeZ;
  }
  return plane;
}

