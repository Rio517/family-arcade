/**
 * The three.js chess scene — a real 3D set with lathe-turned pieces, soft
 * shadows, an orbitable camera, and tweened piece moves. Framework-free: the
 * React wrapper (Chess3D) feeds it positions and marks, and receives square
 * taps back. All geometry is procedural, so nothing is downloaded and the
 * PWA stays fully offline.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
// The galaxy set's authored hero pieces (the family's generated ships), one
// GLB per seat. Bundled imports — the offline PWA never fetches at runtime.
import galaxyWhitePawnUrl from '@games/chess/assets/galaxy/white-pawn.glb';
import galaxyBlackPawnUrl from '@games/chess/assets/galaxy/black-pawn.glb';
import galaxyBlackBishopUrl from '@games/chess/assets/galaxy/black-bishop.glb';
import { FILES, RANKS, type Board, type Color, type PieceType, type Square } from '@games/chess/domain/types';
import { disposeDeep } from '@shared/three/disposeDeep';
import { SCENE_PALETTES, type ScenePalette } from '../chessTheme';

const UP = new THREE.Vector3(0, 1, 0);
/** The board's surface — dragged pieces ride the pointer's ray across it. */
const BOARD_PLANE = new THREE.Plane(UP, 0);

const sqName = (s: Square) => `${FILES[s.col]}${8 - s.row}`;
/** Board square → world position (a1 near white; row 0 = rank 8 = -z). */
const worldPos = (s: Square) => new THREE.Vector3(s.col - 3.5, 0, s.row - 3.5);

interface Marks {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  checkSq: Square | null;
}

interface Tween {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  dur: number;
  arc: number;
  fade?: boolean;
  onDone?: () => void;
}

