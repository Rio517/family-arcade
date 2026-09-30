/**
 * The three.js view of a Gulp Universe round: a toy city on an island, holes
 * roaming it, things tipping into them, and (when switched on) power-ups and
 * a city that fights back.
 *
 * Framework-free, like the racer's scene: the page builds one of these and
 * each frame hands it the world and what just happened. Things are drawn in
 * batches (one InstancedMesh per kind and colour per area of the map), so a
 * Region map with thousands of things stays quick and the areas off screen
 * are skipped. A building standing between the camera and the child's hole
 * is swapped for a see-through copy while it is in the way. Everything is
 * procedural, so the PWA stays offline.
 */
import * as THREE from 'three';
import { seededRng } from '@shared/rng';
import { disposeDeep } from '@shared/three/disposeDeep';
import { FIT, KINDS, type Prop } from '../domain/catalog';
import { BUILD_TIME, POWER_TIME, canEat, propsNear, type Hole, type Person, type World, type WorldEvent } from '../domain/world';
import { Effects } from './effects';
import { buildGround, type Ground } from './ground';
import { buildKindGeometry } from './props';

export interface HoleLook {
  /** The hole's colour: rim, throat and name tag. */
  color: number;
  /** Shown over the hole. */
  label: string;
}

/** How long a swallowed thing takes to disappear, in seconds. */
const FALL = 0.8;
/** Buildings from this tier up can hide the child's hole, and fade. */
const TALL_TIER = 5;
/** The sun always comes from the same side; shadows are fitted around the camera. */
const SUN_DIR = new THREE.Vector3(0.35, 1, 0.25).normalize();
const SHADOW_MAP = 2048;

/** How see-through a building standing in front of the child's hole goes. */
const GHOST = 0.2;

/** Each power-up's colour: the aura, the countdown ring and its number. */
const POWER_COLOR = { speed: 0x39c6ff, double: 0xffc62e } as const;

/** Things are batched per square of this many units (two blocks), so the
 * squares off screen are skipped while the hole is small. */
const CHUNK = 108;

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
  /** A vehicle's soft shadow patch, drawn with the same matrix. */
  blob?: THREE.InstancedMesh;
}

/**
 * Vehicles cast no sun shadow: small, low shadows came out with a gap under
 * the wheels. They sit on a soft dark patch instead, which is steadier and
 * cheaper to draw.
 */
/** What a mouth can be left with, and what leaves it. */
type Smear = 'burn' | 'poop' | 'icecream';
const MESSY: Partial<Record<Prop['kind'], Smear>> = { garbagetruck: 'poop', icecreamvan: 'icecream', cart: 'icecream' };
/** The rim leans toward this while the mess lasts. */
const SMEAR_RIM: Record<Smear, THREE.Color> = {
  burn: new THREE.Color(0x3a2a22),
  poop: new THREE.Color(0x7a4a1e),
  icecream: new THREE.Color(0xffa8cf),
};
/** Seconds for a full-strength mess to fade away. */
const SMEAR_FADE = 5;

/**
 * Built models, kept for the whole visit: the menu's city and every round
 * after it use the same ones, so starting a round does not build them all
 * again. A scene's teardown frees their GPU copies; the next scene uploads
 * them again, which is quick next to building them.
 */
const MODELS = new Map<string, THREE.BufferGeometry>();

/** The menu's tour: seconds at each showpiece, and the share of that spent gliding there. */
const TOUR_DWELL = 9;
const TOUR_GLIDE = 0.4;

/** Small street furniture: no shadows, to save the shadow pass drawing hundreds of them. */
const CLUTTER: ReadonlySet<string> = new Set(['lamp', 'bin', 'hydrant', 'planter', 'cone', 'bike', 'mailbox']);

const VEHICLES: ReadonlySet<string> = new Set(['car', 'taxi', 'van', 'bus', 'garbagetruck', 'icecreamvan', 'cart', 'tractor', 'tanker', 'container', 'policecar', 'tank', 'bike']);

interface Faller {
  mesh: THREE.Mesh;
  hole: number;
  t: number;
  from: THREE.Vector3;
  rot: number;
  h: number;
  /** A see-through copy has its own material to free. */
  ownMaterial: boolean;
}

interface HoleObj {
  group: THREE.Group;
  disc: THREE.Mesh;
  body: THREE.Group;
  rim: THREE.MeshStandardMaterial;
  pupils: THREE.Object3D[];
  lids: THREE.Object3D[];
  /** The two eyes: they grow more slowly than the hole. */
  eyes: THREE.Object3D[];
  label: THREE.Sprite;
  materials: THREE.Material[];
  /** The child's power-up show: a glowing aura, a draining ring, the seconds left. */
  power?: {
    aura: THREE.Mesh;
    ring: THREE.Mesh;
    ringTheta: number;
    count: THREE.Sprite;
    shown: string;
  };
  /** A mess in the mouth that fades: burnt by a fuel truck, a garbage truck, ice cream. */
  smear: { mesh: THREE.Mesh; kind: Smear | null; amount: number; base: THREE.Color; flameIn: number };
  /** 1 while visible, shrinking to 0 when swallowed. */
  shown: number;
  flash: number;
  blink: number;
}

