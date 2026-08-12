import '../styles/unicorn.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { BoltIcon, CoinIcon, MagnetIcon, SparkleIcon } from '@shared/ui/icons';
import {
  createGame,
  FIELD_H,
  FIELD_W,
  setDir,
  step,
  winners,
  type GameState,
  type PlayerConfig,
  type PowerKind,
  type World,
} from '../domain/engine';
import {
  PLAYER_COLORS,
  PLAYER_NAMES,
  WORLDS,
  WORLD_LIST,
  type Character,
} from '../domain/content';
import { pickPlayerForTouch, steerToward } from '../domain/input';
import { renderScene } from './scene';

type Phase = 'players' | 'world' | 'characters' | 'play' | 'over';


/** Keyboard steering for up to three seats. Player 1 can also drag/tap. */
const KEYMAP: Record<number, { up: string[]; down: string[]; left: string[]; right: string[] }> = {
  0: { up: ['arrowup'], down: ['arrowdown'], left: ['arrowleft'], right: ['arrowright'] },
  1: { up: ['w'], down: ['s'], left: ['a'], right: ['d'] },
  2: { up: ['i'], down: ['k'], left: ['j'], right: ['l'] },
};

const POWER_CHIP: Record<PowerKind, { Icon: typeof BoltIcon; label: string }> = {
  speed: { Icon: BoltIcon, label: 'Speed' },
  magnet: { Icon: MagnetIcon, label: 'Magnet' },
  shield: { Icon: SparkleIcon, label: 'Shield' },
};

export function UnicornPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('players');
  const [playerCount, setPlayerCount] = useState(1);
  const [world, setWorld] = useState<World>('sky');
  const [picks, setPicks] = useState<(Character | null)[]>([]);
  const [pickingSeat, setPickingSeat] = useState(0);

  // The live game lives in a ref so the animation loop never restarts on a
  // React render. A version counter nudges the HUD to repaint a few times a
  // second without re-running the physics.
  const gameRef = useRef<GameState | null>(null);
  const [, setTick] = useState(0);

  const startGame = useCallback(
    (chosen: Character[]) => {
      const players: PlayerConfig[] = chosen.map((c, i) => ({
        id: i,
        name: PLAYER_NAMES[i],
        color: PLAYER_COLORS[i],
        emoji: c.emoji,
        mount: c.mount,
      }));
      gameRef.current = createGame({ world, players });
      setPhase('play');
    },
    [world],
  );

  // ----- setup flow -----
  const chooseCount = (n: number) => {
    setPlayerCount(n);
    setPicks(Array(n).fill(null));
    setPhase('world');
  };

  const chooseWorld = (w: World) => {
    setWorld(w);
    setPickingSeat(0);
    setPhase('characters');
  };

  const chooseCharacter = (c: Character) => {
    const next = picks.slice();
    next[pickingSeat] = c;
    setPicks(next);
    if (pickingSeat + 1 < playerCount) {
      setPickingSeat(pickingSeat + 1);
    } else {
      startGame(next as Character[]);
    }
  };

  const backToStart = () => {
    gameRef.current = null;
    setPhase('players');
  };

  const playAgain = () => {
    // Same players and world — jump straight back into a fresh round.
    const chosen = picks.filter(Boolean) as Character[];
    if (chosen.length === playerCount) startGame(chosen);
    else setPhase('players');
  };

  if (phase === 'players') {
    return (
      <Shell onMenu={() => navigate('/')}>
        <SetupCard title="Klara's Magic Coin Game" subtitle="How many players?">
          <div className="uni-choices">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                className="uni-big-btn"
                data-testid={`uni-players-${n}`}
                onClick={() => chooseCount(n)}
              >
                <span className="uni-big-emoji">{n === 1 ? '🦄' : n === 2 ? '🦄🐉' : '🦄🐉🧜‍♀️'}</span>
                <span className="uni-big-label">{n} {n === 1 ? 'Player' : 'Players'}</span>
              </button>
            ))}
          </div>
        </SetupCard>
      </Shell>
    );
  }

  if (phase === 'world') {
    return (
      <Shell onMenu={backToStart}>
        <SetupCard title="Pick your world" subtitle="Where do you want to play?">
          <div className="uni-choices">
            {WORLD_LIST.map((w) => (
              <button
                key={w.id}
                className={`uni-big-btn uni-world-${w.id}`}
                data-testid={`uni-world-${w.id}`}
                onClick={() => chooseWorld(w.id)}
              >
                <span className="uni-big-emoji">{w.emoji}</span>
                <span className="uni-big-label">{w.name}</span>
                <span className="uni-big-sub">{w.move} around and collect coins!</span>
              </button>
            ))}
          </div>
        </SetupCard>
      </Shell>
    );
  }

  if (phase === 'characters') {
    const info = WORLDS[world];
    return (
      <Shell onMenu={backToStart}>
        <SetupCard
          title={playerCount > 1 ? `${PLAYER_NAMES[pickingSeat]}, pick your character` : 'Pick your character'}
          subtitle={`${info.emoji} ${info.name}`}
          accent={PLAYER_COLORS[pickingSeat]}
        >
          <div className="uni-cast">
            {info.characters.map((c) => (
              <button
                key={c.id}
                className="uni-cast-btn"
                data-testid={`uni-char-${c.id}`}
                onClick={() => chooseCharacter(c)}
              >
                <span className="uni-cast-emoji">
                  {c.mount ? (
                    <>
                      <span className="uni-cast-mount">{c.mount}</span>
                      <span className="uni-cast-rider">{c.emoji}</span>
                    </>
                  ) : (
                    c.emoji
                  )}
                </span>
                <span className="uni-cast-name">{c.name}</span>
                <span className="uni-cast-blurb">{c.blurb}</span>
              </button>
            ))}
          </div>
          {playerCount > 1 && (
            <div className="uni-seat-dots">
              {Array.from({ length: playerCount }).map((_, i) => (
                <span
                  key={i}
                  className={`uni-dot ${i < pickingSeat ? 'done' : i === pickingSeat ? 'now' : ''}`}
                  style={{ background: i <= pickingSeat ? PLAYER_COLORS[i] : undefined }}
                />
              ))}
            </div>
          )}
        </SetupCard>
      </Shell>
    );
  }

  // phase === 'play' | 'over'
  return (
    <Shell onMenu={backToStart}>
      <PlayField
        gameRef={gameRef}
        onOver={() => setPhase('over')}
        onFrame={() => setTick((t) => (t + 1) % 1_000_000)}
      />
      {phase === 'over' && gameRef.current && (
        <WinOverlay game={gameRef.current} onAgain={playAgain} onMenu={backToStart} />
      )}
    </Shell>
  );
}

