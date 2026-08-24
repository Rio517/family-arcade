import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  controller,
  currentSaveWrites,
  failedWriter,
  invoke,
  strategicJournals,
} from './useCaribbeanActionsTestSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean resolveBattle persistence failure', () => {
  it('holds the terminal event without publishing when storage fails', async () => {
    const hook = await controller(strategicJournals().engaged, 'persisted');
    hook.injected.writer = failedWriter('operation-threw', new Error('write-current failed'));

    const outcome = await act(() => invoke(hook.result.current, 'resolveBattle'));

    expect(outcome).toEqual({ kind: 'not-applied' });
    expect(hook.result.current.journal?.events.at(-1)).toMatchObject({ id: 4, type: 'naval-engaged' });
    expect(hook.result.current.journal?.state.mode.kind).toBe('naval');
    expect(hook.result.current.portFocusTarget).toBeNull();
    expect(hook.result.current.persistence.kind).toBe('consent-required');
    expect(currentSaveWrites(hook.storage)).toBe(0);
  });
});
