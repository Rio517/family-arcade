import '../styles/battleship.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '@shared/profile/useProfile';
import { useBattleship } from '@games/battleship/state/useBattleship';
import { pointsForResult } from '@shared/profile/profile';
import { buySkin, currentSkinId, selectSkin } from '@games/battleship/domain/skins';
import { Lobby } from './Lobby';
import { FleetSelect } from './FleetSelect';
import { Placement } from './Placement';
import { Battle } from './Battle';
import { Result } from './Result';
import { ConnectionBadge } from '@shared/ui/ConnectionBadge';
import { CloseIcon, TargetIcon } from '@shared/ui/icons';
import { QRCodeSVG } from 'qrcode.react';
import type { FinishInfo } from '@games/battleship/domain/session';

/** The finished-game summary shown on the Result screen. */
interface ResultSummary {
  won: boolean;
  pointsEarned: number;
}

export function BattleshipPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useProfile();
  const [finish, setFinish] = useState<ResultSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const onFinish = useCallback(
    (info: FinishInfo) => {
      const pointsEarned = pointsForResult(info.won, info.survivingCells);
      profile.recordResult({
        won: info.won,
        survivingCells: info.survivingCells,
        code: info.code,
        opponent: info.opponent,
        finishedAt: Date.now(),
      });
      setFinish({ won: info.won, pointsEarned });
    },
    [profile],
  );

  const bs = useBattleship({
    name: profile.profile.name,
    skinId: currentSkinId(profile.profile),
    onFinish,
  });

  // Resume a saved game (a shared ?g= join code is handled by the Lobby).
  const bootRef = useRef(false);
  const resumeCode = params.get('resume');
  const joinCode = params.get('g');
  // The cleanup resets the guard so React StrictMode's mount→unmount→mount
  // (whose unmount destroys the hook's connection) re-runs resume and rebuilds
  // the connection instead of leaving it torn down.
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (resumeCode) bs.resumeGame(resumeCode);
    return () => {
      bootRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeCode]);

  // Clear the finished-result banner whenever a new game begins (rematch).
  useEffect(() => {
    if (bs.phase !== 'over') setFinish(null);
  }, [bs.phase]);

  const shareUrl = `${location.origin}${import.meta.env.BASE_URL}#/play?g=${bs.code}`;
  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is shown on screen regardless */
    }
  };

  const goMenu = () => navigate('/');
  const exitToMenu = () => {
    bs.leave();
    navigate('/');
  };

  const isSetup = bs.phase === 'fleet' || bs.phase === 'placing' || bs.phase === 'waiting';
  const showCode = bs.side === 'host' && isSetup && !bs.oppConnected;

  // The host has readied up and is waiting. Two sub-states: nobody has joined
  // yet (show the invite big), or the opponent is here but still placing their
  // ships (show that instead of hiding). The modal opens on entering the wait
  // and closes once the battle actually starts.
  const awaitingJoin = bs.side === 'host' && bs.phase === 'waiting' && !bs.oppConnected;
  const awaitingPlacement = bs.side === 'host' && bs.phase === 'waiting' && bs.oppConnected;
  const hostWaiting = awaitingJoin || awaitingPlacement;
  useEffect(() => {
    if (hostWaiting) setShareOpen(true);
    else if (bs.phase === 'battle') setShareOpen(false);
  }, [hostWaiting, bs.phase]);

  return (
    <div className="app">
      <div className="topbar">
        <button className="back-link" onClick={goMenu} data-testid="back">
          ‹ Menu
        </button>
        <h1>Ship Battle</h1>
        <span className="spacer" />
        {bs.phase === 'battle' && (
          <span className={`turn-pill ${bs.myTurn ? 'mine' : 'theirs'}`} data-testid="turn-pill">
            {bs.myTurn ? (
              <>
                <TargetIcon size={14} /> Your shot
              </>
            ) : bs.pendingFire ? (
              'Firing…'
            ) : (
              `${bs.oppName ?? 'Opponent'}'s turn`
            )}
          </span>
        )}
        {showCode && (
          <button className="code-chip" onClick={() => setShareOpen(true)} data-testid="share-chip">
            <span className="lbl">Code</span>
            <strong data-testid="game-code">{bs.code}</strong>
          </button>
        )}
        {bs.side && <ConnectionBadge status={bs.status} detail={bs.statusDetail} />}
      </div>

      {shareOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareOpen(false);
          }}
        >
          <div className={`modal ${hostWaiting ? 'modal-lg' : ''}`} role="dialog" aria-label="Invite your opponent">
            <div className="modal-head">
              <span className="modal-title">
                {awaitingPlacement
                  ? 'Opponent connected!'
                  : awaitingJoin
                    ? 'Waiting for opponent to join'
                    : 'Invite your opponent'}
              </span>
              <button className="icon-btn" onClick={() => setShareOpen(false)} aria-label="Close">
                <CloseIcon size={18} />
              </button>
            </div>
            {awaitingPlacement ? (
              <div className="codebox placing-wait">
                <div className="qr-radar">
                  <span className="ping" />
                  <span className="ping" />
                  <span className="ping" />
                  <div className="conn-badge" aria-hidden="true">
                    <TargetIcon size={30} />
                  </div>
                </div>
                <p className="pw-line">
                  <strong>{bs.oppName ?? 'Your opponent'}</strong> is here.
                </p>
                <p className="subtle">
                  Waiting for them to place their ships
                  <span className="ell">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
              </div>
            ) : (
              <div className="codebox">
                {/* QR of the invite link with a radar ping rippling off its frame. */}
                <div className="qr-radar">
                  {awaitingJoin && (
                    <>
                      <span className="ping" />
                      <span className="ping" />
                      <span className="ping" />
                    </>
                  )}
                  <div className="qr-frame">
                    <QRCodeSVG value={shareUrl} size={132} bgColor="#e2e8f0" fgColor="#0b1220" level="M" />
                  </div>
                </div>
                <div className="lbl">Share this code</div>
                <div className="code">{bs.code}</div>
                <p className="subtle" style={{ margin: '8px 0 14px' }}>
                  {awaitingJoin
                    ? 'Give this code to the other player. The battle starts the moment they join.'
                    : 'Open Ship Battle on the other iPad and tap “Join with a code”.'}
                </p>
                <button className="btn btn-primary" onClick={copyShare}>
                  {copied ? 'Link copied' : 'Copy invite link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {bs.side && bs.status === 'error' && (
        <div className="panel narrow-col">
          <p className="subtle" style={{ color: 'var(--bad)' }}>
            {bs.statusDetail ?? 'Connection error.'}
          </p>
          <button className="btn btn-block" onClick={exitToMenu}>← Back to menu</button>
        </div>
      )}

      {bs.phase === 'lobby' && (
        <div className="narrow-col">
          <Lobby
            name={profile.profile.name}
            onName={profile.setName}
            onHost={bs.hostGame}
            onJoin={bs.joinGame}
            initialJoinCode={joinCode ?? undefined}
          />
        </div>
      )}

      {bs.phase === 'fleet' && (
        <div className="narrow-col">
          <FleetSelect
            profile={profile.profile}
            selectedSkinId={bs.mySkinId}
            name={profile.profile.name}
            onName={(name) => {
              profile.setName(name);
              bs.setMyName(name);
            }}
            onSelect={(id) => {
              profile.update((p) => selectSkin(p, id));
              bs.chooseSkin(id);
            }}
            onUnlock={(id) => profile.update((p) => buySkin(p, id))}
            onContinue={bs.confirmSkin}
          />
        </div>
      )}

      {(bs.phase === 'placing' || bs.phase === 'waiting') && (
        <Placement
          skinId={bs.mySkinId}
          fleet={bs.myFleet}
          onChange={bs.setFleet}
          onReady={bs.confirmReady}
          waiting={bs.phase === 'waiting'}
        />
      )}

      {bs.phase === 'battle' && bs.side && (
        <Battle
          log={bs.log}
          side={bs.side}
          myName={bs.myName}
          oppName={bs.oppName ?? 'Opponent'}
          skinId={bs.mySkinId}
          oppSkinId={bs.oppSkinId ?? bs.mySkinId}
          myFleet={bs.myFleet}
          myTurn={bs.myTurn}
          pendingFire={bs.pendingFire}
          onFire={bs.fire}
        />
      )}

      {bs.phase === 'over' && finish && (
        <div className="narrow-col">
          <Result
            won={finish.won}
            pointsEarned={finish.pointsEarned}
            totalPoints={profile.profile.points}
            myName={bs.myName}
            oppName={bs.oppName ?? 'Opponent'}
            iWantRematch={bs.iWantRematch}
            oppWantsRematch={bs.oppWantsRematch}
            onRematch={bs.requestRematch}
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
