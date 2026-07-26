/**
 * The rendered-map contract. A map module turns geography into flat SVG data
 * (path strings + label anchors) plus the abstract `MapTopology` the rules use.
 * Keeping this separate from the rules is what makes maps pluggable: a new map
 * is just another module that produces a `RiskMap`.
 */

import type { MapTopology } from '../domain/types';

export interface RenderedContinent {
  id: string;
  name: string;
  bonus: number;
  /** Accent colour used for this continent's territory borders + legend. */
  color: string;
}

export interface RenderedTerritory {
  id: string;
  name: string;
  continentId: string;
  /** SVG path `d` for the territory outline (already projected to pixels). */
  path: string;
  /** Anchor for the army badge / label, in the same pixel space. */
  labelX: number;
  labelY: number;
}

export interface RiskMap {
  id: string;
  name: string;
  width: number;
  height: number;
  topology: MapTopology;
  continents: RenderedContinent[];
  territories: RenderedTerritory[];
}

export interface RiskMapModule {
  id: string;
  name: string;
  /** Build (and memoize) the rendered map. */
  build: () => RiskMap;
}
