import { describe, expect, it } from 'vitest';

import {
  classifyCaribbeanMapRequest,
  isExpectedOpenFreeMapCancellation,
  isOpenFreeMapRequest,
} from './caribbean-map-network.mjs';

const localOrigin = 'http://127.0.0.1:5178';

describe('Caribbean map network classification', () => {
  it('classifies only the local application and approved map provider', () => {
    expect(classifyCaribbeanMapRequest('http://127.0.0.1:5178/src/main.tsx', localOrigin)).toBe('local');
    expect(classifyCaribbeanMapRequest('https://tiles.openfreemap.org/planet', localOrigin)).toBe('openfreemap');
    expect(classifyCaribbeanMapRequest('https://tiles.openfreemap.org/planet/20260823/6/20/29.pbf', localOrigin)).toBe('openfreemap');
    expect(classifyCaribbeanMapRequest('https://example.com/map', localOrigin)).toBe('unexpected-external');
  });

  it('rejects lookalike hosts and non-HTTPS provider requests', () => {
    expect(isOpenFreeMapRequest('https://tiles.openfreemap.org.example.com/planet')).toBe(false);
    expect(isOpenFreeMapRequest('http://tiles.openfreemap.org/planet')).toBe(false);
    expect(isOpenFreeMapRequest('https://tiles.openfreemap.org/planet')).toBe(true);
  });

  it('allows only provider requests aborted by a normal map unmount', () => {
    const tile = 'https://tiles.openfreemap.org/planet/20260823/6/20/29.pbf';
    expect(isExpectedOpenFreeMapCancellation(tile, 'net::ERR_ABORTED')).toBe(true);
    expect(isExpectedOpenFreeMapCancellation(tile, 'net::ERR_FAILED')).toBe(false);
    expect(isExpectedOpenFreeMapCancellation('https://example.com/map.pbf', 'net::ERR_ABORTED')).toBe(false);
  });
});
