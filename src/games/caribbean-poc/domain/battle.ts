export type ShipId = 'player' | 'enemy';
export type Broadside = 'port' | 'starboard';
export type SailSetting = 'full' | 'reefed';
export type Ammunition = 'round' | 'chain' | 'grape';

export interface Point {
  x: number;
  z: number;
}

export interface Damage {
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
}

export interface ShipState {
  id: ShipId;
  name: string;
  position: Point;
  heading: number;
  speed: number;
  rudder: number;
  sail: SailSetting;
  ammo: Ammunition;
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
  reload: Record<Broadside, number>;
}

export interface Projectile {
  id: number;
  volley: number;
  owner: ShipId;
  ammo: Ammunition;
  position: Point;
  velocity: Point;
  travelled: number;
  ttl: number;
}

export type BattleOutcome =
  | { kind: 'surrender' | 'sunk'; victor: ShipId }
  | { kind: 'escaped'; ship: ShipId };

export type BattleEvent =
  | { kind: 'broadside'; at: number; ship: ShipId; side: Broadside; ammo: Ammunition }
  | { kind: 'hit'; at: number; ship: ShipId; ammo: Ammunition; damage: Damage }
  | { kind: 'outcome'; at: number; outcome: BattleOutcome };

export interface BattleState {
  seed: number;
  nextProjectileId: number;
  nextVolleyId: number;
  tick: number;
  elapsed: number;
  windFrom: number;
  windStrength: number;
  arenaRadius: number;
  paused: boolean;
  ships: Record<ShipId, ShipState>;
  projectiles: Projectile[];
  events: BattleEvent[];
  outcome: BattleOutcome | null;
}

export interface ShipCommand {
  rudder?: number;
  sail?: SailSetting;
  ammo?: Ammunition;
  fire?: Broadside;
}

export interface BattleCommand {
  player?: ShipCommand;
  enemy?: ShipCommand;
}

export interface CreateBattleOptions {
  seed: number;
  windFrom?: number;
  windStrength?: number;
}

const TAU = Math.PI * 2;
const FIXED_STEP = 1 / 60;
const BROADSIDE_RELOAD_SECONDS = 6;
const PROJECTILE_SPEED = 25;
const PROJECTILE_RANGE = 70;
const SHIP_HIT_RADIUS = 3.1;

const SAIL_POLAR: ReadonlyArray<readonly [number, number]> = [
  [0, 0.08],
  [30, 0.18],
  [60, 0.65],
  [90, 1],
  [135, 0.88],
  [180, 0.65],
];

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function normalizeAngle(angle: number): number {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/** Relative angle is zero when the bow points into the wind. */
export function sailingEfficiency(relativeWindAngle: number): number {
  const degrees = (Math.abs(normalizeAngle(relativeWindAngle)) * 180) / Math.PI;
  for (let i = 1; i < SAIL_POLAR.length; i++) {
    const [rightAngle, rightValue] = SAIL_POLAR[i];
    const [leftAngle, leftValue] = SAIL_POLAR[i - 1];
    if (degrees <= rightAngle) {
      const t = (degrees - leftAngle) / (rightAngle - leftAngle);
      return leftValue + (rightValue - leftValue) * t;
    }
  }
  return SAIL_POLAR.at(-1)?.[1] ?? 0;
}

function initialShip(id: ShipId): ShipState {
  const player = id === 'player';
  return {
    id,
    name: player ? 'Mistral' : 'Red Jackdaw',
    position: { x: 0, z: player ? -33 : 33 },
    heading: player ? 0 : Math.PI,
    speed: 0,
    rudder: 0,
    sail: 'full',
    ammo: 'round',
    hull: 100,
    sails: 100,
    crew: player ? 52 : 48,
    cannon: 8,
    reload: { port: 0, starboard: 0 },
  };
}

export function createBattle(options: CreateBattleOptions): BattleState {
  return {
    seed: options.seed >>> 0,
    nextProjectileId: 1,
    nextVolleyId: 1,
    tick: 0,
    elapsed: 0,
    windFrom: options.windFrom ?? Math.PI / 3,
    windStrength: options.windStrength ?? 1,
    arenaRadius: 80,
    paused: false,
    ships: { player: initialShip('player'), enemy: initialShip('enemy') },
    projectiles: [],
    events: [],
    outcome: null,
  };
}

export function bearingSide(origin: Point, heading: number, target: Point): Broadside | null {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.0001) return null;

  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const forward = (dx * forwardX + dz * forwardZ) / length;
  if (Math.abs(forward) > 0.72) return null;

  const starboardX = Math.cos(heading);
  const starboardZ = -Math.sin(heading);
  return dx * starboardX + dz * starboardZ >= 0 ? 'starboard' : 'port';
}

