/**
 * The three.js view of a Gulp Universe round: a toy city on an island, holes
 * roaming it, things tipping into them, and (when switched on) power-ups and
 * a city that fights back.
 *
 * Framework-free, like the racer's scene: the page builds one of these and
 * each frame hands it the world and what just happened. This file is the
 * shell: the renderer, lights and ground, and the dispatch of each frame's
 * events to the parts that draw them:
 *
 * - holeView.ts: the holes, their mouths, eyes, messes and power-up show
 * - propView.ts: the city's things, falling in, rising, wobbling
 * - seeThrough.ts: buildings in the way of the camera go see-through
 * - walkers.ts: people and police
 * - cameraRig.ts: the camera, the menu's tour, the shadow fit
 * - models.ts, canvasTextures.ts: the models and painted textures they share
 *
 * Everything is procedural, so the PWA stays offline.
 */
import * as THREE from 'three';
import { disposeDeep } from '@shared/three/disposeDeep';
import { isSite, KINDS } from '../domain/catalog';
import type { World, WorldEvent } from '../domain/world';
import { CameraRig } from './cameraRig';
import type { Smear } from './canvasTextures';
import { Effects, type WonderSpot } from './effects';
import { buildGround, groundAt, type Ground } from './ground';
import { GROUND_SHIFT, HoleViews, type HoleLook } from './holeView';
import { ModelWarmup } from './models';
import { PropView } from './propView';
import { Walkers } from './walkers';

export type { HoleLook } from './holeView';

const SHADOW_MAP = 2048;

