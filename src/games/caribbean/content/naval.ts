import type { NavalBattleInput } from '../domain/naval/types';
import type { SloopClass } from './types';

export const SLOOP_CLASS: SloopClass = {
  id: 'sloop',
  hold: 100,
  crew: { minimum: 12, safe: 50, maximum: 75 },
  cannonMaximum: 12,
  hullMaximum: 100,
  sailsMaximum: 100,
  topSpeed: 5.6,
  turnResponse: 0.52,
  bestWindAngle: 90,
};

export const BATTLE_LAB_INPUT: NavalBattleInput = {
  battleId: 'battle-lab-red-jackdaw',
  seed: 1702,
  windFrom: Math.PI / 3,
  windStrength: 1,
  arenaRadius: 92,
  timeLimitTicks: 14_400,
  objective: 'capture-red-jackdaw',
  player: {
    id: 'player',
    stableShipId: 'mistral',
    name: 'Mistral',
    classId: 'sloop',
    position: { x: 0, z: -36 },
    heading: 0,
    hull: 100,
    sails: 100,
    crew: 52,
    cannon: 8,
  },
  opponent: {
    id: 'opponent',
    stableShipId: 'red-jackdaw',
    name: 'Red Jackdaw',
    classId: 'sloop',
    position: { x: 0, z: 36 },
    heading: Math.PI,
    hull: 100,
    sails: 100,
    crew: 48,
    cannon: 8,
  },
};
