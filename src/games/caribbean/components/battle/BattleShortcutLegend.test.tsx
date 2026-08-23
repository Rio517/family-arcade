import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BattleShortcutLegend } from './BattleShortcutLegend';

describe('BattleShortcutLegend', () => {
  it('names every battle shortcut visibly and once in its screen-reader summary', () => {
    render(<BattleShortcutLegend />);

    const legend = screen.getByRole('region', { name: 'Battle controls' });
    for (const key of ['A', 'Q', '1', '2', '3', 'R', 'E', 'D', 'Space / Esc']) {
      expect(legend).toHaveTextContent(key);
    }
    expect(screen.getByTestId('battle-shortcut-summary')).toHaveTextContent(
      'A turns port; Q fires port; 1 selects round shot; 2 selects chain shot; 3 selects grape shot; R toggles sail; E fires starboard; D turns starboard; Space or Escape pauses.',
    );
  });
});
