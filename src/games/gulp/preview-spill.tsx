/**
 * Harness: a swallowed ship's containers spilling into a hole, in the real
 * Gulp scene on a seeded Region map, so the spill can be pictured and timed
 * without playing a round up to the harbour.
 *
 *   /preview-gulp-spill.html?at=1.1   Robin's hole takes a ship; the picture stops 1.1 s later
 *   /preview-gulp-spill.html?perf     live: a level 17 hole by the harbour, rivals roaming,
 *                                     and a ship spilling every few seconds (scripts/perf-gulp.mjs --spill)
 *
 * `[data-testid="gulp-spill-ready"]` appears once the picture is drawn, or
 * once the live run is under way. Dev-only: built solely when BUILD_HARNESS
 * is set, so it never ships.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { seededRng } from '@shared/rng';
import '@shared/styles/tokens.css';
import { MAPS } from './domain/city';
import { massFor } from './domain/growth';
import { createWorld, stepWorld, type Input, type World, type WorldEvent } from './domain/world';
import { SKINS, rivalsFor } from './components/skins';
import { GulpScene, type HoleLook } from './three/scene';
import './styles/gulp.css';

const params = new URLSearchParams(location.search);
const PERF = params.has('perf');
/** Seconds after the ship goes in at which the picture stops. */
const AT = Number(params.get('at') ?? '1.1');
/** The hole's size: a ship fits from about 21; level 17 is about 60. */
const R = Number(params.get('r') ?? (PERF ? '60' : '26'));
/** Where the hole stands from the ship's middle. */
const DX = Number(params.get('dx') ?? '15');
const DZ = Number(params.get('dz') ?? '-7');
const STEP = 1 / 60;
/** In the live run, a ship goes in this often (the two moored ships in turn). */
const SPILL_EVERY = 3;

function makeRound(): { world: World; looks: HoleLook[] } {
  const robin = { name: 'Robin', skin: 0 };
  const rivals = PERF ? rivalsFor(robin.skin, MAPS.region.rivals) : [];
  const world = createWorld(seededRng(7), [robin], rivals, {
    map: 'region',
    duration: 0,
    powerups: false,
    fightBack: false,
    regrow: PERF,
    countdown: 0,
  });
  const looks: HoleLook[] = [robin, ...rivals].map((r) => ({ color: SKINS[r.skin].color, label: r.name }));
  return { world, looks };
}

export function Spill() {
  const mount = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const { world, looks } = makeRound();
    const ships = world.city.props.filter((p) => p.kind === 'ship');
    const me = world.holes[0];
    me.r = R;
    me.mass = massFor(R);
    // Coming along the quay: the ship's stern and its stacks hang over the rim, and the first step swallows it.
    me.x = ships[0].x + DX;
    me.z = ships[0].z + DZ;
    // As in the game: with reduced motion the containers ride the hull down instead of spilling.
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new GulpScene(el, world, looks, 0, reduced, false);
    let raf = 0;
    let gone = false;

    const still = async () => {
      await scene.spillsReady();
      if (gone) return;
      // Fixed steps from the swallow, so the picture is the same every run.
      for (let t = 0; t < AT - 1e-9; t += STEP) scene.sync(world, stepWorld(world, STEP, null), STEP);
      const draw = () => {
        scene.render();
        raf = requestAnimationFrame(draw);
      };
      draw();
      setReady(true);
    };

    const live = async () => {
      await scene.spillsReady();
      if (gone) return;
      let last = 0;
      let next = SPILL_EVERY;
      let turn = 1;
      // Each frame's main-thread work (the round's step, the scene's sync and its draw call), for the perf script.
      const work: number[] = [];
      (window as unknown as { __frameWork: number[] }).__frameWork = work;
      const loop = (ts: number) => {
        raf = requestAnimationFrame(loop);
        const t0 = performance.now();
        const dt = last ? Math.max(0, Math.min(0.05, (ts - last) / 1000)) : 0;
        last = ts;
        // A slow circle round the harbour.
        const a = world.elapsed * 0.6;
        const input: Input = { x: Math.cos(a) * 0.35, z: Math.sin(a) * 0.35 };
        const events: WorldEvent[] = stepWorld(world, dt, input);
        if (world.elapsed >= next) {
          next += SPILL_EVERY;
          const ship = ships[turn++ % ships.length];
          // The view takes the ship again; the round itself already ate it.
          events.push({ type: 'eat', prop: ship, hole: 0, gained: 0 });
        }
        scene.sync(world, events, dt);
        scene.render();
        work.push(performance.now() - t0);
      };
      raf = requestAnimationFrame(loop);
      setReady(true);
    };

    void (PERF ? live() : still());
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      scene.dispose();
    };
  }, []);

  return (
    <div className="app gulp-root" style={{ maxWidth: 'none', padding: 0 }}>
      <div ref={mount} className="gulp-canvas" style={{ position: 'fixed', inset: 0 }} />
      {ready && <span data-testid="gulp-spill-ready" hidden />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Spill />);
