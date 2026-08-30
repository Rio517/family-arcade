/**
 * The party's video call, in two sizes.
 *
 * Small: a draggable window (like a video-call PiP) that rides over every
 * screen while a call is on — the friend (their video, or a voice avatar if
 * their camera is off) plus a mirrored self-view. Mounted above the router, so
 * it survives moving between games. Only appears once the call is on (video
 * is opt-in).
 *
 * Big: tap the little window and it becomes a normal video call — the friend
 * filling the screen, you in the corner, the call controls along the bottom,
 * and the camera effects (ADR 0010) as chips you wear while looking at
 * yourself. Minimize (or Escape) brings the little window back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { EffectsOverlay } from '@shared/effects/EffectsOverlay';
import { EFFECTS } from '@shared/effects/effects';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { CameraIcon, ChevronDownIcon, ClockIcon, CloseIcon, MicIcon, MicOffIcon, PersonIcon, SpeakerIcon } from '@shared/ui/icons';
import { useParty } from './PartyContext';

// The floating card's footprint. CARD_W must match the `.pv` width in
// party.css; CARD_H is an approximate height (video + label) and EDGE is the
// gap we keep from the viewport edges when clamping a dragged position.
const CARD_W = 168;
const CARD_H = 150;
const EDGE = 8;
// Movement below this is a press, not a drag (same feel as the Risk map).
const DRAG_THRESHOLD_PX = 6;

/** Keep a proposed top-left corner within the visible viewport. */
function clampToViewport(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(EDGE, x), window.innerWidth - CARD_W - EDGE),
    y: Math.min(Math.max(EDGE, y), window.innerHeight - CARD_H - EDGE),
  };
}

/**
 * A media element fed by a stream. The element is held twice: a ref for the
 * `srcObject` write (done in an effect), and state for the effects overlay,
 * which needs the actual element to hand to its tracker — one callback ref
 * fills both.
 */
