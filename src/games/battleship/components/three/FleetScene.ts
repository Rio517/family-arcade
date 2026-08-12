/**
 * The three.js fleet scene — your Battleship board as a real patch of ocean:
 * animated water, a faint targeting grid, procedural warships (carrier,
 * battleship, cruiser, submarine, destroyer) in haze grey with the fleet
 * skin's colour as hull stripes and the board's glowing rim, fires burning
 * where you've been hit, foam rings where the enemy missed, and sunk ships
 * listing dark in the water.
 *
 * Framework-free and read-only: the React wrapper (Fleet3D) feeds it the
 * fleet + incoming-shot grid; the only interaction is orbiting the camera.
 * All geometry is procedural, so the PWA stays fully offline.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CellState } from '@games/battleship/domain/engine';
import { BOARD_SIZE, type FleetEra, type Orientation, type ShipId } from '@games/battleship/domain/types';
import { disposeDeep } from '@shared/three/disposeDeep';
import { buildModelShip, loadShipModels } from './shipModels';

export interface SceneShip {
  shipId: ShipId;
  row: number;
  col: number;
  size: number;
  orientation: Orientation;
  sunk?: boolean;
}

const HALF = (BOARD_SIZE - 1) / 2; // board cell → world offset

/** A freshly-sunk hull takes this long to slip under the water. */
const SINK_MS = 30_000;

