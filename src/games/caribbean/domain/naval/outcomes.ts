import type {
  NavalBattleInput,
  NavalDecisiveFact,
  NavalOutcome,
  NavalShipId,
  NavalShipState,
  NavalState,
} from './types';

const SHIP_IDS: readonly NavalShipId[] = ['player', 'opponent'];

const SURRENDER_HULL_THRESHOLD = 20;
const SURRENDER_CREW_THRESHOLD = 8;
const BOARDING_MAX_RANGE = 7;
const BOARDING_MAX_RELATIVE_SPEED = 1.5;
const BOARDING_TARGET_MAX_SAILS = 30;
const BOARDING_TARGET_MAX_CREW = 18;
const BOARDING_MIN_CREW_ADVANTAGE = 1.25;

function opposingShip(shipId: NavalShipId): NavalShipId {
  return shipId === 'player' ? 'opponent' : 'player';
}

function systemTerminalOutcome(
  ships: Record<NavalShipId, Pick<NavalShipState, 'hull' | 'crew'>>,
): NavalOutcome | null {
  for (const shipId of SHIP_IDS) {
    if (ships[shipId].hull <= 0) return { kind: 'sunk', victorShipId: opposingShip(shipId) };
  }
  for (const shipId of SHIP_IDS) {
    const ship = ships[shipId];
    if (ship.hull <= SURRENDER_HULL_THRESHOLD || ship.crew <= SURRENDER_CREW_THRESHOLD) {
      return { kind: 'surrender', victorShipId: opposingShip(shipId) };
    }
  }
  return null;
}

function outcomesEqual(left: NavalOutcome, right: NavalOutcome): boolean {
  return left.kind === right.kind
    && ('victorShipId' in left && 'victorShipId' in right
      ? left.victorShipId === right.victorShipId
      : 'shipId' in left && 'shipId' in right && left.shipId === right.shipId);
}

function sunkOutcome(state: NavalState): NavalOutcome | null {
  const outcome = systemTerminalOutcome(state.ships);
  return outcome?.kind === 'sunk' ? outcome : null;
}

function surrenderOutcome(state: NavalState): NavalOutcome | null {
  const outcome = systemTerminalOutcome(state.ships);
  return outcome?.kind === 'surrender' ? outcome : null;
}

function boardingMeasurements(state: NavalState): Pick<Extract<NavalDecisiveFact, { kind: 'boarding-ready' }>, 'range' | 'relativeSpeed' | 'targetSails' | 'targetCrew' | 'playerCrew'> {
  const player = state.ships.player;
  const target = state.ships.opponent;
  const distance = Math.hypot(target.position.x - player.position.x, target.position.z - player.position.z);
  const playerVelocity = {
    x: Math.sin(player.heading) * player.speed,
    z: Math.cos(player.heading) * player.speed,
  };
  const targetVelocity = {
    x: Math.sin(target.heading) * target.speed,
    z: Math.cos(target.heading) * target.speed,
  };
  const relativeSpeed = Math.hypot(
    playerVelocity.x - targetVelocity.x,
    playerVelocity.z - targetVelocity.z,
  );

  return {
    range: distance,
    relativeSpeed,
    targetSails: target.sails,
    targetCrew: target.crew,
    playerCrew: player.crew,
  };
}

