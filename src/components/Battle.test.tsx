import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Battle } from './Battle';
import { stackFleet } from '../test/helpers';
import { resolveShot } from '../game/engine';
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

  it('renders the boards and move log without crashing', () => {
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
    // The battle log and boards are rendered in both the narrow and wide
    // layouts (CSS hides one), so these appear more than once. (The turn
    // indicator now lives in the page top bar, not inside Battle.)
    expect(screen.getAllByText('Battle log').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hit').length).toBeGreaterThan(0); // host's hit entry
  });

  it('draws my fleet as ship overlays and marks a destroyed ship sunk', () => {
    const myFleet = stackFleet(); // destroyer sits on row 4, cols 0–1
    // The guest sinks my destroyer by hitting both of its cells.
    const sunkLog: GameLog = [
      { type: 'start', first: 'guest' },
      resolveShot(myFleet, [], { row: 4, col: 0 }, 'guest'),
      resolveShot(myFleet, [{ row: 4, col: 0 }], { row: 4, col: 1 }, 'guest'),
    ];
    render(
      <Battle
        log={sunkLog}
        side="host"
        myName="Rio"
        oppName="Kid"
        skinId="aqua"
        oppSkinId="ember"
        myFleet={myFleet}
        myTurn={false}
        pendingFire={null}
        onFire={vi.fn()}
      />,
    );
    // Overlays render (in both layouts); the destroyer is sunk, the carrier isn't.
    expect(screen.getAllByTestId('ship-overlay-destroyer')[0].className).toContain('sunk');
    expect(screen.getAllByTestId('ship-overlay-carrier')[0].className).not.toContain('sunk');
  });
});