export class ChessScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private tiles: THREE.Mesh[] = [];
  private pieces = new Map<string, THREE.Group>(); // key: square name
  private templates = new Map<string, THREE.Group>(); // key: `${color}${type}`
  /** Authored piece models (galaxy set), decoded async; win over buildPiece. */
  private modelTemplates = new Map<string, THREE.Group>();
  /** Last board given to setPosition — replayed when a model decodes. */
  private lastBoard: Board | null = null;
  private markGroup = new THREE.Group();
  private checkMat: THREE.MeshBasicMaterial | null = null;
  private tweens: Tween[] = [];
  private clouds: THREE.Group[] = [];
  private sparkles: THREE.Points[] = [];
  // Deep-space life (galaxy theme): named stars that twinkle, slow planets,
  // and two tiny ships that occasionally cross the far background.
  private brightStars: { sprite: THREE.Sprite; phase: number; base: number }[] = [];
  private planets: { group: THREE.Group; spin: number }[] = [];
  private flyShips: THREE.Group[] = [];
  private flyby: { ship: THREE.Group | null; t0: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; nextAt: number; seed: number } | null = null;
  private lastNow = 0;
  private raf = 0;
  private down: { x: number; y: number } | null = null;
  /** A piece picked up on pointerdown; becomes a real drag past the tap
   *  threshold, otherwise the release falls through to the tap flow. */
  private drag: { from: Square; grp: THREE.Group; home: THREE.Vector3; active: boolean } | null = null;
  /** The framing the scene opened with, for resetView(). */
  private homePos = new THREE.Vector3();
  private homeTarget = new THREE.Vector3();
  private viewDirty = false;
  private resizeObs: ResizeObserver | null = null;
  private disposed = false;

  private palette: ScenePalette;
  private accentMat: THREE.MeshStandardMaterial | null = null;
  private glowMats: { w: THREE.MeshStandardMaterial | null; b: THREE.MeshStandardMaterial | null } = { w: null, b: null };
  private sideAccentMats: { w: THREE.MeshStandardMaterial | null; b: THREE.MeshStandardMaterial | null } = { w: null, b: null };

  constructor(
    private container: HTMLElement,
    private opts: {
      orientation: Color;
      reducedMotion: boolean;
      onTap: (sq: Square) => void;
      /** True for a square whose piece may be picked up and dragged. */
      canDrag?: (sq: Square) => boolean;
      /** A drag crossed the tap threshold — the host should mark targets. */
      onDragStart?: (sq: Square) => void;
      /** A dragged piece was released (null: off the board). */
      onDrop?: (from: Square, to: Square | null) => void;
      /** The camera left (or returned to) its opening framing. */
      onViewDirty?: (dirty: boolean) => void;
      palette?: ScenePalette;
    },
  ) {
    this.palette = opts.palette ?? SCENE_PALETTES.classic;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(this.palette.background);
    // Deep space keeps its fog further out so the starfield reads; the dream
    // world's fog is tinted to the sky's horizon so distance melts into
    // sunlit haze (never into darkness), and pushed far enough to see the
    // cloud sea roll away.
    this.scene.fog = this.palette.dream
      ? new THREE.Fog('#f2c8dc', 20, 46)
      : this.palette.stars
        ? new THREE.Fog(this.palette.background, 20, 40)
        : new THREE.Fog(this.palette.background, 15, 28);
    if (this.palette.accent) {
      this.accentMat = new THREE.MeshStandardMaterial({
        color: this.palette.accent,
        roughness: 0.25,
        metalness: 0.65,
      });
    }
    for (const side of ['w', 'b'] as const) {
      const glow = side === 'w' ? this.palette.whiteGlow : this.palette.blackGlow;
      if (glow) {
        this.glowMats[side] = new THREE.MeshStandardMaterial({
          color: glow,
          emissive: glow,
          emissiveIntensity: 2.0,
          roughness: 0.4,
        });
      }
      const acc = side === 'w' ? this.palette.whiteAccent : this.palette.blackAccent;
      if (acc) {
        this.sideAccentMats[side] = new THREE.MeshStandardMaterial({ color: acc, roughness: 0.3, metalness: 0.4 });
      }
    }

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    const zSide = opts.orientation === 'w' ? 1 : -1;
    this.camera.position.set(0, 6.4, 9.0 * zSide);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = !opts.reducedMotion;
    // Close enough to fill the screen with a single ship, far enough to
    // frame the whole set. The floor has come down twice by family request
    // (3.2 → 1.9 → 1.1) — at 1.1 a 0.4-unit fighter is a wall-sized model.
    // The near plane is 0.1, so the carried piece never clips; orbiting this
    // close can briefly pass through a NEIGHBOURING piece, which is the
    // accepted trade for getting nose-to-nose with one ship.
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minPolarAngle = 0.12;
    this.controls.target.set(0, 0, 0);
    // Zoom dives toward the pointer, not the board's centre — zooming into a
    // corner piece should take you there. (This walks controls.target, which
    // is why resetView() restores the target too.)
    this.controls.zoomToCursor = true;
    this.controls.update();
    this.homePos = this.camera.position.clone();
    this.homeTarget = this.controls.target.clone();
    this.controls.addEventListener('change', this.reportViewDirty);

    this.buildLights();
    this.buildBoard();
    if (this.palette.stars) this.buildStars();
    if (this.palette.dream) this.buildDreamWorld();
    this.scene.add(this.markGroup);

    // The galaxy set's authored ships decode async and replace their
    // procedural stand-ins — the board never waits on a model.
    if (this.palette.pieceStyle === 'ships') void this.loadShipModels();

    // Tap vs drag vs orbit: pointerdown on your own piece claims the gesture
    // for a piece drag (orbit pauses); past the tap threshold the piece lifts
    // and rides the finger. Everywhere else, dragging orbits as before, and a
    // release that barely moved is a tap either way.
    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onCancel);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop(performance.now());
  }

  private buildLights() {
    if (this.palette.dream) {
      // Golden-hour light above the clouds: warm low sun, pink sky fill.
      this.scene.add(new THREE.HemisphereLight('#ffe9f3', '#e3b3e8', 0.95));
      const sun = new THREE.DirectionalLight('#ffedd2', 2.1);
      sun.position.set(7, 7, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
      sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
      sun.shadow.bias = -0.0004;
      this.scene.add(sun);
      const blush = new THREE.DirectionalLight('#ffb3dd', 0.55);
      blush.position.set(-7, 3, -6);
      this.scene.add(blush);
      return;
    }
    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#1a1408', 0.55));
    const key = new THREE.DirectionalLight('#fff2dd', 2.2);
    key.position.set(5, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#4aa8ff', 0.5);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
  }

  private buildBoard() {
    const lightSq = new THREE.MeshStandardMaterial({ color: this.palette.tileLight, roughness: 0.42 });
    const darkSq = new THREE.MeshStandardMaterial({ color: this.palette.tileDark, roughness: 0.48 });
    const tileG = new THREE.BoxGeometry(1, 0.12, 1);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const t = new THREE.Mesh(tileG, (r + c) % 2 ? darkSq : lightSq);
        t.position.set(c - 3.5, -0.06, r - 3.5);
        t.receiveShadow = true;
        t.name = sqName({ row: r, col: c });
        this.tiles.push(t);
        this.scene.add(t);
      }
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 0.34, 9.0),
      new THREE.MeshStandardMaterial({ color: this.palette.frame, roughness: 0.3, metalness: 0.25 }),
    );
    frame.position.y = -0.24;
    frame.receiveShadow = true;
    this.scene.add(frame);
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(9.06, 0.05, 9.06),
      new THREE.MeshStandardMaterial({
        color: this.palette.edge,
        emissive: this.palette.edge,
        emissiveIntensity: this.palette.edgeEmissive ?? 1.4,
        metalness: (this.palette.edgeEmissive ?? 1.4) < 1 ? 0.7 : 0, // dim rim = polished brass
      }),
    );
    edge.position.y = -0.075;
    this.scene.add(edge);
  }

  /** A still starfield around the deep-space board (seeded, so tests are stable). */
  private buildStars() {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pts: number[] = [];
    for (let i = 0; i < 220; i++) {
      const r = 13 + rand() * 9;
      const az = rand() * Math.PI * 2;
      const el = rand() * 1.25 - 0.1; // mostly above the horizon
      pts.push(r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#dce8ff', size: 0.09, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    }));
    this.scene.add(stars);

    this.buildDeepSpace(rand);
  }

  /** A soft radial glow texture shared by the bright stars. */
  private static glowTexture(): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(220,235,255,0.5)');
    g.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  /**
   * The rest of the galaxy: a handful of bright named-feeling stars that
   * twinkle, two slow planets (one ringed, one banded moonlet), and a pair of
   * tiny ships that occasionally cross the far background — a rebel dart one
   * pass, an imperial trifoil the next. Everything is seeded and lives far
   * outside orbit range so it dresses the room without stealing the game.
   */
  private buildDeepSpace(rand: () => number) {
    // Bright stars: sprites with their own materials so each can twinkle.
    const glowTex = ChessScene.glowTexture();
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTex, transparent: true, depthWrite: false, fog: false,
        opacity: 0.8, color: i % 3 === 0 ? '#bcd9ff' : i % 3 === 1 ? '#fff2cf' : '#ffffff',
      });
      const sprite = new THREE.Sprite(mat);
      const r = 16 + rand() * 8;
      const az = rand() * Math.PI * 2;
      // The play camera pitches ~35deg down, so the sky the player sees at
      // distance sits BELOW the y=0 plane — scatter into that visible band.
      const el = -0.28 + rand() * 0.55;
      sprite.position.set(r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az));
      const base = 0.55 + rand() * 0.35;
      sprite.scale.setScalar(0.5 + rand() * 0.5);
      this.brightStars.push({ sprite, phase: rand() * Math.PI * 2, base });
      this.scene.add(sprite);
    }

    // Planets: canvas-banded spheres, far out and low so the board stays king.
    const planet = (radius: number, bands: string[], ringColor: string | null) => {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 64;
      const ctx = cv.getContext('2d')!;
      bands.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, (i * 64) / bands.length, 128, 64 / bands.length + 1);
      });
      // Smudge the band edges so they read as weather, not stripes.
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = bands[Math.floor(rand() * bands.length)];
        const y = rand() * 64;
        ctx.fillRect(rand() * 128, y, 20 + rand() * 40, 2 + rand() * 3);
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const group = new THREE.Group();
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 28, 20),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, fog: false, emissive: '#233046', emissiveIntensity: 0.35 }),
      );
      group.add(ball);
      if (ringColor) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.45, radius * 2.05, 48),
          new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, fog: false }),
        );
        ring.rotation.x = Math.PI / 2.4;
        group.add(ring);
      }
      return group;
    };

    const gas = planet(2.6, ['#7a5a46', '#a97b52', '#8a6448', '#c19a6b', '#7a5a46', '#96714e'], '#c9b28a');
    gas.position.set(-10, -3.5, -25); // over White's far horizon
    gas.rotation.z = 0.18;
    this.planets.push({ group: gas, spin: 0.01 });
    this.scene.add(gas);

    const ice = planet(1.4, ['#5f7f9e', '#7d9cb8', '#9db8cf', '#6d8ba6', '#87a6c0'], null);
    ice.position.set(11, -2.8, 24); // over Black's far horizon
    this.planets.push({ group: ice, spin: -0.016 });
    this.scene.add(ice);

    // Flyby ships: built once, hidden between passes (no allocation churn).
    const dart = new THREE.Group(); // a rebel courier
    {
      const hull = new THREE.MeshStandardMaterial({ color: '#d9dee8', roughness: 0.4 });
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), hull);
      body.rotation.x = Math.PI / 2;
      const wingGeo = new THREE.BoxGeometry(1.0, 0.03, 0.22);
      const wing = new THREE.Mesh(wingGeo, hull);
      wing.position.z = -0.15;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff8a5c', transparent: true, depthWrite: false, opacity: 1 }));
      glow.scale.setScalar(0.7);
      glow.position.z = -0.55;
      const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff8a5c', transparent: true, depthWrite: false, opacity: 0.45 }));
      trail.scale.set(2.6, 0.22, 1); // the streak that sells the speed
      trail.position.z = -1.7;
      dart.add(body, wing, glow, trail);
    }
    const trifoil = new THREE.Group(); // an imperial patrol
    {
      const hull = new THREE.MeshStandardMaterial({ color: '#78859c', roughness: 0.4 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), hull);
      const winGeo = new THREE.BoxGeometry(0.05, 0.7, 0.5);
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(winGeo, hull);
        wing.position.x = side * 0.3;
        trifoil.add(wing);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#8fd0ff', transparent: true, depthWrite: false, opacity: 1 }));
      glow.scale.setScalar(0.6);
      glow.position.z = -0.3;
      const trail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#8fd0ff', transparent: true, depthWrite: false, opacity: 0.45 }));
      trail.scale.set(2.2, 0.2, 1);
      trail.position.z = -1.4;
      trifoil.add(ball, glow, trail);
    }
    for (const ship of [dart, trifoil]) {
      ship.scale.setScalar(1.6); // far away — needs presence to read at all
      ship.visible = false;
      this.flyShips.push(ship);
      this.scene.add(ship);
    }
    // First pass shortly after sitting down; then a rare treat, not traffic.
    this.flyby = { ship: null, t0: 0, dur: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), nextAt: 12000, seed: 0x5eed ^ 42 };
  }

  /** A pastel rainbow arching out of the cloud sea — six half-torus bands. */
  private buildRainbow(x: number, y: number, z: number, ry: number, scale: number, opacity: number) {
    const bands = ['#ff8f9f', '#ffb87a', '#ffe97a', '#93e6a4', '#8fc9ff', '#c9a0f5'];
    const g = new THREE.Group();
    bands.forEach((c, i) => {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(6.4 - i * 0.36, 0.19, 10, 56, Math.PI),
        new THREE.MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.6,
          roughness: 0.6,
          transparent: true,
          opacity,
        }),
      );
      g.add(band);
    });
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.scale.setScalar(scale);
    this.scene.add(g);
    return g;
  }

  /**
   * THE CLOUD KINGDOM — the unicorn board is a marble terrace floating high
   * above an endless sunset cloud sea. A gradient sky dome (peach horizon to
   * violet zenith), a broken cloud deck rolling away below, a cushion of
   * cloud hugging the board's underside, a grand rainbow with its feet
   * buried in distant cloud banks, drifting eye-level clouds, and a slow
   * swirl of gold-and-pink sparkle motes in the air. Everything is seeded,
   * so the kingdom looks the same on every visit; motion (drift, swirl,
   * twinkle) rests under prefers-reduced-motion.
   */
  private buildDreamWorld() {
    let seed = 20260729;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    // ── The sky: a gradient dome from warm horizon to violet zenith ──
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;
    const ctx = skyCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256); // canvas top = zenith
      grad.addColorStop(0, '#6d4bb8');
      grad.addColorStop(0.34, '#b98ae0');
      grad.addColorStop(0.66, '#f3b9dd');
      grad.addColorStop(1, '#ffd9c4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 4, 256);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(52, 24, 16),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(skyCanvas), side: THREE.BackSide, fog: false }),
      );
      dome.position.y = -6; // horizon sits below the board's eye line
      this.scene.add(dome);
    }
    // A soft low sun glowing through the haze — a radial-gradient billboard,
    // so it fades out instead of ending in a hard circle.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d');
    if (gctx) {
      const rg = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255, 240, 210, 0.85)');
      rg.addColorStop(0.4, 'rgba(255, 224, 190, 0.35)');
      rg.addColorStop(1, 'rgba(255, 224, 190, 0)');
      gctx.fillStyle = rg;
      gctx.fillRect(0, 0, 128, 128);
      const sunGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(glowCanvas),
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      );
      sunGlow.position.set(17, 5, -38);
      sunGlow.lookAt(0, 2, 0);
      this.scene.add(sunGlow);
    }

    // ── Cloud materials (shared) ──
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#fff8fc',
      emissive: '#ffeaf6',
      emissiveIntensity: 0.28,
      roughness: 1,
    });
    const puffCluster = (scale: number, stretch = 1) => {
      const g = new THREE.Group();
      const puffs = 4 + Math.floor(rand() * 3);
      for (let p = 0; p < puffs; p++) {
        const r = (0.55 + rand() * 0.8) * scale;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cloudMat);
        puff.position.set(
          (p - (puffs - 1) / 2) * r * 0.95 * stretch,
          (rand() - 0.5) * 0.3 * scale,
          (rand() - 0.5) * 0.9 * scale,
        );
        puff.scale.y = 0.55;
        g.add(puff);
      }
      return g;
    };

    // ── The cloud sea: a broken deck rolling away below the board ──
    for (let i = 0; i < 26; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = 7 + rand() * 24;
      const bank = puffCluster(1.6 + rand() * 2.6, 1.4);
      bank.position.set(Math.cos(ang) * dist, -3.1 + rand() * 0.9, Math.sin(ang) * dist);
      this.scene.add(bank);
    }
    // A floor far below closes any gaps between the banks. Painted EXACTLY
    // the fog colour so it's indistinguishable from haze — no flat pink
    // patches peeking through the clouds.
    const seaFloor = new THREE.Mesh(
      new THREE.CircleGeometry(80, 40),
      new THREE.MeshBasicMaterial({ color: '#f2c8dc' }),
    );
    seaFloor.rotation.x = -Math.PI / 2;
    seaFloor.position.y = -6;
    this.scene.add(seaFloor);

    // ── The board rests ON cloud: a cushion hugging its underside. Kept
    // fully BELOW the playing surface so it never blocks the view. ──
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + rand() * 0.3;
      const cushion = puffCluster(0.75 + rand() * 0.4);
      cushion.position.set(Math.cos(ang) * (4.0 + rand() * 0.6), -1.15 - rand() * 0.4, Math.sin(ang) * (4.0 + rand() * 0.6));
      this.scene.add(cushion);
    }

    // ── The grand rainbow, feet buried in far cloud banks; a faint echo ──
    this.buildRainbow(0, -1.5, -23, 0.1, 1.9, 0.85);
    for (const fx of [-12.1, 12.1]) {
      const foot = puffCluster(2.6, 1.3);
      foot.position.set(fx, -1.6, -22.4);
      this.scene.add(foot);
    }
    this.buildRainbow(19, -1, 13, Math.PI * 0.72, 1.1, 0.45);

    // ── Sky clouds circling the terrace. They ORBIT on fixed rings (never
    // cutting across the middle) and sit high and far enough that they stay
    // out of the line of sight to the board. ──
    for (let i = 0; i < 7; i++) {
      const cloud = puffCluster(0.8 + rand() * 1.1);
      const ang = rand() * Math.PI * 2;
      const dist = 13.5 + rand() * 6;
      cloud.position.set(Math.cos(ang) * dist, 3.6 + rand() * 3.2, Math.sin(ang) * dist);
      cloud.userData.orbit = (0.014 + rand() * 0.02) * (rand() < 0.5 ? 1 : -1); // rad/s
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }

    // ── Sparkle motes: gold and pink dust swirling slowly around the board ──
    for (const [color, count, size] of [['#ffe9a8', 70, 0.075], ['#ffd0ef', 90, 0.06]] as const) {
      const pts: number[] = [];
      for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const dist = 2.5 + rand() * 7;
        pts.push(Math.cos(ang) * dist, 0.3 + rand() * 4.4, Math.sin(ang) * dist);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const motes = new THREE.Points(geo, new THREE.PointsMaterial({
        color, size, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false,
      }));
      motes.userData.spin = 0.02 + rand() * 0.02;
      this.sparkles.push(motes);
      this.scene.add(motes);
    }
  }

  // ── Procedural pieces (lathe-turned; knight is an extruded silhouette) ──
  private material(color: Color) {
    const hex = color === 'w' ? this.palette.whitePiece : this.palette.blackPiece;
    const ships = this.palette.pieceStyle === 'ships';
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: this.palette.pieceRoughness,
      metalness: ships ? 0.45 : color === 'b' && !this.palette.accent ? 0.12 : 0.05,
      // Starships get a faint self-glow so hulls read against the night board
      // — the dark side especially, which used to melt into the dark tiles.
      ...(ships ? { emissive: new THREE.Color(hex), emissiveIntensity: color === 'b' ? 0.34 : 0.12 } : {}),
    });
  }

  /**
   * Decode the galaxy set's authored piece models (the pawns so far — a rebel
   * X-wing for white, an imperial TIE for black) and swap them in for the
   * procedural stand-ins already on the board.
   */
  private async loadShipModels() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    // `greyward`: lerp every material toward studio grey by this amount. The
    // TIE arrived nearly black and read as a silhouette under the night
    // lighting — the family asked for more grey, film-style. `glass` names
    // the materials that stay black glass instead (the cockpit window).
    // `fit` overrides the standard 0.68-square footprint. The TIE flies 40%
    // smaller by the family's call: at full size its panel tips grazed the
    // board at the bottom of the hover bob (0.045 clearance vs 0.022 bob).
    // `hover` overrides the pawns' 0.34 float — pieces rise with rank, same
    // ladder the procedural set uses (bishop 0.42 ... king 0.5).
    const seats: {
      key: string;
      url: string;
      greyward?: number;
      glass?: string[];
      fit?: number;
      hover?: number;
    }[] = [
      { key: 'wp', url: galaxyWhitePawnUrl },
      { key: 'bp', url: galaxyBlackPawnUrl, greyward: 0.62, glass: ['DarkWindow'], fit: 0.41 },
      // The imperial landing craft — same dark material family as the TIE,
      // so the same grey regrade and black cockpit glass apply.
      { key: 'bb', url: galaxyBlackBishopUrl, greyward: 0.62, glass: ['DarkWindow'], fit: 0.5, hover: 0.42 },
    ];
    for (const seat of seats) {
      try {
        const gltf = await loader.loadAsync(seat.url);
        if (this.disposed) return;

        // Normalise to the procedural ships' conventions: centred over the
        // square, length along z with the nose flying at the enemy, sized to
        // the stand-in's footprint, hovering at the pawns' height.
        const model = gltf.scene;
        if (seat.greyward) {
          // Collect unique materials first — panels share materials between
          // meshes, and lerping per-mesh would shift shared ones twice.
          const unique = new Set<THREE.Material>();
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh || !mesh.material) return;
            for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) unique.add(m);
          });
          const grey = new THREE.Color('#9aa2ad');
          for (const m of unique) {
            const std = m as THREE.MeshStandardMaterial;
            if (seat.glass?.includes(std.name)) {
              // The cockpit glass stays BLACK glass: deep colour, and the
              // artist's low roughness kept so the key light draws a glint
              // on the pane instead of a flat grey disc. The frame around it
              // is a different material and takes the grey like the hull.
              if (std.color) std.color.set('#05070c');
              continue;
            }
            if (std.color) std.color.lerp(grey, seat.greyward);
            // Metallic surfaces render near-black without an environment map
            // (this scene has none) — no amount of albedo grey fixes that, so
            // ground the metalness and let the lights do the shading.
            if (typeof std.metalness === 'number') std.metalness = Math.min(std.metalness, 0.3);
            if (typeof std.roughness === 'number') std.roughness = Math.max(std.roughness, 0.55);
          }
        }
        const box = new THREE.Box3().setFromObject(model);
        const dims = box.getSize(new THREE.Vector3());
        model.position.sub(box.getCenter(new THREE.Vector3()));
        const ship = new THREE.Group();
        ship.add(model);
        ship.position.y = seat.hover ?? 0.34; // the procedural HOVER ladder
        ship.scale.setScalar((seat.fit ?? 0.68) / Math.max(dims.z, 0.0001));
        // The artist exports noses toward +z; white flies at -z (at black).
        if (seat.key[0] === 'w') ship.rotation.y = Math.PI;
        const tpl = new THREE.Group();
        tpl.add(ship);

        this.modelTemplates.set(seat.key, tpl);
        this.templates.delete(seat.key);

        // The ambient flybys fly the real ships too, once decoded: the
        // authored hull replaces the procedural stand-in, keeping the engine
        // glow + speed streak. The flyby convention is nose +z — the artist's
        // raw orientation — so the pawn's white-side flip doesn't apply here.
        const flyIdx = seat.key === 'wp' ? 0 : seat.key === 'bp' ? 1 : -1;
        const fly = flyIdx >= 0 ? this.flyShips[flyIdx] : undefined;
        if (fly) {
          for (const child of [...fly.children]) {
            if (!(child as THREE.Sprite).isSprite) {
              fly.remove(child);
              disposeDeep(child); // the stand-in owned its geometry/materials
            }
          }
          const hull = ship.clone(true); // shares the cached geometry — never dispose
          hull.position.set(0, 0, 0);
          hull.rotation.y = 0;
          // Re-fit from the pawn's board footprint to the stand-ins' size.
          hull.scale.multiplyScalar(0.85 / (seat.fit ?? 0.68));
          fly.add(hull);
        }

        // Any of these pieces already standing get rebuilt from the model.
        if (this.lastBoard) {
          for (const [sq, g] of [...this.pieces]) {
            if (`${g.userData.color}${g.userData.type}` === seat.key) {
              this.pieces.delete(sq);
              this.scene.remove(g);
            }
          }
          this.setPosition(this.lastBoard, null);
        }
      } catch {
        // A missing or corrupt model never takes the board down — the
        // procedural stand-in simply stays.
      }
    }
  }

  private template(type: PieceType, color: Color): THREE.Group {
    const key = `${color}${type}`;
    let tpl = this.templates.get(key);
    if (!tpl) {
      tpl = this.modelTemplates.get(key) ?? buildPiece(
        type,
        this.material(color),
        color === 'b',
        this.palette.pieceStyle,
        this.sideAccentMats[color] ?? this.accentMat ?? undefined,
        this.glowMats[color] ?? undefined,
      );
      this.templates.set(key, tpl);
    }
    const clone = tpl.clone(true);
    clone.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    return clone;
  }

  /** Sync every piece to `board`; if `move` is given, tween that piece. */
  setPosition(board: Board, move: { from: Square; to: Square } | null) {
    // A position change mid-drag (an online opponent's move landing) would
    // yank the carried piece around — put it down first.
    this.onCancel();
    this.lastBoard = board;
    const wanted = new Map<string, { type: PieceType; color: Color }>();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) wanted.set(sqName({ row: r, col: c }), { type: p.type, color: p.color });
      }
    }

    // Animate the headline move when its actor is in place (castle rook, en
    // passant victim, and promotions are corrected by the sync pass below).
    if (move && !this.opts.reducedMotion) {
      const fromKey = sqName(move.from);
      const toKey = sqName(move.to);
      const actor = this.pieces.get(fromKey);
      const want = wanted.get(toKey);
      if (actor && want && actor.userData.type === want.type && actor.userData.color === want.color) {
        const victim = this.pieces.get(toKey);
        if (victim) {
          this.pieces.delete(toKey);
          // Clones share their template's materials, so fading the victim
          // directly would turn every same-type piece transparent. Give it
          // private copies to fade, and free them when it sinks away.
          victim.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material = mesh.material.clone();
          });
          this.tweens.push({
            obj: victim, from: victim.position.clone(), to: victim.position.clone().setY(-0.9),
            start: performance.now(), dur: 260, arc: 0, fade: true,
            onDone: () => {
              this.scene.remove(victim);
              victim.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material.dispose(); });
            },
          });
        }
        this.pieces.delete(fromKey);
        this.pieces.set(toKey, actor);
        this.tweens.push({ obj: actor, from: worldPos(move.from), to: worldPos(move.to), start: performance.now(), dur: 300, arc: 0.45 });
      }
    }

    // Hard sync: add/replace/remove so the scene always matches the board.
    for (const [key, want] of wanted) {
      const cur = this.pieces.get(key);
      if (cur && cur.userData.type === want.type && cur.userData.color === want.color) continue;
      if (cur) this.scene.remove(cur);
      const g = this.template(want.type, want.color);
      g.userData = { type: want.type, color: want.color };
      const col = FILES.indexOf(key[0]);
      const row = RANKS.indexOf(key[1]);
      g.position.copy(worldPos({ row, col }));
      this.pieces.set(key, g);
      this.scene.add(g);
    }
    for (const [key, g] of this.pieces) {
      if (!wanted.has(key)) {
        this.pieces.delete(key);
        this.scene.remove(g);
      }
    }
  }

  /** Selection ring, target dots, last-move tint, check pulse. */
  setMarks(m: Marks) {
    // Marks own their geometry/materials, and this runs on every tap — free
    // the old set or the GPU buffers pile up for the whole game.
    disposeDeep(this.markGroup);
    this.markGroup.clear();
    this.checkMat = null;
    const plane = (sq: Square, color: string, opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.96, 0.96),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(worldPos(sq)).setY(0.005);
      this.markGroup.add(mesh);
      return mesh.material as THREE.MeshBasicMaterial;
    };
    if (m.lastMove) {
      plane(m.lastMove.from, '#fbbf24', 0.22);
      plane(m.lastMove.to, '#fbbf24', 0.3);
    }
    if (m.checkSq) this.checkMat = plane(m.checkSq, '#ef4444', 0.45);
    if (m.selected) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.46, 40),
        new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(worldPos(m.selected)).setY(0.008);
      this.markGroup.add(ring);
    }
    for (const t of m.targets) {
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24),
        new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.85 }),
      );
      dot.position.copy(worldPos(t)).setY(0.03);
      this.markGroup.add(dot);
    }
  }

  /** Aim the shared raycaster through the pointer. */
  private aim(e: globalThis.PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  /** The square-name key of the piece under the pointer, if any. */
  private pieceKeyAt(e: globalThis.PointerEvent): string | null {
    this.aim(e);
    const hit = this.raycaster.intersectObjects([...this.pieces.values()], true)[0];
    if (!hit) return null;
    let g: THREE.Object3D | null = hit.object;
    while (g && !g.userData.type) g = g.parent;
    if (!g) return null;
    for (const [key, grp] of this.pieces) {
      if (grp === g) return key;
    }
    return null;
  }

  /** Where the pointer's ray meets the board plane (y = 0). */
  private pointOnBoard(e: globalThis.PointerEvent): THREE.Vector3 | null {
    this.aim(e);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(BOARD_PLANE, out) ? out : null;
  }

  private static squareOf(key: string): Square | null {
    const col = FILES.indexOf(key[0]);
    const row = RANKS.indexOf(key[1]);
    return col >= 0 && row >= 0 ? { row, col } : null;
  }

  private onDown = (e: globalThis.PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    if (!this.opts.canDrag) return;
    const key = this.pieceKeyAt(e);
    const sq = key ? ChessScene.squareOf(key) : null;
    if (!key || !sq || !this.opts.canDrag(sq)) return;
    const grp = this.pieces.get(key)!;
    this.drag = { from: sq, grp, home: grp.position.clone(), active: false };
    // The gesture belongs to the piece now — the camera must not orbit under it.
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: globalThis.PointerEvent) => {
    const drag = this.drag;
    if (!drag || !this.down) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) <= 7) return;
      drag.active = true;
      this.opts.onDragStart?.(drag.from);
    }
    const p = this.pointOnBoard(e);
    if (p) {
      drag.grp.position.set(
        THREE.MathUtils.clamp(p.x, -3.9, 3.9),
        0.55, // carried above the other pieces
        THREE.MathUtils.clamp(p.z, -3.9, 3.9),
      );
    }
  };

  private onUp = (e: globalThis.PointerEvent) => {
    const drag = this.drag;
    if (drag) {
      this.drag = null;
      this.controls.enabled = true;
      if (drag.active) {
        this.down = null;
        // Snap home first: a legal move re-lays the position (with its tween);
        // an illegal one leaves the piece exactly where it started.
        drag.grp.position.copy(drag.home);
        const p = this.pointOnBoard(e);
        const col = p ? Math.round(p.x + 3.5) : -1;
        const row = p ? Math.round(p.z + 3.5) : -1;
        const to = col >= 0 && col <= 7 && row >= 0 && row <= 7 ? { row, col } : null;
        this.opts.onDrop?.(drag.from, to);
        return;
      }
      // Never crossed the threshold — fall through to the tap flow.
    }
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 7) return; // that was an orbit, not a tap
    // Prefer the tapped piece's square; fall back to the tile.
    const key = this.pieceKeyAt(e);
    if (key) return this.tapSquare(key);
    const tileHit = this.raycaster.intersectObjects(this.tiles)[0];
    if (tileHit) this.tapSquare(tileHit.object.name);
  };

  private onCancel = () => {
    if (this.drag) {
      this.drag.grp.position.copy(this.drag.home);
      this.controls.enabled = true;
      this.drag = null;
    }
    this.down = null;
  };

  /** Tell the host when the camera leaves (or regains) its opening framing. */
  private reportViewDirty = () => {
    const dirty =
      this.camera.position.distanceToSquared(this.homePos) > 1e-4 ||
      this.controls.target.distanceToSquared(this.homeTarget) > 1e-4;
    if (dirty !== this.viewDirty) {
      this.viewDirty = dirty;
      this.opts.onViewDirty?.(dirty);
    }
  };

  /** Fly the camera home — undoes any orbiting and cursor-zoom drift. */
  resetView() {
    this.camera.position.copy(this.homePos);
    this.controls.target.copy(this.homeTarget);
    this.controls.update();
    this.reportViewDirty();
  }

  private tapSquare(name: string) {
    const col = FILES.indexOf(name[0]);
    const row = RANKS.indexOf(name[1]);
    if (col >= 0 && row >= 0) this.opts.onTap({ row, col });
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;

    // Dream-world motion: clouds circle the terrace; sparkle dust swirls.
    if (!this.opts.reducedMotion) {
      for (const cloud of this.clouds) {
        cloud.position.applyAxisAngle(UP, (cloud.userData.orbit as number) * dt);
      }
      for (let i = 0; i < this.sparkles.length; i++) {
        const motes = this.sparkles[i];
        motes.rotation.y += (motes.userData.spin as number) * dt;
        (motes.material as THREE.PointsMaterial).opacity = 0.6 + 0.3 * Math.sin(now / 900 + i * 2.1);
      }
      // Deep-space motion: stars twinkle, planets turn, and now and then a
      // tiny ship crosses the far dark (fog fades it in and out at the edges).
      for (const s of this.brightStars) {
        (s.sprite.material as THREE.SpriteMaterial).opacity = s.base * (0.72 + 0.28 * Math.sin(now / 700 + s.phase));
      }
      for (const p of this.planets) p.group.rotation.y += p.spin * dt;
      const fb = this.flyby;
      if (fb) {
        if (!fb.ship && now >= fb.nextAt) {
          const rnd = () => ((fb.seed = (fb.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
          fb.ship = this.flyShips[Math.floor(rnd() * this.flyShips.length)];
          const dir = rnd() < 0.5 ? 1 : -1;
          const y = -5 + rnd() * 4.2; // the band the tilted-down camera frames
          const z = (16 + rnd() * 9) * (rnd() < 0.5 ? 1 : -1); // either horizon
          fb.from.set(-34 * dir, y, z);
          fb.to.set(34 * dir, y + (rnd() * 4 - 2), z + (rnd() * 6 - 3));
          fb.dur = 6500 + rnd() * 3000;
          fb.t0 = now;
          fb.ship.position.copy(fb.from);
          fb.ship.lookAt(fb.to);
          fb.ship.visible = true;
        }
        if (fb.ship) {
          const k = (now - fb.t0) / fb.dur;
          if (k >= 1) {
            fb.ship.visible = false;
            fb.ship = null;
            const rnd = () => ((fb.seed = (fb.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
            fb.nextAt = now + 45000 + rnd() * 45000;
          } else {
            fb.ship.position.lerpVectors(fb.from, fb.to, k);
            fb.ship.position.y += Math.sin(k * Math.PI * 2) * 0.4; // a lazy swoop
          }
        }
      }
    }

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      const k = Math.min(1, (now - t.start) / t.dur);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      t.obj.position.lerpVectors(t.from, t.to, e);
      t.obj.position.y += Math.sin(e * Math.PI) * t.arc;
      if (t.fade) {
        t.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m) { m.transparent = true; m.opacity = 1 - e; }
        });
      }
      if (k >= 1) {
        t.onDone?.();
        this.tweens.splice(i, 1);
      }
    }
    if (this.checkMat) this.checkMat.opacity = 0.3 + 0.2 * Math.sin(now / 180);

    // The Galaxy Fleet hovers: each ship bobs gently on its own phase.
    // Skipped while a piece is mid-tween (the move animation owns its y),
    // and entirely under reduced motion (they still float, just steadily).
    if (this.palette.pieceStyle === 'ships' && !this.opts.reducedMotion) {
      const busy = this.tweens.length ? new Set(this.tweens.map((t) => t.obj)) : null;
      for (const [key, piece] of this.pieces) {
        if (busy?.has(piece)) continue;
        const phase = key.charCodeAt(0) * 1.7 + key.charCodeAt(1) * 2.3;
        piece.position.y = Math.sin(now / 1150 + phase) * 0.022;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onCancel);
    this.controls.removeEventListener('change', this.reportViewDirty);
    this.controls.dispose();
    // Every theme switch rebuilds the whole scene (Cloud Kingdom alone holds
    // 200+ geometries), so teardown must actually free the GPU — otherwise a
    // few theme taps exhaust WebGL contexts on iPads and 3D goes black.
    disposeDeep(this.scene);
    for (const tpl of this.templates.values()) disposeDeep(tpl);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

// ── Piece geometry ──────────────────────────────────────────────────────────

const v2 = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const BASE: [number, number][] = [[0, 0], [0.30, 0], [0.30, 0.05], [0.24, 0.09], [0.20, 0.14]];

function lathe(pts: [number, number][], mat: THREE.Material) {
  return new THREE.Mesh(new THREE.LatheGeometry(v2(pts), 40), mat);
}
function ball(r: number, y: number, mat: THREE.Material, sy = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 20), mat);
  m.position.y = y;
  m.scale.y = sy;
  return m;
}

/**
 * Build one piece in the theme's sculpt style: `standard` turns a staunton
 * set (royal details cast in the accent when one is given — the War Room's
 * brass), `fantasy` swaps in the unicorn knight and faerie bishop, and
 * `ships` builds the Galaxy Fleet — every piece a display-model starship on
 * a slender pylon, engines burning in the team's glow colour.
 */
function buildPiece(
  type: PieceType,
  mat: THREE.Material,
  black: boolean,
  style: ScenePalette['pieceStyle'],
  accent?: THREE.Material,
  glow?: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  if (style === 'ships') {
    buildShip(g, type, mat, black, accent ?? mat, glow ?? mat);
    return g;
  }
  switch (type) {
    case 'p':
      g.add(lathe([...BASE, [0.11, 0.22], [0.09, 0.34], [0.13, 0.38], [0, 0.40]], mat));
      g.add(ball(0.135, 0.47, mat));
      break;
    case 'r': {
      g.add(lathe([...BASE, [0.14, 0.24], [0.13, 0.44], [0.20, 0.50], [0.20, 0.62], [0.15, 0.62], [0, 0.62]], mat));
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.10), mat);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        c.position.set(Math.cos(a) * 0.145, 0.665, Math.sin(a) * 0.145);
        g.add(c);
      }
      break;
    }
    case 'b': {
      if (style === 'fantasy' && accent) {
        buildFaerie(g, mat, accent, black);
        break;
      }
      g.add(lathe([...BASE, [0.10, 0.24], [0.075, 0.44], [0.12, 0.50], [0, 0.52]], mat));
      g.add(ball(0.115, 0.60, mat, 1.35));
      g.add(ball(0.035, 0.76, mat));
      break;
    }
    case 'q': {
      if (style === 'fantasy' && accent) {
        buildPrincess(g, mat, accent, black);
        break;
      }
      g.add(lathe([...BASE, [0.12, 0.26], [0.085, 0.52], [0.16, 0.66], [0.13, 0.70], [0, 0.72]], mat));
      const crownMat = accent ?? mat;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const b = ball(0.045, 0.735, crownMat);
        b.position.set(Math.cos(a) * 0.12, 0.735, Math.sin(a) * 0.12);
        g.add(b);
      }
      g.add(ball(0.07, 0.79, crownMat));
      break;
    }
    case 'k': {
      g.add(lathe([...BASE, [0.13, 0.26], [0.09, 0.56], [0.17, 0.70], [0.13, 0.74], [0.09, 0.76], [0, 0.78]], mat));
      const crownMat = accent ?? mat;
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.05), crownMat);
      c1.position.y = 0.88;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), crownMat);
      c2.position.y = 0.90;
      g.add(c1, c2);
      break;
    }
    case 'n': {
      if (style === 'fantasy' && accent) {
        buildUnicorn(g, mat, accent, black);
        break;
      }
      g.add(lathe([...BASE, [0.155, 0.20], [0.17, 0.24]], mat));
      const s = new THREE.Shape();
      const P: [number, number][] = [[-0.14, 0], [0.15, 0], [0.12, 0.12], [0.05, 0.17], [0.07, 0.26], [0.30, 0.34], [0.32, 0.42],
        [0.16, 0.43], [0.11, 0.50], [0.08, 0.60], [0.0, 0.50], [-0.08, 0.54], [-0.13, 0.44], [-0.17, 0.26], [-0.16, 0.10]];
      s.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
      geo.center();
      const head = new THREE.Mesh(geo, mat);
      head.position.y = 0.44;
      head.scale.setScalar(0.92);
      head.rotation.y = black ? Math.PI / 2 : -Math.PI / 2;
      g.add(head);
      break;
    }
  }
  return g;
}