export class GulpScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private ground: Ground;
  private effects: Effects;
  /** The one flat-shaded, vertex-coloured material every model shares. */
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 });
  /**
   * Models the warm-up just built, drawn once far out of sight (tiny, deep
   * under the ground) so their geometry reaches the graphics card in a quiet
   * frame, not on the frame a building first rises (a stall on an iPad).
   */
  private primer = new THREE.Group();
  private props: PropView;
  private walkers: Walkers;
  private holes: HoleViews;
  private rig: CameraRig;
  /** The round's wonders, found once, for their stars (see Effects.syncWonders). */
  private wonders: WonderSpot[] = [];
  /** Builds the models a round may still need in spare frame time; the menu's tour needs none. */
  private warmup: ModelWarmup | null;
  private resizeObs: ResizeObserver | null = null;
  private time = 0;
  /** When the child's hole last said "Yum!" or "Yuck!", so it doesn't chatter. */
  private lastYum = -10;
  /** Points gathered over a quarter second show as one "+n" over the hole. */
  private pending = 0;
  private pendingAt = new THREE.Vector3();
  private pendingFor = 0;
  private disposed = false;

  constructor(
    private container: HTMLElement,
    world: World,
    looks: HoleLook[],
    /** The hole the camera follows: the child's, or a rival in attract mode. */
    private follow: number,
    private reducedMotion = false,
    /** The menu's backdrop: a slow, steady glide over the city, following nobody. */
    private menuTour = false,
  ) {
    // A stencil buffer, to cut the holes out of the ground.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    // A little under the iPad's full density: the city is busy, and the
    // difference is hard to see at arm's length.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    // Neutral tone mapping keeps the toy colours bold (filmic curves wash them out).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x8fd8f5);
    const fog = new THREE.Fog(0x8fd8f5, 260, 620);
    this.scene.fog = fog;
    this.camera = new THREE.PerspectiveCamera(45, (container.clientWidth || 800) / (container.clientHeight || 600), 1, 1200);

    // Less fill and a stronger sun: crisper shadows and more contrast.
    this.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8a8070, 0.95));
    this.sun = new THREE.DirectionalLight(0xfff2de, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.ground = buildGround(world.city, this.renderer);
    // The ground's layers go before the holes, in their own order (see holeView's PIT_ORDER).
    this.ground.group.traverse((o) => {
      o.renderOrder += GROUND_SHIFT;
    });
    this.scene.add(this.ground.group);
    const byKind = new Map<string, WonderSpot>();
    for (const p of world.city.props) {
      if (!KINDS[p.kind].wonder) continue;
      const spot = byKind.get(p.kind) ?? { kind: p.kind, members: [] };
      spot.members.push({ id: p.id, x: p.x, z: p.z, top: groundAt(world.city, p.x, p.z) + KINDS[p.kind].h * p.hScale });
      byKind.set(p.kind, spot);
    }
    this.wonders = [...byKind.values()];
    this.props = new PropView(this.scene, this.material, world, reducedMotion);
    this.walkers = new Walkers(this.scene, this.material, world, reducedMotion);
    this.effects = new Effects(reducedMotion);
    this.scene.add(this.effects.group);
    this.holes = new HoleViews(this.scene, this.effects, reducedMotion, looks, follow);
    // Things on a block stand a kerb above the road.
    this.holes.ground = this.effects.ground = (x, z) => groundAt(world.city, x, z);

    this.rig = new CameraRig(this.camera, this.sun, fog, menuTour, reducedMotion);
    this.rig.start(world, world.holes[follow]);
    this.warmup = menuTour ? null : new ModelWarmup();
    this.primer.position.set(0, -500, 0);
    this.primer.scale.setScalar(0.001);
    this.scene.add(this.primer);
    // Compile every shader an effect or a mess will use now, not on the frame it first shows.
    this.renderer.compile(this.effects.prototypes(), this.camera, this.scene);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
    }
  }

  /** Mirror the world, play what just happened, and move the camera. */
  sync(world: World, events: WorldEvent[], dt: number): void {
    if (this.disposed) return;
    this.primer.clear();
    for (const geo of this.warmup?.step(2) ?? []) {
      const m = new THREE.Mesh(geo, this.material);
      m.frustumCulled = false;
      m.castShadow = true;
      this.primer.add(m);
    }
    this.time += dt;
    const me = world.holes[this.follow];

    for (const e of events) {
      if (e.type === 'eat') {
        this.props.swallow(e.prop, e.hole);
        this.holes.ate(e.prop, e.hole, world.holes[e.hole]);
        if (e.prop.kind === 'garbagetruck' && e.hole === this.follow && this.time - this.lastYum > 1.5) {
          this.lastYum = this.time;
          this.holes.say('Yuck!', false, e.hole);
        }
        if (e.hole === this.follow) {
          this.pending += e.gained;
          this.pendingAt.set(e.prop.x, 2 + KINDS[e.prop.kind].h, e.prop.z);
        }
      } else if (e.type === 'rebuild') {
        if (e.replaces) this.props.clear(e.replaces);
        this.props.raise(e.prop);
        // A finished building rises out of its site in a puff of dust, where
        // the child can see it (one out of sight goes up without).
        const near = me && Math.hypot(e.prop.x - me.x, e.prop.z - me.z) < 70 + me.r * 3;
        if (!isSite(e.prop.kind) && near) this.effects.dust(e.prop.x, e.prop.z, Math.max(KINDS[e.prop.kind].w, KINDS[e.prop.kind].d));
      } else if (e.type === 'food' && e.hole === this.follow) {
        if (e.food === 'healthy') this.holes.say(`Healthy! +${e.bonus}`, true, e.hole);
        else if (this.time - this.lastYum > 2.5) {
          this.lastYum = this.time;
          this.holes.say('Yum!', false, e.hole);
        }
      } else if (e.type === 'park') {
        this.props.appear(e.prop);
      } else if (e.type === 'crumb') {
        // A giant took something tiny: it is just gone, no fall and no fuss.
        this.props.vanish(e.prop);
      } else if (e.type === 'regrow') {
        this.props.show(e.prop);
      } else if (e.type === 'level') {
        this.holes.flash(e.hole);
      } else if (e.type === 'boom') {
        this.effects.boom(e.x, e.z, Math.max(3, e.size));
        if (me && Math.hypot(e.x - me.x, e.z - me.z) < 30 + me.r * 3) this.rig.shake(0.5);
      } else if (e.type === 'hurt' && e.cause === 'tanker') {
        const h = world.holes[e.hole];
        this.smearHole(e.hole, 'burn', 1);
        if (h) this.effects.boom(h.x, h.z, Math.max(4, h.r * 0.9));
      } else if (e.type === 'hurt' && e.cause === 'chem') {
        const h = world.holes[e.hole];
        if (h) this.effects.gas(h.x, h.z, Math.max(3, h.r));
      }
    }

    this.pendingFor += dt;
    if (this.pending > 0 && this.pendingFor > 0.15) {
      this.effects.popup(this.pending, this.pendingAt);
      this.pending = 0;
      this.pendingFor = 0;
    }

    this.holes.sync(world.holes, this.time, dt);
    this.props.step(world, dt);
    this.walkers.sync(world, this.time, dt);
    const playing = me && !this.menuTour ? me : undefined;
    if (playing) this.props.wobble(world, playing, this.time, dt);
    // Power-ups grow with the square root of the hole: big enough to spot from
    // a giant's height, never towering over the city.
    const scale = me ? Math.max(1, Math.sqrt(me.r / 2.5)) : 1;
    this.effects.syncPowerups(world.powerups, scale);
    if (!this.menuTour) this.effects.syncWonders(this.wonders, (id) => world.props.has(id), this.time);
    this.effects.syncAttacks(world.attacks, me ? me.r : 2);
    this.effects.step(dt);

    this.rig.update(world, me, this.time, dt);
    // After the camera has moved: what stands in its way depends on where it is now.
    if (playing) {
      this.props.fadeInTheWay(world, playing, this.camera.position, this.time, dt);
      this.props.castShadows(playing.r);
    }
    if (!this.reducedMotion) this.ground.water.offset.set(this.time * 0.004, this.time * 0.006);
  }

  /** Zoom in (negative) or out (positive) by `steps`, within a comfortable range. */
  /** Look round the city freely from `from` (a development tool), or go back to following the hole. */
  explore(on: boolean, from?: { x: number; z: number; r: number }): void {
    this.rig.explore(on, from);
  }

  /** Slide the free camera by a drag of (dx, dy) pixels. */
  pan(dx: number, dy: number): void {
    this.rig.pan(dx, dy, this.renderer.domElement.clientHeight);
  }

  zoomBy(steps: number): void {
    this.rig.zoomBy(steps);
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.effects.dispose();
    this.ground.dispose();
    this.holes.dispose();
    this.props.dispose();
    this.walkers.dispose();
    disposeDeep(this.scene);
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Mark a hole's mouth with a mess, as strong as `amount` (0 to 1). Also a development hook for browser checks. */
  private smearHole(hole: number, kind: Smear, amount: number): void {
    this.holes.smear(hole, kind, amount);
  }

  private resize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
