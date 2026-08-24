const FORBIDDEN_MARKERS = [
  'CaribbeanLab',
  'debugBridge',
  'harnessConfig',
  '__CARIBBEAN_NAVAL_DEBUG__',
  'Harness-forced WebGL construction failure',
];

export function normalBuildIsolationFailure({ entries, shippedText }) {
  const previewEntries = entries.filter((entry) => /(?:^|\/)preview-[^/]+\.html$/i.test(entry));
  if (previewEntries.length > 0) return `preview output: ${previewEntries.join(', ')}`;
  for (const marker of FORBIDDEN_MARKERS) {
    if (shippedText.includes(marker)) return `harness/debug marker: ${marker}`;
  }
  return null;
}
