/**
 * The moving extras in a Gulp Universe round: explosions and gas, "+points"
 * popping up over the child's hole, power-up orbs, and the city fighting
 * back (a tanker with a warning sign, a plane, and red target rings where
 * its bombs will land).
 */
import * as THREE from 'three';
import type { Attack, PowerKind, PowerUp } from '../domain/world';
import { buildKindGeometry } from './props';

interface Puff {
  sprite: THREE.Sprite;
  life: number;
  total: number;
  vel: THREE.Vector3;
  grow: number;
}

interface Popup {
  sprite: THREE.Sprite;
  life: number;
}

const POWER_COLOR: Record<PowerKind, number> = { speed: 0x39c6ff, double: 0xffc62e };

export class Effects {
  readonly group = new THREE.Group();
  private puffTex = softTexture();
  private puffs: Puff[] = [];
  private popups: Popup[] = [];
  private popupTex = new Map<number, THREE.Texture>();
  private orbs = new Map<number, THREE.Group>();
  private orbGeo = new THREE.IcosahedronGeometry(1, 1);
  private ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  private discGeo = new THREE.CircleGeometry(1, 48);
  private powerIcons: Record<PowerKind, THREE.Texture> = { speed: iconTexture('bolt'), double: iconTexture('x2') };
  private attackViews = new Map<number, { group: THREE.Group; rings: Map<number, THREE.Mesh>; bombs: Map<number, THREE.Mesh> }>();
  private tankerGeo: THREE.BufferGeometry;
  private jetGeo: THREE.BufferGeometry;
  private kitMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
  private warnTex = iconTexture('warn');
  private bombGeo = new THREE.CapsuleGeometry(0.5, 1.4, 4, 8);
  private bombMat = new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 0.5 });
  private time = 0;

  constructor(private reducedMotion: boolean) {
    this.tankerGeo = buildKindGeometry('tanker', 0);
    this.jetGeo = buildKindGeometry('jet', 1);
  }

  /** A fiery burst: a quick flash, then orange fire and grey smoke rolling out. */
  boom(x: number, z: number, size: number): void {
    const n = this.reducedMotion ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const fire = i % 3 !== 2;
      this.puff(
        new THREE.Vector3(x + Math.cos(a) * size * 0.2, 1 + size * 0.15, z + Math.sin(a) * size * 0.2),
        fire ? (i % 2 ? 0xffa42e : 0xff5a24) : 0x7c7c84,
        new THREE.Vector3(Math.cos(a) * size * 0.9, size * (0.6 + (i % 4) * 0.25), Math.sin(a) * size * 0.9),
        size * 0.55,
        fire ? 0.8 : 1.4,
        size * 0.9,
      );
    }
    this.puff(new THREE.Vector3(x, 2, z), 0xffe9a0, new THREE.Vector3(0, 0, 0), size * 1.1, 0.25, size);
  }

  /** Green gas billowing out of a hole that ate the chemical plant. */
  gas(x: number, z: number, size: number): void {
    const n = this.reducedMotion ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.puff(
        new THREE.Vector3(x + Math.cos(a) * size * 0.4, 1, z + Math.sin(a) * size * 0.4),
        i % 2 ? 0x8fe36a : 0xc6f26a,
        new THREE.Vector3(Math.cos(a) * size * 0.6, size * 0.5, Math.sin(a) * size * 0.6),
        size * 0.8,
        2.2,
        size * 1.2,
      );
    }
  }

  private puff(at: THREE.Vector3, color: number, vel: THREE.Vector3, size: number, life: number, grow: number): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.puffTex, color, transparent: true, depthWrite: false, premultipliedAlpha: true }),
    );
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    sprite.renderOrder = 6;
    this.group.add(sprite);
    this.puffs.push({ sprite, life, total: life, vel, grow });
  }

  /** "+8" rising over where the child just ate. */
  popup(points: number, at: THREE.Vector3): void {
    let tex = this.popupTex.get(points);
    if (!tex) {
      tex = textTexture(`+${points}`);
      this.popupTex.set(points, tex);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sprite.scale.set(0.11, 0.055, 1);
    sprite.position.copy(at);
    sprite.renderOrder = 11;
    this.group.add(sprite);
    this.popups.push({ sprite, life: 1 });
  }

  /** Power-up orbs float and spin, sized so the child's hole can see them. */
  syncPowerups(list: PowerUp[], scale: number): void {
    const live = new Set<number>();
    for (const p of list) {
      live.add(p.id);
      let orb = this.orbs.get(p.id);
      if (!orb) {
        orb = this.makeOrb(p.kind);
        this.orbs.set(p.id, orb);
        this.group.add(orb);
      }
      orb.position.set(p.x, 0, p.z);
      orb.scale.setScalar(scale);
      const body = orb.children[0];
      body.position.y = 1.6 + (this.reducedMotion ? 0 : Math.sin(this.time * 3 + p.id) * 0.25);
      if (!this.reducedMotion) body.rotation.y = this.time * 1.5;
      // Fade out over the last few seconds.
      const fade = Math.min(1, p.life / 3);
      orb.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.opacity = fade;
      });
    }
    for (const [id, orb] of this.orbs) {
      if (live.has(id)) continue;
      this.group.remove(orb);
      orb.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
      this.orbs.delete(id);
    }
  }

  private makeOrb(kind: PowerKind): THREE.Group {
    const color = POWER_COLOR[kind];
    const orb = new THREE.Group();
    const body = new THREE.Group();
    const ball = new THREE.Mesh(
      this.orbGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, flatShading: true }),
    );
    ball.castShadow = true;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.powerIcons[kind], transparent: true, depthTest: false }));
    icon.scale.setScalar(1.5);
    icon.renderOrder = 9;
    body.add(ball, icon);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.scale.setScalar(1.6);
    orb.add(body, ring);
    return orb;
  }

  /**
   * Tankers, planes and the rings where bombs will land. `r` is the size of
   * the child's hole: the plane flies below the camera, which rises with it.
   */
  syncAttacks(list: Attack[], r: number): void {
    const live = new Set<number>();
    for (const a of list) {
      live.add(a.id);
      let view = this.attackViews.get(a.id);
      if (!view) {
        view = { group: this.makeAttack(a), rings: new Map(), bombs: new Map() };
        this.attackViews.set(a.id, view);
        this.group.add(view.group);
      }
      const body = view.group.children[0];
      if (a.kind === 'tanker') {
        body.position.set(a.x, 0, a.z);
        body.rotation.y = a.heading;
        const warn = view.group.children[1];
        warn.position.set(a.x, 6 + (this.reducedMotion ? 0 : Math.sin(this.time * 8) * 0.6), a.z);
        continue;
      }
      // Over the rooftops but under the camera, and big enough to read
      // against a giant hole.
      const alt = 14 + r * 1.3;
      body.position.set(a.x, alt, a.z);
      body.rotation.y = Math.atan2(a.dx, a.dz);
      body.scale.setScalar(Math.max(0.6, r / 12));
      const bombsNow = new Set(a.bombs.map((b) => b.id));
      for (const b of a.bombs) {
        let ring = view.rings.get(b.id);
        if (!ring) {
          // A red rim with a see-through red floor: the danger zone.
          ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2d20, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
          const fill = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
          fill.name = 'fill';
          ring.add(fill);
          ring.rotation.x = -Math.PI / 2;
          ring.renderOrder = 7;
          fill.renderOrder = 6;
          view.rings.set(b.id, ring);
          view.group.add(ring);
        }
        ring.position.set(b.x, 0.3, b.z);
        ring.scale.setScalar(b.radius);
        const soon = Math.max(0, Math.min(1, 1 - b.fuse / 3));
        const pulse = this.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(this.time * (8 + soon * 14));
        (ring.material as THREE.MeshBasicMaterial).opacity = (0.6 + soon * 0.4) * pulse;
        const fill = ring.getObjectByName('fill') as THREE.Mesh;
        (fill.material as THREE.MeshBasicMaterial).opacity = (0.15 + soon * 0.25) * pulse;
        // The bomb itself falls for the last moment.
        if (b.fuse < 1.2) {
          let bomb = view.bombs.get(b.id);
          if (!bomb) {
            bomb = new THREE.Mesh(this.bombGeo, this.bombMat);
            bomb.castShadow = true;
            view.bombs.set(b.id, bomb);
            view.group.add(bomb);
          }
          bomb.scale.setScalar(Math.max(1, r / 8));
          bomb.position.set(b.x, alt * (b.fuse / 1.2), b.z);
        }
      }
      for (const [id, ring] of view.rings) {
        if (bombsNow.has(id)) continue;
        view.group.remove(ring);
        ring.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
        view.rings.delete(id);
        const bomb = view.bombs.get(id);
        if (bomb) view.group.remove(bomb);
        view.bombs.delete(id);
      }
    }
    for (const [id, view] of this.attackViews) {
      if (live.has(id)) continue;
      this.group.remove(view.group);
      for (const ring of view.rings.values()) ring.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
      this.attackViews.delete(id);
    }
  }

  private makeAttack(a: Attack): THREE.Group {
    const g = new THREE.Group();
    if (a.kind === 'tanker') {
      const truck = new THREE.Mesh(this.tankerGeo, this.kitMat);
      truck.castShadow = true;
      g.add(truck);
      const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.warnTex, depthTest: false, transparent: true, sizeAttenuation: false }));
      warn.scale.set(0.06, 0.06, 1);
      warn.renderOrder = 12;
      g.add(warn);
    } else {
      const plane = new THREE.Mesh(this.jetGeo, this.kitMat);
      plane.castShadow = true;
      g.add(plane);
    }
    return g;
  }

  step(dt: number): void {
    this.time += dt;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      if (!this.reducedMotion) {
        p.sprite.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1 - dt * 2);
        p.sprite.scale.addScalar(p.grow * dt);
      }
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.85 * Math.max(0, p.life / p.total);
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (!this.reducedMotion) p.sprite.position.y += dt * 6;
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, p.life * 2);
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.popups.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.puffs) (p.sprite.material as THREE.Material).dispose();
    for (const p of this.popups) (p.sprite.material as THREE.Material).dispose();
    for (const t of this.popupTex.values()) t.dispose();
    for (const t of Object.values(this.powerIcons)) t.dispose();
    this.puffTex.dispose();
    this.warnTex.dispose();
    this.orbGeo.dispose();
    this.ringGeo.dispose();
    this.discGeo.dispose();
    this.bombGeo.dispose();
    this.bombMat.dispose();
    this.tankerGeo.dispose();
    this.jetGeo.dispose();
    this.kitMat.dispose();
  }
}

