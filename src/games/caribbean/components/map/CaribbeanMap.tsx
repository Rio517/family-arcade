import { lazy, Suspense } from 'react';

import type { CaribbeanMapContext } from './caribbeanMapData';
import '../../styles/map-shell.css';

export interface CaribbeanMapProps {
  context: CaribbeanMapContext;
  playerName: string;
  contactVisible: boolean;
  statusLabel?: string;
}

const LazyCaribbeanMapRenderer = lazy(async () => {
  const module = await import('./CaribbeanMapRenderer');
  return { default: module.CaribbeanMapRenderer };
});

export function CaribbeanMap(props: CaribbeanMapProps) {
  return (
    <Suspense fallback={(
      <section
        className={`caribbean-map caribbean-map--maplibre caribbean-map--${props.context}`}
        aria-label="Caribbean nautical chart"
        data-map-context={props.context}
        data-map-phase="loading"
        data-map-render-state="loading"
      >
        <div className="caribbean-map__loading" role="status"><p>Preparing chart room…</p></div>
      </section>
    )}>
      <LazyCaribbeanMapRenderer {...props} />
    </Suspense>
  );
}
