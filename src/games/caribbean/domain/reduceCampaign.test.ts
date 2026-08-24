import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import { RED_JACKDAW_VOYAGE } from '../content/voyage';
import { marketTradeDraft, quoteTrade } from './economy';
import type { CampaignEvent, CampaignEventDraft } from './events';
import { validateCampaignEvent } from './events';
import { reduceCampaign } from './reduceCampaign';
import { appendJournal, createJournal } from './replay';

const ACCEPT_RED_JACKDAW: CampaignEventDraft = {
  type: 'lead-accepted',
  payload: { leadId: 'red-jackdaw' },
};

function initialCampaign() {
  return createCampaign({
    seed: 1702,
    name: 'Morgan',
    pronouns: 'they/them',
    talent: 'navigation',
    length: 'adventure',
  });
}

function acceptEvent(id = 1, atDay = 0): CampaignEvent {
  return {
    id,
    type: 'lead-accepted',
    atDay,
    payload: { leadId: 'red-jackdaw' },
  };
}

function marketEvent(payload: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'market-traded',
    atDay: 0,
    payload: {
      portId: 'bridgetown',
      shipId: 'mistral',
      cargoId: 'provisions',
      delta: 1,
      unitPrice: 4,
      ...payload,
    },
  };
}

describe('campaign journal append', () => {
  it('recognizes the replayable voyage event syntax before predecessor reduction', () => {
    // Catches an event union that leaves strategic events as unknown IDs.
    expect(validateCampaignEvent({
      id: 2, type: 'voyage-started', atDay: 0, payload: { voyageId: 'voyage-2' },
    })).toMatchObject({ ok: true });
  });

  it('rejects shallow strategic payloads and returns a detached nested snapshot', () => {
    // Catches the old outer-record-only parser and journal aliasing.
    const malformed = {
      id: 4, type: 'naval-engaged', atDay: 1,
      payload: {
        voyageId: 'voyage-2', encounterId: 'voyage-2-contact', battleId: 'voyage-2-battle',
        navalRng: { before: 1, after: 1 }, input: {},
      },
    };
    expect(validateCampaignEvent(malformed)).toMatchObject({ ok: false });
  });

  it('accepts zero-valued RNG syntax and detaches nested strategic payloads', () => {
    // Catches treating RNG lineage like a positive event ID and nested event aliasing.
    const raw = {
      id: 3, type: 'sea-leg-completed', atDay: 0,
      payload: {
        voyageId: 'voyage-2', encounterId: 'voyage-2-contact',
        checkpoint: structuredClone(RED_JACKDAW_VOYAGE.contact),
        navigationRng: { before: 0, after: 0 },
      },
    };
    const parsed = validateCampaignEvent(raw);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok || parsed.value.type !== 'sea-leg-completed') throw new Error('fixture must parse');
    raw.payload.checkpoint.position.x = 99;
    raw.payload.navigationRng.before = 7;
    expect(parsed.value.payload).toMatchObject({
      checkpoint: { position: { x: 24 } }, navigationRng: { before: 0, after: 0 },
    });
  });
  it('applies a quoted market event atomically and replays it canonically', () => {
    const journal = createJournal(initialCampaign());
    const quote = quoteTrade(journal.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
    });
    if (!quote.ok) throw new Error('fixture must quote');

    const traded = appendJournal(journal, marketTradeDraft(quote));

    expect(traded.state.wealth.gold).toBe(480);
    expect(traded.state.wealth.earned).toBe(0);
    expect(traded.state.legacy.goldEarned).toBe(0);
    expect(traded.state.fleet.ships[0].cargo.provisions).toBe(39);
    expect(traded.state.lastEventId).toBe(1);
    expect(traded.initial).toEqual(journal.initial);
  });

  it('parses the exact market-traded payload shape', () => {
    expect(validateCampaignEvent({
      id: 1,
      type: 'market-traded',
      atDay: 0,
      payload: {
        portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5, unitPrice: 4,
      },
    })).toEqual({
      ok: true,
      value: {
        id: 1,
        type: 'market-traded',
        atDay: 0,
        payload: {
          portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5, unitPrice: 4,
        },
      },
    });
  });

  it.each([
    ['zero delta', { delta: 0 }, 'payload.delta:out-of-range'],
    ['fractional delta', { delta: 1.5 }, 'payload.delta:not-integer'],
    ['unknown ship ID is left to canonical quote validation', { shipId: 'missing' }, null],
    ['unknown cargo ID', { cargoId: 'people' }, 'payload.cargoId:unknown-id'],
    ['unknown port ID', { portId: 'nassau' }, 'payload.portId:unknown-id'],
    ['wrong unit-price type', { unitPrice: '4' }, 'payload.unitPrice:wrong-type'],
  ] as const)('validates market payload %s', (_label, changes, expectedIssue) => {
    const event = {
      id: 1,
      type: 'market-traded',
      atDay: 0,
      payload: {
        portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1, unitPrice: 4,
        ...changes,
      },
    };
    const validation = validateCampaignEvent(event);

    if (expectedIssue) expect(validation).toEqual({
      ok: false,
      issues: [{ path: expectedIssue.split(':')[0], code: expectedIssue.split(':')[1] }],
    });
    else expect(validation).toMatchObject({ ok: true });
  });

  it.each([
    ['portId'],
    ['shipId'],
    ['cargoId'],
    ['delta'],
    ['unitPrice'],
  ] as const)('requires the market payload %s field', (field) => {
    const event = marketEvent();
    delete event.payload[field];

    expect(validateCampaignEvent(event)).toEqual({
      ok: false,
      issues: [{ path: `payload.${field}`, code: 'missing' }],
    });
  });

  it.each(['alpha', 'surprise'] as const)('rejects the extra market payload key %s', (field) => {
    expect(validateCampaignEvent(marketEvent({ [field]: true }))).toEqual({
      ok: false,
      issues: [{ path: `payload.${field}`, code: 'unknown-key' }],
    });
  });

  it.each([
    ['portId', 7, 'wrong-type'],
    ['shipId', 7, 'wrong-type'],
    ['cargoId', 7, 'wrong-type'],
    ['delta', '1', 'wrong-type'],
    ['unitPrice', '4', 'wrong-type'],
    ['portId', 'nassau', 'unknown-id'],
    ['cargoId', 'people', 'unknown-id'],
    ['delta', 0, 'out-of-range'],
    ['delta', 1.5, 'not-integer'],
    ['delta', Number.MAX_SAFE_INTEGER + 1, 'out-of-range'],
    ['unitPrice', -1, 'out-of-range'],
    ['unitPrice', 1.5, 'not-integer'],
    ['unitPrice', Number.MAX_SAFE_INTEGER + 1, 'out-of-range'],
  ] as const)('rejects market payload %s value %o as %s', (field, value, code) => {
    expect(validateCampaignEvent(marketEvent({ [field]: value }))).toEqual({
      ok: false,
      issues: [{ path: `payload.${field}`, code }],
    });
  });

  it('rejects unknown payload keys before field issues in stable order', () => {
    expect(validateCampaignEvent(marketEvent({
      zoo: true,
      alpha: true,
      portId: 7,
      shipId: 8,
      cargoId: 9,
      delta: 1.5,
      unitPrice: Number.MAX_SAFE_INTEGER + 1,
    }))).toEqual({
      ok: false,
      issues: [
        { path: 'payload.alpha', code: 'unknown-key' },
        { path: 'payload.zoo', code: 'unknown-key' },
        { path: 'payload.portId', code: 'wrong-type' },
        { path: 'payload.shipId', code: 'wrong-type' },
        { path: 'payload.cargoId', code: 'wrong-type' },
        { path: 'payload.delta', code: 'not-integer' },
        { path: 'payload.unitPrice', code: 'out-of-range' },
      ],
    });
  });

  it('rejects payload accessors and reads a descriptor-safe proxy without live gets', () => {
    const accessor = {
      id: 1,
      type: 'market-traded',
      atDay: 0,
      payload: {
        portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1, unitPrice: 4,
      },
    } as Record<string, unknown>;
    let reads = 0;
    Object.defineProperty(accessor.payload as object, 'delta', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return 1;
      },
    });
    expect(validateCampaignEvent(accessor)).toEqual({
      ok: false,
      issues: [{ path: 'payload.delta', code: 'non-json' }],
    });
    expect(reads).toBe(0);

    const target = {
      id: 1,
      type: 'market-traded',
      atDay: 0,
      payload: {
        portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1, unitPrice: 4,
      },
    };
    const proxy = new Proxy(target, {
      get: () => {
        reads += 1;
        throw new Error('unsafe live read');
      },
    });
    expect(validateCampaignEvent(proxy)).toMatchObject({ ok: true });
    expect(reads).toBe(0);
  });

  it('rejects a forged unit price and stale full-hold quote without mutating state', () => {
    const journal = createJournal(initialCampaign());
    const quote = quoteTrade(journal.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 46,
    });
    if (!quote.ok) throw new Error('fixture must quote');
    const forged = marketTradeDraft(quote);
    forged.payload.unitPrice = 5;

    expect(() => appendJournal(journal, forged)).toThrowError(
      'Invalid market trade: expected unit price 4, received 5',
    );
    expect(journal.state.fleet.ships[0].cargo.provisions).toBe(34);

    const first = appendJournal(journal, marketTradeDraft(quote));
    expect(() => appendJournal(first, marketTradeDraft(quote))).toThrowError(
      'Invalid market trade: insufficient-space',
    );
  });

  it('derives the next event ID and current campaign day', () => {
    const initial = initialCampaign();
    initial.lastEventId = 41;
    initial.calendar.elapsedDays = 7;

    const next = appendJournal(createJournal(initial), ACCEPT_RED_JACKDAW);

    expect(next.events).toEqual([{
      id: 42,
      type: 'lead-accepted',
      atDay: 7,
      payload: { leadId: 'red-jackdaw' },
    }]);
    expect(next.state.lastEventId).toBe(42);
  });

  it('does not mutate or reuse the prior journal graph', () => {
    const journal = createJournal(initialCampaign());
    const before = structuredClone(journal);

    const next = appendJournal(journal, ACCEPT_RED_JACKDAW);

    expect(journal).toEqual(before);
    expect(next).not.toBe(journal);
    expect(next.events).not.toBe(journal.events);
    expect(next.initial).not.toBe(journal.initial);
    expect(next.state).not.toBe(journal.state);
  });

  it('rejects a second acceptance of the same lead', () => {
    const once = appendJournal(createJournal(initialCampaign()), ACCEPT_RED_JACKDAW);

    expect(() => appendJournal(once, ACCEPT_RED_JACKDAW)).toThrowError(
      'Lead red-jackdaw has already been accepted',
    );
  });

  it('rejects an unknown lead draft before changing the journal', () => {
    const journal = createJournal(initialCampaign());
    const before = structuredClone(journal);

    expect(() => appendJournal(journal, {
      type: 'lead-accepted',
      payload: { leadId: 'blue-albatross' },
    } as never)).toThrowError('Invalid campaign event: payload.leadId:unknown-id');
    expect(journal).toEqual(before);
  });

  it.each(['id', 'atDay'] as const)('rejects a caller-supplied draft %s', (field) => {
    const journal = createJournal(initialCampaign());

    expect(() => appendJournal(journal, {
      ...ACCEPT_RED_JACKDAW,
      [field]: 99,
    } as never)).toThrowError(`Invalid campaign event: ${field}:unknown-key`);
  });

  it.each(['id', 'atDay', 'surprise'] as const)(
    'rejects a non-enumerable caller-supplied draft %s',
    (field) => {
      const journal = createJournal(initialCampaign());
      const draft = structuredClone(ACCEPT_RED_JACKDAW) as CampaignEventDraft & Record<string, unknown>;
      Object.defineProperty(draft, field, { configurable: true, value: 99 });

      expect(() => appendJournal(journal, draft)).toThrowError(
        `Invalid campaign event: ${field}:unknown-key`,
      );
    },
  );

  it('rejects a symbol-keyed draft instead of silently dropping it', () => {
    const journal = createJournal(initialCampaign());
    const draft = structuredClone(ACCEPT_RED_JACKDAW) as CampaignEventDraft & Record<PropertyKey, unknown>;
    draft[Symbol('hidden')] = true;

    expect(() => appendJournal(journal, draft)).toThrowError(
      'Invalid campaign event: $:non-json',
    );
  });

  it('rejects prohibited and canonical accessors without invoking their getters', () => {
    const journal = createJournal(initialCampaign());
    const prohibited = structuredClone(ACCEPT_RED_JACKDAW) as CampaignEventDraft & Record<string, unknown>;
    let reads = 0;
    Object.defineProperty(prohibited, 'id', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return 99;
      },
    });

    expect(() => appendJournal(journal, prohibited)).toThrowError(
      'Invalid campaign event: id:unknown-key',
    );
    expect(reads).toBe(0);

    const canonical = structuredClone(ACCEPT_RED_JACKDAW) as CampaignEventDraft & Record<string, unknown>;
    Object.defineProperty(canonical, 'type', {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return 'lead-accepted';
      },
    });
    expect(() => appendJournal(journal, canonical)).toThrowError(
      'Invalid campaign event: type:non-json',
    );
    expect(reads).toBe(0);
  });

  it('inspects a descriptor-safe proxy draft without invoking its live get trap', () => {
    const journal = createJournal(initialCampaign());
    const target = { ...structuredClone(ACCEPT_RED_JACKDAW), id: 99 };
    let liveReads = 0;
    let ownKeyReads = 0;
    const descriptorReads = new Map<PropertyKey, number>();
    const draft = new Proxy(target, {
      get: () => {
        liveReads += 1;
        throw new Error('unsafe live read');
      },
      getOwnPropertyDescriptor: (current, key) => {
        descriptorReads.set(key, (descriptorReads.get(key) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(current, key);
      },
      ownKeys: (current) => {
        ownKeyReads += 1;
        return Reflect.ownKeys(current);
      },
    });

    expect(() => appendJournal(journal, draft as never)).toThrowError(
      'Invalid campaign event: id:unknown-key',
    );
    expect(liveReads).toBe(0);
    expect(ownKeyReads).toBe(1);
    expect([...descriptorReads.values()]).toEqual([1, 1, 1]);
  });

  it('does not mutate or reuse a valid caller draft', () => {
    const journal = createJournal(initialCampaign());
    const draft = structuredClone(ACCEPT_RED_JACKDAW);
    const before = structuredClone(draft);

    const next = appendJournal(journal, draft);

    expect(draft).toEqual(before);
    expect(next.events[0].payload).not.toBe(draft.payload);
  });

  it('rejects append when the uint32 event ID space is exhausted', () => {
    const initial = initialCampaign();
    initial.lastEventId = 0xffff_ffff;

    expect(() => appendJournal(createJournal(initial), ACCEPT_RED_JACKDAW)).toThrowError(
      'Campaign event ID space exhausted',
    );
  });
});

