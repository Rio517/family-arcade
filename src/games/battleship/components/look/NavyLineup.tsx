/**
 * The five ships of a navy in side profile, bow to the right, riding one
 * waterline — so the navy cards show the fleet a captain is choosing, not
 * just its names. Classic and modern are drawn apart: funnels, masts and
 * gun turrets for 1942; slab-sided stealth superstructures and missile decks
 * for today. Filled with currentColor; every hull is on a 24-high canvas
 * and its width is its length, so a carrier reads longer than a destroyer.
 */
import type { FleetEra } from '@games/battleship/domain/types';

interface Profile {
  /** Canvas width (the ship's drawn length). */
  w: number;
  /** Filled shapes. */
  fill: string[];
  /** Thin strokes: masts, gun barrels. */
  line?: string[];
}

const CLASSIC: Profile[] = [
  {
    // Shōkaku: a long flight deck over a raked hull, a small island to starboard.
    w: 74,
    fill: ['M3 13 H71 L66 20 H8 Z', 'M0 10.6 H74 V13 H0 Z', 'M47 10.6 V6.2 H52 V10.6 Z', 'M41 10.6 L42 8.4 H45 L45.6 10.6 Z'],
    line: ['M49.5 6.2 V2'],
  },
  {
    // Iowa: superfiring triple turrets forward, a tower bridge, two funnels, one turret aft.
    w: 66,
    fill: [
      'M2 15 H62 L65 13.6 L60 20.5 H7 Q3 19 2 15 Z',
      'M47 15 V12.2 H53 V15 Z',
      'M40 13.4 V10.4 H46 V13.4 Z',
      'M38.5 15 V13.4 H47 V15 Z',
      'M30 15 V7 H32 V3.6 H35 V7 H37 V15 Z',
      'M24 15 V8.6 H27.4 V15 Z',
      'M18.5 15 V9.4 H21.8 V15 Z',
      'M9 15 V12.2 H15 V15 Z',
    ],
    line: ['M53 13.4 L59.5 12.6', 'M46 11.6 L52.5 10.8', 'M9 13.4 L3.5 12.6', 'M33.5 3.6 V0.6', 'M20 9.4 V5'],
  },
  {
    // Cleveland: two turrets fore and aft, a bridge and twin funnels between.
    w: 56,
    fill: [
      'M2 15 H53 L55.5 13.8 L51 20.5 H6 Q3 19 2 15 Z',
      'M41 15 V12.4 H46 V15 Z',
      'M35 13.6 V11 H40 V13.6 Z',
      'M34 15 V13.6 H41 V15 Z',
      'M26 15 V7.6 H28 V5 H30.4 V7.6 H32 V15 Z',
      'M21 15 V9.4 H23.4 V15 Z',
      'M17.4 15 V9.8 H19.6 V15 Z',
      'M11 13.6 V11 H16 V13.6 Z',
      'M10 15 V13.6 H17 V15 Z',
      'M5.5 15 V12.4 H10 V15 Z',
    ],
    line: ['M46 13.6 L51 12.9', 'M40 12.2 L45 11.5', 'M29.2 5 V1.6'],
  },
  {
    // Type VIIC U-boat: decks awash, a conning tower, the deck gun forward of it.
    w: 46,
    fill: ['M3 17 Q3 15 8 15 H40 L45 16.4 L40 19.2 H8 Q3 19.2 3 17 Z', 'M19 15 V9.4 H27 L28.6 15 Z', 'M31 15 V13.4 H33.2 V15 Z'],
    line: ['M32 13.8 L38 12.8', 'M23 9.4 V4.6', 'M25.4 9.4 V6.4'],
  },
  {
    // Fletcher: low and fast, guns fore and aft, a bridge and two funnels.
    w: 42,
    fill: [
      'M2 15 H38 L41 13.8 L37 20 H5 Q2.6 18.6 2 15 Z',
      'M31 15 V12.6 H34 V15 Z',
      'M26.6 13.8 V11.4 H29.6 V13.8 Z',
      'M26 15 V13.8 H30.4 V15 Z',
      'M20 15 V8 H24.4 V15 Z',
      'M15.4 15 V9.6 H17.6 V15 Z',
      'M11.6 15 V10 H13.6 V15 Z',
      'M6 15 V12.6 H9 V15 Z',
    ],
    line: ['M34 13.6 L38 13', 'M29.6 12.4 L33.4 11.8', 'M22.4 8 V3.4', 'M6 13.6 L2.6 13'],
  },
];

