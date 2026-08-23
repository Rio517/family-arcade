import * as THREE from 'three';

import type { Damage } from '../../domain/naval/types';

export type EffectKind = 'flash' | 'smoke' | 'splash' | 'debris' | 'rig';

export interface EffectSpawnOptions {
  life?: number;
  scale?: number;
  velocityX?: number;
  velocityY?: number;
  velocityZ?: number;
}

export interface EffectCue {
  kind: EffectKind;
  readonly position: THREE.Vector3;
  scale: number;
  rotation: number;
  active: boolean;
}

export interface EffectPoolMetrics {
  active: number;
  activeByKind: Record<EffectKind, number>;
  capacity: number;
  resources: { meshes: number; geometries: number; materials: number };
}

interface EffectEntry extends EffectCue {
  age: number;
  life: number;
  baseScale: number;
  started: number;
  readonly velocity: THREE.Vector3;
}

const EFFECT_KINDS: readonly EffectKind[] = ['flash', 'smoke', 'splash', 'debris', 'rig'];
const DEFAULTS: Record<EffectKind, Required<EffectSpawnOptions>> = {
  flash: { life: 0.18, scale: 0.9, velocityX: 0, velocityY: 0.1, velocityZ: 0 },
  smoke: { life: 1.8, scale: 0.48, velocityX: 0, velocityY: 0.9, velocityZ: 0 },
  splash: { life: 1.05, scale: 0.32, velocityX: 0, velocityY: 1.7, velocityZ: 0 },
  debris: { life: 1.4, scale: 0.22, velocityX: 0, velocityY: 1.1, velocityZ: 0 },
  rig: { life: 1.1, scale: 0.72, velocityX: 0, velocityY: 0.25, velocityZ: 0 },
};

export function damageEffectKinds(damage: Damage): EffectKind[] {
  const effects: EffectKind[] = [];
  if (damage.hull > 0) effects.push('smoke');
  if (damage.sails > 0) effects.push('rig');
  const debrisCount = Math.min(4, damage.cannon + Math.ceil(damage.sails / 6));
  for (let index = 0; index < debrisCount; index += 1) effects.push('debris');
  return effects;
}

export class EffectPool {
  readonly #scene: THREE.Scene;
  readonly #capacity: number;
  readonly #reducedMotion: boolean;
  readonly #geometries: Record<EffectKind, THREE.BufferGeometry>;
  readonly #materials: Record<EffectKind, THREE.MeshBasicMaterial>;
  readonly #batches: Record<EffectKind, THREE.InstancedMesh>;
  readonly #entries: EffectEntry[];
  readonly #matrix = new THREE.Matrix4();
  readonly #quaternion = new THREE.Quaternion();
  readonly #scale = new THREE.Vector3();
  readonly #rotationAxis = new THREE.Vector3(0, 1, 0);
  #serial = 0;
  #disposed = false;

