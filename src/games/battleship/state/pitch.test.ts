import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePitch } from './pitch';

const open = (hash: string) => {
  window.location.hash = hash;
};

describe('the effects pitch', () => {
  beforeEach(() => {
    sessionStorage.clear();
    open('');
  });

  it('plays the picked effects with no parameter, and shows no switcher', () => {
    const { result } = renderHook(() => usePitch());
    expect(result.current.fx).toEqual({ fire: 'b', boom: 'b', water: 'a', guns: true });
    expect(result.current.reviewing).toBe(false);
    expect(result.current.showBar).toBe(false);
    expect(result.current.look).toBe('c');
  });

  it('keeps today, A and B reachable by address', () => {
    open('#/play?fx=today');
    expect(renderHook(() => usePitch()).result.current.fx).toEqual({ fire: 'today', boom: 'today', water: 'today', guns: false });
    open('#/play?fx=a');
    expect(renderHook(() => usePitch()).result.current.fx).toEqual({ fire: 'a', boom: 'a', water: 'a', guns: true });
    open('#/play?fx=b');
    expect(renderHook(() => usePitch()).result.current.fx).toEqual({ fire: 'b', boom: 'b', water: 'b', guns: true });
  });

  it('lets one effect be overridden on the picked set', () => {
    open('#/play?fire=a');
    const { fx, showBar } = renderHook(() => usePitch()).result.current;
    expect(fx).toEqual({ fire: 'a', boom: 'b', water: 'a', guns: true });
    expect(showBar).toBe(true);
  });

  it('returns to the picked set from the switcher', () => {
    open('#/play?fx=today');
    const { result } = renderHook(() => usePitch());
    act(() => result.current.choose({ fx: 'default' }));
    expect(result.current.fx).toEqual({ fire: 'b', boom: 'b', water: 'a', guns: true });
    expect(result.current.fxPack).toBe('default');
  });
});
