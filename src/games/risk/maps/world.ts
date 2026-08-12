/**
 * The World map. Most territories are a *group* of real countries merged with
 * `topojson.merge` into one clean regional outline, so the continents fill
 * solidly with no gaps. The handful of countries that classic Risk breaks up —
 * Russia, the USA, Canada, Australia — are split into regions by clipping the
 * projected country to screen-space bands, with the internal Risk lines drawn
 * over the land. All geometry is bundled (world-atlas / Natural Earth, MIT) and
 * projected with `d3-geo`; no tiles, works offline.
 *
 * The engine never sees any of this — only the derived topology.
 */

import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import type { MapTopology } from '../domain/types';
import type { ClipRect, MapDivider, RenderedContinent, RenderedTerritory, RiskMap, RiskMapModule, SeaRoute } from './types';

const CONTINENTS: RenderedContinent[] = [
  { id: 'na', name: 'North America', bonus: 5 },
  { id: 'sa', name: 'South America', bonus: 2 },
  { id: 'eu', name: 'Europe', bonus: 5 },
  { id: 'af', name: 'Africa', bonus: 3 },
  { id: 'as', name: 'Asia', bonus: 7 },
  { id: 'oc', name: 'Oceania', bonus: 2 },
];

/** A whole-region territory: a group of countries merged into one outline. */
interface GroupDef {
  id: string; name: string; continentId: string; iso: string[];
  labelLon?: number; labelLat?: number;
}

/** A big country carved into classic-Risk regions by screen-space bands. */
interface SplitDef {
  baseIso: string; continentId: string;
  subs: { id: string; name: string; rects: ClipRect[]; labelLon: number; labelLat: number }[];
  dividers: [number, number, number, number][];
}

