/**
 * The Region's airport and the port on a bigger map's shore: each laid out
 * in a frame of its own (see `localFrame`), then turned onto its side of
 * the map.
 */
import { BLOCK, PITCH, ROAD, localFrame, type Rect, type Rng, type Side, type Tools } from './common';

/**
 * The airport: a 4×4 square of blocks on one edge of town, its inner streets
 * built over (they are in `City.lots`). The runway runs along the outer
 * edge; a taxiway parallel to it leads across the grass to the apron, where
 * two terminals face each other with a jet at each, and a shuttle train
 * runs between them. The ground draws these; the things on them
 * are ordinary props.
 */
export interface Airfield {
  area: Rect;
  runway: Rect;
  /** Which way the runway runs. */
  along: 'x' | 'z';
  taxiways: Rect[];
  apron: Rect;
  /** Yellow lines painted on the taxiways and the apron: centrelines and lead-ins to the stands. */
  lines: Rect[];
  /** The shuttle train's track between the two terminals. */
  track: Rect;
}

/** The side of town the airport stands on, and its south-west block. */
export interface AirportSite {
  bx: number;
  bz: number;
  side: Side;
}

// -------------------------------------------------------------------------
// The airport
// -------------------------------------------------------------------------

/**
 * Lay out the airport on its 4×4 blocks and build over its inner streets
 * (added to `lots`). Worked out in the airport's own frame: `u` runs along
 * the edge of town, `v` inward from it, both 0 to 166. From the edge in:
 * grass, the runway, grass, the taxiway, grass, then the apron: a terminal
 * at each end facing the other, a jet at each, a hangar and the radar
 * between, and the shuttle train's track along the back.
 */
export function airport(site: AirportSite, half: number, t: Tools, lots: Rect[]): Airfield {
  const { add, variant } = t;
  const S = 4 * BLOCK + 3 * ROAD;
  const x0 = -half + ROAD + site.bx * PITCH;
  const z0 = -half + ROAD + site.bz * PITCH;
  const x1 = x0 + S;
  const z1 = z0 + S;
  const { side } = site;
  // `u` along the edge of town, `v` in from it.
  const { at, rect, facing } =
    side === 'w'
      ? localFrame([x0, z0], [0, 1], [1, 0])
      : side === 'e'
        ? localFrame([x1, z0], [0, 1], [-1, 0])
        : side === 'n'
          ? localFrame([x0, z0], [1, 0], [0, 1])
          : localFrame([x0, z1], [1, 0], [0, -1]);
  const uOf = (x: number, z: number) => (side === 'w' || side === 'e' ? z - z0 : x - x0);

  // The inner streets, built over.
  for (let k = 1; k < 4; k++) {
    const a = k * PITCH - ROAD;
    lots.push({ x0: x0 + a - 0.5, z0, x1: x0 + a + ROAD + 0.5, z1 });
    lots.push({ x0, z0: z0 + a - 0.5, x1, z1: z0 + a + ROAD + 0.5 });
  }

  // Two terminals at the ends of the apron, facing each other across it,
  // each with a jet nosed up to its middle gate; the hangar and the radar
  // between; and the shuttle train's track along the back from one
  // terminal to the other.
  const jets: Array<[number, number]> = [];
  for (const [u, du] of [
    [17, 1],
    [149, -1],
  ] as const) {
    const [tx, tz] = at(u, 128);
    const r = facing(du, 0);
    add('terminal', tx, tz, r);
    const fx = Math.sin(r);
    const fz = Math.cos(r);
    const nose: [number, number] = [tx - 3.5 * fz + 12.5 * fx, tz + 3.5 * fx + 12.5 * fz];
    const jet: [number, number] = [nose[0] + 18 * fx, nose[1] + 18 * fz];
    add('jet', ...jet, r + Math.PI, variant());
    jets.push(jet);
  }
  add('hangar', ...at(83, 143), facing(0, -1));
  add('hangar', ...at(17, 100), facing(0, -1));
  add('radar', ...at(156, 100), facing(0, -1));
  const track = rect(10, 155.5, 156, 158.5);
  for (const u of [40, 112]) add('train', ...at(u, 157), facing(1, 0));

  // Yellow lines: down the taxiway and its links, up the lane to the apron,
  // and along to each stand.
  const w = 0.35;
  // The links to the runway join it just past the numbers at each end.
  const lines = [
    rect(36, 44 - w, 130, 44 + w),
    rect(36 - w, 28, 36 + w, 44),
    rect(130 - w, 28, 130 + w, 44),
    rect(83 - w, 44, 83 + w, 128),
    rect(Math.min(...jets.map(([x, z]) => uOf(x, z))) - 18, 128 - w, Math.max(...jets.map(([x, z]) => uOf(x, z))) + 18, 128 + w),
  ];
  // The parallel taxiway, its links to the runway, and a lane up the middle of the apron.
  const taxiways = [rect(32, 40, 134, 48), rect(32, 28, 40, 40), rect(126, 28, 134, 40), rect(79, 48, 87, 128)];
  return {
    area: { x0, z0, x1, z1 },
    runway: rect(8, 12, 158, 28),
    along: side === 'n' || side === 's' ? 'x' : 'z',
    taxiways,
    apron: rect(2.5, 90, 163.5, 163.5),
    lines,
    track,
  };
}