/**
 * The unicorn-theme knight: a sculpted unicorn bust — arched neck, elongated
 * head with muzzle, pricked ears, a beaded mane down the back of the neck, and
 * the golden horn. `dir` is +1/-1 so each side faces its enemy.
 */
function buildUnicorn(g: THREE.Group, mat: THREE.Material, accent: THREE.Material, black: boolean) {
  const dir = black ? 1 : -1;
  g.add(lathe([...BASE, [0.17, 0.2], [0.185, 0.26]], mat));

  // Shoulders/chest sitting on the base.
  const chest = ball(0.155, 0.3, mat, 0.9);
  chest.scale.x = 1.15;
  g.add(chest);

  // Arched neck, leaning toward the enemy.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, 0.42, 18), mat);
  neck.position.set(dir * 0.05, 0.5, 0);
  neck.rotation.z = -dir * 0.38;
  g.add(neck);

  // Head — an elongated sphere with a shorter muzzle sphere at the tip.
  const head = ball(0.105, 0.7, mat);
  head.scale.set(1.55, 0.82, 0.78);
  head.position.x = dir * 0.16;
  head.rotation.z = -dir * 0.32;
  g.add(head);
  const muzzle = ball(0.062, 0.655, mat);
  muzzle.scale.set(1.15, 0.8, 0.72);
  muzzle.position.x = dir * 0.3;
  g.add(muzzle);

  // Pricked ears.
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 10), mat);
    ear.position.set(dir * 0.07, 0.795, side * 0.05);
    ear.rotation.z = -dir * 0.25;
    ear.castShadow = true;
    g.add(ear);
  }

  // The golden horn, from the forehead, following the head's tilt.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.27, 12), accent);
  horn.position.set(dir * 0.135, 0.9, 0);
  horn.rotation.z = -dir * 0.42;
  horn.castShadow = true;
  g.add(horn);

  // A beaded mane down the back of the neck, in a deeper shade of the coat.
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  const maneMat = new THREE.MeshStandardMaterial({
    color: bodyColor.clone().multiplyScalar(0.72),
    roughness: 0.5,
  });
  const maneSpots: [number, number][] = [[-0.02, 0.76], [-0.07, 0.68], [-0.11, 0.59], [-0.145, 0.5], [-0.17, 0.4]];
  for (const [mx, my] of maneSpots) {
    const tuft = ball(0.052, my, maneMat);
    tuft.position.x = dir * mx;
    g.add(tuft);
  }
}

