import { describe, expect, it } from 'vitest';
import {
  canAfford,
  defaultProfile,
  isUnlocked,
  normalizeProfile,
  pointsForResult,
  recordResult,
  selectSkin,
  setName,
  unlockSkin,
} from './profile';

describe('pointsForResult', () => {
  it('pays a base bounty plus per-bonus amount on a win', () => {
    expect(pointsForResult(true, 0)).toBe(100);
    expect(pointsForResult(true, 10)).toBe(100 + 10 * 15);
  });
  it('pays a flat consolation on a loss', () => {
    expect(pointsForResult(false, 8)).toBe(25);
  });
});

describe('recordResult', () => {
  it('updates points, win tally, and history on a win', () => {
    const p = recordResult(defaultProfile(), {
      won: true,
      survivingCells: 4,
      code: 'ABCD',
      opponent: 'Kid',
      finishedAt: 1000,
    });
    expect(p.wins).toBe(1);
    expect(p.losses).toBe(0);
    expect(p.points).toBe(100 + 4 * 15);
    expect(p.history[0]).toMatchObject({ result: 'win', opponent: 'Kid', code: 'ABCD' });
  });

  it('prepends history newest-first', () => {
    let p = defaultProfile();
    p = recordResult(p, { won: true, survivingCells: 0, code: 'A', opponent: 'x', finishedAt: 1 });
    p = recordResult(p, { won: false, survivingCells: 0, code: 'B', opponent: 'y', finishedAt: 2 });
    expect(p.history.map((h) => h.code)).toEqual(['B', 'A']);
    expect(p.losses).toBe(1);
  });

  it('caps history at 25 entries, keeping the newest', () => {
    let p = defaultProfile();
    for (let i = 0; i < 30; i++) {
      p = recordResult(p, { won: true, survivingCells: 0, code: `G${i}`, opponent: 'x', finishedAt: i });
    }
    expect(p.history).toHaveLength(25);
    expect(p.history[0].code).toBe('G29'); // newest kept
    expect(p.history.some((h) => h.code === 'G4')).toBe(false); // oldest dropped
  });
});

describe('cosmetic unlocks (game-neutral)', () => {
  it('refuses to unlock when the player cannot afford it', () => {
    expect(canAfford(defaultProfile(), 300)).toBe(false);
    expect(unlockSkin(defaultProfile(), 'void', 300)).toBeNull();
  });

  it('deducts points and grants the cosmetic when affordable', () => {
    const rich = { ...defaultProfile(), points: 500 };
    const updated = unlockSkin(rich, 'void', 300);
    expect(updated).not.toBeNull();
    expect(updated!.points).toBe(200);
    expect(isUnlocked(updated!, 'void')).toBe(true);
  });

  it('refuses to double-unlock', () => {
    const p = { ...defaultProfile(), points: 999, unlocked: ['void'] };
    expect(unlockSkin(p, 'void', 300)).toBeNull();
  });

  it('selectSkin records the chosen id', () => {
    expect(selectSkin(defaultProfile(), 'ember').lastSkinId).toBe('ember');
  });
});

describe('setName', () => {
  it('trims and caps the name length', () => {
    expect(setName(defaultProfile(), '  Captain Longname McExtra  ').name).toBe('Captain Longname McE');
  });
});

describe('normalizeProfile', () => {
  it('falls back to defaults for garbage', () => {
    expect(normalizeProfile(null)).toEqual(defaultProfile());
    expect(normalizeProfile('nope')).toEqual(defaultProfile());
  });

  it('preserves valid fields, including unlocked ids and last selection', () => {
    const p = normalizeProfile({ name: 'Rio', points: 42, unlocked: ['void'], lastSkinId: 'void' });
    expect(p.name).toBe('Rio');
    expect(p.points).toBe(42);
    expect(p.unlocked).toEqual(['void']);
    expect(p.lastSkinId).toBe('void');
  });

  it('drops non-string unlocked entries', () => {
    const p = normalizeProfile({ unlocked: ['void', 5, null] });
    expect(p.unlocked).toEqual(['void']);
  });
});
