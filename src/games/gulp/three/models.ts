/**
 * The city's models, built once for the whole visit: the menu's city and
 * every round after it share them, so starting a round never rebuilds a
 * model the menu already has. A scene's teardown frees their GPU copies; the
 * next scene uploads them again, which is quick next to building them.
 */
import type * as THREE from 'three';
import { KINDS, type PropKind, type Prop } from '../domain/catalog';
import { buildKindGeometry } from './props';

const MODELS = new Map<string, THREE.BufferGeometry>();

/**
 * A kind's model, built on first use. Exported on its own (no renderer is
 * involved in building a model) so a test can check that a second scene
 * reuses the first's models.
 */
export function modelFor(kind: PropKind, variant: number, h: number): THREE.BufferGeometry {
  const key = `${kind}:${variant}:${h}`;
  let geo = MODELS.get(key);
  if (!geo) {
    geo = buildKindGeometry(kind, variant, h);
    geo.computeBoundingSphere();
    MODELS.set(key, geo);
  }
  return geo;
}

/** A thing's model: buildings come in a few heights (quarters), everything else in its colours. */
export function modelOf(p: Prop): THREE.BufferGeometry {
  return modelFor(p.kind, p.variant, KINDS[p.kind].scales ? Math.round(p.hScale * 4) / 4 : 1);
}

/**
 * Every model a round might still need (a rebuilt lot, a police car, a
 * taller tower), built a few at a time in spare frame time. Building one the
 * moment it first appears stalls that frame.
 */
export class ModelWarmup {
  private queue: Array<[PropKind, number, number]> = [];

  constructor() {
    // Heights a rebuilt building can come in (see the domain's rebuild).
    // Biggest first, so the slow ones are built during the countdown. Wonders
    // are never rebuilt.
    const heights = [1, 1.25, 1.5, 1.75, 2];
    const kinds = (Object.keys(KINDS) as PropKind[]).filter((k) => !KINDS[k].wonder);
    kinds.sort((a, b) => KINDS[a].tier - KINDS[b].tier);
    for (const kind of kinds) {
      const info = KINDS[kind];
      for (let v = 0; v < info.variants; v++) for (const h of info.scales ? heights : [1]) this.queue.push([kind, v, h]);
    }
  }

  /** Build models from the queue for up to `budgetMs`. */
  step(budgetMs: number): void {
    if (!this.queue.length) return;
    const until = performance.now() + budgetMs;
    while (this.queue.length && performance.now() < until) {
      const [kind, variant, h] = this.queue.pop()!;
      // A kind without a model yet is never placed either; skip it rather than stop the frame.
      try {
        modelFor(kind, variant, h);
      } catch {
        continue;
      }
    }
  }
}
