import { LEADS } from '../content/campaign';
import type { CampaignStateV1 } from './types';

export type RedJackdawView =
  | {
      status: 'available';
      sentence: string;
      nextAction: string;
    }
  | {
      status: 'active';
      sentence: string;
      nextAction: string;
      daysRemaining: number;
    }
  | {
      status: 'completed' | 'expired';
      sentence: string;
      terminalCopy: string;
    };

export function redJackdawView(state: CampaignStateV1): RedJackdawView {
  const definition = LEADS['red-jackdaw'];
  const lead = state.leads.find(({ id }) => id === definition.id);
  if (lead === undefined) {
    return {
      status: 'available',
      sentence: definition.sentence,
      nextAction: definition.nextAction,
    };
  }

  switch (lead.status) {
    case 'active': {
      const expiresDay = lead.expiresDay
        ?? lead.acceptedDay + definition.expiresAfterDays;
      return {
        status: 'active',
        sentence: definition.sentence,
        nextAction: definition.nextAction,
        daysRemaining: Math.max(0, expiresDay - state.calendar.elapsedDays),
      };
    }
    case 'completed':
      return {
        status: 'completed',
        sentence: definition.sentence,
        terminalCopy: 'The Red Jackdaw lead is complete.',
      };
    case 'expired':
      return {
        status: 'expired',
        sentence: definition.sentence,
        terminalCopy: 'This rumour has gone cold.',
      };
  }
}
