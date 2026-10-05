/**
 * The small pieces the play-together screens share: a hole with googly eyes,
 * the four letter tiles, the round back button and the icons, all drawn in
 * the Coin-op look (see together.css).
 */
import type { CSSProperties, ReactNode } from 'react';

/** A code is four of these: every letter but I, L and O, so nothing reads like a 1 or a 0. */
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/** Each tile has its own colour band along the top. */
const TILE_COLOURS = ['var(--g-red)', 'var(--g-orange)', '#35d07f', 'var(--g-cyan)'];

const vars = (v: Record<string, string>) => v as CSSProperties;

/**
 * A hole seen from above. Its size comes from where it sits (together.css);
 * `free` is an empty seat, `wait` a friend on the way, `off` one who is away.
 */
export function Hole({ colour, look }: { colour?: string; look?: 'free' | 'wait' | 'off' }) {
  // An empty or away seat is always grey, whatever colour the child had.
  const tinted = colour && look !== 'free' && look !== 'off';
  return (
    <span
      className={`gulp-tg-hole${look ? ` ${look}` : ''}`}
      style={tinted ? vars({ '--hole': colour }) : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * The four letter tiles. `cursor` marks where the next letter goes. A tile
 * row that only illustrates (the question screen) passes `label={null}`.
 */
export function Tiles({
  code,
  cursor = false,
  label,
  testId,
}: {
  code: string;
  cursor?: boolean;
  label?: string | null;
  testId?: string;
}) {
  const letters = code.slice(0, 4);
  const at = cursor && letters.length < 4 ? letters.length : -1;
  const said = label === undefined ? (letters ? letters.split('').join(' ') : 'No letters yet') : label;
  return (
    <span
      className="gulp-tg-code"
      {...(said === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': said })}
      data-testid={testId}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`gulp-tg-ct${letters[i] ? '' : ' empty'}${i === at ? ' cur' : ''}`}
          style={vars({ '--tc': TILE_COLOURS[i] })}
        >
          {letters[i] ?? (i === at ? <i className="gulp-tg-caret" /> : null)}
        </span>
      ))}
    </span>
  );
}

/** Four small tiles inside a line of text, read out as plain letters. */
export function MiniTiles({ code }: { code: string }) {
  return (
    <>
      {code
        .slice(0, 4)
        .split('')
        .map((ch, i) => (
          <span key={i} className="gulp-tg-mini" style={vars({ '--tc': TILE_COLOURS[i] })}>
            {ch}
          </span>
        ))}
    </>
  );
}

function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z" fill="currentColor" />
    </svg>
  );
}

/** A screen's title: a kicker between two rainbow rules, a heading and nothing else. */
export function ScreenTitle({ children }: { children: string }) {
  return (
    <h2 className="gulp-tg-sign">
      <span className="rule l" aria-hidden="true" />
      <span className="t">
        <StarIcon />
        {children}
        <StarIcon />
      </span>
      <span className="rule" aria-hidden="true" />
    </h2>
  );
}

/** The round cyan Back button in its cream bezel. */
export function BackButton({ onBack, className = '', testId }: { onBack: () => void; className?: string; testId?: string }) {
  return (
    <button type="button" className={`gulp-tg-rb ${className}`} onClick={onBack} aria-label="Back" data-testid={testId}>
      <BackIcon />
    </button>
  );
}

// ----- icons: thick line drawings in currentColor -----

function Svg({ size = 24, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const BackIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const ChevIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const DelIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M9 5h11v14H9l-6-7zM13 10l4 4M17 10l-4 4" />
  </Svg>
);
export const CheckIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const CrownIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />
  </Svg>
);
export const LeaveIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M10 4H5v16h5M15 8l4 4-4 4M9 12h10" />
  </Svg>
);
export const PlugIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4" />
  </Svg>
);
