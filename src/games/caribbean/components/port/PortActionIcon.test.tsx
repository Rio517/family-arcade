import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PortActionIcon, type PortActionIconName } from './PortActionIcon';

const NAMES = ['governor', 'tavern', 'market', 'shipyard', 'shares', 'log', 'set-sail'] as const satisfies readonly PortActionIconName[];

describe('<PortActionIcon>', () => {
  it('renders a deterministic decorative line icon for every port action', () => {
    for (const name of NAMES) {
      const { container, unmount } = render(<PortActionIcon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('data-port-icon', name);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
      expect(svg?.querySelectorAll('path, circle, line, polyline').length).toBeGreaterThan(0);
      unmount();
    }
  });
});
