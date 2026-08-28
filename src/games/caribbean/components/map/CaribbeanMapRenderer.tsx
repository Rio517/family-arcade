import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Layer,
  Map,
  Marker,
  Source,
  type MapRef,
  type MarkerInstance,
  type MarkerProps,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import { RED_JACKDAW_VOYAGE } from '../../content/voyage';
import '../../styles/map.css';
import {
  CARIBBEAN_MAP_POINTS,
  CARIBBEAN_MAP_PRESETS,
  CARIBBEAN_MAX_BOUNDS,
  CARIBBEAN_PLACE_POINTS,
  CARIBBEAN_PLAYER_POINTS,
  CARIBBEAN_ROUTE,
} from './caribbeanMapData';
import { CARIBBEAN_MAP_STYLE } from './caribbeanMapStyle';
import type { CaribbeanMapProps } from './CaribbeanMap';
import './maplibreRuntime';

const INITIAL_LOAD_TIMEOUT_MS = 12_000;

function ChartMarker({
  kind,
  label,
  shortLabel,
}: {
  kind: 'port' | 'place' | 'player' | 'contact';
  label: string;
  shortLabel?: string;
}) {
  return (
    <div className={`caribbean-map__marker caribbean-map__marker--${kind}`} data-map-marker={kind}>
      <span className="caribbean-map__marker-pin" aria-hidden="true" />
      <span className="caribbean-map__marker-label">
        <strong>{label}</strong>
        {shortLabel && <small>{shortLabel}</small>}
      </span>
    </div>
  );
}

function NamedMarker({ label, children, ...props }: MarkerProps & { label: string }) {
  const markerRef = useRef<MarkerInstance>(null);

  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element) return;
    element.setAttribute('aria-label', label);
    element.setAttribute('role', 'img');
    element.removeAttribute('tabindex');
  }, [label]);

  return <Marker ref={markerRef} {...props}>{children}</Marker>;
}

