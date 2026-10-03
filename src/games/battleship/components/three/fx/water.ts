/**
 * Two takes on the sea under the fleet, both rolled on the GPU and both
 * reaching the horizon instead of ending at the board's edge.
 *
 * 'a' Night Ops: a dark teal sea with bright crest lines, the targeting grid
 *     drawn into the water itself, and a sonar ping that sweeps out from the
 *     middle of the board every few seconds, lighting the grid as it passes.
 * 'b' Moonlit Swell: a deeper, rolling swell (Gerstner waves, so the crests
 *     sharpen), whitecaps on the tallest crests, the sky's glow on the far
 *     water, a moon on the horizon and its glitter path across the sea.
 *
 * Each is a MeshStandardMaterial with its vertex and fragment shaders
 * extended, so the moonlight, the fog and the ships' shadows still fall on it.
 */
import * as THREE from 'three';

export type WaterStyle = 'a' | 'b';

export interface Sea {
  mesh: THREE.Mesh;
  /** Extra scenery the take brings (the sky dome and its moon); may be empty. */
  extras: THREE.Object3D[];
  /** The scene's background and fog, matched to this sea's horizon. */
  background: THREE.Color;
  fog: THREE.Fog;
  /** Whether the old floating grid lines still belong over this sea. */
  keepGridHelper: boolean;
  /** Per-frame: the sea's clock, and the camera for the glitter path. */
  step(timeSec: number, camera: THREE.Camera): void;
}

const SIZE = 48;
const SEGMENTS = 176;
const HALF_BOARD = 5;

const NOISE = /* glsl */ `
  float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float seaNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(seaHash(i), seaHash(i + vec2(1, 0)), u.x), mix(seaHash(i + vec2(0, 1)), seaHash(i + vec2(1, 1)), u.x), u.y);
  }
`;

// ── Take A: Night Ops ───────────────────────────────────────────────────────

const A_VERT_PARS = /* glsl */ `
  uniform float uTime;
  varying vec2 vSeaPos;
  varying float vSeaH;
  vec3 swell(vec2 p) {
    float a = sin(p.x * 0.95 + uTime * 0.55) * cos(p.y * 0.8 + uTime * 0.42);
    float b = sin((p.x * 0.6 - p.y * 0.75) * 1.7 - uTime * 0.7);
    float c = sin((p.x * 1.3 + p.y * 1.1) * 2.6 + uTime * 1.15);
    float h = a * 0.036 + b * 0.018 + c * 0.006;
    float dax = cos(p.x * 0.95 + uTime * 0.55) * 0.95 * cos(p.y * 0.8 + uTime * 0.42);
    float day = -sin(p.x * 0.95 + uTime * 0.55) * sin(p.y * 0.8 + uTime * 0.42) * 0.8;
    float db = cos((p.x * 0.6 - p.y * 0.75) * 1.7 - uTime * 0.7) * 1.7;
    float dc = cos((p.x * 1.3 + p.y * 1.1) * 2.6 + uTime * 1.15) * 2.6;
    float dx = dax * 0.036 + db * 0.6 * 0.018 + dc * 1.3 * 0.006;
    float dy = day * 0.036 - db * 0.75 * 0.018 + dc * 1.1 * 0.006;
    return vec3(h, dx, dy);
  }
`;

const A_FRAG_PARS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uGlow;
  varying vec2 vSeaPos;
  varying float vSeaH;
  ${NOISE}
