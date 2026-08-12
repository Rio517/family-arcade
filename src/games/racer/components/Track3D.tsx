/**
 * The race screen: mounts the three.js scene, reads keyboard/pointer input,
 * and runs the animation loop. All race RULES (coins, scores, winner, what to
 * put on the wire) live in the pure `stepRace` in domain/race.ts — this file
 * only shuttles input in, frames out, and messages to the net layer.
 */
import { useEffect, useRef, useState } from 'react';
import { CoinIcon } from '@shared/ui/icons';
import { stepRace, takeWorldSnapshot, type RaceCore, type RemoteInput } from '../domain/race';
import type { KartInput } from '../domain/kart';
import type { RacerLook, RacerScene } from '../three/scene';
import type { RacerNet } from '../net/useRacerNet';

/** The live race plus how to present it (faces and names per seat). */
export interface RaceCtx extends RaceCore {
  looks: RacerLook[];
  names: string[];
}

export function Track3D({
  ctxRef,
  net,
  onOver,
}: {
  ctxRef: React.MutableRefObject<RaceCtx | null>;
  net: RacerNet;
  onOver: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ active: boolean; nx: number }>({ active: false, nx: 0 });
  const [, setHud] = useState(0);
  const onOverRef = useRef(onOver);
  onOverRef.current = onOver;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (STEER_KEYS.has(k)) e.preventDefault();
      keysRef.current.add(k);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const ctx = ctxRef.current;
    if (!mount || !ctx) return;
    let scene: RacerScene | undefined;
    let gone = false;

    // The host opens every race by sending the full coin field once; from
    // here on only deltas travel (see domain/race.ts and useRacerNet).
    if (ctx.mode === 'net' && ctx.field) {
      const snap = takeWorldSnapshot(ctx);
      if (snap) net.sendWorld(snap);
    }

    let raf = 0;
    let last = 0;
    let overFired = false;
    let hudBeat = 0;
    let posBeat = 0;

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const c = ctxRef.current;
      if (!c || !scene) return;
      // Once the win overlay is up there's nothing to simulate or send —
      // don't keep burning GPU behind a static screen.
      if (c.status === 'over' && overFired) return;
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      const t = Math.max(0, Math.min(dt, 0.05));

      const input = readInput(keysRef.current, pointerRef.current);
      const remote: RemoteInput | null =
        c.mode === 'net' ? { pos: net.remotePosRef.current, world: net.remoteWorldRef.current } : null;
      const { coins, outbound } = stepRace(c, dt, input, remote);

      if (c.mode === 'net') {
        // Tell my opponent where I am (~20/sec)…
        posBeat += t;
        if (posBeat > 0.05) {
          posBeat = 0;
          const me = c.karts[c.myIndex];
          net.sendPos({ x: me.x, z: me.z, heading: me.heading, speed: me.speed });
        }
        // …and, as host, broadcast whatever the simulation says changed.
        if (outbound) net.sendWorldDelta(outbound);
      }

      scene.sync({ karts: c.karts, coins }, t);
      scene.render();

      hudBeat += t;
      if (hudBeat > 0.1) {
        hudBeat = 0;
        setHud((h) => (h + 1) % 1_000_000);
      }
      if (c.status === 'over' && !overFired) {
        overFired = true;
        onOverRef.current();
      }
    };
    const showFallback = (err: unknown) => {
      const p = document.createElement('p');
      p.dataset.testid = 'racer3d-fallback';
      p.style.cssText = 'padding:24px;text-align:center;color:#fff';
      p.textContent = 'Sorry, this device can’t show 3D. 😢';
      mount.replaceChildren(p);
      console.error(err);
    };
    // three.js loads on demand, same as chess and battleship — visiting the
    // arcade menu (or racing later) must not front-load the 3D library.
    import('../three/scene')
      .then(({ RacerScene: Scene }) => {
        if (gone) return;
        const reducedMotion =
          typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          scene = new Scene(mount, ctx.looks, ctx.myIndex, reducedMotion);
        } catch (err) {
          showFallback(err);
          return;
        }
        raf = requestAnimationFrame(loop);
      })
      .catch((err) => {
        // A failed chunk load (first visit on flaky wifi, before the service
        // worker finishes precaching) must not leave a silently blank stage —
        // this was the app's one unhandled promise rejection.
        if (!gone) showFallback(err);
      });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      scene?.dispose();
    };
    // Build the scene exactly once per race (Track3D is given a per-race key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerup' || e.type === 'pointercancel' || e.type === 'pointerleave') {
      pointerRef.current.active = false;
      return;
    }
    if (e.type === 'pointerdown') pointerRef.current.active = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerRef.current.nx = Math.max(-1, Math.min(1, nx));
  };

  const c = ctxRef.current;

  return (
    <div className="racer-stage">
      {c && (
        <div className="racer-hud">
          {c.mode === 'net' && net.status !== 'connected' && net.status !== 'idle' && (
            <span className="racer-hud-conn">⚠️ {net.statusDetail ?? 'reconnecting…'}</span>
          )}
          {c.looks.map((look, i) => (
            <span key={i} className={`racer-score ${i === c.myIndex ? 'me' : ''}`}>
              <span className="racer-score-face">{look.emoji}</span>
              <CoinIcon size={18} /> <b>{c.scores[i]}</b>
              <span className="racer-score-target">/{c.target}</span>
            </span>
          ))}
          <span className="racer-hud-time">⏱ {c.elapsed.toFixed(1)}s</span>
        </div>
      )}
      <div
        ref={mountRef}
        className="racer-canvas"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerCancel={onPointer}
        onPointerLeave={onPointer}
      />
      <p className="racer-hint">
        Steer with the left and right arrows, hold up to zoom, or drag left and right on the picture.
      </p>
    </div>
  );
}

// ─── input ───

const STEER_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

function readInput(keys: Set<string>, pointer: { active: boolean; nx: number }): KartInput {
  let steer = 0;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  const boostKey = keys.has('arrowup') || keys.has('w');
  const brake = keys.has('arrowdown') || keys.has('s');
  if (pointer.active && steer === 0) steer = pointer.nx;
  return { steer, boost: boostKey || pointer.active, brake };
}
