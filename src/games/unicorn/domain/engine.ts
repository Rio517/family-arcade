/**
 * Rainbow Coins — the pure game engine for Klara's Magic Coin game.
 *
 * A game designed by a kid: you pick a world (Sky or Underwater) and a
 * character, then fly or swim around collecting coins. First to 20 coins wins.
 * Every few coins you scoop up, you earn a magic power-up. 1–3 players share
 * one screen.
 *
 * This module holds ZERO rendering and ZERO input handling — just the world
 * state and the physics `step`, so the rules can be unit-tested without a
 * browser. All randomness arrives through an injected `rng` so tests stay
 * deterministic.
 */

/** The logical play field. The canvas scales pixels to fit this box. */
export const FIELD_W = 1000;
export const FIELD_H = 640;

/** Flight/swim feel. Tuned gentle-and-forgiving so a small child can steer. */
const ACCEL = 2600; // units/s² while a direction is held
const FRICTION = 2.2; // velocity damping per second when drifting
const MAX_SPEED = 600; // units/s speed cap
const WALL_BOUNCE = 0.45; // fraction of speed kept when bumping a wall

/** How close you must get to a coin to scoop it up. Generous on purpose. */
const COLLECT_RADIUS = 60;

/** How many coins twinkle on the field at once. */
const COIN_TARGET = 6;

/** Margin so coins never spawn jammed against the edges. */
const COIN_MARGIN = 70;

/** Earn a power-up every time you cross another multiple of this many coins. */
export const MILESTONE = 5;

/** How long a power-up lasts, in seconds. */
const POWER_DURATION = 7;

/** Power tuning. */
const SPEED_MULT = 1.7; // Speed Boost: you (and your animal) go faster
const MAGNET_RADIUS = 240; // Coin Magnet: coins this close drift toward you
const MAGNET_PULL = 380; // units/s a magnetised coin slides toward you
const MAGNET_COLLECT_BONUS = 26; // easier scooping while magnetised
const SHIELD_RADIUS = 155; // Sparkle Shield: rivals this close get shoved
const SHIELD_PUSH = 1500; // units/s² shove applied to a shielded-away rival

export type World = 'sky' | 'ocean';
export type PowerKind = 'speed' | 'magnet' | 'shield';
const ALL_POWERS: PowerKind[] = ['speed', 'magnet', 'shield'];

export interface Vec {
  x: number;
  y: number;
}

export interface PlayerConfig {
  id: number;
  name: string;
  color: string;
  /** The character's face, e.g. "🧚". Opaque to the engine — for rendering. */
  emoji: string;
  /** If the character rides, the mount's face, e.g. "🦄". Rendering only. */
  mount?: string;
}

export interface ActivePower {
  kind: PowerKind;
  timeLeft: number;
}

export interface Player extends PlayerConfig {
  pos: Vec;
  vel: Vec;
  /** Steering input for the next step: each axis in [-1, 1]. */
  dir: Vec;
  coins: number;
  power: ActivePower | null;
  /** Rises to 1 when a coin is grabbed, then fades — lets the view sparkle. */
  glow: number;
}

/**
 * The stamp struck into a coin's face. Most are worth 1; the coloured
 * `rainbow` is the rare treasure worth 2.
 */
export type CoinKind = 'star' | 'smiley' | 'heart' | 'arch' | 'rainbow';

/** How likely each kind is to spawn (rainbow deliberately scarce). */
const COMMON_KINDS: CoinKind[] = ['star', 'smiley', 'heart', 'arch'];
export const RAINBOW_CHANCE = 0.08;
export const RAINBOW_VALUE = 2;

export interface Coin {
  id: number;
  pos: Vec;
  /** 0–360 hue — every coin shimmers a different rainbow color. */
  hue: number;
  kind: CoinKind;
  /** What collecting it scores (rainbows pay double). */
  value: number;
}

export type Status = 'playing' | 'over';

export interface GameState {
  world: World;
  players: Player[];
  coins: Coin[];
  nextCoinId: number;
  /** Coins needed to win. */
  target: number;
  /** Which power-ups can be earned this game. */
  powers: PowerKind[];
  status: Status;
  /** Seconds the round has been running — for a friendly on-screen clock. */
  elapsed: number;
}

export type Rng = () => number;

