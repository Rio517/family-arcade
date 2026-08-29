/**
 * The app-level Party control — a small pill pinned to the bottom-centre of
 * every screen. Collapsed it just shows who you're with; tapped it opens a panel
 * to start/join a party, turn voice/video on (opt-in), or leave. Because it's
 * mounted above the router it stays put as you move between games.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeCode } from '@shared/net/peer';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { initialOf } from '@shared/profile/tickets';
import { useProfile } from '@shared/profile/useProfile';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { CameraIcon, CloseIcon, MicIcon, MicOffIcon, PartyIcon } from '@shared/ui/icons';
import { useParty } from './PartyContext';
import './party.css';

export function PartyBar() {
  const party = useParty();
  // Your ticket is your name here too — the party never asks for one. A read,
  // so the reader hook, not the writer one.
  const active = Boolean(useProfile().profile.name);
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const pillRef = useRef<HTMLButtonElement>(null);
  // The panel is a dialog like any other in the arcade: Escape closes it and
  // hands focus back to the pill that opened it.
  const close = () => {
    setOpen(false);
    pillRef.current?.focus();
  };
  useDismissOnEscape(open, close);
  const leave = () => {
    // Back to the start screen next time, not the code form you joined with.
    setJoining(false);
    party.leaveParty();
  };

  const { inParty, call } = party;

  return (
    <aside className="party-root" aria-label="Party">
      {open && (
        <div className="party-panel" role="dialog" aria-label="Party">
          {!inParty ? (
            <>
              <PlayingAs />

              {party.role === 'host' ? (
                <div className="party-waiting">
                  <span className="party-eyebrow">Share this code</span>
                  <div className="party-code" data-testid="party-code">{party.code}</div>
                  <p className="party-hint">Tell your friend to open the Party and join with it.</p>
                  <button className="party-btn ghost" onClick={leave} data-testid="party-cancel">Cancel</button>
                </div>
              ) : joining ? (
                <div className="party-join">
                  <span className="party-eyebrow">Enter your friend's code</span>
                  <input
                    className="party-input code"
                    value={codeInput}
                    maxLength={4}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="ABCD"
                    onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
                    data-testid="party-code-input"
                  />
                  <button
                    className="party-btn primary"
                    disabled={codeInput.length !== 4}
                    onClick={() => party.joinParty(codeInput)}
                    data-testid="party-join-go"
                  >
                    Connect →
                  </button>
                  <button className="party-btn ghost" onClick={() => setJoining(false)} data-testid="party-join-back">Back</button>
                </div>
              ) : !active ? (
                <p className="party-hint" data-testid="party-needs-ticket">
                  A party needs your ticket.
                  <br />
                  <Link to="/" onClick={() => setOpen(false)}>Make one at the booth ›</Link>
                </p>
              ) : (
                <div className="party-start">
                  <button className="party-btn primary" onClick={() => party.hostParty()} data-testid="party-create">
                    Start a party
                  </button>
                  <button className="party-btn violet" onClick={() => setJoining(true)} data-testid="party-join">
                    Join with a code
                  </button>
                  <p className="party-hint">
                    Play together, switch games freely, and (if you want) see &amp; hear each other.
                    <br />
                    <Link to="/privacy" onClick={() => setOpen(false)}>How this keeps you safe →</Link>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="party-live">
              <div className="party-live-head">
                <span className="party-eyebrow">You're in a party</span>
                <span className={`party-status ${party.status}`}>
                  {party.status === 'connected' ? '● connected' : '… ' + party.status}
                </span>
              </div>
              <p className="party-with">
                <b>{party.myName}</b> &amp; <b>{party.theirName ?? 'your friend'}</b>
              </p>

              {!call.active ? (
                <>
                  <button className="party-btn primary" onClick={call.start} data-testid="party-call-start">
                    <MicIcon size={18} /> Turn on voice
                  </button>
                  <p className="party-hint">Your camera stays off until you turn it on.</p>
                </>
              ) : (
                <div className="party-callctl">
                  <button
                    className={`party-cbtn ${call.muted ? 'active' : ''}`}
                    onClick={call.toggleMute}
                    aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
                    data-testid="party-mute"
                  >
                    {call.muted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
                  </button>
                  <button
                    className={`party-cbtn ${call.cameraOn ? 'active' : ''}`}
                    onClick={call.toggleCamera}
                    aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
                    data-testid="party-camera"
                  >
                    <CameraIcon size={20} />
                  </button>
                  <button className="party-cbtn end" onClick={call.stop} aria-label="End the call" data-testid="party-call-end">
                    <CloseIcon size={20} />
                  </button>
                </div>
              )}

              <button className="party-btn ghost" onClick={leave} data-testid="party-leave">
                Leave party
              </button>
            </div>
          )}
        </div>
      )}

      <button
        ref={pillRef}
        className={`party-pill ${inParty ? 'live' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={inParty ? `Party with ${party.theirName ?? 'a friend'}` : 'Start a party'}
        data-testid="party-pill"
      >
        {inParty ? (
          <>
            <span className="party-ava a">{initialOf(party.myName)}</span>
            <span className="party-ava b">{initialOf(party.theirName ?? '?')}</span>
            <span className="party-dot" aria-hidden="true" />
            {call.active && (
              <span className="party-mini">
                {call.cameraOn ? <CameraIcon size={14} /> : <MicIcon size={14} />}
              </span>
            )}
          </>
        ) : (
          <>
            <PartyIcon size={16} /> Party
          </>
        )}
      </button>
    </aside>
  );
}
