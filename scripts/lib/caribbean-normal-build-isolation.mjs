const FORBIDDEN_MARKERS = [
  'CaribbeanLab',
  'debugBridge',
  'harnessConfig',
  '__CARIBBEAN_NAVAL_DEBUG__',
  'Harness-forced WebGL construction failure',
];

const LAZY_MAP_MARKERS = [
  'https://tiles.openfreemap.org/planet',
  'maplibregl-canvas',
  'maplibre-gl-csp-worker',
];

export function normalBuildMapSplitFailure({ entryText, nonEntryText }) {
  for (const marker of LAZY_MAP_MARKERS) {
    if (entryText.includes(marker)) {
      return `remote map runtime in initial entry chunk: ${marker}`;
    }
  }
  for (const marker of LAZY_MAP_MARKERS) {
    if (!nonEntryText.includes(marker)) {
      return `remote map runtime missing from lazy chunk: ${marker}`;
    }
  }
  return null;
}

export function normalBuildIsolationFailure({ entries, shippedText }) {
  const previewEntries = entries.filter((entry) => /(?:^|\/)preview-[^/]+\.html$/i.test(entry));
  if (previewEntries.length > 0) return `preview output: ${previewEntries.join(', ')}`;
  for (const marker of FORBIDDEN_MARKERS) {
    if (shippedText.includes(marker)) return `harness/debug marker: ${marker}`;
  }
  return null;
}
