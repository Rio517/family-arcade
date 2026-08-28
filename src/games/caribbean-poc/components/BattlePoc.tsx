import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBattle,
  stepBattle,
  type Ammunition,
  type BattleState,
  type Broadside,
  type SailSetting,
} from '../domain/battle';
import { opponentCommand } from '../domain/opponent';
import type { BattleScene, SceneMetrics } from '../three/BattleScene';

declare global {
  interface Window {
    __CARIBBEAN_POC_READY__?: boolean;
    __CARIBBEAN_POC_METRICS__?: SceneMetrics & { seed: number; elapsed: number };
  }
}

const SEED = 1702;

function initialBattle(): BattleState {
  const battle = createBattle({ seed: SEED, windFrom: Math.PI / 3, windStrength: 1.05 });
  battle.ships.player.position = { x: -11, z: -16 };
  battle.ships.player.heading = 0.22;
  battle.ships.enemy.position = { x: 11, z: 16 };
  battle.ships.enemy.heading = Math.PI + 0.18;
  return battle;
}

function percent(value: number, max = 100): string {
  return `${Math.round((value / max) * 100)}%`;
}

function conditionClass(value: number): string {
  if (value <= 30) return 'critical';
  if (value <= 60) return 'warning';
  return '';
}

function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return (
    <div className={`cc-meter ${conditionClass((value / max) * 100)}`}>
      <span>{label}</span>
      <strong>{Math.max(0, Math.round(value))}</strong>
      <i aria-hidden="true"><b style={{ width: percent(value, max) }} /></i>
    </div>
  );
}

function WindRose({ from }: { from: number }) {
  const degrees = (from * 180) / Math.PI;
  return (
    <div className="cc-wind" aria-label={`Wind from east-northeast, ${Math.round(degrees)} degrees`}>
      <span>Trade wind</span>
      <svg viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r="27" />
        <path d="M34 7v54M7 34h54" />
        <g style={{ transform: `rotate(${degrees}deg)`, transformOrigin: '34px 34px' }}>
          <path className="arrow" d="M34 8l7 18-7-4-7 4z" />
        </g>
      </svg>
      <strong>Fresh</strong>
    </div>
  );
}

function TouchButton({ side, onFire, disabled }: { side: Broadside; onFire: (side: Broadside) => void; disabled: boolean }) {
  return (
    <button
      className={`cc-fire cc-fire-${side}`}
      type="button"
      onClick={() => onFire(side)}
      disabled={disabled}
      aria-label={`Fire ${side} broadside`}
      data-testid={`fire-${side}`}
    >
      <span>{side === 'port' ? 'Q' : 'E'}</span>
      <strong>{side}</strong>
      <small>Fire</small>
    </button>
  );
}

