import { describe, expect, it } from 'vitest';

import { fixture } from '../../domain/naval/testFixtures';
import { selectAimCue } from './aimCue';

describe('selectAimCue', () => {
  it('explains the legal physical port broadside window without mutating state', () => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, heading: 0 },
      opponent: { position: { x: 24, z: 0 } },
    });
    const before = structuredClone(state);
    expect(selectAimCue(state, 'player')).toEqual({ side: 'port', quality: 'good', message: 'Port broadside — good range' });
    expect(state).toEqual(before);
  });

  it('uses combat legality at bow, stern, range boundary, reload and cannon boundaries', () => {
    const player = { position: { x: 0, z: 0 }, heading: 0 };
    expect(selectAimCue(fixture({ player, opponent: { position: { x: 0, z: 24 } } }), 'player').message).toMatch(/bow/i);
    expect(selectAimCue(fixture({ player, opponent: { position: { x: 0, z: -24 } } }), 'player').message).toMatch(/stern/i);
    expect(selectAimCue(fixture({ player, opponent: { position: { x: 42, z: 0 } } }), 'player').side).toBe('port');
    expect(selectAimCue(fixture({ player, opponent: { position: { x: 42.01, z: 0 } } }), 'player').message).toMatch(/out of range/i);
    expect(selectAimCue(fixture({ player: { ...player, cannon: 0 }, opponent: { position: { x: 24, z: 0 } } }), 'player').message).toMatch(/disarmed/i);
    expect(selectAimCue(fixture({ player: { ...player, cannon: 2.5 }, opponent: { position: { x: 24, z: 0 } } }), 'player').message).toMatch(/disarmed/i);
    expect(selectAimCue(fixture({ player: { ...player, reload: { port: { progress: 0, required: 10, loaded: false }, starboard: { progress: 10, required: 10, loaded: true } } }, opponent: { position: { x: 24, z: 0 } } }), 'player').message).toMatch(/reloading/i);
  });

  it('recommends ammunition-specific useful bands and names terminal state', () => {
    const player = { position: { x: 0, z: 0 }, heading: 0 };
    expect(selectAimCue(fixture({ player: { ...player, ammunition: 'chain' }, opponent: { position: { x: 20, z: 0 } } }), 'player').quality).toBe('good');
    expect(selectAimCue(fixture({ player: { ...player, ammunition: 'grape' }, opponent: { position: { x: 20, z: 0 } } }), 'player').quality).toBe('fair');
    const terminal = fixture();
    terminal.outcome = { kind: 'surrender', victorShipId: 'player' };
    expect(selectAimCue(terminal, 'player').message).toMatch(/ended/i);
  });
});
