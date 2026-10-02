/**
 * Playing Gulp Universe with friends, each on their own device: the screens'
 * side of the table (net/table.ts), and the arcade's Play together party.
 *
 * PLAY WITH FRIENDS goes straight to this device's player select when a
 * friend is already linked in the party, and asks "Who's starting the game?"
 * otherwise. A linked friend's game shows up on the menu as a Join card, with
 * nothing to type:
 *   - the party's host opens its table through the party, and passes the
 *     table's letters along as the party table's "host side";
 *   - the party's guest cannot open a party table, so it knocks, and hosts
 *     on letters both devices work out from the party's own code.
 * Anyone else types the four letters shown on the starter's player select.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParty } from '@shared/party/PartyContext';
import { MAPS } from '../domain/city';
import type { Input, World, WorldEvent } from '../domain/world';
import type { RoundSettings } from '../net/protocol';
import { GulpTable } from '../net/table';
import { dealRoundWonders } from '../storage/settings';
import { durationOf, type Settings } from './round';
import { SKINS, rivalsBesides } from './skins';

/** The registry id: the party table and knock name it. */
const GAME = 'gulp';
/** Code letters: no I, L or O, so nothing reads like a 1 or a 0, and no digits to find. */
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const TOKEN_KEY = 'gulp.seat.v1';

export type Screen = 'who' | 'code' | 'select' | null;

/** Four fresh letters for a table. */
export function tableCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += LETTERS[Math.floor(rng() * LETTERS.length)];
  return s;
}

