/**
 * An enemy ship going down on the radar, in 3D, over the very cells it
 * sailed on. When we sink one, its model appears on its cells, lists, and
 * goes down by the stern with the bow rising, then slips under in a ring of
 * foam with bubbles and an oil slick; the radar's flat sunk mark shows after.
 *
 * The canvas lies over the radar grid. An orthographic camera looks straight
 * down with one world unit per CSS pixel, so the sea surface (y = 0) maps
 * exactly onto the grid; the world is sheared so height leans up the screen
 * (an oblique view), which shows the hull's side and the list and the rising
 * bow while the waterline stays on its cells. Everything below the surface is
 * clipped away: the ship is gone where the water closes over it.
 *
 * Only normal blending is used: the canvas is see-through over the page, and
 * WebKit drops colour wherever a pixel's alpha stays 0 (additive glow would
 * vanish there). Deterministic (a seeded LCG); reduced motion never plays it.
 * View only: nothing here reads or writes game state.
 */
import * as THREE from 'three';
import type { FleetEra, Orientation, ShipId } from '@games/battleship/domain/types';
import { buildModelShip, loadShipModels } from './shipModels';
import { puffTexture, ringTexture, smokeTexture } from './fx/textures';

const SHIPS: Array<[ShipId, number]> = [
  ['carrier', 5],
  ['battleship', 4],
  ['cruiser', 3],
  ['submarine', 3],
  ['destroyer', 2],
];

/** Height leans this far up the screen per unit of height (the oblique view). */
const LEAN = 0.8;
const UP = new THREE.Vector3(0, 1, 0);
const BOW = new THREE.Vector3();

export interface SinkTarget {
  shipId: ShipId;
  size: number;
  orientation: Orientation;
  /** Centre of the ship's cells, in canvas CSS pixels. */
  cx: number;
  cy: number;
  /** One cell's pitch, in CSS pixels. */
  cell: number;
}

