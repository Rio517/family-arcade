/**
 * The three.js view for Rainbow Racer — a grassy arena, a rainbow sky, one or
 * two karts (each with its chosen character riding on top), spinning coins, and
 * a camera that trails the player's own kart.
 *
 * Framework-free: the page builds one of these, then each frame hands it a plain
 * view (kart positions + coins) to mirror. All geometry is procedural and the
 * driver is an emoji drawn to a canvas texture, so nothing is downloaded and the
 * PWA stays offline.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeDeep } from '@shared/three/disposeDeep';
import { ARENA_RADIUS, type Coin } from '../domain/kart';

/** The rider sprite's resting height, seated in the kart's cockpit. */
const DRIVER_Y = 7.6;

// Scenery palettes (plain number lists — safe to share; materials are not, so
// those are always built per scene so one race's teardown can't free another's).
const BUNTING = [0xff5d6c, 0xffb14a, 0xffe14a, 0x53d08a, 0x4aa3ff, 0x9b6bff];
const FLOWERS = [0xff5d8f, 0xffd23f, 0xff9f45, 0x9b6bff, 0xffffff, 0x53d0ff];
const RAINBOW = [0xff5a5a, 0xff9f45, 0xffe14a, 0x5fd08a, 0x4aa3ff, 0x9b6bff];
const BALLOONS = [0xff5d6c, 0x4aa3ff, 0xffd23f, 0x53d08a];

export interface RacerLook {
  emoji: string;
  /** Body color of the little kart. */
  color: number;
}

