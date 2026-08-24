import { describe, expect, it } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { CAMPAIGN_LENGTH_LABELS, formatCaribbeanSaveSummary } from './selectors';

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
});
