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

  it('rejects fractional counts and drifted canonical control and class unions', () => {
    const invalid = fixture();
    const player = invalid.ships.player as unknown as {
      crew: number;
      cannon: number;
      classId: string;
      rudder: number;
      sail: string;
      ammunition: string;
    };
    player.crew = 51.5;
    player.cannon = 0.5;
    player.classId = 'brig';
    player.rudder = 2;
    player.sail = 'battle';
    player.ammunition = 'stone';

    expect(validateNavalState(invalid)).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        'player.crew:not-integer',
        'player.cannon:not-integer',
        'player.classId:unsupported',
        'player.rudder:unknown',
        'player.sail:unknown',
        'player.ammunition:unknown',
      ]),
    });
  });

  it('rejects drifted event and outcome union discriminants', () => {
    const invalid = fixture();
    invalid.events = [
      {
        id: 1,
        kind: 'volley',
        atTick: 0,
        shipId: 'player',
        targetShipId: 'opponent',
        result: {
          volleyId: 1,
          side: 'bow',
          ammunition: 'stone',
          fired: 1,
          hits: 0,
          misses: 1,
          damage: { hull: 0, sails: 0, crew: 0, cannon: 0 },
          seedAfter: 1,
          samples: [{ index: 0, normalizedSpread: 0, hit: false }],
        },
      },
      { id: 2, kind: 'reload-ready', atTick: 0, shipId: 'player', side: 'bow' },
      { id: 3, kind: 'smoke', atTick: 0 },
    ] as unknown as NavalEvent[];
    invalid.nextEventId = 4;

    expect(validateNavalState(invalid)).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        'events.0.result.side:unknown',
        'events.0.result.ammunition:unknown',
        'events.1.side:unknown',
        'events.2.kind:unknown',
      ]),
    });

    const invalidOutcome = { kind: 'captured', victorShipId: 'player' };
    const ended = fixture();
    ended.outcome = invalidOutcome as unknown as NavalState['outcome'];
    ended.events = [{ id: 1, kind: 'outcome', atTick: 0, outcome: invalidOutcome }] as unknown as NavalEvent[];
    ended.nextEventId = 2;
    expect(validateNavalState(ended)).toEqual({
      ok: false,
      issues: expect.arrayContaining(['outcome.kind:unknown', 'events.0.outcome.kind:unknown']),
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
