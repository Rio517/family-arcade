import { BATTLE_LAB_INPUT } from '../../content/naval';
import { validateNavalInput } from '../../domain/naval/createBattle';
import type { NavalBattleInput } from '../../domain/naval/types';

export interface NavalHarnessConfig {
  battleInput: NavalBattleInput;
  forceWebglFailure: boolean;
}

export function readNavalHarnessConfig(search: string): NavalHarnessConfig {
  const params = new URLSearchParams(search);
  const serialized = params.get('input');
  let battleInput = structuredClone(BATTLE_LAB_INPUT);

  if (serialized !== null) {
    try {
      const candidate = JSON.parse(serialized) as NavalBattleInput;
      const validation = validateNavalInput(candidate);
      if (!validation.ok) throw new Error(validation.issues.join(', '));
      battleInput = structuredClone(candidate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes(':')) throw new Error(`Invalid naval input: ${reason}`);
      throw new Error(`Could not parse serialized naval input: ${reason}`);
    }
  }

  return {
    battleInput,
    forceWebglFailure: params.get('forceWebglFailure') === '1',
  };
}
