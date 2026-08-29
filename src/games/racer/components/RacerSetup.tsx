/**
 * Rainbow Racer's pre-race screens: the 1P/2P mode choice, the driver picker,
 * and the two-player lobby. RacerPage owns the phase machine and just picks
 * which of these to show.
 *
 * The lobby stands on the party (ADR 0008): with no party it keeps its code
 * doors (create a code / join with a code); in a party the host gets one
 * "Race {friend}" button that opens the racer's table, and the guest is seated
 * automatically the moment that table appears — nobody types a code.
 */
import { useEffect, useRef, useState } from 'react';
import { ConnectionBadge } from '@shared/ui/ConnectionBadge';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { generateCode, normalizeCode } from '@shared/net/peer';
import { useParty } from '@shared/party/PartyContext';
import type { RacerLook } from '../three/scene';
import type { RaceMode } from '../domain/race';
import type { RacerNet } from '../net/useRacerNet';

/** The racer's id in the app registry — what the party's table names. */
const GAME_ID = 'racer';

export interface Driver {
  id: string;
  name: string;
  emoji: string;
  color: number;
  css: string;
}

export const DRIVERS: Driver[] = [
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', color: 0xff7fc4, css: '#ff7fc4' },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', color: 0x54c274, css: '#54c274' },
  { id: 'fairy', name: 'Fairy', emoji: '🧚', color: 0xffcf4a, css: '#ffcf4a' },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋', color: 0xa78bfa, css: '#a78bfa' },
];

export const driverById = (id: string): Driver => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
export const lookOf = (d: Driver): RacerLook => ({ emoji: d.emoji, color: d.color });

export function ModeScreen({ onPick }: { onPick: (m: RaceMode) => void }) {
  return (
    <div className="racer-setup">
      <div className="racer-setup-head">
        <h1>Rainbow Racer</h1>
        <p>Race around a 3D arena and collect 20 coins! 🪙</p>
      </div>
      <div className="racer-choices">
        <button className="racer-big-btn" onClick={() => onPick('solo')} data-testid="racer-mode-solo">
          <span className="racer-big-emoji">🦄</span>
          <span className="racer-big-label">1 Player</span>
          <span className="racer-big-sub">Race on your own</span>
        </button>
        <button className="racer-big-btn" onClick={() => onPick('net')} data-testid="racer-mode-net">
          <span className="racer-big-emoji">🦄🐉</span>
          <span className="racer-big-label">2 Players</span>
          <span className="racer-big-sub">Race a friend on another device</span>
        </button>
      </div>
    </div>
  );
}