export function CaribbeanMapRenderer({ context, playerName, contactVisible, statusLabel }: CaribbeanMapProps) {
  const mapRef = useRef<MapRef>(null);
  const loadedRef = useRef(false);
  const styleLoadedRef = useRef(false);
  const providerMetadataRef = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [renderIdle, setRenderIdle] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const instructionsId = useId();
  const preset = CARIBBEAN_MAP_PRESETS[context];

  useEffect(() => {
    if (phase !== 'loading') return undefined;
    const timeout = window.setTimeout(() => {
      if (!loadedRef.current) setPhase('unavailable');
    }, INITIAL_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [phase, retryKey]);

  const resetView = useCallback(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    mapRef.current?.flyTo({
      center: [preset.longitude, preset.latitude],
      zoom: preset.zoom,
      bearing: 0,
      pitch: 0,
      duration: reduceMotion ? 0 : 550,
    });
  }, [preset.latitude, preset.longitude, preset.zoom]);

  useEffect(() => {
    if (phase === 'unavailable') return undefined;
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Home') return;
      event.preventDefault();
      resetView();
    };
    canvas.setAttribute('aria-describedby', instructionsId);
    canvas.addEventListener('keydown', handleKeyDown);
    return () => {
      canvas.removeEventListener('keydown', handleKeyDown);
      if (canvas.getAttribute('aria-describedby') === instructionsId) {
        canvas.removeAttribute('aria-describedby');
      }
    };
  }, [instructionsId, phase, resetView, retryKey]);

  const retry = () => {
    loadedRef.current = false;
    styleLoadedRef.current = false;
    providerMetadataRef.current = false;
    setFailureReason(null);
    setRenderIdle(false);
    setRetryKey((current) => current + 1);
    setPhase('loading');
  };

  return (
    <section
      className={`caribbean-map caribbean-map--maplibre caribbean-map--${context}`}
      aria-label="Caribbean nautical chart"
      data-map-context={context}
      data-map-phase={phase}
      data-map-render-state={phase === 'loading' ? 'loading' : renderIdle ? 'idle' : 'settling'}
      data-map-route={contactVisible ? 'red-jackdaw' : undefined}
      data-map-failure={phase === 'unavailable' ? failureReason ?? 'initial-load-timeout' : undefined}
    >
      <header className="caribbean-map__masthead">
        <p><span>Admiralty chart</span><strong>Lesser Antilles</strong></p>
        {phase !== 'unavailable' && (
          <div className="caribbean-map__controls" role="group" aria-label="Map view controls">
            <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button>
            <button type="button" aria-label="Reset map view" onClick={resetView}>⌖</button>
            <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button>
          </div>
        )}
      </header>

      <div
        className="caribbean-map__frame"
        data-testid="caribbean-map-frame"
      >
        <p id={instructionsId} className="caribbean-map__instructions">Press Home to reset the chart view.</p>
        <span className="caribbean-map__corner caribbean-map__corner--nw" aria-hidden="true" />
        <span className="caribbean-map__corner caribbean-map__corner--ne" aria-hidden="true" />
        <span className="caribbean-map__corner caribbean-map__corner--sw" aria-hidden="true" />
        <span className="caribbean-map__corner caribbean-map__corner--se" aria-hidden="true" />

        {phase !== 'unavailable' ? (
          <Map
            key={retryKey}
            ref={mapRef}
            initialViewState={preset}
            mapStyle={CARIBBEAN_MAP_STYLE}
            maxBounds={CARIBBEAN_MAX_BOUNDS}
            minZoom={3.75}
            maxZoom={9}
            attributionControl={{ compact: true }}
            cooperativeGestures
            dragRotate={false}
            touchPitch={false}
            renderWorldCopies={false}
            fadeDuration={0}
            onLoad={() => {
              styleLoadedRef.current = true;
            }}
            onSourceData={(event) => {
              if (event.sourceId !== 'openmaptiles') return;
              if (event.sourceDataType === 'metadata') providerMetadataRef.current = true;
            }}
            onIdle={() => {
              if (!styleLoadedRef.current || !providerMetadataRef.current) return;
              const provider = mapRef.current?.getMap();
              const hasRealGeography = provider !== undefined && [
                'landcover', 'water', 'waterway', 'boundary', 'transportation', 'place',
              ].some((sourceLayer) => provider.querySourceFeatures('openmaptiles', { sourceLayer }).length > 0);
              if (!hasRealGeography) return;
              loadedRef.current = true;
              setPhase('ready');
              setRenderIdle(true);
            }}
            onError={(event) => {
              if (loadedRef.current) return;
              setFailureReason(event.error?.message ?? 'maplibre-load-error');
              if (!providerMetadataRef.current) {
                setPhase('unavailable');
              }
            }}
          >
            {contactVisible && (
              <Source id="red-jackdaw-route" type="geojson" data={CARIBBEAN_ROUTE}>
                <Layer
                  id="red-jackdaw-route-shadow"
                  type="line"
                  paint={{
                    'line-color': '#2a2016',
                    'line-width': 5.5,
                    'line-opacity': 0.55,
                  }}
                />
                <Layer
                  id="red-jackdaw-route"
                  type="line"
                  paint={{
                    'line-color': '#d7b15f',
                    'line-width': 2.2,
                    'line-dasharray': [2, 2.8],
                  }}
                />
              </Source>
            )}

            {CARIBBEAN_PLACE_POINTS.map((point) => (
              <NamedMarker
                key={point.name}
                label={point.name}
                longitude={point.coordinates[0]}
                latitude={point.coordinates[1]}
                anchor="left"
              >
                <ChartMarker kind="place" label={point.name} />
              </NamedMarker>
            ))}
            <NamedMarker
              label="Bridgetown, Barbados"
              longitude={CARIBBEAN_MAP_POINTS.bridgetown.coordinates[0]}
              latitude={CARIBBEAN_MAP_POINTS.bridgetown.coordinates[1]}
              anchor="bottom-left"
            >
              <ChartMarker kind="port" label="Bridgetown" shortLabel="Barbados" />
            </NamedMarker>
            <NamedMarker
              label={playerName}
              longitude={CARIBBEAN_PLAYER_POINTS[context][0]}
              latitude={CARIBBEAN_PLAYER_POINTS[context][1]}
              anchor="top-right"
            >
              <ChartMarker kind="player" label={playerName} />
            </NamedMarker>
            {contactVisible && (
              <NamedMarker
                label="Red Jackdaw contact"
                longitude={CARIBBEAN_MAP_POINTS.redJackdaw.coordinates[0]}
                latitude={CARIBBEAN_MAP_POINTS.redJackdaw.coordinates[1]}
                anchor="bottom-right"
              >
                <ChartMarker kind="contact" label="Red Jackdaw" />
              </NamedMarker>
            )}
          </Map>
        ) : (
          <div className="caribbean-map__unavailable" role="status">
            <span className="caribbean-map__signal-mark" aria-hidden="true"><i /><i /><i /></span>
            <p>Chart signal lost</p>
            <h2>Caribbean chart needs a network connection.</h2>
            <span>Real geography could not be loaded. No substitute chart has been drawn.</span>
            <button type="button" onClick={retry}>Retry chart</button>
          </div>
        )}

        {phase === 'loading' && (
          <div className="caribbean-map__loading" role="status">
            <span aria-hidden="true" />
            <p>Sounding chart waters…</p>
          </div>
        )}
        {phase !== 'unavailable' && <div className="caribbean-map__grid-overlay" aria-hidden="true" />}
        {phase !== 'unavailable' && <div className="caribbean-map__compass" aria-hidden="true"><i>N</i><span /></div>}
      </div>

      <footer className="caribbean-map__footer">
        <p>{statusLabel ?? (contactVisible ? 'Contact plotted' : 'Harbour chart')}</p>
        <dl>
          <div><dt>Bearing</dt><dd>{contactVisible ? RED_JACKDAW_VOYAGE.bearingLabel : 'No course marked'}</dd></div>
          <div><dt>Wind</dt><dd>{RED_JACKDAW_VOYAGE.windLabel}</dd></div>
        </dl>
      </footer>
    </section>
  );
}
