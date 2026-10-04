import { describe, expect, it } from 'vitest';
import { CAPTAIN_PERSONAS, captainById } from './personas';

describe('captain personas', () => {
  it('ships four, ordered weakest to strongest', () => {
    expect(CAPTAIN_PERSONAS).toHaveLength(4);
    expect(CAPTAIN_PERSONAS.map((p) => p.rung)).toEqual([1, 2, 3, 4]);
  });

  it('captainById falls back to the gentlest for unknown ids', () => {
    expect(captainById('nope').rung).toBe(1);
    expect(captainById('grimtide').rung).toBe(4);
  });
});
