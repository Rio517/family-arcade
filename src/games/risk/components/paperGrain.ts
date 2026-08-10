import { seededRng } from '@shared/rng';

/** Rendered size of one grain tile in px; drawn into 256 map units, so each
 *  texel is half a map unit — still fine-grained at 5x zoom. */
const TILE_PX = 512;
/** The old feColorMatrix ink: rgb(0.32, 0.24, 0.12) at up to 5% alpha. */
const INK_R = 82;
const INK_G = 61;
const INK_B = 31;
const MAX_ALPHA = 13; // ≈ 5% of 255

let cached: string | null | undefined;

/**
 * The parchment grain, baked once to a PNG data URL. This replaces the old
 * live feTurbulence filter on the sea: the browser re-generated that noise
 * from scratch every time the map's screen scale changed — ~430ms per pinch
 * frame at tablet resolution, which is why zooming crawled. A bitmap scales
 * like any image, for free.
 *
 * Seeded (per the determinism invariant) and generated locally (offline PWA —
 * no fetched textures). Returns null where 2D canvas is unavailable (jsdom);
 * the map then renders plain parchment, which only loses the speckle.
 */
export function paperGrainDataUrl(): string | null {
  if (cached !== undefined) return cached;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_PX;
    canvas.height = TILE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      cached = null;
      return cached;
    }
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    const rng = seededRng(0x9241);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = INK_R;
      img.data[i + 1] = INK_G;
      img.data[i + 2] = INK_B;
      img.data[i + 3] = Math.round(rng() * MAX_ALPHA);
    }
    ctx.putImageData(img, 0, 0);
    cached = canvas.toDataURL('image/png');
  } catch {
    cached = null;
  }
  return cached;
}
