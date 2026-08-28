import { describe, expect, it } from 'vitest';

import type { NavalResolution } from '../domain/naval/types';
import type { CampaignDispatchOutcome, CaribbeanController } from './useCaribbean';

type StrategicControllerContract = {
  setSail(): Promise<CampaignDispatchOutcome>;
  completeSeaLeg(): Promise<CampaignDispatchOutcome>;
  avoidEncounter(): Promise<CampaignDispatchOutcome>;
  engageEncounter(): Promise<CampaignDispatchOutcome>;
  withdrawBattle(): Promise<CampaignDispatchOutcome>;
  resolveBattle(resolution: NavalResolution): Promise<CampaignDispatchOutcome>;
  portFocusTarget: 'last-voyage' | null;
  acknowledgePortFocus(): void;
};

describe('CaribbeanController strategic contract', () => {
  it('requires every Task 3 action and transient focus member', () => {
    // Kills optionalizing the locked controller capabilities behind a narrower alias.
    const requireStrategicContract = (
      controller: CaribbeanController,
    ): StrategicControllerContract => controller;

    expect(requireStrategicContract).toBeTypeOf('function');
  });
});
