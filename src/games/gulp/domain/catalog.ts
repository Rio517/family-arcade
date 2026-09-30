/**
 * Everything in Gulp Universe that a hole can eat, from a traffic cone to a
 * tower block, and what it takes to eat it.
 *
 * A thing's `size` is the smallest hole radius, times FIT, that can swallow
 * it. Things come in tiers: a new tier opens at each level, so the level
 * meter can say what is next ("Next: Cars"). The 3D kit (three/props.ts)
 * draws each kind to the footprint and height given here, so the rules and
 * the picture agree on how big a thing is.
 */

export type PropKind =
  // Tier 0: small street things, and the people walking past them.
  | 'person'
  | 'cone'
  | 'hydrant'
  | 'bin'
  | 'mailbox'
  | 'planter'
  // Tier 1: a bit bigger.
  | 'bench'
  | 'bush'
  | 'bike'
  | 'haybale'
  // A construction site: what stands on an eaten lot until the new building is up.
  | 'site'
  // Tier 2: trees and tall thin things.
  | 'tree'
  | 'pine'
  | 'lamp'
  | 'cafe'
  | 'rock'
  | 'fruitstand'
  // Tier 3: cars.
  | 'car'
  | 'taxi'
  | 'cart'
  | 'tractor'
  // Tier 4: big vehicles and park pieces.
  | 'van'
  | 'bus'
  | 'fountain'
  | 'kiosk'
  | 'container'
  | 'tanker'
  // A big construction site, where a stadium or a factory will go up.
  | 'bigsite'
  // Tier 5: houses and shops.
  | 'house'
  | 'shop'
  // Tier 6: tall buildings.
  | 'apartment'
  | 'tower'
  // Tier 7: factories and farms.
  | 'factory'
  | 'warehouse'
  | 'watertower'
  | 'barn'
  | 'chemplant'
  // Tier 8: stadiums and power.
  | 'stadium'
  | 'powerplant'
  | 'mall'
  | 'windturbine'
  | 'jet'
  // Tier 9: skyscrapers.
  | 'skyscraper'
  | 'tvtower'
  | 'terminal'
  // Tier 10: mountains.
  | 'mountain'
  // Wonders: famous-landmark-inspired things worth a big bonus.
  | 'liberty'
  | 'megaspire'
  | 'irontower'
  | 'pyramid'
  | 'clocktower'
  | 'leaning'
  | 'colosseum'
  | 'opera'
  | 'onion'
  | 'pearlpalace'
  | 'stonecircle'
  | 'moai';

export interface KindInfo {
  tier: number;
  /** Footprint, in world units, before any per-thing scale: width (x) by depth (z). */
  w: number;
  d: number;
  /** Height, in world units. */
  h: number;
  /** Colour variants the kit draws (a thing's `variant` is below this). */
  variants: number;
  /** Buildings come in different heights (a thing's `hScale`). */
  scales?: boolean;
  /** Eating it hurts: a chemical plant shrinks the hole. */
  hazard?: boolean;
  /** Food: a treat says "Yum!"; healthy food gives a health bonus. */
  food?: 'treat' | 'healthy';
  /** A wonder: its name, and the bonus it scores (instead of its tier's points). */
  wonder?: { name: string; bonus: number };
}

/** A hole swallows a thing when `thing.size <= hole.r * FIT`. */
export const FIT = 0.92;

