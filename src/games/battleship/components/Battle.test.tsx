import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Battle } from './Battle';
import { BEAT_MS, IN_MS, OUT_MS } from '@games/battleship/state/shotPlayback';

// Warm the lazy 3D chunk once per worker: three.js + the ship models are a
// heavy cold transform, and racing them inside a findBy timeout flakes when
// the whole suite runs in parallel.
beforeAll(async () => {
  await import('./Fleet3D');
  await import('./RadarSinking');
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

  it('announces each cell state in the accessible name, not just colour', () => {
    const myFleet = stackFleet(); // destroyer sits on row 4, cols 0–1
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
    // Hit/miss/sunk are otherwise colour-and-shape only — a screen reader
    // needs the state in the cell's name (Risk's territories set the bar).
    expect(screen.getByLabelText('A5 — sunk ship')).toBeInTheDocument(); // my destroyer
    expect(screen.getByLabelText('A1 — open water')).toBeInTheDocument(); // my board, unfired
    expect(screen.getByLabelText('A1 — not fired at')).toBeInTheDocument(); // radar, unfired
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

  it('hands the ocean to the pop-out — only one 3D instance mounts at a time', async () => {
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
    fireEvent.click(await screen.findByTestId('fleet3d-pop', {}, { timeout: 5000 }));
    // jsdom has no WebGL, so every mounted Fleet3D shows its fallback. The
    // panel copy must yield while the dialog is open — mounting both runs two
    // WebGL contexts + render loops and doubles GPU load on real iPads.
    expect(await screen.findAllByTestId('fleet3d-fallback', {}, { timeout: 5000 })).toHaveLength(1);
    // Closing the dialog hands the ocean back to the panel.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findAllByTestId('fleet3d-fallback', {}, { timeout: 5000 })).toHaveLength(1);
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

describe('<Battle> watching the shots (the darker-arcade pitch)', () => {
  beforeEach(() => localStorage.setItem('bs-fleet-view-v1', '2d'));
  const FX = { fire: 'a', boom: 'a', water: 'a', guns: true } as const;
  const base: GameLog = [{ type: 'start', first: 'host' }];
  const fired: GameLog = [...base, { type: 'shot', by: 'host', row: 5, col: 5, hit: true, sunk: null, allSunk: false }];

  const battle = (log: GameLog, onFire = vi.fn()) => (
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
      onFire={onFire}
      fx={FX}
      watchShots
      onWatchShots={vi.fn()}
    />
  );

  it('holds the result until the shell lands; a tap skips straight to it', () => {
    const onFire = vi.fn();
    const { rerender } = render(battle(base, onFire));
    rerender(battle(fired, onFire));
    // In flight: the cell isn't revealed yet, the radar takes no shots, and
    // the whole screen is a skip button.
    expect(screen.getByLabelText('F6 — not fired at')).toBeDisabled();
    fireEvent.click(screen.getByTestId('skip-shot'));
    expect(screen.getByLabelText('F6 — hit')).toBeInTheDocument();
    expect(screen.queryByTestId('skip-shot')).not.toBeInTheDocument();
    // Skipping only changed the picture: no shot was fired by the tap.
    expect(onFire).not.toHaveBeenCalled();
  });

  it('Escape skips too, and the setting is a labelled switch', () => {
    const onWatch = vi.fn();
    const { rerender } = render(battle(base));
    rerender(battle(fired));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('F6 — hit')).toBeInTheDocument();
    rerender(
      <Battle
        log={fired}
        side="host"
        myName="Rio"
        oppName="Kid"
        skinId="aqua"
        oppSkinId="ember"
        myFleet={stackFleet()}
        myTurn
        pendingFire={null}
        onFire={vi.fn()}
        fx={FX}
        watchShots
        onWatchShots={onWatch}
      />,
    );
    const toggle = screen.getByRole('switch', { name: /watch the shots/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(onWatch).toHaveBeenCalledWith(false);
  });

  it('holds our result a beat before their shell; a tap in the beat shows theirs at once', () => {
    vi.useFakeTimers();
    try {
      const answered: GameLog = [...fired, { type: 'shot', by: 'guest', row: 9, col: 9, hit: false, sunk: null, allSunk: false }];
      const { rerender } = render(battle(base));
      rerender(battle(fired));
      rerender(battle(answered));
      act(() => vi.advanceTimersByTime(OUT_MS));
      // Our hit is on the radar; their miss isn't shown yet, and the screen still skips.
      expect(screen.getByLabelText('F6 — hit')).toBeInTheDocument();
      expect(screen.queryByLabelText('K10 — miss')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('skip-shot'));
      expect(screen.getByLabelText('K10 — miss')).toBeInTheDocument();
      expect(screen.queryByTestId('skip-shot')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the result waits for their final shell after the beat, then the page moves on', () => {
    vi.useFakeTimers();
    try {
      const onSettled = vi.fn();
      const last: GameLog = [...fired, { type: 'shot', by: 'guest', row: 9, col: 9, hit: true, sunk: null, allSunk: false }];
      const view = (log: GameLog) => (
        <Battle log={log} side="host" myName="Rio" oppName="Kid" skinId="aqua" oppSkinId="ember" myFleet={stackFleet()} myTurn={false} pendingFire={null} onFire={vi.fn()} fx={FX} watchShots onWatchShots={vi.fn()} finished onSettled={onSettled} />
      );
      const { rerender } = render(view(base));
      rerender(view(fired));
      rerender(view(last));
      act(() => vi.advanceTimersByTime(OUT_MS + BEAT_MS - 10));
      expect(onSettled).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(10 + IN_MS));
      expect(onSettled).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1400));
      expect(onSettled).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a ship we sink goes down on the radar first; with no 3D to show it, its sunk mark shows at once', async () => {
    vi.useFakeTimers();
    try {
      const first: GameLog = [...fired];
      const sank: GameLog = [...first, { type: 'shot', by: 'host', row: 5, col: 6, hit: true, sunk: 'destroyer', allSunk: false }];
      const { rerender } = render(battle(first));
      rerender(battle(sank));
      // In flight: only our own destroyer is drawn; the radar has none yet.
      expect(screen.getAllByTestId('ship-overlay-destroyer')).toHaveLength(1);
      await act(async () => {
        vi.advanceTimersByTime(OUT_MS);
      });
      // Landed. The 3D sinking cannot play here (no WebGL), so the flat mark
      // shows straight away instead of after the sinking's time.
      for (let i = 0; i < 5 && screen.getAllByTestId('ship-overlay-destroyer').length < 2; i++) {
        await act(async () => {
          await import('./RadarSinking');
        });
      }
      expect(screen.getAllByTestId('ship-overlay-destroyer')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("without the pitch, a shot shows at once as it always has", () => {
    const { rerender } = render(
      <Battle log={base} side="host" myName="Rio" oppName="Kid" skinId="aqua" oppSkinId="ember" myFleet={stackFleet()} myTurn pendingFire={null} onFire={vi.fn()} />,
    );
    rerender(
      <Battle log={fired} side="host" myName="Rio" oppName="Kid" skinId="aqua" oppSkinId="ember" myFleet={stackFleet()} myTurn pendingFire={null} onFire={vi.fn()} />,
    );
    expect(screen.getByLabelText('F6 — hit')).toBeInTheDocument();
    expect(screen.queryByTestId('skip-shot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('watch-shots')).not.toBeInTheDocument();
  });
});
