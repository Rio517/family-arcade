import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BattleShortcutLegend } from './BattleShortcutLegend';

describe('BattleShortcutLegend', () => {
  it('names every battle shortcut visibly and once in its screen-reader summary', () => {
    render(<BattleShortcutLegend />);

    const legend = screen.getByRole('region', { name: 'Battle controls' });
    for (const key of ['A', 'Q', 'S', 'R', 'E', 'D', 'Space']) {
      expect(legend).toHaveTextContent(key);
    }
    expect(legend).not.toHaveTextContent(/Round shot|Chain shot|Grape shot/);
    expect(screen.getByTestId('battle-shortcut-summary')).toHaveTextContent(
      'A turns port; Q fires port; S changes shot; R changes sail; E fires starboard; D turns starboard; Space pauses. Arrow keys steer and Escape also pauses.',
    );
  });
});