export class FleetScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private shipsGroup = new THREE.Group();
  private markGroup = new THREE.Group();
  private fires: THREE.Group[] = [];
  private smokes: THREE.Group[] = [];
  private bobbing: THREE.Group[] = [];
  /** Hulls partway through their 30-second foundering, advanced by the loop. */
  private sinkers: { g: THREE.Group; start: number; drop: number; baseList: number }[] = [];
  /** shipId → when its foundering began. Survives the per-shot rebuilds. */
  private sunkSince = new Map<ShipId, number>();
  /** Ships an earlier update showed afloat — a sink after that is fresh news. */
  private seenAfloat = new Set<ShipId>();
  private water: THREE.Mesh;
  private waterBase: Float32Array;
  private raf = 0;
  private resizeObs: ResizeObserver | null = null;
  private disposed = false;
  /** Last state passed to update(), replayed once the ship meshes arrive. */
  private lastState: { ships: SceneShip[]; incoming: CellState[][] } | null = null;

  constructor(
    private container: HTMLElement,
    private opts: {
      skinColor: string;
      /** Which navy this captain sails — classic (default) or modern. */
      era?: FleetEra;
      reducedMotion: boolean;
      /** Fires once the ship meshes have decoded and the fleet is rebuilt. */
      onFleetReady?: () => void;
    },
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#0a1424');
    this.scene.fog = new THREE.Fog('#0a1424', 16, 30);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    this.camera.position.set(0, 8.2, 9.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 19;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minPolarAngle = 0.15;
    this.controls.target.set(0, 0, 0);
    // Zoom dives toward the pointer — zooming at a burning ship takes you to
    // that ship, not to the middle of the ocean.
    this.controls.zoomToCursor = true;
    this.controls.update();

    // ── Light: a moonlit night engagement ──
    this.scene.add(new THREE.HemisphereLight('#cfe4ff', '#0b3444', 1.05));
    const moon = new THREE.DirectionalLight('#f2f7ff', 2.6);
    moon.position.set(6, 10, 4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -7; moon.shadow.camera.right = 7;
    moon.shadow.camera.top = 7; moon.shadow.camera.bottom = -7;
    moon.shadow.bias = -0.0004;
    this.scene.add(moon);
    const rim = new THREE.DirectionalLight(opts.skinColor, 0.4);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);

    // ── The sea: a gently rolling plane ──
    const waterGeo = new THREE.PlaneGeometry(13.5, 13.5, 26, 26);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterBase = new Float32Array(waterGeo.attributes.position.array);
    this.water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({ color: '#14506e', roughness: 0.72, metalness: 0.08 }),
    );
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    // ── The targeting grid + glowing rim in the fleet's colour ──
    const grid = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, '#3d6d8a', '#28546e');
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).transparent = true;
    (grid.material as THREE.Material & { opacity: number }).opacity = 0.5;
    grid.position.y = 0.06;
    this.scene.add(grid);
    // A quiet frame, not a lamp. The rim slab sits at wave height, so the
    // rolling sea laps over its lip — with the old bright emissive that read
    // as an irritating flickering border. Kill the glow and the lapping goes
    // back to being water. (The inner box is the board's dark floor; it must
    // stay ABOVE the rim slab or the tint washes the whole board.)
    const rimBar = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_SIZE + 0.5, 0.06, BOARD_SIZE + 0.5),
      new THREE.MeshStandardMaterial({
        color: opts.skinColor,
        emissive: opts.skinColor,
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.75,
      }),
    );
    rimBar.position.y = -0.02;
    const rimHole = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_SIZE + 0.1, 0.1, BOARD_SIZE + 0.1),
      new THREE.MeshStandardMaterial({ color: '#0a1424' }),
    );
    rimHole.position.y = -0.021;
    this.scene.add(rimBar, rimHole);

    this.scene.add(this.shipsGroup, this.markGroup);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop(performance.now());

    // Ship meshes arrive asynchronously and replace the procedural stand-ins.
    void this.loadModels();
  }

  /**
   * Fetch the generated ship meshes, then rebuild the fleet with them. The
   * board renders immediately with procedural hulls and swaps them for the
   * real models when they land, so a slow decode never blocks the first frame.
   */
  private async loadModels() {
    await loadShipModels(this.opts.era ?? 'classic');
    if (this.disposed) return;
    if (this.lastState) this.update(this.lastState.ships, this.lastState.incoming);
    this.opts.onFleetReady?.();
  }

  /** Rebuild ships + shot markers from the current battle state. */
  update(ships: SceneShip[], incoming: CellState[][]) {
    this.lastState = { ships, incoming };
    // This runs on every shot; free what the old fleet OWNS or GPU buffers
    // accumulate for the whole battle. Model-built hulls are clones sharing
    // geometry/materials/textures with the module-level GLB cache — disposing
    // them evicts the cache's GPU buffers and re-uploads every hull on every
    // shot (the classic iPad per-shot stutter). Their few restyled material
    // clones are CPU-tiny and left to GC. Procedural hulls own everything.
    for (const hull of this.shipsGroup.children) {
      if (!hull.userData.cachedResources) disposeDeep(hull);
    }
    disposeMarks(this.markGroup);
    this.shipsGroup.clear();
    this.markGroup.clear();
    this.fires = [];
    this.smokes = [];
    this.bobbing = [];
    this.sinkers = [];

    for (const ship of ships) {
      // Generated mesh where we have one; procedural hull everywhere else.
      const model = buildModelShip(ship.shipId, ship.size, ship.sunk === true, this.opts.skinColor, this.opts.era ?? 'classic');
      const g = model ?? buildWarship(ship.shipId, ship.size, ship.sunk === true, this.opts.skinColor);
      // Marks whether this hull's resources belong to the GLB cache (see the
      // selective disposal above).
      g.userData.cachedResources = model !== null;
      const horiz = ship.orientation === 'H';
      const cx = (horiz ? ship.col + (ship.size - 1) / 2 : ship.col) - HALF;
      const cz = (horiz ? ship.row : ship.row + (ship.size - 1) / 2) - HALF;
      g.position.set(cx, 0, cz);
      if (!horiz) g.rotation.y = Math.PI / 2;
      if (ship.sunk) {
        // Sunk: settle low and list, fires out — then the sea takes it. A
        // fresh sink founders over SINK_MS in the render loop until the hull
        // slips fully underwater (the water is opaque, so gone is gone; the
        // smouldering smoke marker stays behind on the surface). A ship that
        // was already sunk when this scene opened — a resumed game, the
        // pop-out's second scene — went down long ago and starts out of sight.
        const baseList = ship.shipId.length % 2 ? 0.14 : -0.12;
        g.position.y = -0.09;
        g.rotation.z = baseList;
        // How far down "fully under" is: the masthead plus a little water.
        const drop = new THREE.Box3().setFromObject(g).max.y + 0.15;
        if (this.seenAfloat.has(ship.shipId) && !this.sunkSince.has(ship.shipId)) {
          this.sunkSince.set(ship.shipId, performance.now());
        }
        const start = this.sunkSince.get(ship.shipId);
        if (start === undefined || this.opts.reducedMotion) {
          // Long gone (or reduced motion: same end state, no animation).
          g.position.y -= drop;
        } else {
          this.sinkers.push({ g, start, drop, baseList });
        }
      } else {
        this.seenAfloat.add(ship.shipId);
        this.sunkSince.delete(ship.shipId);
        this.bobbing.push(g);
        g.userData.phase = ship.row * 1.7 + ship.col * 2.3;
      }
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          (o as THREE.Mesh).receiveShadow = true;
        }
      });
      this.shipsGroup.add(g);
    }

    // Shot markers: real flames on struck decks, foam rings on misses.
    // A fire's size follows the ship it burns on — a carrier blaze dwarfs a
    // destroyer's — so work out which hull owns each struck cell first.
    const shipSizeAt = (row: number, col: number): number => {
      for (const s of ships) {
        for (let i = 0; i < s.size; i++) {
          const r = s.orientation === 'V' ? s.row + i : s.row;
          const c = s.orientation === 'H' ? s.col + i : s.col;
          if (r === row && c === col) return s.size;
        }
      }
      return 3;
    };
    const foamMat = new THREE.MeshBasicMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.55 });
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const state = incoming[r][c];
        if (state === 'unknown') continue;
        const x = c - HALF;
        const z = r - HALF;
        if (state === 'miss') {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24), foamMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(x, 0.075, z);
          this.markGroup.add(ring);
          const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 8, 28), foamMat);
          ring2.rotation.x = Math.PI / 2;
          ring2.position.set(x, 0.07, z);
          this.markGroup.add(ring2);
        } else if (state === 'sunk') {
          // A dead hull smoulders: heavy dark smoke hanging low, no live flame.
          const smoke = buildSmoke(1.15, r * BOARD_SIZE + c, '#2b303a', 0.14, 0.16);
          smoke.position.x = x;
          smoke.position.z = z;
          this.markGroup.add(smoke);
          this.smokes.push(smoke);
        } else {
          // A burning deck: crossed flame sprites sized to the ship, with a
          // glowing base and a soft puff climbing off the tip. Both are
          // animated in the render loop.
          const grew = 0.72 + 0.12 * shipSizeAt(r, c);
          const flame = buildFlame(grew, r * BOARD_SIZE + c);
          flame.position.set(x, 0.2, z);
          this.markGroup.add(flame);
          this.fires.push(flame);
          const smoke = buildSmoke(0.62 * grew, r * BOARD_SIZE + c + 37, '#3a3f4a', 0.24 + 0.5 * grew, 0.34);
          smoke.position.x = x;
          smoke.position.z = z;
          this.markGroup.add(smoke);
          this.smokes.push(smoke);
        }
      }
    }
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

    // Foundering hulls go down whatever else animates — this is game state
    // playing out, not decoration. (Under reduced motion sinkers stays empty:
    // sunk ships are placed at their final depth when the fleet is built.)
    for (const s of this.sinkers) {
      const t = Math.min(1, (now - s.start) / SINK_MS);
      const e = t * t; // founders slowly at first, then the sea takes it
      s.g.position.y = -0.09 - s.drop * e;
      // The list deepens as the hull floods.
      s.g.rotation.z = s.baseList * (1 + 1.6 * e);
    }

    if (!this.opts.reducedMotion) {
      // Roll the sea.
      const pos = this.water.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = this.waterBase[i * 3];
        const bz = this.waterBase[i * 3 + 2];
        pos.setY(i, Math.sin(bx * 1.15 + now / 900) * Math.cos(bz * 0.95 + now / 1100) * 0.024);
      }
      pos.needsUpdate = true;
      this.water.geometry.computeVertexNormals();

      // Ships ride the swell; fires gutter and dance.
      for (const g of this.bobbing) {
        const p = g.userData.phase as number;
        g.position.y = Math.sin(now / 1300 + p) * 0.02;
        g.rotation.x = Math.sin(now / 1700 + p) * 0.012;
      }
      for (const flame of this.fires) {
        const seed = flame.userData.seed as number;
        const base = flame.userData.base as number;
        // Two incommensurate sine bands read as a gutter, not a metronome.
        const s = 1 + 0.14 * Math.sin(now / 95 + seed) + 0.07 * Math.sin(now / 43 + seed * 2.7);
        flame.scale.set(base * s, base * (2.05 - s), base * s);
        flame.rotation.y = seed + now / 1600;
      }
      for (const smoke of this.smokes) {
        const seed = smoke.userData.seed as number;
        const base = smoke.userData.base as number;
        const baseY = smoke.userData.baseY as number;
        const rise = smoke.userData.rise as number;
        const mat = smoke.userData.mat as THREE.MeshBasicMaterial;
        // Each puff climbs off its fire, swelling and thinning, then re-forms.
        const t = (now / 2600 + seed) % 1;
        smoke.position.y = baseY + rise * t;
        smoke.scale.setScalar(base * (0.85 + 0.55 * t));
        mat.opacity = 0.5 * Math.sin(Math.PI * t);
        smoke.rotation.y = seed + now / 2300;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    // Actually free the GPU on teardown — the scene rebuilds on every skin
    // change, and leaked WebGL contexts eventually kill 3D on iPads.
    disposeDeep(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

/**
 * Free the marks' own geometry and materials, but never the module-cached
 * flame/smoke canvas textures their materials map — those are drawn once and
 * shared by every fire on the board for the life of the page. `disposeDeep`
 * would dispose the maps too, silently re-uploading both textures on every
 * shot.
 */
function disposeMarks(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      const map = (m as THREE.MeshBasicMaterial).map;
      if (map && map !== flameTextureCache && map !== smokeTextureCache) map.dispose();
      m.dispose();
    }
  });
}

