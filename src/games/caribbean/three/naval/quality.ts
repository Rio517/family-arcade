export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityTierDefinition {
  dprCap: number;
  shadows: boolean;
  shadowMapSize: number;
  effectCapacity: number;
}

export interface QualitySettings extends QualityTierDefinition {
  dpr: number;
}

export const QUALITY_TIERS: Readonly<Record<QualityTier, QualityTierDefinition>> = {
  low: { dprCap: 1, shadows: false, shadowMapSize: 0, effectCapacity: 32 },
  medium: { dprCap: 1.4, shadows: true, shadowMapSize: 512, effectCapacity: 64 },
  high: { dprCap: 1.75, shadows: true, shadowMapSize: 1024, effectCapacity: 96 },
};

const ORDER: readonly QualityTier[] = ['low', 'medium', 'high'];
const SLOW_FPS = 48;
const FAST_FPS = 58;
const DROP_SECONDS = 5;
const RAISE_SECONDS = 20;

export function qualitySettings(tier: QualityTier, devicePixelRatio: number): QualitySettings {
  const definition = QUALITY_TIERS[tier];
  return {
    ...definition,
    dpr: Math.min(Math.max(1, devicePixelRatio), definition.dprCap),
  };
}

export class QualityController {
  #tier: QualityTier;
  #slowSeconds = 0;
  #fastSeconds = 0;
  #raised = false;

  constructor(initialTier: QualityTier) {
    this.#tier = initialTier;
  }

  get tier(): QualityTier {
    return this.#tier;
  }

  sample(fps: number, seconds: number): boolean {
    const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.#slowSeconds = fps < SLOW_FPS ? this.#slowSeconds + elapsed : 0;
    this.#fastSeconds = fps > FAST_FPS ? this.#fastSeconds + elapsed : 0;

    const index = ORDER.indexOf(this.#tier);
    if (this.#slowSeconds >= DROP_SECONDS && index > 0) {
      this.#tier = ORDER[index - 1];
      this.#slowSeconds = 0;
      this.#fastSeconds = 0;
      return true;
    }

    if (this.#fastSeconds >= RAISE_SECONDS && !this.#raised && index < ORDER.length - 1) {
      this.#tier = ORDER[index + 1];
      this.#slowSeconds = 0;
      this.#fastSeconds = 0;
      this.#raised = true;
      return true;
    }

    return false;
  }
}