function useStreamMedia<T extends HTMLMediaElement>(stream: MediaStream | null): [(el: T | null) => void, T | null] {
  const ref = useRef<T | null>(null);
  const [el, setEl] = useState<T | null>(null);
  const attach = useCallback((node: T | null) => {
    ref.current = node;
    setEl(node);
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [el, stream]);
  return [attach, el];
}

export function FloatingVideo({ initiallyExpanded = false }: { /** Harness pages render the big window straight away. */ initiallyExpanded?: boolean } = {}) {
  const { call, theirName, effects, theirEffects, setEffects } = useParty();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // The active grab: which pointer, where inside the card it grabbed (so
  // dragging doesn't jump), where it started, and whether it has crossed the
  // drag threshold yet.
  const grab = useRef<{
    pointerId: number;
    grabX: number;
    grabY: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null>(null);
  // A drag ends with a click the browser still delivers; that one is not a tap.
  const swallowClickRef = useRef(false);

  const remoteHasVideo = !!call.remoteStream && call.remoteStream.getVideoTracks().length > 0;
  const showRemoteVideo = call.status === 'live' && remoteHasVideo;
  const friend = theirName ?? 'Friend';

  const [attachLocal, localEl] = useStreamMedia<HTMLVideoElement>(call.localStream);
  const [attachRemote, remoteEl] = useStreamMedia<HTMLVideoElement>(call.remoteStream);
  const [attachAudio] = useStreamMedia<HTMLAudioElement>(call.remoteStream);

  const big = expanded && call.active;
  useDismissOnEscape(big, () => setExpanded(false));

  // If the window shrinks, pull a dragged card back into view.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampToViewport(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!call.active) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // One pointer drives the card at a time — but a grab that never saw its
    // pointerup (the pointer slid off before the threshold, so nothing was
    // captured and the up landed elsewhere) is stale, and a fresh press
    // replaces it rather than being locked out.
    if (grab.current?.dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    grab.current = {
      pointerId: e.pointerId,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      originX: e.clientX,
      originY: e.clientY,
      dragging: false,
    };
    // No capture here: capturing on the bare press would retarget the
    // follow-up click to this card and starve any control inside it — the
    // bug that once made every Risk territory unclickable.
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (!g.dragging) {
      if (e.buttons === 0) {
        // A mouse keeps its pointerId across gestures, so after a missed
        // pointerup a bare hover would match the stale grab and drag the
        // card with no button held. Touch moves always report buttons=1.
        grab.current = null;
        return;
      }
      if (Math.hypot(e.clientX - g.originX, e.clientY - g.originY) <= DRAG_THRESHOLD_PX) return;
      g.dragging = true;
      const el = e.currentTarget;
      if (typeof el.setPointerCapture === 'function') {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Fake pointers (tests) have no capturable id; dragging still works.
        }
      }
    }
    setPos(clampToViewport(e.clientX - g.grabX, e.clientY - g.grabY));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (g?.dragging) {
      swallowClickRef.current = true;
      const el = e.currentTarget;
      if (typeof el.releasePointerCapture === 'function') {
        try {
          el.releasePointerCapture(g.pointerId);
        } catch {
          // Already released (e.g. pointercancel); nothing to undo.
        }
      }
    }
    grab.current = null;
  };
  const onClick = () => {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      return;
    }
    setExpanded(true);
  };

  const remoteFeed = (
    <div className="pv-feed">
      {/* No <track>: this is a live peer-to-peer camera feed, not recorded
          media — there is no caption file to point at, and we do no
          speech-to-text (everything stays on-device by design). */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={attachRemote} autoPlay playsInline className="pv-video" data-testid="pv-remote-video" />
      {/* The friend's effects, drawn here on their video (ADR 0010: the
          stream itself is never touched). The avatar has no face to track. */}
      <EffectsOverlay video={remoteEl} effects={theirEffects} />
    </div>
  );
  const avatar = (
    <div className="pv-avatar">{call.status === 'live' ? <PersonIcon size={34} /> : <ClockIcon size={30} />}</div>
  );
  const selfFeed = call.cameraOn && (
    <div className={big ? 'pv-self-wrap cv-self' : 'pv-self-wrap'}>
      <video ref={attachLocal} autoPlay playsInline muted className="pv-self" />
      {/* Mine, on my own preview, so I can see what the friend sees. */}
      <EffectsOverlay video={localEl} effects={effects} />
    </div>
  );
  // eslint-disable-next-line jsx-a11y/media-has-caption -- live peer audio, no caption file exists
  const audio = <audio ref={attachAudio} autoPlay />;

  if (big) {
    return (
      <div className="cv" role="dialog" aria-label={`Video call with ${friend}`} data-testid="call-view">
        <div className="cv-head">
          <span className="cv-name">{call.status !== 'live' ? 'Connecting…' : friend}</span>
          <button
            className="party-cbtn"
            onClick={() => setExpanded(false)}
            aria-label="Back to the little window"
            data-testid="call-view-minimize"
          >
            <ChevronDownIcon size={22} />
          </button>
        </div>
        <div className="cv-stage">
          {showRemoteVideo ? remoteFeed : avatar}
          {audio}
          {selfFeed}
        </div>
        <div className="cv-bar">
          <div className="party-callctl">
            <button
              className={`party-cbtn ${call.muted ? 'active' : ''}`}
              onClick={call.toggleMute}
              aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
              data-testid="call-view-mute"
            >
              {call.muted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </button>
            <button
              className={`party-cbtn ${call.cameraOn ? 'active' : ''}`}
              onClick={call.toggleCamera}
              aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
              data-testid="call-view-camera"
            >
              <CameraIcon size={20} />
            </button>
            <button className="party-cbtn end" onClick={call.stop} aria-label="End the call" data-testid="call-view-end">
              <CloseIcon size={20} />
            </button>
          </div>
          {/* Camera effects (ADR 0010): chips you wear on your own video, picked
              while you can see yourself. They need a camera to sit on. */}
          {call.cameraOn ? (
            <div className="party-chips" role="group" aria-label="Camera effects">
              {EFFECTS.map(({ id, name, Icon }) => {
                const on = effects.includes(id);
                return (
                  <button
                    key={id}
                    className="party-chip"
                    aria-pressed={on}
                    onClick={() => setEffects(on ? effects.filter((e) => e !== id) : [...effects, id])}
                    data-testid={`call-effect-${id}`}
                  >
                    <Icon size={18} /> {name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="party-hint cv-hint" data-testid="call-effects-hint">
              Turn your camera on to wear the dragon or the rainbow magic.
            </p>
          )}
        </div>
      </div>
    );
  }

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;

  return (
    // The little window drags by its whole body; its face is a button (tap:
    // make it big), which is also the keyboard path to the big window.
    <aside
      aria-label="Video call"
      className="pv"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      data-testid="party-floating-video"
    >
      <button
        type="button"
        className="pv-remote"
        onClick={onClick}
        aria-label={`Make the video big — ${friend}`}
        data-testid="party-video-expand"
      >
        {showRemoteVideo ? remoteFeed : avatar}
        {audio}
        {selfFeed}
        <span className="pv-label">
          {call.status !== 'live' ? (
            'Connecting…'
          ) : remoteHasVideo ? (
            friend
          ) : (
            <>
              <SpeakerIcon size={13} /> {friend}
            </>
          )}
        </span>
      </button>
    </aside>
  );
}