// ── Fire ────────────────────────────────────────────────────────────────────

let flameTextureCache: THREE.CanvasTexture | null = null;

/**
 * One painted flame tongue: white-hot at the base, orange through the body,
 * fading out at the tip. Drawn once and shared by every fire on the board.
 */
function flameTexture(): THREE.CanvasTexture {
  if (flameTextureCache) return flameTextureCache;
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // The tongue: a teardrop, wide at the base, licking to a point.
  ctx.beginPath();
  ctx.moveTo(w / 2, 4);
  ctx.bezierCurveTo(w * 0.92, h * 0.42, w * 0.86, h * 0.8, w / 2, h - 4);
  ctx.bezierCurveTo(w * 0.14, h * 0.8, w * 0.08, h * 0.42, w / 2, 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, 'rgba(255, 246, 214, 0.95)');
  g.addColorStop(0.3, 'rgba(255, 194, 60, 0.9)');
  g.addColorStop(0.62, 'rgba(255, 122, 26, 0.75)');
  g.addColorStop(0.88, 'rgba(230, 64, 18, 0.35)');
  g.addColorStop(1, 'rgba(210, 40, 12, 0)');
  ctx.fillStyle = g;
  ctx.filter = 'blur(2px)';
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  flameTextureCache = tex;
  return tex;
}

