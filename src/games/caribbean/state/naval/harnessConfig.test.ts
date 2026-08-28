import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { readNavalHarnessConfig } from './harnessConfig';

describe('naval harness configuration', () => {
  it('accepts a valid serialized input and a forced-WebGL-failure flag', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.battleId = 'browser-evidence-port';
    input.seed = 8_023;
    const search = new URLSearchParams({
      input: JSON.stringify(input),
      forceWebglFailure: '1',
    }).toString();

    expect(readNavalHarnessConfig(`?${search}`)).toEqual({
      battleInput: input,
      forceWebglFailure: true,
    });
  });

  it('uses the canonical Battle Lab input when no serialized override exists', () => {
    expect(readNavalHarnessConfig('')).toEqual({
      battleInput: BATTLE_LAB_INPUT,
      forceWebglFailure: false,
    });
  });

  it('rejects malformed or domain-invalid serialized inputs', () => {
    expect(() => readNavalHarnessConfig('?input=%7Bnope')).toThrow(/serialized naval input/i);
    const invalid = structuredClone(BATTLE_LAB_INPUT);
    invalid.opponent.crew = -1;
    expect(() => readNavalHarnessConfig(`?input=${encodeURIComponent(JSON.stringify(invalid))}`)).toThrow(/invalid naval input/i);
  });
});
