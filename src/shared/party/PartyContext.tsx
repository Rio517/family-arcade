/**
 * The Party: a top-level connection + identity + video that outlives any single
 * game (ADR 0008). It lives above the router in `App.tsx`, so walking Home → a
 * game → a different game never tears it down.
 *
 *  • Identity — your ticket's name (read from the profile, never written
 *    here) and the friend you're with.
 *  • Presence — a persistent `GameConnection` on a shared party code that
 *    exchanges names. (Game *rules* still travel on each game's own link.)
 *  • The table — the host says which game it opened and under which code;
 *    the guest may knock on a game it wants. A four-character handoff, and
 *    nothing that replays or rewrites history (ADR 0003).
 *  • Memory — `arcade.party.v1` remembers the party for twelve hours, so a
 *    reload or a PWA close-and-reopen rejoins without a code.
 *  • Video/voice — an opt-in `MediaLink`. Nothing turns the camera or mic on
 *    until you tap it; video is OFF by default, and never auto-resumes.
 *
 * Everything the two devices share is peer-to-peer and ephemeral — no server of
 * ours, nothing recorded (see the privacy page).
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { GameConnection, generateCode, normalizeCode, type ConnStatus } from '@shared/net/peer';
import { MediaLink, type CallStatus, type Role } from '@shared/net/media';
import { useProfile } from '@shared/profile/useProfile';
import { arcadeNow } from '@shared/time/clock';
import type { PartyTableInfo } from './party';
import { clearParty, loadParty, saveParty } from './partyStore';
import { isPartyMsg, type PartyMsg } from './protocol';
import { PartyCtx } from './partyCtx';

/** What the app knows about a game that shared code may not import. */
export interface GameInfo {
  title: string;
  path: string;
}

export interface PartyValue {
  /** Your signed-in ticket's name — the party never asks for one. */
  myName: string;

  status: ConnStatus;
  code: string;
  role: Role | null;
  /** The presence channel is open — you and your friend are linked. */
  inParty: boolean;
  theirName: string | null;
  /** A remembered party is being rejoined and isn't connected yet. */
  reconnecting: boolean;

  /** The game table open on this party (host: what you opened; guest: what you were told). */
  table: PartyTableInfo | null;
  /** Host: the game the guest is standing at the door of. */
  knock: string | null;

  hostParty: (code?: string) => string;
  joinParty: (code: string) => void;
  leaveParty: () => void;
  /** After an error: try the same code again in the same role. */
  retry: () => void;

  /** Host only: open a game's table under a fresh code and tell the friend. Returns the code. */
  openTable: (game: string, hostSide?: string) => string;
  closeTable: () => void;
  /** Guest: ask the host to open a game. */
  knockOn: (game: string) => void;
  clearKnock: () => void;

