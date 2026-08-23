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
  sync(state: NavalState, events: readonly NavalEvent[]): void;
  render(frameSeconds: number): void;
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
  sceneFactory?: NavalSceneFactory | null;
  reducedMotion?: boolean;
  initialTier?: QualityTier;
  onRestart(): void;
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

export function NavalViewport({
  state,
  events,
  sceneFactory = createProductionScene,
  reducedMotion = prefersReducedMotion(),
  initialTier = 'high',
  onRestart,
}: NavalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<NavalSceneAdapter | null>(null);
  const latestRef = useRef({ state, events });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(sceneFactory ? 'loading' : 'failed');

  useEffect(() => {
    latestRef.current = { state, events };
    sceneRef.current?.sync(state, events);
  }, [events, state]);

  useEffect(() => {
    if (!sceneFactory || !containerRef.current) return;

    let active = true;
    let frameHandle: number | null = null;
    let lastFrameMilliseconds: number | null = null;
    let scene: NavalSceneAdapter | null = null;

    const fail = () => {
      if (!active) return;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      frameHandle = null;
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
      setStatus('failed');
    };

    const frame = (timeMilliseconds: number) => {
      if (!active || !scene) return;
      const frameSeconds = lastFrameMilliseconds === null
        ? 0
        : Math.min(0.1, Math.max(0, (timeMilliseconds - lastFrameMilliseconds) / 1_000));
      lastFrameMilliseconds = timeMilliseconds;
      try {
        scene.render(frameSeconds);
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
        created.sync(latest.state, latest.events);
        setStatus('ready');
        frameHandle = requestAnimationFrame(frame);
      },
      fail,
    );

    return () => {
      active = false;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      frameHandle = null;
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
    };
  }, [attempt, initialTier, reducedMotion, sceneFactory]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  if (!sceneFactory || status === 'failed') {
    return (
      <div className="naval-viewport-fallback">
        <HtmlTacticalChart state={state} unavailable />
        {sceneFactory && (
          <div className="naval-viewport-fallback__actions" aria-label="3D sea recovery">
            <button
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
    <div className="naval-scene-frame">
      <div ref={containerRef} className="naval-scene-slot" data-testid="naval-scene-slot" />
      {status === 'loading' && (
        <div className="naval-scene-loading" role="status">Preparing tactical sea…</div>
      )}
    </div>
  );
}
