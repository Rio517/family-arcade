import type { CampaignStateV1 } from './types';

export function provisionsMonths(state: CampaignStateV1): number | null {
  let provisions = 0;
  let crew = 0;

  for (const ship of state.fleet.ships) {
    provisions += ship.cargo.provisions;
    crew += ship.crew;
  }

  return crew === 0 ? null : provisions / (crew * 0.2);
}