  /** The app resolves a game id to a title and route; shared code stays game-blind. */
  resolveGame: (id: string) => GameInfo | null;

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

export function useParty(): PartyValue {
  const v = useContext(PartyCtx);
  if (!v) throw new Error('useParty must be used inside <PartyProvider>');
  return v;
}

const noGame = (): GameInfo | null => null;

export function PartyProvider({
  children,
  resolveGame = noGame,
}: {
  children: React.ReactNode;
  resolveGame?: (id: string) => GameInfo | null;
}) {
  const profile = useProfile();
  const myName = profile.profile.name || 'Player';

  // A remembered party (arcade.party.v1, twelve hours) seeds the initial
  // state; the boot effect below only dials it.
  const [remembered] = useState(() => loadParty(arcadeNow()));
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [theirName, setTheirName] = useState<string | null>(null);
  const [table, setTable] = useState<PartyTableInfo | null>(remembered?.table ?? null);
  const [knock, setKnock] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(remembered !== null);
  // Derived, not stored — it can never disagree with the status (the same
  // pattern callActive uses below).
  const inParty = status === 'connected';

  const connRef = useRef<GameConnection<PartyMsg> | null>(null);
  const nameRef = useRef(myName);
  nameRef.current = myName;
  // The name last said on the wire, so a fresh channel's hello and the
  // rename effect below never introduce the same name twice.
  const announcedRef = useRef<string | null>(null);
  // Mirrors of code/role/table for the link handlers and the persistence
  // writes, which must not read stale render closures.
  const codeRef = useRef('');
  const roleRef = useRef<Role | null>(null);
  const tableRef = useRef<PartyTableInfo | null>(remembered?.table ?? null);

  /** Write the party to storage as it stands right now. */
  const remember = useCallback(() => {
    if (!codeRef.current || !roleRef.current) return;
    saveParty({ code: codeRef.current, role: roleRef.current, at: arcadeNow(), table: tableRef.current });
  }, []);

  const setTableState = useCallback((t: PartyTableInfo | null) => {
    tableRef.current = t;
    setTable(t);
  }, []);

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
          if (s === 'connected') {
            setReconnecting(false);
            remember();
          }
        },
        onOpen: () => {
          const conn = connRef.current;
          if (!conn) return;
          conn.send({ t: 'hello', name: nameRef.current });
          announcedRef.current = nameRef.current;
          // A fresh channel (a reconnect, or the friend's reload) re-hears
          // the open table — the host's reload must never strand the guest.
          if (roleRef.current === 'host' && tableRef.current) conn.send({ t: 'table', ...tableRef.current });
        },
        onMessage: (msg) => {
          switch (msg.t) {
            case 'hello':
              setTheirName(msg.name.slice(0, 24) || 'Friend');
              break;
            case 'table':
              setTableState(
                msg.hostSide ? { game: msg.game, code: msg.code, hostSide: msg.hostSide } : { game: msg.game, code: msg.code },
              );
              remember();
              break;
            case 'table-closed':
              setTableState(null);
              remember();
              break;
            case 'knock':
              setKnock(msg.game);
              break;
          }
        },
      },
      { prefix: 'party-v1-', isMessage: isPartyMsg, dialTimeoutMs: 120_000 },
    );
  }, [remember, setTableState]);

  const stopCall = useCallback(() => {
    linkRef.current?.destroy();
    linkRef.current = null;
    setCallStatus('idle');
    setMuted(false);
    setCameraOn(false);
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  /** Host or dial a code. Every party starts with no call carried over (ADR 0007). */
  const start = useCallback(
    (as: Role, c: string) => {
      stopCall();
      setCode(c);
      setRole(as);
      codeRef.current = c;
      roleRef.current = as;
      connRef.current?.destroy();
      connRef.current = buildConn();
      if (as === 'host') connRef.current.host(c);
      else connRef.current.join(c);
      remember();
    },
    [buildConn, remember, stopCall],
  );

  const hostParty = useCallback(
    (code?: string): string => {
      const c = code ?? generateCode();
      start('host', c);
      return c;
    },
    [start],
  );

  const joinParty = useCallback((raw: string) => start('guest', normalizeCode(raw)), [start]);

  const retry = useCallback(() => {
    if (codeRef.current && roleRef.current) start(roleRef.current, codeRef.current);
  }, [start]);

  const leaveParty = useCallback(() => {
    stopCall();
    connRef.current?.destroy();
    connRef.current = null;
    codeRef.current = '';
    roleRef.current = null;
    setStatus('idle');
    setRole(null);
    setTheirName(null);
    setCode('');
    setTableState(null);
    setKnock(null);
    setReconnecting(false);
    clearParty();
  }, [setTableState, stopCall]);

  const openTable = useCallback(
    (game: string, hostSide?: string): string => {
      // A fresh code per table, so a rematch never collides with a saved session.
      const c = generateCode();
      const t: PartyTableInfo = hostSide ? { game, code: c, hostSide } : { game, code: c };
      setTableState(t);
      connRef.current?.send({ t: 'table', ...t });
      remember();
      return c;
    },
    [remember, setTableState],
  );

  const closeTable = useCallback(() => {
    setTableState(null);
    connRef.current?.send({ t: 'table-closed' });
    remember();
  }, [remember, setTableState]);

  const knockOn = useCallback((game: string) => {
    connRef.current?.send({ t: 'knock', game });
  }, []);
  const clearKnock = useCallback(() => setKnock(null), []);

  // A remembered party rejoins on load — through the same host/join path, so
  // the call stays opt-in and the table (seeded above) re-announces on open.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current || !remembered) return;
    bootedRef.current = true;
    start(remembered.role, remembered.code);
  }, [remembered, start]);

  // Keep my name fresh on the wire if the ticket changes mid-party.
  useEffect(() => {
    if (!inParty || announcedRef.current === myName) return;
    connRef.current?.send({ t: 'hello', name: myName });
    announcedRef.current = myName;
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
    status,
    code,
    role,
    inParty,
    theirName,
    reconnecting,
    table,
    knock,
    hostParty,
    joinParty,
    leaveParty,
    retry,
    openTable,
    closeTable,
    knockOn,
    clearKnock,
    resolveGame,
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

  return <PartyCtx.Provider value={value}>{children}</PartyCtx.Provider>;
}
