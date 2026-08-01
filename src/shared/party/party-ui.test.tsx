import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PartyValue } from './PartyContext';

// A controllable useParty so we can render each party state without a network.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('./PartyContext', () => ({ useParty: () => mockParty.value }));

import { PartyBar } from './PartyBar';
import { FloatingVideo } from './FloatingVideo';

function makeParty(over: Partial<PartyValue> = {}): PartyValue {
  return {
    myName: 'Rio',
    setMyName: vi.fn(),
    status: 'idle',
    code: '',
    role: null,
    inParty: false,
    theirName: null,
    hostParty: vi.fn(() => 'ABCD'),
    joinParty: vi.fn(),
    leaveParty: vi.fn(),
    call: {
      active: false,
      status: 'idle',
      muted: false,
      cameraOn: false,
      localStream: null,
      remoteStream: null,
      start: vi.fn(),
      stop: vi.fn(),
      toggleMute: vi.fn(),
      toggleCamera: vi.fn(),
    },
    ...over,
  } as PartyValue;
}

const renderBar = () => render(<MemoryRouter><PartyBar /></MemoryRouter>);

beforeEach(() => {
  mockParty.value = makeParty();
});

describe('PartyBar', () => {
  it('offers "Start a party" when not in a party', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByTestId('party-create')).toBeInTheDocument();
    expect(screen.getByTestId('party-join')).toBeInTheDocument();
  });

  it('offers opt-in voice (video off) once connected', () => {
    mockParty.value = makeParty({ inParty: true, status: 'connected', theirName: 'Kai', role: 'host', code: 'ABCD' });
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    const start = screen.getByTestId('party-call-start');
    expect(start).toBeInTheDocument();
    fireEvent.click(start);
    expect(mockParty.value.call.start).toHaveBeenCalled();
    // no camera control until the call is active
    expect(screen.queryByTestId('party-camera')).toBeNull();
  });

  it('shows labelled mute/camera/end controls during a live call', () => {
    mockParty.value = makeParty({
      inParty: true, status: 'connected', theirName: 'Kai', role: 'host', code: 'ABCD',
      call: { ...makeParty().call, active: true, status: 'live' },
    });
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    for (const id of ['party-mute', 'party-camera', 'party-call-end']) {
      expect(screen.getByTestId(id)).toHaveAttribute('aria-label');
    }
  });
});

describe('FloatingVideo', () => {
  it('renders nothing until the call is active', () => {
    mockParty.value = makeParty();
    const { container } = render(<FloatingVideo />);
    expect(container.firstChild).toBeNull();
  });

  it('appears once the call is active', () => {
    mockParty.value = makeParty({ theirName: 'Kai', call: { ...makeParty().call, active: true, status: 'live' } });
    render(<FloatingVideo />);
    expect(screen.getByTestId('party-floating-video')).toBeInTheDocument();
  });
});
