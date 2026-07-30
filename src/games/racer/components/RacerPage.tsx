import '../styles/racer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { ConnectionBadge } from '@shared/ui/ConnectionBadge';
import { normalizeCode } from '@shared/net/peer';
import {
  collectCoins,
  createCoinField,
  createKart,
  refillCoins,
  startPositions,
  stepMotion,
  type Coin,
  type CoinField,
  type Kart,
  type KartInput,
} from '../domain/kart';
import type { RacerScene, RacerLook } from '../three/scene';
import { useRacerNet } from '../net/useRacerNet';

type Phase = 'mode' | 'pick' | 'lobby' | 'race' | 'over';
type Mode = 'solo' | 'net';

const TARGET = 20;

interface Driver {
  id: string;
  name: string;
  emoji: string;
  color: number;
  css: string;
}

const DRIVERS: Driver[] = [
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', color: 0xff7fc4, css: '#ff7fc4' },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', color: 0x54c274, css: '#54c274' },
  { id: 'fairy', name: 'Fairy', emoji: '🧚', color: 0xffcf4a, css: '#ffcf4a' },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋', color: 0xa78bfa, css: '#a78bfa' },
];

const driverById = (id: string): Driver => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
const lookOf = (d: Driver): RacerLook => ({ emoji: d.emoji, color: d.color });

/** The live race, kept in a ref so the animation loop mutates it allocation-free. */
interface RaceCtx {
  mode: Mode;
  myIndex: number;
  karts: Kart[];
  field: CoinField | null; // the owner (solo player / host) has it; guest is null
  scores: [number, number];
  status: 'racing' | 'over';
  winner: number | null;
  elapsed: number;
  looks: RacerLook[];
  names: string[];
  target: number;
}

