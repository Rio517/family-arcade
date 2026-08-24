import { useState } from 'react';

import bridgetownArt from '../../assets/bridgetown-1675.webp';

type ArtState = 'loading' | 'loaded' | 'fallback';

export function PortBackdrop(): JSX.Element {
  const [state, setState] = useState<ArtState>('loading');

  return (
    <div
      className={`caribbean-port-backdrop caribbean-port-backdrop--${state}`}
      data-testid="caribbean-port-backdrop"
      aria-hidden="true"
    >
      <img
        alt=""
        aria-hidden="true"
        data-testid="caribbean-port-art"
        src={bridgetownArt}
        onLoad={() => setState('loaded')}
        onError={() => setState('fallback')}
      />
    </div>
  );
}
