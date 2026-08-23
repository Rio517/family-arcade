import { createNavalBattle } from './createBattle';
import { initialOpponentMemory, opponentCommand, type OpponentDecision } from './opponent';
import { stepBattle } from './stepBattle';
import type { NavalBattleInput, NavalCommand, NavalState } from './types';

export interface CommandSegment {
  fromTick: number;
  untilTick: number;
  player: NavalCommand;
}

function validateSegments(segments: readonly CommandSegment[]): void {
  const issues: string[] = [];
  if (segments.length === 0 || segments[0]?.fromTick !== 0) issues.push('tick-zero:not-covered');

  let previousUntil = 0;
  segments.forEach((segment, index) => {
    if (!Number.isSafeInteger(segment.fromTick) || segment.fromTick < 0) {
      issues.push(`${index}.fromTick:not-non-negative-safe-integer`);
    }
    if (!Number.isSafeInteger(segment.untilTick) || segment.untilTick <= segment.fromTick) {
      issues.push(`${index}.range:not-positive`);
    }
    if (index > 0 && segment.fromTick < previousUntil) issues.push(`${index}:overlap`);
    previousUntil = segment.untilTick;
  });

  if (issues.length > 0) throw new Error(`Invalid command segments: ${issues.join(', ')}`);
}

export function replayBattle(input: NavalBattleInput, segments: readonly CommandSegment[]): NavalState {
  validateSegments(segments);

  let state = createNavalBattle(input);
  let memory = initialOpponentMemory();
  let opponentDecision: OpponentDecision | null = null;
  let segmentIndex = 0;

  while (!state.outcome) {
    while (segments[segmentIndex] && state.tick >= segments[segmentIndex].untilTick) segmentIndex += 1;
    const segment = segments[segmentIndex];
    if (!segment || state.tick < segment.fromTick) {
      throw new Error(`Invalid command segments: tick ${state.tick} is not covered`);
    }

    if (state.tick >= memory.untilTick) {
      opponentDecision = opponentCommand(state, memory);
      memory = opponentDecision.memory;
    }
    if (!opponentDecision) throw new Error('Opponent decision was not initialized');

    state = stepBattle(state, {
      player: segment.player,
      opponent: opponentDecision.command,
    });
  }

  return state;
}
