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
  | 'garbagetruck'
  | 'icecreamvan'
  // A big construction site, where a stadium or a factory will go up.
  | 'bigsite'
  // A tower going up: a frame and a crane, the step before a tall building.
  | 'tallsite'
  // Tier 5: houses and shops (small, middling and big houses).
  | 'cottage'
  | 'house'
  | 'villa'
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
  // People doing things: sitting on benches, walking dogs, police.
  | 'sitter'
  | 'dog'
  | 'police'
  | 'policecar'
  // Playgrounds and the dog park.
  | 'swings'
  | 'slide'
  | 'seesaw'
  | 'sandbox'
  | 'climber'
  | 'carousel'
  | 'agility'
  | 'picnic'
  | 'hoop'
  // The port on a bigger map's shore.
  | 'crane'
  | 'ship'
  // A military base (Region), and the bomber that flies over big holes.
  | 'tank'
  | 'helicopter'
  | 'watchtower'
  | 'barracks'
  | 'radar'
  | 'hangar'
  | 'bomber'
  // Wonders: famous landmarks worth a big bonus.
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
  garbagetruck: { tier: 4, w: 2.6, d: 7.0, h: 3.4, variants: 2 },
  icecreamvan: { tier: 4, w: 2.4, d: 5.6, h: 3.4, variants: 2, food: 'treat' },
  bigsite: { tier: 4, w: 20.0, d: 20.0, h: 12.0, variants: 1 },
  tallsite: { tier: 6, w: 12.0, d: 12.0, h: 28.0, variants: 2 },
  cottage: { tier: 5, w: 6.0, d: 6.0, h: 5.0, variants: 4 },
  house: { tier: 5, w: 8.0, d: 8.0, h: 7.0, variants: 4, scales: true },
  villa: { tier: 5, w: 10.0, d: 9.5, h: 8.0, variants: 3 },
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
  windturbine: { tier: 8, w: 23.0, d: 12.0, h: 48.0, variants: 1 },
  jet: { tier: 8, w: 34.0, d: 36.0, h: 11.0, variants: 2 },
  skyscraper: { tier: 9, w: 22.0, d: 22.0, h: 110.0, variants: 3, scales: true },
  tvtower: { tier: 9, w: 22.0, d: 22.0, h: 140.0, variants: 1 },
  terminal: { tier: 9, w: 36.0, d: 30.0, h: 16.0, variants: 1 },
  mountain: { tier: 10, w: 38.0, d: 38.0, h: 45.0, variants: 2 },
  sitter: { tier: 0, w: 0.8, d: 1.0, h: 1.3, variants: 6 },
  dog: { tier: 0, w: 0.5, d: 1.0, h: 0.7, variants: 4 },
  police: { tier: 0, w: 0.8, d: 0.6, h: 1.8, variants: 1 },
  policecar: { tier: 3, w: 2.0, d: 4.2, h: 1.9, variants: 1 },
  swings: { tier: 2, w: 4.0, d: 2.0, h: 2.6, variants: 2 },
  slide: { tier: 2, w: 1.6, d: 4.5, h: 2.8, variants: 2 },
  seesaw: { tier: 1, w: 0.6, d: 3.6, h: 0.9, variants: 2 },
  sandbox: { tier: 1, w: 3.0, d: 3.0, h: 0.5, variants: 1 },
  climber: { tier: 2, w: 3.0, d: 3.0, h: 2.5, variants: 2 },
  carousel: { tier: 2, w: 3.2, d: 3.2, h: 1.6, variants: 2 },
  agility: { tier: 1, w: 3.0, d: 1.0, h: 1.2, variants: 2 },
  picnic: { tier: 1, w: 2.2, d: 1.8, h: 0.9, variants: 2 },
  hoop: { tier: 2, w: 1.2, d: 1.8, h: 3.4, variants: 1 },
  crane: { tier: 7, w: 10.0, d: 12.0, h: 26.0, variants: 2 },
  ship: { tier: 8, w: 12.0, d: 44.0, h: 14.0, variants: 2 },
  watchtower: { tier: 2, w: 3.0, d: 3.0, h: 7.0, variants: 1 },
  tank: { tier: 4, w: 3.4, d: 6.4, h: 2.6, variants: 2 },
  helicopter: { tier: 4, w: 10.0, d: 12.0, h: 3.4, variants: 1 },
  barracks: { tier: 5, w: 12.0, d: 7.0, h: 5.0, variants: 2 },
  radar: { tier: 6, w: 8.0, d: 8.0, h: 12.0, variants: 1 },
  hangar: { tier: 7, w: 22.0, d: 18.0, h: 10.0, variants: 1 },
  // Never stands in the city: only flies over it (see three/effects.ts).
  bomber: { tier: 8, w: 30.0, d: 24.0, h: 7.0, variants: 1 },
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
 * How big a thing is to swallow: half the diagonal of its footprint (the
 * smallest circle round it), a little under, since things tip in. A hole
 * swallows a thing it covers on screen, whatever its tier: a thin lamp post
 * fits a small mouth, a wide stadium needs a huge one.
 */
