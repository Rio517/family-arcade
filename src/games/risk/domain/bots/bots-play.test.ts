import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { decide } from './decide';
import { personaById } from './personas';
import {
  endAttack,
  endReinforce,
  endTurn,
  fortify,
  newGame,
  placeArmy,
  resolveAttack,
} from '../rules';
import { mapById, MAPS } from '../../maps/registry';
import type { GameState } from '../types';

/** Drive a whole campaign with the pure loop the React effect mirrors. */
function playOut(personaIds: string[], seed: number, maxSteps: number) {
  const map = mapById(MAPS[0].id).build();
  const topo = map.topology;
  const rng = seededRng(seed);
  let state: GameState = newGame(
    topo,
    personaIds.map((id, i) => ({ name: personaById(id).name, color: `#00${i}`, bot: id })),
    rng,
    'random',
  );
  let steps = 0;
  while (state.phase !== 'over' && steps < maxSteps) {
    const persona = personaById(state.players[state.current].bot!);
    const step = decide(state, topo, persona, rng);
    switch (step.kind) {
      case 'place':
        state = placeArmy(state, step.territoryId, topo);
        break;
      case 'doneReinforce':
        state = endReinforce(state);
        break;
      case 'attack':
        state = resolveAttack(state, topo, step.from, step.to, rng).state;
        break;
      case 'doneAttack':
        state = endAttack(state);
        break;
      case 'fortify':
        state = fortify(state, topo, step.from, step.to, step.count);
        break;
      case 'doneTurn':
        state = endTurn(state, topo);
        break;
    }
    steps++;
    // Every owned territory must keep its garrison — an illegal bot step
    // would corrupt this invariant long before anyone noticed on screen.
    for (const t of Object.values(state.territories)) {
      if (t.owner !== -1) expect(t.armies).toBeGreaterThanOrEqual(1);
    }
  }
  return { state, steps };
}

describe('the computer generals fight a whole war', () => {
  it('three strong generals finish a campaign, deterministically', () => {
    const a = playOut(['flint', 'vex', 'flint'], 11, 5000);
    expect(a.state.phase).toBe('over');
    expect(a.state.winner).not.toBeNull();

    const b = playOut(['flint', 'vex', 'flint'], 11, 5000);
    expect(b.state.winner).toBe(a.state.winner);
    expect(b.steps).toBe(a.steps);
  });

  it('two cadets bumble along without ever breaking the rules', () => {
    const { state, steps } = playOut(['cadet', 'cadet'], 3, 400);
    expect(steps).toBe(400); // still at it — timid, but every step was legal
    expect(state.phase).not.toBe('over');
  });
});
