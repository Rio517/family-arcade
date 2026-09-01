/**
 * Harness for the camera effects (built only under BUILD_HARNESS, like the
 * Ship Battle previews). There's no camera here: the scene is driven by a
 * hand-written TrackingFrame — two faces (one mid fire-breath) and one peace
 * sign — stepped a fixed number of deterministic frames and then frozen, so
 * `npm run shots` captures a stable, judgeable picture of every effect.
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import '@shared/styles/tokens.css';
import '@shared/effects/effects.css';
import { createEffectsScene } from '@shared/effects/overlay/scene';
import type { TrackingFrame } from '@shared/effects/engine/types';

const W = 900;
const H = 600;

/** Two kids in frame: the left one is breathing fire, the right one flashes ✌. */
const FRAME: TrackingFrame = {
  timeMs: 0,
  faces: [
    {
      center: { x: 0.3, y: 0.38 },
      mouth: { x: 0.3, y: 0.52 },
      width: 0.22,
      jawOpen: 0.85,
      poseMatrix: null,
    },
    {
      center: { x: 0.7, y: 0.4 },
      mouth: { x: 0.7, y: 0.53 },
      width: 0.19,
      jawOpen: 0.05,
      poseMatrix: null,
    },
  ],
  hands: [{ gesture: 'victory', palm: { x: 0.76, y: 0.78 }, size: 0.09 }],
};

/**
 * Where a person would be — silhouette stand-ins to judge mask alignment.
 * `w` is the tracked ear-to-ear width, so a mask that fits reads as a mask
 * that fits here too: the head shell should cover the shape with a margin.
 */
function silhouette(cx: number, cy: number, w: number): string {
  const rx = w / 2;
  return `radial-gradient(ellipse ${rx}px ${rx * 1.25}px at ${cx}px ${cy}px, #3b4661 0 60%, transparent 62%)`;
}

function Harness() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createEffectsScene(canvas, {
      seed: 0x0dda60,
      reducedMotion: false,
      effects: new Set(['dragon', 'peace']),
    });
    scene.setSize(W, H, 1);
    // Wait for the modelled mask before stepping, or the shot catches whichever
    // head happened to be on. 88 fixed steps then lands mid-burst with the
    // flame fully developed; the seeded rng makes every run byte-identical.
    let cancelled = false;
    void scene.ready.then(() => {
      if (cancelled) return;
      for (let i = 0; i < 88; i++) scene.render(FRAME, 16);
      setReady(true);
    });
    return () => {
      cancelled = true;
      scene.dispose();
    };
  }, []);

  return (
    <div className="app" style={{ maxWidth: 'none', padding: 16 }}>
      <p className="subtle" style={{ margin: '0 0 8px' }}>
        Harness — scripted tracking frame, no camera. Left: dragon breathing fire. Right: dragon
        idle + peace-sign burst.
      </p>
      <div
        data-testid="mirror-harness"
        data-ready={ready ? '1' : undefined}
        style={{
          position: 'relative',
          width: W,
          height: H,
          borderRadius: 12,
          overflow: 'hidden',
          background: [
            silhouette(0.3 * W, 0.44 * H, FRAME.faces[0].width * W),
            silhouette(0.7 * W, 0.46 * H, FRAME.faces[1].width * W),
            'linear-gradient(180deg, #202c46 0%, #16203a 100%)',
          ].join(', '),
        }}
      >
        <canvas className="fx-canvas" ref={canvasRef} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
