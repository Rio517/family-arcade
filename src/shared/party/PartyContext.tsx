/**
 * The Party: a top-level connection + identity + video that outlives any single
 * game (see docs/adr — the "party" idea). It lives above the router in
 * `main.tsx`, so walking Home → a game → a different game never tears it down.
 *
 *  • Identity — your name (shared with the profile) and the friend you're with.
 *  • Presence — a persistent `GameConnection` on a shared party code that
 *    exchanges names. (Game *rules* still travel on each game's own link.)
 *  • Video/voice — an opt-in `MediaLink`. Nothing turns the camera or mic on
 *    until you tap it; video is OFF by default.
 *
 * Everything the two devices share is peer-to-peer and ephemeral — no server of
 * ours, nothing recorded (see the privacy page).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { GameConnection, generateCode, normalizeCode, type ConnStatus } from '@shared/net/peer';
import { MediaLink, type CallStatus, type Role } from '@shared/net/media';
import { useProfile } from '@shared/profile/useProfile';
import { rememberName } from '@shared/profile/recentNames';
import { isPartyMsg, type PartyMsg } from './protocol';

export interface PartyValue {
  myName: string;
  setMyName: (name: string) => void;

  status: ConnStatus;
  code: string;
  role: Role | null;
  /** The presence channel is open — you and your friend are linked. */
  inParty: boolean;
  theirName: string | null;

  hostParty: () => string;
  joinParty: (code: string) => void;
  leaveParty: () => void;

  call: {
    /** The mic/camera have been turned on (opt-in). */
    active: boolean;
    status: CallStatus;
    muted: boolean;
    cameraOn: boolean;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    start: () => void;
    stop: () => void;
    toggleMute: () => void;
    toggleCamera: () => void;
  };
}

const Ctx = createContext<PartyValue | null>(null);

export function useParty(): PartyValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useParty must be used inside <PartyProvider>');
  return v;
}

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const myName = profile.profile.name || 'Player';

  const [status, setStatus] = useState<ConnStatus>('idle');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [theirName, setTheirName] = useState<string | null>(null);
  // Derived, not stored — it can never disagree with the status (the same
  // pattern callActive uses below).
  const inParty = status === 'connected';

  const connRef = useRef<GameConnection<PartyMsg> | null>(null);
  const nameRef = useRef(myName);
  nameRef.current = myName;

  // ---- call (video/voice) state, driven by the MediaLink ----
  const linkRef = useRef<MediaLink | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // The mic/camera are on whenever the call is anything but idle — no separate
  // flag to keep in sync with the status.
  const callActive = callStatus !== 'idle';

  const buildConn = useCallback((): GameConnection<PartyMsg> => {
    return new GameConnection<PartyMsg>(
      {
        onStatus: (s) => {
          setStatus(s);
        },
        onOpen: () => {
          connRef.current?.send({ t: 'hello', name: nameRef.current });
        },
        onMessage: (msg) => {
          if (msg.t === 'hello') {
            const n = msg.name.slice(0, 24) || 'Friend';
            setTheirName(n);
            rememberName(n); // a returning guest becomes a one-tap chip
          }
        },
      },
      { prefix: 'party-v1-', isMessage: isPartyMsg },
    );
  }, []);

  const stopCall = useCallback(() => {
    linkRef.current?.destroy();
    linkRef.current = null;
    setCallStatus('idle');
    setMuted(false);
    setCameraOn(false);
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const hostParty = useCallback((): string => {
    stopCall(); // a fresh party starts with no call carried over
    const c = generateCode();
    setCode(c);
    setRole('host');
    connRef.current?.destroy();
    connRef.current = buildConn();
    connRef.current.host(c);
    return c;
  }, [buildConn, stopCall]);

  const joinParty = useCallback(
    (raw: string) => {
      stopCall(); // a fresh party starts with no call carried over
      const c = normalizeCode(raw);
      setCode(c);
      setRole('guest');
      connRef.current?.destroy();
      connRef.current = buildConn();
      connRef.current.join(c);
    },
    [buildConn, stopCall],
  );

  const leaveParty = useCallback(() => {
    stopCall();
    connRef.current?.destroy();
    connRef.current = null;
    setStatus('idle');
    setRole(null);
    setTheirName(null);
    setCode('');
  }, [stopCall]);

  // Keep my name fresh on the wire if I rename mid-party.
  useEffect(() => {
    if (inParty) connRef.current?.send({ t: 'hello', name: myName });
  }, [myName, inParty]);

  const startCall = useCallback(() => {
    if (linkRef.current || !code || !role) return;
    const link = new MediaLink(
      {
        onStatus: (s) => {
          setCallStatus(s);
          // 'denied'/'error' here is the *initial* mic request failing — tear
          // down. A later camera-permission refusal keeps the voice call alive
          // (MediaLink reports that without a fatal status; see setCamera).
          if (s === 'denied' || s === 'error') stopCall();
        },
        onLocalStream: setLocalStream,
        onRemoteStream: setRemoteStream,
      },
      'party-call-v1-',
    );
    linkRef.current = link;
    void link.start(code, role, false); // voice first; camera stays OFF
  }, [code, role, stopCall]);

  const toggleMute = useCallback(() => setMuted(linkRef.current?.toggleMute() ?? false), []);

  const toggleCamera = useCallback(async () => {
    const link = linkRef.current;
    if (!link) return;
    await link.setCamera(!link.isCameraOn);
    setCameraOn(link.isCameraOn);
  }, []);

  // Clean up if the whole app unmounts.
  useEffect(
    () => () => {
      linkRef.current?.destroy();
      connRef.current?.destroy();
    },
    [],
  );

  const value: PartyValue = {
    myName,
    setMyName: profile.setName,
    status,
    code,
    role,
    inParty,
    theirName,
    hostParty,
    joinParty,
    leaveParty,
    call: {
      active: callActive,
      status: callStatus,
      muted,
      cameraOn,
      localStream,
      remoteStream,
      start: startCall,
      stop: stopCall,
      toggleMute,
      toggleCamera,
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
