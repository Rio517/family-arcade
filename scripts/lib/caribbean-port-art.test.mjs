import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('.');
const ASSET_PATH = path.join(ROOT, 'src/games/caribbean/assets/bridgetown-1675.webp');
const REPORT_PATH = path.join(ROOT, 'docs/games/caribbean-career/bridgetown-asset-report.json');
const REFERENCE_PATH = path.join(ROOT, 'docs/games/caribbean-career/bridgetown-visual-reference.md');
const CSS_PATH = path.join(ROOT, 'src/games/caribbean/styles/port.css');
const EXPECTED_COMMAND = 'mise exec node@20 -- node scripts/prepare-caribbean-art.mjs <input> src/games/caribbean/assets/bridgetown-1675.webp';

describe('Bridgetown production art', () => {
  it('ships the promoted 1920x1080 offline WebP and exact provenance contract', async () => {
    const bytes = fs.readFileSync(ASSET_PATH);
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    const metadata = await sharp(bytes).metadata();

    expect(metadata).toMatchObject({ format: 'webp', width: 1920, height: 1080 });
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeLessThan(900_000);
    expect(report).toMatchObject({
      asset: 'src/games/caribbean/assets/bridgetown-1675.webp',
      source: 'OpenAI ImageGen',
      width: 1920,
      height: 1080,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      format: 'webp',
      quality: 84,
      optimizationCommand: EXPECTED_COMMAND,
      sharpVersion: sharp.versions.sharp,
      crop: { fit: 'cover', position: 'center' },
      historicalReview: 'pass',
      representationReview: 'pass',
      productionStatus: 'promoted',
    });
    expect(report.generatedSourceIdentity).toEqual(expect.any(String));
    expect(report.generatedSourceIdentity.length).toBeGreaterThan(0);
    expect(report.generatedOutputHint === null || typeof report.generatedOutputHint === 'string').toBe(true);
    expect(report.prompts).toEqual(expect.arrayContaining([
      expect.stringMatching(/Bridgetown/i),
      expect.stringMatching(/1675/),
      expect.stringMatching(/no foreground or identifiable people/i),
      expect.stringMatching(/replace the mountainous background/i),
    ]));
    expect(report.subjectRoi).toHaveLength(4);
    expect(report.subjectRoi.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    expect(report.subjectRoi[2]).toBeGreaterThan(0);
    expect(report.subjectRoi[3]).toBeGreaterThan(0);
    expect(fs.readFileSync(REFERENCE_PATH, 'utf8')).toMatch(/https:\/\/(?:www\.)?(?:rmg\.co\.uk|whc\.unesco\.org|rijksmuseum\.nl)/);
    expect(JSON.stringify(report)).not.toMatch(/https?:\/\//i);
    expect(fs.readFileSync(CSS_PATH, 'utf8')).not.toMatch(/url\(\s*['"]?https?:\/\//i);
  });
});
