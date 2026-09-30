import { describe, expect, it } from 'vitest';
import {
  addRound,
  adoptLegacyBests,
  bestOf,
  emptyScores,
  familyTop,
  myRounds,
  parseScores,
  whenLabel,
  type ScoreRound,
  type ScoreStore,
} from './scores';

let clock = 1_000;
function round(p: Partial<ScoreRound> = {}): ScoreRound {
  clock += 1_000;
  return { userId: 'k', name: 'Clara', map: 'city', difficulty: 'easy', score: 100, level: 3, rank: 2, at: clock, ...p };
}

const withRounds = (rounds: ScoreRound[]): ScoreStore => rounds.reduce(addRound, emptyScores());

describe('familyTop', () => {
  it('ranks the board by score, lets one player hold several places, and caps it', () => {
    const rounds = [
      round({ score: 500 }),
      round({ userId: 'm', name: 'Milo', score: 900 }),
      round({ score: 700 }),
      round({ userId: 'm', name: 'Milo', score: 300 }),
      round({ score: 800 }),
      round({ score: 200 }),
      // Another board: never on this one.
      round({ map: 'town', score: 5_000 }),
      round({ difficulty: 'hard', score: 5_000 }),
    ];
    const top = familyTop(rounds, 'city', 'easy');
    expect(top.map((r) => [r.name, r.score])).toEqual([
      ['Milo', 900],
      ['Clara', 800],
      ['Clara', 700],
      ['Clara', 500],
      ['Milo', 300],
    ]);
    expect(familyTop(rounds, 'city', 'easy', 2)).toHaveLength(2);
  });

  it('on a tie, the first to reach the score stays ahead; a round of 0 never makes it', () => {
    const first = round({ userId: 'm', name: 'Milo', score: 400 });
    const second = round({ score: 400 });
    const top = familyTop([second, round({ score: 0 }), first], 'city', 'easy');
    expect(top).toEqual([first, second]);
  });
});

describe('myRounds', () => {
  it('lists one player’s rounds, newest first, ten by default', () => {
    const rounds = Array.from({ length: 14 }, (_, i) => round({ score: i }));
    rounds.push(round({ userId: 'm', name: 'Milo' }));
    const mine = myRounds(rounds, 'k');
    expect(mine).toHaveLength(10);
    expect(mine[0].score).toBe(13);
    expect(mine.every((r) => r.userId === 'k')).toBe(true);
    expect(myRounds(rounds, 'm')).toHaveLength(1);
    expect(myRounds(rounds, 'nobody')).toEqual([]);
  });
});

describe('addRound', () => {
  it('keeps the name as it was when the round was played', () => {
    const store = withRounds([round({ name: 'Clara' }), round({ name: 'Clara B' })]);
    expect(store.rounds.map((r) => r.name)).toEqual(['Clara', 'Clara B']);
  });

  it('keeps each player’s last 30, plus board places and their best on every board', () => {
    const big = round({ score: 99_999 });
    const medium = round({ map: 'town', score: 50 });
    const milo = Array.from({ length: 5 }, () => round({ userId: 'm', name: 'Milo', score: 1_000 }));
    const later = Array.from({ length: 40 }, (_, i) => round({ score: 10 + i }));
    const store = withRounds([big, medium, ...milo, ...later]);
    const clara = store.rounds.filter((r) => r.userId === 'k');
    // 30 most recent, plus the city record (a board place and a best) and the
    // Town best: the oldest ten ordinary rounds go.
    expect(clara).toHaveLength(32);
    expect(clara).toContainEqual(big);
    expect(clara).toContainEqual(medium);
    expect(store.rounds.filter((r) => r.userId === 'm')).toHaveLength(5);
    expect(bestOf(store.rounds, 'k', 'town', 'easy')).toBe(50);
    expect(later.slice(0, 10).some((r) => store.rounds.includes(r))).toBe(false);
  });

  it('keeps a round on a family board however old it is', () => {
    const old = round({ userId: 'm', name: 'Milo', score: 5_000 });
    const store = withRounds([old, ...Array.from({ length: 35 }, (_, i) => round({ userId: 'm', name: 'Milo', score: 10 + i }))]);
    expect(store.rounds).toContainEqual(old);
    expect(store.rounds).toHaveLength(31);
  });
});

