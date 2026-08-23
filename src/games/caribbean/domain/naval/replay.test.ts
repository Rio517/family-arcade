import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { FrameRunner } from '../../state/naval/FrameRunner';
import { createNavalBattle } from './createBattle';
import { initialOpponentMemory, opponentCommand } from './opponent';
import { replayBattle, type CommandSegment } from './replay';
import { stepBattle } from './stepBattle';
import { command } from './testFixtures';
import type { NavalBattleInput, NavalState } from './types';

function evenFrames(totalMicros: number, count: number): number[] {
  const base = Math.floor(totalMicros / count);
  const remainder = totalMicros % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function irregularFrames(totalMicros: number): number[] {
  const pattern = [7_003, 24_991, 18_007, 49_999, 11_111, 33_337];
  const frames: number[] = [];
  let remaining = totalMicros;
  let index = 0;
  while (remaining > 0) {
    const frame = Math.min(remaining, pattern[index % pattern.length]);
    frames.push(frame);
    remaining -= frame;
    index += 1;
  }
  return frames;
}

function segmentAt(segments: readonly CommandSegment[], tick: number): CommandSegment {
  const segment = segments.find((candidate) => candidate.fromTick <= tick && tick < candidate.untilTick);
  if (!segment) throw new Error(`No player command at tick ${tick}`);
  return segment;
}

function runDeliveredFrames(
  input: NavalBattleInput,
  segments: readonly CommandSegment[],
  frames: readonly number[],
): NavalState {
  const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });
  let state = createNavalBattle(input);
  let opponentMemory = initialOpponentMemory();
  let opponentDecision = opponentCommand(state, opponentMemory);
  opponentMemory = opponentDecision.memory;

  for (const frame of frames) {
    const ticks = runner.deliverMicros(frame);
    for (let index = 0; index < ticks && !state.outcome; index++) {
      if (state.tick >= opponentMemory.untilTick) {
        opponentDecision = opponentCommand(state, opponentMemory);
        opponentMemory = opponentDecision.memory;
      }
      state = stepBattle(state, {
        player: segmentAt(segments, state.tick).player,
        opponent: opponentDecision.command,
      });
    }
  }

  return state;
}

function combatInput(): NavalBattleInput {
  const input = structuredClone(BATTLE_LAB_INPUT);
  input.timeLimitTicks = 600;
  input.player.position = { x: 0, z: 0 };
  input.player.heading = 0;
  input.opponent.position = { x: 12, z: 0 };
  input.opponent.heading = Math.PI;
  input.opponent.hull = 25;
  input.opponent.cannon = 1;
  return input;
}

describe('deterministic naval replay', () => {
  it('replays byte-equal canonical state under different delivered frame chunks', () => {
    const input = combatInput();
    const log: CommandSegment[] = [
      { fromTick: 0, untilTick: 600, player: command({ ammunition: 'round', fire: 'port' }) },
    ];
    const frames60 = evenFrames(10_000_000, 600);
    const irregular = irregularFrames(10_000_000);

    const sixty = runDeliveredFrames(input, log, frames60);
    const uneven = runDeliveredFrames(input, log, irregular);

    expect(uneven).toEqual(sixty);
    expect(replayBattle(input, log)).toEqual(sixty);
    expect(sixty.outcome).toEqual({ kind: 'surrender', victorShipId: 'player' });
    expect(sixty.events.map((event) => event.kind)).toEqual([
      'volley', 'volley', 'damage', 'damage', 'outcome',
    ]);
  });

  it('recomputes controller memory without adding it to canonical replay state', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.timeLimitTicks = 120;
    const log: CommandSegment[] = [
      { fromTick: 0, untilTick: 60, player: command({ rudder: -1, sail: 'reefed' }) },
      { fromTick: 60, untilTick: 120, player: command({ rudder: 1 }) },
    ];

    const first = replayBattle(input, log);
    const second = replayBattle(structuredClone(input), structuredClone(log));

    expect(first).toEqual(second);
    expect(first.outcome).toEqual({ kind: 'separated', shipId: 'player' });
    expect(first).not.toHaveProperty('opponentMemory');
  });

  it.each([
    ['does not cover tick zero', [{ fromTick: 1, untilTick: 10, player: command() }]],
    [
      'overlaps its predecessor',
      [
        { fromTick: 0, untilTick: 10, player: command() },
        { fromTick: 9, untilTick: 20, player: command() },
      ],
    ],
    ['has an empty range', [{ fromTick: 0, untilTick: 0, player: command() }]],
  ] as const)('rejects a command log that %s', (_label, segments) => {
    expect(() => replayBattle(BATTLE_LAB_INPUT, segments)).toThrow(/Invalid command segments/);
  });
});
