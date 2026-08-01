/**
 * The party's tiny presence protocol. The party is an app-level link that two
 * devices keep open across games (see PartyContext); for now it just exchanges
 * names so each side can show "you're with Kai". It's intentionally minimal and
 * separate from any game's protocol — game data still flows on each game's own
 * connection.
 */

export interface PartyHello {
  t: 'hello';
  name: string;
}

export type PartyMsg = PartyHello;

export function isPartyMsg(value: unknown): value is PartyMsg {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return m.t === 'hello' && typeof m.name === 'string';
}
