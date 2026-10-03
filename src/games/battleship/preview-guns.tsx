/**
 * Harness for the darker-arcade pitch's effects and guns: the real battle
 * screen, fed a log this page writes, so a salvo, an incoming shell, a hit,
 * a miss and a sinking can be played on demand and screenshot.
 *
 *   /preview-guns.html?fx=a           the arcade take (fx=b cinematic, fx=today the shipped game)
 *   &era=modern                       the modern navy
 *   &watch=0                          Watch the shots off
 *   &demo=1                           play an exchange of shots every few seconds
 *
 * window.__bs.mine('hit'|'miss'|'sunk') and .theirs(...) fire one shot each,
 * for the screenshot and frame-time scripts. Built only under BUILD_HARNESS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Battle } from './components/Battle';
import { shipCells } from './domain/board';
import type { Fleet, GameLog, ShipId, ShotEvent } from './domain/types';
import { usePitch } from './state/pitch';
import '@shared/styles/tokens.css';
import '@games/battleship/styles/battleship.css';
import '@games/battleship/styles/pitch.css';

const myFleet: Fleet = [
  { shipId: 'carrier', row: 1, col: 1, orientation: 'H' },
  { shipId: 'battleship', row: 3, col: 2, orientation: 'V' },
  { shipId: 'cruiser', row: 5, col: 5, orientation: 'H' },
  { shipId: 'submarine', row: 7, col: 1, orientation: 'H' },
  { shipId: 'destroyer', row: 0, col: 8, orientation: 'V' },
];
const S = (by: 'host' | 'guest', row: number, col: number, hit: boolean, sunk: ShipId | null = null): ShotEvent => ({
  type: 'shot', by, row, col, hit, sunk, allSunk: false,
});
// The mid-battle board the shots harness has always shown, so Today matches it.
const START: GameLog = [
  { type: 'start', first: 'host' },
  S('host', 0, 0, true), S('guest', 0, 8, true),
  S('host', 0, 1, true, 'destroyer'), S('guest', 1, 8, true, 'destroyer'),
  S('host', 2, 2, true), S('guest', 1, 1, true),
  S('host', 2, 3, true), S('guest', 1, 2, true),
  S('host', 2, 4, true, 'cruiser'), S('guest', 3, 2, true),
  S('guest', 5, 8, false), S('guest', 8, 4, false), S('guest', 2, 6, false),
];

type Kind = 'hit' | 'miss' | 'sunk';

declare global {
  interface Window {
    __bs?: { mine: (k: Kind) => void; theirs: (k: Kind) => void };
  }
}

// Lets the frame-time and close-up scripts reach the ocean's camera.
(window as unknown as { __bsHarness?: boolean }).__bsHarness = true;

function App() {
  const params = new URLSearchParams(location.search);
  const era = params.get('era') === 'modern' ? 'modern' : 'classic';
  const pitch = usePitch();
  const [watch, setWatch] = useState(params.get('watch') !== '0');
  const [log, setLog] = useState<GameLog>(START);
  const shots = useMemo(() => log.filter((e): e is ShotEvent => e.type === 'shot'), [log]);

  const mine = useCallback((kind: Kind) => {
    setLog((l) => {
      const taken = new Set(l.filter((e): e is ShotEvent => e.type === 'shot' && e.by === 'host').map((e) => `${e.row},${e.col}`));
      // Walk the radar for an open cell, seeded by how many shots are down.
      const n = l.length;
      for (let i = 0; i < 100; i++) {
        const k = (n * 37 + i * 13) % 100;
        const row = Math.floor(k / 10);
        const col = k % 10;
        if (taken.has(`${row},${col}`)) continue;
        return [...l, S('host', row, col, kind !== 'miss', kind === 'sunk' ? 'submarine' : null)];
      }
      return l;
    });
  }, []);

  const theirs = useCallback((kind: Kind) => {
    setLog((l) => {
      const taken = new Set(l.filter((e): e is ShotEvent => e.type === 'shot' && e.by === 'guest').map((e) => `${e.row},${e.col}`));
      if (kind === 'miss') {
        for (let i = 0; i < 100; i++) {
          const k = (l.length * 41 + i * 7) % 100;
          const row = Math.floor(k / 10);
          const col = k % 10;
          const onShip = myFleet.some((p) => shipCells(p).some((c) => c.row === row && c.col === col));
          if (!onShip && !taken.has(`${row},${col}`)) return [...l, S('guest', row, col, false)];
        }
        return l;
      }
      // A hit on the first ship still afloat; its last cell sinks it.
      for (const p of myFleet) {
        const open = shipCells(p).filter((c) => !taken.has(`${c.row},${c.col}`));
        if (open.length === 0) continue;
        if (kind === 'hit' && open.length === 1) continue;
        const c = kind === 'sunk' ? open[open.length - 1] : open[0];
        // A sinking needs every other cell hit first: fill them in silently.
        const fill = kind === 'sunk' ? open.slice(0, -1).map((o) => S('guest', o.row, o.col, true)) : [];
        const sunk = kind === 'sunk' || open.length === 1 ? p.shipId : null;
        return [...l, ...fill, S('guest', c.row, c.col, true, sunk)];
      }
      return l;
    });
  }, []);

  useEffect(() => {
    window.__bs = { mine, theirs };
  }, [mine, theirs]);

  // ?demo=1: an exchange of fire every few seconds.
  useEffect(() => {
    if (params.get('demo') !== '1') return;
    const script: Array<[() => void, number]> = [
      [() => mine('hit'), 0],
      [() => theirs('miss'), 1900],
      [() => mine('miss'), 3900],
      [() => theirs('hit'), 5800],
      [() => mine('sunk'), 7800],
      [() => theirs('sunk'), 9700],
    ];
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers = script.map(([fn, at]) => setTimeout(fn, 800 + at));
      timers.push(setTimeout(() => {
        setLog(START);
        setTimeout(run, 600);
      }, 13500));
    };
    run();
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once for the page
  }, []);

  const myTurn = shots.length === 0 || shots[shots.length - 1].by === 'guest';
  return (
    <div className="app bs-app-wide">
      <Battle
        log={log}
        side="host"
        myName="Rio"
        oppName="Max"
        skinId="aqua"
        oppSkinId="coral"
        era={era}
        myFleet={myFleet}
        myTurn={myTurn}
        pendingFire={null}
        onFire={() => mine(shots.length % 3 === 0 ? 'miss' : 'hit')}
        fx={pitch.fx}
        watchShots={watch}
        onWatchShots={setWatch}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
