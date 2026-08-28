import { canonicalJson } from '../canonicalJson';
import type { CampaignJournal } from '../domain/events';

export const JOURNAL_EVENT_LIMIT = 256;
export const JOURNAL_UTF8_LIMIT = 512 * 1024;

export function journalUtf8Bytes(journal: CampaignJournal): number {
  return new TextEncoder().encode(canonicalJson(journal)).byteLength;
}

export function crossesCompactionThreshold(eventCount: number, utf8Bytes: number): boolean {
  return eventCount > JOURNAL_EVENT_LIMIT || utf8Bytes > JOURNAL_UTF8_LIMIT;
}

export function shouldCompactJournal(journal: CampaignJournal): boolean {
  return crossesCompactionThreshold(journal.events.length, journalUtf8Bytes(journal));
}
