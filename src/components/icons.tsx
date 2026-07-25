/**
 * Inline SVG icon set — emoji-free. All icons are line-style, inherit
 * `currentColor`, and take an optional size. Kept in one place so the whole app
 * shares a single visual language instead of scattering pictographs.
 */
import type { CSSProperties, ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

function svg(children: ReactNode, { size = 24, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ShipIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M3 14h18l-2.2 4.2a2 2 0 0 1-1.8 1.1H7a2 2 0 0 1-1.8-1.1L3 14Z" />
      <path d="M12 3v8M12 6h5l-2 2 2 2h-5" />
    </>,
    p,
  );

export const GridIcon = (p: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.1" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const ResumeIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M4 20v-4h4" />
    </>,
    p,
  );

export const RadarIcon = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 19 6" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </>,
    p,
  );

export const ShieldIcon = (p: IconProps) =>
  svg(<path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.3-7 9-4.1-1.7-7-4.7-7-9V6l7-2.5Z" />, p);

export const TargetIcon = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
    </>,
    p,
  );

export const BoltIcon = (p: IconProps) =>
  svg(<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />, p);

export const RotateIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </>,
    p,
  );

export const ShuffleIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M4 7h3.5l9 10H20M4 17h3.5l3-3.3M13.5 8.3l3-1.3H20" />
      <path d="M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />
    </>,
    p,
  );

export const LockIcon = (p: IconProps) =>
  svg(
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>,
    p,
  );

export const LinkIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 12 6 14a3.5 3.5 0 0 0 5 5l2-2M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
    </>,
    p,
  );

/**
 * A distinct filled emblem per fleet skin, drawn in the skin's colour
 * (`currentColor`, set by the caller). Replaces the old emoji skin icons.
 */
export function SkinGlyph({ id, size = 24, style }: { id: string } & IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    style,
    'aria-hidden': true,
  };
  switch (id) {
    case 'ember': // upward flame
      return (
        <svg {...common}>
          <path d="M12 2c3 3.5 5 6 5 9.5A5 5 0 0 1 7 12c0-1.4.6-2.6 1.5-3.6C8.8 10 10 10.5 10 12c1.2-2 1-4.5 2-10Z" />
        </svg>
      );
    case 'verdant': // hexagon
      return (
        <svg {...common}>
          <path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z" />
        </svg>
      );
    case 'void': // diamond with a void centre
      return (
        <svg {...common}>
          <path d="M12 2 22 12 12 22 2 12 12 2Zm0 6-4 4 4 4 4-4-4-4Z" fillRule="evenodd" />
        </svg>
      );
    case 'solar': // sunburst
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 1.5l1.2 3.2h-2.4L12 1.5Zm0 21-1.2-3.2h2.4L12 22.5ZM1.5 12l3.2-1.2v2.4L1.5 12Zm21 0-3.2 1.2v-2.4L22.5 12ZM4.5 4.5l3.2 1-1.3 1.3-1.9-2.3Zm15 15-3.2-1 1.3-1.3 1.9 2.3Zm0-15-1.9 2.3-1.3-1.3 3.2-1Zm-15 15 1.9-2.3 1.3 1.3-3.2 1Z" />
        </svg>
      );
    case 'phantom': // angular arrowhead
      return (
        <svg {...common}>
          <path d="M12 2 21 20l-9-5-9 5 9-18Z" />
        </svg>
      );
    case 'aqua':
    default: // sleek delta hull
      return (
        <svg {...common}>
          <path d="M12 3 20 19l-8-3.5L4 19 12 3Z" />
        </svg>
      );
  }
}
