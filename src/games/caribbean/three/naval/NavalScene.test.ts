import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/games/caribbean/three/naval/NavalScene.ts', 'utf8');
const shaderSource = readFileSync('src/games/caribbean/three/naval/waterShader.ts', 'utf8');

describe('NavalScene water presentation boundary', () => {
  it('consumes the shared calm-water constants for shader travel and hull motion', () => {
    expect(source).toContain('createNavalWaterUniforms');
    expect(source).toContain('NAVAL_WATER_VERTEX_SHADER');
    expect(source).toContain('NAVAL_WATER_FRAGMENT_SHADER');
    expect(shaderSource).toContain('NAVAL_WATER_PRESENTATION.waveAAmplitude');
    expect(shaderSource).toContain('NAVAL_WATER_PRESENTATION.waveBAmplitude');
    expect(shaderSource).toContain('NAVAL_WATER_PRESENTATION.waveASpeed');
    expect(shaderSource).toContain('NAVAL_WATER_PRESENTATION.waveBSpeed');
    expect(source).toContain('NAVAL_WATER_PRESENTATION.shipHeave');
    expect(source).toContain('NAVAL_WATER_PRESENTATION.shipPitch');
    expect(source).toContain('NAVAL_WATER_PRESENTATION.shipAmbientRoll');
  });

  it('does not allocate, add, or animate the old diagonal wind-line layer', () => {
    expect(source).not.toMatch(/#windLines|updateWindLines|windLineGeometry/);
  });
});
