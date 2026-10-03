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
import { TODAY_FX, type PitchFx } from '@games/battleship/state/pitch';
import { buildModelShip, loadShipModels } from './shipModels';
import { BoomKit } from './fx/booms';
import { FireField, type FireSpot } from './fx/fire';
import { bearingTo, muzzleWorld, poseRig, rigGuns, type ShipGuns } from './fx/guns';
import { buildSea, type Sea } from './fx/water';
import { isSharedFxTexture } from './fx/textures';
import { Tracer, type TracerKind } from './fx/tracers';
import { cubic, disposePlane, findJet, jetPlane, poseFlight, propPlane, type Flight, type JetTemplate } from './fx/planes';

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

/** The pitch: a ship we lose lists, settles and goes down over this long, then stays as a wreck. */
const WRECK_MS = 3200;

/** A gun trains on its bearing over this long, then fires. */
const TRAIN_MS = 380;
/** An outgoing shell's flight from the muzzle, up and away east over the enemy's waters. */
const OUT_FLIGHT_MS = 900;
/** How far the barrels lift to fire: the shells climb steeply to clear our own ships. */
const FIRE_ELEV = 0.42;
/** Planes fly bigger than life, so a launch reads at board scale. */
const PLANE_GROW = 2;

/**
 * One trail in the sky: a shell (or bomb) on its arc, or a plane's contrail.
 * Where it is at t (0..1), and from which t it is drawn (a plane leaves no
 * trail on its take-off run).
 */
interface Shell {
  tracer: Tracer;
  path: (t: number, out: THREE.Vector3) => THREE.Vector3;
  start: number;
  dur: number;
  from: number;
}

/** A lost ship going down (the pitch): its list and trim at rest, and how far it settles. */
interface Wreck {
  g: THREE.Group;
  start: number;
  roll: number;
  trim: number;
  drop: number;
}

/** A gun's pose kept per ship, so it survives the per-shot hull rebuilds. */
interface Aim {
  turn: number[];
  elev: number[];
  recoil: number[];
}

