/**
 * The World map. Every landmass belongs to a territory, and a territory is a
 * *group* of real countries merged with `topojson.merge` so the internal
 * borders dissolve into one clean regional outline. The continents therefore
 * read as solid shapes divided into Risk-style regions — real geography, no
 * gaps — all bundled (world-atlas / Natural Earth, MIT) and projected with
 * `d3-geo`. No tiles, works offline.
 *
 * The engine never sees any of this — only the derived topology.
 */

import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import type { MapTopology } from '../domain/types';
import type { RenderedContinent, RenderedTerritory, RiskMap, RiskMapModule } from './types';

interface TerritoryDef {
  id: string;
  name: string;
  continentId: string;
  /** ISO numeric ids (world-atlas) of the countries that make up this region. */
  iso: string[];
  labelLon?: number;
  labelLat?: number;
}

const CONTINENTS: RenderedContinent[] = [
  { id: 'na', name: 'North America', bonus: 5, color: '#c98a52' },
  { id: 'sa', name: 'South America', bonus: 2, color: '#c9a24b' },
  { id: 'eu', name: 'Europe', bonus: 5, color: '#8f7bb0' },
  { id: 'af', name: 'Africa', bonus: 3, color: '#6fa06a' },
  { id: 'as', name: 'Asia', bonus: 7, color: '#bd6b5e' },
  { id: 'oc', name: 'Oceania', bonus: 2, color: '#c07aa0' },
];

const TERRITORIES: TerritoryDef[] = [
  // ── North America ──
  { id: 'canada', name: 'Canada', continentId: 'na', iso: ['124'], labelLon: -100, labelLat: 60 },
  { id: 'usa', name: 'United States', continentId: 'na', iso: ['840'], labelLon: -98, labelLat: 39 },
  { id: 'greenland', name: 'Greenland', continentId: 'na', iso: ['304'], labelLon: -42, labelLat: 72 },
  { id: 'mexico', name: 'Mexico', continentId: 'na', iso: ['484'] },
  { id: 'centralamerica', name: 'Central America', continentId: 'na', iso: ['320', '084', '340', '222', '558', '188', '591'], labelLon: -86, labelLat: 13 },
  { id: 'caribbean', name: 'Caribbean', continentId: 'na', iso: ['192', '332', '214', '388', '044', '630', '780'], labelLon: -74, labelLat: 20 },

  // ── South America ──
  { id: 'colombia', name: 'Colombia', continentId: 'sa', iso: ['170', '218'] },
  { id: 'venezuela', name: 'Venezuela', continentId: 'sa', iso: ['862', '328', '740'], labelLon: -66, labelLat: 7 },
  { id: 'peru', name: 'Peru', continentId: 'sa', iso: ['604', '068'] },
  { id: 'brazil', name: 'Brazil', continentId: 'sa', iso: ['076'] },
  { id: 'argentina', name: 'Argentina', continentId: 'sa', iso: ['032', '152', '858', '600', '238'], labelLon: -65, labelLat: -35 },

  // ── Europe ──
  { id: 'britain', name: 'Britain', continentId: 'eu', iso: ['826', '372', '352'], labelLon: -3, labelLat: 54 },
  { id: 'scandinavia', name: 'Scandinavia', continentId: 'eu', iso: ['578', '752', '246', '208'], labelLon: 16, labelLat: 63 },
  { id: 'westeurope', name: 'Western Europe', continentId: 'eu', iso: ['250', '724', '620'], labelLon: 0, labelLat: 45 },
  { id: 'centraleurope', name: 'Central Europe', continentId: 'eu', iso: ['276', '528', '056', '442', '756', '040', '203', '616'], labelLon: 12, labelLat: 51 },
  { id: 'southeurope', name: 'Southern Europe', continentId: 'eu', iso: ['380', '300', '008', '807', '688', '499', '070', '191', '705', '642', '100', '348', '703'], labelLon: 20, labelLat: 43 },
  { id: 'easteurope', name: 'Eastern Europe', continentId: 'eu', iso: ['804', '112', '498', '428', '440', '233'], labelLon: 29, labelLat: 51 },

  // ── Africa ──
  { id: 'northafrica', name: 'North Africa', continentId: 'af', iso: ['504', '012', '788', '434', '732', '478'], labelLon: 5, labelLat: 27 },
  { id: 'egypt', name: 'Egypt & Sudan', continentId: 'af', iso: ['818', '729', '728'], labelLon: 30, labelLat: 22 },
  { id: 'westafrica', name: 'West Africa', continentId: 'af', iso: ['466', '562', '566', '148', '686', '624', '324', '694', '430', '384', '854', '288', '768', '204', '120', '140', '270'], labelLon: 6, labelLat: 12 },
  { id: 'eastafrica', name: 'East Africa', continentId: 'af', iso: ['231', '232', '262', '706', '404', '800', '834', '646', '108'], labelLon: 40, labelLat: 4 },
  { id: 'centralafrica', name: 'Central Africa', continentId: 'af', iso: ['180', '178', '266', '226', '024', '894', '454', '508', '716'], labelLon: 22, labelLat: -6 },
  { id: 'southafrica', name: 'South Africa', continentId: 'af', iso: ['710', '516', '072', '426', '748', '450'], labelLon: 24, labelLat: -29 },

  // ── Asia ──
  { id: 'russia', name: 'Russia', continentId: 'as', iso: ['643'], labelLon: 95, labelLat: 62 },
  { id: 'centralasia', name: 'Central Asia', continentId: 'as', iso: ['398', '860', '795', '762', '417'], labelLon: 63, labelLat: 46 },
  { id: 'middleeast', name: 'Middle East', continentId: 'as', iso: ['792', '760', '368', '364', '400', '376', '422', '682', '887', '512', '784', '634', '414', '275', '051', '268', '031', '196'], labelLon: 46, labelLat: 28 },
  { id: 'india', name: 'India', continentId: 'as', iso: ['356', '586', '050', '524', '064', '144', '004'], labelLon: 79, labelLat: 22 },
  { id: 'china', name: 'China', continentId: 'as', iso: ['156'], labelLon: 103, labelLat: 36 },
  { id: 'mongolia', name: 'Mongolia', continentId: 'as', iso: ['496'] },
  { id: 'seasia', name: 'Southeast Asia', continentId: 'as', iso: ['104', '764', '418', '116', '704', '458', '096', '608', '158'], labelLon: 105, labelLat: 12 },
  { id: 'japan', name: 'Japan & Korea', continentId: 'as', iso: ['392', '410', '408'], labelLon: 138, labelLat: 37 },

  // ── Oceania ──
  { id: 'indonesia', name: 'Indonesia', continentId: 'oc', iso: ['360', '626'], labelLon: 118, labelLat: -2 },
  { id: 'papua', name: 'New Guinea', continentId: 'oc', iso: ['598', '090', '548', '540', '242'], labelLon: 145, labelLat: -6 },
  { id: 'australia', name: 'Australia', continentId: 'oc', iso: ['036'], labelLon: 134, labelLat: -25 },
  { id: 'newzealand', name: 'New Zealand', continentId: 'oc', iso: ['554'] },
];

