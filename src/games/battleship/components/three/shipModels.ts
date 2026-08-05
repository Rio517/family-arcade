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
import carrierDeckUrl from '@games/battleship/assets/ships/modern/carrier-deck.png';

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
   * Optional packed deck-paint texture, authored from the ship's top view:
   * R = white markings, G = team-colour mask, B = reserved, A = deck
   * silhouette with the island cut out. Ships without one fall back to
   * markings drawn on a canvas, which work but can't follow the real outline.
   */
  deckPaint?: string;
}

const SPECS: Partial<Record<ShipId, ModelSpec>> = {
  carrier: {
    url: carrierUrl,
    yaw: -Math.PI / 2,
    sink: 0.28,
    deckFrac: 0.46,
    deckPaint: carrierDeckUrl,
  },
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
      if (spec.deckPaint && !deckPaintImages.has(id)) {
        try {
          const image = await new THREE.ImageLoader().loadAsync(spec.deckPaint);
          deckPaintImages.set(id, image);
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
  const lights = sunk ? null : buildNightLights(model, dims, skinColor);

  // Assemble only after measuring: adding the model to a scaled parent first
  // is what threw the raycast results off.
  const hull = new THREE.Group();
  hull.add(model);
  hull.scale.setScalar(scale);
  if (!sunk) {
    hull.add(buildDeckDecal(id, dims.x, dims.z, deckY, skinColor));
    if (lights) hull.add(lights);
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
 * Turn the packed channels into something renderable.
 *
 * The authored file is data, not a picture: R marks the white lines, G marks
 * the team number, A is the deck silhouette. Rendering it directly would show
 * a red deck. So we unpack it here — dark non-skid where the silhouette is,
 * white where the markings are, fleet colour where the team mask is — which is
 * also what lets the deck number take each player's skin colour.
 */
function compositeDeckPaint(id: ShipId, skinColor: string): DeckPaint | null {
  const key = `${id}:${skinColor}`;
  const cached = deckPaintCache.get(key);
  if (cached) return cached;

  const image = deckPaintImages.get(id);
  if (!image) return null;

  const W = image.naturalWidth;
  const H = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, W, H);
  const px = src.data;

  const tint = new THREE.Color(skinColor);
  const teamR = Math.round(tint.r * 255);
  const teamG = Math.round(tint.g * 255);
  const teamB = Math.round(tint.b * 255);

  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < px.length; i += 4) {
    const marks = px[i];
    const team = px[i + 1];
    const deck = px[i + 3];

    if (deck > 8) {
      const p = i / 4;
      const x = p % W;
      const y = (p / W) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (team > 8) {
      px[i] = teamR;
      px[i + 1] = teamG;
      px[i + 2] = teamB;
      px[i + 3] = Math.max(deck, team);
    } else if (marks > 8) {
      // Deck paint, a touch off-white so it doesn't glare under bloom.
      px[i] = 232;
      px[i + 1] = 238;
      px[i + 2] = 246;
      px[i + 3] = Math.max(deck, marks);
    } else {
      // Non-skid: darker than the reference charcoal, because the scene's ACES
      // tone mapping lifts mid-tones — but not so dark it reads as a hole in
      // the ship, which #23262c-minus-too-much did.
      px[i] = 34;
      px[i + 1] = 37;
      px[i + 2] = 43;
      px[i + 3] = deck;
    }
  }

  ctx.putImageData(src, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const paint: DeckPaint =
    maxX < 0
      ? { texture, bounds: [0, 0, 1, 1] }
      : {
          texture,
          bounds: [minX / W, minY / H, (maxX + 1) / W, (maxY + 1) / H],
        };
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

/**
 * Deck-edge running lights and a masthead lamp. Emissive points, so they glow
 * under bloom and stay visible when the whole ship is only a few hundred
 * pixels wide.
 */
function buildNightLights(
  model: THREE.Object3D,
  dims: THREE.Vector3,
  skinColor: string,
): THREE.Points | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = new THREE.Color(skinColor);
  const warm = new THREE.Color('#ffe0a4');

  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);

  // Every lamp is dropped onto the hull from above and kept only where it
  // actually lands. Placing them at a fixed offset from the centreline hung
  // them in mid-air off the narrow bow — a ship is not a rectangle.
  const perSide = 11;
  for (let i = 0; i < perSide; i++) {
    const t = (i + 0.5) / perSide;
    const x = (t - 0.5) * dims.x * 0.94;
    for (const side of [-1, 1]) {
      for (const inset of [0.46, 0.38, 0.3]) {
        const z = side * dims.z * inset;
        raycaster.set(new THREE.Vector3(x, dims.y * 2, z), down);
        const hit = raycaster.intersectObject(model, true)[0];
        if (!hit) continue;
        positions.push(x, hit.point.y + 0.004, z);
        const c = i % 4 === 0 ? tint : warm;
        colors.push(c.r, c.g, c.b);
        break; // one lamp per station, at the outermost point that exists
      }
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      // Small: these should read as pinpricks now and bloom into glows later,
      // not as beads sitting on the rail.
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
}
