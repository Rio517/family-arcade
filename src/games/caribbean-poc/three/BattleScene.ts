import * as THREE from 'three';
import { disposeDeep } from '@shared/three/disposeDeep';
import { broadsideVector, type BattleEvent, type BattleState, type Broadside, type ShipId } from '../domain/battle';
import { createSloop } from './loadSloop';

interface ShipVisual {
  root: THREE.Group;
  wake: THREE.Mesh;
  ring: THREE.Mesh;
}

interface Effect {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  velocity: THREE.Vector3;
}

export interface SceneMetrics {
  fps: number;
  drawCalls: number;
  triangles: number;
  textures: number;
}

const PLAYER_COLOR = '#d94b3d';
const ENEMY_COLOR = '#f3b642';

function canvasSky(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#166a83');
  gradient.addColorStop(0.42, '#65b6bd');
  gradient.addColorStop(0.7, '#e8c88a');
  gradient.addColorStop(1, '#f3d9a5');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function wakeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -0.72, 0, 0, -0.46, 0, 0, -3.8, 0, -15, -4.65, 0, -15,
      0.46, 0, 0, 0.72, 0, 0, 4.65, 0, -15, 3.8, 0, -15,
    ], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeIsland(x: number, z: number, scale: number): THREE.Group {
  const island = new THREE.Group();
  island.position.set(x, -0.65, z);
  island.scale.setScalar(scale);
  const sand = new THREE.Mesh(
    new THREE.SphereGeometry(9, 18, 7),
    new THREE.MeshStandardMaterial({ color: '#d6b873', roughness: 1 }),
  );
  sand.scale.set(1.9, 0.13, 0.72);
  island.add(sand);
  const green = new THREE.Mesh(
    new THREE.IcosahedronGeometry(6, 2),
    new THREE.MeshStandardMaterial({ color: '#477c4f', roughness: 0.92 }),
  );
  green.position.y = 1.1;
  green.scale.set(1.5, 0.28, 0.58);
  island.add(green);
  return island;
}

