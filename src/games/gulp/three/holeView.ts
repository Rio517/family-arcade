/**
 * The holes as drawn: each mouth cut into the ground with its throat going
 * down, the rim with its teeth and googly eyes, the name tag, the child's
 * power-up show, messes left in a mouth (and the flames of a burning one),
 * and the speech bubble by the child's hole.
 */
import * as THREE from 'three';
import { FIT, type Prop } from '../domain/catalog';
import { POWER_TIME, type Hole } from '../domain/world';
import { auraTexture, bubbleTexture, countTexture, labelTexture, smearTexture, type Smear } from './canvasTextures';
import type { Effects } from './effects';

export interface HoleLook {
  /** The hole's colour: rim, throat and name tag. */
  color: number;
  /** Shown over the hole. */
  label: string;
}

/**
 * Holes are real holes. Each frame the ground is drawn first; then each
 * mouth's mask marks its circle in the stencil and pushes the depth there to
 * the far plane, which cuts the ground away; then the throat is drawn only
 * inside those circles, with ordinary depth, so anything standing in front
 * of a hole still hides it, and things falling in show inside it. Props and
 * everything else come after. The ground's own layers are moved before all
 * this (see `GROUND_SHIFT`).
 */
const PIT_ORDER = -50;
/** Added to every ground layer's render order, so the ground is drawn before the holes cut it. */
export const GROUND_SHIFT = -100;
/** Drawn only inside a mouth's circle. */
const INSIDE_HOLE = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
} as const;
/** The throat's shape, from the rim (radius 1) down to its dark floor, as (radius, height) pairs. */
const PIT_DEPTH = 2.6;
const PIT_PROFILE: THREE.Vector2[] = [
  ...Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return new THREE.Vector2(0.42 + 0.58 * Math.pow(1 - t, 2.4), -PIT_DEPTH * Math.pow(t, 1.15));
  }),
  new THREE.Vector2(0, -PIT_DEPTH),
];

/** Each power-up's colour: the aura, the countdown ring and its number. */
const POWER_COLOR = { speed: 0x39c6ff, double: 0xffc62e } as const;
/** The countdown ring is built whole once and drawn in part: this many segments, about 0.01 radians each. */
const RING_SEGMENTS = 640;

/** What leaves a mess in a mouth. */
const MESSY: Partial<Record<Prop['kind'], Smear>> = { garbagetruck: 'poop', icecreamvan: 'icecream', cart: 'icecream' };
/** The rim leans toward this while the mess lasts. */
const SMEAR_RIM: Record<Smear, THREE.Color> = {
  burn: new THREE.Color(0x3a2a22),
  poop: new THREE.Color(0x7a4a1e),
  icecream: new THREE.Color(0xffa8cf),
};
/** Seconds for a full-strength mess to fade away. */
const SMEAR_FADE = 5;

interface HoleObj {
  group: THREE.Group;
  /** The mouth's cut in the ground, its throat and any mess on it: one unit wide, scaled to the hole. */
  disc: THREE.Group;
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
    count: THREE.Sprite;
    shown: string;
  };
  /** A mess in the mouth that fades: burnt by a fuel truck, a garbage truck, ice cream. */
  smear: { mesh: THREE.Mesh; kind: Smear | null; amount: number; base: THREE.Color; flameIn: number };
  /** 1 while visible, shrinking to 0 when swallowed. */
  shown: number;
  /** How high it sits: it steps up and down kerbs smoothly. */
  y: number;
  flash: number;
  blink: number;
}

