/**
 * A small floating voice/video call widget for the two-player games.
 *
 * Voice-first: tapping "Talk" asks for the mic and opens a peer-to-peer call
 * over the same game code (see `MediaLink` / ADR 0007). The camera is opt-in —
 * off until the player taps it, so the camera permission is only requested then.
 * Nothing is recorded; it's ephemeral peer-to-peer. If permission is denied or
 * the link can't form, the game just plays on with no call.
 */
import { useEffect, useRef, useState } from 'react';
import { MediaLink, type CallStatus, type Role } from '@shared/net/media';
import './call.css';

export function CallBubble({ code, role, prefix }: { code: string; role: Role; prefix?: string }) {
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [detail, setDetail] = useState<string>();
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const linkRef = useRef<MediaLink | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => linkRef.current?.destroy(), []);

  const remoteHasVideo = !!remoteStream && remoteStream.getVideoTracks().length > 0;

  // Bind streams to the media elements (state, not raw refs, to avoid timing races).
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, cameraOn]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, remoteHasVideo]);

  const startCall = async () => {
    setStarted(true);
    const link = new MediaLink(
      {
        onStatus: (s, d) => {
          setStatus(s);
          setDetail(d);
        },
        onLocalStream: setLocalStream,
        onRemoteStream: setRemoteStream,
      },
      prefix,
    );
    linkRef.current = link;
    await link.start(code, role, false); // voice first
  };

  const endCall = () => {
    linkRef.current?.destroy();
    linkRef.current = null;
    setStarted(false);
    setStatus('idle');
    setDetail(undefined);
    setMuted(false);
    setCameraOn(false);
    setLocalStream(null);
    setRemoteStream(null);
  };

  const toggleMute = () => setMuted(linkRef.current?.toggleMute() ?? false);

  const toggleCamera = async () => {
    const on = !cameraOn;
    setCameraOn(on);
    await linkRef.current?.setCamera(on);
    // Reflect what actually happened (permission could have been denied).
    setCameraOn(linkRef.current?.isCameraOn ?? false);
  };

  if (!started) {
    return (
      <button className="call-fab" onClick={startCall} data-testid="call-start">
        <span aria-hidden="true">🎤</span> Talk
      </button>
    );
  }

  if (status === 'denied' || status === 'error') {
    return (
      <div className="call-bubble call-error" data-testid="call-bubble">
        <p>{detail ?? 'Couldn’t start the call.'}</p>
        <div className="call-controls">
          <button className="call-btn end" onClick={endCall} data-testid="call-end" aria-label="Close">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-bubble" data-testid="call-bubble">
      <div className="call-remote">
        {status === 'live' && remoteHasVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="call-video" data-testid="call-remote-video" />
        ) : (
          <div className="call-avatar" data-testid="call-avatar">
            {status === 'live' ? '🙂' : '⏳'}
          </div>
        )}
        <audio ref={remoteAudioRef} autoPlay />
        {cameraOn && (
          <video ref={localVideoRef} autoPlay playsInline muted className="call-self" data-testid="call-self-video" />
        )}
        <span className="call-status">
          {status === 'live' ? (remoteHasVideo ? 'Live' : '🔊 Voice') : status === 'requesting' ? 'Allow mic…' : 'Connecting…'}
        </span>
      </div>
      <div className="call-controls">
        <button
          className={`call-btn ${muted ? 'active' : ''}`}
          onClick={toggleMute}
          data-testid="call-mute"
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {muted ? '🔇' : '🎤'}
        </button>
        <button
          className={`call-btn ${cameraOn ? 'active' : ''}`}
          onClick={toggleCamera}
          data-testid="call-camera"
          aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          📷
        </button>
        <button className="call-btn end" onClick={endCall} data-testid="call-end" aria-label="End call">
          ✕
        </button>
      </div>
    </div>
  );
}
