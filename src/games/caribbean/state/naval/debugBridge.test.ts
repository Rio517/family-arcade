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
});
