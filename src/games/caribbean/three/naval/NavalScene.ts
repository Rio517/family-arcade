import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeDeep } from '@shared/three/disposeDeep';

import type {
  NavalSceneAdapter,
  NavalSceneMetrics,
  NavalSceneOptions,
  NavalSensorySettings,
} from '../../components/battle/NavalViewport';
import { broadsideMuzzleOrigin, broadsideVector } from '../../domain/naval/geometry';
import type {
  Damage,
  NavalEvent,
  NavalShipId,
  NavalShipState,
  NavalState,
} from '../../domain/naval/types';
import { createSloop } from '../shared/loadSloop';
import { damageEffectKinds, EffectPool } from './effects';
import {
  QualityController,
  qualitySettings,
} from './quality';
import {
  assertDrawCallBudget,
  composeWakeMatrix,
  decayCameraShake,
  fitEngagementCamera,
  settleShipRecoilForReducedMotion,
  writeCameraShake,
  writeShipRecoil,
  type EngagementCameraFit,
  type EngagementCameraInput,
} from './sceneMath';

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
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera: THREE.PerspectiveCamera;
  readonly #quality: QualityController;
  readonly #sun: THREE.DirectionalLight;
  readonly #waterUniforms = { uTime: { value: 0 } };
  readonly #ships = {} as Record<NavalShipId, ShipVisual>;
  readonly #cameraPosition = new THREE.Vector3(0, 31, 42);
  readonly #cameraTarget = new THREE.Vector3();
  readonly #cameraDesired = new THREE.Vector3(0, 31, 42);
  readonly #cameraRenderPosition = new THREE.Vector3(0, 31, 42);
  readonly #cameraRenderTarget = new THREE.Vector3();
  readonly #damageTint = new THREE.Color('#382d2a');
  readonly #renderDummy = new THREE.Object3D();
  readonly #wakeMatrix = new THREE.Matrix4();
  readonly #cameraFit: EngagementCameraFit = {
    position: { x: 0, y: 31, z: 42 },
    target: { x: 0, y: 1.5, z: 0 },
    fov: 48,
  };
  readonly #cameraInput: EngagementCameraInput = {
    player: { x: 0, z: -36 },
    opponent: { x: 0, z: 36 },
    playerHeading: 0,
    width: 960,
    height: 540,
    shipRadius: 6,
    safeFraction: 0.84,
  };
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
  readonly #aimArc = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(39).fill(0), 3)),
    new THREE.LineBasicMaterial({ color: '#d7b565', transparent: true, opacity: 0.82, depthWrite: false }),
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
  #viewportWidth = 960;
  #viewportHeight = 540;
  #hasCameraFit = false;
  #latestState: NavalState | null = null;
  #cameraShake = 0;
  #sensory: NavalSensorySettings;

  private constructor(container: HTMLElement, options: NavalSceneOptions) {
    this.#container = container;
    this.#sensory = { reducedMotion: options.reducedMotion, cameraShake: true, reducedFlashes: false, aimCue: null };
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
    this.#aimArc.frustumCulled = false;
    this.#scene.add(this.#windLines, this.#wakeMatrices, this.#selectionRings, this.#bearingLine, this.#aimArc);
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
    this.#latestState = state;
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
        entry.material.color.copy(entry.baseColor).lerp(this.#damageTint, severity * 0.52);
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
    this.#updateAimArc(state);

    for (const event of events) this.#emitEvent(event, state);
    this.#fitCamera(state.ships.player, state.ships.opponent);
  }

  syncSensorySettings(settings: NavalSensorySettings): void {
    if (this.#disposed) return;
    const changedMotion = this.#sensory.reducedMotion !== settings.reducedMotion;
    this.#sensory = settings;
    if (settings.reducedMotion || !settings.cameraShake) this.#cameraShake = 0;
    if (settings.reducedMotion) {
      for (const shipId of SHIP_IDS) {
        const visual = this.#ships[shipId];
        if (!visual) continue;
        visual.recoil = settleShipRecoilForReducedMotion(
          true,
          visual.recoil,
          visual.modelRest,
          visual.model.position,
        );
      }
    }
    if (this.#latestState) this.#updateAimArc(this.#latestState);
    if (changedMotion) {
      const capacity = qualitySettings(this.#quality.tier, this.#deviceDpr()).effectCapacity;
      this.#effects.dispose();
      this.#effects = new EffectPool(this.#scene, capacity, settings.reducedMotion);
    }
  }

  #updateAimArc(state: NavalState): void {
    const cue = this.#sensory.aimCue;
    this.#aimArc.visible = Boolean(cue?.side);
    if (!cue?.side) return;
    const ship = state.ships.player;
    const lateral = broadsideVector(ship.heading, cue.side);
    const forwardX = Math.sin(ship.heading);
    const forwardZ = Math.cos(ship.heading);
    const position = this.#aimArc.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < 13; index += 1) {
      const bend = (index / 12 - 0.5) * 1.15;
      const x = ship.position.x + (lateral.x * Math.cos(bend) + forwardX * Math.sin(bend)) * 9;
      const z = ship.position.z + (lateral.z * Math.cos(bend) + forwardZ * Math.sin(bend)) * 9;
      position.setXYZ(index, x, 0.24, z);
    }
    position.needsUpdate = true;
  }

  #emitEvent(event: NavalEvent, state: NavalState): void {
    if (event.kind === 'volley') {
      const ship = state.ships[event.shipId];
      const target = state.ships[event.targetShipId];
      const side = broadsideVector(ship.heading, event.result.side);
      const muzzleOrigin = broadsideMuzzleOrigin(ship.position, ship.heading, event.result.side);
      const originX = muzzleOrigin.x;
      const originZ = muzzleOrigin.z;
      const firingVisual = this.#ships[event.shipId];
      if (firingVisual && !this.#sensory.reducedMotion) {
        firingVisual.recoil = 1;
        firingVisual.recoilX = -side.x;
        firingVisual.recoilZ = -side.z;
      }
      if (!this.#sensory.reducedMotion && this.#sensory.cameraShake) this.#cameraShake = 1;
      if (!this.#sensory.reducedFlashes) this.#effects.spawn('flash', originX, 1.25, originZ);
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
      let debrisIndex = 0;
      for (const kind of damageEffectKinds(event.damage)) {
        if (kind === 'smoke') {
          this.#effects.spawn(kind, ship.position.x, 1.4, ship.position.z, { life: 2.2 });
        } else if (kind === 'rig') {
          this.#effects.spawn(kind, ship.position.x, 3.5, ship.position.z, { life: 1.3 });
        } else {
          const direction = debrisIndex % 2 === 0 ? 1 : -1;
          this.#effects.spawn(kind, ship.position.x, 1.5 + debrisIndex * 0.18, ship.position.z, {
            velocityX: direction * (0.7 + debrisIndex * 0.13),
            velocityY: 1.1 + debrisIndex * 0.12,
            velocityZ: (debrisIndex - 1.5) * 0.28,
          });
          debrisIndex += 1;
        }
      }
    }
  }

  render(frameSeconds: number, wallSeconds = frameSeconds): void {
    if (this.#disposed) return;
    if (this.#contextLost) throw new Error('Naval WebGL context lost');
    const elapsed = Math.min(0.1, Math.max(0, frameSeconds));
    this.#time += elapsed;
    this.#waterUniforms.uTime.value = this.#time;
    this.#effects.update(elapsed);

    for (let index = 0; index < SHIP_IDS.length; index += 1) {
      const shipId = SHIP_IDS[index];
      const visual = this.#ships[shipId];
      const state = visual?.state;
      if (!visual || !state) continue;
      const phase = shipId === 'opponent' ? 1.7 : 0;
      visual.root.position.y = this.#sensory.reducedMotion ? 0 : Math.sin(this.#time * 1.15 + phase) * 0.14;
      visual.root.rotation.x = this.#sensory.reducedMotion ? 0 : Math.sin(this.#time * 0.72 + 0.8 + phase) * 0.022;
      visual.root.rotation.z = this.#sensory.reducedMotion
        ? 0
        : -state.rudder * Math.min(0.09, state.speed * 0.018) + Math.sin(this.#time * 0.9 + phase) * 0.012;
      visual.recoil = Math.max(0, visual.recoil - elapsed * 4.8);
      writeShipRecoil(visual.modelRest, visual.recoilX, visual.recoilZ, visual.recoil, visual.model.position);

      this.#wakeMatrices.setMatrixAt(
        index,
        composeWakeMatrix(state.position, state.heading, state.speed, this.#wakeMatrix),
      );

      this.#renderDummy.position.set(state.position.x, 0.14, state.position.z);
      this.#renderDummy.rotation.set(-Math.PI / 2, 0, 0);
      this.#renderDummy.scale.setScalar(shipId === 'player' ? 1.05 : 0.92);
      this.#renderDummy.updateMatrix();
      this.#selectionRings.setMatrixAt(index, this.#renderDummy.matrix);
    }
    this.#wakeMatrices.instanceMatrix.needsUpdate = true;
    this.#selectionRings.instanceMatrix.needsUpdate = true;

    const damping = this.#sensory.reducedMotion ? 1 : 1 - Math.exp(-elapsed * 2.8);
    this.#cameraPosition.lerp(this.#cameraDesired, damping);
    this.#cameraShake = decayCameraShake(
      this.#cameraShake,
      elapsed,
      this.#sensory.cameraShake && !this.#sensory.reducedMotion,
    );
    writeCameraShake(
      this.#cameraPosition,
      this.#cameraTarget,
      this.#time,
      this.#cameraShake,
      this.#cameraRenderPosition,
      this.#cameraRenderTarget,
    );
    this.#camera.position.copy(this.#cameraRenderPosition);
    this.#camera.lookAt(this.#cameraRenderTarget);
    this.#renderer.render(this.#scene, this.#camera);
    assertDrawCallBudget(this.#renderer.info.render.calls);

    this.#frameCount += 1;
    this.#fpsElapsed += Number.isFinite(wallSeconds) ? Math.max(0, wallSeconds) : 0;
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
      if (mesh.name.startsWith('NavalEffectBatch_')) return;
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
      this.#effects = new EffectPool(this.#scene, settings.effectCapacity, this.#sensory.reducedMotion);
    }
    this.#resize();
  }

  #fitCamera(player: NavalShipState, opponent: NavalShipState): void {
    this.#cameraInput.player.x = player.position.x;
    this.#cameraInput.player.z = player.position.z;
    this.#cameraInput.opponent.x = opponent.position.x;
    this.#cameraInput.opponent.z = opponent.position.z;
    this.#cameraInput.playerHeading = player.heading;
    this.#cameraInput.width = this.#viewportWidth;
    this.#cameraInput.height = this.#viewportHeight;
    const fitted = fitEngagementCamera(this.#cameraInput, this.#cameraFit);
    this.#cameraDesired.set(fitted.position.x, fitted.position.y, fitted.position.z);
    this.#cameraTarget.set(fitted.target.x, fitted.target.y, fitted.target.z);
    this.#camera.fov = fitted.fov;
    this.#camera.updateProjectionMatrix();
    if (!this.#hasCameraFit || this.#sensory.reducedMotion) {
      this.#cameraPosition.copy(this.#cameraDesired);
      this.#hasCameraFit = true;
    }
  }

  #resize = (): void => {
    if (this.#disposed) return;
    const width = Math.max(1, this.#container.clientWidth || 960);
    const height = Math.max(1, this.#container.clientHeight || 540);
    this.#viewportWidth = width;
    this.#viewportHeight = height;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    const player = this.#ships.player?.state;
    const opponent = this.#ships.opponent?.state;
    if (player && opponent) this.#fitCamera(player, opponent);
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
