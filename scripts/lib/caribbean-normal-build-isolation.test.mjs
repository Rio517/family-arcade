import { describe, expect, it } from 'vitest';

const modulePath = './caribbean-normal-build-isolation.mjs';

describe('Caribbean normal-build isolation policy', () => {
  it('requires the remote map runtime to live outside the initial entry chunk', async () => {
    const { normalBuildMapSplitFailure } = await import(/* @vite-ignore */ modulePath);
    expect(normalBuildMapSplitFailure({
      entryText: 'family arcade menu',
      nonEntryText: 'https://tiles.openfreemap.org/planet maplibregl-canvas maplibre-gl-csp-worker',
    })).toBeNull();
    expect(normalBuildMapSplitFailure({
      entryText: 'https://tiles.openfreemap.org/planet',
      nonEntryText: 'other chunks',
    })).toContain('initial entry');
    expect(normalBuildMapSplitFailure({
      entryText: 'family arcade menu',
      nonEntryText: 'other chunks',
    })).toContain('lazy chunk');
    expect(normalBuildMapSplitFailure({
      entryText: 'family arcade menu maplibregl-canvas',
      nonEntryText: 'https://tiles.openfreemap.org/planet maplibre-gl-csp-worker',
    })).toContain('initial entry');
    expect(normalBuildMapSplitFailure({
      entryText: 'family arcade menu maplibre-gl-csp-worker',
      nonEntryText: 'https://tiles.openfreemap.org/planet maplibregl-canvas',
    })).toContain('initial entry');
  });

  it('allows the local production naval chunk, CSS, and sloop GLB', async () => {
    const { normalBuildIsolationFailure } = await import(/* @vite-ignore */ modulePath);
    expect(normalBuildIsolationFailure({
      entries: [
        'index.html',
        'assets/index-hash.js',
        'assets/CampaignNavalBattle-hash.js',
        'assets/CampaignNavalBattle-hash.css',
        'assets/caribbean-sloop-hash.glb',
      ],
      shippedText: 'production campaign naval route',
    })).toBeNull();
  });

  it.each([
    ['preview HTML', ['preview-caribbean-game.html'], 'production', 'preview output'],
    ['CaribbeanLab', ['index.html'], 'CaribbeanLab', 'CaribbeanLab'],
    ['debug bridge', ['index.html'], 'debugBridge', 'debugBridge'],
    ['harness config', ['index.html'], 'harnessConfig', 'harnessConfig'],
    ['debug global', ['index.html'], '__CARIBBEAN_NAVAL_DEBUG__', '__CARIBBEAN_NAVAL_DEBUG__'],
    ['harness failure hook', ['index.html'], 'Harness-forced WebGL construction failure', 'Harness-forced WebGL construction failure'],
  ])('rejects %s output', async (_label, entries, shippedText, diagnostic) => {
    const { normalBuildIsolationFailure } = await import(/* @vite-ignore */ modulePath);
    expect(normalBuildIsolationFailure({ entries, shippedText })).toContain(diagnostic);
  });
});
