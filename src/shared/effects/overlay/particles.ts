/**
 * A small particle pool over one `THREE.Points` (one draw call per system —
 * this runs over live video on iPads, so per-sprite objects are out).
 * Colors fade to black and the material blends additively, so "black" is
 * invisible: no per-particle alpha needed.
 */

import * as THREE from 'three';

/**
 * Additive glow that leaves the canvas's alpha channel alone. Stock
 * `AdditiveBlending` also accumulates alpha, and on this transparent overlay
 * that composites faded (near-black) particles as solid black blotches over
 * the page. Adding RGB while keeping destination alpha works because the
 * canvas is premultiplied: the browser adds our RGB straight onto the video.
 */
export function additiveOverlay(material: THREE.Material): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
}

/** Soft radial disc — the fire/glow sprite. Canvas-generated (ADR 0006). */
export function softDiscTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** A chunky five-point star for the peace-sign sparkles. */
export function starTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.translate(32, 32);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 26 : 11;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export interface ParticlePool {
  points: THREE.Points;
  /** Spawn one particle; ignored when the pool is full. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    color: THREE.Color,
    lifeS: number,
  ): void;
  /** Advance the simulation and re-upload buffers. */
  step(dtS: number, gravityY: number, fade: (c: THREE.Color, lifeLeft: number) => void): void;
  /** True when nothing is alive (safe to hide the points object). */
  idle(): boolean;
  dispose(): void;
}

export function createParticlePool(capacity: number, texture: THREE.Texture): ParticlePool {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const velocities = new Float32Array(capacity * 2);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const base = new Array<THREE.Color>(capacity);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // The overlay camera is orthographic, so distance-based point scaling is
  // meaningless — sizes are plain pixels.
  const material = new THREE.PointsMaterial({
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: false,
    size: 24,
  });
  additiveOverlay(material);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  let alive = 0;
  const scratch = new THREE.Color();

  return {
    points,
    spawn(x, y, z, vx, vy, color, lifeS) {
      const i = life.findIndex((l) => l <= 0);
      if (i < 0) return;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities[i * 2] = vx;
      velocities[i * 2 + 1] = vy;
      life[i] = maxLife[i] = lifeS;
      base[i] = color.clone();
      alive++;
    },
    step(dtS, gravityY, fade) {
      for (let i = 0; i < capacity; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dtS;
        if (life[i] <= 0) {
          colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0;
          alive--;
          continue;
        }
        velocities[i * 2 + 1] += gravityY * dtS;
        positions[i * 3] += velocities[i * 2] * dtS;
        positions[i * 3 + 1] += velocities[i * 2 + 1] * dtS;
        scratch.copy(base[i]);
        fade(scratch, life[i] / maxLife[i]);
        colors[i * 3] = scratch.r;
        colors[i * 3 + 1] = scratch.g;
        colors[i * 3 + 2] = scratch.b;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
    idle: () => alive <= 0,
    dispose() {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
  };
}