/**
 * A deck fire: three crossed flame sprites (additive, so overlaps glow), a
 * hot ember disc at the base. Reads as a volume from every camera azimuth
 * without billboarding. `base` scales the whole blaze to the ship it burns
 * on; `seed` desynchronises the flicker between fires.
 */
function buildFlame(base: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: flameTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const geo = new THREE.PlaneGeometry(0.34, 0.62);
  for (let i = 0; i < 3; i++) {
    const tongue = new THREE.Mesh(geo, mat);
    tongue.position.y = 0.26;
    tongue.rotation.y = (i * Math.PI) / 3 + (seed % 7) * 0.31;
    // The tongues lean apart a little so the silhouette isn't a neat X.
    tongue.rotation.z = (i - 1) * 0.09;
    group.add(tongue);
  }
  const ember = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 20),
    new THREE.MeshBasicMaterial({
      color: '#ffd76a',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  ember.rotation.x = -Math.PI / 2;
  ember.position.y = 0.015;
  group.add(ember);
  group.userData.base = base;
  group.userData.seed = seed * 0.73;
  group.scale.setScalar(base);
  return group;
}

let smokeTextureCache: THREE.CanvasTexture | null = null;

/**
 * A soft smoke puff: overlapping blurred blobs fading to nothing at the edge,
 * painted white so the material's colour supplies the grey. Drawn once and
 * shared by every plume on the board.
 */
function smokeTexture(): THREE.CanvasTexture {
  if (smokeTextureCache) return smokeTextureCache;
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const blobs: Array<[number, number, number, number]> = [
    [0.5, 0.52, 0.34, 0.55],
    [0.36, 0.42, 0.22, 0.4],
    [0.64, 0.4, 0.2, 0.4],
    [0.5, 0.66, 0.24, 0.35],
  ];
  for (const [bx, by, radius, alpha] of blobs) {
    const g = ctx.createRadialGradient(bx * size, by * size, 1, bx * size, by * size, radius * size);
    g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    g.addColorStop(0.6, `rgba(255, 255, 255, ${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  smokeTextureCache = tex;
  return tex;
}

/**
 * A smoke plume: two crossed soft-puff sprites (normal blending — smoke
 * shades, it doesn't glow). The render loop walks it from `baseY` up through
 * `rise`, swelling and thinning as it climbs; without motion it holds the
 * mid-climb pose so reduced-motion players still see smoke, not a freeze at
 * an odd instant.
 */
function buildSmoke(base: number, seed: number, tint: string, baseY: number, rise: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: smokeTexture(),
    color: tint,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(0.5, 0.5);
  for (let i = 0; i < 2; i++) {
    const puff = new THREE.Mesh(geo, mat);
    puff.rotation.y = (i * Math.PI) / 2 + (seed % 5) * 0.4;
    group.add(puff);
  }
  group.userData.base = base;
  group.userData.seed = seed * 0.61;
  group.userData.baseY = baseY;
  group.userData.rise = rise;
  group.userData.mat = mat;
  // The static (reduced-motion) pose: mid-climb, mid-swell.
  group.position.y = baseY + rise * 0.45;
  group.scale.setScalar(base * 1.1);
  return group;
}

// ── Procedural warships ─────────────────────────────────────────────────────

/** A pointed-bow hull outline, extruded and laid flat. Length along x. */
function hullMesh(length: number, beam: number, height: number, mat: THREE.Material): THREE.Mesh {
  const hw = beam / 2;
  const s = new THREE.Shape();
  s.moveTo(-length / 2 + 0.08, -hw);
  s.lineTo(length / 2 - 0.42, -hw);
  s.quadraticCurveTo(length / 2 - 0.05, -hw * 0.28, length / 2, 0);
  s.quadraticCurveTo(length / 2 - 0.05, hw * 0.28, length / 2 - 0.42, hw);
  s.lineTo(-length / 2 + 0.08, hw);
  s.quadraticCurveTo(-length / 2, 0, -length / 2 + 0.08, -hw);
  const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2); // lay the deck flat (extrusion becomes height)
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.05; // waterline: a little hull below the surface
  return mesh;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** A gun turret with `n` barrels, facing +x. */
function turret(mat: THREE.Material, x: number, y: number, barrels: number, back = false): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.07, 12), mat);
  g.add(base);
  for (let i = 0; i < barrels; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.24, 6), mat);
    b.rotation.z = (back ? 1 : -1) * (Math.PI / 2 - 0.12);
    b.position.set((back ? -1 : 1) * 0.16, 0.045, (i - (barrels - 1) / 2) * 0.05);
    g.add(b);
  }
  g.position.set(x, y, 0);
  return g;
}

/**
 * Build one warship, length along x, bow toward +x. Haze-grey hulls with the
 * fleet colour as a hull stripe; sunk ships render dark and colourless.
 */
function buildWarship(id: ShipId, size: number, sunk: boolean, skinColor: string): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: sunk ? '#3c4450' : '#93a0ae', roughness: 0.62, metalness: 0.2 });
  const deckMat = new THREE.MeshStandardMaterial({ color: sunk ? '#333a44' : '#6c7886', roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: sunk ? '#2c323c' : '#535e6c', roughness: 0.6 });
  const accentMat = sunk
    ? deckMat
    : new THREE.MeshStandardMaterial({ color: skinColor, emissive: skinColor, emissiveIntensity: 1.0, roughness: 0.4 });

  const L = size - 0.24; // hull length in cells, with a little clearance
  switch (id) {
    case 'submarine': {
      // A cigar hull riding the surface, sail amidships, dive planes.
      const bodyLen = L - 0.5;
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, bodyLen, 16), darkMat);
      hull.rotation.z = Math.PI / 2;
      hull.position.y = 0.02;
      g.add(hull);
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), darkMat);
        cap.position.set(side * bodyLen / 2, 0.02, 0);
        cap.scale.x = 1.6;
        g.add(cap);
      }
      const sail = box(0.34, 0.26, 0.13, darkMat, 0.05, 0.22);
      g.add(sail);
      g.add(box(0.05, 0.14, 0.02, darkMat, 0.05, 0.42)); // periscope
      g.add(box(0.02, 0.02, 0.4, darkMat, 0.05, 0.24)); // sail planes
      const stripe = box(bodyLen * 0.85, 0.02, 0.02, accentMat, 0, 0.14);
      g.add(stripe);
      break;
    }
    case 'carrier': {
      g.add(hullMesh(L, 0.5, 0.14, hullMat));
      // The flight deck overhangs the hull; the island sits starboard-aft.
      const deck = box(L, 0.04, 0.62, deckMat, 0, 0.12);
      g.add(deck);
      const island = box(0.34, 0.24, 0.14, hullMat, -L * 0.18, 0.26, 0.21);
      g.add(island);
      g.add(box(0.1, 0.1, 0.08, darkMat, -L * 0.1, 0.43, 0.21)); // island top
      const stripeC = box(L * 0.86, 0.012, 0.05, accentMat, 0, 0.145);
      g.add(stripeC); // the runway centreline, glowing in fleet colours
      break;
    }
    case 'battleship': {
      g.add(hullMesh(L, 0.56, 0.16, hullMat));
      g.add(box(0.9, 0.14, 0.3, deckMat, -0.15, 0.2));
      g.add(box(0.3, 0.22, 0.2, darkMat, -0.05, 0.36)); // bridge tower
      g.add(box(0.03, 0.26, 0.03, darkMat, 0.02, 0.58)); // mast
      g.add(turret(darkMat, L * 0.3, 0.16, 2));
      g.add(turret(darkMat, L * 0.15, 0.16, 2));
      g.add(turret(darkMat, -L * 0.32, 0.16, 2, true));
      g.add(box(L * 0.8, 0.03, 0.03, accentMat, 0, 0.09, 0.285));
      g.add(box(L * 0.8, 0.03, 0.03, accentMat, 0, 0.09, -0.285));
      break;
    }
    case 'cruiser': {
      g.add(hullMesh(L, 0.48, 0.14, hullMat));
      g.add(box(0.66, 0.13, 0.26, deckMat, -0.1, 0.17));
      g.add(box(0.24, 0.16, 0.18, darkMat, 0, 0.31)); // bridge
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 10), darkMat);
      stack.position.set(-0.42, 0.28, 0);
      stack.rotation.x = 0;
      g.add(stack);
      g.add(turret(darkMat, L * 0.31, 0.14, 1));
      g.add(turret(darkMat, -L * 0.36, 0.14, 1, true));
      g.add(box(L * 0.8, 0.028, 0.028, accentMat, 0, 0.08, 0.245));
      g.add(box(L * 0.8, 0.028, 0.028, accentMat, 0, 0.08, -0.245));
      break;
    }
    case 'destroyer':
    default: {
      g.add(hullMesh(L, 0.4, 0.12, hullMat));
      g.add(box(0.4, 0.12, 0.2, deckMat, -0.08, 0.14));
      g.add(box(0.16, 0.12, 0.14, darkMat, 0.02, 0.26)); // bridge
      g.add(turret(darkMat, L * 0.3, 0.12, 1));
      g.add(box(L * 0.78, 0.026, 0.026, accentMat, 0, 0.07, 0.205));
      g.add(box(L * 0.78, 0.026, 0.026, accentMat, 0, 0.07, -0.205));
      break;
    }
  }
  return g;
}
