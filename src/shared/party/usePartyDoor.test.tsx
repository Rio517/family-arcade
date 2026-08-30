import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyValue } from './PartyContext';
import { fakeParty } from './testing';
import { usePartyDoor } from './usePartyDoor';

const mockParty = vi.hoisted(() => ({ value: null as unknown as PartyValue }));
vi.mock('./PartyContext', () => ({ useParty: () => mockParty.value }));

const makeParty = (over: Partial<PartyValue> = {}): PartyValue =>
  fakeParty({ myName: 'Klara', status: 'connected', code: 'AB23', role: 'guest', inParty: true, theirName: 'Kai', ...over });

const onTable = vi.fn();
const onClosed = vi.fn();

function Door({ active = true }: { active?: boolean }) {
  const door = usePartyDoor('chess', active, onTable, onClosed);
  return (
    <p data-testid="door">
      {door.waiting ? 'waiting' : 'not-waiting'}|{door.friend ?? '-'}
    </p>
  );
}

const table = (code: string, hostSide?: string) => ({ game: 'chess', code, ...(hostSide ? { hostSide } : {}) });
const knocks = () => (mockParty.value.knockOn as ReturnType<typeof vi.fn>).mock.calls;

beforeEach(() => {
  onTable.mockReset();
  onClosed.mockReset();
});

describe('usePartyDoor — a guest at the door', () => {
  it('does nothing for the host or outside a party', () => {
    mockParty.value = makeParty({ role: 'host' });
    const r = render(<Door />);
    expect(knocks()).toHaveLength(0);
    expect(screen.getByTestId('door')).toHaveTextContent('not-waiting');
    r.unmount();

    mockParty.value = makeParty({ inParty: false, status: 'idle', role: null, table: table('CD45') });
    render(<Door />);
    expect(knocks()).toHaveLength(0);
    expect(onTable).not.toHaveBeenCalled();
  });

  it('knocks once while the door is closed — not once per render — and says it is waiting', () => {
    mockParty.value = makeParty();
    const r = render(<Door />);
    expect(knocks()).toEqual([['chess']]);
    expect(screen.getByTestId('door')).toHaveTextContent('waiting|Kai');
    r.rerender(<Door />);
    mockParty.value = { ...mockParty.value, theirName: 'Kai!' };
    r.rerender(<Door />);
    expect(knocks()).toHaveLength(1);
  });

  it('another game’s table is a closed door', () => {
    mockParty.value = makeParty({ table: { game: 'racer', code: 'RACE' } });
    render(<Door />);
    expect(knocks()).toEqual([['chess']]);
    expect(onTable).not.toHaveBeenCalled();
  });

  it('sits down once per code with the host’s side, however often the party re-announces', () => {
    mockParty.value = makeParty();
    const r = render(<Door />);
    mockParty.value = { ...mockParty.value, table: table('CD45', 'b') };
    r.rerender(<Door />);
    expect(onTable).toHaveBeenCalledWith('CD45', 'b');
    expect(screen.getByTestId('door')).toHaveTextContent('not-waiting');
    mockParty.value = { ...mockParty.value, table: table('CD45', 'b') };
    r.rerender(<Door />);
    r.rerender(<Door />);
    expect(onTable).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('an open table on arrival is joined without a knock', () => {
    mockParty.value = makeParty({ table: table('CD45') });
    render(<Door />);
    expect(knocks()).toHaveLength(0);
    expect(onTable).toHaveBeenCalledWith('CD45', undefined);
  });

  it('a closed table says so, then the door knocks again; a fresh code hangs up before sitting down', () => {
    mockParty.value = makeParty({ table: table('CD45') });
    const r = render(<Door />);
    expect(onTable).toHaveBeenCalledTimes(1);

    mockParty.value = { ...mockParty.value, table: null };
    r.rerender(<Door />);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(knocks()).toEqual([['chess']]);
    expect(screen.getByTestId('door')).toHaveTextContent('waiting');

    mockParty.value = { ...mockParty.value, table: table('EF67') };
    r.rerender(<Door />);
    expect(onTable).toHaveBeenLastCalledWith('EF67', undefined);
    expect(onClosed).toHaveBeenCalledTimes(1);

    // Host re-opens straight onto a new code (no close in between).
    mockParty.value = { ...mockParty.value, table: table('GH89') };
    r.rerender(<Door />);
    expect(onClosed).toHaveBeenCalledTimes(2);
    expect(onTable).toHaveBeenLastCalledWith('GH89', undefined);
  });

  it('while inactive it neither knocks nor sits, but still reports a table it was handed closing', () => {
    mockParty.value = makeParty({ table: table('CD45') });
    const r = render(<Door active />);
    expect(onTable).toHaveBeenCalledTimes(1);

    // In the game now: not at the door.
    r.rerender(<Door active={false} />);
    mockParty.value = { ...mockParty.value, table: null };
    r.rerender(<Door active={false} />);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(knocks()).toHaveLength(0);

    mockParty.value = { ...mockParty.value, table: table('EF67') };
    r.rerender(<Door active={false} />);
    expect(onTable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('door')).toHaveTextContent('not-waiting');
  });

  it('under StrictMode the rehearsal mount does not eat the knock or the seat', () => {
    mockParty.value = makeParty();
    const r = render(
      <StrictMode>
        <Door />
      </StrictMode>,
    );
    // The rehearsal may knock too — a knock is idempotent on the host — but the
    // real mount must knock, not find a stale "already knocked" flag.
    expect(knocks().length).toBeGreaterThanOrEqual(1);
    expect(knocks().every(([game]) => game === 'chess')).toBe(true);
    r.unmount();

    onTable.mockReset();
    mockParty.value = makeParty({ table: table('CD45') });
    render(
      <StrictMode>
        <Door />
      </StrictMode>,
    );
    // The rehearsal seat is forgotten with its unmount; the real mount seats again.
    expect(onTable).toHaveBeenLastCalledWith('CD45', undefined);
    expect(onTable.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
