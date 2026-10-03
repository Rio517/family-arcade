/**
 * The fires on a damaged fleet — the little deck fires the board has always
 * had, made livelier. Every fire on the board is drawn by four objects
 * whatever the count: the flame tongues (one instanced, camera-facing quad
 * each, shaped by animated noise in the shader), a glow pooled on the deck,
 * rising embers, and a smoke column. Wrecks keep only a heavy smoulder.
 *
 * Two takes: 'a' (arcade) is a crisp, cel-banded toon flame — white heart,
 * yellow, a red-orange lick — over a hot pink-orange glow; 'b' (cinematic)
 * is a soft, roaring blaze with a heavier smoke column.
 */
import * as THREE from 'three';
import { puffTexture, smokeTexture } from './textures';

export type FireStyle = 'a' | 'b';

export interface FireSpot {
  x: number;
  y: number;
  z: number;
  /** About 0.85 on a destroyer to 1.3 on a carrier: the blaze follows the hull. */
  size: number;
  /** A wreck: no flame, only a low, heavy smoulder. */
  smoulder?: boolean;
}

const MAX_FIRES = 20;
const EMBERS_PER = 4;
const SMOKE_PER = 4;

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

/** Upright, camera-facing quads: each turns about its own vertical to face the eye. */
const FLAME_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    vSeed = fract(sin(dot(centre.xz, vec2(12.9898, 78.233))) * 43758.5453) * 10.0;
    // The tongue gutters: two incommensurate bands read as fire, not a metronome.
    float gutter = 1.0 + 0.12 * sin(uTime * 10.5 + vSeed) + 0.07 * sin(uTime * 23.0 + vSeed * 2.7);
    vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
    vec3 world = centre.xyz + right * position.x * sx * (2.0 - gutter) + vec3(0.0, 1.0, 0.0) * position.y * sy * gutter;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FLAME_FRAG_A = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  ${NOISE}
  void main() {
    float y = vUv.y;
    float n1 = fbm(vec2(vUv.x * 2.6 + vSeed, y * 2.6 - uTime * 2.8 + vSeed));
    float n2 = fbm(vec2(vUv.x * 6.0 - vSeed, y * 4.6 - uTime * 4.4));
    float x = (vUv.x - 0.5) * 2.0 + (n1 - 0.5) * 0.9 * y;
    // A tapering tongue whose edges go ragged toward the top, so the tip
    // breaks into licks instead of a neat cone.
    float shape = (1.0 - y) * 0.92 + 0.04 - abs(x);
    shape += (n2 - 0.5) * 0.62 * y;
    shape *= smoothstep(0.0, 0.07, y);
    float heat = shape * 1.7 + (1.0 - y) * 0.12;
    if (heat < 0.05) discard;
    // Cel bands: a red-orange lick, orange, yellow, a white heart.
    vec3 col = vec3(1.0, 0.2, 0.3);
    col = mix(col, vec3(1.0, 0.5, 0.1), step(0.32, heat));
    col = mix(col, vec3(1.0, 0.86, 0.3), step(0.62, heat));
    col = mix(col, vec3(1.0, 1.0, 0.88), step(0.98, heat));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const FLAME_FRAG_B = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  ${NOISE}
  void main() {
    float y = vUv.y;
    float n1 = fbm(vec2(vUv.x * 2.4 + vSeed, y * 2.2 - uTime * 2.2 + vSeed));
    float n2 = fbm(vec2(vUv.x * 5.5 - vSeed, y * 4.2 - uTime * 3.6));
    float x = (vUv.x - 0.5) * 2.0 + (n1 - 0.5) * 1.0 * y;
    float shape = (1.0 - y) * 0.85 + 0.06 - abs(x);
    shape += (n2 - 0.5) * 0.7 * y;
    shape *= smoothstep(0.0, 0.12, y);
    float heat = clamp(shape * 1.5 + (1.0 - y) * 0.1, 0.0, 1.0);
    // A blackbody ramp: deep red, orange, yellow, a white-hot heart.
    vec3 col = mix(vec3(0.55, 0.06, 0.02), vec3(1.0, 0.42, 0.08), smoothstep(0.0, 0.35, heat));
    col = mix(col, vec3(1.0, 0.82, 0.35), smoothstep(0.35, 0.7, heat));
    col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.0, heat));
    gl_FragColor = vec4(col * smoothstep(0.0, 0.25, heat) * 1.5, 1.0);
  }
