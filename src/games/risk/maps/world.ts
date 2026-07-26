/**
 * The World map: real country geometry from `world-atlas` (Natural Earth,
 * bundled — no tile server, works offline), projected to flat SVG with
 * `d3-geo`. Each territory is one country; continents, bonuses, and adjacency
 * (land borders + classic sea routes) are authored here as data.
 *
 * This is the first map; others just add another module and register it in
 * ./registry. The engine never sees any of this — only the derived topology.
 */

import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import type { MapTopology } from '../domain/types';
import type { RenderedContinent, RenderedTerritory, RiskMap, RiskMapModule } from './types';

interface TerritoryDef {
  id: string;
  name: string;
  /** ISO 3166-1 numeric id as it appears in world-atlas (may have leading 0s). */
  iso: string;
  continentId: string;
  /** Optional label override (lon/lat) for countries whose centroid is awkward. */
  labelLon?: number;
  labelLat?: number;
}

const CONTINENTS: RenderedContinent[] = [
  { id: 'na', name: 'North America', bonus: 5, color: '#60a5fa' },
  { id: 'sa', name: 'South America', bonus: 2, color: '#fbbf24' },
  { id: 'eu', name: 'Europe', bonus: 5, color: '#a78bfa' },
  { id: 'af', name: 'Africa', bonus: 3, color: '#34d399' },
  { id: 'as', name: 'Asia', bonus: 7, color: '#f87171' },
  { id: 'oc', name: 'Oceania', bonus: 2, color: '#f472b6' },
];

const TERRITORIES: TerritoryDef[] = [
  // North America
  { id: 'canada', name: 'Canada', iso: '124', continentId: 'na' },
  { id: 'usa', name: 'United States', iso: '840', continentId: 'na', labelLon: -98, labelLat: 39 },
  { id: 'mexico', name: 'Mexico', iso: '484', continentId: 'na' },
  { id: 'greenland', name: 'Greenland', iso: '304', continentId: 'na', labelLon: -42, labelLat: 72 },
  { id: 'cuba', name: 'Cuba', iso: '192', continentId: 'na' },
  // South America
  { id: 'brazil', name: 'Brazil', iso: '076', continentId: 'sa' },
  { id: 'argentina', name: 'Argentina', iso: '032', continentId: 'sa' },
  { id: 'peru', name: 'Peru', iso: '604', continentId: 'sa' },
  { id: 'colombia', name: 'Colombia', iso: '170', continentId: 'sa' },
  { id: 'venezuela', name: 'Venezuela', iso: '862', continentId: 'sa' },
  // Europe
  { id: 'uk', name: 'United Kingdom', iso: '826', continentId: 'eu' },
  { id: 'france', name: 'France', iso: '250', continentId: 'eu', labelLon: 2, labelLat: 47 },
  { id: 'germany', name: 'Germany', iso: '276', continentId: 'eu' },
  { id: 'spain', name: 'Spain', iso: '724', continentId: 'eu' },
  { id: 'italy', name: 'Italy', iso: '380', continentId: 'eu' },
  { id: 'poland', name: 'Poland', iso: '616', continentId: 'eu' },
  { id: 'ukraine', name: 'Ukraine', iso: '804', continentId: 'eu' },
  // Africa
  { id: 'algeria', name: 'Algeria', iso: '012', continentId: 'af' },
  { id: 'egypt', name: 'Egypt', iso: '818', continentId: 'af' },
  { id: 'nigeria', name: 'Nigeria', iso: '566', continentId: 'af' },
  { id: 'drcongo', name: 'DR Congo', iso: '180', continentId: 'af' },
  { id: 'southafrica', name: 'South Africa', iso: '710', continentId: 'af' },
  { id: 'ethiopia', name: 'Ethiopia', iso: '231', continentId: 'af' },
  // Asia
  { id: 'russia', name: 'Russia', iso: '643', continentId: 'as', labelLon: 95, labelLat: 62 },
  { id: 'china', name: 'China', iso: '156', continentId: 'as' },
  { id: 'india', name: 'India', iso: '356', continentId: 'as' },
  { id: 'kazakhstan', name: 'Kazakhstan', iso: '398', continentId: 'as' },
  { id: 'iran', name: 'Iran', iso: '364', continentId: 'as' },
  { id: 'saudiarabia', name: 'Saudi Arabia', iso: '682', continentId: 'as' },
  { id: 'turkey', name: 'Turkey', iso: '792', continentId: 'as' },
  { id: 'japan', name: 'Japan', iso: '392', continentId: 'as' },
  { id: 'indonesia', name: 'Indonesia', iso: '360', continentId: 'as' },
  { id: 'mongolia', name: 'Mongolia', iso: '496', continentId: 'as' },
  // Oceania
  { id: 'australia', name: 'Australia', iso: '036', continentId: 'oc' },
  { id: 'papuanewguinea', name: 'Papua New Guinea', iso: '598', continentId: 'oc' },
  { id: 'newzealand', name: 'New Zealand', iso: '554', continentId: 'oc' },
];

