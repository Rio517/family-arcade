import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
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
  it('records an avoided encounter and a withdrawn battle as distinct safe returns', () => {
    // Catches return classification that accidentally resolves the target or carries tactical damage.
    const initial = activeLeadCampaign();
    const departed = appendJournal(createJournal(initial), voyageStartedDraft(initial));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const avoided = appendJournal(contact, encounterAvoidedDraft(contact.state));
    expect(avoided.state.world.lastVoyage).toEqual({ voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2 });
    expect(avoided.state.leads[0].status).toBe('active');

    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
    const withdrawn = appendJournal(engaged, battleWithdrawnDraft(engaged.state));
    expect(withdrawn.state.world.lastVoyage).toEqual({ voyageId: 'voyage-2', battleId: 'voyage-2-battle', result: 'withdrew', outcome: null, returnedDay: 2 });
    expect(withdrawn.state.world.targetDefeated).toBe(false);
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
      player: { hull: input.player.hull, sails: input.player.sails, crew: input.player.crew, cannon: input.player.cannon },
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
    expect(departed.events.at(-1)).toMatchObject({ id: 2, type: 'voyage-started', payload: { voyageId: 'voyage-2' } });
    expect(contact.events.at(-1)).toMatchObject({ id: 3, type: 'sea-leg-completed', payload: { voyageId: 'voyage-2', encounterId: 'voyage-2-contact' } });
    expect(engaged.events.at(-1)).toMatchObject({ id: 4, type: 'naval-engaged', payload: { voyageId: 'voyage-2', encounterId: 'voyage-2-contact', battleId: 'voyage-2-battle' } });
    expect(returned.events.at(-1)).toMatchObject({ id: 5, type: 'naval-resolved', payload: { voyageId: 'voyage-2', battleId: 'voyage-2-battle' } });
  });
});
