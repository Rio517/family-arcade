import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState } from '@shared/profile/users';
import type { PartyValue } from './PartyContext';

// A controllable useParty so we can render each party state without a network.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('./PartyContext', () => ({ useParty: () => mockParty.value }));

import { PartyBar } from './PartyBar';
import { FloatingVideo } from './FloatingVideo';

function makeParty(over: Partial<PartyValue> = {}): PartyValue {
  return {
    myName: 'Rio',
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
  localStorage.clear();
  resetUsersStore();
  // A party is made from a ticket, so the panel's tests start signed in.
  setUsersState(addUser(emptyUsersState(), 'u1', 'Rio', 1));
});

/** Nobody signed in — the front-page booth hasn't printed a ticket yet. */
function signEveryoneOut() {
  localStorage.clear();
  resetUsersStore();
}

describe('PartyBar', () => {
  it('offers "Start a party" when not in a party', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByTestId('party-create')).toBeInTheDocument();
    expect(screen.getByTestId('party-join')).toBeInTheDocument();
  });

  it('wears your ticket instead of asking for a name', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Rio");
    expect(screen.getByTestId('party-create')).toBeInTheDocument();
  });

  it('sends you to the booth for a ticket before it offers a party', () => {
    signEveryoneOut();
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByTestId('party-needs-ticket')).toBeInTheDocument();
    expect(screen.queryByTestId('playing-as')).toBeNull();
    expect(screen.queryByTestId('party-create')).toBeNull();
    expect(screen.queryByTestId('party-join')).toBeNull();
  });

  it('the panel closes on Escape, like every dialog in the arcade', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByRole('dialog', { name: 'Party' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Party' })).toBeNull();
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

  // Dragging the card must follow the Risk-map rule: capture the pointer only
  // once movement crosses the drag threshold. Capturing on the bare press
  // retargets the follow-up click to the card — which would silently kill any
  // button (mute, close…) this card grows in the future.
  describe('dragging', () => {
    function renderCard() {
      mockParty.value = makeParty({ theirName: 'Kai', call: { ...makeParty().call, active: true, status: 'live' } });
      render(<FloatingVideo />);
      const card = screen.getByTestId('party-floating-video') as HTMLElement & {
        setPointerCapture: ReturnType<typeof vi.fn>;
        releasePointerCapture: ReturnType<typeof vi.fn>;
      };
      // jsdom has no pointer capture; observe the calls instead.
      card.setPointerCapture = vi.fn();
      card.releasePointerCapture = vi.fn();
      return card;
    }

    // jsdom has no PointerEvent, and testing-library's pointer fallback drops
    // the coordinates — a MouseEvent with pointerId bolted on carries them.
    function firePointer(
      el: Element,
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      init: { pointerId: number; clientX: number; clientY: number; buttons?: number },
    ) {
      const ev = new MouseEvent(type, {
        bubbles: true,
        clientX: init.clientX,
        clientY: init.clientY,
        buttons: init.buttons ?? 1,
      });
      Object.assign(ev, { pointerId: init.pointerId });
      fireEvent(el, ev);
    }

    it('a press with sub-threshold movement neither captures nor moves the card', () => {
      const card = renderCard();
      firePointer(card, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      firePointer(card, 'pointermove', { pointerId: 1, clientX: 103, clientY: 103 });
      firePointer(card, 'pointerup', { pointerId: 1, clientX: 103, clientY: 103 });
      expect(card.setPointerCapture).not.toHaveBeenCalled();
      expect(card.style.left).toBe('');
    });

    it('crossing the threshold captures once, moves the card, and releases on pointerup', () => {
      const card = renderCard();
      firePointer(card, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      firePointer(card, 'pointermove', { pointerId: 1, clientX: 110, clientY: 112 });
      expect(card.setPointerCapture).toHaveBeenCalledTimes(1);
      expect(card.style.left).not.toBe('');
      firePointer(card, 'pointerup', { pointerId: 1, clientX: 110, clientY: 112 });
      expect(card.releasePointerCapture).toHaveBeenCalled();
    });

    it('ignores a second pointer while the first is dragging', () => {
      const card = renderCard();
      firePointer(card, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      firePointer(card, 'pointermove', { pointerId: 1, clientX: 120, clientY: 100 });
      const after = card.style.left;
      firePointer(card, 'pointermove', { pointerId: 2, clientX: 400, clientY: 400 });
      expect(card.style.left).toBe(after);
    });

    // Below the threshold nothing is captured, so a pointer that slides off
    // the card ends elsewhere and its pointerup never arrives. That stale
    // grab must not wedge the card.
    it('a grab whose pointerup was missed does not lock out the next touch', () => {
      const card = renderCard();
      firePointer(card, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      firePointer(card, 'pointerdown', { pointerId: 7, clientX: 200, clientY: 200 });
      firePointer(card, 'pointermove', { pointerId: 7, clientX: 215, clientY: 215 });
      expect(card.style.left).not.toBe('');
    });

    it('a buttonless mouse hover after a missed pointerup does not drag the card', () => {
      const card = renderCard();
      firePointer(card, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
      firePointer(card, 'pointermove', { pointerId: 1, clientX: 140, clientY: 140, buttons: 0 });
      expect(card.style.left).toBe('');
    });
  });

  it('is its own labelled landmark (content in a call must not sit outside all landmarks)', () => {
    mockParty.value = makeParty({ theirName: 'Kai', call: { ...makeParty().call, active: true, status: 'live' } });
    render(<FloatingVideo />);
    expect(screen.getByRole('complementary', { name: 'Video call' })).toBeInTheDocument();
  });
});
