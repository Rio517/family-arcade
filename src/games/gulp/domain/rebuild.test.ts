import { describe, expect, it } from 'vitest';
import { makeProp, type Prop } from './catalog';
import { grow, only, round, still } from './testing';
import { stepWorld, type World, type WorldEvent } from './world';

describe('the city rebuilds', () => {
  /** Eat one thing at the hole, drive off, and collect what happens over `secs`. */
  function eatAndWait(w: World, props: Prop[], secs: number): WorldEvent[] {
    only(w, props);
    const events: WorldEvent[] = [];
    events.push(...stepWorld(w, 1 / 60, still));
    for (let i = 0; i < 60 * secs; i++) events.push(...stepWorld(w, 1 / 60, i < 60 * 6 ? { x: 1, z: 0 } : still));
    return events;
  }
  const built = (events: WorldEvent[]) => events.flatMap((e) => (e.type === 'rebuild' ? [e.prop.kind] : []));

  it('an eaten lot becomes a construction site first, then a building', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 400);
    w.elapsed = 45;
    const events = eatAndWait(w, [makeProp(1, 'house', me.x, me.z, 0)], 45);
    // Forty-five seconds in, the city is old enough for shops: one rung up.
    expect(built(events)).toEqual(['site', 'shop']);
    const done = events.find((e) => e.type === 'rebuild' && e.prop.kind === 'shop');
    expect(done?.type === 'rebuild' && done.replaces?.kind).toBe('site');
  });

  it('a young city rebuilds small: early on a tower comes back as a house', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 3000);
    expect(built(eatAndWait(w, [makeProp(1, 'tower', me.x, me.z, 0)], 45))).toEqual(['site', 'house']);
  });

  it('an old city rebuilds taller than the old building, where it cannot go wider', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 3000);
    w.elapsed = 400;
    const events = eatAndWait(w, [makeProp(1, 'office', me.x, me.z, 0)], 60);
    const last = events.filter((e) => e.type === 'rebuild').pop();
    // An office block's lot has no room for a skyscraper: it comes back taller instead.
    expect(last?.type === 'rebuild' && last.prop.kind).toBe('office');
    expect(last?.type === 'rebuild' && last.prop.hScale).toBeGreaterThan(1);
  });

  it('an eaten tower can come back as an office block', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 3000);
    w.elapsed = 400;
    const events = eatAndWait(w, [makeProp(1, 'tower', me.x, me.z, 0)], 45);
    const last = events.filter((e) => e.type === 'rebuild').pop();
    expect(last?.type === 'rebuild' && last.prop.kind).toBe('office');
  });

  it('a construction site that is eaten starts again later', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 400);
    const events = eatAndWait(w, [makeProp(1, 'house', me.x, me.z, 0)], 14);
    const site = events.find((e) => e.type === 'rebuild');
    if (site?.type !== 'rebuild') throw new Error('no construction site');
    expect(site.prop.kind).toBe('site');
    // Drive back over it.
    me.x = site.prop.x;
    me.z = site.prop.z;
    const again = stepWorld(w, 1 / 60, still);
    expect(again).toContainEqual(expect.objectContaining({ type: 'eat', prop: expect.objectContaining({ kind: 'site' }) }));
    expect(w.lots).toHaveLength(1);
    expect(w.lots[0].site).toBeNull();
  });

  it('a big lot becomes something grand, and it makes the news', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 40000);
    w.elapsed = 100;
    const events = eatAndWait(w, [makeProp(1, 'stadium', me.x, me.z, 0)], 45);
    const kinds = built(events);
    expect(kinds[0]).toBe('bigsite');
    expect(['stadium', 'mall', 'powerplant']).toContain(kinds[1]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'news' }));
  });

  it('the airport comes back as it was: its terminal through a building site, its jet put back', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 90000);
    w.elapsed = 300;
    const events = eatAndWait(w, [makeProp(1, 'terminal', me.x, me.z, 0), makeProp(2, 'jet', me.x + 2, me.z, 0, 1)], 60);
    expect(built(events)).toEqual(['bigsite', 'terminal']);
    expect(events).toContainEqual(expect.objectContaining({ type: 'regrow', prop: expect.objectContaining({ kind: 'jet', variant: 1 }) }));
  });

  it('out in the country a home comes back as the same home, never a city building', () => {
    const w = round(1, 0, { regrow: true, duration: 0, map: 'region' });
    const me = grow(w, 0, 400);
    w.elapsed = 400;
    me.x = w.city.half + 40;
    me.z = 0;
    expect(built(eatAndWait(w, [makeProp(1, 'cottage', me.x, me.z, 0)], 45))).toEqual(['site', 'cottage']);
  });

  it('with regrowth off, nothing comes back', () => {
    const w = round(1, 0, { regrow: false });
    const me = grow(w, 0, 400);
    const events = eatAndWait(w, [makeProp(1, 'house', me.x, me.z, 0), makeProp(2, 'cone', me.x + 1, me.z, 0)], 40);
    expect(events.filter((e) => e.type === 'rebuild' || e.type === 'regrow')).toEqual([]);
  });
});
