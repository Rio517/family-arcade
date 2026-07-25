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
import { skinById } from '../game/constants';

describe('pointsForResult', () => {
  it('pays a base bounty plus per-surviving-cell bonus on a win', () => {
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
});

describe('unlockSkin', () => {
  it('refuses when the player cannot afford it', () => {
    const void_ = skinById('void'); // cost 300
    expect(canAfford(defaultProfile(), void_)).toBe(false);
    expect(unlockSkin(defaultProfile(), void_)).toBeNull();
  });

  it('deducts points and grants the skin when affordable', () => {
    const rich = { ...defaultProfile(), points: 500 };
    const skin = skinById('void');
    const updated = unlockSkin(rich, skin);
    expect(updated).not.toBeNull();
    expect(updated!.points).toBe(200);
    expect(isUnlocked(updated!, 'void')).toBe(true);
  });

  it('refuses to double-unlock', () => {
    const p = { ...defaultProfile(), points: 999, unlocked: [...defaultProfile().unlocked, 'void'] };
    expect(unlockSkin(p, skinById('void'))).toBeNull();
  });
});

describe('selectSkin', () => {
  it('only selects skins the player owns', () => {
    const p = selectSkin(defaultProfile(), 'void');
    expect(p.lastSkinId).not.toBe('void'); // not owned → unchanged
    const owned = selectSkin(defaultProfile(), 'ember');
    expect(owned.lastSkinId).toBe('ember');
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

  it('preserves valid fields and re-guarantees free skins', () => {
    const p = normalizeProfile({ name: 'Rio', points: 42, unlocked: ['void'], lastSkinId: 'void' });
    expect(p.name).toBe('Rio');
    expect(p.points).toBe(42);
    expect(p.unlocked).toContain('aqua'); // free skins always present
    expect(p.unlocked).toContain('void');
    expect(p.lastSkinId).toBe('void');
  });

  it('rejects a selected skin that is not unlocked', () => {
    const p = normalizeProfile({ lastSkinId: 'phantom' });
    expect(p.lastSkinId).not.toBe('phantom');
  });
});
