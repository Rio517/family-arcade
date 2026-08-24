import { describe, expect, it } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { createJournal } from '../domain/replay';
import {
  JOURNAL_EVENT_LIMIT,
  JOURNAL_UTF8_LIMIT,
  crossesCompactionThreshold,
  journalUtf8Bytes,
  shouldCompactJournal,
} from './compactionPolicy';

describe('journal compaction policy', () => {
  it('uses strict event and UTF-8 byte boundaries', () => {
    expect(JOURNAL_EVENT_LIMIT).toBe(256);
    expect(JOURNAL_UTF8_LIMIT).toBe(512 * 1024);
    expect(crossesCompactionThreshold(256, 512 * 1024)).toBe(false);
    expect(crossesCompactionThreshold(257, 1)).toBe(true);
    expect(crossesCompactionThreshold(1, 512 * 1024 + 1)).toBe(true);
  });

  it('measures canonical JSON as UTF-8 and uses it for journal decisions', () => {
    const journal = createJournal(createCampaign({ seed: 1702 }));

    expect(journalUtf8Bytes(journal)).toBeGreaterThan(0);
    expect(shouldCompactJournal(journal)).toBe(false);
  });
});
