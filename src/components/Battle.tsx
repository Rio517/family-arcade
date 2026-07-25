import { useEffect, useState } from 'react';
import { Board, type BoardCell } from './Board';
import { FLEET } from '../game/constants';
import { ownBoardView, radarGrid, sunkByAttacker } from '../game/engine';
import { BOARD_SIZE, type Coord, type Fleet, type GameLog, type Side } from '../game/types';

const COL = 'ABCDEFGHJK';
const coordLabel = (row: number, col: number) => `${COL[col]}${row + 1}`;

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

  const radar = radarGrid(log, side);
  const own = ownBoardView(log, myFleet, side);

  const enemyCells: BoardCell[][] = radar.map((r, ri) =>
    r.map((state, ci) => {
      if (pendingFire && pendingFire.row === ri && pendingFire.col === ci) {
        return { state: 'water', preview: 'ok' };
      }
      return { state: state === 'unknown' ? 'water' : state };
    }),
  );

  const ownCells: BoardCell[][] = Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => {
      const incoming = own.incoming[r][c];
      if (incoming !== 'unknown') return { state: incoming };
      return { state: own.ships[r][c] ? 'ship' : 'water' };
    }),
  );

  const mySunk = sunkByAttacker(log, side);
  const enemySunkCount = mySunk.length;
  const myLostCount = own.sunkShips.size;

  const banner = myTurn
    ? { cls: 'mine', text: '🎯 Your shot — tap the enemy waters' }
    : pendingFire
      ? { cls: 'theirs', text: '📡 Firing…' }
      : { cls: 'theirs', text: `⏳ ${oppName}'s turn` };

  const radarBoard = (
    <div className="panel">
      <div className="board-title">
        <span className="name">🎯 Radar — {oppName}'s waters</span>
        <span className="hint">{enemySunkCount}/{FLEET.length} sunk</span>
      </div>
      <Board
        cells={enemyCells}
        skinId={oppSkinId}
        variant="enemy"
        active={myTurn}
        onCell={myTurn ? (r, c) => onFire({ row: r, col: c }) : undefined}
        disabled={!myTurn}
      />
      <FleetStatus title="Enemy fleet" sunkIds={mySunk} />
    </div>
  );

  const fleetBoard = (
    <div className="panel">
      <div className="board-title">
        <span className="name">🛡️ Your fleet — {myName}</span>
        <span className="hint">{FLEET.length - myLostCount}/{FLEET.length} afloat</span>
      </div>
      <Board cells={ownCells} skinId={skinId} variant="own" />
      <FleetStatus title="Your fleet" sunkIds={[...own.sunkShips]} />
    </div>
  );

  return (
    <div className="stack">
      <div className={`turn-banner ${banner.cls}`}>{banner.text}</div>

      {/* Narrow (< 720px): tab between one board at a time, log below. */}
      <div className="battle-narrow">
        <div className="view-tabs">
          <button data-active={view === 'radar'} onClick={() => setView('radar')}>
            🎯 Radar
          </button>
          <button data-active={view === 'fleet'} onClick={() => setView('fleet')}>
            🛡️ My Fleet
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

function FleetStatus({ title, sunkIds }: { title: string; sunkIds: string[] }) {
  return (
    <div>
      <div className="subtle" style={{ margin: '10px 0 4px', fontSize: 12 }}>{title}</div>
      <div className="fleet-status">
        {FLEET.map((spec) => {
          const sunk = sunkIds.includes(spec.id);
          return (
            <span key={spec.id} className={`fs ${sunk ? 'sunk' : ''}`}>
              {spec.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MoveLog({ log, side, myName, oppName }: { log: GameLog; side: Side; myName: string; oppName: string }) {
  // The log is already in turn order; newest-first for display.
  const ordered = log.filter((e) => e.type === 'shot');

  return (
    <div className="panel">
      <h2>Battle log</h2>
      {ordered.length === 0 ? (
        <p className="subtle">No shots fired yet.</p>
      ) : (
        <div className="movelog">
          {ordered
            .slice()
            .reverse()
            .map((e, i) => {
              if (e.type !== 'shot') return null;
              const mine = e.by === side;
              const res = e.allSunk ? 'sunk' : e.sunk ? 'sunk' : e.hit ? 'hit' : 'miss';
              const label = e.allSunk
                ? 'WIN — fleet destroyed'
                : e.sunk
                  ? `sank the ${shipName(e.sunk)}`
                  : e.hit
                    ? 'hit'
                    : 'miss';
              return (
                <div className="entry" key={`${e.row}-${e.col}-${i}`}>
                  <span className={`who ${mine ? 'me' : 'them'}`}>{mine ? myName || 'You' : oppName || 'Them'}</span>
                  <span className="coord">{coordLabel(e.row, e.col)}</span>
                  <span className={`res ${res}`}>{label}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function shipName(id: string): string {
  return FLEET.find((s) => s.id === id)?.name ?? id;
}
