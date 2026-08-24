import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import { RED_JACKDAW_VOYAGE } from '../content/voyage';
import { createRedJackdawBattleInput } from '../content/naval';
import { nextSeed } from './naval/rng';
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

type StrategicModeKind = 'sailing' | 'encounter' | 'naval';

function strategicBase(): CampaignStateV1 {
  const state = validCampaign();
  state.leads = [{
    id: 'red-jackdaw', kind: 'rumour', status: 'active',
    acceptedDay: 0, expiresDay: 18,
  }];
  return state;
}

function strategicModeState(kind: StrategicModeKind): CampaignStateV1 {
  const state = strategicBase();
  if (kind === 'sailing') {
    state.lastEventId = 2;
    state.fleet.ships[0].cargo.provisions = 2;
    state.mode = {
      kind: 'sailing',
      voyageId: 'voyage-2',
      checkpoint: {
        tick: 0,
        position: { x: 0, z: 0 },
        heading: Math.PI / 2,
        elapsedDays: 0,
        provisionsUsed: 0,
      },
    };
    return state;
  }
  if (kind === 'encounter') {
    state.lastEventId = 3;
    state.fleet.ships[0].cargo.provisions = 1;
    state.mode = {
      kind: 'encounter',
      voyageId: 'voyage-2',
      encounterId: 'voyage-2-contact',
      returnCheckpoint: {
        tick: 3_600,
        position: { x: 24, z: 4 },
        heading: Math.PI / 2,
        elapsedDays: 1,
        provisionsUsed: 1,
      },
    };
    return state;
  }
  state.lastEventId = 4;
  state.rng.naval = 1_971_161_494;
  state.fleet.ships[0].cargo.provisions = 1;
  state.mode = {
    kind: 'naval',
    voyageId: 'voyage-2',
    battleId: 'voyage-2-battle',
    returnCheckpoint: {
      tick: 3_600,
      position: { x: 24, z: 4 },
      heading: Math.PI / 2,
      elapsedDays: 1,
      provisionsUsed: 1,
    },
    input: {
      battleId: 'voyage-2-battle',
      seed: 1_971_161_494,
      windFrom: Math.PI / 3,
      windStrength: 1,
      arenaRadius: 92,
      timeLimitTicks: 14_400,
      objective: 'capture-red-jackdaw',
      player: {
        id: 'player', stableShipId: 'mistral', name: 'Mistral', classId: 'sloop',
        position: { x: 0, z: -36 }, heading: 0,
        hull: 100, sails: 100, crew: 50, cannon: 8,
      },
      opponent: {
        id: 'opponent', stableShipId: 'red-jackdaw', name: 'Red Jackdaw', classId: 'sloop',
        position: { x: 0, z: 36 }, heading: Math.PI,
        hull: 100, sails: 100, crew: 48, cannon: 8,
      },
    },
  };
  return state;
}

function setStrategicPath(state: CampaignStateV1, path: string, value: unknown): void {
  const keys = path.split('.');
  const final = keys.pop();
  if (!final) throw new Error('fixture path must not be empty');
  const parent = keys.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], state);
  (parent as Record<string, unknown>)[final] = value;
}

type StrategicModeMutation = readonly [
  string,
  StrategicModeKind,
  (state: CampaignStateV1) => void,
];

