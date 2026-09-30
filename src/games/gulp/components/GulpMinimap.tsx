/**
 * A small map in the corner: the island, each block tinted by how many
 * points are still standing on it (pale for little, warm gold and orange
 * for a lot), gold stars on the wonders, and a dot for every hole (the
 * child's big and ringed in white). Redrawn twice a second: it is a guide,
 * not a mirror.
 */
import { useEffect, useRef } from 'react';
import { KINDS } from '../domain/catalog';
import type { World } from '../domain/world';
import { SKINS } from './skins';

const SIZE = 150;

/** Pale green (little to eat) through yellow to orange (a feast). */
function heat(t: number): string {
  const stops: Array<[number, number, number]> = [
    [205, 232, 190],
    [250, 226, 120],
    [255, 170, 70],
    [240, 110, 60],
  ];
  const x = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}

export function GulpMinimap({ world }: { world: World }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    g.scale(ratio, ratio);

    const draw = () => {
      const city = world.city;
      // Everything the map shows: the island and any land beyond it.
      let reach = city.land;
      for (const l of city.extraLand) reach = Math.max(reach, Math.abs(l.x0), Math.abs(l.x1), Math.abs(l.z0), Math.abs(l.z1));
      reach += 6;
      const k = SIZE / (reach * 2);
      const px = (v: number) => (v + reach) * k;

      g.clearRect(0, 0, SIZE, SIZE);
      g.fillStyle = '#7fcdf0';
      g.fillRect(0, 0, SIZE, SIZE);
      // The countryside, then the street grid on it.
      g.fillStyle = '#a5d98a';
      g.fillRect(px(-city.land), px(-city.land), city.land * 2 * k, city.land * 2 * k);
      g.fillStyle = '#6b7280';
      g.fillRect(px(-city.half), px(-city.half), city.half * 2 * k, city.half * 2 * k);
      for (const l of city.extraLand) {
        g.fillStyle = l.kind === 'islet' ? '#9ad672' : '#6b7280';
        g.fillRect(px(l.x0), px(l.z0), (l.x1 - l.x0) * k, (l.z1 - l.z0) * k);
      }

      // Points still standing on each block.
      const worth = city.blockList.map(() => 0);
      const size = city.blockList[0]?.size ?? 1;
      const pitch = city.blockList.length > 1 ? Math.abs((city.blockList[1].z - city.blockList[0].z) || size) : size;
      const x0 = city.blockList[0]?.x ?? 0;
      const z0 = city.blockList[0]?.z ?? 0;
      const n = Math.round(Math.sqrt(city.blockList.length));
      for (const p of world.props.values()) {
        if (KINDS[p.kind].wonder) continue;
        const bx = Math.floor((p.x - x0) / pitch);
        const bz = Math.floor((p.z - z0) / pitch);
        if (bx < 0 || bz < 0 || bx >= n || bz >= n) continue;
        worth[bx * n + bz] += p.points;
      }
      const top = Math.max(1, ...worth);
      city.blockList.forEach((b, i) => {
        g.fillStyle = heat(Math.log1p(worth[i]) / Math.log1p(top));
        g.fillRect(px(b.x) + 0.5, px(b.z) + 0.5, b.size * k - 1, b.size * k - 1);
      });

      // Wonders still standing.
      g.font = `bold ${Math.max(10, Math.round(SIZE / 12))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const p of world.props.values()) {
        if (!KINDS[p.kind].wonder) continue;
        g.fillStyle = '#1d1f33';
        g.fillText('★', px(p.x) + 0.5, px(p.z) + 0.8);
        g.fillStyle = '#ffd23f';
        g.fillText('★', px(p.x), px(p.z));
      }

      // Holes: rivals small, the child big with a white ring, drawn last.
      const holes = [...world.holes].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer));
      for (const h of holes) {
        if (!h.alive) continue;
        const r = Math.max(h.isPlayer ? 5 : 3, h.r * k);
        g.beginPath();
        g.arc(px(h.x), px(h.z), r, 0, Math.PI * 2);
        g.fillStyle = SKINS[h.skin % SKINS.length].css;
        g.fill();
        g.lineWidth = h.isPlayer ? 2.5 : 1;
        g.strokeStyle = h.isPlayer ? '#ffffff' : 'rgba(29,31,51,0.6)';
        g.stroke();
      }
    };
    draw();
    const timer = window.setInterval(draw, 500);
    return () => window.clearInterval(timer);
  }, [world]);

  return <canvas ref={canvasRef} className="gulp-minimap" style={{ width: SIZE, height: SIZE }} aria-hidden="true" data-testid="gulp-minimap" />;
}
