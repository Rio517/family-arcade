import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import { classifyResolution } from './reduceCampaign';
import type { NavalBattleInput, NavalOutcome, NavalResolution } from './naval/types';
import {
  battleWithdrawnDraft,
  encounterAvoidedDraft,
  navalEngagedDraft,
  navalResolvedDraft,
  seaLegCompletedDraft,
  voyageReadiness,
  voyageBlockedCopy,
  voyageStartedDraft,
  VoyageTransitionError,
} from './voyage';
import { appendJournal, createJournal } from './replay';

function activeLeadCampaign() {
  const state = createCampaign({ seed: 1702 });
  state.leads = [{
    id: 'red-jackdaw',
    kind: 'rumour',
    status: 'active',
    acceptedDay: 0,
    expiresDay: 18,
  }];
  state.lastEventId = 1;
  return state;
}

function voyageJournals() {
  const active = createJournal(activeLeadCampaign());
  const departed = appendJournal(active, voyageStartedDraft(active.state));
  const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
  const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
  return { active, departed, contact, engaged };
}

function resolutionFor(input: NavalBattleInput, outcome: NavalOutcome): NavalResolution {
  const player = {
    hull: input.player.hull,
    sails: input.player.sails,
    crew: input.player.crew,
    cannon: input.player.cannon,
  };
  const opponent = {
    hull: input.opponent.hull,
    sails: input.opponent.sails,
    crew: input.opponent.crew,
    cannon: input.opponent.cannon,
  };
  if (outcome.kind === 'surrender') {
    const surrenderedShipId = outcome.victorShipId === 'player' ? 'opponent' : 'player';
    const surrendered = surrenderedShipId === 'player' ? player : opponent;
    surrendered.crew = 8;
    return {
      battleId: 'voyage-2-battle', outcome, atTick: 7, seedAfter: 1,
      player, opponent,
      decisive: {
        kind: 'surrender', victorShipId: outcome.victorShipId, surrenderedShipId,
        threshold: 'crew', value: 8, thresholdValue: 8,
      },
    };
  }
  if (outcome.kind === 'sunk') {
    const sunkShipId = outcome.victorShipId === 'player' ? 'opponent' : 'player';
    const sunk = sunkShipId === 'player' ? player : opponent;
    sunk.hull = 0;
    return {
      battleId: 'voyage-2-battle', outcome, atTick: 7, seedAfter: 1,
      player, opponent,
      decisive: { kind: 'sunk', victorShipId: outcome.victorShipId, sunkShipId, hull: 0 },
    };
  }
  if (outcome.kind === 'boarding-ready') {
    opponent.sails = 24;
    opponent.crew = 16;
    return {
      battleId: 'voyage-2-battle', outcome, atTick: 7, seedAfter: 1,
      player, opponent,
      decisive: {
        kind: 'boarding-ready', victorShipId: 'player', range: 6, relativeSpeed: 1,
        targetSails: 24, targetCrew: 16, playerCrew: player.crew,
      },
    };
  }
  if (outcome.kind === 'escaped') {
    return {
      battleId: 'voyage-2-battle', outcome, atTick: 7, seedAfter: 1,
      player, opponent,
      decisive: {
        kind: 'escaped', shipId: outcome.shipId,
        distance: 93, arenaRadius: 92, outwardSpeed: 2,
      },
    };
  }
  if (outcome.kind !== 'separated') throw new Error('fixture outcome must be separated');
  return {
    battleId: 'voyage-2-battle', outcome, atTick: 14_400, seedAfter: 1,
    player, opponent,
    decisive: { kind: 'separated', shipId: outcome.shipId, timeLimitTicks: 14_400 },
  };
}

