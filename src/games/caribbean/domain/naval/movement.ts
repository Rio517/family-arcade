import { SLOOP_CLASS } from '../../content/naval';
import { normalizeAngle, sailingEfficiency } from './geometry';
import type { NavalCommand, NavalCommands, NavalShipState, NavalState, ReloadState } from './types';
import { NAVAL_TICK_RATE } from './types';

const MINIMUM_CREW_FACTOR = 0.35;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function crewFactor(ship: NavalShipState): number {
  return clamp(ship.crew / SLOOP_CLASS.crew.safe, MINIMUM_CREW_FACTOR, 1);
}

function advanceReload(reload: ReloadState, work: number): void {
  reload.progress = Math.min(reload.required, reload.progress + work);
  reload.loaded = reload.progress === reload.required;
}

function applyCommand(ship: NavalShipState, command: NavalCommand | undefined): void {
  if (!command) return;

  ship.rudder = command.rudder;
  ship.sail = command.sail;
  ship.ammunition = command.ammunition;
}

function moveShip(ship: NavalShipState, state: NavalState): void {
  const sails = 0.15 + 0.85 * (ship.sails / SLOOP_CLASS.sailsMaximum);
  const hull = 0.65 + 0.35 * (ship.hull / SLOOP_CLASS.hullMaximum);
  const crew = crewFactor(ship);
  const reefed = ship.sail === 'reefed';
  const baseTurnRate = reefed ? 0.8 : SLOOP_CLASS.turnResponse;
  const turnRate = baseTurnRate * (0.55 + 0.45 * sails) * crew;

  ship.heading = normalizeAngle(ship.heading - ship.rudder * turnRate / NAVAL_TICK_RATE);

  const maximumSpeed = reefed ? 3.9 : SLOOP_CLASS.topSpeed;
  ship.speed = maximumSpeed
    * state.input.windStrength
    * sailingEfficiency(ship.heading - state.input.windFrom)
    * sails
    * hull
    * crew;
  ship.position.x += Math.sin(ship.heading) * ship.speed / NAVAL_TICK_RATE;
  ship.position.z += Math.cos(ship.heading) * ship.speed / NAVAL_TICK_RATE;

  const reloadWork = Math.round(crew * 1_000);
  advanceReload(ship.reload.port, reloadWork);
  advanceReload(ship.reload.starboard, reloadWork);
}

export function moveShipsOneTick(state: NavalState, commands: NavalCommands): NavalState {
  const next = structuredClone(state);

  applyCommand(next.ships.player, commands.player);
  applyCommand(next.ships.opponent, commands.opponent);
  moveShip(next.ships.player, next);
  moveShip(next.ships.opponent, next);
  next.tick += 1;

  return next;
}