/**
 * The unicorn-theme bishop: a faerie facing her enemy — a gowned figure with
 * hair in a bun under a gold circlet, REAL double-lobed gossamer wings (flat
 * translucent silhouettes, like a butterfly's), a raised golden wand, and a
 * drift of sparkle dust.
 */
function buildFaerie(g: THREE.Group, mat: THREE.Material, accent: THREE.Material, black: boolean) {
  // White sits at +z facing -z; wings go on the back, wand out the front.
  const back = black ? -1 : 1;

  g.add(lathe([...BASE, [0.12, 0.19]], mat));

  // The gown — bell hem, drawn-in waist, small bodice and shoulders.
  g.add(lathe([
    [0.165, 0.17], [0.155, 0.22], [0.125, 0.3], [0.09, 0.38], [0.062, 0.46],
    [0.052, 0.52], [0.062, 0.56], [0.052, 0.61], [0, 0.63],
  ], mat));

  // Head, hair (a deeper shade) swept into a bun, and the golden circlet.
  g.add(ball(0.072, 0.70, mat));
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  const hairMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.66), roughness: 0.55 });
  const hair = ball(0.076, 0.715, hairMat);
  hair.scale.set(1, 0.92, 1);
  hair.position.z = back * 0.018;
  g.add(hair);
  const face = ball(0.062, 0.695, mat);
  face.position.z = -back * 0.028;
  g.add(face);
  const bun = ball(0.034, 0.77, hairMat);
  bun.position.z = back * 0.045;
  g.add(bun);
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.011, 8, 22), accent);
  circlet.position.y = 0.745;
  circlet.rotation.x = Math.PI / 2 - 0.12;
  circlet.castShadow = true;
  g.add(circlet);

  // Real fairy wings: a flat silhouette with a big upper lobe and a small
  // lower lobe, translucent and softly glowing from both sides.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.10, 0.10, 0.20, 0.16);
  wingShape.quadraticCurveTo(0.30, 0.22, 0.28, 0.10);
  wingShape.quadraticCurveTo(0.26, 0.0, 0.12, -0.02);
  wingShape.quadraticCurveTo(0.22, -0.06, 0.18, -0.14);
  wingShape.quadraticCurveTo(0.13, -0.20, 0.05, -0.10);
  wingShape.quadraticCurveTo(0.015, -0.05, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 18);
  const wingMat = new THREE.MeshStandardMaterial({
    color: '#f6f8ff',
    transparent: true,
    opacity: 0.68,
    roughness: 0.12,
    side: THREE.DoubleSide,
    emissive: '#ffd9f2',
    emissiveIntensity: 0.55,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    // Mirror the pair and make them proudly oversized.
    wing.scale.set(side * 1.2, 1.2, 1);
    wing.position.set(side * 0.035, 0.52, back * 0.055);
    // Splayed mostly outward (visible from the front), a gentle sweep back
    // and an upward rake.
    wing.rotation.set(back * -0.12, back * side * 0.5, side * 0.3);
    g.add(wing);
  }

  // The golden wand, raised in front, with a star at its tip.
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 8), accent);
  wand.position.set(0.085, 0.5, -back * 0.055);
  wand.rotation.z = -0.5;
  wand.castShadow = true;
  g.add(wand);
  const star = ball(0.026, 0.59, accent);
  star.position.set(0.135, 0.59, -back * 0.055);
  g.add(star);

  // A drift of sparkle dust trailing off the wand.
  const dustMat = new THREE.MeshStandardMaterial({ color: '#fff3fb', emissive: '#ffc9ec', emissiveIntensity: 0.9 });
  const dust: [number, number, number, number][] = [
    [0.19, 0.66, -back * 0.03, 0.012],
    [0.24, 0.60, -back * 0.08, 0.009],
    [0.21, 0.52, -back * 0.11, 0.007],
  ];
  for (const [dx, dy, dz, r] of dust) {
    const mote = ball(r, dy, dustMat);
    mote.position.set(dx, dy, dz);
    g.add(mote);
  }
}

