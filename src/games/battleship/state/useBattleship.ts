/**
 * useBattleship — the React adapter over the pure session state machine.
 *
 * All game rules and lifecycle logic live in game/session.ts (which in turn
 * builds on engine.ts/protocol.ts). This hook holds no rules of its own; it
 * just:
 *   • owns the P2P connection and the current SessionState,
 *   • turns UI actions and inbound messages into session transitions,
 *   • applies each transition's result — new state, outgoing messages, and the
 *     one-shot `finished`/`error` signals,
 *   • persists after every change (which is what powers resume).
 *
 * Because the session module is pure and fully tested (including a real
 * two-peer game through a disconnect), the risky glue is verified without a
 * live network, and the previous run-once latch refs are gone: "author the
 * start" and "report the finish once" are now properties of the transitions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameConnection, type ConnStatus } from '@shared/net/peer';
import { isMessage, type Message } from '@games/battleship/domain/protocol';
import { LoopbackConnection } from './loopback';
import * as Session from '@games/battleship/domain/session';
import type { FinishInfo, Outcome, Phase as GamePhase, SessionState } from '@games/battleship/domain/session';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionToStored,
  storedToSession,
  type GameSession,
} from '@games/battleship/storage/sessionStore';
import type { Coord, Fleet, GameLog, Side } from '@games/battleship/domain/types';

/** How long to wait for a fire to be answered before releasing the board lock. */
const FIRE_TIMEOUT_MS = 8000;

export type Phase = 'lobby' | GamePhase;

export interface UseBattleshipResult {
  phase: Phase;
  side: Side | null;
  code: string;
  status: ConnStatus;
  statusDetail: string | undefined;
  myName: string;
  mySkinId: string;
  /** The ticket that sat down at this table (null: no ticket, or the lobby). */
  seatedUserId: string | null;
  myFleet: Fleet;
  myReady: boolean;
  oppName: string | null;
  oppSkinId: string | null;
  oppReady: boolean;
  oppConnected: boolean;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  log: GameLog;
  myTurn: boolean;
  pendingFire: Coord | null;
  winnerSide: Side | null;
  // actions
  /**
   * Sit down at an online table: host it under `code` or join it by `code`.
   * The page owns the code (it comes from the party's table, a shared link, or
   * a fresh draw) and says which ticket is sitting down; the captain's name
   * is always the hook's `name` option — the ticket, never a lobby field.
   */
  startTable: (opts: { role: 'host' | 'guest'; code: string; seatedUserId: string | null }) => void;
  /** Start a game against a computer captain (ADR 0009). */
  startSoloGame: (personaId: string) => void;
  resumeGame: (code: string) => void;
  chooseSkin: (skinId: string) => void;
  confirmSkin: () => void;
  setFleet: (fleet: Fleet) => void;
  confirmReady: () => void;
  fire: (coord: Coord) => void;
  requestRematch: () => void;
  leave: () => void;
}

interface UseBattleshipOptions {
  name: string;
  skinId: string;
  onFinish: (info: FinishInfo) => void;
}

