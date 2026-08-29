import { describe, expect, it } from 'vitest';
import {
  EMPTY_SEAT,
  clearSeat,
  fillChairs,
  fillNextEmpty,
  isFull,
  lineupOf,
  normalizeLineup,
  normalizeLineups,
  seatName,
  seatedUserIds,
  seatsFromLineup,
  setSeat,
  swapSeats,
  type Lineup,
  type Seat,
} from './seats';
import { addUser, emptyUsersState } from './users';

const USERS = addUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u3', 'Flora').users;
const ticket = (userId: string): Seat => ({ kind: 'ticket', userId });
const bot = (botId: string): Seat => ({ kind: 'bot', botId });
const botName = (id: string) => `General ${id}`;

describe('seatsFromLineup', () => {
  it('seats the signed-in ticket in chair one when the game has no lineup yet', () => {
    expect(seatsFromLineup(USERS, null, 'u2', 3)).toEqual([ticket('u2'), EMPTY_SEAT, EMPTY_SEAT]);
  });

  it('leaves every chair empty when nobody is signed in and nothing is saved', () => {
    expect(seatsFromLineup(USERS, null, null, 2)).toEqual([EMPTY_SEAT, EMPTY_SEAT]);
  });

  it('a saved lineup wins wholesale over the signed-in ticket', () => {
    const lineup: Lineup = [{ userId: 'u3' }, { bot: 'cadet' }, { userId: 'u1' }];
    expect(seatsFromLineup(USERS, lineup, 'u2', 3)).toEqual([ticket('u3'), bot('cadet'), ticket('u1')]);
  });

  it('empties a chair whose ticket no longer exists', () => {
    const lineup: Lineup = [{ userId: 'gone' }, { userId: 'u1' }];
    expect(seatsFromLineup(USERS, lineup, null, 2)).toEqual([EMPTY_SEAT, ticket('u1')]);
  });

  it('pads or truncates a saved lineup to the chair count', () => {
    const lineup: Lineup = [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }];
    expect(seatsFromLineup(USERS, lineup, null, 2)).toEqual([ticket('u1'), ticket('u2')]);
    expect(seatsFromLineup(USERS, lineup, null, 4)).toEqual([ticket('u1'), ticket('u2'), ticket('u3'), EMPTY_SEAT]);
  });

  it('never seats the same ticket twice, even from a corrupt lineup', () => {
    const lineup: Lineup = [{ userId: 'u1' }, { userId: 'u1' }];
    expect(seatsFromLineup(USERS, lineup, null, 2)).toEqual([ticket('u1'), EMPTY_SEAT]);
  });
});

describe('fillChairs', () => {
  it('never seats a ticket twice but lets a general serve twice', () => {
    const source = [ticket('u1'), bot('vex'), ticket('u1'), bot('vex')];
    expect(fillChairs(4, (i) => source[i])).toEqual([ticket('u1'), bot('vex'), EMPTY_SEAT, bot('vex')]);
  });
});

describe('isFull', () => {
  it('is true only when every chair is taken, and never for an empty table', () => {
    expect(isFull([ticket('u1'), bot('vex')])).toBe(true);
    expect(isFull([ticket('u1'), EMPTY_SEAT])).toBe(false);
    expect(isFull([])).toBe(false);
  });
});

describe('lineupOf', () => {
  it('round-trips tickets, bots and empties', () => {
    const seats = [ticket('u1'), bot('vex'), EMPTY_SEAT];
    expect(lineupOf(seats)).toEqual([{ userId: 'u1' }, { bot: 'vex' }, null]);
    expect(seatsFromLineup(USERS, lineupOf(seats), null, 3)).toEqual(seats);
  });
});

describe('chair moves', () => {
  it('fillNextEmpty takes the first free chair and refuses a full table', () => {
    const seats = [ticket('u1'), EMPTY_SEAT, EMPTY_SEAT];
    expect(fillNextEmpty(seats, ticket('u2'))).toEqual([ticket('u1'), ticket('u2'), EMPTY_SEAT]);
    const full = [ticket('u1'), ticket('u2')];
    expect(fillNextEmpty(full, ticket('u3'))).toBe(full);
  });

  it('fillNextEmpty ignores a ticket already at the table', () => {
    const seats = [ticket('u1'), EMPTY_SEAT];
    expect(fillNextEmpty(seats, ticket('u1'))).toBe(seats);
  });

  it('setSeat, clearSeat and swapSeats are pure', () => {
    const seats = [ticket('u1'), EMPTY_SEAT];
    expect(setSeat(seats, 1, bot('wren'))).toEqual([ticket('u1'), bot('wren')]);
    expect(clearSeat(seats, 0)).toEqual([EMPTY_SEAT, EMPTY_SEAT]);
    expect(swapSeats(seats, 0, 1)).toEqual([EMPTY_SEAT, ticket('u1')]);
    expect(seats).toEqual([ticket('u1'), EMPTY_SEAT]);
  });

  it('seatedUserIds lists the tickets at the table, in chair order', () => {
    expect(seatedUserIds([bot('vex'), ticket('u3'), EMPTY_SEAT, ticket('u1')])).toEqual(['u3', 'u1']);
  });
});

describe('seatName', () => {
  it('derives the name at render for each kind of chair', () => {
    expect(seatName(ticket('u2'), USERS, botName)).toBe('Klara');
    expect(seatName(bot('cadet'), USERS, botName)).toBe('General cadet');
    expect(seatName(EMPTY_SEAT, USERS, botName)).toBe('');
    expect(seatName(ticket('gone'), USERS, botName)).toBe('');
  });
});

describe('normalizeLineup', () => {
  it('keeps well-formed entries and turns anything else into an empty chair', () => {
    expect(normalizeLineup(['x', { userId: 3 }, { bot: 'cadet' }, { userId: 'u1' }, null, {}])).toEqual([
      null,
      null,
      { bot: 'cadet' },
      { userId: 'u1' },
      null,
      null,
    ]);
    expect(normalizeLineup('nope')).toEqual([]);
  });

  it('normalizeLineups keeps every game id it finds, even unknown ones', () => {
    expect(normalizeLineups({ chess: [{ userId: 'u1' }], retired: [null], bad: 'x' })).toEqual({
      chess: [{ userId: 'u1' }],
      retired: [null],
      bad: [],
    });
    expect(normalizeLineups(null)).toEqual({});
  });
});
