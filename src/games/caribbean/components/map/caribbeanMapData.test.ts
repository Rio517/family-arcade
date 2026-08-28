import { describe, expect, it } from 'vitest';

import {
  CARIBBEAN_MAP_POINTS,
  CARIBBEAN_MAP_PRESETS,
  CARIBBEAN_PLAYER_POINTS,
  CARIBBEAN_ROUTE,
} from './caribbeanMapData';

describe('Caribbean map data', () => {
  it('keeps named places, vessels, and the route on one real-coordinate model', () => {
    expect(CARIBBEAN_MAP_POINTS.bridgetown.coordinates).toEqual([-59.6167, 13.1]);
    expect(CARIBBEAN_MAP_POINTS.redJackdaw.coordinates).toEqual([-57.95, 13.43]);
    expect(CARIBBEAN_PLAYER_POINTS.port).toEqual(CARIBBEAN_MAP_POINTS.bridgetown.coordinates);
    expect(CARIBBEAN_PLAYER_POINTS.sailing[0]).toBeGreaterThan(CARIBBEAN_PLAYER_POINTS.port[0]);
    expect(CARIBBEAN_PLAYER_POINTS.sailing[1]).toBeGreaterThan(CARIBBEAN_PLAYER_POINTS.port[1]);
    expect(CARIBBEAN_PLAYER_POINTS.encounter[0]).toBeGreaterThan(CARIBBEAN_PLAYER_POINTS.sailing[0]);
    expect(CARIBBEAN_PLAYER_POINTS.encounter[1]).toBeGreaterThan(CARIBBEAN_PLAYER_POINTS.sailing[1]);
    expect(CARIBBEAN_ROUTE).toMatchObject({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          CARIBBEAN_MAP_POINTS.bridgetown.coordinates,
          CARIBBEAN_PLAYER_POINTS.sailing,
          CARIBBEAN_PLAYER_POINTS.encounter,
          CARIBBEAN_MAP_POINTS.redJackdaw.coordinates,
        ],
      },
    });
    expect(CARIBBEAN_PLAYER_POINTS.encounter[0]).toBeLessThan(CARIBBEAN_MAP_POINTS.redJackdaw.coordinates[0]);
    expect(CARIBBEAN_PLAYER_POINTS.encounter[1]).toBeLessThan(CARIBBEAN_MAP_POINTS.redJackdaw.coordinates[1]);
  });

  it('provides a shared camera contract for every campaign map context', () => {
    expect(Object.keys(CARIBBEAN_MAP_PRESETS).sort()).toEqual(['encounter', 'port', 'sailing']);
    for (const preset of Object.values(CARIBBEAN_MAP_PRESETS)) {
      expect(preset.longitude).toBeGreaterThanOrEqual(-70);
      expect(preset.longitude).toBeLessThanOrEqual(-55);
      expect(preset.latitude).toBeGreaterThanOrEqual(9);
      expect(preset.latitude).toBeLessThanOrEqual(18);
      expect(preset.zoom).toBeGreaterThanOrEqual(4);
    }
    expect(CARIBBEAN_MAP_PRESETS.port.longitude).toBeCloseTo(-59.62, 2);
    expect(CARIBBEAN_MAP_PRESETS.port.zoom).toBeLessThanOrEqual(5.8);
    expect(CARIBBEAN_MAP_PRESETS.encounter).toEqual(CARIBBEAN_MAP_PRESETS.sailing);
  });
});
