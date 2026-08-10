import { describe, expect, it } from 'vitest';
import { CAPTAIN_PERSONAS, captainById } from './personas';
import { SKINS } from '../constants';

describe('captain personas', () => {
  it('ships four, ordered weakest to strongest', () => {
    expect(CAPTAIN_PERSONAS).toHaveLength(4);
    expect(CAPTAIN_PERSONAS.map((p) => p.rung)).toEqual([1, 2, 3, 4]);
  });

  it('captainById falls back to the gentlest for unknown ids', () => {
    expect(captainById('nope').rung).toBe(1);
    expect(captainById('grimtide').rung).toBe(4);
  });

  it('every captain sails a real fleet skin', () => {
    const ids = new Set(SKINS.map((s) => s.id));
    for (const p of CAPTAIN_PERSONAS) expect(ids.has(p.skinId)).toBe(true);
  });
});
