/**
 * All the drawing for Klara's Magic Coin game — the sky, the ocean, the coins,
 * and the characters. Kept apart from the React page so the component stays
 * about *state* and this file stays about *pixels*.
 *
 * Characters and coins are drawn with emoji (via fillText): the app's chrome is
 * emoji-free by house style, but a kid's game canvas is exactly where a
 * sparkly 🦄 belongs.
 */

import { FIELD_H, FIELD_W, type GameState, type Player } from '../domain/engine';

export function renderScene(canvas: HTMLCanvasElement, game: GameState, time: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // No clearRect: both backgrounds start with an opaque full-field fill.

  if (game.world === 'sky') drawSky(ctx, time);
  else drawOcean(ctx, time);

  for (const coin of game.coins) drawCoin(ctx, coin.pos.x, coin.pos.y, coin.hue, time);
  for (const p of game.players) drawPlayer(ctx, p, time);
}

// ----- backgrounds -----

function drawSky(ctx: CanvasRenderingContext2D, time: number) {
  const g = ctx.createLinearGradient(0, 0, 0, FIELD_H);
  g.addColorStop(0, '#8fd3ff');
  g.addColorStop(0.55, '#bfe7ff');
  g.addColorStop(1, '#eaf7ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // A soft sun in the corner.
  const sun = ctx.createRadialGradient(FIELD_W - 120, 110, 20, FIELD_W - 120, 110, 200);
  sun.addColorStop(0, 'rgba(255,246,199,0.95)');
  sun.addColorStop(1, 'rgba(255,246,199,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(FIELD_W - 400, 0, 400, 400);

  // Drifting clouds.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 6; i++) {
    const speed = 14 + i * 5;
    const x = mod(i * 220 + time * speed, FIELD_W + 260) - 130;
    const y = 70 + ((i * 97) % (FIELD_H - 180));
    cloud(ctx, x, y, 46 + (i % 3) * 10);
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r, y + 8, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x - r, y + 8, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x, y + 14, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawOcean(ctx: CanvasRenderingContext2D, time: number) {
  const g = ctx.createLinearGradient(0, 0, 0, FIELD_H);
  g.addColorStop(0, '#1fb6d6');
  g.addColorStop(0.5, '#1487c0');
  g.addColorStop(1, '#0b4e8a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // Light rays from the surface.
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#eaffff';
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 240 + Math.sin(time * 0.3 + i) * 20;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 60, 0);
    ctx.lineTo(x + 150, FIELD_H);
    ctx.lineTo(x - 30, FIELD_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Rising bubbles.
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 22; i++) {
    const bx = (i * 71) % FIELD_W;
    const by = mod(FIELD_H - (time * (24 + (i % 5) * 8) + i * 60), FIELD_H + 40) - 20;
    const r = 3 + (i % 4) * 2;
    ctx.beginPath();
    ctx.arc(bx + Math.sin(time + i) * 8, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ----- coins -----

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, hue: number, time: number) {
  const bob = Math.sin(time * 3 + x) * 3;
  const cy = y + bob;
  const r = 17;

  // Rainbow glow — the coin's magic colour lives in the halo, not the metal.
  const glow = ctx.createRadialGradient(x, cy, 2, x, cy, r * 2.4);
  glow.addColorStop(0, `hsla(${hue},95%,65%,0.55)`);
  glow.addColorStop(1, `hsla(${hue},95%,65%,0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, cy, r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // No spin flip — the family wants coins that stay perfect circles.
  ctx.save();
  ctx.translate(x, cy);

  // Rim, then the brighter face inset into it.
  ctx.fillStyle = '#e39c1c';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  const face = ctx.createRadialGradient(-5, -6, 2, 0, 0, r - 2.5);
  face.addColorStop(0, '#fff6c9');
  face.addColorStop(0.55, '#ffd54a');
  face.addColorStop(1, '#f0ad2b');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, r - 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Embossed inner ring, like a struck coin's raised border.
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(184,121,26,0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
  ctx.stroke();

  // The star stamp — ONE engraved star. (The old two-star-with-shadow stack
  // read as a frowny face at coin size; never layer offset stamps.)
  const stampGrad = ctx.createLinearGradient(0, -8.5, 0, 8.5);
  stampGrad.addColorStop(0, '#c7861d');
  stampGrad.addColorStop(1, '#a86f14');
  ctx.fillStyle = stampGrad;
  star(ctx, 0, 0.3, 8.5, 3.6, 5);
  ctx.strokeStyle = 'rgba(255,246,201,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glint riding the top-left rim.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(-r * 0.45, -r * 0.55, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ----- players -----

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, time: number) {
  const bob = Math.sin(time * 4 + p.id) * 3;
  const x = p.pos.x;
  const y = p.pos.y + bob;

  // Colored ring so you always know which player you are.
  ctx.beginPath();
  ctx.arc(x, y, 34, 0, Math.PI * 2);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Power aura.
  if (p.power) {
    const auraColor =
      p.power.kind === 'speed' ? '#ffd54a' : p.power.kind === 'magnet' ? '#7fd7ff' : '#ffb0e6';
    const pulse = 40 + Math.sin(time * 10) * 5;
    const aura = ctx.createRadialGradient(x, y, 10, x, y, pulse);
    aura.addColorStop(0, `${auraColor}00`);
    aura.addColorStop(0.7, `${auraColor}88`);
    aura.addColorStop(1, `${auraColor}00`);
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  // Collect sparkle.
  if (p.glow > 0.01) {
    ctx.save();
    ctx.globalAlpha = p.glow;
    ctx.fillStyle = '#fffbe0';
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + time * 4;
      const rr = 30 + (1 - p.glow) * 24;
      star(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr, 6, 2.5, 4);
    }
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (p.mount) {
    // Rider sits just above and behind the animal.
    ctx.font = '46px serif';
    ctx.fillText(p.mount, x, y + 4);
    ctx.font = '30px serif';
    ctx.fillText(p.emoji, x + 2, y - 18);
  } else {
    ctx.font = '48px serif';
    ctx.fillText(p.emoji, x, y);
  }
}

// ----- util -----

/** Positive modulo — keeps wrapped positions from going negative. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
