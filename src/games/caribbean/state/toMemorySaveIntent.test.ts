import { describe, expect, it } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { appendJournal, createJournal } from '../domain/replay';

describe('toMemorySaveIntent', () => {
  it.each(['event', 'memory-save'] as const)(
    'retains the original event publication metadata for a %s pending intent',
    async (kind) => {
      // Kills rebuilding a reopened memory-save with null publication metadata.
      const modulePath = './toMemorySave' + 'Intent';
      const { toMemorySaveIntent } = await import(/* @vite-ignore */ modulePath);
      const predecessor = createJournal(createCampaign({ seed: 1702 }));
      const candidate = appendJournal(predecessor, {
        type: 'lead-accepted',
        payload: { leadId: 'red-jackdaw' },
      });
      const appendedEvent = candidate.events[0];
      const pending = kind === 'event'
        ? {
            kind,
            candidate,
            predecessor,
            appendedEvent,
            expectedRevision: { currentRaw: 'current', previousRaw: null },
          }
        : {
            kind,
            candidate,
            predecessor,
            publicationPredecessor: predecessor,
            appendedEvent,
            expectedRevision: { currentRaw: 'current', previousRaw: null },
          };

      const converted = toMemorySaveIntent(pending);

      expect(converted).toMatchObject({
        kind: 'memory-save',
        candidate,
        predecessor,
        publicationPredecessor: predecessor,
        appendedEvent,
        expectedRevision: { currentRaw: 'current', previousRaw: null },
      });
      expect(converted.publicationPredecessor).toBe(predecessor);
      expect(converted.appendedEvent).toBe(appendedEvent);
    },
  );
});