describe('parseScores', () => {
  it('reads back what was saved', () => {
    const store = withRounds([round(), round({ userId: 'm', name: 'Milo', difficulty: 'hard' })]);
    expect(parseScores(JSON.stringify(store))).toEqual(store);
  });

  it('starts empty on missing, broken or foreign data', () => {
    for (const raw of [null, '', '{', 'null', '42', '[]', '{"v":2,"rounds":[]}', '{"v":1}', '{"v":1,"rounds":{}}']) {
      expect(parseScores(raw)).toEqual(emptyScores());
    }
  });

  it('drops rows that make no sense and keeps the rest', () => {
    const good = round();
    const raw = JSON.stringify({
      v: 1,
      adopted: ['k', 7],
      rounds: [
        good,
        null,
        'x',
        { ...good, map: 'moon' },
        { ...good, difficulty: 'impossible' },
        { ...good, score: -5 },
        { ...good, score: 'lots' },
        { ...good, at: Number.NaN },
        { ...good, userId: '' },
        { ...good, name: '   ' },
      ],
    });
    const store = parseScores(raw);
    expect(store.adopted).toEqual(['k']);
    expect(store.rounds).toEqual([good, { ...good, name: 'Player' }]);
  });
});

describe('adoptLegacyBests', () => {
  const legacy = { 'k:city': 1_200, 'k:town:hard': 800, 'k:mega:medium': 0, 'm:city': 5_000, 'k:moon': 99, 'k:city:hard:x': 7, 'k:region': 'x' };

  it('carries the player’s old bests over under their name, once', () => {
    const store = adoptLegacyBests(emptyScores(), legacy, 'k', 'Clara');
    expect(store.adopted).toEqual(['k']);
    expect(store.rounds).toEqual([
      { userId: 'k', name: 'Clara', map: 'city', difficulty: 'easy', score: 1_200, level: 0, rank: 0, at: 0 },
      { userId: 'k', name: 'Clara', map: 'town', difficulty: 'hard', score: 800, level: 0, rank: 0, at: 0 },
    ]);
    // Another player's bests wait for them to sign in.
    expect(bestOf(store.rounds, 'm', 'city', 'easy')).toBe(0);
    // A second pass changes nothing.
    expect(adoptLegacyBests(store, legacy, 'k', 'Clara B')).toBe(store);
    const both = adoptLegacyBests(store, legacy, 'm', 'Milo');
    expect(familyTop(both.rounds, 'city', 'easy').map((r) => r.name)).toEqual(['Milo', 'Clara']);
  });

  it('skips a best the kept rounds already beat', () => {
    const store = adoptLegacyBests(withRounds([round({ score: 2_000 })]), legacy, 'k', 'Clara');
    expect(familyTop(store.rounds, 'city', 'easy')).toHaveLength(1);
    expect(bestOf(store.rounds, 'k', 'town', 'hard')).toBe(800);
  });
});

describe('whenLabel', () => {
  const now = new Date(2026, 8, 30, 15, 0).getTime();
  it('says today, yesterday, a date, or earlier for a carried-over best', () => {
    expect(whenLabel(new Date(2026, 8, 30, 0, 5).getTime(), now)).toBe('Today');
    expect(whenLabel(new Date(2026, 8, 29, 23, 55).getTime(), now)).toBe('Yesterday');
    expect(whenLabel(new Date(2026, 8, 12).getTime(), now)).toMatch(/12/);
    expect(whenLabel(0, now)).toBe('Earlier');
  });
});
