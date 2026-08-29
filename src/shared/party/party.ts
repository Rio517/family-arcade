/**
 * A remembered party — what `arcade.party.v1` holds so a reload (or a PWA
 * close-and-reopen) rejoins the same two devices without a code. Pure:
 * the store beside it persists; this file only knows the shape and how to
 * read a possibly-corrupt one safely.
 */

import { normalizeCode } from '@shared/net/peer';

export interface PartyTableInfo {
  game: string;
  code: string;
  hostSide?: string;
}

export interface StoredParty {
  code: string;
  role: 'host' | 'guest';
  /** When the party was last alive (host/join/connect/table), from arcadeNow(). */
  at: number;
  table: PartyTableInfo | null;
}

/** A party older than this is not worth rejoining on its own. */
export const PARTY_TTL_MS = 12 * 3600e3;

const MAX_GAME_LEN = 32;
const MAX_SIDE_LEN = 8;

function isCode(v: unknown): v is string {
  return typeof v === 'string' && v.length === 4 && normalizeCode(v) === v;
}

export function normalizeTable(raw: unknown): PartyTableInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.game !== 'string' || !r.game || r.game.length > MAX_GAME_LEN) return null;
  if (!isCode(r.code)) return null;
  const hostSide = typeof r.hostSide === 'string' && r.hostSide && r.hostSide.length <= MAX_SIDE_LEN ? r.hostSide : undefined;
  return hostSide ? { game: r.game, code: r.code, hostSide } : { game: r.game, code: r.code };
}

export function normalizeParty(raw: unknown): StoredParty | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isCode(r.code)) return null;
  if (r.role !== 'host' && r.role !== 'guest') return null;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null;
  return { code: r.code, role: r.role, at: r.at, table: normalizeTable(r.table) };
}

export function isFresh(party: StoredParty, now: number): boolean {
  return now - party.at >= 0 && now - party.at <= PARTY_TTL_MS;
}
