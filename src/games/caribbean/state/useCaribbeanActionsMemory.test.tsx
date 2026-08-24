import { cleanup } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';

import { ACTIONS, assertGuardedAction } from './useCaribbeanActionsTestSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean memory-only actions', () => {
  it.each(ACTIONS)(
    'guards $name synchronously',
    async (actionCase) => assertGuardedAction('memory-only', actionCase),
  );
});
