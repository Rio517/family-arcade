import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import type { CampaignEvent, CampaignJournal } from './events';
import {
  appendJournal,
  createJournal,
  replayCampaign,
  validateJournal,
} from './replay';

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

describe('replayCampaign', () => {
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
    journal.events[0].payload.leadId = 'blue-albatross' as never;
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
