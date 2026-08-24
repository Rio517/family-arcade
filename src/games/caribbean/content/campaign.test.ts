import { describe, expect, it } from 'vitest';

import { SLOOP_CLASS } from './naval';
import {
  BRIDGETOWN,
  CARGO_IDS,
  FACTION_IDS,
  FITTING_IDS,
  FITTINGS,
  isCargoId,
  isFactionId,
  isFittingId,
  isLeadId,
  isPortId,
  isShipClassId,
  LEAD_IDS,
  LEADS,
  PORT_IDS,
  SHIP_CLASS_IDS,
  SLOOP_VALIDATION_LIMITS,
} from './campaign';

function expectUnique(ids: readonly string[]): void {
  expect(new Set(ids)).toHaveLength(ids.length);
}

describe('Caribbean campaign content', () => {
  it('keeps the authored campaign ID sets narrow, ordered, and unique', () => {
    expect(PORT_IDS).toEqual(['bridgetown']);
    expect(CARGO_IDS).toEqual([
      'provisions',
      'tools',
      'luxuries',
      'sugar-molasses',
      'tobacco-dyewood',
      'powder-arms',
    ]);
    expect(SHIP_CLASS_IDS).toEqual(['sloop']);
    expect(FACTION_IDS).toEqual(['english', 'french', 'spanish', 'dutch']);
    expect(FITTING_IDS).toEqual([
      'careened-hull',
      'fine-canvas',
      'expanded-berths',
      'reinforced-scantlings',
      'improved-gun-carriages',
      'ammunition-lockers',
    ]);
    expect(LEAD_IDS).toEqual(['red-jackdaw']);

    for (const ids of [PORT_IDS, CARGO_IDS, SHIP_CLASS_IDS, FACTION_IDS, FITTING_IDS, LEAD_IDS]) {
      expectUnique(ids);
      expect(Object.isFrozen(ids)).toBe(true);
    }
  });

  it('exposes frozen authored port, fitting, and lead definitions', () => {
    expect(Object.isFrozen(BRIDGETOWN)).toBe(true);
    expect(Object.isFrozen(FITTINGS)).toBe(true);
    expect(Object.isFrozen(LEADS)).toBe(true);
    for (const [id, fitting] of Object.entries(FITTINGS)) {
      expect(Object.isFrozen(fitting), `FITTINGS.${id} must be frozen`).toBe(true);
    }
    for (const [id, lead] of Object.entries(LEADS)) {
      expect(Object.isFrozen(lead), `LEADS.${id} must be frozen`).toBe(true);
    }
    expect(BRIDGETOWN).toEqual({
      id: 'bridgetown',
      name: 'Bridgetown',
      controller: 'english',
      prosperity: 'modest',
      defense: 'guarded',
    });
  });

  it('assigns the exact hold penalty to every approved fitting', () => {
    expect(FITTINGS).toEqual({
      'careened-hull': { id: 'careened-hull', holdPenalty: 0 },
      'fine-canvas': { id: 'fine-canvas', holdPenalty: 0 },
      'expanded-berths': { id: 'expanded-berths', holdPenalty: 6 },
      'reinforced-scantlings': { id: 'reinforced-scantlings', holdPenalty: 0 },
      'improved-gun-carriages': { id: 'improved-gun-carriages', holdPenalty: 2 },
      'ammunition-lockers': { id: 'ammunition-lockers', holdPenalty: 2 },
    });
  });

  it('gives the Red Jackdaw lead its fixed expiry and next action', () => {
    expect(LEADS).toEqual({
      'red-jackdaw': {
        id: 'red-jackdaw',
        expiresAfterDays: 18,
        nextAction: 'Sail east of Bridgetown and identify the Red Jackdaw.',
        sentence: 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.',
      },
    });
    expect(LEADS['red-jackdaw'].sentence).toBe(
      'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.',
    );
  });

  it('derives campaign sloop validation limits from the authoritative naval class', () => {
    expect(SLOOP_VALIDATION_LIMITS).toBe(SLOOP_CLASS);
  });

  it.each([
    ['port', isPortId, 'bridgetown', 'barbados'],
    ['cargo', isCargoId, 'provisions', 'people'],
    ['ship class', isShipClassId, 'sloop', 'brig'],
    ['faction', isFactionId, 'english', 'pirate'],
    ['fitting', isFittingId, 'fine-canvas', 'new-sails'],
    ['lead', isLeadId, 'red-jackdaw', 'golden-finch'],
  ] as const)('recognizes only authored %s IDs', (_kind, isKnownId, knownId, unknownId) => {
    expect(isKnownId(knownId)).toBe(true);
    expect(isKnownId(unknownId)).toBe(false);
  });
});
