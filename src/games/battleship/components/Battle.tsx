import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Board, type BoardCell, type PlacedShip } from './Board';
import type { Burst } from './BoardFX';
import { ShipProfile } from './ships';

// three.js is heavy, so the 3D ocean loads on demand — staying in 2D never
// downloads it.
const Fleet3D = lazy(() => import('./Fleet3D'));
import { FLEET, shipSpec, skinById } from '@games/battleship/domain/constants';
import { COLUMN_LABELS, shipCells } from '@games/battleship/domain/board';
import { ownBoardView, radarGrid, shipName, sunkByAttacker, type CellState } from '@games/battleship/domain/engine';
import { RadarIcon, ShieldIcon } from '@shared/ui/icons';
import { BOARD_SIZE, type Coord, type Fleet, type GameLog, type ShipId, type ShotEvent, type Side } from '@games/battleship/domain/types';

const coordLabel = (row: number, col: number) => `${COLUMN_LABELS[col]}${row + 1}`;

interface BattleProps {
  log: GameLog;
  side: Side;
  myName: string;
  oppName: string;
  skinId: string;
  oppSkinId: string;
  myFleet: Fleet;
  myTurn: boolean;
  pendingFire: Coord | null;
  onFire: (coord: Coord) => void;
}

type View = 'radar' | 'fleet';

