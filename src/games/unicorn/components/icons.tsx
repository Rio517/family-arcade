/**
 * Magic Coins chrome icons — line-style, `currentColor`, emoji-free, matching
 * the shared set in `@shared/ui/icons.tsx` exactly (same svg wrapper, same
 * stroke weight). They live here only because this session owns just the
 * unicorn module; if these ever land in the shared icon file, delete this one
 * and point the imports there.
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

/** A horseshoe magnet — the Coin Magnet power-up. */
export const MagnetIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M8 4v6a4 4 0 0 0 8 0V4" />
      <path d="M5.5 4h5M13.5 4h5" />
      <path d="M8 8h3M13 8h3" />
    </>,
    p,
  );

/** A four-point sparkle — the Sparkle Shield power-up. */
export const SparkleIcon = (p: IconProps) =>
  svg(
    <>
      <path d="M12 4l2.2 5.8L20 12l-5.8 2.2L12 20l-2.2-5.8L4 12l5.8-2.2Z" />
      <path d="M19 3.5v3M17.5 5h3" />
    </>,
    p,
  );

/** A coin with a little sparkle inside — the coins players collect. */
export const CoinIcon = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
    </>,
    p,
  );
