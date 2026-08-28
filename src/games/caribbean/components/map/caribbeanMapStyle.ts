import type { StyleSpecification } from 'maplibre-gl';

export const OPEN_FREE_MAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

/**
 * The application owns this complete style. OpenFreeMap supplies vector data,
 * never presentation decisions or an opaque remote style document.
 */
export const CARIBBEAN_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'Arcade Caribbean nautical chart',
  metadata: {
    'arcade:purpose': 'shared-caribbean-campaign-chart',
    'arcade:provider': 'openfreemap',
  },
  sources: {
    openmaptiles: {
      type: 'vector',
      url: OPEN_FREE_MAP_TILEJSON_URL,
    },
  },
  layers: [
    {
      id: 'caribbean-parchment',
      type: 'background',
      paint: {
        'background-color': '#d7c79d',
      },
    },
    {
      id: 'caribbean-landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      minzoom: 3,
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          'wood', '#87916c',
          'grass', '#a4a57d',
          'scrub', '#9d9b74',
          '#b7ad85',
        ],
        'fill-opacity': 0.48,
      },
    },
    {
      id: 'caribbean-water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: {
        'fill-color': '#496f78',
        'fill-outline-color': '#203f45',
      },
    },
    {
      id: 'caribbean-waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 6,
      paint: {
        'line-color': '#557b7e',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 12, 1.4],
        'line-opacity': 0.72,
      },
    },
    {
      id: 'caribbean-boundaries',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['<=', ['coalesce', ['get', 'admin_level'], 99], 4],
      paint: {
        'line-color': '#705b3d',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.45, 8, 1.1],
        'line-opacity': 0.58,
        'line-dasharray': [5, 4],
      },
    },
  ],
};
