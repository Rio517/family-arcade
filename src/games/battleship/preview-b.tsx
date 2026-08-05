import { createRoot } from 'react-dom/client';
import { Battle } from './components/Battle';
import type { Fleet, GameLog, ShipId } from '@games/battleship/domain/types';
import '@shared/styles/tokens.css';
import '@games/battleship/styles/battleship.css';
const myFleet: Fleet = [
  { shipId: 'carrier', row: 1, col: 1, orientation: 'H' },
  { shipId: 'battleship', row: 3, col: 2, orientation: 'V' },
  { shipId: 'cruiser', row: 5, col: 5, orientation: 'H' },
  { shipId: 'submarine', row: 7, col: 1, orientation: 'H' },
  { shipId: 'destroyer', row: 0, col: 8, orientation: 'V' },
];
const S = (by: 'host'|'guest', row: number, col: number, hit: boolean, sunk: ShipId|null = null) =>
  ({ type: 'shot' as const, by, row, col, hit, sunk, allSunk: false });
const log: GameLog = [
  { type: 'start', first: 'host' },
  S('host', 0, 0, true), S('guest', 0, 8, true),
  S('host', 0, 1, true, 'destroyer'), S('guest', 1, 8, true, 'destroyer'),
  S('host', 2, 2, true), S('guest', 1, 1, true),
  S('host', 2, 3, true), S('guest', 1, 2, true),
  S('host', 2, 4, true, 'cruiser'), S('guest', 3, 2, true),
  S('guest', 5, 8, false), S('guest', 8, 4, false), S('guest', 2, 6, false),
];
/**
 * Harness-only sizing. The real board keeps the 3D ocean in a square tile
 * beside the radar grid, which is right in the game and far too small to
 * judge a ship's deck in. Here it takes most of the viewport.
 */
const HARNESS_CSS = `
  .app { max-width: none !important; }
  .bs3d { aspect-ratio: auto !important; height: min(82vh, 900px) !important; }
`;

function App() {
  return (
    <div className="app" style={{ maxWidth: 'none' }}>
      <style>{HARNESS_CSS}</style>
      <p className="subtle center" style={{ margin: '0 0 8px' }}>
        Harness — the 3D tile is enlarged here. For one ship filling the screen, open{' '}
        <a href="/preview-ship.html">/preview-ship.html</a>.
      </p>
      <Battle
        log={log}
        side="host"
        myName="Rio"
        oppName="Max"
        skinId="aqua"
        oppSkinId="coral"
        myFleet={myFleet}
        myTurn
        pendingFire={null}
        onFire={() => {}}
      />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
