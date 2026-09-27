/**
 * The race screen: mounts the three.js scene, reads keyboard/pointer input,
 * and runs the animation loop. All race RULES (coins, scores, winner, what to
 * put on the wire) live in the pure `stepRace` in domain/race.ts — this file
 * only shuttles input in, frames out, and messages to the net layer.
 */
import { useEffect, useRef, useState } from 'react';
import { CoinIcon, StarIcon, WingIcon } from '@shared/ui/icons';
import { stepRace, takeWorldSnapshot, type RaceCore, type RemoteInput } from '../domain/race';
import type { FlightInput } from '../domain/flight';
import type { RacerLook, RacerScene } from '../three/scene';
import type { RacerNet } from '../net/useRacerNet';

/** The live race plus how to present it (faces and names per seat). */
export interface RaceCtx extends RaceCore {
  looks: RacerLook[];
  names: string[];
}

/**
 * What the scoreboard shows, copied out of the live race a few times a
 * second. The race itself lives in a ref and changes every frame; React
 * renders this snapshot instead, so a render never reads the live race.
 */
interface Hud {
  looks: RacerLook[];
  names: string[];
  myIndex: number;
  mode: RaceCtx['mode'];
  scores: number[];
  target: number;
  tier: number;
  /** Whole seconds of wings power-up left (0 when off). */
  wings: number;
  countdown: number;
  elapsed: number;
  racing: boolean;
}

function hudOf(c: RaceCtx): Hud {
  return {
    looks: c.looks,
    names: c.names,
    myIndex: c.myIndex,
    mode: c.mode,
    scores: [...c.scores],
    target: c.target,
    tier: c.karts[c.myIndex]?.tier ?? 0,
    wings: Math.ceil(c.karts[c.myIndex]?.wingTime ?? 0),
    countdown: c.countdown > 0 ? Math.ceil(c.countdown) : 0,
    elapsed: c.elapsed,
    racing: c.status === 'racing',
  };
}

export function Track3D({
  ctxRef,
  start,
  net,
  onOver,
}: {
  ctxRef: React.MutableRefObject<RaceCtx | null>;
  /** The race as it began — the scoreboard's first picture. */
  start: RaceCtx;
  net: RacerNet;
  onOver: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ active: boolean; nx: number; ny: number }>({ active: false, nx: 0, ny: 0 });
  const [hud, setHud] = useState<Hud>(() => hudOf(start));
  const onOverRef = useRef(onOver);
  useEffect(() => {
    onOverRef.current = onOver;
  }, [onOver]);

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
      const { coins, stars, outbound } = stepRace(c, dt, input, remote);

      if (c.mode === 'net') {
        // Tell my opponent where I am (~20/sec)…
        posBeat += t;
        if (posBeat > 0.05) {
          posBeat = 0;
          const me = c.karts[c.myIndex];
          net.sendPos({ x: me.x, y: me.y, z: me.z, heading: me.heading, speed: me.speed });
        }
        // …and, as host, broadcast whatever the simulation says changed.
        if (outbound) net.sendWorldDelta(outbound);
      }

      scene.sync({ karts: c.karts, coins, stars }, t);
      scene.render();

      hudBeat += t;
      // The countdown changes on the second; everything else can lag a tenth.
      if (hudBeat > 0.1 || c.countdown > 0 || c.status === 'over') {
        hudBeat = 0;
        setHud(hudOf(c));
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
      .then(async ({ RacerScene: Scene, loadRacerAssets }) => {
        // The racers' models first; the countdown only starts once the loop does.
        await loadRacerAssets();
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
    // Up the picture climbs, down it dives.
    const ny = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    pointerRef.current.nx = Math.max(-1, Math.min(1, nx));
    pointerRef.current.ny = Math.max(-1, Math.min(1, ny));
  };

  const showGo = hud.countdown === 0 && hud.elapsed < 0.8 && hud.racing;

  return (
    <div className="racer-stage">
      <div
        ref={mountRef}
        className="racer-canvas"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerCancel={onPointer}
        onPointerLeave={onPointer}
      />
      <div className="racer-hud">
        {hud.mode === 'net' && net.status !== 'connected' && net.status !== 'idle' && (
          <span className="racer-hud-conn">⚠️ {net.statusDetail ?? 'reconnecting…'}</span>
        )}
        {hud.looks.map((look, i) => (
          <span
            key={i}
            className={`racer-score ${i === hud.myIndex ? 'me' : ''}`}
            style={{ borderColor: `#${look.color.toString(16).padStart(6, '0')}` }}
            data-testid={`racer-score-${i}`}
          >
            <img className="racer-score-face" src={look.portrait} alt="" />
            <span className="racer-score-name">{i === hud.myIndex ? 'You' : hud.names[i]}</span>
            <CoinIcon size={16} /> <b>{hud.scores[i]}</b>
            <span className="racer-score-target">/{hud.target}</span>
          </span>
        ))}
        {hud.tier > 0 && (
          <span className="racer-power" data-testid="racer-power" aria-label={`Star power ${hud.tier} of 3`}>
            {Array.from({ length: hud.tier }, (_, i) => (
              <StarIcon key={i} size={16} />
            ))}
          </span>
        )}
        {hud.wings > 0 && (
          <span className="racer-power racer-wings" data-testid="racer-wings" aria-label={`Big wings for ${hud.wings} more seconds`}>
            <WingIcon size={18} /> {hud.wings}
          </span>
        )}
        <span className="racer-hud-time">{hud.elapsed.toFixed(1)}s</span>
      </div>
      {hud.countdown > 0 && (
        <div className="racer-countdown" data-testid="racer-countdown" aria-live="assertive">
          {hud.countdown}
        </div>
      )}
      {showGo && (
        <div className="racer-countdown go" aria-live="assertive">
          Go!
        </div>
      )}
      {/* Fades once the racer has had a few seconds to get their bearings —
          driven by `hud.elapsed`, already sampled a few times a second above,
          rather than a timer of its own. */}
      <p className={`racer-hint${hud.racing && hud.elapsed > 4.5 ? ' racer-hint-faded' : ''}`}>
        Touch left/right to turn · high to climb · low to dive · Keys: ←→ turn, ↑↓ climb/dive
      </p>
    </div>
  );
}

// ─── input ───

const STEER_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

/** Touch near the middle of the picture does nothing up or down, so a thumb
 * resting there only steers. */
const LIFT_DEAD_ZONE = 0.25;

function readInput(keys: Set<string>, pointer: { active: boolean; nx: number; ny: number }): FlightInput {
  let steer = 0;
  if (keys.has('arrowleft') || keys.has('a')) steer -= 1;
  if (keys.has('arrowright') || keys.has('d')) steer += 1;
  let lift = 0;
  if (keys.has('arrowup') || keys.has('w')) lift += 1;
  if (keys.has('arrowdown') || keys.has('s')) lift -= 1;
  if (pointer.active) {
    if (steer === 0) steer = pointer.nx;
    if (lift === 0 && Math.abs(pointer.ny) > LIFT_DEAD_ZONE) {
      lift = (pointer.ny - Math.sign(pointer.ny) * LIFT_DEAD_ZONE) / (1 - LIFT_DEAD_ZONE);
    }
  }
  return { steer, lift };
}
