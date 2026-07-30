/**
 * The three.js view for Rainbow Racer — a grassy arena, a rainbow sky, one or
 * two karts (each with its chosen character riding on top), spinning coins, and
 * a camera that trails the player's own kart.
 *
 * Framework-free: the page builds one of these, then each frame hands it a plain
 * view (kart positions + coins) to mirror. All geometry is procedural and the
 * driver is an emoji drawn to a canvas texture, so nothing is downloaded and the
 * PWA stays offline.
 */
import * as THREE from 'three';
import { ARENA_RADIUS, type Coin } from '../domain/kart';

export interface RacerLook {
  emoji: string;
  /** Body color of the little kart. */
  color: number;
}

export interface SceneKart {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface SceneView {
  karts: SceneKart[];
  coins: Coin[];
}

function emojiTexture(emoji: string): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.font = `${size * 0.78}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function grassTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7ec85a';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#72bd50';
  ctx.fillRect(0, 0, s / 2, s / 2);
  ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  return tex;
}

interface KartObj {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  driver: THREE.Sprite;
  shadow: THREE.Mesh;
}

export class RacerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private karts: KartObj[] = [];
  private coinTemplate: THREE.Group;
  private coins = new Map<number, THREE.Group>();
  private resizeObs: ResizeObserver | null = null;
  private camPos = new THREE.Vector3(0, 16, -30);
  private camTarget = new THREE.Vector3(); // per-frame scratch, never allocated in sync()
  private liveCoinIds = new Set<number>(); // per-frame scratch
  private disposed = false;
  private spin = 0;

  constructor(
    private container: HTMLElement,
    looks: RacerLook[],
    private followIndex: number,
    private reducedMotion = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight || 400);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0x9fd8ff, 140, 360);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / (container.clientHeight || 400),
      0.1,
      800,
    );

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4f8f4a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff3d0, 1.1);
    sun.position.set(40, 80, 20);
    this.scene.add(sun);

    this.buildGround();
    this.buildFenceAndDecor();
    this.coinTemplate = this.buildCoinTemplate();
    for (const look of looks) this.karts.push(this.buildKart(look));

    this.onResize = this.onResize.bind(this);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(this.onResize);
      this.resizeObs.observe(container);
    }
  }

  private buildGround() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS, 64),
      new THREE.MeshStandardMaterial({ map: grassTexture() }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const meadow = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS * 3, 64),
      new THREE.MeshStandardMaterial({ color: 0x8fd06a }),
    );
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.y = -0.05;
    this.scene.add(meadow);
  }

  private buildFenceAndDecor() {
    const fence = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS, 1.4, 12, 80),
      new THREE.MeshStandardMaterial({ color: 0xff7fc4, roughness: 0.5 }),
    );
    fence.rotation.x = Math.PI / 2;
    fence.position.y = 1.4;
    this.scene.add(fence);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3f });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d52 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const R = ARENA_RADIUS + 22;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 6, 8), trunkMat);
      trunk.position.y = 3;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 10), leafMat);
      leaf.position.y = 11;
      tree.add(trunk, leaf);
      tree.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      this.scene.add(tree);
    }

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const R = ARENA_RADIUS * 1.4;
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + (j % 2) * 2, 10, 10), cloudMat);
        puff.position.set(j * 6 - 9, (j % 2) * 2, 0);
        cloud.add(puff);
      }
      cloud.position.set(Math.cos(a) * R, 55 + (i % 3) * 8, Math.sin(a) * R);
      this.scene.add(cloud);
    }
  }

  private buildKart(look: RacerLook): KartObj {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: look.color, metalness: 0.3, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 8), bodyMat);
    body.position.y = 2.4;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 3), bodyMat);
    nose.position.set(0, 2.0, 4.6);
    group.add(body, nose);

    const wheelGeo = new THREE.CylinderGeometry(1.5, 1.5, 1.4, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.7 });
    const wheels: THREE.Mesh[] = [];
    for (const [wx, wz] of [[-3.2, 3], [3.2, 3], [-3.2, -3], [3.2, -3]] as [number, number][]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 1.5, wz);
      wheels.push(wheel);
      group.add(wheel);
    }

    const driver = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: emojiTexture(look.emoji), transparent: true }),
    );
    driver.scale.set(11, 11, 1);
    driver.position.set(0, 9, 0);
    group.add(driver);
    this.scene.add(group);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(5.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    this.scene.add(shadow);

    return { group, wheels, driver, shadow };
  }

  private buildCoinTemplate(): THREE.Group {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.6, 28),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, metalness: 0.75, roughness: 0.3 }),
    );
    disc.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.5, 10, 28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissiveIntensity: 0.6 }),
    );
    g.add(disc, rim);
    return g;
  }

  private makeCoin(coin: Coin): THREE.Group {
    const g = this.coinTemplate.clone(true);
    const col = new THREE.Color().setHSL(coin.hue / 360, 0.9, 0.6);
    const disc = g.children[0] as THREE.Mesh;
    const rim = g.children[1] as THREE.Mesh;
    disc.material = (disc.material as THREE.MeshStandardMaterial).clone();
    (disc.material as THREE.MeshStandardMaterial).emissive = col.clone().multiplyScalar(0.35);
    rim.material = (rim.material as THREE.MeshStandardMaterial).clone();
    (rim.material as THREE.MeshStandardMaterial).color = col;
    (rim.material as THREE.MeshStandardMaterial).emissive = col.clone().multiplyScalar(0.5);
    g.position.set(coin.x, 4, coin.z);
    this.scene.add(g);
    return g;
  }

  sync(view: SceneView, dt: number): void {
    if (this.disposed) return;
    this.spin += dt;

    view.karts.forEach((k, i) => {
      const obj = this.karts[i];
      if (!obj) return;
      obj.group.position.set(k.x, 0, k.z);
      obj.group.rotation.y = k.heading;
      obj.shadow.position.set(k.x, 0.06, k.z);
      const wheelSpin = k.speed * dt * 0.5;
      for (const w of obj.wheels) w.rotation.x += wheelSpin;
      // Driving is gameplay; the happy bounce is decoration.
      if (!this.reducedMotion) obj.driver.position.y = 9 + Math.sin(this.spin * 6 + i) * 0.4;
    });

    const live = this.liveCoinIds;
    live.clear();
    for (const coin of view.coins) {
      live.add(coin.id);
      let mesh = this.coins.get(coin.id);
      if (!mesh) {
        mesh = this.makeCoin(coin);
        this.coins.set(coin.id, mesh);
      }
      mesh.position.x = coin.x;
      mesh.position.z = coin.z;
      if (!this.reducedMotion) {
        mesh.rotation.y += dt * 3;
        mesh.position.y = 4 + Math.sin(this.spin * 2.5 + coin.id) * 0.6;
      }
    }
    for (const [id, mesh] of this.coins) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.coins.delete(id);
        // Each coin owns cloned tinted materials (makeCoin) — free them.
        for (const child of mesh.children) {
          const m = (child as THREE.Mesh).material;
          if (m && !Array.isArray(m)) m.dispose();
        }
      }
    }

    // Chase camera: trail behind and above my own kart, looking a little ahead.
    const me = view.karts[this.followIndex] ?? view.karts[0];
    if (me) {
      const fx = Math.sin(me.heading);
      const fz = Math.cos(me.heading);
      const desired = this.camTarget.set(me.x - fx * 30, 18, me.z - fz * 30);
      const k = 1 - Math.pow(0.0001, dt);
      this.camPos.lerp(desired, k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(me.x + fx * 10, 4, me.z + fz * 10);
    }
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObs?.disconnect();
    // Every "Race again" builds a fresh scene, so teardown must genuinely
    // free the old one — geometries, materials, canvas textures, and the
    // WebGL context itself (browsers cap live contexts).
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