  constructor(scene: THREE.Scene, capacity: number, reducedMotion: boolean) {
    this.#scene = scene;
    this.#capacity = Math.max(1, Math.floor(capacity));
    this.#reducedMotion = reducedMotion;
    this.#geometries = {
      flash: new THREE.OctahedronGeometry(1, 0),
      smoke: new THREE.IcosahedronGeometry(1, 1),
      splash: new THREE.ConeGeometry(0.45, 1.8, 5, 1, true),
      debris: new THREE.TetrahedronGeometry(1, 0),
      rig: new THREE.TorusGeometry(0.7, 0.12, 4, 12, Math.PI * 1.4),
    };
    this.#materials = {
      flash: new THREE.MeshBasicMaterial({ color: '#fff2ad', transparent: true, opacity: 0.94, depthWrite: false }),
      smoke: new THREE.MeshBasicMaterial({ color: '#d8d5ca', transparent: true, opacity: 0.48, depthWrite: false }),
      splash: new THREE.MeshBasicMaterial({ color: '#d5fff5', transparent: true, opacity: 0.68, depthWrite: false }),
      debris: new THREE.MeshBasicMaterial({ color: '#6b4027', transparent: true, opacity: 0.86, depthWrite: false }),
      rig: new THREE.MeshBasicMaterial({ color: '#d8bd83', transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide }),
    };
    const batches = {} as Record<EffectKind, THREE.InstancedMesh>;
    for (const kind of EFFECT_KINDS) {
      const mesh = new THREE.InstancedMesh(this.#geometries[kind], this.#materials[kind], this.#capacity);
      mesh.name = `NavalEffectBatch_${kind}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.#scene.add(mesh);
      batches[kind] = mesh;
    }
    this.#batches = batches;
    this.#entries = Array.from({ length: this.#capacity }, () => ({
      kind: 'flash',
      position: new THREE.Vector3(),
      scale: 1,
      rotation: 0,
      active: false,
      age: 0,
      life: 0,
      baseScale: 1,
      started: -1,
      velocity: new THREE.Vector3(),
    }));
  }

  spawn(kind: EffectKind, x: number, y: number, z: number, options: EffectSpawnOptions = {}): EffectCue {
    if (this.#disposed) throw new Error('Cannot spawn into a disposed effect pool');
    const entry = (this.#reducedMotion ? this.#entries.find((candidate) => candidate.active && candidate.kind === kind) : undefined)
      ?? this.#entries.find((candidate) => !candidate.active)
      ?? this.#entries.reduce((oldest, candidate) => candidate.started < oldest.started ? candidate : oldest);
    const defaults = DEFAULTS[kind];
    entry.kind = kind;
    entry.position.set(x, y, z);
    entry.baseScale = options.scale ?? defaults.scale;
    entry.scale = entry.baseScale;
    entry.rotation = 0;
    entry.active = true;
    entry.age = 0;
    entry.life = this.#reducedMotion ? Math.max(0.8, Math.min(options.life ?? defaults.life, 1.4)) : options.life ?? defaults.life;
    entry.started = this.#serial;
    this.#serial += 1;
    entry.velocity.set(
      options.velocityX ?? defaults.velocityX,
      options.velocityY ?? defaults.velocityY,
      options.velocityZ ?? defaults.velocityZ,
    );
    return entry;
  }

  update(frameSeconds: number): void {
    if (this.#disposed) return;
    const elapsed = Math.max(0, frameSeconds);
    for (const entry of this.#entries) {
      if (!entry.active) continue;
      entry.age += elapsed;
      if (entry.age >= entry.life) {
        entry.active = false;
        continue;
      }
      if (!this.#reducedMotion) {
        entry.position.addScaledVector(entry.velocity, elapsed);
        entry.scale = entry.baseScale * (1 + entry.age / entry.life * 1.8);
        entry.rotation += elapsed * 1.7;
      }
    }
    this.#writeInstances();
  }

  metrics(): EffectPoolMetrics {
    const activeByKind = { flash: 0, smoke: 0, splash: 0, debris: 0, rig: 0 };
    let active = 0;
    for (const entry of this.#entries) {
      if (!entry.active) continue;
      active += 1;
      activeByKind[entry.kind] += 1;
    }
    return {
      active,
      activeByKind,
      capacity: this.#capacity,
      resources: { meshes: 5, geometries: 5, materials: 5 },
    };
  }

  #writeInstances(): void {
    for (const kind of EFFECT_KINDS) {
      const batch = this.#batches[kind];
      let instance = 0;
      for (const entry of this.#entries) {
        if (!entry.active || entry.kind !== kind) continue;
        this.#quaternion.setFromAxisAngle(this.#rotationAxis, entry.rotation);
        this.#scale.setScalar(entry.scale);
        this.#matrix.compose(entry.position, this.#quaternion, this.#scale);
        batch.setMatrixAt(instance, this.#matrix);
        instance += 1;
      }
      batch.count = instance;
      batch.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    Object.values(this.#batches).forEach((batch) => batch.removeFromParent());
    Object.values(this.#geometries).forEach((geometry) => geometry.dispose());
    Object.values(this.#materials).forEach((material) => material.dispose());
  }
}