/**
 * The unicorn-theme queen: a proper princess. A grand ballgown with a gold
 * hem, puff sleeves, long hair falling down her back beneath a pointed
 * gold tiara with a jewel — unmistakably the princess of the set, and a
 * head shorter than the star-crowned king.
 */
function buildPrincess(g: THREE.Group, mat: THREE.Material, accent: THREE.Material, black: boolean) {
  // Like the faerie: white faces -z, so hair falls toward +z ("back").
  const back = black ? -1 : 1;

  g.add(lathe([...BASE, [0.14, 0.19]], mat));

  // The ballgown — a wide sweeping bell, a cinched waist, a small bodice.
  g.add(lathe([
    [0.195, 0.17], [0.185, 0.23], [0.15, 0.33], [0.105, 0.43], [0.075, 0.51],
    [0.06, 0.58], [0.07, 0.63], [0.06, 0.68], [0, 0.7],
  ], mat));
  // Gold trim around the hem.
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.012, 8, 36), accent);
  hem.position.y = 0.2;
  hem.rotation.x = Math.PI / 2;
  g.add(hem);

  // Puff sleeves at the shoulders.
  for (const side of [-1, 1]) {
    const sleeve = ball(0.042, 0.635, mat);
    sleeve.position.x = side * 0.078;
    g.add(sleeve);
  }

  // Head, face, and long princess hair — a cap, two locks falling down the
  // back, all in a deeper shade of the gown.
  g.add(ball(0.075, 0.775, mat));
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  const hairMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.66), roughness: 0.55 });
  const cap = ball(0.08, 0.79, hairMat);
  cap.scale.set(1, 0.9, 1);
  cap.position.z = back * 0.016;
  g.add(cap);
  const face = ball(0.064, 0.77, mat);
  face.position.z = -back * 0.03;
  g.add(face);
  for (const side of [-1, 1]) {
    const lock = ball(0.03, 0.66, hairMat);
    lock.scale.set(1, 2.6, 1);
    lock.position.set(side * 0.05, 0.66, back * 0.06);
    g.add(lock);
  }

  // The tiara: a gold circlet with three points and a jewel at its brow.
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.011, 8, 24), accent);
  circlet.position.y = 0.845;
  circlet.rotation.x = Math.PI / 2 - 0.12;
  circlet.castShadow = true;
  g.add(circlet);
  for (const px of [-0.036, 0, 0.036]) {
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.011, px === 0 ? 0.05 : 0.034, 8), accent);
    point.position.set(px, px === 0 ? 0.885 : 0.875, -back * 0.038);
    point.castShadow = true;
    g.add(point);
  }
  const jewel = ball(0.014, 0.856, mat);
  jewel.position.z = -back * 0.058;
  g.add(jewel);
}

