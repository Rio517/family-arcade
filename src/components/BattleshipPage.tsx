import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useProfile } from '../state/useProfile';
import { useBattleship } from '../state/useBattleship';
import { pointsForResult } from '../state/profile';
import { skinById } from '../game/constants';
import { Lobby } from './Lobby';
import { FleetSelect } from './FleetSelect';
import { Placement } from './Placement';
import { Battle } from './Battle';
import { Result } from './Result';
import { ConnectionBadge } from './ConnectionBadge';

interface FinishInfo {
  won: boolean;
  pointsEarned: number;
}

export function BattleshipPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useProfile();
  const [finish, setFinish] = useState<FinishInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const onFinish = useCallback(
    (info: { won: boolean; survivingCells: number; code: string; opponent: string }) => {
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
    skinId: profile.profile.lastSkinId,
    onFinish,
  });

  // Resume a saved game or auto-open a shared join code — exactly once.
  const bootRef = useRef(false);
  const resumeCode = params.get('resume');
  const joinCode = params.get('g');
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (resumeCode) bs.resumeGame(resumeCode);
  }, [resumeCode, bs]);

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

  return (
    <div className="app">
      <div className="topbar">
        <button className="back-link" onClick={goMenu} data-testid="back">
          ‹ Menu
        </button>
        <h1>Battleship</h1>
        <span className="spacer" />
        {bs.side && <ConnectionBadge status={bs.status} detail={bs.statusDetail} />}
      </div>

      {showCode && (
        <div className="panel codebox">
          <div className="lbl">Share this code</div>
          <div className="code" data-testid="game-code">{bs.code}</div>
          <p className="subtle" style={{ margin: '8px 0 14px' }}>
            Open Battleship on the other iPad and tap “Join with a code”.
          </p>
          <button className="btn btn-primary" onClick={copyShare}>
            {copied ? 'Link copied ✓' : '🔗 Copy invite link'}
          </button>
        </div>
      )}

      {bs.side && bs.status === 'error' && (
        <div className="panel">
          <p className="subtle" style={{ color: 'var(--bad)' }}>
            {bs.statusDetail ?? 'Connection error.'}
          </p>
          <button className="btn btn-block" onClick={exitToMenu}>← Back to menu</button>
        </div>
      )}

      {bs.phase === 'lobby' && (
        <Lobby
          name={profile.profile.name}
          onName={profile.setName}
          onHost={bs.hostGame}
          onJoin={bs.joinGame}
          initialJoinCode={joinCode ?? undefined}
        />
      )}

      {bs.phase === 'fleet' && (
        <FleetSelect
          profile={profile.profile}
          selectedSkinId={bs.mySkinId}
          onSelect={(id) => {
            profile.selectSkin(id);
            bs.chooseSkin(id);
          }}
          onUnlock={(id) => profile.unlockSkin(skinById(id))}
          onContinue={bs.confirmSkin}
        />
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
        <Result
          won={finish.won}
          pointsEarned={finish.pointsEarned}
          totalPoints={profile.profile.points}
          oppName={bs.oppName ?? 'Opponent'}
          iWantRematch={bs.iWantRematch}
          oppWantsRematch={bs.oppWantsRematch}
          onRematch={bs.requestRematch}
          onExit={exitToMenu}
        />
      )}

      <div className="footer">
        <Link to="/">Family game console</Link>
      </div>
    </div>
  );
}