/** Undirected borders (land + classic Risk-style sea routes). */
const EDGES: [string, string][] = [
  // North America
  ['canada', 'usa'], ['canada', 'greenland'], ['usa', 'mexico'], ['usa', 'cuba'],
  ['mexico', 'cuba'], ['mexico', 'colombia'], ['greenland', 'uk'],
  // South America
  ['colombia', 'venezuela'], ['colombia', 'peru'], ['venezuela', 'brazil'],
  ['brazil', 'peru'], ['brazil', 'argentina'], ['peru', 'argentina'], ['brazil', 'algeria'],
  // Europe
  ['uk', 'france'], ['uk', 'germany'], ['france', 'spain'], ['france', 'germany'],
  ['france', 'italy'], ['spain', 'italy'], ['spain', 'algeria'], ['germany', 'italy'],
  ['germany', 'poland'], ['italy', 'ukraine'], ['italy', 'egypt'], ['poland', 'ukraine'],
  ['poland', 'russia'], ['ukraine', 'russia'], ['ukraine', 'turkey'],
  // Africa
  ['algeria', 'nigeria'], ['algeria', 'egypt'], ['egypt', 'ethiopia'], ['egypt', 'turkey'],
  ['nigeria', 'drcongo'], ['nigeria', 'ethiopia'], ['ethiopia', 'drcongo'],
  ['ethiopia', 'southafrica'], ['ethiopia', 'saudiarabia'], ['drcongo', 'southafrica'],
  // Asia
  ['russia', 'kazakhstan'], ['russia', 'mongolia'], ['russia', 'china'], ['russia', 'japan'],
  ['kazakhstan', 'china'], ['kazakhstan', 'iran'], ['kazakhstan', 'india'], ['kazakhstan', 'mongolia'],
  ['china', 'mongolia'], ['china', 'india'], ['china', 'indonesia'], ['china', 'japan'],
  ['india', 'iran'], ['india', 'indonesia'], ['iran', 'turkey'], ['iran', 'saudiarabia'],
  ['turkey', 'saudiarabia'],
  // Oceania
  ['indonesia', 'australia'], ['indonesia', 'papuanewguinea'], ['australia', 'papuanewguinea'],
  ['australia', 'newzealand'],
];

function buildTopology(): MapTopology {
  const adjacency: Record<string, string[]> = {};
  for (const t of TERRITORIES) adjacency[t.id] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return {
    id: 'world',
    name: 'World',
    territoryIds: TERRITORIES.map((t) => t.id),
    continents: CONTINENTS.map((c) => ({
      id: c.id,
      name: c.name,
      bonus: c.bonus,
      territoryIds: TERRITORIES.filter((t) => t.continentId === c.id).map((t) => t.id),
    })),
    adjacency,
  };
}

const WIDTH = 1000;
const HEIGHT = 500;

let cached: RiskMap | null = null;

function build(): RiskMap {
  if (cached) return cached;

  const topo = countries110m as unknown as Topology;
  const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, GeoJsonProperties>;
  const byId = new Map(fc.features.map((f) => [String(f.id), f]));

  const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' });
  const path = geoPath(projection);

  const territories: RenderedTerritory[] = [];
  for (const def of TERRITORIES) {
    const f = byId.get(def.iso);
    if (!f) continue; // defensive — verified present at authoring time
    const d = path(f) ?? '';
    let [lx, ly] = path.centroid(f);
    if (def.labelLon !== undefined && def.labelLat !== undefined) {
      const p = projection([def.labelLon, def.labelLat]);
      if (p) [lx, ly] = p;
    }
    territories.push({
      id: def.id,
      name: def.name,
      continentId: def.continentId,
      path: d,
      labelX: Math.round(lx),
      labelY: Math.round(ly),
    });
  }

  cached = {
    id: 'world',
    name: 'World',
    width: WIDTH,
    height: HEIGHT,
    topology: buildTopology(),
    continents: CONTINENTS,
    territories,
  };
  return cached;
}

export const worldMap: RiskMapModule = { id: 'world', name: 'World', build };