export function RacerPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('mode');
  const [mode, setMode] = useState<Mode>('solo');
  const [driver, setDriver] = useState<Driver>(DRIVERS[0]);
  const [name, setName] = useState('Racer');
  const [raceKey, setRaceKey] = useState(0);

  const ctxRef = useRef<RaceCtx | null>(null);
  const net = useRacerNet({ name: name.trim() || 'Racer', driver: driver.id, target: TARGET });

  const beginRace = useCallback(() => {
    const myLook = lookOf(driver);
    if (mode === 'solo') {
      ctxRef.current = {
        mode: 'solo',
        myIndex: 0,
        karts: [createKart()],
        field: createCoinField(Math.random),
        scores: [0, 0],
        status: 'racing',
        winner: null,
        elapsed: 0,
        looks: [myLook],
        names: ['You'],
        target: TARGET,
      };
    } else {
      const isHost = net.role === 'host';
      const theirLook = lookOf(driverById(net.theirDriver ?? 'unicorn'));
      const spots = startPositions(2);
      const karts = spots.map((s) => createKart(s.x, s.z, s.heading));
      net.remotePosRef.current = null;
      net.remoteWorldRef.current = null;
      ctxRef.current = {
        mode: 'net',
        myIndex: isHost ? 0 : 1,
        karts,
        field: isHost ? createCoinField(Math.random) : null,
        scores: [0, 0],
        status: 'racing',
        winner: null,
        elapsed: 0,
        looks: isHost ? [myLook, theirLook] : [theirLook, myLook],
        names: isHost ? [name.trim() || 'You', net.theirName] : [net.theirName, name.trim() || 'You'],
        target: TARGET,
      };
    }
    setRaceKey((k) => k + 1);
    setPhase('race');
  }, [driver, mode, name, net]);

  // When the host says "go" (start or rematch), both sides (re)begin the race.
  const startNonce = net.startNonce;
  const lastStartRef = useRef(0);
  useEffect(() => {
    if (mode === 'net' && startNonce > 0 && startNonce !== lastStartRef.current) {
      lastStartRef.current = startNonce;
      beginRace();
    }
  }, [startNonce, mode, beginRace]);

  const chooseMode = (m: Mode) => {
    setMode(m);
    setPhase('pick');
  };

  const pickDriver = (d: Driver) => {
    setDriver(d);
    if (mode === 'solo') {
      // beginRace reads `driver` from state; set it first, then start next tick.
      setDriverAndStart(d);
    } else {
      setPhase('lobby');
    }
  };

  // Solo: start immediately with the chosen driver (avoid a stale-closure race).
  const setDriverAndStart = (d: Driver) => {
    const myLook = lookOf(d);
    ctxRef.current = {
      mode: 'solo',
      myIndex: 0,
      karts: [createKart()],
      field: createCoinField(Math.random),
      scores: [0, 0],
      status: 'racing',
      winner: null,
      elapsed: 0,
      looks: [myLook],
      names: ['You'],
      target: TARGET,
    };
    setRaceKey((k) => k + 1);
    setPhase('race');
  };

  const leaveToMenu = () => {
    net.leave();
    ctxRef.current = null;
    lastStartRef.current = 0;
    setPhase('mode');
  };

  const playAgain = () => {
    if (mode === 'solo') {
      setDriverAndStart(driver);
    } else if (net.role === 'host') {
      net.hostRestart();
    } else {
      net.requestRematch();
    }
  };

  // ---- screens ----
  if (phase === 'mode') {
    return (
      <Shell onMenu={() => navigate('/')}>
        <div className="racer-setup">
          <div className="racer-setup-head">
            <h1>Rainbow Racer</h1>
            <p>Race around a 3D arena and collect 20 coins! 🪙</p>
          </div>
          <div className="racer-choices">
            <button className="racer-big-btn" onClick={() => chooseMode('solo')}>
              <span className="racer-big-emoji">🦄</span>
              <span className="racer-big-label">1 Player</span>
              <span className="racer-big-sub">Race on your own</span>
            </button>
            <button className="racer-big-btn" onClick={() => chooseMode('net')}>
              <span className="racer-big-emoji">🦄🐉</span>
              <span className="racer-big-label">2 Players</span>
              <span className="racer-big-sub">Race a friend on another device</span>
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'pick') {
    return (
      <Shell onMenu={() => setPhase('mode')}>
        <div className="racer-setup">
          <div className="racer-setup-head">
            <h1>Pick your racer</h1>
            <p>{mode === 'net' ? 'Then connect with your friend.' : 'Then drive and collect 20 coins! 🪙'}</p>
          </div>
          <div className="racer-cast">
            {DRIVERS.map((d) => (
              <button key={d.id} className="racer-cast-btn" style={{ borderColor: d.css }} onClick={() => pickDriver(d)}>
                <span className="racer-cast-emoji">{d.emoji}</span>
                <span className="racer-cast-name" style={{ color: d.css }}>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'lobby') {
    return (
      <Shell onMenu={leaveToMenu}>
        <RacerLobby driver={driver} name={name} setName={setName} net={net} />
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

// ─────────────────────────────────────────────────────────────────────────────

function RacerLobby({
  driver,
  name,
  setName,
  net,
}: {
  driver: Driver;
  name: string;
  setName: (n: string) => void;
  net: ReturnType<typeof useRacerNet>;
}) {
  const [joinMode, setJoinMode] = useState(false);
  const [code, setCode] = useState('');

  if (net.role) {
    // Connecting / waiting.
    return (
      <div className="racer-lobby">
        <ConnectionBadge status={net.status} detail={net.statusDetail} />
        {net.role === 'host' ? (
          <div className="racer-lobby-card">
            <h2>Share this code</h2>
            <div className="racer-code">{net.code}</div>
            <p>Ask your friend to open Rainbow Racer → 2 Players → Join, and type this code.</p>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : 'Waiting for your friend to join…'}
            </p>
          </div>
        ) : (
          <div className="racer-lobby-card">
            <h2>Joining game {net.code}…</h2>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : 'Looking for the host…'}
            </p>
          </div>
        )}
        <button className="racer-ghost" onClick={net.leave}>← Back</button>
      </div>
    );
  }

  return (
    <div className="racer-lobby">
      <div className="racer-lobby-card">
        <h2>Your racer {driver.emoji}</h2>
        <label className="racer-name-label">
          Your name
          <input
            className="racer-name-input"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="Racer"
          />
        </label>
      </div>
      {joinMode ? (
        <div className="racer-lobby-card">
          <h2>Join a game</h2>
          <input
            className="racer-code-input"
            value={code}
            maxLength={4}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button className="racer-primary" disabled={code.length !== 4} onClick={() => net.join(code)}>
            Connect →
          </button>
          <button className="racer-ghost" onClick={() => setJoinMode(false)}>← Back</button>
        </div>
      ) : (
        <div className="racer-lobby-card">
          <h2>Play with a friend</h2>
          <button className="racer-primary" onClick={net.host}>Create a game</button>
          <p className="racer-lobby-status">You’ll get a code to share.</p>
          <button className="racer-ghost" onClick={() => setJoinMode(true)}>Join with a code</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Track3D({
  ctxRef,
  net,
  onOver,
}: {
  ctxRef: React.MutableRefObject<RaceCtx | null>;
  net: ReturnType<typeof useRacerNet>;
  onOver: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ active: boolean; nx: number }>({ active: false, nx: 0 });
  const [, setHud] = useState(0);
  const onOverRef = useRef(onOver);
  onOverRef.current = onOver;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (STEER_KEYS.has(k)) e.preventDefault();
      keysRef.current.add(k);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const ctx = ctxRef.current;
    if (!mount || !ctx) return;
    let scene: RacerScene | undefined;
    let gone = false;

    let raf = 0;
    let last = 0;
    let overFired = false;
    let hudBeat = 0;
    let posBeat = 0;
    let worldBeat = 0;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const c = ctxRef.current;
      if (!c || !scene) return;
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      const t = Math.max(0, Math.min(dt, 0.05));

      const me = c.karts[c.myIndex];
      const input = readInput(keysRef.current, pointerRef.current);
      if (c.status === 'racing') stepMotion(me, t, input);

      let coins: Coin[];

      if (c.mode === 'net') {
        // Tell my opponent where I am (~20/sec).
        posBeat += t;
        if (posBeat > 0.05) {
          posBeat = 0;
          net.sendPos({ x: me.x, z: me.z, heading: me.heading, speed: me.speed });
        }
        // Move the opponent's kart toward their last reported spot (smoothed).
        const other = c.karts[1 - c.myIndex];
        const rp = net.remotePosRef.current;
        if (rp) {
          const k = 1 - Math.pow(0.001, t);
          other.x += (rp.x - other.x) * k;
          other.z += (rp.z - other.z) * k;
          other.heading = lerpAngle(other.heading, rp.heading, k);
          other.speed = rp.speed;
        }

        if (c.myIndex === 0 && c.field) {
          // Host owns the coins + score for BOTH karts.
          if (c.status === 'racing') {
            const hits = collectCoins(c.field, c.karts.map((k) => ({ x: k.x, z: k.z })));
            c.scores[0] += hits[0];
            c.scores[1] += hits[1];
            refillCoins(c.field, c.karts, Math.random);
            c.elapsed += t;
            if (c.scores[0] >= c.target || c.scores[1] >= c.target) {
              c.status = 'over';
              c.winner = c.scores[0] >= c.scores[1] ? 0 : 1;
            }
          }
          worldBeat += t;
          if (worldBeat > 0.08 || (c.status === 'over' && !overFired)) {
            worldBeat = 0;
            net.sendWorld({
              coins: c.field.coins,
              scores: c.scores,
              status: c.status,
              winner: c.winner,
              elapsed: c.elapsed,
            });
          }
          coins = c.field.coins;
        } else {
          // Guest mirrors the host's authoritative world.
          const w = net.remoteWorldRef.current;
          if (w) {
            c.scores = w.scores;
            c.status = w.status;
            c.winner = w.winner;
            c.elapsed = w.elapsed;
          }
          coins = w?.coins ?? [];
        }
      } else {
        // Single player.
        if (c.status === 'racing' && c.field) {
          const hits = collectCoins(c.field, [{ x: me.x, z: me.z }]);
          c.scores[0] += hits[0];
          refillCoins(c.field, [me], Math.random);
          c.elapsed += t;
          if (c.scores[0] >= c.target) {
            c.status = 'over';
            c.winner = 0;
          }
        }
        coins = c.field?.coins ?? [];
      }

      scene.sync({ karts: c.karts, coins }, t);
      scene.render();

      hudBeat += t;
      if (hudBeat > 0.1) {
        hudBeat = 0;
        setHud((h) => (h + 1) % 1_000_000);
      }
      if (c.status === 'over' && !overFired) {
        overFired = true;
        onOverRef.current();
      }
    };
    // three.js loads on demand, same as chess and battleship — visiting the
    // arcade menu (or racing later) must not front-load the 3D library.
    import('../three/scene').then(({ RacerScene: Scene }) => {
      if (gone) return;
      try {
        scene = new Scene(mount, ctx.looks, ctx.myIndex);
      } catch (err) {
        mount.innerHTML =
          '<p data-testid="racer3d-fallback" style="padding:24px;text-align:center;color:#fff">Sorry, this device can\'t show 3D. 😢</p>';
        // eslint-disable-next-line no-console
        console.error(err);
        return;
      }
      raf = requestAnimationFrame(loop);
    });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      scene?.dispose();
    };
    // Build the scene exactly once per race (Track3D is given a per-race key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerup' || e.type === 'pointercancel' || e.type === 'pointerleave') {
      pointerRef.current.active = false;
      return;
    }
    if (e.type === 'pointerdown') pointerRef.current.active = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerRef.current.nx = Math.max(-1, Math.min(1, nx));
  };

  const c = ctxRef.current;

  return (
    <div className="racer-stage">
      {c && (
        <div className="racer-hud">
          {c.mode === 'net' && net.status !== 'connected' && net.status !== 'idle' && (
            <span className="racer-hud-conn">⚠️ {net.statusDetail ?? 'reconnecting…'}</span>
          )}
          {c.looks.map((look, i) => (
            <span key={i} className={`racer-score ${i === c.myIndex ? 'me' : ''}`}>
              <span className="racer-score-face">{look.emoji}</span>
              🪙 <b>{c.scores[i]}</b>
              <span className="racer-score-target">/{c.target}</span>
            </span>
          ))}
          <span className="racer-hud-time">⏱ {c.elapsed.toFixed(1)}s</span>
        </div>
      )}
      <div
        ref={mountRef}
        className="racer-canvas"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerCancel={onPointer}
        onPointerLeave={onPointer}
      />
      <p className="racer-hint">
        Steer: arrow keys ⬅️➡️ · hold ⬆️ to zoom · or drag left/right on the picture 🖐️
      </p>
    </div>
  );
}

function WinOverlay({ ctx, onAgain, onMenu }: { ctx: RaceCtx; onAgain: () => void; onMenu: () => void }) {
  const iWon = ctx.winner === ctx.myIndex;
  const soloWin = ctx.mode === 'solo';
  const title = soloWin
    ? `You got all ${ctx.target} coins!`
    : iWon
      ? 'You win! 🏆'
      : `${ctx.names[ctx.winner ?? 0]} wins!`;
  return (
    <div className="racer-win">
      <div className="racer-win-card">
        <div className="racer-win-burst" aria-hidden="true">🎉✨🏆✨🎉</div>
        <h2>{title}</h2>
        <div className="racer-win-face">{ctx.looks[ctx.winner ?? ctx.myIndex].emoji}</div>
        {ctx.mode === 'net' ? (
          <p className="racer-win-time">
            {ctx.names[0]}: {ctx.scores[0]} 🪙 · {ctx.names[1]}: {ctx.scores[1]} 🪙
          </p>
        ) : (
          <p className="racer-win-time">Your time: <b>{ctx.elapsed.toFixed(1)}s</b> ⏱</p>
        )}
        <div className="racer-win-btns">
          <button className="racer-primary" onClick={onAgain}>Race again 🔁</button>
          <button className="racer-ghost" onClick={onMenu}>Menu ✨</button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, onMenu }: { children: React.ReactNode; onMenu: () => void }) {
  return (
    <div className="racer-root">
      <div className="racer-topbar">
        <button className="racer-back" onClick={onMenu}>‹ Menu</button>
        <span className="racer-title-mini">🏎️ Rainbow Racer 🪙</span>
        <FullscreenButton />
      </div>
      {children}
    </div>
  );
}

// ─── input ───

const STEER_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

function readInput(keys: Set<string>, pointer: { active: boolean; nx: number }): KartInput {
  let steer = 0;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  const boostKey = keys.has('arrowup') || keys.has('w');
  const brake = keys.has('arrowdown') || keys.has('s');
  if (pointer.active && steer === 0) steer = pointer.nx;
  return { steer, boost: boostKey || pointer.active, brake };
}

/** Shortest-path angle lerp so a wrapping heading doesn't spin the long way. */
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
