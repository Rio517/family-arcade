/**
 * The city recovers while a round goes on: small things are put back where
 * they stood, and eaten buildings' lots are built on again.
 */
import { KINDS, makeProp, type Prop, type PropKind } from './catalog';
import { placeProp, propsNear } from './space';
import type { World, WorldEvent } from './world';

/**
 * The city puts small things back (up to buses) where they stood, a few at a
 * time and never under anyone's nose, so a long round never runs dry.
 */
const REGROW_TIER = 4;
export const REGROW_EVERY = 0.4;
const REGROW_BATCH = 3;

/**
 * With regrowth on, an eaten building's lot is built on again: first a
 * construction site (cheap to eat) goes up, and if it survives, the new
 * building. The city grows up as the round goes on: early on everything is
 * rebuilt as houses, then shops, then apartment blocks, towers and at last
 * skyscrapers, one rung above what stood there before and never above what
 * the city's age allows. Big sites become stadiums, malls and power plants,
 * and each opening makes the news.
 */
// An eaten tower may come back as a lower, wider office block: a city that
// has been eaten can shrink.
const LADDER: PropKind[] = ['house', 'shop', 'apartment', 'tower', 'office', 'skyscraper'];
/** Buildings that go up through a tall building site first. */
const TALL: PropKind[] = ['tower', 'skyscraper'];
const BIG: PropKind[] = ['factory', 'warehouse', 'mall', 'stadium', 'powerplant'];
/** Seconds from a building being eaten to its construction site appearing. */
const SITE_AFTER = 6;
/** Seconds a construction site stands before the building is finished. */
const SITE_TIME = 16;
/** Every this many seconds of a round, one more rung of the ladder opens. */
const AGE_STEP = 40;
/** Seconds a new building takes to rise in the scene. */
export const BUILD_TIME = 3;
/** Seconds between two news stories, at least. */
export const NEWS_GAP = 12;
/** How far round a lot to look for neighbours a new building could run into. */
const NEIGHBOURS = 60;

const HEADLINE: Partial<Record<PropKind, string>> = {
  stadium: 'A brand-new stadium just opened!',
  mall: 'A giant shopping mall opens its doors!',
  powerplant: 'A new power plant lights up the city!',
  factory: 'A new factory starts work today!',
  warehouse: 'A huge new warehouse is finished!',
  skyscraper: 'The city has a new skyscraper!',
};

export interface Lot {
  x: number;
  z: number;
  rot: number;
  /** The widest footprint that fits: the old building's, plus a little yard. */
  room: number;
  /** Which rung of the ladder the old building stood on (-1 for a big building). */
  rung: number;
  due: number;
  /** The construction site standing on it, once there is one. */
  site: number | null;
}

/**
 * Remember what a hole just ate: a small thing to put back later, a building
 * whose lot will be built on, or a construction site that must start again.
 */
export function markEaten(w: World, p: Prop): void {
  const info = KINDS[p.kind];
  if (p.kind === 'site' || p.kind === 'bigsite' || p.kind === 'tallsite') {
    // The site was eaten: the lot waits a while and starts again.
    const lot = w.lots.find((l) => l.site === p.id);
    if (lot) {
      lot.site = null;
      lot.due = w.elapsed + SITE_AFTER * 2;
    }
  } else if (info.tier <= REGROW_TIER) w.eaten.push(p);
  // A cottage comes back like a house, a big house like a shop: one step up from there.
  const rung = p.kind === 'cottage' ? 0 : p.kind === 'villa' ? 1 : LADDER.indexOf(p.kind);
  if (rung >= 0 || BIG.includes(p.kind)) {
    const room = Math.max(info.w, info.d) + 4;
    w.lots.push({ x: p.x, z: p.z, rot: p.rot, room, rung, due: w.elapsed + SITE_AFTER + w.rng() * 6, site: null });
  }
}

export function regrow(w: World, dt: number, events: WorldEvent[]): void {
  w.regrowIn -= dt;
  if (w.regrowIn > 0 || !w.eaten.length) return;
  w.regrowIn = REGROW_EVERY;
  for (let n = 0; n < REGROW_BATCH && w.eaten.length; n++) {
    const i = Math.floor(w.rng() * w.eaten.length);
    const p = w.eaten[i];
    const seen = w.holes.some((h) => h.alive && Math.hypot(h.x - p.x, h.z - p.z) < h.r + 30);
    if (seen) continue;
    w.eaten.splice(i, 1);
    w.props.set(p.id, p);
    events.push({ type: 'regrow', prop: p });
  }
}

/**
 * Work on the waiting lots, only while no hole is close by: put up a
 * construction site, and later finish it as a new building.
 */
