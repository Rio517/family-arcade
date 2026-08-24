import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { createJournal } from '../domain/replay';
import { CURRENT_SAVE_KEY } from '../storage/persistence';
import {
  ACTIONS,
  controller,
  invoke,
  strategicJournals,
} from './useCaribbeanActionsTestSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean wrong named-action predecessors', () => {
  it.each(ACTIONS)(
    'normalizes $name without an event or save',
    async ({ name }) => {
      const predecessor = name === 'setSail'
        ? createJournal(createCampaign({ seed: 1702 }))
        : strategicJournals().active;
      const hook = await controller(predecessor, 'persisted');

      const settled = await Promise.allSettled([invoke(hook.result.current, name)]);

      expect(settled).toEqual([{ status: 'fulfilled', value: { kind: 'not-applied' } }]);
      expect(hook.result.current.journal?.events).toHaveLength(predecessor.events.length);
      expect(hook.storage.setItem.mock.calls.filter(([key]) => key === CURRENT_SAVE_KEY)).toHaveLength(0);
    },
  );
});