`;

/** Soft round points for embers and smoke, sized in world units. */
const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aSpin;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSpin;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
    vSpin = aSpin;
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSpin;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    vec4 t = texture2D(uMap, p);
    if (vAlpha <= 0.002) discard;
    gl_FragColor = vec4(vColor * t.a * vAlpha, t.a * vAlpha);
  }
`;

class PointPool {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly color: Float32Array;
  readonly spin: Float32Array;
  private geo = new THREE.BufferGeometry();
  readonly mat: THREE.ShaderMaterial;

  constructor(n: number, map: THREE.Texture, additive: boolean) {
    this.pos = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.color = new Float32Array(n * 3);
    this.spin = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.geo.setAttribute('aSpin', new THREE.BufferAttribute(this.spin, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      // The fragment is premultiplied: additive adds it, normal lays it over.
      blending: additive ? THREE.AdditiveBlending : THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 7 : 6;
  }

  setCount(n: number): void {
    this.geo.setDrawRange(0, n);
  }

  touch(): void {
    for (const k of ['position', 'aSize', 'aAlpha'] as const) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }

  touchStatic(): void {
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSpin') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class FireField {
  readonly group = new THREE.Group();
  private flames: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private flameMat: THREE.ShaderMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private embers: PointPool;
  private smoke: PointPool;
  private spots: FireSpot[] = [];
  private uTime = { value: 0 };
  private dummy = new THREE.Object3D();

  constructor(
    private style: FireStyle,
    private reducedMotion: boolean,
  ) {
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime },
      vertexShader: FLAME_VERT,
      fragmentShader: style === 'a' ? FLAME_FRAG_A : FLAME_FRAG_B,
      transparent: style === 'b',
      depthWrite: style === 'a',
      blending: style === 'b' ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    // The quad stands on its foot: x in -0.5..0.5, y in 0..1.
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    this.flames = new THREE.InstancedMesh(quad, this.flameMat, MAX_FIRES * 2);
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 6;

    this.glowMat = new THREE.MeshBasicMaterial({
      map: puffTexture(),
      color: style === 'a' ? 0xff5a3a : 0xff8a2a,
      transparent: true,
      premultipliedAlpha: true,
      opacity: style === 'a' ? 0.75 : 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const disc = new THREE.PlaneGeometry(1, 1);
    disc.rotateX(-Math.PI / 2);
    this.glows = new THREE.InstancedMesh(disc, this.glowMat, MAX_FIRES);
    this.glows.count = 0;
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 5;

    this.embers = new PointPool(MAX_FIRES * EMBERS_PER, puffTexture(), true);
    this.smoke = new PointPool(MAX_FIRES * SMOKE_PER, smokeTexture(), false);
    this.group.add(this.glows, this.smoke.points, this.flames, this.embers.points);
  }

  /** Point sizes follow the canvas height: call on every resize. */
  setViewport(heightPx: number, fovDeg: number): void {
    const scale = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.embers.mat.uniforms.uScale.value = scale;
    this.smoke.mat.uniforms.uScale.value = scale;
  }

  /** The fires burning now (rebuilt each state change; cheap — no allocation per fire). */
  setFires(spots: FireSpot[]): void {
    this.spots = spots.slice(0, MAX_FIRES);
    let f = 0;
    let g = 0;
    const a = this.style === 'a';
    this.spots.forEach((s, i) => {
      // Embers and smoke colour per fire: a wreck's smoke is the heaviest grey.
      for (let k = 0; k < EMBERS_PER; k++) {
        const j = i * EMBERS_PER + k;
        this.embers.color.set(a ? [1, 0.75, 0.3] : [1, 0.6, 0.22], j * 3);
        this.embers.spin[j] = k;
      }
      for (let k = 0; k < SMOKE_PER; k++) {
        const j = i * SMOKE_PER + k;
        const grey = s.smoulder ? 0.26 : a ? 0.24 : 0.2;
        this.smoke.color.set(a ? [grey, grey * 0.92, grey * 1.25] : [grey, grey, grey * 1.08], j * 3);
        this.smoke.spin[j] = (i * 1.7 + k * 2.1) % 6.28;
      }
      if (s.smoulder) return;
      const h = s.size * (a ? 0.62 : 0.78);
      const w = s.size * (a ? 0.42 : 0.5);
      this.dummy.position.set(s.x, s.y, s.z);
      this.dummy.scale.set(w, h, 1);
      this.dummy.updateMatrix();
      this.flames.setMatrixAt(f++, this.dummy.matrix);
      // A second, smaller tongue beside the first, so a fire is never one flat shape.
      this.dummy.position.set(s.x + 0.07 * Math.sin(i * 2.3), s.y, s.z + 0.07 * Math.cos(i * 2.3));
      this.dummy.scale.set(w * 0.62, h * 0.7, 1);
      this.dummy.updateMatrix();
      this.flames.setMatrixAt(f++, this.dummy.matrix);
      this.dummy.position.set(s.x, s.y - 0.12, s.z);
      this.dummy.scale.setScalar(s.size * (a ? 0.95 : 1.1));
      this.dummy.updateMatrix();
      this.glows.setMatrixAt(g++, this.dummy.matrix);
    });
    this.flames.count = f;
    this.glows.count = g;
    this.flames.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    this.embers.setCount(this.spots.length * EMBERS_PER);
    this.smoke.setCount(this.spots.length * SMOKE_PER);
    this.embers.touchStatic();
    this.smoke.touchStatic();
    this.step(this.uTime.value * 1000, true);
  }

  /** Advance the flicker, the embers and the smoke to `nowMs`. */
  step(nowMs: number, force = false): void {
    if (this.spots.length === 0) return;
    if (this.reducedMotion && !force) return;
    // Under reduced motion everything holds a mid-flight pose.
    const t = this.reducedMotion ? 1.37 : nowMs / 1000;
    this.uTime.value = t;
    this.glowMat.opacity = (this.style === 'a' ? 0.7 : 0.55) + (this.reducedMotion ? 0 : 0.12 * Math.sin(t * 7.3));
    const a = this.style === 'a';
    this.spots.forEach((s, i) => {
      const seed = i * 3.17 + s.x * 1.3 + s.z * 0.7;
      for (let k = 0; k < EMBERS_PER; k++) {
        const j = i * EMBERS_PER + k;
        const p = (t * (0.55 + 0.1 * k) + seed + k * 0.29) % 1;
        const swirl = seed + k * 1.7 + t * 2.3;
        const live = !s.smoulder;
        this.embers.pos[j * 3] = s.x + Math.sin(swirl) * 0.09 * (0.3 + p);
        this.embers.pos[j * 3 + 1] = s.y + 0.15 + p * s.size * (a ? 0.85 : 1.05);
        this.embers.pos[j * 3 + 2] = s.z + Math.cos(swirl) * 0.09 * (0.3 + p);
        this.embers.size[j] = (a ? 0.075 : 0.05) * (1 - p * 0.6);
        this.embers.alpha[j] = live ? Math.sin(Math.PI * p) * (a ? 1 : 0.9) : 0;
      }
      for (let k = 0; k < SMOKE_PER; k++) {
        const j = i * SMOKE_PER + k;
        const rate = s.smoulder ? 0.2 : a ? 0.34 : 0.28;
        const p = (t * rate + seed * 0.37 + k / SMOKE_PER) % 1;
        const baseY = s.smoulder ? s.y + 0.05 : s.y + s.size * (a ? 0.45 : 0.55);
        const rise = s.smoulder ? 0.55 : s.size * (a ? 0.9 : 1.4);
        const drift = p * p * (s.smoulder ? 0.25 : 0.4);
        this.smoke.pos[j * 3] = s.x + drift * 0.8 + Math.sin(seed + k) * 0.05;
        this.smoke.pos[j * 3 + 1] = baseY + rise * p;
        this.smoke.pos[j * 3 + 2] = s.z - drift * 0.5;
        this.smoke.size[j] = s.size * (s.smoulder ? 0.75 : a ? 0.45 : 0.55) * (0.6 + 0.9 * p);
        this.smoke.alpha[j] = (s.smoulder ? 0.55 : a ? 0.55 : 0.62) * Math.sin(Math.PI * p);
      }
    });
    this.embers.touch();
    this.smoke.touch();
  }

  dispose(): void {
    this.flames.geometry.dispose();
    this.flames.dispose();
    this.glows.geometry.dispose();
    this.glows.dispose();
    this.flameMat.dispose();
    this.glowMat.dispose();
    this.embers.dispose();
    this.smoke.dispose();
  }
}
