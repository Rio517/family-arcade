import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  controller,
  strategicJournals,
} from './useCaribbeanActionsTestSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean publication effects', () => {
  it.each(['governor', 'tavern', 'market'] as const)(
    'clears the open %s activity only when departure publishes',
    async (activity) => {
      const hook = await controller(strategicJournals().active, 'persisted');
      act(() => hook.result.current.selectActivity(activity));

      await act(() => hook.result.current.setSail());

      expect(hook.result.current.activity).toBe('menu');
      expect(hook.result.current.portFocusTarget).toBeNull();
    },
  );

});
