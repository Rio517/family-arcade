/**
 * The 3D stage: builds the scene for a world, runs the frame loop, and turns
 * the child's hands into a direction.
 *
 * Mouse: point where to go, from the middle of the screen. Touch: drag
 * anywhere and a joystick appears under the finger. Keys: arrows or WASD.
 * The world lives in a ref and changes every frame; the page gets what
 * happened through `onFrame` and renders its own snapshot.
 */
import { useEffect, useRef, useState } from 'react';
import { stepWorld, type Input, type World, type WorldEvent } from '../domain/world';
import type { GulpScene, HoleLook } from '../three/scene';
import { loadScene, type SceneLoader } from './round';

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

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

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

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!scene) return;
      // Never backwards, never a huge jump (after a hidden tab): 0 to 50 ms.
      const dt = last ? Math.max(0, Math.min(0.05, (ts - last) / 1000)) : 0;
      last = ts;
      let events: WorldEvent[] = [];
      if (!pausedRef.current) events = stepWorld(world, dt, playing ? readInput(keysRef.current, pointerRef.current) : null);
      scene.sync(world, events, pausedRef.current ? 0 : dt);
      scene.render();
      onFrameRef.current(events, dt);
    };

    load()
      .then(({ GulpScene: Scene }) => {
        if (gone) return;
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          scene = new Scene(mount, world, looks, follow, reduced);
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
