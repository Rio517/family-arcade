/**
 * The party's tiny presence protocol. The party is an app-level link that two
 * devices keep open across games (see PartyContext); it exchanges names so
 * each side can show "you're with Kai", and — since the party became the
 * table — a four-character handoff: the host says which game it opened and
 * under which code, the guest may knock on a game it wants. That is all.
 * Game rules still flow on each game's own connection (ADR 0003/0008); nothing
 * here replays or rewrites history.
 */

import { normalizeCode } from '@shared/net/peer';

export interface PartyHello {
  t: 'hello';
  name: string;
}

/** The host opened a game's table: join it with this code. */
export interface PartyTable {
  t: 'table';
  /** A registry game id — a string on the wire; the app resolves it. */
  game: string;
  /** The game link's code (fresh per table, so a rematch never collides). */
  code: string;
  /** Chess: which side the host plays; the guest takes the other. */
  hostSide?: string;
}

/** The guest is at a game's door and would like the host to open it. */
export interface PartyKnock {
  t: 'knock';
  game: string;
}

export interface PartyTableClosed {
  t: 'table-closed';
}

/**
 * What this device is wearing on its video (ADR 0010): effect ids, as
 * strings on the wire — the receiver keeps the ones it knows and draws them
 * on the friend's video itself. The stream is never touched.
 */
export interface PartyEffects {
  t: 'effects';
  effects: string[];
}

export type PartyMsg = PartyHello | PartyTable | PartyKnock | PartyTableClosed | PartyEffects;

// Names are truncated to a short display length downstream. Reject anything far
// longer than any real name here so a peer with the code can't push a giant
// string over the wire — defense-in-depth on an already trusted, code-gated
// channel, well above any legitimate name.
const MAX_NAME_LEN = 100;
const MAX_GAME_LEN = 32;
const MAX_SIDE_LEN = 8;
// A handful of effects at most; the catalogue has two. Ids are short slugs.
const MAX_EFFECTS = 8;
const MAX_EFFECT_LEN = 32;

function boundedString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

/** A code that is exactly what a broker id would carry: four look-alike-free
 * characters, already upper-case. */
function isCode(v: unknown): v is string {
  return typeof v === 'string' && v.length === 4 && normalizeCode(v) === v;
}

export function isPartyMsg(value: unknown): value is PartyMsg {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return typeof m.name === 'string' && m.name.length <= MAX_NAME_LEN;
    case 'table':
      return (
        boundedString(m.game, MAX_GAME_LEN) &&
        isCode(m.code) &&
        (m.hostSide === undefined || boundedString(m.hostSide, MAX_SIDE_LEN))
      );
    case 'knock':
      return boundedString(m.game, MAX_GAME_LEN);
    case 'table-closed':
      return true;
    case 'effects':
      return (
        Array.isArray(m.effects) &&
        m.effects.length <= MAX_EFFECTS &&
        m.effects.every((e) => boundedString(e, MAX_EFFECT_LEN))
      );
    default:
      return false;
  }
}
