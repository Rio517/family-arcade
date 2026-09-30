import { describe, expect, it } from 'vitest';
import { only, round, still } from './testing';
import { stepWorld } from './world';

describe('people', () => {
  it('walk round the pavements, and fall in when a hole gets them', () => {
    const w = round(1, 0);
    only(w, []);
    expect(w.people.length).toBeGreaterThan(50);
    const p = w.people[0];
    const x0 = p.x;
    const z0 = p.z;
    stepWorld(w, 0.5, still);
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(0.3);
    const me = w.holes[0];
    me.x = p.x;
    me.z = p.z;
    const events = stepWorld(w, 1 / 60, still);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', prop: expect.objectContaining({ kind: 'person' }) }));
    expect(p.alive).toBe(false);
    expect(me.score).toBeGreaterThan(0);
  });

  it('come back into town a while later', () => {
    const w = round(1, 0);
    only(w, []);
    const p = w.people[0];
    const me = w.holes[0];
    me.x = p.x;
    me.z = p.z;
    stepWorld(w, 1 / 60, still);
    for (let i = 0; i < 60 * 20; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    expect(p.alive).toBe(true);
  });
});
