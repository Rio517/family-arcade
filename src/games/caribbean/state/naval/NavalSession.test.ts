import { describe, expect, it, vi } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from '../../domain/naval/createBattle';
import { NAVAL_RELOAD_REQUIRED_WORK } from '../../domain/naval/balance';
import { NavalSession } from './NavalSession';

describe('transient naval session', () => {
  it('increments its transient battle generation on deterministic restart', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);

    expect(session.getSnapshot().battleGeneration).toBe(0);
    session.restart();
    expect(session.getSnapshot().battleGeneration).toBe(1);
  });

  it('advances only canonical ticks and clears one-shot fire after the first tick', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);
    const initial = session.state;

    session.requestFire('port');
    session.deliverFrameMicros(33_333);

    expect(session.state.tick).toBe(1);
    expect(session.state).not.toBe(initial);
    expect(session.currentCommand.fire).toBeNull();
  });

  it('keeps steering, sail, and ammunition while consuming fire once', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);
    session.setRudder(-1);
    session.setSail('reefed');
    session.setAmmunition('chain');
    session.requestFire('port');

    session.deliverFrameMicros(50_000);

    expect(session.state.tick).toBe(3);
    expect(session.currentCommand).toEqual({
      rudder: -1,
      sail: 'reefed',
      ammunition: 'chain',
      fire: null,
    });
  });

  it('pause freezes ticks and backlog while restart recreates the serialized input', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);
    session.togglePause();
    session.deliverFrameMicros(500_000);
    expect(session.state.tick).toBe(0);

    session.togglePause();
    session.deliverFrameMicros(16_667);
    expect(session.state.tick).toBe(1);

    session.restart();
    expect(session.state).toEqual(createNavalBattle(BATTLE_LAB_INPUT));
    expect(session.paused).toBe(false);
    expect(session.diagnostic).toBeNull();
  });

  it('sets pause explicitly, clears queued frame work, and treats repeated requests as idempotent', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);
    const listener = vi.fn();
    session.subscribe(listener);

    session.deliverFrameMicros(500_000);
    expect(session.state.tick).toBe(6);

    session.setPaused(true);
    session.setPaused(true);
    expect(session.paused).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    session.deliverFrameMicros(500_000);
    expect(session.state.tick).toBe(6);
    session.setPaused(false);
    session.deliverFrameMicros(0);
    expect(session.state.tick).toBe(6);
    session.deliverFrameMicros(16_667);
    expect(session.state.tick).toBe(7);
  });

  it('keeps named pause owners independent from ordinary pause controls', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);

    session.setPauseHold('visibility', true);
    session.setPauseHold('campaign-withdrawal', true);
    expect(session.paused).toBe(true);

    session.togglePause();
    session.setPaused(false);
    session.setPauseHold('visibility', false);
    expect(session.paused).toBe(true);
    session.deliverFrameMicros(1_000_000);
    expect(session.state.tick).toBe(0);

    session.setPauseHold('campaign-withdrawal', false);
    expect(session.paused).toBe(false);
  });

  it('recovers one named owner and the user latch without releasing another owner', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);

    session.setPaused(true);
    session.setPauseHold('campaign-withdrawal', true);
    session.setPauseHold('visibility', true);
    session.resumeFromPauseHold('campaign-withdrawal');
    expect(session.paused).toBe(true);

    session.setPauseHold('visibility', false);
    expect(session.paused).toBe(false);
  });

  it('primes a fresh RAF after the final pause owner releases instead of consuming paused wall time', () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const session = new NavalSession(BATTLE_LAB_INPUT, { requestFrame });
    session.start();
    callbacks.shift()?.(1_000);

    session.setPauseHold('visibility', true);
    session.setPauseHold('visibility', false);
    callbacks.shift()?.(61_000);
    expect(session.state.tick).toBe(0);

    callbacks.shift()?.(61_016.667);
    expect(session.state.tick).toBe(1);
  });

  it('does not explicitly resume a diagnostic or terminal session', () => {
    const diagnostic = new NavalSession(BATTLE_LAB_INPUT, {
      validator: () => ({ ok: false, issues: ['fixture:drift'] }),
    });
    diagnostic.deliverFrameMicros(16_667);
    expect(diagnostic.paused).toBe(true);
    diagnostic.setPaused(false);
    expect(diagnostic.paused).toBe(true);

    const terminal = new NavalSession(BATTLE_LAB_INPUT);
    terminal.setPaused(true);
    terminal.state.outcome = { kind: 'boarding-ready', victorShipId: 'player' };
    terminal.setPaused(false);
    expect(terminal.paused).toBe(true);
  });

  it('retains capped frame backlog until later delivery instead of skipping canonical work', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.timeLimitTicks = 10_000;
    const session = new NavalSession(input);

    session.deliverFrameMicros(500_000);
    expect(session.state.tick).toBe(6);
    session.deliverFrameMicros(0);
    expect(session.state.tick).toBe(12);
  });

  it('pauses on canonical drift, publishes diagnostics, and clears them on restart', () => {
    const validator = vi.fn().mockReturnValue({
      ok: false,
      issues: ['player.position.x:not-finite'],
    });
    const session = new NavalSession(BATTLE_LAB_INPUT, { validator });

    session.deliverFrameMicros(16_667);

    expect(session.paused).toBe(true);
    expect(session.diagnostic).toEqual({ issues: ['player.position.x:not-finite'] });
    expect(session.state.outcome).toBeNull();

    validator.mockReturnValue({ ok: true });
    session.restart();
    expect(session.diagnostic).toBeNull();
    expect(session.paused).toBe(false);
  });

  it('subscribes to immutable snapshots and returns only events after a semantic id', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.player.position = { x: 0, z: 0 };
    input.opponent.position = { x: 20, z: 0 };
    input.opponent.cannon = 0;
    const session = new NavalSession(input);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const before = session.getSnapshot();

    session.requestFire('port');
    session.deliverFrameMicros(16_667);

    const after = session.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.state).not.toBe(session.state);
    expect(session.consumeNewEvents(0).map((event) => event.kind)).toEqual(['volley', 'damage']);
    expect(session.consumeNewEvents(1).map((event) => event.id)).toEqual([2]);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    session.setSail('reefed');
    expect(listener).not.toHaveBeenCalled();
  });

  it('starts one animation loop, rounds browser time once, and disposes it', () => {
    const callbacks: FrameRequestCallback[] = [];
    let nextHandle = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      nextHandle += 1;
      return nextHandle;
    });
    const cancelFrame = vi.fn();
    const session = new NavalSession(BATTLE_LAB_INPUT, { requestFrame, cancelFrame });

    session.start();
    callbacks.shift()?.(1_000);
    callbacks.shift()?.(1_016.667);

    expect(session.state.tick).toBe(1);
    expect(requestFrame).toHaveBeenCalledTimes(3);

    session.dispose();
    expect(cancelFrame).toHaveBeenCalledWith(3);
  });

  it('preserves independent physical reload state across a fire request', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.player.position = { x: 0, z: 0 };
    input.opponent.position = { x: 20, z: 0 };
    const session = new NavalSession(input);
    session.requestFire('port');
    session.deliverFrameMicros(16_667);

    expect(session.state.ships.player.reload.port.progress).toBe(0);
    expect(session.state.ships.player.reload.starboard.progress).toBe(NAVAL_RELOAD_REQUIRED_WORK);
  });
});