function randomCoinPos(rng: Rng): Vec {
  return {
    x: COIN_MARGIN + rng() * (FIELD_W - 2 * COIN_MARGIN),
    y: COIN_MARGIN + rng() * (FIELD_H - 2 * COIN_MARGIN),
  };
}

/** Spread up to three players out so nobody starts on top of a rival. */
function startPositions(count: number): Vec[] {
  const y = FIELD_H / 2;
  if (count <= 1) return [{ x: FIELD_W / 2, y }];
  if (count === 2) {
    return [
      { x: FIELD_W * 0.3, y },
      { x: FIELD_W * 0.7, y },
    ];
  }
  return [
    { x: FIELD_W * 0.25, y },
    { x: FIELD_W * 0.5, y },
    { x: FIELD_W * 0.75, y },
  ];
}

export interface NewGameOptions {
  world: World;
  players: PlayerConfig[];
  /** Coins needed to win (default 20). */
  target?: number;
  /** Which power-ups are in play (default all three). */
  powers?: PowerKind[];
  rng?: Rng;
}

export function createGame({
  world,
  players,
  target = 20,
  powers = ALL_POWERS,
  rng = Math.random,
}: NewGameOptions): GameState {
  const spots = startPositions(players.length);
  const state: GameState = {
    world,
    players: players.map((p, i) => ({
      ...p,
      pos: { ...spots[i] },
      vel: { x: 0, y: 0 },
      dir: { x: 0, y: 0 },
      coins: 0,
      power: null,
      glow: 0,
    })),
    coins: [],
    nextCoinId: 1,
    target,
    powers,
    status: 'playing',
    elapsed: 0,
  };
  refillCoins(state, rng);
  return state;
}

/** Point a player. `dir` axes are clamped to [-1, 1]. */
export function setDir(state: GameState, playerId: number, dir: Vec): void {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return;
  p.dir.x = Math.max(-1, Math.min(1, dir.x));
  p.dir.y = Math.max(-1, Math.min(1, dir.y));
}

/** Top up the field so there are always COIN_TARGET coins to chase. */
function refillCoins(state: GameState, rng: Rng): void {
  while (state.coins.length < COIN_TARGET) {
    const rainbow = rng() < RAINBOW_CHANCE;
    state.coins.push({
      id: state.nextCoinId++,
      pos: randomCoinPos(rng),
      hue: Math.floor(rng() * 360),
      kind: rainbow ? 'rainbow' : COMMON_KINDS[Math.floor(rng() * COMMON_KINDS.length)],
      value: rainbow ? RAINBOW_VALUE : 1,
    });
  }
}

function clampSpeed(v: Vec, max: number): void {
  const speed = Math.hypot(v.x, v.y);
  if (speed > max) {
    const k = max / speed;
    v.x *= k;
    v.y *= k;
  }
}

function hasPower(p: Player, kind: PowerKind): boolean {
  return p.power?.kind === kind;
}

/**
 * Advance the world by `dt` seconds. Mutates and returns the same state object,
 * so one call per animation frame allocates nothing. Safe to call after the
 * round is over — it simply does nothing.
 */
