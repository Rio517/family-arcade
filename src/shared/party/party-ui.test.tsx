import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup as cleanupBar, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import type { PartyValue } from './PartyContext';
import { fakeParty } from './testing';

// A controllable useParty so we can render each party state without a network.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('./PartyContext', () => ({ useParty: () => mockParty.value }));
// The overlay is three.js + MediaPipe behind a lazy import — jsdom can run
// neither. A stub that says which video it sits on and what it wears is the
// contract these tests care about.
vi.mock('@shared/effects/EffectsOverlay', () => ({
  EffectsOverlay: ({ video, effects }: { video: HTMLVideoElement | null; effects: string[] }) =>
    video && effects.length > 0 ? <div data-testid="fx" data-effects={effects.join(',')} /> : null,
}));

import { PartyBar } from './PartyBar';
import { FloatingVideo } from './FloatingVideo';

const makeParty = (over: Partial<PartyValue> = {}): PartyValue =>
  fakeParty({
    myName: 'Rio',
    hostParty: vi.fn(() => 'ABCD'),
    resolveGame: (id: string) =>
      id === 'chess' ? { title: 'Chess', path: '/chess' } : id === 'racer' ? { title: 'Rainbow Racer', path: '/racer' } : null,
    ...over,
  });

const renderBar = (path = '/') => render(<MemoryRouter initialEntries={[path]}><PartyBar /></MemoryRouter>);

