import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
import { summarizeNavalResolution } from '../../domain/naval/resolution';
import type { NavalBattleInput } from '../../domain/naval/types';
import { navalEngagedDraft, seaLegCompletedDraft, voyageStartedDraft } from '../../domain/voyage';
import { manualNavalSession, type ManualNavalSession } from '../../state/naval/testSession';
import type { CaribbeanController } from '../../state/useCaribbean';

const useNavalSession = vi.hoisted(() => vi.fn());
vi.mock('../../state/naval/useNavalSession', () => ({ useNavalSession }));

function navalController(): CaribbeanController {
  const lead = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
    type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
  });
  const sailing = appendJournal(lead, voyageStartedDraft(lead.state));
  const encounter = appendJournal(sailing, seaLegCompletedDraft(sailing.state));
  const journal = appendJournal(encounter, navalEngagedDraft(encounter.state));
  return {
    load: { kind: 'empty', revision: { currentRaw: null, previousRaw: null } },
    journal, activity: 'menu', busy: false, persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available', recoveryFailure: null,
    start: vi.fn(), resume: vi.fn(), continueWithoutSaving: vi.fn(), dispatch: vi.fn(), setSail: vi.fn(), completeSeaLeg: vi.fn(),
    avoidEncounter: vi.fn(), engageEncounter: vi.fn(), withdrawBattle: vi.fn().mockResolvedValue({ kind: 'applied', eventId: 5 }),
    resolveBattle: vi.fn().mockResolvedValue({ kind: 'applied', eventId: 5 }),
    portFocusTarget: null, acknowledgePortFocus: vi.fn(), retrySaving: vi.fn(), reloadExternalSave: vi.fn(),
    exportInMemoryJournal: vi.fn(), recover: vi.fn(), continueRecovery: vi.fn(), abandon: vi.fn(),
    selectActivity: vi.fn(), closeActivity: vi.fn(),
  } as CaribbeanController;
}

function savedInput(controller: CaribbeanController): NavalBattleInput {
  const mode = controller.journal?.state.mode;
  if (!mode || mode.kind !== 'naval') throw new Error('fixture requires naval mode');
  return mode.input;
}

function terminalSession(input: NavalBattleInput): ManualNavalSession {
  const session = manualNavalSession({ input });
  session.state.tick = 240;
  session.state.ships.player.position = { x: 0, z: 0 };
  session.state.ships.player.speed = 0;
  session.state.ships.player.crew = 44;
  session.state.ships.opponent.position = { x: 6, z: 0 };
  session.state.ships.opponent.speed = 0;
  session.state.ships.opponent.sails = 24;
  session.state.ships.opponent.crew = 16;
  session.state.outcome = { kind: 'boarding-ready', victorShipId: 'player' };
  session.state.events = [{
    id: 1,
    kind: 'outcome',
    atTick: 240,
    outcome: { kind: 'boarding-ready', victorShipId: 'player' },
  }];
  session.state.nextEventId = 2;
  session.setSail('full');
  return session;
}

async function component() {
  const modulePath = './CampaignNaval' + 'Battle';
  return (await import(/* @vite-ignore */ modulePath)).default;
}

beforeEach(() => {
  useNavalSession.mockReset();
});

