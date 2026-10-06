/**
 * The sky's colours: the dome, the cloud sea, the haze and the sheen that
 * glossy things (the road, the rings) reflect.
 *
 * The dome and the cloud sea are drawn with `toneMapped: false`, so the
 * colours here are the colours on screen: a clear, saturated blue overhead
 * paling to near-white at the horizon (docs/mockups/rounds/
 * 20261006-racer-richer, option A). The haze is the horizon's colour, so
 * the far cloud sea and far islands melt into the sky with no line.
 */
import * as THREE from 'three';
import { cellNoise } from '../domain/sky';

/** The horizon's colour, and the haze far things fade into. */
export const HAZE = 0xd3e8fd;
/** Where the haze starts, and where it hides everything. */
export const HAZE_NEAR = 150;
export const HAZE_FAR = 820;

/** Blue overhead, paling to the haze at the horizon and below it. */
export function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  // 0 is straight up, 0.5 the horizon, 1 straight down.
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#1f78dc');
  g.addColorStop(0.28, '#3f97f2');
  g.addColorStop(0.37, '#55a8fa');
  g.addColorStop(0.43, '#80c0fc');
  g.addColorStop(0.475, '#b6dafd');
  g.addColorStop(0.5, '#d3e8fd');
  g.addColorStop(1.0, '#d3e8fd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The cloud sea from above: white cloud tops, each with a soft blue shadow
 * on the side away from the sun, over pale blue hollows. Tiles seamlessly.
 */
export function cloudSeaTexture(): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c9dcf5';
  ctx.fillRect(0, 0, s, s);
  const puff = (x: number, y: number, r: number, inner: string, outer: string) => {
    // Drawn wrapped, each copy with its own gradient, so the tile repeats seamlessly.
    for (const dx of [-s, 0, s]) {
      for (const dy of [-s, 0, s]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + r < 0 || cx - r > s || cy + r < 0 || cy - r > s) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, inner);
        g.addColorStop(0.5, inner);
        g.addColorStop(1, outer);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  // Clumps of overlapping puffs, big to small: each a soft blue shadow
  // offset away from the light, then its lit white top.
  for (let layer = 0; layer < 3; layer++) {
    const count = [26, 40, 60][layer];
    const size = [58, 36, 20][layer];
    for (let i = 0; i < count; i++) {
      const n = (k: number) => cellNoise(i, k, 91 + layer);
      const clump = 3 + Math.floor(n(4) * 3);
      for (let j = 0; j < clump; j++) {
        const m = (k: number) => cellNoise(i * 7 + j, k, 95 + layer);
        const x = n(1) * s + (m(1) - 0.5) * size * 1.6;
        const y = n(2) * s + (m(2) - 0.5) * size * 0.9;
        const r = size * (0.55 + m(3) * 0.6);
        puff(x + r * 0.18, y + r * 0.3, r, 'rgba(158,186,232,0.5)', 'rgba(158,186,232,0)');
        puff(x, y, r * 0.9, 'rgba(255,255,255,0.96)', 'rgba(246,250,255,0)');
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * What a glossy surface reflects: dim overhead, a bright band along the
 * horizon, a warm glint where the sun is. Added on top of a surface's own
 * colour, it reads as a sheen that brightens toward the distance.
 */
export function glossTexture(): THREE.Texture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  // Rows run from straight up (0) to straight down (h).
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, '#1a1f2c');
  g.addColorStop(0.25, '#3a4252');
  g.addColorStop(0.4, '#9aa6bd');
  g.addColorStop(0.47, '#ffffff');
  g.addColorStop(0.52, '#e8eef8');
  g.addColorStop(0.6, '#4a5060');
  g.addColorStop(1.0, '#14161c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.62, h * 0.2, 0, w * 0.62, h * 0.2, 26);
  sun.addColorStop(0, 'rgba(255,248,225,1)');
  sun.addColorStop(1, 'rgba(255,248,225,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