export function PickScreen({ mode, onPick }: { mode: RaceMode; onPick: (d: Driver) => void }) {
  return (
    <div className="racer-setup">
      <div className="racer-setup-head">
        <h1>Pick your racer</h1>
        <p>{mode === 'net' ? 'Then connect with your friend.' : 'Then drive and collect 20 coins! 🪙'}</p>
      </div>
      <div className="racer-cast">
        {DRIVERS.map((d) => (
          <button
            key={d.id}
            className="racer-cast-btn"
            style={{ borderColor: d.css }}
            onClick={() => onPick(d)}
            data-testid={`racer-driver-${d.id}`}
          >
            <span className="racer-cast-emoji">{d.emoji}</span>
            <span className="racer-cast-name" style={{ color: d.css }}>{d.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RacerLobby({
  driver,
  net,
  seatedUserId,
}: {
  driver: Driver;
  net: RacerNet;
  /** The signed-in ticket's id — who this device sits down as. */
  seatedUserId: string | null;
}) {
  const party = useParty();
  const [joinMode, setJoinMode] = useState(false);
  const [code, setCode] = useState('');

  const partyHost = party.inParty && party.role === 'host';
  const partyGuest = party.inParty && party.role === 'guest';
  const friend = party.theirName ?? 'your friend';
  /** Guest: the code of the racer table the host has open, if any. */
  const tableCode = partyGuest && party.table?.game === GAME_ID ? party.table.code : null;

  // Guest in a party: knock on the racer's door once, unless the host has
  // already opened it. (A re-render, or the table changing, never re-knocks.)
  const { knockOn } = party;
  const knockedRef = useRef(false);
  useEffect(() => {
    if (!partyGuest || tableCode || knockedRef.current) return;
    knockedRef.current = true;
    knockOn(GAME_ID);
  }, [partyGuest, tableCode, knockOn]);

  // Guest in a party: sit down at the host's table as soon as it opens —
  // exactly once per code. A closed table drops the link and goes back to
  // waiting; a fresh code hangs up the old link first, since a live
  // GameConnection can't dial twice.
  const { startTable, leave } = net;
  const dialedCodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!partyGuest) return;
    if (!tableCode) {
      if (dialedCodeRef.current) {
        dialedCodeRef.current = null;
        leave();
      }
      return;
    }
    if (dialedCodeRef.current === tableCode) return;
    if (dialedCodeRef.current) leave();
    dialedCodeRef.current = tableCode;
    startTable({ role: 'guest', code: tableCode, seatedUserId });
  }, [partyGuest, tableCode, startTable, leave, seatedUserId]);

  /** Back out of a table: hang up, and (as the party host) tell the friend it closed. */
  /** Back out of a table: tell the party (it ignores a code that isn't its open table), then hang up. */
  const leaveTable = () => {
    if (net.code) party.closeTable(net.code);
    net.leave();
  };

  if (net.role) {
    // Connecting / waiting.
    return (
      <div className="racer-lobby">
        <ConnectionBadge status={net.status} detail={net.statusDetail} />
        {net.role === 'host' && party.inParty ? (
          <div className="racer-lobby-card">
            <h2>Race on!</h2>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : `Waiting for ${friend} to hop in…`}
            </p>
          </div>
        ) : net.role === 'host' ? (
          <div className="racer-lobby-card">
            <h2>Share this code</h2>
            <div className="racer-code" data-testid="racer-code">{net.code}</div>
            <p>Ask your friend to open Rainbow Racer → 2 Players → Join, and type this code.</p>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : 'Waiting for your friend to join…'}
            </p>
          </div>
        ) : party.inParty ? (
          <div className="racer-lobby-card">
            <h2>Hopping into {friend}’s race…</h2>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : `Looking for ${friend}…`}
            </p>
          </div>
        ) : (
          <div className="racer-lobby-card">
            <h2>Joining game {net.code}…</h2>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : 'Looking for the host…'}
            </p>
          </div>
        )}
        {/* A party guest is seated by the host; the shell's ‹ Menu is its way out. */}
        {!partyGuest && (
          <button className="racer-ghost" onClick={leaveTable} data-testid="racer-lobby-back">← Back</button>
        )}
      </div>
    );
  }

  return (
    <div className="racer-lobby">
      <PlayingAs />
      <div className="racer-lobby-card">
        <h2>Your racer {driver.emoji}</h2>
      </div>
      {party.reconnecting ? (
        <div className="racer-lobby-card" data-testid="racer-party-reconnecting">
          <h2>One moment…</h2>
          <p className="racer-lobby-status">Reconnecting to your party…</p>
        </div>
      ) : partyHost ? (
        <div className="racer-lobby-card">
          <h2>Ready to race?</h2>
          <button
            className="racer-primary"
            onClick={() => startTable({ role: 'host', code: party.openTable(GAME_ID), seatedUserId })}
            data-testid="racer-party-play"
          >
            Race {friend}
          </button>
          <p className="racer-lobby-status">{friend} hops in automatically — no code needed.</p>
        </div>
      ) : partyGuest ? (
        <div className="racer-lobby-card" data-testid="racer-party-waiting">
          <h2>Almost there!</h2>
          <p className="racer-lobby-status">Waiting for {friend} to open Rainbow Racer…</p>
        </div>
      ) : joinMode ? (
        <div className="racer-lobby-card">
          <h2>Join a game</h2>
          <input
            className="racer-code-input"
            data-testid="racer-code-input"
            value={code}
            maxLength={4}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button
            className="racer-primary"
            disabled={code.length !== 4}
            onClick={() => startTable({ role: 'guest', code, seatedUserId })}
            data-testid="racer-join"
          >
            Connect →
          </button>
          <button className="racer-ghost" onClick={() => setJoinMode(false)} data-testid="racer-join-back">
            ← Back
          </button>
        </div>
      ) : (
        <div className="racer-lobby-card">
          <h2>Play with a friend</h2>
          <button
            className="racer-primary"
            onClick={() => startTable({ role: 'host', code: generateCode(), seatedUserId })}
            data-testid="racer-create"
          >
            Create a game
          </button>
          <p className="racer-lobby-status">You’ll get a code to share.</p>
          <button className="racer-ghost" onClick={() => setJoinMode(true)} data-testid="racer-show-join">
            Join with a code
          </button>
        </div>
      )}
    </div>
  );
}
