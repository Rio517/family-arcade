import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import { provisionsMonths } from './selectors';

describe('provisionsMonths', () => {
  it('reports exactly 3.4 months for the opening 34 provisions and 50 crew', () => {
    expect(provisionsMonths(createCampaign({ seed: 1702 }))).toBe(3.4);
  });

  it('sums fleet crew and never rounds the result for presentation', () => {
    const state = createCampaign({ seed: 1702 });
    const secondShip = structuredClone(state.fleet.ships[0]);
    secondShip.id = 'second-sloop';
    secondShip.crew = 25;
    secondShip.cargo.provisions = 0;
    state.fleet.ships.push(secondShip);

    expect(provisionsMonths(state)).toBe(34 / (75 * 0.2));
  });

  it('returns null defensively when the fleet has zero total crew', () => {
    const state = createCampaign({ seed: 1702 });
    state.fleet.ships[0].crew = 0;

    expect(provisionsMonths(state)).toBeNull();
  });
});
