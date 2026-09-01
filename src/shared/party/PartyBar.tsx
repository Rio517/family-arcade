/**
 * The app-level Party control — a small pill pinned to the bottom-centre of
 * every screen. Collapsed it just shows who you're with; tapped it opens a panel
 * to start/join a party, turn voice/video on (opt-in), or leave. Because it's
 * mounted above the router it stays put as you move between games — and it
 * lights up when the friend opens a table or knocks on a game's door.
 */
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { normalizeCode } from '@shared/net/peer';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { initialOf } from '@shared/profile/tickets';
import { useProfile } from '@shared/profile/useProfile';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { CameraIcon, ChevronDownIcon, CloseIcon, MicIcon, MicOffIcon, PartyIcon } from '@shared/ui/icons';
import { useParty, type GameInfo, type PartyValue } from './PartyContext';
import './party.css';

/**
 * The way on when a pairing is stuck: the host can mint a fresh code, the
 * guest can go and type a different one. Never a dead end — the UX pass
 * (docs/mockups/20260831-party-ui) asked for one recognisable action, not a paragraph.
 */
function WayOut({ party, onCode }: { party: PartyValue; onCode: () => void }) {
  if (party.role === 'host') {
    return (
      <button className="party-btn violet" onClick={() => party.hostParty()} data-testid="party-new-code">
        New code
      </button>
    );
  }
  return (
    <button
      className="party-btn violet"
      onClick={() => {
        party.leaveParty();
        onCode();
      }}
      data-testid="party-other-code"
    >
      Enter a different code
    </button>
  );
}

