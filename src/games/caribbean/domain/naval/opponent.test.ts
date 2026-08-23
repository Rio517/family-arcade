import { describe, expect, it } from 'vitest';

import { NAVAL_RELOAD_REQUIRED_WORK } from './balance';
import { normalizeAngle } from './geometry';
import {
  advanceOpponentController,
  initialOpponentController,
  initialOpponentMemory,
  opponentCommand,
} from './opponent';
import { stepBattle } from './stepBattle';
import { fixture } from './testFixtures';

function angleError(actual: number, desired: number): number {
  return Math.abs(normalizeAngle(desired - actual));
}

describe('legible naval opponent', () => {
  it.each([
    [
      'healthy target sails at medium range',
      fixture({ opponent: { position: { x: 0, z: 0 } }, player: { position: { x: 26, z: 0 }, sails: 90 } }),
      'chain',
    ],
    [
      'weak crew at close range',
      fixture({ opponent: { position: { x: 0, z: 0 } }, player: { position: { x: 12, z: 0 }, crew: 19 } }),
      'grape',
    ],
    [
      'ordinary firing solution',
      fixture({ opponent: { position: { x: 0, z: 0 } }, player: { position: { x: 30, z: 0 }, sails: 30 } }),
      'round',
    ],
  ] as const)('chooses ammunition for %s', (_label, state, ammunition) => {
    expect(opponentCommand(state, initialOpponentMemory()).command.ammunition).toBe(ammunition);
  });

  it('closes under full sail when the target is beyond broadside range', () => {
    const state = fixture({
      opponent: { position: { x: 0, z: 0 }, heading: Math.PI },
      player: { position: { x: 0, z: -50 } },
    });

    const decision = opponentCommand(state, initialOpponentMemory());

    expect(decision.memory).toMatchObject({ mode: 'close', untilTick: 30 });
    expect(decision.command).toMatchObject({ sail: 'full', fire: null, rudder: 0 });
    expect(decision.memory.desiredHeading).toBeCloseTo(-Math.PI, 10);
  });

  it('gains the weather position when leeward at medium range', () => {
    const state = fixture({
      input: { windFrom: 0 },
      opponent: { position: { x: 0, z: -8 }, heading: Math.PI },
      player: { position: { x: 0, z: 24 } },
    });

    const decision = opponentCommand(state, initialOpponentMemory());

    expect(decision.memory.mode).toBe('gain-weather-position');
    expect(decision.command).toMatchObject({ sail: 'full', fire: null });
    expect(decision.memory.desiredHeading).not.toBe(state.ships.opponent.heading);
  });

  it('tacks back through the weather gauge before ordinary fighting can drift out of the arena', () => {
    const state = fixture({
      input: { arenaRadius: 92, windFrom: 0 },
      opponent: { position: { x: 80, z: 0 }, heading: Math.PI / 2 },
      player: { position: { x: 60, z: 0 } },
    });

    const decision = opponentCommand(state, initialOpponentMemory());

    expect(decision.memory.mode).toBe('gain-weather-position');
    expect(Math.cos(decision.memory.desiredHeading)).toBeGreaterThan(0);
    expect(Math.sin(decision.memory.desiredHeading)).toBeLessThan(0);
    expect(decision.command.fire).toBeNull();
  });

  it('reduces angular error while seeking a broadside with the negative-rudder convention', () => {
    const before = fixture({
      opponent: { position: { x: 0, z: 0 }, heading: Math.PI },
      player: { position: { x: 0, z: -30 } },
    });
    const decision = opponentCommand(before, initialOpponentMemory());
    const after = stepBattle(before, { opponent: decision.command });

    expect(decision.memory.mode).toBe('seek-broadside');
    expect(decision.command.rudder).toBe(-1);
    expect(angleError(after.ships.opponent.heading, decision.memory.desiredHeading)).toBeLessThan(
      angleError(before.ships.opponent.heading, decision.memory.desiredHeading),
    );
  });

  it('fires only a loaded legal broadside at useful range', () => {
    const state = fixture({
      opponent: { position: { x: 0, z: 0 }, heading: 0 },
      player: { position: { x: 20, z: 0 } },
    });

    const decision = opponentCommand(state, initialOpponentMemory());

    expect(decision.memory.mode).toBe('fire');
    expect(decision.command).toMatchObject({ fire: 'port', sail: 'reefed' });
  });

  it('recovers on a useful but unloaded side without oscillating the rudder', () => {
    const state = fixture({
      opponent: {
        position: { x: 0, z: 0 },
        heading: 0,
        reload: {
          port: { progress: 120_000, required: NAVAL_RELOAD_REQUIRED_WORK, loaded: false },
          starboard: {
            progress: NAVAL_RELOAD_REQUIRED_WORK,
            required: NAVAL_RELOAD_REQUIRED_WORK,
            loaded: true,
          },
        },
      },
      player: { position: { x: 20, z: 0 } },
    });

    const decision = opponentCommand(state, initialOpponentMemory());

    expect(decision.memory.mode).toBe('recover');
    expect(decision.command).toMatchObject({ rudder: 0, sail: 'reefed', fire: null });
  });

  it('disengages outward under full sail before automatic destruction', () => {
    const state = fixture({
      opponent: { position: { x: 20, z: 0 }, heading: 0, hull: 21, crew: 12 },
      player: { position: { x: 10, z: 0 } },
    });

    const decision = opponentCommand(state, initialOpponentMemory());
    const outwardHeading = Math.atan2(20, 0);

    expect(decision.memory.mode).toBe('disengage');
    expect(decision.command).toMatchObject({ sail: 'full', fire: null });
    expect(angleError(decision.memory.desiredHeading, outwardHeading)).toBeLessThan(0.000_001);
  });

  it.each([
    ['hull', { hull: 20 }],
    ['crew', { crew: 8 }],
  ] as const)('surrenders when its %s reaches the canonical gate', (_label, opponent) => {
    const decision = opponentCommand(fixture({ opponent }), initialOpponentMemory());

    expect(decision.memory.mode).toBe('surrender');
    expect(decision.command).toEqual({ rudder: 0, sail: 'reefed', ammunition: 'round', fire: null });
  });

  it('returns a deterministic thirty-tick decision hold without mutating controller memory or state', () => {
    const state = fixture({
      opponent: { position: { x: 0, z: 0 }, heading: 0 },
      player: { position: { x: 20, z: 0 } },
      tick: 42,
    });
    const memory = initialOpponentMemory();
    const stateBefore = structuredClone(state);
    const memoryBefore = structuredClone(memory);

    const first = opponentCommand(state, memory);
    const second = opponentCommand(state, memory);

    expect(first).toEqual(second);
    expect(first.memory.untilTick).toBe(72);
    expect(state).toEqual(stateBefore);
    expect(memory).toEqual(memoryBefore);
  });

  it('consumes a fire request once while preserving the thirty-tick steering hold', () => {
    const state = fixture({
      opponent: { position: { x: 0, z: 0 }, heading: 0 },
      player: { position: { x: 20, z: 0 } },
    });

    const firing = advanceOpponentController(state, initialOpponentController());
    const afterFire = stepBattle(state, { opponent: firing.command });
    const held = advanceOpponentController(afterFire, firing.controller);

    expect(firing.command.fire).toBe('port');
    expect(held.command).toEqual({ ...firing.command, fire: null });
    expect(held.controller.memory).toEqual(firing.controller.memory);
    expect(held.controller.memory).toMatchObject({ mode: 'fire', untilTick: 30 });
    expect(afterFire.ships.opponent.reload.port.loaded).toBe(false);
  });
});