/** A salvo in progress: which ship, each gun's start and target bearing, when it fires. */
interface Salvo {
  shipId: ShipId;
  start: number;
  from: number[];
  to: number[];
  fromElev: number[];
  fired: boolean[];
  target: THREE.Vector3;
}

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
  /** The pitch's lost ships, partway down to where they rest as wrecks. */
  private wrecks: Wreck[] = [];
  /** shipId → its hull this update (the carrier's deck, for the planes). */
  private hulls = new Map<ShipId, THREE.Group>();
  /** shipId → when its foundering began. Survives the per-shot rebuilds. */
  private sunkSince = new Map<ShipId, number>();
  /** Ships an earlier update showed afloat — a sink after that is fresh news. */
  private seenAfloat = new Set<ShipId>();
  private water: THREE.Mesh;
  /** The sea's clock, read by its vertex shader; frozen under reduced motion. */
  private seaTime = { value: 0 };
  /** The darker-arcade pitch's effects; today's look when absent. */
  private fx: PitchFx;
  private sea: Sea | null = null;
  private fireField: FireField | null = null;
  private booms: BoomKit | null = null;
  /** The guns found on each authored hull (rebuilt with the hull). */
  private guns = new Map<ShipId, ShipGuns>();
  private aims = new Map<ShipId, Aim>();
  private salvos: Salvo[] = [];
  private shells: Shell[] = [];
  /** Shell heads and streaks. */
  private tracerGroup = new THREE.Group();
  /** Planes in the air: ours climbing away off the carrier, theirs diving in. */
  private flights: Flight[] = [];
  private planeGroup = new THREE.Group();
  /** The modern carrier's deck jet, to clone for each launch (found once the models load). */
  private jetTemplate: JetTemplate | null = null;
  /** Incoming attacks still to land: cancelled (and landed at once) by a skip. */
  private pendingImpacts: { row: number; col: number; kind: 'hit' | 'miss' | 'sunk'; timer: number }[] = [];
  /** Cycles the firing ship, so every hull gets its turn at the guns. */
  private salvoCount = 0;
  private lastNow = 0;
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
      /** The darker-arcade pitch's fire, blasts, sea and guns (today's when absent). */
      fx?: PitchFx;
    },
  ) {
    this.fx = opts.fx ?? TODAY_FX;
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
    // The pitch's seas reflect a low light as a long streak: keep the rim faint there.
    const rim = new THREE.DirectionalLight(opts.skinColor, (opts.fx ?? TODAY_FX).water === 'today' ? 0.4 : 0.12);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);

    // ── The sea: a night swell, rolled on the GPU ──
    // The waves live in the vertex shader (see seaSwell) rather than a
    // per-frame loop over the vertices: no CPU cost, so the mesh can be fine
    // enough for the swell to read as water rather than a wobbling sheet. A
    // standard material keeps the moon, the fog, and the ships' shadows.
    if (this.fx.water !== 'today') {
      // The pitch's sea reaches the horizon and brings its own sky and fog.
      this.sea = buildSea(this.fx.water, this.seaTime, opts.skinColor);
      this.water = this.sea.mesh;
      this.scene.add(this.water, ...this.sea.extras);
      this.scene.background = this.sea.background;
      this.scene.fog = this.sea.fog;
    } else {
      const waterGeo = new THREE.PlaneGeometry(13.5, 13.5, 72, 72);
      waterGeo.rotateX(-Math.PI / 2);
      const waterMat = new THREE.MeshStandardMaterial({
        color: '#0f3d55',
        roughness: 0.42,
        metalness: 0.12,
      });
      waterMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.seaTime;
        shader.vertexShader = seaSwell(shader.vertexShader);
      };
      this.water = new THREE.Mesh(waterGeo, waterMat);
      this.water.receiveShadow = true;
      this.scene.add(this.water);
    }

    // ── The targeting grid + a thin rim in the fleet's colour ──
    const grid = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, '#3d6d8a', '#28546e');
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).transparent = true;
    (grid.material as THREE.Material & { opacity: number }).opacity = this.sea ? 0.45 : 0.5;
    grid.position.y = 0.06;
    // The Night Ops sea draws its grid into the water itself.
    grid.visible = !this.sea || this.sea.keepGridHelper;
    this.scene.add(grid);

    // ── The pitch's fires, blasts and guns ──
    if (this.fx.fire !== 'today') {
      this.fireField = new FireField(this.fx.fire, opts.reducedMotion);
      this.scene.add(this.fireField.group);
    }
    if (this.fx.boom !== 'today' || this.fx.guns) {
      this.booms = new BoomKit(this.fx.boom === 'today' ? 'a' : this.fx.boom, opts.reducedMotion);
      this.scene.add(this.booms.group);
    }
    if (this.fx.guns) this.scene.add(this.tracerGroup, this.planeGroup);
    // The rim floats just above the crests, as four bars, so the swell rolls
    // under it — the old slab sat at wave height and flickered as the sea
    // lapped its lip, and the dark floor that hid the flicker hid the sea.
    const rimMat = new THREE.MeshStandardMaterial({
      color: opts.skinColor,
      emissive: opts.skinColor,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.8,
    });
    const rimLen = BOARD_SIZE + 0.5;
    const rimBar = new THREE.BoxGeometry(rimLen, 0.02, 0.1);
    for (const [x, z, turn] of [
      [0, rimLen / 2, 0],
      [0, -rimLen / 2, 0],
      [rimLen / 2, 0, Math.PI / 2],
      [-rimLen / 2, 0, Math.PI / 2],
    ]) {
      const bar = new THREE.Mesh(rimBar, rimMat);
      bar.position.set(x, 0.05, z);
      bar.rotation.y = turn;
      this.scene.add(bar);
    }

    this.scene.add(this.shipsGroup, this.markGroup);

    // The effects harness frames close-ups through this; the app never sets it.
    const harness = window as unknown as { __bsHarness?: boolean; __fleet?: FleetScene };
    if (harness.__bsHarness) harness.__fleet = this;
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
    // The modern carrier's own deck jet is the one that flies (a clean hull,
    // so a sunk carrier's darkened paint never reaches it).
    if (this.fx.guns && this.opts.era === 'modern') {
      const ford = buildModelShip('carrier', 5, false, this.opts.skinColor, 'modern');
      this.jetTemplate = ford ? findJet(ford) : null;
    }
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
    this.wrecks = [];
    this.hulls.clear();
    this.guns.clear();

    for (const ship of ships) {
      // Generated mesh where we have one; procedural hull everywhere else.
      const model = buildModelShip(ship.shipId, ship.size, ship.sunk === true, this.opts.skinColor, this.opts.era ?? 'classic');
      const g = model ?? buildWarship(ship.shipId, ship.size, ship.sunk === true, this.opts.skinColor);
      // Marks whether this hull's resources belong to the GLB cache (see the
      // selective disposal above).
      g.userData.cachedResources = model !== null;
      // The pitch's guns: find the authored turrets and put them back on the
      // bearing they last trained to (the hull is rebuilt every shot).
      if (this.fx.guns && model && !ship.sunk) {
        const guns = rigGuns(model);
        this.guns.set(ship.shipId, guns);
        const aim = this.aims.get(ship.shipId);
        guns.rigs.forEach((rig, i) => poseRig(rig, aim?.turn[i] ?? 0, aim?.elev[i] ?? 0, aim?.recoil[i] ?? 0));
      }
      const horiz = ship.orientation === 'H';
      const cx = (horiz ? ship.col + (ship.size - 1) / 2 : ship.col) - HALF;
      const cz = (horiz ? ship.row : ship.row + (ship.size - 1) / 2) - HALF;
      g.position.set(cx, 0, cz);
      if (!horiz) g.rotation.y = Math.PI / 2;
      this.hulls.set(ship.shipId, g);
      if (ship.sunk && this.fx.guns) {
        // The pitch: a lost ship lists, settles and goes down, then rests as
        // a dark wreck low in the water (its smoulder rides above it), so the
        // fleet still shows what was lost. Under reduced motion, and for a
        // ship lost before this scene opened, it is simply there as a wreck.
        g.rotation.order = 'YXZ'; // roll about the hull's length, trim about its beam
        const wreck: Wreck = {
          g,
          start: 0,
          roll: (ship.row + ship.col) % 2 ? 0.24 : -0.24,
          trim: ship.shipId.length % 2 ? 0.045 : -0.045,
          // Settled by about a third of its height: the deck at the waterline, the upper works showing.
          drop: new THREE.Box3().setFromObject(g).max.y * 0.3,
        };
        if (this.seenAfloat.has(ship.shipId) && !this.sunkSince.has(ship.shipId)) {
          this.sunkSince.set(ship.shipId, performance.now());
        }
        const start = this.sunkSince.get(ship.shipId);
        if (start === undefined || this.opts.reducedMotion || performance.now() - start >= WRECK_MS) {
          poseWreck(wreck, 1);
        } else {
          wreck.start = start;
          poseWreck(wreck, (performance.now() - start) / WRECK_MS);
          this.wrecks.push(wreck);
        }
      } else if (ship.sunk) {
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
    const fireSpots: FireSpot[] = [];
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
        } else if (this.fireField) {
          // The pitch's fires: one instanced field draws every blaze on the board.
          const grew = 0.72 + 0.12 * shipSizeAt(r, c);
          fireSpots.push(state === 'sunk' ? { x, y: 0.05, z, size: 1.1, smoulder: true } : { x, y: 0.2, z, size: grew });
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
    this.fireField?.setFires(fireSpots);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fireField?.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    // rAF stamps a frame with its start, which can fall before the
    // performance.now() of the first, direct call: never step backwards.
    const dt = this.lastNow ? Math.max(0, Math.min((now - this.lastNow) / 1000, 0.05)) : 0;
    this.lastNow = now;

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
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      const t = (now - w.start) / WRECK_MS;
      poseWreck(w, t);
      if (t >= 1) this.wrecks.splice(i, 1);
    }

    if (!this.opts.reducedMotion) {
      // Roll the sea: one number, the shader does the rest.
      this.seaTime.value = now / 1000;

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

    // The pitch's sea, fires, guns and blasts.
    this.sea?.step(this.opts.reducedMotion ? 0 : now / 1000, this.camera);
    this.fireField?.step(now);
    this.stepGuns(now);
    this.booms?.step(dt);
    // A blast jolts the camera for a moment (never under reduced motion).
    const shake = this.booms?.shake() ?? 0;
    const jolt = shake > 0.001;
    if (jolt) {
      this.joltBy.set(Math.sin(now * 0.091) * shake, Math.sin(now * 0.077 + 1) * shake * 0.6, Math.sin(now * 0.063 + 2) * shake);
      this.camera.position.add(this.joltBy);
    }

    this.renderer.render(this.scene, this.camera);
    if (jolt) this.camera.position.sub(this.joltBy);
  };

  private joltBy = new THREE.Vector3();

  // ── Guns, shells and planes (the pitch) ─────────────────────────────────
  //
  // The enemy's waters lie to the east, off the board's right edge in the
  // default camera. Our guns train to the right and our shells climb away
  // over the right edge out of the frame; the enemy's shells and bombers come
  // in from the same side, high and steep.

  /** The world point a shot at the enemy's (row, col) flies to: their waters, far off to the east. */
  private enemyWaters(row: number, col: number): THREE.Vector3 {
    return new THREE.Vector3(HALF + 10 + col * 0.5, 0, (row - HALF) * 0.9);
  }

  private cellWorld(row: number, col: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(col - HALF, y, row - HALF);
  }

  private get trailStyle(): 'a' | 'b' {
    return this.fx.boom === 'b' ? 'b' : 'a';
  }

  /**
   * Our shot at the enemy's (row, col): the next afloat ship in turn trains
   * every main gun east on the bearing, fires in a ripple, and the shells
   * climb away out of the frame. On the carrier's turn, planes launch
   * instead. (The impact itself plays on the radar.)
   */
  fireAt(row: number, col: number): void {
    if (!this.fx.guns || !this.booms) return;
    const afloat = (this.lastState?.ships ?? []).filter((s) => !s.sunk && this.guns.has(s.shipId));
    if (afloat.length === 0) return;
    const ship = afloat[this.salvoCount++ % afloat.length];
    const guns = this.guns.get(ship.shipId)!;
    const target = this.enemyWaters(row, col);
    const now = performance.now();
    if (ship.shipId === 'carrier') {
      // A carrier has planes, not guns.
      this.launchPlanes(ship.shipId, target, now);
      return;
    }
    if (guns.rigs.length === 0) {
      // No gun on this hull (the Virginia): a missile out of a deck hatch.
      const hatch = guns.hatches[(this.salvoCount * 3) % Math.max(1, guns.hatches.length)];
      if (!hatch) return;
      const from = new THREE.Vector3().setFromMatrixPosition(hatch.matrixWorld);
      this.booms.muzzle(from, new THREE.Vector3(0, 1, 0), 0.3);
      if (!this.opts.reducedMotion) this.launch(from, target, now + TRAIN_MS * 0.5, OUT_FLIGHT_MS + 200, { side: 'ours', boost: 1.2 });
      return;
    }
    const aim = this.aimFor(ship.shipId, guns.rigs.length);
    const to = guns.rigs.map((rig) => bearingTo(rig, target));
    this.salvos.push({
      shipId: ship.shipId,
      start: now,
      from: [...aim.turn],
      to,
      fromElev: [...aim.elev],
      fired: guns.rigs.map(() => false),
      target,
    });
  }

  /**
   * Their attack landing on our (row, col) `ms` from now: a warning ring
   * tightens on the water, and after `warn` a shell comes in from the east,
   * high and steep, or a plane dives in and lets its bomb go. Then the blast
   * or the splash.
   */
  incoming(row: number, col: number, kind: 'hit' | 'miss' | 'sunk', ms: number, warn = 0, via: 'shell' | 'plane' = 'shell'): void {
    if (!this.booms) return;
    const to = this.cellWorld(row, col, kind === 'miss' ? 0.02 : 0.22);
    const now = performance.now();
    this.booms.telegraph(to, ms / 1000);
    const flight = Math.max(200, ms - warn);
    if (!this.opts.reducedMotion) {
      if (via === 'plane') {
        this.diveBomb(to, now + warn, flight);
      } else {
        // In through the frame's right edge, high, then steeply down onto the
        // cell. The default camera sees less sky over the far rows, so a
        // shell for them flies a little lower, under the frame's top.
        const high = 2.7 + 0.11 * row;
        const from = new THREE.Vector3(to.x + 7.5, high, to.z + 0.5);
        const ctrl = new THREE.Vector3(to.x + 1.5, high + 0.5, to.z + 0.15);
        this.launch(from, to, now + warn, flight, { side: 'theirs', ctrl });
      }
    }
    const pending = { row, col, kind, timer: 0 };
    pending.timer = window.setTimeout(() => {
      this.pendingImpacts = this.pendingImpacts.filter((p) => p !== pending);
      this.impact(row, col, kind);
    }, ms);
    this.pendingImpacts.push(pending);
  }

  /** The blast or splash at our (row, col), now. */
  impact(row: number, col: number, kind: 'hit' | 'miss' | 'sunk'): void {
    if (!this.booms) return;
    if (kind === 'miss') {
      this.booms.splash(this.cellWorld(row, col, 0.02), 0.62);
      return;
    }
    let along: THREE.Vector3[] | undefined;
    if (kind === 'sunk') {
      const ship = (this.lastState?.ships ?? []).find((s) =>
        s.orientation === 'H' ? s.row === row && col >= s.col && col < s.col + s.size : s.col === col && row >= s.row && row < s.row + s.size,
      );
      if (ship) {
        along = [];
        for (let i = 0; i < ship.size; i++) {
          const r = ship.orientation === 'V' ? ship.row + i : ship.row;
          const c = ship.orientation === 'H' ? ship.col + i : ship.col;
          if (r !== row || c !== col) along.push(this.cellWorld(r, c, 0.2));
        }
      }
    }
    this.booms.boom(this.cellWorld(row, col, 0.24), kind === 'sunk' ? 1.3 : 0.95, kind === 'sunk', along);
  }

  /**
   * Skip: guns snap to their bearings, shells and planes in flight vanish,
   * and an attack still on its way lands now. Only the picture changes; the
   * game is whatever the log says, before and after.
   */
  skip(): void {
    for (const s of this.salvos) {
      const aim = this.aimFor(s.shipId, s.to.length);
      s.to.forEach((t, i) => {
        aim.turn[i] = t;
        aim.elev[i] = FIRE_ELEV * 0.8;
        aim.recoil[i] = 0;
      });
    }
    this.salvos = [];
    for (const sh of this.shells) sh.tracer.dispose();
    this.shells = [];
    for (const f of this.flights) disposePlane(f.plane);
    this.flights = [];
    const pending = this.pendingImpacts;
    this.pendingImpacts = [];
    for (const p of pending) {
      clearTimeout(p.timer);
      this.impact(p.row, p.col, p.kind);
    }
  }

  private aimFor(shipId: ShipId, n: number): Aim {
    let aim = this.aims.get(shipId);
    if (!aim || aim.turn.length !== n) {
      aim = { turn: new Array(n).fill(0), elev: new Array(n).fill(0), recoil: new Array(n).fill(0) };
      this.aims.set(shipId, aim);
    }
    return aim;
  }

  /**
   * Put a shell (or a bomb) in the air from `from` to `to`, on a quadratic
   * arc through `ctrl`; without one, it climbs steeply out of the muzzle so it
   * clears our own ships well above their decks.
   */
  private launch(
    from: THREE.Vector3,
    to: THREE.Vector3,
    start: number,
    dur: number,
    o: { side: TracerKind; ctrl?: THREE.Vector3; boost?: number; scale?: number },
  ): Shell {
    const a = from.clone();
    const b = to.clone();
    // Up out of the muzzle at about 50 degrees, over the top of its arc as it
    // leaves the frame's top-right corner, far off to the east.
    const c = o.ctrl?.clone() ?? a.clone().lerp(b, 0.26).setY(Math.max(a.y, b.y) + 5.5 + a.distanceTo(b) * 0.06);
    const boost = o.boost ?? 0;
    const path = (t: number, out: THREE.Vector3): THREE.Vector3 => {
      const k = Math.max(0, Math.min(1, t));
      const u = 1 - k;
      out.copy(a).multiplyScalar(u * u).addScaledVector(c, 2 * u * k).addScaledVector(b, k * k);
      // A missile first climbs straight out of its tube.
      if (boost) out.y += boost * Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5) * (1 - k);
      return out;
    };
    const tracer = new Tracer(this.tracerGroup, this.trailStyle, o.side, o.scale ?? 1);
    const shell: Shell = { tracer, path, start, dur, from: 0 };
    this.shells.push(shell);
    return shell;
  }

  /** A plane's flight, and the contrail (of `kind`) it draws once it is off the deck. */
  private fly(flight: Flight, kind: TracerKind, trailFrom = 0): void {
    flight.plane.root.visible = false;
    this.planeGroup.add(flight.plane.root);
    this.flights.push(flight);
    const tracer = new Tracer(this.tracerGroup, this.trailStyle, kind, PLANE_GROW / 1.6);
    this.shells.push({ tracer, path: flight.path, start: flight.start, dur: flight.dur, from: trailFrom });
  }

  /**
   * The carrier's turn: two or three planes roll down the flight deck in a
   * short ripple, lift off the bow, climb and turn east toward `target`, and
   * fly out of the frame. Classic carriers fly propeller planes, modern ones
   * the Ford's jets.
   */
  private launchPlanes(shipId: ShipId, target: THREE.Vector3, now: number): void {
    const g = this.hulls.get(shipId);
    if (!g || this.opts.reducedMotion) return;
    g.updateMatrixWorld(true);
    let deck: THREE.Object3D | null = null;
    g.traverse((o) => {
      if (!deck && /Flight_Deck$/.test(o.name)) deck = o;
    });
    const box = new THREE.Box3().setFromObject(deck ?? g);
    const centre = box.getCenter(new THREE.Vector3());
    const bow = new THREE.Vector3(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y));
    const across = new THREE.Vector3(-bow.z, 0, bow.x);
    const half = Math.abs(bow.x) > 0.5 ? (box.max.x - box.min.x) / 2 : (box.max.z - box.min.z) / 2;
    const jets = (this.opts.era ?? 'classic') === 'modern' && this.jetTemplate !== null;
    const count = jets ? 2 : 3;
    const deckY = box.max.y + (jets ? 0.03 : 0.045);
    for (let i = 0; i < count; i++) {
      const plane = jets ? jetPlane(this.jetTemplate!, 'ours', PLANE_GROW) : propPlane('ours', this.opts.skinColor, PLANE_GROW);
      const lane = (i % 2 ? 1 : -1) * 0.07;
      // Jets go off the bow catapults; the props take a longer run from aft.
      const startAt = jets ? half * 0.1 : -half * (0.1 + i * 0.16);
      const p0 = centre.clone().addScaledVector(bow, startAt).addScaledVector(across, lane).setY(deckY);
      const lift = centre.clone().addScaledVector(bow, half * 1.02).addScaledVector(across, lane).setY(deckY + 0.02);
      // Off the bow, climbing; then a climbing turn east, out through the
      // frame's right edge well above the ships.
      const exit = new THREE.Vector3(HALF + 6.5 + i * 0.6, 4.2 + i * 0.35, lift.z * 0.4 + target.z * 0.15 + (i - 1) * 0.7);
      const p1 = lift.clone().addScaledVector(bow, 1.5).setY(lift.y + 0.9);
      const p2 = new THREE.Vector3(Math.max(lift.x + 2.5, HALF - 1.5), lift.y + 2.6, (lift.z + exit.z) / 2);
      const roll = jets ? 0.22 : 0.3;
      const path = (u: number, out: THREE.Vector3): THREE.Vector3 => {
        if (u < roll) {
          // The take-off run: gathering speed down the deck.
          const k = u / roll;
          return out.copy(p0).lerp(lift, k * k);
        }
        return cubic(lift, p1, p2, exit, (u - roll) / (1 - roll), out);
      };
      this.fly({ plane, path, start: now + i * (jets ? 260 : 220), dur: jets ? 1500 : 1800 }, jets ? 'jet' : 'prop', roll + 0.02);
    }
  }

  /**
   * Their bomber: it dives out of the east at our cell, lets its bomb go low,
   * and pulls up and away; the bomb lands `dur` after `start`.
   */
  private diveBomb(to: THREE.Vector3, start: number, dur: number): void {
    const jets = (this.opts.era ?? 'classic') === 'modern' && this.jetTemplate !== null;
    const plane = jets ? jetPlane(this.jetTemplate!, 'theirs', PLANE_GROW) : propPlane('theirs', '#e0483a', PLANE_GROW);
    // The dive: in from off the right edge, steepening onto the cell, down to
    // where the bomb goes (low, just short of it)…
    const r = new THREE.Vector3(to.x + 1.3, 0.95, to.z + 0.25);
    const d0 = new THREE.Vector3(to.x + 8, 4.6, to.z + 2);
    const d1 = new THREE.Vector3(to.x + 5.2, 4.4, to.z + 1.3);
    const d2 = new THREE.Vector3(to.x + 2.9, 2.4, to.z + 0.45);
    // …then it pulls out of the dive over our fleet and climbs away.
    const q1 = r.clone().add(r.clone().sub(d2).multiplyScalar(0.7));
    const q2 = new THREE.Vector3(to.x - 1.4, 1.5, to.z - 1.4);
    const q3 = new THREE.Vector3(to.x - 3.5, 5.2, to.z - 4.5);
    // The bomb goes at 62% of the attack's time, 55% of the way through the flight.
    const release = 0.55;
    const planeDur = (dur * 0.62) / release;
    const path = (u: number, out: THREE.Vector3): THREE.Vector3 =>
      u < release ? cubic(d0, d1, d2, r, u / release, out) : cubic(r, q1, q2, q3, (u - release) / (1 - release), out);
    this.fly({
      plane,
      path,
      start,
      dur: planeDur,
      release: {
        at: release,
        fn: (pos) => {
          const left = start + dur - performance.now();
          if (left < 60) return;
          // The bomb falls the last short way onto the cell.
          const ctrl = pos.clone().lerp(to, 0.4).setY(pos.y);
          this.launch(pos, to, performance.now(), left, { side: 'theirs', ctrl, scale: 0.65 });
        },
      },
    }, 'bomber');
  }

  private stepGuns(now: number): void {
    if (!this.booms) return;
    const reduced = this.opts.reducedMotion;
    const tmpPos = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    for (let k = this.salvos.length - 1; k >= 0; k--) {
      const s = this.salvos[k];
      const guns = this.guns.get(s.shipId);
      const aim = this.aimFor(s.shipId, s.to.length);
      const t = Math.max(0, (now - s.start) / TRAIN_MS);
      const e = reduced ? 1 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      let done = true;
      s.to.forEach((to, i) => {
        // Shortest way round to the new bearing.
        const d = Math.atan2(Math.sin(to - s.from[i]), Math.cos(to - s.from[i]));
        aim.turn[i] = s.from[i] + d * e;
        aim.elev[i] = s.fromElev[i] + (FIRE_ELEV - s.fromElev[i]) * e;
        // A ripple salvo: each gun fires a beat after the one before.
        const fireAt = s.start + TRAIN_MS + i * 70;
        if (!s.fired[i] && now >= fireAt && guns?.rigs[i]) {
          s.fired[i] = true;
          const rig = guns.rigs[i];
          poseRig(rig, aim.turn[i], aim.elev[i], 0);
          muzzleWorld(rig, tmpPos, tmpDir);
          this.booms!.muzzle(tmpPos, tmpDir, 0.22);
          if (!reduced) {
            const spread = new THREE.Vector3(Math.cos(i * 1.7) * 0.6, 0, Math.sin(i * 2.1) * 0.6);
            this.launch(tmpPos, s.target.clone().add(spread), now, OUT_FLIGHT_MS, { side: 'ours' });
          }
        }
        // The barrels run back on firing and ease out again.
        const since = now - fireAt;
        aim.recoil[i] = reduced || !s.fired[i] ? 0 : since < 60 ? since / 60 : Math.max(0, 1 - (since - 60) / 320);
        if (!s.fired[i] || since < 400) done = false;
      });
      guns?.rigs.forEach((rig, i) => poseRig(rig, aim.turn[i], aim.elev[i], aim.recoil[i]));
      if (done) this.salvos.splice(k, 1);
    }
    // Barrels settle back toward level once the salvo is away.
    for (const [shipId, aim] of this.aims) {
      if (this.salvos.some((s) => s.shipId === shipId)) continue;
      let moved = false;
      aim.elev.forEach((el, i) => {
        if (el > 0.001) {
          aim.elev[i] = Math.max(0, el - 0.0025);
          moved = true;
        }
      });
      if (moved) this.guns.get(shipId)?.rigs.forEach((rig, i) => poseRig(rig, aim.turn[i], aim.elev[i], 0));
    }
    for (let k = this.shells.length - 1; k >= 0; k--) {
      const sh = this.shells[k];
      const t = (now - sh.start) / sh.dur;
      if (t < 0) continue;
      // The head, its tapering streak and the smoke hanging behind it; once
      // the shell is gone, the smoke thins away where it was laid.
      if (!sh.tracer.draw(sh.path, t, sh.dur, this.camera, sh.from)) {
        sh.tracer.dispose();
        this.shells.splice(k, 1);
      }
    }
    for (let k = this.flights.length - 1; k >= 0; k--) {
      const f = this.flights[k];
      if (!poseFlight(f, now)) {
        disposePlane(f.plane);
        this.flights.splice(k, 1);
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const p of this.pendingImpacts) clearTimeout(p.timer);
    this.pendingImpacts = [];
    for (const sh of this.shells) sh.tracer.dispose();
    this.shells = [];
    for (const f of this.flights) disposePlane(f.plane);
    this.flights = [];
    this.resizeObs?.disconnect();
    this.controls.dispose();
    // The pitch's systems free their own pooled buffers; the shared effect
    // textures are freed with the scene below and repainted on next use.
    this.fireField?.dispose();
    this.booms?.dispose();
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

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * A lost ship at `t` (0..1) of going down: it lists, then settles and goes
 * down by one end (the other lifting), then eases toward an even keel as a
 * wreck resting low in the water.
 */
function poseWreck(w: Wreck, t: number): void {
  const list = smooth(0, 0.3, t);
  const down = smooth(0.22, 0.7, t);
  const rest = smooth(0.62, 1, t);
  w.g.position.y = -w.drop * (0.18 * list + 0.82 * down);
  w.g.rotation.x = w.roll * (0.8 * list + 0.45 * down - 0.25 * rest);
  w.g.rotation.z = w.trim * (2.6 * down - 1.6 * rest);
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
      if (map && map !== flameTextureCache && map !== smokeTextureCache && !isSharedFxTexture(map)) map.dispose();
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


/**
 * The night swell, spliced into three's standard vertex shader: two slow
 * crossing waves carry the height, a third, smaller and quicker, breaks the
 * surface into facets for the moon to catch. The normal is the analytic slope
 * of the same sum, so the lighting agrees with the shape. Amplitude stays
 * small — this is water seen under a targeting grid, not weather.
 */
function seaSwell(vertexShader: string): string {
  const waves = /* glsl */ `
    uniform float uTime;
    // Height and slope of the swell at a point of the board plane.
    vec3 swell(vec2 p) {
      float a = sin(p.x * 0.95 + uTime * 0.55) * cos(p.y * 0.8 + uTime * 0.42);
      float b = sin((p.x * 0.6 - p.y * 0.75) * 1.7 - uTime * 0.7);
      float c = sin((p.x * 1.3 + p.y * 1.1) * 2.6 + uTime * 1.15);
      float h = a * 0.028 + b * 0.014 + c * 0.005;
      float dax = cos(p.x * 0.95 + uTime * 0.55) * 0.95 * cos(p.y * 0.8 + uTime * 0.42);
      float day = -sin(p.x * 0.95 + uTime * 0.55) * sin(p.y * 0.8 + uTime * 0.42) * 0.8;
      float db = cos((p.x * 0.6 - p.y * 0.75) * 1.7 - uTime * 0.7) * 1.7;
      float dc = cos((p.x * 1.3 + p.y * 1.1) * 2.6 + uTime * 1.15) * 2.6;
      float dx = dax * 0.028 + db * 0.6 * 0.014 + dc * 1.3 * 0.005;
      float dy = day * 0.028 - db * 0.75 * 0.014 + dc * 1.1 * 0.005;
      return vec3(h, dx, dy);
    }
  `;
  return vertexShader
    .replace('#include <common>', `#include <common>\n${waves}`)
    // The plane was laid flat when it was built, so its normal is +y and its
    // surface runs along x and z.
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       vec3 sw = swell(position.xz);
       objectNormal = normalize(vec3(-sw.y, 1.0, -sw.z));`,
    )
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed.y += sw.x;`);
}
