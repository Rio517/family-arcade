/**
 * The camera: it follows a hole from behind and above, higher as the hole
 * grows, or glides between the city's showpieces behind the menu. The sun's
 * shadow map is fitted to what it sees.
 */
import * as THREE from 'three';
import { KINDS } from '../domain/catalog';
import type { Hole, World } from '../domain/world';

/** What the camera frames: a spot on the ground and how big a hole it is framing. */
interface Focus {
  x: number;
  z: number;
  r: number;
}

/** The sun always comes from the same side; shadows are fitted around the camera. */
const SUN_DIR = new THREE.Vector3(0.35, 1, 0.25).normalize();
/** The menu's tour: its gliding speed (units a second) and the seconds it rests at each showpiece. */
const TOUR_SPEED = 16;
const TOUR_REST = 4;
/** The screen's corners and top middle, where the shadow map must reach, as normalised device coordinates. */
const SCREEN_EDGES: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, 1],
];

const ceilTo = (v: number, step: number): number => Math.ceil(v / step) * step;

export class CameraRig {
  /** The child's zoom: 1 is the usual view; smaller is closer, bigger further out. */
  private zoom = 1;
  private shakeLeft = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  /** The showpieces the menu's camera visits, found once. */
  private stops: Array<{ x: number; z: number; r: number }> | null = null;
  /** Where the menu's camera is on its tour, where it is heading, and what it has shown. */
  private tourState = { at: null as Focus | null, to: 0, rest: 0, moving: 0, seen: new Set<number>() };
  private tourFocus: Focus = { x: 0, z: 0, r: 12 };
  /** Looking round the city freely (a development tool): what the camera frames, or null to follow as usual. */
  private free: Focus | null = null;
  private shadowReach = 0;
  /** From the sun's view to the world and back: fixed, since the sun never moves. */
  private lightBasis = new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  private toLight = this.lightBasis.clone().transpose();
  private ray = new THREE.Vector3();
  private corner = new THREE.Vector3();
  private centre = new THREE.Vector3();
  private bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  constructor(
    private camera: THREE.PerspectiveCamera,
    private sun: THREE.DirectionalLight,
    private fog: THREE.Fog,
    /** The menu's backdrop: a slow, steady glide over the city, following nobody. */
    private menuTour: boolean,
    private reducedMotion: boolean,
  ) {}

  /** Put the camera straight where it belongs, with no glide: at the start of a round, or of the menu's tour. */
  start(world: World, follow: Hole | undefined): void {
    const first = this.menuTour ? this.tourSpot(world, 0) : follow;
    if (!first) return;
    this.cameraFor(first);
    this.camPos.copy(this.wantPos);
    this.camLook.copy(this.wantLook);
  }

  /** Glide toward the hole being followed, or along the menu's tour. `time` is the scene's clock. */
  update(world: World, follow: Hole | undefined, time: number, dt: number): void {
    if (this.free) {
      const edge = world.city.land;
      this.free.x = Math.max(-edge, Math.min(edge, this.free.x));
      this.free.z = Math.max(-edge, Math.min(edge, this.free.z));
      this.move(this.free, time, dt);
    } else if (this.menuTour) this.move(this.tourSpot(world, dt), time, dt);
    else if (follow) this.move(follow, time, dt);
  }

  /** Zoom in (negative) or out (positive) by `steps`, within a comfortable range. */
  zoomBy(steps: number): void {
    if (this.free) {
      this.free.r = Math.max(1.6, Math.min(240, this.free.r * Math.pow(1.15, steps)));
      return;
    }
    this.zoom = Math.max(0.55, Math.min(2.2, this.zoom * Math.pow(1.12, steps)));
  }

  /** Start looking round the city freely from `from`, or go back to following the hole. */
  explore(on: boolean, from: Focus | undefined): void {
    this.free = on ? { x: from?.x ?? 0, z: from?.z ?? 0, r: Math.max(6, from?.r ?? 10) } : null;
  }

