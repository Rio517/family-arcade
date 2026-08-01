import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stand in for MediaLink so the widget can be driven without WebRTC/getUserMedia.
const h = vi.hoisted(() => ({ last: null as any }));

vi.mock('@shared/net/media', () => ({
  MediaLink: class {
    handlers: any;
    isCameraOn = false;
    isMuted = false;
    start = vi.fn(async (_code: string, _role: string, _cam: boolean) => {
      this.handlers.onStatus('connecting');
    });
    setCamera = vi.fn(async (on: boolean) => {
      this.isCameraOn = on;
    });
    toggleMute = vi.fn(() => {
      this.isMuted = !this.isMuted;
      return this.isMuted;
    });
    destroy = vi.fn();
    constructor(handlers: any) {
      this.handlers = handlers;
      h.last = this;
    }
  },
}));

import { CallBubble } from './CallBubble';

beforeEach(() => {
  h.last = null;
});

describe('CallBubble', () => {
  it('shows a "Talk" button before anything starts', () => {
    render(<CallBubble code="ABCD" role="host" />);
    expect(screen.getByTestId('call-start')).toBeInTheDocument();
    expect(screen.queryByTestId('call-bubble')).toBeNull();
  });

  it('starts a voice call (camera off) and shows labelled controls', async () => {
    render(<CallBubble code="ABCD" role="host" />);
    await userEvent.click(screen.getByTestId('call-start'));

    expect(h.last.start).toHaveBeenCalledWith('ABCD', 'host', false); // voice-first
    expect(screen.getByTestId('call-bubble')).toBeInTheDocument();

    // Icon-only controls must carry aria-labels (a11y floor).
    expect(screen.getByTestId('call-mute')).toHaveAttribute('aria-label');
    expect(screen.getByTestId('call-camera')).toHaveAttribute('aria-label');
    expect(screen.getByTestId('call-end')).toHaveAttribute('aria-label');
  });

  it('turns the camera on when the camera button is tapped (opt-in)', async () => {
    render(<CallBubble code="ABCD" role="guest" />);
    await userEvent.click(screen.getByTestId('call-start'));
    await userEvent.click(screen.getByTestId('call-camera'));
    expect(h.last.setCamera).toHaveBeenCalledWith(true);
  });

  it('tears the call down on end', async () => {
    render(<CallBubble code="ABCD" role="host" />);
    await userEvent.click(screen.getByTestId('call-start'));
    await userEvent.click(screen.getByTestId('call-end'));
    expect(h.last.destroy).toHaveBeenCalled();
    expect(screen.getByTestId('call-start')).toBeInTheDocument(); // back to idle
  });
});
