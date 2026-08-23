import '../styles/chess.css';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useProfile } from '@shared/profile/useProfile';
import { useChess } from '@games/chess/state/useChess';
import { pointsForResult } from '@shared/profile/profile';
import { normalizeCode } from '@shared/net/peer';
import { NamePicker } from '@shared/ui/NamePicker';
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
import { CloseIcon, GridIcon, ListIcon, ResumeIcon, TargetIcon } from '@shared/ui/icons';
import { loadLocalChessGame, loadResumableChessGame } from '../storage/chessPersistence';
import { customStart, winnerOf, status as statusOf } from '@games/chess/domain/rules';
import { analyzeGame, tallyCaptures } from '@games/chess/domain/analysis';
import type { FinishInfo } from '@games/chess/domain/session';
import type { Color, PieceType, Ply, Status } from '@games/chess/domain/types';

type Setup = 'pick' | 'local' | 'online' | 'free';

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
  // "Player one" is the arcade-wide profile name; White defaults to them.
  const [whiteName, setWhiteName] = useState(() => profile.profile.name || 'White');
  const [blackName, setBlackName] = useState('Black');
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

  const onFinish = useCallback(
    (info: FinishInfo) => {
      // Online decisive games move the shared profile; draws and local games don't.
      let pointsEarned = 0;
      if (info.iWon !== null) {
        pointsEarned = pointsForResult(info.iWon, 0);
        // Record the real game, not a placeholder — every chess row in the
        // history used to say "Opponent" even though the hello name was known.
        profile.recordResult({
          won: info.iWon,
          survivingCells: 0,
          code: info.code || 'chess',
          game: 'chess',
          opponent: info.opponent || 'Opponent',
          finishedAt: Date.now(),
        });
      }
      setFinish({ status: info.status, pointsEarned });
    },
    [profile],
  );

  const cx = useChess({ name: profile.profile.name, onFinish });

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
  const hostWaiting = cx.mode === 'online' && cx.side === 'host' && !cx.oppConnected && cx.phase !== 'over';
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

  const goMenu = () => navigate('/');
  const exitToMenu = () => {
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

  const inGame = cx.phase === 'play' || cx.phase === 'over';
  const showCodeChip = cx.mode === 'online' && cx.side === 'host' && !cx.oppConnected && cx.phase === 'play';
  // Unfinished games offered on the mode picker: the last online game, and
  // the same-device autosave slot.
  const resumableChess = !inGame && setup === 'pick' ? loadResumableChessGame() : null;
  const resumableLocal = !inGame && setup === 'pick' ? loadLocalChessGame() : null;

  // In 3D the scene owns the whole window — stars in every direction; the
  // title bar and the hint float over it.
  const immersive = cx.phase === 'play' && view === '3d';

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
          onStartGame={(board) => cx.startLocal(whiteName, blackName, customStart(board))}
        />
      )}

      {/* ── Setup: local (hotseat) name form ── */}
      {!inGame && setup === 'local' && (
        <div className="narrow-col stack">
          <div className="panel stack">
            <h2>Same-device game</h2>
            <div className="field">
              <label htmlFor="wname">White player</label>
              <NamePicker
                value={whiteName}
                exclude={[blackName]}
                testIdPrefix="white-chip"
                // Pass-and-play names are game-local: picking a chip must not
                // rename whoever is signed in on this browser.
                onPick={setWhiteName}
              />
              <input id="wname" value={whiteName} maxLength={20} onChange={(e) => setWhiteName(e.target.value)} data-testid="white-name" />
            </div>
            <div className="field">
              <label htmlFor="bname">Black player</label>
              <NamePicker value={blackName} exclude={[whiteName]} testIdPrefix="black-chip" onPick={setBlackName} />
              <input id="bname" value={blackName} maxLength={20} onChange={(e) => setBlackName(e.target.value)} data-testid="black-name" />
            </div>
            <button className="btn btn-primary btn-lg btn-block" onClick={() => cx.startLocal(whiteName, blackName)} data-testid="start-local">
              Start game
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setSetup('pick')}>← Back</button>
          </div>
        </div>
      )}

      {/* ── Setup: online lobby ── */}
      {!inGame && setup === 'online' && (
        <div className="narrow-col stack">
          <div className="panel">
            <h2>Your name</h2>
            <NamePicker value={profile.profile.name} onPick={profile.setName} />
            <div className="field">
              <label htmlFor="oname">Shown to your opponent</label>
              <input
                id="oname"
                value={profile.profile.name}
                maxLength={20}
                placeholder="Player"
                onChange={(e) => profile.setName(e.target.value)}
                data-testid="chess-name"
              />
            </div>
          </div>
          <div className="panel stack">
            <h2>Start a game</h2>
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={() => cx.hostGame(profile.profile.name)}
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
              onClick={() => cx.joinGame(joinInput, profile.profile.name)}
              data-testid="chess-join"
            >
              Join game →
            </button>
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
            totalPoints={profile.profile.points}
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
