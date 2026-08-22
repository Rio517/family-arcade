import {
  bearingSide,
  normalizeAngle,
  type BattleState,
  type ShipCommand,
} from './battle';

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function turnToward(current: number, desired: number): number {
  return clamp(normalizeAngle(desired - current) * 1.4, -1, 1);
}

function bestBroadsideHeading(current: number, targetBearing: number): number {
  const putTargetStarboard = normalizeAngle(targetBearing - Math.PI / 2);
  const putTargetPort = normalizeAngle(targetBearing + Math.PI / 2);
  return Math.abs(normalizeAngle(putTargetStarboard - current)) <=
    Math.abs(normalizeAngle(putTargetPort - current))
    ? putTargetStarboard
    : putTargetPort;
}

/** A deliberately legible captain: seek a lateral firing line, disable a
 * healthy target's sails at close range, then use round shot. */
export function opponentCommand(state: BattleState): ShipCommand {
  const enemy = state.ships.enemy;
  const player = state.ships.player;
  const dx = player.position.x - enemy.position.x;
  const dz = player.position.z - enemy.position.z;
  const distance = Math.hypot(dx, dz);
  const targetBearing = Math.atan2(dx, dz);

  if (enemy.hull < 35 || enemy.crew < 14) {
    const fleeBearing = Math.atan2(-dx, -dz);
    return {
      rudder: turnToward(enemy.heading, fleeBearing),
      sail: 'full',
      ammo: 'round',
    };
  }

  const side = bearingSide(enemy.position, enemy.heading, player.position);
  const closeEnoughToFire = distance <= 42;
  const ammo = distance < 20 && player.sails > 55 && player.hull > 50 ? 'chain' : 'round';
  if (side && closeEnoughToFire && enemy.reload[side] === 0) {
    return {
      rudder: 0,
      sail: distance < 22 ? 'reefed' : 'full',
      ammo,
      fire: side,
    };
  }

  const broadsideHeading = bestBroadsideHeading(enemy.heading, targetBearing);
  return {
    rudder: turnToward(enemy.heading, broadsideHeading),
    sail: 'reefed',
    ammo,
  };
}