export function Battle({
  log,
  side,
  myName,
  oppName,
  skinId,
  oppSkinId,
  myFleet,
  myTurn,
  pendingFire,
  onFire,
}: BattleProps) {
  // On narrow screens we show one board at a time; default to the radar so the
  // player is looking at their attack board when it's their move.
  const [view, setView] = useState<View>('radar');
  useEffect(() => {
    if (myTurn) setView('radar');
  }, [myTurn]);

  // Your fleet board can render as the flat grid or a 3D ocean. Remembered
  // per device; the radar stays 2D — that's where the aiming happens.
  const [fleetDim, setFleetDim] = useState<'2d' | '3d'>(() => {
    try { return localStorage.getItem('bs-fleet-view-v1') === '3d' ? '3d' : '2d'; } catch { return '2d'; }
  });
  const pickFleetDim = (d: '2d' | '3d') => {
    setFleetDim(d);
    try { localStorage.setItem('bs-fleet-view-v1', d); } catch { /* ignore */ }
  };

  // Detect the just-resolved shot and flag it for a one-shot impact animation
  // (shockwave / ripple / explosion + a board shake). The flag auto-clears so
  // the next shot re-triggers even on the same board.
  const [impact, setImpact] = useState<{ id: number; row: number; col: number; kind: 'miss' | 'hit' | 'sunk'; onEnemy: boolean } | null>(null);
  const shotCountRef = useRef(0);
  const impactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const shots = log.filter((e): e is ShotEvent => e.type === 'shot');
    if (shots.length > shotCountRef.current) {
      const last = shots[shots.length - 1];
      const kind = last.allSunk || last.sunk ? 'sunk' : last.hit ? 'hit' : 'miss';
      setImpact({ id: shots.length, row: last.row, col: last.col, kind, onEnemy: last.by === side });
      if (impactTimer.current) clearTimeout(impactTimer.current);
      impactTimer.current = setTimeout(() => setImpact(null), 700);
    }
    shotCountRef.current = shots.length;
  }, [log, side]);
  useEffect(() => () => {
    if (impactTimer.current) clearTimeout(impactTimer.current);
  }, []);

  const isFresh = (onEnemy: boolean, r: number, c: number) =>
    impact !== null && impact.onEnemy === onEnemy && impact.row === r && impact.col === c;
  const boardShake = (onEnemy: boolean): 'soft' | 'hard' | null =>
    impact && impact.onEnemy === onEnemy && impact.kind !== 'miss' ? (impact.kind === 'sunk' ? 'hard' : 'soft') : null;
  const fxFor = (onEnemy: boolean): Burst | null =>
    impact && impact.onEnemy === onEnemy
      ? { id: impact.id, row: impact.row, col: impact.col, kind: impact.kind }
      : null;

  const radar = radarGrid(log, side);
  const own = ownBoardView(log, myFleet, side);

  const enemyCells: BoardCell[][] = radar.map((r, ri) =>
    r.map((state, ci) => {
      if (pendingFire && pendingFire.row === ri && pendingFire.col === ci) {
        return { state: 'water', preview: 'ok' };
      }
      return { state: state === 'unknown' ? 'water' : state, fresh: isFresh(true, ri, ci) };
    }),
  );

  // Ships are drawn as top-down overlays (see ownShips); un-hit ship cells stay
  // water so the silhouette shows, and incoming shots draw over them.
  const ownCells: BoardCell[][] = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => {
      const incoming = own.incoming[r][c];
      const fresh = isFresh(false, r, c);
      if (incoming !== 'unknown') return { state: incoming, fresh };
      return { state: 'water' };
    }),
  );

  const ownShips: PlacedShip[] = myFleet.map((p) => {
    const sunk = own.sunkShips.has(p.shipId);
    const damaged = !sunk && shipCells(p).some((c) => own.incoming[c.row][c.col] === 'hit');
    return {
      shipId: p.shipId,
      row: p.row,
      col: p.col,
      size: shipSpec(p.shipId).size,
      orientation: p.orientation,
      sunk,
      damaged,
    };
  });

  const mySunk = sunkByAttacker(log, side);
  const enemySunkCount = mySunk.length;
  const myLostCount = own.sunkShips.size;
  // The enemy's sunk ships, reconstructed so they show as grey silhouettes on
  // the radar just like my own sunk ships do on my board.
  const enemyShips = sunkEnemyShips(radar, log, side);

  const radarBoard = (
    <div className="panel">
      <div className="board-title">
        <span className="name">
          <RadarIcon size={16} /> Radar — {oppName}'s waters
        </span>
        <span className="hint">{enemySunkCount}/{FLEET.length} sunk</span>
      </div>
      <Board
        cells={enemyCells}
        skinId={oppSkinId}
        variant="enemy"
        active={myTurn}
        shake={boardShake(true)}
        fx={fxFor(true)}
        ships={enemyShips}
        onCell={myTurn ? (r, c) => onFire({ row: r, col: c }) : undefined}
        disabled={!myTurn}
      />
      <FleetRoster sunkIds={mySunk} skinColor={skinById(oppSkinId).color} />
    </div>
  );

  const fleetBoard = (
    <div className="panel">
      <div className="board-title">
        <span className="name">
          <ShieldIcon size={16} /> Your fleet — {myName}
        </span>
        <span className="fleet-dims view-tabs" role="group" aria-label="Fleet view">
          <button data-active={fleetDim === '2d'} onClick={() => pickFleetDim('2d')} data-testid="fleet-view-2d">2D</button>
          <button data-active={fleetDim === '3d'} onClick={() => pickFleetDim('3d')} data-testid="fleet-view-3d">3D</button>
        </span>
        <span className="hint">{FLEET.length - myLostCount}/{FLEET.length} afloat</span>
      </div>
      {fleetDim === '3d' ? (
        <Suspense fallback={<p className="subtle center bs3d-hint">Launching the fleet…</p>}>
          <Fleet3D ships={ownShips} incoming={own.incoming} skinColor={skinById(skinId).color} />
        </Suspense>
      ) : (
        <Board cells={ownCells} skinId={skinId} variant="own" ships={ownShips} shake={boardShake(false)} fx={fxFor(false)} />
      )}
      <FleetRoster sunkIds={[...own.sunkShips]} skinColor={skinById(skinId).color} />
    </div>
  );

  return (
    <div className="stack">
      {/* Narrow (< 720px): tab between one board at a time, log below. */}
      <div className="battle-narrow">
        <div className="view-tabs">
          <button data-active={view === 'radar'} onClick={() => setView('radar')}>
            <RadarIcon size={16} /> Radar
          </button>
          <button data-active={view === 'fleet'} onClick={() => setView('fleet')}>
            <ShieldIcon size={16} /> My Fleet
          </button>
        </div>
        {view === 'radar' ? radarBoard : fleetBoard}
        <MoveLog log={log} side={side} myName={myName} oppName={oppName} />
      </div>

      {/* Wide (≥ 720px): both boards side by side; at ≥ 1024px the log becomes
          a full-height column beside them to fill a landscape tablet/desktop. */}
      <div className="battle-wide">
        <div className="boards">
          {radarBoard}
          {fleetBoard}
        </div>
        <MoveLog log={log} side={side} myName={myName} oppName={oppName} />
      </div>
    </div>
  );
}