const GROUPS: GroupDef[] = [
  // North America
  { id: 'greenland', name: 'Greenland', continentId: 'na', iso: ['304'], labelLon: -42, labelLat: 72 },
  { id: 'mexico', name: 'Mexico', continentId: 'na', iso: ['484'] },
  { id: 'centralamerica', name: 'Central America', continentId: 'na', iso: ['320', '084', '340', '222', '558', '188', '591'], labelLon: -86, labelLat: 13 },
  { id: 'caribbean', name: 'Caribbean', continentId: 'na', iso: ['192', '332', '214', '388', '044', '630', '780'], labelLon: -74, labelLat: 20 },
  // South America
  { id: 'colombia', name: 'Colombia', continentId: 'sa', iso: ['170', '218'] },
  // '250-guiana' is French Guiana, carved out of world-atlas's France geometry
  // in build() — it belongs with the Guianas, not with Europe.
  { id: 'venezuela', name: 'Venezuela', continentId: 'sa', iso: ['862', '328', '740', '250-guiana'], labelLon: -66, labelLat: 7 },
  { id: 'peru', name: 'Peru', continentId: 'sa', iso: ['604', '068'] },
  { id: 'brazil', name: 'Brazil', continentId: 'sa', iso: ['076'] },
  { id: 'argentina', name: 'Argentina', continentId: 'sa', iso: ['032', '152', '858', '600', '238'], labelLon: -65, labelLat: -35 },
  // Europe
  { id: 'britain', name: 'Britain', continentId: 'eu', iso: ['826', '372', '352'], labelLon: -3, labelLat: 54 },
  { id: 'scandinavia', name: 'Scandinavia', continentId: 'eu', iso: ['578', '752', '246', '208'], labelLon: 16, labelLat: 63 },
  { id: 'westeurope', name: 'Western Europe', continentId: 'eu', iso: ['250', '724', '620'], labelLon: 0, labelLat: 45 },
  { id: 'centraleurope', name: 'Central Europe', continentId: 'eu', iso: ['276', '528', '056', '442', '756', '040', '203', '616'], labelLon: 12, labelLat: 51 },
  { id: 'southeurope', name: 'Southern Europe', continentId: 'eu', iso: ['380', '300', '008', '807', '688', '499', '070', '191', '705', '642', '100', '348', '703'], labelLon: 20, labelLat: 43 },
  { id: 'easteurope', name: 'Eastern Europe', continentId: 'eu', iso: ['804', '112', '498', '428', '440', '233'], labelLon: 29, labelLat: 51 },
  // Africa
  { id: 'northafrica', name: 'North Africa', continentId: 'af', iso: ['504', '012', '788', '434', '732', '478'], labelLon: 5, labelLat: 27 },
  { id: 'egypt', name: 'Egypt & Sudan', continentId: 'af', iso: ['818', '729', '728'], labelLon: 30, labelLat: 22 },
  { id: 'westafrica', name: 'West Africa', continentId: 'af', iso: ['466', '562', '566', '148', '686', '624', '324', '694', '430', '384', '854', '288', '768', '204', '120', '140', '270'], labelLon: 6, labelLat: 12 },
  { id: 'eastafrica', name: 'East Africa', continentId: 'af', iso: ['231', '232', '262', '706', '404', '800', '834', '646', '108'], labelLon: 40, labelLat: 4 },
  { id: 'centralafrica', name: 'Central Africa', continentId: 'af', iso: ['180', '178', '266', '226', '024', '894', '454', '508', '716'], labelLon: 22, labelLat: -6 },
  { id: 'southafrica', name: 'South Africa', continentId: 'af', iso: ['710', '516', '072', '426', '748', '450'], labelLon: 24, labelLat: -29 },
  // Asia
  { id: 'centralasia', name: 'Central Asia', continentId: 'as', iso: ['398', '860', '795', '762', '417'], labelLon: 63, labelLat: 46 },
  { id: 'middleeast', name: 'Middle East', continentId: 'as', iso: ['792', '760', '368', '364', '400', '376', '422', '682', '887', '512', '784', '634', '414', '275', '051', '268', '031', '196'], labelLon: 46, labelLat: 28 },
  { id: 'india', name: 'India', continentId: 'as', iso: ['356', '586', '050', '524', '064', '144', '004'], labelLon: 79, labelLat: 22 },
  { id: 'china', name: 'China', continentId: 'as', iso: ['156'], labelLon: 103, labelLat: 36 },
  { id: 'mongolia', name: 'Mongolia', continentId: 'as', iso: ['496'] },
  { id: 'seasia', name: 'Southeast Asia', continentId: 'as', iso: ['104', '764', '418', '116', '704', '458', '096', '608', '158'], labelLon: 105, labelLat: 12 },
  { id: 'japan', name: 'Japan & Korea', continentId: 'as', iso: ['392', '410', '408'], labelLon: 138, labelLat: 37 },
  // Oceania
  { id: 'indonesia', name: 'Indonesia', continentId: 'oc', iso: ['360', '626'], labelLon: 118, labelLat: -2 },
  { id: 'papua', name: 'New Guinea', continentId: 'oc', iso: ['598', '090', '548', '540', '242'], labelLon: 145, labelLat: -6 },
  { id: 'newzealand', name: 'New Zealand', continentId: 'oc', iso: ['554'] },
];

