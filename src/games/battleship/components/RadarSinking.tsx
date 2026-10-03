/**
 * RadarSinking — the 3D overlay on the radar where a ship we sink goes down
 * over its own cells (the darker-arcade pitch's guns only). Lazy-loaded with
 * three.js; it lies over the grid and never takes a tap. While `ship` is set
 * the sinking plays; when it clears (played out, or a skip) the canvas is
 * empty and the radar's flat sunk mark shows. Where it cannot play (no
 * WebGL, no hull), it says so at once, so the flat mark is never held back.
 */
import { useEffect, useRef } from 'react';
import type { FleetEra, ShipId } from '@games/battleship/domain/types';
import { RADAR_SINK_MS } from '@games/battleship/state/shotPlayback';
import { RadarSinkScene } from './three/RadarSinkScene';
import type { PlacedShip } from './Board';

interface Props {
  /** The ship going down now, or null. */
  ship: PlacedShip | null;
  /** Changes with each sinking. */
  id: number;
  /** The enemy's navy, drawn with the same models as ours. */
  era: FleetEra;
  /** Their fleet's colour, on the hull's waterline band. */
  skinColor: string;
  look: 'a' | 'b';
  /** The ship our shell in flight is about to sink: got ready ahead of time. */
  upcoming: ShipId | null;
  /** This sinking (by `id`) cannot be shown: show the sunk mark now. */
  onCannot: (id: number) => void;
}

export default function RadarSinking({ ship, id, era, skinColor, look, upcoming, onCannot }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RadarSinkScene | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    let scene: RadarSinkScene | null = null;
    try {
      scene = new RadarSinkScene(canvas.current, { era, skinColor, look, duration: RADAR_SINK_MS });
      sceneRef.current = scene;
    } catch {
      // No WebGL here: the radar's flat sunk mark is all there is.
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [era, skinColor, look]);

  useEffect(() => {
    if (upcoming) sceneRef.current?.prepare(upcoming);
  }, [upcoming]);

  const shipId = ship?.shipId ?? null;
  const row = ship?.row ?? 0;
  const col = ship?.col ?? 0;
  const size = ship?.size ?? 0;
  const orientation = ship?.orientation ?? 'H';
  useEffect(() => {
    const scene = sceneRef.current;
    const el = canvas.current;
    if (!shipId) {
      scene?.stop();
      return;
    }
    // Find the ship's end cells on the grid it lies over.
    const board = el?.parentElement;
    const endRow = orientation === 'V' ? row + size - 1 : row;
    const endCol = orientation === 'H' ? col + size - 1 : col;
    const a = board?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    const b = board?.querySelector(`[data-row="${endRow}"][data-col="${endCol}"]`);
    if (!scene || !el || !a || !b || el.clientWidth === 0) {
      onCannot(id);
      return;
    }
    const k = el.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const ax = ra.left + ra.width / 2 - k.left;
    const ay = ra.top + ra.height / 2 - k.top;
    const bx = rb.left + rb.width / 2 - k.left;
    const by = rb.top + rb.height / 2 - k.top;
    const cell = size > 1 ? Math.hypot(bx - ax, by - ay) / (size - 1) : ra.width;
    void scene.play({ shipId, size, orientation, cx: (ax + bx) / 2, cy: (ay + by) / 2, cell }).then((ok) => {
      if (!ok) onCannot(id);
    });
  }, [id, shipId, row, col, size, orientation, onCannot]);

  return <canvas ref={canvas} className="radar-sink" aria-hidden="true" data-testid="radar-sink" />;
}
