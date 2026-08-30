import '../styles/chess.css';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useProfile } from '@shared/profile/useProfile';
import { useParty, type PartyValue } from '@shared/party/PartyContext';
import { usePartyDoor } from '@shared/party/usePartyDoor';
import { useChess, type StartTableOptions } from '@games/chess/state/useChess';
import { pointsForResult } from '@shared/profile/profile';
import { recordResultFor } from '@shared/profile/results';
import { generateCode, normalizeCode } from '@shared/net/peer';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { SeatPicker } from '@shared/profile/SeatPicker';
import { useSeats } from '@shared/profile/useSeats';
import { seatName, swapSeats, type Seat } from '@shared/profile/seats';
import { ChessBoard } from './ChessBoard';
import { ChessResult } from './ChessResult';
import { ChessLogModal, CapturedTray } from './ChessLogModal';
import { FreePlay } from './FreePlay';
import { CHESS_THEME_KEY, CHESS_THEMES, ChessThemeContext, storedChessTheme, type ChessThemeId } from './chessTheme';

// three.js is heavy, so the 3D board loads on demand — picking Flat or Table
// never downloads it.
const Chess3D = lazy(() => import('./Chess3D'));

type BoardView = 'flat' | '3d';
import { ConnectionBadge } from '@shared/ui/ConnectionBadge';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { CloseIcon, GridIcon, ListIcon, ResumeIcon, ShuffleIcon, TargetIcon } from '@shared/ui/icons';
import { loadLocalChessGame, loadResumableChessGame } from '../storage/chessPersistence';
import { customStart, winnerOf, status as statusOf } from '@games/chess/domain/rules';
import { analyzeGame, tallyCaptures } from '@games/chess/domain/analysis';
import type { FinishInfo } from '@games/chess/domain/session';
import type { Color, GameState, PieceType, Ply, Status } from '@games/chess/domain/types';

type Setup = 'pick' | 'local' | 'online' | 'free';

/** The registry id — the seats, the profile's history and the party's table all key on it. */
const GAME_ID = 'chess';

/** One line under each world in the ☰ menu, so picking isn't a guess. */
const THEME_BLURBS: Record<ChessThemeId, string> = {
  classic: 'The leather-and-brass War Room',
  unicorn: 'The Cloud Kingdom, high above the clouds',
  galaxy: 'Rebel starships against the dark side',
};

interface ResultSummary {
  status: Status;
  pointsEarned: number;
}

/**
 * What the online panel shows. In a party the friend is already here, so the
 * code doors give way to one tap (host) or a quiet wait (guest); while a
 * remembered party is still dialling, neither is right yet.
 */
type Lobby = 'doors' | 'reconnecting' | 'party-host' | 'party-guest';

function lobbyFor(party: PartyValue): Lobby {
  if (party.reconnecting) return 'reconnecting';
  if (party.inParty && party.role === 'host') return 'party-host';
  if (party.inParty && party.role === 'guest') return 'party-guest';
  return 'doors';
}

/** A colour off the wire — the party carries the host's side as a plain string. */
function asColor(side: string | undefined): Color | undefined {
  return side === 'w' || side === 'b' ? side : undefined;
}

/** The ticket in a chair, for the result — a bot or an empty chair credits nobody. */
function ticketOf(seat: Seat): string | null {
  return seat.kind === 'ticket' ? seat.userId : null;
}

