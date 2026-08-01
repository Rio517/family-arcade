/**
 * The party's floating video — a small draggable window (like a video-call PiP)
 * that rides over every screen while a call is on. It shows the friend (their
 * video, or a voice avatar if their camera is off) plus a mirrored self-view.
 * Mounted above the router, so it survives moving between games — including two
 * DIFFERENT games at once. Only appears once the call is on (video is opt-in).
 */
import { useEffect, useRef, useState } from 'react';
import { useParty } from './PartyContext';

// The floating card's footprint. CARD_W must match the `.pv` width in
// party.css; CARD_H is an approximate height (video + label) and EDGE is the
// gap we keep from the viewport edges when clamping a dragged position.
const CARD_W = 168;
const CARD_H = 150;
const EDGE = 8;

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
  // Where inside the card the pointer grabbed it, so dragging doesn't jump.
  const grab = useRef<{ grabX: number; grabY: number } | null>(null);

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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    grab.current = { grabX: e.clientX - rect.left, grabY: e.clientY - rect.top };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!grab.current) return;
    setPos(clampToViewport(e.clientX - grab.current.grabX, e.clientY - grab.current.grabY));
  };
  const onPointerUp = () => {
    grab.current = null;
  };

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined;

  return (
    <div
      className="pv"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="party-floating-video"
    >
      <div className="pv-remote">
        {call.status === 'live' && remoteHasVideo ? (
          <video ref={remoteRef} autoPlay playsInline className="pv-video" data-testid="pv-remote-video" />
        ) : (
          <div className="pv-avatar">{call.status === 'live' ? '🙂' : '⏳'}</div>
        )}
        <audio ref={remoteAudioRef} autoPlay />
        {call.cameraOn && <video ref={localRef} autoPlay playsInline muted className="pv-self" />}
        <span className="pv-label">
          {call.status === 'live' ? (remoteHasVideo ? theirName ?? 'Friend' : '🔊 ' + (theirName ?? 'Friend')) : 'Connecting…'}
        </span>
      </div>
    </div>
  );
}