function random01(state: BattleState): number {
  state.seed = (Math.imul(1664525, state.seed) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function trimEvents(events: BattleEvent[]): BattleEvent[] {
  return events.length <= 40 ? events : events.slice(-40);
}

function cloneBattle(state: BattleState): BattleState {
  return structuredClone(state);
}

export function fireBroadside(
  state: BattleState,
  shipId: ShipId,
  side: Broadside,
): BattleState {
  if (state.outcome || state.paused || state.ships[shipId].reload[side] > 0) return state;

  const next = cloneBattle(state);
  const ship = next.ships[shipId];
  const broadsideAngle = ship.heading + (side === 'starboard' ? Math.PI / 2 : -Math.PI / 2);
  const lateralX = Math.sin(broadsideAngle);
  const lateralZ = Math.cos(broadsideAngle);
  const forwardX = Math.sin(ship.heading);
  const forwardZ = Math.cos(ship.heading);
  const shotCount = Math.max(1, Math.min(4, Math.ceil(ship.cannon / 2)));
  const volley = next.nextVolleyId++;

  for (let i = 0; i < shotCount; i++) {
    const alongDeck = (i - (shotCount - 1) / 2) * 0.75;
    const spread = (random01(next) - 0.5) * 0.07;
    const direction = broadsideAngle + spread;
    next.projectiles.push({
      id: next.nextProjectileId++,
      volley,
      owner: shipId,
      ammo: ship.ammo,
      position: {
        x: ship.position.x + lateralX * 2.2 + forwardX * alongDeck,
        z: ship.position.z + lateralZ * 2.2 + forwardZ * alongDeck,
      },
      velocity: {
        x: Math.sin(direction) * PROJECTILE_SPEED,
        z: Math.cos(direction) * PROJECTILE_SPEED,
      },
      travelled: 0,
      ttl: PROJECTILE_RANGE / PROJECTILE_SPEED,
    });
  }

  ship.reload[side] = BROADSIDE_RELOAD_SECONDS;
  next.events.push({
    kind: 'broadside',
    at: next.elapsed,
    ship: shipId,
    side,
    ammo: ship.ammo,
  });
  next.events = trimEvents(next.events);
  return next;
}

export function damageProfile(ammo: Ammunition, normalizedRange: number): Damage {
  const range = clamp(normalizedRange, 0, 1);
  if (ammo === 'round') {
    return {
      hull: Math.round(12 - 3 * range),
      sails: 1,
      crew: 1,
      cannon: 2,
    };
  }
  if (ammo === 'chain') {
    return {
      hull: Math.round(2 - range),
      sails: Math.round(14 - 8 * range),
      crew: Math.round(2 - range),
      cannon: 0,
    };
  }
  return {
    hull: Math.round(1 - range),
    sails: 0,
    crew: Math.round(12 - 10 * range),
    cannon: 0,
  };
}

function opposingShip(shipId: ShipId): ShipId {
  return shipId === 'player' ? 'enemy' : 'player';
}

export function applyDamage(state: BattleState, shipId: ShipId, damage: Damage): BattleState {
  if (state.outcome) return state;
  const next = cloneBattle(state);
  const ship = next.ships[shipId];
  ship.hull = Math.max(0, ship.hull - damage.hull);
  ship.sails = Math.max(0, ship.sails - damage.sails);
  ship.crew = Math.max(0, ship.crew - damage.crew);
  ship.cannon = Math.max(0, ship.cannon - damage.cannon);
  next.events.push({ kind: 'hit', at: next.elapsed, ship: shipId, ammo: 'round', damage });

  let outcome: BattleOutcome | null = null;
  if (ship.hull === 0) outcome = { kind: 'sunk', victor: opposingShip(shipId) };
  else if (ship.hull <= 20 || ship.crew <= 8) {
    outcome = { kind: 'surrender', victor: opposingShip(shipId) };
  }
  if (outcome) {
    next.outcome = outcome;
    next.events.push({ kind: 'outcome', at: next.elapsed, outcome });
  }
  next.events = trimEvents(next.events);
  return next;
}

function scaleVolleyDamage(damage: Damage, count: number): Damage {
  return {
    hull: damage.hull / count,
    sails: damage.sails / count,
    crew: damage.crew / count,
    cannon: damage.cannon / count,
  };
}

function applyCommand(ship: ShipState, command: ShipCommand | undefined): void {
  if (!command) return;
  if (command.rudder !== undefined) ship.rudder = clamp(command.rudder, -1, 1);
  if (command.sail) ship.sail = command.sail;
  if (command.ammo) ship.ammo = command.ammo;
}

function moveShip(ship: ShipState, state: BattleState, dt: number): void {
  const hullFactor = 0.65 + 0.35 * (ship.hull / 100);
  const sailHealth = 0.15 + 0.85 * (ship.sails / 100);
  const crewFactor = clamp(ship.crew / 35, 0.45, 1);
  const reefed = ship.sail === 'reefed';
  const turnRate = (reefed ? 0.8 : 0.52) * (0.55 + 0.45 * sailHealth);
  ship.heading += ship.rudder * turnRate * dt;

  const polar = sailingEfficiency(ship.heading - state.windFrom);
  const maxSpeed = (reefed ? 3.9 : 5.6) * state.windStrength;
  ship.speed = maxSpeed * polar * hullFactor * sailHealth * crewFactor;
  ship.position.x += Math.sin(ship.heading) * ship.speed * dt;
  ship.position.z += Math.cos(ship.heading) * ship.speed * dt;
  ship.reload.port = Math.max(0, ship.reload.port - dt);
  ship.reload.starboard = Math.max(0, ship.reload.starboard - dt);
}

function projectileHit(projectile: Projectile, ship: ShipState): boolean {
  return Math.hypot(
    projectile.position.x - ship.position.x,
    projectile.position.z - ship.position.z,
  ) <= SHIP_HIT_RADIUS;
}

function checkEscape(state: BattleState, ship: ShipState): BattleOutcome | null {
  const distance = Math.hypot(ship.position.x, ship.position.z);
  if (distance <= state.arenaRadius) return null;
  const outward =
    ship.position.x * Math.sin(ship.heading) + ship.position.z * Math.cos(ship.heading);
  return outward > 0 ? { kind: 'escaped', ship: ship.id } : null;
}

function simulateTick(state: BattleState, dt: number): BattleState {
  moveShip(state.ships.player, state, dt);
  moveShip(state.ships.enemy, state, dt);

  const volleyCounts = new Map<number, number>();
  for (const projectile of state.projectiles) {
    volleyCounts.set(projectile.volley, (volleyCounts.get(projectile.volley) ?? 0) + 1);
  }

  const survivors: Projectile[] = [];
  for (const projectile of state.projectiles) {
    projectile.position.x += projectile.velocity.x * dt;
    projectile.position.z += projectile.velocity.z * dt;
    const distance = Math.hypot(projectile.velocity.x * dt, projectile.velocity.z * dt);
    projectile.travelled += distance;
    projectile.ttl -= dt;
    const targetId = opposingShip(projectile.owner);
    if (projectileHit(projectile, state.ships[targetId])) {
      const damage = scaleVolleyDamage(
        damageProfile(projectile.ammo, projectile.travelled / PROJECTILE_RANGE),
        volleyCounts.get(projectile.volley) ?? 1,
      );
      state = applyDamage(state, targetId, damage);
      if (state.outcome) break;
    } else if (projectile.ttl > 0) {
      survivors.push(projectile);
    }
  }
  state.projectiles = survivors;

  if (!state.outcome) {
    for (const shipId of ['player', 'enemy'] as const) {
      const escaped = checkEscape(state, state.ships[shipId]);
      if (escaped) {
        state.outcome = escaped;
        state.events.push({ kind: 'outcome', at: state.elapsed, outcome: escaped });
        break;
      }
    }
  }
  state.tick++;
  state.elapsed += dt;
  state.events = trimEvents(state.events);
  return state;
}

export function stepBattle(state: BattleState, command: BattleCommand, seconds: number): BattleState {
  if (state.paused || state.outcome || seconds <= 0) return state;
  let next = cloneBattle(state);
  applyCommand(next.ships.player, command.player);
  applyCommand(next.ships.enemy, command.enemy);
  if (command.player?.fire) next = fireBroadside(next, 'player', command.player.fire);
  if (command.enemy?.fire) next = fireBroadside(next, 'enemy', command.enemy.fire);

  let remaining = seconds;
  while (remaining > 0 && !next.outcome) {
    const dt = Math.min(FIXED_STEP, remaining);
    next = simulateTick(next, dt);
    remaining -= dt;
  }
  return next;
}
