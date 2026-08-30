/**
 * Chess session — a pure state machine over the shared move log.
 *
 * One model serves both modes:
 *  - **local** (same device / hotseat): no network, no side restriction —
 *    whoever's turn it is may move. `side`/`myColor` are null.
 *  - **online** (two devices, one code): the host picks a colour (White unless
 *    they say otherwise) and the guest takes the other one. You may only move
 *    your own colour on your own turn; each move is appended
 *    to the log *and* emitted as a `move` message. Peers resync via the same
 *    "longer log wins" reconciliation Ship Battle uses.
 *
 * Every transition returns an `Outcome` = { next state, messages to send,
 * optional one-shot `finished` }. The React adapter just commits the state and
 * puts `outgoing` on the wire — no rules or I/O live here.
 */

import { isGameOver, replay, resolvePly, status, winnerOf } from './rules';
import {
  CHESS_PROTOCOL_VERSION,
  reconcileLogs,
  type ChessMessage,
} from './protocol';
import type { Color, GameLog, GameState, Ply, Side, Status } from './types';

export type Mode = 'local' | 'online';
export type Phase = 'play' | 'over';

export interface SessionState {
  mode: Mode;
  /** Online: which side of the connection I am. Local: null. */
  side: Side | null;
  /** Online: the colour I control (the host's pick; the guest gets the other). Local: null. */
  myColor: Color | null;
  /** Online game code; empty in local mode. */
  code: string;
  myName: string;
  oppName: string;
  /**
   * The ticket that sat down at this device for the game (online only; the
   * React adapter fills it in). Results credit this ticket, not whoever is
   * signed in when the game ends. Local (hotseat) sessions: null.
   */
  seatedUserId: string | null;
  /**
   * Same-device (hotseat) only: the tickets in the two chairs, captured when
   * the game starts — null for a bot or an empty chair. Online sessions carry
   * null here; the one ticket at this device is `seatedUserId`.
   */
  whiteUserId: string | null;
  blackUserId: string | null;
  log: GameLog;
  /**
   * Optional custom starting position (a free-play setup promoted into a
   * real game). Local mode only — online games always open from the
   * standard position, so log reconciliation stays sound.
   */
  start?: GameState;
  /**
   * Game epoch: how many rematch resets this session has been through. A
   * peer's `sync` carries its epoch; a sync from an OLDER epoch is stale
   * (its finished log must never "un-win" a rematch both sides agreed to),
   * while a NEWER epoch is adopted wholesale — log and all. Syncs from
   * pre-epoch builds count as epoch 0.
   */
  epoch: number;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
}

export interface FinishInfo {
  status: Status;
  /** The winning colour, or null for a draw. */
  winner: Color | null;
  /** Online only: did *I* win? null in local mode or on a draw. */
  iWon: boolean | null;
  /** The game code ('' in local mode) — the profile history keys games by it. */
  code: string;
  /** The opponent's hello name ('' if it never arrived). */
  opponent: string;
  /**
   * Who to credit — captured when the game started, so the page never has to
   * read the roster at finish time (a sign-in switch mid-game must not move
   * the result). Online: the ticket at this device, chairs null. Same device:
   * the two chairs' tickets (null for a bot or an empty chair), seat null.
   */
  seatedUserId: string | null;
  whiteUserId: string | null;
  blackUserId: string | null;
  /** The names at the board by colour, as they were when the game started. */
  whiteName: string;
  blackName: string;
}

export interface Outcome {
  state: SessionState;
  outgoing: ChessMessage[];
  /** Set only by the transition that ends the game — never again for a board already over. */
  finished?: FinishInfo;
  error?: string;
}

const DEFAULT_HOST_COLOR: Color = 'w';

function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/** The colour `side` plays when the host holds `hostSide`. */
function colorForSide(side: Side, hostSide: Color): Color {
  return side === 'host' ? hostSide : opposite(hostSide);
}

/** A chair at a same-device table: the name to show, and the ticket to credit (null for a bot or nobody). */
export interface LocalPlayer {
  name: string;
  userId: string | null;
}

