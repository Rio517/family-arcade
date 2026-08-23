import { bearingSide, normalizeAngle } from './geometry';
import type { Ammunition, Broadside, NavalCommand, NavalState, Rudder } from './types';

export type OpponentMode =
  | 'close'
  | 'gain-weather-position'
  | 'seek-broadside'
  | 'fire'
  | 'recover'
  | 'disengage'
  | 'surrender';

export interface OpponentMemory {
  mode: OpponentMode;
  desiredHeading: number;
  untilTick: number;
}

export interface OpponentDecision {
  memory: OpponentMemory;
  command: NavalCommand;
}

/** Transient controller state. It is intentionally excluded from canonical battle state. */
export interface OpponentControllerState {
  memory: OpponentMemory;
  heldCommand: NavalCommand | null;
}

export interface OpponentControllerTick {
  controller: OpponentControllerState;
  command: NavalCommand;
}

const DECISION_HOLD_TICKS = 30;
const MAX_BROADSIDE_RANGE = 42;
const REEF_RANGE = 24;
const CHAIN_MINIMUM_RANGE = 16;
const CHAIN_MAXIMUM_RANGE = 36;
const DISENGAGE_HULL = 21;
const DISENGAGE_CREW = 12;
const WEATHER_GAUGE_GAP = 8;
const WEATHER_WAYPOINT_DISTANCE = 18;
const RUDDER_DEAD_ZONE = 0.025;

export function initialOpponentMemory(): OpponentMemory {
  return { mode: 'close', desiredHeading: 0, untilTick: 0 };
}

export function initialOpponentController(): OpponentControllerState {
  return { memory: initialOpponentMemory(), heldCommand: null };
}

function headingTo(dx: number, dz: number): number {
  return normalizeAngle(Math.atan2(dx, dz));
}

function rudderToward(currentHeading: number, desiredHeading: number): Rudder {
  const error = normalizeAngle(desiredHeading - currentHeading);
  if (Math.abs(error) <= RUDDER_DEAD_ZONE) return 0;
  return error > 0 ? -1 : 1;
}

function nearestBroadsideHeading(currentHeading: number, targetHeading: number): number {
  const candidates = [
    normalizeAngle(targetHeading + Math.PI / 2),
    normalizeAngle(targetHeading - Math.PI / 2),
  ];
  return candidates.reduce((nearest, candidate) => (
    Math.abs(normalizeAngle(candidate - currentHeading))
      < Math.abs(normalizeAngle(nearest - currentHeading))
      ? candidate
      : nearest
  ));
}

function ammunitionFor(range: number, targetSails: number, targetCrew: number): Ammunition {
  if (targetSails > 55 && range >= CHAIN_MINIMUM_RANGE && range <= CHAIN_MAXIMUM_RANGE) return 'chain';
  if (range < CHAIN_MINIMUM_RANGE && targetCrew > 18) return 'grape';
  return 'round';
}

function hasUsableBattery(cannon: number): boolean {
  return Number.isInteger(cannon) && cannon > 0;
}

function decision(
  state: NavalState,
  mode: OpponentMode,
  desiredHeading: number,
  command: NavalCommand,
): OpponentDecision {
  return {
    memory: {
      mode,
      desiredHeading: normalizeAngle(desiredHeading),
      untilTick: state.tick + DECISION_HOLD_TICKS,
    },
    command,
  };
}

function commandFor(
  rudder: Rudder,
  sail: NavalCommand['sail'],
  ammunition: Ammunition,
  fire: Broadside | null = null,
): NavalCommand {
  return { rudder, sail, ammunition, fire };
}

