import { describe, expect, it } from 'vitest';

import { selectAimCue } from '../../components/battle/aimCue';
import { broadsideLegality, broadsideVector } from './geometry';
import { initialOpponentMemory, opponentCommand } from './opponent';
import { stepBattle } from './stepBattle';
import { command, fixture } from './testFixtures';
import type { Broadside, NavalEvent, NavalState } from './types';

function stateFor({
  heading = 0,
  distance = 24,
  physicalSide = 'port',
  loaded = true,
  cannon = 4,
  terminal = false,
}: {
  heading?: number;
  distance?: number;
  physicalSide?: Broadside;
  loaded?: boolean;
  cannon?: number;
  terminal?: boolean;
} = {}): NavalState {
  const lateral = broadsideVector(heading, physicalSide);
  const state = fixture({
    opponent: {
      position: { x: 0, z: 0 },
      heading,
      cannon,
      reload: {
        port: { progress: physicalSide === 'port' && loaded ? 10 : 0, required: 10, loaded: physicalSide === 'port' && loaded },
        starboard: { progress: physicalSide === 'starboard' && loaded ? 10 : 0, required: 10, loaded: physicalSide === 'starboard' && loaded },
      },
    },
    player: { position: { x: lateral.x * distance, z: lateral.z * distance } },
  });
  if (terminal) state.outcome = { kind: 'surrender', victorShipId: 'player' };
  return state;
}

function opponentVolley(state: NavalState, side: Broadside): boolean {
  return stepBattle(state, { opponent: command({ fire: side }) }).events.some(
    (event: NavalEvent) => event.kind === 'volley' && event.shipId === 'opponent',
  );
}

function expectConsumers(state: NavalState, side: Broadside, expectedLegal: boolean): void {
  const legality = broadsideLegality(state, 'opponent', side);
  const aim = selectAimCue(state, 'opponent');
  const opponent = opponentCommand(state, initialOpponentMemory());

  expect(legality.legal).toBe(expectedLegal);
  expect(opponentVolley(state, side)).toBe(expectedLegal);
  expect(aim.side === side && aim.quality !== 'blocked').toBe(expectedLegal);
  expect(opponent.command.fire === side).toBe(expectedLegal);
}

describe('shared state-aware broadside legality', () => {
  it.each([
    ['north', 0],
    ['east', Math.PI / 2],
    ['south', Math.PI],
    ['west', -Math.PI / 2],
  ])('keeps reducer, aim, and opponent decisions aligned at the inclusive 42-unit %s heading', (_name, heading) => {
    expectConsumers(stateFor({ heading, distance: 42 }), 'port', true);
    expectConsumers(stateFor({ heading, distance: 42.01 }), 'port', false);
  });

  it('rejects the wrong physical side and the unloaded physical side everywhere', () => {
    const wrongSide = stateFor({ physicalSide: 'port' });
    expect(broadsideLegality(wrongSide, 'opponent', 'starboard').legal).toBe(false);
    expect(opponentVolley(wrongSide, 'starboard')).toBe(false);
    expect(selectAimCue(wrongSide, 'opponent').side).toBe('port');
    expect(opponentCommand(wrongSide, initialOpponentMemory()).command.fire).toBe('port');

    expectConsumers(stateFor({ loaded: false }), 'port', false);
  });

  it.each([0, 2.5])('rejects a cannon battery of %s everywhere', (cannon) => {
    expectConsumers(stateFor({ cannon }), 'port', false);
  });

  it('rejects terminal fire everywhere, including opponent fire and held-controller recovery', () => {
    const state = stateFor({ terminal: true });
    expectConsumers(state, 'port', false);
    expect(opponentCommand(state, initialOpponentMemory()).command.fire).toBeNull();
    expect(stepBattle(state, { opponent: command({ fire: 'port' }) })).toBe(state);
  });
});