export function createLocalSession(white: LocalPlayer, black: LocalPlayer, start?: GameState): SessionState {
  return {
    mode: 'local',
    side: null,
    myColor: null,
    code: '',
    myName: white.name,
    oppName: black.name,
    seatedUserId: null,
    whiteUserId: white.userId,
    blackUserId: black.userId,
    log: [],
    start,
    epoch: 0,
    iWantRematch: false,
    oppWantsRematch: false,
  };
}

/**
 * A fresh online session. `hostSide` is the colour the host chose (both peers
 * must agree on it — the party hands it across); the guest gets the other.
 */
export function createOnlineSession(
  side: Side,
  code: string,
  myName: string,
  hostSide: Color = DEFAULT_HOST_COLOR,
): SessionState {
  return {
    mode: 'online',
    side,
    myColor: colorForSide(side, hostSide),
    code,
    myName,
    oppName: '',
    seatedUserId: null,
    whiteUserId: null,
    blackUserId: null,
    log: [],
    epoch: 0,
    iWantRematch: false,
    oppWantsRematch: false,
  };
}

// ── Derived views (pure functions of the log) ──────────────────────────────

/**
 * replay() walks the whole log doing full legal-move generation per ply, and
 * the derived views below (phase, turnColor, canIMove, …) each need the
 * current board — unmemoized, one render of an 80-ply game paid for ~5 full
 * replays (~100 ms on an iPad). Transitions always build a fresh log array,
 * so array identity is a sound cache key, and the stable GameState identity
 * also stops downstream [board] effects from re-firing on unrelated renders.
 */
const boardCache = new WeakMap<GameLog, { start: GameState | undefined; board: GameState }>();

export function boardState(s: SessionState): GameState {
  const hit = boardCache.get(s.log);
  if (hit && hit.start === s.start) return hit.board;
  const board = replay(s.log, s.start);
  boardCache.set(s.log, { start: s.start, board });
  return board;
}

function currentStatus(s: SessionState): Status {
  return status(boardState(s));
}

export function phase(s: SessionState): Phase {
  return isGameOver(currentStatus(s)) ? 'over' : 'play';
}

/** Whose turn it is (the colour to move). */
export function turnColor(s: SessionState): Color {
  return boardState(s).turn;
}

/**
 * May the local player move right now? In local mode, always (for whichever
 * colour is to move). Online, only when it's my colour's turn and the game is
 * still going.
 */
export function canIMove(s: SessionState): boolean {
  if (phase(s) === 'over') return false;
  if (s.mode === 'local') return true;
  return turnColor(s) === s.myColor;
}

function finishInfo(s: SessionState): FinishInfo | undefined {
  const st = currentStatus(s);
  if (!isGameOver(st)) return undefined;
  const winner = winnerOf(boardState(s));
  const iWon = s.mode === 'online' && winner !== null ? winner === s.myColor : null;
  // Local: I am White (chair one) and the opponent is Black. Online: the
  // names follow the colour I was dealt.
  const iAmBlack = s.myColor === 'b';
  return {
    status: st,
    winner,
    iWon,
    code: s.code,
    opponent: s.oppName,
    seatedUserId: s.seatedUserId,
    whiteUserId: s.whiteUserId,
    blackUserId: s.blackUserId,
    whiteName: iAmBlack ? s.oppName : s.myName,
    blackName: iAmBlack ? s.myName : s.oppName,
  };
}

/**
 * The finish a transition *produced*: reported on the play→over edge and
 * never again for a board that was already over. A reopened link replays
 * connectHandshake both ways, so the same finished log comes straight back
 * as a `sync`; a second FinishInfo for it would credit the mate twice
 * (Ship Battle's detectFinish draws the same line). `after` is replayed even
 * when `before` was over — the sync reducers lean on that replay to refuse
 * an illegal log.
 */
function finishedBy(before: SessionState, after: SessionState): FinishInfo | undefined {
  const info = finishInfo(after);
  return phase(before) === 'over' ? undefined : info;
}

// ── Transitions ────────────────────────────────────────────────────────────

