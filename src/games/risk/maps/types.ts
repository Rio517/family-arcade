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
}

/** A clip rectangle in map pixel space: [x, y, width, height]. */
export type ClipRect = [number, number, number, number];

export interface RenderedTerritory {
  id: string;
  name: string;
  continentId: string;
  /** SVG path `d` for the territory outline (already projected to pixels). */
  path: string;
  /**
   * When a territory is one region of a larger country (e.g. Western Canada),
   * `path` is the whole country and these rectangles clip it to this region.
   */
  clip?: ClipRect[];
  /** Anchor for the army badge / label, in the same pixel space. */
  labelX: number;
  labelY: number;
}

/** Internal Risk-style dividing lines drawn over a split country. */
export interface MapDivider {
  /** The country outline `d` used to clip the lines to the land. */
  clip: string;
  /** Line segments [x1, y1, x2, y2]. */
  lines: [number, number, number, number][];
}

/** A drawn sea connection between two territories (adjacent across water). */
export interface SeaRoute {
  /** SVG path `d` — a gentle arc (or two edge stubs when the route wraps). */
  d: string;
  /** The land endpoints, for the little anchor marks. */
  ends: [number, number][];
}

export interface RiskMap {
  id: string;
  name: string;
  width: number;
  height: number;
  topology: MapTopology;
  continents: RenderedContinent[];
  territories: RenderedTerritory[];
  /** Internal dividing lines for split countries (Russia, USA, Canada, …). */
  dividers: MapDivider[];
  /** Drawn sea connections between across-water neighbours. */
  seaRoutes: SeaRoute[];
  /** Projected lat/long graticule as an SVG path — a faint antique map grid. */
  graticule: string;
}

export interface RiskMapModule {
  id: string;
  name: string;
  /** Build (and memoize) the rendered map. */
  build: () => RiskMap;
}