export function footSize(kind: PropKind, hScale = 1): number {
  const info = KINDS[kind];
  // A taller building is a little harder to swallow (and worth more) than a low one.
  const tall = info.scales ? 1 + (hScale - 1) * 0.2 : 1;
  return Math.hypot(info.w, info.d) * 0.5 * 0.85 * tall;
}

/**
 * The level ladder: each rung opens when the hole can swallow the kind that
 * names it. The rungs follow the same footprint measure as swallowing, so
 * "Next: Buses" means the next bus will fit.
 */
export const LEVELS: Array<{ size: number; label: string }> = (
  [
    ['cone', 'Cones'],
    ['bench', 'Benches'],
    ['tree', 'Trees'],
    ['car', 'Cars'],
    ['van', 'Vans'],
    ['cottage', 'Little houses'],
    ['bus', 'Buses'],
    ['house', 'Houses'],
    ['villa', 'Big houses'],
    ['tower', 'Towers'],
    ['factory', 'Factories'],
    ['skyscraper', 'Skyscrapers'],
    ['stadium', 'Stadiums'],
    ['mountain', 'Mountains'],
  ] as Array<[PropKind, string]>
)
  .map(([kind, label]) => ({ size: footSize(kind), label }))
  .sort((a, b) => a.size - b.size);

/**
 * What a thing is worth follows its swallow size: bigger is worth more, and
 * the steps between kinds grow as they get bigger. Anchored on well-known
 * kinds and filled in smoothly between them (on a log scale).
 */
const WORTH: Array<[number, number]> = (
  [
    ['cone', 1],
    ['bench', 2],
    ['tree', 4],
    ['car', 8],
    ['bus', 20],
    ['house', 45],
    ['tower', 120],
    ['factory', 400],
    ['skyscraper', 900],
    ['stadium', 2500],
    ['mountain', 6000],
  ] as Array<[PropKind, number]>
).map(([kind, points]) => [Math.log(footSize(kind)), Math.log(points)]);

export function worthOf(size: number): number {
  const x = Math.log(Math.max(0.05, size));
  let i = 0;
  while (i < WORTH.length - 2 && x > WORTH[i + 1][0]) i++;
  const [x0, y0] = WORTH[i];
  const [x1, y1] = WORTH[i + 1];
  return Math.max(1, Math.round(Math.exp(y0 + ((x - x0) * (y1 - y0)) / (x1 - x0))));
}

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

/** A new thing of a kind: sized by its footprint, scored by its tier. */
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
  const size = footSize(kind, hScale);
  return {
    id,
    kind,
    variant: variant % info.variants,
    x,
    z,
    rot,
    size,
    points: info.wonder ? info.wonder.bonus : worthOf(size),
    hScale: info.scales ? hScale : 1,
  };
}