describe('voyage readiness', () => {
  it.each([
    ['not-in-bridgetown', 'Return to Bridgetown before setting sail.'],
    ['target-defeated', 'The Red Jackdaw lead is complete.'],
    ['lead-not-active', 'Mark the Red Jackdaw lead in the tavern first.'],
    ['flagship-unavailable', 'Choose an available flagship before setting sail.'],
    ['insufficient-provisions', 'Bring at least 2 provisions for this voyage.'],
  ] as const)('keeps player-facing blocked copy canonical for %s', (reason, copy) => {
    expect(voyageBlockedCopy(reason)).toBe(copy);
  });

  it('derives a replayable departure draft without mutating its active lead state', () => {
    // Catches the ready branch and a draft that fails to use next event lineage.
    const state = activeLeadCampaign();
    const before = structuredClone(state);

    expect(state.lastEventId).toBe(1);
    expect(voyageReadiness(state)).toEqual({ kind: 'ready', requiredProvisions: 2 });
    expect(voyageStartedDraft(state)).toEqual({
      type: 'voyage-started',
      payload: { voyageId: 'voyage-2' },
    });
    expect(state).toEqual(before);
  });

  it('uses typed transition errors instead of coercing a wrong predecessor', () => {
    // Catches helpers that silently manufacture a contact from port state.
    try {
      seaLegCompletedDraft(activeLeadCampaign());
      throw new Error('fixture must reject the port predecessor');
    } catch (caught) {
      expect(caught).toBeInstanceOf(VoyageTransitionError);
      expect((caught as VoyageTransitionError).code).toBe('wrong-predecessor');
    }
  });

  it.each([
    // Catches canonical readiness precedence, rather than an arbitrary first failed condition.
    ['not-in-bridgetown', (state: ReturnType<typeof activeLeadCampaign>) => { state.mode = { kind: 'port', portId: 'bridgetown' }; state.mode.portId = 'bridgetown'; state.calendar.elapsedDays = 0; state.mode = { kind: 'shares', portId: 'bridgetown' }; }, 'not-in-bridgetown'],
    ['target-defeated', (state: ReturnType<typeof activeLeadCampaign>) => { state.world.targetDefeated = true; state.leads[0].status = 'completed'; }, 'target-defeated'],
    ['lead-not-active', (state: ReturnType<typeof activeLeadCampaign>) => { state.leads = []; }, 'lead-not-active'],
    ['flagship-unavailable', (state: ReturnType<typeof activeLeadCampaign>) => { state.fleet.flagshipId = 'missing'; }, 'flagship-unavailable'],
    ['insufficient-provisions', (state: ReturnType<typeof activeLeadCampaign>) => { state.fleet.ships[0].cargo.provisions = 1; }, 'insufficient-provisions'],
  ] as const)('returns %s in canonical precedence order', (_label, mutate, reason) => {
    const state = activeLeadCampaign();
    mutate(state);
    const before = structuredClone(state);

    expect(voyageReadiness(state)).toEqual({ kind: 'blocked', reason, requiredProvisions: 2 });
    expect(state).toEqual(before);
  });
});

