import { describe, expect, it } from 'vitest';

import { command, fixture } from './testFixtures';
import { stepBattle } from './stepBattle';
import type { NavalCommand, NavalEvent, NavalState } from './types';

function events<K extends NavalEvent['kind']>(state: NavalState, kind: K): Extract<NavalEvent, { kind: K }>[] {
  return state.events.filter((event): event is Extract<NavalEvent, { kind: K }> => event.kind === kind);
}

describe('one canonical naval battle tick', () => {
  it('requires a loaded physical side and lateral target arc', () => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, heading: 0 },
      opponent: { position: { x: 20, z: 0 } },
    });
    const fired = stepBattle(state, { player: command({ fire: 'port' }) });
    expect(events(fired, 'volley')).toHaveLength(1);
    expect(fired.ships.player.reload.port.progress).toBe(0);
    expect(events(stepBattle(fired, { player: command({ fire: 'port' }) }), 'volley')).toHaveLength(1);
    expect(events(stepBattle(state, { player: command({ fire: 'starboard' }) }), 'volley')).toHaveLength(0);
  });

  it('rejects broadsides outside gun range and malformed runtime commands', () => {
    const far = fixture({
      player: { position: { x: 0, z: 0 }, heading: 0 },
      opponent: { position: { x: 42.01, z: 0 } },
    });
    expect(events(stepBattle(far, { player: command({ fire: 'port' }) }), 'volley')).toHaveLength(0);

    const invalid = {
      rudder: 2,
      sail: 'battle',
      ammunition: 'stone',
      fire: 'bow',
    } as unknown as NavalCommand;
    const afterInvalid = stepBattle(far, { player: invalid });
    expect(afterInvalid.ships.player).toMatchObject({ rudder: 0, sail: 'full', ammunition: 'round' });
    expect(events(afterInvalid, 'volley')).toHaveLength(0);
  });

  it('applies selected ammunition deterministically and clamps applied damage to current values', () => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, heading: 0, cannon: 12 },
      opponent: { position: { x: 5, z: 0 }, hull: 1, sails: 3, crew: 75, cannon: 1 },
    });
    const first = stepBattle(state, { player: command({ ammunition: 'chain', fire: 'port' }) });
    const replay = stepBattle(state, { player: command({ ammunition: 'chain', fire: 'port' }) });

    expect(first).toEqual(replay);
    expect(events(first, 'volley')[0].result.ammunition).toBe('chain');
    expect(events(first, 'damage')[0].damage).toEqual({ hull: 1, sails: 3, crew: 18, cannon: 0 });
    expect(first.ships.opponent).toMatchObject({ hull: 0, sails: 0, crew: 57, cannon: 1 });
  });

  it('resolves at most one legal requested broadside per ship in stable event order', () => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, heading: 0 },
      opponent: { position: { x: 20, z: 0 }, heading: Math.PI },
    });
    const next = stepBattle(state, {
      player: command({ fire: 'port' }),
      opponent: command({ fire: 'port' }),
    });

    expect(events(next, 'volley').map((event) => event.shipId)).toEqual(['player', 'opponent']);
    expect(events(next, 'damage').map((event) => event.shipId)).toEqual(['opponent', 'player']);
    expect(next.events.map((event) => event.id)).toEqual([1, 2, 3, 4]);
    expect(next.nextEventId).toBe(5);
    expect(next.nextVolleyId).toBe(3);
  });

  it('reloads physical sides independently and announces only the unloaded-to-loaded transition', () => {
    const state = fixture();
    state.ships.player.reload.port = { progress: 359_500, required: 360_000, loaded: false };
    state.ships.player.reload.starboard = { progress: 360_000, required: 360_000, loaded: true };

    const ready = stepBattle(state, {});
    expect(ready.ships.player.reload.port).toEqual({ progress: 360_000, required: 360_000, loaded: true });
    expect(events(ready, 'reload-ready')).toEqual([
      { id: 1, kind: 'reload-ready', atTick: 1, shipId: 'player', side: 'port' },
    ]);
    expect(events(stepBattle(ready, {}), 'reload-ready')).toHaveLength(1);
  });

  it('increments one tick, preserves input snapshots, and retains serializable state', () => {
    const state = fixture();
    const before = structuredClone(state);
    const next = stepBattle(state, { player: command({ rudder: -1, sail: 'reefed' }) });

    expect(next).not.toBe(state);
    expect(next.tick).toBe(1);
    expect(state).toEqual(before);
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });

  it('records exactly one terminal outcome event and then returns the same reference', () => {
    const state = fixture({ opponent: { hull: 0 } });
    const ended = stepBattle(state, {});
    expect(ended.outcome).toEqual({ kind: 'sunk', victorShipId: 'player' });
    expect(events(ended, 'outcome')).toEqual([
      { id: 1, kind: 'outcome', atTick: 1, outcome: { kind: 'sunk', victorShipId: 'player' } },
    ]);
    expect(stepBattle(ended, { player: command({ fire: 'port' }) })).toBe(ended);
  });

  it('trims semantic history to 120 events without reusing IDs', () => {
    const state = fixture();
    state.events = Array.from({ length: 120 }, (_, index): NavalEvent => ({
      id: index + 1,
      kind: 'reload-ready',
      atTick: 0,
      shipId: 'player',
      side: 'port',
    }));
    state.nextEventId = 121;
    state.ships.player.reload.port = { progress: 359_500, required: 360_000, loaded: false };

    const next = stepBattle(state, {});
    expect(next.events).toHaveLength(120);
    expect(next.events[0].id).toBe(2);
    expect(next.events.at(-1)?.id).toBe(121);
    expect(next.nextEventId).toBe(122);
  });
});
