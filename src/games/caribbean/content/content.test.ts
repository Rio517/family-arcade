import { describe, expect, it } from 'vitest';
import { BATTLE_LAB_INPUT, SLOOP_CLASS } from './naval';

describe('Caribbean naval content', () => {
  it('locks the one-class naval slice to the measured sloop', () => {
    expect(SLOOP_CLASS).toMatchObject({
      id: 'sloop',
      hold: 100,
      crew: { minimum: 12, safe: 50, maximum: 75 },
      cannonMaximum: 12,
      hullMaximum: 100,
      sailsMaximum: 100,
      topSpeed: 5.6,
      turnResponse: 0.52,
      bestWindAngle: 90,
      fittingSlots: 2,
    });
  });

  it('defines the deterministic Battle Lab encounter', () => {
    expect(BATTLE_LAB_INPUT).toMatchObject({
      battleId: 'battle-lab-red-jackdaw',
      seed: 1702,
      windFrom: Math.PI / 3,
      windStrength: 1,
      arenaRadius: 92,
      timeLimitTicks: 14_400,
      objective: 'capture-red-jackdaw',
      player: { id: 'player', position: { x: 0, z: -36 }, heading: 0, hull: 100, sails: 100, crew: 52, cannon: 8 },
      opponent: { id: 'opponent', position: { x: 0, z: 36 }, heading: Math.PI, hull: 100, sails: 100, crew: 48, cannon: 8 },
    });
  });
});
