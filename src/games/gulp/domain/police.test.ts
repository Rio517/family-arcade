import { describe, expect, it } from 'vitest';
import { grow, only, round, still } from './testing';
import { stepWorld, type WorldEvent, type World } from './world';

/** A round where the child has just eaten enough for someone to call the police. */
function called(): World {
  const w = round(1, 0);
  only(w, []);
  w.police[0].eaten = 35;
  w.police[0].cool = 0;
  return w;
}

describe('the police', () => {
  it('two cars come when the child has eaten a lot, park by the hole, and officers get out', () => {
    const w = called();
    expect(stepWorld(w, 1 / 60, still)).toContainEqual(expect.objectContaining({ type: 'police' }));
    expect(w.responders.map((r) => r.kind)).toEqual(['car', 'car']);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 60 * 15; i++) events.push(...stepWorld(w, 1 / 60, still));
    // A parked car is a car in the city like any other: it leaves the responders.
    expect(events.filter((e) => e.type === 'park')).toHaveLength(2);
    expect(w.responders.map((r) => r.kind)).toEqual(['officer', 'officer', 'officer', 'officer']);
    expect(w.responders.every((r) => !r.done && r.state === 'stand')).toBe(true);
  });

  it('a police car driving into a hole big enough is swallowed, and gone', () => {
    const w = called();
    stepWorld(w, 1 / 60, still);
    const car = w.responders[0];
    const me = grow(w, 0, 400);
    me.x = car.x;
    me.z = car.z;
    const events = stepWorld(w, 1 / 60, still);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', hole: 0, prop: expect.objectContaining({ kind: 'policecar' }) }));
    expect(w.responders.map((r) => r.id)).not.toContain(car.id);
  });
});