/** Undirected borders — land where the regions touch, plus classic sea routes. */
const EDGES: [string, string][] = [
  // North America
  ['canada', 'usa'], ['canada', 'greenland'], ['usa', 'mexico'], ['usa', 'caribbean'],
  ['mexico', 'centralamerica'], ['mexico', 'caribbean'], ['centralamerica', 'caribbean'],
  ['centralamerica', 'colombia'], ['caribbean', 'venezuela'], ['greenland', 'britain'],
  // South America
  ['colombia', 'venezuela'], ['colombia', 'peru'], ['venezuela', 'brazil'],
  ['peru', 'brazil'], ['peru', 'argentina'], ['brazil', 'argentina'], ['brazil', 'northafrica'],
  // Europe
  ['britain', 'westeurope'], ['britain', 'scandinavia'], ['britain', 'centraleurope'],
  ['scandinavia', 'centraleurope'], ['scandinavia', 'easteurope'],
  ['westeurope', 'centraleurope'], ['westeurope', 'southeurope'], ['westeurope', 'northafrica'],
  ['centraleurope', 'southeurope'], ['centraleurope', 'easteurope'],
  ['southeurope', 'easteurope'], ['southeurope', 'egypt'], ['southeurope', 'middleeast'],
  ['easteurope', 'russia'], ['easteurope', 'middleeast'],
  // Africa
  ['northafrica', 'westafrica'], ['northafrica', 'egypt'], ['egypt', 'eastafrica'], ['egypt', 'middleeast'],
  ['westafrica', 'centralafrica'], ['westafrica', 'eastafrica'], ['eastafrica', 'centralafrica'],
  ['eastafrica', 'southafrica'], ['eastafrica', 'middleeast'], ['centralafrica', 'southafrica'],
  // Asia
  ['russia', 'centralasia'], ['russia', 'mongolia'], ['russia', 'china'], ['russia', 'japan'],
  ['centralasia', 'middleeast'], ['centralasia', 'india'], ['centralasia', 'china'], ['centralasia', 'mongolia'],
  ['middleeast', 'india'], ['india', 'china'], ['india', 'seasia'],
  ['china', 'mongolia'], ['china', 'seasia'], ['china', 'japan'], ['seasia', 'japan'],
  // Oceania
  ['seasia', 'indonesia'], ['indonesia', 'papua'], ['indonesia', 'australia'],
  ['papua', 'australia'], ['australia', 'newzealand'],
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
  const geometries = (topo.objects.countries as GeometryCollection).geometries;
  const byId = new Map(geometries.map((g) => [String(g.id), g]));

  const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' });
  const path = geoPath(projection);

  const territories: RenderedTerritory[] = [];
  for (const def of TERRITORIES) {
    const parts = def.iso.map((id) => byId.get(id)).filter(Boolean) as (Polygon | MultiPolygon)[];
    if (parts.length === 0) continue;
    // Dissolve the member countries into one clean regional outline.
    const shape = merge(topo, parts);
    const d = path(shape) ?? '';
    let [lx, ly] = path.centroid(shape);
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
    graticule: path(geoGraticule10()) ?? '',
  };
  return cached;
}

export const worldMap: RiskMapModule = { id: 'world', name: 'World', build };
