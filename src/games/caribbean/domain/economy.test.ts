import { describe, expect, it } from 'vitest';

import { createCampaign } from './createCampaign';
import { marketTradeDraft, priceCue, quoteTrade, shipHoldUsed } from './economy';

function state() {
  return createCampaign({ seed: 1702 });
}

describe('fixed-price market quotes', () => {
  it('quotes the opening hold and a provision purchase', () => {
    const campaign = state();

    expect(shipHoldUsed(campaign.fleet.ships[0])).toBe(54);
    expect(quoteTrade(campaign, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
    })).toMatchObject({
      ok: true,
      unitPrice: 4,
      goldDelta: -20,
      goldAfter: 480,
      quantityAfter: 39,
      holdUsedAfter: 59,
      holdCapacity: 100,
    });
  });

  it('quotes sales at the same fixed price without changing earnings', () => {
    const campaign = state();

    expect(quoteTrade(campaign, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'tools', delta: -4,
    })).toMatchObject({
      ok: true,
      unitPrice: 18,
      goldDelta: 72,
      goldAfter: 572,
      quantityAfter: 0,
      holdUsedAfter: 50,
    });
    expect(campaign.wealth.earned).toBe(0);
    expect(campaign.legacy.goldEarned).toBe(0);
  });

  it.each([
    ['not-in-port', (campaign: ReturnType<typeof state>) => { campaign.mode = { kind: 'sailing' } as never; }, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1 }],
    ['wrong-port', () => undefined, { portId: 'nassau', shipId: 'mistral', cargoId: 'provisions', delta: 1 }],
    ['unknown-ship', () => undefined, { portId: 'bridgetown', shipId: 'missing', cargoId: 'provisions', delta: 1 }],
    ['invalid-quantity', () => undefined, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 0 }],
    ['invalid-quantity', () => undefined, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1.5 }],
    ['insufficient-gold', (campaign: ReturnType<typeof state>) => { campaign.wealth.gold = 3; }, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1 }],
    ['insufficient-cargo', () => undefined, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'tools', delta: -5 }],
    ['insufficient-space', () => undefined, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 47 }],
    ['gold-overflow', (campaign: ReturnType<typeof state>) => { campaign.wealth.gold = Number.MAX_SAFE_INTEGER; }, { portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: -1 }],
  ] as const)('returns %s for invalid trade preconditions', (reason, change, request) => {
    const campaign = state();
    change(campaign);

    expect(quoteTrade(campaign, request as never)).toEqual({ ok: false, reason });
  });

  it('allows an exactly full hold and rejects one unit beyond it', () => {
    const campaign = state();

    expect(quoteTrade(campaign, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 46,
    })).toMatchObject({ ok: true, holdUsedAfter: 100, holdCapacity: 100 });
    expect(quoteTrade(campaign, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 47,
    })).toEqual({ ok: false, reason: 'insufficient-space' });
  });

  it('counts cannon and fitting hold penalties', () => {
    const campaign = state();
    campaign.fleet.ships[0].cannon = 12;
    campaign.fleet.ships[0].fittings = ['expanded-berths', 'improved-gun-carriages'];

    expect(shipHoldUsed(campaign.fleet.ships[0])).toBe(70);
  });

  it('uses the explicit price cue boundaries', () => {
    expect(priceCue(4, 5)).toBe('cheap');
    expect(priceCue(18, 15)).toBe('expensive');
    expect(priceCue(10, 10)).toBe('fair');
    expect(priceCue(85, 100)).toBe('cheap');
    expect(priceCue(115, 100)).toBe('expensive');
  });

  it('turns a successful quote into its canonical event draft', () => {
    const quote = quoteTrade(state(), {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
    });
    if (!quote.ok) throw new Error('fixture must quote');

    expect(marketTradeDraft(quote)).toEqual({
      type: 'market-traded',
      payload: {
        portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5, unitPrice: 4,
      },
    });
  });
});
