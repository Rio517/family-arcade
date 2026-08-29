import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeParty, fakePartyWithKai } from '@shared/party/testing';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { getUsersSnapshot, resetUsersStore, setUsersState } from '@shared/profile/usersStore';

// The page stands on the party (ADR 0008); a controllable useParty keeps
// these tests off the network. The shared fake is the complete PartyValue,
// so the page may read any field without a partial cast blowing up.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

import { RacerPage } from './RacerPage';

/**
 * jsdom has no WebGL, so the real RacerScene constructor throws and Track3D
 * shows its fallback — which is exactly what the setup/HUD tests assert. The
 * win overlay, however, only appears after the animation loop runs, and the
 * loop never starts when scene construction fails. So the scene module is
 * wrapped: by default it defers to the real (throwing) constructor, and the
 * win-overlay tests flip `fake3d.enabled` to get an inert scene that lets the
 * loop drive the race to 20 coins.
 */
const fake3d = vi.hoisted(() => ({ enabled: false }));

vi.mock('../three/scene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../three/scene')>();
  class RacerScene {
    constructor(...args: ConstructorParameters<typeof actual.RacerScene>) {
      if (!fake3d.enabled) {
        // The genuine no-WebGL failure path: the real constructor throws.
        return new actual.RacerScene(...args) as unknown as RacerScene;
      }
    }
    sync(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, RacerScene: RacerScene as unknown as typeof actual.RacerScene };
});

/**
 * The two-player finish tests sit the real `useRacerNet` down at a table over
 * a captured transport: the connection's handlers land in `link`, so a test
 * plays the friend's side of the handshake (hello / go / world) by hand, and
 * everything this device sends is recorded. generateCode / normalizeCode stay
 * real (spread from the actual module). The lobby tests above get an inert
 * connection out of it, which is all they ever needed.
 */
const link = vi.hoisted(() => ({
  handlers: null as null | {
    onStatus: (status: string, detail?: string) => void;
    onOpen: () => void;
    onMessage: (msg: unknown) => void;
  },
  sent: [] as Array<{ t: string; [k: string]: unknown }>,
}));

vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  class GameConnection {
    constructor(handlers: NonNullable<typeof link.handlers>) {
      link.handlers = handlers;
    }
    host(): void {}
    join(): void {}
    send(msg: { t: string; [k: string]: unknown }): boolean {
      link.sent.push(msg);
      return true;
    }
    destroy(): void {}
  }
  return { ...actual, GameConnection };
});

// Start both karts of a two-player race on the coin pile (with Math.random
// pinned to 0 every coin spawns at the arena centre), so a driven host race
// finishes in two frames. The host kart is listed first and wins every shared
// coin. Solo races place their one kart directly and never call this.
vi.mock('../domain/kart', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/kart')>();
  return {
    ...actual,
    startPositions: () => [
      { x: 0, z: 0, heading: 0 },
      { x: 0.5, z: 0, heading: 0 },
    ],
  };
});

function renderRacer() {
  return render(
    <MemoryRouter>
      <RacerPage />
    </MemoryRouter>,
  );
}

/** Mode screen → driver picker. */
function goToPicker() {
  fireEvent.click(screen.getByTestId('racer-mode-solo'));
}

/** Mode screen → picker → pick a driver, which starts a solo race at once. */
function startSoloRace(driverId: string) {
  goToPicker();
  fireEvent.click(screen.getByTestId(`racer-driver-${driverId}`));
}

beforeEach(() => {
  mockParty.value = fakeParty();
});

afterEach(() => vi.restoreAllMocks());

