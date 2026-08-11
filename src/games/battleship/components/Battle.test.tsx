import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Battle } from './Battle';

// Warm the lazy 3D chunk once per worker: three.js + the ship models are a
// heavy cold transform, and racing them inside a findBy timeout flakes when
// the whole suite runs in parallel.
beforeAll(async () => {
  await import('./Fleet3D');
}, 30000);
import { stackFleet } from '@test/helpers';
import { resolveShot } from '@games/battleship/domain/engine';
import type { GameLog } from '@games/battleship/domain/types';

/**
 * A render smoke test for the main battle screen: it exercises the radar/fleet
 * board derivation, the turn banner, and the move log in one pass, guarding
 * against runtime regressions in the most complex component (unreachable in a
 * unit test via the live P2P flow).
 */
describe('<Battle>', () => {
  // The fleet board defaults to the 3D ocean now; these tests exercise the 2D
  // grid (overlays, cells), so pin the remembered view.
  beforeEach(() => localStorage.setItem('bs-fleet-view-v1', '2d'));
  const log: GameLog = [
    { type: 'start', first: 'host' },
    { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: null, allSunk: false },
    { type: 'shot', by: 'guest', row: 9, col: 9, hit: false, sunk: null, allSunk: false },
  ];

  it('renders the boards with the log collapsed to a strip', () => {
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
    // The full log no longer occupies the battle screen — just a strip
    // showing the latest shot (guest's miss), with the record behind a modal.
    const strip = screen.getByTestId('battle-log-open');
    expect(strip).toHaveTextContent('miss'); // the latest shot…
    expect(strip).not.toHaveTextContent('hit'); // …and only the latest
    expect(screen.queryByRole('dialog', { name: /battle log/i })).toBeNull();
  });

  it('opens the full battle log as a modal and closes on Escape', () => {
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
    fireEvent.click(screen.getByTestId('battle-log-open'));
    const dialog = screen.getByRole('dialog', { name: /battle log/i });
    // The whole record is there — both shots, oldest included.
    expect(dialog).toHaveTextContent('hit');
    expect(dialog).toHaveTextContent('miss');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /battle log/i })).toBeNull();

    // The Close button works too.
    fireEvent.click(screen.getByTestId('battle-log-open'));
    fireEvent.click(screen.getByTestId('battle-log-close'));
    expect(screen.queryByRole('dialog', { name: /battle log/i })).toBeNull();
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

  it('pops the 3D fleet out into a big dialog and closes on Escape', async () => {
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
    fireEvent.click(screen.getAllByTestId('fleet-view-3d')[0]);
    // The 3D view is a lazy chunk; give it room to arrive on a cold cache.
    fireEvent.click(await screen.findByTestId('fleet3d-pop', {}, { timeout: 5000 }));
    expect(screen.getByRole('dialog', { name: /your fleet in 3d/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /your fleet in 3d/i })).toBeNull();
  });
});

describe('<Battle> — 3D fleet view', () => {
  const log: GameLog = [{ type: 'start', first: 'host' }];

  it('defaults the fleet to the 3D ocean and remembers a 2D pick', async () => {
    localStorage.removeItem('bs-fleet-view-v1');
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
    // 3D is the default — jsdom has no WebGL, so the lazy view resolves to
    // its graceful fallback without any toggle press.
    expect((await screen.findAllByTestId('fleet3d-fallback', {}, { timeout: 5000 })).length).toBeGreaterThan(0);

    // Choosing the 2D grid is remembered per device.
    fireEvent.click(screen.getAllByTestId('fleet-view-2d')[0]);
    expect(localStorage.getItem('bs-fleet-view-v1')).toBe('2d');
  });
});