function boardingOutcome(state: NavalState): NavalOutcome | null {
  const fact = boardingMeasurements(state);
  if (
    fact.range <= BOARDING_MAX_RANGE
    && fact.relativeSpeed <= BOARDING_MAX_RELATIVE_SPEED
    && fact.targetSails <= BOARDING_TARGET_MAX_SAILS
    && fact.targetCrew <= BOARDING_TARGET_MAX_CREW
    && fact.playerCrew >= fact.targetCrew * BOARDING_MIN_CREW_ADVANTAGE
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

function escapeMeasurements(ship: NavalShipState): Pick<Extract<NavalDecisiveFact, { kind: 'escaped' }>, 'distance' | 'outwardSpeed'> {
  const distance = Math.hypot(ship.position.x, ship.position.z);
  if (distance === 0) return { distance, outwardSpeed: 0 };
  const forwardX = Math.sin(ship.heading);
  const forwardZ = Math.cos(ship.heading);
  return {
    distance,
    outwardSpeed: ship.speed * ((ship.position.x * forwardX + ship.position.z * forwardZ) / distance),
  };
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

export function decisiveFactForOutcome(state: NavalState, outcome: NavalOutcome): NavalDecisiveFact {
  if (outcome.kind === 'surrender' && 'victorShipId' in outcome) {
    const surrenderedShipId = opposingShip(outcome.victorShipId);
    const surrendered = state.ships[surrenderedShipId];
    const threshold = surrendered.hull <= SURRENDER_HULL_THRESHOLD ? 'hull' : 'crew';
    const thresholdValue = threshold === 'hull' ? SURRENDER_HULL_THRESHOLD : SURRENDER_CREW_THRESHOLD;
    return {
      kind: 'surrender',
      victorShipId: outcome.victorShipId,
      surrenderedShipId,
      threshold,
      value: surrendered[threshold],
      thresholdValue,
    };
  }

  if (outcome.kind === 'sunk' && 'victorShipId' in outcome) {
    const sunkShipId = opposingShip(outcome.victorShipId);
    return { kind: 'sunk', victorShipId: outcome.victorShipId, sunkShipId, hull: state.ships[sunkShipId].hull };
  }

  if (outcome.kind === 'boarding-ready' && 'victorShipId' in outcome) {
    return { kind: 'boarding-ready', victorShipId: 'player', ...boardingMeasurements(state) };
  }

  if (outcome.kind === 'escaped' && 'shipId' in outcome) {
    return {
      kind: 'escaped',
      shipId: outcome.shipId,
      arenaRadius: state.input.arenaRadius,
      ...escapeMeasurements(state.ships[outcome.shipId]),
    };
  }

  if (!('shipId' in outcome)) throw new Error('Unknown naval outcome');
  return { kind: 'separated', shipId: outcome.shipId, timeLimitTicks: state.input.timeLimitTicks };
}

export function decisiveFactMatches(
  input: NavalBattleInput,
  outcome: NavalOutcome,
  decisive: NavalDecisiveFact,
  finalShips: Record<NavalShipId, Pick<NavalShipState, 'hull' | 'sails' | 'crew' | 'cannon'>>,
  atTick: number,
): boolean {
  if (outcome.kind !== decisive.kind) return false;
  const systemOutcome = systemTerminalOutcome(finalShips);
  if (systemOutcome && !outcomesEqual(systemOutcome, outcome)) return false;

  if (decisive.kind === 'surrender') {
    if (!('victorShipId' in outcome)) return false;
    const surrenderedShipId = opposingShip(outcome.victorShipId);
    const finalShip = finalShips[surrenderedShipId];
    const expectedThresholdValue = decisive.threshold === 'hull'
      ? SURRENDER_HULL_THRESHOLD
      : SURRENDER_CREW_THRESHOLD;
    return decisive.victorShipId === outcome.victorShipId
      && decisive.surrenderedShipId === surrenderedShipId
      && decisive.thresholdValue === expectedThresholdValue
      && decisive.value === finalShip[decisive.threshold]
      && decisive.value <= decisive.thresholdValue;
  }

  if (decisive.kind === 'sunk') {
    if (!('victorShipId' in outcome)) return false;
    const sunkShipId = opposingShip(outcome.victorShipId);
    return decisive.victorShipId === outcome.victorShipId
      && decisive.sunkShipId === sunkShipId
      && decisive.hull === finalShips[sunkShipId].hull
      && decisive.hull === 0;
  }

  if (decisive.kind === 'boarding-ready') {
    if (!('victorShipId' in outcome)) return false;
    return outcome.victorShipId === 'player'
      && decisive.victorShipId === 'player'
      && decisive.range >= 0
      && decisive.range <= BOARDING_MAX_RANGE
      && decisive.relativeSpeed >= 0
      && decisive.relativeSpeed <= BOARDING_MAX_RELATIVE_SPEED
      && decisive.targetSails === finalShips.opponent.sails
      && decisive.targetSails <= BOARDING_TARGET_MAX_SAILS
      && decisive.targetCrew === finalShips.opponent.crew
      && decisive.targetCrew <= BOARDING_TARGET_MAX_CREW
      && decisive.playerCrew === finalShips.player.crew
      && decisive.playerCrew >= decisive.targetCrew * BOARDING_MIN_CREW_ADVANTAGE;
  }

  if (decisive.kind === 'escaped') {
    if (!('shipId' in outcome)) return false;
    return decisive.shipId === outcome.shipId
      && decisive.arenaRadius === input.arenaRadius
      && decisive.distance > decisive.arenaRadius
      && decisive.outwardSpeed > 0;
  }

  if (!('shipId' in outcome)) return false;
  return decisive.shipId === outcome.shipId
    && decisive.timeLimitTicks === input.timeLimitTicks
    && atTick === input.timeLimitTicks;
}
