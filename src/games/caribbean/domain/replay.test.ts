import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import { marketTradeDraft, quoteTrade } from './economy';
import { compactJournal } from './compactJournal';
import type { CampaignEvent, CampaignJournal } from './events';
import {
  appendJournal,
  createJournal,
  replayCampaign,
  validateJournal,
} from './replay';
import {
  battleWithdrawnDraft,
  encounterAvoidedDraft,
  navalEngagedDraft,
  navalResolvedDraft,
  seaLegCompletedDraft,
  voyageStartedDraft,
} from './voyage';

const ACCEPT_RED_JACKDAW = {
  type: 'lead-accepted',
  payload: { leadId: 'red-jackdaw' },
} as const;

function initialCampaign() {
  return createCampaign({
    seed: 1702,
    name: 'Morgan',
    pronouns: 'they/them',
    talent: 'navigation',
    length: 'adventure',
  });
}

function acceptedJournal(): CampaignJournal {
  return appendJournal(createJournal(initialCampaign()), ACCEPT_RED_JACKDAW);
}

function activeCheckpoint(lastEventId = 1, elapsedDays = 0): CampaignJournal {
  const state = initialCampaign();
  state.calendar.elapsedDays = elapsedDays;
  state.lastEventId = lastEventId;
  state.leads = [{
    id: 'red-jackdaw', kind: 'rumour', status: 'active',
    acceptedDay: elapsedDays, expiresDay: elapsedDays + 18,
  }];
  return createJournal(state);
}

function voyageStreams() {
  const active = activeCheckpoint();
  const departed = appendJournal(active, voyageStartedDraft(active.state));
  const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
  const avoided = appendJournal(contact, encounterAvoidedDraft(contact.state));
  const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
  if (engaged.state.mode.kind !== 'naval') throw new Error('fixture must engage');
  const input = engaged.state.mode.input;
  const resolved = appendJournal(engaged, navalResolvedDraft(engaged.state, {
    battleId: 'voyage-2-battle',
    outcome: { kind: 'surrender', victorShipId: 'player' },
    atTick: 7,
    seedAfter: 1,
    player: { hull: 67, sails: 44, crew: 22, cannon: 3 },
    opponent: {
      hull: input.opponent.hull, sails: input.opponent.sails,
      crew: 8, cannon: input.opponent.cannon,
    },
    decisive: {
      kind: 'surrender', victorShipId: 'player', surrenderedShipId: 'opponent',
      threshold: 'crew', value: 8, thresholdValue: 8,
    },
  }));
  const withdrawn = appendJournal(engaged, battleWithdrawnDraft(engaged.state));
  return { active, departed, contact, avoided, engaged, resolved, withdrawn };
}

