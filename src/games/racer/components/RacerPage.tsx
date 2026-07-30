import '../styles/racer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { createRace, stepRace, type KartInput, type KartState } from '../domain/kart';
import { RacerScene } from '../three/scene';

type Phase = 'pick' | 'race' | 'over';

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

export function RacerPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('pick');
  const [driver, setDriver] = useState<Driver>(DRIVERS[0]);

  const gameRef = useRef<KartState | null>(null);
  // A key that changes only when a NEW race begins, so <Track> (and its 3D
  // scene) remounts once per race — never on a HUD refresh.
  const [raceKey, setRaceKey] = useState(0);

  // Stable so <Track>'s scene effect never sees a changing prop and rebuilds.
  const handleOver = useCallback(() => setPhase('over'), []);

  const start = (d: Driver) => {
    setDriver(d);
    gameRef.current = createRace({ target: TARGET });
    setRaceKey((k) => k + 1);
    setPhase('race');
  };

  const playAgain = () => {
    gameRef.current = createRace({ target: TARGET });
    setRaceKey((k) => k + 1);
    setPhase('race');
  };

  const backToPick = () => {
    gameRef.current = null;
    setPhase('pick');
  };

  if (phase === 'pick') {
    return (
      <Shell onMenu={() => navigate('/')}>
        <div className="racer-setup">
          <div className="racer-setup-head">
            <h1>Rainbow Racer</h1>
            <p>Pick your racer, then drive around and collect 20 coins! 🪙</p>
          </div>
          <div className="racer-cast">
            {DRIVERS.map((d) => (
              <button
                key={d.id}
                className="racer-cast-btn"
                style={{ borderColor: d.css }}
                onClick={() => start(d)}
              >
                <span className="racer-cast-emoji">{d.emoji}</span>
                <span className="racer-cast-name" style={{ color: d.css }}>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onMenu={backToPick}>
      <Track key={raceKey} gameRef={gameRef} driver={driver} onOver={handleOver} />
      {phase === 'over' && gameRef.current && (
        <WinOverlay game={gameRef.current} driver={driver} onAgain={playAgain} onMenu={backToPick} />
      )}
    </Shell>
  );
}

/** The 3D view + the driving loop + the HUD. */
function Track({
  gameRef,
  driver,
  onOver,
}: {
  gameRef: React.MutableRefObject<KartState | null>;
  driver: Driver;
  onOver: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ active: boolean; nx: number }>({ active: false, nx: 0 });
  // Repaints the HUD a few times a second WITHOUT touching the 3D scene.
  const [, setHud] = useState(0);
  // Latest onOver, read from the loop, so the scene effect can stay build-once.
  const onOverRef = useRef(onOver);
  onOverRef.current = onOver;

  // Keyboard.
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

  // Build the 3D scene once for this race, run the loop, tear it down on exit.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let scene: RacerScene;
    try {
      scene = new RacerScene(mount, { emoji: driver.emoji, color: driver.color });
    } catch (err) {
      // No WebGL (very old device): fail soft with a message.
      mount.innerHTML =
        '<p style="padding:24px;text-align:center;color:#fff">Sorry, this device can\'t show 3D. 😢</p>';
      // eslint-disable-next-line no-console
      console.error(err);
      return;
    }

    let raf = 0;
    let last = 0;
    let overFired = false;
    let hudBeat = 0;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const game = gameRef.current;
      if (!game) return;
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;

      const input = readInput(keysRef.current, pointerRef.current);
      if (game.status === 'racing') stepRace(game, dt, input);
      scene.sync(game, dt);
      scene.render();

      hudBeat += dt;
      if (hudBeat > 0.1) {
        hudBeat = 0;
        setHud((h) => (h + 1) % 1_000_000);
      }
      if (game.status === 'over' && !overFired) {
        overFired = true;
        onOverRef.current();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      scene?.dispose();
    };
    // Build the scene exactly once for this race. <Track> is given a per-race
    // `key`, so a new race remounts it; HUD repaints never re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Touch/mouse steering: horizontal position of the finger steers; holding
  // down also gives a little boost (so "hold and slide" drives the kart).
  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerup' || e.type === 'pointercancel' || e.type === 'pointerleave') {
      pointerRef.current.active = false;
      return;
    }
    if (e.type === 'pointerdown') pointerRef.current.active = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1 left .. +1 right
    pointerRef.current.nx = Math.max(-1, Math.min(1, nx));
  };

  const game = gameRef.current;

  return (
    <div className="racer-stage">
      {game && (
        <div className="racer-hud">
          <span className="racer-hud-coins">
            🪙 <b style={{ color: driver.css }}>{game.coins}</b>
            <span className="racer-hud-target">/{game.target}</span>
          </span>
          <span className="racer-hud-time">⏱ {game.elapsed.toFixed(1)}s</span>
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

function WinOverlay({
  game,
  driver,
  onAgain,
  onMenu,
}: {
  game: KartState;
  driver: Driver;
  onAgain: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="racer-win">
      <div className="racer-win-card">
        <div className="racer-win-burst" aria-hidden="true">🎉✨🏆✨🎉</div>
        <h2>You got all {game.target} coins!</h2>
        <div className="racer-win-face">{driver.emoji}</div>
        <p className="racer-win-time">Your time: <b>{game.elapsed.toFixed(1)}s</b> ⏱</p>
        <div className="racer-win-btns">
          <button className="racer-primary" onClick={onAgain}>Race again 🔁</button>
          <button className="racer-ghost" onClick={onMenu}>New racer ✨</button>
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

// ----- input -----

const STEER_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd',
]);

function readInput(keys: Set<string>, pointer: { active: boolean; nx: number }): KartInput {
  let steer = 0;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  const boostKey = keys.has('arrowup') || keys.has('w');
  const brake = keys.has('arrowdown') || keys.has('s');

  // A finger steers by where it is; holding also boosts.
  if (pointer.active && steer === 0) steer = pointer.nx;

  return { steer, boost: boostKey || pointer.active, brake };
}
