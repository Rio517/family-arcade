import { useId, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldLand from 'world-atlas/land-110m.json';

import { RED_JACKDAW_VOYAGE } from '../../content/voyage';
import {
  CARIBBEAN_MAP_HOME,
  type CaribbeanMapView,
  panCaribbeanMap,
  resetCaribbeanMap,
  zoomCaribbeanMap,
} from './mapView';

const VIEWBOX_WIDTH = 900;
const VIEWBOX_HEIGHT = 600;
const BRIDGETOWN: [number, number] = [-59.6167, 13.1];
const MISTRAL: [number, number] = [-60.55, 12.75];
const RED_JACKDAW: [number, number] = [-58.2, 14.35];

const projection = geoMercator()
  .center([-70, 17])
  .scale(1_390)
  .translate([VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2])
  .clipExtent([[0, 0], [VIEWBOX_WIDTH, VIEWBOX_HEIGHT]]);

const topology = worldLand as unknown as Topology<{ land: GeometryCollection }>;
const landFeature = feature(topology, topology.objects.land);
const path = geoPath(projection);
const landPath = path(landFeature) ?? '';
const routePath = path({
  type: 'LineString',
  coordinates: [BRIDGETOWN, MISTRAL, RED_JACKDAW],
}) ?? '';

const PLACES: ReadonlyArray<{
  name: string;
  coordinates: [number, number];
  label: readonly [number, number];
  important: boolean;
}> = [
  { name: 'St Lucia', coordinates: [-60.9789, 13.9094], label: [-66, -8], important: false },
  { name: 'Martinique', coordinates: [-61.0242, 14.6415], label: [-72, -8], important: false },
  { name: 'Dominica', coordinates: [-61.371, 15.415], label: [-67, -8], important: false },
  { name: 'Guadeloupe', coordinates: [-61.551, 16.265], label: [-76, -8], important: false },
  { name: 'Trinidad', coordinates: [-61.2225, 10.6918], label: [-60, 25], important: false },
];

function projected(coordinates: [number, number]): [number, number] {
  const point = projection(coordinates);
  if (!point) throw new Error(`Caribbean coordinate could not be projected: ${coordinates.join(',')}`);
  return point;
}

export interface CaribbeanMapProps {
  playerName: string;
  contactVisible: boolean;
}

export function CaribbeanMap({ playerName, contactVisible }: CaribbeanMapProps) {
  const [view, setView] = useState<CaribbeanMapView>(() => ({ ...CARIBBEAN_MAP_HOME }));
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const gridId = useId().replaceAll(':', '');
  const bridgetown = projected(BRIDGETOWN);
  const mistral = projected(MISTRAL);
  const redJackdaw = projected(RED_JACKDAW);
  const transform = `translate(${view.panX} ${view.panY}) translate(${VIEWBOX_WIDTH / 2} ${VIEWBOX_HEIGHT / 2}) scale(${view.scale}) translate(${-VIEWBOX_WIDTH / 2} ${-VIEWBOX_HEIGHT / 2})`;

  return (
    <section className="caribbean-map" aria-label="Caribbean encounter chart">
      <div className="caribbean-map__masthead">
        <p><span>Navigation chart</span><strong>Lesser Antilles</strong></p>
        <div className="caribbean-map__controls" role="group" aria-label="Map view controls">
          <button type="button" aria-label="Zoom out" onClick={() => setView((current) => zoomCaribbeanMap(current, -1))}>−</button>
          <button type="button" aria-label="Reset map view" onClick={() => setView(resetCaribbeanMap())}>⌂</button>
          <button type="button" aria-label="Zoom in" onClick={() => setView((current) => zoomCaribbeanMap(current, 1))}>+</button>
        </div>
      </div>
      <svg
        className="caribbean-map__surface"
        data-testid="caribbean-map-surface"
        data-map-scale={view.scale}
        data-map-pan-x={view.panX}
        data-map-pan-y={view.panY}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label="Zoomable chart of the eastern Caribbean showing Bridgetown, Mistral, and the Red Jackdaw contact"
        aria-describedby={`${gridId}-instructions`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'Home') return;
          event.preventDefault();
          setView(resetCaribbeanMap());
        }}
        onWheel={(event) => {
          event.preventDefault();
          setView((current) => zoomCaribbeanMap(current, event.deltaY < 0 ? 1 : -1));
        }}
        onPointerDown={(event) => {
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - drag.current.x;
          const deltaY = event.clientY - drag.current.y;
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          setView((current) => panCaribbeanMap(current, deltaX, deltaY));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <defs>
          <pattern id={`${gridId}-grid`} width="54" height="54" patternUnits="userSpaceOnUse">
            <path d="M54 0H0V54" />
          </pattern>
          <filter id={`${gridId}-glow`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect className="caribbean-map__ocean" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
        <rect className="caribbean-map__grid" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={`url(#${gridId}-grid)`} />
        <g className="caribbean-map__world" transform={transform}>
          <path className="caribbean-map__land" data-map-land="natural-earth" d={landPath} />
          {PLACES.map((place) => {
            const [x, y] = projected(place.coordinates);
            return (
              <g className={`caribbean-map__place${place.important ? ' caribbean-map__place--important' : ''}`} data-map-place={place.name} key={place.name} transform={`translate(${x} ${y})`}>
                <circle r={place.important ? 5 : 3} />
                <text x={place.label[0]} y={place.label[1]}>{place.name}</text>
              </g>
            );
          })}
          {contactVisible && <path className="caribbean-map__route" data-map-route="red-jackdaw" d={routePath} />}
          <g className="caribbean-map__port" data-map-port="Bridgetown" data-map-label-layout="collision-safe" transform={`translate(${bridgetown[0]} ${bridgetown[1]})`}>
            <circle r="9" /><path d="M-15 0H15M0-15V15" />
            <text x="-18" y="-15" textAnchor="end"><tspan>Bridgetown</tspan><tspan className="caribbean-map__subplace" x="-18" dy="17">Barbados</tspan></text>
          </g>
          <g className="caribbean-map__player" data-map-label-layout="collision-safe" transform={`translate(${mistral[0]} ${mistral[1]})`}>
            <path d="M-9 8 0-15 9 8 0 14Z" /><path d="M0-12V10" /><text x="-16" y="28" textAnchor="end">{playerName}</text>
          </g>
          {contactVisible && (
            <g className="caribbean-map__contact" data-map-contact="red-jackdaw" data-map-label-layout="collision-safe" transform={`translate(${redJackdaw[0]} ${redJackdaw[1]})`} filter={`url(#${gridId}-glow)`}>
              <path d="M0-11 11 0 0 11-11 0Z" /><circle r="3" /><text x="17" y="-14">Red Jackdaw</text>
            </g>
          )}
        </g>
        <g className="caribbean-map__compass" transform="translate(75 510)">
          <circle r="43" /><path d="M0-35 7 0 0 35-7 0Z" /><path d="M-35 0H35" /><text x="0" y="-51">N</text>
        </g>
      </svg>
      <p className="caribbean-map__instructions" id={`${gridId}-instructions`}>Use the plus and minus buttons or mouse wheel to zoom. Drag the chart to pan. Press Home to reset the view.</p>
      <dl className="caribbean-map__facts" data-testid="caribbean-map-facts">
        <div><dt>Bearing</dt><dd>{contactVisible ? RED_JACKDAW_VOYAGE.bearingLabel : 'No course marked'}</dd></div>
        <div><dt>Wind</dt><dd>{RED_JACKDAW_VOYAGE.windLabel}</dd></div>
      </dl>
    </section>
  );
}
