/**
 * Rainbow Racer's phase orchestrator: which screen is up (mode → pick →
 * lobby → race → over), who I am, and the wiring between the net layer and
 * the live race. The screens themselves live in RacerSetup / Track3D /
 * WinOverlay, and the race rules in domain/race.ts.
 */
import '../styles/racer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { useProfile } from '@shared/profile/useProfile';
import { createRaceCore, takeWorldSnapshot, type RaceMode } from '../domain/race';
import { useRacerNet } from '../net/useRacerNet';
import { DRIVERS, driverById, lookOf, ModeScreen, PickScreen, RacerLobby, type Driver } from './RacerSetup';
import { Track3D, type RaceCtx } from './Track3D';
import { WinOverlay } from './WinOverlay';

type Phase = 'mode' | 'pick' | 'lobby' | 'race' | 'over';

const TARGET = 20;

export function RacerPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('mode');
  const [mode, setMode] = useState<RaceMode>('solo');
  const [driver, setDriver] = useState<Driver>(DRIVERS[0]);
  const profile = useProfile();
  const [raceKey, setRaceKey] = useState(0);

  const ctxRef = useRef<RaceCtx | null>(null);
  const net = useRacerNet({
    name: profile.profile.name.trim() || 'Racer',
    driver: driver.id,
    target: TARGET,
    // Said in `hello` so a reconnect mid-race re-syncs instead of restarting.
    inRace: () => ctxRef.current !== null,
    // The host's authoritative world, re-sent on every channel (re)open.
    getWorld: () => (ctxRef.current ? takeWorldSnapshot(ctxRef.current) : null),
  });

  /** Build a fresh race and switch to the race screen. */
  const startRace = useCallback(
    (d: Driver, m: RaceMode) => {
      const myLook = lookOf(d);
      if (m === 'solo') {
        ctxRef.current = {
          ...createRaceCore('solo', 0, TARGET, Math.random),
          looks: [myLook],
          names: [profile.profile.name || 'You'],
        };
      } else {
        const isHost = net.role === 'host';
        const theirLook = lookOf(driverById(net.theirDriver ?? 'unicorn'));
        ctxRef.current = {
          ...createRaceCore('net', isHost ? 0 : 1, TARGET, Math.random),
          looks: isHost ? [myLook, theirLook] : [theirLook, myLook],
          names: isHost
            ? [profile.profile.name.trim() || 'You', net.theirName]
            : [net.theirName, profile.profile.name.trim() || 'You'],
        };
      }
      setRaceKey((k) => k + 1);
      setPhase('race');
    },
    [net, profile.profile.name],
  );

  // When the host says "go" (start or rematch), both sides (re)begin the race.
  const startNonce = net.startNonce;
  const lastStartRef = useRef(0);
  useEffect(() => {
    if (mode === 'net' && startNonce > 0 && startNonce !== lastStartRef.current) {
      lastStartRef.current = startNonce;
      startRace(driver, 'net');
    }
  }, [startNonce, mode, driver, startRace]);

  const chooseMode = (m: RaceMode) => {
    setMode(m);
    setPhase('pick');
  };

  const pickDriver = (d: Driver) => {
    setDriver(d);
    // Solo starts at once with the chosen driver (no stale-closure race);
    // two-player heads to the lobby and waits for the host's "go".
    if (mode === 'solo') startRace(d, 'solo');
    else setPhase('lobby');
  };

  const leaveToMenu = () => {
    net.leave();
    ctxRef.current = null;
    lastStartRef.current = 0;
    setPhase('mode');
  };

  const playAgain = () => {
    if (mode === 'solo') startRace(driver, 'solo');
    else if (net.role === 'host') net.hostRestart();
    else net.requestRematch();
  };

  // ---- screens ----
  if (phase === 'mode') {
    return (
      <Shell onMenu={() => navigate('/')}>
        <ModeScreen onPick={chooseMode} />
      </Shell>
    );
  }

  if (phase === 'pick') {
    return (
      <Shell onMenu={() => setPhase('mode')}>
        <PickScreen mode={mode} onPick={pickDriver} />
      </Shell>
    );
  }

  if (phase === 'lobby') {
    return (
      <Shell onMenu={leaveToMenu}>
        <RacerLobby driver={driver} net={net} />
      </Shell>
    );
  }

  // race | over
  return (
    <Shell onMenu={leaveToMenu}>
      <Track3D key={raceKey} ctxRef={ctxRef} net={net} onOver={() => setPhase('over')} />
      {phase === 'over' && ctxRef.current && (
        <WinOverlay ctx={ctxRef.current} onAgain={playAgain} onMenu={leaveToMenu} />
      )}
    </Shell>
  );
}

function Shell({ children, onMenu }: { children: React.ReactNode; onMenu: () => void }) {
  return (
    <div className="racer-root">
      <div className="racer-topbar">
        <button className="racer-back" onClick={onMenu} data-testid="racer-back">‹ Menu</button>
        <span className="racer-title-mini">Rainbow Racer</span>
        <FullscreenButton />
      </div>
      {children}
    </div>
  );
}