const STRATEGIC_MODE_MUTATIONS: readonly StrategicModeMutation[] = [
  ['sailing voyage lineage', 'sailing', (state) => setStrategicPath(state, 'mode.voyageId', 'voyage-3')],
  ['sailing contact checkpoint', 'sailing', (state) => setStrategicPath(state, 'mode.checkpoint', structuredClone(RED_JACKDAW_VOYAGE.contact))],
  ['sailing completed lead', 'sailing', (state) => { state.leads[0].status = 'completed'; }],
  ['sailing missing lead', 'sailing', (state) => { state.leads = []; }],
  ['sailing defeated target', 'sailing', (state) => { state.world.targetDefeated = true; }],
  ['sailing missing flagship', 'sailing', (state) => { state.fleet.flagshipId = 'missing'; }],
  ['sailing one provision', 'sailing', (state) => { state.fleet.ships[0].cargo.provisions = 1; }],
  ['encounter voyage lineage', 'encounter', (state) => setStrategicPath(state, 'mode.voyageId', 'voyage-3')],
  ['encounter contact lineage', 'encounter', (state) => setStrategicPath(state, 'mode.encounterId', 'voyage-2-wrong')],
  ['encounter start checkpoint', 'encounter', (state) => setStrategicPath(state, 'mode.returnCheckpoint', structuredClone(RED_JACKDAW_VOYAGE.start))],
  ['encounter range-only checkpoint', 'encounter', (state) => setStrategicPath(state, 'mode.returnCheckpoint.position.x', 25)],
  ['encounter lineage underflow', 'encounter', (state) => { state.lastEventId = 1; }],
  ['encounter completed lead', 'encounter', (state) => { state.leads[0].status = 'completed'; }],
  ['encounter missing lead', 'encounter', (state) => { state.leads = []; }],
  ['encounter defeated target', 'encounter', (state) => { state.world.targetDefeated = true; }],
  ['encounter missing flagship', 'encounter', (state) => { state.fleet.flagshipId = 'missing'; }],
  ['encounter zero provisions', 'encounter', (state) => { state.fleet.ships[0].cargo.provisions = 0; }],
  ['naval voyage lineage', 'naval', (state) => setStrategicPath(state, 'mode.voyageId', 'voyage-3')],
  ['naval wrapper battle lineage', 'naval', (state) => setStrategicPath(state, 'mode.battleId', 'voyage-2-wrong')],
  ['naval input battle lineage', 'naval', (state) => setStrategicPath(state, 'mode.input.battleId', 'voyage-2-wrong')],
  ['naval return checkpoint', 'naval', (state) => setStrategicPath(state, 'mode.returnCheckpoint.position.z', 5)],
  ['naval lineage underflow', 'naval', (state) => { state.lastEventId = 2; }],
  ['naval completed lead', 'naval', (state) => { state.leads[0].status = 'completed'; }],
  ['naval missing lead', 'naval', (state) => { state.leads = []; }],
  ['naval defeated target', 'naval', (state) => { state.world.targetDefeated = true; }],
  ['naval missing flagship', 'naval', (state) => { state.fleet.flagshipId = 'missing'; }],
  ['naval zero provisions', 'naval', (state) => { state.fleet.ships[0].cargo.provisions = 0; }],
  ['naval RNG seed mismatch', 'naval', (state) => { state.rng.naval = 1_971_161_495; }],
  ['naval input seed mismatch', 'naval', (state) => setStrategicPath(state, 'mode.input.seed', 1_971_161_495)],
  ...([
    ['windFrom', 0], ['windStrength', 2], ['arenaRadius', 93], ['timeLimitTicks', 14_401],
    ['objective', 'sink-red-jackdaw'],
  ] as const).map(([field, value]) => [
    `naval builder ${field}`,
    'naval',
    (state: CampaignStateV1) => setStrategicPath(state, `mode.input.${field}`, value),
  ] as const),
  ...(['player', 'opponent'] as const).flatMap((ship) => ([
    ['id', ship === 'player' ? 'opponent' : 'player'],
    ['stableShipId', `${ship}-wrong`], ['name', `${ship} wrong`], ['classId', 'wrong-class'],
    ['position.x', 1], ['position.z', 1], ['heading', 1],
    ['hull', 99], ['sails', 99], ['crew', ship === 'player' ? 49 : 47], ['cannon', 7],
  ] as const).map(([field, value]) => [
    `naval ${ship} ${field}`,
    'naval',
    (state: CampaignStateV1) => setStrategicPath(state, `mode.input.${ship}.${field}`, value),
  ] as const)),
];