/**
 * The fleet read-out under each board: a profile silhouette + name per ship.
 * Afloat ships glow in the fleet colour; sunk ships go grey with their name
 * struck through — the same visual language on both my board and the radar.
 */
function FleetRoster({ sunkIds, skinColor }: { sunkIds: string[]; skinColor: string }) {
  return (
    <div className="fleet-roster">
      {FLEET.map((spec) => {
        const sunk = sunkIds.includes(spec.id);
        return (
          <div key={spec.id} className={`fs-ship ${sunk ? 'sunk' : ''}`}>
            <span className="fs-art" style={{ color: sunk ? undefined : skinColor }}>
              <ShipProfile shipId={spec.id} height={16} />
            </span>
            <span className="fs-name">{spec.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Reconstruct the enemy's sunk ships as top-down silhouettes for the radar.
 *
 * `radarGrid` only marks the *finishing* cell as 'sunk' (the attacker has no
 * enemy geometry), so for each finishing shot we know the ship's id/size and
 * one of its cells. A sunk ship is `size` contiguous hit cells in a line, so we
 * walk the hit run through that cell to find the orientation and anchor.
 * (Two sunk ships touching end-to-end could in theory blur together — a rare
 * board state that only softens the drawn shape.)
 */
function sunkEnemyShips(radar: CellState[][], log: GameLog, side: Side): PlacedShip[] {
  const struck = (r: number, c: number) =>
    r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && (radar[r][c] === 'hit' || radar[r][c] === 'sunk');

  const finishing = log.filter(
    (e): e is ShotEvent => e.type === 'shot' && e.by === side && e.sunk !== null,
  );

  return finishing.map((e) => {
    const shipId = e.sunk as ShipId;
    const size = shipSpec(shipId).size;
    let left = e.col;
    while (struck(e.row, left - 1)) left--;
    let top = e.row;
    while (struck(top - 1, e.col)) top--;
    let right = e.col;
    while (struck(e.row, right + 1)) right++;
    let bottom = e.row;
    while (struck(bottom + 1, e.col)) bottom++;
    const horiz = right - left >= bottom - top;
    // The hull's anchor is the start of the hit run, kept on-board.
    const row = horiz ? e.row : Math.min(top, BOARD_SIZE - size);
    const col = horiz ? Math.min(left, BOARD_SIZE - size) : e.col;
    return { shipId, row, col, size, orientation: horiz ? ('H' as const) : ('V' as const), sunk: true };
  });
}

/** A shot's radar class and its human-readable log label. */
function describeShot(e: ShotEvent): { res: 'hit' | 'miss' | 'sunk'; label: string } {
  if (e.allSunk) return { res: 'sunk', label: 'WIN — fleet destroyed' };
  if (e.sunk) return { res: 'sunk', label: `sank the ${shipName(e.sunk)}` };
  return e.hit ? { res: 'hit', label: 'hit' } : { res: 'miss', label: 'miss' };
}

function MoveLog({ log, side, myName, oppName }: { log: GameLog; side: Side; myName: string; oppName: string }) {
  const shots = log.filter((e): e is ShotEvent => e.type === 'shot');
  const last = shots.length - 1;

  return (
    <div className="panel">
      <h2>Battle log</h2>
      {shots.length === 0 ? (
        <p className="subtle">No shots fired yet.</p>
      ) : (
        <div className="movelog">
          {/* Newest first. Stable keys by original index so only the freshest
              entry re-mounts (and plays the terminal typing animation). */}
          {shots
            .map((e, origIdx) => {
              const mine = e.by === side;
              const { res, label } = describeShot(e);
              return (
                <div className={`entry ${origIdx === last ? 'new' : ''}`} key={origIdx}>
                  <span className="prompt">&gt;</span>
                  <span className={`who ${mine ? 'me' : 'them'}`}>{mine ? myName || 'You' : oppName || 'Them'}</span>
                  <span className="coord">{coordLabel(e.row, e.col)}</span>
                  <span className={`res ${res}`}>{label}</span>
                </div>
              );
            })
            .reverse()}
        </div>
      )}
    </div>
  );
}