interface Bubble {
  sprite: THREE.Sprite;
  at: number;
  life: number;
  size: number;
}

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** An oil slick: dark, with a faint sheen of colour at its rim. Drawn once. */
let oilCache: THREE.CanvasTexture | null = null;
function oilTexture(): THREE.CanvasTexture {
  if (oilCache) return oilCache;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(6, 8, 12, 0.85)');
  grad.addColorStop(0.55, 'rgba(10, 12, 18, 0.7)');
  grad.addColorStop(0.72, 'rgba(70, 40, 110, 0.45)');
  grad.addColorStop(0.8, 'rgba(30, 110, 120, 0.4)');
  grad.addColorStop(0.88, 'rgba(120, 100, 40, 0.3)');
  grad.addColorStop(1, 'rgba(10, 12, 18, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = true;
  oilCache = t;
  return t;
}

export class RadarSinkScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 600);
  /** The sheared world: x and z are canvas pixels, y is height in pixels. */
  private world = new THREE.Group();
  private root = new THREE.Group();
  private tilt = new THREE.Group();
  private hull: THREE.Group | null = null;
  private oil: THREE.Mesh;
  private oilBase = new THREE.Vector3(1, 1, 1);
  private foam: THREE.Mesh;
  private wake: THREE.Mesh;
  private bubbles: Bubble[] = [];
  private bubbleMat: THREE.SpriteMaterial;
  private target: SinkTarget | null = null;
  private start = 0;
  private raf = 0;
  private seed = 11;
  private roll = 0.4;
  private trimSign = 1;
  /** The hull's full height, CSS pixels: how far it must go down to be gone. */
  private height = 0;
  private w = 1;
  private h = 1;
  private disposed = false;
  /** Bumped by every play and stop, so a play still waiting on the models knows it was overtaken. */
  private token = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: { era: FleetEra; skinColor: string; look: 'a' | 'b'; duration: number },
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // The sea's surface: nothing below it is drawn.
    this.renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];

    this.camera.position.set(0, 300, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight('#d6e6ff', '#0b2238', 1.25));
    const moon = new THREE.DirectionalLight('#f2f7ff', 2.4);
    moon.position.set(-160, 420, 260);
    this.scene.add(moon);

    this.world.matrixAutoUpdate = false;
    this.world.matrix.set(1, 0, 0, 0, 0, 1, 0, 0, 0, -LEAN, 1, 0, 0, 0, 0, 1);
    this.world.matrixWorldNeedsUpdate = true;
    this.scene.add(this.world);
    this.tilt.rotation.order = 'ZXY'; // roll about the hull's length first, then trim
    this.root.add(this.tilt);
    this.world.add(this.root);

    const flat = new THREE.PlaneGeometry(2, 2);
    flat.rotateX(-Math.PI / 2);
    const arcade = opts.look === 'a';
    this.oil = new THREE.Mesh(
      flat,
      new THREE.MeshBasicMaterial({ map: oilTexture(), transparent: true, depthWrite: false, opacity: 0, premultipliedAlpha: true, toneMapped: false }),
    );
    this.oil.position.y = 0.3;
    this.oil.renderOrder = 1;
    this.wake = new THREE.Mesh(
      flat,
      new THREE.MeshBasicMaterial({ map: smokeTexture(), color: arcade ? '#bff6ff' : '#e4edf5', transparent: true, depthWrite: false, opacity: 0, premultipliedAlpha: true, toneMapped: false }),
    );
    this.wake.position.y = 0.4;
    this.wake.renderOrder = 2;
    this.foam = new THREE.Mesh(
      flat,
      new THREE.MeshBasicMaterial({ map: ringTexture(), color: arcade ? '#c8fbff' : '#f2f6fa', transparent: true, depthWrite: false, opacity: 0, premultipliedAlpha: true, toneMapped: false }),
    );
    this.foam.position.y = 0.6;
    this.foam.renderOrder = 3;
    this.world.add(this.oil, this.wake, this.foam);
    this.bubbleMat = new THREE.SpriteMaterial({ map: puffTexture(), color: arcade ? '#e6feff' : '#f4f8fb', transparent: true, depthWrite: false, premultipliedAlpha: true, toneMapped: false });
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * Get the hull that is about to go down onto the GPU (its shaders and
   * textures) while our shell is still in the air, so the sinking doesn't
   * stall on its first frame. Only that one hull: uploading the whole navy
   * would cost a hitch of its own.
   */
  prepare(shipId: ShipId): void {
    void loadShipModels(this.opts.era).then(() => this.warm(shipId));
  }

  private warm(shipId: ShipId): void {
    if (this.disposed) return;
    const size = SHIPS.find(([id]) => id === shipId)?.[1];
    const temp = new THREE.Group();
    const h = size ? buildModelShip(shipId, size, false, this.opts.skinColor, this.opts.era) : null;
    if (!h) return;
    temp.add(h);
    this.world.add(temp);
    try {
      this.renderer.compile(this.scene, this.camera);
      temp.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
          const map = (mat as THREE.MeshStandardMaterial).map;
          if (map) this.renderer.initTexture(map);
        }
      });
    } catch {
      /* a lost context: the first sinking compiles instead */
    }
    this.world.remove(temp);
  }

  /** Size the canvas to the board it lies over (CSS pixels). */
  private fit(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Sink `at`, from as soon as the models are in (at once, normally: the
   * fleet has loaded them). Resolves false when there is no hull to show.
   */
  async play(at: SinkTarget): Promise<boolean> {
    this.clear();
    const token = ++this.token;
    await loadShipModels(this.opts.era);
    if (this.disposed || token !== this.token) return true;
    return this.begin(at);
  }

  private begin(at: SinkTarget): boolean {
    this.fit();
    const hull = buildModelShip(at.shipId, at.size, false, this.opts.skinColor, this.opts.era);
    if (!hull) return false;
    // The hull's resources belong to the shared model cache: never dispose them here.
    this.hull = new THREE.Group();
    this.hull.add(hull);
    this.hull.scale.setScalar(at.cell);
    // On the radar the whole hull starts above the surface (a submarine is
    // otherwise only a thin deck line from above), then it all goes under.
    const box = new THREE.Box3().setFromObject(hull);
    this.hull.position.y = -box.min.y * at.cell;
    this.height = (box.max.y - box.min.y) * at.cell;
    this.tilt.add(this.hull);
    // Height leans up the screen, so the ship sits a little low on its cells:
    // the hull, not its waterline, is what covers them.
    const target: SinkTarget = { ...at, cy: at.cy + LEAN * this.height * 0.4 };
    this.target = target;
    this.root.position.set(target.cx, 0, target.cy);
    this.root.rotation.y = target.orientation === 'V' ? Math.PI / 2 : 0;
    this.seed = 11 + target.size * 7 + target.shipId.length;
    this.roll = (target.shipId.length % 2 ? 1 : -1) * 0.42;
    this.trimSign = target.size % 2 ? 1 : -1;
    // Bubbles along the hull, each with its moment.
    const len = target.size * target.cell;
    const along = new THREE.Vector3(target.orientation === 'V' ? 0 : 1, 0, target.orientation === 'V' ? 1 : 0);
    const n = 10 + target.size * 4;
    for (let i = 0; i < n; i++) {
      const sprite = new THREE.Sprite(this.bubbleMat);
      const a = (this.rand() - 0.5) * len * 0.9;
      const b = (this.rand() - 0.5) * target.cell * 0.6;
      sprite.position.set(target.cx + along.x * a + along.z * b, 1, target.cy + along.z * a + along.x * b);
      sprite.visible = false;
      sprite.renderOrder = 4;
      this.world.add(sprite);
      this.bubbles.push({ sprite, at: 0.22 + this.rand() * 0.74, life: 0.12 + this.rand() * 0.1, size: target.cell * (0.1 + this.rand() * 0.16) });
    }
    const m = (o: THREE.Mesh, sx: number, sz: number) => {
      o.position.x = target.cx;
      o.position.z = target.cy;
      o.scale.set(target.orientation === 'V' ? sz : sx, 1, target.orientation === 'V' ? sx : sz);
    };
    m(this.oil, len * 0.62, target.cell * 0.85);
    this.oilBase.set(this.oil.scale.x, 1, this.oil.scale.z);
    m(this.wake, len * 0.55, target.cell * 0.7);
    m(this.foam, target.cell * 0.9, target.cell * 0.9);
    this.start = performance.now();
    this.pose(0);
    this.loop();
    return true;
  }

  /** Cut it short (a skip, or it's over): the ship is gone, the canvas clear. */
  stop(): void {
    this.token++;
    this.clear();
    this.renderer.render(this.scene, this.camera);
  }

  private clear(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.hull) this.tilt.remove(this.hull);
    this.hull = null;
    this.target = null;
    for (const b of this.bubbles) this.world.remove(b.sprite);
    this.bubbles = [];
    for (const o of [this.oil, this.wake, this.foam]) (o.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  private loop = () => {
    if (this.disposed || !this.target) return;
    const t = (performance.now() - this.start) / this.opts.duration;
    if (t >= 1) {
      this.stop();
      return;
    }
    this.pose(t);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** The ship and the sea at `t` (0..1) of the sinking. */
  private pose(t: number): void {
    const tg = this.target;
    if (!tg || !this.hull) return;
    const cell = tg.cell;
    const halfLen = (tg.size * cell) / 2;
    // It lists as it floods, then goes down by the stern, bow rising, and slips under.
    const list = smooth(0, 0.28, t);
    const down = Math.pow(smooth(0.25, 0.9, t), 1.8);
    const trim = 0.52 * smooth(0.18, 0.6, t);
    this.tilt.rotation.x = this.roll * list;
    this.tilt.rotation.z = this.trimSign * trim;
    // Deep enough at the end that the raised bow and the masts are under too.
    const under = halfLen * Math.sin(0.52) + this.height + cell * 0.1;
    this.root.position.y = -this.height * 0.12 * list - under * down;
    // The sea round it: oil spreading, a churn of white water over the hull,
    // a ring of foam where it went down, bubbles breaking.
    const oil = smooth(0.35, 0.8, t) * (1 - smooth(0.88, 1, t));
    (this.oil.material as THREE.MeshBasicMaterial).opacity = 0.75 * oil;
    const spread = 1 + 0.3 * smooth(0.35, 1, t);
    this.oil.scale.set(this.oilBase.x * spread, 1, this.oilBase.z * spread);
    const wake = smooth(0.15, 0.5, t) * (1 - smooth(0.8, 1, t));
    (this.wake.material as THREE.MeshBasicMaterial).opacity = (this.opts.look === 'a' ? 0.5 : 0.42) * wake;
    // The foam ring opens where the bow goes under.
    const bow = BOW.set(this.trimSign * halfLen * 0.75, 0, 0).applyAxisAngle(UP, this.root.rotation.y);
    const ring = smooth(0.62, 1, t);
    this.foam.position.set(tg.cx + bow.x, 0.6, tg.cy + bow.z);
    this.foam.scale.setScalar(cell * (0.35 + 1.1 * ring));
    (this.foam.material as THREE.MeshBasicMaterial).opacity = (this.opts.look === 'a' ? 0.95 : 0.8) * smooth(0.6, 0.7, t) * (1 - smooth(0.85, 1, t));
    for (const b of this.bubbles) {
      const k = (t - b.at) / b.life;
      b.sprite.visible = k >= 0 && k < 1;
      if (!b.sprite.visible) continue;
      b.sprite.scale.setScalar(b.size * (0.4 + 0.8 * k));
      b.sprite.position.y = 1 + k * cell * 0.15;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
    (this.oil.material as THREE.Material).dispose();
    (this.wake.material as THREE.Material).dispose();
    (this.foam.material as THREE.Material).dispose();
    this.oil.geometry.dispose();
    this.bubbleMat.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