export class GulpScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private ground: Ground;
  private effects: Effects;
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 });
  private geometries = new Map<string, THREE.BufferGeometry>();
  private slots = new Map<number, Slot>();
  private batches: Array<{ mesh: THREE.InstancedMesh; tier: number; casts: boolean }> = [];
  /** Tall things that might stand in the way, and the see-through copies in use. */
  private tall: Prop[] = [];
  private ghosts = new Map<number, THREE.Mesh>();
  /** When each see-through copy was last needed: they linger a moment, so a
   * building doesn't flick between solid and faded at the edge of the view. */
  private ghostSeen = new Map<number, number>();
  /** Buildings put up during the round, drawn one by one; `t` runs 0..1 while they rise. */
  private built = new Map<number, { mesh: THREE.Mesh; scaffold: THREE.Group; t: number; time: number }>();
  private scaffoldMat = new THREE.MeshStandardMaterial({ color: 0xffb81c, roughness: 0.6 });
  private scaffoldGeo = new THREE.BoxGeometry(1, 1, 1);
  private bubble: { sprite: THREE.Sprite; life: number; hole: number } | null = null;
  private bubbleTex = new Map<string, THREE.Texture>();
  private lastYum = -10;
  private lightBasis = new THREE.Matrix4();
  /** Things wobbling on the rim of the child's hole: too big to fall in yet. */
  private wobbling = new Map<number, number>();
  private shakeOf = new Map<number, number>();
  /** People: one batch per outfit, and where each person sits in it. */
  private facing = new Map<number, number>();
  private alarms: THREE.Sprite[] = [];
  private alarmTex: THREE.Texture | null = null;
  private responderViews = new Map<number, { group: THREE.Group; baton?: THREE.Object3D }>();
  private batonGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6);
  private batonMat = new THREE.MeshStandardMaterial({ color: 0x1d1f33, roughness: 0.5 });
  private blobTex = blobTexture();
  private blobMat = new THREE.MeshBasicMaterial({
    map: this.blobTex,
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -40,
  });

  /** A flat soft patch a little bigger than the vehicle's footprint, just above the road. */
  private blobGeometry(kind: string): THREE.BufferGeometry {
    const key = `blob:${kind}`;
    let geo = this.geometries.get(key);
    if (!geo) {
      const info = KINDS[kind as keyof typeof KINDS];
      geo = new THREE.PlaneGeometry(info.w * 1.15 + 0.3, info.d * 1.08 + 0.3);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.02, 0);
      this.geometries.set(key, geo);
    }
    return geo;
  }
  private frameDt = 0;
  /** The child's zoom: 1 is the usual view; smaller is closer, bigger further out. */
  private zoom = 1;
  private peopleSlots: Array<{ person: Person; mesh: THREE.InstancedMesh; index: number }> = [];
  private wobbleDummy = new THREE.Object3D();
  private tiltAxis = new THREE.Vector3();
  private tiltQ = new THREE.Quaternion();
  private holes: HoleObj[] = [];
  private fallers: Faller[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private warmQueue: Array<[Prop['kind'], number, number]> = [];
  private smearTex = new Map<Smear, THREE.Texture>();
  private stops: Array<{ x: number; z: number; r: number }> | null = null;
  private resizeObs: ResizeObserver | null = null;
  private time = 0;
  private pending = 0;
  private pendingAt = new THREE.Vector3();
  private pendingFor = 0;
  private disposed = false;
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private shadowReach = 0;

  constructor(
    private container: HTMLElement,
    world: World,
    looks: HoleLook[],
    /** The hole the camera follows: the child's, or a rival in attract mode. */
    private follow: number,
    private reducedMotion = false,
    /** The menu's backdrop: a slow, steady glide over the city, following nobody. */
    private tour = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
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
    this.scene.fog = new THREE.Fog(0x8fd8f5, 260, 620);
    this.camera = new THREE.PerspectiveCamera(45, this.aspect(), 1, 1200);

    // Less fill and a stronger sun: crisper shadows and more contrast.
    this.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8a8070, 0.95));
    this.sun = new THREE.DirectionalLight(0xfff2de, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.ground = buildGround(world.city, this.renderer);
    this.scene.add(this.ground.group);
    this.buildProps(world);
    this.buildPeople(world);
    this.effects = new Effects(reducedMotion);
    this.scene.add(this.effects.group);
    looks.forEach((look, i) => this.holes.push(this.buildHole(look, i === follow)));

    const first = tour ? this.tourSpot(world) : world.holes[follow];
    if (first) this.snapCamera(first);

    // Heights a rebuilt building can come in (see the domain's rebuild).
    // Biggest first, so the slow ones are built during the countdown. Wonders
    // are never rebuilt, and the menu's slow tour never needs a new one.
    const heights = [1, 1.25, 1.5, 1.75, 2];
    const kinds = (Object.keys(KINDS) as Array<Prop['kind']>).filter((k) => !KINDS[k].wonder && !tour);
    kinds.sort((a, b) => KINDS[a].tier - KINDS[b].tier);
    for (const kind of kinds) {
      const info = KINDS[kind];
      for (let v = 0; v < info.variants; v++) for (const h of info.scales ? heights : [1]) this.warmQueue.push([kind, v, h]);
    }
    // Compile every shader an effect or a mess will use now, not on the frame it first shows.
    this.renderer.compile(this.effects.prototypes(), this.camera, this.scene);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(container);
    }
  }

  private aspect(): number {
    return (this.container.clientWidth || 800) / (this.container.clientHeight || 600);
  }

  // ---------------------------------------------------------------------
  // Things in the city
  // ---------------------------------------------------------------------

  private geometry(p: Prop): THREE.BufferGeometry {
    // Buildings come in a few heights; everything else in its colours.
    return this.geometryOf(p.kind, p.variant, KINDS[p.kind].scales ? Math.round(p.hScale * 4) / 4 : 1);
  }

  private geometryOf(kind: Prop['kind'], variant: number, h: number): THREE.BufferGeometry {
    const key = `${kind}:${variant}:${h}`;
    let geo = MODELS.get(key);
    if (!geo) {
      geo = buildKindGeometry(kind, variant, h);
      geo.computeBoundingSphere();
      MODELS.set(key, geo);
    }
    return geo;
  }

  /**
   * Every model the round might still need (a rebuilt lot, a police car, a
   * taller tower), built a few at a time in spare frame time. Building one
   * the moment it first appears stalls that frame.
   */
  private warmNext(budgetMs: number): void {
    if (!this.warmQueue.length) return;
    const until = performance.now() + budgetMs;
    while (this.warmQueue.length && performance.now() < until) {
      const [kind, variant, h] = this.warmQueue.pop()!;
      // A kind without a model yet is never placed either; skip it rather than stop the frame.
      try {
        this.geometryOf(kind, variant, h);
      } catch {
        continue;
      }
    }
  }

  private buildProps(world: World): void {
    const groups = new Map<string, Prop[]>();
    for (const p of world.city.props) {
      const key = `${Math.floor(p.x / CHUNK)}:${Math.floor(p.z / CHUNK)}:${this.geometry(p).uuid}`;
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
      if (KINDS[p.kind].tier >= TALL_TIER) this.tall.push(p);
    }
    const dummy = new THREE.Object3D();
    for (const list of groups.values()) {
      const kind = list[0].kind;
      const vehicle = VEHICLES.has(kind);
      const mesh = new THREE.InstancedMesh(this.geometry(list[0]), this.material, list.length);
      const blob = vehicle ? new THREE.InstancedMesh(this.blobGeometry(kind), this.blobMat, list.length) : undefined;
      list.forEach((p, i) => {
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.updateMatrix();
        const matrix = dummy.matrix.clone();
        const m = world.props.has(p.id) ? matrix : this.hidden;
        mesh.setMatrixAt(i, m);
        blob?.setMatrixAt(i, m);
        this.slots.set(p.id, { mesh, index: i, matrix, blob });
      });
      if (blob) {
        blob.renderOrder = 1;
        blob.computeBoundingSphere();
        this.scene.add(blob);
      }
      // Vehicles have their soft blob instead; small street clutter casts none (hundreds of them, for little look).
      const casts = !vehicle && !CLUTTER.has(kind);
      mesh.castShadow = casts;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.batches.push({ mesh, tier: KINDS[list[0].kind].tier, casts });
    }
  }

  private setShown(p: Prop, shown: boolean): void {
    const slot = this.slots.get(p.id);
    if (!slot) {
      const b = this.built.get(p.id);
      if (b) b.mesh.visible = shown;
      return;
    }
    slot.mesh.setMatrixAt(slot.index, shown ? slot.matrix : this.hidden);
    slot.mesh.instanceMatrix.needsUpdate = true;
    if (slot.blob) {
      slot.blob.setMatrixAt(slot.index, shown ? slot.matrix : this.hidden);
      slot.blob.instanceMatrix.needsUpdate = true;
    }
  }

  private buildPeople(world: World): void {
    const byLook = new Map<string, Person[]>();
    for (const p of world.people) {
      const key = `${p.kind}:${p.variant % KINDS[p.kind].variants}`;
      byLook.set(key, [...(byLook.get(key) ?? []), p]);
    }
    for (const [key, list] of byLook) {
      const geo = buildKindGeometry(list[0].kind, list[0].variant);
      this.geometries.set(`walker:${key}`, geo);
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      mesh.castShadow = true;
      // They move every frame, so their bounds are the whole island.
      mesh.frustumCulled = false;
      list.forEach((person, index) => this.peopleSlots.push({ person, mesh, index }));
      this.scene.add(mesh);
    }
    // A pool of "!" marks for people running away.
    const tex = alarmTexture();
    this.alarmTex = tex;
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      sprite.scale.set(0.025, 0.035, 1);
      sprite.renderOrder = 13;
      sprite.visible = false;
      this.scene.add(sprite);
      this.alarms.push(sprite);
    }
  }

  /**
   * Everyone where the world says. Walkers bob gently; people running from a
   * hole hop high and quick with a "!" over their heads.
   */
  private syncPeople(): void {
    const d = this.wobbleDummy;
    const touched = new Set<THREE.InstancedMesh>();
    let alarm = 0;
    for (const { person: p, mesh, index } of this.peopleSlots) {
      if (!p.alive) {
        mesh.setMatrixAt(index, this.hidden);
      } else {
        const running = p.state === 'flee';
        const bob = this.reducedMotion
          ? 0
          : Math.abs(Math.sin(this.time * (running ? 14 : 6) + p.id)) * (running ? 0.45 : 0.07);
        // Turn smoothly toward the way they walk (corners and turn-rounds).
        let face = this.facing.get(p.id) ?? p.heading;
        let turn = p.heading - face;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        face += turn * (this.reducedMotion ? 1 : Math.min(1, this.frameDt * (running ? 18 : 10)));
        this.facing.set(p.id, face);
        d.position.set(p.x, bob, p.z);
        d.rotation.set(0, face, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        mesh.setMatrixAt(index, d.matrix);
        if (running && p.kind === 'person' && alarm < this.alarms.length) {
          const a = this.alarms[alarm++];
          a.visible = true;
          a.position.set(p.x, 2.6 + bob, p.z);
        }
      }
      touched.add(mesh);
    }
    for (let i = alarm; i < this.alarms.length; i++) this.alarms[i].visible = false;
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  /** Police cars racing in, and officers waving their batons at the hole. */
  private syncResponders(world: World): void {
    const live = new Set<number>();
    for (const r of world.responders) {
      if (r.state === 'leave' && r.t === Infinity) continue;
      if (r.kind === 'car' && r.state !== 'drive') continue;
      live.add(r.id);
      let view = this.responderViews.get(r.id);
      if (!view) {
        const kind = r.kind === 'car' ? 'policecar' : 'police';
        const group = new THREE.Group();
        const body = new THREE.Mesh(this.geometry({ id: 0, kind, variant: 0, x: 0, z: 0, rot: 0, size: 0, points: 0, hScale: 1 }), this.material);
        body.castShadow = true;
        group.add(body);
        let baton: THREE.Object3D | undefined;
        if (r.kind === 'officer') {
          // A baton in the right hand, held up and waved.
          const arm = new THREE.Group();
          arm.position.set(-0.45, 1.25, 0.1);
          const stick = new THREE.Mesh(this.batonGeo, this.batonMat);
          stick.position.y = 0.4;
          arm.add(stick);
          group.add(arm);
          baton = arm;
        }
        this.scene.add(group);
        view = { group, baton };
        this.responderViews.set(r.id, view);
      }
      view.group.position.set(r.x, 0, r.z);
      view.group.rotation.y = r.heading;
      if (view.baton) view.baton.rotation.z = this.reducedMotion ? 0.3 : 0.3 + Math.sin(this.time * 9 + r.id) * 0.7;
    }
    for (const [id, view] of this.responderViews) {
      if (live.has(id)) continue;
      this.scene.remove(view.group);
      this.responderViews.delete(id);
    }
  }

  /** A thing leaves the city: hide it where it stood, and start a copy falling. */
  private swallow(p: Prop, hole: number): void {
    this.setShown(p, false);
    const ghost = this.ghosts.get(p.id);
    const built = this.built.get(p.id);
    if (built) {
      this.built.delete(p.id);
      this.scene.remove(built.scaffold);
    }
    let mesh: THREE.Mesh;
    let ownMaterial = false;
    if (ghost) {
      this.ghosts.delete(p.id);
      if (built) this.scene.remove(built.mesh);
      mesh = ghost;
      ownMaterial = true;
    } else if (built) {
      // A building still going up falls as it stands.
      mesh = built.mesh;
      mesh.visible = true;
    } else {
      mesh = new THREE.Mesh(this.geometry(p), this.material);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.rot;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const info = KINDS[p.kind];
    this.fallers.push({ mesh, hole, t: 0, from: mesh.position.clone(), rot: p.rot, h: info.h * p.hScale, ownMaterial });
  }

  // ---------------------------------------------------------------------
  // Holes
  // ---------------------------------------------------------------------

  private buildHole(look: HoleLook, mine: boolean): HoleObj {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    const keep = <M extends THREE.Material>(m: M) => {
      materials.push(m);
      return m;
    };
    const throat = keep(new THREE.MeshBasicMaterial({ map: throatTexture(look.color), fog: false }));
    // Always over the ground's layers, whatever the camera angle.
    throat.polygonOffset = true;
    throat.polygonOffsetFactor = -8;
    throat.polygonOffsetUnits = -32;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 56), throat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.12;
    disc.renderOrder = 5;
    group.add(disc);

    const body = new THREE.Group();
    const rim = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.45, emissive: look.color, emissiveIntensity: 0.12 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 10, 56), rim);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    body.add(ring);

    // Teeth round the rim, leaning in: friendly, not scary.
    const white = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    const toothGeo = new THREE.ConeGeometry(0.09, 0.24, 5);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, white);
      tooth.position.set(Math.cos(a) * 0.88, 0.1, Math.sin(a) * 0.88);
      tooth.rotation.set(0, -a, 0);
      tooth.rotateZ(0.9);
      body.add(tooth);
    }

    // Googly eyes on the far rim, where the camera always sees them.
    const eyeGeo = new THREE.SphereGeometry(0.32, 18, 14);
    const pupilGeo = new THREE.SphereGeometry(0.16, 14, 10);
    const lidGeo = new THREE.SphereGeometry(0.335, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const black = keep(new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3 }));
    const lidMat = keep(new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.5 }));
    const pupils: THREE.Object3D[] = [];
    const lids: THREE.Object3D[] = [];
    const eyes: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.38, 0.4, -1.0);
      const ball = new THREE.Mesh(eyeGeo, white);
      ball.castShadow = true;
      const pupil = new THREE.Mesh(pupilGeo, black);
      pupil.position.set(0, 0.03, 0.21);
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.scale.y = 0.05;
      eye.add(ball, pupil, lid);
      body.add(eye);
      eyes.push(eye);
      pupils.push(pupil);
      lids.push(lid);
    }
    group.add(body);

    // The child's own hole shows through buildings as a glowing ring, so it
    // is never lost behind a skyscraper.
    if (mine) {
      const xray = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.07, 8, 56),
        new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.55, depthTest: false, fog: false }),
      );
      xray.rotation.x = Math.PI / 2;
      xray.position.y = 0.06;
      xray.renderOrder = 20;
      body.add(xray);
    }
    const label = labelSprite(look.label, look.color, mine);
    group.add(label);
    this.scene.add(group);
    // The mess layer, over the throat and under the teeth.
    // Not in `materials`: the safe-blink sets their opacity every frame, and the mess fades on its own.
    const smearMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false });
    smearMat.polygonOffset = true;
    smearMat.polygonOffsetFactor = -9;
    smearMat.polygonOffsetUnits = -36;
    // A child of the throat disc, so it lies flat and grows with it.
    const smearMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 56), smearMat);
    smearMesh.position.z = 0.001;
    smearMesh.renderOrder = 6;
    smearMesh.visible = false;
    disc.add(smearMesh);
    const smear = { mesh: smearMesh, kind: null, amount: 0, base: new THREE.Color(look.color), flameIn: 0 };
    const obj: HoleObj = { group, disc, body, rim, pupils, lids, eyes, label, materials, smear, shown: 1, flash: 0, blink: 2 + (group.id % 5) * 0.7 };
    if (mine) obj.power = this.buildPowerShow(group);
    return obj;
  }

  /** The aura, countdown ring and number that show round the child's hole during a power-up. */
  private buildPowerShow(group: THREE.Group): NonNullable<HoleObj['power']> {
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.9, 64),
      new THREE.MeshBasicMaterial({
        map: auraTexture(),
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.2;
    aura.renderOrder = 6;
    aura.visible = false;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.14, 1.3, 64, 1, Math.PI / 2, Math.PI * 2),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, fog: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    ring.renderOrder = 21;
    ring.visible = false;
    const count = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, sizeAttenuation: false }));
    count.scale.set(0.08, 0.08, 1);
    count.renderOrder = 22;
    count.visible = false;
    group.add(aura, ring, count);
    return { aura, ring, ringTheta: Math.PI * 2, count, shown: '' };
  }

  /**
   * During a power-up the child's hole glows in its colour, a ring round the
   * rim drains as the time runs out, and the seconds left float beside it.
   * With both on, the one with less time left is counted.
   */
  private syncPowerShow(obj: HoleObj, h: Hole, r: number): void {
    const p = obj.power;
    if (!p) return;
    const kind = h.speedTime > 0 && (h.doubleTime <= 0 || h.speedTime <= h.doubleTime) ? 'speed' : h.doubleTime > 0 ? 'double' : null;
    const on = kind !== null && h.alive;
    p.aura.visible = p.ring.visible = p.count.visible = on;
    if (!on) return;
    const left = kind === 'speed' ? h.speedTime / POWER_TIME.speed : h.doubleTime / POWER_TIME.double;
    const secs = Math.ceil(kind === 'speed' ? h.speedTime : h.doubleTime);
    const color = POWER_COLOR[kind];
    // The aura pulses, faster in the last three seconds.
    const hurry = secs <= 3;
    const pulse = this.reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(this.time * (hurry ? 14 : 6));
    const auraMat = p.aura.material as THREE.MeshBasicMaterial;
    auraMat.color.setHex(color);
    auraMat.opacity = pulse;
    p.aura.scale.setScalar(r * (1 + (this.reducedMotion ? 0 : 0.04 * Math.sin(this.time * 5))));
    if (!this.reducedMotion) p.aura.rotation.z = this.time * 0.8;
    // The ring: the whole way round when fresh, down to nothing.
    const theta = Math.max(0.001, left * Math.PI * 2);
    if (Math.abs(theta - p.ringTheta) > 0.01) {
      p.ring.geometry.dispose();
      p.ring.geometry = new THREE.RingGeometry(1.14, 1.3, 64, 1, Math.PI / 2, theta);
      p.ringTheta = theta;
    }
    (p.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.ring.scale.setScalar(r);
    // The seconds left, beside the hole's right-hand rim.
    const tag = `${kind}:${secs}`;
    if (tag !== p.shown) {
      p.shown = tag;
      const mat = p.count.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.map = countTexture(secs, color);
      mat.needsUpdate = true;
    }
    // Beside the left rim, clear of the combo on the right edge of the screen.
    // A big hole's rim runs off screen; its ring and the HUD still count down.
    p.count.visible = r < 12;
    p.count.position.set(-r * 1.35, 1 + r * 0.3, 0);
    const beat = hurry && !this.reducedMotion ? 1 + 0.25 * Math.max(0, Math.sin(this.time * 14)) : 1;
    p.count.scale.set(0.08 * beat, 0.08 * beat, 1);
  }

  /** Mark a hole's mouth with a mess, as strong as `amount` (0 to 1). */
  private smearHole(hole: number, kind: Smear, amount: number): void {
    const obj = this.holes[hole];
    if (!obj || amount < 0.08) return;
    const s = obj.smear;
    if (s.kind !== kind) {
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      let tex = this.smearTex.get(kind);
      if (!tex) {
        tex = smearTexture(kind);
        this.smearTex.set(kind, tex);
      }
      mat.map = tex;
      mat.needsUpdate = true;
      s.kind = kind;
      s.amount = 0;
    }
    s.amount = Math.min(1, Math.max(s.amount, amount));
  }

  /**
   * The mess fades over a few seconds (a burn only once the flames are out),
   * tinting the rim toward its colour while it lasts. A burning mouth throws
   * flames off its rim.
   */
  private syncSmear(obj: HoleObj, h: Hole, r: number, dt: number): void {
    const s = obj.smear;
    if (h.burn > 0 && s.kind !== 'burn') this.smearHole(h.id, 'burn', 1);
    if (h.burn <= 0) s.amount = Math.max(0, s.amount - dt / SMEAR_FADE);
    const on = s.kind !== null && s.amount > 0.01;
    s.mesh.visible = on;
    obj.rim.color.copy(s.base);
    if (!on) return;
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.amount * 1.15);
    obj.rim.color.lerp(SMEAR_RIM[s.kind!], s.amount * 0.7);
    if (h.burn > 0 && h.alive) {
      s.flameIn -= dt;
      if (s.flameIn <= 0) {
        s.flameIn = this.reducedMotion ? 0.4 : 0.07;
        const a = (this.time * 7.7) % (Math.PI * 2);
        this.effects.flame(h.x + Math.cos(a) * r * 0.9, h.z + Math.sin(a) * r * 0.9, Math.max(1.2, r * 0.35));
      }
    }
  }

  private syncHole(obj: HoleObj, h: Hole, dt: number): void {
    const target = h.alive ? 1 : 0;
    obj.shown += (target - obj.shown) * Math.min(1, dt * (h.alive ? 5 : 9));
    const visible = obj.shown > 0.02;
    obj.group.visible = visible;
    if (!visible) return;
    obj.group.position.set(h.x, 0, h.z);
    const r = h.r * obj.shown;
    obj.disc.scale.set(r, r, 1);
    obj.body.scale.setScalar(r);
    // The eyes grow with the square root of the hole, so a giant's eyes stay
    // cute instead of filling the screen. They sit on the rim either way.
    const eye = Math.min(1, Math.sqrt(2.4 / Math.max(0.1, r)));
    obj.eyes.forEach((e, i) => {
      e.scale.setScalar(eye);
      e.position.set((i ? 1 : -1) * 0.38 * eye, 0.4 * eye, -1.0);
    });
    // Above the eyes on the far rim, not over them.
    obj.label.position.set(0, 1.4 + r * 0.9, -r * 1.1);
    // The child's own tag goes once their hole is big: it is plain which one
    // is theirs, and the tag would sit up under the scoreboard.
    if (h.isPlayer) obj.label.visible = r < 9;
    this.syncPowerShow(obj, h, r);

    // Blinking while it is safe after coming back.
    const blink = h.safe > 0 && !this.reducedMotion ? 0.55 + 0.45 * Math.sin(this.time * 18) : 1;
    for (const m of obj.materials) {
      m.transparent = blink < 1;
      m.opacity = blink;
    }
    // A glow on a level-up; red and a wobble while reeling from a hit; the
    // rim shimmers while a power-up is on.
    obj.flash = Math.max(0, obj.flash - dt * 1.5);
    const powered = h.speedTime > 0 || h.doubleTime > 0;
    const shimmer = powered && !this.reducedMotion ? 0.35 + 0.25 * Math.sin(this.time * 10) : 0;
    obj.rim.emissiveIntensity = 0.12 + obj.flash * 1.2 + shimmer;
    this.syncSmear(obj, h, r, dt);
    obj.rim.emissive.setHex(h.stun > 0 ? 0xff2a2a : h.speedTime > 0 ? 0x5fe3ff : h.doubleTime > 0 ? 0xffd34d : obj.rim.color.getHex());
    obj.body.rotation.y = h.stun > 0 && !this.reducedMotion ? Math.sin(this.time * 30) * 0.12 : 0;

    // The pupils look where the hole is going; now and then the eyes blink.
    // Eased, so they glide rather than snap when the hole turns or stops.
    const speed = Math.hypot(h.vx, h.vz);
    const look = Math.min(1, speed / 4);
    const lx = speed > 0.01 ? (h.vx / speed) * 0.1 * look : 0;
    const lz = speed > 0.01 ? (h.vz / speed) * 0.06 * look : 0;
    const k = Math.min(1, dt * 8);
    for (const p of obj.pupils) {
      p.position.x += (lx - p.position.x) * k;
      p.position.y += (0.03 - lz * 0.3 - p.position.y) * k;
      p.position.z = 0.21;
    }
    if (!this.reducedMotion) {
      obj.blink -= dt;
      const closing = obj.blink < 0.12 ? 1 - Math.abs(obj.blink - 0.06) / 0.06 : 0;
      for (const lid of obj.lids) lid.scale.y = 0.05 + closing * 0.95;
      if (obj.blink <= 0) obj.blink = 2.5 + ((this.time * 7.3) % 3);
    }
  }

  // ---------------------------------------------------------------------
  // Each frame
  // ---------------------------------------------------------------------

  /** Mirror the world, play what just happened, and move the camera. */
  sync(world: World, events: WorldEvent[], dt: number): void {
    if (this.disposed) return;
    this.warmNext(2);
    this.time += dt;
    this.frameDt = dt;
    const me = world.holes[this.follow];

    for (const e of events) {
      if (e.type === 'eat') {
        this.swallow(e.prop, e.hole);
        // A garbage truck or ice cream leaves its mark, strongest when it only just fit.
        const mess = MESSY[e.prop.kind];
        const eater = world.holes[e.hole];
        if (mess && eater) this.smearHole(e.hole, mess, Math.pow(e.prop.size / (eater.r * FIT), 0.7));
        if (e.hole === this.follow) {
          const h = world.holes[e.hole];
          this.pending += e.prop.points * (h && h.doubleTime > 0 ? 2 : 1);
          this.pendingAt.set(e.prop.x, 2 + KINDS[e.prop.kind].h, e.prop.z);
        }
      } else if (e.type === 'rebuild') {
        if (e.replaces) this.clear(e.replaces);
        this.raise(e.prop);
      } else if (e.type === 'food' && e.hole === this.follow) {
        if (e.food === 'healthy') this.say(`Healthy! +${e.bonus}`, true, e.hole);
        else if (this.time - this.lastYum > 2.5) {
          this.lastYum = this.time;
          this.say('Yum!', false, e.hole);
        }
      } else if (e.type === 'regrow') {
        this.setShown(e.prop, true);
      } else if (e.type === 'level') {
        const obj = this.holes[e.hole];
        if (obj) obj.flash = 1;
      } else if (e.type === 'boom') {
        this.effects.boom(e.x, e.z, Math.max(3, e.size));
        if (me && Math.hypot(e.x - me.x, e.z - me.z) < 30 + me.r * 3) this.shake = 0.5;
      } else if (e.type === 'hurt' && e.cause === 'tanker') {
        const h = world.holes[e.hole];
        this.smearHole(e.hole, 'burn', 1);
        if (h) this.effects.boom(h.x, h.z, Math.max(4, h.r * 0.9));
      } else if (e.type === 'hurt' && e.cause === 'chem') {
        const h = world.holes[e.hole];
        if (h) this.effects.gas(h.x, h.z, Math.max(3, h.r));
      }
    }

    // Points gathered over a quarter second show as one "+n" over the hole.
    this.pendingFor += dt;
    if (this.pending > 0 && this.pendingFor > 0.25) {
      this.effects.popup(this.pending, this.pendingAt);
      this.pending = 0;
      this.pendingFor = 0;
    }

    world.holes.forEach((h, i) => {
      const obj = this.holes[i];
      if (obj) this.syncHole(obj, h, dt);
    });

    this.stepFallers(world, dt);
    this.stepBuilt(dt);
    this.syncPeople();
    this.syncResponders(world);
    this.stepBubble(world, dt);
    if (me && !this.tour) this.wobble(world, me, dt);
    const scale = me ? Math.max(1, me.r / 2.5) : 1;
    this.effects.syncPowerups(world.powerups, scale);
    this.effects.syncAttacks(world.attacks, me ? me.r : 2);
    this.effects.step(dt);

    if (this.tour) {
      this.moveCamera(this.tourSpot(world), dt);
    } else if (me) {
      this.moveCamera(me, dt);
      this.fadeInTheWay(world, me, dt);
      // Small things cast no shadow once the camera is high above them.
      const small = me.r > 14;
      for (const b of this.batches) b.mesh.castShadow = b.casts && !(small && b.tier <= 2);
    }
    if (!this.reducedMotion) this.ground.water.offset.set(this.time * 0.004, this.time * 0.006);
  }

  private stepFallers(world: World, dt: number): void {
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt / FALL;
      const h = world.holes[f.hole];
      const k = Math.min(1, f.t);
      // Slide toward the middle of the hole, tip over its edge, and sink.
      const tx = h ? h.x : f.from.x;
      const tz = h ? h.z : f.from.z;
      const slide = Math.min(1, k * 1.6);
      f.mesh.position.x = f.from.x + (tx - f.from.x) * slide;
      f.mesh.position.z = f.from.z + (tz - f.from.z) * slide;
      f.mesh.position.y = -k * k * (f.h * 1.4 + 2);
      const along = Math.atan2(tx - f.from.x, tz - f.from.z);
      const tilt = Math.min(1.3, k * 2.2);
      f.mesh.rotation.set(Math.cos(along) * tilt, f.rot + k * 1.2, -Math.sin(along) * tilt, 'YXZ');
      if (f.t >= 1) {
        this.scene.remove(f.mesh);
        if (f.ownMaterial) (f.mesh.material as THREE.Material).dispose();
        this.fallers.splice(i, 1);
      }
    }
  }

  /**
   * Anything too big to swallow that sits over the rim of the child's hole
   * rocks and leans in, as if it is about to go: a hint of what is next.
   */
  private wobble(world: World, me: Hole, dt: number): void {
    // Each thing's wobble eases in while it sits on the rim and out after,
    // so nothing snaps upright or starts shaking in a single frame.
    const near = new Set<number>();
    if (me.alive && !this.reducedMotion) {
      for (const p of propsNear(world, me.x, me.z, me.r + 12)) {
        if (canEat(me, p) || this.ghosts.has(p.id)) continue;
        const reach = Math.max(KINDS[p.kind].w, KINDS[p.kind].d) / 2;
        if (Math.hypot(me.x - p.x, me.z - p.z) > me.r + reach * 0.6) continue;
        // How close the mouth is to fitting it: a third of the size and it
        // stays still; nearly big enough and it rocks hard.
        const q = (me.r * FIT) / p.size;
        const strength = Math.max(0, Math.min(1, (q - 0.35) / 0.55));
        if (strength < 0.05) continue;
        this.shakeOf.set(p.id, strength);
        near.add(p.id);
        if (!this.wobbling.has(p.id)) this.wobbling.set(p.id, 0);
      }
    }
    for (const [id, amount] of this.wobbling) {
      const p = world.props.get(id);
      const next = Math.max(0, Math.min(1, amount + (near.has(id) ? dt * 3 : -dt * 3)));
      if (!p || next === 0) {
        this.wobbling.delete(id);
        if (p && !this.ghosts.has(id)) this.setShown(p, true);
        const b = this.built.get(id);
        if (b) b.mesh.quaternion.setFromEuler(new THREE.Euler(0, p ? p.rot : 0, 0));
        continue;
      }
      this.wobbling.set(id, next);
      if (this.ghosts.has(id)) continue;
      // A gentle lean toward the hole and a slow rock around it. The angle is
      // capped by height, so a tower's top sways a little, not by metres.
      const h = KINDS[p.kind].h * p.hScale;
      const strength = this.shakeOf.get(id) ?? 0.5;
      const cap = Math.min(0.1, 0.8 / Math.max(1, h)) * strength;
      const lean = next * cap * (0.55 + 0.45 * Math.sin(this.time * (5 + 9 * strength) + id * 1.7));
      const dx = me.x - p.x;
      const dz = me.z - p.z;
      this.tiltAxis.set(dz, 0, -dx);
      if (this.tiltAxis.lengthSq() < 0.0001) this.tiltAxis.set(1, 0, 0);
      this.tiltAxis.normalize();
      this.tiltQ.setFromAxisAngle(this.tiltAxis, lean);
      const w = this.wobbleDummy;
      w.position.set(p.x, 0, p.z);
      w.rotation.set(0, p.rot, 0);
      w.scale.set(1, 1, 1);
      w.quaternion.premultiply(this.tiltQ);
      w.updateMatrix();
      this.place(p, w.matrix, w.quaternion);
    }
  }


  /** Set where a thing is drawn: its batch slot, or its own mesh if it was built during the round. */
  private place(p: Prop, matrix: THREE.Matrix4, q: THREE.Quaternion): void {
    const slot = this.slots.get(p.id);
    if (slot) {
      slot.mesh.setMatrixAt(slot.index, matrix);
      slot.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const b = this.built.get(p.id);
    if (b && b.t >= 1) b.mesh.quaternion.copy(q);
  }

  /** A new building goes up: it rises out of a yellow scaffold over a few seconds. */
  /** Take away something built during the round (a site whose building is done). */
  private clear(p: Prop): void {
    const b = this.built.get(p.id);
    if (!b) return;
    this.built.delete(p.id);
    this.scene.remove(b.mesh, b.scaffold);
    this.tall = this.tall.filter((t) => t.id !== p.id);
  }

  /**
   * Something new goes up. A construction site pops up out of the ground; a
   * finished building rises out of its site's scaffold over a few seconds.
   */
  private raise(p: Prop): void {
    const mesh = new THREE.Mesh(this.geometry(p), this.material);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.rot;
    mesh.scale.y = 0.02;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (p.kind === 'site' || p.kind === 'bigsite') {
      // Sites pop up quickly, with no scaffold of their own.
      this.built.set(p.id, { mesh, scaffold: new THREE.Group(), t: this.reducedMotion ? 1.4 : 0, time: 0.6 });
      return;
    }
    const info = KINDS[p.kind];
    const w = info.w + 0.6;
    const d = info.d + 0.6;
    const h = info.h * p.hScale + 1;
    const scaffold = new THREE.Group();
    scaffold.position.set(p.x, 0, p.z);
    scaffold.rotation.y = p.rot;
    const bar = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(this.scaffoldGeo, this.scaffoldMat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      scaffold.add(m);
    };
    const t = 0.35;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(t, h, t, (sx * w) / 2, h / 2, (sz * d) / 2);
    for (let y = h / 3; y <= h; y += h / 3) {
      bar(w, t, t, 0, y, d / 2);
      bar(w, t, t, 0, y, -d / 2);
      bar(t, t, d, w / 2, y, 0);
      bar(t, t, d, -w / 2, y, 0);
    }
    this.scene.add(scaffold);
    this.built.set(p.id, { mesh, scaffold, t: this.reducedMotion ? 1 : 0, time: BUILD_TIME });
    this.tall.push(p);
  }

  private stepBuilt(dt: number): void {
    for (const b of this.built.values()) {
      if (b.t >= 1.4) continue;
      b.t += dt / b.time;
      const k = Math.min(1, b.t);
      // Up with a little overshoot, then settled.
      const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      b.mesh.scale.y = Math.max(0.02, Math.min(1.04, ease));
      if (b.t >= 1 || this.reducedMotion) b.mesh.scale.y = 1;
      // The scaffold comes down once the building is up.
      b.scaffold.scale.y = b.t < 1 ? 1 : Math.max(0.001, 1 - (b.t - 1) / 0.4);
      if (b.t >= 1.4) this.scene.remove(b.scaffold);
    }
  }

  /** A small speech bubble by the child's hole: "Yum!" or a health bonus. */
  private say(text: string, healthy: boolean, hole: number): void {
    const key = `${healthy ? 'h' : 't'}:${text}`;
    let tex = this.bubbleTex.get(key);
    if (!tex) {
      tex = bubbleTexture(text, healthy);
      this.bubbleTex.set(key, tex);
    }
    if (!this.bubble) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      sprite.renderOrder = 12;
      sprite.scale.set(0.12, 0.06, 1);
      this.scene.add(sprite);
      this.bubble = { sprite, life: 0, hole };
    }
    const mat = this.bubble.sprite.material as THREE.SpriteMaterial;
    mat.map = tex;
    mat.needsUpdate = true;
    this.bubble.life = 1.3;
    this.bubble.hole = hole;
  }

  private stepBubble(world: World, dt: number): void {
    const b = this.bubble;
    if (!b) return;
    b.life -= dt;
    const h = world.holes[b.hole];
    const mat = b.sprite.material as THREE.SpriteMaterial;
    if (b.life <= 0 || !h?.alive) {
      mat.opacity = 0;
      return;
    }
    mat.opacity = Math.min(1, b.life * 3);
    // Up and to the right of the eyes, like a comic.
    b.sprite.position.set(h.x + h.r * 0.9, 1.5 + h.r * 0.8, h.z - h.r * 1.1);
  }

  /**
   * A point gliding on a wide, slow circle round the city, dressed as a
   * mid-size hole so the camera frames the streets from a pleasant height.
   */
  private tourSpot(world: World): Hole {
    const stops = this.tourStops(world);
    if (!stops.length) {
      const a = this.time * 0.035;
      const R = world.city.half * 0.45;
      return { ...world.holes[0], x: Math.cos(a) * R, z: Math.sin(a) * R, r: 12, alive: true, vx: -Math.sin(a), vz: Math.cos(a) };
    }
    // Glide to the next highlight, then drift slowly round it for a while.
    const leg = this.time / TOUR_DWELL;
    const i = Math.floor(leg) % stops.length;
    // The first stop is where the tour starts, not somewhere to glide to.
    const from = leg < 1 ? stops[0] : stops[(i + stops.length - 1) % stops.length];
    const to = stops[i];
    const t = Math.min(1, (leg - Math.floor(leg)) / TOUR_GLIDE);
    const k = t * t * (3 - 2 * t);
    const drift = this.time * 0.15;
    const r = from.r + (to.r - from.r) * k;
    // Aim a little in front of the showpiece, so it stands in the top of the
    // screen, clear of the menu card in the middle.
    const x = from.x + (to.x - from.x) * k + Math.cos(drift) * 4;
    const z = from.z + (to.z - from.z) * k + Math.sin(drift) * 4 + r * 1.1;
    return { ...world.holes[0], x, z, r, alive: true, vx: to.x - from.x, vz: to.z - from.z };
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

  /** Where the camera sits for a hole: higher as the hole grows. */
  private cameraFor(h: Hole): { pos: THREE.Vector3; look: THREE.Vector3 } {
    // Close in, so the city's things look big and chunky around the hole.
    const z = this.tour ? 1 : this.zoom;
    const up = (16 + h.r * 3) * z;
    const back = (11.5 + h.r * 2.2) * z;
    return { pos: new THREE.Vector3(h.x, up, h.z + back), look: new THREE.Vector3(h.x, 0, h.z - 2) };
  }

  private snapCamera(h: Hole): void {
    const c = this.cameraFor(h);
    this.camPos.copy(c.pos);
    this.camLook.copy(c.look);
  }

  private moveCamera(h: Hole, dt: number): void {
    const c = this.cameraFor(h);
    const k = 1 - Math.pow(0.002, dt);
    this.camPos.lerp(c.pos, k);
    this.camLook.lerp(c.look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && !this.reducedMotion) {
      this.shake = Math.max(0, this.shake - dt);
      const amp = this.shake * (1 + h.r * 0.1);
      this.camera.position.x += Math.sin(this.time * 60) * amp;
      this.camera.position.y += Math.cos(this.time * 47) * amp;
    }
    this.camera.lookAt(this.camLook);

    // Near, far and fog follow the camera's height, so a giant sees far.
    const dist = this.camPos.distanceTo(this.camLook);
    const far = dist * 4 + 600;
    if (Math.abs(this.camera.far - far) > 20) {
      this.camera.near = Math.max(0.5, dist * 0.02);
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    const fog = this.scene.fog as THREE.Fog;
    fog.near = dist * 2.6 + 150;
    fog.far = dist * 5 + 450;

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
    this.camera.updateMatrixWorld();
    const cam = this.camera.position;
    const fog = this.scene.fog as THREE.Fog;
    const cap = fog.far;
    this.lightBasis.lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const toLight = this.lightBasis.clone().transpose();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();
    const add = (p: THREE.Vector3) => {
      const q = p.clone().applyMatrix4(toLight);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    };
    for (const [nx, ny] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 1],
    ]) {
      v.set(nx, ny, 0.5).unproject(this.camera).sub(cam).normalize();
      const t = v.y < -0.01 ? Math.min(cap, -cam.y / v.y) : cap;
      add(cam.clone().addScaledVector(v, t));
    }
    add(this.camLook);
    const margin = 14 + r * 1.5;
    const raw = Math.max(maxX - minX, maxY - minY) / 2 + margin;
    // In steps of 16, and never more than the map can show sharply.
    const size = Math.min(ceilTo(raw, 16), 180 + r * 6);
    if (size !== this.shadowReach) {
      this.shadowReach = size;
      const sc = this.sun.shadow.camera;
      sc.left = -size;
      sc.right = size;
      sc.top = size;
      sc.bottom = -size;
      sc.near = 1;
      sc.far = 900 + r * 14;
      sc.updateProjectionMatrix();
    }
    const texel = (2 * size) / SHADOW_MAP;
    const centre = this.camLook.clone().applyMatrix4(toLight);
    centre.x = Math.round((minX + maxX) / 2 / texel) * texel;
    centre.y = Math.round((minY + maxY) / 2 / texel) * texel;
    centre.applyMatrix4(this.lightBasis);
    this.sun.target.position.copy(centre);
    this.sun.position.copy(centre).addScaledVector(SUN_DIR, 400 + r * 6);
  }

  /**
   * Tall things between the camera and the child's hole are swapped for
   * see-through copies while they are in the way.
   */
  private fadeInTheWay(world: World, me: Hole, dt: number): void {
    const want = new Set<number>();
    if (me.alive) {
      // Sight lines from the camera to the hole's eyes and the middle of its
      // mouth. Only buildings standing in front of the hole (on the camera's
      // side) may fade: one behind it never hides the mouth, and letting it
      // fade made it flick on and off as the hole moved along it.
      const eye = this.camera.position;
      const targets = [new THREE.Vector3(me.x, 0.5 + me.r * 0.4, me.z - me.r), new THREE.Vector3(me.x, 0.3, me.z)];
      const rays = targets.map((t) => ({ ray: new THREE.Ray(eye.clone(), t.clone().sub(eye).normalize()), far: eye.distanceTo(t) }));
      const box = new THREE.Box3();
      const hit = new THREE.Vector3();
      for (const p of this.tall) {
        if (!world.props.has(p.id)) continue;
        const info = KINDS[p.kind];
        const half = Math.max(info.w, info.d) / 2;
        if (p.z + half < me.z + me.r * 0.3) continue;
        const h = info.h * p.hScale;
        box.min.set(p.x - half, 0, p.z - half);
        box.max.set(p.x + half, h, p.z + half);
        if (rays.some(({ ray, far }) => ray.intersectBox(box, hit) && eye.distanceTo(hit) < far - 0.5)) want.add(p.id);
      }
    }
    for (const id of want) this.ghostSeen.set(id, this.time);
    // Fade in and out over a quarter of a second rather than snapping.
    const step = this.reducedMotion ? 1 : Math.min(1, dt * 4);
    for (const [id, ghost] of this.ghosts) {
      const mat = ghost.material as THREE.MeshStandardMaterial;
      const keep = want.has(id) || this.time - (this.ghostSeen.get(id) ?? 0) < 0.6;
      const target = keep ? GHOST : 1;
      mat.opacity += (target - mat.opacity) * step;
      if (keep || mat.opacity < 0.97) continue;
      this.ghostSeen.delete(id);
      this.scene.remove(ghost);
      mat.dispose();
      this.ghosts.delete(id);
      const p = world.props.get(id);
      if (p) this.setShown(p, true);
    }
    for (const id of want) {
      if (this.ghosts.has(id)) continue;
      const p = world.props.get(id);
      if (!p) continue;
      const mat = this.material.clone();
      mat.transparent = true;
      mat.opacity = 1;
      mat.depthWrite = false;
      const ghost = new THREE.Mesh(this.geometry(p), mat);
      ghost.position.set(p.x, 0, p.z);
      ghost.rotation.y = p.rot;
      ghost.renderOrder = 2;
      // The see-through copy still casts the building's shadow: without it
      // the shadow vanished while faded and popped back late.
      ghost.castShadow = true;
      this.scene.add(ghost);
      this.ghosts.set(id, ghost);
      this.setShown(p, false);
    }
  }


  /** Zoom in (negative) or out (positive) by `steps`, within a comfortable range. */
  zoomBy(steps: number): void {
    this.zoom = Math.max(0.55, Math.min(2.2, this.zoom * Math.pow(1.12, steps)));
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.effects.dispose();
    this.ground.dispose();
    for (const t of this.bubbleTex.values()) t.dispose();
    for (const t of this.smearTex.values()) t.dispose();
    this.scaffoldGeo.dispose();
    this.batonGeo.dispose();
    this.blobTex.dispose();
    this.blobMat.dispose();
    this.batonMat.dispose();
    this.alarmTex?.dispose();
    this.scaffoldMat.dispose();
    disposeDeep(this.scene);
    for (const g of this.geometries.values()) g.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// -------------------------------------------------------------------------
// Painted textures
// -------------------------------------------------------------------------

/**
 * A mess over the throat, strongest toward the rim (the middle is dark
 * anyway): soot and embers, brown splodges, or scoops of ice cream with
 * sprinkles. Blobs sit at fixed spots, so the same mess always looks the same.
 */
function smearTexture(kind: Smear): THREE.Texture {
  const s = 512;
  // Sizes below are for a 256 canvas; the texture is drawn at twice that so a giant's mouth stays crisp.
  const k = s / 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const rng = seededRng(kind === 'burn' ? 11 : kind === 'poop' ? 23 : 37);
  const blob = (x: number, y: number, r: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const around = (n: number, draw: (x: number, y: number, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = (0.5 + rng() * 0.42) * (s / 2);
      draw(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, i);
    }
  };
  if (kind === 'burn') {
    const grad = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(20,14,12,0)');
    grad.addColorStop(0.6, 'rgba(30,20,16,0.85)');
    grad.addColorStop(1, 'rgba(40,26,20,0.95)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    around(40, (x, y, i) => blob(x, y, (2 + rng() * 4) * k, i % 3 ? '#ff7a1a' : '#ffd23f'));
  } else if (kind === 'poop') {
    around(22, (x, y) => blob(x, y, (12 + rng() * 16) * k, rng() < 0.5 ? '#6b3f1a' : '#86532a'));
    around(10, (x, y) => blob(x, y, (5 + rng() * 5) * k, '#a06a38'));
  } else {
    const scoops = ['#ffb3d1', '#fff1c9', '#9be3c4', '#8a5a3c', '#ffd0e4'];
    around(20, (x, y, i) => blob(x, y, (14 + rng() * 14) * k, scoops[i % scoops.length]));
    const sprinkles = ['#ff4d6d', '#3a86ff', '#ffd23f', '#2ec27e', '#ffffff'];
    around(60, (x, y, i) => {
      g.fillStyle = sprinkles[i % sprinkles.length];
      g.save();
      g.translate(x, y);
      g.rotate(rng() * Math.PI);
      g.fillRect(-4 * k, -1.2 * k, 8 * k, 2.4 * k);
      g.restore();
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The inside of a hole: its colour at the rim, dark rings, black at the bottom. */
function throatTexture(color: number): THREE.Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const col = new THREE.Color(color);
  const tone = (f: number) =>
    `rgb(${Math.round(col.r * 255 * f)},${Math.round(col.g * 255 * f)},${Math.round(col.b * 255 * f)})`;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, '#000000');
  grad.addColorStop(0.45, '#07030a');
  grad.addColorStop(0.72, tone(0.32));
  grad.addColorStop(0.9, tone(0.62));
  grad.addColorStop(1, tone(0.8));
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // Rings going down the throat.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  for (const f of [0.62, 0.74, 0.85]) {
    g.lineWidth = 4 * f;
    g.beginPath();
    g.arc(s / 2, s / 2, (s / 2) * f, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A name tag that always faces the camera and keeps its size on screen. */
function labelSprite(text: string, color: number, mine: boolean): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '700 30px ui-rounded, system-ui, -apple-system, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 34);
  g.fillStyle = mine ? '#ffffff' : 'rgba(20,24,36,0.7)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 22);
  g.fill();
  g.fillStyle = mine ? `#${new THREE.Color(color).getHexString()}` : '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.scale.set(0.15, 0.0375, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A white speech bubble with a little tail; green words for healthy food. */
function bubbleTexture(text: string, healthy: boolean): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(29,31,51,0.85)';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(8, 8, 240, 86, 40);
  g.moveTo(52, 90);
  g.lineTo(36, 122);
  g.lineTo(84, 92);
  g.fill();
  g.stroke();
  // Cover the seam between the bubble and its tail.
  g.fillRect(44, 84, 44, 10);
  g.font = '900 44px ui-rounded, system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = healthy ? '#1a9c3c' : '#e0457b';
  g.fillText(text, 128, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A soft glow that fades out from the rim: the power-up aura. The ring's
 * texture is laid over the whole square it spans, so the glow is drawn round:
 * bright at the rim (half-way out) and gone at the edge.
 */
function auraTexture(): THREE.Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.48, 'rgba(255,255,255,0)');
  grad.addColorStop(0.52, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  // Uploaded as the canvas holds it: WebKit speckles otherwise (see the racer's sun).
  t.premultiplyAlpha = true;
  return t;
}

/** The seconds left on a power-up: a big number in a coloured badge. */
function countTexture(secs: number, color: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.font = '900 68px ui-rounded, system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(29,31,51,0.85)';
  g.strokeText(String(secs), 64, 68);
  g.fillStyle = '#ffffff';
  g.fillText(String(secs), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A red "!" for someone running away. */
function alarmTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '900 60px ui-rounded, system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
  g.strokeText('!', 24, 34);
  g.fillStyle = '#e8322b';
  g.fillText('!', 24, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ceilTo = (v: number, step: number): number => Math.ceil(v / step) * step;

/** A soft rounded patch, dark in the middle and fading at the edges. */
function blobTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  // Stacked, shrinking rounded squares build up a soft edge (canvas blur
  // filters are missing on older iPads).
  g.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i < 9; i++) {
    const inset = 2 + i * 2.2;
    g.beginPath();
    g.roundRect(inset, inset, s - inset * 2, s - inset * 2, 14 - i);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  // Uploaded as the canvas holds it: WebKit speckles otherwise (see the racer's sun).
  t.premultiplyAlpha = true;
  return t;
}
