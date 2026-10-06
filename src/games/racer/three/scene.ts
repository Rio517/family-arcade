/**
 * The three.js view for Rainbow Racer — an open sky over a sea of clouds.
 *
 * There is no arena and no edge. The world is cut into the same cells the
 * rules use (domain/sky.ts): each cell's floating islands and cloud banks
 * (domain/scenery.ts) and its balloons are rebuilt from its hash whenever
 * the camera comes near and dropped when it leaves, so wherever a child
 * flies there is more sky. Each
 * cell bakes into one or two meshes (world.ts); how an island looks comes
 * from an island source (islands.ts). The rainbow road and its rings are built ahead of me as I fly
 * (road.ts). The sky dome and the cloud sea travel with the camera.
 *
 * Framework-free: the page builds one of these, then each frame hands it a
 * plain view (racers, coins, stars) to mirror. Everything is procedural,
 * the racers included (see riders.ts), so the PWA stays offline.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeDeep } from '@shared/three/disposeDeep';
import { CLOUD_SEA_Y } from '../domain/scenery';
import { CELL, RING_RADIUS, cellOf, trailPoint, trailRing, type Ring } from '../domain/sky';
import type { Flyer } from '../domain/flight';
import type { MountId } from '../domain/mounts';
import type { Coin, PowerKind, Star } from '../domain/pickups';
import { coinGeometry, coinMaterial } from './coin';
import { codeIslands, type IslandSource } from './islands';
import { createRider, type CharacterId, type Rider } from './riders';
import { ROAD_DROP, ROAD_WIDTH, ringGeometry, ringMaterial, roadGeometries, roadGlowMaterial, roadMaterial, STRIPES, type RoadSee } from './road';
import { HAZE, HAZE_FAR, HAZE_NEAR, cloudSeaTexture, glossTexture, skyTexture } from './skyLook';
import { cellSteps, createWorldKit, disposeCell, disposeWorldKit, flowFalls, type WorldKit } from './world';

/** How many cells either side of the middle of the built square. */
const VIEW_CELLS = 3;
/** The built square sits this far ahead of the camera: the camera only looks forward. */
const VIEW_AHEAD = CELL * 1.4;
/** The most time a frame spends building sky cells, in milliseconds; a cell takes several frames. */
const BUILD_BUDGET_MS = 1.5;

/** A cell shows its full-detail version within this distance of the camera, its cheap one past this. */
/** How far from the road's surface I am before it starts to turn see-through, and when it is wholly so. */
const SEE_FROM = 1;
const SEE_FULL = 4;
/** Once see-through, the depth it holds on to a little longer. */
const SEE_HOLD = 0.4;
const NEAR_IN = 115;
const NEAR_OUT = 140;

/** The rings' sparkle colours, outside band to inside. */
const RAINBOW = STRIPES.map((c) => c.getHex());

/** A ring shows its full geometry within this distance of the camera, a lighter one past it. */
const RING_NEAR = 110;

/** How much of the rainbow road is drawn, in road points behind and ahead of me. */
const ROAD_BEHIND = 4;
const ROAD_AHEAD = 36;

/** Each power-up's glow and sparkle colour, so a child learns them by colour. */
const POWER_GLOW: Record<PowerKind, number> = { grow: 0xfff0a0, wings: 0x9fd8ff, coins: 0xff9ad5 };
const POWER_SPARKLE: Record<PowerKind, number> = { grow: 0xffe066, wings: 0xa8e0ff, coins: 0xff8fd0 };

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

/** One sky cell in two versions: cheap for the haze, and the full one near the camera. */
interface CellObj {
  cx: number;
  cz: number;
  /** By level; level 0 is always there. */
  v: Array<THREE.Group | null>;
}

/** A cell version being built a few steps a frame. */
interface BuildJob {
  key: string;
  cx: number;
  cz: number;
  level: number;
  steps: Generator<void, THREE.Group>;
}

/** Shared geometry and materials for the track: rings and coins. */
interface Kit {
  gloss: THREE.Texture;
  ring: THREE.BufferGeometry;
  /** The lighter ring for the distance. */
  ringFar: THREE.BufferGeometry;
  ringMat: THREE.Material;
  coin: THREE.BufferGeometry;
  coinMat: THREE.Material;
}

