import { describe, expect, it } from 'vitest';

import { createRedJackdawBattleInput } from './naval';
import { RED_JACKDAW_VOYAGE } from './voyage';

describe('the Red Jackdaw authored voyage', () => {
  it('keeps the Bridgetown course, contact checkpoint, and round-trip costs frozen', () => {
    expect(RED_JACKDAW_VOYAGE).toEqual({
      routeId: 'bridgetown-red-jackdaw',
      portId: 'bridgetown',
      bearingLabel: 'East by north',
      windLabel: 'Fresh trade wind from ENE',
      start: { tick: 0, position: { x: 0, z: 0 }, heading: Math.PI / 2, elapsedDays: 0, provisionsUsed: 0 },
      contact: { tick: 3_600, position: { x: 24, z: 4 }, heading: Math.PI / 2, elapsedDays: 1, provisionsUsed: 1 },
      returnCost: { elapsedDays: 1, provisionsUsed: 1 },
    });
  });

  it('builds the entire Red Jackdaw engagement with fresh tactical positions', () => {
    const args = {
      battleId: 'voyage-3-battle',
      seed: 0x1234_5678,
      player: {
        stableShipId: 'mistral', name: 'Mistral', classId: 'sloop' as const,
        hull: 91, sails: 82, crew: 50, cannon: 8,
      },
    };
    const input = createRedJackdawBattleInput(args);

    expect(input).toEqual({
      battleId: 'voyage-3-battle',
      seed: 0x1234_5678,
      windFrom: Math.PI / 3,
      windStrength: 1,
      arenaRadius: 92,
      timeLimitTicks: 14_400,
      objective: 'capture-red-jackdaw',
      player: {
        id: 'player', stableShipId: 'mistral', name: 'Mistral', classId: 'sloop',
        position: { x: 0, z: -36 }, heading: 0,
        hull: 91, sails: 82, crew: 50, cannon: 8,
      },
      opponent: {
        id: 'opponent', stableShipId: 'red-jackdaw', name: 'Red Jackdaw', classId: 'sloop',
        position: { x: 0, z: 36 }, heading: Math.PI,
        hull: 100, sails: 100, crew: 48, cannon: 8,
      },
    });

    const second = createRedJackdawBattleInput(args);
    expect(second).toEqual(input);
    expect(second.player.position).not.toBe(input.player.position);
    expect(second.opponent.position).not.toBe(input.opponent.position);
  });
});
