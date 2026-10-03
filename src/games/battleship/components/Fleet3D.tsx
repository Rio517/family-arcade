/**
 * Fleet3D — the React face of the three.js ocean board. Read-only: it shows
 * YOUR fleet riding the swell, fires where you've been hit, foam where the
 * enemy missed. Lazy-loaded so three.js never weighs down the initial bundle
 * (and shared with chess's 3D chunk, so picking both costs one download).
 */
import { useEffect, useRef, useState } from 'react';
import { FleetScene, type SceneShip } from './three/FleetScene';
import type { CellState } from '@games/battleship/domain/engine';
import type { FleetEra } from '@games/battleship/domain/types';
import { TODAY_FX, type PitchFx } from '@games/battleship/state/pitch';

/**
 * One thing for the ocean to play, once per `id`: our salvo at the enemy's
 * cell, their shell landing on ours, an impact alone, or a skip. View only —
 * the fleet and the marks always come from `ships` and `incoming`.
 */
export interface SceneCue {
  id: number;
  type: 'fire' | 'incoming' | 'impact' | 'skip';
  row: number;
  col: number;
  kind: 'hit' | 'miss' | 'sunk';
  /** For 'incoming': how long until it lands, warning included. */
  ms: number;
  /** For 'incoming': how long the warning ring shows before the attack appears. */
  warn: number;
  /** For 'incoming': a shell, or a diving plane's bomb. */
  via: 'shell' | 'plane';
}

interface Fleet3DProps {
  ships: SceneShip[];
  incoming: CellState[][];
  skinColor: string;
  /** Which navy this captain sails; defaults to the classic fleet. */
  era?: FleetEra;
  /** The darker-arcade pitch's effects (today's when absent). */
  fx?: PitchFx;
  cue?: SceneCue | null;
}

export default function Fleet3D({ ships, incoming, skinColor, era = 'classic', fx = TODAY_FX, cue = null }: Fleet3DProps) {
  const holder = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FleetScene | null>(null);
  const [failed, setFailed] = useState(false);
  // The hulls are a few hundred KB each and decode after the first frame, so
  // without this the board sits there looking empty-ish while they arrive.
  const [fleetReady, setFleetReady] = useState(false);

  // Mount once per skin colour (the rim + stripes are baked into materials).
  const { fire, boom, water, guns } = fx;
  const liveState = useRef({ ships, incoming });
  liveState.current = { ships, incoming };
  useEffect(() => {
    if (!holder.current) return;
    let scene: FleetScene | null = null;
    try {
      const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene = new FleetScene(holder.current, {
        skinColor,
        era,
        reducedMotion,
        onFleetReady: () => setFleetReady(true),
        fx: { fire, boom, water, guns },
      });
      sceneRef.current = scene;
      scene.update(liveState.current.ships, liveState.current.incoming);
    } catch {
      setFailed(true); // no WebGL here — the 2D board still works
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [skinColor, era, fire, boom, water, guns]);

  useEffect(() => {
    sceneRef.current?.update(ships, incoming);
  }, [ships, incoming]);

  // Play each cue once, in the order they come.
  const playedCue = useRef(-1);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!cue || !scene || cue.id === playedCue.current) return;
    playedCue.current = cue.id;
    if (cue.type === 'fire') scene.fireAt(cue.row, cue.col);
    else if (cue.type === 'incoming') scene.incoming(cue.row, cue.col, cue.kind, cue.ms, cue.warn, cue.via);
    else if (cue.type === 'impact') scene.impact(cue.row, cue.col, cue.kind);
    else scene.skip();
  }, [cue]);

  if (failed) {
    return (
      <p className="subtle center bs3d-fallback" data-testid="fleet3d-fallback">
        3D isn’t supported on this device — the 2D board still works.
      </p>
    );
  }

  return (
    <div className="bs3d-wrap">
      <div className="bs3d" ref={holder} data-testid="fleet3d">
        {!fleetReady && (
          // A radar sweep, because that's the language the rest of the screen
          // already speaks — the enemy board is literally labelled "Radar".
          // It sits over the canvas and fades out once the hulls are in.
          <div className="bs3d-loader" data-testid="fleet3d-loading" aria-live="polite">
            <div className="bs3d-scope" style={{ ['--c' as string]: skinColor }}>
              <span className="bs3d-ring" />
              <span className="bs3d-ring" />
              <span className="bs3d-ring" />
              <span className="bs3d-cross" />
              <span className="bs3d-sweep" />
              <span className="bs3d-blip bs3d-blip-a" />
              <span className="bs3d-blip bs3d-blip-b" />
              <span className="bs3d-blip bs3d-blip-c" />
            </div>
            <p className="bs3d-loader-text">Putting your fleet to sea…</p>
          </div>
        )}
      </div>
      <p className="subtle center bs3d-hint">Drag to orbit · pinch or scroll to zoom</p>
    </div>
  );
}