`;

const A_FRAG_BODY = /* glsl */ `
  {
    vec2 p = vSeaPos;
    float r = length(p);
    // Contour lines of the swell, like a sonar chart of the sea: thin,
    // faint in the troughs, brighter riding the crests.
    float n = seaNoise(p * 1.6 + vec2(uTime * 0.2, -uTime * 0.15));
    float k = vSeaH * 75.0 + (n - 0.5) * 0.5;
    float kw = fwidth(k);
    float contour = 1.0 - smoothstep(0.0, kw * 1.6 + 0.02, abs(fract(k) - 0.5) * -1.0 + 0.5);
    float lift = smoothstep(-0.02, 0.04, vSeaH);
    float edge = max(abs(p.x), abs(p.y));
    float fade = mix(1.0, 0.22, smoothstep(float(${HALF_BOARD}) - 0.5, float(${HALF_BOARD}) + 2.5, edge)) * (1.0 - smoothstep(10.0, 22.0, r));
    totalEmissiveRadiance += vec3(0.35, 0.8, 0.95) * contour * (0.04 + 0.12 * lift) * fade;
    // The targeting grid, drawn into the water, only over the board.
    float inBoard = step(abs(p.x), float(${HALF_BOARD}) + 0.02) * step(abs(p.y), float(${HALF_BOARD}) + 0.02);
    vec2 g = abs(p - floor(p + 0.5));
    vec2 fw = fwidth(p) * 1.2;
    float grid = max(1.0 - smoothstep(0.0, fw.x + 0.01, g.x), 1.0 - smoothstep(0.0, fw.y + 0.01, g.y)) * inBoard;
    // The sonar ping: a ring sweeping out from the middle every 4.5 seconds.
    float period = 4.5;
    float R = mod(uTime, period) / period * 13.0;
    float ring = exp(-pow((r - R) * 3.2, 2.0)) * (1.0 - R / 13.0);
    float wake = exp(-max(0.0, R - r) * 1.4) * step(r, R) * (1.0 - R / 13.0);
    totalEmissiveRadiance += uGlow * (grid * (0.15 + 0.6 * ring + 0.25 * wake) + ring * 0.12);
    // A faint deep glow under the board, so the play area reads as lit.
    totalEmissiveRadiance += uGlow * 0.035 * inBoard;
  }