export function rebuild(w: World, events: WorldEvent[]): void {
  for (let i = w.lots.length - 1; i >= 0; i--) {
    const lot = w.lots[i];
    if (lot.due > w.elapsed) continue;
    if (w.holes.some((h) => h.alive && Math.hypot(h.x - lot.x, h.z - lot.z) < h.r + lot.room / 2 + 14)) continue;
    const variant = Math.floor(w.rng() * 8);
    if (lot.site === null) {
      const site = makeProp(w.nextPropId++, lot.rung < 0 && lot.room >= 20 ? 'bigsite' : 'site', lot.x, lot.z, lot.rot, variant);
      placeProp(w, site);
      lot.site = site.id;
      lot.due = w.elapsed + SITE_TIME + w.rng() * 8;
      events.push({ type: 'rebuild', prop: site, replaces: null });
      continue;
    }
    const site = w.props.get(lot.site);
    if (!site) {
      w.lots.splice(i, 1);
      continue;
    }
    const kind = lot.rung < 0 ? bigKind(w, lot) : ladderKind(w, lot);
    // A tall building goes up in stages: the building site, then a frame
    // with a crane on it, then the tower itself.
    if (TALL.includes(kind.kind) && site.kind !== 'tallsite') {
      w.props.delete(site.id);
      const frame = makeProp(w.nextPropId++, 'tallsite', lot.x, lot.z, lot.rot, variant);
      placeProp(w, frame);
      lot.site = frame.id;
      lot.due = w.elapsed + SITE_TIME + w.rng() * 8;
      events.push({ type: 'rebuild', prop: frame, replaces: site });
      continue;
    }
    w.lots.splice(i, 1);
    w.props.delete(site.id);
    const extra = lot.rung < 0 ? 0 : Math.max(0, lot.rung + 1 - LADDER.indexOf(kind.kind));
    const p = makeProp(w.nextPropId++, kind.kind, lot.x, lot.z, lot.rot, variant, kind.hScale ?? Math.min(2, 1 + 0.2 * extra));
    placeProp(w, p);
    events.push({ type: 'rebuild', prop: p, replaces: site });
    const headline = HEADLINE[p.kind] ?? (p.kind === 'tower' && p.hScale >= 1.4 ? 'The city has a new skyscraper!' : undefined);
    if (headline && w.elapsed - w.lastNews >= NEWS_GAP) {
      w.lastNews = w.elapsed;
      events.push({ type: 'news', text: headline, x: p.x, z: p.z });
    }
  }
}

/** One rung above what stood here, no higher than the city's age allows, and it must fit. */
function ladderKind(w: World, lot: Lot): { kind: PropKind; hScale?: number } {
  const age = Math.floor(w.elapsed / AGE_STEP);
  let rung = Math.min(LADDER.length - 1, lot.rung + 1, age);
  while (rung > 0 && (Math.max(KINDS[LADDER[rung]].w, KINDS[LADDER[rung]].d) > lot.room || !clearFor(w, lot, LADDER[rung]))) rung--;
  return { kind: LADDER[rung] };
}

/** Half the width and depth of a building of this kind, turned as it stands. */
function extent(kind: PropKind, rot: number): [number, number] {
  const info = KINDS[kind];
  return Math.abs(Math.sin(rot)) > 0.5 ? [info.d / 2, info.w / 2] : [info.w / 2, info.d / 2];
}

/**
 * Whether a building of this kind fits on the lot without running into the
 * buildings next door: in a terrace, an eaten house comes back as a taller
 * house, not an apartment block through its neighbours' walls.
 */
function clearFor(w: World, lot: Lot, kind: PropKind): boolean {
  const [hw, hd] = extent(kind, lot.rot);
  for (const p of propsNear(w, lot.x, lot.z, NEIGHBOURS)) {
    if (p.id === lot.site || KINDS[p.kind].tier < 5 || KINDS[p.kind].wonder) continue;
    const dx = Math.abs(p.x - lot.x);
    const dz = Math.abs(p.z - lot.z);
    if (dx > NEIGHBOURS || dz > NEIGHBOURS) continue;
    const [pw, pd] = extent(p.kind, p.rot);
    // A little overlap is fine: the models are rounded and stand inside their outlines.
    if (dx < hw + pw - 0.5 && dz < hd + pd - 0.5) return false;
  }
  return true;
}

/** A big lot gets something big: the bigger the lot and the older the city, the grander. */
function bigKind(w: World, lot: Lot): { kind: PropKind; hScale?: number } {
  const fits = BIG.filter((k) => Math.max(KINDS[k].w, KINDS[k].d) <= lot.room && clearFor(w, lot, k));
  const grand = fits.filter((k) => KINDS[k].tier >= 8);
  const pool = w.elapsed > AGE_STEP * 2 && grand.length ? grand : fits.length ? fits : (['warehouse'] as PropKind[]);
  return { kind: pool[Math.floor(w.rng() * pool.length)] };
}
