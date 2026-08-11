/**
 * Ship inspector — one hull, filling the screen, nothing else.
 *
 * The battle board shows ships at about 80px across, which is the right scale
 * to judge whether they *read*, and the wrong scale to judge whether the deck
 * paint sits flat or the running lights are where they should be. This page
 * exists for the second question.
 *
 *   /preview-ship.html                     the carrier, aqua fleet
 *   /preview-ship.html?ship=battleship     another hull
 *   /preview-ship.html?skin=ember          another fleet colour
 *   /preview-ship.html?grid=1              with the board grid for scale
 *
 * Dev-only: it's built solely when BUILD_HARNESS is set, so it never ships.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildModelShip, loadShipModels } from './components/three/shipModels';
import { FLEET } from './domain/constants';
import type { ShipId } from './domain/types';
import '@shared/styles/tokens.css';

const params = new URLSearchParams(location.search);
const skinColor = params.get('color') ?? '#22d3ee';
const showGrid = params.get('grid') === '1';

/** One hull, filling the screen. `ship` fixes which; `?ship=` overrides it. */
export function Inspector({ ship }: { ship?: ShipId }) {
  const shipId = (params.get('ship') ?? ship ?? 'carrier') as ShipId;
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;

    (async () => {
      try {
        await loadShipModels(skinColor);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.toneMappingExposure = 1;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#0a1424');

        const size = FLEET.find((s) => s.id === shipId)?.size ?? 5;
        // ?paint=0 strips the deck decal — that's the view an artist needs to
        // trace, because they must trace the *mesh*, not the reference image.
        const ship = buildModelShip(shipId, size, false, skinColor, params.get('paint') !== '0');
        if (!ship) {
          setError(`No generated mesh for "${shipId}" — it still builds procedurally.`);
          return;
        }
        scene.add(ship);

        if (showGrid) {
          const grid = new THREE.GridHelper(10, 10, '#3d6d8a', '#28546e');
          grid.position.y = -0.001;
          scene.add(grid);
        }

        // Lighting close to the battle scene's, so what you see here is what
        // the board will show — just much larger.
        scene.add(new THREE.HemisphereLight('#9fc4ff', '#16243a', 1.5));
        const key = new THREE.DirectionalLight('#ffffff', 2.0);
        key.position.set(3, 6, 2);
        scene.add(key);
        const rim = new THREE.DirectionalLight(skinColor, 0.5);
        rim.position.set(-4, 2, -3);
        scene.add(rim);

        const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.01, 100);
        // ?view=top looks straight down — the view that shows whether the deck
        // paint is oriented the same way round as the hull under it.
        if (params.get('view') === 'top') camera.position.set(0.001, size * 1.25, 0);
        else camera.position.set(size * 0.75, size * 0.5, size * 0.75);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 0, 0);

        const onResize = () => {
          if (!renderer) return;
          renderer.setSize(el.clientWidth, el.clientHeight);
          camera.aspect = el.clientWidth / el.clientHeight;
          camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', onResize);

        const loop = () => {
          raf = requestAnimationFrame(loop);
          controls.update();
          renderer?.render(scene, camera);
        };
        loop();
        (window as unknown as { __ready: boolean }).__ready = true;
      } catch (err) {
        setError(String(err));
      }
    })();

    return () => {
      cancelAnimationFrame(raf);
      renderer?.dispose();
    };
  }, []);

  // Full-bleed: the whole point of this page is to see the ship large, so the
  // canvas takes the entire viewport and the caption floats over it.
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a1424' }}>
      <div ref={holder} data-testid="ship-preview" style={{ width: '100vw', height: '100vh' }} />
      <p
        className="subtle"
        style={{
          position: 'fixed',
          left: 12,
          bottom: 10,
          margin: 0,
          pointerEvents: 'none',
          opacity: 0.75,
        }}
      >
        {shipId} · drag to orbit · scroll to zoom · <code>?ship=</code> <code>?color=</code>{' '}
        <code>?grid=1</code>
      </p>
      {error && (
        <p className="subtle center" data-testid="ship-preview-error" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// The page IS the component — without this mount the inspector served a
// blank #root and nobody noticed until the Fletcher needed reviewing.
createRoot(document.getElementById('root')!).render(<Inspector />);

