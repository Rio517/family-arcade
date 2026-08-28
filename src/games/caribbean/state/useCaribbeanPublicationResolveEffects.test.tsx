import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { controller, invoke, strategicJournals } from './useCaribbeanActionsTestSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean resolveBattle publication effects', () => {
  it.each(['governor', 'tavern', 'market', 'shipyard', 'shares', 'log'] as const)(
    'preserves the open %s activity and publishes one-shot Log focus',
    async (activity) => {
      const hook = await controller(strategicJournals().engaged, 'memory-only');
      act(() => hook.result.current.selectActivity(activity));

      await act(() => invoke(hook.result.current, 'resolveBattle'));

      expect(hook.result.current.journal?.events.at(-1)).toMatchObject({ type: 'naval-resolved' });
      expect(hook.result.current.activity).toBe(activity);
      expect(hook.result.current.portFocusTarget).toBe('last-voyage');
      act(() => hook.result.current.acknowledgePortFocus());
      expect(hook.result.current.portFocusTarget).toBeNull();
    },
  );
});
