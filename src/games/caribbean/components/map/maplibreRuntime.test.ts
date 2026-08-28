import { describe, expect, it, vi } from 'vitest';

const setWorkerUrl = vi.hoisted(() => vi.fn());

vi.mock('maplibre-gl', () => ({ setWorkerUrl }));
vi.mock('maplibre-gl/dist/maplibre-gl-csp-worker.js?url', () => ({
  default: '/assets/maplibre-worker.js',
}));

describe('MapLibre runtime', () => {
  it('uses MapLibre v5’s self-contained CSP worker instead of the breakable inline worker', async () => {
    const runtime = await import('./maplibreRuntime');

    expect(runtime.MAPLIBRE_WORKER_URL).toBe('/assets/maplibre-worker.js');
    expect(setWorkerUrl).toHaveBeenCalledWith('/assets/maplibre-worker.js');
  });
});