/** The letters a party guest hosts on, which its party host works out the same way. */
export function partyGuestCode(partyCode: string): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    let h = 2166136261;
    for (const ch of `${partyCode}:gulp:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    s += LETTERS[(h >>> 0) % LETTERS.length];
  }
  return s;
}

/** This device's seat token, kept so a reload sits back down in its own seat. */
function seatToken(): string {
  const made = () => Math.random().toString(36).slice(2, 12);
  try {
    const kept = localStorage.getItem(TOKEN_KEY);
    if (kept) return kept;
    const token = made();
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return made();
  }
}

const roundSettingsOf = (s: Settings): RoundSettings => ({
  map: s.map,
  difficulty: s.difficulty ?? 'easy',
  duration: durationOf(s),
  powerups: s.powerups,
  fightBack: s.fightBack,
});

/** What the page needs to play a shared round: its world, whose hole is mine, and how it steps. */
export interface SharedRound {
  world: World;
  follow: number;
  step: (dt: number, input: Input | null) => WorldEvent[];
}

export function useTogether(opts: {
  name: string;
  settings: Settings;
  rng: () => number;
  /** A round begins, here or on the host. Read once: it must not change. */
  onRound: (r: SharedRound) => void;
}) {
  const { rng, onRound } = opts;
  const party = useParty();
  const [screen, setScreen] = useState<Screen>(null);
  const [, setVersion] = useState(0);
  /** Whose game is being joined (a name, or "your friend"), and how that is going. */
  const [joinWho, setJoinWho] = useState('your friend');
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'failed'>('idle');
  /** A guest asked the host for another round, by name. */
  const [again, setAgain] = useState<string | null>(null);
  /** The party table this device opened, so leaving can close it. */
  const partyTable = useRef<string | null>(null);

  const [table] = useState(() => {
    const t: GulpTable = new GulpTable(
      { name: opts.name, skin: opts.settings.skin, token: seatToken() },
      {
        onChange: () => setVersion((v) => v + 1),
        // A guest who asked to join sits down once the host's seat list
        // arrives, and is told plainly if the game cannot be found.
        onSeated: () => {
          setJoinState('idle');
          setScreen('select');
        },
        onLost: () => {
          setJoinState('failed');
          t.leave();
        },
        onRound: (mirror) => onRound({ world: mirror.world, follow: mirror.you, step: (dt, input) => t.guestStep(dt, input) }),
        onAgain: (name) => setAgain(name),
      },
    );
    return t;
  });
  useEffect(() => () => table.leave(), [table]);

  // The host keeps the table's settings in step with the menu's.
  const settings = useMemo(() => roundSettingsOf(opts.settings), [opts.settings]);
  useEffect(() => {
    if (table.role === 'host') table.setSettings(settings);
  }, [settings, table]);

  const hostOn = useCallback(
    (code: string) => {
      setAgain(null);
      table.host(code, settings);
      setScreen('select');
    },
    [table, settings],
  );

  /** "Me! Friends join me": a table of my own, on fresh letters. */
  const startHere = useCallback(() => hostOn(tableCode(rng)), [hostOn, rng]);

  /** The menu's PLAY WITH FRIENDS. */
  const friends = useCallback(() => {
    setJoinState('idle');
    if (party.inParty && party.role === 'host') {
      const code = tableCode(rng);
      partyTable.current = party.openTable(GAME, code);
      hostOn(code);
    } else if (party.inParty && party.role === 'guest') {
      party.knockOn(GAME);
      hostOn(partyGuestCode(party.code));
    } else setScreen('who');
  }, [party, rng, hostOn]);

  /** A linked friend's game, ready to join from the menu. */
  const invite = useMemo((): { name: string; code: string } | null => {
    if (!party.inParty || screen) return null;
    const name = party.theirName ?? 'Your friend';
    if (party.role === 'guest' && party.table?.game === GAME && party.table.hostSide) return { name, code: party.table.hostSide };
    if (party.role === 'host' && party.knock === GAME) return { name, code: partyGuestCode(party.code) };
    return null;
  }, [party.inParty, party.role, party.table, party.knock, party.theirName, party.code, screen]);

  /** Dial a table: from the letter keys, or a linked friend's Join card. */
  const join = useCallback(
    (code: string, who: string) => {
      setJoinWho(who);
      setJoinState('joining');
      table.join(code);
    },
    [table],
  );

  const leave = useCallback(() => {
    if (partyTable.current) party.closeTable(partyTable.current);
    partyTable.current = null;
    table.leave();
    setScreen(null);
    setJoinState('idle');
    setAgain(null);
  }, [party, table]);

  /** Host: everyone linked now plays; the computer holes fill the map's other seats. */
  const start = useCallback(() => {
    const children = table.seats.filter((s) => s.connected);
    const rivals = rivalsBesides(
      children.map((s) => s.skin),
      Math.max(0, MAPS[settings.map].rivals + 1 - children.length),
    );
    const world = table.startRound(Math.floor(rng() * 2 ** 32), dealRoundWonders(settings.map, rng), rivals);
    setAgain(null);
    onRound({ world, follow: 0, step: (dt, input) => table.hostStep(dt, input) });
  }, [table, settings.map, rng, onRound]);

  const setSkin = useCallback((skin: number) => table.setSkin(skin), [table]);

  /** From my player select: a friend is starting instead, so type their letters. */
  const joinInstead = useCallback(() => {
    leave();
    setScreen('code');
  }, [leave]);

  /** A friend linked in the party, so PLAY WITH FRIENDS needs no question. */
  const linked = party.inParty && !!party.theirName;

  /** The four slots of the player select. */
  const slots = Array.from({ length: 4 }, (_, i) => {
    const s = table.seats[i];
    if (s) return { name: s.name, skin: s.skin, state: i === 0 ? ('host' as const) : s.connected ? ('ready' as const) : ('away' as const) };
    // A friend linked in the party, on their way.
    if (i === 1 && table.role === 'host' && party.inParty && party.theirName) {
      return { name: party.theirName, skin: (opts.settings.skin + 1) % SKINS.length, state: 'coming' as const };
    }
    return null;
  });

  const joining = joinState === 'joining' ? joinWho : null;
  const joinError = joinState === 'failed' ? joinWho : null;

  return { table, screen, setScreen, friends, startHere, invite, join, joining, joinError, leave, joinInstead, linked, start, setSkin, slots, again, settings };
}
