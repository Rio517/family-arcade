/**
 * Gulp asset gallery — every model in the kit on its own card, standing over
 * the smallest mouth that can swallow it.
 *
 * The dark disc with the blue rim is a hole at exactly the radius where the
 * model starts to fit (its swallow size over FIT). A model that looks like it
 * should fit a smaller mouth, or clearly overhangs this one, has the wrong
 * footprint in the catalogue. Each card gives the kind, that mouth radius,
 * the points it is worth, and the level a hole of that size is at.
 *
 * The slider sets a test mouth: a yellow ring on every card, and a green or
 * red card edge for whether that mouth can swallow the model.
 *
 *   /preview-gulp.html               everything, smallest first
 *   /preview-gulp.html?kind=stadium  one kind (all its colours)
 *   /preview-gulp.html?tier=5        one tier
 *
 * Drag any card to turn every model. Dev-only: built solely when
 * BUILD_HARNESS is set, so it never ships.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { FIT, KINDS, LEVELS, footSize, makeProp, type PropKind } from './domain/catalog';
import { levelOf } from './domain/world';
import { buildKindGeometry } from './three/props';
import '@shared/styles/tokens.css';

const params = new URLSearchParams(location.search);
const onlyKind = params.get('kind');
const onlyTier = params.get('tier');

interface Item {
  kind: PropKind;
  v: number;
  /** The smallest mouth radius that swallows it. */
  r: number;
  points: number;
}

let kinds = (Object.keys(KINDS) as PropKind[]).sort((a, b) => footSize(a) - footSize(b));
if (onlyKind) kinds = kinds.filter((k) => k === onlyKind);
if (onlyTier) kinds = kinds.filter((k) => KINDS[k].tier === Number(onlyTier));
const ITEMS: Item[] = kinds.flatMap((kind) =>
  Array.from({ length: onlyKind ? KINDS[kind].variants : 1 }, (_, v) => {
    const p = makeProp(0, kind, 0, 0, 0, v);
    return { kind, v, r: p.size / FIT, points: p.points };
  }),
);

/** The slider runs on a log scale, from a cone's mouth to past a mountain's. */
const R_MIN = 0.5;
const R_MAX = 80;
const toR = (t: number) => R_MIN * Math.pow(R_MAX / R_MIN, t);
const toT = (r: number) => Math.log(r / R_MIN) / Math.log(R_MAX / R_MIN);

function levelName(r: number): string {
  const fits = LEVELS.filter((l) => l.size <= r * FIT);
  return fits.length ? fits[fits.length - 1].label : 'Nothing yet';
}