export function PartyBar({
  initiallyOpen = false,
  soloEffects = null,
}: {
  /** Harness pages render the panel already open. */
  initiallyOpen?: boolean;
  /** Where the camera effects can be played with alone (the app names the
   * game — shared code stays game-blind). Null: no such door. */
  soloEffects?: GameInfo | null;
} = {}) {
  const party = useParty();
  const { pathname } = useLocation();
  // Your ticket is your name here too — the party never asks for one. A read,
  // so the reader hook, not the writer one.
  const active = Boolean(useProfile().profile.name);
  const [open, setOpen] = useState(initiallyOpen);
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
  const friend = party.theirName ?? 'your friend';
  // A table open somewhere you aren't: the friend opened a game (or you did,
  // and walked away). A knock: the friend is at a game's door.
  const table = party.table ? party.resolveGame(party.table.game) : null;
  const invite = table && pathname !== table.path ? table : null;
  const knock = party.knock ? party.resolveGame(party.knock) : null;
  const lit = inParty && Boolean(invite || knock);
  // The camera effects without a party: the door sits under the start screen
  // and under the call doors, and steps aside once a call is on.
  const soloDoor = soloEffects && (
    <Link className="party-btn ghost" to={soloEffects.path} onClick={() => setOpen(false)} data-testid="party-solo-effects">
      <CameraIcon size={18} /> {soloEffects.title} ›
    </Link>
  );

  return (
    <aside className="party-root" aria-label="Party">
      {open && (
        <div className="party-panel" role="dialog" aria-label="Party">
          {/* The panel's one always-there row: its name, and the obvious way
              back down — tapping the pill again wasn't discoverable. */}
          <div className="party-panel-head">
            <span className="party-eyebrow">Play Online</span>
            <button
              className="party-collapse"
              onClick={close}
              aria-label="Minimize the party panel"
              data-testid="party-collapse"
            >
              <ChevronDownIcon size={18} />
            </button>
          </div>
          {!inParty ? (
            <>
              <PlayingAs />

              {party.reconnecting ? (
                <div className="party-waiting" data-testid="party-reconnecting">
                  <span className="party-eyebrow">Finding your friend</span>
                  {/* The code stays on show: it is what the friend comes back with. */}
                  {party.code && <div className="party-code" data-testid="party-code">{party.code}</div>}
                  <p className="party-hint">
                    {party.role === 'host' ? 'Waiting for your friend to come back…' : 'Reconnecting to your party…'}
                  </p>
                  <WayOut party={party} onCode={() => setJoining(true)} />
                  <button className="party-btn ghost" onClick={leave} data-testid="party-leave">Leave</button>
                </div>
              ) : party.status === 'error' ? (
                <div className="party-waiting" data-testid="party-error">
                  <span className="party-eyebrow">No luck yet</span>
                  {/* A still-useful code is never hidden by an error. */}
                  {party.code && <div className="party-code" data-testid="party-code">{party.code}</div>}
                  <p className="party-hint">
                    {party.role === 'host'
                      ? 'The other iPad has not come in. Is it awake?'
                      : 'No party with that code right now.'}
                  </p>
                  <button className="party-btn primary" onClick={party.retry} data-testid="party-retry">Try again</button>
                  <WayOut party={party} onCode={() => setJoining(true)} />
                  <button className="party-btn ghost" onClick={leave} data-testid="party-leave">Leave</button>
                </div>
              ) : party.role === 'host' ? (
                <div className="party-waiting">
                  <span className="party-eyebrow">Share this code</span>
                  <div className="party-code" data-testid="party-code">{party.code}</div>
                  <p className="party-hint">On the other iPad: Play together → Enter Code.</p>
                  <button className="party-btn ghost" onClick={leave} data-testid="party-cancel">Cancel</button>
                </div>
              ) : party.role === 'guest' ? (
                <div className="party-waiting" data-testid="party-dialing">
                  <span className="party-eyebrow">Joining {party.code}</span>
                  <p className="party-hint">Knocking on the other iPad…</p>
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
                  <p className="party-hint">Two iPads, one game.</p>
                  <button className="party-btn primary" onClick={() => party.hostParty()} data-testid="party-create">
                    Start Pairing
                  </button>
                  <button className="party-btn violet" onClick={() => setJoining(true)} data-testid="party-join">
                    Enter Code
                  </button>
                  <p className="party-hint">
                    <Link to="/privacy" onClick={() => setOpen(false)}>How this keeps you safe →</Link>
                  </p>
                  {soloDoor}
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
                <b>{party.myName}</b> &amp; <b>{friend}</b>
              </p>

              {invite && (
                <div className="party-invite" data-testid="party-invite">
                  <span>
                    <b>{party.role === 'host' ? 'Your table' : friend}</b>
                    {party.role === 'host' ? ` — ${invite.title}` : ` opened ${invite.title}`}
                  </span>
                  <Link className="party-btn teal" to={invite.path} onClick={close} data-testid="party-invite-go">
                    {party.role === 'host' ? 'Back to it ›' : 'Join ›'}
                  </Link>
                </div>
              )}
              {knock && (
                <div className="party-invite knock" data-testid="party-knock">
                  <span>
                    <b>{friend}</b> wants to play {knock.title}
                  </span>
                  <Link
                    className="party-btn teal"
                    to={knock.path}
                    onClick={() => {
                      party.clearKnock();
                      close();
                    }}
                    data-testid="party-knock-go"
                  >
                    Open ›
                  </Link>
                </div>
              )}

              {!call.active ? (
                <>
                  {/* Two plain doors: voice, or voice and camera together.
                      Nothing is on until you tap one of them. */}
                  <button className="party-btn primary" onClick={call.start} data-testid="party-call-start">
                    <MicIcon size={18} /> Voice call
                  </button>
                  <button className="party-btn violet" onClick={call.startVideo} data-testid="party-video-start">
                    <CameraIcon size={18} /> Video call
                  </button>
                  <p className="party-hint">Nothing turns on until you tap. Tap the little video window to make it big.</p>
                  {soloDoor}
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
        className={`party-pill ${inParty ? 'live' : ''} ${lit ? 'invite' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={
          lit
            ? `Play together — ${knock ? `${friend} wants to play ${knock.title}` : `${friend} opened ${invite?.title}`}`
            : inParty
              ? `Playing with ${friend}`
              : party.reconnecting
                ? 'Play together — reconnecting'
                : 'Play together'
        }
        data-testid="party-pill"
      >
        {inParty ? (
          <>
            <span className="party-ava a">{initialOf(party.myName)}</span>
            <span className="party-ava b">{initialOf(party.theirName ?? '?')}</span>
            <span className="party-dot" aria-hidden="true" />
            {lit && (
              <span className="party-badge" data-testid="party-badge">
                {knock ? `${knock.title}?` : `${invite?.title} ›`}
              </span>
            )}
            {call.active && (
              <span className="party-mini">
                {call.cameraOn ? <CameraIcon size={14} /> : <MicIcon size={14} />}
              </span>
            )}
          </>
        ) : party.reconnecting ? (
          <>
            <PartyIcon size={16} /> reconnecting…
          </>
        ) : (
          <>
            <PartyIcon size={16} /> Play together
          </>
        )}
      </button>
    </aside>
  );
}
