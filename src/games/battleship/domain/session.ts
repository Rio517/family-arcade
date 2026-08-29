/**
 * The P2P game session as a pure state machine.
 *
 * ── Why this module exists ──────────────────────────────────────────────
 * The trickiest, highest-risk logic in the app is the *lifecycle glue*: who
 * authors the opening move, how an incoming fire is resolved and answered, how
 * two peers reconcile after a reconnect, when a game counts as finished. That
 * logic used to live inside the React hook (hard to test) and was *duplicated*
 * by a hand-written test double. This module makes it a single pure function
 * set that both the hook and the tests drive — one implementation, exhaustively
 * testable, no React and no network in sight.
 *
 * Every transition takes a `SessionState` plus an input and returns an
 * `Outcome`: the next state, any messages to send to the peer, and optional
 * one-shot signals (`finished`, `error`). The React adapter's only job is to
 * apply the state, put the outgoing messages on the wire, and react to the
 * signals — it holds no game logic of its own.
 *
 * The single-writer invariant from engine.ts still holds: only the defender
 * mints a shot, and only the host authors the opening `start`, so two peers'
 * logs are always prefix-compatible and reconcile by "longer wins".
 */

import {
  currentTurn,
  hasStarted,
  resolveIncomingFire,
  shotsBy,
  survivingCells,
  winner,
} from './engine';
import { PROTOCOL_VERSION, reconcileLogs, type Message } from './protocol';
import type { Coord, Fleet, GameLog, Side } from './types';

export type SetupPhase = 'fleet' | 'placing' | 'waiting';
export type Phase = SetupPhase | 'battle' | 'over';

export interface SessionState {
  side: Side;
  code: string;
  myName: string;
  mySkinId: string;
  /**
   * The signed-in ticket that sat down at this table (null for a captain with
   * no ticket: a computer captain, or a save from before tickets existed). The
   * session only remembers it — crediting the result is the page's job.
   */
  seatedUserId: string | null;
  oppName: string | null;
  oppSkinId: string | null;
  myFleet: Fleet;
  myReady: boolean;
  oppReady: boolean;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  log: GameLog;
  pendingFire: Coord | null;
  setupPhase: SetupPhase;
  /**
   * Which game of this session we are on. Starts at 0 and increments on every
   * rematch reset. "Longer log wins" reconciliation only applies within one
   * epoch — without this, a peer's stale sync carrying the old finished log
   * would out-length the fresh empty log and resurrect the finished game
   * mid-placement (mirrors the identical fix in chess).
   */
  epoch: number;
}

/** Reported to the profile exactly once, when a game transitions to finished. */
export interface FinishInfo {
  won: boolean;
  survivingCells: number;
  code: string;
  opponent: string;
}

export interface Outcome {
  state: SessionState;
  outgoing: Message[];
  /** Set on the single transition where the game becomes finished. */
  finished?: FinishInfo;
  /** Set when an inbound message must abort play (e.g. version mismatch). */
  error?: string;
}

const none = (state: SessionState): Outcome => ({ state, outgoing: [] });

// ── Construction ─────────────────────────────────────────────────────────

export function createSession(
  side: Side,
  code: string,
  myName: string,
  mySkinId: string,
  seatedUserId: string | null = null,
): SessionState {
  return {
    side,
    code,
    myName,
    mySkinId,
    seatedUserId,
    oppName: null,
    oppSkinId: null,
    myFleet: [],
    myReady: false,
    oppReady: false,
    iWantRematch: false,
    oppWantsRematch: false,
    log: [],
    pendingFire: null,
    setupPhase: 'fleet',
    epoch: 0,
  };
}

// ── Derived views ──────────────────────────────────────────────────────────

export function phase(s: SessionState): Phase {
  if (winner(s.log) !== null) return 'over';
  if (hasStarted(s.log)) return 'battle';
  return s.setupPhase;
}

export function isMyTurn(s: SessionState): boolean {
  return currentTurn(s.log) === s.side && s.pendingFire === null;
}

export function winnerSide(s: SessionState): Side | null {
  return winner(s.log);
}

// ── Setup transitions (local, no messages) ──────────────────────────────────

