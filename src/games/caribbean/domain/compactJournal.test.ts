import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { compactJournal } from './compactJournal';
import { createCampaign } from './createCampaign';
import { marketTradeDraft, quoteTrade } from './economy';
import { appendJournal, createJournal, validateJournal } from './replay';

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
    expect(compacted.state.lastEventId).toBe(257);
    expect(validateJournal(compacted)).toEqual({ ok: true, value: compacted });
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
});