/**
 * The Galaxy Fleet — every piece a little display-model starship hovering on
 * a slender pylon, nose toward the enemy, engines burning in the side's glow
 * colour. Light flies the rebel fleet, dark the Empire; the sculpts are
 * loving procedural nods to the ships every kid knows.
 */
function buildShip(
  g: THREE.Group,
  type: PieceType,
  mat: THREE.Material,
  black: boolean,
  accent: THREE.Material,
  glow: THREE.Material,
) {
  // White sits at +z and flies toward -z; black the opposite.
  const f = black ? 1 : -1;

  // No plinth, no pylon — the ships simply FLY, hanging over their squares
  // (their cast shadows on the tiles below sell the hover).
  const HOVER: Record<PieceType, number> = { p: 0.34, n: 0.38, b: 0.42, r: 0.44, q: 0.5, k: 0.5 };
  const ship = new THREE.Group();
  ship.position.y = HOVER[type];
  ship.scale.setScalar(1.32);
  g.add(ship);

  /** A cone lying along z, tip toward the enemy. */
  const zcone = (r: number, len: number, m: THREE.Material, segments = 18) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, segments), m);
    c.rotation.x = (f * Math.PI) / 2;
    ship.add(c);
    return c;
  };
  /** A cylinder lying along z (fuselages, nacelles, hulls). */
  const zcyl = (r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m);
    c.rotation.x = Math.PI / 2;
    c.position.set(x, y, z);
    ship.add(c);
    return c;
  };
  const engine = (x: number, z: number, r: number, y = 0) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), glow);
    e.position.set(x, y, -f * z);
    ship.add(e);
  };
  const detail = (x: number, y: number, z: number, r: number, m: THREE.Material = accent) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
    d.position.set(x, y, f * z);
    ship.add(d);
    return d;
  };
  /** A flattened 4-sided cone = the capital-ship wedge hull. */
  const wedge = (r: number, len: number, widen: number, flatten: number) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, 4), mat);
    m.rotation.x = (f * Math.PI) / 2;
    m.scale.set(widen, 1, flatten); // local z is world-vertical after the tilt
    ship.add(m);
    return m;
  };

  void accent; // referenced through `detail`'s default
  if (black) buildEmpireShip(type, ship, mat, glow, f, { zcone, zcyl, engine, detail, wedge });
  else buildRebelShip(type, ship, mat, glow, f, { zcone, zcyl, engine, detail, wedge });
}