export function useBattleship(opts: UseBattleshipOptions): UseBattleshipResult {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>(undefined);

  // Both the real network connection and the computer captain's loopback
  // implement the same four-method surface; the hook never tells them apart.
  const connRef = useRef<GameConnection<Message> | LoopbackConnection | null>(null);
  // Set only for solo games: the loopback plus its persona, for persistence.
  const soloRef = useRef<{ conn: LoopbackConnection; personaId: string } | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  // Keep refs current so connection callbacks and chained actions see the
  // freshest state/identity/onFinish without stale closures.
  const onFinishRef = useRef(opts.onFinish);
  onFinishRef.current = opts.onFinish;
  const identityRef = useRef({ name: opts.name, skinId: opts.skinId });
  identityRef.current = { name: opts.name, skinId: opts.skinId };

  const setSessionState = useCallback((s: SessionState) => {
    sessionRef.current = s;
    setSession(s);
  }, []);

  // Apply a session transition: commit the state, send its messages, and act on
  // the one-shot signals. This is the single place effects leave the pure core.
  const applyOutcome = useCallback((o: Outcome) => {
    setSessionState(o.state);
    for (const msg of o.outgoing) connRef.current?.send(msg);
    if (o.error) {
      setStatus('error');
      setStatusDetail(o.error);
    }
    if (o.finished) onFinishRef.current(o.finished);
  }, [setSessionState]);

  const makeHandlers = useCallback(
    () => ({
      onStatus: (s: ConnStatus, detail?: string) => {
        setStatus(s);
        setStatusDetail(detail);
      },
      onOpen: () => {
        const s = sessionRef.current;
        if (s) for (const msg of Session.connectHandshake(s)) connRef.current?.send(msg);
      },
      onMessage: (msg: Message) => {
        const s = sessionRef.current;
        if (!s) return;
        try {
          applyOutcome(Session.applyMessage(s, msg));
        } catch (err) {
          // Drop, don't die: a peer message must never crash the app.
          console.error('Rejected peer message', err);
        }
      },
    }),
    [applyOutcome],
  );

  const ensureConn = useCallback((): GameConnection<Message> | LoopbackConnection => {
    if (connRef.current) return connRef.current;
    connRef.current = new GameConnection<Message>(makeHandlers(), { prefix: 'bship-v1-', isMessage });
    return connRef.current;
  }, [makeHandlers]);

  const makeLoopback = useCallback(
    (personaId: string, resume?: ConstructorParameters<typeof LoopbackConnection>[1]['resume']) => {
      connRef.current?.destroy();
      const conn = new LoopbackConnection(makeHandlers(), { personaId, resume });
      connRef.current = conn;
      soloRef.current = { conn, personaId };
      return conn;
    },
    [makeHandlers],
  );

  // ── Persist after every change (powers resume) ──────────────────────────
  useEffect(() => {
    if (!session) return;
    const stored = sessionToStored(session, Date.now());
    const solo = soloRef.current;
    const snap = solo?.conn.snapshot();
    if (solo && snap) {
      stored.solo = { personaId: solo.personaId, botFleet: snap.fleet, botReady: snap.myReady };
    }
    saveSession(stored);
  }, [session]);

  // ── Fire watchdog: release the board lock if a fire goes unanswered and it's
  //    still our turn, so the player can retry. ─────────────────────────────
  const pendingFire = session?.pendingFire ?? null;
  useEffect(() => {
    if (!pendingFire) return;
    const timer = setTimeout(() => {
      const s = sessionRef.current;
      if (s) setSessionState(Session.releaseUnansweredFire(s));
    }, FIRE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingFire, setSessionState]);

  // ── Tear down the connection on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      connRef.current?.destroy();
      connRef.current = null;
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────
  // Sit back down in a saved online game and dial its table again from the
  // saved side; the log reconciliation on reconnect brings both peers level.
  const restoreOnline = useCallback((stored: GameSession) => {
    const conn = ensureConn();
    setSessionState(storedToSession(stored));
    if (stored.side === 'host') conn.host(stored.code);
    else conn.join(stored.code);
  }, [ensureConn, setSessionState]);

  const startTable = useCallback(
    ({ role, code, seatedUserId }: { role: 'host' | 'guest'; code: string; seatedUserId: string | null }) => {
      // A save under this code, on this side of the table, IS this game: a
      // guest reloading mid-battle, whom the party seats again at once. Pick
      // it back up rather than open a fresh session — the persist pass would
      // write that fresh, empty fleet over the save, and every host shot
      // would miss from then on. A solo save or a finished one is not this
      // table; those start fresh.
      const stored = loadSession(code);
      if (stored && !stored.solo && !stored.finished && stored.side === role) {
        restoreOnline(stored);
        return;
      }
      const conn = ensureConn();
      const { name, skinId } = identityRef.current;
      setSessionState(Session.createSession(role, code, name, skinId, seatedUserId));
      if (role === 'host') conn.host(code);
      else conn.join(code);
    },
    [ensureConn, restoreOnline, setSessionState],
  );

  const startSoloGame = useCallback((personaId: string) => {
    const conn = makeLoopback(personaId);
    const { name, skinId } = identityRef.current;
    setSessionState(Session.createSession('host', 'SOLO', name, skinId));
    conn.host('SOLO');
  }, [makeLoopback, setSessionState]);

  const resumeGame = useCallback((code: string) => {
    const stored = loadSession(code);
    if (!stored) return;
    const restored = storedToSession(stored);
    if (stored.solo) {
      // A computer game: rebuild the captain from the saved extras — the log
      // is shared, so both sides resume in perfect sync, no network involved.
      const conn = makeLoopback(stored.solo.personaId, {
        fleet: stored.solo.botFleet,
        log: restored.log,
        myReady: stored.solo.botReady,
      });
      setSessionState(restored);
      conn.host(stored.code);
      return;
    }
    restoreOnline(stored);
  }, [makeLoopback, restoreOnline, setSessionState]);

  // Transitions that only mutate local state need the latest session via ref.
  const withSession = useCallback((fn: (s: SessionState) => SessionState) => {
    const s = sessionRef.current;
    if (s) setSessionState(fn(s));
  }, [setSessionState]);
  const withOutcome = useCallback((fn: (s: SessionState) => Outcome) => {
    const s = sessionRef.current;
    if (s) applyOutcome(fn(s));
  }, [applyOutcome]);

  // Broadcast my current identity (name + fleet) so a connected opponent sees
  // edits made on the setup page, not just the values from the first handshake.
  const announceIdentity = useCallback(() => {
    const s = sessionRef.current;
    if (s) connRef.current?.send(Session.helloOf(s));
  }, []);
  const chooseSkin = useCallback((skinId: string) => {
    withSession((s) => Session.chooseSkin(s, skinId));
    announceIdentity();
  }, [withSession, announceIdentity]);
  const confirmSkin = useCallback(() => withSession(Session.toPlacing), [withSession]);
  const setFleet = useCallback((fleet: Fleet) => withSession((s) => Session.setFleet(s, fleet)), [withSession]);
  const confirmReady = useCallback(() => withOutcome((s) => Session.confirmReady(s)), [withOutcome]);
  const requestRematch = useCallback(() => withOutcome(Session.proposeRematch), [withOutcome]);

  // Fire is special-cased: lock the board only if the fire actually went out.
  // On a dead channel we leave it unlocked so the player can retry the moment
  // the link recovers, instead of waiting out the watchdog.
  const fire = useCallback((coord: Coord) => {
    const s = sessionRef.current;
    if (!s) return;
    const { state, outgoing } = Session.fireAt(s, coord);
    if (outgoing.length === 0) return; // illegal shot right now — no-op
    const sent = outgoing.every((m) => connRef.current?.send(m) === true);
    if (sent) setSessionState(state);
  }, [setSessionState]);

  // Leave the table for good: the save goes, the link goes, and the captain
  // is back in the lobby with a clean status — so a party guest hanging up a
  // dead dial is standing at the door again, not stranded on a fleet screen.
  const leave = useCallback(() => {
    const s = sessionRef.current;
    if (s?.code) clearSession(s.code);
    connRef.current?.destroy();
    connRef.current = null;
    soloRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setStatus('idle');
    setStatusDetail(undefined);
  }, []);

  // ── Derived view ─────────────────────────────────────────────────────────
  const s = session;
  return {
    phase: s ? Session.phase(s) : 'lobby',
    side: s?.side ?? null,
    code: s?.code ?? '',
    status,
    statusDetail,
    myName: s?.myName ?? opts.name,
    mySkinId: s?.mySkinId ?? opts.skinId,
    seatedUserId: s?.seatedUserId ?? null,
    myFleet: s?.myFleet ?? [],
    myReady: s?.myReady ?? false,
    oppName: s?.oppName ?? null,
    oppSkinId: s?.oppSkinId ?? null,
    oppReady: s?.oppReady ?? false,
    oppConnected: status === 'connected',
    iWantRematch: s?.iWantRematch ?? false,
    oppWantsRematch: s?.oppWantsRematch ?? false,
    log: s?.log ?? [],
    myTurn: s ? Session.isMyTurn(s) : false,
    pendingFire: s?.pendingFire ?? null,
    winnerSide: s ? Session.winnerSide(s) : null,
    startTable,
    startSoloGame,
    resumeGame,
    chooseSkin,
    confirmSkin,
    setFleet,
    confirmReady,
    fire,
    requestRematch,
    leave,
  };
}
