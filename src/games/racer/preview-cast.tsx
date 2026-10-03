/**
 * Rainbow Racer cast preview: the unicorn and the fairy in one look, the
 * three ways a child meets them.
 *
 *   1. Turntable: front, three-quarter, side and back on a studio backdrop.
 *   2. Pick card: the circle portrait from the pick screen, in its real card.
 *   3. In race: both flying in the real racer sky (RacerScene) at race size,
 *      seen from the chase camera as they bank into a turn.
 *
 *   /preview-racer-cast.html?style=today   today's riders (three/riders.ts)
 *   /preview-racer-cast.html?style=a       A, close match (three/chunky)
 *   /preview-racer-cast.html?style=b       B, in between (three/chunky)
 *   …&view=turntable | pick | race         one section alone, for screenshots
 *
 * The wings flap and the riders bob unless the browser asks for reduced
 * motion; then (and in the screenshot run) every view is one still frame.
 * Dev-only: built solely when BUILD_HARNESS is set, so it never ships.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { driverById, type Driver } from './components/cast';
import { CRUISE_SPEED, createFlyer, type Flyer } from './domain/flight';
import { createChunkyRider, drawCost, type ChunkyStyle } from './three/chunky';
import { createRider, type Rider, type RiderPose } from './three/riders';
import { RacerScene, type RacerLook } from './three/scene';
import '@shared/styles/tokens.css';
import './styles/racer.css';

type Look = 'today' | ChunkyStyle;

const LOOKS: ReadonlyArray<{ id: Look; name: string }> = [
  { id: 'today', name: 'Today' },
  { id: 'a', name: 'A · Close match' },
  { id: 'b', name: 'B · In between' },
];

const params = new URLSearchParams(location.search);
const look: Look = LOOKS.find((l) => l.id === params.get('style'))?.id ?? 'today';
const only = params.get('view');
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const CAST: Driver[] = [driverById('unicorn'), driverById('fairy')];
const CRUISE: RiderPose = { speed: CRUISE_SPEED, bank: 0, climb: 0, tier: 0, boosting: false, wings: 0 };

/** Nothing at all: the race view's camera follows one of these, so both racers can be seen side by side. */
function emptyRider(): Rider {
  return { group: new THREE.Group(), update: () => {}, dispose: () => {} };
}

/**
 * The rider factory for this look. The race view adds a princess as its
 * invisible camera kart, so she builds as nothing.
 */
function factoryFor(l: Look): typeof createRider {
  return (character, color, opts) => {
    if (character === 'princess') return emptyRider();
    if (l === 'today' || character === 'bunny') return createRider(character, color, opts);
    return createChunkyRider(l, character, color, opts);
  };
}
const makeRider = factoryFor(look);

/** The game's own light: soft room reflections, sky fill and a warm sun. */
function lightScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.4;
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0xa9a6e6, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  pmrem.dispose();
  return () => env.dispose();
}

