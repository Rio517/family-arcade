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
