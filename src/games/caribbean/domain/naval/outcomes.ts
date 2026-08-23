import type { NavalOutcome, NavalShipId, NavalShipState, NavalState } from './types';

const SHIP_IDS: readonly NavalShipId[] = ['player', 'opponent'];

function opposingShip(shipId: NavalShipId): NavalShipId {
  return shipId === 'player' ? 'opponent' : 'player';
}

function sunkOutcome(state: NavalState): NavalOutcome | null {
  for (const shipId of SHIP_IDS) {
    if (state.ships[shipId].hull <= 0) return { kind: 'sunk', victorShipId: opposingShip(shipId) };
  }
  return null;
}

function surrenderOutcome(state: NavalState): NavalOutcome | null {
  for (const shipId of SHIP_IDS) {
    const ship = state.ships[shipId];
    if (ship.hull <= 20 || ship.crew <= 8) return { kind: 'surrender', victorShipId: opposingShip(shipId) };
  }
  return null;
}

function boardingOutcome(state: NavalState): NavalOutcome | null {
  const player = state.ships.player;
  const target = state.ships.opponent;
  const distance = Math.hypot(target.position.x - player.position.x, target.position.z - player.position.z);
  const relativeSpeed = Math.abs(player.speed - target.speed);

  if (
    distance <= 7
    && relativeSpeed <= 1.5
    && target.sails <= 30
    && target.crew <= 18
    && player.crew >= target.crew * 1.25
  ) {
    return { kind: 'boarding-ready', victorShipId: 'player' };
  }
  return null;
}

function movingOutward(ship: NavalShipState): boolean {
  const forwardX = Math.sin(ship.heading);
  const forwardZ = Math.cos(ship.heading);
  return ship.speed > 0 && ship.position.x * forwardX + ship.position.z * forwardZ > 0;
}

function escapeOutcome(state: NavalState): NavalOutcome | null {
  for (const shipId of SHIP_IDS) {
    const ship = state.ships[shipId];
    if (Math.hypot(ship.position.x, ship.position.z) > state.input.arenaRadius && movingOutward(ship)) {
      return { kind: 'escaped', shipId };
    }
  }
  return null;
}

export function evaluateOutcome(state: NavalState): NavalOutcome | null {
  return sunkOutcome(state)
    ?? surrenderOutcome(state)
    ?? boardingOutcome(state)
    ?? escapeOutcome(state)
    ?? (state.tick >= state.input.timeLimitTicks ? { kind: 'separated', shipId: 'player' } : null);
}