/** Messages to (re)send whenever a data channel opens. */
export function connectHandshake(s: SessionState): ChessMessage[] {
  if (s.mode !== 'online' || !s.side) return [];
  return [
    { t: 'hello', v: CHESS_PROTOCOL_VERSION, side: s.side, name: s.myName, ...(s.myColor ? { color: s.myColor } : {}) },
    { t: 'sync', log: s.log, epoch: s.epoch, wantRematch: s.iWantRematch },
  ];
}

/**
 * Attempt to play `ply`. Rejected (no-op) if it isn't my turn or the move is
 * illegal. On success the log grows by one; online mode also emits a `move`.
 */
export function makeMove(s: SessionState, ply: Ply): Outcome {
  if (!canIMove(s)) return { state: s, outgoing: [] };
  const gs = boardState(s);
  const move = resolvePly(gs, ply);
  if (!move) return { state: s, outgoing: [] };

  // Store a normalized ply (carrying the resolved promotion, if any) so both
  // peers and any replay pick the exact same move.
  const stored: Ply = move.promotion
    ? { from: ply.from, to: ply.to, promotion: move.promotion }
    : { from: ply.from, to: ply.to };

  const next: SessionState = { ...s, log: [...s.log, stored] };
  const outgoing: ChessMessage[] =
    s.mode === 'online' ? [{ t: 'move', ply: stored }] : [];
  return { state: next, outgoing, finished: finishedBy(s, next) };
}

/**
 * Take back the last move. Local (hotseat) only: online games reconcile by
 * "longer log wins", so an undo would be instantly overwritten by the peer's
 * longer log — there it's a no-op. Also a no-op when the log is empty.
 */
export function undoMove(s: SessionState): Outcome {
  if (s.mode !== 'local' || s.log.length === 0) return { state: s, outgoing: [] };
  return { state: { ...s, log: s.log.slice(0, -1) }, outgoing: [] };
}

/**
 * Rewind the game to the position after ply `n` (i.e. keep the first `n` plies).
 * Local (hotseat) only, for the same reason as undo — online reconciliation
 * would immediately restore the longer log. No-op if `n` is already the length.
 */
export function truncateLog(s: SessionState, n: number): Outcome {
  if (s.mode !== 'local') return { state: s, outgoing: [] };
  const clamped = Math.max(0, Math.min(Math.floor(n), s.log.length));
  if (clamped === s.log.length) return { state: s, outgoing: [] };
  return { state: { ...s, log: s.log.slice(0, clamped) }, outgoing: [] };
}

/**
 * Propose a rematch. When both sides have proposed, the board resets to the
 * opening and rematch flags clear. Online, colours stay the same.
 */
export function proposeRematch(s: SessionState): Outcome {
  if (s.mode === 'local') {
    // Local rematch is immediate — just clear the board (new epoch, new game).
    const next: SessionState = { ...s, log: [], epoch: s.epoch + 1, iWantRematch: false, oppWantsRematch: false };
    return { state: next, outgoing: [] };
  }
  const next = maybeRematchReset({ ...s, iWantRematch: true });
  return { state: next, outgoing: [{ t: 'rematch' }] };
}

/**
 * Reset to the opening for an online rematch — but only when both sides want
 * it AND the game is actually over. A forged mid-game 'rematch' (plus our own
 * stale intent) must never wipe a live board; battleship's maybeRestart
 * carries the identical guard (`winner(log) === null`).
 */
function maybeRematchReset(s: SessionState): SessionState {
  if (!s.iWantRematch || !s.oppWantsRematch || phase(s) !== 'over') return s;
  return { ...s, log: [], epoch: s.epoch + 1, iWantRematch: false, oppWantsRematch: false };
}