export const KINDS: Record<PropKind, KindInfo> = {
  person: { tier: 0, w: 0.8, d: 0.6, h: 1.7, variants: 6 },
  cone: { tier: 0, w: 0.6, d: 0.6, h: 0.8, variants: 1 },
  hydrant: { tier: 0, w: 0.6, d: 0.6, h: 0.9, variants: 2 },
  bin: { tier: 0, w: 0.8, d: 0.8, h: 1.1, variants: 2 },
  mailbox: { tier: 0, w: 0.7, d: 0.6, h: 1.3, variants: 1 },
  planter: { tier: 0, w: 0.9, d: 0.9, h: 1.0, variants: 3 },
  bench: { tier: 1, w: 2.0, d: 0.8, h: 1.0, variants: 2 },
  bush: { tier: 1, w: 1.6, d: 1.6, h: 1.3, variants: 2 },
  bike: { tier: 1, w: 0.5, d: 1.8, h: 1.1, variants: 3 },
  haybale: { tier: 1, w: 1.6, d: 1.6, h: 1.4, variants: 1, food: 'healthy' },
  site: { tier: 1, w: 8.0, d: 8.0, h: 5.0, variants: 2 },
  tree: { tier: 2, w: 2.8, d: 2.8, h: 5.0, variants: 3 },
  pine: { tier: 2, w: 2.4, d: 2.4, h: 5.5, variants: 2 },
  lamp: { tier: 2, w: 0.6, d: 1.6, h: 5.0, variants: 1 },
  cafe: { tier: 2, w: 2.4, d: 2.4, h: 2.6, variants: 3, food: 'treat' },
  rock: { tier: 2, w: 2.4, d: 2.4, h: 1.6, variants: 1 },
  fruitstand: { tier: 2, w: 2.6, d: 1.8, h: 2.4, variants: 2, food: 'healthy' },
  car: { tier: 3, w: 2.0, d: 4.2, h: 1.6, variants: 5 },
  taxi: { tier: 3, w: 2.0, d: 4.2, h: 1.7, variants: 1 },
  cart: { tier: 3, w: 1.8, d: 3.0, h: 2.4, variants: 2, food: 'treat' },
  tractor: { tier: 3, w: 2.2, d: 3.6, h: 2.4, variants: 2 },
  van: { tier: 4, w: 2.4, d: 5.6, h: 2.8, variants: 3 },
  bus: { tier: 4, w: 2.6, d: 9.0, h: 3.2, variants: 2 },
  fountain: { tier: 4, w: 6.0, d: 6.0, h: 2.8, variants: 1 },
  kiosk: { tier: 4, w: 4.0, d: 3.2, h: 3.2, variants: 3 },
  container: { tier: 4, w: 2.6, d: 6.4, h: 2.6, variants: 4 },
  tanker: { tier: 4, w: 2.6, d: 8.0, h: 3.2, variants: 1 },
  bigsite: { tier: 4, w: 20.0, d: 20.0, h: 12.0, variants: 1 },
  house: { tier: 5, w: 8.0, d: 8.0, h: 7.0, variants: 4, scales: true },
  shop: { tier: 5, w: 10.0, d: 8.0, h: 6.0, variants: 4, scales: true },
  apartment: { tier: 6, w: 12.0, d: 12.0, h: 18.0, variants: 4, scales: true },
  tower: { tier: 6, w: 12.0, d: 12.0, h: 30.0, variants: 3, scales: true },
  factory: { tier: 7, w: 20.0, d: 16.0, h: 12.0, variants: 2 },
  warehouse: { tier: 7, w: 24.0, d: 14.0, h: 9.0, variants: 3 },
  watertower: { tier: 7, w: 9.0, d: 9.0, h: 22.0, variants: 2 },
  barn: { tier: 7, w: 14.0, d: 10.0, h: 10.0, variants: 2, food: 'healthy' },
  chemplant: { tier: 7, w: 22.0, d: 18.0, h: 16.0, variants: 1, hazard: true },
  stadium: { tier: 8, w: 36.0, d: 30.0, h: 14.0, variants: 2 },
  powerplant: { tier: 8, w: 34.0, d: 26.0, h: 30.0, variants: 1 },
  mall: { tier: 8, w: 34.0, d: 28.0, h: 12.0, variants: 3 },
  // The rotor faces +z, so the blades set the width.
  windturbine: { tier: 8, w: 23.0, d: 6.0, h: 48.0, variants: 1 },
  jet: { tier: 8, w: 34.0, d: 36.0, h: 11.0, variants: 2 },
  skyscraper: { tier: 9, w: 22.0, d: 22.0, h: 110.0, variants: 3, scales: true },
  tvtower: { tier: 9, w: 14.0, d: 14.0, h: 140.0, variants: 1 },
  terminal: { tier: 9, w: 36.0, d: 30.0, h: 16.0, variants: 1 },
  mountain: { tier: 10, w: 38.0, d: 38.0, h: 45.0, variants: 2 },
  liberty: { tier: 8, w: 12.0, d: 12.0, h: 46.0, variants: 1, wonder: { name: 'the Statue of Liberty', bonus: 50000 } },
  megaspire: { tier: 10, w: 24.0, d: 24.0, h: 220.0, variants: 1, wonder: { name: 'the Burj Khalifa', bonus: 45000 } },
  irontower: { tier: 9, w: 26.0, d: 26.0, h: 90.0, variants: 1, wonder: { name: 'the Eiffel Tower', bonus: 30000 } },
  pyramid: { tier: 9, w: 28.0, d: 28.0, h: 18.0, variants: 1, wonder: { name: 'the Great Pyramid of Giza', bonus: 25000 } },
  pearlpalace: { tier: 9, w: 26.0, d: 26.0, h: 30.0, variants: 1, wonder: { name: 'the Taj Mahal', bonus: 25000 } },
  colosseum: { tier: 8, w: 28.0, d: 24.0, h: 14.0, variants: 1, wonder: { name: 'the Colosseum', bonus: 20000 } },
  opera: { tier: 8, w: 28.0, d: 20.0, h: 16.0, variants: 1, wonder: { name: 'the Sydney Opera House', bonus: 18000 } },
  onion: { tier: 8, w: 22.0, d: 22.0, h: 30.0, variants: 1, wonder: { name: "St Basil's Cathedral", bonus: 15000 } },
  clocktower: { tier: 7, w: 10.0, d: 10.0, h: 55.0, variants: 1, wonder: { name: 'Big Ben', bonus: 12000 } },
  leaning: { tier: 7, w: 9.0, d: 9.0, h: 32.0, variants: 1, wonder: { name: 'the Leaning Tower of Pisa', bonus: 10000 } },
  stonecircle: { tier: 6, w: 22.0, d: 22.0, h: 6.0, variants: 1, wonder: { name: 'Stonehenge', bonus: 8000 } },
  moai: { tier: 6, w: 20.0, d: 10.0, h: 9.0, variants: 1, wonder: { name: 'the Easter Island Heads', bonus: 8000 } },
};

