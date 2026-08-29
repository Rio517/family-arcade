/**
 * Persistence for the remembered party — `arcade.party.v1`. One fresh party
 * at most; a stale one is cleared on read so it never lingers.
 */

import { safeGet, safeRemove, safeSet } from '@shared/storage/kv';
import { isFresh, normalizeParty, type StoredParty } from './party';

export const PARTY_KEY = 'arcade.party.v1';

/** The remembered party if it is younger than the TTL, else null (and gone). */
export function loadParty(now: number): StoredParty | null {
  const raw = safeGet(PARTY_KEY);
  if (!raw) return null;
  let party: StoredParty | null = null;
  try {
    party = normalizeParty(JSON.parse(raw));
  } catch {
    party = null;
  }
  if (!party || !isFresh(party, now)) {
    safeRemove(PARTY_KEY);
    return null;
  }
  return party;
}

export function saveParty(party: StoredParty): void {
  safeSet(PARTY_KEY, JSON.stringify(party));
}

export function clearParty(): void {
  safeRemove(PARTY_KEY);
}
