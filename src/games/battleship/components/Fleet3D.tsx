/**
 * Fleet3D — the React face of the three.js ocean board. Read-only: it shows
 * YOUR fleet riding the swell, fires where you've been hit, foam where the
 * enemy missed. Lazy-loaded so three.js never weighs down the initial bundle
 * (and shared with chess's 3D chunk, so picking both costs one download).
 */
import { useEffect, useRef, useState } from 'react';
import { FleetScene, type SceneShip } from './three/FleetScene';
import type { CellState } from '@games/battleship/domain/engine';

interface Fleet3DProps {
  ships: SceneShip[];
  incoming: CellState[][];
  skinColor: string;
}

export default function Fleet3D({ ships, incoming, skinColor }: Fleet3DProps) {
  const holder = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FleetScene | null>(null);
  const [failed, setFailed] = useState(false);

  // Mount once per skin colour (the rim + stripes are baked into materials).
  const liveState = useRef({ ships, incoming });
  liveState.current = { ships, incoming };
  useEffect(() => {
    if (!holder.current) return;
    let scene: FleetScene | null = null;
    try {
      const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene = new FleetScene(holder.current, { skinColor, reducedMotion });
      sceneRef.current = scene;
      scene.update(liveState.current.ships, liveState.current.incoming);
    } catch {
      setFailed(true); // no WebGL here — the 2D board still works
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [skinColor]);

  useEffect(() => {
    sceneRef.current?.update(ships, incoming);
  }, [ships, incoming]);

  if (failed) {
    return (
      <p className="subtle center bs3d-fallback" data-testid="fleet3d-fallback">
        3D isn’t supported on this device — the 2D board still works.
      </p>
    );
  }

  return (
    <div className="bs3d-wrap">
      <div className="bs3d" ref={holder} data-testid="fleet3d" />
      <p className="subtle center bs3d-hint">Drag to orbit · pinch or scroll to zoom</p>
    </div>
  );
}
