import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
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
});
