import { useCallback, useEffect, useRef, useState } from 'react';

import type { NavalEvent, NavalState } from '../../domain/naval/types';
import type { QualityTier } from '../../three/naval/quality';
import { HtmlTacticalChart } from './HtmlTacticalChart';

export interface NavalSceneMetrics {
  fps: number;
  dpr: number;
  tier: QualityTier;
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  materials: number;
  activeEffects: number;
  effectCapacity: number;
}

export interface NavalSceneAdapter {
  sync(state: NavalState, eventDeltas: readonly NavalEvent[]): void;
  render(animationSeconds: number, wallSeconds?: number): void;
  metrics(): NavalSceneMetrics;
  dispose(): void;
}

export interface NavalSceneOptions {
  reducedMotion: boolean;
  initialTier: QualityTier;
}

export type NavalSceneFactory = (
  container: HTMLElement,
  options: NavalSceneOptions,
) => Promise<NavalSceneAdapter>;

export interface NavalViewportProps {
  state: NavalState;
  events: readonly NavalEvent[];
  battleGeneration?: number;
  sceneFactory?: NavalSceneFactory | null;
  reducedMotion?: boolean;
  initialTier?: QualityTier;
  onRestart(): void;
}

interface EventCursor {
  generation: number;
  lastEventId: number;
}

async function createProductionScene(
  container: HTMLElement,
  options: NavalSceneOptions,
): Promise<NavalSceneAdapter> {
  const { NavalScene } = await import('../../three/naval/NavalScene');
  return NavalScene.create(container, options);
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function newestEventId(events: readonly NavalEvent[]): number {
  let newest = 0;
  for (const event of events) newest = Math.max(newest, event.id);
  return newest;
}

function consumeEventDeltas(
  cursor: EventCursor,
  generation: number,
  events: readonly NavalEvent[],
): NavalEvent[] {
  if (cursor.generation !== generation) {
    cursor.generation = generation;
    cursor.lastEventId = 0;
  }
  const deltas = events.filter((event) => event.id > cursor.lastEventId);
  cursor.lastEventId = Math.max(cursor.lastEventId, newestEventId(events));
  return deltas;
}

export function NavalViewport({
  state,
  events,
  battleGeneration = 0,
  sceneFactory = createProductionScene,
  reducedMotion = prefersReducedMotion(),
  initialTier = 'high',
  onRestart,
}: NavalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyFrameRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<NavalSceneAdapter | null>(null);
  const failRef = useRef<(() => void) | null>(null);
  const deliveryRef = useRef<EventCursor>({ generation: battleGeneration, lastEventId: 0 });
  const latestRef = useRef({ state, events, battleGeneration });
  const recoveringRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(sceneFactory ? 'loading' : 'failed');

  useEffect(() => {
    latestRef.current = { state, events, battleGeneration };
    const scene = sceneRef.current;
    if (!scene) return;
    try {
      scene.sync(state, consumeEventDeltas(deliveryRef.current, battleGeneration, events));
    } catch {
      failRef.current?.();
    }
  }, [battleGeneration, events, state]);

  useEffect(() => {
    if (!sceneFactory || !containerRef.current) return;

    let active = true;
    let failed = false;
    let frameHandle: number | null = null;
    let lastFrameMilliseconds: number | null = null;
    let renderedFrames = 0;
    let scene: NavalSceneAdapter | null = null;

    const disposeScene = () => {
      const owned = scene;
      scene = null;
      if (sceneRef.current === owned) sceneRef.current = null;
      owned?.dispose();
    };

    const fail = () => {
      if (!active || failed) return;
      failed = true;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      frameHandle = null;
      disposeScene();
      setStatus('failed');
    };
    failRef.current = fail;

    const frame = (timeMilliseconds: number) => {
      if (!active || failed || !scene) return;
      const wallSeconds = lastFrameMilliseconds === null
        ? 0
        : Math.max(0, (timeMilliseconds - lastFrameMilliseconds) / 1_000);
      const animationSeconds = Math.min(0.1, wallSeconds);
      lastFrameMilliseconds = timeMilliseconds;
      try {
        scene.render(animationSeconds, wallSeconds);
        if (renderedFrames % 60 === 0 && readyFrameRef.current) {
          const metrics = scene.metrics();
          const dataset = readyFrameRef.current.dataset;
          dataset.sceneFps = String(metrics.fps);
          dataset.sceneDpr = String(metrics.dpr);
          dataset.sceneTier = metrics.tier;
          dataset.sceneDrawCalls = String(metrics.drawCalls);
          dataset.sceneTriangles = String(metrics.triangles);
          dataset.sceneActiveEffects = String(metrics.activeEffects);
          dataset.sceneEffectCapacity = String(metrics.effectCapacity);
        }
        renderedFrames += 1;
        frameHandle = requestAnimationFrame(frame);
      } catch {
        fail();
      }
    };

    void sceneFactory(containerRef.current, { reducedMotion, initialTier }).then(
      (created) => {
        if (!active) {
          created.dispose();
          return;
        }
        scene = created;
        sceneRef.current = created;
        const latest = latestRef.current;
        deliveryRef.current = {
          generation: latest.battleGeneration,
          lastEventId: newestEventId(latest.events),
        };
        try {
          created.sync(latest.state, []);
        } catch {
          fail();
          return;
        }
        setStatus('ready');
        frameHandle = requestAnimationFrame(frame);
      },
      fail,
    );

    return () => {
      active = false;
      if (failRef.current === fail) failRef.current = null;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      frameHandle = null;
      disposeScene();
    };
  }, [attempt, initialTier, reducedMotion, sceneFactory]);

  useEffect(() => {
    if (status === 'failed' && sceneFactory) retryRef.current?.focus();
    if (status === 'ready' && recoveringRef.current) {
      recoveringRef.current = false;
      readyFrameRef.current?.focus();
    }
  }, [sceneFactory, status]);

  const retry = useCallback(() => {
    recoveringRef.current = true;
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  if (!sceneFactory || status === 'failed') {
    return (
      <div className="naval-viewport-fallback">
        {sceneFactory && <p className="naval-visually-hidden" role="alert">3D sea unavailable. Tactical chart active.</p>}
        <HtmlTacticalChart state={state} unavailable />
        {sceneFactory && (
          <div className="naval-viewport-fallback__actions" aria-label="3D sea recovery">
            <button
              ref={retryRef}
              type="button"
              className="naval-control naval-hit-target"
              data-testid="naval-scene-retry"
              onClick={retry}
            >Retry 3D sea</button>
            <button
              type="button"
              className="naval-control naval-hit-target"
              data-testid="naval-scene-restart"
              onClick={onRestart}
            >Restart duel</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={readyFrameRef}
      className="naval-scene-frame"
      data-testid="naval-scene-frame"
      aria-label="3D tactical sea"
      tabIndex={-1}
    >
      <div ref={containerRef} className="naval-scene-slot" data-testid="naval-scene-slot" />
      {status === 'loading' && (
        <div className="naval-scene-loading" role="status">Preparing tactical sea…</div>
      )}
      {status === 'ready' && (
        <p className="naval-visually-hidden" role="status">3D tactical sea restored.</p>
      )}
    </div>
  );
}
