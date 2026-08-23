import { describe, expect, it } from 'vitest';

import { fixture } from './testFixtures';
import type { NavalEvent, NavalState } from './types';
import { validateNavalState } from './validation';

describe('canonical naval state validation', () => {
  it('reports drift before an invalid state can become a campaign result', () => {
    const invalid = fixture();
    invalid.ships.player.position.x = Number.NaN;
    invalid.ships.opponent.reload.port.progress = invalid.ships.opponent.reload.port.required + 1;
    expect(validateNavalState(invalid)).toEqual({
      ok: false,
      issues: expect.arrayContaining(['player.position.x:not-finite', 'opponent.reload.port:overflow']),
    });
  });

  it('collects bounds, reload consistency, identity, and counter issues without mutation', () => {
    const invalid = fixture() as NavalState & { ships: NavalState['ships'] & Record<string, unknown> };
    invalid.tick = -1;
    invalid.seed = 0x1_0000_0000;
    invalid.nextEventId = 0;
    invalid.nextVolleyId = 1.5;
    invalid.ships.player.id = 'opponent';
    invalid.ships.player.hull = 101;
    invalid.ships.player.speed = Number.POSITIVE_INFINITY;
    invalid.ships.player.reload.starboard = { progress: 1.5, required: 0, loaded: true };
    invalid.ships.raider = {};
    const before = structuredClone(invalid);

    expect(validateNavalState(invalid)).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        'tick:not-uint32',
        'seed:not-uint32',
        'nextEventId:not-positive-integer',
        'nextVolleyId:not-positive-integer',
        'player.id:mismatch',
        'player.hull:outside-sloop-maximum',
        'player.speed:not-finite',
        'player.reload.starboard.required:not-positive-integer',
        'player.reload.starboard.progress:not-integer',
        'player.reload.starboard:loaded-mismatch',
        'ships.raider:unknown',
      ]),
    });
    expect(invalid).toEqual(before);
  });

  it('requires positive monotonic event IDs and known event ship identities', () => {
    const invalid = fixture();
    invalid.events = [
      { id: 2, kind: 'reload-ready', atTick: 0, shipId: 'player', side: 'port' },
      { id: 2, kind: 'reload-ready', atTick: 0, shipId: 'raider', side: 'starboard' },
    ] as NavalEvent[];
    invalid.nextEventId = 2;

    expect(validateNavalState(invalid)).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        'events.1.id:not-monotonic',
        'events.1.shipId:unknown',
        'nextEventId:not-after-events',
      ]),
    });
  });

  it('requires canonical outcome state and its semantic event to agree', () => {
    const outcome = { kind: 'surrender', victorShipId: 'player' } as const;
    const missing = fixture();
    missing.outcome = outcome;

    const unexpected = fixture();
    unexpected.events = [{ id: 1, kind: 'outcome', atTick: 0, outcome }];
    unexpected.nextEventId = 2;

    expect(validateNavalState(missing)).toEqual({ ok: false, issues: ['outcome:event-missing'] });
    expect(validateNavalState(unexpected)).toEqual({ ok: false, issues: ['outcome:event-unexpected'] });
  });
});