describe('validateCampaign', () => {
  it.each(['sailing', 'encounter', 'naval'] as const)(
    'accepts the hand-authored canonical %s checkpoint literal',
    (kind) => {
      // Kills any validator drift from the authored route, lineage, or shared battle builder.
      const state = strategicModeState(kind);

      expect(validateCampaign(state)).toEqual({ ok: true, value: state });
    },
  );

  it.each(STRATEGIC_MODE_MUTATIONS)(
    'rejects the one-at-a-time %s mutation in a compactable %s checkpoint',
    (_label, kind, mutate) => {
      // Every row names the exact production equality/readiness branch it kills.
      const state = strategicModeState(kind);
      mutate(state);

      expect(validateCampaign(state)).toMatchObject({ ok: false });
    },
  );

  it.each([
    ['sailing', 'voyageId'], ['sailing', 'checkpoint'],
    ['encounter', 'voyageId'], ['encounter', 'encounterId'], ['encounter', 'returnCheckpoint'],
    ['naval', 'voyageId'], ['naval', 'battleId'], ['naval', 'input'], ['naval', 'returnCheckpoint'],
  ] as const)(
    'is total when canonical %s mode field %s is an accessor or non-enumerable',
    (kind, field) => {
      // Kills live property reads and descriptor elision at each new direct mode field.
      const accessorState = strategicModeState(kind);
      const accessorMode = accessorState.mode as unknown as Record<string, unknown>;
      const value = accessorMode[field];
      let reads = 0;
      Object.defineProperty(accessorMode, field, {
        configurable: true,
        enumerable: true,
        get: () => {
          reads += 1;
          throw new Error('unsafe live read');
        },
      });
      expect(() => validateCampaign(accessorState)).not.toThrow();
      expect(validateCampaign(accessorState)).toMatchObject({ ok: false });
      expect(reads).toBe(0);

      const hiddenState = strategicModeState(kind);
      const hiddenMode = hiddenState.mode as unknown as Record<string, unknown>;
      Object.defineProperty(hiddenMode, field, {
        configurable: true,
        enumerable: false,
        value,
      });
      expect(() => validateCampaign(hiddenState)).not.toThrow();
      expect(validateCampaign(hiddenState)).toMatchObject({ ok: false });
    },
  );

  it.each(['sailing', 'encounter', 'naval'] as const)(
    'accepts descriptor-safe %s mode proxies without live gets and rejects symbols, hidden keys, and throwing traps',
    (kind) => {
      // Kills direct mode reads and catch removal from the untrusted JSON snapshot boundary.
      const proxied = strategicModeState(kind);
      const target = proxied.mode;
      let reads = 0;
      proxied.mode = new Proxy(target, {
        get: () => {
          reads += 1;
          throw new Error('unsafe live read');
        },
      });
      expect(validateCampaign(proxied)).toMatchObject({ ok: true });
      expect(reads).toBe(0);

      const symbolState = strategicModeState(kind);
      (symbolState.mode as unknown as Record<PropertyKey, unknown>)[Symbol('hidden')] = true;
      expect(() => validateCampaign(symbolState)).not.toThrow();
      expect(validateCampaign(symbolState)).toMatchObject({ ok: false });

      const hiddenState = strategicModeState(kind);
      Object.defineProperty(hiddenState.mode, 'hidden', { configurable: true, value: true });
      expect(() => validateCampaign(hiddenState)).not.toThrow();
      expect(validateCampaign(hiddenState)).toMatchObject({ ok: false });

      const throwingState = strategicModeState(kind);
      throwingState.mode = new Proxy(throwingState.mode, {
        ownKeys: () => { throw new Error('unsafe key trap'); },
      });
      expect(() => validateCampaign(throwingState)).not.toThrow();
      expect(validateCampaign(throwingState)).toMatchObject({ ok: false });
    },
  );

  it.each([
    ['sailing', 'checkpoint.position.x'],
    ['encounter', 'returnCheckpoint.position.x'],
    ['naval', 'input.player.sails'],
    ['naval', 'input.opponent.cannon'],
  ] as const)('rejects a nested accessor in %s mode at %s without invoking it', (kind, path) => {
    // Kills nested descriptor bypasses in checkpoint and full-builder equality.
    const state = strategicModeState(kind);
    const keys = path.split('.');
    const final = keys.pop();
    if (!final) throw new Error('fixture path must not be empty');
    const parent = keys.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], state.mode);
    let reads = 0;
    Object.defineProperty(parent as object, final, {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        throw new Error('unsafe nested read');
      },
    });

    expect(() => validateCampaign(state)).not.toThrow();
    expect(validateCampaign(state)).toMatchObject({ ok: false });
    expect(reads).toBe(0);
  });

  it.each([
    ['avoided', null, null, false, 'active'],
    ['withdrew', 'voyage-2-battle', null, false, 'active'],
    ['victory', 'voyage-2-battle', { kind: 'sunk', victorShipId: 'player' }, true, 'completed'],
    ['defeat', 'voyage-2-battle', { kind: 'surrender', victorShipId: 'opponent' }, false, 'active'],
    ['unresolved', 'voyage-2-battle', { kind: 'separated', shipId: 'opponent' }, false, 'active'],
  ] as const)(
    'accepts the exact optional lastVoyage %s result invariant',
    (result, battleId, outcome, targetDefeated, leadStatus) => {
      // Kills omission of any durable result member or its target/lead binding.
      const state = strategicBase();
      state.calendar.elapsedDays = 2;
      state.world.targetDefeated = targetDefeated;
      state.leads[0].status = leadStatus;
      state.world.lastVoyage = {
        voyageId: 'voyage-2', battleId, result, outcome, returnedDay: 2,
      };

      expect(validateCampaign(state)).toEqual({ ok: true, value: state });
    },
  );

  it.each([
    ['avoided with a battle', (state: CampaignStateV1) => { state.world.lastVoyage!.battleId = 'voyage-2-battle'; }],
    ['avoided with an outcome', (state: CampaignStateV1) => { state.world.lastVoyage!.outcome = { kind: 'escaped', shipId: 'player' }; }],
    ['withdrawn without a battle', (state: CampaignStateV1) => {
      state.world.lastVoyage!.result = 'withdrew';
      state.world.lastVoyage!.battleId = null;
    }],
    ['victory with opponent victor', (state: CampaignStateV1) => {
      state.world.lastVoyage!.result = 'victory';
      state.world.lastVoyage!.battleId = 'voyage-2-battle';
      state.world.lastVoyage!.outcome = { kind: 'sunk', victorShipId: 'opponent' };
    }],
    ['defeat with player victor', (state: CampaignStateV1) => {
      state.world.lastVoyage!.result = 'defeat';
      state.world.lastVoyage!.battleId = 'voyage-2-battle';
      state.world.lastVoyage!.outcome = { kind: 'surrender', victorShipId: 'player' };
    }],
    ['unresolved with victor outcome', (state: CampaignStateV1) => {
      state.world.lastVoyage!.result = 'unresolved';
      state.world.lastVoyage!.battleId = 'voyage-2-battle';
      state.world.lastVoyage!.outcome = { kind: 'boarding-ready', victorShipId: 'player' };
    }],
    ['returned day drift', (state: CampaignStateV1) => { state.world.lastVoyage!.returnedDay = 1; }],
    ['negative returned day', (state: CampaignStateV1) => { state.world.lastVoyage!.returnedDay = -1; }],
    ['unknown summary key', (state: CampaignStateV1) => {
      (state.world.lastVoyage as unknown as Record<string, unknown>).extra = true;
    }],
    ['unknown outcome key', (state: CampaignStateV1) => {
      state.world.lastVoyage!.result = 'defeat';
      state.world.lastVoyage!.battleId = 'voyage-2-battle';
      state.world.lastVoyage!.outcome = { kind: 'surrender', victorShipId: 'opponent' };
      (state.world.lastVoyage!.outcome as unknown as Record<string, unknown>).extra = true;
    }],
  ] as const)('rejects lastVoyage mismatch: %s', (_label, mutate) => {
    // Each row kills one outcome/result/day/exact-key invariant.
    const state = strategicBase();
    state.calendar.elapsedDays = 2;
    state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2,
    };
    mutate(state);

    expect(validateCampaign(state)).toMatchObject({ ok: false });
  });

  it('binds a return day exactly in port and allows only a prior day while en route', () => {
    const state = strategicBase();
    state.calendar.elapsedDays = 3;
    state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2,
    };

    expect(validateCampaign(state)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([{ path: 'world.lastVoyage', code: 'invariant' }]),
    });

    state.lastEventId = 6;
    state.fleet.ships[0].cargo.provisions = 31;
    state.mode = {
      kind: 'encounter', voyageId: 'voyage-5', encounterId: 'voyage-5-contact',
      returnCheckpoint: structuredClone(RED_JACKDAW_VOYAGE.contact),
    };
    expect(validateCampaign(state)).toEqual({ ok: true, value: state });

    state.world.lastVoyage.returnedDay = 4;
    expect(validateCampaign(state)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([{ path: 'world.lastVoyage', code: 'invariant' }]),
    });
  });

  it('accepts the legacy V1 world with no lastVoyage own property', () => {
    // Kills accidentally making the post-Task-2 summary required on legacy saves.
    const state = validCampaign();
    delete state.world.lastVoyage;

    expect(Object.prototype.hasOwnProperty.call(state.world, 'lastVoyage')).toBe(false);
    expect(validateCampaign(state)).toEqual({ ok: true, value: state });
  });

  it('binds durable victory summaries to the target and Red Jackdaw lead terminal state', () => {
    // Catches compacted victory states that claim success without completing the strategic lead.
    const state = validCampaign();
    state.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }];
    state.world.targetDefeated = true;
    state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: 'voyage-2-battle', result: 'victory',
      outcome: { kind: 'sunk', victorShipId: 'player' }, returnedDay: 0,
    };
    expect(validateCampaign(state).ok).toBe(false);

    state.leads[0].status = 'completed';
    expect(validateCampaign(state).ok).toBe(true);

    state.world.targetDefeated = false;
    state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: 'voyage-2-battle', result: 'unresolved',
      outcome: { kind: 'escaped', shipId: 'player' }, returnedDay: 0,
    };
    expect(validateCampaign(state).ok).toBe(false);
  });
  it.each([
    ['missing checkpoint', (state: CampaignStateV1) => { state.lastEventId = 2; state.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }]; state.fleet.ships[0].cargo.provisions = 2; state.mode = { kind: 'sailing', voyageId: 'voyage-2' } as never; }],
    ['missing encounter checkpoint', (state: CampaignStateV1) => { state.lastEventId = 3; state.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }]; state.fleet.ships[0].cargo.provisions = 1; state.mode = { kind: 'encounter', voyageId: 'voyage-2', encounterId: 'voyage-2-contact' } as never; }],
    ['missing naval input', (state: CampaignStateV1) => { state.lastEventId = 4; state.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }]; state.fleet.ships[0].cargo.provisions = 1; state.mode = { kind: 'naval', voyageId: 'voyage-2', battleId: 'voyage-2-battle' } as never; }],
  ] as const)('is total for malformed strategic mode: %s', (_label, mutate) => {
    // Catches canonicalJson receiving the validator's MISSING sentinel.
    const state = validCampaign();
    mutate(state);
    expect(() => validateCampaign(state)).not.toThrow();
    expect(validateCampaign(state).ok).toBe(false);
  });
  it('accepts the authored compactable sailing, encounter, and naval checkpoints', () => {
    // Catches acceptance of resumable modes without relaxing their cross-field facts.
    const sailing = validCampaign();
    sailing.lastEventId = 2;
    sailing.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }];
    sailing.mode = { kind: 'sailing', voyageId: 'voyage-2', checkpoint: structuredClone(RED_JACKDAW_VOYAGE.start) };
    sailing.fleet.ships[0].cargo.provisions = 2;
    expect(validateCampaign(sailing).ok).toBe(true);

    const encounter = structuredClone(sailing);
    encounter.lastEventId = 3;
    encounter.mode = {
      kind: 'encounter', voyageId: 'voyage-2', encounterId: 'voyage-2-contact',
      returnCheckpoint: structuredClone(RED_JACKDAW_VOYAGE.contact),
    };
    encounter.fleet.ships[0].cargo.provisions = 1;
    expect(validateCampaign(encounter).ok).toBe(true);

    const naval = structuredClone(encounter);
    naval.lastEventId = 4;
    naval.rng.naval = nextSeed(naval.rng.naval);
    naval.mode = {
      kind: 'naval', voyageId: 'voyage-2', battleId: 'voyage-2-battle',
      returnCheckpoint: structuredClone(RED_JACKDAW_VOYAGE.contact),
      input: createRedJackdawBattleInput({
        battleId: 'voyage-2-battle', seed: naval.rng.naval,
        player: {
          stableShipId: naval.fleet.ships[0].id, name: naval.fleet.ships[0].name,
          classId: naval.fleet.ships[0].classId, hull: naval.fleet.ships[0].hull,
          sails: naval.fleet.ships[0].sails, crew: naval.fleet.ships[0].crew,
          cannon: naval.fleet.ships[0].cannon,
        },
      }),
    };
    expect(validateCampaign(naval).ok).toBe(true);
  });
  it('returns a detached canonical campaign snapshot when it is valid', () => {
    const state = validCampaign();

    const result = validateCampaign(state);
    expect(result).toEqual({ ok: true, value: state });
    if (result.ok) {
      expect(result.value).not.toBe(state);
      expect(result.value.fleet).not.toBe(state.fleet);
      expect(result.value.fleet.ships[0]).not.toBe(state.fleet.ships[0]);
    }
  });

  it('returns a clone-safe snapshot without invoking live reads on a valid proxy', () => {
    const target = validCampaign();
    let liveReads = 0;
    let ownKeyReads = 0;
    let seedDescriptorReads = 0;
    const proxy = new Proxy(target, {
      get: () => {
        liveReads += 1;
        throw new Error('unsafe live read');
      },
      getOwnPropertyDescriptor: (current, key) => {
        if (key === 'seed') seedDescriptorReads += 1;
        if (seedDescriptorReads > 1) throw new Error('unsafe repeated descriptor read');
        return Reflect.getOwnPropertyDescriptor(current, key);
      },
      ownKeys: (current) => {
        ownKeyReads += 1;
        return Reflect.ownKeys(current);
      },
    });

    const result = validateCampaign(proxy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.is(result.value, proxy)).toBe(false);
      expect(result.value).toEqual(target);
      expect(() => structuredClone(result.value)).not.toThrow();
    }
    expect(liveReads).toBe(0);
    expect(ownKeyReads).toBe(1);
    expect(seedDescriptorReads).toBe(1);
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

  it('preserves captured array length when a proxy reports an out-of-range numeric own key', () => {
    const state = validCampaign();
    const target: unknown[] = [];
    const lead = {
      id: 'red-jackdaw',
      kind: 'rumour',
      status: 'active',
      acceptedDay: 0,
      expiresDay: 18,
    };
    let reads = 0;
    const proxy = new Proxy(target, {
      ownKeys: () => ['length', '0'],
      getOwnPropertyDescriptor: (_value, key) => key === 'length'
        ? Reflect.getOwnPropertyDescriptor(target, 'length')
        : { configurable: true, enumerable: true, value: lead, writable: true },
      get: () => {
        reads += 1;
        throw new Error('unsafe proxy read');
      },
    });
    state.leads = proxy as CampaignStateV1['leads'];

    expectIssues(state, [{ path: 'leads.0', code: 'unknown-key' }]);
    expect(reads).toBe(0);
    expect(target).toHaveLength(0);
    expect(Object.prototype.hasOwnProperty.call(target, '0')).toBe(false);
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
    ['capture', { kind: 'capture', battleId: 'battle-1', prize: {}, voyageId: 'voyage-1', returnCheckpoint: {} }],
    ['boarding', { kind: 'boarding', battleId: 'battle-1', voyageId: 'voyage-1', returnCheckpoint: {} }],
    ['treasure', { kind: 'treasure', leadId: 'red-jackdaw' }],
    ['shares', { kind: 'shares', portId: 'bridgetown' }],
    ['retired', { kind: 'retired', score: 0 }],
  ] as const)('continues to reject the unsupported reserved %s mode', (_kind, mode) => {
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

  it.each([
    [11, false],
    [12, true],
  ] as const)('enforces the authoritative sloop crew minimum at %i', (crew, accepted) => {
    const state = validCampaign();
    state.fleet.ships[0].crew = crew;

    if (accepted) {
      expect(validateCampaign(state).ok).toBe(true);
    } else {
      expectIssues(state, [{ path: 'fleet.ships.0.crew', code: 'out-of-range' }]);
    }
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