function gradientTexture(stops: ReadonlyArray<[number, string]>, radial = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = radial ? ctx.createRadialGradient(64, 64, 0, 64, 64, 64) : ctx.createLinearGradient(0, 0, 0, 128);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bounds(o: THREE.Object3D): { centre: THREE.Vector3; radius: number; box: THREE.Box3 } {
  o.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(o);
  return { centre: box.getCenter(new THREE.Vector3()), radius: box.getBoundingSphere(new THREE.Sphere()).radius, box };
}

// ---------------------------------------------------------------------------
// 1. Turntable

const ANGLES: ReadonlyArray<{ name: string; yaw: number }> = [
  { name: 'Front', yaw: 0 },
  { name: '3/4', yaw: 0.75 },
  { name: 'Side', yaw: Math.PI / 2 },
  { name: 'Back', yaw: Math.PI },
];

function Turntable({ onReady }: { onReady: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setScissorTest(true);
    const scene = new THREE.Scene();
    const backdrop = gradientTexture([
      [0, '#f6f4fb'],
      [0.62, '#ebe8f4'],
      [1, '#dedaf0'],
    ]);
    scene.background = backdrop;
    const freeLight = lightScene(renderer, scene);
    const shadowTex = gradientTexture(
      [
        [0, 'rgba(70,60,120,0.28)'],
        [1, 'rgba(70,60,120,0)'],
      ],
      true,
    );
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    const riders = CAST.map((d) => makeRider(d.id, d.color, { reducedMotion, seed: 1 }));
    riders.forEach((r) => r.update(0.016, CRUISE));
    const frames = riders.map((r) => {
      const { centre, radius, box } = bounds(r.group);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      const size = box.getSize(new THREE.Vector3());
      shadow.scale.set(Math.max(size.x, size.z) * 0.9, 1, Math.max(size.x, size.z) * 0.9);
      shadow.position.set(centre.x, box.min.y - 0.5, centre.z);
      return { centre, radius, shadow };
    });
    // One scale for both rows, so the two characters compare at true size.
    const radius = Math.max(...frames.map((f) => f.radius));
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);

    let raf = 0;
    let last = performance.now();
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      const cw = w / ANGLES.length;
      const ch = h / CAST.length;
      camera.aspect = cw / ch;
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(14))) * 1.02;
      camera.updateProjectionMatrix();
      riders.forEach((rider, row) => {
        const { centre, shadow } = frames[row];
        scene.add(rider.group, shadow);
        ANGLES.forEach(({ yaw }, col) => {
          camera.position.set(centre.x + Math.sin(yaw) * dist, centre.y + dist * 0.16, centre.z + Math.cos(yaw) * dist);
          camera.lookAt(centre);
          const y = h - (row + 1) * ch;
          renderer.setViewport(col * cw, y, cw, ch);
          renderer.setScissor(col * cw, y, cw, ch);
          renderer.render(scene, camera);
        });
        scene.remove(rider.group, shadow);
      });
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      riders.forEach((r) => r.update((now - last) / 1000, CRUISE));
      last = now;
      draw();
    };
    draw();
    onReady();
    if (!reducedMotion) loop();
    return () => {
      cancelAnimationFrame(raf);
      riders.forEach((r) => r.dispose());
      shadowGeo.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      backdrop.dispose();
      freeLight();
      renderer.dispose();
    };
  }, [onReady]);

  return (
    <div className="cp-turntable">
      <canvas ref={ref} />
      <div className="cp-grid" aria-hidden="true">
        {CAST.map((d) =>
          ANGLES.map((a, i) => (
            <div key={`${d.id}-${a.name}`} className="cp-cell">
              {i === 0 && <span className="cp-who">{d.name}</span>}
              <span className="cp-angle">{a.name}</span>
            </div>
          )),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Pick card

/** Crop to what was drawn and fit it in a square, as the portrait script's trim-and-contain does. */
function trimToSquare(source: HTMLCanvasElement, size: number): string {
  const flat = document.createElement('canvas');
  flat.width = source.width;
  flat.height = source.height;
  const fctx = flat.getContext('2d')!;
  fctx.drawImage(source, 0, 0);
  const { data, width, height } = fctx.getImageData(0, 0, flat.width, flat.height);
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const out = document.createElement('canvas');
  out.width = out.height = size;
  if (x1 < x0) return out.toDataURL('image/png');
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const k = size / Math.max(w, h);
  out.getContext('2d')!.drawImage(flat, x0, y0, w, h, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
  return out.toDataURL('image/png');
}

/** The portrait as `npm run racer-portraits` frames it: three-quarter front, on the model's bounds. */
function portrait(d: Driver, size: number): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const freeLight = lightScene(renderer, scene);
  const rider = makeRider(d.id, d.color, { reducedMotion: true, seed: 1 });
  rider.update(0.016, CRUISE);
  scene.add(rider.group);
  const { centre, radius } = bounds(rider.group);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 0.95;
  const a = 0.55;
  camera.position.set(centre.x + Math.sin(a) * dist, centre.y + dist * 0.28, centre.z + Math.cos(a) * dist);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = trimToSquare(renderer.domElement, 256);
  rider.dispose();
  freeLight();
  renderer.dispose();
  return url;
}

function PickCards({ onReady }: { onReady: () => void }) {
  // Today's cards show the shipped pictures; a chunky look renders its own once.
  const [pics] = useState(() => CAST.map((d) => (look === 'today' ? d.portrait : portrait(d, 480))));
  useEffect(() => {
    // Wait for the pictures to decode, so a screenshot never catches an empty badge.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.cp-pick img'));
    void Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(onReady);
  }, [pics, onReady]);
  return (
    <div className="racer-root cp-pick">
      <div className="racer-setup">
        <div className="racer-setup-head">
          <h1>Pick your racer</h1>
        </div>
        <div className="racer-cast">
          {CAST.map((d, i) => (
            <div key={d.id} className="racer-cast-btn" style={{ '--rc': d.css } as React.CSSProperties}>
              <span className="racer-cast-badge">
                <img className="racer-cast-pic" src={pics[i]} alt="" />
              </span>
              <span className="racer-cast-name">{d.name}</span>
              <span className="racer-cast-flies">{d.flies}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. In race

/** Both racers banking gently into a left turn, side by side on the road out of the start. */
function flyers(): Flyer[] {
  const turn = 0.5;
  const unicorn = { ...createFlyer(4, 41, turn, 30.5), bank: -0.25, trail: 1 };
  const fairy = { ...createFlyer(-4.5, 42, turn, 31.5), bank: -0.25, trail: 1 };
  // The camera kart: on the line both are flying, a few lengths behind them.
  const camera = { ...createFlyer(0, 38, 0, 30), trail: 1 };
  return [unicorn, fairy, camera];
}

function Race({ onReady }: { onReady: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<string>('');
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const built: Rider[] = [];
    const looks: RacerLook[] = [
      { portrait: '', color: CAST[0].color, character: 'unicorn', label: '' },
      { portrait: '', color: CAST[1].color, character: 'fairy', label: CAST[1].rival },
      { portrait: '', color: 0xffffff, character: 'princess', label: '' },
    ];
    const race = new RacerScene(container, looks, 2, reducedMotion, (character, color, opts) => {
      const rider = makeRider(character, color, opts);
      built.push(rider);
      return rider;
    });
    const view = { karts: flyers(), coins: [], stars: [] };
    // Let the chase camera settle behind the pack before the first picture.
    for (let i = 0; i < 150; i++) race.sync(view, 1 / 60);
    race.render();

    // How tall each racer stands in the frame, the number that matters for reading them.
    const camera = (race as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const share = (r: Rider) => {
      let lo = Infinity;
      let hi = -Infinity;
      const p = new THREE.Vector3();
      r.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera);
          lo = Math.min(lo, p.y);
          hi = Math.max(hi, p.y);
        }
      });
      return Math.round(((hi - lo) / 2) * 100);
    };
    setHeights(`${CAST[0].name} ${share(built[0])}% · ${CAST[1].name} ${share(built[1])}% of frame height`);
    onReady();

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      race.sync(view, Math.min(0.05, (now - last) / 1000));
      last = now;
      race.render();
    };
    if (!reducedMotion) loop();
    return () => {
      cancelAnimationFrame(raf);
      race.dispose();
    };
  }, [onReady]);
  return (
    <div className="cp-race" ref={ref}>
      <span className="cp-chip" data-testid="cast-race-heights">
        {heights}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Budget() {
  const rows = CAST.map((d) => {
    const r = makeRider(d.id, d.color, { reducedMotion: true, seed: 1 });
    const cost = drawCost(r.group);
    r.dispose();
    return { name: d.name, ...cost };
  });
  return (
    <p className="cp-budget" data-testid="cast-budget">
      {rows.map((r) => `${r.name}: ${r.calls} draw calls, ${r.triangles.toLocaleString('en')} triangles`).join(' · ')}
    </p>
  );
}

const SECTIONS = ['turntable', 'pick', 'race'] as const;

export function CastPreview() {
  const shown = SECTIONS.filter((s) => !only || s === only);
  const [done, setDone] = useState<string[]>([]);
  const [ready] = useState(() =>
    Object.fromEntries(shown.map((s) => [s, () => setDone((d) => (d.includes(s) ? d : [...d, s]))])),
  );
  return (
    <div className="app cast-preview" data-testid="cast-preview" data-ready={done.length === shown.length ? '1' : '0'}>
      <style>{`
        .cast-preview { min-height: 100vh; background: #f1eff7; color: #2b2a45; font: 15px system-ui, sans-serif; padding: ${only ? 0 : 16}px; }
        .cast-preview header { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: baseline; margin-bottom: 12px; }
        .cast-preview header h1 { font-size: 22px; margin: 0; }
        .cast-preview header a { color: #5b3fc4; font-weight: 700; }
        .cast-preview header a[aria-current] { color: #2b2a45; text-decoration: none; }
        .cast-preview h2 { font-size: 16px; margin: 20px 0 8px; }
        .cp-budget { margin: 0; font-size: 14px; color: #5c6b85; }
        .cp-turntable { position: relative; width: 1200px; height: 720px; }
        .cp-turntable canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .cp-grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); pointer-events: none; }
        .cp-cell { position: relative; }
        .cp-who { position: absolute; top: 12px; left: 14px; font-weight: 800; font-size: 18px; color: #4a3d7a; }
        .cp-angle { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); padding: 3px 14px; border-radius: 999px; background: #fff; box-shadow: 0 2px 0 #d5cfe8; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; color: #3a3360; }
        .cp-pick.racer-root { min-height: 0; width: 760px; padding: 28px 24px 34px; }
        .cp-pick .racer-cast { grid-template-columns: repeat(2, 200px); justify-content: center; }
        .cp-race { position: relative; width: 1180px; height: 820px; overflow: hidden; }
        .cp-race canvas { display: block; }
        .cp-chip { position: absolute; z-index: 1; top: 12px; left: 12px; padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,0.85); font-size: 14px; font-weight: 700; color: #3a3360; }
      `}</style>
      {!only && (
        <header>
          <h1>Rainbow Racer cast: {LOOKS.find((l) => l.id === look)?.name}</h1>
          {LOOKS.map((l) => (
            <a key={l.id} href={`?style=${l.id}`} aria-current={l.id === look ? 'page' : undefined}>
              {l.name}
            </a>
          ))}
          <Budget />
        </header>
      )}
      {shown.includes('turntable') && (
        <section data-testid="cast-turntable">
          {!only && <h2>Turntable</h2>}
          <Turntable onReady={ready.turntable} />
        </section>
      )}
      {shown.includes('pick') && (
        <section data-testid="cast-pick">
          {!only && <h2>Pick card</h2>}
          <PickCards onReady={ready.pick} />
        </section>
      )}
      {shown.includes('race') && (
        <section data-testid="cast-race">
          {!only && <h2>In race</h2>}
          <Race onReady={ready.race} />
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<CastPreview />);
