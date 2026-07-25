/**
 * Side-profile SVG silhouettes for each ship type, shown in the fleet sidebar.
 * Filled with `currentColor` (the fleet skin colour) and sized proportionally
 * to the ship's length so a Carrier reads as clearly longer than a Destroyer.
 */
import type { CSSProperties } from 'react';
import type { ShipId } from '../game/types';

interface ShipProfileProps {
  shipId: ShipId;
  height?: number;
  style?: CSSProperties;
}

// Each profile is drawn on a 24-tall canvas; width scales with the ship size.
const PROFILES: Record<ShipId, { w: number; body: JSX.Element }> = {
  carrier: {
    w: 62,
    body: (
      <>
        <path d="M3 15 H60 L55 21 H8 Z" />
        <path d="M5 15 H60 V11 H10 Z" />
        <path d="M42 11 H47 V6 H43 Z" />
        <path d="M44 6 V2" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
  battleship: {
    w: 50,
    body: (
      <>
        <path d="M3 15 H47 L42 21 H8 Z" />
        <path d="M9 15 H15 L14 11 H10 Z" />
        <path d="M33 15 H39 L38 12 H34 Z" />
        <path d="M20 15 H28 L27 6 H21 Z" />
        <path d="M24 6 V2" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
  cruiser: {
    w: 38,
    body: (
      <>
        <path d="M3 15 H35 L31 21 H7 Z" />
        <path d="M8 15 H13 L12 12 H9 Z" />
        <path d="M17 15 H24 L23 8 H18 Z" />
        <path d="M20 8 V3" stroke="currentColor" strokeWidth="1.3" />
      </>
    ),
  },
  submarine: {
    w: 38,
    body: (
      <>
        <path d="M4 16 Q4 20 9 20 H29 Q35 20 35 15 Q35 13 30 13 H8 Q4 13 4 16 Z" />
        <path d="M17 13 H23 L22 7 H18 Z" />
        <path d="M20 7 V3" stroke="currentColor" strokeWidth="1.3" />
      </>
    ),
  },
  destroyer: {
    w: 26,
    body: (
      <>
        <path d="M3 15 H23 L19 21 H7 Z" />
        <path d="M10 15 H16 L15 9 H11 Z" />
        <path d="M13 9 V4" stroke="currentColor" strokeWidth="1.3" />
      </>
    ),
  },
};

/**
 * Top-down ship silhouette sized to span its cells on the board. Drawn along a
 * `size*10 × 10` canvas (rotated for vertical ships) and stretched to fill the
 * grid-placed overlay. Shapes vary enough to tell ships apart: the carrier is a
 * long flat deck, the submarine a rounded capsule, the rest pointed-bow hulls
 * with a turret count that scales with length.
 */
export function ShipTopDown({
  shipId,
  size,
  orientation,
  style,
}: {
  shipId: ShipId;
  size: number;
  orientation: 'H' | 'V';
  style?: CSSProperties;
}) {
  const L = size * 10;
  const horiz = orientation === 'H';
  // along = position down the ship's length, across = beam (0..10).
  const xy = (along: number, across: number) => (horiz ? `${along} ${across}` : `${across} ${along}`);

  let hull: string;
  const details: JSX.Element[] = [];
  const deck = `M ${xy(L * 0.3, 5)} L ${xy(L * 0.7, 5)}`;

  if (shipId === 'carrier') {
    hull = `M ${xy(1, 1.8)} L ${xy(L - 1.5, 1.8)} Q ${xy(L - 0.2, 5)} ${xy(L - 1.5, 8.2)} L ${xy(1, 8.2)} Q ${xy(-0.2, 5)} ${xy(1, 1.8)} Z`;
    // flight-deck centerline + a small island tower
    details.push(<path key="rw" d={`M ${xy(2, 5)} L ${xy(L - 3, 5)}`} stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />);
    details.push(<rect key="is" {...islandRect(L, horiz)} fill="rgba(0,0,0,0.32)" rx={0.6} />);
  } else if (shipId === 'submarine') {
    hull = `M ${xy(5, 2.4)} L ${xy(L - 5, 2.4)} Q ${xy(L - 0.4, 5)} ${xy(L - 5, 7.6)} L ${xy(5, 7.6)} Q ${xy(0.4, 5)} ${xy(5, 2.4)} Z`;
    details.push(<circle key="ct" {...dot(L * 0.5, 5, horiz)} r={1.6} fill="rgba(0,0,0,0.3)" />);
  } else {
    // pointed-bow hull (bow at the far/along end)
    hull = `M ${xy(1.4, 2.4)} L ${xy(L - 5, 2.4)} L ${xy(L - 0.6, 5)} L ${xy(L - 5, 7.6)} L ${xy(1.4, 7.6)} Q ${xy(-0.1, 5)} ${xy(1.4, 2.4)} Z`;
    const turrets = size >= 4 ? [0.32, 0.6] : [0.42];
    turrets.forEach((f, i) => details.push(<circle key={`t${i}`} {...dot(L * f, 5, horiz)} r={1.3} fill="rgba(0,0,0,0.3)" />));
  }

  return (
    <svg
      viewBox={horiz ? `0 0 ${L} 10` : `0 0 10 ${L}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      fill="currentColor"
      style={style}
      aria-hidden="true"
    >
      <path d={hull} />
      <path d={deck} stroke="rgba(0,0,0,0.32)" strokeWidth={0.8} fill="none" />
      {details}
    </svg>
  );
}

function dot(along: number, across: number, horiz: boolean) {
  return horiz ? { cx: along, cy: across } : { cx: across, cy: along };
}
function islandRect(L: number, horiz: boolean) {
  const along = L * 0.62;
  return horiz
    ? { x: along, y: 5.4, width: L * 0.14, height: 2.4 }
    : { x: 5.4, y: along, width: 2.4, height: L * 0.14 };
}

export function ShipProfile({ shipId, height = 22, style }: ShipProfileProps) {
  const { w, body } = PROFILES[shipId];
  return (
    <svg
      height={height}
      viewBox={`0 0 ${w} 24`}
      width={(w / 24) * height}
      fill="currentColor"
      stroke="none"
      style={style}
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
