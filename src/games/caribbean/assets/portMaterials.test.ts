import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MATERIALS = [
  { filename: 'port-panel-patina.webp', maximumBytes: 64 * 1024 },
  { filename: 'port-chart-paper.webp', maximumBytes: 96 * 1024 },
] as const;

describe('Bridgetown port material assets', () => {
  it.each(MATERIALS)('ships $filename as a compact WebP instead of a UI screenshot', ({ filename, maximumBytes }) => {
    const path = resolve('src/games/caribbean/assets', filename);
    const bytes = readFileSync(path);

    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(statSync(path).size).toBeLessThanOrEqual(maximumBytes);
  });
});