/**
 * Each tier's `size`: the swallow size of every thing in it, and what the
 * level meter names when that tier is next. Tier 0 and 1 are open from the
 * start.
 */
export const TIERS: Array<{ size: number; points: number; label: string }> = [
  { size: 0.6, points: 1, label: 'Cones' },
  { size: 1.3, points: 2, label: 'Benches' },
  { size: 2.0, points: 4, label: 'Trees' },
  { size: 2.8, points: 8, label: 'Cars' },
  { size: 5.0, points: 20, label: 'Buses' },
  { size: 6.5, points: 45, label: 'Houses' },
  { size: 9.5, points: 120, label: 'Towers' },
  { size: 14.0, points: 400, label: 'Factories' },
  { size: 23.0, points: 1200, label: 'Stadiums' },
  { size: 27.0, points: 3500, label: 'Skyscrapers' },
  { size: 33.0, points: 9000, label: 'Mountains' },
];

/** One thing in the city. */
export interface Prop {
  id: number;
  kind: PropKind;
  /** Which colour the kit draws. */
  variant: number;
  x: number;
  z: number;
  /** Turn about the vertical axis, radians. */
  rot: number;
  /** Swallow size (see FIT). */
  size: number;
  points: number;
  /** Buildings vary in height: this multiplies the kind's `h`. */
  hScale: number;
}

/** A new thing of a kind, sized and scored by its tier. */
export function makeProp(
  id: number,
  kind: PropKind,
  x: number,
  z: number,
  rot: number,
  variant = 0,
  hScale = 1,
): Prop {
  const info = KINDS[kind];
  const tier = TIERS[info.tier];
  // Taller buildings are worth a little more and need a slightly bigger hole.
  const extra = info.scales ? (hScale - 1) * 0.5 : 0;
  return {
    id,
    kind,
    variant: variant % info.variants,
    x,
    z,
    rot,
    size: tier.size * (1 + extra * 0.2),
    points: info.wonder ? info.wonder.bonus : Math.round(tier.points * (1 + extra)),
    hScale: info.scales ? hScale : 1,
  };
}