export class RacerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private racers: RacerObj[] = [];
  private kit: Kit;
  private world: WorldKit;
  /** What the floating islands look like. */
  private islands: IslandSource = codeIslands();
  /** The cell version being built right now. */
  private job: BuildJob | null = null;
  private cells = new Map<string, CellObj>();
  /** Cells wanted but not built yet, nearest first. */
  private pending: Array<[string, number, number]> = [];
  /** The cells in the built square. */
  private wanted = new Set<string>();
  /** The cell in the middle of the built square. */
  private cellsAround = '';
  private skyDome: THREE.Mesh;
  private cloudSea: THREE.Mesh;
  private cloudTex: THREE.Texture;
  private coins = new Map<number, THREE.Group>();
  private power: PowerKit;
  private stars = new Map<number, THREE.Group>();
  /** The rainbow road near me, rebuilt as I move along it. */
  private road: THREE.Mesh;
  /** The light along the road's edges. */
  private roadGlow: THREE.Mesh;
  /** Where I am and whether the road is between me and the camera (see road.ts). */
  /** The road is already turning see-through (see updateRoadSee). */
  private seeLatched = false;
  private roadSee: RoadSee = { player: new THREE.Vector3(), through: { value: 0 } };
  private roadFrom = -1;
  /** The next stretch of road being built a few steps a frame, with the rings it wants. */
  private roadJob: { from: number; steps: Generator<void, { road: THREE.BufferGeometry; glow: THREE.BufferGeometry }> } | null = null;
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
    /** Builds each racer's character. The cast preview passes its own, to
     *  hide the racer its camera follows. */
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

    // Haze the colour of the horizon, so far things melt into the sky.
    this.scene.fog = new THREE.Fog(HAZE, HAZE_NEAR, HAZE_FAR);
    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / (container.clientHeight || 400), 0.5, 1600);

    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0xa9a6e6, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
    sun.position.set(80, 140, 60);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa9cbff, 0.55);
    rim.position.set(-90, 40, -70);
    this.scene.add(rim);

    // Not tone-mapped: the blue on screen is the blue picked in skyLook.
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
    );
    this.skyDome.renderOrder = -1;
    this.scene.add(this.skyDome);

    this.cloudTex = cloudSeaTexture();
    this.cloudTex.repeat.set(10, 10);
    this.cloudSea = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshBasicMaterial({ map: this.cloudTex, toneMapped: false }),
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
    this.world = createWorldKit();
    this.power = this.buildPowerKit();
    this.road = new THREE.Mesh(new THREE.BufferGeometry(), roadMaterial(this.kit.gloss, this.roadSee));
    this.scene.add(this.road);
    this.roadGlow = new THREE.Mesh(new THREE.BufferGeometry(), roadGlowMaterial());
    this.roadGlow.renderOrder = 2;
    this.scene.add(this.roadGlow);
    this.updateRoad(0, true);
    this.roadArrow = this.buildRoadArrow();
    this.scene.add(this.roadArrow);
    this.sparkleMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    looks.forEach((look, i) => this.racers.push(this.buildRacer(look, i)));

    // Every cell in view before the first picture; after that, one a frame.
    this.updateCells(this.camPos.x, this.camPos.z, 0);
    this.buildAll();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
    }
  }

  private buildKit(): Kit {
    const gloss = glossTexture();
    return { gloss, ring: ringGeometry(), ringFar: ringGeometry(true), ringMat: ringMaterial(gloss), coin: coinGeometry(), coinMat: coinMaterial() };
  }

  /**
   * A rainbow ring: the six bands and nothing else. It has no glow of its
   * own — the camera flies through every ring right behind the racer, and a
   * glow filling the ring would white out the picture just then.
   */
  private makeRing(r: Ring): THREE.Group {
    const ring = new THREE.Group();
    ring.add(new THREE.Mesh(this.kit.ring, this.kit.ringMat));
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
   * The road is solid, except where it would hide me: when I am under it and
   * the camera over it, or the other way round, the road around me turns
   * see-through so I stay in sight while diving. How much grows with how far
   * I am from its surface: nothing within a unit (skimming it, or idling just
   * under it, reads solid), all of it by four units, eased between. Once it
   * has begun it holds on a little longer, so hovering at the edge does not
   * flicker.
   */
  private updateRoadSee(me: Flyer, dt: number): void {
    const i = Math.floor(me.trail);
    const f = me.trail - i;
    const a = trailPoint(i);
    const b = trailPoint(i + 1);
    const roadY = a.y + (b.y - a.y) * f - ROAD_DROP;
    const lateral = Math.hypot(a.x + (b.x - a.x) * f - me.x, a.z + (b.z - a.z) * f - me.z);
    const mine = me.y - roadY;
    const apart = mine * (this.camPos.y - roadY) < 0;
    const depth = Math.abs(mine) + (this.seeLatched ? SEE_HOLD : 0);
    const x = Math.min(1, Math.max(0, (depth - SEE_FROM) / (SEE_FULL - SEE_FROM)));
    const want = apart && lateral < ROAD_WIDTH + 8 ? x * x * (3 - 2 * x) : 0;
    this.seeLatched = want > 0;
    const t = this.roadSee.through;
    t.value += (want - t.value) * Math.min(1, dt * 8);
    this.roadSee.player.set(me.x, me.y, me.z);
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
   * The rainbow road under the line the road rings sit on, from a little
   * behind me to well ahead, faded at both ends. Rebuilt when I have moved a
   * few road points along it, with the rings over it.
   */
  private updateRoad(at: number, now = false): void {
    const from = Math.max(0, Math.floor(at) - ROAD_BEHIND);
    if (this.roadJob || (this.roadFrom >= 0 && Math.abs(from - this.roadFrom) < 3)) return;
    this.roadJob = { from, steps: roadGeometries(from, ROAD_BEHIND + ROAD_AHEAD) };
    // Otherwise built a few steps a frame (buildSome); the road in view stays until the new stretch is ready.
    if (!now) return;
    let r = this.roadJob.steps.next();
    while (!r.done) r = this.roadJob.steps.next();
    this.installRoad(this.roadJob.from, r.value);
  }

  /** Swap in a freshly built stretch of road, and the rings over it. */
  private installRoad(from: number, geo: { road: THREE.BufferGeometry; glow: THREE.BufferGeometry }): void {
    this.roadJob = null;
    this.roadFrom = from;
    this.road.geometry.dispose();
    this.road.geometry = geo.road;
    this.roadGlow.geometry.dispose();
    this.roadGlow.geometry = geo.glow;
    const to = from + ROAD_BEHIND + ROAD_AHEAD;
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

  /**
   * Want the cells in a square that sits ahead of the camera (it only looks
   * forward), drop the ones left behind, and queue the new ones nearest
   * first.
   */
  private updateCells(x: number, z: number, heading: number): void {
    const cx = cellOf(x + Math.sin(heading) * VIEW_AHEAD);
    const cz = cellOf(z + Math.cos(heading) * VIEW_AHEAD);
    const middle = `${cx}:${cz}`;
    if (middle === this.cellsAround) return;
    this.cellsAround = middle;
    const want = new Set<string>();
    const queue: Array<[string, number, number]> = [];
    for (let dx = -VIEW_CELLS; dx <= VIEW_CELLS; dx++) {
      for (let dz = -VIEW_CELLS; dz <= VIEW_CELLS; dz++) {
        const key = `${cx + dx}:${cz + dz}`;
        want.add(key);
        if (!this.cells.has(key) && !(this.job && this.job.level === 0 && this.job.key === key)) queue.push([key, cx + dx, cz + dz]);
      }
    }
    for (const [key, cell] of this.cells) {
      if (want.has(key)) continue;
      for (const g of cell.v) {
        if (!g) continue;
        this.scene.remove(g);
        disposeCell(g);
      }
      this.cells.delete(key);
    }
    const far = (c: [string, number, number]) => ((c[1] + 0.5) * CELL - x) ** 2 + ((c[2] + 0.5) * CELL - z) ** 2;
    this.pending = queue.sort((a, b) => far(a) - far(b));
    this.wanted = want;
  }

  /** Every wanted cell in both versions, at once. */
  private buildAll(): void {
    const run = (j: BuildJob | null) => {
      if (!j) return false;
      for (;;) {
        const r = j.steps.next();
        if (r.done) {
          this.finishJob(j, r.value);
          return true;
        }
      }
    };
    while (run(this.nextJob())) {
      /* all of them */
    }
  }

  /** The version a cell at distance `d` wants, `shown` being the one it shows now (a little hysteresis). */
  private wantLevel(d: number, shown: number): number {
    if (d < (shown >= 1 ? NEAR_OUT : NEAR_IN)) return 1;
    return 0;
  }

  private cellDistance(cell: { cx: number; cz: number }): number {
    return Math.hypot((cell.cx + 0.5) * CELL - this.camPos.x, (cell.cz + 0.5) * CELL - this.camPos.z);
  }

  /** The level of the version a cell shows now. */
  private shownLevel(cell: CellObj): number {
    return Math.max(0, cell.v.findIndex((g) => g?.visible));
  }

  /** Show each cell's best built version for its distance from the camera. */
  private updateDetail(): void {
    for (const cell of this.cells.values()) {
      let level = this.wantLevel(this.cellDistance(cell), this.shownLevel(cell));
      while (level > 0 && !cell.v[level]) level--;
      cell.v.forEach((g, l) => {
        if (g) g.visible = l === level;
      });
    }
  }

  /**
   * The next cell version to build: the nearest cell lacking the version its
   * distance wants else a cheap
   * version for the nearest queued cell.
   */
  private nextJob(): BuildJob | null {
    const job = (key: string, cx: number, cz: number, level: number): BuildJob => ({
      key,
      cx,
      cz,
      level,
      steps: cellSteps(cx, cz, this.world, this.islands, level),
    });
    let best: CellObj | null = null;
    let bestD = Infinity;
    let bestLevel = 0;
    for (const cell of this.cells.values()) {
      const d = this.cellDistance(cell);
      const level = this.wantLevel(d, this.shownLevel(cell));
      if (level > 0 && !cell.v[level] && d < bestD) {
        best = cell;
        bestD = d;
        bestLevel = level;
      }
    }
    if (best) return job(`${best.cx}:${best.cz}`, best.cx, best.cz, bestLevel);
    const next = this.pending.shift();
    return next ? job(next[0], next[1], next[2], 0) : null;
  }

  /** Put a finished cell version into the scene, replacing the one it outdates. */
  private finishJob(j: BuildJob, group: THREE.Group): void {
    let cell = this.cells.get(j.key);
    if (j.level === 0 && !cell) {
      if (!this.wanted.has(j.key)) {
        disposeCell(group);
        return;
      }
      cell = { cx: j.cx, cz: j.cz, v: [null, null] };
      this.cells.set(j.key, cell);
      group.visible = true;
    } else if (!cell) {
      disposeCell(group);
      return;
    }
    const old = cell.v[j.level];
    if (old) {
      group.visible = old.visible;
      this.scene.remove(old);
      disposeCell(old);
    } else {
      group.visible = false;
    }
    cell.v[j.level] = group;
    this.scene.add(group);
    this.updateDetail();
  }

  /** Builds the next stretch of road and sky cells for the time left in this frame's budget. */
  private buildSome(): void {
    const start = performance.now();
    do {
      if (this.roadJob) {
        const r = this.roadJob.steps.next();
        if (r.done) this.installRoad(this.roadJob.from, r.value);
        continue;
      }
      if (!this.job) this.job = this.nextJob();
      const job = this.job;
      if (!job) return;
      const r = job.steps.next();
      if (r.done) {
        this.job = null;
        this.finishJob(job, r.value);
      }
    } while (performance.now() - start < BUILD_BUDGET_MS);
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

  /** A gold star coin; its sparkles, when it is picked up, are its own hue. */
  private makeCoin(coin: Coin): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.kit.coin, this.kit.coinMat));
    g.userData.sparkle = new THREE.Color().setHSL(coin.hue / 360, 0.9, 0.6).getHex();
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
        this.burst(mesh.position, mesh.userData.sparkle as number, 8);
      }
      this.scene.remove(mesh);
      this.coins.delete(id);
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

    // Rings pop and throw rainbow sparkles off their rim when I fly through one.
    if (me.lastRing && me.lastRing !== this.lastRing) {
      this.lastRing = me.lastRing;
      this.ringFlash.set(me.lastRing, 1);
      const ring = this.roadRings.get(me.lastRing);
      if (ring) this.ringSparkles(ring);
    }
    for (const [id, ring] of this.roadRings) {
      ring.scale.setScalar(1 + (this.ringFlash.get(id) ?? 0) * 0.2);
      // The full ring only while it is near enough to show the detail.
      const near = ring.position.distanceToSquared(this.camPos) < RING_NEAR * RING_NEAR;
      (ring.children[0] as THREE.Mesh).geometry = near ? this.kit.ring : this.kit.ringFar;
    }
    for (const [id, f] of this.ringFlash) {
      const next = f - dt * 1.5;
      if (next <= 0) this.ringFlash.delete(id);
      else this.ringFlash.set(id, next);
    }

    this.updateCells(me.x, me.z, me.heading);
    // Cells are built a step or two a frame, so none ever stalls one.
    this.updateDetail();
    this.buildSome();
    if (!this.reducedMotion) {
      flowFalls(this.world, dt);
    }
    this.updateRoad(me.trail);
    this.updateRoadArrow(me, dt);
    this.updateRoadSee(me, dt);

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
    // Riders were freed by their own dispose; take them out before the sweep.
    for (const r of this.racers) r.holder.remove(r.rider.group);
    disposeDeep(this.scene);
    const k = this.kit;
    for (const v of [k.gloss, k.ring, k.ringFar, k.ringMat, k.coin, k.coinMat]) v.dispose();
    disposeWorldKit(this.world);
    this.islands.dispose();
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
