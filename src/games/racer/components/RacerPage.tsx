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
import { recordResultFor } from '@shared/profile/results';
import { useParty } from '@shared/party/PartyContext';
import { createRaceCore, takeWorldSnapshot, type RaceMode } from '../domain/race';
import { useRacerNet } from '../net/useRacerNet';
import { DRIVERS, driverById, lookOf, ModeScreen, PickScreen, RacerLobby, type Driver } from './RacerSetup';
import { Track3D, type RaceCtx } from './Track3D';
import { WinOverlay } from './WinOverlay';

type Phase = 'mode' | 'pick' | 'lobby' | 'race' | 'over';

const TARGET = 20;

/**
 * Who this device is racing as, and against whom — captured when a
 * two-player race starts, so the finish credits the ticket that sat down
 * (never whoever is signed in minutes later). One per race: `race` ties it to
 * that race's ctx, and the finish consumes it, so a re-render or the host's
 * late "race over" re-sync can't record the same race twice.
 */
interface PendingCredit {
  race: RaceCtx;
  userId: string | null;
  opponent: string;
  code: string;
}

export function RacerPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('mode');
  const [mode, setMode] = useState<RaceMode>('solo');
  const [driver, setDriver] = useState<Driver>(DRIVERS[0]);
  const profile = useProfile();
  const party = useParty();
  const [raceKey, setRaceKey] = useState(0);

  // The ticket gate guarantees a signed-in name; no fallback of our own.
  const myName = profile.profile.name.trim();

  const ctxRef = useRef<RaceCtx | null>(null);
  const creditRef = useRef<PendingCredit | null>(null);
  const net = useRacerNet({
    name: myName,
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
        // A time trial, not a result — nothing to credit at the finish.
        ctxRef.current = {
          ...createRaceCore('solo', 0, TARGET, Math.random),
          looks: [myLook],
          names: [myName],
        };
        creditRef.current = null;
      } else {
        const isHost = net.role === 'host';
        const theirLook = lookOf(driverById(net.theirDriver ?? 'unicorn'));
        const race: RaceCtx = {
          ...createRaceCore('net', isHost ? 0 : 1, TARGET, Math.random),
          looks: isHost ? [myLook, theirLook] : [theirLook, myLook],
          names: isHost ? [myName, net.theirName] : [net.theirName, myName],
        };
        ctxRef.current = race;
        creditRef.current = { race, userId: net.seatedUserId, opponent: net.theirName, code: net.code };
      }
      setRaceKey((k) => k + 1);
      setPhase('race');
    },
    [net, myName],
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
    // The party host walking away closes the table, so the friend's screen
    // stops waiting on a race that isn't there any more. (The party ignores
    // this unless we are the host and this is the open table — a solo race
    // has no code and closes nothing.)
    if (net.code) party.closeTable(net.code);
    net.leave();
    ctxRef.current = null;
    creditRef.current = null;
    lastStartRef.current = 0;
    setPhase('mode');
  };

  /**
   * The race on screen just ended (Track3D says so once per race). Show the
   * card, and credit the racer on this device with the win or loss — the
   * other racer is on the other iPad with their own ticket. A tie, a solo
   * time trial, or a seat with no ticket records nothing.
   */
  const finishRace = () => {
    setPhase('over');
    const ctx = ctxRef.current;
    const credit = creditRef.current;
    creditRef.current = null;
    if (!ctx || !credit || credit.race !== ctx || ctx.winner === null) return;
    recordResultFor(credit.userId, {
      won: ctx.winner === ctx.myIndex,
      survivingCells: 0,
      code: credit.code,
      game: 'racer',
      opponent: credit.opponent,
      finishedAt: Date.now(),
    });
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
        <RacerLobby driver={driver} net={net} seatedUserId={profile.userId} />
      </Shell>
    );
  }

  // race | over
  return (
    <Shell onMenu={leaveToMenu}>
      <Track3D key={raceKey} ctxRef={ctxRef} net={net} onOver={finishRace} />
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
