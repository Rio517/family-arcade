import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AudioFactory, BattleAudioContext } from '../../audio/BattleAudio';
import { BATTLE_LAB_INPUT } from '../../content/naval';
import { NavalSession } from '../../state/naval/NavalSession';
import { manualNavalSession } from '../../state/naval/testSession';
import type { NavalEvent, NavalOutcome } from '../../domain/naval/types';
import { NavalBattlePage } from './NavalBattlePage';
import type { NavalSceneAdapter, NavalSceneFactory } from './NavalViewport';

const BOARDING_READY: NavalOutcome = { kind: 'boarding-ready', victorShipId: 'player' };

function pageAudioFactory() {
  const cues: string[] = [];
  const contexts: Array<{ closed: number }> = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const node = () => ({
    connect: () => undefined,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    onended: null as (() => void) | null,
    gain: parameter(),
    frequency: parameter(),
    Q: parameter(),
    type: 'sine' as OscillatorType | BiquadFilterType,
    buffer: null as unknown,
  });
  const factory: AudioFactory = {
    createContext: () => {
      const owned = { closed: 0 };
      contexts.push(owned);
      return {
        currentTime: 0,
        destination: {},
        resume: () => Promise.resolve(),
        close: () => { owned.closed += 1; return Promise.resolve(); },
        createGain: node,
        createOscillator: node,
        createBuffer: (_channels: number, length: number) => {
          const data = new Float32Array(length);
          return { getChannelData: () => data };
        },
        createBufferSource: node,
        createBiquadFilter: node,
      } as unknown as BattleAudioContext;
    },
    onCue: (cue) => cues.push(cue),
  };
  return { factory, cues, contexts };
}

function surrenderEvent(id = 1): NavalEvent {
  return { id, kind: 'outcome', atTick: 1, outcome: { kind: 'surrender', victorShipId: 'player' } };
}

