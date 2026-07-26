/**
 * A header control that toggles the browser's full-screen mode for the whole
 * app — handy for playing a game on a shared device without the browser chrome.
 *
 * Uses the standard Fullscreen API with a WebKit fallback (older iPad Safari).
 * If the platform doesn't support it at all (e.g. iPhone Safari), the button
 * renders nothing rather than showing a control that does nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import { FullscreenIcon, FullscreenExitIcon } from './icons';

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function isSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FsElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function FullscreenButton({ className = '' }: { className?: string }) {
  const [supported] = useState(isSupported);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const sync = () => setActive(!!fullscreenElement());
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, [supported]);

  const toggle = useCallback(async () => {
    try {
      if (fullscreenElement()) {
        const d = document as FsDocument;
        await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      } else {
        const el = document.documentElement as FsElement;
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* denied (needs a user gesture / not permitted) — leave state as-is */
    }
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`icon-btn fs-btn ${className}`.trim()}
      onClick={toggle}
      aria-label={active ? 'Exit full screen' : 'Full screen'}
      title={active ? 'Exit full screen' : 'Full screen'}
      data-testid="fullscreen-toggle"
    >
      {active ? <FullscreenExitIcon size={20} /> : <FullscreenIcon size={20} />}
    </button>
  );
}
