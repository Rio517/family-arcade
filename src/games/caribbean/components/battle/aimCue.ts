import { broadsideLegality } from '../../domain/naval/geometry';
import type { Broadside, NavalShipId, NavalState } from '../../domain/naval/types';

export interface AimCue {
  side: Broadside | null;
  quality: 'good' | 'fair' | 'poor' | 'blocked';
  message: string;
}

function title(side: Broadside): string {
  return side === 'port' ? 'Port' : 'Starboard';
}

function qualityFor(ammunition: 'round' | 'chain' | 'grape', distance: number): AimCue['quality'] {
  if (ammunition === 'round') return 'good';
  if (ammunition === 'chain') return distance >= 16 && distance <= 36 ? 'good' : distance < 16 ? 'fair' : 'poor';
  return distance < 16 ? 'good' : distance <= 28 ? 'fair' : 'poor';
}

export function selectAimCue(state: NavalState, shipId: NavalShipId): AimCue {
  const ship = state.ships[shipId];
  const target = state.ships[shipId === 'player' ? 'opponent' : 'player'];
  const port = broadsideLegality(state, shipId, 'port');
  if (port.terminal) return { side: null, quality: 'blocked', message: 'Battle ended — no further broadside' };
  const side = port.side;
  if (!side) {
    const forwardX = Math.sin(ship.heading);
    const forwardZ = Math.cos(ship.heading);
    const dot = (target.position.x - ship.position.x) * forwardX + (target.position.z - ship.position.z) * forwardZ;
    return { side: null, quality: 'blocked', message: dot >= 0 ? 'Target off the bow — turn for a broadside' : 'Target astern — turn for a broadside' };
  }
  const legality = broadsideLegality(state, shipId, side);
  if (!legality.inRange) return { side, quality: 'blocked', message: `${title(side)} broadside — out of range` };
  if (!legality.armed) return { side, quality: 'blocked', message: `${title(side)} battery disarmed` };
  if (!legality.loaded) return { side, quality: 'blocked', message: `${title(side)} battery reloading` };
  const quality = qualityFor(ship.ammunition, legality.distance);
  const suffix = quality === 'good' ? 'good range' : quality === 'fair' ? 'workable range' : 'long range';
  return { side, quality, message: `${title(side)} broadside — ${suffix}` };
}