/** The canvas + the running game loop + the live scoreboard. */
function PlayField({
  gameRef,
  onOver,
  onFrame,
}: {
  gameRef: React.MutableRefObject<GameState | null>;
  onOver: () => void;
  onFrame: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  // The parent passes fresh arrow functions each render; route them through
  // refs so the animation loop's effect never restarts. (Restarting it ~10×/s
  // reset `last` each time, silently running the whole game ~14% slow.)
  const onOverRef = useRef(onOver);
  onOverRef.current = onOver;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  // Every active touch/mouse pointer, keyed by pointerId, each remembering which
  // character it grabbed. This is what makes multi-touch work: one entry per
  // finger, so several players steer at once.
  const pointersRef = useRef<Map<number, { x: number; y: number; playerId: number }>>(new Map());

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

  // The animation loop: read input, step physics, draw. Runs once for the
  // lifetime of the play screen.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let overFired = false;
    let hudBeat = 0;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const game = gameRef.current;
      const canvas = canvasRef.current;
      if (!game || !canvas) return;

      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;

      applyInput(game, keysRef.current, pointersRef.current);
      if (game.status === 'playing') step(game, dt);

      renderScene(canvas, game, ts / 1000);

      // Nudge the HUD ~10×/sec, not every frame.
      hudBeat += dt;
      if (hudBeat > 0.1) {
        hudBeat = 0;
        onFrameRef.current();
      }

      if (game.status === 'over') {
        if (!overFired) {
          overFired = true;
          onOverRef.current();
        }
      } else {
        // "Play again" swaps in a fresh game without remounting this loop —
        // re-arm so the NEXT win fires the overlay too.
        overFired = false;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const pointers = pointersRef.current;

    // A finger/mouse lifted or was cancelled → let go of its character.
    if (e.type === 'pointerup' || e.type === 'pointercancel' || e.type === 'lostpointercapture') {
      pointers.delete(e.pointerId);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * FIELD_W;
    const fy = ((e.clientY - rect.top) / rect.height) * FIELD_H;

    if (e.type === 'pointerdown') {
      const game = gameRef.current;
      if (!game) return;
      const taken = new Set<number>();
      for (const v of pointers.values()) taken.add(v.playerId);
      const players = game.players.map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y }));
      const playerId = pickPlayerForTouch(players, taken, { x: fx, y: fy });
      if (playerId == null) return; // every character already has a finger
      // Capture so we keep getting this finger's moves even if it slides off.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore — capture is a nicety, not required
      }
      pointers.set(e.pointerId, { x: fx, y: fy, playerId });
      return;
    }

    // pointermove — update the finger this pointer already owns.
    const entry = pointers.get(e.pointerId);
    if (entry) {
      entry.x = fx;
      entry.y = fy;
    }
  };

  const game = gameRef.current;

  return (
    <div className="uni-stage">
      {game && <Scoreboard game={game} />}
      <canvas
        ref={canvasRef}
        className="uni-canvas"
        data-testid="uni-canvas"
        width={FIELD_W}
        height={FIELD_H}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerCancel={onPointer}
        onLostPointerCapture={onPointer}
      />
      <p className="uni-hint">
        {game && game.players.length > 1
          ? 'On a tablet, each player drags their own character — all at once! 🖐️'
          : 'Drag your character around the picture — or use the arrow keys. 🖐️'}
        {game && game.players.length > 1
          ? ' Keys: Player 1 = arrows · Player 2 = W A S D' +
            (game.players.length > 2 ? ' · Player 3 = I J K L' : '')
          : ''}
      </p>
    </div>
  );
}

