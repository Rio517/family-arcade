/**
 * Peace-sign magic. Flash a ✌ (MediaPipe's `Victory` gesture) and a burst of
 * rainbow stars erupts from your hand — repeating gently while you hold it.
 * Under `prefers-reduced-motion` the burst becomes a still ring of stars.
 */

import * as THREE from 'three';
import { createParticlePool, starTexture, type ParticlePool } from './particles';
import type { TrackedHand } from '../engine/types';

/** The house rainbow — matches the arcade's bulb-string palette. */
const RAINBOW = [0xff5e5b, 0xff9f1c, 0xffe066, 0x7ae582, 0x4ea8de, 0xb388eb].map(
  (c) => new THREE.Color(c),
);

const BURST_EVERY_S = 0.7;
const STARS_PER_BURST = 18;
const MAX_HANDS = 2;

export interface HandUpdate {
  hands: { hand: TrackedHand; x: number; y: number; sizePx: number }[];
  dtS: number;
}

export class PeaceBurst {
  readonly group = new THREE.Group();
  private pool: ParticlePool;
  private cooldowns = new Array<number>(MAX_HANDS).fill(0);
  private rings: THREE.Sprite[][] = [];

  constructor(
    private rng: () => number,
    private reducedMotion: boolean,
  ) {
    this.pool = createParticlePool(120, starTexture());
    this.group.add(this.pool.points);
    // Static rings for reduced motion: one set of 6 stars per possible hand.
    for (let h = 0; h < MAX_HANDS; h++) {
      const ring: THREE.Sprite[] = [];
      for (let i = 0; i < RAINBOW.length; i++) {
        const star = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: starTexture(),
            color: RAINBOW[i],
            transparent: true,
            depthWrite: false,
          }),
        );
        star.visible = false;
        ring.push(star);
        this.group.add(star);
      }
      this.rings.push(ring);
    }
  }

  update(u: HandUpdate): void {
    const active = u.hands.filter((h) => h.hand.gesture === 'victory');

    if (this.reducedMotion) {
      this.rings.forEach((ring, h) => {
        const at = active[h];
        ring.forEach((star, i) => {
          star.visible = Boolean(at);
          if (!at) return;
          const a = (i / ring.length) * Math.PI * 2;
          const r = at.sizePx * 1.6;
          star.position.set(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r, 6);
          star.scale.setScalar(at.sizePx * 0.55);
        });
      });
      return;
    }

    for (let h = 0; h < MAX_HANDS; h++) {
      this.cooldowns[h] -= u.dtS;
      const at = active[h];
      if (!at || this.cooldowns[h] > 0) continue;
      this.cooldowns[h] = BURST_EVERY_S;
      for (let i = 0; i < STARS_PER_BURST; i++) {
        const a = (i / STARS_PER_BURST) * Math.PI * 2 + this.rng() * 0.3;
        const speed = at.sizePx * (3.5 + this.rng() * 1.5);
        this.pool.spawn(
          at.x,
          at.y,
          6,
          Math.cos(a) * speed,
          Math.sin(a) * speed,
          RAINBOW[i % RAINBOW.length],
          0.8 + this.rng() * 0.4,
        );
      }
    }

    const sizeRef = active[0]?.sizePx ?? u.hands[0]?.sizePx ?? 40;
    const mat = this.pool.points.material as THREE.PointsMaterial;
    mat.size = Math.min(48, Math.max(12, sizeRef * 0.5));
    this.pool.step(u.dtS, -sizeRef * 3, (c, lifeLeft) => c.multiplyScalar(lifeLeft));
    this.pool.points.visible = !this.pool.idle();
  }

  dispose(): void {
    this.pool.dispose();
    for (const ring of this.rings) {
      for (const star of ring) {
        star.material.map?.dispose();
        star.material.dispose();
      }
    }
  }
}
