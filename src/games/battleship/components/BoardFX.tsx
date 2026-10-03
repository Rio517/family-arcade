import { useEffect, useRef } from 'react';
import type { FxId } from '@games/battleship/state/pitch';

/** A single impact to burst on. Change `id` to trigger a new burst. */
export interface Burst {
  id: number;
  row: number;
  col: number;
  kind: 'miss' | 'hit' | 'sunk';
}

/** A shell on its way down onto a cell: shown after `delay`, it arrives `ms` later. Change `id` to launch. */
export interface ShellDrop {
  id: number;
  row: number;
  col: number;
  ms: number;
  delay?: number;
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
  /** Additive (glowing fire/spark) vs normal (debris/droplet/smoke). */
  glow: boolean;
  gravity: number;
  /** Radius growth per second — smoke puffs swell as they rise. */
  grow: number;
  /** Peak opacity multiplier — smoke stays translucent. */
  alphaScale: number;
  /** The pitch's particles: how it's drawn, and what it cools to. */
  shape?: 'disc' | 'soft' | 'ring' | 'chunk' | 'star' | 'text';
  cold?: [number, number, number];
  hot?: [number, number, number];
  drag?: number;
  spin?: number;
  angle?: number;
  delay?: number;
  text?: string;
}

interface Drop {
  x: number;
  y: number;
  start: number;
  ms: number;
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

/** The pitch's two takes on a blast, seen from above. */
const TAKES = {
  a: {
    flash: [255, 250, 220] as [number, number, number],
    hot: [255, 236, 92] as [number, number, number],
    cold: [255, 45, 85] as [number, number, number],
    smoke: '#2a2440',
    ring: 'rgba(127, 243, 255, 1)',
    ring2: 'rgba(255, 179, 71, 1)',
    spark: '#fff07a',
    spray: '#e6fbff',
    debris: ['#2b3340', '#4b5563', '#1d2430'],
  },
  b: {
    flash: [255, 226, 160] as [number, number, number],
    hot: [255, 214, 107] as [number, number, number],
    cold: [194, 54, 27] as [number, number, number],
    smoke: '#1b1c22',
    ring: 'rgba(255, 240, 192, 1)',
    ring2: 'rgba(255, 240, 192, 1)',
    spark: '#ffc46b',
    spray: '#dfeef5',
    debris: ['#3d3a38', '#55595f', '#24262b'],
  },
} as const;

/**
 * A transparent canvas overlay that paints particle bursts at a struck cell.
 * It spans the whole board grid (grid-area 1 / -1) and never intercepts pointer
 * events. This is the "effects layer" of the hybrid model: the DOM board keeps
 * owning interaction, focus, and accessibility; the canvas only draws motion the
 * CSS can't — spark debris flying out with real velocity and gravity.
 *
 * `look` picks the darker-arcade pitch's blasts ('a' arcade, 'b' cinematic,
 * after Gulp's explosions: flash, fireball, shock ring, sparks, debris, smoke);
 * `shell` draws a shell dropping onto its cell before the impact.
 */
export function BoardFX({ burst, look = 'today', shell = null }: { burst: Burst | null; look?: FxId; shell?: ShellDrop | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const drops = useRef<Drop[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const seenBurstRef = useRef(-1);
  const seenShellRef = useRef(-1);
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

  /** The centre of a cell in canvas coordinates, and the cell's size; null if hidden. */
  const locate = (row: number, col: number): { cx: number; cy: number; cell: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.clientWidth === 0) return null; // hidden (other layout)
    const cell = canvas.parentElement?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return null;
    const cr = cell.getBoundingClientRect();
    const kr = canvas.getBoundingClientRect();
    return { cx: cr.left + cr.width / 2 - kr.left, cy: cr.top + cr.height / 2 - kr.top, cell: cr.width };
  };

  const kick = () => {
    if (rafRef.current === null) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  // A shell on its way down: a glowing streak closing on the cell, a ring tightening under it.
  useEffect(() => {
    if (!shell || shell.id === seenShellRef.current) return;
    seenShellRef.current = shell.id;
    if (prefersReduced()) return;
    const at = locate(shell.row, shell.col);
    if (!at) return;
    drops.current.push({ x: at.cx, y: at.cy, start: performance.now() + (shell.delay ?? 0), ms: shell.ms });
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once per shell id; the helpers only read refs
  }, [shell]);

  // Spawn a burst whenever the incoming id changes.
  useEffect(() => {
    if (!burst || burst.id === seenBurstRef.current) return;
    seenBurstRef.current = burst.id;
    // A burst means the shell is down: no streak outlives its impact.
    drops.current = [];
    const at = locate(burst.row, burst.col);
    if (!at) return;
    if (look !== 'today') {
      spawnTake(particles.current, look, burst.kind, at.cx, at.cy, at.cell, prefersReduced());
      kick();
      return;
    }
    if (prefersReduced()) return;
    const { cx, cy } = at;

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
        grow: 0,
        alphaScale: 1,
      });
    }

    // A sink also lofts a few slow smoke puffs that swell and drift up.
    if (burst.kind === 'sunk') {
      for (let i = 0; i < 7; i++) {
        const ang = rand(-Math.PI * 0.72, -Math.PI * 0.28); // upward fan
        const spd = rand(8, 34);
        particles.current.push({
          x: cx + rand(-4, 4),
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: rand(0.8, 1.4),
          maxLife: 1.4,
          size: rand(3, 6),
          color: DEBRIS[(Math.random() * DEBRIS.length) | 0],
          glow: false,
          gravity: -26, // buoyant
          grow: rand(10, 20),
          alphaScale: 0.4,
        });
      }
    }

    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once per burst id; the helpers only read refs
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

    // Shells coming down, drawn under the blasts.
    const now = performance.now();
    drops.current = drops.current.filter((d) => now - d.start < d.ms + 60);
    for (const d of drops.current) if (now >= d.start) drawDrop(ctx, d, now, look);

    const live: Particle[] = [];
    for (const p of particles.current) {
      if (p.delay && p.delay > 0) {
        p.delay -= dt;
        live.push(p);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      if (p.spin) p.angle = (p.angle ?? 0) + p.spin * dt;
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife)) * p.alphaScale;
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      if (p.shape) drawShaped(ctx, p);
      else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      live.push(p);
    }
    particles.current = live;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (live.length > 0 || drops.current.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }

  return <canvas ref={canvasRef} className="board-fx" aria-hidden="true" />;
}

const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;

function drawShaped(ctx: CanvasRenderingContext2D, p: Particle): void {
  const t = 1 - p.life / p.maxLife;
  const color = p.hot && p.cold ? mix(p.hot, p.cold, Math.min(1, t)) : p.color;
  if (p.shape === 'soft' || p.shape === 'disc') {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.5, p.size));
    g.addColorStop(0, color);
    g.addColorStop(p.shape === 'disc' ? 0.7 : 0.45, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, TAU);
    ctx.fill();
  } else if (p.shape === 'ring') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(1, 3.2 * (1 - t));
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, TAU);
    ctx.stroke();
  } else if (p.shape === 'chunk') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle ?? 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    ctx.restore();
  } else if (p.shape === 'star') {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle ?? 0);
    ctx.fillStyle = color;
    const s = p.size;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
    ctx.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
    ctx.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
    ctx.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
    ctx.fill();
    ctx.restore();
  } else if (p.shape === 'text' && p.text) {
    // The arcade take's pop word: chunky, outlined, swelling as it fades.
    const s = p.size * (1 + 0.25 * Math.min(1, t * 4));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.12);
    ctx.font = `900 ${Math.round(s)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, s * 0.2);
    ctx.strokeStyle = '#0b0f1a';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}

/** A shell dropping onto its cell, seen from above: a closing streak and a tightening ring. */
function drawDrop(ctx: CanvasRenderingContext2D, d: Drop, now: number, look: FxId): void {
  const t = Math.min(1, (now - d.start) / d.ms);
  const arcade = look === 'a';
  // The ring on the water, closing in.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25 + 0.6 * t;
  ctx.strokeStyle = arcade ? '#ff3355' : '#ffb347';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(d.x, d.y, 4 + 26 * (1 - t), 0, TAU);
  ctx.stroke();
  // The shell, coming in from the upper left and growing as it nears.
  const fromX = d.x - 120;
  const fromY = d.y - 150;
  const e = t * t;
  const x = fromX + (d.x - fromX) * e;
  const y = fromY + (d.y - fromY) * e;
  const tailT = Math.max(0, e - 0.18);
  const tx = fromX + (d.x - fromX) * tailT;
  const ty = fromY + (d.y - fromY) * tailT;
  const g = ctx.createLinearGradient(tx, ty, x, y);
  g.addColorStop(0, 'rgba(255, 200, 120, 0)');
  g.addColorStop(1, arcade ? 'rgba(255, 240, 122, 0.95)' : 'rgba(255, 210, 140, 0.9)');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = g;
  ctx.lineWidth = 2 + 3 * t;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.arc(x, y, 1.5 + 2.5 * t, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** The pitch's blast, splash or sinking, after Gulp's explosions, flattened onto the radar. */
function spawnTake(out: Particle[], look: 'a' | 'b', kind: Burst['kind'], cx: number, cy: number, cell: number, reduced: boolean): void {
  const T = TAKES[look];
  const arcade = look === 'a';
  const s = (cell / 40) * 1.35; // scale everything to the board's cell size, a touch over it
  const push = (p: Partial<Particle> & { life: number; size: number; color: string }) =>
    out.push({ x: cx, y: cy, vx: 0, vy: 0, maxLife: p.life, glow: false, gravity: 0, grow: 0, alphaScale: 1, ...p });

  if (kind === 'miss') {
    // A splash: rings spreading, droplets thrown out, a white bloom at the heart.
    push({ shape: 'soft', life: 0.35, size: 14 * s, grow: 30 * s, color: T.spray, alphaScale: 0.9 });
    push({ shape: 'ring', life: 0.8, size: 6 * s, grow: 46 * s, color: T.spray, alphaScale: 0.9 });
    push({ shape: 'ring', life: 0.9, size: 3 * s, grow: 30 * s, color: T.spray, alphaScale: 0.6, delay: 0.15 });
    if (arcade) push({ shape: 'text', text: 'MISS', life: 0.75, size: 15 * s, color: '#bfe9ff', vy: -26 * s, x: cx, y: cy - 8 * s });
    if (reduced) return;
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const v = rand(40, 120) * s;
      push({ shape: 'disc', life: rand(0.4, 0.75), size: rand(1.2, 2.8) * s, color: T.spray, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, alphaScale: 0.95 });
    }
    return;
  }

  const big = kind === 'sunk';
  const k = big ? 1.45 : 1;
  // The flash and the shock ring (both even under reduced motion, held still).
  push({ shape: 'soft', life: 0.18, size: 20 * s * k, grow: 60 * s, color: `rgb(${T.flash.join(',')})`, glow: true });
  if (arcade) push({ shape: 'text', text: big ? 'SUNK!' : 'HIT!', life: 0.9, size: (big ? 19 : 17) * s, color: big ? '#ffd23f' : '#ff7a3c', vy: -24 * s, x: cx, y: cy - 10 * s });
  if (reduced) {
    push({ shape: 'soft', life: 0.6, size: 14 * s * k, color: `rgb(${T.hot.join(',')})`, glow: true });
    return;
  }
  push({ shape: 'ring', life: 0.5, size: 6 * s, grow: (arcade ? 120 : 95) * s * k, color: T.ring, glow: true });
  if (arcade) push({ shape: 'ring', life: 0.42, size: 4 * s, grow: 80 * s * k, color: T.ring2, glow: true, delay: 0.05 });
  // The fireball: hot at the heart, cooling as it billows out.
  const balls = big ? 16 : 11;
  for (let i = 0; i < balls; i++) {
    const a = (i / balls) * TAU + rand(0, 0.6);
    const v = rand(18, 60) * s * k;
    push({ shape: 'soft', life: rand(0.6, 1.0), size: rand(8, 13) * s * k, grow: 16 * s, color: '#fff', hot: T.hot, cold: T.cold, glow: true, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.6, x: cx + Math.cos(a) * 3 * s, y: cy + Math.sin(a) * 3 * s });
  }
  // Smoke that lingers and drifts.
  for (let i = 0; i < (arcade ? 6 : 9); i++) {
    const a = rand(0, TAU);
    const v = rand(6, 22) * s;
    push({ shape: 'soft', life: rand(1.1, 1.9), size: rand(8, 12) * s * k, grow: 12 * s, color: T.smoke, alphaScale: arcade ? 0.6 : 0.55, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * s, drag: 1.2, delay: 0.1 });
  }
  // Sparks, quick and bright.
  for (let i = 0; i < (big ? 22 : 14); i++) {
    const a = rand(0, TAU);
    const v = rand(90, 220) * s * k;
    push({ shape: arcade ? 'star' : 'disc', life: rand(0.35, 0.7), size: (arcade ? rand(2.5, 4.5) : rand(1, 2)) * s, color: T.spark, glow: true, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, spin: rand(-8, 8), angle: rand(0, TAU) });
  }
  // Debris: chunks of hull, tumbling.
  for (let i = 0; i < (big ? 12 : 6); i++) {
    const a = rand(0, TAU);
    const v = rand(60, 150) * s * k;
    push({ shape: 'chunk', life: rand(0.6, 1.0), size: rand(2.5, 5) * s, color: T.debris[i % T.debris.length], vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, spin: rand(-12, 12), angle: rand(0, TAU) });
  }
}
