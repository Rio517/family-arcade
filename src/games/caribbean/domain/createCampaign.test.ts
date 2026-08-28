import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';

const ALL_LENGTHS = ['adventure', 'voyage', 'legend'] as const;
const ALL_TALENTS = ['fencing', 'gunnery', 'navigation', 'charm', 'medicine'] as const;

describe('createCampaign', () => {
  it('creates byte-identical state for the same seed and choices', () => {
    const options = {
      seed: 1702,
      name: 'Morgan',
      pronouns: 'she/her',
      talent: 'gunnery',
      length: 'legend',
    } as const;

    expect(JSON.stringify(createCampaign(options))).toBe(JSON.stringify(createCampaign(options)));
  });

  it.each(ALL_LENGTHS)('accepts the %s career length', (length) => {
    expect(createCampaign({ seed: 1702, length }).career.length).toBe(length);
  });

  it.each(ALL_TALENTS)('accepts the %s captain talent', (talent) => {
    expect(createCampaign({ seed: 1702, talent }).captain.talent).toBe(talent);
  });

  it('uses the recommended choices and exact opening state', () => {
    expect(createCampaign({ seed: 1702 })).toEqual({
      schemaVersion: 1,
      contentVersion: 'caribbean-slice-1',
      campaignId: 'campaign-1702',
      seed: 1702,
      career: { length: 'adventure' },
      calendar: { startYear: 1675, elapsedDays: 0 },
      mode: { kind: 'port', portId: 'bridgetown' },
      captain: { name: 'Captain', pronouns: 'they/them', talent: 'navigation' },
      wealth: { gold: 500, earned: 0 },
      crew: { morale: 'content' },
      fleet: {
        flagshipId: 'mistral',
        ships: [
          {
            id: 'mistral',
            classId: 'sloop',
            name: 'Mistral',
            hull: 100,
            sails: 100,
            crew: 50,
            cannon: 8,
            cargo: {
              provisions: 34,
              tools: 4,
              luxuries: 0,
              'sugar-molasses': 0,
              'tobacco-dyewood': 0,
              'powder-arms': 0,
            },
            fittings: [],
          },
        ],
      },
      standings: { english: 0, french: 0, spanish: 0, dutch: 0 },
      world: {
        ports: { bridgetown: { prosperity: 'modest', defense: 'guarded' } },
        targetDefeated: false,
      },
      leads: [],
      relationships: {},
      legacy: { capturedShips: 0, goldEarned: 0 },
      rng: { world: 3_421_356_530, navigation: 3_913_270_709, naval: 3_992_748_115 },
      lastEventId: 0,
    });
  });

  it('keeps the three deterministic RNG streams independent', () => {
    const first = createCampaign({ seed: 1702 });
    const second = createCampaign({ seed: 1703 });

    expect(new Set(Object.values(first.rng))).toHaveLength(3);
    expect(second.rng.world).not.toBe(first.rng.world);
    expect(second.rng.navigation).not.toBe(first.rng.navigation);
    expect(second.rng.naval).not.toBe(first.rng.naval);
  });

  it('does not share mutable defaults between campaigns', () => {
    const first = createCampaign({ seed: 1702 });
    const second = createCampaign({ seed: 1702 });

    first.fleet.ships[0].cargo.provisions = 0;
    first.fleet.ships[0].fittings.push('fine-canvas');
    first.fleet.ships.push(structuredClone(first.fleet.ships[0]));
    first.standings.english = 50;
    first.world.targetDefeated = true;
    first.leads.push({
      id: 'red-jackdaw',
      kind: 'rumour',
      status: 'active',
      acceptedDay: 0,
      expiresDay: 18,
    });
    first.relationships.anne = { stage: 'friendly' };

    expect(second.fleet.ships).toHaveLength(1);
    expect(second.fleet.ships[0].cargo.provisions).toBe(34);
    expect(second.fleet.ships[0].fittings).toEqual([]);
    expect(second.standings.english).toBe(0);
    expect(second.world.targetDefeated).toBe(false);
    expect(second.leads).toEqual([]);
    expect(second.relationships).toEqual({});
  });

  it.each([
    [{ seed: -1 }, 'Invalid campaign options: seed:out-of-range'],
    [{ seed: 1.5 }, 'Invalid campaign options: seed:not-integer'],
    [
      { seed: Number.NaN, name: ' ', pronouns: '', talent: 'luck', length: 'short' },
      'Invalid campaign options: seed:not-finite, name:out-of-range, pronouns:out-of-range, talent:unknown-id, length:unknown-id',
    ],
  ] as const)('rejects invalid trusted options without coercion: %#', (options, message) => {
    expect(() => createCampaign(options as never)).toThrowError(message);
  });
});