describe('replayCampaign', () => {
  it.each([
    ['avoid', () => voyageStreams().avoided],
    ['resolved battle', () => voyageStreams().resolved],
  ] as const)('replays the canonical %s voyage to exact JSON equality', (_label, journalForRow) => {
    // Kills final replay equality, any strategic reducer omission, and tactical damage leakage.
    const journal = journalForRow();
    const initialBefore = structuredClone(journal.initial);
    const eventsBefore = structuredClone(journal.events);

    const replayed = replayCampaign(journal.initial, journal.events);

    expect(JSON.stringify(replayed)).toBe(JSON.stringify(journal.state));
    expect(journal.initial).toEqual(initialBefore);
    expect(journal.events).toEqual(eventsBefore);
  });

  it('replays a full direct voyage through literal days 0 to 1 to 2', () => {
    // Kills validation against the initial day instead of the evolving reducer state.
    const { resolved } = voyageStreams();

    expect(resolved.events.map(({ id, atDay }) => ({ id, atDay }))).toEqual([
      { id: 2, atDay: 0 },
      { id: 3, atDay: 0 },
      { id: 4, atDay: 1 },
      { id: 5, atDay: 1 },
    ]);
    expect(resolved.state.calendar.elapsedDays).toBe(2);
    expect(replayCampaign(resolved.initial, resolved.events)).toEqual(resolved.state);
  });

  it('continues a nonzero day-7 checkpoint through events 8 to 10 and returns on day 9', () => {
    // Kills assumptions that voyage IDs/days begin at the opening checkpoint.
    const checkpoint = activeCheckpoint(7, 7);
    const departed = appendJournal(checkpoint, voyageStartedDraft(checkpoint.state));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const returned = appendJournal(contact, encounterAvoidedDraft(contact.state));

    expect(returned.events.map(({ id, atDay }) => ({ id, atDay }))).toEqual([
      { id: 8, atDay: 7 },
      { id: 9, atDay: 7 },
      { id: 10, atDay: 8 },
    ]);
    expect(returned.state.calendar.elapsedDays).toBe(9);
    expect(returned.state.world.lastVoyage).toEqual({
      voyageId: 'voyage-8', battleId: null, result: 'avoided', outcome: null, returnedDay: 9,
    });
    expect(replayCampaign(returned.initial, returned.events)).toEqual(returned.state);
  });

  it('replays a market trade to the canonical stored state', () => {
    const journal = createJournal(initialCampaign());
    const quote = quoteTrade(journal.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
    });
    if (!quote.ok) throw new Error('fixture must quote');
    const traded = appendJournal(journal, marketTradeDraft(quote));

    expect(replayCampaign(traded.initial, traded.events)).toEqual(traded.state);
  });

  it('reproduces the stored state with canonical byte equality', () => {
    const journal = acceptedJournal();

    const replayed = replayCampaign(journal.initial, journal.events);

    expect(JSON.stringify(replayed)).toBe(JSON.stringify(journal.state));
  });

  it('replays structured-cloned inputs equivalently', () => {
    const journal = acceptedJournal();

    const direct = replayCampaign(journal.initial, journal.events);
    const cloned = replayCampaign(
      structuredClone(journal.initial),
      structuredClone(journal.events),
    );

    expect(JSON.stringify(cloned)).toBe(JSON.stringify(direct));
  });

  it('starts from a validated checkpoint with a nonzero last event ID', () => {
    const checkpoint = initialCampaign();
    checkpoint.calendar.elapsedDays = 12;
    checkpoint.lastEventId = 90;
    const event: CampaignEvent = {
      id: 91,
      type: 'lead-accepted',
      atDay: 12,
      payload: { leadId: 'red-jackdaw' },
    };

    const replayed = replayCampaign(checkpoint, [event]);

    expect(replayed.lastEventId).toBe(91);
    expect(replayed.leads[0]).toMatchObject({ acceptedDay: 12, expiresDay: 30 });
  });

  it('does not mutate or reuse replay inputs', () => {
    const journal = acceptedJournal();
    const initialBefore = structuredClone(journal.initial);
    const eventsBefore = structuredClone(journal.events);

    const replayed = replayCampaign(journal.initial, journal.events);

    expect(journal.initial).toEqual(initialBefore);
    expect(journal.events).toEqual(eventsBefore);
    expect(replayed).not.toBe(journal.initial);
    expect(replayed.leads).not.toBe(journal.initial.leads);
  });

  it('uses the validated snapshot when replaying a descriptor-safe proxy state', () => {
    const target = initialCampaign();
    let liveReads = 0;
    const proxy = new Proxy(target, {
      get: () => {
        liveReads += 1;
        throw new Error('unsafe live read');
      },
    });

    const replayed = replayCampaign(proxy, []);

    expect(replayed).toEqual(target);
    expect(Object.is(replayed, proxy)).toBe(false);
    expect(liveReads).toBe(0);
  });
});