  /**
   * Slide the free camera by a drag of (dx, dy) pixels on a screen `height`
   * pixels tall: the ground follows the finger. The ground runs away from a
   * tilted camera, so a drag up and down covers a little more of it.
   */
  pan(dx: number, dy: number, height: number): void {
    if (!this.free) return;
    const per = (this.camPos.distanceTo(this.camLook) * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1, height);
    this.free.x -= dx * per;
    this.free.z -= dy * per * 1.3;
  }

  /** Shake the camera for `seconds` (a blast nearby). */
  shake(seconds: number): void {
    this.shakeLeft = seconds;
  }

  /** Where the camera sits for a hole, into `wantPos` and `wantLook`: higher as the hole grows. */
  private cameraFor(h: Focus): void {
    // Close in, so the city's things look big and chunky around the hole.
    // A phone held upright sees little from side to side: stand further back.
    const narrow = this.camera.aspect < 0.75 ? 1.35 : 1;
    const z = (this.menuTour ? 1 : this.zoom) * narrow;
    const up = (16 + h.r * 3) * z;
    const back = (11.5 + h.r * 2.2) * z;
    this.wantPos.set(h.x, up, h.z + back);
    this.wantLook.set(h.x, 0, h.z - 2);
  }

  private move(h: Focus, time: number, dt: number): void {
    this.cameraFor(h);
    const k = 1 - Math.pow(0.002, dt);
    this.camPos.lerp(this.wantPos, k);
    this.camLook.lerp(this.wantLook, k);
    const camera = this.camera;
    camera.position.copy(this.camPos);
    if (this.shakeLeft > 0 && !this.reducedMotion) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      const amp = this.shakeLeft * (1 + h.r * 0.1);
      camera.position.x += Math.sin(time * 60) * amp;
      camera.position.y += Math.cos(time * 47) * amp;
    }
    camera.lookAt(this.camLook);

    // Near, far and fog follow the camera's height, so a giant sees far.
    const dist = this.camPos.distanceTo(this.camLook);
    const far = dist * 4 + 600;
    if (Math.abs(camera.far - far) > 20) {
      camera.near = Math.max(0.5, dist * 0.02);
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    this.fog.near = dist * 2.6 + 150;
    this.fog.far = dist * 5 + 450;

    this.fitShadows(h.r);
  }

  /**
   * Fit the sun's shadow map to exactly the ground the camera can see (the
   * four corners of the screen, traced down to the ground), plus a margin
   * for tall things just off screen whose shadows fall into view. Without
   * this, things near the top of the screen lay outside the shadow map and
   * their shadows only appeared as the hole came close. The size moves in
   * steps and the centre snaps to whole shadow-map texels, so shadows never
   * crawl or shimmer as the camera glides.
   */
  private fitShadows(r: number): void {
    const camera = this.camera;
    camera.updateMatrixWorld();
    const cam = camera.position;
    const cap = this.fog.far;
    const b = this.bounds;
    b.minX = Infinity;
    b.maxX = -Infinity;
    b.minY = Infinity;
    b.maxY = -Infinity;
    const v = this.ray;
    for (const [nx, ny] of SCREEN_EDGES) {
      v.set(nx, ny, 0.5).unproject(camera).sub(cam).normalize();
      const t = v.y < -0.01 ? Math.min(cap, -cam.y / v.y) : cap;
      this.addToBounds(this.corner.copy(cam).addScaledVector(v, t));
    }
    this.addToBounds(this.corner.copy(this.camLook));
    const margin = 14 + r * 1.5;
    const raw = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 + margin;
    // In steps of 16, and never more than the map can show sharply.
    const size = Math.min(ceilTo(raw, 16), 180 + r * 6);
    const sc = this.sun.shadow.camera;
    if (size !== this.shadowReach) {
      this.shadowReach = size;
      sc.left = -size;
      sc.right = size;
      sc.top = size;
      sc.bottom = -size;
      sc.near = 1;
      sc.far = 900 + r * 14;
      sc.updateProjectionMatrix();
    }
    const texel = (2 * size) / this.sun.shadow.mapSize.x;
    const centre = this.centre.copy(this.camLook).applyMatrix4(this.toLight);
    centre.x = Math.round((b.minX + b.maxX) / 2 / texel) * texel;
    centre.y = Math.round((b.minY + b.maxY) / 2 / texel) * texel;
    centre.applyMatrix4(this.lightBasis);
    this.sun.target.position.copy(centre);
    this.sun.position.copy(centre).addScaledVector(SUN_DIR, 400 + r * 6);
  }

