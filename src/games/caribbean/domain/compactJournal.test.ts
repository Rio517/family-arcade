import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { compactJournal } from './compactJournal';
import { createCampaign } from './createCampaign';
import { marketTradeDraft, quoteTrade } from './economy';
import { appendJournal, createJournal, validateJournal } from './replay';
import { battleWithdrawnDraft, navalEngagedDraft, seaLegCompletedDraft, voyageStartedDraft } from './voyage';

function activeLeadJournal() {
  const state = createCampaign({ seed: 1702 });
  state.leads = [{ id: 'red-jackdaw', kind: 'rumour', status: 'active', acceptedDay: 0, expiresDay: 18 }];
  state.lastEventId = 1;
  return createJournal(state);
}

function journalWithLegalTrades(count: number) {
  let journal = createJournal(createCampaign({ seed: 1702 }));
  for (let index = 0; index < count; index += 1) {
    const quote = quoteTrade(journal.state, {
      portId: 'bridgetown',
      shipId: 'mistral',
      cargoId: 'provisions',
      delta: index % 2 === 0 ? 1 : -1,
    });
    if (!quote.ok) throw new Error('fixture must quote');
    journal = appendJournal(journal, marketTradeDraft(quote));
  }
  return journal;
}

describe('compactJournal', () => {
  it.each(['sailing', 'encounter', 'naval'] as const)('preserves a canonical %s checkpoint with no predecessor events', (kind) => {
    // Catches mode validators that rely on event history after compaction.
    const active = activeLeadJournal();
    const departed = appendJournal(active, voyageStartedDraft(active.state));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
    const journal = kind === 'sailing' ? departed : kind === 'encounter' ? contact : engaged;
    const compacted = compactJournal(journal);

    expect(compacted.events).toEqual([]);
    expect(compacted.initial.lastEventId).toBe(journal.state.lastEventId);
    expect(compacted.initial.mode).toEqual(journal.state.mode);
    expect(validateJournal(compacted)).toEqual({ ok: true, value: compacted });
  });
  it('keeps compaction free of platform and storage dependencies', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/games/caribbean/domain/compactJournal.ts'), 'utf8');

    expect(source).not.toMatch(/TextEncoder|storage|localStorage|sessionStorage|document|window/);
  });

  it('compacts a legal trade history into an independently cloned checkpoint', () => {
    const journal = journalWithLegalTrades(257);

    const compacted = compactJournal(journal);

    expect(compacted.events).toEqual([]);
    expect(compacted.initial).toEqual(journal.state);
    expect(compacted.state).toEqual(journal.state);
    expect(compacted.initial).not.toBe(journal.state);
    expect(compacted.state).not.toBe(journal.state);
    expect(compacted.initial).not.toBe(compacted.state);
    expect(validateJournal(compacted)).toEqual({ ok: true, value: compacted });
    compacted.state.wealth.gold = 0;
    expect(compacted.initial.wealth.gold).toBe(journal.state.wealth.gold);
    expect(compacted.state.lastEventId).toBe(257);
  });

  it('continues the compacted log from the preserved event ID', () => {
    const compacted = compactJournal(journalWithLegalTrades(257));
    const quote = quoteTrade(compacted.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: -1,
    });
    if (!quote.ok) throw new Error('fixture must quote');

    const continued = appendJournal(compacted, marketTradeDraft(quote));

    expect(continued.events[0].id).toBe(compacted.state.lastEventId + 1);
  });

  it('continues a compacted returned battle with literal voyage-6 and preserved lastVoyage', () => {
    // Kills compaction that drops strategic return summary or resets post-return event lineage.
    const active = activeLeadJournal();
    const departed = appendJournal(active, voyageStartedDraft(active.state));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
    const returned = appendJournal(engaged, battleWithdrawnDraft(engaged.state));
    const compacted = compactJournal(returned);

    expect(compacted.events).toEqual([]);
    expect(compacted.initial.lastEventId).toBe(5);
    expect(compacted.initial.world.lastVoyage).toEqual({
      voyageId: 'voyage-2', battleId: 'voyage-2-battle',
      result: 'withdrew', outcome: null, returnedDay: 2,
    });
    const continued = appendJournal(compacted, voyageStartedDraft(compacted.state));
    expect(continued.events).toEqual([{
      id: 6, type: 'voyage-started', atDay: 2, payload: { voyageId: 'voyage-6' },
    }]);
  });
});