export function Gallery() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [t, setT] = useState(() => toT(3));
  const mouthR = toR(t);
  // The render loop reads the test mouth from here; the slider keeps it current.
  const mouthRef = useRef(toR(toT(3)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setScissorTest(true);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8a8070, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2de, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    const missing = new THREE.MeshStandardMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.6 });
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xc9d2dc });
    // Flat layers sit on the ground with polygon offsets, as the game's ground does, so they never fight.
    const flat = (color: number, layer: number) =>
      new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 4 });
    const mouthMat = flat(0x0b0b18, 1);
    const rimMat = flat(0x3d7bff, 2);
    const testMat = flat(0xffc62e, 3);

    // One group per card, all at the origin: only the card being drawn is shown.
    const groups = ITEMS.map((item) => {
      const info = KINDS[item.kind];
      const g = new THREE.Group();
      const reach = Math.max(item.r, info.w / 2, info.d / 2) * 4;
      const ground = new THREE.Mesh(new THREE.CircleGeometry(reach, 48), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(item.r, 64), mouthMat);
      disc.rotation.x = -Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.RingGeometry(item.r, item.r * 1.05 + 0.05, 64), rimMat);
      rim.rotation.x = -Math.PI / 2;
      let model: THREE.Mesh;
      try {
        model = new THREE.Mesh(buildKindGeometry(item.kind, item.v), material);
      } catch {
        // No model yet: a red box at the catalogue size.
        model = new THREE.Mesh(new THREE.BoxGeometry(info.w, info.h, info.d).translate(0, info.h / 2, 0), missing);
      }
      model.castShadow = true;
      model.receiveShadow = true;
      g.add(ground, disc, rim, model);
      g.visible = false;
      scene.add(g);
      return g;
    });
    const testRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 96), testMat);
    testRing.rotation.x = -Math.PI / 2;
    scene.add(testRing);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
    let yaw = 0;
    let drag: number | null = null;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-card]')) drag = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (drag === null) return;
      yaw += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    };
    const onUp = () => {
      drag = null;
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      renderer.setScissor(0, 0, w, h);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      const mouth = mouthRef.current;
      ITEMS.forEach((item, i) => {
        const view = cardRefs.current[i]?.querySelector('[data-view]');
        if (!view) return;
        const rect = view.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > h || rect.width === 0) return;
        const info = KINDS[item.kind];
        groups[i].visible = true;
        testRing.scale.setScalar(mouth);
        testRing.visible = mouth < item.r * 3 && mouth > item.r / 3;
        // Frame the larger of the model and its mouth, from the game's high three-quarter angle.
        const size = Math.max(item.r * 1.1, info.w / 2, info.d / 2, info.h * 0.55, testRing.visible ? mouth * 1.1 : 0);
        const dist = (size / Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.25;
        const pitch = THREE.MathUtils.degToRad(50);
        const lift = info.h * 0.2;
        camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + lift, Math.cos(yaw) * Math.cos(pitch) * dist);
        camera.lookAt(0, lift, 0);
        camera.aspect = rect.width / rect.height;
        camera.near = dist / 50;
        camera.far = dist * 4;
        camera.updateProjectionMatrix();
        const sc = sun.shadow.camera;
        const reach = size * 1.6 + info.h * 0.5;
        sc.left = sc.bottom = -reach;
        sc.right = sc.top = reach;
        sc.near = 1;
        sc.far = reach * 8;
        sc.updateProjectionMatrix();
        sun.position.set(reach * 1.2, reach * 3, reach * 0.8);
        const y = h - rect.bottom;
        renderer.setViewport(rect.left, y, rect.width, rect.height);
        renderer.setScissor(rect.left, y, rect.width, rect.height);
        renderer.render(scene, camera);
        groups[i].visible = false;
      });
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="app gulp-gallery" data-testid="gulp-gallery">
      <style>{`
        .gulp-gallery { min-height: 100vh; background: #e4eaf1; color: #1d1f33; font: 15px system-ui, sans-serif; }
        .gulp-gallery header { position: sticky; top: 0; z-index: 3; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; padding: 12px 16px; background: #1d1f33; color: #fff; }
        .gulp-gallery header h1 { font-size: 18px; margin: 0; }
        .gulp-gallery header input { width: min(420px, 60vw); }
        .gulp-gallery .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 16px; }
        .gulp-gallery .card { background: #f4f7fa; border: 3px solid transparent; border-radius: 12px; overflow: hidden; }
        .gulp-gallery .card.fits { border-color: #2fae5a; }
        .gulp-gallery .card.big { border-color: #e2493b; }
        .gulp-gallery .card [data-view] { height: 200px; cursor: grab; }
        .gulp-gallery .card p { margin: 0; padding: 6px 10px 8px; font-size: 14px; line-height: 1.35; background: #fff; }
        .gulp-gallery canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 2; pointer-events: none; }
      `}</style>
      <header>
        <h1>Gulp assets</h1>
        <label htmlFor="mouth">Test mouth</label>
        <input
          id="mouth"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onChange={(e) => {
            const next = Number(e.target.value);
            mouthRef.current = toR(next);
            setT(next);
          }}
          data-testid="gulp-gallery-mouth"
        />
        <span>
          radius {mouthR.toFixed(2)} · level {levelOf(mouthR)} ({levelName(mouthR)})
        </span>
        <span>blue ring: smallest mouth that fits · yellow ring: test mouth</span>
      </header>
      <div className="grid">
        {ITEMS.map((item, i) => {
          const info = KINDS[item.kind];
          return (
            <div
              key={`${item.kind}-${item.v}`}
              className={`card ${item.r <= mouthR ? 'fits' : 'big'}`}
              data-card
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
            >
              <div data-view />
              <p>
                <strong>
                  {info.wonder?.name ?? item.kind}
                  {onlyKind ? ` #${item.v}` : ''}
                </strong>
                <br />
                mouth {item.r.toFixed(2)} · {item.points} pts · L{levelOf(item.r)} {levelName(item.r)}
                <br />
                {info.w}×{info.d}×{info.h} · tier {info.tier}
              </p>
            </div>
          );
        })}
      </div>
      <canvas ref={canvasRef} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
