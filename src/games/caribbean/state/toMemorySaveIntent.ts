import type { CampaignEvent, CampaignJournal } from '../domain/events';
import type { ActiveSaveRevision } from '../storage/persistence';

type PendingMemorySaveSource = {
  candidate: CampaignJournal;
  predecessor: CampaignJournal | null;
  expectedRevision: ActiveSaveRevision;
} & (
  | {
      kind: 'event';
      predecessor: CampaignJournal;
      appendedEvent: CampaignEvent;
    }
  | {
      kind: 'memory-save';
      publicationPredecessor: CampaignJournal | null;
      appendedEvent: CampaignEvent | null;
    }
  | { kind: 'start' | 'resume' }
);

export interface MemorySaveIntent {
  kind: 'memory-save';
  candidate: CampaignJournal;
  predecessor: CampaignJournal | null;
  publicationPredecessor: CampaignJournal | null;
  appendedEvent: CampaignEvent | null;
  expectedRevision: ActiveSaveRevision;
}

export function toMemorySaveIntent(pending: PendingMemorySaveSource): MemorySaveIntent {
  const publication = pending.kind === 'event'
    ? {
        publicationPredecessor: pending.predecessor,
        appendedEvent: pending.appendedEvent,
      }
    : pending.kind === 'memory-save'
      ? {
          publicationPredecessor: pending.publicationPredecessor,
          appendedEvent: pending.appendedEvent,
        }
      : { publicationPredecessor: null, appendedEvent: null };
  return {
    kind: 'memory-save',
    candidate: pending.candidate,
    predecessor: pending.predecessor,
    ...publication,
    expectedRevision: pending.expectedRevision,
  };
}
