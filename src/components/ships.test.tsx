import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ShipProfile, ShipTopDown } from './ships';

describe('<ShipTopDown>', () => {
  it('swaps its viewBox with orientation', () => {
    const h = render(<ShipTopDown shipId="carrier" size={5} orientation="H" />);
    expect(h.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 50 10');
    const v = render(<ShipTopDown shipId="carrier" size={5} orientation="V" />);
    expect(v.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 10 50');
  });

  it('draws more turrets on a longer hull', () => {
    const battleship = render(<ShipTopDown shipId="battleship" size={4} orientation="H" />);
    const destroyer = render(<ShipTopDown shipId="destroyer" size={2} orientation="H" />);
    // size >= 4 gets two turrets, shorter hulls one.
    expect(battleship.container.querySelectorAll('circle')).toHaveLength(2);
    expect(destroyer.container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('gives the carrier an island and the submarine a conning tower', () => {
    const carrier = render(<ShipTopDown shipId="carrier" size={5} orientation="H" />);
    expect(carrier.container.querySelector('rect')).not.toBeNull(); // flight-deck island
    expect(carrier.container.querySelectorAll('circle')).toHaveLength(0);
    const sub = render(<ShipTopDown shipId="submarine" size={3} orientation="H" />);
    expect(sub.container.querySelectorAll('circle')).toHaveLength(1); // tower
  });
});

describe('<ShipProfile>', () => {
  it('renders an SVG silhouette (no emoji/text)', () => {
    const { container } = render(<ShipProfile shipId="cruiser" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.textContent).toBe('');
  });
});
