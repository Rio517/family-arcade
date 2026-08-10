/**
 * The party's floating video — a small draggable window (like a video-call PiP)
 * that rides over every screen while a call is on. It shows the friend (their
 * video, or a voice avatar if their camera is off) plus a mirrored self-view.
 * Mounted above the router, so it survives moving between games — including two
 * DIFFERENT games at once. Only appears once the call is on (video is opt-in).
 */
import { useEffect, useRef, useState } from 'react';
import { ClockIcon, PersonIcon, SpeakerIcon } from '@shared/ui/icons';
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

export function FloatingVideo() {
  const { call, theirName } = useParty();
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
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

  const remoteHasVideo = !!call.remoteStream && call.remoteStream.getVideoTracks().length > 0;

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = call.localStream;
  }, [call.localStream, call.cameraOn]);
  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = call.remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.remoteStream, remoteHasVideo]);

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

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;

  return (
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
      <div className="pv-remote">
        {call.status === 'live' && remoteHasVideo ? (
          // No <track>: this is a live peer-to-peer camera feed, not recorded
          // media — there is no caption file to point at, and we do no
          // speech-to-text (everything stays on-device by design).
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={remoteRef} autoPlay playsInline className="pv-video" data-testid="pv-remote-video" />
        ) : (
          <div className="pv-avatar">
            {call.status === 'live' ? <PersonIcon size={34} /> : <ClockIcon size={30} />}
          </div>
        )}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live peer audio, no caption file exists */}
        <audio ref={remoteAudioRef} autoPlay />
        {call.cameraOn && <video ref={localRef} autoPlay playsInline muted className="pv-self" />}
        <span className="pv-label">
          {call.status !== 'live' ? (
            'Connecting…'
          ) : remoteHasVideo ? (
            theirName ?? 'Friend'
          ) : (
            <>
              <SpeakerIcon size={13} /> {theirName ?? 'Friend'}
            </>
          )}
        </span>
      </div>
    </aside>
  );
}