/** Inbound reducer: fold a peer message into the session. */
export function applyMessage(s: SessionState, msg: ChessMessage): Outcome {
  switch (msg.t) {
    case 'hello': {
      if (msg.v !== CHESS_PROTOCOL_VERSION) {
        // Same copy as battleship's version guard — it tells the family what
        // to actually DO, and the two games shouldn't explain one situation
        // two different ways.
        return { state: s, outgoing: [], error: 'Different app versions — both players refresh the page.' };
      }
      // The host's colour is the one that counts: a guest hearing it takes
      // the other, whichever door it came through. A guest's claim changes
      // nothing on the host; an older build's hello says nothing about colour.
      const myColor = s.side === 'guest' && msg.side === 'host' && msg.color ? opposite(msg.color) : s.myColor;
      return { state: { ...s, oppName: msg.name.slice(0, 24) || s.oppName, myColor }, outgoing: [] };
    }

    case 'sync': {
      // Pre-epoch builds send syncs without an epoch — treat those as epoch 0.
      const msgEpoch = msg.epoch ?? 0;

      // They rematch-reset and we missed it: adopt their game wholesale —
      // log AND epoch — and clear our own stale rematch intent.
      if (msgEpoch > s.epoch) {
        const next: SessionState = {
          ...s,
          log: msg.log,
          epoch: msgEpoch,
          iWantRematch: false,
          oppWantsRematch: msg.wantRematch,
        };
        // Same hostile-log defence as the equal-epoch branch below: the
        // adopted log is replayed right here, and a shape-valid but illegal
        // log (behind a forged newer epoch) must be refused, not thrown.
        // A newer epoch is a different game — whatever finish this session
        // reported belongs to the old one — so it is measured from its own
        // opening: a rematch the peer finished while we slept is news.
        let finished: FinishInfo | undefined;
        try {
          finished = finishedBy({ ...next, log: [] }, next);
        } catch {
          return {
            state: s,
            outgoing: [{ t: 'sync', log: s.log, epoch: s.epoch, wantRematch: s.iWantRematch }],
          };
        }
        return { state: next, outgoing: [], finished };
      }

      // A stale sync from before our rematch reset: its old (finished) log
      // must not resurrect the game. Ignore it, and answer with our own sync
      // so the lagging peer jumps to the new epoch.
      if (msgEpoch < s.epoch) {
        return {
          state: s,
          outgoing: [{ t: 'sync', log: s.log, epoch: s.epoch, wantRematch: s.iWantRematch }],
        };
      }

      const merged = reconcileLogs(s.log, msg.log);
      const next: SessionState = {
        ...s,
        log: merged,
        oppWantsRematch: msg.wantRematch,
      };
      // `reconcileLogs` only checks that the peer's log is a longer *prefix
      // extension* of ours — it never replays it, so a hostile peer can send a
      // prefix-compatible but ILLEGAL log (e.g. a1→a1). Replaying that throws
      // `Illegal ply in log`, and this reducer runs synchronously in the message
      // handler, so an unguarded throw white-screens the victim. Force the
      // replay here; if it's bogus, refuse the sync and re-assert our own log.
      let finished: FinishInfo | undefined;
      try {
        finished = finishedBy(s, next);
      } catch {
        return {
          state: s,
          outgoing: [{ t: 'sync', log: s.log, epoch: s.epoch, wantRematch: s.iWantRematch }],
        };
      }
      // If they're behind, answer with our (longer) log so they catch up.
      const outgoing: ChessMessage[] =
        merged.length > msg.log.length
          ? [{ t: 'sync', log: merged, epoch: s.epoch, wantRematch: s.iWantRematch }]
          : [];
      return { state: next, outgoing, finished };
    }

    case 'move': {
      // Only accept the opponent's move if it legally extends the current log.
      const gs = boardState(s);
      const expectedColor = gs.turn;
      // In online mode the opponent should only author moves for their colour.
      if (s.mode === 'online' && s.myColor && expectedColor === s.myColor) {
        return { state: s, outgoing: [] };
      }
      const move = resolvePly(gs, msg.ply);
      if (!move) return { state: s, outgoing: [] };
      const stored: Ply = move.promotion
        ? { from: msg.ply.from, to: msg.ply.to, promotion: move.promotion }
        : { from: msg.ply.from, to: msg.ply.to };
      const next: SessionState = { ...s, log: [...s.log, stored] };
      return { state: next, outgoing: [], finished: finishedBy(s, next) };
    }

    case 'rematch': {
      const next = maybeRematchReset({ ...s, oppWantsRematch: true });
      return { state: next, outgoing: [] };
    }
  }
}