beforeEach(() => {
  mockParty.value = makeParty();
  localStorage.clear();
  resetUsersStore();
  // A party is made from a ticket, so the panel's tests start signed in.
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

/** Nobody signed in — the front-page booth hasn't printed a ticket yet. */
function signEveryoneOut() {
  localStorage.clear();
  resetUsersStore();
}

describe('PartyBar', () => {
  it('opens on the start screen after leaving a party you joined by code', () => {
    const { rerender } = renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    fireEvent.click(screen.getByTestId('party-join'));
    expect(screen.getByTestId('party-code-input')).toBeInTheDocument();

    // The join connects; then the player leaves.
    mockParty.value = makeParty({ inParty: true, status: 'connected', role: 'guest', theirName: 'Kai' });
    rerender(<MemoryRouter><PartyBar /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('party-leave'));
    expect(mockParty.value.leaveParty).toHaveBeenCalledTimes(1);
    mockParty.value = makeParty();
    rerender(<MemoryRouter><PartyBar /></MemoryRouter>);

    expect(screen.getByTestId('party-create')).toBeInTheDocument();
    expect(screen.queryByTestId('party-code-input')).toBeNull();
  });

  it('Escape closes the panel and hands focus back to the pill', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByRole('dialog', { name: 'Party' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Party' })).toBeNull();
    expect(screen.getByTestId('party-pill')).toHaveFocus();
  });

  it('the collapse chevron minimizes the panel and hands focus back to the pill', () => {
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByRole('dialog', { name: 'Party' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('party-collapse'));
    expect(screen.queryByRole('dialog', { name: 'Party' })).toBeNull();
    expect(screen.getByTestId('party-pill')).toHaveFocus();
  });

  it('the collapse chevron is there mid-party too — calls stay minimizable', () => {
    mockParty.value = makeParty({ inParty: true, status: 'connected', theirName: 'Kai' });
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    fireEvent.click(screen.getByTestId('party-collapse'));
    expect(screen.queryByRole('dialog', { name: 'Party' })).toBeNull();
    // Minimizing is not leaving: the party itself is untouched.
    expect(mockParty.value.leaveParty).not.toHaveBeenCalled();
  });

  it('collapses while hosting and waiting for the friend — the code keeps waiting', () => {
    // The owner hit exactly this: panel open, code on show, nobody joined yet.
    mockParty.value = makeParty({ role: 'host', code: 'ABCD' });
    renderBar();
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByTestId('party-code')).toHaveTextContent('ABCD');
    fireEvent.click(screen.getByTestId('party-collapse'));
    expect(screen.queryByRole('dialog', { name: 'Party' })).toBeNull();
    // Minimizing didn't cancel the party — the code is still live behind the pill.
    expect(mockParty.value.leaveParty).not.toHaveBeenCalled();
    // And reopening brings the code straight back.
    fireEvent.click(screen.getByTestId('party-pill'));
    expect(screen.getByTestId('party-code')).toHaveTextContent('ABCD');
  });

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

  describe('camera effects in the panel', () => {
    const inCall = (over: Partial<PartyValue> = {}, cameraOn = true) =>
      makeParty({
        inParty: true,
        status: 'connected',
        role: 'host',
        theirName: 'Kai',
        call: { ...makeParty().call, active: true, status: 'live', cameraOn },
        ...over,
      });

    it('with the camera on, the effects are chips you can wear and take off', () => {
      mockParty.value = inCall({ effects: ['dragon'] });
      renderBar();
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.getByTestId('party-effect-dragon')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('party-effect-peace')).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(screen.getByTestId('party-effect-peace'));
      expect(mockParty.value.setEffects).toHaveBeenLastCalledWith(['dragon', 'peace']);
      fireEvent.click(screen.getByTestId('party-effect-dragon'));
      expect(mockParty.value.setEffects).toHaveBeenLastCalledWith([]);
    });

    it('with the camera off there are no chips, just the hint', () => {
      mockParty.value = inCall({}, false);
      renderBar();
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.queryByTestId('party-effect-dragon')).toBeNull();
      expect(screen.getByTestId('party-effects-hint')).toBeInTheDocument();
    });
  });

  describe('the pill lights up', () => {
    const live = (over: Partial<PartyValue> = {}) =>
      makeParty({ inParty: true, status: 'connected', role: 'guest', theirName: 'Kai', code: 'ABCD', ...over });

    it('says who opened what, with one tap to join — unless you are already there', () => {
      mockParty.value = live({ table: { game: 'chess', code: 'WXYZ' } });
      renderBar('/');
      const pill = screen.getByTestId('party-pill');
      expect(pill).toHaveClass('invite');
      expect(screen.getByTestId('party-badge')).toHaveTextContent('Chess ›');
      expect(pill).toHaveAccessibleName(/Kai opened Chess/);
      fireEvent.click(pill);
      expect(screen.getByTestId('party-invite')).toHaveTextContent('Kai opened Chess');
      expect(screen.getByTestId('party-invite-go')).toHaveAttribute('href', '/chess');
      cleanupBar();

      // Standing at that game already: nothing to announce.
      renderBar('/chess');
      expect(screen.getByTestId('party-pill')).not.toHaveClass('invite');
      expect(screen.queryByTestId('party-badge')).toBeNull();
    });

    it('the host hears a knock and can open that game', () => {
      mockParty.value = live({ role: 'host', knock: 'racer' });
      renderBar('/');
      const pill = screen.getByTestId('party-pill');
      expect(screen.getByTestId('party-badge')).toHaveTextContent('Rainbow Racer?');
      expect(pill).toHaveAccessibleName(/Kai wants to play Rainbow Racer/);
      fireEvent.click(pill);
      expect(screen.getByTestId('party-knock')).toHaveTextContent('Kai wants to play Rainbow Racer');
      fireEvent.click(screen.getByTestId('party-knock-go'));
      expect(mockParty.value.clearKnock).toHaveBeenCalledTimes(1);
    });

    it('the host who wandered off is offered the way back to its own table', () => {
      mockParty.value = live({ role: 'host', table: { game: 'chess', code: 'WXYZ', hostSide: 'b' } });
      renderBar('/');
      expect(screen.getByTestId('party-badge')).toHaveTextContent('Chess ›');
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.getByTestId('party-invite')).toHaveTextContent('Your table — Chess');
      expect(screen.getByTestId('party-invite-go')).toHaveTextContent('Back to it');
      expect(screen.getByTestId('party-invite-go')).toHaveAttribute('href', '/chess');
    });

    it('a game the app does not know stays quiet', () => {
      mockParty.value = live({ table: { game: 'bingo', code: 'WXYZ' } });
      renderBar('/');
      expect(screen.getByTestId('party-pill')).not.toHaveClass('invite');
    });
  });

  describe('a remembered party coming back', () => {
    it('says it is reconnecting and only offers to leave', () => {
      mockParty.value = makeParty({ reconnecting: true, role: 'guest', code: 'ABCD', status: 'dialing' });
      renderBar();
      expect(screen.getByTestId('party-pill')).toHaveTextContent(/reconnecting/i);
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.getByTestId('party-reconnecting')).toBeInTheDocument();
      expect(screen.queryByTestId('party-create')).toBeNull();
      expect(screen.queryByTestId('party-code-input')).toBeNull();
    });

    it('a reconnecting host still sees its code — the friend rejoins with it', () => {
      mockParty.value = makeParty({ reconnecting: true, role: 'host', code: 'ABCD', status: 'hosting' });
      renderBar();
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.getByTestId('party-reconnecting')).toBeInTheDocument();
      expect(screen.getByTestId('party-code')).toHaveTextContent('ABCD');
    });

    it('after an error you can try again on the same code', () => {
      mockParty.value = makeParty({ role: 'guest', code: 'ABCD', status: 'error' });
      renderBar();
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.getByTestId('party-error')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('party-retry'));
      expect(mockParty.value.retry).toHaveBeenCalledTimes(1);
    });

    it('a guest still dialing sees the code it is looking for', () => {
      mockParty.value = makeParty({ role: 'guest', code: 'ABCD', status: 'dialing' });
      renderBar();
      fireEvent.click(screen.getByTestId('party-pill'));
      expect(screen.getByTestId('party-dialing')).toHaveTextContent('Joining ABCD');
    });
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

  describe('camera effects ride on the video', () => {
    const fakeStream = (video: boolean) =>
      ({ getVideoTracks: () => (video ? [{}] : []), getAudioTracks: () => [] }) as unknown as MediaStream;

    it("draws the friend's effects on their video and mine on my preview", () => {
      mockParty.value = makeParty({
        theirName: 'Kai',
        effects: ['dragon'],
        theirEffects: ['peace'],
        call: { ...makeParty().call, active: true, status: 'live', cameraOn: true, remoteStream: fakeStream(true) },
      });
      render(<FloatingVideo />);
      const fx = screen.getAllByTestId('fx').map((el) => el.getAttribute('data-effects'));
      expect(fx).toEqual(['peace', 'dragon']);
    });

    it('draws nothing when nobody wears anything, or the friend has no video', () => {
      mockParty.value = makeParty({
        theirName: 'Kai',
        effects: [],
        theirEffects: ['peace'],
        call: { ...makeParty().call, active: true, status: 'live', cameraOn: true, remoteStream: fakeStream(false) },
      });
      render(<FloatingVideo />);
      expect(screen.queryAllByTestId('fx')).toHaveLength(0);
    });
  });

  it('is its own labelled landmark (content in a call must not sit outside all landmarks)', () => {
    mockParty.value = makeParty({ theirName: 'Kai', call: { ...makeParty().call, active: true, status: 'live' } });
    render(<FloatingVideo />);
    expect(screen.getByRole('complementary', { name: 'Video call' })).toBeInTheDocument();
  });
});