describe('reduceCampaign', () => {
  it('adds the exact resolved Red Jackdaw lead state', () => {
    const initial = initialCampaign();
    initial.calendar.elapsedDays = 7;

    const next = reduceCampaign(initial, acceptEvent(1, 7));

    expect(next.leads).toEqual([{
      id: 'red-jackdaw',
      kind: 'rumour',
      status: 'active',
      acceptedDay: 7,
      expiresDay: 25,
    }]);
    expect(next.lastEventId).toBe(1);
  });

  it('does not mutate or reuse the prior campaign graph', () => {
    const initial = initialCampaign();
    const before = structuredClone(initial);

    const next = reduceCampaign(initial, acceptEvent());

    expect(initial).toEqual(before);
    expect(next).not.toBe(initial);
    expect(next.fleet).not.toBe(initial.fleet);
    expect(next.fleet.ships[0]).not.toBe(initial.fleet.ships[0]);
    expect(next.leads).not.toBe(initial.leads);
  });

  it('uses the validated state snapshot instead of live-reading a descriptor-safe proxy', () => {
    const target = initialCampaign();
    let liveReads = 0;
    const proxy = new Proxy(target, {
      get: () => {
        liveReads += 1;
        throw new Error('unsafe live read');
      },
    });

    const next = reduceCampaign(proxy, acceptEvent());

    expect(next.lastEventId).toBe(1);
    expect(next.leads).toHaveLength(1);
    expect(liveReads).toBe(0);
  });

  it.each([
    ['skipped', 2, 0, 1],
    ['repeated', 1, 1, 2],
    ['out-of-order', 1, 2, 3],
  ] as const)('rejects a %s event ID', (_label, eventId, priorId, expectedId) => {
    const state = initialCampaign();
    state.lastEventId = priorId;

    expect(() => reduceCampaign(state, acceptEvent(eventId))).toThrowError(
      `Invalid campaign event: expected event ${expectedId}, received ${eventId}`,
    );
  });

  it('rejects an event whose day does not equal the predecessor day', () => {
    const state = initialCampaign();
    state.calendar.elapsedDays = 7;

    expect(() => reduceCampaign(state, acceptEvent(1, 6))).toThrowError(
      'Invalid campaign event: expected day 7, received 6',
    );
  });

  it('rejects a malformed predecessor before attempting a transition', () => {
    const state = initialCampaign();
    state.fleet.flagshipId = 'missing';

    expect(() => reduceCampaign(state, acceptEvent())).toThrowError(
      'Invalid prior campaign state: fleet.flagshipId:invariant',
    );
  });

  it.each([
    [{ ...acceptEvent(), id: 0 }, 'id:out-of-range'],
    [{ ...acceptEvent(), id: 1.5 }, 'id:not-integer'],
    [{ ...acceptEvent(), atDay: -1 }, 'atDay:out-of-range'],
    [{ ...acceptEvent(), payload: {} }, 'payload.leadId:missing'],
    [{ ...acceptEvent(), payload: { leadId: 'red-jackdaw', extra: true } }, 'payload.extra:unknown-key'],
  ] as const)('rejects a malformed event without a partial transition: %#', (event, issue) => {
    const state = initialCampaign();
    const before = structuredClone(state);

    expect(() => reduceCampaign(state, event as never)).toThrowError(
      `Invalid campaign event: ${issue}`,
    );
    expect(state).toEqual(before);
  });

  it('rejects an unknown event discriminant at the exhaustive boundary', () => {
    expect(() => reduceCampaign(initialCampaign(), {
      id: 1,
      type: 'port-opened',
      atDay: 0,
      payload: { leadId: 'red-jackdaw' },
    } as never)).toThrowError('Invalid campaign event: type:unknown-id');
  });
});
