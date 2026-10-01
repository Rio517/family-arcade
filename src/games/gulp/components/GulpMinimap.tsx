/**
 * A small map in the corner: the island, each block tinted by how many
 * points are still standing on it (pale for little, warm gold and orange
 * for a lot), gold stars on the wonders, and a dot for every hole (the
 * child's big and ringed in white). The sea on the shore sides, the airport
 * and the quay are drawn once and reused. Redrawn twice a second: it is a guide,
 * not a mirror.
 */
import { useEffect, useRef } from 'react';
import { KINDS } from '../domain/catalog';
import type { Rect } from '../domain/city';
import type { World } from '../domain/world';
import { SKINS } from './skins';

/** The map's size on an iPad; the stylesheet grows and shrinks it with the screen. */
const SIZE = 150;

/** Pale grey (little left to eat) through yellow and orange to red (a feast): nothing like the green land round it. */
function heat(t: number): string {
  const stops: Array<[number, number, number]> = [
    [222, 226, 236],
    [255, 214, 80],
    [255, 146, 40],
    [226, 64, 48],
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

    const city = world.city;
    // Everything the map shows: the island and any land beyond it.
    let reach = city.land;
    for (const l of city.extraLand) reach = Math.max(reach, Math.abs(l.x0), Math.abs(l.x1), Math.abs(l.z0), Math.abs(l.z1));
    // A margin wide enough to show the sea when a side has one.
    reach += Math.max(6, city.land * 0.16);

    // The map is drawn at the size it is shown, and laid out again if that
    // changes (a window resized, a tablet turned).
    let size = 0;
    /** Map units to pixels, and how much bigger than usual the map is shown. */
    let k = 1;
    let s = 1;
    const px = (v: number) => (v + reach) * k;
    const layer = () => {
      const c = document.createElement('canvas');
      c.width = size * ratio;
      c.height = size * ratio;
      const lg = c.getContext('2d');
      lg?.scale(ratio, ratio);
      return { c, lg };
    };
    const rect = (lg: CanvasRenderingContext2D, r: Rect) => lg.fillRect(px(r.x0), px(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    let under = layer();
    let over = under;

    // What never changes in a round is drawn once into two layers: the ground
    // under the block tints, and the airport and quay over them.
    const layout = () => {
      size = Math.round(canvas.clientWidth) || SIZE;
      s = size / SIZE;
      k = size / (reach * 2);
      canvas.width = size * ratio;
      canvas.height = size * ratio;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);

      under = layer();
      if (under.lg) {
        const u = under.lg;
        // Land carries on past the island except on the sides that are sea.
        u.fillStyle = '#6fbf4f';
        u.fillRect(0, 0, size, size);
        u.fillStyle = '#2f9fe0';
        const edge = px(-city.land);
        const far = px(city.land);
        if (city.shores.includes('n')) u.fillRect(0, 0, size, edge);
        if (city.shores.includes('s')) u.fillRect(0, far, size, size - far);
        if (city.shores.includes('w')) u.fillRect(0, 0, edge, size);
        if (city.shores.includes('e')) u.fillRect(far, 0, size - far, size);
        // The street grid on the countryside.
        u.fillStyle = '#343a48';
        u.fillRect(px(-city.half), px(-city.half), city.half * 2 * k, city.half * 2 * k);
        for (const l of city.extraLand) {
          u.fillStyle = l.kind === 'islet' ? '#6fbf4f' : '#343a48';
          rect(u, l);
        }
      }
      over = layer();
      if (over.lg) {
        const o = over.lg;
        const field = city.airfield;
        if (field) {
          o.fillStyle = '#d9dde3';
          rect(o, field.area);
          o.fillStyle = '#5b6170';
          rect(o, field.runway);
        }
        if (city.port) {
          o.fillStyle = '#c9a677';
          rect(o, city.port.quay);
        }
      }
    };

    const draw = () => {
      if ((Math.round(canvas.clientWidth) || SIZE) !== size) layout();
      g.clearRect(0, 0, size, size);
      if (under.lg) g.drawImage(under.c, 0, 0, size, size);

      // Points still standing on each block.
      const worth = city.blockList.map(() => 0);
      const block = city.blockList[0]?.size ?? 1;
      const pitch = city.blockList.length > 1 ? Math.abs((city.blockList[1].z - city.blockList[0].z) || block) : block;
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

      if (over.lg) g.drawImage(over.c, 0, 0, size, size);

      // The countryside's big prizes (wind turbines, barns, mountains): a
      // white-ringed orange dot each, a hint of the feast out of town.
      g.lineWidth = s;
      g.strokeStyle = '#ffffff';
      g.fillStyle = '#ff8a1f';
      for (const p of world.props.values()) {
        if (KINDS[p.kind].tier < 7 || KINDS[p.kind].wonder) continue;
        if (Math.max(Math.abs(p.x), Math.abs(p.z)) < city.half) continue;
        g.beginPath();
        g.arc(px(p.x), px(p.z), 2 * s, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }

      // Wonders still standing.
      g.font = `bold ${Math.max(10, Math.round(size / 12))}px system-ui, sans-serif`;
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
        const r = Math.max((h.isPlayer ? 5 : 3) * s, h.r * k);
        g.beginPath();
        g.arc(px(h.x), px(h.z), r, 0, Math.PI * 2);
        g.fillStyle = SKINS[h.skin % SKINS.length].css;
        g.fill();
        g.lineWidth = (h.isPlayer ? 2.5 : 1) * s;
        g.strokeStyle = h.isPlayer ? '#ffffff' : 'rgba(29,31,51,0.6)';
        g.stroke();
      }
    };
    draw();
    const timer = window.setInterval(draw, 500);
    return () => window.clearInterval(timer);
  }, [world]);

  return <canvas ref={canvasRef} className="gulp-minimap" aria-hidden="true" data-testid="gulp-minimap" />;
}
