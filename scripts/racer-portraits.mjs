/**
 * Rainbow Racer portraits: renders each of the four riders from the real
 * three.js models (three/riders.ts) and writes one small webp per character
 * to src/games/racer/assets/portraits/. The menus, the score pills and the
 * win card show these, so every screen pictures the racer that actually flies.
 *
 * Run it after changing how a rider looks:
 *
 *   npm run racer-portraits
 *
 * It starts its own Vite dev server, renders in Playwright's Chromium with a
 * transparent background, and saves only files whose bytes changed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/games/racer/assets/portraits');
/** Character → the colour the game gives it (components/cast.ts). */
const CAST = { unicorn: 0xff7fc4, fairy: 0xa78bfa, princess: 0xffa94d, bunny: 0x6cc6ff };
const SIZE = 480;
const ENTRY = '/racer-portrait-entry.js';

/** Served by Vite, so its imports resolve like the game's own. */
const entrySource = `
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRider, preloadRiderAssets } from '/src/games/racer/three/riders.ts';

export async function portrait(character, color, size) {
  await preloadRiderAssets();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0xa9a6e6, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const rider = createRider(character, color, { reducedMotion: true, seed: 1 });
  rider.update(0.016, { speed: 36, bank: 0, climb: 0, tier: 0, boosting: false, wings: 0 });
  scene.add(rider.group);
  scene.updateMatrixWorld(true);
  // Three-quarter front view, framed on the model's bounds.
  const box = new THREE.Box3().setFromObject(rider.group);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(15))) * 0.95;
  const a = 0.55;
  camera.position.set(centre.x + Math.sin(a) * dist, centre.y + dist * 0.28, centre.z + Math.cos(a) * dist);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const data = renderer.domElement.toDataURL('image/png');
  rider.dispose();
  pmrem.dispose();
  renderer.dispose();
  return data;
}
`;

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  // Its own port (5173 belongs to another project, 5178 to Tidewave), and no
  // dependency scan of the app's pages: three is served as the ES module it is.
  server: { port: 5189, strictPort: true, host: '127.0.0.1' },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'racer-portrait-entry',
      resolveId: (id) => (id === ENTRY ? ENTRY : null),
      load: (id) => (id === ENTRY ? entrySource : null),
      // A blank page to import from (Vite's own 404 page forbids scripts).
      configureServer(srv) {
        srv.middlewares.use('/portraits', (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end('<!doctype html><title>Racer portraits</title>');
        });
      },
    },
  ],
});
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}portraits`);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [character, color] of Object.entries(CAST)) {
    const png = await page.evaluate(
      async ({ entry, character, color, size }) => (await import(entry)).portrait(character, color, size),
      { entry: ENTRY, character, color, size: SIZE },
    );
    const buf = await sharp(Buffer.from(png.split(',')[1], 'base64'))
      .trim()
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 86, alphaQuality: 90 })
      .toBuffer();
    const file = path.join(outDir, `${character}.webp`);
    const old = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (old && old.equals(buf)) {
      console.log(`${character}: unchanged`);
    } else {
      fs.writeFileSync(file, buf);
      console.log(`${character}: wrote ${path.relative(root, file)} (${buf.length} bytes)`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
