import { useEffect, useRef, useState } from 'react';
import { normalizeCode } from '@shared/net/peer';
import { useParty } from '@shared/party/PartyContext';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { BotIcon, PartyIcon, PersonIcon } from '@shared/ui/icons';
import { CAPTAIN_PERSONAS } from '../domain/bots/personas';

/** Ship Battle's registry id — what the party's table and knock carry. */
const GAME_ID = 'battleship';

/** Kid-readable difficulty words for the four rungs of the captain ladder. */
const RUNG_WORDS: Record<number, string> = {
  1: 'easiest',
  2: 'a fair fight',
  3: 'sharp shooter',
  4: 'the boss',
};

interface LobbyProps {
  /** Create a game on your own: the page draws the code and seats the ticket. */
  onHost: () => void;
  /** Join a game by code — typed in, from a shared link, or handed over by the party. */
  onJoin: (code: string) => void;
  /** Start a game against a computer captain (ADR 0009). */
  onSolo: (personaId: string) => void;
  /** Host the table the party just opened under this code. */
  onHostTable: (code: string) => void;
  /** Pre-filled join code from a shared link (?g=CODE). */
  initialJoinCode?: string;
}

/**
 * Entry screen: create a game, join by code, or battle a computer captain.
 * Nobody is asked for a name — the signed-in ticket is the captain. In a party
 * the code doors close: the party is the table (the host opens it with one
 * tap, the guest walks in the moment it opens), and only the solo door stays.
 */
