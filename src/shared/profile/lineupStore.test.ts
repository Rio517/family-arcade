import { beforeEach, describe, expect, it } from 'vitest';
import { LINEUP_KEY, getLineupsSnapshot, resetLineupStore, setLineup, subscribeLineups } from './lineupStore';

beforeEach(() => {
  localStorage.clear();
  resetLineupStore();
});

describe('lineupStore', () => {
  it('starts empty and remembers a lineup per game across a reload', () => {
    expect(getLineupsSnapshot()).toEqual({});
    setLineup('risk', [{ userId: 'u1' }, { bot: 'cadet' }, null]);
    setLineup('chess', [{ userId: 'u2' }, { userId: 'u1' }]);
    resetLineupStore(); // re-read from storage
    expect(getLineupsSnapshot()).toEqual({
      risk: [{ userId: 'u1' }, { bot: 'cadet' }, null],
      chess: [{ userId: 'u2' }, { userId: 'u1' }],
    });
    expect(localStorage.getItem(LINEUP_KEY)).toContain('cadet');
  });

  it('degrades corrupt storage to nothing remembered', () => {
    localStorage.setItem(LINEUP_KEY, '{not json');
    resetLineupStore();
    expect(getLineupsSnapshot()).toEqual({});
    localStorage.setItem(LINEUP_KEY, JSON.stringify({ risk: 'x', chess: [{ userId: 'u1' }, 7] }));
    resetLineupStore();
    expect(getLineupsSnapshot()).toEqual({ risk: [], chess: [{ userId: 'u1' }, null] });
  });

  it('notifies subscribers on a change and stops after unsubscribe', () => {
    let hits = 0;
    const unsub = subscribeLineups(() => hits++);
    setLineup('unicorn', [{ userId: 'u1' }]);
    expect(hits).toBe(1);
    unsub();
    setLineup('unicorn', [{ userId: 'u2' }]);
    expect(hits).toBe(1);
  });
});
