import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { FrameRunner } from '../../state/naval/FrameRunner';
import { createNavalBattle } from './createBattle';
import { advanceOpponentController, initialOpponentController } from './opponent';
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
): { state: NavalState; retainedBacklog: boolean; finalBacklog: number } {
  const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });
  let state = createNavalBattle(input);
  let opponentController = initialOpponentController();
  let retainedBacklog = false;

  const deliverTicks = (ticks: number) => {
    for (let index = 0; index < ticks && !state.outcome; index++) {
      const opponent = advanceOpponentController(state, opponentController);
      opponentController = opponent.controller;
      state = stepBattle(state, {
        player: segmentAt(segments, state.tick).player,
        opponent: opponent.command,
      });
    }
  };

  for (const frame of frames) {
    const ticks = runner.deliverMicros(frame);
    retainedBacklog ||= runner.backlogTicks > 0;
    deliverTicks(ticks);
  }
  while (runner.backlogTicks > 0) deliverTicks(runner.deliverMicros(0));

  return { state, retainedBacklog, finalBacklog: runner.backlogTicks };
}

describe('deterministic naval replay', () => {
  it('replays byte-equal canonical state under different delivered frame chunks', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.timeLimitTicks = 600;
    const log: CommandSegment[] = [
      { fromTick: 0, untilTick: 137, player: command({ rudder: -1, sail: 'reefed', ammunition: 'chain' }) },
      { fromTick: 137, untilTick: 311, player: command({ rudder: 1, ammunition: 'grape' }) },
      { fromTick: 311, untilTick: 600, player: command({ rudder: 0, sail: 'reefed', ammunition: 'round' }) },
    ];
    const frames60 = evenFrames(10_000_000, 600);
    const irregular = [500_000, ...irregularFrames(9_500_000)];

    const sixty = runDeliveredFrames(input, log, frames60);
    const uneven = runDeliveredFrames(input, log, irregular);
    const direct = replayBattle(input, log);

    expect(uneven.retainedBacklog).toBe(true);
    expect(uneven.finalBacklog).toBe(0);
    expect(JSON.stringify(uneven.state)).toBe(JSON.stringify(sixty.state));
    expect(JSON.stringify(direct)).toBe(JSON.stringify(sixty.state));
    expect(sixty.state.outcome).toEqual({ kind: 'separated', shipId: 'player' });
    expect(sixty.state.events.at(-1)).toMatchObject({ kind: 'outcome' });
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