export function step(state: GameState, dt: number, rng: Rng = Math.random): GameState {
  if (state.status === 'over') return state;

  // Clamp dt so a lag spike or a backgrounded tab can't teleport anyone
  // through a wall.
  const t = Math.max(0, Math.min(dt, 0.05));

  // 1) Steering: each player accelerates in their chosen direction.
  for (const p of state.players) {
    const boost = hasPower(p, 'speed') ? SPEED_MULT : 1;
    p.vel.x += p.dir.x * ACCEL * boost * t;
    p.vel.y += p.dir.y * ACCEL * boost * t;
    const damp = Math.max(0, 1 - FRICTION * t);
    p.vel.x *= damp;
    p.vel.y *= damp;
    clampSpeed(p.vel, MAX_SPEED * boost);
  }

  // 2) Sparkle Shield: shove rivals who drift too close.
  for (const s of state.players) {
    if (!hasPower(s, 'shield')) continue;
    for (const other of state.players) {
      if (other === s) continue;
      const dx = other.pos.x - s.pos.x;
      const dy = other.pos.y - s.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < SHIELD_RADIUS) {
        const push = SHIELD_PUSH * t;
        other.vel.x += (dx / d) * push;
        other.vel.y += (dy / d) * push;
        // Re-clamp: the shove must not launch a rival past their own top
        // speed (leaning on it used to settle ~14% above MAX_SPEED).
        clampSpeed(other.vel, MAX_SPEED * (hasPower(other, 'speed') ? SPEED_MULT : 1));
      }
    }
  }

  // 3) Coin Magnet: pull nearby coins toward the magnetised player.
  for (const p of state.players) {
    if (!hasPower(p, 'magnet')) continue;
    for (const coin of state.coins) {
      const dx = p.pos.x - coin.pos.x;
      const dy = p.pos.y - coin.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < MAGNET_RADIUS) {
        const move = Math.min(d, MAGNET_PULL * t);
        coin.pos.x += (dx / d) * move;
        coin.pos.y += (dy / d) * move;
      }
    }
  }

  // 4) Integrate positions and bounce softly off the walls.
  for (const p of state.players) {
    p.pos.x += p.vel.x * t;
    p.pos.y += p.vel.y * t;

    if (p.pos.x < 0) {
      p.pos.x = 0;
      p.vel.x = Math.abs(p.vel.x) * WALL_BOUNCE;
    } else if (p.pos.x > FIELD_W) {
      p.pos.x = FIELD_W;
      p.vel.x = -Math.abs(p.vel.x) * WALL_BOUNCE;
    }
    if (p.pos.y < 0) {
      p.pos.y = 0;
      p.vel.y = Math.abs(p.vel.y) * WALL_BOUNCE;
    } else if (p.pos.y > FIELD_H) {
      p.pos.y = FIELD_H;
      p.vel.y = -Math.abs(p.vel.y) * WALL_BOUNCE;
    }

    // Fade timers.
    p.glow = Math.max(0, p.glow - t * 2.5);
    if (p.power) {
      p.power.timeLeft -= t;
      if (p.power.timeLeft <= 0) p.power = null;
    }
  }

  // 5) Scoop up coins, hand out milestone power-ups, refill the field.
  collectCoins(state, rng);
  refillCoins(state, rng);

  state.elapsed += t;

  // 6) Win check: first player to the target coins ends the round.
  if (state.players.some((p) => p.coins >= state.target)) {
    state.status = 'over';
  }
  return state;
}

/**
 * Any player touching a coin scoops it (+1). If two reach the same coin on one
 * frame, the closer one gets it — a fair tie-break. Crossing a new multiple of
 * MILESTONE coins earns a random power-up from the ones in play.
 */
function collectCoins(state: GameState, rng: Rng): void {
  state.coins = state.coins.filter((coin) => {
    let winner: Player | null = null;
    let best = Infinity;
    for (const p of state.players) {
      const reach = COLLECT_RADIUS + (hasPower(p, 'magnet') ? MAGNET_COLLECT_BONUS : 0);
      const d = Math.hypot(p.pos.x - coin.pos.x, p.pos.y - coin.pos.y);
      if (d <= reach && d < best) {
        best = d;
        winner = p;
      }
    }
    if (!winner) return true; // coin survives

    const before = winner.coins;
    winner.coins += coin.value; // rainbows pay double
    winner.glow = 1;
    // No power-up on the winning coin — the round is over before it could
    // ever be used, and the win screen shouldn't show a fresh aura.
    if (
      winner.coins < state.target &&
      Math.floor(winner.coins / MILESTONE) > Math.floor(before / MILESTONE)
    ) {
      grantPower(winner, state.powers, rng);
    }
    return false; // coin consumed
  });
}

/** Give a player a fresh random power-up from the ones this game allows. */
function grantPower(p: Player, powers: PowerKind[], rng: Rng): void {
  const kind = powers[Math.floor(rng() * powers.length)] ?? powers[0];
  p.power = { kind, timeLeft: POWER_DURATION };
}

/**
 * Who is leading right now. Returns every player tied for the most coins, so a
 * draw shows all the leaders.
 */
export function leaders(state: GameState): Player[] {
  const top = state.players.reduce((m, p) => Math.max(m, p.coins), 0);
  return state.players.filter((p) => p.coins === top);
}

/** The winner(s) once the round is over — the players who reached the target. */
export function winners(state: GameState): Player[] {
  return leaders(state);
}
