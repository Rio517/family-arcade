/**
 * The party's floating video — a small draggable window (like a video-call PiP)
 * that rides over every screen while a call is on. It shows the friend (their
 * video, or a voice avatar if their camera is off) plus a mirrored self-view.
 * Mounted above the router, so it survives moving between games — including two
 * DIFFERENT games at once. Only appears once the call is on (video is opt-in).
 */
import { useEffect, useRef, useState } from 'react';
import { useParty } from './PartyContext';

export function FloatingVideo() {
  const { call, theirName } = useParty();
  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const remoteHasVideo = !!call.remoteStream && call.remoteStream.getVideoTracks().length > 0;

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = call.localStream;
  }, [call.localStream, call.cameraOn]);
  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = call.remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.remoteStream, remoteHasVideo]);

  if (!call.active) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const w = 168, h = 150;
    const x = Math.min(Math.max(8, e.clientX - drag.current.dx), window.innerWidth - w - 8);
    const y = Math.min(Math.max(8, e.clientY - drag.current.dy), window.innerHeight - h - 8);
    setPos({ x, y });
  };
  const onPointerUp = () => {
    drag.current = null;
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