export function ChessPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useProfile();
  const [setup, setSetup] = useState<Setup>('pick');
  const [finish, setFinish] = useState<ResultSummary | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  useDismissOnEscape(shareOpen, () => setShareOpen(false));
  const [copied, setCopied] = useState(false);
  const [joinInput, setJoinInput] = useState(normalizeCode(params.get('g') ?? ''));
  // The two same-device chairs: tickets off the roster, seeded from the lineup
  // this device played last (or the signed-in ticket on chair one). Sitting
  // down never signs anybody in or renames them.
  const table = useSeats(GAME_ID, 2);
  const whiteName = seatName(table.seats[0], table.users) || 'White';
  const blackName = seatName(table.seats[1], table.users) || 'Black';
  const [logOpen, setLogOpen] = useState(false);
  // The ☰ options menu: board view, world, move log. Undo stays outside, in
  // the title bar — taking back a move shouldn't cost two taps.
  const [menuOpen, setMenuOpen] = useState(false);
  useDismissOnEscape(menuOpen, () => setMenuOpen(false));
  // Board view — flat or full 3D. Remembered per device.
  // The set's look — classic/unicorn/galaxy — shared with every view via context.
  const [theme, setThemeState] = useState<ChessThemeId>(storedChessTheme);
  const setTheme = (t: ChessThemeId) => {
    setThemeState(t);
    try { localStorage.setItem(CHESS_THEME_KEY, t); } catch { /* ignore */ }
  };

  const [view, setView] = useState<BoardView>(() => {
    try {
      // Older builds stored 'table' — that mode is gone; fold it into flat.
      return localStorage.getItem('chess-view-v1') === '3d' ? '3d' : 'flat';
    } catch { return 'flat'; }
  });
  const pickView = (v: BoardView) => {
    setView(v);
    try { localStorage.setItem('chess-view-v1', v); } catch { /* ignore */ }
  };

  // The 3D camera: a Reset view button appears in the title bar once the
  // player has orbited or cursor-zoomed away from the opening framing.
  const [camDirty, setCamDirty] = useState(false);
  const resetViewRef = useRef<(() => void) | null>(null);

  // The party you're in, if any — it decides which online lobby you see, and
  // its table closes with the game.
  const party = useParty();
  const lobby = lobbyFor(party);
  const { closeTable } = party;

  const onFinish = useCallback((info: FinishInfo) => {
    // Results land on the tickets the session captured when the game started
    // — never on the roster as it stands now, since a sign-in switch between
    // the first move and the mate must not move the row. Draws record
    // nothing; so does a chair with no ticket (a bot, or nobody).
    const finishedAt = Date.now();
    const row = (won: boolean, opponent: string) => ({
      won,
      survivingCells: 0,
      code: info.code || GAME_ID,
      game: GAME_ID,
      // The real name, not a placeholder — every chess row in the history
      // used to say "Opponent" even though the hello name was known.
      opponent: opponent || 'Opponent',
      finishedAt,
    });
    let pointsEarned = 0;
    if (info.iWon !== null) {
      // Online, decisive: my ticket's result against the friend's hello name.
      pointsEarned = pointsForResult(info.iWon, 0);
      recordResultFor(info.seatedUserId, row(info.iWon, info.opponent));
    } else if (info.winner !== null) {
      // Same device, decisive: a win for the winning chair, a loss for the
      // other. Points on the card are an online thing; here the ledger
      // credit is what each ticket gets.
      recordResultFor(info.whiteUserId, row(info.winner === 'w', info.blackName));
      recordResultFor(info.blackUserId, row(info.winner === 'b', info.whiteName));
    }
    // Online, the game closes the host's table with it, so a friend who
    // reloads after the result is never sat down at a finished game. (The
    // party ignores this unless we are the host and this is the open table.)
    if (info.code) closeTable(info.code);
    setFinish({ status: info.status, pointsEarned });
  }, [closeTable]);

  const cx = useChess({ name: profile.profile.name, onFinish });
  // Host in a party: the colour you'll play. Your friend gets the other one.
  // 'flip': the coin decides the moment you tap Play.
  const [hostSide, setHostSide] = useState<Color | 'flip'>('w');
  const inGame = cx.phase === 'play' || cx.phase === 'over';
  // The hook's actions are stable; `cx` itself is a fresh object every render.
  const { startTable, leave: hangUp } = cx;
  /** Sit down at an online table as the signed-in ticket. */
  const sitDown = useCallback(
    (opts: Omit<StartTableOptions, 'seatedUserId'>) => startTable({ ...opts, seatedUserId: profile.userId }),
    [startTable, profile.userId],
  );
  /**
   * Start a same-device game with the chairs as they stand — names to show,
   * tickets to credit — remembering the lineup for next time. Called from
   * click handlers only, so it needn't be memoised.
   */
  const startHotseat = (start?: GameState) => {
    table.remember();
    cx.startLocal(
      { name: whiteName, userId: ticketOf(table.seats[0]) },
      { name: blackName, userId: ticketOf(table.seats[1]) },
      start,
    );
  };
  // A guest in a party stands at the one door: it knocks while the online
  // lobby is up with no table open, and sits down the moment the host opens
  // one. A table that goes away while its dial is still ringing gets hung up;
  // a game that is actually connected is never torn down from here.
  const onTable = useCallback(
    (code: string, side?: string) => sitDown({ role: 'guest', code, hostSide: asColor(side) }),
    [sitDown],
  );
  const onClosed = useCallback(() => {
    if (cx.mode === 'online' && cx.side === 'guest' && !cx.oppConnected) hangUp();
  }, [cx.mode, cx.side, cx.oppConnected, hangUp]);
  const door = usePartyDoor(GAME_ID, !inGame && setup === 'online', onTable, onClosed);

  // Deep links: resume the saved hotseat game (?resume=local, used by the
  // arcade's saved-games list), resume a saved online game (?resume=CODE),
  // or pre-fill a join code from a shared link (?g=CODE).
  const bootRef = useRef(false);
  const resumeCode = params.get('resume');
  const joinCode = params.get('g');
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (resumeCode === 'local') {
      cx.resumeLocal();
    } else if (resumeCode) {
      setSetup('online');
      cx.resumeGame(resumeCode);
    } else if (joinCode) {
      setSetup('online');
    }
    return () => {
      bootRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeCode, joinCode]);

  useEffect(() => {
    if (cx.phase !== 'over') setFinish(null);
  }, [cx.phase]);

  // Host waits for the guest to connect: show the invite until the link opens.
  // In a party there is nobody to invite — the friend is already walking in.
  const hostWaiting =
    cx.mode === 'online' && cx.side === 'host' && !cx.oppConnected && cx.phase !== 'over' && !party.inParty;
  useEffect(() => {
    if (hostWaiting) setShareOpen(true);
    else if (cx.oppConnected) setShareOpen(false);
  }, [hostWaiting, cx.oppConnected]);

  const shareUrl = `${location.origin}${import.meta.env.BASE_URL}#/chess?g=${cx.code}`;
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is shown regardless */
    }
  };

  // Both ways out close the host's table with the game, so the friend's
  // screen stops pointing at a board nobody is sitting at. (The party
  // ignores this unless we are the host and this is the open table.)
  // ‹ Menu keeps the save for the Save Station; Back to menu leaves for good.
  const goMenu = () => {
    if (cx.code) party.closeTable(cx.code);
    navigate('/');
  };
  const exitToMenu = () => {
    if (cx.code) party.closeTable(cx.code);
    cx.leave();
    navigate('/');
  };

  const onMove = (ply: Ply) => cx.move(ply);

  // The move log + captured pieces are pure views of the log.
  const moves = useMemo(() => analyzeGame(cx.log, cx.start ?? undefined), [cx.log, cx.start]);
  const caps = useMemo(() => tallyCaptures(moves), [moves]);
  // Stable identity: a fresh {from,to} literal per render would re-fire the
  // 3D board's mark effect (and its geometry rebuild) on every render.
  const lastMove = useMemo(() => lastMoveSquares(cx.log), [cx.log]);
  const boardOrientation: Color = cx.mode === 'online' && cx.myColor ? cx.myColor : 'w';
  const nameW = (cx.myColor === 'b' ? cx.oppName : cx.myName) || 'White';
  const nameB = (cx.myColor === 'b' ? cx.myName : cx.oppName) || 'Black';

  const showCodeChip = cx.mode === 'online' && cx.side === 'host' && !cx.oppConnected && cx.phase === 'play';
  // Unfinished games offered on the mode picker: the last online game, and
  // the same-device autosave slot.
  const resumableChess = !inGame && setup === 'pick' ? loadResumableChessGame() : null;
  const resumableLocal = !inGame && setup === 'pick' ? loadLocalChessGame() : null;

  // In 3D the scene owns the whole window — stars in every direction; the
  // title bar and the hint float over it.
  // The board owns the whole window in 3D play and in free play (flat or 3D):
  // the title bar, trays, hint and actions float over its edges.
  const immersive = (cx.phase === 'play' && view === '3d') || (!inGame && setup === 'free');

  return (
    <ChessThemeContext.Provider value={{ theme, setTheme }}>
    <div className={`app chess-theme-${theme}${immersive ? ' chess-immersive' : ''}`}>
      <div className="topbar">
        <button className="back-link" onClick={goMenu} data-testid="chess-back">‹ Menu</button>
        <h1>Chess</h1>
        {/* Whose move it is lives in the title bar now — the side panel that
            used to carry it gave its space back to the board. */}
        {cx.phase === 'play' && (
          <span className="turn-chip" data-testid="chess-turn">
            <span className={`pl-dot ${cx.turn === 'w' ? 'light' : 'dark'}`} aria-hidden="true" />
            <strong>{cx.turn === 'w' ? nameW : nameB}</strong>{' to move'}
            {statusOf(cx.board) === 'check' && <span className="pl-check">Check!</span>}
          </span>
        )}
        <span className="spacer" />
        {showCodeChip && (
          <button className="code-chip" onClick={() => setShareOpen(true)} data-testid="chess-share-chip">
            <span className="lbl">Code</span>
            <strong data-testid="chess-code">{cx.code}</strong>
          </button>
        )}
        {cx.side && <ConnectionBadge status={cx.status} detail={cx.statusDetail} />}
        {cx.phase === 'play' && view === '3d' && camDirty && (
          <button
            className="btn btn-ghost chess-reset-btn"
            onClick={() => resetViewRef.current?.()}
            data-testid="chess-reset-view"
          >
            ⤢ Reset view
          </button>
        )}
        {cx.phase === 'play' && cx.mode === 'local' && (
          <button
            className="btn btn-ghost chess-undo-btn"
            onClick={cx.undo}
            disabled={!cx.canUndo}
            data-testid="chess-undo"
          >
            ↶ Undo
          </button>
        )}
        {cx.phase === 'play' && (
          <button
            className="icon-btn chess-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Options"
            aria-haspopup="dialog"
            data-testid="chess-menu"
          >
            ☰
          </button>
        )}
        <FullscreenButton />
      </div>

      {/* ── Invite modal (online host waiting) ── */}
      {shareOpen && (
        /* Backdrop click is a mouse convenience; Escape (above) and the
           Close button are the keyboard path. */
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShareOpen(false); }}>
          <div className="modal modal-lg" role="dialog" aria-label="Invite your opponent">
            <div className="modal-head">
              <span className="modal-title">Waiting for opponent to join</span>
              <button className="icon-btn" onClick={() => setShareOpen(false)} aria-label="Close">
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="codebox">
              <div className="qr-radar">
                <span className="ping" />
                <span className="ping" />
                <span className="ping" />
                <div className="qr-frame">
                  <QRCodeSVG value={shareUrl} size={132} bgColor="#e2e8f0" fgColor="#0b1220" level="M" />
                </div>
              </div>
              <div className="lbl">Share this code</div>
              <div className="code">{cx.code}</div>
              <p className="subtle" style={{ margin: '8px 0 14px' }}>
                Open Chess on the other device and tap “Join with a code”. The game starts the moment they join.
              </p>
              <button className="btn btn-primary" onClick={copyShare}>
                {copied ? 'Link copied' : 'Copy invite link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cx.side && cx.status === 'error' && (
        <div className="panel narrow-col">
          <p className="subtle" style={{ color: 'var(--bad)' }}>{cx.statusDetail ?? 'Connection error.'}</p>
          <button className="btn btn-block" onClick={exitToMenu}>← Back to menu</button>
        </div>
      )}

      {/* ── Setup: mode picker ── */}
      {!inGame && setup === 'pick' && (
        <div className="narrow-col stack">
          <div className="panel">
            <h2>How do you want to play?</h2>
            <p className="subtle">Two players, one board.</p>
          </div>
          {resumableLocal && (
            <button className="card violet" onClick={() => cx.resumeLocal()} data-testid="chess-resume-local">
              <div className="icon"><ResumeIcon size={26} /></div>
              <div className="body">
                <div className="title">Resume — {resumableLocal.whiteName} vs {resumableLocal.blackName}</div>
                <div className="sub">
                  Same device · {describeMoves(resumableLocal.log.length)}
                  {resumableLocal.start ? ' · custom setup' : ''}
                </div>
              </div>
              <div className="chev" aria-hidden="true">›</div>
            </button>
          )}
          {resumableChess && (
            <button
              className="card violet"
              onClick={() => {
                setSetup('online');
                cx.resumeGame(resumableChess.code);
              }}
              data-testid="chess-resume"
            >
              <div className="icon"><ResumeIcon size={26} /></div>
              <div className="body">
                <div className="title">Resume game {resumableChess.code}</div>
                <div className="sub">vs {resumableChess.oppName || 'opponent'} — still in progress.</div>
              </div>
              <div className="chev" aria-hidden="true">›</div>
            </button>
          )}
          <button className="card" onClick={() => setSetup('local')} data-testid="mode-local">
            <div className="icon"><TargetIcon size={26} /></div>
            <div className="body">
              <div className="title">Same device</div>
              <div className="sub">Pass-and-play on one screen. Take turns, no code needed.</div>
            </div>
            <div className="chev" aria-hidden="true">›</div>
          </button>
          <button className="card violet" onClick={() => setSetup('online')} data-testid="mode-online">
            <div className="icon"><TargetIcon size={26} /></div>
            <div className="body">
              <div className="title">Online <span className="tag">2-Device</span></div>
              <div className="sub">Two devices, one code — just like Ship Battle.</div>
            </div>
            <div className="chev" aria-hidden="true">›</div>
          </button>
          <button className="card" onClick={() => setSetup('free')} data-testid="mode-free">
            <div className="icon"><GridIcon size={26} /></div>
            <div className="body">
              <div className="title">Free play</div>
              <div className="sub">No rules — drag pieces anywhere, set up anything. Just play.</div>
            </div>
            <div className="chev" aria-hidden="true">›</div>
          </button>
        </div>
      )}

      {/* ── Free play sandbox — can promote its setup into a real game ── */}
      {!inGame && setup === 'free' && (
        <FreePlay
          onExit={() => setSetup('pick')}
          // A promoted free-play board is a game starting like any other.
          onStartGame={(board) => startHotseat(customStart(board))}
        />
      )}

      {/* ── Setup: local (hotseat) — two chairs, filled from the roster ── */}
      {!inGame && setup === 'local' && (
        <div className="narrow-col stack">
          <div className="panel stack">
            <h2>Same-device game</h2>
            {/* Chairs hold tickets, not typed-in names: tapping someone into
                a chair never signs them in or renames whoever is holding the
                device. Who sits where is remembered once the game starts. */}
            <SeatPicker
              seats={table.seats}
              onChange={table.setSeats}
              rowLabel={(i) => (i === 0 ? 'White' : 'Black')}
            />
            <button
              className="btn btn-ghost chess-swap-btn"
              onClick={() => table.setSeats(swapSeats(table.seats, 0, 1))}
              data-testid="chess-swap-sides"
            >
              <ShuffleIcon size={18} /> Swap sides
            </button>
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={() => startHotseat()}
              data-testid="start-local"
            >
              Start game
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setSetup('pick')}>← Back</button>
          </div>
        </div>
      )}

      {/* ── Setup: online lobby — the party is the table ── */}
      {!inGame && setup === 'online' && (
        <div className="narrow-col stack">
          {/* Your ticket is your name online — your opponent sees it. */}
          <PlayingAs />
          <div className="panel stack">
            {lobby === 'reconnecting' && (
              <p className="subtle center" data-testid="chess-party-reconnecting">
                Reconnecting to your party…
              </p>
            )}

            {lobby === 'party-host' && (
              <>
                {/* The friend's name arrives with their hello — a beat after the link. */}
                <h2>Play with {party.theirName ?? 'your friend'}</h2>
                <div className="row-actions chess-sides" role="group" aria-label="Your colour">
                  <button
                    className={`btn${hostSide === 'w' ? ' btn-primary' : ''}`}
                    aria-pressed={hostSide === 'w'}
                    onClick={() => setHostSide('w')}
                    data-testid="chess-side-w"
                  >
                    I play White
                  </button>
                  <button
                    className={`btn${hostSide === 'b' ? ' btn-primary' : ''}`}
                    aria-pressed={hostSide === 'b'}
                    onClick={() => setHostSide('b')}
                    data-testid="chess-side-b"
                  >
                    I play Black
                  </button>
                  <button
                    className={`btn${hostSide === 'flip' ? ' btn-primary' : ''}`}
                    aria-pressed={hostSide === 'flip'}
                    onClick={() => setHostSide('flip')}
                    data-testid="chess-side-flip"
                  >
                    Flip for it
                  </button>
                </div>
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={() => {
                    const side: Color = hostSide === 'flip' ? (Math.random() < 0.5 ? 'w' : 'b') : hostSide;
                    sitDown({ role: 'host', code: party.openTable(GAME_ID, side), hostSide: side });
                  }}
                  data-testid="chess-party-play"
                >
                  Play Chess with {party.theirName ?? 'your friend'}
                </button>
              </>
            )}

            {lobby === 'party-guest' && (
              <p className="subtle center" data-testid="chess-party-waiting">
                {door.waiting
                  ? `Waiting for ${door.friend ?? 'your friend'} to open Chess…`
                  : `${door.friend ?? 'Your friend'} opened Chess — sitting down…`}
              </p>
            )}

            {lobby === 'doors' && (
              <>
                <h2>Start a game</h2>
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={() => sitDown({ role: 'host', code: generateCode() })}
                  data-testid="chess-create"
                >
                  Create a game
                </button>
                <p className="subtle center">You’ll get a code to share. You play White.</p>
                <div className="field">
                  <label htmlFor="jcode">…or join with a 4-character code</label>
                  <input
                    id="jcode"
                    className="code-input"
                    value={joinInput}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={4}
                    placeholder="ABCD"
                    onChange={(e) => setJoinInput(normalizeCode(e.target.value))}
                    data-testid="chess-join-code"
                  />
                </div>
                <button
                  className="btn btn-violet btn-lg btn-block"
                  disabled={joinInput.length !== 4}
                  onClick={() => sitDown({ role: 'guest', code: joinInput })}
                  data-testid="chess-join"
                >
                  Join game →
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-block" onClick={() => setSetup('pick')}>← Back</button>
          </div>
        </div>
      )}

      {/* ── The board ── owns the whole screen now; everything that used to sit
          beside it lives in the title bar or behind the ☰ menu. */}
      {cx.phase === 'play' && (
        <div className="chess-play">
          <div className="chess-board-area">
            {view === '3d' ? (
              <Suspense fallback={<p className="subtle center">Setting up the 3D set…</p>}>
                <Chess3D
                  board={cx.board}
                  orientation={boardOrientation}
                  interactive={cx.canMove}
                  movableColor={cx.mode === 'online' && cx.myColor ? cx.myColor : cx.turn}
                  lastMove={lastMove}
                  onMove={onMove}
                  onViewDirty={setCamDirty}
                  onApi={(api) => { resetViewRef.current = api ? api.resetView : null; }}
                />
              </Suspense>
            ) : (
              <ChessBoard
                board={cx.board}
                orientation={boardOrientation}
                interactive={cx.canMove}
                movableColor={cx.mode === 'online' && cx.myColor ? cx.myColor : cx.turn}
                lastMove={lastMove}
                onMove={onMove}
              />
            )}
          </div>
        </div>
      )}

      {/* ── The ☰ options menu — players & captures, then every option spelled
          out as its own labelled row (kid-sized targets, no cryptic segments). */}
      {menuOpen && (
        /* Backdrop click is a mouse convenience; Escape (above) and the Close
           button are the keyboard path. */
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <div className="modal chess-menu" role="dialog" aria-label="Chess options" aria-modal="true">
            <div className="modal-head">
              <span className="modal-title">Options</span>
              <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close options" data-testid="chess-menu-close">
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="chess-menu-body">
              <div className="chess-players">
                {/* Black then White, mirroring the board; each card names the
                    player and shows the pieces they've captured. */}
                <PlayerCard
                  name={nameB}
                  color="b"
                  active={cx.turn === 'b'}
                  inCheck={statusOf(cx.board) === 'check' && cx.turn === 'b'}
                  captured={caps.byBlack}
                  capColor="w"
                  lead={-caps.whiteLead}
                />
                <PlayerCard
                  name={nameW}
                  color="w"
                  active={cx.turn === 'w'}
                  inCheck={statusOf(cx.board) === 'check' && cx.turn === 'w'}
                  captured={caps.byWhite}
                  capColor="b"
                  lead={caps.whiteLead}
                />
              </div>

              <div className="menu-group" role="group" aria-label="Board view">
                <div className="menu-group-title">Board view</div>
                <button
                  className="menu-opt"
                  data-selected={view === 'flat'}
                  aria-pressed={view === 'flat'}
                  onClick={() => { pickView('flat'); setMenuOpen(false); }}
                  data-testid="view-flat"
                >
                  <strong>Flat</strong>
                  <span>The classic top-down board</span>
                </button>
                <button
                  className="menu-opt"
                  data-selected={view === '3d'}
                  aria-pressed={view === '3d'}
                  onClick={() => { pickView('3d'); setMenuOpen(false); }}
                  data-testid="view-3d"
                >
                  <strong>3D</strong>
                  <span>Orbit the set, zoom right in, and drag the pieces themselves</span>
                </button>
              </div>

              <div className="menu-group" role="group" aria-label="World">
                <div className="menu-group-title">World</div>
                {CHESS_THEMES.map((t) => (
                  <button
                    key={t.id}
                    className="menu-opt"
                    data-selected={theme === t.id}
                    aria-pressed={theme === t.id}
                    onClick={() => { setTheme(t.id); setMenuOpen(false); }}
                    data-testid={`theme-${t.id}`}
                  >
                    <strong>{t.label}</strong>
                    <span>{THEME_BLURBS[t.id]}</span>
                  </button>
                ))}
              </div>

              <button
                className="btn btn-block"
                onClick={() => { setMenuOpen(false); setLogOpen(true); }}
                data-testid="chess-log-open"
              >
                <ListIcon size={18} /> Move log
              </button>
            </div>
          </div>
        </div>
      )}

      {logOpen && (
        <ChessLogModal
          moves={moves}
          start={cx.start ?? undefined}
          orientation={boardOrientation}
          canReturn={cx.mode === 'local'}
          onReturn={(n) => { cx.goToPly(n); setLogOpen(false); }}
          onClose={() => setLogOpen(false)}
        />
      )}

      {/* ── Result ── */}
      {cx.phase === 'over' && finish && (
        <div className="narrow-col">
          <ChessResult
            status={finish.status}
            winner={winnerOf(cx.board)}
            mode={cx.mode ?? 'local'}
            iWon={cx.mode === 'online' ? winnerOf(cx.board) === cx.myColor : null}
            myName={cx.myName}
            oppName={cx.oppName}
            whiteName={nameW}
            blackName={nameB}
            pointsEarned={finish.pointsEarned}
            // "You now have…" is only true of the ticket the result credited;
            // if somebody else signed in since, their total is not the news.
            totalPoints={cx.seatedUserId === profile.userId ? profile.profile.points : undefined}
            iWantRematch={cx.iWantRematch}
            oppWantsRematch={cx.oppWantsRematch}
            onRematch={cx.requestRematch}
            onExit={exitToMenu}
          />
        </div>
      )}

      <div className="footer">
        <Link to="/">Family game console</Link>
      </div>
    </div>
    </ChessThemeContext.Provider>
  );
}

