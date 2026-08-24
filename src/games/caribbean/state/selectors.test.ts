import { describe, expect, it } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { appendJournal, createJournal } from '../domain/replay';
import {
  navalEngagedDraft,
  seaLegCompletedDraft,
  voyageStartedDraft,
} from '../domain/voyage';
import { CAMPAIGN_LENGTH_LABELS, formatCaribbeanSaveSummary } from './selectors';

function activeLeadJournal() {
  return appendJournal(
    createJournal(createCampaign({ seed: 1702, name: 'Morgan' })),
    { type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } },
  );
}

describe('Caribbean save summary selectors', () => {
  it('formats every campaign length through the total label map', () => {
    expect(CAMPAIGN_LENGTH_LABELS).toEqual({
      adventure: 'Adventure',
      voyage: 'Voyage',
      legend: 'Legend',
    });

    for (const [length, label] of Object.entries(CAMPAIGN_LENGTH_LABELS)) {
      const state = createCampaign({ seed: 1702, name: 'Morgan', length: length as keyof typeof CAMPAIGN_LENGTH_LABELS });
      expect(formatCaribbeanSaveSummary(state)).toEqual({
        title: 'Caribbean Career — Morgan',
        meta: `${label} · Bridgetown · 3.4 months provisions`,
      });
    }
  });

  it('uses an explicit fallback when provisions months cannot be derived', () => {
    const state = createCampaign({ seed: 1702 });
    state.fleet.ships[0].crew = 0;

    expect(formatCaribbeanSaveSummary(state).meta).toBe(
      'Adventure · Bridgetown · — months provisions',
    );
  });

  it.each([
    ['port', 'Bridgetown'],
    ['sailing', 'Under sail'],
    ['encounter', 'Red Jackdaw contact'],
    ['naval', 'Naval engagement'],
  ] as const)('names a resumable %s save by its real route phase', (mode, location) => {
    // Kills the stale selector that labels every active strategic save Bridgetown.
    const active = activeLeadJournal();
    const departed = appendJournal(active, voyageStartedDraft(active.state));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
    const journal = mode === 'port'
      ? active
      : mode === 'sailing'
        ? departed
        : mode === 'encounter'
          ? contact
          : engaged;

    expect(formatCaribbeanSaveSummary(journal.state).meta).toBe(
      `Adventure · ${location} · ${mode === 'port' || mode === 'sailing' ? '3.4' : '3.3'} months provisions`,
    );
  });
});
