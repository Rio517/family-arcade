/**
 * Canvas textures for the fleet scene's effects, painted once per page and
 * shared by every fire, blast and splash. White where the material's colour
 * should show, so one texture serves many tints.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function paint(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  // Uploaded as the canvas holds it: WebKit's near-transparent gradient
  // pixels speckle when un-premultiplied (the racer's sun, Gulp's puffs).
  t.premultiplyAlpha = true;
  cache.set(key, t);
  return t;
}

/** Every texture painted here, so a scene can tell its own maps from these shared ones. */
export function isSharedFxTexture(t: THREE.Texture | null | undefined): boolean {
  if (!t) return false;
  for (const v of cache.values()) if (v === t) return true;
  return false;
}

/** A soft round blob for fire, smoke and spray. */
export function puffTexture(): THREE.CanvasTexture {
  return paint('puff', 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

/** A lumpy smoke puff: overlapping blobs, so a plume doesn't read as discs. */
export function smokeTexture(): THREE.CanvasTexture {
  return paint('smoke', 96, 96, (g) => {
    const blobs: Array<[number, number, number, number]> = [
      [0.5, 0.52, 0.34, 0.6],
      [0.34, 0.42, 0.22, 0.45],
      [0.66, 0.4, 0.21, 0.45],
      [0.5, 0.68, 0.24, 0.4],
      [0.42, 0.6, 0.16, 0.35],
    ];
    for (const [bx, by, r, a] of blobs) {
      const grad = g.createRadialGradient(bx * 96, by * 96, 1, bx * 96, by * 96, r * 96);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.6, `rgba(255,255,255,${a * 0.45})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 96, 96);
    }
  });
}

/** A bright band near the rim of a circle: a shock ring racing over the water. */
export function ringTexture(): THREE.CanvasTexture {
  return paint('ring', 128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0)');
    grad.addColorStop(0.84, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

/** A four-point star glint: the arcade take's sparks and muzzle flash. */
export function starTexture(): THREE.CanvasTexture {
  return paint('star', 64, 64, (g) => {
    const core = g.createRadialGradient(32, 32, 0, 32, 32, 14);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(32, 1);
    g.quadraticCurveTo(35, 29, 63, 32);
    g.quadraticCurveTo(35, 35, 32, 63);
    g.quadraticCurveTo(29, 35, 1, 32);
    g.quadraticCurveTo(29, 29, 32, 1);
    g.fill();
  });
}

/** A tall plume of spray, wide at the foot: the column a shell throws up from the sea. */
export function sprayTexture(): THREE.CanvasTexture {
  return paint('spray', 64, 128, (g) => {
    g.filter = 'blur(3px)';
    for (let i = 0; i < 26; i++) {
      // A seeded scatter so every page paints the same plume.
      const t = i / 26;
      const x = 32 + Math.sin(i * 12.9898) * (6 + 16 * (1 - t) * 0.6);
      const y = 120 - t * 104;
      const r = 6 + 12 * (1 - t);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 128);
    }
  });
}
