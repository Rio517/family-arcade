import type { SailingCheckpoint } from '../domain/types';

export const RED_JACKDAW_VOYAGE: Readonly<{
  routeId: 'bridgetown-red-jackdaw';
  portId: 'bridgetown';
  bearingLabel: 'East by north';
  windLabel: 'Fresh trade wind from ENE';
  start: SailingCheckpoint;
  contact: SailingCheckpoint;
  returnCost: { elapsedDays: 1; provisionsUsed: 1 };
}> = {
  routeId: 'bridgetown-red-jackdaw',
  portId: 'bridgetown',
  bearingLabel: 'East by north',
  windLabel: 'Fresh trade wind from ENE',
  start: {
    tick: 0,
    position: { x: 0, z: 0 },
    heading: Math.PI / 2,
    elapsedDays: 0,
    provisionsUsed: 0,
  },
  contact: {
    tick: 3_600,
    position: { x: 24, z: 4 },
    heading: Math.PI / 2,
    elapsedDays: 1,
    provisionsUsed: 1,
  },
  returnCost: { elapsedDays: 1, provisionsUsed: 1 },
};
