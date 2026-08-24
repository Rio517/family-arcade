import { useEffect, useRef, useState, type ReactNode } from 'react';

const MINIMUM_WIDTH = 960;
const MINIMUM_HEIGHT = 600;

function supportsCaribbeanPlayfield(): boolean {
  if (typeof window === 'undefined') return true;
  const { innerWidth: width, innerHeight: height } = window;
  return width >= MINIMUM_WIDTH && height >= MINIMUM_HEIGHT && width >= height;
}

export function MinimumScreenGate({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState(supportsCaribbeanPlayfield);
  const noticeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => setSupported(supportsCaribbeanPlayfield());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!supported) noticeRef.current?.focus();
  }, [supported]);

  if (supported) return <>{children}</>;

  return (
    <section
      ref={noticeRef}
      className="caribbean-minimum-screen"
      data-testid="caribbean-minimum-screen"
      role="alert"
      tabIndex={-1}
    >
      <p>Caribbean Career needs a 960 × 600 playfield. Use a larger landscape display.</p>
    </section>
  );
}
