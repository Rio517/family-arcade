/**
 * The 3D stage: builds the scene for a world, runs the frame loop, and turns
 * the child's hands into a direction.
 *
 * Mouse: point where to go, from the middle of the screen. Touch: drag
 * anywhere and a joystick appears under the finger. Keys: arrows or WASD.
 * The world lives in a ref and changes every frame; the page gets what
 * happened through `onFrame` and renders its own snapshot.
 *
 * On the development server only, Explore (the chip, or the ` key) pauses
 * the round and frees the camera to look round the whole city: drag to
 * move, scroll or pinch to zoom, arrows to slide.
 */
import { useEffect, useRef, useState } from 'react';
import { stepWorld, type Input, type World, type WorldEvent } from '../domain/world';
import type { GulpScene, HoleLook } from '../three/scene';
import { loadScene, type SceneLoader } from './round';
import { HOLD_60_GAP, PACING_SAMPLE, shouldHold60 } from './pacing';

const KEYS: Record<string, [number, number]> = {
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1],
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
};
/** How far a finger drags for full speed, in pixels. */
const STICK = 56;

interface Pointer {
  kind: 'mouse' | 'touch' | null;
  /** Mouse: offset from the middle of the stage. Touch: offset from where the finger went down. */
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  scale: number;
}

export function GulpStage({
  world,
  looks,
  follow,
  playing,
  pausedRef,
  onFrame,
  load = loadScene,
}: {
  /** One world per mount: the page gives each round a fresh key. */
  world: World;
  looks: HoleLook[];
  follow: number;
  /** False in the menu's attract mode: nothing to steer. */
  playing: boolean;
  pausedRef: React.MutableRefObject<boolean>;
  onFrame: (events: WorldEvent[], dt: number) => void;
  load?: SceneLoader;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef(new Set<string>());
  const pointerRef = useRef<Pointer>({ kind: null, dx: 0, dy: 0, ox: 0, oy: 0, scale: 1 });
  const onFrameRef = useRef(onFrame);
  const [stick, setStick] = useState<{ x: number; y: number; kx: number; ky: number } | null>(null);
  const [failed, setFailed] = useState(false);
  /** Until the city's first frame is drawn, a loading card covers the stage. */
  const [building, setBuilding] = useState(true);
  /** Looking round the city (development only): the round waits, the camera is free. */
  const [exploring, setExploring] = useState(false);
  const exploreRef = useRef(false);
  /** Fingers (or the mouse button) down while exploring, for dragging and pinching. */
  const dragRef = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const sceneRef = useRef<GulpScene | null>(null);

  const setExplore = (on: boolean) => {
    exploreRef.current = on;
    setExploring(on);
    keysRef.current.clear();
    pointerRef.current.kind = null;
    dragRef.current.clear();
    setStick(null);
    sceneRef.current?.explore(on, world.holes[follow]);
  };

  // Explore's key: ` to go in and out, Escape to leave (development only).
  useEffect(() => {
    if (!import.meta.env.DEV || !playing) return;
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || (e.key === 'Escape' && exploreRef.current)) {
        e.preventDefault();
        setExplore(!exploreRef.current && e.key !== 'Escape');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Zoom: the mouse wheel, or the plus and minus keys.
  useEffect(() => {
    if (!playing) return;
    const mount = mountRef.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      sceneRef.current?.zoomBy(Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 0.5));
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') sceneRef.current?.zoomBy(-1);
      if (e.key === '-' || e.key === '_') sceneRef.current?.zoomBy(1);
    };
    mount?.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      mount?.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (KEYS[k]) {
        e.preventDefault();
        keysRef.current.add(k);
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    const blur = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [playing]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let scene: GulpScene | undefined;
    let gone = false;
    let raf = 0;
    let last = 0;
    let lastBeat = 0;
    const gaps: number[] = [];
    let hold60 = false;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!scene) return;
      // Watch the screen's rhythm until it is clear whether to hold to 60 (see pacing.ts).
      if (lastBeat && !hold60 && gaps.length < PACING_SAMPLE) {
        gaps.push(ts - lastBeat);
        hold60 = shouldHold60(gaps);
      }
      lastBeat = ts;
      if (hold60 && last && ts - last < HOLD_60_GAP) return;
      // Never backwards, never a huge jump (after a hidden tab): 0 to 50 ms.
      const dt = last ? Math.max(0, Math.min(0.05, (ts - last) / 1000)) : 0;
      last = ts;
      let events: WorldEvent[] = [];
      if (exploreRef.current) {
        // The arrows slide the free camera; the round waits.
        const { x, z } = readInput(keysRef.current, { kind: null, dx: 0, dy: 0, ox: 0, oy: 0, scale: 1 });
        if (x || z) scene.pan(-x * 900 * dt, -z * 900 * dt);
      } else if (!pausedRef.current) events = stepWorld(world, dt, playing ? readInput(keysRef.current, pointerRef.current) : null);
      scene.sync(world, events, pausedRef.current ? 0 : dt);
      scene.render();
      if (!drawn) {
        drawn = true;
        setBuilding(false);
      }
      onFrameRef.current(events, dt);
    };
    let drawn = false;

    // Building a city takes the main thread for a moment: let the loading
    // card paint first, so the screen says what is happening.
    const painted = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

    Promise.all([load(), painted()])
      .then(([{ GulpScene: Scene }]) => {
        if (gone) return;
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          scene = new Scene(mount, world, looks, follow, reduced, !playing);
          sceneRef.current = scene;
          // Development only, for browser checks; stripped from the build.
          if (import.meta.env.DEV) (window as unknown as { __gulpScene?: GulpScene }).__gulpScene = scene;
        } catch (err) {
          console.error(err);
          setFailed(true);
          return;
        }
        raf = requestAnimationFrame(loop);
      })
      .catch((err) => {
        // A failed chunk load (flaky wifi before the app is cached) must not
        // leave a blank stage.
        console.error(err);
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      scene?.dispose();
    };
    // One scene per world: the page remounts the stage for a new round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playing) return;
    if (exploreRef.current) {
      onExplorePointer(e);
      return;
    }
    const p = pointerRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.pointerType === 'mouse') {
      if (e.type === 'pointerleave') {
        p.kind = null;
        return;
      }
      p.kind = 'mouse';
      p.dx = e.clientX - (rect.left + rect.width / 2);
      p.dy = e.clientY - (rect.top + rect.height / 2);
      p.scale = Math.max(80, Math.min(rect.width, rect.height) * 0.22);
      return;
    }
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      p.kind = 'touch';
      p.ox = e.clientX;
      p.oy = e.clientY;
      p.dx = p.dy = 0;
      p.scale = STICK;
      setStick({ x: e.clientX - rect.left, y: e.clientY - rect.top, kx: 0, ky: 0 });
      return;
    }
    if (p.kind !== 'touch') return;
    if (e.type === 'pointerup' || e.type === 'pointercancel') {
      p.kind = null;
      setStick(null);
      return;
    }
    p.dx = e.clientX - p.ox;
    p.dy = e.clientY - p.oy;
    const len = Math.hypot(p.dx, p.dy);
    const k = len > STICK ? STICK / len : 1;
    setStick((s) => (s ? { ...s, kx: p.dx * k, ky: p.dy * k } : s));
  };

  /** Exploring: one finger (or the mouse, button down) drags the city along; two pinch to zoom. */
  const onExplorePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = dragRef.current;
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (e.type !== 'pointermove') {
      down.delete(e.pointerId);
      return;
    }
    const was = down.get(e.pointerId);
    if (!was) return;
    const scene = sceneRef.current;
    if (down.size === 1) scene?.pan(e.clientX - was.x, e.clientY - was.y);
    else {
      const other = [...down].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(was.x - other.x, was.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (before > 1 && after > 1) scene?.zoomBy(Math.log(before / after) / Math.log(1.15));
      }
    }
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      ref={mountRef}
      className="gulp-canvas"
      data-testid="gulp-stage"
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      onPointerUp={onPointer}
      onPointerCancel={onPointer}
      onPointerLeave={onPointer}
    >
      {failed && (
        <p className="gulp-fallback" data-testid="gulp3d-fallback">
          Sorry, this device can’t show the 3D city.
        </p>
      )}
      {building && !failed && (
        <div className="gulp-loading" role="status" data-testid="gulp-loading">
          <span className="gulp-loading-hole" aria-hidden="true" />
          <span>Building the city…</span>
        </div>
      )}
      {import.meta.env.DEV && playing && !building && (
        <button
          type="button"
          className={`gulp-explore${exploring ? ' on' : ''}`}
          data-testid="gulp-explore"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setExplore(!exploring)}
        >
          {exploring ? 'Back to the game' : 'Explore'}
        </button>
      )}
      {exploring && (
        <p className="gulp-explore-hint" data-testid="gulp-explore-hint">
          Exploring: drag to move, scroll or pinch to zoom
        </p>
      )}
      {stick && (
        <div className="gulp-stick" style={{ left: stick.x, top: stick.y }} aria-hidden="true">
          <div className="gulp-stick-knob" style={{ transform: `translate(${stick.kx}px, ${stick.ky}px)` }} />
        </div>
      )}
    </div>
  );
}

/** Keys win over the pointer; both give a direction on the ground, 0..1 strong. */
function readInput(keys: Set<string>, p: Pointer): Input {
  let x = 0;
  let z = 0;
  for (const k of keys) {
    const d = KEYS[k];
    if (d) {
      x += d[0];
      z += d[1];
    }
  }
  if (x || z) return { x, z };
  if (!p.kind) return { x: 0, z: 0 };
  // Screen right is east (+x), screen down is toward the camera (+z).
  const len = Math.hypot(p.dx, p.dy);
  const strength = Math.min(1, len / p.scale);
  // A small dead zone, so a resting finger or mouse stays put.
  if (strength < 0.12) return { x: 0, z: 0 };
  return { x: (p.dx / len) * strength, z: (p.dy / len) * strength };
}