export class BattleScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ships = {} as Record<ShipId, ShipVisual>;
  private projectiles = new Map<number, THREE.Mesh>();
  private effects: Effect[] = [];
  private seenEvents = new Set<string>();
  private resizeObserver: ResizeObserver | null = null;
  private waterUniforms = { uTime: { value: 0 } };
  private windLines!: THREE.InstancedMesh;
  private time = 0;
  private cameraPosition = new THREE.Vector3(0, 31, 42);
  private cameraTarget = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private frameCount = 0;
  private fpsElapsed = 0;
  private fps = 60;
  private disposed = false;

  private constructor(
    private container: HTMLElement,
    private reducedMotion: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(container.clientWidth, container.clientHeight || 720);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / (container.clientHeight || 720),
      0.1,
      500,
    );
    this.camera.position.copy(this.cameraPosition);
    this.scene.background = canvasSky();
    this.scene.fog = new THREE.Fog('#7aafb0', 90, 235);
    this.buildWorld();
    this.onResize = this.onResize.bind(this);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(container);
    }
  }

  static async create(container: HTMLElement, reducedMotion: boolean): Promise<BattleScene> {
    const battle = new BattleScene(container, reducedMotion);
    const [player, enemy] = await Promise.all([createSloop(PLAYER_COLOR), createSloop(ENEMY_COLOR)]);
    battle.ships.player = battle.addShip(player, PLAYER_COLOR);
    battle.ships.enemy = battle.addShip(enemy, ENEMY_COLOR);
    return battle;
  }

  private buildWorld(): void {
    this.scene.add(new THREE.HemisphereLight('#d9f6ff', '#133b42', 1.55));
    const sun = new THREE.DirectionalLight('#fff0c9', 3.0);
    sun.position.set(-45, 80, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -65;
    sun.shadow.camera.right = 65;
    sun.shadow.camera.top = 65;
    sun.shadow.camera.bottom = -65;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#66d9dc', 1.1);
    rim.position.set(55, 24, -40);
    this.scene.add(rim);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420, 32, 32),
      new THREE.ShaderMaterial({
        uniforms: this.waterUniforms,
        vertexShader: `
          uniform float uTime;
          varying float vWave;
          varying vec2 vUv2;
          void main() {
            vec3 p = position;
            float a = sin(p.x * .075 + uTime * .9) * .24;
            float b = sin(p.y * .11 - uTime * .72 + p.x * .025) * .16;
            p.z += a + b;
            vWave = a + b;
            vUv2 = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          varying float vWave;
          varying vec2 vUv2;
          void main() {
            vec3 deep = vec3(.018, .20, .28);
            vec3 light = vec3(.09, .48, .52);
            float glint = smoothstep(.22, .39, vWave) * .32;
            float bands = sin((vUv2.x + vUv2.y) * 170.0) * .012;
            gl_FragColor = vec4(mix(deep, light, .35 + vWave * .35 + glint + bands), 1.0);
          }
        `,
        side: THREE.DoubleSide,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    this.scene.add(water);

    this.scene.add(makeIsland(-82, -54, 1.55), makeIsland(86, 18, 1.25));

    const windGeometry = new THREE.BoxGeometry(5.5, 0.025, 0.085);
    const windMaterial = new THREE.MeshBasicMaterial({ color: '#c8fff0', transparent: true, opacity: 0.38 });
    this.windLines = new THREE.InstancedMesh(windGeometry, windMaterial, 42);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 42; index++) {
      const row = Math.floor(index / 7);
      const column = index % 7;
      dummy.position.set(-72 + column * 24 + (row % 2) * 6, 0.18, -70 + row * 25);
      dummy.rotation.y = -Math.PI / 6;
      dummy.scale.x = 0.45 + ((index * 37) % 10) / 18;
      dummy.updateMatrix();
      this.windLines.setMatrixAt(index, dummy.matrix);
    }
    this.scene.add(this.windLines);
  }

  private addShip(model: THREE.Group, color: string): ShipVisual {
    const root = new THREE.Group();
    root.add(model);
    this.scene.add(root);
    const wake = new THREE.Mesh(
      wakeGeometry(),
      new THREE.MeshBasicMaterial({ color: '#ddfff3', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, wireframe: true }),
    );
    wake.position.y = 0.09;
    root.add(wake);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.52, 4.7, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    root.add(ring);
    return { root, wake, ring };
  }

  private eventKey(event: BattleEvent, index: number): string {
    return `${event.kind}:${event.at.toFixed(4)}:${index}`;
  }

  private emitEvent(event: BattleEvent, state: BattleState): void {
    const shipId = event.kind === 'outcome' ? null : event.ship;
    if (!shipId) return;
    const ship = state.ships[shipId];
    const smoke = event.kind === 'broadside';
    const side: Broadside = event.kind === 'broadside' ? event.side : 'port';
    const broadside = broadsideVector(ship.heading, side);
    for (let index = 0; index < (smoke ? 6 : 9); index++) {
      const material = new THREE.MeshStandardMaterial({
        color: smoke ? '#d7d2c6' : '#c8f8ef',
        transparent: true,
        opacity: smoke ? 0.54 : 0.72,
        roughness: 1,
      });
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(smoke ? 0.45 : 0.25, 1), material);
      puff.position.set(
        ship.position.x + broadside.x * (2.7 + index * 0.2),
        smoke ? 1.2 : 0.15,
        ship.position.z + broadside.z * (2.7 + index * 0.2),
      );
      this.scene.add(puff);
      this.effects.push({
        mesh: puff,
        age: 0,
        life: smoke ? 1.8 : 1.15,
        velocity: new THREE.Vector3(
          broadside.x * (0.7 + index * 0.08),
          smoke ? 0.85 + index * 0.05 : 1.7 + index * 0.1,
          broadside.z * (0.7 + index * 0.08),
        ),
      });
    }
  }

  sync(state: BattleState): void {
    for (const shipId of ['player', 'enemy'] as const) {
      const domain = state.ships[shipId];
      const visual = this.ships[shipId];
      visual.root.position.set(
        domain.position.x,
        this.reducedMotion ? 0 : Math.sin(this.time * 1.15 + (shipId === 'enemy' ? 1.7 : 0)) * 0.14,
        domain.position.z,
      );
      const pitch = this.reducedMotion ? 0 : Math.sin(this.time * 0.72 + 0.8) * 0.022;
      const roll = this.reducedMotion ? 0 : -domain.rudder * Math.min(0.09, domain.speed * 0.018) + Math.sin(this.time * 0.9) * 0.012;
      visual.root.rotation.set(pitch, domain.heading, roll);
      (visual.wake.material as THREE.MeshBasicMaterial).opacity = 0.035 + Math.min(0.14, domain.speed * 0.025);
      visual.wake.scale.z = 0.45 + domain.speed * 0.11;
      (visual.ring.material as THREE.MeshBasicMaterial).opacity = shipId === 'player' ? 0.58 : 0.36;
    }

    const live = new Set<number>();
    for (const projectile of state.projectiles) {
      live.add(projectile.id);
      let mesh = this.projectiles.get(projectile.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 8, 6),
          new THREE.MeshStandardMaterial({ color: '#171b1a', emissive: '#f4c36a', emissiveIntensity: 0.38, roughness: 0.28 }),
        );
        mesh.castShadow = true;
        this.projectiles.set(projectile.id, mesh);
        this.scene.add(mesh);
      }
      const arc = Math.sin(Math.min(1, projectile.travelled / 70) * Math.PI) * 1.7;
      mesh.position.set(projectile.position.x, 1.0 + arc, projectile.position.z);
    }
    for (const [id, mesh] of this.projectiles) {
      if (live.has(id)) continue;
      this.scene.remove(mesh);
      disposeDeep(mesh);
      this.projectiles.delete(id);
    }

    state.events.forEach((event, index) => {
      const key = this.eventKey(event, index);
      if (this.seenEvents.has(key)) return;
      this.seenEvents.add(key);
      this.emitEvent(event, state);
    });

    const player = state.ships.player;
    const enemy = state.ships.enemy;
    const forwardX = Math.sin(player.heading);
    const forwardZ = Math.cos(player.heading);
    if (this.camera.aspect < 1) {
      const centerX = (player.position.x + enemy.position.x) * 0.5;
      const centerZ = (player.position.z + enemy.position.z) * 0.5;
      const phone = this.camera.aspect < 0.62;
      this.desired.set(centerX, phone ? 64 : 58, centerZ + (phone ? 14 : 13));
      this.cameraTarget.set(centerX, 1.5, centerZ);
    } else {
      this.desired.set(
        player.position.x * 0.62 + enemy.position.x * 0.38 - forwardX * 28 + 11 * Math.cos(player.heading),
        30,
        player.position.z * 0.62 + enemy.position.z * 0.38 - forwardZ * 28 - 11 * Math.sin(player.heading),
      );
      this.cameraTarget.set(
        player.position.x * 0.58 + enemy.position.x * 0.42,
        1.8,
        player.position.z * 0.58 + enemy.position.z * 0.42,
      );
    }
  }

  render(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    this.waterUniforms.uTime.value = this.time;
    const damping = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.8);
    this.cameraPosition.lerp(this.desired, damping);
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);

    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      effect.age += dt;
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      const t = effect.age / effect.life;
      effect.mesh.scale.setScalar(1 + t * 2.4);
      (effect.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, (1 - t) * 0.65);
      if (effect.age >= effect.life) {
        this.scene.remove(effect.mesh);
        disposeDeep(effect.mesh);
        this.effects.splice(index, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
    this.fpsElapsed += dt;
    if (this.fpsElapsed >= 0.75) {
      this.fps = Math.round(this.frameCount / this.fpsElapsed);
      this.frameCount = 0;
      this.fpsElapsed = 0;
    }
  }

  metrics(): SceneMetrics {
    return {
      fps: this.fps,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      textures: this.renderer.info.memory.textures,
    };
  }

  private onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 720;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 0.62 ? 62 : this.camera.aspect < 1 ? 55 : 48;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    disposeDeep(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