describe('voyage transition sequence', () => {
  it.each([
    [{ kind: 'surrender', victorShipId: 'player' }, 'victory'],
    [{ kind: 'surrender', victorShipId: 'opponent' }, 'defeat'],
    [{ kind: 'sunk', victorShipId: 'player' }, 'victory'],
    [{ kind: 'sunk', victorShipId: 'opponent' }, 'defeat'],
    [{ kind: 'boarding-ready', victorShipId: 'player' }, 'victory'],
    [{ kind: 'boarding-ready', victorShipId: 'opponent' }, 'defeat'],
    [{ kind: 'escaped', shipId: 'player' }, 'unresolved'],
    [{ kind: 'escaped', shipId: 'opponent' }, 'unresolved'],
    [{ kind: 'separated', shipId: 'player' }, 'unresolved'],
    [{ kind: 'separated', shipId: 'opponent' }, 'unresolved'],
  ] as const)('classifies literal outcome %o as %s exhaustively', (outcome, expected) => {
    // Kills a missing switch member, victor inversion, or escape/separation fallback drift.
    expect(classifyResolution(outcome)).toBe(expected);
  });

  it.each([
    [{ kind: 'surrender', victorShipId: 'player' }, 'victory'],
    [{ kind: 'surrender', victorShipId: 'opponent' }, 'defeat'],
    [{ kind: 'sunk', victorShipId: 'player' }, 'victory'],
    [{ kind: 'sunk', victorShipId: 'opponent' }, 'defeat'],
    [{ kind: 'boarding-ready', victorShipId: 'player' }, 'victory'],
    [{ kind: 'escaped', shipId: 'player' }, 'unresolved'],
    [{ kind: 'escaped', shipId: 'opponent' }, 'unresolved'],
    [{ kind: 'separated', shipId: 'player' }, 'unresolved'],
    [{ kind: 'separated', shipId: 'opponent' }, 'unresolved'],
  ] as const)('returns the validated literal naval outcome %o as %s', (outcome, result) => {
    // Kills classifier changes through the real resolution validator/reducer boundary.
    const { engaged } = voyageJournals();
    if (engaged.state.mode.kind !== 'naval') throw new Error('fixture must engage');
    const returned = appendJournal(
      engaged,
      navalResolvedDraft(engaged.state, resolutionFor(engaged.state.mode.input, outcome)),
    );

    expect(returned.state.world.lastVoyage).toEqual({
      voyageId: 'voyage-2', battleId: 'voyage-2-battle', result,
      outcome, returnedDay: 2,
    });
    expect(returned.state.world.targetDefeated).toBe(result === 'victory');
    expect(returned.state.leads[0].status).toBe(result === 'victory' ? 'completed' : 'active');
  });

  it('records an avoided encounter and a withdrawn battle as distinct safe returns', () => {
    // Catches return classification that accidentally resolves the target or carries tactical damage.
    const initial = activeLeadCampaign();
    const departed = appendJournal(createJournal(initial), voyageStartedDraft(initial));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const avoided = appendJournal(contact, encounterAvoidedDraft(contact.state));
    expect(avoided.state.world.lastVoyage).toEqual({ voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2 });
    expect(avoided.state.leads[0].status).toBe('active');
    expect(avoided.state.fleet.ships[0].cargo.provisions).toBe(32);

    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
    const withdrawn = appendJournal(engaged, battleWithdrawnDraft(engaged.state));
    expect(withdrawn.state.world.lastVoyage).toEqual({ voyageId: 'voyage-2', battleId: 'voyage-2-battle', result: 'withdrew', outcome: null, returnedDay: 2 });
    expect(withdrawn.state.world.targetDefeated).toBe(false);
    expect(withdrawn.state.fleet.ships[0].cargo.provisions).toBe(32);
  });

  it('advances only the exact authored RNG stream at contact and engagement', () => {
    // Kills navigation/naval assignment swaps, stale assignment, and cross-stream mutation.
    const { active, departed, contact, engaged } = voyageJournals();

    expect(active.state.rng).toEqual({
      world: 3_421_356_530,
      navigation: 3_913_270_709,
      naval: 3_992_748_115,
    });
    expect(departed.state.rng).toEqual(active.state.rng);
    expect(contact.state.rng).toEqual({
      world: 3_421_356_530,
      navigation: 3_424_590_736,
      naval: 3_992_748_115,
    });
    expect(engaged.state.rng).toEqual({
      world: 3_421_356_530,
      navigation: 3_424_590_736,
      naval: 1_971_161_494,
    });
  });

  it('expires a non-victory lead exactly on the returned day while victory still completes it', () => {
    // Kills return-time lead expiry or a precedence swap between victory and expiry.
    const expiring = activeLeadCampaign();
    expiring.leads[0].expiresDay = 2;
    const departed = appendJournal(createJournal(expiring), voyageStartedDraft(expiring));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const avoided = appendJournal(contact, encounterAvoidedDraft(contact.state));
    expect(avoided.state.calendar.elapsedDays).toBe(2);
    expect(avoided.state.leads[0].status).toBe('expired');

    const victoryJournals = voyageJournals();
    victoryJournals.engaged.state.leads[0].expiresDay = 2;
    victoryJournals.engaged.initial.leads[0].expiresDay = 2;
    // Rebuild from the expiry-bearing checkpoint so journal replay remains canonical.
    const expiryCheckpoint = createJournal(victoryJournals.engaged.state);
    if (expiryCheckpoint.state.mode.kind !== 'naval') throw new Error('fixture must engage');
    const victory = appendJournal(
      expiryCheckpoint,
      navalResolvedDraft(
        expiryCheckpoint.state,
        resolutionFor(expiryCheckpoint.state.mode.input, { kind: 'sunk', victorShipId: 'player' }),
      ),
    );
    expect(victory.state.leads[0].status).toBe('completed');
  });

  it.each([
    ['voyage ID', (draft: ReturnType<typeof seaLegCompletedDraft>) => { draft.payload.voyageId = 'voyage-9'; }],
    ['encounter ID', (draft: ReturnType<typeof seaLegCompletedDraft>) => { draft.payload.encounterId = 'wrong-contact'; }],
    ['checkpoint', (draft: ReturnType<typeof seaLegCompletedDraft>) => { draft.payload.checkpoint.position.x = 25; }],
    ['navigation RNG before', (draft: ReturnType<typeof seaLegCompletedDraft>) => { draft.payload.navigationRng.before += 1; }],
    ['navigation RNG after', (draft: ReturnType<typeof seaLegCompletedDraft>) => { draft.payload.navigationRng.after += 1; }],
  ] as const)('rejects mismatched sea-leg %s without mutating the sailing journal', (_label, mutate) => {
    // Kills each canonical sea-leg predecessor equality independently.
    const { departed } = voyageJournals();
    const draft = seaLegCompletedDraft(departed.state);
    mutate(draft);
    const before = structuredClone(departed);

    expect(() => appendJournal(departed, draft)).toThrow(/Invalid voyage/);
    expect(departed).toEqual(before);
  });

  it.each([
    ['voyage ID', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.voyageId = 'voyage-9'; }],
    ['encounter ID', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.encounterId = 'wrong-contact'; }],
    ['wrapper battle ID', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.battleId = 'wrong-battle'; }],
    ['naval RNG before', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.navalRng.before += 1; }],
    ['naval RNG after', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.navalRng.after += 1; }],
    ['input battle ID', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.input.battleId = 'wrong-battle'; }],
    ['input seed', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.input.seed += 1; }],
    ['player sails', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.input.player.sails -= 1; }],
    ['opponent cannon', (draft: ReturnType<typeof navalEngagedDraft>) => { draft.payload.input.opponent.cannon -= 1; }],
  ] as const)('rejects mismatched engagement %s without mutating encounter state', (_label, mutate) => {
    // Kills wrapper/RNG/full-builder comparisons independently.
    const { contact } = voyageJournals();
    const draft = navalEngagedDraft(contact.state);
    mutate(draft);
    const before = structuredClone(contact);

    expect(() => appendJournal(contact, draft)).toThrow(/Invalid voyage/);
    expect(contact).toEqual(before);
  });

  it('rejects a same-shape invalid objective at the event boundary without mutating encounter state', () => {
    // Kills deferring NavalBattleInput literal branding to voyage builder equality.
    const { contact } = voyageJournals();
    const draft = navalEngagedDraft(contact.state);
    (draft.payload.input as unknown as Record<string, unknown>).objective = 'sink-red-jackdaw';
    const before = structuredClone(contact);

    expect(() => appendJournal(contact, draft)).toThrow(
      'Invalid campaign event: payload.input.objective:unknown-id',
    );
    expect(contact).toEqual(before);
  });

  it.each([
    ['voyage ID', (draft: ReturnType<typeof navalResolvedDraft>) => { draft.payload.voyageId = 'voyage-9'; }],
    ['wrapper battle ID', (draft: ReturnType<typeof navalResolvedDraft>) => { draft.payload.battleId = 'wrong-battle'; }],
    ['resolution battle ID', (draft: ReturnType<typeof navalResolvedDraft>) => { draft.payload.resolution.battleId = 'wrong-battle'; }],
  ] as const)('rejects mismatched resolution %s without mutating naval state', (_label, mutate) => {
    // Kills wrapper and tactical-resolution battle binding independently.
    const { engaged } = voyageJournals();
    if (engaged.state.mode.kind !== 'naval') throw new Error('fixture must engage');
    const draft = navalResolvedDraft(
      engaged.state,
      resolutionFor(engaged.state.mode.input, { kind: 'surrender', victorShipId: 'player' }),
    );
    mutate(draft);
    const before = structuredClone(engaged);

    expect(() => appendJournal(engaged, draft)).toThrow();
    expect(engaged).toEqual(before);
  });

  it('detaches every voyage state, RNG, world, input, and caller draft graph', () => {
    // Kills mutation/reuse of reducer inputs and nested strategic payloads.
    const { active, departed, contact } = voyageJournals();
    const activeBefore = structuredClone(active);
    const departedBefore = structuredClone(departed);
    const contactBefore = structuredClone(contact);
    const draft = navalEngagedDraft(contact.state);
    const draftBefore = structuredClone(draft);
    const engaged = appendJournal(contact, draft);
    expect(active).toEqual(activeBefore);
    expect(departed).toEqual(departedBefore);
    expect(contact).toEqual(contactBefore);
    expect(draft).toEqual(draftBefore);
    expect(engaged.state.world).not.toBe(contact.state.world);
    expect(engaged.state.rng).not.toBe(contact.state.rng);
    if (engaged.state.mode.kind !== 'naval') throw new Error('fixture must engage');
    expect(engaged.state.mode.input).not.toBe(draft.payload.input);
    expect(engaged.events.at(-1)?.payload).not.toBe(draft.payload);

    draft.payload.input.player.sails = 1;
    expect(engaged.state.mode.input.player.sails).toBe(100);
    expect((engaged.events.at(-1) as Extract<(typeof engaged.events)[number], { type: 'naval-engaged' }>).payload.input.player.sails).toBe(100);
  });

  it('rejects voyage departure when the uint32 event lineage is exhausted', () => {
    // Kills an overflow from 0xffffffff to a non-uint32 voyage event ID.
    const state = activeLeadCampaign();
    state.lastEventId = 0xffff_ffff;
    const journal = createJournal(state);

    expect(() => appendJournal(journal, voyageStartedDraft(state))).toThrowError(
      'Campaign event ID space exhausted',
    );
  });

  it('returns a victory voyage with a canonical durable summary', () => {
    // Catches a reducer that applies tactical damage, misses day/cost accounting, or fails to persist victory.
    const initial = activeLeadCampaign();
    const activeLeadJournal = createJournal(initial);
    const departed = appendJournal(activeLeadJournal, voyageStartedDraft(activeLeadJournal.state));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
    if (engaged.state.mode.kind !== 'naval') throw new Error('fixture must engage');
    const input = engaged.state.mode.input;
    const returned = appendJournal(engaged, navalResolvedDraft(engaged.state, {
      battleId: 'voyage-2-battle',
      outcome: { kind: 'surrender', victorShipId: 'player' },
      atTick: 7,
      seedAfter: 1,
      player: { hull: 67, sails: 44, crew: 22, cannon: 3 },
      opponent: { hull: input.opponent.hull, sails: input.opponent.sails, crew: 8, cannon: input.opponent.cannon },
      decisive: { kind: 'surrender', victorShipId: 'player', surrenderedShipId: 'opponent', threshold: 'crew', value: 8, thresholdValue: 8 },
    }));

    expect(returned.state.mode).toEqual({ kind: 'port', portId: 'bridgetown' });
    expect(returned.state.calendar.elapsedDays).toBe(2);
    expect(returned.state.fleet.ships[0].cargo.provisions).toBe(32);
    expect(returned.state.world.targetDefeated).toBe(true);
    expect(returned.state.world.lastVoyage).toEqual({
      voyageId: 'voyage-2', battleId: 'voyage-2-battle', result: 'victory',
      outcome: { kind: 'surrender', victorShipId: 'player' }, returnedDay: 2,
    });
    expect(returned.state.fleet.ships[0]).toMatchObject({
      hull: 100, sails: 100, crew: 50, cannon: 8,
      cargo: { provisions: 32 },
    });
    expect(departed.events.at(-1)).toMatchObject({ id: 2, type: 'voyage-started', payload: { voyageId: 'voyage-2' } });
    expect(contact.events.at(-1)).toMatchObject({ id: 3, type: 'sea-leg-completed', payload: { voyageId: 'voyage-2', encounterId: 'voyage-2-contact' } });
    expect(engaged.events.at(-1)).toMatchObject({ id: 4, type: 'naval-engaged', payload: { voyageId: 'voyage-2', encounterId: 'voyage-2-contact', battleId: 'voyage-2-battle' } });
    expect(returned.events.at(-1)).toMatchObject({ id: 5, type: 'naval-resolved', payload: { voyageId: 'voyage-2', battleId: 'voyage-2-battle' } });
  });
});