export function chooseSkin(s: SessionState, skinId: string): SessionState {
  return { ...s, mySkinId: skinId };
}

export function toPlacing(s: SessionState): SessionState {
  return { ...s, setupPhase: 'placing' };
}

export function setFleet(s: SessionState, fleet: Fleet): SessionState {
  return { ...s, myFleet: fleet };
}

// ── Local player actions (produce messages) ──────────────────────────────────

/** My identity announcement — re-sent whenever my name or fleet changes. */
export function helloOf(s: SessionState): Message {
  return { t: 'hello', v: PROTOCOL_VERSION, side: s.side, name: s.myName, skinId: s.mySkinId };
}

/** My current catch-up sync (log + readiness + which game we're on). */
function syncOf(s: SessionState): Message {
  return { t: 'sync', log: s.log, ready: s.myReady, epoch: s.epoch };
}

/** The identity/catch-up handshake to send whenever a channel (re)opens. */
export function connectHandshake(s: SessionState): Message[] {
  return [helloOf(s), syncOf(s)];
}

/** Player confirms placement. Host may author the opening move if both ready. */
export function confirmReady(s: SessionState, rng: () => number = Math.random): Outcome {
  const readied: SessionState = { ...s, myReady: true, setupPhase: 'waiting' };
  const outgoing: Message[] = [{ t: 'ready', ready: true }];
  const started = maybeAuthorStart(readied, rng);
  return { state: started.state, outgoing: [...outgoing, ...started.outgoing] };
}

/** Fire at a cell. No-op (locks nothing) if it isn't a legal shot right now. */
export function fireAt(s: SessionState, target: Coord): Outcome {
  if (!isMyTurn(s)) return none(s);
  const alreadyHit = shotsBy(s.log, s.side).some((e) => e.row === target.row && e.col === target.col);
  if (alreadyHit) return none(s);
  return {
    state: { ...s, pendingFire: target },
    outgoing: [{ t: 'fire', row: target.row, col: target.col }],
  };
}

/** Propose a rematch; restarts locally once both sides have proposed. */
export function proposeRematch(s: SessionState): Outcome {
  const next = maybeRestart({ ...s, iWantRematch: true });
  return { state: next, outgoing: [{ t: 'rematch' }] };
}

// ── Inbound messages ─────────────────────────────────────────────────────────

