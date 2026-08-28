import { describe, expect, it } from 'vitest';

import {
  createNavalWaterUniforms,
  NAVAL_WATER_FRAGMENT_SHADER,
  NAVAL_WATER_VERTEX_SHADER,
} from './waterShader';

describe('naval water shader', () => {
  it('keeps displacement calm while deriving a multi-scale analytic surface normal', () => {
    expect(NAVAL_WATER_VERTEX_SHADER).toContain('waveAAmplitude');
    expect(NAVAL_WATER_VERTEX_SHADER).toContain('waveBAmplitude');
    expect(NAVAL_WATER_VERTEX_SHADER).toContain('dHeightDx');
    expect(NAVAL_WATER_VERTEX_SHADER).toContain('dHeightDy');
    expect(NAVAL_WATER_VERTEX_SHADER).toContain('microSlope');
    expect(NAVAL_WATER_VERTEX_SHADER).toContain('vWorldNormal');
    expect(NAVAL_WATER_VERTEX_SHADER).not.toMatch(/texture2D|sampler2D|noise\s*\(/);
  });

  it('shades the real normal with Fresnel, coastal absorption, and restrained sun glitter', () => {
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('schlickFresnel');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('distributionGgx');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('uAbsorption');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('uScatterColor');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('sunGlitter');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('skyHorizon');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('detailSlope');
    expect(NAVAL_WATER_FRAGMENT_SHADER).toContain('facetLight');
    expect(NAVAL_WATER_FRAGMENT_SHADER).not.toMatch(/texture2D|sampler2D|discard/);
  });

  it('provides deterministic physically legible optical uniforms', () => {
    const uniforms = createNavalWaterUniforms();

    expect(uniforms.uTime.value).toBe(0);
    expect(uniforms.uIndexOfRefraction.value).toBeCloseTo(1.333);
    expect(uniforms.uRoughness.value).toBeGreaterThanOrEqual(0.18);
    expect(uniforms.uRoughness.value).toBeLessThanOrEqual(0.32);
    expect(uniforms.uSunDirection.value.length()).toBeCloseTo(1);
  });
});
