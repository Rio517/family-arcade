import { describe, expect, it } from 'vitest';
import { makeProp } from './catalog';
import { grow, only, round, still } from './testing';
import { stepWorld, type WorldEvent } from './world';

describe('the city fights back', () => {
  it('eating the chemical plant shrinks the hole, only when switched on', () => {
    for (const fightBack of [true, false]) {
      const w = round(1, 0, { fightBack });
      const me = grow(w, 0, 8000);
      const before = me.mass;
      w.nextAttack = 999;
      only(w, [makeProp(1, 'gastank', me.x, me.z, 0)]);
      const events = stepWorld(w, 1 / 60, still);
      if (fightBack) {
        expect(events).toContainEqual({ type: 'hurt', hole: 0, cause: 'chem' });
        expect(me.mass).toBeLessThan(before);
        expect(me.stun).toBeGreaterThan(0);
      } else {
        expect(me.mass).toBeGreaterThan(before);
      }
    }
  });

  it('leaves small holes alone, and goes after a big one', () => {
    const w = round(3, 0, { fightBack: true });
    only(w, []);
    for (let i = 0; i < 60 * 40; i++) stepWorld(w, 1 / 60, still);
    expect(w.attacks).toEqual([]);
    grow(w, 0, 900);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 60 * 10; i++) events.push(...stepWorld(w, 1 / 60, still));
    expect(events).toContainEqual(expect.objectContaining({ type: 'incoming', target: 0 }));
  });

  it('a tanker that reaches a hole blows up in it; a hole that swerves gets away', () => {
    const run = (swerve: boolean) => {
      const w = round(4, 0, { fightBack: true });
      only(w, []);
      const me = grow(w, 0, 900);
      w.nextAttack = 999;
      w.attacks = [{ id: 1, kind: 'tanker', x: me.x, z: me.z - 40, heading: 0, speed: 12, target: 0, life: 14 }];
      const events: WorldEvent[] = [];
      for (let i = 0; i < 60 * 14; i++) {
        const t = w.attacks[0];
        const close = !!t && Math.hypot(t.x - me.x, t.z - me.z) < 25;
        events.push(...stepWorld(w, 1 / 60, swerve && close ? { x: 1, z: 0 } : still));
      }
      return events.filter((e) => e.type === 'hurt');
    };
    expect(run(false)).toEqual([{ type: 'hurt', hole: 0, cause: 'tanker' }]);
    expect(run(true)).toEqual([]);
  });

  it('bombs land on their target rings: stay and get hit, move away and get missed', () => {
    const run = (dodge: boolean) => {
      const w = round(5, 0, { fightBack: true });
      only(w, []);
      const me = grow(w, 0, 3000);
      w.nextAttack = 999;
      const radius = me.r * 0.8;
      w.attacks = [
        { id: 1, kind: 'bomber', target: 0, x: me.x - 100, z: me.z, dx: 1, dz: 0, speed: 50, life: 6, bombs: [{ id: 2, x: me.x, z: me.z, radius, fuse: 3 }] },
      ];
      const events: WorldEvent[] = [];
      for (let i = 0; i < 60 * 5; i++) events.push(...stepWorld(w, 1 / 60, dodge ? { x: 0, z: 1 } : still));
      return events;
    };
    const stay = run(false);
    expect(stay).toContainEqual({ type: 'hurt', hole: 0, cause: 'bomb' });
    expect(stay).toContainEqual(expect.objectContaining({ type: 'boom' }));
    expect(run(true).filter((e) => e.type === 'hurt')).toEqual([]);
  });

  it('a big hole sees planes as well as tankers', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const w = round(seed, 0, { fightBack: true });
      only(w, []);
      grow(w, 0, 3000);
      w.nextAttack = 0;
      for (const e of stepWorld(w, 1 / 60, still)) if (e.type === 'incoming') kinds.add(e.kind);
    }
    expect([...kinds].sort()).toEqual(['bomber', 'tanker']);
  });
});
