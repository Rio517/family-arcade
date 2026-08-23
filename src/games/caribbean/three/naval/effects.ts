import * as THREE from 'three';

export type EffectKind = 'flash' | 'smoke' | 'splash' | 'debris';

export interface EffectSpawnOptions {
  life?: number;
  scale?: number;
  velocityX?: number;
  velocityY?: number;
  velocityZ?: number;
}

export interface EffectPoolMetrics {
  active: number;
  capacity: number;
  resources: { meshes: number; geometries: number; materials: number };
}

interface EffectEntry {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  baseScale: number;
  started: number;
  velocity: THREE.Vector3;
}

const DEFAULTS: Record<EffectKind, Required<EffectSpawnOptions>> = {
  flash: { life: 0.18, scale: 0.9, velocityX: 0, velocityY: 0.1, velocityZ: 0 },
  smoke: { life: 1.8, scale: 0.48, velocityX: 0, velocityY: 0.9, velocityZ: 0 },
  splash: { life: 1.05, scale: 0.32, velocityX: 0, velocityY: 1.7, velocityZ: 0 },
  debris: { life: 1.4, scale: 0.22, velocityX: 0, velocityY: 1.1, velocityZ: 0 },
};

export class EffectPool {
  readonly #scene: THREE.Scene;
  readonly #capacity: number;
  readonly #reducedMotion: boolean;
  readonly #geometries: Record<EffectKind, THREE.BufferGeometry>;
  readonly #materials: Record<EffectKind, THREE.MeshBasicMaterial>;
  readonly #entries: EffectEntry[];
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
    };
    this.#materials = {
      flash: new THREE.MeshBasicMaterial({ color: '#fff2ad', transparent: true, opacity: 1, depthWrite: false }),
      smoke: new THREE.MeshBasicMaterial({ color: '#d8d5ca', transparent: true, opacity: 0.55, depthWrite: false }),
      splash: new THREE.MeshBasicMaterial({ color: '#d5fff5', transparent: true, opacity: 0.72, depthWrite: false }),
      debris: new THREE.MeshBasicMaterial({ color: '#6b4027', transparent: true, opacity: 0.9, depthWrite: false }),
    };
    this.#entries = Array.from({ length: this.#capacity }, () => {
      const mesh = new THREE.Mesh(this.#geometries.flash, this.#materials.flash);
      mesh.name = 'NavalEffectPoolEntry';
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.#scene.add(mesh);
      return {
        mesh,
        age: 0,
        life: 0,
        baseScale: 1,
        started: -1,
        velocity: new THREE.Vector3(),
      };
    });
  }

  spawn(
    kind: EffectKind,
    x: number,
    y: number,
    z: number,
    options: EffectSpawnOptions = {},
  ): THREE.Mesh {
    if (this.#disposed) throw new Error('Cannot spawn into a disposed effect pool');
    const entry = this.#entries.find(({ mesh }) => !mesh.visible)
      ?? this.#entries.reduce((oldest, candidate) => candidate.started < oldest.started ? candidate : oldest);
    const defaults = DEFAULTS[kind];
    const life = options.life ?? defaults.life;
    entry.mesh.geometry = this.#geometries[kind];
    entry.mesh.material = this.#materials[kind];
    entry.mesh.position.set(x, y, z);
    entry.mesh.rotation.set(0, 0, 0);
    entry.baseScale = options.scale ?? defaults.scale;
    entry.mesh.scale.setScalar(entry.baseScale);
    entry.mesh.visible = true;
    entry.age = 0;
    entry.life = this.#reducedMotion ? Math.min(life, 0.5) : life;
    entry.started = this.#serial;
    this.#serial += 1;
    entry.velocity.set(
      options.velocityX ?? defaults.velocityX,
      options.velocityY ?? defaults.velocityY,
      options.velocityZ ?? defaults.velocityZ,
    );
    return entry.mesh;
  }

  update(frameSeconds: number): void {
    if (this.#disposed) return;
    const elapsed = Math.max(0, frameSeconds);
    for (const entry of this.#entries) {
      if (!entry.mesh.visible) continue;
      entry.age += elapsed;
      if (entry.age >= entry.life) {
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.position.addScaledVector(entry.velocity, elapsed);
      const progress = entry.age / entry.life;
      entry.mesh.scale.setScalar(entry.baseScale * (1 + progress * 1.8));
      entry.mesh.rotation.y += elapsed * 1.7;
      (entry.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress) * 0.72;
    }
  }

  metrics(): EffectPoolMetrics {
    return {
      active: this.#entries.filter(({ mesh }) => mesh.visible).length,
      capacity: this.#capacity,
      resources: { meshes: this.#capacity, geometries: 4, materials: 4 },
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const entry of this.#entries) entry.mesh.removeFromParent();
    Object.values(this.#geometries).forEach((geometry) => geometry.dispose());
    Object.values(this.#materials).forEach((material) => material.dispose());
  }
}
