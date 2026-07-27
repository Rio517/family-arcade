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
import { BOARD_SIZE, type Orientation, type ShipId } from '@games/battleship/domain/types';

export interface SceneShip {
  shipId: ShipId;
  row: number;
  col: number;
  size: number;
  orientation: Orientation;
  sunk?: boolean;
}

const HALF = (BOARD_SIZE - 1) / 2; // board cell → world offset

export class FleetScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private shipsGroup = new THREE.Group();
  private markGroup = new THREE.Group();
  private fires: THREE.Mesh[] = [];
  private bobbing: THREE.Group[] = [];
  private water: THREE.Mesh;
  private waterBase: Float32Array;
  private raf = 0;
  private resizeObs: ResizeObserver | null = null;
  private disposed = false;

  constructor(
    private container: HTMLElement,
    private opts: { skinColor: string; reducedMotion: boolean },
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
    const rimBar = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_SIZE + 0.5, 0.06, BOARD_SIZE + 0.5),
      new THREE.MeshStandardMaterial({
        color: opts.skinColor,
        emissive: opts.skinColor,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.9,
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
  }

  /** Rebuild ships + shot markers from the current battle state. */
  update(ships: SceneShip[], incoming: CellState[][]) {
    this.shipsGroup.clear();
    this.markGroup.clear();
    this.fires = [];
    this.bobbing = [];

    for (const ship of ships) {
      const g = buildWarship(ship.shipId, ship.size, ship.sunk === true, this.opts.skinColor);
      const horiz = ship.orientation === 'H';
      const cx = (horiz ? ship.col + (ship.size - 1) / 2 : ship.col) - HALF;
      const cz = (horiz ? ship.row : ship.row + (ship.size - 1) / 2) - HALF;
      g.position.set(cx, 0, cz);
      if (!horiz) g.rotation.y = Math.PI / 2;
      if (ship.sunk) {
        // Sunk: settle low and list to one side, fires out.
        g.position.y = -0.09;
        g.rotation.z = ship.shipId.length % 2 ? 0.14 : -0.12;
      } else {
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

    // Shot markers: fires on struck decks, foam rings on misses.
    const fireMat = new THREE.MeshStandardMaterial({ color: '#ff9d3c', emissive: '#ff7a1a', emissiveIntensity: 2.2 });
    const emberMat = new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffc23c', emissiveIntensity: 2.6 });
    const smokeMat = new THREE.MeshStandardMaterial({ color: '#20242c', transparent: true, opacity: 0.7, roughness: 1 });
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
        } else {
          // hit or sunk cell: a fire on deck with an ember heart and smoke.
          const sunkCell = state === 'sunk';
          const fire = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), sunkCell ? smokeMat : fireMat);
          fire.position.set(x, sunkCell ? 0.12 : 0.26, z);
          fire.scale.y = 1.4;
          this.markGroup.add(fire);
          if (!sunkCell) {
            const ember = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), emberMat);
            ember.position.set(x, 0.24, z);
            this.markGroup.add(ember);
            this.fires.push(fire);
            const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), smokeMat);
            smoke.position.set(x, 0.44, z);
            smoke.scale.set(1, 1.3, 1);
            this.markGroup.add(smoke);
          }
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
      for (let i = 0; i < this.fires.length; i++) {
        const s = 1 + 0.22 * Math.sin(now / 90 + i * 2.1);
        this.fires[i].scale.set(s, 1.4 * (2 - s), s);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.container.contains(this.renderer.domElement) && this.container.removeChild(this.renderer.domElement);
  }
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