// -------------------------------------------------------------------------
// The sea and the port
// -------------------------------------------------------------------------

/** A second shore: east, west or south (the north is always sea). */
export function pick3(rng: Rng): Side {
  return (['e', 'w', 's'] as const)[Math.floor(rng() * 3)];
}

/**
 * The port on a shore, in the countryside ring beside the country road that
 * reaches that shore. Worked out along the shore (`u`) and inland from it
 * (`v`): a concrete quay with cranes at its edge, their booms out over the
 * water, ships moored alongside, rows of containers and warehouses behind.
 * Returns the quay (for the ground) and the ground it takes (for the
 * countryside to keep off).
 */
export function harbour(side: Side, land: number, mid: number, t: Tools): { quay: Rect; yard: Rect; side: Side } {
  const { add, rng, variant } = t;
  const L = 150;
  const D = 56;
  // Beside the country road, to one side or the other.
  const u0 = rng() < 0.5 ? mid + 14 : mid - 14 - L;
  // `u` along the shore, `v` inland from it.
  const { at, rect, facing } =
    side === 'e'
      ? localFrame([land, 0], [0, 1], [-1, 0])
      : side === 'w'
        ? localFrame([-land, 0], [0, 1], [1, 0])
        : side === 's'
          ? localFrame([0, land], [1, 0], [0, -1])
          : localFrame([0, -land], [1, 0], [0, 1]);
  const toSea = facing(0, -1);
  const alongShore = facing(1, 0);
  // Cranes on the quay's edge, facing the sea; a ship or two moored alongside.
  for (const u of [30, 72, 114]) add('crane', ...at(u0 + u, 6.5), toSea, variant());
  const ships = t.map === 'region' ? [44, 106] : [70];
  for (const u of ships) add('ship', ...at(u0 + u, -8), alongShore, variant());
  // Containers in rows behind, a gap between each run of six.
  for (let run = 0; run < 5; run++) {
    for (let i = 0; i < 6; i++) {
      for (const v of [18.5, 26]) {
        if (rng() < 0.85) add('container', ...at(u0 + 8 + run * 28 + i * 3, v), toSea, variant());
      }
    }
  }
  // Warehouses at the back, doors to the quay.
  for (const u of [38, 110]) add('warehouse', ...at(u0 + u, 45), toSea, variant());
  return { quay: rect(u0, 0, u0 + L, D), yard: rect(u0 - 4, 0, u0 + L + 4, D + 4), side };
}
