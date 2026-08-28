import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  currentSaveWrites,
  memoryStorage,
  persist,
  runtime,
  strategicJournals,
} from './useCaribbeanActionsTestSupport';
import { useCaribbean } from './useCaribbean';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean saved naval resume', () => {
  it('publishes no event and performs no save', async () => {
    const storage = memoryStorage();
    persist(storage, strategicJournals().engaged);
    storage.setItem.mockClear();
    const injected = runtime(storage);
    const hook = renderHook(() => useCaribbean(injected));

    await act(() => hook.result.current.resume());

    expect(hook.result.current.journal?.state.mode).toMatchObject({
      kind: 'naval', battleId: 'voyage-2-battle', voyageId: 'voyage-2',
    });
    expect(hook.result.current.portFocusTarget).toBeNull();
    expect(currentSaveWrites(storage)).toBe(0);
  });
});
