import { useState } from 'react';
import { normalizeCode } from '../net/peer';

interface LobbyProps {
  name: string;
  onName: (name: string) => void;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  /** Pre-filled join code from a shared link (?g=CODE). */
  initialJoinCode?: string;
}

/** Entry screen: enter a name, then create a game or join one by code. */
export function Lobby({ name, onName, onHost, onJoin, initialJoinCode }: LobbyProps) {
  const [mode, setMode] = useState<'choose' | 'join'>(initialJoinCode ? 'join' : 'choose');
  const [code, setCode] = useState(initialJoinCode ? normalizeCode(initialJoinCode) : '');

  const readyName = name.trim() || 'Captain';

  return (
    <div className="stack">
      <div className="panel">
        <h2>Captain’s name</h2>
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