interface ShipKit {
  zcone: (r: number, len: number, m: THREE.Material, segments?: number) => THREE.Mesh;
  zcyl: (r: number, len: number, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
  engine: (x: number, z: number, r: number, y?: number) => void;
  detail: (x: number, y: number, z: number, r: number, m?: THREE.Material) => THREE.Mesh;
  wedge: (r: number, len: number, widen: number, flatten: number) => THREE.Mesh;
}

/** The rebel fleet (light side). */
function buildRebelShip(
  type: PieceType,
  ship: THREE.Group,
  mat: THREE.Material,
  glow: THREE.Material,
  f: number,
  kit: ShipKit,
) {
  const { zcone, zcyl, engine, detail, wedge } = kit;
  switch (type) {
    case 'p': { // X-wing — long fuselage, four S-foils, wingtip cannons
      zcyl(0.03, 0.3, mat, 0, 0, f * 0.02);
      const nose = zcone(0.028, 0.16, mat);
      nose.position.z = f * 0.24;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.048, 0.14), mat);
      tail.position.set(0, 0.002, -f * 0.1);
      ship.add(tail); // the boxy engine block behind the cockpit
      detail(0, 0.038, 0.06, 0.026); // canopy stripe in rebel red
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const foil = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.085), mat);
          foil.position.set(sx * 0.11, sy * 0.03, -f * 0.09);
          foil.rotation.z = sx * sy * 0.28; // the open X
          ship.add(foil);
          // Wingtip laser cannon, poking ahead of each foil.
          const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), mat);
          cannon.rotation.x = Math.PI / 2;
          cannon.position.set(sx * 0.09, 0.004, f * 0.06);
          foil.add(cannon);
          // One engine per foil root — four in all, like the real thing.
          const eng = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), glow);
          eng.position.set(sx * 0.02, 0, -f * 0.055);
          foil.add(eng);
        }
      }
      break;
    }
    case 'n': { // A-wing — a darting little delta with twin tail fins
      wedge(0.1, 0.3, 1.25, 0.5);
      detail(0, 0.03, 0.04, 0.026);
      for (const sx of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.08), mat);
        fin.position.set(sx * 0.06, 0.05, -f * 0.1);
        ship.add(fin);
      }
      engine(-0.045, 0.17, 0.028);
      engine(0.045, 0.17, 0.028);
      break;
    }
    case 'b': { // Y-wing — cockpit up front, two long engine nacelles behind
      zcyl(0.03, 0.3, mat, 0, 0, f * 0.06);
      const pod = detail(0, 0.005, 0.2, 0.05, mat);
      pod.scale.set(0.85, 0.75, 1.5);
      detail(0, 0.04, 0.22, 0.024); // canopy
      for (const sx of [-1, 1]) {
        zcyl(0.032, 0.3, mat, sx * 0.095, 0, -f * 0.05);
        detail(sx * 0.095, 0, 0.11, 0.032, mat); // nacelle nose cap
        engine(sx * 0.095, 0.21, 0.026);
      }
      break;
    }
    case 'r': { // blockade runner — hammerhead bow, banked engine cluster
      zcyl(0.05, 0.36, mat);
      const head = detail(0, 0, 0.2, 0.075, mat);
      head.scale.set(1.15, 0.7, 0.85); // the hammerhead
      detail(0, 0.055, 0.02, 0.02); // sensor dish
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.07), mat);
      block.position.set(0, 0, -f * 0.19);
      ship.add(block);
      engine(-0.05, 0.235, 0.022);
      engine(0, 0.235, 0.022, 0.025);
      engine(0.05, 0.235, 0.022);
      engine(0, 0.235, 0.022, -0.025);
      break;
    }
    case 'q': { // the saucer freighter — disc, mandibles, dish, offset cockpit
      const disc = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 16), mat);
      disc.scale.set(1, 0.28, 1);
      ship.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.014, 10, 32), mat);
      rim.rotation.x = Math.PI / 2;
      ship.add(rim); // the docking-ring band around the hull's equator
      for (const sx of [-1, 1]) {
        const mand = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.034, 0.14), mat);
        mand.position.set(sx * 0.056, 0, f * 0.175);
        ship.add(mand);
      }
      const cockpit = zcyl(0.026, 0.1, mat, 0.125, 0.012, f * 0.1);
      cockpit.rotation.x = Math.PI / 2;
      detail(0.125, 0.014, 0.155, 0.022); // cockpit glass
      // The rectangular sensor dish, tilted up off the port side.
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.008, 16), mat);
      dish.position.set(-0.07, 0.05, -f * 0.03);
      dish.rotation.set(f * 0.9, 0, 0.35);
      ship.add(dish);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.035, 6), mat);
      stalk.position.set(-0.07, 0.032, -f * 0.03);
      ship.add(stalk);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.012), glow);
      band.position.set(0, 0, -f * 0.152);
      ship.add(band); // the long blue-white engine strip
      break;
    }
    case 'k': { // Mon Cal flagship — whale-backed cruiser, bristling with domes
      const hull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 22, 16), mat);
      hull.scale.set(0.9, 0.55, 2.4);
      ship.add(hull);
      detail(-0.035, 0.05, 0.08, 0.018, mat);
      detail(0.04, 0.055, -0.02, 0.022, mat);
      detail(-0.02, 0.05, -0.1, 0.016, mat);
      detail(0.02, 0.06, 0.14, 0.014); // command dome, in rebel red
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), mat);
      mast.position.y = 0.12;
      ship.add(mast);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), glow);
      beacon.position.y = 0.21;
      ship.add(beacon);
      engine(-0.04, 0.24, 0.02);
      engine(0, 0.245, 0.024);
      engine(0.04, 0.24, 0.02);
      break;
    }
  }
}