export function applyMessage(s: SessionState, msg: Message, rng: () => number = Math.random): Outcome {
  switch (msg.t) {
    case 'hello': {
      if (msg.v !== PROTOCOL_VERSION) {
        return { state: s, outgoing: [], error: 'Different app versions — both players refresh the page.' };
      }
      return none({ ...s, oppName: msg.name.slice(0, 24), oppSkinId: msg.skinId });
    }

    case 'ready': {
      const withReady: SessionState = { ...s, oppReady: msg.ready };
      const started = maybeAuthorStart(withReady, rng);
      return started;
    }

    case 'sync': {
      // A missing epoch (older app version on the peer) counts as epoch 0.
      const theirEpoch = msg.epoch ?? 0;
      if (theirEpoch < s.epoch) {
        // Stale sync from before our rematch reset — its old finished log must
        // NOT resurrect the finished game. Ignore it entirely and answer with
        // our own sync so the lagging peer can catch up to the new game.
        return { state: s, outgoing: [syncOf(s)] };
      }
      if (theirEpoch > s.epoch) {
        // The peer is a whole game ahead (we missed the rematch reset). Adopt
        // their epoch and log wholesale, clearing our previous-game state just
        // like maybeRestart does.
        const adopted: SessionState = {
          ...s,
          epoch: theirEpoch,
          myFleet: [],
          myReady: false,
          oppReady: msg.ready,
          iWantRematch: false,
          oppWantsRematch: false,
          log: msg.log,
          pendingFire: null,
          setupPhase: 'placing',
        };
        return none(adopted);
      }
      const merged = reconcileLogs(s.log, msg.log);
      const synced = advanceLog({ ...s, oppReady: msg.ready }, merged);
      // The guest's readiness may reach the host ONLY via this sync — its live
      // `ready` was lost on the drop that forced the reconnect. Re-check start
      // authoring here or the lobby deadlocks in `waiting` forever.
      const started = maybeAuthorStart(synced.state, rng);
      return { state: started.state, outgoing: [...synced.outgoing, ...started.outgoing], finished: synced.finished };
    }

    case 'start': {
      if (hasStarted(s.log)) return none(s);
      return none({ ...s, log: [{ type: 'start', first: msg.first }, ...s.log] });
    }

    case 'fire': {
      // We are the defender: resolve against our own fleet and answer. On a
      // resend (our earlier reply was lost) re-transmit without re-appending.
      const { event, isResend } = resolveIncomingFire(s.log, s.myFleet, s.side, { row: msg.row, col: msg.col });
      const outgoing: Message[] = [{ t: 'shot', event }];
      if (isResend) return { state: s, outgoing };
      const result = advanceLog(s, [...s.log, event]);
      return { ...result, outgoing: [...outgoing, ...result.outgoing] };
    }

    case 'shot': {
      const ev = msg.event;
      // A `shot` is the *result* of MY fire, computed by the defender and sent
      // back authored by me (the attacker). So an honest inbound shot always
      // has `by === s.side`. Reject anything else — otherwise a hostile peer
      // could forge `{ by: <opponent>, allSunk: true }` and hand itself an
      // instant win (`winner()` trusts the event's `by`).
      if (ev.by !== s.side) return none({ ...s, pendingFire: null });
      const already = shotsBy(s.log, ev.by).some((e) => e.row === ev.row && e.col === ev.col);
      if (already) return none({ ...s, pendingFire: null });
      return advanceLog(s, [...s.log, ev]);
    }

    case 'rematch':
      return none(maybeRestart({ ...s, oppWantsRematch: true }));
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Adopt a new log, clearing the fire lock and detecting the one transition
 * where the game becomes finished (so the caller reports it exactly once). The
 * pre-change log for that check is simply `next.log` — callers pass the state
 * whose log is about to be replaced.
 */
function advanceLog(next: SessionState, log: GameLog): Outcome {
  const state: SessionState = { ...next, log, pendingFire: null };
  const finished = detectFinish(next.log, log, state);
  return finished ? { state, outgoing: [], finished } : none(state);
}

/**
 * Release the board lock for an unanswered fire, but only if it's still our
 * turn (the reply never landed). Called by the hook's timeout watchdog — the
 * timing lives in React, the rule lives here.
 */
export function releaseUnansweredFire(s: SessionState): SessionState {
  if (s.pendingFire && currentTurn(s.log) === s.side) return { ...s, pendingFire: null };
  return s;
}

function detectFinish(beforeLog: GameLog, afterLog: GameLog, s: SessionState): FinishInfo | undefined {
  if (winner(beforeLog) !== null) return undefined; // already finished
  const w = winner(afterLog);
  if (w === null) return undefined;
  return {
    won: w === s.side,
    survivingCells: survivingCells(afterLog, s.myFleet, s.side),
    code: s.code,
    opponent: s.oppName ?? 'Opponent',
  };
}

/** Host authors the opening `start` once both players are ready. */
function maybeAuthorStart(s: SessionState, rng: () => number): Outcome {
  if (s.side !== 'host' || !s.myReady || !s.oppReady || hasStarted(s.log)) return none(s);
  const first: Side = rng() < 0.5 ? 'host' : 'guest';
  return {
    state: { ...s, log: [{ type: 'start', first }] },
    outgoing: [{ t: 'start', first }],
  };
}

/**
 * Reset for a rematch once both sides have asked and the game is over. Returns
 * a bare SessionState (not an Outcome) because a restart emits no messages —
 * unlike maybeAuthorStart, which sends the opening `start`. Bumps the epoch so
 * a stale sync of the finished log can't resurrect the old game (see `sync`).
 */
function maybeRestart(s: SessionState): SessionState {
  if (!s.iWantRematch || !s.oppWantsRematch || winner(s.log) === null) return s;
  return {
    ...s,
    myFleet: [],
    myReady: false,
    oppReady: false,
    iWantRematch: false,
    oppWantsRematch: false,
    log: [],
    pendingFire: null,
    setupPhase: 'placing',
    epoch: s.epoch + 1,
  };
}