export function BattlePoc() {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<BattleScene | null>(null);
  const firstBattle = useMemo(() => initialBattle(), []);
  const battle = useRef(firstBattle);
  const held = useRef({ left: false, right: false });
  const fire = useRef<Broadside | undefined>();
  const sail = useRef<SailSetting>('full');
  const ammo = useRef<Ammunition>('round');
  const [view, setView] = useState(() => structuredClone(firstBattle));
  const [selectedAmmo, setSelectedAmmo] = useState<Ammunition>('round');
  const [selectedSail, setSelectedSail] = useState<SailSetting>('full');
  const [metrics, setMetrics] = useState<SceneMetrics>({ fps: 0, drawCalls: 0, triangles: 0, textures: 0 });
  const [loading, setLoading] = useState('Preparing the battle…');
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const debug = useMemo(() => new URLSearchParams(location.search).get('debug') === '1', []);

  const restart = useCallback(() => {
    battle.current = initialBattle();
    sail.current = 'full';
    ammo.current = 'round';
    fire.current = undefined;
    setSelectedAmmo('round');
    setSelectedSail('full');
    setPaused(false);
    setView(structuredClone(battle.current));
  }, []);

  const requestFire = useCallback((side: Broadside) => {
    fire.current = side;
  }, []);

  useEffect(() => {
    const holder = stage.current;
    if (!holder) return;
    let cancelled = false;
    let animation = 0;
    let last = performance.now();
    let hudClock = 0;

    (async () => {
      try {
        const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        const { BattleScene } = await import('../three/BattleScene');
        const built = await BattleScene.create(holder, reducedMotion);
        if (cancelled) {
          built.dispose();
          return;
        }
        scene.current = built;
        setLoading('');
        window.__CARIBBEAN_POC_READY__ = true;

        const loop = (now: number) => {
          const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
          last = now;
          if (!battle.current.outcome && !battle.current.paused) {
            const rudder = (held.current.left ? -1 : 0) + (held.current.right ? 1 : 0);
            const command = {
              player: {
                rudder,
                sail: sail.current,
                ammo: ammo.current,
                fire: fire.current,
              },
              enemy: opponentCommand(battle.current),
            };
            fire.current = undefined;
            battle.current = stepBattle(battle.current, command, dt);
          }
          built.sync(battle.current);
          built.render(dt);
          hudClock += dt;
          if (hudClock >= 0.1) {
            hudClock = 0;
            const nextMetrics = built.metrics();
            setMetrics(nextMetrics);
            setView(structuredClone(battle.current));
            window.__CARIBBEAN_POC_METRICS__ = {
              ...nextMetrics,
              seed: SEED,
              elapsed: battle.current.elapsed,
            };
          }
          animation = requestAnimationFrame(loop);
        };
        animation = requestAnimationFrame(loop);
      } catch (caught) {
        setLoading('');
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animation);
      scene.current?.dispose();
      scene.current = null;
      window.__CARIBBEAN_POC_READY__ = false;
    };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat && ['KeyQ', 'KeyE', 'Space'].includes(event.code)) return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') held.current.left = true;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') held.current.right = true;
      if (event.code === 'KeyQ') fire.current = 'port';
      if (event.code === 'KeyE') fire.current = 'starboard';
      if (event.code === 'Digit1') { ammo.current = 'round'; setSelectedAmmo('round'); }
      if (event.code === 'Digit2') { ammo.current = 'chain'; setSelectedAmmo('chain'); }
      if (event.code === 'Digit3') { ammo.current = 'grape'; setSelectedAmmo('grape'); }
      if (event.code === 'KeyR') {
        sail.current = sail.current === 'full' ? 'reefed' : 'full';
        setSelectedSail(sail.current);
      }
      if (event.code === 'Space') {
        event.preventDefault();
        battle.current.paused = !battle.current.paused;
        setPaused(battle.current.paused);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') held.current.left = false;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') held.current.right = false;
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);

  const holdTurn = (direction: 'left' | 'right', active: boolean) => {
    held.current[direction] = active;
  };
  const chooseAmmo = (choice: Ammunition) => {
    ammo.current = choice;
    setSelectedAmmo(choice);
    setView(structuredClone(battle.current));
  };
  const toggleSail = () => {
    sail.current = sail.current === 'full' ? 'reefed' : 'full';
    setSelectedSail(sail.current);
    setView(structuredClone(battle.current));
  };
  const togglePause = () => {
    battle.current.paused = !battle.current.paused;
    setPaused(battle.current.paused);
  };

  const player = view.ships.player;
  const enemy = view.ships.enemy;
  const outcome = view.outcome;
  return (
    <main className="cc-poc" data-testid="caribbean-poc">
      <div ref={stage} className="cc-stage" data-testid="battle-stage" aria-hidden="true" />
      <div className="cc-vignette" aria-hidden="true" />

      <header className="cc-toprail">
        <div className="cc-title">
          <span>Caribbean Career</span>
          <h1>Windward Passage</h1>
          <small>Naval feel POC · 1702</small>
        </div>
        <WindRose from={view.windFrom} />
        <section className="cc-enemy" aria-label="Enemy ship status">
          <div><span>Hostile sloop</span><strong>{enemy.name}</strong></div>
          <Meter label="Hull" value={enemy.hull} />
          <Meter label="Sails" value={enemy.sails} />
          <Meter label="Crew" value={enemy.crew} max={48} />
        </section>
      </header>

      <aside className="cc-context" aria-label="Voyage context">
        <span>Provisions <strong>3.4 months</strong></span>
        <span>Morale <strong>Happy</strong></span>
        <span>Objective <strong>Disable or capture</strong></span>
      </aside>

      {(loading || error) && (
        <div className="cc-loading" role="status">
          <strong>{error ? 'The sea would not render' : loading}</strong>
          {error && <span>{error}</span>}
        </div>
      )}

      <section className="cc-command" aria-label="Command deck">
        <div className="cc-player-status">
          <div className="cc-ship-name"><span>Your sloop</span><strong>{player.name}</strong></div>
          <Meter label="Hull" value={player.hull} />
          <Meter label="Sails" value={player.sails} />
          <Meter label="Crew" value={player.crew} max={52} />
        </div>

        <div className="cc-rudder" aria-label="Rudder controls">
          <button
            type="button"
            onPointerDown={() => holdTurn('left', true)}
            onPointerUp={() => holdTurn('left', false)}
            onPointerLeave={() => holdTurn('left', false)}
            aria-label="Hold rudder to port"
          ><span>A</span><strong>Port</strong></button>
          <div><span>Rudder</span><i aria-hidden="true" /></div>
          <button
            type="button"
            onPointerDown={() => holdTurn('right', true)}
            onPointerUp={() => holdTurn('right', false)}
            onPointerLeave={() => holdTurn('right', false)}
            aria-label="Hold rudder to starboard"
          ><strong>Starboard</strong><span>D</span></button>
        </div>

        <TouchButton side="port" onFire={requestFire} disabled={player.reload.port > 0 || Boolean(outcome)} />
        <div className="cc-ammo" aria-label="Ammunition">
          {(['round', 'chain', 'grape'] as const).map((choice, index) => (
            <button
              type="button"
              key={choice}
              className={selectedAmmo === choice ? 'selected' : ''}
              onClick={() => chooseAmmo(choice)}
              aria-pressed={selectedAmmo === choice}
            ><span>{index + 1}</span>{choice}</button>
          ))}
          <button type="button" className="cc-sail" onClick={toggleSail}>
            <span>R</span>{selectedSail === 'full' ? 'Full sail' : 'Reefed'}
          </button>
        </div>
        <TouchButton side="starboard" onFire={requestFire} disabled={player.reload.starboard > 0 || Boolean(outcome)} />
      </section>

      <button className="cc-pause" type="button" onClick={togglePause} aria-pressed={paused}>
        {paused ? 'Resume' : 'Pause'} <span>Space</span>
      </button>

      {debug && (
        <output className="cc-debug" data-testid="debug-metrics">
          {metrics.fps} fps · {metrics.drawCalls} calls · {metrics.triangles.toLocaleString()} tris · {metrics.textures} tex
        </output>
      )}

      {(paused || outcome) && (
        <div className="cc-result" role="dialog" aria-modal="true" aria-labelledby="cc-result-title">
          <span>{outcome ? 'Engagement ended' : 'Captain at the chart table'}</span>
          <h2 id="cc-result-title">
            {outcome
              ? outcome.kind === 'surrender'
                ? outcome.victor === 'player' ? 'The enemy strikes its colours' : 'Your crew surrenders'
                : outcome.kind === 'sunk' ? 'A ship is lost' : 'A ship escaped'
              : 'Battle paused'}
          </h2>
          <p>{outcome ? 'The production game would now open capture and cargo resolution.' : 'The sea and simulation are frozen.'}</p>
          <div>
            {!outcome && <button type="button" onClick={togglePause}>Return to deck</button>}
            <button type="button" onClick={restart}>Restart encounter</button>
          </div>
        </div>
      )}

      <p className="cc-announcer" aria-live="polite">
        {outcome ? `Battle ended: ${outcome.kind}` : `${selectedAmmo} shot selected. ${selectedSail} sail.`}
      </p>
    </main>
  );
}