export function Lobby({ onHost, onJoin, onSolo, onHostTable, initialJoinCode }: LobbyProps) {
  const party = useParty();
  const [mode, setMode] = useState<'choose' | 'join' | 'solo'>(initialJoinCode ? 'join' : 'choose');
  const [code, setCode] = useState(initialJoinCode ? normalizeCode(initialJoinCode) : '');

  const friend = party.theirName ?? 'your friend';
  const partyHost = party.inParty && party.role === 'host';
  const partyGuest = party.inParty && party.role === 'guest';
  // While the party is (re)linking or linked, codes are its business, not the player's.
  const partyBusy = party.reconnecting || party.inParty;
  const ourTable = party.table?.game === GAME_ID ? party.table.code : null;

  // The guest at the door: knock once so the host's pill lights up, then walk
  // in the moment the party says a Ship Battle table is open — once per code,
  // however many times the party value re-renders.
  const knockedRef = useRef(false);
  const joinedCodeRef = useRef<string | null>(null);
  const { knockOn } = party;
  useEffect(() => {
    if (!partyGuest) return;
    if (ourTable) {
      if (joinedCodeRef.current === ourTable) return;
      joinedCodeRef.current = ourTable;
      onJoin(ourTable);
      return;
    }
    if (knockedRef.current) return;
    knockedRef.current = true;
    knockOn(GAME_ID);
  }, [partyGuest, ourTable, onJoin, knockOn]);

  return (
    <div className="stack">
      <PlayingAs />

      {mode === 'solo' ? (
        <div className="panel stack lobby-door lobby-door-solo">
          <span className="lobby-eyebrow">
            <BotIcon size={15} /> Play solo — just you
          </span>
          <h2>Choose your captain</h2>
          <p className="subtle">Level 1 is the gentlest — climb the ladder as you win.</p>
          {CAPTAIN_PERSONAS.map((p) => (
            <button
              key={p.id}
              className="btn btn-block lobby-captain"
              onClick={() => onSolo(p.id)}
              data-testid={`captain-${p.id}`}
            >
              <span className="lobby-captain-level" aria-hidden="true">
                <strong>Lv {p.rung}</strong>
                <span className="lobby-captain-pips">
                  {Array.from({ length: 4 }, (_, i) => (
                    <i key={i} className={i < p.rung ? 'on' : ''} />
                  ))}
                </span>
              </span>
              <span className="lobby-captain-who">
                <strong>
                  {p.name} <em className="lobby-captain-rank">— level {p.rung}, {RUNG_WORDS[p.rung]}</em>
                </strong>
                <span className="subtle lobby-captain-tag">{p.tagline}</span>
              </span>
            </button>
          ))}
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      ) : mode === 'join' && !partyBusy ? (
        <div className="panel stack">
          <h2>Join a game</h2>
          <div className="field">
            <label htmlFor="code">Enter the 4-character code</label>
            <input
              id="code"
              className="code-input"
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={4}
              placeholder="ABCD"
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              data-testid="code-input"
            />
          </div>
          <button
            className="btn btn-primary btn-lg btn-block"
            disabled={code.length !== 4}
            onClick={() => onJoin(code)}
            data-testid="join-game"
          >
            Connect →
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      ) : (
        <div className="lobby-doors">
          {/* Two rooms, clearly signposted: play together across two devices,
              or play alone against a captain — each with its own colour. In a
              party, the together door is the party itself. */}
          {party.reconnecting ? (
            <div className="panel stack lobby-door lobby-door-duo" data-testid="battle-party-reconnecting">
              <span className="lobby-eyebrow">
                <PartyIcon size={15} /> Play together — your party
              </span>
              <div className="placing-wait">
                <div className="qr-radar">
                  <span className="ping" />
                  <span className="ping" />
                  <span className="ping" />
                  <div className="conn-badge" aria-hidden="true">
                    <PartyIcon size={30} />
                  </div>
                </div>
                <p className="pw-line">
                  Reconnecting to your party
                  <span className="ell">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
                <p className="subtle">Hang tight — finding your friend.</p>
              </div>
            </div>
          ) : partyHost ? (
            <div className="panel stack lobby-door lobby-door-duo">
              <span className="lobby-eyebrow">
                <PartyIcon size={15} /> Play together — your party
              </span>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => onHostTable(party.openTable(GAME_ID))}
                data-testid="battle-party-play"
              >
                Play Ship Battle with {friend}
              </button>
              <p className="subtle center">{friend} hops straight in — no code to share.</p>
            </div>
          ) : partyGuest ? (
            <div className="panel stack lobby-door lobby-door-duo" data-testid="battle-party-waiting">
              <span className="lobby-eyebrow">
                <PartyIcon size={15} /> Play together — your party
              </span>
              <div className="placing-wait">
                <div className="qr-radar">
                  <span className="ping" />
                  <span className="ping" />
                  <span className="ping" />
                  <div className="conn-badge" aria-hidden="true">
                    <PartyIcon size={30} />
                  </div>
                </div>
                <p className="pw-line">
                  Waiting for <strong>{friend}</strong> to open Ship Battle
                  <span className="ell">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
                <p className="subtle">We’ve let them know you’re at the door.</p>
              </div>
            </div>
          ) : (
            <div className="panel stack lobby-door lobby-door-duo">
              <span className="lobby-eyebrow">
                <PersonIcon size={14} />
                <PersonIcon size={14} /> Play together — two devices
              </span>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => onHost()}
                data-testid="create-game"
              >
                Create a game
              </button>
              <p className="subtle center">You’ll get a code to share with the other iPad.</p>
              <button
                className="btn btn-violet btn-lg btn-block"
                onClick={() => setMode('join')}
                data-testid="show-join"
              >
                Join with a code
              </button>
            </div>
          )}

          <div className="panel stack lobby-door lobby-door-solo">
            <span className="lobby-eyebrow">
              <BotIcon size={15} /> Play solo — just you
            </span>
            <button
              className="btn btn-amber btn-lg btn-block"
              onClick={() => setMode('solo')}
              data-testid="solo-game"
            >
              Battle the computer
            </button>
            <p className="subtle center">Four captains, from easiest to the boss.</p>
          </div>
        </div>
      )}
    </div>
  );
}