export function opponentCommand(state: NavalState, _memory: OpponentMemory): OpponentDecision {
  const ship = state.ships.opponent;
  const target = state.ships.player;
  const dx = target.position.x - ship.position.x;
  const dz = target.position.z - ship.position.z;
  const range = Math.hypot(dx, dz);
  const targetHeading = headingTo(dx, dz);
  const ammunition = ammunitionFor(range, target.sails, target.crew);

  if (ship.hull <= 20 || ship.crew <= 8) {
    return decision(state, 'surrender', ship.heading, commandFor(0, 'reefed', ammunition));
  }

  if (
    ship.hull <= DISENGAGE_HULL
    || ship.crew <= DISENGAGE_CREW
    || !hasUsableBattery(ship.cannon)
  ) {
    const outwardHeading = headingTo(ship.position.x, ship.position.z);
    return decision(
      state,
      'disengage',
      outwardHeading,
      commandFor(rudderToward(ship.heading, outwardHeading), 'full', ammunition),
    );
  }

  const arenaDistance = Math.hypot(ship.position.x, ship.position.z);
  if (arenaDistance > state.input.arenaRadius * 0.78) {
    const weatherX = Math.sin(state.input.windFrom);
    const weatherZ = Math.cos(state.input.windFrom);
    const weatherHeading = headingTo(
      weatherX * WEATHER_WAYPOINT_DISTANCE - ship.position.x,
      weatherZ * WEATHER_WAYPOINT_DISTANCE - ship.position.z,
    );
    return decision(
      state,
      'gain-weather-position',
      weatherHeading,
      commandFor(rudderToward(ship.heading, weatherHeading), 'full', ammunition),
    );
  }

  if (range > MAX_BROADSIDE_RANGE) {
    return decision(
      state,
      'close',
      targetHeading,
      commandFor(rudderToward(ship.heading, targetHeading), 'full', ammunition),
    );
  }

  const usefulSide = bearingSide(ship.position, ship.heading, target.position);
  if (usefulSide && ship.reload[usefulSide].loaded) {
    const broadsideHeading = nearestBroadsideHeading(ship.heading, targetHeading);
    return decision(
      state,
      'fire',
      broadsideHeading,
      commandFor(0, range < REEF_RANGE ? 'reefed' : 'full', ammunition, usefulSide),
    );
  }

  if (usefulSide) {
    const broadsideHeading = nearestBroadsideHeading(ship.heading, targetHeading);
    return decision(
      state,
      'recover',
      broadsideHeading,
      commandFor(0, range < REEF_RANGE ? 'reefed' : 'full', ammunition),
    );
  }

  const weatherX = Math.sin(state.input.windFrom);
  const weatherZ = Math.cos(state.input.windFrom);
  const shipWeather = ship.position.x * weatherX + ship.position.z * weatherZ;
  const targetWeather = target.position.x * weatherX + target.position.z * weatherZ;
  if (targetWeather - shipWeather > WEATHER_GAUGE_GAP) {
    const weatherHeading = headingTo(
      dx + weatherX * WEATHER_WAYPOINT_DISTANCE,
      dz + weatherZ * WEATHER_WAYPOINT_DISTANCE,
    );
    return decision(
      state,
      'gain-weather-position',
      weatherHeading,
      commandFor(rudderToward(ship.heading, weatherHeading), 'full', ammunition),
    );
  }

  const broadsideHeading = nearestBroadsideHeading(ship.heading, targetHeading);
  return decision(
    state,
    'seek-broadside',
    broadsideHeading,
    commandFor(rudderToward(ship.heading, broadsideHeading), range < REEF_RANGE ? 'reefed' : 'full', ammunition),
  );
}

/**
 * Produces one opponent command for the current canonical tick. Steering, sail,
 * and ammunition remain held for the decision window; fire is consumed after
 * this returned tick because it is a one-shot request.
 */
export function advanceOpponentController(
  state: NavalState,
  controller: OpponentControllerState,
): OpponentControllerTick {
  let memory = controller.memory;
  let heldCommand = controller.heldCommand;
  const disarmedDuringHold = !hasUsableBattery(state.ships.opponent.cannon)
    && memory.mode !== 'disengage'
    && memory.mode !== 'surrender';

  if (!heldCommand || state.tick >= memory.untilTick || disarmedDuringHold) {
    const decision = opponentCommand(state, memory);
    memory = decision.memory;
    heldCommand = decision.command;
  }

  const command = { ...heldCommand };
  return {
    command,
    controller: {
      memory,
      heldCommand: { ...heldCommand, fire: null },
    },
  };
}