describe('<RacerPage> — the party table', () => {
  /** Mode screen → 2 Players → pick a driver → the lobby. */
  function goToNetLobby() {
    fireEvent.click(screen.getByTestId('racer-mode-net'));
    fireEvent.click(screen.getByTestId('racer-driver-unicorn'));
  }

  it('a party host leaving an opened table via ‹ Menu closes it for the friend', () => {
    mockParty.value = fakePartyWithKai('host');
    renderRacer();
    goToNetLobby();
    expect(screen.getByTestId('racer-party-play')).toHaveTextContent('Race Kai');
    fireEvent.click(screen.getByTestId('racer-party-play'));

    fireEvent.click(screen.getByTestId('racer-back'));
    expect(mockParty.value.closeTable).toHaveBeenCalledWith('WXYZ');
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
  });

  it('a party host playing a solo race closes nothing when they leave — the friend keeps their table', () => {
    mockParty.value = fakePartyWithKai('host');
    renderRacer();
    fireEvent.click(screen.getByTestId('racer-mode-solo'));
    fireEvent.click(screen.getByTestId('racer-driver-unicorn'));

    fireEvent.click(screen.getByTestId('racer-back'));
    expect(mockParty.value.closeTable).not.toHaveBeenCalled();
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
  });

  it('a party guest leaving the lobby via ‹ Menu never closes a table it does not own', () => {
    mockParty.value = fakePartyWithKai('guest', { theirName: 'Rio' });
    renderRacer();
    goToNetLobby();
    expect(screen.getByTestId('racer-party-waiting')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('racer-back'));
    expect(mockParty.value.closeTable).not.toHaveBeenCalled();
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
  });

  it('outside a party the lobby keeps its code doors and ‹ Menu leaves the party alone', () => {
    renderRacer();
    goToNetLobby();
    expect(screen.getByTestId('racer-create')).toBeInTheDocument();
    expect(screen.getByTestId('racer-show-join')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('racer-back'));
    expect(mockParty.value.closeTable).not.toHaveBeenCalled();
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
  });
});