export interface SceneKart {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface SceneView {
  karts: SceneKart[];
  coins: Coin[];
}

function emojiTexture(emoji: string): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.font = `${size * 0.78}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** Deterministic 0–1 "noise" from an index — no Math.random, so scenery is
 *  identical every race (see the determinism invariant in CLAUDE.md). */
function hash(i: number): number {
  return Math.abs(Math.sin(i * 12.9898 + 1.17) * 43758.5453) % 1;
}

/** Soft grass with scattered lighter/darker patches — not a flat checker. */
function grassTexture(): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7cc457';
  ctx.fillRect(0, 0, s, s);
  const shades = ['#74bd4f', '#84cc5e', '#6fb84a', '#8ed267'];
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = shades[Math.floor(hash(i * 7.7) * 4)];
    ctx.beginPath();
    ctx.arc(hash(i * 3.1) * s, hash(i * 1.9) * s, 4 + hash(i) * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

/** A soft pastel-rainbow gradient sky, drawn once to a canvas. */
function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#5aa9e6');
  g.addColorStop(0.42, '#8f9fe6');
  g.addColorStop(0.6, '#c07fdc');
  g.addColorStop(0.78, '#e87fb0');
  g.addColorStop(1.0, '#f0b488');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface KartObj {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  driver: THREE.Sprite;
}

export class RacerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private karts: KartObj[] = [];
  private coinTemplate: THREE.Group;
  private coins = new Map<number, THREE.Group>();
  private resizeObs: ResizeObserver | null = null;
  private camPos = new THREE.Vector3(0, 16, -30);
  private camTarget = new THREE.Vector3(); // per-frame scratch, never allocated in sync()
  private liveCoinIds = new Set<number>(); // per-frame scratch
  private disposed = false;
  private spin = 0;

  constructor(
    private container: HTMLElement,
    looks: RacerLook[],
    private followIndex: number,
    private reducedMotion = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight || 400);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = skyTexture();
    // Reaches far enough to keep the hills, peaks, and rainbow visible while
    // hazing the horizon so distant scenery reads as depth, not clutter.
    this.scene.fog = new THREE.Fog(0xdfe3ee, 340, 1050);

    // A soft indoor-style environment gives every material gentle reflections
    // and fill — the difference between "flat plastic" and "made". Baked once.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / (container.clientHeight || 400),
      0.1,
      1400,
    );

    // Env fills the shadows, so the hemisphere can come down; the sun casts
    // real soft shadows and a cool rim light peels the karts off the sky.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4f8f4a, 0.55));
    const sun = new THREE.DirectionalLight(0xfff3d0, 1.2);
    sun.position.set(70, 130, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sd = ARENA_RADIUS * 1.25;
    sun.shadow.camera.left = -sd;
    sun.shadow.camera.right = sd;
    sun.shadow.camera.top = sd;
    sun.shadow.camera.bottom = -sd;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9ec5ff, 0.5);
    rim.position.set(-80, 50, -60);
    this.scene.add(rim);

    this.buildGround();
    this.buildFenceAndBunting();
    this.buildTrees();
    this.buildHillsAndPeaks();
    this.buildFlowers();
    this.buildClouds();
    this.buildSkyDecor();
    this.coinTemplate = this.buildCoinTemplate();
    for (const look of looks) this.karts.push(this.buildKart(look));

    this.onResize = this.onResize.bind(this);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(this.onResize);
      this.resizeObs.observe(container);
    }
  }

  private buildGround() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS, 80),
      new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // A wide meadow beneath the hills so the world doesn't end at the fence.
    const meadow = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS * 6, 64),
      new THREE.MeshStandardMaterial({ color: 0x82c85a, roughness: 1 }),
    );
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.1;
    meadow.receiveShadow = true;
    this.scene.add(meadow);
  }

  /** The pink boundary fence, strung with a ring of festival pennants. */
  private buildFenceAndBunting() {
    const fence = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS, 1.4, 12, 90),
      new THREE.MeshStandardMaterial({ color: 0xff7fc4, roughness: 0.5 }),
    );
    fence.rotation.x = Math.PI / 2;
    fence.position.y = 1.4;
    fence.castShadow = true;
    this.scene.add(fence);

    const N = 72;
    const flags = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.9, 2.0, 3),
      new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }),
      N,
    );
    const cols = BUNTING.map((c) => new THREE.Color(c));
    const d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      d.position.set(Math.cos(a) * ARENA_RADIUS, 5.4 + Math.sin(i * 1.7) * 0.3, Math.sin(a) * ARENA_RADIUS);
      d.rotation.set(Math.PI, 0, 0); // point the pennant down
      d.updateMatrix();
      flags.setMatrixAt(i, d.matrix);
      flags.setColorAt(i, cols[i % cols.length]);
    }
    flags.instanceMatrix.needsUpdate = true;
    if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
    this.scene.add(flags);
  }

  /**
   * Rounded low-poly trees ringing the arena. Every tree is a trunk under three
   * faceted foliage blobs; rather than one Group per tree, each of the four
   * parts is a single InstancedMesh across all trees (one draw call each), with
   * per-tree position/scale/spin from the index — deterministic and cheap.
   */
  private buildTrees() {
    const COUNT = 26;
    const leaf = new THREE.MeshStandardMaterial({ color: 0x46a85a, roughness: 0.8 });
    const parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material; y: number }> = [
      { geo: new THREE.CylinderGeometry(1.0, 1.7, 7, 8), mat: new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 }), y: 3.5 },
      { geo: new THREE.IcosahedronGeometry(6.2, 1), mat: leaf, y: 10 },
      { geo: new THREE.IcosahedronGeometry(4.8, 1), mat: leaf, y: 13.6 },
      { geo: new THREE.IcosahedronGeometry(3.4, 1), mat: leaf, y: 16.8 },
    ];
    const meshes = parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, COUNT);
      im.castShadow = true;
      return im;
    });
    const d = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2 + hash(i * 2) * 0.22;
      const R = ARENA_RADIUS * (1.12 + hash(i * 4) * 0.5);
      const s = 0.9 + hash(i) * 0.7;
      const spin = hash(i * 3) * Math.PI * 2;
      const px = Math.cos(a) * R;
      const pz = Math.sin(a) * R;
      d.rotation.set(0, spin, 0);
      d.scale.setScalar(s);
      parts.forEach((p, j) => {
        d.position.set(px, p.y * s, pz);
        d.updateMatrix();
        meshes[j].setMatrixAt(i, d.matrix);
      });
    }
    meshes.forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im);
    });
  }

  /** Rolling green hills, then a further ring of hazy snow-capped peaks. */
  private buildHillsAndPeaks() {
    const d = new THREE.Object3D();

    const HILLS = 22;
    const hills = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshStandardMaterial({ roughness: 1 }),
      HILLS,
    );
    for (let i = 0; i < HILLS; i++) {
      const a = (i / HILLS) * Math.PI * 2 + 0.2;
      const R = ARENA_RADIUS * (1.7 + hash(i) * 0.5);
      const rad = 30 + hash(i * 2) * 36;
      d.rotation.set(0, hash(i * 7) * Math.PI, 0);
      d.position.set(Math.cos(a) * R, -6, Math.sin(a) * R);
      d.scale.set(rad, rad * (0.3 + hash(i * 5) * 0.16), rad);
      d.updateMatrix();
      hills.setMatrixAt(i, d.matrix);
      hills.setColorAt(i, new THREE.Color().setHSL(0.28, 0.5, 0.42 + hash(i) * 0.12));
    }
    hills.instanceMatrix.needsUpdate = true;
    if (hills.instanceColor) hills.instanceColor.needsUpdate = true;
    this.scene.add(hills);

    const MTN = 14;
    const cone = new THREE.ConeGeometry(1, 1, 6); // unit cone, scaled per instance
    const peaks = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), MTN);
    const caps = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.95, flatShading: true }), MTN);
    d.rotation.set(0, 0, 0);
    for (let i = 0; i < MTN; i++) {
      const a = (i / MTN) * Math.PI * 2 + 0.1;
      const R = ARENA_RADIUS * 3.9;
      const baseR = 95 + hash(i) * 55;
      const hgt = 95 + hash(i * 3) * 70;
      const cx = Math.cos(a) * R;
      const cz = Math.sin(a) * R;
      d.position.set(cx, 4, cz);
      d.scale.set(baseR, hgt, baseR);
      d.updateMatrix();
      peaks.setMatrixAt(i, d.matrix);
      peaks.setColorAt(i, new THREE.Color().setHSL(0.6, 0.22, 0.5 + hash(i) * 0.08));
      const capH = hgt * 0.22;
      const capR = baseR * 0.3;
      d.position.set(cx, 4 + hgt / 2 - capH / 2 + 1, cz);
      d.scale.set(capR, capH, capR);
      d.updateMatrix();
      caps.setMatrixAt(i, d.matrix);
    }
    peaks.instanceMatrix.needsUpdate = true;
    if (peaks.instanceColor) peaks.instanceColor.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    this.scene.add(peaks, caps);
  }

  /** Colourful blossoms scattered across the arena floor (two draw calls). */
  private buildFlowers() {
    const COUNT = 70;
    const stems = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1.6, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a9a4a, roughness: 0.9 }),
      COUNT,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.85, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      COUNT,
    );
    heads.castShadow = true;
    const cols = FLOWERS.map((c) => new THREE.Color(c));
    const d = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const a = hash(i * 2.3) * Math.PI * 2;
      const R = 14 + hash(i * 5.1) * (ARENA_RADIUS - 24);
      const fx = Math.cos(a) * R;
      const fz = Math.sin(a) * R;
      const s = 0.8 + hash(i * 4) * 0.6;
      d.rotation.set(0, hash(i * 9) * Math.PI * 2, 0);
      d.scale.setScalar(s);
      d.position.set(fx, 0.8 * s, fz);
      d.updateMatrix();
      stems.setMatrixAt(i, d.matrix);
      d.position.set(fx, 1.7 * s, fz);
      d.updateMatrix();
      heads.setMatrixAt(i, d.matrix);
      heads.setColorAt(i, cols[i % cols.length]);
    }
    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    this.scene.add(stems, heads);
  }

  /** Layered fluffy clouds — every puff is one instance of a single sphere. */
  private buildClouds() {
    const CLOUDS = 18;
    const PUFFS = 5;
    const puffs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      CLOUDS * PUFFS,
    );
    const d = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < CLOUDS; i++) {
      const a = hash(i * 2.7) * Math.PI * 2;
      const R = ARENA_RADIUS * (1.6 + hash(i) * 3);
      const cx = Math.cos(a) * R;
      const cy = 90 + hash(i * 3) * 130;
      const cz = Math.sin(a) * R;
      const cs = 0.8 + hash(i * 9) * 1.4;
      for (let j = 0; j < PUFFS; j++) {
        d.position.set(cx + (j * 10 - 20) * cs, cy + (j % 2) * 4 * cs, cz);
        d.scale.setScalar((7 + (j % 3) * 3) * cs);
        d.updateMatrix();
        puffs.setMatrixAt(k++, d.matrix);
      }
    }
    puffs.instanceMatrix.needsUpdate = true;
    this.scene.add(puffs);
  }

  /** A giant rainbow arc, a few hot-air balloons, and the sun. */
  private buildSkyDecor() {
    const rainbow = new THREE.Group();
    RAINBOW.forEach((col, i) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(150 - i * 5, 2.6, 10, 80, Math.PI),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, fog: false }),
      );
      rainbow.add(arc);
    });
    rainbow.position.set(ARENA_RADIUS * 1.2, -8, ARENA_RADIUS * 3.2);
    rainbow.rotation.y = -0.5;
    this.scene.add(rainbow);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const R = ARENA_RADIUS * (2.2 + hash(i));
      this.scene.add(this.buildBalloon(Math.cos(a) * R, 120 + hash(i * 2) * 90, Math.sin(a) * R, BALLOONS[i]));
    }

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(30, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
    );
    sun.position.set(-ARENA_RADIUS * 1.7, 165, ARENA_RADIUS * 5);
    this.scene.add(sun);
  }

  private buildBalloon(x: number, y: number, z: number, col: number): THREE.Group {
    const g = new THREE.Group();
    const envelope = new THREE.Mesh(
      new THREE.SphereGeometry(11, 20, 16),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }),
    );
    envelope.scale.y = 1.25;
    envelope.position.y = 6;
    const basket = new THREE.Mesh(
      new RoundedBoxGeometry(4, 4, 4, 3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.9 }),
    );
    basket.position.y = -12;
    g.add(envelope, basket);
    g.position.set(x, y, z);
    return g;
  }

  /**
   * A little kart, modelled from rounded parts instead of a raw box: a chassis
   * pan, a cockpit hump, a tapered nose, fenders over fat rubber tyres, a chrome
   * bumper and hubs, headlights, and a rear wing. Still 100% procedural — no
   * assets — and its wheels are groups whose axle is local X, so `sync` rolls
   * them with `rotation.x`. The chosen character rides on top as before.
   */
  private buildKart(look: RacerLook): KartObj {
    const group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.32, metalness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe6ebf2, metalness: 1, roughness: 0.16 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.5 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17171f, roughness: 0.85 });

    const pan = new THREE.Mesh(new RoundedBoxGeometry(6.4, 1.5, 9.2, 5, 0.55), paint);
    pan.position.y = 1.9;
    pan.castShadow = true;
    const hood = new THREE.Mesh(new RoundedBoxGeometry(5.0, 2.0, 5.2, 5, 0.7), paint);
    hood.position.set(0, 3.0, -1.1);
    hood.castShadow = true;
    const nose = new THREE.Mesh(new RoundedBoxGeometry(5.4, 1.4, 3.4, 5, 0.55), paint);
    nose.position.set(0, 2.1, 4.0);
    nose.scale.set(0.82, 0.85, 1);
    nose.castShadow = true;
    const seat = new THREE.Mesh(new RoundedBoxGeometry(3.0, 1.0, 2.6, 4, 0.4), dark);
    seat.position.set(0, 3.7, -0.4);
    group.add(pan, hood, nose, seat);

    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5.2, 16), chrome);
    bumper.rotation.z = Math.PI / 2;
    bumper.position.set(0, 1.7, 5.4);
    bumper.castShadow = true;
    group.add(bumper);

    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff2c0,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    });
    for (const hx of [-1.5, 1.5]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), lightMat);
      hl.position.set(hx, 2.2, 5.05);
      hl.scale.z = 0.6;
      group.add(hl);
    }

    // Fat rounded tyre + chrome hub, oriented so the wheel group's local X is
    // the axle (roll = rotation.x). Geometry is shared across this kart's wheels.
    const tyreGeo = new THREE.TorusGeometry(1.15, 0.6, 14, 24);
    const hubGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 18);
    const fenderGeo = new THREE.TorusGeometry(1.7, 0.42, 10, 20, Math.PI);
    const wheels: THREE.Object3D[] = [];
    for (const [wx, wz] of [[-3.3, 3], [3.3, 3], [-3.3, -3], [3.3, -3]] as [number, number][]) {
      const wheel = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.y = Math.PI / 2;
      tyre.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, chrome);
      hub.rotation.z = Math.PI / 2;
      hub.castShadow = true;
      wheel.add(tyre, hub);
      wheel.position.set(wx, 1.5, wz);
      wheels.push(wheel);
      group.add(wheel);

      const fender = new THREE.Mesh(fenderGeo, paint);
      fender.rotation.y = Math.PI / 2;
      fender.position.set(wx, 1.9, wz);
      fender.castShadow = true;
      group.add(fender);
    }

    const postGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10);
    for (const px of [-1.8, 1.8]) {
      const post = new THREE.Mesh(postGeo, dark);
      post.position.set(px, 3.4, -4.2);
      group.add(post);
    }
    const wing = new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.35, 1.6, 3, 0.16), paint);
    wing.position.set(0, 4.5, -4.3);
    wing.castShadow = true;
    group.add(wing);

    const driver = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: emojiTexture(look.emoji), transparent: true }),
    );
    driver.scale.set(9, 9, 1);
    driver.position.set(0, DRIVER_Y, -0.4);
    group.add(driver);
    this.scene.add(group);

    return { group, wheels, driver };
  }

  private buildCoinTemplate(): THREE.Group {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.6, 28),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, metalness: 0.75, roughness: 0.3 }),
    );
    disc.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.5, 10, 28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissiveIntensity: 0.6 }),
    );
    g.add(disc, rim);
    return g;
  }

  private makeCoin(coin: Coin): THREE.Group {
    const g = this.coinTemplate.clone(true);
    const col = new THREE.Color().setHSL(coin.hue / 360, 0.9, 0.6);
    const disc = g.children[0] as THREE.Mesh;
    const rim = g.children[1] as THREE.Mesh;
    disc.material = (disc.material as THREE.MeshStandardMaterial).clone();
    (disc.material as THREE.MeshStandardMaterial).emissive = col.clone().multiplyScalar(0.45);
    rim.material = (rim.material as THREE.MeshStandardMaterial).clone();
    (rim.material as THREE.MeshStandardMaterial).color = col;
    (rim.material as THREE.MeshStandardMaterial).emissive = col.clone().multiplyScalar(0.75);
    g.position.set(coin.x, 4, coin.z);
    this.scene.add(g);
    return g;
  }

  sync(view: SceneView, dt: number): void {
    if (this.disposed) return;
    this.spin += dt;

    view.karts.forEach((k, i) => {
      const obj = this.karts[i];
      if (!obj) return;
      obj.group.position.set(k.x, 0, k.z);
      obj.group.rotation.y = k.heading;
      const wheelSpin = k.speed * dt * 0.5;
      for (const w of obj.wheels) w.rotation.x += wheelSpin;
      // Driving is gameplay; the happy bounce is decoration.
      if (!this.reducedMotion) obj.driver.position.y = DRIVER_Y + Math.sin(this.spin * 6 + i) * 0.4;
    });

    const live = this.liveCoinIds;
    live.clear();
    for (const coin of view.coins) {
      live.add(coin.id);
      let mesh = this.coins.get(coin.id);
      if (!mesh) {
        mesh = this.makeCoin(coin);
        this.coins.set(coin.id, mesh);
      }
      mesh.position.x = coin.x;
      mesh.position.z = coin.z;
      if (!this.reducedMotion) {
        mesh.rotation.y += dt * 3;
        mesh.position.y = 4 + Math.sin(this.spin * 2.5 + coin.id) * 0.6;
      }
    }
    for (const [id, mesh] of this.coins) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.coins.delete(id);
        // Each coin owns cloned tinted materials (makeCoin) — free them.
        for (const child of mesh.children) {
          const m = (child as THREE.Mesh).material;
          if (m && !Array.isArray(m)) m.dispose();
        }
      }
    }

    // Chase camera: trail behind and above my own kart, looking a little ahead.
    const me = view.karts[this.followIndex] ?? view.karts[0];
    if (me) {
      const fx = Math.sin(me.heading);
      const fz = Math.cos(me.heading);
      const desired = this.camTarget.set(me.x - fx * 30, 18, me.z - fz * 30);
      const k = 1 - Math.pow(0.0001, dt);
      this.camPos.lerp(desired, k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(me.x + fx * 10, 4, me.z + fz * 10);
    }
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObs?.disconnect();
    // Every "Race again" builds a fresh scene, so teardown must genuinely
    // free the old one — geometries, materials, canvas textures, and the
    // WebGL context itself (browsers cap live contexts).
    disposeDeep(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
