import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeDeep } from '@shared/three/disposeDeep';

import type {
  NavalSceneAdapter,
  NavalSceneMetrics,
  NavalSceneOptions,
} from '../../components/battle/NavalViewport';
import { broadsideVector } from '../../domain/naval/geometry';
import type {
  Damage,
  NavalEvent,
  NavalShipId,
  NavalShipState,
  NavalState,
} from '../../domain/naval/types';
import { createSloop } from '../shared/loadSloop';
import { EffectPool } from './effects';
import {
  QualityController,
  qualitySettings,
} from './quality';
import { composeWakeMatrix } from './sceneMath';

interface ShipVisual {
  root: THREE.Group;
  model: THREE.Group;
  modelRest: THREE.Vector3;
  materials: Array<{
    material: THREE.MeshStandardMaterial;
    baseColor: THREE.Color;
    role: 'sail' | 'other';
  }>;
  state: NavalShipState | null;
  recoil: number;
  recoilX: number;
  recoilZ: number;
}

const PLAYER_COLOR = '#4ec5c1';
const OPPONENT_COLOR = '#d94b3d';
const SHIP_IDS: readonly NavalShipId[] = ['player', 'opponent'];

function canvasSky(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable for naval sky');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#135b75');
  gradient.addColorStop(0.4, '#63b7bc');
  gradient.addColorStop(0.7, '#e5c184');
  gradient.addColorStop(1, '#f2d8a6');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function wakeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.72, 0, 0, -0.46, 0, 0, -3.8, 0, -15, -4.65, 0, -15,
    0.46, 0, 0, 0.72, 0, 0, 4.65, 0, -15, 3.8, 0, -15,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

function islandSilhouettes(): THREE.Mesh {
  const placements: ReadonlyArray<readonly [x: number, y: number, z: number, sx: number, sy: number, sz: number]> = [
    [-86, -0.3, -55, 14, 2.6, 7],
    [-70, -0.5, -48, 8, 1.8, 5],
    [85, -0.4, 20, 12, 2.2, 6],
    [96, -0.55, 28, 7, 1.5, 4],
  ];
  const geometries = placements.map(([x, y, z, sx, sy, sz]) => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    ));
    return geometry;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error('Could not build distant naval islands');
  const islands = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: '#315f52', roughness: 1, flatShading: true }),
  );
  islands.receiveShadow = true;
  return islands;
}

