import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { KINDS } from './catalog';
import { MAPS, ROAD, createCity, type MapId } from './city';

const ALL: MapId[] = ['town', 'city', 'mega', 'region'];
const topTier = (map: MapId, seed = 1) => Math.max(...createCity(seededRng(seed), map).props.map((p) => KINDS[p.kind].tier));

describe('createCity', () => {
  it('is the same city from the same seed', () => {
    expect(createCity(seededRng(4)).props).toEqual(createCity(seededRng(4)).props);
  });

  it('gets bigger, and holds bigger things, map by map', () => {
    const halves = ALL.map((m) => createCity(seededRng(1), m).half);
    expect(halves).toEqual([...halves].sort((a, b) => a - b));
    for (const seed of [1, 2, 3]) {
      expect(topTier('town', seed)).toBe(7);
      expect(topTier('city', seed)).toBe(8);
      expect(topTier('mega', seed)).toBe(9);
      expect(topTier('region', seed)).toBe(10);
    }
  });

  it('has every tier up to its biggest, and plenty of small things to start on', () => {
    for (const map of ALL) {
      const city = createCity(seededRng(1), map);
      const tiers = new Set(city.props.map((p) => KINDS[p.kind].tier));
      for (let t = 0; t <= topTier(map); t++) expect(tiers.has(t)).toBe(true);
      const small = city.props.filter((p) => KINDS[p.kind].tier <= 1).length;
      expect(small / MAPS[map].blocks ** 2).toBeGreaterThan(8);
    }
  });

  it('has a chemical plant in the city and up, and an airport and mountains in the region', () => {
    const kinds = (map: MapId) => new Set(createCity(seededRng(6), map).props.map((p) => p.kind));
    expect(kinds('mega').has('chemplant') || kinds('mega').has('factory')).toBe(true);
    const region = kinds('region');
    for (const k of ['terminal', 'jet', 'mountain', 'windturbine', 'barn', 'skyscraper'] as const) expect(region.has(k)).toBe(true);
  });

  it('keeps everything on the island, and nothing in the middle of a crossing', () => {
    for (const map of ALL) {
      const city = createCity(seededRng(3), map);
      for (const p of city.props) {
        expect(Math.abs(p.x)).toBeLessThan(city.half);
        expect(Math.abs(p.z)).toBeLessThan(city.half);
        const onCrossing = city.roads.some((x) => Math.abs(p.x - x) < ROAD / 2) && city.roads.some((z) => Math.abs(p.z - z) < ROAD / 2);
        expect(onCrossing).toBe(false);
      }
    }
  });

  it('does not stand two things in the same spot', () => {
    for (const map of ALL) {
      const city = createCity(seededRng(9), map);
      const spots = new Set(city.props.map((p) => `${p.x.toFixed(1)}:${p.z.toFixed(1)}`));
      expect(spots.size).toBe(city.props.length);
    }
  });
});