export class HoleViews {
  private holes: HoleObj[] = [];
  private maskGeo = new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2);
  private maskMat = new THREE.ShaderMaterial({
    // Push the depth to the far plane: whatever was drawn here (the ground) no longer hides the throat.
    vertexShader: 'void main() { vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }',
    fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
    colorWrite: false,
    depthFunc: THREE.AlwaysDepth,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  private pitMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, ...INSIDE_HOLE });
  /** The throat's shape with no colours, for the mess painted on it. */
  private pitShape = new THREE.LatheGeometry(PIT_PROFILE, 48);
  private smearTex = new Map<Smear, THREE.Texture>();
  private bubble: { sprite: THREE.Sprite; life: number; hole: number } | null = null;
  private bubbleTex = new Map<string, THREE.Texture>();
  private time = 0;
  /** The ground's height at a spot (a block stands a kerb above the road); the scene sets it. */
  ground: (x: number, z: number) => number = () => 0;

  constructor(
    private scene: THREE.Scene,
    private effects: Effects,
    private reducedMotion: boolean,
    looks: HoleLook[],
    /** The child's hole: it shows through buildings and carries the power-up show. */
    mine: number,
  ) {
    looks.forEach((look, i) => this.holes.push(this.build(look, i === mine)));
  }

  /** A glow on the rim, for a level-up. */
  flash(hole: number): void {
    const obj = this.holes[hole];
    if (obj) obj.flash = 1;
  }

  /** A garbage truck or ice cream leaves its mark, strongest when it only just fit. */
  ate(prop: Prop, hole: number, eater: Hole | undefined): void {
    const mess = MESSY[prop.kind];
    if (mess && eater) this.smear(hole, mess, Math.pow(prop.size / (eater.r * FIT), 0.7));
  }

  /** Mark a hole's mouth with a mess, as strong as `amount` (0 to 1). */
  smear(hole: number, kind: Smear, amount: number): void {
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

  /** A small speech bubble by the child's hole: "Yum!" or a health bonus. */
  say(text: string, healthy: boolean, hole: number): void {
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

  /** Every hole where the world says, and the bubble beside its hole. `time` is the scene's clock. */
  sync(holes: Hole[], time: number, dt: number): void {
    this.time = time;
    holes.forEach((h, i) => {
      const obj = this.holes[i];
      if (obj) this.syncHole(obj, h, dt);
    });
    this.stepBubble(holes, dt);
  }

  dispose(): void {
    for (const t of this.bubbleTex.values()) t.dispose();
    for (const t of this.smearTex.values()) t.dispose();
    this.maskGeo.dispose();
    this.maskMat.dispose();
    this.pitMat.dispose();
    this.pitShape.dispose();
  }

  private build(look: HoleLook, mine: boolean): HoleObj {
    const group = new THREE.Group();
    const materials: THREE.Material[] = [];
    const keep = <M extends THREE.Material>(m: M) => {
      materials.push(m);
      return m;
    };
    // A real hole: the mouth cuts the ground away (see `PIT_ORDER`) and a
    // funnel of throat goes down into the dark below it. Things fall into it.
    const disc = new THREE.Group();
    const mask = new THREE.Mesh(this.maskGeo, this.maskMat);
    mask.renderOrder = PIT_ORDER;
    const pit = new THREE.Mesh(pitGeometry(look.color), this.pitMat);
    pit.renderOrder = PIT_ORDER + 1;
    disc.add(mask, pit);
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
    // The mess, painted on the throat's walls so it follows the mouth down.
    // Not in `materials`: the safe-blink sets their opacity every frame, and the mess fades on its own.
    const smearMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      ...INSIDE_HOLE,
    });
    const smearMesh = new THREE.Mesh(this.pitShape, smearMat);
    smearMesh.renderOrder = PIT_ORDER + 2;
    smearMesh.visible = false;
    disc.add(smearMesh);
    const smear = { mesh: smearMesh, kind: null, amount: 0, base: new THREE.Color(look.color), flameIn: 0 };
    const obj: HoleObj = { group, disc, body, rim, pupils, lids, eyes, label, materials, smear, shown: 1, y: 0, flash: 0, blink: 2 + (group.id % 5) * 0.7 };
    if (mine) obj.power = buildPowerShow(group);
    return obj;
  }

  private syncHole(obj: HoleObj, h: Hole, dt: number): void {
    const time = this.time;
    const target = h.alive ? 1 : 0;
    obj.shown += (target - obj.shown) * Math.min(1, dt * (h.alive ? 5 : 9));
    const visible = obj.shown > 0.02;
    obj.group.visible = visible;
    if (!visible) return;
    // The mouth sits on the ground at its middle: on a pavement, a kerb up,
    // stepping up and down quickly but not in a jump.
    obj.y += (this.ground(h.x, h.z) - obj.y) * Math.min(1, dt * 12);
    obj.group.position.set(h.x, obj.y, h.z);
    const r = h.r * obj.shown;
    obj.disc.scale.setScalar(r);
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
    const blink = h.safe > 0 && !this.reducedMotion ? 0.55 + 0.45 * Math.sin(time * 18) : 1;
    for (const m of obj.materials) {
      m.transparent = blink < 1;
      m.opacity = blink;
    }
    // A glow on a level-up; red and a wobble while reeling from a hit; the
    // rim shimmers while a power-up is on.
    obj.flash = Math.max(0, obj.flash - dt * 1.5);
    const powered = h.speedTime > 0 || h.doubleTime > 0;
    const shimmer = powered && !this.reducedMotion ? 0.35 + 0.25 * Math.sin(time * 10) : 0;
    obj.rim.emissiveIntensity = 0.12 + obj.flash * 1.2 + shimmer;
    this.syncSmear(obj, h, r, dt);
    obj.rim.emissive.setHex(h.stun > 0 ? 0xff2a2a : h.speedTime > 0 ? 0x5fe3ff : h.doubleTime > 0 ? 0xffd34d : obj.rim.color.getHex());
    obj.body.rotation.y = h.stun > 0 && !this.reducedMotion ? Math.sin(time * 30) * 0.12 : 0;

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
      if (obj.blink <= 0) obj.blink = 2.5 + ((time * 7.3) % 3);
    }
  }

  /**
   * During a power-up the child's hole glows in its colour, a ring round the
   * rim drains as the time runs out, and the seconds left float beside it.
   * With both on, the one with less time left is counted.
   */
  private syncPowerShow(obj: HoleObj, h: Hole, r: number): void {
    const p = obj.power;
    if (!p) return;
    const time = this.time;
    const kind = h.speedTime > 0 && (h.doubleTime <= 0 || h.speedTime <= h.doubleTime) ? 'speed' : h.doubleTime > 0 ? 'double' : null;
    const on = kind !== null && h.alive;
    p.aura.visible = p.ring.visible = p.count.visible = on;
    if (!on) return;
    const left = kind === 'speed' ? h.speedTime / POWER_TIME.speed : h.doubleTime / POWER_TIME.double;
    const secs = Math.ceil(kind === 'speed' ? h.speedTime : h.doubleTime);
    const color = POWER_COLOR[kind];
    // The aura pulses, faster in the last three seconds.
    const hurry = secs <= 3;
    const pulse = this.reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(time * (hurry ? 14 : 6));
    const auraMat = p.aura.material as THREE.MeshBasicMaterial;
    auraMat.color.setHex(color);
    auraMat.opacity = pulse;
    p.aura.scale.setScalar(r * (1 + (this.reducedMotion ? 0 : 0.04 * Math.sin(time * 5))));
    if (!this.reducedMotion) p.aura.rotation.z = time * 0.8;
    // The ring: the whole way round when fresh, down to a sliver. Each
    // segment is two triangles (six indices).
    const segments = Math.max(1, Math.min(RING_SEGMENTS, Math.ceil(left * RING_SEGMENTS)));
    p.ring.geometry.setDrawRange(0, segments * 6);
    (p.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.ring.scale.setScalar(r);
    // The seconds left, repainted only when the number changes.
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
    const beat = hurry && !this.reducedMotion ? 1 + 0.25 * Math.max(0, Math.sin(time * 14)) : 1;
    p.count.scale.set(0.08 * beat, 0.08 * beat, 1);
  }

  /**
   * The mess fades over a few seconds (a burn only once the flames are out),
   * tinting the rim toward its colour while it lasts. A burning mouth throws
   * flames off its rim.
   */
  private syncSmear(obj: HoleObj, h: Hole, r: number, dt: number): void {
    const s = obj.smear;
    if (h.burn > 0 && s.kind !== 'burn') this.smear(h.id, 'burn', 1);
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

  private stepBubble(holes: Hole[], dt: number): void {
    const b = this.bubble;
    if (!b) return;
    b.life -= dt;
    const h = holes[b.hole];
    const mat = b.sprite.material as THREE.SpriteMaterial;
    if (b.life <= 0 || !h?.alive) {
      mat.opacity = 0;
      return;
    }
    mat.opacity = Math.min(1, b.life * 3);
    // Up and to the right of the eyes, like a comic.
    b.sprite.position.set(h.x + h.r * 0.9, 1.5 + h.r * 0.8, h.z - h.r * 1.1);
  }
}

/** The aura, countdown ring and number that show round the child's hole during a power-up. */
function buildPowerShow(group: THREE.Group): NonNullable<HoleObj['power']> {
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
  // One whole ring, starting at the top; `syncPowerShow` draws the part still left.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.14, 1.3, RING_SEGMENTS, 1, Math.PI / 2, Math.PI * 2),
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
  return { aura, ring, count, shown: '' };
}

/**
 * A mouth's throat, coloured like the hole at the rim and darkening down to
 * black, with soft rings going down it.
 */
function pitGeometry(color: number): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(PIT_PROFILE, 48);
  const pos = geo.getAttribute('position');
  const rgb = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const depth = -pos.getY(i) / PIT_DEPTH;
    const shade = 0.8 * Math.pow(1 - Math.min(1, depth * 1.35), 1.6);
    const ring = (depth * 7) % 1 < 0.18 ? 0.72 : 1;
    c.copy(base).multiplyScalar(shade * ring);
    rgb[i * 3] = c.r;
    rgb[i * 3 + 1] = c.g;
    rgb[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  return geo;
}

/** A name tag that always faces the camera and keeps its size on screen. */
function labelSprite(text: string, color: number, mine: boolean): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: labelTexture(text, color, mine), depthTest: false, transparent: true, sizeAttenuation: false }),
  );
  sprite.scale.set(0.15, 0.0375, 1);
  sprite.renderOrder = 10;
  return sprite;
}