`;

function nightOps(seaTime: { value: number }, glow: string): Sea {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: '#06202e', roughness: 0.55, metalness: 0.2 });
  const uGlow = { value: new THREE.Color(glow).lerp(new THREE.Color('#38e8ff'), 0.6) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaTime;
    shader.uniforms.uGlow = uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${A_VERT_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         vec3 sw = swell(position.xz);
         objectNormal = normalize(vec3(-sw.y, 1.0, -sw.z));`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed.y += sw.x;\n  vSeaPos = position.xz;\n  vSeaH = sw.x;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${A_FRAG_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${A_FRAG_BODY}`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  const bg = new THREE.Color('#050c16');
  return {
    mesh,
    extras: [],
    background: bg,
    fog: new THREE.Fog(bg, 15, 32),
    keepGridHelper: false,
    step: (t) => {
      seaTime.value = t;
    },
  };
}

// ── Take B: Moonlit Swell ───────────────────────────────────────────────────

/** Four Gerstner waves: direction, wavelength, steepness, speed. */
const WAVES: Array<[number, number, number, number, number]> = [
  // dirX, dirZ, wavelength, steepness, speed
  [1.0, 0.35, 7.5, 0.22, 0.9],
  [-0.4, 1.0, 4.2, 0.2, 0.75],
  [0.7, -0.6, 2.6, 0.16, 0.65],
  [-0.9, -0.3, 1.5, 0.12, 0.5],
];

const B_VERT_PARS = /* glsl */ `
  uniform float uTime;
  varying vec2 vSeaPos;
  varying float vSeaH;
  varying float vSeaCrest;
  void gerstner(vec2 p, vec2 d, float L, float Q, float spd, inout vec3 disp, inout vec3 nrm, inout float crest) {
    float k = 6.28318 / L;
    float A = Q / k * 0.11;
    d = normalize(d);
    float f = k * (dot(d, p) - spd * uTime);
    float c = cos(f), s = sin(f);
    disp += vec3(d.x * A * c * 0.6, A * s, d.y * A * c * 0.6);
    float WA = k * A;
    nrm += vec3(-d.x * WA * c, -Q * 0.6 * WA * s, -d.y * WA * c);
    crest += max(0.0, s) * Q;
  }
`;

const B_VERT_BODY = WAVES.map(
  ([dx, dz, L, Q, spd]) => `gerstner(position.xz, vec2(${dx.toFixed(2)}, ${dz.toFixed(2)}), ${L.toFixed(2)}, ${Q.toFixed(2)}, ${spd.toFixed(2)}, seaDisp, seaNrm, seaCrest);`,
).join('\n');

const B_FRAG_PARS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSky;
  uniform vec3 uMoonView;
  varying vec2 vSeaPos;
  varying float vSeaH;
  varying float vSeaCrest;
  ${NOISE}
`;

const B_FRAG_BODY = /* glsl */ `
  {
    vec3 V = normalize(vViewPosition);
    // Fine ripples on top of the swell, felt only by the light.
    vec2 q = vSeaPos * 5.0;
    float rx = seaNoise(q + vec2(uTime * 0.6, 0.0)) - seaNoise(q - vec2(0.0, uTime * 0.5));
    float rz = seaNoise(q.yx * 1.3 - vec2(uTime * 0.4)) - 0.5;
    vec3 N = normalize(normal + vec3(rx, 0.0, rz) * 0.18);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
    totalEmissiveRadiance += uSky * fres * 0.55;
    // The moon's glitter path: a hard specular lobe, broken into sparkles.
    vec3 H = normalize(uMoonView + V);
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 320.0);
    float sparkle = step(0.62, seaNoise(vSeaPos * 18.0 + uTime * 1.7));
    totalEmissiveRadiance += vec3(0.95, 0.97, 1.0) * spec * (0.4 + 1.4 * sparkle);
    // Whitecaps where the crests run tallest.
    // Whitecaps: flecks of foam on the tallest crests only.
    float foamN = seaNoise(vSeaPos * 9.0 + vec2(uTime * 0.3, uTime * 0.2));
    float foam = smoothstep(0.56, 0.66, vSeaCrest) * smoothstep(0.55, 0.8, foamN);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.8, 0.86), foam * 0.35);
    totalEmissiveRadiance += vec3(0.08, 0.11, 0.14) * foam;
  }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uMoonDir;
  varying vec3 vDir;
  float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(up, 0.45));
    // The moon, its halo, and a scatter of stars that thins toward the horizon.
    float m = dot(d, uMoonDir);
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9996, m);
    col += vec3(0.55, 0.62, 0.8) * pow(max(m, 0.0), 400.0) * 0.5 + vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 30.0) * 0.25;
    vec3 cell = floor(d * 180.0);
    float star = step(0.9965, h(cell)) * smoothstep(0.05, 0.35, up);
    col += vec3(0.85, 0.9, 1.0) * star * (0.5 + 0.5 * h(cell + 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function moonlit(seaTime: { value: number }): Sea {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: '#0a2638', roughness: 0.34, metalness: 0.05 });
  const horizon = new THREE.Color('#1b2c4a');
  const zenith = new THREE.Color('#03060d');
  // The moon hangs low over the far side of the board, so its path runs toward the viewer.
  const moonWorld = new THREE.Vector3(-0.35, 0.16, -1).normalize();
  const uMoonView = { value: new THREE.Vector3() };
  const uSky = { value: new THREE.Color('#3b5683') };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaTime;
    shader.uniforms.uSky = uSky;
    shader.uniforms.uMoonView = uMoonView;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${B_VERT_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         vec3 seaDisp = vec3(0.0);
         vec3 seaNrm = vec3(0.0, 1.0, 0.0);
         float seaCrest = 0.0;
         ${B_VERT_BODY}
         objectNormal = normalize(seaNrm);`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += seaDisp;\n  vSeaPos = position.xz;\n  vSeaH = seaDisp.y;\n  vSeaCrest = seaCrest;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${B_FRAG_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${B_FRAG_BODY}`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(45, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uZenith: { value: zenith }, uHorizon: { value: horizon }, uMoonDir: { value: moonWorld } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.renderOrder = -10;

  const tmp = new THREE.Vector3();
  return {
    mesh,
    extras: [sky],
    background: horizon.clone(),
    fog: new THREE.Fog(horizon.clone(), 16, 40),
    keepGridHelper: true,
    step: (t, camera) => {
      seaTime.value = t;
      // The moon's direction in view space, for the glitter path.
      tmp.copy(moonWorld).transformDirection(camera.matrixWorldInverse);
      uMoonView.value.copy(tmp);
      sky.position.copy(camera.position);
    },
  };
}

export function buildSea(style: WaterStyle, seaTime: { value: number }, glow: string): Sea {
  return style === 'a' ? nightOps(seaTime, glow) : moonlit(seaTime);
}
