import { useEffect, useRef } from 'react';

/** A single impact to burst on. Change `id` to trigger a new burst. */
export interface Burst {
  id: number;
  row: number;
  col: number;
  kind: 'miss' | 'hit' | 'sunk';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Additive (glowing fire/spark) vs normal (debris/droplet). */
  glow: boolean;
  gravity: number;
}

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Per-impact particle recipes. Warm sparks for hits, cool droplets for misses,
// a bigger fire-and-debris shower for a sink.
const RECIPES = {
  miss: { count: 14, speed: [40, 110] as const, life: [0.4, 0.7] as const, size: [1.2, 2.6] as const, gravity: 420, colors: ['#dbeafe', '#bfdbfe', '#93c5fd'], glow: false },
  hit: { count: 24, speed: [70, 210] as const, life: [0.4, 0.7] as const, size: [1.2, 3] as const, gravity: 240, colors: ['#fff1c2', '#ffd27a', '#ff9d3c', '#ff5a3c'], glow: true },
  sunk: { count: 46, speed: [90, 300] as const, life: [0.5, 1.0] as const, size: [1.4, 3.6] as const, gravity: 300, colors: ['#fff1c2', '#ffce6b', '#ff7a33', '#ff4d3d'], glow: true },
} as const;

const DEBRIS = ['#4b5563', '#374151', '#1f2937'];
const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A transparent canvas overlay that paints particle bursts at a struck cell.
 * It spans the whole board grid (grid-area 1 / -1) and never intercepts pointer
 * events. This is the "effects layer" of the hybrid model: the DOM board keeps
 * owning interaction, focus, and accessibility; the canvas only draws motion the
 * CSS can't — spark debris flying out with real velocity and gravity.
 */
export function BoardFX({ burst }: { burst: Burst | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const seenBurstRef = useRef(-1);
  const dprRef = useRef(1);

  // Keep the backing buffer matched to the element's CSS size, DPR-aware, so
  // circles stay crisp and coordinates are plain CSS pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    if (typeof ResizeObserver === 'undefined') return; // e.g. jsdom
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Spawn a burst whenever the incoming id changes.
  useEffect(() => {
    if (!burst || burst.id === seenBurstRef.current) return;
    seenBurstRef.current = burst.id;
    if (prefersReduced()) return;

    const canvas = canvasRef.current;
    if (!canvas || canvas.clientWidth === 0) return; // hidden (other layout)

    // Locate the struck cell in the DOM and burst from its centre.
    const cell = canvas.parentElement?.querySelector(
      `[data-row="${burst.row}"][data-col="${burst.col}"]`,
    );
    if (!cell) return;
    const cr = cell.getBoundingClientRect();
    const kr = canvas.getBoundingClientRect();
    const cx = cr.left + cr.width / 2 - kr.left;
    const cy = cr.top + cr.height / 2 - kr.top;

    const r = RECIPES[burst.kind];
    for (let i = 0; i < r.count; i++) {
      const ang = rand(0, TAU);
      const spd = rand(r.speed[0], r.speed[1]);
      // A sink throws in some dark debris chunks alongside the fire.
      const debris = burst.kind === 'sunk' && Math.random() < 0.3;
      particles.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: rand(r.life[0], r.life[1]),
        maxLife: r.life[1],
        size: rand(r.size[0], r.size[1]) * (debris ? 1.4 : 1),
        color: debris ? DEBRIS[(Math.random() * DEBRIS.length) | 0] : r.colors[(Math.random() * r.colors.length) | 0],
        glow: debris ? false : r.glow,
        gravity: r.gravity,
      });
    }

    if (rafRef.current === null) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [burst]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  function tick(ts: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      rafRef.current = null;
      return;
    }
    const dt = lastTsRef.current ? Math.min((ts - lastTsRef.current) / 1000, 0.05) : 0;
    lastTsRef.current = ts;

    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const live: Particle[] = [];
    for (const p of particles.current) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      live.push(p);
    }
    particles.current = live;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (live.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }

  return <canvas ref={canvasRef} className="board-fx" aria-hidden="true" />;
}
