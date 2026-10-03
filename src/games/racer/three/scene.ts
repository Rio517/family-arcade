/**
 * The three.js view for Rainbow Racer — an open sky over a sea of clouds.
 *
 * There is no arena and no edge. The world is cut into the same cells the
 * rules use (domain/sky.ts): each cell's floating islands, clouds and
 * balloons are rebuilt from its hash whenever the camera comes near and
 * dropped when it leaves, so wherever a child flies there is more sky. The
 * rainbow road and its rings are built ahead of me as I fly. The sky dome
 * and the cloud sea travel with the camera.
 *
 * Framework-free: the page builds one of these, then each frame hands it a
 * plain view (racers, coins, stars) to mirror. Everything is procedural apart
 * from the artist-made bunny, which rides a cloud (see riders.ts), so the PWA
 * stays offline.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeDeep } from '@shared/three/disposeDeep';
import {
  CELL,
  RING_RADIUS,
  cellNoise,
  cellOf,
  islandsInCell,
  trailPoint,
  trailRing,
  type Ring,
} from '../domain/sky';
import type { Flyer } from '../domain/flight';
import type { MountId } from '../domain/mounts';
import type { Coin, PowerKind, Star } from '../domain/pickups';
import { createRider, preloadRiderAssets, type CharacterId, type Rider } from './riders';

/** How many cells either side of the camera are built. */
const VIEW_CELLS = 3;
/** The cloud sea's height; racers never fly below SKY_FLOOR, well above it. */
const CLOUD_SEA_Y = -26;

const RAINBOW = [0xff5a5a, 0xff9f45, 0xffe14a, 0x5fd08a, 0x4aa3ff, 0x9b6bff];

/** How much of the rainbow road is drawn, in road points behind and ahead of me. */
const ROAD_BEHIND = 4;
const ROAD_AHEAD = 36;
/** The road runs this far below the line racers fly along, and is this wide. */
const ROAD_DROP = 4;
const ROAD_WIDTH = 13;
/** Curve samples per road point: enough that bends read smooth. */
const ROAD_SAMPLES = 6;

/** Each power-up's glow and sparkle colour, so a child learns them by colour. */
const POWER_GLOW: Record<PowerKind, number> = { grow: 0xfff0a0, wings: 0x9fd8ff, coins: 0xff9ad5 };
const POWER_SPARKLE: Record<PowerKind, number> = { grow: 0xffe066, wings: 0xa8e0ff, coins: 0xff8fd0 };
const FLOWERS = [0xff5d8f, 0xffd23f, 0xff9f45, 0x9b6bff, 0xffffff, 0x53d0ff];
const BALLOONS = [0xff5d6c, 0x4aa3ff, 0xffd23f, 0x53d08a, 0xc38bff];

export interface RacerLook {
  /** The racer's picture, shown in the HUD next to the score. */
  portrait: string;
  /** The racer's colour: dress, wings, mane or cloud tint. */
  color: number;
  /** Which character flies. */
  character: CharacterId;
  /** What a princess or a bunny rides; absent means their usual ride. */
  mount?: MountId;
  /** Shown over the racer's head (rivals and the friend); empty for me. */
  label: string;
}

export interface SceneView {
  karts: Flyer[];
  coins: Coin[];
  stars: Star[];
}

