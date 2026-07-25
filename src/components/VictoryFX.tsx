import { useEffect, useRef } from 'react';

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
  life: number;
  maxLife: number;
}

const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#f9fafb'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A one-shot confetti burst for the win screen. Mounts only on victory, so
 * mounting is the trigger: it fires a shower of spinning shards from the top,
 * then halts its loop once they fall away. Pointer-transparent and gated behind
 * prefers-reduced-motion, like the board effects. The loss screen never mounts
 * it — that stays calm and dignified.
 */
export function VictoryFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReduced()) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeToParent = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    sizeToParent();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Two fountains near the top corners fan across the panel.
    const shards: Shard[] = [];
    for (const ox of [w * 0.2, w * 0.8]) {
      for (let i = 0; i < 70; i++) {
        const ang = rand(Math.PI * 0.15, Math.PI * 0.85); // downward-ish spread
        const spd = rand(120, 460);
        shards.push({
          x: ox,
          y: h * 0.15,
          vx: Math.cos(ang) * spd * (ox < w / 2 ? 1 : -1),
          vy: -Math.sin(ang) * spd,
          rot: rand(0, Math.PI),
          vrot: rand(-8, 8),
          w: rand(4, 8),
          h: rand(7, 14),
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: rand(1.1, 2.0),
          maxLife: 2.0,
        });
      }
    }

    let raf = 0;
    let last = 0;
    const frame = (ts: number) => {
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
      last = ts;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const s of shards) {
        s.life -= dt;
        if (s.life <= 0) continue;
        alive++;
        s.vy += 520 * dt; // gravity
        s.vx *= 0.99;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.vrot * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, s.life / s.maxLife));
        ctx.fillStyle = s.color;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (alive > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="victory-fx" aria-hidden="true" />;
}