const MODERN: Profile[] = [
  {
    // Ford: the flight deck, the island set well aft, jets on deck.
    w: 78,
    fill: [
      'M3 12.6 H75 L70 20 H7 Z',
      'M0 10.2 H78 V12.6 H0 Z',
      'M17 10.2 V5.6 H23 L24.4 10.2 Z',
      'M48 10.2 L50 9.2 H54 L55 10.2 Z',
      'M60 10.2 L62 9.2 H66 L67 10.2 Z',
    ],
    line: ['M20 5.6 V1.2', 'M18.4 3.2 H21.6'],
  },
  {
    // Kirov: a massive slab superstructure, two tall masts, a gun aft.
    w: 70,
    fill: [
      'M2 15 H65 L69 13.4 L63.4 20.6 H7 Q3 19 2 15 Z',
      'M22 15 V9.6 H26 V6 H31 V9 H36 V5.6 H40 V10 H45 V15 Z',
      'M50 15 V12.8 H56 V15 Z',
      'M8 15 V12.4 H13 V15 Z',
    ],
    line: ['M28.4 6 V0.8', 'M38 5.6 V1.8', 'M8 13.6 L3.6 12.9', 'M26.4 3 H30.4'],
  },
  {
    // Type 055: a smooth pyramid of a mast, a hangar aft, one gun forward.
    w: 62,
    fill: [
      'M2 15 H58 L61.6 13.4 L56.4 20.6 H6 Q3 19 2 15 Z',
      'M25 15 L27.4 8.6 L30.2 3.4 H34 L36.6 8.6 L41 10.6 L44 15 Z',
      'M11 15 L12.4 10.4 H21.6 L22.6 15 Z',
      'M48.6 15 V12.6 H52 V15 Z',
    ],
    line: ['M52 13.6 L57.6 12.8', 'M32 3.4 V0.6'],
  },
  {
    // Virginia: a long black whale-back with only the sail proud of the water.
    w: 56,
    fill: ['M3 17 Q3 14.2 9 14.2 H47 Q54 14.6 54.6 16.8 Q54 19.2 47 19.2 H9 Q3 19.2 3 17 Z', 'M33 14.2 V8.4 Q33 7.6 34 7.6 H39.4 L41 14.2 Z', 'M2.4 17 L0.6 12.6 L4.4 15.2 Z'],
    line: ['M35 7.6 V3.6', 'M37.6 7.6 V5', 'M33 10.6 H30.4', 'M41 10.6 H43.6'],
  },
  {
    // Hobart: an angled superstructure under one mast, a hangar, the gun forward.
    w: 48,
    fill: [
      'M2 15 H44 L47.4 13.6 L43 20.4 H5 Q2.6 18.8 2 15 Z',
      'M18 15 L19.4 9.2 L22.4 7 H28.4 L30.6 9.2 L32 15 Z',
      'M7.6 15 L8.6 11 H16 V15 Z',
      'M36.6 15 V12.6 H39.6 V15 Z',
    ],
    line: ['M25.4 7 V1.6', 'M39.6 13.6 L44.6 12.8'],
  },
];

/** One navy, five hulls, one waterline. Decorative: the card names the ships. */
export function NavyLineup({ era, height = 30 }: { era: FleetEra; height?: number }) {
  const ships = era === 'modern' ? MODERN : CLASSIC;
  const row = (cls: string) => (
    <span className={cls}>
      {ships.map((s, i) => (
        <svg
          key={i}
          viewBox={`0 0 ${s.w} 24`}
          height={height}
          width={(s.w / 24) * height}
          // Squeezed onto a phone, a hull shrinks but keeps riding the waterline.
          preserveAspectRatio="xMidYMax meet"
          fill="currentColor"
        >
          {s.fill.map((d, j) => (
            <path key={`f${j}`} d={d} />
          ))}
          {s.line?.map((d, j) => (
            <path key={`l${j}`} d={d} fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
          ))}
        </svg>
      ))}
    </span>
  );
  // The second row is the fleet's reflection, for a look that lays the
  // ships on still water (drawn as markup: box-reflect is not everywhere).
  return (
    <span className="lk-navy" aria-hidden="true">
      {row('lk-lineup')}
      {row('lk-lineup lk-lineup-reflect')}
    </span>
  );
}
