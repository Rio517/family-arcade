import { describe, expect, it } from 'vitest';
import { makeProp } from './catalog';
import { grow, only, round, still } from './testing';
import type { Difficulty } from './rivals';
import { stepWorld, type WorldEvent } from './world';

describe('the city fights back', () => {
  it('eating the chemical works shrinks the hole, fight-back or not, and only once while it reels', () => {
    for (const fightBack of [true, false]) {
      const w = round(1, 0, { fightBack });
      const me = grow(w, 0, 8000);
      const before = me.mass;
      w.nextAttack = 999;
      only(w, [makeProp(1, 'gastank', me.x, me.z, 0), makeProp(2, 'plantshed', me.x + 1, me.z, 0)]);
      const events = stepWorld(w, 1 / 60, still);
      expect(events.filter((e) => e.type === 'hurt')).toEqual([{ type: 'hurt', hole: 0, cause: 'chem' }]);
      expect(me.mass).toBeLessThan(before);
      expect(me.stun).toBeGreaterThan(0);
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

  it('goes after the biggest mouth first; on Easy a child in the lead is spared half the time', () => {
    const picks = (difficulty: Difficulty, childSize: number) => {
      let child = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const w = round(seed, 1, { fightBack: true, difficulty });
        only(w, []);
        w.brains[1] = null;
        grow(w, 0, childSize);
        grow(w, 1, 2000);
        w.holes[1].x = w.holes[0].x + 150;
        w.nextAttack = 0;
        for (const e of stepWorld(w, 1 / 60, still)) if (e.type === 'incoming' && e.target === 0) child += 1;
      }
      return child / 40;
    };
    // The child is the biggest: always the target on Hard, about half the time on Easy.
    expect(picks('hard', 3000)).toBe(1);
    expect(picks('easy', 3000)).toBeGreaterThan(0.25);
    expect(picks('easy', 3000)).toBeLessThan(0.75);
    // A computer hole is bigger: it is the target.
    expect(picks('hard', 1200)).toBe(0);
  });

  it('a wave of tanks goes home after 2 hits on Easy and 3 on Medium and Hard, and a helicopter that keeps missing gives up after a few shots', () => {
    const hits = (difficulty: Difficulty) => {
      const w = round(6, 0, { fightBack: true, difficulty });
      only(w, []);
      const me = grow(w, 0, 3000);
      w.nextAttack = 999;
      const tank = (id: number, dx: number) => ({
        id, wave: 1, hits: 0, home: false, kind: 'tank' as const, target: 0, shots: 3,
        x: me.x + dx, z: me.z + me.r + 22, heading: Math.PI, speed: 6, life: 40, reload: 0.5, shells: [],
      });
      w.attacks = [tank(1, -6), tank(2, 6)];
      let n = 0;
      for (let i = 0; i < 60 * 20; i++) for (const e of stepWorld(w, 1 / 60, still)) if (e.type === 'hurt') n += 1;
      return { n, home: w.attacks.every((a) => a.kind === 'tank' && a.home) };
    };
    for (const [d, n] of [['easy', 2], ['medium', 3], ['hard', 3]] as const) {
      expect(hits(d).n, d).toBe(n);
      expect(hits(d).home, d).toBe(true);
    }

    // A helicopter over a hole that keeps moving: a few shots, then home.
    const w = round(5, 0, { map: 'region', fightBack: true, difficulty: 'hard' });
    only(w, []);
    const me = grow(w, 0, 900);
    w.nextAttack = 999;
    w.attacks = [{ id: 1, wave: 1, hits: 0, home: false, kind: 'heli', target: 0, shots: 3, x: me.x + 30, z: me.z, heading: 0, speed: 28, life: 40, reload: 0.3, shells: [] }];
    // Each landing shell is a boom; a hit adds one more for the knock.
    let booms = 0;
    let hurts = 0;
    for (let i = 0; i < 60 * 20; i++) {
      for (const e of stepWorld(w, 1 / 60, { x: 0, z: Math.sin(i / 50) > 0 ? 1 : -1 })) {
        if (e.type === 'boom') booms += 1;
        if (e.type === 'hurt') hurts += 1;
      }
    }
    expect(booms - hurts).toBeLessThanOrEqual(3);
    expect(w.attacks.every((a) => a.kind !== 'heli' || a.home)).toBe(true);
  });
});