const SPLITS: SplitDef[] = [
  {
    baseIso: '643', continentId: 'as', // Russia → Ural / Siberia / Yakutsk / Kamchatka
    subs: [
      { id: 'ural', name: 'Ural', rects: [[500, 0, 150, 160]], labelLon: 55, labelLat: 57 },
      { id: 'siberia', name: 'Siberia', rects: [[650, 0, 95, 160]], labelLon: 84, labelLat: 62 },
      { id: 'yakutsk', name: 'Yakutsk', rects: [[745, 0, 90, 160]], labelLon: 120, labelLat: 65 },
      { id: 'kamchatka', name: 'Kamchatka', rects: [[835, 0, 175, 160], [0, 0, 220, 160]], labelLon: 160, labelLat: 63 },
    ],
    // Lines span the whole clip band; the country outline trims them to land.
    dividers: [[650, 0, 650, 160], [745, 0, 745, 160], [835, 0, 835, 160]],
  },
  {
    baseIso: '840', continentId: 'na', // USA → Western / Eastern
    subs: [
      { id: 'westernus', name: 'Western US', rects: [[0, 0, 270, 260]], labelLon: -114, labelLat: 42 },
      { id: 'easternus', name: 'Eastern US', rects: [[270, 0, 150, 260]], labelLon: -84, labelLat: 39 },
    ],
    dividers: [[270, 0, 270, 260]],
  },
  {
    baseIso: '124', continentId: 'na', // Canada → Western / Central / Eastern
    subs: [
      { id: 'westerncanada', name: 'Western Canada', rects: [[0, 0, 285, 140]], labelLon: -119, labelLat: 62 },
      { id: 'centralcanada', name: 'Central Canada', rects: [[285, 0, 62, 140]], labelLon: -92, labelLat: 57 },
      { id: 'easterncanada', name: 'Eastern Canada', rects: [[347, 0, 170, 140]], labelLon: -71, labelLat: 52 },
    ],
    dividers: [[285, 0, 285, 140], [347, 0, 347, 140]],
  },
  {
    baseIso: '036', continentId: 'oc', // Australia → Western / Eastern
    subs: [
      { id: 'westernaustralia', name: 'Western Australia', rects: [[700, 260, 150, 160]], labelLon: 121, labelLat: -26 },
      { id: 'easternaustralia', name: 'Eastern Australia', rects: [[850, 260, 200, 160]], labelLon: 147, labelLat: -30 },
    ],
    dividers: [[850, 260, 850, 420]],
  },
];

/** Undirected borders — land where regions touch, plus classic sea routes. */
const EDGES: [string, string][] = [
  // North America
  ['westerncanada', 'centralcanada'], ['centralcanada', 'easterncanada'], ['easterncanada', 'greenland'],
  ['westerncanada', 'westernus'], ['centralcanada', 'westernus'], ['centralcanada', 'easternus'], ['easterncanada', 'easternus'],
  ['westernus', 'easternus'], ['westernus', 'mexico'], ['easternus', 'mexico'], ['easternus', 'caribbean'],
  ['westernus', 'kamchatka'], // Alaska ↔ Kamchatka
  ['mexico', 'centralamerica'], ['mexico', 'caribbean'], ['centralamerica', 'caribbean'],
  ['centralamerica', 'colombia'], ['caribbean', 'venezuela'], ['greenland', 'britain'],
  // South America
  ['colombia', 'venezuela'], ['colombia', 'peru'], ['venezuela', 'brazil'],
  ['peru', 'brazil'], ['peru', 'argentina'], ['brazil', 'argentina'], ['brazil', 'westafrica'],
  // Europe
  ['britain', 'westeurope'], ['britain', 'scandinavia'], ['britain', 'centraleurope'],
  ['scandinavia', 'centraleurope'], ['scandinavia', 'easteurope'],
  ['westeurope', 'centraleurope'], ['westeurope', 'southeurope'], ['westeurope', 'northafrica'],
  ['centraleurope', 'southeurope'], ['centraleurope', 'easteurope'],
  ['southeurope', 'easteurope'], ['southeurope', 'egypt'], ['southeurope', 'middleeast'],
  ['easteurope', 'ural'], ['easteurope', 'middleeast'],
  // Africa
  ['northafrica', 'westafrica'], ['northafrica', 'egypt'], ['egypt', 'eastafrica'], ['egypt', 'middleeast'],
  ['westafrica', 'centralafrica'], ['westafrica', 'eastafrica'], ['eastafrica', 'centralafrica'],
  ['eastafrica', 'southafrica'], ['eastafrica', 'middleeast'], ['centralafrica', 'southafrica'],
  // Asia — Russia
  ['ural', 'centralasia'], ['ural', 'siberia'], ['siberia', 'yakutsk'], ['yakutsk', 'kamchatka'],
  ['siberia', 'centralasia'], ['siberia', 'mongolia'], ['siberia', 'china'],
  ['yakutsk', 'mongolia'], ['kamchatka', 'mongolia'], ['kamchatka', 'japan'],
  // Asia — rest
  ['centralasia', 'middleeast'], ['centralasia', 'india'], ['centralasia', 'china'], ['centralasia', 'mongolia'],
  ['middleeast', 'india'], ['india', 'china'], ['india', 'seasia'],
  ['china', 'mongolia'], ['china', 'seasia'], ['china', 'japan'], ['seasia', 'japan'],
  // Oceania
  ['seasia', 'indonesia'], ['indonesia', 'papua'], ['indonesia', 'westernaustralia'],
  ['papua', 'easternaustralia'], ['westernaustralia', 'easternaustralia'], ['easternaustralia', 'newzealand'],
];