  /** Widen the shadow bounds (in the sun's view) to take in `p`; `p` is overwritten. */
  private addToBounds(p: THREE.Vector3): void {
    const q = p.applyMatrix4(this.toLight);
    const b = this.bounds;
    b.minX = Math.min(b.minX, q.x);
    b.maxX = Math.max(b.maxX, q.x);
    b.minY = Math.min(b.minY, q.y);
    b.maxY = Math.max(b.maxY, q.y);
  }

  /**
   * A point gliding from showpiece to showpiece, framed like a hole of the
   * showpiece's size so the camera sees it from a pleasant height.
   */
  private tourSpot(world: World, dt: number): Focus {
    const stops = this.tourStops(world);
    const t = this.tourState;
    const f = this.tourFocus;
    if (!stops.length) {
      f.x = 0;
      f.z = 0;
      f.r = 12;
      return f;
    }
    if (!t.at) {
      const first = stops[0];
      t.at = { x: first.x, z: first.z, r: first.r };
      t.to = 0;
      t.seen.add(0);
    }
    const to = stops[t.to];
    const dx = to.x - t.at.x;
    const dz = to.z - t.at.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      // A steady glide, easing in as it sets off and out as it arrives.
      const speed = Math.min(TOUR_SPEED, 2 + d * 0.5, 2 + t.moving * 6);
      t.moving += dt;
      const step = Math.min(d, speed * dt);
      t.at.x += (dx / d) * step;
      t.at.z += (dz / d) * step;
      t.at.r += (to.r - t.at.r) * Math.min(1, dt * 0.6);
    } else {
      t.moving = 0;
      t.rest += dt;
      if (t.rest > TOUR_REST) {
        // On to the nearest showpiece not yet seen; round again once all are.
        t.rest = 0;
        if (t.seen.size >= stops.length) t.seen = new Set([t.to]);
        let best = -1;
        let bestD = Infinity;
        stops.forEach((p, i) => {
          if (t.seen.has(i)) return;
          const e = Math.hypot(p.x - to.x, p.z - to.z);
          if (e < bestD) {
            bestD = e;
            best = i;
          }
        });
        if (best >= 0) {
          t.to = best;
          t.seen.add(best);
        }
      }
    }
    // Aim a little in front of the showpiece, so it stands in the top of the
    // screen, clear of the menu card in the middle.
    f.x = t.at.x;
    f.z = t.at.z + t.at.r * 1.1;
    f.r = t.at.r;
    return f;
  }

  /**
   * The showpieces the menu's camera visits, in order round the map: every
   * wonder, the stadiums and the mall, the airport, one skyscraper, the power
   * plant and a mountain. Each is framed to its size.
   */
  private tourStops(world: World): Array<{ x: number; z: number; r: number }> {
    if (this.stops) return this.stops;
    const once = new Set<string>(['skyscraper', 'mountain', 'powerplant', 'windturbine']);
    const seen = new Set<string>();
    const stops: Array<{ x: number; z: number; r: number; a: number }> = [];
    for (const p of world.city.props) {
      const info = KINDS[p.kind];
      const show = info.wonder || ['stadium', 'mall', 'terminal'].includes(p.kind) || once.has(p.kind);
      if (!show || (once.has(p.kind) && seen.has(p.kind))) continue;
      seen.add(p.kind);
      // Wide ones by their footprint, tall ones by their height, so the camera stays above them.
      const r = Math.max(18, Math.min(64, Math.max(p.size * 1.3, info.h * p.hScale * 0.3)));
      stops.push({ x: p.x, z: p.z, r, a: Math.atan2(p.z, p.x) });
    }
    stops.sort((a, b) => a.a - b.a);
    this.stops = stops;
    return stops;
  }
}
