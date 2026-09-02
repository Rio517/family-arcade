/**
 * Dragon fire breath. Open your jaw (`jawOpen` blendshape past the ON
 * threshold) and a cone of additive fire particles pours out of the tracked
 * mouth. Under `prefers-reduced-motion` the particles are replaced by a
 * single static glow so nothing animates.
 */

import * as THREE from 'three';
import { createParticlePool, softDiscTexture, type ParticlePool } from './particles';

/** Hysteresis so the flame doesn't stutter while talking. */
const JAW_ON = 0.42;
const JAW_OFF = 0.28;

const FLAME_COLORS = [new THREE.Color(0xfff1a8), new THREE.Color(0xffa63e), new THREE.Color(0xff5f1f)];

export interface FireUpdate {
  /** Mouth anchor in canvas pixels (y up). */
  x: number;
  y: number;
  /** Horizontal lean of the spray, from head yaw (-1 … 1). */
  dirX: number;
  /** Face width in pixels — everything scales off it. */
  scalePx: number;
  jawOpen: number;
  dtS: number;
}

export class FireBreath {
  readonly group = new THREE.Group();
  private pool: ParticlePool;
  private glow: THREE.Sprite;
  private breathing = false;
  private spawnDebt = 0;

  constructor(
    private rng: () => number,
    private reducedMotion: boolean,
  ) {
    this.pool = createParticlePool(140, softDiscTexture());
    this.group.add(this.pool.points);
    // Blended normally rather than additively: a still glow needs no light
    // maths, and normal blending writes the alpha WebKit needs to keep the
    // colour where the mask isn't (see particles.ts).
    const glowMaterial = new THREE.SpriteMaterial({
      map: softDiscTexture(),
      color: 0xff8c2e,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
    });
    this.glow = new THREE.Sprite(glowMaterial);
    this.glow.visible = false;
    this.group.add(this.glow);
  }

  update(u: FireUpdate): void {
    this.breathing = u.jawOpen > (this.breathing ? JAW_OFF : JAW_ON);

    if (this.reducedMotion) {
      // No animation: a steady glow marks the fire while the mouth is open.
      this.glow.visible = this.breathing;
      this.glow.position.set(u.x, u.y - u.scalePx * 0.35, 5);
      this.glow.scale.setScalar(u.scalePx * 0.9);
      return;
    }

    if (this.breathing) {
      // ~110 particles/s; the debt accumulator keeps the rate frame-rate
      // independent.
      this.spawnDebt += u.dtS * 110;
      const speed = u.scalePx * 3.2;
      while (this.spawnDebt >= 1) {
        this.spawnDebt -= 1;
        const spread = (this.rng() - 0.5) * 0.9;
        const color = FLAME_COLORS[Math.floor(this.rng() * FLAME_COLORS.length)];
        this.pool.spawn(
          u.x + (this.rng() - 0.5) * u.scalePx * 0.1,
          u.y,
          5,
          (u.dirX * 0.8 + spread) * speed * 0.6,
          -speed * (0.7 + this.rng() * 0.5),
          color,
          0.45 + this.rng() * 0.3,
        );
      }
    } else {
      this.spawnDebt = 0;
    }

    this.pool.setSize(Math.min(56, Math.max(10, u.scalePx * 0.38)));
    // Buoyancy: flames decelerate downward, then drift back up as they die.
    this.pool.step(u.dtS, u.scalePx * 4.5, (c, lifeLeft) => c.multiplyScalar(lifeLeft * lifeLeft));
    this.pool.points.visible = !this.pool.idle();
  }

  dispose(): void {
    this.pool.dispose();
    this.glow.material.map?.dispose();
    this.glow.material.dispose();
  }
}