describe('accessible naval command deck', () => {
  it('recreates effect-owned audio after production StrictMode rehearsal and closes only final ownership', async () => {
    const audio = pageAudioFactory();
    const session = manualNavalSession();
    const { unmount } = render(
      <StrictMode><NavalBattlePage session={session} sceneFactory={null} audioFactory={audio.factory} /></StrictMode>,
    );

    fireEvent.click(screen.getByTestId('naval-shot-cycle'));
    await waitFor(() => expect(audio.contexts).toHaveLength(1));
    expect(audio.contexts[0].closed).toBe(0);
    unmount();
    await waitFor(() => expect(audio.contexts[0].closed).toBe(1));
  });

  it('uses the manual component session to deliver real canonical ticks explicitly', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    act(() => session.deliverFrame(1 / 60));

    expect(session.state.tick).toBe(1);
    expect(session.opponentMemory.untilTick).toBeGreaterThan(0);
  });

  it('drops capped manual-frame backlog across a pause transition like production', () => {
    const session = manualNavalSession();

    session.deliverFrame(0.5);
    expect(session.state.tick).toBe(6);
    session.togglePause();
    session.togglePause();
    session.deliverFrame(0);

    expect(session.state.tick).toBe(6);
  });

  it('maps keyboard controls to physical nautical commands and ignores repeated fire', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    fireEvent.keyDown(window, { code: 'KeyQ', key: 'q' });
    fireEvent.keyDown(window, { code: 'KeyQ', key: 'q', repeat: true });
    fireEvent.keyDown(window, { code: 'KeyE', key: 'e' });
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' });
    fireEvent.keyDown(window, { code: 'KeyD', key: 'd' });
    fireEvent.keyUp(window, { code: 'KeyD', key: 'd' });

    expect(session.commandHistory()).toEqual(expect.arrayContaining([
      expect.objectContaining({ fire: 'port' }),
      expect.objectContaining({ fire: 'starboard' }),
      expect.objectContaining({ rudder: -1 }),
      expect.objectContaining({ rudder: 1 }),
    ]));
    expect(session.commandHistory().filter((command) => command.fire === 'port')).toHaveLength(1);
    expect(session.currentCommand.rudder).toBe(0);
  });

  it('cycles shot with S and leaves the removed number shortcuts inert', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    for (const ammunition of ['chain', 'grape', 'round'] as const) {
      fireEvent.keyDown(window, { code: 'KeyS', key: 's' });
      expect(session.currentCommand.ammunition).toBe(ammunition);
    }
    for (const [key, code] of [['1', 'Digit1'], ['2', 'Digit2'], ['3', 'Digit3']]) {
      fireEvent.keyDown(window, { key, code });
      expect(session.currentCommand.ammunition).toBe('round');
    }
  });

  it('keeps port and starboard controls physically bracketed with visible labels and touch-safe release', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const port = screen.getByTestId('naval-fire-port');
    const starboard = screen.getByTestId('naval-fire-starboard');
    const turnPort = screen.getByTestId('naval-rudder-port');
    const turnStarboard = screen.getByTestId('naval-rudder-starboard');

    expect(port).toHaveTextContent('Fire port');
    expect(starboard).toHaveTextContent('Fire starboard');
    for (const control of [port, starboard, turnPort, turnStarboard]) {
      expect(control).toHaveClass('naval-control', 'naval-hit-target');
      expect(control).toHaveAttribute('type', 'button');
    }

    fireEvent.pointerDown(turnPort, { pointerId: 1 });
    expect(session.currentCommand.rudder).toBe(-1);
    fireEvent.pointerCancel(turnPort, { pointerId: 1 });
    expect(session.currentCommand.rudder).toBe(0);

    fireEvent.pointerDown(turnStarboard, { pointerId: 2 });
    expect(session.currentCommand.rudder).toBe(1);
    fireEvent.pointerUp(turnStarboard, { pointerId: 2 });
    expect(session.currentCommand.rudder).toBe(0);
  });

  it('exposes rendered keyboard rudder state through the exact 140ms release boundary', () => {
    vi.useFakeTimers();
    try {
      const session = manualNavalSession();
      render(<NavalBattlePage session={session} sceneFactory={null} />);
      const turnPort = screen.getByTestId('naval-rudder-port');

      fireEvent.click(turnPort, { detail: 0 });
      expect(turnPort).toHaveAttribute('aria-pressed', 'true');
      expect(session.currentCommand.rudder).toBe(-1);
      act(() => vi.advanceTimersByTime(139));
      expect(turnPort).toHaveAttribute('aria-pressed', 'true');
      expect(session.currentCommand.rudder).toBe(-1);
      act(() => vi.advanceTimersByTime(1));
      expect(turnPort).toHaveAttribute('aria-pressed', 'false');
      expect(session.currentCommand.rudder).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the six action-first command modules with compact QWERTY badges', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const strip = screen.getByRole('group', { name: 'Battle commands' });
    for (const [testId, key, action] of [
      ['naval-rudder-port', 'A', 'Turn port'],
      ['naval-fire-port', 'Q', 'Fire port'],
      ['naval-shot-cycle', 'S', 'Change shot'],
      ['naval-sail-toggle', 'R', 'Change sail'],
      ['naval-fire-starboard', 'E', 'Fire starboard'],
      ['naval-rudder-starboard', 'D', 'Turn starboard'],
    ]) {
      const control = within(strip).getByTestId(testId);
      expect(control).toHaveTextContent(key);
      expect(control).toHaveTextContent(action);
      expect(control).toHaveClass('naval-hit-target');
    }
    expect(within(strip).queryByTestId(/naval-ammo-/)).not.toBeInTheDocument();
    expect(within(strip).getAllByTestId(/naval-fire-(port|starboard)/)).toHaveLength(2);
    expect(screen.getByTestId('naval-pause')).toHaveTextContent('Space / Esc');
  });

  it('integrates each player battery readiness meter with its fire action', () => {
    const session = manualNavalSession();
    session.state.ships.player.reload.port = { loaded: true, progress: 120, required: 120 };
    session.state.ships.player.reload.starboard = { loaded: false, progress: 60, required: 120 };
    session.deliverFrame(0);
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const port = screen.getByTestId('naval-fire-port');
    const starboard = screen.getByTestId('naval-fire-starboard');
    expect(port).toHaveAccessibleName('Fire port — ready');
    expect(port).toHaveTextContent('Ready');
    expect(starboard).toHaveAccessibleName('Fire starboard — reloading 50 percent');
    expect(starboard).toHaveTextContent('Reloading 50%');
    expect(starboard.querySelector('.naval-fire-control__meter b')).toHaveStyle({ width: '50%' });
  });

  it('maps sail, ammunition, pause, and restart actions through stable test ids', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const sail = screen.getByTestId('naval-sail-toggle');
    expect(sail).toHaveAttribute('aria-pressed', 'false');
    expect(sail).toHaveAccessibleName(/sail setting: full.*reef/i);
    expect(sail).toHaveTextContent('Change sail');
    expect(sail).toHaveTextContent('Full');
    fireEvent.click(sail);
    expect(screen.getByTestId('naval-sail-toggle')).toBe(sail);
    expect(sail).toHaveAttribute('aria-pressed', 'true');
    expect(sail).toHaveAccessibleName(/sail setting: reefed.*full/i);
    expect(sail).toHaveTextContent('Change sail');
    expect(sail).toHaveTextContent('Reefed');
    fireEvent.click(screen.getByTestId('naval-shot-cycle'));
    fireEvent.click(screen.getByTestId('naval-pause'));

    expect(session.currentCommand).toMatchObject({ sail: 'reefed', ammunition: 'chain' });
    expect(session.paused).toBe(true);
    expect(screen.getByTestId('naval-pause')).toHaveTextContent('Resume');

    fireEvent.click(screen.getByTestId('naval-restart'));
    expect(session.restartCount).toBe(1);
  });

  it('keeps restart and all feedback settings in a compact Options disclosure without changing battle state', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);
    const before = session.getSnapshot();
    const options = screen.getByTestId('naval-options');

    expect(options).not.toHaveAttribute('open');
    fireEvent.click(screen.getByTestId('naval-options-toggle'));
    expect(options).toHaveAttribute('open');
    for (const testId of [
      'naval-restart',
      'naval-setting-aim',
      'naval-setting-steering',
      'naval-setting-shake',
      'naval-setting-flashes',
      'naval-setting-effects',
      'naval-setting-mute',
    ]) expect(screen.getByTestId(testId)).toBeVisible();
    expect(session.getSnapshot().state.tick).toBe(before.state.tick);
    expect(session.paused).toBe(before.paused);
    expect(session.commandHistory()).toHaveLength(0);
  });

  it('uses Escape to pause and resume without letting repeated pause commands through', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(session.paused).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape', repeat: true });
    expect(session.paused).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(session.paused).toBe(false);
  });

  it('shows one result and never emits the same resolution twice', () => {
    const session = manualNavalSession({ outcome: BOARDING_READY });
    const onResolved = vi.fn();
    const { rerender } = render(
      <NavalBattlePage session={session} sceneFactory={null} onResolved={onResolved} />,
    );

    expect(screen.getByRole('heading', { name: /ready to board/i })).toBeVisible();
    expect(onResolved).toHaveBeenCalledTimes(1);

    rerender(<NavalBattlePage session={session} sceneFactory={null} onResolved={onResolved} />);
    expect(onResolved).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('naval-result-restart'));
    act(() => {
      session.state.outcome = structuredClone(BOARDING_READY);
      session.setSail('full');
    });

    expect(onResolved).toHaveBeenCalledTimes(2);
  });

  it('presents a terminal result as a modal, focuses recovery, and inerts the covered deck', () => {
    const session = manualNavalSession({ outcome: BOARDING_READY });
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const dialog = screen.getByRole('dialog', { name: /ready to board/i });
    const restart = screen.getByTestId('naval-result-restart');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(restart).toHaveFocus();
    expect(screen.getByTestId('naval-battle-underlay')).toHaveAttribute('inert');

    fireEvent.keyDown(window, { code: 'KeyQ', key: 'q' });
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' });
    expect(session.commandHistory()).toHaveLength(0);

    fireEvent.click(restart);
    expect(screen.getByTestId('naval-fire-port')).toHaveFocus();
  });

  it('uses one guarded campaign Return action with a cloned terminal state while preserving Battle Lab defaults', () => {
    const session = manualNavalSession({ outcome: BOARDING_READY });
    const activate = vi.fn((state) => {
      state.ships.player.hull = 0;
    });
    render(
      <NavalBattlePage
        session={session}
        sceneFactory={null}
        resultAction={{ label: 'Return to Bridgetown', busy: false, activate }}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /ready to board/i });
    expect(dialog).toHaveTextContent('Campaign result');
    expect(dialog).not.toHaveTextContent('Battle Lab result');
    expect(screen.queryByTestId('naval-result-restart')).not.toBeInTheDocument();
    expect(screen.queryByText(/withdraw/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('naval-result-action'));
    fireEvent.click(screen.getByTestId('naval-result-action'));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ outcome: BOARDING_READY }));
    expect(activate.mock.calls[0]?.[0]).not.toBe(session.getSnapshot().state);
    expect(session.getSnapshot().state.ships.player.hull).toBe(100);
    expect(session.state.ships.player.hull).toBe(100);
    expect(session.restartCount).toBe(0);
  });

  it('keeps campaign result copy free of Battle Lab instructions for a player surrender', () => {
    const session = manualNavalSession({ outcome: { kind: 'surrender', victorShipId: 'opponent' } });
    render(
      <NavalBattlePage
        session={session}
        sceneFactory={null}
        resultAction={{ label: 'Return to Bridgetown', busy: false, activate: vi.fn() }}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /surrender/i });
    expect(dialog).toHaveTextContent('Mistral and crew surrendered');
    expect(dialog).toHaveTextContent('Return to Bridgetown when ready.');
    expect(dialog).not.toHaveTextContent('Battle Lab');
  });

  it('adds guarded campaign withdrawal only to nonterminal Options', () => {
    const session = manualNavalSession();
    const activate = vi.fn();
    const { rerender } = render(
      <NavalBattlePage
        session={session}
        sceneFactory={null}
        exitAction={{ label: 'Withdraw to Bridgetown', busy: false, activate }}
      />,
    );

    fireEvent.click(screen.getByTestId('naval-options-toggle'));
    const withdraw = screen.getByTestId('naval-exit-action');
    expect(withdraw).toHaveTextContent('Withdraw to Bridgetown');
    fireEvent.click(withdraw);
    fireEvent.click(withdraw);
    expect(activate).toHaveBeenCalledTimes(1);

    act(() => {
      session.state.outcome = structuredClone(BOARDING_READY);
      session.setSail('full');
    });
    rerender(
      <NavalBattlePage
        session={session}
        sceneFactory={null}
        resultAction={{ label: 'Return to Bridgetown', busy: false, activate: vi.fn() }}
        exitAction={{ label: 'Withdraw to Bridgetown', busy: false, activate }}
      />,
    );
    expect(screen.queryByTestId('naval-exit-action')).not.toBeInTheDocument();
  });

  it('renders a campaign-only resolution error with trapped Restart and Withdraw actions', () => {
    const session = manualNavalSession({ outcome: BOARDING_READY });
    const restart = vi.fn();
    const withdraw = vi.fn();
    render(
      <NavalBattlePage
        session={session}
        sceneFactory={null}
        resolutionErrorAction={{
          message: 'Battle result could not be verified.',
          busy: false,
          restartLabel: 'Restart engagement',
          withdrawLabel: 'Withdraw to Bridgetown',
          restart,
          withdraw,
        }}
      />,
    );

    const dialog = screen.getByTestId('naval-resolution-error');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveTextContent('Battle result could not be verified.');
    expect(dialog).not.toHaveTextContent('Battle Lab');
    const restartButton = screen.getByTestId('naval-resolution-restart');
    const withdrawButton = screen.getByTestId('naval-resolution-withdraw');
    expect(restartButton).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(withdrawButton).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(restartButton).toHaveFocus();

    fireEvent.click(restartButton);
    fireEvent.click(restartButton);
    fireEvent.click(withdrawButton);
    fireEvent.click(withdrawButton);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(session.restartCount).toBe(0);
  });

  it('pauses on hidden visibility and leaves visible return paused', () => {
    let visibility: DocumentVisibilityState = 'visible';
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    try {
      const session = manualNavalSession();
      render(<NavalBattlePage session={session} sceneFactory={null} />);

      visibility = 'hidden';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(session.paused).toBe(true);

      visibility = 'visible';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(session.paused).toBe(true);
    } finally {
      visibilitySpy.mockRestore();
    }
  });

  it('holds an initially hidden StrictMode battle at tick zero until a fresh visible-frame prime', () => {
    const callbacks: FrameRequestCallback[] = [];
    let nextHandle = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      nextHandle += 1;
      return nextHandle;
    });
    const cancelFrame = vi.fn();
    let visibility: DocumentVisibilityState = 'hidden';
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const session = new NavalSession(BATTLE_LAB_INPUT, { requestFrame, cancelFrame });
    session.start();
    try {
      const view = render(
        <StrictMode><NavalBattlePage session={session} sceneFactory={null} /></StrictMode>,
      );

      expect(session.paused).toBe(true);
      act(() => callbacks.shift()?.(1_000));
      expect(session.state.tick).toBe(0);

      visibility = 'visible';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(session.paused).toBe(true);

      fireEvent.click(screen.getByTestId('naval-pause'));
      expect(session.paused).toBe(false);
      act(() => callbacks.shift()?.(61_000));
      expect(session.state.tick).toBe(0);
      act(() => callbacks.shift()?.(61_016.667));
      expect(session.state.tick).toBe(1);

      visibility = 'hidden';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(session.paused).toBe(true);
      view.unmount();
      session.setPaused(false);
      expect(session.paused).toBe(false);
    } finally {
      session.dispose();
      expect(cancelFrame).toHaveBeenCalled();
      visibilitySpy.mockRestore();
    }
  });

  it('clears a held rudder across terminal suppression before rematch steering', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(session.currentCommand.rudder).toBe(-1);

    act(() => {
      session.state.outcome = structuredClone(BOARDING_READY);
      session.setSail('full');
    });
    expect(screen.getByRole('dialog', { name: /ready to board/i })).toBeVisible();

    const terminalHistoryLength = session.commandHistory().length;
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' });
    expect(session.commandHistory()).toHaveLength(terminalHistoryLength);

    fireEvent.click(screen.getByTestId('naval-result-restart'));
    fireEvent.keyDown(window, { code: 'KeyD', key: 'd' });
    fireEvent.keyUp(window, { code: 'KeyD', key: 'd' });

    expect(session.commandHistory().map(({ rudder }) => rudder)).toEqual([1, 0]);
  });

  it('releases held keyboard steering when the battle window loses focus', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' });
    expect(session.currentCommand.rudder).toBe(-1);

    fireEvent.blur(window);

    expect(session.currentCommand.rudder).toBe(0);
  });

  it('pauses and offers deterministic restart when canonical validation detects drift', () => {
    const onResolved = vi.fn();
    const session = manualNavalSession({
      validator: () => ({ ok: false, issues: ['player.position.x:not-finite'] }),
    });
    render(<NavalBattlePage session={session} sceneFactory={null} onResolved={onResolved} />);

    act(() => session.deliverFrame(1 / 60));

    const dialog = screen.getByRole('dialog', { name: /battle state drift detected/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('player.position.x:not-finite');
    expect(screen.getByTestId('naval-restart-input')).toBeEnabled();
    expect(screen.getByTestId('naval-restart-input')).toHaveFocus();
    expect(screen.getByTestId('naval-battle-underlay')).toHaveAttribute('inert');
    expect(session.paused).toBe(true);
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('renders a functional labelled HTML chart when no 3D scene is available', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const chart = screen.getByTestId('naval-html-chart');
    expect(chart).toHaveTextContent(
      '3D sea unavailable—battle rules continue',
    );
    expect(within(chart).getByText('Mistral')).toBeVisible();
    expect(within(chart).getByText('Red Jackdaw')).toBeVisible();
    expect(screen.getByTestId('naval-bearing-line')).toBeVisible();
    expect(screen.getByTestId('naval-wind-vector')).toBeVisible();
    expect(screen.getByTestId('naval-fire-port')).toBeEnabled();
    expect(screen.getByTestId('naval-restart')).toBeEnabled();
  });

  it('falls back to the HTML chart when scene construction rejects', async () => {
    const session = manualNavalSession();
    const sceneFactory = vi.fn().mockRejectedValue(new Error('no WebGL'));
    render(<NavalBattlePage session={session} sceneFactory={sceneFactory} />);

    await waitFor(() => expect(screen.getByTestId('naval-html-chart')).toBeVisible());
    expect(screen.getByTestId('naval-html-chart')).toHaveTextContent(/battle rules continue/i);
  });

  it('wires live event deltas and reused rematch ids into one disposable scene', async () => {
    const session = manualNavalSession();
    session.state.events = [{
      id: 4,
      kind: 'reload-ready',
      atTick: 0,
      shipId: 'player',
      side: 'port',
    }];
    session.setSail('full');
    const sync = vi.fn();
    const dispose = vi.fn();
    const adapter: NavalSceneAdapter = {
      sync,
      render: vi.fn(),
      metrics: () => ({
        fps: 60,
        dpr: 1,
        tier: 'low',
        drawCalls: 1,
        triangles: 2,
        textures: 0,
        geometries: 1,
        materials: 1,
        bufferAttributes: 3,
        activeEffects: 0,
        effectCapacity: 32,
        reducedMotion: false,
        shipIntermediateFrames: 1,
        cameraIntermediateFrames: 1,
        reducedMotionShipSnaps: 0,
        reducedMotionCameraSnaps: 0,
      }),
      dispose,
    };
    const sceneFactory: NavalSceneFactory = vi.fn().mockResolvedValue(adapter);

    const { unmount } = render(<NavalBattlePage session={session} sceneFactory={sceneFactory} />);
    await screen.findByTestId('naval-scene-slot');

    expect(sync).toHaveBeenLastCalledWith(
      expect.objectContaining({ tick: 0 }),
      [],
      { battleGeneration: 0, snap: true },
    );

    act(() => {
      session.state.events.push({
        id: 5,
        kind: 'reload-ready',
        atTick: 1,
        shipId: 'player',
        side: 'starboard',
      });
      session.setSail('full');
    });
    expect(sync).toHaveBeenLastCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: 5 })],
      { battleGeneration: 0, snap: false },
    );

    act(() => session.restart());
    act(() => {
      session.state.events.push({
        id: 1,
        kind: 'reload-ready',
        atTick: 1,
        shipId: 'player',
        side: 'port',
      });
      session.setSail('full');
    });
    expect(sync).toHaveBeenLastCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: 1 })],
      { battleGeneration: 1, snap: false },
    );
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('shows only the approved battle systems in the HUD', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const hud = screen.getByTestId('naval-battle-hud');
    expect(hud).toHaveTextContent(/Hull/);
    expect(hud).toHaveTextContent(/Sails/);
    expect(hud).toHaveTextContent(/Crew/);
    expect(hud).toHaveTextContent(/Cannon/);
    expect(hud).not.toHaveTextContent(/reload|ready/i);
    expect(hud).toHaveTextContent(/Round/);
    expect(hud).toHaveTextContent(/Full sail/);
    expect(hud).toHaveTextContent(/Trade wind/);
    expect(hud).toHaveTextContent(/Capture Red Jackdaw/);
    expect(within(hud).getByLabelText('Trade wind 60° / fresh')).toHaveTextContent('60° / fresh');
  });

  it('updates the live aim directive off and onto the current physical side while paused without recreating the scene', async () => {
    const session = manualNavalSession();
    const syncSensorySettings = vi.fn();
    const adapter: NavalSceneAdapter = {
      sync: vi.fn(), syncSensorySettings, render: vi.fn(), dispose: vi.fn(),
      metrics: () => ({ fps: 60, dpr: 1, tier: 'low', drawCalls: 1, triangles: 1, textures: 0, geometries: 1, materials: 1, bufferAttributes: 3, activeEffects: 0, effectCapacity: 8, reducedMotion: false, shipIntermediateFrames: 1, cameraIntermediateFrames: 1, reducedMotionShipSnaps: 0, reducedMotionCameraSnaps: 0 }),
    };
    const factory: NavalSceneFactory = vi.fn().mockResolvedValue(adapter);
    render(<NavalBattlePage session={session} sceneFactory={factory} />);
    await screen.findByTestId('naval-scene-slot');
    expect(screen.getByTestId('naval-aim-cue')).toBeVisible();
    fireEvent.click(screen.getByTestId('naval-pause'));
    fireEvent.click(screen.getByTestId('naval-setting-aim'));
    expect(syncSensorySettings).toHaveBeenLastCalledWith(expect.objectContaining({ aimCue: null }));
    act(() => {
      session.state.ships.player.position = { x: 0, z: 0 };
      session.state.ships.player.heading = 0;
      session.state.ships.opponent.position = { x: -24, z: 0 };
      session.setSail('full');
    });
    fireEvent.click(screen.getByTestId('naval-setting-aim'));
    fireEvent.click(screen.getByTestId('naval-setting-flashes'));
    expect(screen.getByTestId('naval-aim-cue')).toHaveTextContent(/starboard/i);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(syncSensorySettings).toHaveBeenLastCalledWith(expect.objectContaining({ aimCue: expect.objectContaining({ side: 'starboard' }), reducedFlashes: true }));
  });

  it('mutates one established reload live region in two phases for repeated same-side events and cleans pending frames', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => frames.delete(handle)));
    const session = manualNavalSession();
    const { unmount } = render(<StrictMode><NavalBattlePage session={session} sceneFactory={null} /></StrictMode>);
    const region = screen.getByTestId('naval-reload-announcement');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');

    act(() => {
      session.state.events.push({ id: 1, kind: 'reload-ready', atTick: 1, shipId: 'player', side: 'port' });
      session.setSail('full');
    });
    expect(screen.getByTestId('naval-reload-announcement')).toBe(region);
    expect(region).toHaveTextContent('');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    act(() => frames.get(1)?.(16));
    expect(region).toHaveTextContent('Port battery ready');

    act(() => session.setSail('full'));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(region).toHaveTextContent('Port battery ready');

    act(() => {
      session.state.events.push({ id: 2, kind: 'reload-ready', atTick: 2, shipId: 'player', side: 'port' });
      session.setSail('full');
    });
    const repeatedFrame = frames.get(2);
    expect(screen.getByTestId('naval-reload-announcement')).toBe(region);
    expect(region).toHaveTextContent('');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    act(() => session.restart());
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(region).toHaveTextContent('');
    expect(screen.getByTestId('naval-reload-announcement')).toBe(region);
    act(() => repeatedFrame?.(32));
    expect(region).toHaveTextContent('');

    act(() => {
      session.state.events.push({ id: 1, kind: 'reload-ready', atTick: 1, shipId: 'player', side: 'starboard' });
      session.setSail('full');
    });
    expect(region).toHaveTextContent('');
    act(() => frames.get(3)?.(48));
    expect(region).toHaveTextContent('Starboard battery ready');

    act(() => {
      session.state.events.push({ id: 2, kind: 'reload-ready', atTick: 2, shipId: 'opponent', side: 'port' });
      session.setSail('full');
    });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
    expect(region).toHaveTextContent('Starboard battery ready');
    expect(screen.getByTestId('naval-aim-cue')).not.toHaveAttribute('aria-live');

    act(() => {
      session.state.events.push({ id: 3, kind: 'reload-ready', atTick: 3, shipId: 'player', side: 'port' });
      session.setSail('full');
    });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(4);
    vi.unstubAllGlobals();
  });

  it('reschedules an initial reload announcement after the StrictMode effect rehearsal', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => frames.delete(handle)));
    const session = manualNavalSession();
    session.state.events.push({ id: 1, kind: 'reload-ready', atTick: 1, shipId: 'player', side: 'port' });
    session.setSail('full');

    const { unmount } = render(<StrictMode><NavalBattlePage session={session} sceneFactory={null} /></StrictMode>);
    const region = screen.getByTestId('naval-reload-announcement');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(region).toHaveTextContent('');
    act(() => frames.get(2)?.(16));
    expect(region).toHaveTextContent('Port battery ready');

    unmount();
    vi.unstubAllGlobals();
  });

  it('plays one newly reached visible terminal surrender cue after activation', async () => {
    const audio = pageAudioFactory();
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} audioFactory={audio.factory} />);
    fireEvent.click(screen.getByTestId('naval-shot-cycle'));
    await waitFor(() => expect(audio.contexts).toHaveLength(1));

    act(() => {
      session.state.outcome = { kind: 'surrender', victorShipId: 'player' };
      session.state.events.push(surrenderEvent());
      session.setSail('full');
    });
    await waitFor(() => expect(audio.cues).toEqual(['surrender-bell']));
  });

  it.each(['paused', 'muted'] as const)('does not schedule or report surrender while %s', async (suppression) => {
    const audio = pageAudioFactory();
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} audioFactory={audio.factory} />);
    fireEvent.click(screen.getByTestId('naval-shot-cycle'));
    await waitFor(() => expect(audio.contexts).toHaveLength(1));
    if (suppression === 'paused') fireEvent.click(screen.getByTestId('naval-pause'));
    else fireEvent.click(screen.getByTestId('naval-setting-mute'));

    act(() => {
      session.state.outcome = { kind: 'surrender', victorShipId: 'player' };
      session.state.events.push(surrenderEvent());
      session.setSail('full');
    });
    expect(audio.cues).toEqual([]);
  });

  it('does not schedule or report surrender while the page is hidden', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const audio = pageAudioFactory();
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} audioFactory={audio.factory} />);
    fireEvent.click(screen.getByTestId('naval-shot-cycle'));
    await waitFor(() => expect(audio.contexts).toHaveLength(1));
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    act(() => {
      session.state.outcome = { kind: 'surrender', victorShipId: 'player' };
      session.state.events.push(surrenderEvent());
      session.setSail('full');
    });
    expect(audio.cues).toEqual([]);
    visibilitySpy.mockRestore();
  });

  it('keeps genuine already-terminal preactivation history silent', async () => {
    const audio = pageAudioFactory();
    const session = manualNavalSession({ outcome: { kind: 'surrender', victorShipId: 'player' } });
    session.state.events.push(surrenderEvent());
    render(<NavalBattlePage session={session} sceneFactory={null} audioFactory={audio.factory} />);

    fireEvent.click(screen.getByTestId('naval-result-restart'));
    await waitFor(() => expect(audio.contexts).toHaveLength(1));
    expect(audio.cues).toEqual([]);
  });

  it.each([
    [{ kind: 'boarding-ready', victorShipId: 'player' } as NavalOutcome, /Red Jackdaw sails 25%, crew 14, range 5\.5/i, 'Rematch Battle Lab'],
    [{ kind: 'boarding-ready', victorShipId: 'opponent' } as NavalOutcome, /Mistral.*crew.*boarding/i, 'Restart Battle Lab'],
    [{ kind: 'surrender', victorShipId: 'player' } as NavalOutcome, /Red Jackdaw.*surrendered.*hull 20%.*crew 8/i, 'Rematch Battle Lab'],
    [{ kind: 'surrender', victorShipId: 'opponent' } as NavalOutcome, /Mistral.*crew surrendered.*hull 20%.*crew 8/i, 'Restart Battle Lab'],
    [{ kind: 'sunk', victorShipId: 'player' } as NavalOutcome, /Red Jackdaw reached hull 0/i, 'Rematch Battle Lab'],
    [{ kind: 'sunk', victorShipId: 'opponent' } as NavalOutcome, /Mistral reached hull 0/i, 'Restart Battle Lab'],
    [{ kind: 'escaped', shipId: 'player' } as NavalOutcome, /Mistral crossed the 92-unit boundary at radial range 93\.0 while moving outward/i, 'Restart Battle Lab'],
    [{ kind: 'escaped', shipId: 'opponent' } as NavalOutcome, /Red Jackdaw crossed the 92-unit boundary at radial range 93\.0 while moving outward/i, 'Restart Battle Lab'],
    [{ kind: 'separated', shipId: 'player' } as NavalOutcome, /tick 7200 reached the 7200-tick limit/i, 'Restart Battle Lab'],
    [{ kind: 'separated', shipId: 'opponent' } as NavalOutcome, /tick 7200 reached the 7200-tick limit/i, 'Restart Battle Lab'],
  ])('explains every outcome identity with decisive values and the correct next action', (outcome, detail, action) => {
    const session = manualNavalSession({ outcome });
    session.state.tick = 7_200;
    session.state.input.timeLimitTicks = 7_200;
    session.state.input.arenaRadius = 92;
    session.state.ships.player.position = { x: 93, z: 0 };
    session.state.ships.player.heading = Math.PI / 2;
    session.state.ships.player.speed = 1;
    session.state.ships.player.hull = outcome.kind === 'sunk' && outcome.victorShipId === 'opponent' ? 0 : 20;
    session.state.ships.player.crew = 8;
    session.state.ships.opponent.position = outcome.kind === 'boarding-ready' ? { x: 98.5, z: 0 } : { x: 93, z: 0 };
    session.state.ships.opponent.heading = Math.PI / 2;
    session.state.ships.opponent.speed = 1;
    session.state.ships.opponent.hull = outcome.kind === 'sunk' && outcome.victorShipId === 'player' ? 0 : 20;
    session.state.ships.opponent.sails = 25;
    session.state.ships.opponent.crew = outcome.kind === 'surrender' && outcome.victorShipId === 'player' ? 8 : 14;
    session.setSail('full');

    render(<NavalBattlePage session={session} sceneFactory={null} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(detail);
    expect(within(dialog).getByTestId('naval-result-restart')).toHaveTextContent(action);
    if (outcome.kind === 'surrender' && outcome.victorShipId === 'opponent') {
      expect(dialog).not.toHaveTextContent(/escaped|prize/i);
    }
  });
});
