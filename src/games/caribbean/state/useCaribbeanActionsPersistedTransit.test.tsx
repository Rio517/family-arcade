import { cleanup } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';

import { ACTIONS, assertGuardedAction } from './useCaribbeanActionsTestSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean persisted transit actions', () => {
  it.each(ACTIONS.slice(0, 3))(
    'guards $name synchronously',
    async (actionCase) => assertGuardedAction('persisted', actionCase),
  );
});