describe('<RacerPage> — solo setup flow', () => {
  it('offers 1-player and 2-player modes, and picking solo advances to the driver picker', () => {
    renderRacer();
    expect(screen.getByTestId('racer-mode-solo')).toHaveTextContent('1 Player');
    expect(screen.getByTestId('racer-mode-net')).toHaveTextContent('2 Players');

    goToPicker();
    expect(screen.getByText('Pick your racer')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-mode-solo')).toBeNull();
  });

  it('lists all four drivers and starts a race when one is picked (3D falls back in jsdom)', async () => {
    // The failed scene construction is logged; keep the test output quiet.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRacer();
    goToPicker();
    for (const id of ['unicorn', 'dragon', 'fairy', 'butterfly']) {
      expect(screen.getByTestId(`racer-driver-${id}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('racer-driver-fairy'));
    // The race screen mounts; the 3D scene loads async and, without WebGL,
    // resolves to its fallback message.
    expect(await screen.findByTestId('racer3d-fallback', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId('racer-driver-fairy')).toBeNull();
  });

  it('returns from the driver picker to the mode screen via the ‹ Menu button', () => {
    renderRacer();
    goToPicker();
    expect(screen.getByTestId('racer-driver-unicorn')).toBeInTheDocument();

    // On the picker the shell's ‹ Menu button steps back a phase, it does not navigate.
    fireEvent.click(screen.getByTestId('racer-back'));
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-driver-unicorn')).toBeNull();
  });

  it('shows the picked driver and a 0/20 coin count in the race HUD', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRacer();
    startSoloRace('dragon');
    await screen.findByTestId('racer3d-fallback', {}, { timeout: 5000 });

    // The HUD scoreline: the dragon face, a bold coin count of 0, the /20 target,
    // and the elapsed-time readout.
    expect(screen.getByText('🐉')).toBeInTheDocument();
    expect(screen.getByText('0', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText('/20')).toBeInTheDocument();
    expect(screen.getByText('⏱ 0.0s')).toBeInTheDocument();
  });
});

describe('<RacerPage> — solo win overlay', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    fake3d.enabled = true;
    frames = [];
    // Capture animation frames so the test drives the game loop by hand.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    // With rng pinned to 0 every coin spawns at the arena centre — right under
    // the kart's start spot — so each loop tick scoops a full field of 16.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    fake3d.enabled = false;
  });

  /** Run the loop until the 20-coin target is passed (16 coins per tick). */
  async function winTheRace() {
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await act(async () => {
      frames.shift()!(0); // collects 16 coins, field refills in place
      frames.shift()!(16); // collects 16 more → 32 ≥ 20 → race over
    });
  }

  it('shows the win overlay with the solo title once 20 coins are collected', async () => {
    renderRacer();
    startSoloRace('unicorn');
    await winTheRace();

    expect(screen.getByTestId('racer-win')).toBeInTheDocument();
    expect(screen.getByText('You got all 20 coins!')).toBeInTheDocument();
    expect(screen.getByText(/Your time:/)).toBeInTheDocument();
  });

  it('starts a fresh race from the win overlay via Race again', async () => {
    renderRacer();
    startSoloRace('unicorn');
    await winTheRace();

    fireEvent.click(screen.getByTestId('racer-again'));
    expect(screen.queryByTestId('racer-win')).toBeNull();
    // A brand-new race context: the coin count is back to 0.
    expect(screen.getByText('0', { selector: 'b' })).toBeInTheDocument();
    // Wait for the remounted scene to build (still faked) so its async import
    // doesn't land after this test's mocks are torn down.
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
  });

  it('returns from the win overlay to the mode screen via its Menu button', async () => {
    renderRacer();
    startSoloRace('unicorn');
    await winTheRace();

    fireEvent.click(screen.getByTestId('racer-win-menu'));
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-win')).toBeNull();
  });
});

/**
 * A two-player finish credits the racer on THIS device — the ticket that sat
 * down, captured when the race started — exactly once per race. The other
 * racer is on the other iPad with their own ticket, so nothing lands on their
 * roster entry here. Solo races are time trials and record nothing.
 */
describe('<RacerPage> — a two-player finish credits the racer on this device', () => {
  let frames: FrameRequestCallback[];

  const ticket = (id: string) => getUsersSnapshot().users.find((u) => u.id === id)!.profile;

  beforeEach(() => {
    fake3d.enabled = true;
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    // Every coin spawns at the arena centre, where both karts start (see the
    // kart mock above), so a host finishes in two frames.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    link.handlers = null;
    link.sent = [];
    localStorage.clear();
    resetUsersStore();
    // Kai is signed in on this iPad. Rio — the friend — is on the roster too,
    // but races from their own device with their own ticket.
    setUsersState(setActiveUser(addUser(addUser(emptyUsersState(), 'u-rio', 'Rio'), 'u-kai', 'Kai'), 'u-kai'));
  });

  afterEach(() => {
    fake3d.enabled = false;
    localStorage.clear();
    resetUsersStore();
  });

  /** 2 Players → pick the dragon → take a seat at a table by code. Returns that code. */
  function sitDown(role: 'host' | 'guest'): string {
    fireEvent.click(screen.getByTestId('racer-mode-net'));
    fireEvent.click(screen.getByTestId('racer-driver-dragon'));
    if (role === 'host') {
      fireEvent.click(screen.getByTestId('racer-create'));
      return screen.getByTestId('racer-code').textContent!.trim();
    }
    fireEvent.click(screen.getByTestId('racer-show-join'));
    fireEvent.change(screen.getByTestId('racer-code-input'), { target: { value: 'WXYZ' } });
    fireEvent.click(screen.getByTestId('racer-join'));
    return 'WXYZ';
  }

  /** The channel opens and Rio (unicorn) says hello; a host answers go, a guest hears the host's go. */
  function rioArrives(role: 'host' | 'guest') {
    const h = link.handlers!;
    act(() => {
      h.onStatus('connected');
      h.onOpen();
      h.onMessage({ t: 'hello', name: 'Rio', driver: 'unicorn', inRace: false });
      if (role === 'guest') h.onMessage({ t: 'go', target: 20 });
    });
  }

  /** Sit down as `role`, let Rio arrive, and wait for the race loop to go live. */
  async function startNetRace(role: 'host' | 'guest') {
    const view = renderRacer();
    const code = sitDown(role);
    rioArrives(role);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    return { view, code };
  }

  /** Host: the kart sits on the coin pile — two frames pass the 20-coin target. */
  async function hostCollectsTwenty() {
    await act(async () => {
      frames.shift()!(0);
      frames.shift()!(16);
    });
  }

  /** Guest: the host's authoritative world says the race is over. */
  async function hostSaysOver(winner: number | null, scores: [number, number] = [20, 4]) {
    act(() => link.handlers!.onMessage({ t: 'world', coins: [], scores, status: 'over', winner, elapsed: 9 }));
    await act(async () => {
      frames.shift()!(0);
    });
  }

  it('a race the host wins puts a racer win over the friend on the host ticket', async () => {
    const { code } = await startNetRace('host');
    await hostCollectsTwenty();
    expect(screen.getByText('You win! 🏆')).toBeInTheDocument();

    const kai = ticket('u-kai');
    expect(kai.wins).toBe(1);
    expect(kai.losses).toBe(0);
    expect(kai.history).toHaveLength(1);
    expect(kai.history[0]).toMatchObject({ game: 'racer', opponent: 'Rio', result: 'win', code });
    expect(kai.history[0].finishedAt).toBeGreaterThan(0);
    // Rio is racing on their own iPad with their own ticket — nothing lands here.
    expect(ticket('u-rio').history).toHaveLength(0);
  });

  it('a race the friend wins puts a loss on the guest ticket, named for the friend', async () => {
    await startNetRace('guest');
    await hostSaysOver(0);
    expect(screen.getByText('Rio wins!')).toBeInTheDocument();

    const kai = ticket('u-kai');
    expect(kai.losses).toBe(1);
    expect(kai.wins).toBe(0);
    expect(kai.history).toHaveLength(1);
    expect(kai.history[0]).toMatchObject({ game: 'racer', opponent: 'Rio', result: 'loss', code: 'WXYZ' });
    expect(ticket('u-rio').history).toHaveLength(0);
  });

  it('a guest that wins is credited the win — the seat, not the host, decides who "me" is', async () => {
    await startNetRace('guest');
    await hostSaysOver(1, [4, 20]);
    expect(screen.getByText('You win! 🏆')).toBeInTheDocument();

    expect(ticket('u-kai').wins).toBe(1);
    expect(ticket('u-kai').history[0]).toMatchObject({ game: 'racer', opponent: 'Rio', result: 'win' });
  });

  it('records once: a re-render of the overlay and the host re-sending the finished world do not double-credit', async () => {
    const { view } = await startNetRace('guest');
    await hostSaysOver(0);
    expect(ticket('u-kai').history).toHaveLength(1);

    // The channel blips: the host re-introduces itself and re-sends the
    // finished world (the reconnect re-sync), and a few more frames tick.
    act(() => {
      link.handlers!.onOpen();
      link.handlers!.onMessage({ t: 'hello', name: 'Rio', driver: 'unicorn', inRace: true });
      link.handlers!.onMessage({ t: 'world', coins: [], scores: [20, 4], status: 'over', winner: 0, elapsed: 9 });
    });
    await act(async () => {
      for (const cb of frames.splice(0, frames.length)) cb(100);
    });
    view.rerender(
      <MemoryRouter>
        <RacerPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('racer-win')).toBeInTheDocument();

    expect(ticket('u-kai').history).toHaveLength(1);
    expect(ticket('u-kai').losses).toBe(1);
  });

  it('a rematch is a new race and records again', async () => {
    await startNetRace('host');
    await hostCollectsTwenty();
    expect(ticket('u-kai').history).toHaveLength(1);

    // Race again: the host restarts both sides, and a fresh race loop starts.
    fireEvent.click(screen.getByTestId('racer-again'));
    frames.length = 0;
    expect(screen.queryByTestId('racer-win')).toBeNull();
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await hostCollectsTwenty();

    expect(ticket('u-kai').wins).toBe(2);
    expect(ticket('u-kai').history).toHaveLength(2);
  });

  it('credits the ticket that sat down, not whoever is signed in at the finish', async () => {
    await startNetRace('host');
    // Mid-race the iPad changes hands at the booth: Rio signs in.
    act(() => setUsersState(setActiveUser(getUsersSnapshot(), 'u-rio')));
    await hostCollectsTwenty();

    expect(ticket('u-kai').wins).toBe(1);
    expect(ticket('u-rio').history).toHaveLength(0);
  });

  it('a seat without a ticket records nothing', async () => {
    setUsersState(setActiveUser(getUsersSnapshot(), null));
    const before = getUsersSnapshot();
    await startNetRace('host');
    await hostCollectsTwenty();
    expect(screen.getByTestId('racer-win')).toBeInTheDocument();

    expect(getUsersSnapshot()).toBe(before);
  });

  it('a dead heat records nothing for either racer', async () => {
    const before = getUsersSnapshot();
    await startNetRace('guest');
    await hostSaysOver(null, [20, 20]);
    expect(screen.getByTestId('racer-win')).toBeInTheDocument();

    expect(getUsersSnapshot()).toBe(before);
  });

  it('a solo race is a time trial — nothing is recorded', async () => {
    const before = getUsersSnapshot();
    renderRacer();
    startSoloRace('unicorn');
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await hostCollectsTwenty();
    expect(screen.getByText('You got all 20 coins!')).toBeInTheDocument();

    expect(getUsersSnapshot()).toBe(before);
  });
});