/** The Empire (dark side). */
function buildEmpireShip(
  type: PieceType,
  ship: THREE.Group,
  mat: THREE.Material,
  glow: THREE.Material,
  f: number,
  kit: ShipKit,
) {
  const { engine, detail, wedge } = kit;
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  /** Darker imperial plating — solar panels, trenches, hull plates. */
  const plateMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.55), roughness: 0.7 });
  /** The TIE ball cockpit with its round viewport. */
  const ball = (r: number) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
    ship.add(b);
    const eye = detail(0, 0, r * 0.82, r * 0.42);
    eye.scale.z = 0.5;
    return b;
  };
  /**
   * A proper TIE wing: a hexagonal frame with a darker solar panel inset,
   * joined to the ball by a strut. `rake` angles interceptor daggers toward
   * the enemy; `stretch` elongates the hex vertically.
   */
  const hexWing = (x: number, r: number, rake = 0, stretch = 1) => {
    const wing = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.016, 6), mat);
    frame.rotation.z = Math.PI / 2; // hex face out along x
    wing.add(frame);
    const cells = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.02, 6), plateMat);
    cells.rotation.z = Math.PI / 2;
    wing.add(cells);
    wing.position.x = x;
    wing.scale.y = stretch;
    wing.rotation.y = -Math.sign(x) * f * rake;
    ship.add(wing);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, Math.abs(x), 8), mat);
    strut.rotation.z = Math.PI / 2;
    strut.position.set(x / 2, 0, 0);
    ship.add(strut);
  };
  switch (type) {
    case 'p': // TIE fighter — ball cockpit between two hex solar wings
      ball(0.06);
      hexWing(-0.115, 0.095);
      hexWing(0.115, 0.095);
      engine(0, 0.068, 0.018);
      break;
    case 'n': // TIE interceptor — stretched daggers raked at the enemy
      ball(0.056);
      hexWing(-0.115, 0.085, 0.5, 1.35);
      hexWing(0.115, 0.085, 0.5, 1.35);
      engine(-0.028, 0.066, 0.016);
      engine(0.028, 0.066, 0.016);
      break;
    case 'b': { // the trifoil shuttle — tall dorsal fin, drooped wings
      const body = kit.zcone(0.06, 0.3, mat);
      body.position.z = f * 0.03;
      detail(0, 0.035, 0.13, 0.026); // cockpit
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.22, 0.13), mat);
      fin.position.set(0, 0.12, -f * 0.06);
      fin.rotation.x = -f * 0.3;
      ship.add(fin);
      for (const sx of [-1, 1]) {
        const wingM = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.2, 0.14), mat);
        wingM.position.set(sx * 0.085, -0.07, -f * 0.02);
        wingM.rotation.z = -sx * 0.55; // drooped for landing-bay drama
        ship.add(wingM);
      }
      engine(0, 0.13, 0.032);
      break;
    }
    case 'r': { // Star Destroyer — tiered wedge hull, neck, twin-domed bridge
      wedge(0.15, 0.55, 1.4, 0.45);
      const tier = wedge(0.095, 0.36, 1.3, 0.5); // the raised city deck
      tier.position.set(0, 0.03, -f * 0.07);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.06), mat);
      neck.position.set(0, 0.055, -f * 0.17);
      ship.add(neck);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.045), mat);
      bridge.position.set(0, 0.092, -f * 0.17);
      ship.add(bridge);
      detail(-0.04, 0.115, -0.17, 0.013); // deflector domes, atop the bridge
      detail(0.04, 0.115, -0.17, 0.013);
      engine(-0.06, 0.29, 0.024);
      engine(0, 0.29, 0.028);
      engine(0.06, 0.29, 0.024);
      break;
    }
    case 'q': { // the Executor — a long blade with a superstructure city
      wedge(0.13, 0.82, 1.5, 0.32);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.026, 0.42), plateMat);
      ridge.position.set(0, 0.026, -f * 0.06);
      ship.add(ridge);
      // Blocks of city marching down the spine toward the bridge.
      for (const [bz, bw] of [[0.06, 0.036], [-0.06, 0.03], [-0.17, 0.024]] as const) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.016, 0.07), mat);
        block.position.set(0, 0.046, f * bz);
        ship.add(block);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.024, 0.035), mat);
      bridge.position.set(0, 0.068, -f * 0.28);
      ship.add(bridge);
      detail(0, 0.09, -0.28, 0.012);
      engine(-0.05, 0.42, 0.02);
      engine(0, 0.42, 0.024);
      engine(0.05, 0.42, 0.02);
      break;
    }
    case 'k': { // the battle station — sphere, trench, dish, hull plates
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 22), mat);
      ship.add(core);
      const trench = new THREE.Mesh(new THREE.TorusGeometry(0.169, 0.012, 8, 40), plateMat);
      trench.rotation.x = Math.PI / 2;
      ship.add(trench);
      // The superlaser dish, up-and-forward where everyone expects it —
      // a concave darker bowl with a rim and a pale green focusing lens.
      const dishDir = new THREE.Vector3(0.35, 0.55, f * 0.75).normalize();
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), plateMat);
      dish.scale.set(1, 1, 0.3);
      dish.position.copy(dishDir.clone().multiplyScalar(0.152));
      dish.lookAt(dishDir.clone().multiplyScalar(2));
      ship.add(dish);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.006, 8, 24), mat);
      rim.position.copy(dishDir.clone().multiplyScalar(0.163));
      rim.lookAt(dishDir.clone().multiplyScalar(2));
      ship.add(rim);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), glow);
      lens.position.copy(dishDir.clone().multiplyScalar(0.158));
      ship.add(lens);
      // Scattered darker hull plates (seeded, so every build looks the same).
      let seed = 11;
      const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 7; i++) {
        const az = rand() * Math.PI * 2;
        const el = (rand() - 0.35) * 1.6;
        const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
        if (dir.angleTo(dishDir) < 0.55) continue; // keep the dish's face clean
        const plate = new THREE.Mesh(new THREE.CircleGeometry(0.018 + rand() * 0.02, 10), plateMat);
        plate.position.copy(dir.clone().multiplyScalar(0.1705));
        plate.lookAt(dir.clone().multiplyScalar(2));
        ship.add(plate);
      }
      break;
    }
  }
}
