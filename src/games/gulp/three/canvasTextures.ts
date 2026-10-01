/**
 * Gulp Universe's painted textures: every picture the scene draws on a
 * canvas (name tags, speech bubbles, the power-up countdown, messes in a
 * mouth, the "!" over a runner, a vehicle's soft shadow). Painted in code, so
 * the PWA stays offline.
 */
import * as THREE from 'three';
import { seededRng } from '@shared/rng';

/** What a mouth can be left with: burnt by a fuel truck, a garbage truck, ice cream. */
export type Smear = 'burn' | 'poop' | 'icecream';

const FONT = 'ui-rounded, system-ui, -apple-system, sans-serif';

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function srgb(c: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** For a glow or a soft edge laid over the scene. */
function premultiplied(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  // Uploaded as the canvas holds it: WebKit speckles otherwise (see the racer's sun).
  t.premultiplyAlpha = true;
  return t;
}

/**
 * A mess over the throat, strongest toward the rim (the middle is dark
 * anyway): soot and embers, brown splodges, or scoops of ice cream with
 * sprinkles. Blobs sit at fixed spots, so the same mess always looks the same.
 */
export function smearTexture(kind: Smear): THREE.Texture {
  // Laid on the throat's walls: across is once round the mouth, and the rim
  // is the bottom edge, so the mess is thickest at the rim and thins out
  // going down. Sizes are for a 256-high canvas, drawn at twice that.
  const W = 1024;
  const H = 512;
  const k = H / 256;
  const { c, g } = canvas(W, H);
  const rng = seededRng(kind === 'burn' ? 11 : kind === 'poop' ? 23 : 37);
  // Drawn twice across the seam, so nothing is cut off where the walls meet.
  const twice = (x: number, draw: (x: number) => void) => {
    draw(x);
    draw(x < W / 2 ? x + W : x - W);
  };
  const blob = (x: number, y: number, r: number, color: string) =>
    twice(x, (bx) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(bx, y, r, 0, Math.PI * 2);
      g.fill();
    });
  const onWall = (n: number, draw: (x: number, y: number, i: number) => void) => {
    for (let i = 0; i < n; i++) draw(rng() * W, H - Math.pow(rng(), 1.5) * H * 0.75, i);
  };
  if (kind === 'burn') {
    const grad = g.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, 'rgba(40,26,20,0.95)');
    grad.addColorStop(0.45, 'rgba(30,20,16,0.8)');
    grad.addColorStop(1, 'rgba(20,14,12,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    onWall(90, (x, y, i) => blob(x, y, (2 + rng() * 4) * k, i % 3 ? '#ff7a1a' : '#ffd23f'));
  } else if (kind === 'poop') {
    onWall(40, (x, y) => blob(x, y, (12 + rng() * 16) * k, rng() < 0.5 ? '#6b3f1a' : '#86532a'));
    onWall(20, (x, y) => blob(x, y, (5 + rng() * 5) * k, '#a06a38'));
  } else {
    const scoops = ['#ffb3d1', '#fff1c9', '#9be3c4', '#8a5a3c', '#ffd0e4'];
    onWall(38, (x, y, i) => blob(x, y, (14 + rng() * 14) * k, scoops[i % scoops.length]));
    const sprinkles = ['#ff4d6d', '#3a86ff', '#ffd23f', '#2ec27e', '#ffffff'];
    onWall(130, (x, y, i) =>
      twice(x, (sx) => {
        g.fillStyle = sprinkles[i % sprinkles.length];
        g.save();
        g.translate(sx, y);
        g.rotate(rng() * Math.PI);
        g.fillRect(-4 * k, -1.2 * k, 8 * k, 2.4 * k);
        g.restore();
      }),
    );
  }
  return srgb(c);
}

/** A hole's name tag: white with the hole's colour for the child's own, dark glass for the others. */
export function labelTexture(name: string, color: number, mine: boolean): THREE.Texture {
  const { c, g } = canvas(256, 64);
  g.font = `700 30px ${FONT}`;
  // A long name is cut short with an ellipsis, so it fits its tag.
  let text = name;
  while (text.length > 1 && g.measureText(text).width > 214) text = text.slice(0, -1);
  if (text !== name) text = `${text.trimEnd()}…`;
  const w = Math.min(248, g.measureText(text).width + 34);
  g.fillStyle = mine ? '#ffffff' : 'rgba(20,24,36,0.7)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 22);
  g.fill();
  g.fillStyle = mine ? `#${new THREE.Color(color).getHexString()}` : '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  return srgb(c);
}

/** How tall a speech bubble's picture is; its width follows the words (see `bubbleTexture`). */
export const BUBBLE_HEIGHT = 128;

/**
 * A white speech bubble with a little tail; green words for healthy food.
 * The bubble is as wide as its words need (a health bonus can run to five
 * digits), never narrower than a "Yum!".
 */
export function bubbleTexture(text: string, healthy: boolean): THREE.Texture {
  const font = `900 44px ${FONT}`;
  const probe = canvas(1, 1).g;
  probe.font = font;
  const w = Math.max(256, Math.ceil(probe.measureText(text).width) + 80);
  const { c, g } = canvas(w, BUBBLE_HEIGHT);
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(29,31,51,0.85)';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(8, 8, w - 16, 86, 40);
  g.moveTo(52, 90);
  g.lineTo(36, 122);
  g.lineTo(84, 92);
  g.fill();
  g.stroke();
  // Cover the seam between the bubble and its tail.
  g.fillRect(44, 84, 44, 10);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = healthy ? '#1a9c3c' : '#e0457b';
  g.fillText(text, w / 2, 52);
  return srgb(c);
}

/**
 * A soft glow that fades out from the rim: the power-up aura. The ring's
 * texture is laid over the whole square it spans, so the glow is drawn round:
 * bright at the rim (half-way out) and gone at the edge.
 */
export function auraTexture(): THREE.Texture {
  const s = 256;
  const { c, g } = canvas(s, s);
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.48, 'rgba(255,255,255,0)');
  grad.addColorStop(0.52, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return premultiplied(c);
}

/** The seconds left on a power-up: a big number in a coloured badge. */
export function countTexture(secs: number, color: number): THREE.Texture {
  const { c, g } = canvas(128, 128);
  g.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.font = `900 68px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(29,31,51,0.85)';
  g.strokeText(String(secs), 64, 68);
  g.fillStyle = '#ffffff';
  g.fillText(String(secs), 64, 68);
  return srgb(c);
}

/** A red "!" for someone running away. */
export function alarmTexture(): THREE.Texture {
  const { c, g } = canvas(48, 64);
  g.font = `900 60px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
  g.strokeText('!', 24, 34);
  g.fillStyle = '#e8322b';
  g.fillText('!', 24, 34);
  return srgb(c);
}

/** A soft rounded patch, dark in the middle and fading at the edges. */
export function blobTexture(): THREE.Texture {
  const s = 64;
  const { c, g } = canvas(s, s);
  // Stacked, shrinking rounded squares build up a soft edge (canvas blur
  // filters are missing on older iPads).
  g.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i < 9; i++) {
    const inset = 2 + i * 2.2;
    g.beginPath();
    g.roundRect(inset, inset, s - inset * 2, s - inset * 2, 14 - i);
    g.fill();
  }
  return premultiplied(c);
}
