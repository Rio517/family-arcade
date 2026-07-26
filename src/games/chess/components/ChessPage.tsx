import '../styles/chess.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useProfile } from '@shared/profile/useProfile';
import { useChess } from '@games/chess/state/useChess';
import { pointsForResult } from '@shared/profile/profile';
import { normalizeCode } from '@shared/net/peer';
import { ChessBoard } from './ChessBoard';
import { ChessResult } from './ChessResult';
import { ConnectionBadge } from '@shared/ui/ConnectionBadge';
import { CloseIcon, ResumeIcon, TargetIcon } from '@shared/ui/icons';
import { loadResumableChessGame } from '../storage/chessPersistence';
import { winnerOf, status as statusOf } from '@games/chess/domain/rules';
import type { FinishInfo } from '@games/chess/domain/session';
import type { Ply, Status } from '@games/chess/domain/types';

type Setup = 'pick' | 'local' | 'online';

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
  const [copied, setCopied] = useState(false);
  const [joinInput, setJoinInput] = useState(normalizeCode(params.get('g') ?? ''));
  const [whiteName, setWhiteName] = useState('White');
  const [blackName, setBlackName] = useState('Black');

  const onFinish = useCallback(
    (info: FinishInfo) => {
      // Online decisive games move the shared profile; draws and local games don't.
      let pointsEarned = 0;
      if (info.iWon !== null) {
        pointsEarned = pointsForResult(info.iWon, 0);
        profile.recordResult({
          won: info.iWon,
          survivingCells: 0,
          code: 'chess',
          opponent: 'Opponent',
          finishedAt: Date.now(),
        });
      }
      setFinish({ status: info.status, pointsEarned });
    },
    [profile],
  );

  const cx = useChess({ name: profile.profile.name, onFinish });

  // Resume a saved online game, or pre-fill a join code from a shared link.
  const bootRef = useRef(false);
  const resumeCode = params.get('resume');
  const joinCode = params.get('g');
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (resumeCode) {
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

  // Turn indicator text.
  const turnText = (() => {
    if (cx.phase !== 'play') return '';
    if (cx.mode === 'local') return `${cx.turn === 'w' ? 'White' : 'Black'} to move`;
    return cx.canMove ? 'Your move' : `${cx.oppName || 'Opponent'}’s move`;
  })();

  const inGame = cx.phase === 'play' || cx.phase === 'over';
  const showCodeChip = cx.mode === 'online' && cx.side === 'host' && !cx.oppConnected && cx.phase === 'play';
  // The most recent unfinished online game, offered on the mode picker.
  const resumableChess = !inGame && setup === 'pick' ? loadResumableChessGame() : null;

  return (
    <div className="app">
      <div className="topbar">
        <button className="back-link" onClick={goMenu} data-testid="chess-back">‹ Menu</button>
        <h1>Chess</h1>
        <span className="spacer" />
        {cx.phase === 'play' && turnText && (
          <span className={`turn-pill ${cx.mode === 'local' ? '' : cx.canMove ? 'mine' : 'theirs'}`} data-testid="chess-turn">
            {turnText}
          </span>
        )}
        {showCodeChip && (
          <button className="code-chip" onClick={() => setShareOpen(true)} data-testid="chess-share-chip">
            <span className="lbl">Code</span>
            <strong data-testid="chess-code">{cx.code}</strong>
          </button>
        )}
        {cx.side && <ConnectionBadge status={cx.status} detail={cx.statusDetail} />}
      </div>

      {/* ── Invite modal (online host waiting) ── */}
      {shareOpen && (
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
        </div>
      )}

      {/* ── Setup: local (hotseat) name form ── */}
      {!inGame && setup === 'local' && (
        <div className="narrow-col stack">
          <div className="panel stack">
            <h2>Same-device game</h2>
            <div className="field">
              <label htmlFor="wname">White player</label>
              <input id="wname" value={whiteName} maxLength={20} onChange={(e) => setWhiteName(e.target.value)} data-testid="white-name" />
            </div>
            <div className="field">
              <label htmlFor="bname">Black player</label>
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

      {/* ── The board ── */}
      {cx.phase === 'play' && (
        <div className="narrow-col">
          <ChessBoard
            board={cx.board}
            orientation={cx.mode === 'online' && cx.myColor ? cx.myColor : 'w'}
            interactive={cx.canMove}
            movableColor={cx.mode === 'online' && cx.myColor ? cx.myColor : cx.turn}
            lastMove={lastMoveSquares(cx.log)}
            onMove={onMove}
          />
          {statusOf(cx.board) === 'check' && (
            <p className="subtle center" style={{ marginTop: 10, color: 'var(--warn)' }} data-testid="check-banner">
              Check!
            </p>
          )}
        </div>
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
  );
}

/** The from/to of the most recent ply, for highlighting on the board. */
function lastMoveSquares(log: Ply[]) {
  const last = log[log.length - 1];
  return last ? { from: last.from, to: last.to } : null;
}
