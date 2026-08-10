import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRisk } from './useRisk';
import { MAPS } from '../maps/registry';
import { hasUnclaimed } from '../domain/rules';

const start = (result: { current: ReturnType<typeof useRisk> }, players = 2) =>
  act(() =>
    result.current.start({
      mapId: MAPS[0].id,
      players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, color: '#f00' })),
      diceMode: 'random',
    }),
  );

describe('useRisk', () => {
  beforeEach(() => localStorage.clear());

  it('starts a campaign in the claim stage with the map built', () => {
    const { result } = renderHook(() => useRisk());
    expect(result.current.state).toBeNull();

    start(result);

    expect(result.current.map).not.toBeNull();
    expect(result.current.state?.phase).toBe('setup');
    expect(hasUnclaimed(result.current.state!)).toBe(true);
  });

  it('pick() claims a free territory for the current general', () => {
    const { result } = renderHook(() => useRisk());
    start(result);
    const free = result.current.map!.topology.territoryIds[0];

    act(() => result.current.pick(free));

    expect(result.current.state!.territories[free].owner).toBe(0);
    expect(result.current.state!.current).toBe(1);
  });

  it('autosaves the campaign and resumes it', () => {
    const { result } = renderHook(() => useRisk());
    start(result);
    const free = result.current.map!.topology.territoryIds[0];
    act(() => result.current.pick(free));
    const saved = JSON.parse(localStorage.getItem('risk-campaign-v1')!);
    expect(saved.state.territories[free].owner).toBe(0);

    const fresh = renderHook(() => useRisk());
    act(() => {
      fresh.result.current.resume(saved);
    });
    expect(fresh.result.current.state?.territories[free].owner).toBe(0);
  });

  it('newCampaign() returns to the setup screen state', () => {
    const { result } = renderHook(() => useRisk());
    start(result);
    act(() => result.current.newCampaign());
    expect(result.current.state).toBeNull();
    expect(result.current.map).toBeNull();
  });

  describe('computer seats', () => {
    afterEach(() => vi.useRealTimers());

    it('a computer general takes its own turn after a thinking pause', async () => {
      const { result } = renderHook(() => useRisk());
      act(() =>
        result.current.start({
          mapId: MAPS[0].id,
          players: [
            { name: 'Human', color: '#f00' },
            { name: 'Field Marshal Vex', color: '#00f', bot: 'vex' },
          ],
          diceMode: 'random',
        }),
      );

      // The human claims first; then it is the computer's turn.
      const free = result.current.map!.topology.territoryIds[0];
      act(() => result.current.pick(free));
      expect(result.current.state!.current).toBe(1);

      // Real (short) timers: the bot thinks, lazily imports its brain, moves.
      await waitFor(
        () => {
          expect(result.current.state!.current).toBe(0);
        },
        { timeout: 3000 },
      );
      // It claimed exactly one land for itself.
      const botLands = Object.values(result.current.state!.territories).filter((t) => t.owner === 1);
      expect(botLands).toHaveLength(1);
    });

    it('human seats never trigger the bot loop', async () => {
      const { result } = renderHook(() => useRisk());
      start(result); // two humans
      const before = result.current.state!;
      await new Promise((r) => setTimeout(r, 1100));
      expect(result.current.state).toBe(before); // untouched — nobody moved
    });
  });
});
