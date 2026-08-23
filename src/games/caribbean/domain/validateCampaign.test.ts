import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import type { CampaignMode, CampaignStateV1, ShipState, ValidationIssue } from './types';
import { validateCampaign } from './validateCampaign';

function validCampaign(): CampaignStateV1 {
  return createCampaign({ seed: 1702 });
}

function expectIssues(input: unknown, issues: ValidationIssue[]): void {
  expect(validateCampaign(input)).toEqual({ ok: false, issues });
}

function secondSloop(id = 'second-sloop'): ShipState {
  const ship = structuredClone(validCampaign().fleet.ships[0]);
  ship.id = id;
  return ship;
}

describe('validateCampaign', () => {
  it('returns the original canonical campaign when it is valid', () => {
    const state = validCampaign();

    const result = validateCampaign(state);
    expect(result).toEqual({ ok: true, value: state });
    if (result.ok) expect(result.value).toBe(state);
  });

  it('collects deeply malformed fields in exact canonical order without mutation', () => {
    const input = validCampaign() as unknown as Record<string, unknown>;
    input.surprise = true;
    input.schemaVersion = 2;
    input.contentVersion = 'old-slice';
    input.campaignId = 'Campaign 1702';
    input.seed = -1;
    input.career = { extra: true, length: 'short' };
    input.calendar = { startYear: 1676, elapsedDays: 1.5 };
    input.mode = { kind: 'port', portId: 'tortuga', activity: 'menu' };
    input.captain = { name: ' ', pronouns: 7, talent: 'luck' };
    input.wealth = { gold: -1, earned: 0.5 };
    input.crew = { morale: 'furious' };
    const before = structuredClone(input);

    expectIssues(input, [
      { path: 'surprise', code: 'unknown-key' },
      { path: 'schemaVersion', code: 'invariant' },
      { path: 'contentVersion', code: 'unknown-id' },
      { path: 'campaignId', code: 'out-of-range' },
      { path: 'seed', code: 'out-of-range' },
      { path: 'career.extra', code: 'unknown-key' },
      { path: 'career.length', code: 'unknown-id' },
      { path: 'calendar.startYear', code: 'invariant' },
      { path: 'calendar.elapsedDays', code: 'not-integer' },
      { path: 'mode.activity', code: 'unknown-key' },
      { path: 'mode.portId', code: 'unknown-id' },
      { path: 'captain.name', code: 'out-of-range' },
      { path: 'captain.pronouns', code: 'wrong-type' },
      { path: 'captain.talent', code: 'unknown-id' },
      { path: 'wealth.gold', code: 'out-of-range' },
      { path: 'wealth.earned', code: 'not-integer' },
      { path: 'crew.morale', code: 'unknown-id' },
    ]);
    expect(input).toEqual(before);
  });

  it.each([
    [null, { path: '$', code: 'wrong-type' }],
    [42, { path: '$', code: 'wrong-type' }],
    [[], { path: '$', code: 'wrong-type' }],
    [new Date(0), { path: '$', code: 'non-json' }],
    [new Map(), { path: '$', code: 'non-json' }],
    [() => undefined, { path: '$', code: 'non-json' }],
    [1n, { path: '$', code: 'non-json' }],
  ] as const)('rejects non-record and non-JSON root input: %#', (input, issue) => {
    expectIssues(input, [issue]);
  });

  it('rejects cycles, symbol keys, undefined, sparse arrays, and non-finite numbers as non-JSON', () => {
    const cycle = validCampaign() as unknown as Record<string, unknown>;
    cycle.self = cycle;
    expectIssues(cycle, [{ path: 'self', code: 'non-json' }]);

    const symbolKeyed = validCampaign() as CampaignStateV1 & Record<symbol, unknown>;
    symbolKeyed[Symbol('hidden')] = true;
    expectIssues(symbolKeyed, [{ path: '$', code: 'non-json' }]);

    const undefinedName = validCampaign() as unknown as { captain: { name: unknown } };
    undefinedName.captain.name = undefined;
    expectIssues(undefinedName, [{ path: 'captain.name', code: 'non-json' }]);

    const sparseLeads = validCampaign() as unknown as { leads: unknown[] };
    sparseLeads.leads = Array(1);
    expectIssues(sparseLeads, [{ path: 'leads.0', code: 'non-json' }]);

    const nonFinite = validCampaign();
    nonFinite.seed = Number.POSITIVE_INFINITY;
    expectIssues(nonFinite, [{ path: 'seed', code: 'non-json' }]);
  });

  it('rejects accessor-backed fields without invoking a stateful getter', () => {
    const state = validCampaign();
    let reads = 0;
    Object.defineProperty(state, 'seed', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads === 1) return 1702;
        throw new Error('unsafe second read');
      },
    });

    expectIssues(state, [{ path: 'seed', code: 'non-json' }]);
    expect(reads).toBe(0);
    expect(Object.getOwnPropertyDescriptor(state, 'seed')?.get).toBeTypeOf('function');
  });

  it('returns stable issues for a proxy without invoking its throwing get trap', () => {
    const target = validCampaign();
    target.seed = -1;
    let reads = 0;
    const proxy = new Proxy(target, {
      get: () => {
        reads += 1;
        throw new Error('unsafe proxy read');
      },
    });

    expectIssues(proxy, [{ path: 'seed', code: 'out-of-range' }]);
    expect(reads).toBe(0);
    expect(target.seed).toBe(-1);
  });

  it('rejects symbol keys attached to canonical arrays', () => {
    const state = validCampaign();
    const leads = state.leads as unknown as Record<PropertyKey, unknown>;
    leads[Symbol('hidden')] = true;

    expectIssues(state, [{ path: 'leads', code: 'non-json' }]);
  });

  it('rejects extra string and function-valued properties attached to canonical arrays', () => {
    const state = validCampaign();
    const ships = state.fleet.ships as unknown as Record<string, unknown>;
    ships.note = 'hidden';
    ships.run = () => undefined;

    expectIssues(state, [
      { path: 'fleet.ships.note', code: 'unknown-key' },
      { path: 'fleet.ships.run', code: 'non-json' },
    ]);
  });

  it('rejects non-enumerable unknown record keys and non-enumerable canonical fields', () => {
    const unknown = validCampaign();
    Object.defineProperty(unknown, 'surprise', { configurable: true, value: true });
    expectIssues(unknown, [{ path: 'surprise', code: 'unknown-key' }]);

    const canonical = validCampaign();
    Object.defineProperty(canonical, 'seed', { configurable: true, enumerable: false, value: 1702 });
    expectIssues(canonical, [{ path: 'seed', code: 'non-json' }]);
  });

  it('suppresses stale descendant JSON issues when a parent or unknown subtree is rejected', () => {
    const state = validCampaign();
    const malformedCaptain = [undefined];
    state.captain = malformedCaptain as never;
    state.wealth.gold = -1;
    const input = state as unknown as Record<string, unknown>;
    const unknownSubtree = { value: undefined };
    input.surprise = unknownSubtree;

    expectIssues(input, [
      { path: 'surprise', code: 'unknown-key' },
      { path: 'captain', code: 'wrong-type' },
      { path: 'wealth.gold', code: 'out-of-range' },
    ]);
    expect(state.captain).toBe(malformedCaptain);
    expect(input.surprise).toBe(unknownSubtree);
  });

  it('rejects unknown and missing keys at records reducers index directly', () => {
    const extra = validCampaign() as unknown as { world: { ports: { bridgetown: Record<string, unknown> } } };
    extra.world.ports.bridgetown.market = {};
    expectIssues(extra, [{ path: 'world.ports.bridgetown.market', code: 'unknown-key' }]);

    const missing = validCampaign() as unknown as { standings: Record<string, unknown> };
    delete missing.standings.dutch;
    expectIssues(missing, [{ path: 'standings.dutch', code: 'missing' }]);
  });

  it.each([
    ['career length', (state: CampaignStateV1) => { state.career.length = 'short' as never; }, 'career.length'],
    ['captain talent', (state: CampaignStateV1) => { state.captain.talent = 'luck' as never; }, 'captain.talent'],
    ['crew morale', (state: CampaignStateV1) => { state.crew.morale = 'furious' as never; }, 'crew.morale'],
  ] as const)('rejects an invalid %s union member', (_label, mutate, path) => {
    const state = validCampaign();
    mutate(state);
    expectIssues(state, [{ path, code: 'unknown-id' }]);
  });

  it.each([
    ['sailing', { kind: 'sailing', voyageId: 'voyage-1', checkpoint: {} }],
    ['encounter', { kind: 'encounter', encounterId: 'encounter-1', voyageId: 'voyage-1', returnCheckpoint: {} }],
    ['naval', { kind: 'naval', battleId: 'battle-1', voyageId: 'voyage-1', input: {}, returnCheckpoint: {} }],
    ['capture', { kind: 'capture', battleId: 'battle-1', prize: {}, voyageId: 'voyage-1', returnCheckpoint: {} }],
    ['boarding', { kind: 'boarding', battleId: 'battle-1', voyageId: 'voyage-1', returnCheckpoint: {} }],
    ['treasure', { kind: 'treasure', leadId: 'red-jackdaw' }],
    ['shares', { kind: 'shares', portId: 'bridgetown' }],
    ['retired', { kind: 'retired', score: 0 }],
  ] as const)('reserves but rejects the %s mode until its transition package exists', (_kind, mode) => {
    const state = validCampaign();
    state.mode = mode as CampaignMode;
    expectIssues(state, [{ path: 'mode.kind', code: 'unknown-id' }]);
  });

  it.each([
    ['seed', (state: CampaignStateV1, value: number) => { state.seed = value; }],
    ['rng.world', (state: CampaignStateV1, value: number) => { state.rng.world = value; }],
    ['rng.navigation', (state: CampaignStateV1, value: number) => { state.rng.navigation = value; }],
    ['rng.naval', (state: CampaignStateV1, value: number) => { state.rng.naval = value; }],
    ['lastEventId', (state: CampaignStateV1, value: number) => { state.lastEventId = value; }],
  ] as const)('enforces uint32 boundaries for %s', (path, mutate) => {
    for (const accepted of [0, 0xffff_ffff]) {
      const state = validCampaign();
      mutate(state, accepted);
      expect(validateCampaign(state).ok).toBe(true);
    }

    for (const [value, code] of [[-1, 'out-of-range'], [1.5, 'not-integer'], [0x1_0000_0000, 'out-of-range']] as const) {
      const state = validCampaign();
      mutate(state, value);
      expectIssues(state, [{ path, code }]);
    }
  });

  it('enforces captain and ship name and pronoun Unicode-code-point lengths without normalizing', () => {
    const state = validCampaign();
    state.captain.name = '  Morgan  ';
    state.captain.pronouns = ' they/them ';
    state.fleet.ships[0].name = '  Mistral  ';
    expect(validateCampaign(state)).toEqual({ ok: true, value: state });

    for (const [path, mutate] of [
      ['captain.name', (value: string) => { state.captain.name = value; }],
      ['fleet.ships.0.name', (value: string) => { state.fleet.ships[0].name = value; }],
    ] as const) {
      for (const value of [' ', 'x'.repeat(41)]) {
        mutate(value);
        expectIssues(state, [{ path, code: 'out-of-range' }]);
      }
      mutate('Mistral');
    }

    for (const value of ['', 'x'.repeat(25)]) {
      state.captain.pronouns = value;
      expectIssues(state, [{ path: 'captain.pronouns', code: 'out-of-range' }]);
    }

    state.captain.pronouns = '😀'.repeat(24);
    expect(validateCampaign(state).ok).toBe(true);
  });

  it('enforces the fixed start year and nonnegative safe-integer elapsed day', () => {
    const state = validCampaign();
    state.calendar.startYear = 1676 as 1675;
    expectIssues(state, [{ path: 'calendar.startYear', code: 'invariant' }]);

    state.calendar.startYear = 1675;
    for (const [value, code] of [[-1, 'out-of-range'], [0.25, 'not-integer'], [Number.MAX_SAFE_INTEGER + 1, 'out-of-range']] as const) {
      state.calendar.elapsedDays = value;
      expectIssues(state, [{ path: 'calendar.elapsedDays', code }]);
    }
  });

  it('requires one to eight ships and exactly one existing flagship', () => {
    const empty = validCampaign();
    empty.fleet.ships = [];
    expectIssues(empty, [
      { path: 'fleet.ships', code: 'out-of-range' },
      { path: 'fleet.flagshipId', code: 'invariant' },
    ]);

    const nine = validCampaign();
    nine.fleet.ships.push(...Array.from({ length: 8 }, (_, index) => secondSloop(`sloop-${index}`)));
    expectIssues(nine, [{ path: 'fleet.ships', code: 'out-of-range' }]);

    const missing = validCampaign();
    missing.fleet.flagshipId = 'absent';
    expectIssues(missing, [{ path: 'fleet.flagshipId', code: 'invariant' }]);

    const duplicateFlagship = validCampaign();
    duplicateFlagship.fleet.ships.push(secondSloop('mistral'));
    expectIssues(duplicateFlagship, [
      { path: 'fleet.ships.1.id', code: 'duplicate' },
      { path: 'fleet.flagshipId', code: 'invariant' },
    ]);
  });

  it('requires unique stable ship IDs and rejects unknown class, fitting, and cargo IDs', () => {
    const duplicate = validCampaign();
    duplicate.fleet.ships.push(secondSloop('mistral'));
    expect(validateCampaign(duplicate)).toEqual({
      ok: false,
      issues: expect.arrayContaining([{ path: 'fleet.ships.1.id', code: 'duplicate' }]),
    });

    const unknown = validCampaign() as unknown as {
      fleet: { ships: Array<{ classId: unknown; cargo: Record<string, unknown>; fittings: unknown[] }> };
    };
    unknown.fleet.ships[0].classId = 'brig';
    delete unknown.fleet.ships[0].cargo.tools;
    unknown.fleet.ships[0].cargo.people = 2;
    unknown.fleet.ships[0].fittings = ['new-sails'];
    expectIssues(unknown, [
      { path: 'fleet.ships.0.classId', code: 'unknown-id' },
      { path: 'fleet.ships.0.cargo.people', code: 'unknown-key' },
      { path: 'fleet.ships.0.cargo.tools', code: 'missing' },
      { path: 'fleet.ships.0.fittings.0', code: 'unknown-id' },
    ]);
  });

  it('rejects duplicate fittings and more fittings than the authoritative sloop slots', () => {
    const duplicate = validCampaign();
    duplicate.fleet.ships[0].fittings = ['fine-canvas', 'fine-canvas'];
    expectIssues(duplicate, [{ path: 'fleet.ships.0.fittings.1', code: 'duplicate' }]);

    const three = validCampaign();
    three.fleet.ships[0].fittings = ['fine-canvas', 'careened-hull', 'reinforced-scantlings'];
    expectIssues(three, [{ path: 'fleet.ships.0.fittings', code: 'out-of-range' }]);
  });

  it.each([
    ['hull', 101],
    ['sails', 101],
    ['crew', 76],
    ['cannon', 13],
  ] as const)('enforces the authoritative sloop %s maximum', (field, value) => {
    const state = validCampaign();
    state.fleet.ships[0][field] = value;
    expectIssues(state, [{ path: `fleet.ships.0.${field}`, code: 'out-of-range' }]);
  });

  it('accounts for the opening 34 + 4 + (8 × 2) = 54 / 100 hold capacity', () => {
    const state = validCampaign();
    const ship = state.fleet.ships[0];
    const cargo = Object.values(ship.cargo).reduce((total, units) => total + units, 0);

    expect({ cargo, cannon: ship.cannon * 2, used: cargo + ship.cannon * 2, capacity: 100 }).toEqual({
      cargo: 38,
      cannon: 16,
      used: 54,
      capacity: 100,
    });
    expect(validateCampaign(state).ok).toBe(true);
  });

  it('accepts exact hold capacity and rejects one-unit overflow including fitting penalties', () => {
    const exact = validCampaign();
    exact.fleet.ships[0].cargo.provisions = 78;
    exact.fleet.ships[0].cargo.tools = 0;
    exact.fleet.ships[0].fittings = ['expanded-berths'];
    expect(validateCampaign(exact).ok).toBe(true);

    exact.fleet.ships[0].cargo.provisions = 79;
    expectIssues(exact, [{ path: 'fleet.ships.0', code: 'capacity-exceeded' }]);
  });

  it.each([
    ['wealth.gold', (state: CampaignStateV1) => { state.wealth.gold = -1; }],
    ['wealth.earned', (state: CampaignStateV1) => { state.wealth.earned = -1; }],
    ['legacy.capturedShips', (state: CampaignStateV1) => { state.legacy.capturedShips = -1; }],
    ['legacy.goldEarned', (state: CampaignStateV1) => { state.legacy.goldEarned = -1; }],
  ] as const)('rejects negative %s', (path, mutate) => {
    const state = validCampaign();
    mutate(state);
    expectIssues(state, [{ path, code: 'out-of-range' }]);
  });

  it.each([
    ['english', -101],
    ['french', 101],
    ['spanish', 1.5],
  ] as const)('rejects invalid %s standing', (faction, value) => {
    const state = validCampaign();
    state.standings[faction] = value;
    expectIssues(state, [{ path: `standings.${faction}`, code: value === 1.5 ? 'not-integer' : 'out-of-range' }]);
  });

  it('rejects duplicate and unknown leads', () => {
    const lead = {
      id: 'red-jackdaw',
      kind: 'rumour',
      status: 'active',
      acceptedDay: 0,
      expiresDay: 18,
    } as const;
    const duplicate = validCampaign();
    duplicate.leads = [structuredClone(lead), structuredClone(lead)];
    expectIssues(duplicate, [
      { path: 'leads', code: 'out-of-range' },
      { path: 'leads.1.id', code: 'duplicate' },
    ]);

    const unknown = validCampaign();
    unknown.leads = [{ ...lead, id: 'blue-albatross' as never }];
    expectIssues(unknown, [{ path: 'leads.0.id', code: 'unknown-id' }]);
  });

  it('rejects drifted lead and authored world union members', () => {
    const state = validCampaign();
    state.leads = [{
      id: 'red-jackdaw',
      kind: 'quest' as never,
      status: 'forgotten' as never,
      acceptedDay: 0,
      expiresDay: 18,
    }];
    state.world.ports.bridgetown.prosperity = 'rich' as never;
    state.world.ports.bridgetown.defense = 'open' as never;

    expectIssues(state, [
      { path: 'world.ports.bridgetown.prosperity', code: 'unknown-id' },
      { path: 'world.ports.bridgetown.defense', code: 'unknown-id' },
      { path: 'leads.0.kind', code: 'unknown-id' },
      { path: 'leads.0.status', code: 'unknown-id' },
    ]);
  });

  it('requires V1 relationships to remain empty', () => {
    const state = validCampaign();
    state.relationships.anne = { stage: 'friendly' };
    expectIssues(state, [{ path: 'relationships', code: 'invariant' }]);
  });
});