/** A soft pastel sky, horizon warm, zenith blue. */
function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#2f7fe0');
  g.addColorStop(0.3, '#5fa6f2');
  g.addColorStop(0.46, '#a9d2fb');
  g.addColorStop(0.52, '#ffd6ec');
  g.addColorStop(0.58, '#c9e2ff');
  g.addColorStop(1.0, '#9ec8f4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft white cloud tops with faint lilac hollows, tiling. */
function cloudSeaTexture(): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#dfe6fb';
  ctx.fillRect(0, 0, s, s);
  const puff = (x: number, y: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    // Draw wrapped so the tile repeats seamlessly.
    for (const dx of [-s, 0, s]) {
      for (const dy of [-s, 0, s]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  // Lilac hollows between the cloud tops, then the tops, then a bright rim
  // on each top — enough shape that flying low reads as clouds, not a floor.
  for (let i = 0; i < 120; i++) {
    const n = (k: number) => cellNoise(i, k, 91);
    puff(n(1) * s, n(2) * s, 30 + n(3) * 60, 'rgba(140,150,225,0.5)');
  }
  for (let i = 0; i < 150; i++) {
    const n = (k: number) => cellNoise(i, k, 92);
    puff(n(1) * s, n(2) * s, 16 + n(3) * 44, 'rgba(255,255,255,0.9)');
  }
  for (let i = 0; i < 150; i++) {
    const n = (k: number) => cellNoise(i, k, 92);
    puff(n(1) * s - 6, n(2) * s - 8, 8 + n(3) * 20, 'rgba(255,255,255,1)');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A name tag that always faces the camera. */
function labelSprite(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 34px system-ui, -apple-system, sans-serif';
  const w = Math.min(248, ctx.measureText(text).width + 36);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 24);
  ctx.fill();
  ctx.fillStyle = `#${new THREE.Color(color).multiplyScalar(0.7).getHexString()}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Screen-sized, so a rival right beside the camera doesn't fill it.
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }),
  );
  sprite.scale.set(0.16, 0.04, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A five-pointed star shape, extruded. */
function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 4.2 : 1.9;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.2,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/** One feathered wing, root at the origin, reaching out along +x. */
function wingGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(1.5, 3.4, 5, 4.6, 7.6, 3.9);
  // The trailing edge: three soft feather scallops back to the root.
  shape.quadraticCurveTo(6.5, 2.6, 7.1, 1.7);
  shape.quadraticCurveTo(5.5, 1.1, 5.8, 0.1);
  shape.quadraticCurveTo(4.1, -0.1, 4.0, -1.1);
  shape.quadraticCurveTo(2.0, -0.9, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.5,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.25,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -0.25);
  return geo;
}

/** Shared geometry and materials for the three power-up kinds. */
interface PowerKit {
  star: THREE.BufferGeometry;
  starMat: THREE.Material;
  wing: THREE.BufferGeometry;
  wingMat: THREE.Material;
  heart: THREE.BufferGeometry;
  heartMat: THREE.Material;
  coin: THREE.BufferGeometry;
  coinMat: THREE.Material;
  glows: Record<PowerKind, THREE.SpriteMaterial>;
}

interface RacerObj {
  /** Positioned and turned by the scene. */
  holder: THREE.Group;
  rider: Rider;
  label: THREE.Sprite | null;
  /** A soft glow while bursting or powered up. */
  glow: THREE.Sprite;
  /** The racer the camera follows: its glow stays small and behind it. */
  mine: boolean;
}

/** Shared geometry and materials for everything built per cell. */
interface Kit {
  islandTop: THREE.BufferGeometry;
  islandRock: THREE.BufferGeometry;
  grass: THREE.Material;
  rock: THREE.Material;
  trunk: THREE.BufferGeometry;
  trunkMat: THREE.Material;
  canopy: THREE.BufferGeometry;
  canopyMats: THREE.Material[];
  flower: THREE.BufferGeometry;
  flowerMats: THREE.Material[];
  puff: THREE.BufferGeometry;
  cloudMat: THREE.Material;
  ringBands: THREE.BufferGeometry[];
  ringMats: THREE.Material[];
  balloon: THREE.BufferGeometry;
  balloonMats: THREE.Material[];
  basket: THREE.BufferGeometry;
  basketMat: THREE.Material;
}

interface CellObj {
  group: THREE.Group;
}

/**
 * Load what the racers are made of (the bunny's model) before building a
 * scene, so nobody starts the race as a stand-in. Never rejects: a model
 * that fails to load leaves its procedural stand-in in place.
 */
export function loadRacerAssets(): Promise<void> {
  return preloadRiderAssets();
}

export class RacerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private racers: RacerObj[] = [];
  private kit: Kit;
  private cells = new Map<string, CellObj>();
  private skyDome: THREE.Mesh;
  private cloudSea: THREE.Mesh;
  private cloudTex: THREE.Texture;
  private coinTemplate: THREE.Group;
  private coins = new Map<number, THREE.Group>();
  private power: PowerKit;
  private stars = new Map<number, THREE.Group>();
  /** The rainbow road near me, rebuilt as I move along it. */
  private road: THREE.Mesh;
  private roadFrom = -1;
  private roadRings = new Map<string, THREE.Group>();
  /** Points the way back to the road when I have flown off it. */
  private roadArrow: THREE.Group;
  private sparkles: Array<{ sprite: THREE.Sprite; life: number; vel: THREE.Vector3 }> = [];
  private sparkleMat: THREE.SpriteMaterial;
  private resizeObs: ResizeObserver | null = null;
  private camPos = new THREE.Vector3(0, 40, -34);
  private camLook = new THREE.Vector3(0, 30, 10);
  private scratch = new THREE.Vector3();
  private live = new Set<number>();
  private lastRing: string | null = null;
  private ringFlash = new Map<string, number>();
  private disposed = false;
  private time = 0;

  constructor(
    private container: HTMLElement,
    looks: RacerLook[],
    private followIndex: number,
    private reducedMotion = false,
    /** Builds each racer's character. The game always uses today's riders;
     *  the cast preview passes another character kit to see it in the sky. */
    private makeRider: typeof createRider = createRider,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight || 400);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    container.appendChild(this.renderer.domElement);

    // Env light fills the soft shading; there are no shadow maps in an open
    // sky — nothing is near enough the ground to cast one that reads.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    // Fog the colour of the horizon, so far things melt into the sky.
    this.scene.fog = new THREE.Fog(0xb9dcff, 300, 900);
    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / (container.clientHeight || 400), 0.5, 1600);

    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0xa9a6e6, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
    sun.position.set(80, 140, 60);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa9cbff, 0.55);
    rim.position.set(-90, 40, -70);
    this.scene.add(rim);

    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.skyDome.renderOrder = -1;
    this.scene.add(this.skyDome);

    this.cloudTex = cloudSeaTexture();
    this.cloudTex.repeat.set(14, 14);
    this.cloudSea = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ map: this.cloudTex, roughness: 1, color: 0xf2f4ff }),
    );
    this.cloudSea.rotation.x = -Math.PI / 2;
    this.cloudSea.position.y = CLOUD_SEA_Y;
    this.scene.add(this.cloudSea);

    // Uploaded premultiplied, as the canvas already holds it: un-premultiplying
    // WebKit's dithered, nearly transparent gradient pixels scatters coloured
    // specks across a sprite this large.
    const sunTex = glowTexture();
    sunTex.premultiplyAlpha = true;
    const sunDisc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunTex,
        color: 0xfff4cf,
        fog: false,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        // Tone-mapped, its warm centre would come out darker than its rim.
        toneMapped: false,
        opacity: 0.9,
      }),
    );
    sunDisc.scale.set(120, 120, 1);
    sunDisc.position.set(-500, 420, 900);
    sunDisc.name = 'sun';
    this.scene.add(sunDisc);

    this.kit = this.buildKit();
    this.coinTemplate = this.buildCoinTemplate();
    this.power = this.buildPowerKit();
    this.road = new THREE.Mesh(
      new THREE.BufferGeometry(),
      // Not tone-mapped: the stripes keep their full colour over white cloud.
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.scene.add(this.road);
    this.updateRoad(0);
    this.roadArrow = this.buildRoadArrow();
    this.scene.add(this.roadArrow);
    this.sparkleMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Riders are built from models already loaded — see `loadRacerAssets`.
    looks.forEach((look, i) => this.racers.push(this.buildRacer(look, i)));

    this.updateCells(0, 0);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
    }
  }

  private buildKit(): Kit {
    const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const ringBands = RAINBOW.map((_, i) => new THREE.TorusGeometry(RING_RADIUS + 1.6 - i * 0.55, 0.32, 8, 48));
    return {
      islandTop: new THREE.CylinderGeometry(1, 0.96, 1.4, 28),
      islandRock: new THREE.ConeGeometry(0.96, 1.9, 9),
      grass: std(0x8fd46a),
      rock: std(0xc9b2a0, { flatShading: true }),
      trunk: new THREE.CylinderGeometry(0.45, 0.6, 5, 7),
      trunkMat: std(0x9a6b4a),
      canopy: new THREE.SphereGeometry(3.2, 14, 10),
      canopyMats: [std(0x67c46b), std(0xff9cc8), std(0x9fdc7a)],
      flower: new THREE.SphereGeometry(0.7, 8, 6),
      flowerMats: FLOWERS.map((c) => std(c, { roughness: 0.6 })),
      puff: new THREE.SphereGeometry(1, 14, 10),
      cloudMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xf4f0ff, emissiveIntensity: 0.25 }),
      ringBands,
      ringMats: RAINBOW.map(
        (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.4 }),
      ),
      balloon: new THREE.SphereGeometry(6, 18, 14),
      balloonMats: BALLOONS.map((c) => std(c, { roughness: 0.45 })),
      basket: new RoundedBoxGeometry(2.4, 2.2, 2.4, 2, 0.4),
      basketMat: std(0x9a6b3f),
    };
  }

  /** Everything in one sky cell, from its hash. Shared kit, own group. */
  private buildCell(cx: number, cz: number): CellObj {
    const k = this.kit;
    const group = new THREE.Group();
    const n = (salt: number) => cellNoise(cx, cz, salt);

    for (const isl of islandsInCell(cx, cz)) {
      const top = new THREE.Mesh(k.islandTop, k.grass);
      top.scale.set(isl.radius, 3, isl.radius);
      top.position.set(isl.x, isl.y, isl.z);
      const rock = new THREE.Mesh(k.islandRock, k.rock);
      rock.scale.set(isl.radius, isl.radius * 1.1, isl.radius);
      rock.rotation.x = Math.PI;
      rock.position.set(isl.x, isl.y - 2 - isl.radius * 1.0, isl.z);
      group.add(top, rock);
      const trees = 1 + Math.floor(isl.kind * 3);
      for (let t = 0; t < trees; t++) {
        const a = isl.kind * 20 + t * 2.1;
        const r = isl.radius * 0.55 * ((t + 1) / (trees + 1));
        const tx = isl.x + Math.cos(a) * r;
        const tz = isl.z + Math.sin(a) * r;
        const trunk = new THREE.Mesh(k.trunk, k.trunkMat);
        trunk.position.set(tx, isl.y + 3.8, tz);
        const canopy = new THREE.Mesh(k.canopy, k.canopyMats[(t + Math.floor(isl.kind * 7)) % k.canopyMats.length]);
        canopy.position.set(tx, isl.y + 8, tz);
        group.add(trunk, canopy);
      }
      for (let f = 0; f < 10; f++) {
        const a = f * 2.39996 + isl.kind * 9;
        const r = isl.radius * 0.85 * Math.sqrt((f + 0.5) / 10);
        const flower = new THREE.Mesh(k.flower, k.flowerMats[(f + Math.floor(isl.kind * 5)) % k.flowerMats.length]);
        flower.position.set(isl.x + Math.cos(a) * r, isl.y + 1.8, isl.z + Math.sin(a) * r);
        group.add(flower);
      }
    }

    // Loose clouds in the racing band, and big soft ones below it.
    const clouds = Math.floor(n(40) * 3);
    for (let c = 0; c < clouds; c++) {
      const cloud = new THREE.Group();
      const puffs = 4 + Math.floor(n(41 + c) * 4);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(k.puff, k.cloudMat);
        const s = 5 + cellNoise(cx * 7 + p, cz * 3 + c, 42) * 5;
        puff.scale.set(s * 1.3, s, s);
        puff.position.set((p - puffs / 2) * 6, cellNoise(cx + p, cz, 43) * 3, cellNoise(cx, cz + p, 44) * 5 - 2);
        cloud.add(puff);
      }
      // Below the racers, or high above them — never in the band where a
      // cloud would hide the child's own racer from the camera.
      const low = n(45 + c) < 0.7;
      cloud.position.set(
        cx * CELL + n(46 + c) * CELL,
        low ? -10 + n(47 + c) * 8 : 115 + n(48 + c) * 40,
        cz * CELL + n(49 + c) * CELL,
      );
      cloud.rotation.y = n(50 + c) * Math.PI;
      group.add(cloud);
    }

    if (n(60) < 0.18) {
      const b = new THREE.Group();
      const envelope = new THREE.Mesh(k.balloon, k.balloonMats[Math.floor(n(61) * k.balloonMats.length)]);
      envelope.scale.y = 1.2;
      const basket = new THREE.Mesh(k.basket, k.basketMat);
      basket.position.y = -9.5;
      b.add(envelope, basket);
      b.position.set(cx * CELL + n(62) * CELL, 105 + n(63) * 40, cz * CELL + n(64) * CELL);
      group.add(b);
    }

    this.scene.add(group);
    return { group };
  }

  /**
   * A rainbow ring: the six bands and nothing else. It has no glow of its
   * own — the camera flies through every ring right behind the racer, and a
   * glow filling the ring would white out the picture just then.
   */
  private makeRing(r: Ring): THREE.Group {
    const k = this.kit;
    const ring = new THREE.Group();
    k.ringBands.forEach((geo, i) => ring.add(new THREE.Mesh(geo, k.ringMats[i])));
    ring.position.set(r.x, r.y, r.z);
    ring.rotation.y = r.heading;
    return ring;
  }

  /** A fat pink arrow, flat, tip along +z, tilted up so the camera sees its face. */
  private buildRoadArrow(): THREE.Group {
    const shape = new THREE.Shape();
    shape.moveTo(0, 3.4);
    shape.lineTo(2.8, 0.4);
    shape.lineTo(1.1, 0.4);
    shape.lineTo(1.1, -2.6);
    shape.lineTo(-1.1, -2.6);
    shape.lineTo(-1.1, 0.4);
    shape.lineTo(-2.8, 0.4);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.6,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.2,
      bevelSegments: 1,
    });
    geo.rotateX(Math.PI / 2);
    const arrow = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0, toneMapped: false }),
    );
    arrow.rotation.x = -0.55;
    const group = new THREE.Group();
    group.add(arrow);
    group.visible = false;
    return group;
  }

  /**
   * Off the road, an arrow floats ahead of me pointing at where the road goes
   * next; back on it, the arrow fades away.
   */
  private updateRoadArrow(me: Flyer, dt: number): void {
    const near = trailPoint(me.trail);
    const off = Math.hypot(near.x - me.x, near.z - me.z);
    const ahead = trailPoint(me.trail + 3);
    const arrow = this.roadArrow.children[0] as THREE.Mesh;
    const mat = arrow.material as THREE.MeshBasicMaterial;
    const want = off > 38 ? 0.95 : 0;
    mat.opacity += (want - mat.opacity) * Math.min(1, dt * 4);
    this.roadArrow.visible = mat.opacity > 0.02;
    if (!this.roadArrow.visible) return;
    const fx = Math.sin(me.heading);
    const fz = Math.cos(me.heading);
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 4) * 0.6;
    this.roadArrow.position.set(me.x + fx * 15, me.y + 8 + bob, me.z + fz * 15);
    this.roadArrow.rotation.y = Math.atan2(ahead.x - this.roadArrow.position.x, ahead.z - this.roadArrow.position.z);
  }

  /**
   * The rainbow road: a six-stripe ribbon under the line the road rings sit
   * on, from a little behind me to well ahead, faded at both ends. Rebuilt
   * when I have moved a few road points along it, with the rings over it.
   */
  private updateRoad(at: number): void {
    const from = Math.max(0, Math.floor(at) - ROAD_BEHIND);
    if (this.roadFrom >= 0 && Math.abs(from - this.roadFrom) < 3) return;
    this.roadFrom = from;
    const span = ROAD_BEHIND + ROAD_AHEAD;
    const to = from + span;
    const pts: THREE.Vector3[] = [];
    for (let i = from; i <= to; i++) {
      const p = trailPoint(i);
      pts.push(new THREE.Vector3(p.x, p.y - ROAD_DROP, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const n = span * ROAD_SAMPLES;
    const stripes = RAINBOW.length;
    const pos = new Float32Array((n + 1) * stripes * 2 * 3);
    const col = new Float32Array((n + 1) * stripes * 2 * 4);
    const index: number[] = [];
    const colour = new THREE.Color();
    const at3 = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let s = 0; s <= n; s++) {
      const u = s / n;
      curve.getPointAt(u, at3);
      curve.getTangentAt(u, tan);
      // Across the road, level, whichever way it runs.
      const len = Math.hypot(tan.x, tan.z) || 1;
      const sx = tan.z / len;
      const sz = -tan.x / len;
      const d = u * span;
      // The start of the road is solid; anywhere else it fades in behind me.
      const fadeIn = from === 0 ? 1 : d / 2.5;
      const alpha = 0.82 * Math.max(0, Math.min(1, fadeIn, (span - d) / 10));
      for (let k = 0; k < stripes; k++) {
        colour.setHex(RAINBOW[k]);
        for (let e = 0; e < 2; e++) {
          const across = ((k + e) / stripes - 0.5) * ROAD_WIDTH;
          const v = (s * stripes + k) * 2 + e;
          pos[v * 3] = at3.x + sx * across;
          pos[v * 3 + 1] = at3.y;
          pos[v * 3 + 2] = at3.z + sz * across;
          col.set([colour.r, colour.g, colour.b, alpha], v * 4);
        }
        if (s > 0) {
          const a = ((s - 1) * stripes + k) * 2;
          const b = (s * stripes + k) * 2;
          index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(index);
    this.road.geometry.dispose();
    this.road.geometry = geo;

    const want = new Set<string>();
    for (let i = from; i <= to; i++) {
      const r = trailRing(i);
      if (!r) continue;
      want.add(r.id);
      if (this.roadRings.has(r.id)) continue;
      const ring = this.makeRing(r);
      this.scene.add(ring);
      this.roadRings.set(r.id, ring);
    }
    for (const [id, ring] of this.roadRings) {
      if (want.has(id)) continue;
      this.scene.remove(ring);
      this.roadRings.delete(id);
    }
  }

  /** Build the cells near the camera and drop the ones left behind. */
  private updateCells(x: number, z: number): void {
    const cx = cellOf(x);
    const cz = cellOf(z);
    const want = new Set<string>();
    for (let dx = -VIEW_CELLS; dx <= VIEW_CELLS; dx++) {
      for (let dz = -VIEW_CELLS; dz <= VIEW_CELLS; dz++) {
        const key = `${cx + dx}:${cz + dz}`;
        want.add(key);
        if (!this.cells.has(key)) this.cells.set(key, this.buildCell(cx + dx, cz + dz));
      }
    }
    for (const [key, cell] of this.cells) {
      if (want.has(key)) continue;
      this.scene.remove(cell.group);
      this.cells.delete(key);
    }
  }

  private buildRacer(look: RacerLook, i: number): RacerObj {
    const holder = new THREE.Group();
    const rider = this.makeRider(look.character, look.color, {
      reducedMotion: this.reducedMotion,
      seed: i + 1,
      mount: look.mount,
    });
    holder.add(rider.group);
    let label: THREE.Sprite | null = null;
    if (look.label) {
      label = labelSprite(look.label, look.color);
      label.position.y = 10;
      holder.add(label);
    }
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: look.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const mine = i === this.followIndex;
    // My own glow sits just beyond me, so from the chase camera my racer
    // hides its middle and it reads as a halo, never a haze over the view.
    if (mine) glow.position.set(0, 2, 5);
    holder.add(glow);
    this.scene.add(holder);
    return { holder, rider, label, glow, mine };
  }

  private buildCoinTemplate(): THREE.Group {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.7, 28),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, metalness: 0.35, roughness: 0.35 }),
    );
    disc.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.55, 10, 28),
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
    const discMat = (disc.material as THREE.MeshStandardMaterial).clone();
    discMat.emissive = col.clone().multiplyScalar(0.45);
    disc.material = discMat;
    const rimMat = (rim.material as THREE.MeshStandardMaterial).clone();
    rimMat.color = col;
    rimMat.emissive = col.clone().multiplyScalar(0.75);
    rim.material = rimMat;
    g.position.set(coin.x, coin.y, coin.z);
    this.scene.add(g);
    return g;
  }

  private buildPowerKit(): PowerKit {
    const glow = (color: number) =>
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    return {
      star: starGeometry(),
      starMat: new THREE.MeshStandardMaterial({
        color: 0xffd34d,
        emissive: 0xffb300,
        emissiveIntensity: 0.9,
        metalness: 0.3,
        roughness: 0.35,
      }),
      wing: wingGeometry(),
      wingMat: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x7cc4ff,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      }),
      heart: new THREE.SphereGeometry(1.3, 16, 12),
      heartMat: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x4aa3ff, emissiveIntensity: 0.8 }),
      coin: new THREE.CylinderGeometry(2.3, 2.3, 0.7, 24),
      coinMat: new THREE.MeshStandardMaterial({
        color: 0xffd54a,
        emissive: 0xffa000,
        emissiveIntensity: 0.45,
        metalness: 0.35,
        roughness: 0.35,
      }),
      glows: { grow: glow(POWER_GLOW.grow), wings: glow(POWER_GLOW.wings), coins: glow(POWER_GLOW.coins) },
    };
  }

  /**
   * A power-up, drawn by kind: a gold star (grow), a pair of white wings
   * (wings), a fan of three coins (coins). Child 0 spins; child 1 is its glow.
   */
  private makeStar(star: Star): THREE.Group {
    const kind = star.kind ?? 'grow';
    const k = this.power;
    const g = new THREE.Group();
    const body = new THREE.Group();
    if (kind === 'wings') {
      for (const side of [1, -1]) {
        const wing = new THREE.Mesh(k.wing, k.wingMat);
        wing.position.x = side * 0.6;
        wing.scale.x = side;
        wing.rotation.z = side * 0.15;
        body.add(wing);
      }
      body.add(new THREE.Mesh(k.heart, k.heartMat));
      body.position.y = -1.2;
    } else if (kind === 'coins') {
      [-1, 0, 1].forEach((i) => {
        const coin = new THREE.Mesh(k.coin, k.coinMat);
        coin.rotation.set(Math.PI / 2, 0, -i * 0.45);
        coin.position.set(i * 2.6, i === 0 ? 1 : 0, i * -0.4);
        body.add(coin);
      });
    } else {
      body.add(new THREE.Mesh(k.star, k.starMat));
    }
    g.add(body);
    const glow = new THREE.Sprite(k.glows[kind]);
    glow.scale.set(13, 13, 1);
    g.add(glow);
    g.userData.kind = kind;
    g.position.set(star.x, star.y, star.z);
    this.scene.add(g);
    return g;
  }

  /** A little burst of sparkles where something was collected. */
  private burst(at: THREE.Vector3, color: number, count: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const mat = this.sparkleMat.clone();
      mat.color.set(color);
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(at);
      sprite.scale.setScalar(3);
      const a = (i / count) * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 18, 8 + (i % 3) * 5, Math.sin(a) * 18);
      this.scene.add(sprite);
      this.sparkles.push({ sprite, life: 0.6, vel });
    }
  }

  /**
   * Rainbow sparkles thrown outward from a ring's rim, in the ring's own
   * plane — out toward the edges of the picture, away from where I look.
   */
  private ringSparkles(ring: THREE.Group): void {
    if (this.reducedMotion) return;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(ring.quaternion);
      const mat = this.sparkleMat.clone();
      mat.color.setHex(RAINBOW[i % RAINBOW.length]);
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(ring.position).addScaledVector(out, RING_RADIUS + 1);
      sprite.scale.setScalar(2.5);
      this.scene.add(sprite);
      this.sparkles.push({ sprite, life: 0.6, vel: out.multiplyScalar(16) });
    }
  }

  sync(view: SceneView, dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    const me = view.karts[this.followIndex] ?? view.karts[0];

    view.karts.forEach((k, i) => {
      const obj = this.racers[i];
      if (!obj) return;
      obj.holder.position.set(k.x, k.y, k.z);
      obj.holder.rotation.y = k.heading;
      obj.rider.update(dt, {
        speed: k.speed,
        bank: k.bank,
        climb: k.climb,
        tier: k.tier,
        boosting: k.burst > 0,
        // Full wings until the last second, then they fold back.
        wings: Math.min(1, k.wingTime),
      });
      const powered = k.tier > 0 || k.wingTime > 0;
      const glowing = obj.mine
        ? k.burst > 0 ? 0.3 : powered ? 0.1 + 0.05 * k.tier : 0
        : k.burst > 0 ? 0.45 : powered ? 0.16 + 0.07 * k.tier : 0;
      const mat = obj.glow.material as THREE.SpriteMaterial;
      mat.opacity += (glowing - mat.opacity) * Math.min(1, dt * 6);
      obj.glow.scale.setScalar(obj.mine ? 11 + 3 * k.tier : 18 + 6 * k.tier);
      if (obj.label) obj.label.position.y = 10 + 2.5 * k.tier;
    });

    // Coins: spin, bob, and a sparkle when one of them leaves near me.
    this.live.clear();
    for (const coin of view.coins) {
      this.live.add(coin.id);
      let mesh = this.coins.get(coin.id);
      if (!mesh) {
        mesh = this.makeCoin(coin);
        this.coins.set(coin.id, mesh);
      }
      mesh.position.set(coin.x, coin.y, coin.z);
      if (!this.reducedMotion) {
        mesh.rotation.y += dt * 3;
        mesh.position.y = coin.y + Math.sin(this.time * 2.5 + coin.id) * 0.8;
      }
    }
    for (const [id, mesh] of this.coins) {
      if (this.live.has(id)) continue;
      if (me && mesh.position.distanceTo(this.scratch.set(me.x, me.y, me.z)) < 40) {
        const rim = mesh.children[1] as THREE.Mesh;
        this.burst(mesh.position, (rim.material as THREE.MeshStandardMaterial).color.getHex(), 8);
      }
      this.scene.remove(mesh);
      this.coins.delete(id);
      for (const child of mesh.children) ((child as THREE.Mesh).material as THREE.Material).dispose();
    }

    this.live.clear();
    for (const star of view.stars) {
      this.live.add(star.id);
      let mesh = this.stars.get(star.id);
      if (!mesh) {
        mesh = this.makeStar(star);
        this.stars.set(star.id, mesh);
      }
      mesh.position.set(star.x, star.y, star.z);
      if (!this.reducedMotion) {
        // A star spins; wings and coins sway, so their faces stay readable.
        const body = mesh.children[0];
        if (mesh.userData.kind === 'grow') body.rotation.y += dt * 2.2;
        else body.rotation.y = Math.sin(this.time * 1.6 + star.id) * 0.55;
        mesh.position.y = star.y + Math.sin(this.time * 2 + star.id) * 1.2;
      }
    }
    for (const [id, mesh] of this.stars) {
      if (this.live.has(id)) continue;
      if (me && mesh.position.distanceTo(this.scratch.set(me.x, me.y, me.z)) < 40) {
        const kind = (mesh.userData.kind ?? 'grow') as PowerKind;
        this.burst(mesh.position, POWER_SPARKLE[kind], kind === 'coins' ? 20 : 14);
      }
      this.scene.remove(mesh);
      this.stars.delete(id);
    }

    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.life -= dt;
      s.sprite.position.addScaledVector(s.vel, dt);
      (s.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, s.life / 0.6);
      if (s.life <= 0) {
        this.scene.remove(s.sprite);
        (s.sprite.material as THREE.Material).dispose();
        this.sparkles.splice(i, 1);
      }
    }

    if (!me) return;

    // Rings turn slowly, and pop and throw rainbow sparkles off their rim
    // when I fly through one.
    if (me.lastRing && me.lastRing !== this.lastRing) {
      this.lastRing = me.lastRing;
      this.ringFlash.set(me.lastRing, 1);
      const ring = this.roadRings.get(me.lastRing);
      if (ring) this.ringSparkles(ring);
    }
    for (const [id, ring] of this.roadRings) {
      const flash = this.ringFlash.get(id) ?? 0;
      if (!this.reducedMotion) ring.children.forEach((c, i) => (c.rotation.z = this.time * (0.4 + i * 0.05)));
      ring.scale.setScalar(1 + flash * 0.2);
    }
    for (const [id, f] of this.ringFlash) {
      const next = f - dt * 1.5;
      if (next <= 0) this.ringFlash.delete(id);
      else this.ringFlash.set(id, next);
    }

    this.updateCells(me.x, me.z);
    this.updateRoad(me.trail);
    this.updateRoadArrow(me, dt);

    // Chase camera: behind, a little above, looking ahead. It leans into turns
    // and pulls back a touch at speed, so a burst feels fast.
    const fx = Math.sin(me.heading);
    const fz = Math.cos(me.heading);
    const back = 21 + me.tier * 3.5 + (me.burst > 0 ? 3 : 0);
    this.scratch.set(me.x - fx * back, me.y + 6.5 + me.tier * 1.5 - me.climb * 3, me.z - fz * back);
    const k = 1 - Math.pow(0.0005, dt);
    this.camPos.lerp(this.scratch, k);
    this.scratch.set(me.x + fx * 16, me.y + 2 + me.climb * 6, me.z + fz * 16);
    this.camLook.lerp(this.scratch, k);
    this.camera.position.copy(this.camPos);
    // A small lean into turns: enough to feel, not enough to make anyone dizzy.
    const roll = this.reducedMotion ? 0 : me.bank * 0.05;
    this.camera.up.set(-roll * Math.cos(me.heading), 1, roll * Math.sin(me.heading));
    this.camera.lookAt(this.camLook);
    const fov = me.burst > 0 && !this.reducedMotion ? 66 : 62;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    // The dome and the cloud sea travel with the camera; the sea's texture
    // moves the other way so the clouds stay where they are in the world.
    this.skyDome.position.copy(this.camera.position);
    this.cloudSea.position.x = this.camera.position.x;
    this.cloudSea.position.z = this.camera.position.z;
    this.cloudTex.offset.set(this.camera.position.x / 300, -this.camera.position.z / 300);
    const sun = this.scene.getObjectByName('sun');
    if (sun) sun.position.set(this.camera.position.x - 500, 420, this.camera.position.z + 900);
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObs?.disconnect();
    for (const r of this.racers) r.rider.dispose();
    for (const mesh of this.coins.values()) {
      for (const child of mesh.children) ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
    // Riders were freed by their own dispose; take them out before the sweep.
    for (const r of this.racers) r.holder.remove(r.rider.group);
    disposeDeep(this.scene);
    const k = this.kit;
    for (const v of Object.values(k)) {
      const list = Array.isArray(v) ? v : [v];
      for (const item of list) (item as { dispose?: () => void }).dispose?.();
    }
    const pk = this.power;
    for (const v of [pk.star, pk.starMat, pk.wing, pk.wingMat, pk.heart, pk.heartMat, pk.coin, pk.coinMat]) v.dispose();
    for (const glow of Object.values(pk.glows)) {
      glow.map?.dispose();
      glow.dispose();
    }
    this.sparkleMat.map?.dispose();
    this.sparkleMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** A soft round glow, shared by the sun, stars, sparkles and burst halos. */
function glowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}
