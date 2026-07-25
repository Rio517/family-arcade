import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Battle } from './Battle';
import { stackFleet } from '../test/helpers';
import type { GameLog } from '../game/types';

/**
 * A render smoke test for the main battle screen: it exercises the radar/fleet
 * board derivation, the turn banner, and the move log in one pass, guarding
 * against runtime regressions in the most complex component (unreachable in a
 * unit test via the live P2P flow).
 */
describe('<Battle>', () => {
  const log: GameLog = [
    { type: 'start', first: 'host' },
    { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: null, allSunk: false },
    { type: 'shot', by: 'guest', row: 9, col: 9, hit: false, sunk: null, allSunk: false },
  ];

  it('renders the turn banner, boards, and move log without crashing', () => {
    render(
      <Battle
        log={log}
        side="host"
        myName="Rio"
        oppName="Kid"
        skinId="aqua"
        oppSkinId="ember"
        myFleet={stackFleet()}
        myTurn
        pendingFire={null}
        onFire={vi.fn()}
      />,
    );
    expect(screen.getByText(/Your shot/)).toBeInTheDocument();
    // The battle log and boards are rendered in both the narrow and wide
    // layouts (CSS hides one), so these appear more than once.
    expect(screen.getAllByText('Battle log').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hit').length).toBeGreaterThan(0); // host's hit entry
  });
});
