import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
import { summarizeNavalResolution } from '../../domain/naval/resolution';
import type { NavalBattleInput } from '../../domain/naval/types';
import { navalEngagedDraft, seaLegCompletedDraft, voyageStartedDraft } from '../../domain/voyage';
import { NavalSession } from '../../state/naval/NavalSession';
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

  it('freezes time and blocks every tactical shortcut while a persistence decision owns the route', async () => {
    // Kills dropping either the persistence pause hold or the NavalBattlePage interaction block.
    const controller = navalController();
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} persistenceDecisionRequired />);

    expect(session.paused).toBe(true);
    act(() => session.deliverFrame(1));
    expect(session.state.tick).toBe(0);
    const commandsBefore = session.commandHistory();

    for (const [key, code] of [
      ['a', 'KeyA'],
      ['ArrowLeft', 'ArrowLeft'],
      ['d', 'KeyD'],
      ['ArrowRight', 'ArrowRight'],
      ['q', 'KeyQ'],
      ['e', 'KeyE'],
      ['1', 'Digit1'],
      ['2', 'Digit2'],
      ['3', 'Digit3'],
      ['r', 'KeyR'],
      [' ', 'Space'],
      ['Escape', 'Escape'],
    ]) {
      fireEvent.keyDown(window, { key, code });
      fireEvent.keyUp(window, { key, code });
    }
    expect(session.currentCommand).toEqual({
      rudder: 0,
      sail: 'full',
      ammunition: 'round',
      fire: null,
    });
    expect(session.commandHistory()).toEqual(commandsBefore);
    expect(session.paused).toBe(true);
  });

  it('releases only persistence ownership and preserves user, visibility, and withdrawal pauses', async () => {
    // Kills replacing the named release with setPaused(false) or resumeFromPauseHold().
    const controller = navalController();
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    const rendered = render(
      <CampaignNavalBattle controller={controller} persistenceDecisionRequired />,
    );

    expect(session.paused).toBe(true);
    act(() => {
      session.setPaused(true);
      session.setPauseHold('visibility', true);
      session.setPauseHold('campaign-withdrawal', true);
    });

    rendered.rerender(
      <CampaignNavalBattle controller={controller} persistenceDecisionRequired={false} />,
    );
    act(() => {
      session.setPauseHold('visibility', false);
      session.setPauseHold('campaign-withdrawal', false);
    });
    expect(session.paused).toBe(true);

    act(() => session.setPaused(false));
    expect(session.paused).toBe(false);
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

    const retry = screen.getByTestId('naval-withdrawal-retry');
    const resume = screen.getByTestId('naval-withdrawal-resume');
    expect(retry).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(resume).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', code: 'Tab' });
    expect(retry).toHaveFocus();

    const historyBeforeShortcuts = session.commandHistory();
    for (const [key, code] of [
      ['a', 'KeyA'],
      ['q', 'KeyQ'],
      ['2', 'Digit2'],
      ['r', 'KeyR'],
    ]) {
      fireEvent.keyDown(window, { key, code });
      fireEvent.keyUp(window, { key, code });
    }
    expect(session.commandHistory()).toEqual(historyBeforeShortcuts);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(session.paused).toBe(true);
    expect(screen.getByTestId('naval-withdrawal-error')).toBeVisible();
    expect(retry).toHaveFocus();
    act(() => session.deliverFrame(1));
    expect(session.state.tick).toBe(0);

    fireEvent.click(resume);
    expect(session.paused).toBe(false);
    expect(screen.queryByTestId('naval-withdrawal-error')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'd', code: 'KeyD' });
    expect(session.currentCommand.rudder).toBe(1);
    fireEvent.keyUp(window, { key: 'd', code: 'KeyD' });
  });

  it('restores tactical shortcuts when withdrawal retry explicitly closes recovery', async () => {
    const controller = navalController();
    vi.mocked(controller.withdrawBattle)
      .mockRejectedValueOnce(new Error('writer exploded'))
      .mockImplementationOnce(() => new Promise(() => {}));
    const session = manualNavalSession({ input: savedInput(controller) });
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    render(<CampaignNavalBattle controller={controller} />);

    fireEvent.click(screen.getByTestId('naval-options-toggle'));
    fireEvent.click(screen.getByTestId('naval-exit-action'));
    await screen.findByTestId('naval-withdrawal-error');
    fireEvent.click(screen.getByTestId('naval-withdrawal-retry'));

    expect(screen.queryByTestId('naval-withdrawal-error')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    expect(session.currentCommand.rudder).toBe(-1);
    fireEvent.keyUp(window, { key: 'a', code: 'KeyA' });
    expect(session.paused).toBe(true);
  });

  it('makes recovery Resume the sole composed release and primes RAF after hidden withdrawal wall time', async () => {
    const controller = navalController();
    let rejectWithdrawal: ((error: Error) => void) | null = null;
    vi.mocked(controller.withdrawBattle).mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectWithdrawal = reject;
    }));
    const callbacks: FrameRequestCallback[] = [];
    const session = new NavalSession(savedInput(controller), {
      requestFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });
    let visibility: DocumentVisibilityState = 'visible';
    const visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    const rendered = render(<CampaignNavalBattle controller={controller} />);

    try {
      session.start();
      callbacks.shift()?.(1_000);
      fireEvent.click(screen.getByTestId('naval-options-toggle'));
      fireEvent.click(screen.getByTestId('naval-exit-action'));

      visibility = 'hidden';
      fireEvent(document, new Event('visibilitychange'));
      callbacks.shift()?.(61_000);
      visibility = 'visible';
      fireEvent(document, new Event('visibilitychange'));
      await act(async () => rejectWithdrawal?.(new Error('writer exploded')));

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(session.paused).toBe(true);
      expect(screen.getByTestId('naval-withdrawal-error')).toBeVisible();

      fireEvent.click(screen.getByTestId('naval-withdrawal-resume'));
      expect(session.paused).toBe(false);
      expect(screen.queryByTestId('naval-withdrawal-error')).not.toBeInTheDocument();

      callbacks.shift()?.(121_000);
      expect(session.state.tick).toBe(0);
      callbacks.shift()?.(121_016.667);
      expect(session.state.tick).toBe(1);
    } finally {
      rendered.unmount();
      session.dispose();
      visibilityState.mockRestore();
    }
  });

  it('keeps visibility ownership when recovery Resume is activated while still hidden', async () => {
    const controller = navalController();
    vi.mocked(controller.withdrawBattle).mockRejectedValueOnce(new Error('writer exploded'));
    const session = manualNavalSession({ input: savedInput(controller) });
    let visibility: DocumentVisibilityState = 'visible';
    const visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    useNavalSession.mockReturnValue(session);
    const CampaignNavalBattle = await component();
    const rendered = render(<CampaignNavalBattle controller={controller} />);

    try {
      fireEvent.click(screen.getByTestId('naval-options-toggle'));
      fireEvent.click(screen.getByTestId('naval-exit-action'));
      visibility = 'hidden';
      fireEvent(document, new Event('visibilitychange'));
      await screen.findByTestId('naval-withdrawal-error');

      fireEvent.click(screen.getByTestId('naval-withdrawal-resume'));
      expect(session.paused).toBe(true);
      act(() => session.deliverFrame(1));
      expect(session.state.tick).toBe(0);

      visibility = 'visible';
      fireEvent(document, new Event('visibilitychange'));
      expect(session.paused).toBe(false);
    } finally {
      rendered.unmount();
      visibilityState.mockRestore();
    }
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
