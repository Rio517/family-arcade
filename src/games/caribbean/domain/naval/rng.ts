const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;

export function nextSeed(seed: number): number {
  return (Math.imul(LCG_MULTIPLIER, seed >>> 0) + LCG_INCREMENT) >>> 0;
}
