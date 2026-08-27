import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CaribbeanMap } from './CaribbeanMap';

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('<CaribbeanMap>', () => {
  it('renders real Caribbean geography, authored route facts, and named tactical markers', () => {
    const { container } = render(<CaribbeanMap playerName="Mistral" contactVisible />);

    expect(screen.getByRole('region', { name: 'Caribbean encounter chart' })).toBeInTheDocument();
    expect(screen.getByText('Bridgetown')).toBeInTheDocument();
    expect(screen.getByText('Mistral')).toBeInTheDocument();
    expect(screen.getByText('Red Jackdaw')).toBeInTheDocument();
    for (const place of ['Barbados', 'St Lucia', 'Martinique', 'Dominica', 'Guadeloupe', 'Trinidad']) {
      expect(screen.getByText(place)).toBeInTheDocument();
    }

    const land = container.querySelector('[data-map-land="natural-earth"]');
    expect(land?.getAttribute('d')?.length).toBeGreaterThan(100);
    expect(container.querySelector('[data-map-route="red-jackdaw"]')).toBeInTheDocument();
    expect(screen.getByTestId('caribbean-map-facts')).toHaveTextContent('East by north');
    expect(screen.getByTestId('caribbean-map-facts')).toHaveTextContent('Fresh trade wind from ENE');
    expect(container.querySelectorAll('[data-map-label-layout="collision-safe"]')).toHaveLength(3);
    expect(container.querySelector('[data-map-place="Barbados"]')).toBeNull();
    expect(container.querySelector('[data-map-port="Bridgetown"]')).toHaveTextContent('Barbados');
    expect(container.querySelector('.caribbean-map__instructions')).toHaveTextContent('Press Home to reset');
  });

  it('zooms, pans, and returns to its deterministic home view', () => {
    render(<CaribbeanMap playerName="Mistral" contactVisible />);
    const surface = screen.getByTestId('caribbean-map-surface');

    expect(surface).toHaveAttribute('data-map-scale', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(surface).toHaveAttribute('data-map-scale', '1.25');
    fireEvent.wheel(surface, { deltaY: -100 });
    expect(surface).toHaveAttribute('data-map-scale', '1.5');

    fireEvent(surface, pointerEvent('pointerdown', 3, 100, 90));
    fireEvent(surface, pointerEvent('pointermove', 3, 132, 111));
    fireEvent(surface, pointerEvent('pointerup', 3, 132, 111));
    expect(surface).toHaveAttribute('data-map-pan-x', '32');
    expect(surface).toHaveAttribute('data-map-pan-y', '21');

    fireEvent.keyDown(surface, { key: 'Home' });
    expect(surface).toHaveAttribute('data-map-scale', '1');
    expect(surface).toHaveAttribute('data-map-pan-x', '0');
    expect(surface).toHaveAttribute('data-map-pan-y', '0');
  });

  it('bounds zoom and keeps optional contact information out of an unmarked chart', () => {
    const { container } = render(<CaribbeanMap playerName="Mistral" contactVisible={false} />);
    const surface = screen.getByTestId('caribbean-map-surface');
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });

    for (let step = 0; step < 20; step += 1) fireEvent.click(zoomOut);
    expect(surface).toHaveAttribute('data-map-scale', '1');
    for (let step = 0; step < 20; step += 1) fireEvent.click(zoomIn);
    expect(surface).toHaveAttribute('data-map-scale', '3');
    expect(screen.queryByText('Red Jackdaw')).not.toBeInTheDocument();
    expect(container.querySelector('[data-map-route="red-jackdaw"]')).toBeNull();
  });
});