/**
 * The subset of borders that cross open water — drawn on the map as antique
 * shipping lines so the across-sea connections are visible.
 */
const SEA_ROUTES: [string, string][] = [
  ['greenland', 'britain'],
  ['brazil', 'westafrica'],
  ['easteurope', 'middleeast'],
  ['eastafrica', 'middleeast'],
  ['southeurope', 'egypt'],
  ['easternus', 'caribbean'],
  ['caribbean', 'venezuela'],
  ['westernus', 'kamchatka'],
  ['kamchatka', 'japan'],
  ['china', 'japan'],
  ['seasia', 'japan'],
  ['indonesia', 'westernaustralia'],
  ['papua', 'easternaustralia'],
  ['easternaustralia', 'newzealand'],
];

/** Every territory id (groups + split sub-regions) with its continent. */
function allTerritories(): { id: string; continentId: string }[] {
  return [
    ...GROUPS.map((g) => ({ id: g.id, continentId: g.continentId })),
    ...SPLITS.flatMap((s) => s.subs.map((sub) => ({ id: sub.id, continentId: s.continentId }))),
  ];
}

function buildTopology(): MapTopology {
  const all = allTerritories();
  const ids = all.map((t) => t.id);
  const adjacency: Record<string, string[]> = {};
  for (const id of ids) adjacency[id] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return {
    id: 'world',
    name: 'World',
    territoryIds: ids,
    continents: CONTINENTS.map((c) => ({
      id: c.id,
      name: c.name,
      bonus: c.bonus,
      territoryIds: all.filter((t) => t.continentId === c.id).map((t) => t.id),
    })),
    adjacency,
  };
}

const WIDTH = 1000;
const HEIGHT = 500;

/**
 * A gentle arc between two anchors. When the two ends are more than half a map
 * apart the route really wraps the globe (e.g. Alaska ↔ Kamchatka), so instead
 * of a line straight across the map we draw two short stubs running off the
 * near edges — the classic "off the edge of the board" sea route.
 */
function routePath(a: [number, number], b: [number, number]): SeaRoute {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) > WIDTH * 0.5) {
    const aEdge = a[0] < WIDTH / 2 ? -10 : WIDTH + 10;
    const bEdge = b[0] < WIDTH / 2 ? -10 : WIDTH + 10;
    const d =
      `M${a[0]},${a[1]} Q${(a[0] + aEdge) / 2},${a[1] - 26} ${aEdge},${a[1] - 6} ` +
      `M${b[0]},${b[1]} Q${(b[0] + bEdge) / 2},${b[1] - 26} ${bEdge},${b[1] - 6}`;
    return { d, ends: [a, b] };
  }
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(58, len * 0.22);
  const cx = (a[0] + b[0]) / 2 + (-dy / len) * bow;
  const cy = (a[1] + b[1]) / 2 + (dx / len) * bow;
  return { d: `M${a[0]},${a[1]} Q${Math.round(cx)},${Math.round(cy)} ${b[0]},${b[1]}`, ends: [a, b] };
}

let cached: RiskMap | null = null;

