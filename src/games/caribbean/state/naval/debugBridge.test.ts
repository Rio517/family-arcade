import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { NavalSession } from './NavalSession';
import { createNavalDebugBridge } from './debugBridge';

describe('naval harness debug bridge', () => {
  it('returns defensive snapshots that cannot forge later evidence reads', () => {
    const session = new NavalSession(BATTLE_LAB_INPUT);
    const bridge = createNavalDebugBridge(session);
    const exposed = bridge.getSnapshot();

    exposed.state.ships.player.hull = 0;
    exposed.currentCommand.sail = 'reefed';

    expect(bridge.getSnapshot().state.ships.player.hull).toBe(100);
    expect(bridge.getSnapshot().currentCommand.sail).toBe('full');
    expect(session.state.ships.player.hull).toBe(100);
  });

  it.each([
    ['port', 20, 1, 3.1],
    ['starboard', -20, -1, -3.1],
  ] as const)('reports real %s volley vectors and shared muzzle origins', (side, targetX, vectorX, muzzleX) => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.player.position = { x: 0, z: 0 };
    input.player.heading = 0;
    input.opponent.position = { x: targetX, z: 0 };
    input.opponent.heading = Math.PI;
    const session = new NavalSession(input, { requestFrame: () => 1, cancelFrame: () => undefined });
    const bridge = createNavalDebugBridge(session);

    session.requestFire(side);
    session.deliverFrameMicros(16_667);

    expect(bridge.getVolleyEvidence(0)).toEqual([
      expect.objectContaining({
        side,
        vector: { x: vectorX, z: 0 },
        muzzleOrigin: expect.objectContaining({ x: muzzleX }),
      }),
    ]);
  });
});