function Scoreboard({ game }: { game: GameState }) {
  return (
    <div className="uni-scoreboard">
      {game.players.map((p) => (
        <div
          key={p.id}
          className="uni-score"
          data-testid={`uni-score-${p.id}`}
          style={{ borderColor: p.color }}
        >
          <span className="uni-score-face">{p.mount ?? p.emoji}</span>
          <span className="uni-score-coins">
            <CoinIcon size={16} />
            <b style={{ color: p.color }}>{p.coins}</b>
            <span className="uni-score-target">/{game.target}</span>
          </span>
          {p.power && <PowerChip kind={p.power.kind} />}
        </div>
      ))}
    </div>
  );
}

/** A power-up badge: shared-style line icon + name, no emoji in the chrome. */
function PowerChip({ kind }: { kind: PowerKind }) {
  const { Icon, label } = POWER_CHIP[kind];
  return (
    <span className="uni-score-power">
      <Icon size={14} />
      {label}
    </span>
  );
}

function WinOverlay({
  game,
  onAgain,
  onMenu,
}: {
  game: GameState;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const champs = winners(game);
  const tie = champs.length > 1;
  return (
    <div className="uni-win" data-testid="uni-win">
      <div className="uni-win-card">
        <div className="uni-win-burst" aria-hidden="true">🎉✨🌈✨🎉</div>
        <h2>{tie ? "It's a tie!" : `${champs[0].name} wins!`}</h2>
        <div className="uni-win-faces">
          {champs.map((c) => (
            <span key={c.id} className="uni-win-face" style={{ color: c.color }}>
              {c.mount ?? c.emoji}
            </span>
          ))}
        </div>
        <p className="uni-win-score">
          {champs.map((c, i) => (
            <span key={c.id}>
              {i > 0 && '  ·  '}
              {c.name}: {c.coins} <CoinIcon size={14} />
            </span>
          ))}
        </p>
        <div className="uni-win-btns">
          <button className="uni-primary" data-testid="uni-again" onClick={onAgain}>
            Play again
          </button>
          <button className="uni-ghost" data-testid="uni-new" onClick={onMenu}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- shared bits -----

function Shell({ children, onMenu }: { children: React.ReactNode; onMenu: () => void }) {
  return (
    <div className="uni-root">
      <div className="uni-topbar">
        <button className="uni-back" data-testid="uni-back" onClick={onMenu}>‹ Menu</button>
        <span className="uni-title-mini">Magic Coins</span>
        <FullscreenButton />
      </div>
      {children}
    </div>
  );
}

function SetupCard({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="uni-setup">
      <div className="uni-setup-head" style={accent ? { color: accent } : undefined}>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ----- input helpers -----

const STEER_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'w', 'a', 's', 'd', 'i', 'j', 'k', 'l',
]);

function applyInput(
  game: GameState,
  keys: Set<string>,
  pointers: Map<number, { x: number; y: number; playerId: number }>,
) {
  // Which character each finger is holding, so we can look it up per player.
  const touchByPlayer = new Map<number, { x: number; y: number }>();
  for (const v of pointers.values()) touchByPlayer.set(v.playerId, v);

  game.players.forEach((p, seat) => {
    const map = KEYMAP[seat];
    let x = 0;
    let y = 0;
    if (map) {
      if (map.left.some((k) => keys.has(k))) x -= 1;
      if (map.right.some((k) => keys.has(k))) x += 1;
      if (map.up.some((k) => keys.has(k))) y -= 1;
      if (map.down.some((k) => keys.has(k))) y += 1;
      if (x !== 0 && y !== 0) {
        // Normalize diagonals, or a keyboard seat out-accelerates a touch
        // seat by √2 on every diagonal — unfair on a shared tablet.
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
    }

    // A finger dragging this character steers it (keyboard, if pressed, wins).
    if (x === 0 && y === 0) {
      const touch = touchByPlayer.get(p.id);
      if (touch) {
        const dir = steerToward(p.pos, touch);
        x = dir.x;
        y = dir.y;
      }
    }

    setDir(game, p.id, { x, y });
  });
}
