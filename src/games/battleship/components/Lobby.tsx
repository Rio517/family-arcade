import { useState } from 'react';
import { normalizeCode } from '@shared/net/peer';
import { NamePicker } from '@shared/ui/NamePicker';
import { CAPTAIN_PERSONAS } from '../domain/bots/personas';

interface LobbyProps {
  name: string;
  onName: (name: string) => void;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  /** Start a game against a computer captain (ADR 0009). */
  onSolo: (personaId: string, name: string) => void;
  /** Pre-filled join code from a shared link (?g=CODE). */
  initialJoinCode?: string;
}

/** Entry screen: enter a name, then create a game, join by code, or battle a
 *  computer captain. */
export function Lobby({ name, onName, onHost, onJoin, onSolo, initialJoinCode }: LobbyProps) {
  const [mode, setMode] = useState<'choose' | 'join' | 'solo'>(initialJoinCode ? 'join' : 'choose');
  const [code, setCode] = useState(initialJoinCode ? normalizeCode(initialJoinCode) : '');

  const readyName = name.trim() || 'Captain';

  return (
    <div className="stack">
      <div className="panel">
        <h2>Captain’s name</h2>
        <NamePicker value={name} onPick={onName} />
        <div className="field">
          <label htmlFor="name">Shown to your opponent</label>
          <input
            id="name"
            value={name}
            maxLength={20}
            placeholder="Captain"
            onChange={(e) => onName(e.target.value)}
            data-testid="name-input"
          />
        </div>
      </div>

      {mode === 'choose' ? (
        <div className="panel stack">
          <h2>Start a battle</h2>
          <button
            className="btn btn-primary btn-lg btn-block"
            onClick={() => {
              onName(readyName);
              onHost(readyName);
            }}
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
          <button
            className="btn btn-lg btn-block"
            onClick={() => setMode('solo')}
            data-testid="solo-game"
          >
            Battle the computer
          </button>
        </div>
      ) : mode === 'solo' ? (
        <div className="panel stack">
          <h2>Choose your foe</h2>
          <p className="subtle">Gentlest first — every captain up the ladder shoots a little sharper.</p>
          {CAPTAIN_PERSONAS.map((p) => (
            <button
              key={p.id}
              className="btn btn-block lobby-captain"
              onClick={() => {
                onName(readyName);
                onSolo(p.id, readyName);
              }}
              data-testid={`captain-${p.id}`}
            >
              <strong>{p.name}</strong>
              <span className="subtle lobby-captain-tag">{p.tagline}</span>
            </button>
          ))}
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      ) : (
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
            onClick={() => {
              onName(readyName);
              onJoin(code, readyName);
            }}
            data-testid="join-game"
          >
            Connect →
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