describe('<CampaignNavalBattle>', () => {
  it('mounts byte-identical saved input and writes no campaign event while ticks advance', async () => {
    const controller = navalController();
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    const before = structuredClone(controller.journal);
    render(<CampaignNavalBattle controller={controller} />);

    expect(await screen.findByTestId('naval-battle-page')).toBeInTheDocument();
    expect(session.state.input).toEqual(savedInput(controller));
    expect(JSON.stringify(session.state.input)).toBe(JSON.stringify(savedInput(controller)));
    expect(screen.getByText('Reloading restarts this engagement from first contact.')).toBeVisible();
    act(() => session.deliverFrame(1 / 10));
    expect(session.state.tick).toBe(6);
    expect(controller.journal).toEqual(before);
    expect(controller.dispatch).not.toHaveBeenCalled();
    expect(controller.resolveBattle).not.toHaveBeenCalled();
  });

  it('summarizes and validates one terminal state only when Return is activated', async () => {
    const controller = navalController();
    const session = terminalSession(savedInput(controller));
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    expect(controller.resolveBattle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('naval-result-action'));
    fireEvent.click(screen.getByTestId('naval-result-action'));

    await waitFor(() => expect(controller.resolveBattle).toHaveBeenCalledTimes(1));
    expect(controller.resolveBattle).toHaveBeenCalledWith(summarizeNavalResolution(session.state));
    expect(session.restartCount).toBe(0);
  });

  it.each(['summarize', 'validate', 'reducer'] as const)(
    'shows explicit campaign recovery and never auto-dispatches after a %s failure',
    async (failure) => {
      const controller = navalController();
      const session = terminalSession(savedInput(controller));
      if (failure === 'summarize') session.state.tick = Number.NaN;
      if (failure === 'validate') session.state.ships.player.crew = savedInput(controller).player.crew + 1;
      if (failure === 'reducer') vi.mocked(controller.resolveBattle).mockRejectedValueOnce(new Error('reducer rejected'));
      session.setSail('full');
      useNavalSession.mockReturnValue(session);
      const CampaignNavalBattle = await component();
      render(<CampaignNavalBattle controller={controller} />);

      fireEvent.click(screen.getByTestId('naval-result-action'));
      expect(await screen.findByTestId('naval-resolution-error')).toHaveTextContent('Battle result could not be verified.');
      expect(screen.getByTestId('naval-resolution-restart')).toHaveFocus();
      expect(controller.resolveBattle).toHaveBeenCalledTimes(failure === 'reducer' ? 1 : 0);
      expect(controller.withdrawBattle).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('naval-resolution-restart'));
      expect(session.restartCount).toBe(1);
      expect(session.state.tick).toBe(0);
      expect(session.state.input).toEqual(savedInput(controller));
      expect(screen.queryByTestId('naval-resolution-error')).not.toBeInTheDocument();
      expect(controller.withdrawBattle).not.toHaveBeenCalled();
    },
  );

  it('keeps a valid terminal result and announces when persistence does not apply it', async () => {
    const controller = navalController();
    vi.mocked(controller.resolveBattle).mockResolvedValueOnce({ kind: 'not-applied' });
    const session = terminalSession(savedInput(controller));
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    fireEvent.click(screen.getByTestId('naval-result-action'));
    expect(await screen.findByText('Battle result was not saved.')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('naval-result-action')).toBeVisible();
    expect(screen.queryByTestId('naval-resolution-error')).not.toBeInTheDocument();
  });

  it('pauses before awaiting nonterminal withdrawal and exposes retry/resume only after rejection', async () => {
    const controller = navalController();
    let rejectWithdrawal: ((error: Error) => void) | null = null;
    vi.mocked(controller.withdrawBattle).mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectWithdrawal = reject;
    }));
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    fireEvent.click(screen.getByTestId('naval-options-toggle'));
    fireEvent.click(screen.getByTestId('naval-exit-action'));
    expect(session.paused).toBe(true);
    expect(controller.withdrawBattle).toHaveBeenCalledTimes(1);
    act(() => session.deliverFrame(1));
    expect(session.state.tick).toBe(0);

    await act(async () => rejectWithdrawal?.(new Error('writer exploded')));
    expect(await screen.findByTestId('naval-withdrawal-error')).toHaveTextContent('Withdrawal was not completed.');
    expect(session.paused).toBe(true);
    expect(screen.getByTestId('naval-withdrawal-retry')).toBeVisible();
    expect(screen.getByTestId('naval-withdrawal-resume')).toBeVisible();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(session.paused).toBe(true);
    expect(screen.getByTestId('naval-withdrawal-error')).toBeVisible();
    act(() => session.deliverFrame(1));
    expect(session.state.tick).toBe(0);

    fireEvent.click(screen.getByTestId('naval-withdrawal-resume'));
    expect(session.paused).toBe(false);
    expect(screen.queryByTestId('naval-withdrawal-error')).not.toBeInTheDocument();
  });

  it.each([
    ['HUD Resume', () => fireEvent.click(screen.getByTestId('naval-pause'))],
    ['Space', () => fireEvent.keyDown(window, { key: ' ', code: 'Space' })],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })],
  ])('keeps a pending withdrawal paused when ordinary %s is requested', async (_label, requestResume) => {
    const controller = navalController();
    let settleWithdrawal: ((result: { kind: 'not-applied' }) => void) | null = null;
    vi.mocked(controller.withdrawBattle).mockReturnValueOnce(new Promise((resolve) => {
      settleWithdrawal = resolve;
    }));
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    fireEvent.click(screen.getByTestId('naval-options-toggle'));
    fireEvent.click(screen.getByTestId('naval-exit-action'));
    expect(session.paused).toBe(true);

    requestResume();
    expect(session.paused).toBe(true);
    act(() => session.deliverFrame(1));
    expect(session.state.tick).toBe(0);

    await act(async () => settleWithdrawal?.({ kind: 'not-applied' }));
    expect(session.paused).toBe(true);
  });

  it('keeps a not-applied withdrawal paused for controller-owned consent or conflict', async () => {
    const controller = navalController();
    vi.mocked(controller.withdrawBattle).mockResolvedValueOnce({ kind: 'not-applied' });
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    fireEvent.click(screen.getByTestId('naval-options-toggle'));
    fireEvent.click(screen.getByTestId('naval-exit-action'));
    await waitFor(() => expect(controller.withdrawBattle).toHaveBeenCalledTimes(1));
    expect(session.paused).toBe(true);
    expect(screen.queryByTestId('naval-withdrawal-error')).not.toBeInTheDocument();
  });

  it('withdraws separately from a terminal resolution error without resolving malformed data', async () => {
    const controller = navalController();
    const session = terminalSession(savedInput(controller));
    session.state.tick = Number.NaN;
    session.setSail('full');
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    fireEvent.click(screen.getByTestId('naval-result-action'));
    await screen.findByTestId('naval-resolution-error');
    fireEvent.click(screen.getByTestId('naval-resolution-withdraw'));
    await waitFor(() => expect(controller.withdrawBattle).toHaveBeenCalledTimes(1));
    expect(controller.resolveBattle).not.toHaveBeenCalled();
  });

  it('retains a paused session when a byte-equal naval predecessor is reloaded', async () => {
    const controller = navalController();
    const session = manualNavalSession({ input: savedInput(controller) });
    session.setPaused(true);
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    const rendered = render(<CampaignNavalBattle controller={controller} />);
    const firstSessionInput = useNavalSession.mock.calls.at(-1)?.[0];
    expect(firstSessionInput).toEqual(savedInput(controller));
    expect(firstSessionInput).not.toBe(controller.journal?.state.mode.kind === 'naval'
      ? controller.journal.state.mode.input
      : undefined);
    const replacement: CaribbeanController = {
      ...controller,
      journal: structuredClone(controller.journal),
    };

    rendered.rerender(<CampaignNavalBattle controller={replacement} />);
    expect(useNavalSession.mock.calls.at(-1)?.[0]).toBe(firstSessionInput);
    expect(session.paused).toBe(true);
    expect(session.state.tick).toBe(0);
  });
});
