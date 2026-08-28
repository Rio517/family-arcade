import { describe, expect, it } from 'vitest';

import { LEADS } from '../content/campaign';
import { createCampaign } from './createCampaign';
import { appendJournal, createJournal } from './replay';
import { redJackdawView, type RedJackdawView } from './leadSelectors';
import { encounterAvoidedDraft, seaLegCompletedDraft, voyageStartedDraft } from './voyage';

const SENTENCE = 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.';
const NEXT_ACTION = 'Sail east of Bridgetown and identify the Red Jackdaw.';

function acceptedState() {
  return appendJournal(createJournal(createCampaign({ seed: 1702 })), {
    type: 'lead-accepted',
    payload: { leadId: 'red-jackdaw' },
  }).state;
}

describe('redJackdawView', () => {
  it('resolves the available rumour and action from authored content', () => {
    const state = createCampaign({ seed: 1702 });

    expect(redJackdawView(state)).toEqual({
      status: 'available',
      sentence: SENTENCE,
      nextAction: NEXT_ACTION,
    });
    expect(LEADS['red-jackdaw']).toMatchObject({
      sentence: SENTENCE,
      nextAction: NEXT_ACTION,
      expiresAfterDays: 18,
    });
    expect(JSON.stringify(state)).not.toContain(SENTENCE);
    expect(JSON.stringify(state)).not.toContain(NEXT_ACTION);
  });

  it('reports all 18 days at opening acceptance', () => {
    expect(redJackdawView(acceptedState())).toEqual({
      status: 'active',
      sentence: SENTENCE,
      nextAction: NEXT_ACTION,
      daysRemaining: 18,
    });
  });

  it('clamps an overdue active lead to zero days remaining', () => {
    const state = acceptedState();
    state.calendar.elapsedDays = 25;

    expect(redJackdawView(state)).toMatchObject({
      status: 'active',
      daysRemaining: 0,
    });
  });

  it('uses terminal completed copy without retaining a stale action', () => {
    const state = acceptedState();
    state.leads[0].status = 'completed';

    const view = redJackdawView(state);
    expect(view).toEqual({
      status: 'completed',
      sentence: SENTENCE,
      terminalCopy: 'The Red Jackdaw lead is complete.',
    });
    expect('nextAction' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('Sail east');
  });

  it('uses terminal expired copy without retaining a stale action', () => {
    const state = acceptedState();
    state.leads[0].status = 'expired';

    const view = redJackdawView(state);
    expect(view).toEqual({
      status: 'expired',
      sentence: SENTENCE,
      terminalCopy: 'This rumour has gone cold.',
    });
    expect('nextAction' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('Sail east');
  });

  it('shows terminal expiry immediately after a non-victory voyage returns on the deadline', () => {
    // Kills reducer expiry omission that the selector would otherwise display as an active zero-day lead.
    const state = acceptedState();
    state.leads[0].expiresDay = 2;
    const departed = appendJournal(createJournal(state), voyageStartedDraft(state));
    const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
    const returned = appendJournal(contact, encounterAvoidedDraft(contact.state));

    expect(returned.state.calendar.elapsedDays).toBe(2);
    expect(redJackdawView(returned.state)).toEqual({
      status: 'expired',
      sentence: SENTENCE,
      terminalCopy: 'This rumour has gone cold.',
    });
  });

  it('does not mutate the campaign graph', () => {
    const state = acceptedState();
    const before = structuredClone(state);

    redJackdawView(state);

    expect(state).toEqual(before);
  });

  it('keeps nextAction out of the terminal union members', () => {
    type TerminalView = Extract<RedJackdawView, { status: 'completed' | 'expired' }>;
    const terminalHasNextAction: 'nextAction' extends keyof TerminalView ? true : false = false;
    const terminal: TerminalView = {
      status: 'completed',
      sentence: SENTENCE,
      terminalCopy: 'The Red Jackdaw lead is complete.',
    };

    expect(terminalHasNextAction).toBe(false);
    expect(terminal).not.toHaveProperty('nextAction');
  });
});
