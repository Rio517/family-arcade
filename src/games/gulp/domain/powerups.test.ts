import { describe, expect, it } from 'vitest';
import { makeProp } from './catalog';
import { CHILD_GROWTH } from './holes';
import { POWER_TIME } from './powerups';
import { only, round, still } from './testing';
import { stepWorld } from './world';

describe('power-ups', () => {
  it('turn up from time to time near the child, only when switched on', () => {
    const on = round(2, 0, { powerups: true });
    const off = round(2, 0, { powerups: false });
    only(on, []);
    only(off, []);
    for (let i = 0; i < 60 * 40; i++) {
      stepWorld(on, 1 / 60, still);
      stepWorld(off, 1 / 60, still);
    }
    expect(on.powerups.length).toBeGreaterThan(0);
    const me = on.holes[0];
    for (const p of on.powerups) expect(Math.hypot(p.x - me.x, p.z - me.z)).toBeLessThan(40);
    expect(off.powerups).toEqual([]);
  });

  it('speed makes the hole faster for a while', () => {
    const w = round(1, 0, { powerups: true });
    only(w, []);
    const me = w.holes[0];
    w.powerups = [{ id: 1, kind: 'speed', x: me.x, z: me.z, life: 10 }];
    expect(stepWorld(w, 1 / 60, still)).toContainEqual({ type: 'power', hole: 0, kind: 'speed' });
    const x0 = me.x;
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    const boosted = me.x - x0;
    for (let i = 0; i < 60 * POWER_TIME.speed; i++) stepWorld(w, 1 / 60, still);
    const x1 = me.x;
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, { x: -1, z: 0 });
    expect(boosted).toBeGreaterThan((x1 - me.x) * 1.4);
  });

  it('double points doubles the score, not the size', () => {
    const w = round(1, 0, { powerups: true, difficulty: 'medium' });
    const me = w.holes[0];
    only(w, [makeProp(1, 'bench', me.x + 3, me.z, 0)]);
    me.doubleTime = 5;
    for (let i = 0; i < 30; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    expect(me.score).toBe(4);
    expect(me.mass).toBeCloseTo(2 * CHILD_GROWTH.medium, 6);
  });
});
