import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('<PortBackdrop>', () => {
  it('renders one local decorative image without text, interaction, or landmark semantics', async () => {
    const { PortBackdrop } = await import('./PortBackdrop');
    const { container } = render(<PortBackdrop />);

    const layer = screen.getByTestId('caribbean-port-backdrop');
    const art = screen.getByTestId('caribbean-port-art');
    expect(layer).toContainElement(art);
    expect(art).toHaveAttribute('alt', '');
    expect(art).toHaveAttribute('aria-hidden', 'true');
    expect(art).toHaveAttribute('src', expect.stringMatching(/^(?:\/|data:).*bridgetown-1675.*\.webp|^\/src\/games\/caribbean\/assets\/bridgetown-1675\.webp$/));
    expect(layer).toHaveTextContent('');
    expect(container.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
    expect(container.querySelectorAll('[role="banner"], [role="main"], [role="region"], [role="navigation"]')).toHaveLength(0);
  });

  it('moves from loading to loaded presentation state after the image loads', async () => {
    const { PortBackdrop } = await import('./PortBackdrop');
    render(<PortBackdrop />);
    const layer = screen.getByTestId('caribbean-port-backdrop');

    expect(layer).toHaveClass('caribbean-port-backdrop--loading');
    fireEvent.load(screen.getByTestId('caribbean-port-art'));
    expect(layer).toHaveClass('caribbean-port-backdrop--loaded');
    expect(layer).not.toHaveClass('caribbean-port-backdrop--fallback');
  });

  it('retains the gradient fallback layer after the image fails', async () => {
    const { PortBackdrop } = await import('./PortBackdrop');
    render(<PortBackdrop />);
    const layer = screen.getByTestId('caribbean-port-backdrop');

    fireEvent.error(screen.getByTestId('caribbean-port-art'));
    expect(layer).toHaveClass('caribbean-port-backdrop--fallback');
    expect(layer).not.toHaveClass('caribbean-port-backdrop--loaded');
  });
});