/**
 * Partition a country's polygons at a longitude. Needed for France, whose
 * world-atlas geometry includes French Guiana an ocean away — every polygon's
 * first arc point tells us which side of the Atlantic it sits on.
 */
function splitAtLongitude(
  topo: Topology,
  geom: Polygon | MultiPolygon,
  lon: number,
): { west: MultiPolygon; east: MultiPolygon } {
  const scale = topo.transform?.scale ?? [1, 1];
  const translate = topo.transform?.translate ?? [0, 0];
  const firstLon = (polyArcs: number[][]): number => {
    const a = polyArcs[0][0];
    const arc = topo.arcs[a < 0 ? ~a : a];
    return arc[0][0] * scale[0] + translate[0];
  };
  const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
  return {
    west: { type: 'MultiPolygon', arcs: polys.filter((p) => firstLon(p) < lon) },
    east: { type: 'MultiPolygon', arcs: polys.filter((p) => firstLon(p) >= lon) },
  };
}

function build(): RiskMap {
  if (cached) return cached;

  const topo = countries110m as unknown as Topology;
  const geometries = (topo.objects.countries as GeometryCollection).geometries;
  const byId = new Map(geometries.map((g) => [String(g.id), g]));

  // France arrives as one geometry spanning two continents: keep the mainland
  // for Western Europe and hand French Guiana to the Guianas ('250-guiana').
  const france = byId.get('250');
  if (france) {
    const { west, east } = splitAtLongitude(topo, france as Polygon | MultiPolygon, -30);
    byId.set('250', east as never);
    byId.set('250-guiana', west as never);
  }

  const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' });
  const path = geoPath(projection);

  const project = (lon: number, lat: number, fallback: [number, number]): [number, number] =>
    projection([lon, lat]) ?? fallback;

  const territories: RenderedTerritory[] = [];

  // Merged country groups.
  for (const def of GROUPS) {
    const parts = def.iso.map((id) => byId.get(id)).filter(Boolean) as (Polygon | MultiPolygon)[];
    if (parts.length === 0) continue;
    const shape = merge(topo, parts);
    const d = path(shape) ?? '';
    let [lx, ly] = path.centroid(shape);
    if (def.labelLon !== undefined && def.labelLat !== undefined) [lx, ly] = project(def.labelLon, def.labelLat, [lx, ly]);
    territories.push({ id: def.id, name: def.name, continentId: def.continentId, path: d, labelX: Math.round(lx), labelY: Math.round(ly) });
  }

  // Split countries: one shared outline, clipped per region.
  const dividers: MapDivider[] = [];
  for (const split of SPLITS) {
    const base = byId.get(split.baseIso);
    if (!base) continue;
    const shape = merge(topo, [base as Polygon | MultiPolygon]);
    const d = path(shape) ?? '';
    for (const sub of split.subs) {
      const [lx, ly] = project(sub.labelLon, sub.labelLat, path.centroid(shape));
      territories.push({
        id: sub.id, name: sub.name, continentId: split.continentId,
        path: d, clip: sub.rects, labelX: Math.round(lx), labelY: Math.round(ly),
      });
    }
    dividers.push({ clip: d, lines: split.dividers });
  }

  // Sea routes connect territory anchors across water.
  const anchor = new Map(territories.map((t) => [t.id, [t.labelX, t.labelY] as [number, number]]));
  const seaRoutes: SeaRoute[] = [];
  for (const [a, b] of SEA_ROUTES) {
    const pa = anchor.get(a);
    const pb = anchor.get(b);
    if (pa && pb) seaRoutes.push(routePath(pa, pb));
  }

  cached = {
    id: 'world',
    name: 'World',
    width: WIDTH,
    height: HEIGHT,
    topology: buildTopology(),
    continents: CONTINENTS,
    territories,
    dividers,
    seaRoutes,
    graticule: path(geoGraticule10()) ?? '',
  };
  return cached;
}

export const worldMap: RiskMapModule = { id: 'world', name: 'World', build };
