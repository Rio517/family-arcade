import { provisionsMonths } from '../domain/selectors';
import type { CampaignLength, CampaignStateV1 } from '../domain/types';

export const CAMPAIGN_LENGTH_LABELS = {
  adventure: 'Adventure',
  voyage: 'Voyage',
  legend: 'Legend',
} as const satisfies Record<CampaignLength, string>;

export function formatCaribbeanSaveSummary(state: CampaignStateV1): {
  title: string;
  meta: string;
} {
  const months = provisionsMonths(state);
  const provisions = months === null
    ? '— months provisions'
    : `${months.toFixed(1)} months provisions`;
  return {
    title: `Caribbean Career — ${state.captain.name}`,
    meta: `${CAMPAIGN_LENGTH_LABELS[state.career.length]} · Bridgetown · ${provisions}`,
  };
}
