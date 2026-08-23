import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { manualNavalSession } from '../../state/naval/testSession';
import type { NavalOutcome } from '../../domain/naval/types';
import { NavalBattlePage } from './NavalBattlePage';

const BOARDING_READY: NavalOutcome = { kind: 'boarding-ready', victorShipId: 'player' };

describe('accessible naval command deck', () => {
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

  it('maps sail, ammunition, pause, and restart actions through stable test ids', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    fireEvent.click(screen.getByTestId('naval-sail-reefed'));
    fireEvent.click(screen.getByTestId('naval-ammo-chain'));
    fireEvent.click(screen.getByTestId('naval-pause'));

    expect(session.currentCommand).toMatchObject({ sail: 'reefed', ammunition: 'chain' });
    expect(session.paused).toBe(true);
    expect(screen.getByTestId('naval-pause')).toHaveTextContent('Resume');

    fireEvent.click(screen.getByTestId('naval-restart'));
    expect(session.restartCount).toBe(1);
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

  it('shows only the approved battle systems in the HUD', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);

    const hud = screen.getByTestId('naval-battle-hud');
    expect(hud).toHaveTextContent(/Hull/);
    expect(hud).toHaveTextContent(/Sails/);
    expect(hud).toHaveTextContent(/Crew/);
    expect(hud).toHaveTextContent(/Cannon/);
    expect(hud).toHaveTextContent(/Port reload/);
    expect(hud).toHaveTextContent(/Starboard reload/);
    expect(hud).toHaveTextContent(/Round/);
    expect(hud).toHaveTextContent(/Full sail/);
    expect(hud).toHaveTextContent(/Trade wind/);
    expect(hud).toHaveTextContent(/Capture Red Jackdaw/);
    expect(within(hud).getByLabelText('Trade wind 60° / fresh')).toHaveTextContent('60° / fresh');
  });
});
