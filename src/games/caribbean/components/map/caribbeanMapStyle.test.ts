import { describe, expect, it } from 'vitest';

import { CARIBBEAN_MAP_STYLE, OPEN_FREE_MAP_TILEJSON_URL } from './caribbeanMapStyle';

describe('Caribbean nautical map style', () => {
  it('owns the style while loading only OpenFreeMap vector geography', () => {
    expect(OPEN_FREE_MAP_TILEJSON_URL).toBe('https://tiles.openfreemap.org/planet');
    expect(CARIBBEAN_MAP_STYLE.version).toBe(8);
    expect(CARIBBEAN_MAP_STYLE.sources).toEqual({
      openmaptiles: {
        type: 'vector',
        url: OPEN_FREE_MAP_TILEJSON_URL,
      },
    });
    expect(CARIBBEAN_MAP_STYLE).not.toHaveProperty('sprite');
    expect(CARIBBEAN_MAP_STYLE).not.toHaveProperty('glyphs');
    expect(JSON.stringify(CARIBBEAN_MAP_STYLE)).not.toMatch(/pmtiles|\.pmtiles/i);
  });

  it('defines the nautical water, land, hydrography, and border layers locally', () => {
    expect(CARIBBEAN_MAP_STYLE.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'caribbean-water', 'source-layer': 'water' }),
      expect.objectContaining({ id: 'caribbean-landcover', 'source-layer': 'landcover' }),
      expect.objectContaining({ id: 'caribbean-waterway', 'source-layer': 'waterway' }),
      expect.objectContaining({ id: 'caribbean-boundaries', 'source-layer': 'boundary' }),
    ]));
    expect(CARIBBEAN_MAP_STYLE.layers.every((layer) => !('source' in layer) || layer.source === 'openmaptiles')).toBe(true);
  });
});