describe('validateJournal', () => {
  it('folds event-day validation through reducer-owned voyage advancement', () => {
    // Catches the former initial-day comparison after the sea leg advances to day one.
    const initial = initialCampaign();
    initial.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }];
    initial.lastEventId = 1;
    const departed = appendJournal(createJournal(initial), voyageStartedDraft(initial));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));

    expect(engaged.events.map((event) => event.atDay)).toEqual([0, 0, 1]);
    expect(validateJournal(engaged)).toEqual({ ok: true, value: engaged });

    const wrongDay = structuredClone(engaged);
    wrongDay.events[2].atDay = 0;
    expect(validateJournal(wrongDay)).toEqual({
      ok: false,
      issues: [{ path: 'events.2.atDay', code: 'invariant' }],
    });
  });
  it('rejects a post-return event stamped with the pre-leg day at the exact reducer-owned path', () => {
    // Kills accepting the resolution against the initial checkpoint day.
    const { resolved } = voyageStreams();
    const wrongDay = structuredClone(resolved);
    wrongDay.events[3].atDay = 0;

    expect(validateJournal(wrongDay)).toEqual({
      ok: false,
      issues: [{ path: 'events.3.atDay', code: 'invariant' }],
    });
  });
  it('accepts a replay-equivalent journal and returns a safe clone', () => {
    const journal = acceptedJournal();

    const result = validateJournal(journal);

    expect(result).toEqual({ ok: true, value: journal });
    if (result.ok) {
      expect(result.value).not.toBe(journal);
      expect(result.value.initial).not.toBe(journal.initial);
      expect(result.value.events).not.toBe(journal.events);
      expect(result.value.state).not.toBe(journal.state);
    }
  });

  it('reports final state drift as a replay mismatch', () => {
    const journal = acceptedJournal();
    journal.state.wealth.gold += 1;

    expect(validateJournal(journal)).toEqual({
      ok: false,
      issues: [{ path: 'state', code: 'replay-mismatch' }],
    });
  });

  it('aggregates invalid initial, event payload, and stored state boundaries', () => {
    const journal = acceptedJournal();
    journal.initial.fleet.flagshipId = 'missing';
    const [event] = journal.events;
    if (event.type !== 'lead-accepted') throw new Error('fixture must accept the Red Jackdaw');
    event.payload.leadId = 'blue-albatross' as never;
    journal.state.wealth.gold = -1;

    expect(validateJournal(journal)).toEqual({
      ok: false,
      issues: [
        { path: 'initial.fleet.flagshipId', code: 'invariant' },
        { path: 'events.0.payload.leadId', code: 'unknown-id' },
        { path: 'state.wealth.gold', code: 'out-of-range' },
      ],
    });
  });

  it('rejects a noncontiguous event ID at its exact journal path', () => {
    const journal = acceptedJournal();
    journal.events[0].id = 2;
    journal.state.lastEventId = 2;

    expect(validateJournal(journal)).toEqual({
      ok: false,
      issues: [{ path: 'events.0.id', code: 'invariant' }],
    });
  });

  it('rejects an event day that differs from its predecessor day', () => {
    const journal = acceptedJournal();
    journal.events[0].atDay = 1;
    journal.state.leads[0].acceptedDay = 1;
    journal.state.leads[0].expiresDay = 19;

    expect(validateJournal(journal)).toEqual({
      ok: false,
      issues: [{ path: 'events.0.atDay', code: 'invariant' }],
    });
  });

  it('rejects malformed journal and event shapes without throwing', () => {
    const journal = acceptedJournal() as unknown as Record<string, unknown>;
    journal.extra = true;
    journal.events = [{
      id: 1,
      type: 'lead-accepted',
      atDay: 0,
      payload: {},
    }];

    expect(validateJournal(journal)).toEqual({
      ok: false,
      issues: [
        { path: 'extra', code: 'unknown-key' },
        { path: 'events.0.payload.leadId', code: 'missing' },
      ],
    });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(validateJournal(cyclic)).toEqual({
      ok: false,
      issues: [{ path: '$', code: 'non-json' }],
    });
  });

  it('does not mutate untrusted input while validating it', () => {
    const journal = acceptedJournal();
    const before = structuredClone(journal);

    validateJournal(journal);

    expect(journal).toEqual(before);
  });
});

describe('checkpoint append', () => {
  it('starts literal voyage-6 after a battle return and after compacting that returned journal', () => {
    // Kills lineage reset on return or compaction and append logic that requires predecessor events.
    const { withdrawn } = voyageStreams();
    expect(withdrawn.state.lastEventId).toBe(5);
    expect(withdrawn.state.calendar.elapsedDays).toBe(2);
    const direct = appendJournal(withdrawn, voyageStartedDraft(withdrawn.state));
    expect(direct.events.at(-1)).toEqual({
      id: 6,
      type: 'voyage-started',
      atDay: 2,
      payload: { voyageId: 'voyage-6' },
    });

    const compacted = compactJournal(withdrawn);
    expect(compacted.events).toEqual([]);
    expect(compacted.initial.lastEventId).toBe(5);
    const continued = appendJournal(compacted, voyageStartedDraft(compacted.state));
    expect(continued.events).toEqual([{
      id: 6,
      type: 'voyage-started',
      atDay: 2,
      payload: { voyageId: 'voyage-6' },
    }]);
    expect(validateJournal(continued)).toEqual({ ok: true, value: continued });
  });

  it('continues at the checkpoint event ID plus one', () => {
    const checkpoint = initialCampaign();
    checkpoint.calendar.elapsedDays = 12;
    checkpoint.lastEventId = 90;

    const next = appendJournal(createJournal(checkpoint), ACCEPT_RED_JACKDAW);

    expect(next.events[0]).toMatchObject({ id: 91, atDay: 12 });
    expect(next.state.lastEventId).toBe(91);
  });

  it('rejects append when the stored state does not replay from its base', () => {
    const journal = createJournal(initialCampaign());
    journal.state.wealth.gold += 1;
    const before = structuredClone(journal);

    expect(() => appendJournal(journal, ACCEPT_RED_JACKDAW)).toThrowError(
      'Invalid campaign journal: state:replay-mismatch',
    );
    expect(journal).toEqual(before);
  });

  it('uses the validated snapshot when creating a journal from a descriptor-safe proxy', () => {
    const target = initialCampaign();
    let liveReads = 0;
    const proxy = new Proxy(target, {
      get: () => {
        liveReads += 1;
        throw new Error('unsafe live read');
      },
    });

    const journal = createJournal(proxy);

    expect(journal.initial).toEqual(target);
    expect(journal.state).toEqual(target);
    expect(Object.is(journal.initial, proxy)).toBe(false);
    expect(liveReads).toBe(0);
  });
});
