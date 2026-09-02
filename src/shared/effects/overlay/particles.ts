/**
 * A small particle pool over one `THREE.Points` (one draw call per system —
 * this runs over live video on iPads, so per-sprite objects are out).
 * Colors fade to black and the material blends additively, so "black" is
 * invisible: no per-particle alpha needed.
 */

import * as THREE from 'three';

/**
 * The material every glowing particle uses: additive light on a transparent
 * canvas floating over the video.
 *
 * The canvas is premultiplied, and **alpha has to be written wherever colour
 * is added**. WebKit — every browser on the family's iPads — drops colour it
 * finds in a pixel whose alpha is zero, so an effect that only added RGB
 * survived exactly as far as the mask underneath it and was cut off at its
 * edge. Chromium keeps that colour, which is why it looked right in the
 * screenshots and wrong in the mirror.
 *
 * So the shader writes premultiplied colour and takes the alpha from the
 * brightness of the pixel it just wrote, after the conversion to the output
 * colour space. A particle fading to black hands back an alpha fading to zero
 * with it, which is what keeps a dying ember from compositing as a dark blot
 * over the video — the reason the alpha channel was left alone before.
 *
 * Light also never hides behind the thing it comes off, so these draw over the
 * scene rather than being depth-tested against it: a face close enough to the
 * camera scales the mask deeper than the flame's own plane, and the jaw would
 * otherwise cut through the fire.
 */
function glowMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      // The overlay camera is orthographic, so distance-based point scaling is
      // meaningless — sizes are plain pixels.
      size: { value: 24 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      uniform float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_PointSize = size;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec3 vColor;
      void main() {
        vec4 sprite = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vColor * sprite.a, 1.0);
        #include <colorspace_fragment>
        gl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
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
  /** Sprite width in pixels — effects scale it off the face or hand. */
  setSize(px: number): void;
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
  const material = glowMaterial(texture);
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
    setSize(px) {
      material.uniforms.size.value = px;
    },
    idle: () => alive <= 0,
    dispose() {
      geometry.dispose();
      material.uniforms.map.value?.dispose();
      material.dispose();
    },
  };
}