/** A soft round blob for smoke, fire and gas. */
function softTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  // Uploaded as the canvas holds it: WebKit's near-transparent gradient
  // pixels can speckle when un-premultiplied (see the racer's sun).
  t.premultiplyAlpha = true;
  return t;
}

/** "+8" in chunky gold letters with a dark edge. */
function textTexture(text: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '900 44px ui-rounded, system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(40,30,10,0.85)';
  g.strokeText(text, 64, 34);
  g.fillStyle = '#ffd34d';
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The pictures on power-up orbs and the tanker's warning sign. */
function iconTexture(kind: 'bolt' | 'x2' | 'warn'): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.lineJoin = 'round';
  if (kind === 'warn') {
    g.fillStyle = '#ff3b30';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(64, 10);
    g.lineTo(120, 112);
    g.lineTo(8, 112);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '900 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 64, 76);
  } else if (kind === 'bolt') {
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0a5a8a';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(74, 8);
    g.lineTo(30, 72);
    g.lineTo(60, 72);
    g.lineTo(50, 120);
    g.lineTo(98, 52);
    g.lineTo(68, 52);
    g.closePath();
    g.stroke();
    g.fill();
  } else {
    g.font = '900 70px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#7a4a00';
    g.strokeText('x2', 64, 68);
    g.fillStyle = '#ffffff';
    g.fillText('x2', 64, 68);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
