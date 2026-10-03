import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Board, type BoardCell, type PlacedShip } from './Board';
import type { Burst, ShellDrop } from './BoardFX';
import { ShipProfile } from './ships';
import { TODAY_FX, prefersReduced, type PitchFx } from '@games/battleship/state/pitch';
import { DROP_MS, OUT_MS, RADAR_SINK_MS, WARN_MS, logUpTo, useShotPlayback } from '@games/battleship/state/shotPlayback';

// three.js is heavy, so the 3D ocean loads on demand — staying in 2D never
// downloads it. The radar's sinking ships are 3D too; only the pitch's guns
// ever mount them.
const Fleet3D = lazy(() => import('./Fleet3D'));
const RadarSinking = lazy(() => import('./RadarSinking'));
import { FLEET, shipSpec, skinById } from '@games/battleship/domain/constants';
import { COLUMN_LABELS, shipCells } from '@games/battleship/domain/board';
import { ownBoardView, radarGrid, shipName, sunkByAttacker, type CellState } from '@games/battleship/domain/engine';
import { CloseIcon, FullscreenIcon, RadarIcon, ShieldIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { BOARD_SIZE, type Coord, type Fleet, type FleetEra, type GameLog, type ShipId, type ShotEvent, type Side } from '@games/battleship/domain/types';

const coordLabel = (row: number, col: number) => `${COLUMN_LABELS[col]}${row + 1}`;

/** Matches the 720px CSS breakpoint that swaps the narrow/wide layouts. */
const WIDE_QUERY = '(min-width: 720px)';

/**
 * Track which layout is live so only that one mounts. Rendering both (CSS
 * display-switched) kept a hidden second copy of everything alive — including
 * a second WebGL context + render loop whenever the fleet was in 3D.
 */
function useWideLayout(): boolean {
  const [wide, setWide] = useState(
    () => typeof matchMedia !== 'function' || matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

interface BattleProps {
  log: GameLog;
  side: Side;
  myName: string;
  oppName: string;
  skinId: string;
  oppSkinId: string;
  /** Which navy my 3D fleet sails; picked on the fleet screen, local-only. */
  era?: FleetEra;
  myFleet: Fleet;
  myTurn: boolean;
  pendingFire: Coord | null;
  onFire: (coord: Coord) => void;
  /** The darker-arcade pitch's effects and guns (today's when absent). */
  fx?: PitchFx;
  /** The per-device "Watch the shots" setting (only offered with the pitch's guns). */
  watchShots?: boolean;
  onWatchShots?: (on: boolean) => void;
  /** The game is over and this screen is staying up to play the final shot. */
  finished?: boolean;
  /** The final shot has played out: the page can move on to the result. */
  onSettled?: () => void;
}

type View = 'radar' | 'fleet';

export function Battle({
  log,
  side,
  myName,
  oppName,
  skinId,
  oppSkinId,
  era = 'classic',
  myFleet,
  myTurn,
  pendingFire,
  onFire,
  fx = TODAY_FX,
  watchShots = false,
  onWatchShots,
  finished = false,
  onSettled,
}: BattleProps) {
  // On narrow screens we show one board at a time; default to the radar so the
  // player is looking at their attack board when it's their move.
  const [view, setView] = useState<View>('radar');
  // The 3D ocean, popped out big enough to admire the whole fleet.
  const [popped, setPopped] = useState(false);
  useDismissOnEscape(popped, () => setPopped(false));
  // The battle log lives behind a one-line strip — it's reference material,
  // not something worth a whole column of the battle screen.
  const [logOpen, setLogOpen] = useState(false);
  useDismissOnEscape(logOpen, () => setLogOpen(false));
  const wide = useWideLayout();
  useEffect(() => {
    if (myTurn) setView('radar');
  }, [myTurn]);

  // Your fleet board can render as the flat grid or a 3D ocean. The ocean is
  // the default — it's the view the fleet was built for; the 2D grid is
  // remembered per device if picked. The radar stays 2D — that's where the
  // aiming happens.
  const [fleetDim, setFleetDim] = useState<'2d' | '3d'>(() => {
    try { return localStorage.getItem('bs-fleet-view-v1') === '2d' ? '2d' : '3d'; } catch { return '3d'; }
  });
  const pickFleetDim = (d: '2d' | '3d') => {
    setFleetDim(d);
    try { localStorage.setItem('bs-fleet-view-v1', d); } catch { /* ignore */ }
  };

  // Each shot as it lands. With the pitch's guns and "Watch the shots" on, a
  // new shot plays first (our salvo, or their shell coming in) and its result
  // is drawn on impact; otherwise it is drawn at once. Either way only the
  // picture waits — the log, and the game, are never touched.
  const playing = fx.guns && watchShots;
  const play = useShotPlayback(log, side, playing);
  const shotTotal = useMemo(() => log.filter((e) => e.type === 'shot').length, [log]);
  const viewLog = useMemo(() => (play.shown >= shotTotal ? log : logUpTo(log, play.shown)), [log, play.shown, shotTotal]);
  const current = play.current;

  // The just-resolved shot, flagged for a one-shot impact animation
  // (shockwave / ripple / explosion + a board shake) while it is fresh.
  const impact = play.last && play.last.fresh
    ? { id: play.last.id, row: play.last.shot.row, col: play.last.shot.col, kind: play.last.kind, onEnemy: play.last.mine }
    : null;

  // A ship we sink, watched in full, goes down in 3D on the radar before its
  // sunk mark shows. A skip cuts it short.
  // (Under reduced motion it is simply sunk, as today.)
  const sinks = playing && !prefersReduced();
  const sinkingShot = sinks && play.last && play.last.mine && play.last.kind === 'sunk' && play.last.watched ? play.last : null;
  const sinkingId = sinkingShot?.id ?? -1;
  const [sankId, setSankId] = useState(-1);
  useEffect(() => {
    if (sinkingId < 0) return;
    const t = setTimeout(() => setSankId(sinkingId), RADAR_SINK_MS);
    return () => clearTimeout(t);
  }, [sinkingId]);
  const sinking = sinkingShot && sinkingId !== sankId ? sinkingShot : null;
  // Its 3D canvas exists only around a sinking: from the moment our sinking
  // shot is fired (its flight gives the canvas time to get ready) until the
  // ship is under. No second WebGL context sits over the radar otherwise.
  const sinkAhead = sinks && current !== null && current.mine && current.kind === 'sunk';

  // The skip: Escape, or a tap anywhere on the battle while a shot plays, our
  // result holds before their answer, or a ship goes down on the radar.
  const skippable = current !== null || play.beat || sinking !== null;
  const skip = () => {
    play.skip();
    if (sinking) setSankId(sinking.id);
  };
  useDismissOnEscape(skippable, skip);

  // Once the final shot has played out (and any sinking has gone under), the
  // page moves on to the result after a moment on the final blast.
  const last = play.last;
  const settleMs = last && last.kind === 'sunk' && !last.mine ? 2200 : last?.mine && last.watched && last.kind === 'sunk' ? 500 : 1400;
  useEffect(() => {
    if (!finished || skippable || !onSettled) return;
    const t = setTimeout(onSettled, settleMs);
    return () => clearTimeout(t);
  }, [finished, skippable, onSettled, settleMs]);

  const isFresh = (onEnemy: boolean, r: number, c: number) =>
    impact !== null && impact.onEnemy === onEnemy && impact.row === r && impact.col === c;
  const boardShake = (onEnemy: boolean): 'soft' | 'hard' | null =>
    impact && impact.onEnemy === onEnemy && impact.kind !== 'miss' ? (impact.kind === 'sunk' ? 'hard' : 'soft') : null;
  const fxFor = (onEnemy: boolean): Burst | null =>
    impact && impact.onEnemy === onEnemy
      ? { id: impact.id, row: impact.row, col: impact.col, kind: impact.kind }
      : null;

  // Stable identities matter here: `ownShips` and `own.incoming` feed the 3D
  // ocean, whose update() tears down and rebuilds every hull. Fresh objects on
  // every render (an aiming tap, the impact flag flipping) meant a full fleet
  // rebuild per re-render — felt as a hitch on every tap on an iPad.
  const radar = useMemo(() => radarGrid(viewLog, side), [viewLog, side]);
  const own = useMemo(() => ownBoardView(viewLog, myFleet, side), [viewLog, myFleet, side]);

  // Our shot in flight: the target cell holds a lock-on until the shell lands.
  const aimed = current && current.mine ? current.shot : null;
  const enemyCells: BoardCell[][] = radar.map((r, ri) =>
    r.map((state, ci) => {
      if (aimed && aimed.row === ri && aimed.col === ci) {
        return { state: 'water', preview: 'ok', locked: true };
      }
      if (pendingFire && pendingFire.row === ri && pendingFire.col === ci) {
        return { state: 'water', preview: 'ok', locked: fx.guns };
      }
      return { state: state === 'unknown' ? 'water' : state, fresh: isFresh(true, ri, ci) };
    }),
  );
  // The shell's last stretch, drawn coming down on the board it lands on.
  const radarShell: ShellDrop | null = aimed && current
    ? { id: current.id, row: aimed.row, col: aimed.col, ms: DROP_MS, delay: OUT_MS - DROP_MS }
    : null;
  const ownShell: ShellDrop | null = current && !current.mine
    ? { id: current.id, row: current.shot.row, col: current.shot.col, ms: current.ms, theirs: true, warn: WARN_MS }
    : null;

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

  const ownShips: PlacedShip[] = useMemo(
    () =>
      myFleet.map((p) => {
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
      }),
    [myFleet, own],
  );

  const mySunk = sunkByAttacker(viewLog, side);
  const enemySunkCount = mySunk.length;
  const myLostCount = own.sunkShips.size;
  // The enemy's sunk ships, reconstructed so they show as grey silhouettes on
  // the radar just like my own sunk ships do on my board.
  const enemyShips = sunkEnemyShips(radar, viewLog, side);
  // While one goes down in 3D, its flat sunk mark waits underneath.
  const sinkingShip = sinking ? enemyShips.find((s) => s.shipId === sinking.shot.sunk) ?? null : null;
  const radarShips = sinkingShip ? enemyShips.filter((s) => s !== sinkingShip) : enemyShips;

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
        active={myTurn && !current}
        shake={boardShake(true)}
        fx={fxFor(true)}
        fxLook={fx.boom}
        shell={radarShell}
        ships={radarShips}
        sea={fx.water === 'today' ? undefined : fx.water}
        overlay={
          sinkAhead || sinking ? (
            <Suspense fallback={null}>
              <RadarSinking
                ship={sinkingShip}
                id={sinking?.id ?? -1}
                era={era}
                skinColor={skinById(oppSkinId).color}
                look={fx.boom === 'b' ? 'b' : 'a'}
                upcoming={sinkAhead ? current.shot.sunk : null}
                onCannot={setSankId}
              />
            </Suspense>
          ) : undefined
        }
        onCell={myTurn && !current ? (r, c) => onFire({ row: r, col: c }) : undefined}
        disabled={!myTurn || current !== null}
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
          <div className="bs3d-holder">
            {/* While the pop-out is open it owns the ocean — mounting both
                runs two WebGL contexts + render loops at once. */}
            {!popped && (
              <Fleet3D ships={ownShips} incoming={own.incoming} skinColor={skinById(skinId).color} era={era} fx={fx} cue={play.cue} />
            )}
            <button
              className="bs3d-expand"
              onClick={() => setPopped(true)}
              aria-label="Pop out the 3D fleet"
              data-testid="fleet3d-pop"
            >
              <FullscreenIcon size={18} />
            </button>
          </div>
        </Suspense>
      ) : (
        <Board cells={ownCells} skinId={skinId} variant="own" ships={ownShips} shake={boardShake(false)} fx={fxFor(false)} fxLook={fx.boom} shell={ownShell} />
      )}
      <FleetRoster sunkIds={[...own.sunkShips]} skinColor={skinById(skinId).color} />
    </div>
  );

  // Watching the shots on a phone, the screen follows the shell: the radar
  // for ours, the fleet for theirs. The player's own pick returns after.
  // Our result holds on the radar (and a sinking plays there) before theirs.
  const shownView: View = playing && current ? (current.mine ? 'radar' : 'fleet') : playing && (play.beat || sinking) ? 'radar' : view;

  const footer = (
    <div className="bs-battle-foot">
      <LogStrip log={viewLog} side={side} myName={myName} oppName={oppName} onOpen={() => setLogOpen(true)} />
      {fx.guns && onWatchShots && (
        <button
          type="button"
          className="bs-watch"
          role="switch"
          aria-checked={watchShots}
          onClick={() => onWatchShots(!watchShots)}
          data-testid="watch-shots"
        >
          <span className="bs-watch-k">Watch the shots</span>
          <span className="bs-watch-v">{watchShots ? 'On' : 'Off'}</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="stack bs-battle">
      {skippable && (
        // While a shot plays, a tap anywhere on the battle skips it (and
        // Escape does too). Skipping only shows the result sooner.
        <button
          type="button"
          className="bs-skip"
          onClick={skip}
          aria-label="Skip the shot"
          data-testid="skip-shot"
        >
          <span className="bs-skip-pill">Tap to skip</span>
        </button>
      )}
      {popped && (
        /* Backdrop click is a mouse convenience; Escape (above) and the Close
           button are the keyboard path. */
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPopped(false);
          }}
        >
          <div className="bs3d-pop" role="dialog" aria-label="Your fleet in 3D">
            <div className="bs3d-holder">
              <Suspense fallback={<p className="subtle center bs3d-hint">Launching the fleet…</p>}>
                <Fleet3D ships={ownShips} incoming={own.incoming} skinColor={skinById(skinId).color} era={era} fx={fx} cue={play.cue} />
              </Suspense>
              <button
                className="bs3d-expand"
                onClick={() => setPopped(false)}
                aria-label="Close the 3D view"
                data-testid="fleet3d-pop-close"
              >
                <CloseIcon size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
      {logOpen && (
        /* Backdrop click is a mouse convenience; Escape (above) and the Close
           button are the keyboard path. */
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogOpen(false);
          }}
        >
          <div className="panel bs-log-pop" role="dialog" aria-label="Battle log" aria-modal="true">
            <div className="bs-log-head">
              <h2>Battle log</h2>
              <button
                className="bs-log-close"
                onClick={() => setLogOpen(false)}
                aria-label="Close the battle log"
                data-testid="battle-log-close"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <LogEntries log={viewLog} side={side} myName={myName} oppName={oppName} />
          </div>
        </div>
      )}
      {wide ? (
        /* Wide (≥ 720px): both boards side by side, the log strip below. */
        <div className="battle-wide">
          <div className="boards">
            {radarBoard}
            {fleetBoard}
          </div>
          {footer}
        </div>
      ) : (
        /* Narrow (< 720px): tab between one board at a time, log strip below. */
        <div className="battle-narrow">
          <div className="view-tabs">
            <button data-active={shownView === 'radar'} onClick={() => setView('radar')} aria-pressed={shownView === 'radar'}>
              <RadarIcon size={16} /> Radar
            </button>
            <button data-active={shownView === 'fleet'} onClick={() => setView('fleet')} aria-pressed={shownView === 'fleet'}>
              <ShieldIcon size={16} /> My Fleet
            </button>
          </div>
          {shownView === 'radar' ? radarBoard : fleetBoard}
          {footer}
        </div>
      )}
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

interface LogProps { log: GameLog; side: Side; myName: string; oppName: string }

/**
 * The collapsed battle log: one line showing the latest shot, tap for the
 * whole record. The full log earned a column of the battle screen it didn't
 * deserve — it's reference material, consulted rarely.
 */
function LogStrip({ log, side, myName, oppName, onOpen }: LogProps & { onOpen: () => void }) {
  const shots = log.filter((e): e is ShotEvent => e.type === 'shot');
  const last = shots[shots.length - 1];
  return (
    <button className="log-strip" onClick={onOpen} aria-haspopup="dialog" data-testid="battle-log-open">
      <span className="log-strip-title">Battle log</span>
      {last ? (
        <LogLine e={last} side={side} myName={myName} oppName={oppName} />
      ) : (
        <span className="subtle">No shots fired yet</span>
      )}
      <span className="log-strip-count">{shots.length}</span>
    </button>
  );
}

/** One shot as a terminal line — shared by the strip and the modal. */
function LogLine({ e, side, myName, oppName }: { e: ShotEvent; side: Side; myName: string; oppName: string }) {
  const mine = e.by === side;
  const { res, label } = describeShot(e);
  return (
    <>
      <span className="prompt">&gt;</span>
      <span className={`who ${mine ? 'me' : 'them'}`}>{mine ? myName || 'You' : oppName || 'Them'}</span>
      <span className="coord">{coordLabel(e.row, e.col)}</span>
      <span className={`res ${res}`}>{label}</span>
    </>
  );
}

function LogEntries({ log, side, myName, oppName }: LogProps) {
  const shots = log.filter((e): e is ShotEvent => e.type === 'shot');
  const last = shots.length - 1;

  if (shots.length === 0) return <p className="subtle">No shots fired yet.</p>;
  return (
    <div className="movelog">
      {/* Newest first. Stable keys by original index so only the freshest
          entry re-mounts (and plays the terminal typing animation). */}
      {shots
        .map((e, origIdx) => (
          <div className={`entry ${origIdx === last ? 'new' : ''}`} key={origIdx}>
            <LogLine e={e} side={side} myName={myName} oppName={oppName} />
          </div>
        ))
        .reverse()}
    </div>
  );
}
