import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('<VoyageInstrument>', () => {
  it('renders semantic wind and route facts while hiding the sloop drawing', async () => {
    const modulePath = './Voyage' + 'Instrument';
    const { VoyageInstrument } = await import(/* @vite-ignore */ modulePath);
    const { container } = render(<VoyageInstrument phase="sailing" />);

    const instrument = screen.getByTestId('voyage-instrument');
    expect(instrument).toHaveTextContent('Bridgetown to Red Jackdaw contact');
    expect(instrument).toHaveTextContent('East by north');
    expect(instrument).toHaveTextContent('Fresh trade wind from ENE');
    expect(instrument).toHaveTextContent('1 day · 1 provision outbound');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).not.toHaveAccessibleName();
  });

  it('marks the authored contact without changing the semantic bearing', async () => {
    const modulePath = './Voyage' + 'Instrument';
    const { VoyageInstrument } = await import(/* @vite-ignore */ modulePath);
    render(<VoyageInstrument phase="encounter" />);

    expect(screen.getByTestId('voyage-instrument')).toHaveAttribute('data-phase', 'encounter');
    expect(screen.getByText(/Contact sighted on the east-by-north course/i)).toBeInTheDocument();
  });
});
