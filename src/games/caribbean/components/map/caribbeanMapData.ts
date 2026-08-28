import type { LngLatBoundsLike } from 'maplibre-gl';

export type CaribbeanMapContext = 'port' | 'sailing' | 'encounter';
export type CaribbeanCoordinates = readonly [longitude: number, latitude: number];

export interface CaribbeanMapPoint {
  name: string;
  shortName?: string;
  coordinates: CaribbeanCoordinates;
  kind: 'port' | 'place' | 'player' | 'contact';
}

export interface CaribbeanMapPreset {
  longitude: number;
  latitude: number;
  zoom: number;
}

export const CARIBBEAN_MAP_POINTS = {
  bridgetown: { name: 'Bridgetown', shortName: 'Barbados', coordinates: [-59.6167, 13.1], kind: 'port' },
  saintLucia: { name: 'Saint Lucia', coordinates: [-60.9789, 13.9094], kind: 'place' },
  martinique: { name: 'Martinique', coordinates: [-61.0242, 14.6415], kind: 'place' },
  dominica: { name: 'Dominica', coordinates: [-61.371, 15.415], kind: 'place' },
  guadeloupe: { name: 'Guadeloupe', coordinates: [-61.551, 16.265], kind: 'place' },
  trinidad: { name: 'Trinidad', coordinates: [-61.2225, 10.6918], kind: 'place' },
  redJackdaw: { name: 'Red Jackdaw', coordinates: [-57.95, 13.43], kind: 'contact' },
} as const satisfies Record<string, CaribbeanMapPoint>;

export const CARIBBEAN_PLAYER_POINTS: Readonly<Record<CaribbeanMapContext, CaribbeanCoordinates>> = {
  port: CARIBBEAN_MAP_POINTS.bridgetown.coordinates,
  sailing: [-59.16, 13.19],
  encounter: [-58.48, 13.34],
};

export const CARIBBEAN_PLACE_POINTS = [
  CARIBBEAN_MAP_POINTS.saintLucia,
  CARIBBEAN_MAP_POINTS.martinique,
  CARIBBEAN_MAP_POINTS.dominica,
  CARIBBEAN_MAP_POINTS.guadeloupe,
  CARIBBEAN_MAP_POINTS.trinidad,
] as const;

export const CARIBBEAN_ROUTE = {
  type: 'Feature',
  properties: {
    name: 'Red Jackdaw pursuit course',
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [...CARIBBEAN_MAP_POINTS.bridgetown.coordinates],
      [...CARIBBEAN_PLAYER_POINTS.sailing],
      [...CARIBBEAN_PLAYER_POINTS.encounter],
      [...CARIBBEAN_MAP_POINTS.redJackdaw.coordinates],
    ],
  },
} satisfies {
  type: 'Feature';
  properties: { name: string };
  geometry: { type: 'LineString'; coordinates: number[][] };
};

export const CARIBBEAN_MAP_PRESETS: Readonly<Record<CaribbeanMapContext, CaribbeanMapPreset>> = {
  port: { longitude: -59.62, latitude: 13.55, zoom: 5.75 },
  sailing: { longitude: -59.15, latitude: 13.42, zoom: 5.55 },
  encounter: { longitude: -59.15, latitude: 13.42, zoom: 5.55 },
};

export const CARIBBEAN_MAX_BOUNDS: LngLatBoundsLike = [
  [-68.5, 8.8],
  [-54.5, 19.5],
];