function waterMaterial(uniforms: { uTime: { value: number } }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime;
      varying float vWave;
      varying vec2 vWaterUv;
      void main() {
        vec3 p = position;
        float a = sin(p.x * .075 + uTime * .9) * .24;
        float b = sin(p.y * .11 - uTime * .72 + p.x * .025) * .16;
        p.z += a + b;
        vWave = a + b;
        vWaterUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying float vWave;
      varying vec2 vWaterUv;
      void main() {
        vec3 deep = vec3(.018, .20, .28);
        vec3 light = vec3(.09, .48, .52);
        float glint = smoothstep(.22, .39, vWave) * .32;
        float bands = sin((vWaterUv.x + vWaterUv.y) * 170.0) * .012;
        gl_FragColor = vec4(mix(deep, light, .35 + vWave * .35 + glint + bands), 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

function collectMaterials(model: THREE.Group): ShipVisual['materials'] {
  const result: ShipVisual['materials'] = [];
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      result.push({
        material,
        baseColor: material.color.clone(),
        role: material.name === 'Sunlit Sail' ? 'sail' : 'other',
      });
    }
  });
  return result;
}

function damageSeverity(state: NavalShipState, role: 'sail' | 'other'): number {
  const health = role === 'sail' ? state.sails : state.hull;
  return THREE.MathUtils.clamp(1 - health / 100, 0, 1);
}

function hasDamage(damage: Damage): boolean {
  return damage.hull + damage.sails + damage.crew + damage.cannon > 0;
}

export class NavalScene implements NavalSceneAdapter {
  readonly #container: HTMLElement;
  readonly #options: NavalSceneOptions;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera: THREE.PerspectiveCamera;
  readonly #quality: QualityController;
  readonly #sun: THREE.DirectionalLight;
  readonly #waterUniforms = { uTime: { value: 0 } };
  readonly #ships = {} as Record<NavalShipId, ShipVisual>;
  readonly #seenEventIds = new Set<number>();
  readonly #cameraPosition = new THREE.Vector3(0, 31, 42);
  readonly #cameraTarget = new THREE.Vector3();
  readonly #cameraDesired = new THREE.Vector3(0, 31, 42);
  readonly #wakeMatrices = new THREE.InstancedMesh(
    wakeGeometry(),
    new THREE.MeshBasicMaterial({
      color: '#ddfff3',
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      wireframe: true,
    }),
    2,
  );
  readonly #selectionRings = new THREE.InstancedMesh(
    new THREE.RingGeometry(4.52, 4.72, 48),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    2,
  );
  readonly #windLines = new THREE.InstancedMesh(
    new THREE.BoxGeometry(5.5, 0.025, 0.085),
    new THREE.MeshBasicMaterial({
      color: '#c8fff0',
      transparent: true,
      opacity: 0.38,
    }),
    42,
  );
  readonly #bearingLine = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0.08, 0, 0, 0.08, 0], 3),
    ),
    new THREE.LineDashedMaterial({
      color: '#c79a45',
      dashSize: 1.2,
      gapSize: 0.9,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  #effects: EffectPool;
  #resizeObserver: ResizeObserver | null = null;
  #time = 0;
  #frameCount = 0;
  #fpsElapsed = 0;
  #fps = 60;
  #disposed = false;
  #contextLost = false;
  #windFrom: number | null = null;

  private constructor(container: HTMLElement, options: NavalSceneOptions) {
    this.#container = container;
    this.#options = options;
    this.#quality = new QualityController(options.initialTier);
    this.#renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.08;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.domElement.className = 'naval-scene-canvas';
    this.#renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.#renderer.domElement);

    this.#camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
    this.#camera.position.copy(this.#cameraPosition);
    this.#scene.background = canvasSky();
    this.#scene.fog = new THREE.Fog('#75aeb0', 90, 235);
    this.#sun = this.#buildWorld();
    this.#effects = new EffectPool(
      this.#scene,
      qualitySettings(options.initialTier, this.#deviceDpr()).effectCapacity,
      options.reducedMotion,
    );
    this.#applyQuality();
    this.#resize();

    this.#selectionRings.setColorAt(0, new THREE.Color(PLAYER_COLOR));
    this.#selectionRings.setColorAt(1, new THREE.Color(OPPONENT_COLOR));
    this.#selectionRings.instanceColor!.needsUpdate = true;
    this.#renderer.domElement.addEventListener('webglcontextlost', this.#onContextLost);
    this.#renderer.domElement.addEventListener('webglcontextrestored', this.#onContextRestored);
    window.addEventListener('resize', this.#resize);
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(this.#resize);
      this.#resizeObserver.observe(container);
    }
  }

  static async create(container: HTMLElement, options: NavalSceneOptions): Promise<NavalScene> {
    const naval = new NavalScene(container, options);
    try {
      const [playerModel, opponentModel] = await Promise.all([
        createSloop(PLAYER_COLOR),
        createSloop(OPPONENT_COLOR),
      ]);
      naval.#ships.player = naval.#addShip(playerModel);
      naval.#ships.opponent = naval.#addShip(opponentModel);
      return naval;
    } catch (error) {
      naval.dispose();
      throw error;
    }
  }

  #buildWorld(): THREE.DirectionalLight {
    this.#scene.add(new THREE.HemisphereLight('#d9f6ff', '#12323c', 1.55));
    const sun = new THREE.DirectionalLight('#fff0c9', 3);
    sun.position.set(-45, 80, 35);
    sun.shadow.camera.left = -65;
    sun.shadow.camera.right = 65;
    sun.shadow.camera.top = 65;
    sun.shadow.camera.bottom = -65;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0005;
    this.#scene.add(sun);
    const rim = new THREE.DirectionalLight('#66d9dc', 1.1);
    rim.position.set(55, 24, -40);
    this.#scene.add(rim);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420, 32, 32),
      waterMaterial(this.#waterUniforms),
    );
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    this.#scene.add(water, islandSilhouettes());

    this.#updateWindLines(0);
    this.#bearingLine.name = 'Live_Bearing_Line';
    this.#bearingLine.computeLineDistances();
    this.#scene.add(this.#windLines, this.#wakeMatrices, this.#selectionRings, this.#bearingLine);
    return sun;
  }

  #updateWindLines(windFrom: number): void {
    if (this.#windFrom === windFrom) return;
    this.#windFrom = windFrom;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 42; index += 1) {
      const row = Math.floor(index / 7);
      const column = index % 7;
      dummy.position.set(-72 + column * 24 + (row % 2) * 6, 0.18, -70 + row * 25);
      dummy.rotation.y = windFrom - Math.PI / 2;
      dummy.scale.x = 0.45 + ((index * 37) % 10) / 18;
      dummy.updateMatrix();
      this.#windLines.setMatrixAt(index, dummy.matrix);
    }
    this.#windLines.instanceMatrix.needsUpdate = true;
  }

  #addShip(model: THREE.Group): ShipVisual {
    const root = new THREE.Group();
    root.add(model);
    this.#scene.add(root);
    return {
      root,
      model,
      modelRest: model.position.clone(),
      materials: collectMaterials(model),
      state: null,
      recoil: 0,
      recoilX: 0,
      recoilZ: 0,
    };
  }

  sync(state: NavalState, events: readonly NavalEvent[]): void {
    if (this.#disposed) return;
    for (const shipId of SHIP_IDS) {
      const canonical = state.ships[shipId];
      const visual = this.#ships[shipId];
      if (!visual) continue;
      visual.state = canonical;
      visual.root.position.x = canonical.position.x;
      visual.root.position.z = canonical.position.z;
      visual.root.rotation.y = canonical.heading;
      for (const entry of visual.materials) {
        const severity = damageSeverity(canonical, entry.role);
        entry.material.color.copy(entry.baseColor).lerp(new THREE.Color('#382d2a'), severity * 0.52);
        entry.material.emissive.set('#42130d');
        entry.material.emissiveIntensity = severity * 0.24;
      }
    }
    this.#updateWindLines(state.input.windFrom);
    const bearingPositions = this.#bearingLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    bearingPositions.setXYZ(0, state.ships.player.position.x, 0.08, state.ships.player.position.z);
    bearingPositions.setXYZ(1, state.ships.opponent.position.x, 0.08, state.ships.opponent.position.z);
    bearingPositions.needsUpdate = true;
    this.#bearingLine.computeLineDistances();

    for (const event of events) {
      if (this.#seenEventIds.has(event.id)) continue;
      this.#seenEventIds.add(event.id);
      this.#emitEvent(event, state);
    }
    if (this.#seenEventIds.size > 512) {
      const newest = [...this.#seenEventIds].sort((left, right) => right - left).slice(0, 256);
      this.#seenEventIds.clear();
      newest.forEach((id) => this.#seenEventIds.add(id));
    }

    const player = state.ships.player;
    const opponent = state.ships.opponent;
    const centerX = (player.position.x + opponent.position.x) * 0.5;
    const centerZ = (player.position.z + opponent.position.z) * 0.5;
    const separation = Math.hypot(
      player.position.x - opponent.position.x,
      player.position.z - opponent.position.z,
    );
    if (this.#camera.aspect < 1) {
      const phone = this.#camera.aspect < 0.62;
      this.#cameraDesired.set(centerX, phone ? 66 : 58, centerZ + (phone ? 15 : 13));
      this.#cameraTarget.set(centerX, 1.3, centerZ);
    } else {
      const forwardX = Math.sin(player.heading);
      const forwardZ = Math.cos(player.heading);
      const height = THREE.MathUtils.clamp(25 + separation * 0.11, 28, 39);
      this.#cameraDesired.set(
        centerX - forwardX * 28 + 11 * Math.cos(player.heading),
        height,
        centerZ - forwardZ * 28 - 11 * Math.sin(player.heading),
      );
      this.#cameraTarget.set(centerX, 1.6, centerZ);
    }
  }

  #emitEvent(event: NavalEvent, state: NavalState): void {
    if (event.kind === 'volley') {
      const ship = state.ships[event.shipId];
      const target = state.ships[event.targetShipId];
      const side = broadsideVector(ship.heading, event.result.side);
      const originX = ship.position.x + side.x * 3.1;
      const originZ = ship.position.z + side.z * 3.1;
      const firingVisual = this.#ships[event.shipId];
      if (firingVisual && !this.#options.reducedMotion) {
        firingVisual.recoil = 1;
        firingVisual.recoilX = -side.x;
        firingVisual.recoilZ = -side.z;
      }
      this.#effects.spawn('flash', originX, 1.25, originZ);
      for (let index = 0; index < 3; index += 1) {
        this.#effects.spawn('smoke', originX + side.x * index * 0.28, 1.15, originZ + side.z * index * 0.28, {
          velocityX: side.x * (0.45 + index * 0.1),
          velocityY: 0.75 + index * 0.08,
          velocityZ: side.z * (0.45 + index * 0.1),
        });
      }
      const targetX = target.position.x - ship.position.x;
      const targetZ = target.position.z - ship.position.z;
      const distance = Math.max(1, Math.hypot(targetX, targetZ));
      const lateralX = targetZ / distance;
      const lateralZ = -targetX / distance;
      for (const sample of event.result.samples) {
        if (sample.hit) continue;
        const spread = sample.normalizedSpread * Math.min(8, distance * 0.16);
        this.#effects.spawn(
          'splash',
          target.position.x + lateralX * spread,
          0.12,
          target.position.z + lateralZ * spread,
        );
      }
      return;
    }

    if (event.kind === 'damage' && hasDamage(event.damage)) {
      const ship = state.ships[event.shipId];
      if (event.damage.hull > 0) {
        this.#effects.spawn('smoke', ship.position.x, 1.4, ship.position.z, { life: 2.2 });
      }
      const debrisCount = Math.min(4, event.damage.cannon + Math.ceil(event.damage.sails / 6));
      for (let index = 0; index < debrisCount; index += 1) {
        const direction = index % 2 === 0 ? 1 : -1;
        this.#effects.spawn('debris', ship.position.x, 1.5 + index * 0.18, ship.position.z, {
          velocityX: direction * (0.7 + index * 0.13),
          velocityY: 1.1 + index * 0.12,
          velocityZ: (index - 1.5) * 0.28,
        });
      }
    }
  }

  render(frameSeconds: number): void {
    if (this.#disposed) return;
    if (this.#contextLost) throw new Error('Naval WebGL context lost');
    const elapsed = Math.min(0.1, Math.max(0, frameSeconds));
    this.#time += elapsed;
    this.#waterUniforms.uTime.value = this.#time;
    this.#effects.update(elapsed);

    const dummy = new THREE.Object3D();
    SHIP_IDS.forEach((shipId, index) => {
      const visual = this.#ships[shipId];
      const state = visual?.state;
      if (!visual || !state) return;
      const phase = shipId === 'opponent' ? 1.7 : 0;
      visual.root.position.y = this.#options.reducedMotion ? 0 : Math.sin(this.#time * 1.15 + phase) * 0.14;
      visual.root.rotation.x = this.#options.reducedMotion ? 0 : Math.sin(this.#time * 0.72 + 0.8 + phase) * 0.022;
      visual.root.rotation.z = this.#options.reducedMotion
        ? 0
        : -state.rudder * Math.min(0.09, state.speed * 0.018) + Math.sin(this.#time * 0.9 + phase) * 0.012;
      visual.recoil = Math.max(0, visual.recoil - elapsed * 4.8);
      visual.model.position.x = visual.modelRest.x + visual.recoilX * visual.recoil * 0.32;
      visual.model.position.y = visual.modelRest.y;
      visual.model.position.z = visual.modelRest.z + visual.recoilZ * visual.recoil * 0.32;

      this.#wakeMatrices.setMatrixAt(
        index,
        composeWakeMatrix(state.position, state.heading, state.speed),
      );

      dummy.position.set(state.position.x, 0.14, state.position.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(shipId === 'player' ? 1.05 : 0.92);
      dummy.updateMatrix();
      this.#selectionRings.setMatrixAt(index, dummy.matrix);
    });
    this.#wakeMatrices.instanceMatrix.needsUpdate = true;
    this.#selectionRings.instanceMatrix.needsUpdate = true;

    const damping = this.#options.reducedMotion ? 1 : 1 - Math.exp(-elapsed * 2.8);
    this.#cameraPosition.lerp(this.#cameraDesired, damping);
    this.#camera.position.copy(this.#cameraPosition);
    this.#camera.lookAt(this.#cameraTarget);
    this.#renderer.render(this.#scene, this.#camera);

    this.#frameCount += 1;
    this.#fpsElapsed += elapsed;
    if (this.#fpsElapsed >= 1) {
      this.#fps = Math.round(this.#frameCount / this.#fpsElapsed);
      const changed = this.#quality.sample(this.#fps, this.#fpsElapsed);
      this.#frameCount = 0;
      this.#fpsElapsed = 0;
      if (changed) this.#applyQuality();
    }
  }

  metrics(): NavalSceneMetrics {
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    this.#scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.name === 'NavalEffectPoolEntry') return;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (!mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((material) => materials.add(material));
    });
    const effects = this.#effects.metrics();
    return {
      fps: this.#fps,
      dpr: this.#renderer.getPixelRatio(),
      tier: this.#quality.tier,
      drawCalls: this.#renderer.info.render.calls,
      triangles: this.#renderer.info.render.triangles,
      textures: this.#renderer.info.memory.textures,
      geometries: geometries.size + effects.resources.geometries,
      materials: materials.size + effects.resources.materials,
      activeEffects: effects.active,
      effectCapacity: effects.capacity,
    };
  }

  #deviceDpr(): number {
    return typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  }

  #applyQuality(): void {
    const settings = qualitySettings(this.#quality.tier, this.#deviceDpr());
    this.#renderer.setPixelRatio(settings.dpr);
    this.#renderer.shadowMap.enabled = settings.shadows;
    this.#sun.castShadow = settings.shadows;
    if (settings.shadows) this.#sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    if (this.#effects && this.#effects.metrics().capacity !== settings.effectCapacity) {
      this.#effects.dispose();
      this.#effects = new EffectPool(this.#scene, settings.effectCapacity, this.#options.reducedMotion);
    }
    this.#resize();
  }

  #resize = (): void => {
    if (this.#disposed) return;
    const width = Math.max(1, this.#container.clientWidth || 960);
    const height = Math.max(1, this.#container.clientHeight || 540);
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.fov = this.#camera.aspect < 0.62 ? 62 : this.#camera.aspect < 1 ? 55 : 48;
    this.#camera.updateProjectionMatrix();
  };

  #onContextLost = (event: Event): void => {
    event.preventDefault();
    this.#contextLost = true;
  };

  #onContextRestored = (): void => {
    this.#contextLost = false;
    this.#renderer.resetState();
    this.#applyQuality();
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    window.removeEventListener('resize', this.#resize);
    this.#renderer.domElement.removeEventListener('webglcontextlost', this.#onContextLost);
    this.#renderer.domElement.removeEventListener('webglcontextrestored', this.#onContextRestored);
    this.#effects.dispose();
    if (this.#scene.background instanceof THREE.Texture) this.#scene.background.dispose();
    disposeDeep(this.#scene);
    this.#renderer.renderLists.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    this.#renderer.domElement.remove();
  }
}
