import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DivideShares } from './DivideShares';

describe('<DivideShares>', () => {
  it('presents a static prerequisite with a plain-language reason and next value', () => {
    const { container } = render(<DivideShares />);

    const prerequisite = container.querySelector('.caribbean-port-prerequisite');
    expect(prerequisite).not.toBeNull();
    expect(screen.getByText('Voyage required')).toHaveClass('caribbean-port-prerequisite__eyebrow');
    expect(screen.getByText('Not available until after a profitable voyage')).toBeInTheDocument();
    expect(screen.getByText(/After you bring home prize money, this is where you approve the crew’s shares and settle the voyage\./)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
