import { bearingSide } from './geometry';
import { moveShipsOneTick } from './movement';
import { evaluateOutcome } from './outcomes';
import type {
  Ammunition,
  Broadside,
  Damage,
  NavalCommand,
  NavalCommands,
  NavalEvent,
  NavalShipId,
  NavalState,
  Rudder,
  SailSetting,
} from './types';
import { accuracyFor, damageFor, resolveVolley } from './volley';

const SHIP_IDS: readonly NavalShipId[] = ['player', 'opponent'];
const BROADSIDES: readonly Broadside[] = ['port', 'starboard'];
const MAX_BROADSIDE_RANGE = 42;
const EVENT_WINDOW = 120;

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type NewNavalEvent = WithoutId<NavalEvent>;

interface PendingDamage {
  targetShipId: NavalShipId;
  damage: Damage;
  atTick: number;
}

function opposingShip(shipId: NavalShipId): NavalShipId {
  return shipId === 'player' ? 'opponent' : 'player';
}

function isRudder(value: unknown): value is Rudder {
  return value === -1 || value === 0 || value === 1;
}

function isSail(value: unknown): value is SailSetting {
  return value === 'full' || value === 'reefed';
}

function isAmmunition(value: unknown): value is Ammunition {
  return value === 'round' || value === 'chain' || value === 'grape';
}

function isBroadsideOrNull(value: unknown): value is Broadside | null {
  return value === null || value === 'port' || value === 'starboard';
}

function validCommand(command: NavalCommand | undefined): NavalCommand | undefined {
  if (
    command
    && isRudder(command.rudder)
    && isSail(command.sail)
    && isAmmunition(command.ammunition)
    && isBroadsideOrNull(command.fire)
  ) {
    return command;
  }
  return undefined;
}

function applyCommand(state: NavalState, shipId: NavalShipId, command: NavalCommand | undefined): void {
  if (!command) return;
  const ship = state.ships[shipId];
  ship.rudder = command.rudder;
  ship.sail = command.sail;
  ship.ammunition = command.ammunition;
}

function appendEvent(state: NavalState, event: NewNavalEvent): void {
  state.events.push({ ...event, id: state.nextEventId } as NavalEvent);
  state.nextEventId += 1;
}

function applyDamage(state: NavalState, targetShipId: NavalShipId, requested: Damage): Damage {
  const target = state.ships[targetShipId];
  const applied = {
    hull: Math.min(target.hull, requested.hull),
    sails: Math.min(target.sails, requested.sails),
    crew: Math.min(target.crew, requested.crew),
    cannon: Math.min(target.cannon, requested.cannon),
  };
  target.hull = Math.max(0, target.hull - applied.hull);
  target.sails = Math.max(0, target.sails - applied.sails);
  target.crew = Math.max(0, target.crew - applied.crew);
  target.cannon = Math.max(0, target.cannon - applied.cannon);
  return applied;
}

function resolveRequestedBroadside(
  state: NavalState,
  firingSnapshot: NavalState,
  shipId: NavalShipId,
  command: NavalCommand | undefined,
  firedSides: Set<string>,
): PendingDamage | null {
  if (!command?.fire) return null;

  const ship = firingSnapshot.ships[shipId];
  const targetShipId = opposingShip(shipId);
  const target = firingSnapshot.ships[targetShipId];
  const side = command.fire;
  const distance = Math.hypot(target.position.x - ship.position.x, target.position.z - ship.position.z);
  if (
    !ship.reload[side].loaded
    || !Number.isInteger(ship.cannon)
    || ship.cannon <= 0
    || distance > MAX_BROADSIDE_RANGE
    || bearingSide(ship.position, ship.heading, target.position) !== side
  ) {
    return null;
  }

  const normalizedRange = distance / MAX_BROADSIDE_RANGE;
  const result = resolveVolley({
    seed: state.seed,
    volleyId: state.nextVolleyId,
    side,
    ammunition: ship.ammunition,
    cannon: ship.cannon,
    accuracy: accuracyFor(normalizedRange, ship.crew, ship.sails),
    damagePerHit: damageFor(ship.ammunition, normalizedRange),
  });
  state.seed = result.seedAfter;
  state.nextVolleyId += 1;
  state.ships[shipId].reload[side].progress = 0;
  state.ships[shipId].reload[side].loaded = false;
  firedSides.add(`${shipId}:${side}`);

  appendEvent(state, {
    kind: 'volley',
    atTick: state.tick,
    shipId,
    targetShipId,
    result,
  });
  return { targetShipId, damage: result.damage, atTick: state.tick };
}

function reloadSnapshot(state: NavalState): Record<NavalShipId, Record<Broadside, boolean>> {
  return {
    player: {
      port: state.ships.player.reload.port.loaded,
      starboard: state.ships.player.reload.starboard.loaded,
    },
    opponent: {
      port: state.ships.opponent.reload.port.loaded,
      starboard: state.ships.opponent.reload.starboard.loaded,
    },
  };
}

function emitReloadTransitions(
  state: NavalState,
  before: Record<NavalShipId, Record<Broadside, boolean>>,
): void {
  for (const shipId of SHIP_IDS) {
    for (const side of BROADSIDES) {
      if (!before[shipId][side] && state.ships[shipId].reload[side].loaded) {
        appendEvent(state, { kind: 'reload-ready', atTick: state.tick, shipId, side });
      }
    }
  }
}

export function stepBattle(state: NavalState, commands: NavalCommands): NavalState {
  if (state.outcome) return state;

  let next = structuredClone(state);
  const validatedCommands: NavalCommands = {
    player: validCommand(commands.player),
    opponent: validCommand(commands.opponent),
  };
  for (const shipId of SHIP_IDS) applyCommand(next, shipId, validatedCommands[shipId]);

  const firedSides = new Set<string>();
  const firingSnapshot = structuredClone(next);
  const pendingDamage: PendingDamage[] = [];
  for (const shipId of SHIP_IDS) {
    const pending = resolveRequestedBroadside(
      next,
      firingSnapshot,
      shipId,
      validatedCommands[shipId],
      firedSides,
    );
    if (pending) pendingDamage.push(pending);
  }
  for (const pending of pendingDamage) {
    const appliedDamage = applyDamage(next, pending.targetShipId, pending.damage);
    appendEvent(next, {
      kind: 'damage',
      atTick: pending.atTick,
      shipId: pending.targetShipId,
      damage: appliedDamage,
    });
  }

  const reloadsBeforeMovement = reloadSnapshot(next);
  next = moveShipsOneTick(next, {});
  for (const key of firedSides) {
    const [shipId, side] = key.split(':') as [NavalShipId, Broadside];
    next.ships[shipId].reload[side].progress = 0;
    next.ships[shipId].reload[side].loaded = false;
  }
  emitReloadTransitions(next, reloadsBeforeMovement);

  const outcome = evaluateOutcome(next);
  if (outcome) {
    next.outcome = outcome;
    appendEvent(next, { kind: 'outcome', atTick: next.tick, outcome });
  }
  if (next.events.length > EVENT_WINDOW) next.events = next.events.slice(-EVENT_WINDOW);

  return next;
}