/** A player's plaque beside the board: name (with a "to move" cue on the active
 *  side) and the pieces they've captured. */
function PlayerCard({
  name,
  color,
  active,
  inCheck,
  captured,
  capColor,
  lead,
}: {
  name: string;
  color: Color;
  active: boolean;
  inCheck: boolean;
  captured: PieceType[];
  capColor: Color;
  lead: number;
}) {
  return (
    <div className={`chess-player ${active ? 'active' : ''}`}>
      <span className={`pl-dot ${color === 'w' ? 'light' : 'dark'}`} aria-hidden="true" />
      <div className="pl-main">
        <div className="pl-name" data-testid={active ? 'chess-turn' : undefined}>
          <strong>{name}</strong>
          {active && <span className="pl-turn"> to move</span>}
          {inCheck && <span className="pl-check">Check!</span>}
        </div>
        <CapturedTray pieces={captured} color={capColor} lead={lead} />
      </div>
    </div>
  );
}

/** The from/to of the most recent ply, for highlighting on the board. */
function lastMoveSquares(log: Ply[]) {
  const last = log[log.length - 1];
  return last ? { from: last.from, to: last.to } : null;
}

/** "3 moves in" / "fresh setup" — the resume card's progress line. */
function describeMoves(plies: number): string {
  if (plies === 0) return 'fresh setup';
  const moves = Math.ceil(plies / 2);
  return `${moves} move${moves === 1 ? '' : 's'} in`;
}
